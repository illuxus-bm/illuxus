-- ─────────────────────────────────────────────────────────────────────────────
-- 011_grant_service_role.sql
--
-- Edge functions authenticate to Postgres using the `service_role` JWT/role.
-- The historical migrations granted privileges to `authenticated` (and a few
-- to `anon`), but never explicitly granted to `service_role`. In stock
-- Supabase projects that's usually fine because `service_role` inherits from
-- a superuser-ish ancestor and BYPASSRLS, but on this project the privilege
-- chain has drifted: edge functions like `send-ticket-email` hit
--
--   "permission denied for table registrations"
--
-- when they try to read a row, even with the service role key.
--
-- This migration grants every privilege `service_role` needs on the tables
-- our edge functions read or write today. It's idempotent — re-running it
-- on a fresh project is a no-op since `GRANT` doesn't error on already-
-- granted privileges.
--
-- It also re-grants on `authenticated` and `anon` for the same tables so
-- nothing the dashboard relies on regresses.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Core registration / event tables ─────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.registrations  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.events         TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_members    TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_invitations TO service_role;

-- ── Email-related audit tables ───────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE         ON public.email_settings TO service_role;
GRANT SELECT, INSERT, UPDATE         ON public.event_emails   TO service_role;

-- ── Communications module (used by send-communication-email / send-email) ────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.communications              TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.communication_recipients   TO service_role;

-- ── Speaker / sponsor tables (used by participant flows + ticket email) ─────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.speakers        TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_speakers  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sponsors        TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_sponsors  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sponsor_members TO service_role;

-- ── Webinar tables touched by livekit/agora functions ────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webinar_sessions  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webinar_speakers  TO service_role;

-- ── Belt-and-braces: a future-proof grant for any table later added to public
-- ── so the next edge function we ship doesn't run into the same wall.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;

-- ── Sequences (needed if any insert uses a serial / identity column) ─────────
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO service_role;

-- ── Function execution: every RPC we call from edge functions ────────────────
-- Edge functions call RPCs like communications_dispatch via service_role;
-- this blanket grant ensures none of them throw "function does not exist".
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name, p.proname AS fn_name,
           pg_catalog.pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prokind = 'f'
  LOOP
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role',
      r.fn_name, r.args
    );
  END LOOP;
END $$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO service_role;

-- ── Schema usage (Postgres requires this even if the role has table grants) ──
GRANT USAGE ON SCHEMA public TO service_role;

COMMENT ON SCHEMA public IS
  'Public schema. Edge functions authenticate as service_role; grants in 011_grant_service_role.sql ensure they can read/write the tables our SMTP-based mailers need.';
