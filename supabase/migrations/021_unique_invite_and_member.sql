-- 021_unique_invite_and_member.sql
-- Enforce unique email per org in pending invitations and unique user per org in members.
-- Without these constraints the same email can be invited with multiple roles.

-- 1. Unique active (pending) invitation per email per org.
--    Accepts only one pending invite per email; completed/cancelled invites don't block re-invite.
CREATE UNIQUE INDEX IF NOT EXISTS org_invitations_org_email_pending_unique
  ON public.org_invitations (org_id, lower(email))
  WHERE status = 'pending';

-- 2. Unique member (user) per org — prevents the same user being added with two different roles.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'org_members_org_id_user_id_key'
  ) THEN
    ALTER TABLE public.org_members
      ADD CONSTRAINT org_members_org_id_user_id_key UNIQUE (org_id, user_id);
  END IF;
END $$;
