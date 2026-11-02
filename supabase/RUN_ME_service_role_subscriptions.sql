-- ═══════════════════════════════════════════════════════════════════════════════
-- Lets the server create organizations' subscriptions.
--
-- Creating an organization (Super Admin → Organizations → Create) failed with
-- "permission denied for table subscriptions": the server role that edge
-- functions run as was given each table it uses one by one, and subscriptions
-- was missed. This grants it, and the other tables that function writes to.
-- Signed-in users' access is unchanged.
--
-- Safe to run more than once. Paste into the SQL Editor and Run.
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['subscriptions', 'organizations', 'org_members', 'org_invitations', 'audit_logs', 'guest_rate_limits'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', t);
    END IF;
  END LOOP;
END $$;
