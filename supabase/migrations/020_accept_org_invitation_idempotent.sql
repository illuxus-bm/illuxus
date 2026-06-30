-- ─────────────────────────────────────────────────────────────────────────────
-- 020_accept_org_invitation_idempotent.sql
--
-- Repairs the "could not accept the invitation" toast that appears after the
-- role is already assigned. Migration 016 made `accept_org_invitation`
-- strict: it raised an exception when the invitation row was anything but
-- `status = 'pending'`. The client flow (LoginPage → consumeInviteIfAny)
-- can call the RPC twice in quick succession in a few real scenarios:
--
--   • The user's auth state hydrates twice during the React mount of
--     LoginPage in production (StrictMode is dev-only, but route
--     transitions still cause a re-render).
--   • The forced `window.location.assign` introduced for the OrgContext
--     re-fetch can race the toast queue, leaving the previous toast
--     mounted as the destination page renders.
--   • The browser back-button / bookmarked URL with the same
--     `?invite=<token>` is followed after the user signed in elsewhere.
--
-- In every case the FIRST call already inserted the `org_members` row and
-- stamped the invitation `accepted`. The SECOND call is harmless; it just
-- needs to report success so the user doesn't see "Invitation not
-- accepted" as a destructive toast that contradicts the workspace dropdown
-- on the next page.
--
-- Behavioural changes
-- ───────────────────
-- 1. Status check now accepts `pending` AND `accepted`. Revoked stays
--    refused so the removal-flow loophole closed in 016 stays closed.
-- 2. The org_members INSERT is wrapped in ON CONFLICT DO NOTHING when the
--    invitation is already `accepted`, so we never clobber a role that an
--    organiser may have changed manually after acceptance.
-- 3. Returns the same `(accepted_org_id, assigned_role)` shape the
--    LoginPage already consumes — no client change required.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.accept_org_invitation(uuid);

CREATE FUNCTION public.accept_org_invitation(_token uuid)
RETURNS TABLE (accepted_org_id uuid, assigned_role text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invitation RECORD;
  caller_email text;
  current_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be signed in to accept an invitation';
  END IF;

  -- Caller's verified email — used to make sure someone with a stolen link
  -- can't accept on behalf of the real invitee.
  SELECT lower(email) INTO caller_email
    FROM auth.users
   WHERE id = auth.uid();

  SELECT id, org_id, email, role, status
    INTO invitation
    FROM public.org_invitations
   WHERE token = _token
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;

  -- Revoked = the organiser explicitly removed this member's link
  -- (Settings → Team → Remove). Anything else (pending or accepted) is
  -- treated as a valid token to keep re-acceptance idempotent.
  IF invitation.status = 'revoked' THEN
    RAISE EXCEPTION 'Invitation is no longer valid';
  END IF;

  IF caller_email IS NULL OR caller_email <> lower(invitation.email) THEN
    RAISE EXCEPTION 'Signed-in email does not match the invitation';
  END IF;

  -- Look up the current role (if any) so we can decide whether to write
  -- it or just return the existing assignment idempotently.
  SELECT role INTO current_role
    FROM public.org_members
   WHERE org_id = invitation.org_id
     AND user_id = auth.uid();

  IF current_role IS NULL THEN
    -- First-time acceptance. Insert with the invitation's role.
    INSERT INTO public.org_members (org_id, user_id, role)
         VALUES (invitation.org_id, auth.uid(), invitation.role)
    ON CONFLICT (org_id, user_id) DO NOTHING;
    -- Fetch back the assigned role (covers the rare race where another
    -- transaction inserted the same row between SELECT and INSERT).
    SELECT role INTO current_role
      FROM public.org_members
     WHERE org_id = invitation.org_id
       AND user_id = auth.uid();
  ELSIF invitation.status = 'pending' THEN
    -- Pending → first acceptance path, but the user is somehow already a
    -- member (e.g. they were re-invited with a new role after being
    -- removed and then immediately accepted via two clicks). Refresh the
    -- role to whatever the invitation specifies — the inviter's choice
    -- wins.
    UPDATE public.org_members
       SET role = invitation.role
     WHERE org_id = invitation.org_id
       AND user_id = auth.uid();
    current_role := invitation.role;
  END IF;
  -- When invitation.status = 'accepted' AND current_role IS NOT NULL we
  -- leave the existing role alone and just return idempotently.

  -- Stamp the invitation accepted (no-op when already accepted).
  UPDATE public.org_invitations
     SET status     = 'accepted',
         updated_at = now()
   WHERE id = invitation.id
     AND status <> 'accepted';

  accepted_org_id := invitation.org_id;
  assigned_role   := COALESCE(current_role, invitation.role);
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_org_invitation(uuid) TO authenticated;

COMMENT ON FUNCTION public.accept_org_invitation(uuid) IS
  'Accept a workspace invitation by token. Idempotent — safe to call multiple times for the same token. Refuses revoked tokens (set by the removal flow). Refuses callers whose email does not match the invitation.';
