-- ═══════════════════════════════════════════════════════════════════════════════
-- 037_org_member_emails.sql
--
-- Settings → Team needs teammates' email addresses for two things:
--   • the "already a member" pre-flight before issuing an invitation, and
--   • revoking a removed teammate's invitation rows so the original
--     `/login?invite=<token>` link can't re-add them via
--     accept_org_invitation (which treats 'accepted' tokens as reusable).
--
-- The client was reading `profiles.email`, but `profiles` has no email
-- column — emails only live on auth.users, which the client can't read.
-- Both queries silently returned nothing, so duplicate invites slipped
-- through and removed members could rejoin with their old link.
--
-- This RPC exposes (user_id, email) for one workspace's members, and only
-- to that workspace's managers (owner or admin, see migration 030).
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.org_member_emails(_org_id uuid)
RETURNS TABLE (user_id uuid, email text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_org_manager(auth.uid(), _org_id) THEN
    RAISE EXCEPTION 'Only workspace owners and admins can list member emails';
  END IF;

  RETURN QUERY
    SELECT m.user_id, lower(u.email)::text
      FROM public.org_members m
      JOIN auth.users u ON u.id = m.user_id
     WHERE m.org_id = _org_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.org_member_emails(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.org_member_emails(uuid) TO authenticated;

COMMENT ON FUNCTION public.org_member_emails(uuid) IS
  'Returns (user_id, email) for every member of the workspace. Restricted to owners/admins (is_org_manager). Used by Settings → Team for the already-a-member check and to revoke a removed member''s invitation.';
