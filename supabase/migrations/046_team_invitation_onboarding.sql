-- ═══════════════════════════════════════════════════════════════════════════════
-- 046_team_invitation_onboarding.sql
--
-- Team invitations: invitees join without a company form or a second
-- verification email, and only verified owners/admins can invite.
--
-- Used by the `team-invitation` edge function (service_role). Browsers keep
-- their existing access to `org_invitations` through RLS (migration 030),
-- with the extra rules enforced by the trigger in section 3.
--
--   1. New columns on `org_invitations`:
--        token_hash   SHA-256 of the emailed link's secret. The secret itself
--                     is never stored, so nobody who can read this table
--                     (every workspace member can) can use someone's link.
--        expires_at   links stop working after this (14 days from issue).
--                     Invitations already sent get 14 days from now.
--        accepted_at / accepted_by   who accepted, and when.
--        claimed_at   short-lived lock held while an acceptance is being
--                     processed, so two submissions cannot both go through.
--      Status stays pending | accepted | revoked; "expired" is a pending
--      invitation past expires_at.
--   2. `complete_org_invitation` — adds the membership and marks the
--      invitation accepted in one transaction. service_role only.
--   3. Trigger on `org_invitations` for requests made by signed-in users:
--        • creating or re-sending an invitation needs a verified email;
--        • `invited_by` is always the caller;
--        • a browser can never set `token_hash` (so it cannot mint a link it
--          knows the secret of), and changing the email or reopening an
--          invitation discards the old link.
--   4. `accept_org_invitation` (older `/login?invite=<uuid>` links, and
--      signed-in accounts) now refuses expired invitations, refuses accepted
--      ones unless the caller is already the member, needs a verified email,
--      and records who accepted.
--
-- Idempotent — safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Columns ────────────────────────────────────────────────────────────────
ALTER TABLE public.org_invitations
  ADD COLUMN IF NOT EXISTS token_hash  text,
  ADD COLUMN IF NOT EXISTS expires_at  timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS claimed_at  timestamptz;

UPDATE public.org_invitations
   SET expires_at = now() + interval '14 days'
 WHERE expires_at IS NULL;

ALTER TABLE public.org_invitations
  ALTER COLUMN expires_at SET DEFAULT now() + interval '14 days',
  ALTER COLUMN expires_at SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS org_invitations_token_hash_idx
  ON public.org_invitations (token_hash) WHERE token_hash IS NOT NULL;

COMMENT ON COLUMN public.org_invitations.token_hash IS
  'SHA-256 (hex) of the secret in the emailed /invite link. Set only by the team-invitation edge function.';
COMMENT ON COLUMN public.org_invitations.expires_at IS
  'The invitation link stops working after this. A pending invitation past this time is shown as expired.';


-- ── 2. complete_org_invitation ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.complete_org_invitation(
  _invitation_id uuid,
  _user_id       uuid,
  _new_account   boolean DEFAULT false
)
RETURNS TABLE (accepted_org_id uuid, assigned_role text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv     record;
  _email  text;
  _role   text;
BEGIN
  SELECT i.id, i.org_id, i.email, i.role, i.status, i.expires_at
    INTO inv
    FROM public.org_invitations i
   WHERE i.id = _invitation_id
   FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'invitation_not_found'; END IF;
  IF inv.status <> 'pending' THEN RAISE EXCEPTION 'invitation_not_pending'; END IF;
  IF inv.expires_at <= now() THEN RAISE EXCEPTION 'invitation_expired'; END IF;

  SELECT lower(u.email) INTO _email FROM auth.users u WHERE u.id = _user_id;
  IF _email IS NULL OR _email <> lower(inv.email) THEN
    RAISE EXCEPTION 'email_mismatch';
  END IF;

  -- One membership per person per workspace. Someone who is already a
  -- member keeps the role they have.
  INSERT INTO public.org_members (org_id, user_id, role)
       VALUES (inv.org_id, _user_id, inv.role)
  ON CONFLICT (org_id, user_id) DO NOTHING;

  SELECT m.role INTO _role
    FROM public.org_members m
   WHERE m.org_id = inv.org_id AND m.user_id = _user_id;

  UPDATE public.org_invitations
     SET status      = 'accepted',
         accepted_at = now(),
         accepted_by = _user_id,
         claimed_at  = NULL,
         updated_at  = now()
   WHERE id = inv.id;

  -- An invitee gave every personal detail the profile asks for; joining a
  -- workspace needs no company details of their own.
  IF _new_account THEN
    UPDATE public.profiles SET profile_completed = true WHERE user_id = _user_id;
  END IF;

  accepted_org_id := inv.org_id;
  assigned_role   := _role;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_org_invitation(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_org_invitation(uuid, uuid, boolean) TO service_role;

COMMENT ON FUNCTION public.complete_org_invitation(uuid, uuid, boolean) IS
  'Adds the invited user to the workspace with the invitation''s role and marks the invitation accepted, in one transaction. Refuses expired, used or revoked invitations and any user whose email is not the invited one. service_role only (team-invitation edge function).';


-- ── 3. Guard on browser writes ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.org_invitations_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _issuing boolean;
BEGIN
  -- Server-side code (service_role, SQL editor) has no auth.uid() and is
  -- trusted; these rules are for requests made by signed-in users.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.token_hash  := NULL;
    NEW.claimed_at  := NULL;
    NEW.accepted_at := NULL;
    NEW.accepted_by := NULL;
    _issuing := NEW.status = 'pending';
  ELSE
    -- A browser may keep or clear the link, never set a new one.
    IF NEW.token_hash IS DISTINCT FROM OLD.token_hash AND NEW.token_hash IS NOT NULL THEN
      NEW.token_hash := OLD.token_hash;
    END IF;
    -- A link is tied to one email and one workspace, and a closed
    -- invitation's link stays closed.
    IF NEW.email IS DISTINCT FROM OLD.email
       OR NEW.org_id IS DISTINCT FROM OLD.org_id
       OR (NEW.status = 'pending' AND OLD.status <> 'pending') THEN
      NEW.token_hash := NULL;
    END IF;
    _issuing := NEW.status = 'pending' AND (
         OLD.status <> 'pending'
      OR NEW.email IS DISTINCT FROM OLD.email
      OR NEW.role IS DISTINCT FROM OLD.role
      OR NEW.token IS DISTINCT FROM OLD.token
      OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
    );
  END IF;

  IF _issuing THEN
    IF NOT EXISTS (
      SELECT 1 FROM auth.users u WHERE u.id = auth.uid() AND u.email_confirmed_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Verify your email address before inviting team members.'
        USING ERRCODE = '42501';
    END IF;
    NEW.invited_by := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS org_invitations_guard ON public.org_invitations;
CREATE TRIGGER org_invitations_guard
  BEFORE INSERT OR UPDATE ON public.org_invitations
  FOR EACH ROW EXECUTE FUNCTION public.org_invitations_guard();

COMMENT ON FUNCTION public.org_invitations_guard() IS
  'For signed-in callers: inviting or re-inviting needs a verified email, invited_by is the caller, and token_hash can never be set from a browser.';


-- ── 4. accept_org_invitation ─────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.accept_org_invitation(uuid);

CREATE FUNCTION public.accept_org_invitation(_token uuid)
RETURNS TABLE (accepted_org_id uuid, assigned_role text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invitation    record;
  caller_email  text;
  _current_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be signed in to accept an invitation';
  END IF;

  SELECT lower(u.email) INTO caller_email
    FROM auth.users u
   WHERE u.id = auth.uid() AND u.email_confirmed_at IS NOT NULL;
  IF caller_email IS NULL THEN
    RAISE EXCEPTION 'Verify your email address before accepting an invitation';
  END IF;

  SELECT i.id, i.org_id, i.email, i.role, i.status, i.expires_at
    INTO invitation
    FROM public.org_invitations i
   WHERE i.token = _token
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;
  IF invitation.status = 'revoked' THEN
    RAISE EXCEPTION 'This invitation was withdrawn. Ask the workspace admin to send a new one.';
  END IF;
  IF caller_email <> lower(invitation.email) THEN
    RAISE EXCEPTION 'Signed-in email does not match the invitation';
  END IF;

  SELECT m.role INTO _current_role
    FROM public.org_members m
   WHERE m.org_id = invitation.org_id AND m.user_id = auth.uid();

  -- Already accepted: only a repeat by the member it admitted succeeds.
  IF invitation.status = 'accepted' THEN
    IF _current_role IS NULL THEN
      RAISE EXCEPTION 'This invitation has already been used. Ask the workspace admin to send a new one.';
    END IF;
    accepted_org_id := invitation.org_id;
    assigned_role   := _current_role;
    RETURN NEXT;
    RETURN;
  END IF;

  IF invitation.expires_at <= now() THEN
    RAISE EXCEPTION 'This invitation has expired. Ask the workspace admin to send a new one.';
  END IF;

  IF _current_role IS NULL THEN
    INSERT INTO public.org_members (org_id, user_id, role)
         VALUES (invitation.org_id, auth.uid(), invitation.role)
    ON CONFLICT (org_id, user_id) DO NOTHING;
    SELECT m.role INTO _current_role
      FROM public.org_members m
     WHERE m.org_id = invitation.org_id AND m.user_id = auth.uid();
  END IF;

  UPDATE public.org_invitations
     SET status      = 'accepted',
         accepted_at = now(),
         accepted_by = auth.uid(),
         claimed_at  = NULL,
         updated_at  = now()
   WHERE id = invitation.id;

  accepted_org_id := invitation.org_id;
  assigned_role   := _current_role;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_org_invitation(uuid) TO authenticated;

COMMENT ON FUNCTION public.accept_org_invitation(uuid) IS
  'Accept a workspace invitation by its legacy uuid token as the signed-in, email-verified invitee. Refuses revoked and expired invitations; an accepted one only succeeds again for the member it admitted.';
