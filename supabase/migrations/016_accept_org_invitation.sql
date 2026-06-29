-- ─────────────────────────────────────────────────────────────────────────────
-- 016_accept_org_invitation.sql
--
-- (Re)installs the `accept_org_invitation` RPC. An earlier migration that
-- defined this function (003_accept_org_invitation.sql) was overwritten by
-- upstream conflicts, leaving the production schema in an undefined state —
-- on some environments the function still exists, on others it doesn't, and
-- where it does exist there's no guarantee its body matches the LoginPage's
-- expectations.
--
-- Beyond reinstalling the function, this migration closes a real loophole:
--
--   1. An organiser invites a teammate.
--   2. The teammate accepts the link, joins the workspace.
--   3. The organiser later removes them via Settings → Team.
--   4. The teammate clicks the original invite link in their mailbox.
--   5. Pre-fix: the link still works — they're back in the workspace.
--
-- The fix makes acceptance strictly conditional on:
--   • The invitation row exists and `status = 'pending'`.
--   • The caller is signed in (auth.uid() IS NOT NULL).
--   • The caller's email matches the invitation row's email (auth.users.email).
--
-- The function then inserts into `org_members` (ON CONFLICT DO UPDATE so
-- re-acceptance after a role change is idempotent) and stamps the
-- invitation row `status = 'accepted'`. Subsequent removal flow marks the
-- invitation `status = 'revoked'`, which makes this RPC refuse the token.
--
-- SECURITY DEFINER so the call works even when the user can't see the
-- invitation row under RLS, but the body enforces all access rules itself.
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

  IF invitation.status <> 'pending' THEN
    -- 'accepted' or 'revoked' (the latter is set by the removal flow in
    -- SettingsPage). Either way the link is no longer valid.
    RAISE EXCEPTION 'Invitation is no longer valid';
  END IF;

  IF caller_email IS NULL OR caller_email <> lower(invitation.email) THEN
    RAISE EXCEPTION 'Signed-in email does not match the invitation';
  END IF;

  -- Idempotent join: upsert into org_members so a re-issued role change
  -- (e.g. organiser invited the same person again with a new role) lands
  -- cleanly without duplicate-key errors.
  INSERT INTO public.org_members (org_id, user_id, role)
       VALUES (invitation.org_id, auth.uid(), invitation.role)
  ON CONFLICT (org_id, user_id) DO UPDATE
        SET role = EXCLUDED.role;

  UPDATE public.org_invitations
     SET status = 'accepted',
         updated_at = now()
   WHERE id = invitation.id;

  RETURN QUERY SELECT invitation.org_id, invitation.role;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_org_invitation(uuid) TO authenticated;

COMMENT ON FUNCTION public.accept_org_invitation(uuid) IS
  'Accept a workspace invitation by token. Refuses if status is not pending, caller is not signed in, or caller email does not match invitation email. Marks the invitation accepted on success.';
