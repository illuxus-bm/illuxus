-- ============================================================================
-- Grants hotfix — RLS-enabled tables that were missing table-level GRANTs
-- ----------------------------------------------------------------------------
-- Consolidated from prior individual migration files. Contents are verbatim;
-- only file packaging changed. Sections are separated by their original
-- filename.
--
-- Background: 001_tables.sql defined RLS policies for several tables but
-- never paired them with table-level GRANTs. Postgres checks privileges
-- BEFORE evaluating row-level policies, so every request fails with
-- `permission denied for table <X>` — even when the policy itself would
-- have allowed the request. These hotfixes add the missing GRANTs.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Section: 011_org_followers_grants.sql
-- ----------------------------------------------------------------------------
-- The Subscribe pill on the public org page hits this whenever a signed-in
-- user clicks Subscribe / Unsubscribe.
GRANT SELECT, INSERT, DELETE ON public.org_followers TO authenticated;

-- Anonymous viewers can still see follower counts on a public org page.
-- The RLS policy `"Auth view followers"` is `TO authenticated USING(true)`, so
-- this anon grant is gated by RLS — anon will currently see 0 rows until/unless
-- a `TO anon` SELECT policy is added. Granting the privilege is harmless and
-- future-proofs adding such a policy without another grant migration.
GRANT SELECT ON public.org_followers TO anon;

-- ----------------------------------------------------------------------------
-- Section: 012_org_invitations_grants.sql
-- ----------------------------------------------------------------------------
-- The "Send Invitation" button in the organizer Settings → Team flow hits
-- this whenever an owner tries to invite a new member.
--
-- We grant SELECT / INSERT / UPDATE / DELETE because the "Owner manage
-- invitations" policy is `FOR ALL` — it covers every operation, including the
-- DELETE on revoke and the UPDATE the application uses to mark accepted
-- invitations.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_invitations TO authenticated;
