-- ─────────────────────────────────────────────────────────────────────────────
-- 003_accept_org_invitation.sql
--
-- Closes the team-invite loop. Before this migration, sending an invite from
-- Settings created an `org_invitations` row and emailed `/login?invite=<token>`,
-- but nothing on the frontend or in SQL ever consumed the token. The invited
-- user could sign in but never landed in `org_members`, so they had no access
-- to manage events.
--
-- This migration adds:
--   public.accept_org_invitation(_token uuid)
--       — looks up the invitation, verifies the caller's auth.email() matches
--         the invited email, upserts an `org_members` row with the invited
--         role, and stamps the invitation as accepted.
--
-- Email matching is enforced server-side so a leaked token can't be redeemed
-- by a different account. The function is idempotent: re-calling it with the
-- same token after success returns the same org_id without errors.
--
-- ── 2026-06-25 fix ───────────────────────────────────────────────────────────
-- Dropped the previous version which used `org_id` and `role` as OUT column
-- names. PostgreSQL throws `column reference "org_id" is ambiguous` inside
-- INSERT / ON CONFLICT clauses because those identifiers also exist on
-- `public.org_members`. Renaming the OUT columns to `accepted_org_id` and
-- `assigned_role` resolves the conflict.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.accept_org_invitation(uuid);

CREATE OR REPLACE FUNCTION public.accept_org_invitation(_token uuid)
RETURNS TABLE (accepted_org_id uuid, assigned_role text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid    uuid := auth.uid();
  _email  text := lower(coalesce(auth.jwt() ->> 'email', ''));
  _inv    record;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Must be signed in to accept an invitation' USING ERRCODE = '28000';
  END IF;
  IF _email = '' THEN
    RAISE EXCEPTION 'Signed-in user has no email — cannot match invitation' USING ERRCODE = '22023';
  END IF;

  -- Lookup. The token is the only field on the public link, so it must
  -- be sufficient to find the row, but the email check below is what
  -- prevents arbitrary redemption.
  SELECT i.id, i.org_id, i.email, i.role, i.status
    INTO _inv
    FROM public.org_invitations i
   WHERE i.token = _token
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found or already withdrawn' USING ERRCODE = 'P0002';
  END IF;

  IF _inv.status NOT IN ('pending', 'accepted') THEN
    RAISE EXCEPTION 'Invitation is no longer valid (status: %)', _inv.status USING ERRCODE = 'P0001';
  END IF;

  IF lower(_inv.email) <> _email THEN
    RAISE EXCEPTION 'This invitation was sent to a different email address. Sign in as % to accept.', _inv.email
      USING ERRCODE = '42501';
  END IF;

  -- Idempotent member creation. UNIQUE(org_id, user_id) on org_members
  -- means re-accepting just refreshes the role to whatever the invitation
  -- specifies — the inviter could have changed it.
  INSERT INTO public.org_members(org_id, user_id, role)
  VALUES(_inv.org_id, _uid, _inv.role)
  ON CONFLICT (org_id, user_id) DO UPDATE SET
    role = EXCLUDED.role;

  -- Mark the invitation accepted (idempotent on re-call).
  UPDATE public.org_invitations
     SET status = 'accepted', updated_at = now()
   WHERE id = _inv.id
     AND status <> 'accepted';

  accepted_org_id := _inv.org_id;
  assigned_role   := _inv.role;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_org_invitation(uuid) TO authenticated;

COMMENT ON FUNCTION public.accept_org_invitation(uuid) IS
  'Accepts a team invitation by token. Caller must be authenticated and their auth.email() must match the invitation address. Inserts or refreshes the org_members row and stamps the invitation accepted. Idempotent. Returns (accepted_org_id, assigned_role).';
