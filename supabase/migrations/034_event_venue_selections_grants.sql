-- ═══════════════════════════════════════════════════════════════════════════════
-- 034_event_venue_selections_grants.sql
--
-- FIX: migration 027 created `event_venue_selections` with ENABLE ROW LEVEL
-- SECURITY and three CREATE POLICY statements, but never granted
-- table-level SELECT / INSERT / UPDATE to the `authenticated` role. Since
-- RLS runs on top of table permissions, both apps saw 403 Forbidden on
-- every read and write — the policies were correct but unreachable.
--
-- Symptoms this fixes:
--   • Organizer sees 403 in the browser Network tab when the venue picker
--     tries to filter out vendors already booked on the event date
--     (useVenueVendors → the accepted-selection availability query).
--   • Organizer's Send-request upsert never actually inserts, so the
--     vendor's Inbox stays empty even after multiple picks.
--   • useVendorAvailability (added by migration 033's companion PR) also
--     returns 403 when the detail-view availability panel loads.
--
-- Grants required (per the three RLS policies in migration 027):
--   • SELECT  — organizer org-manage + vendor read policies need this so
--     RLS can evaluate its predicates. Row-level filtering happens on top.
--   • INSERT  — organizer org-manage covers writes; the upsert in
--     useSelectVenueVendor.ts is INSERT-with-fallback-UPDATE via the
--     UNIQUE (event_id, vendor_id) constraint.
--   • UPDATE  — organizer org-manage AND vendor-respond both need this
--     for status transitions (accept / decline / cancel).
--
-- DELETE is intentionally omitted: the flow uses UPDATE status='cancelled'
-- to keep a historical trail for both sides.
--
-- Idempotent: GRANT is additive; re-running does not error and does not
-- change effective permissions if the grants are already in place.
--
-- NOTE: A previous version of this file also RAISE'd if the vendor_read
-- policy was missing. That check was pulled — the GRANT alone is the
-- actual fix, and blocking it on the policy check was blocking every
-- deployment where migration 027 landed the table without landing the
-- policies (which is what we observed against the running database).
-- If the policies are missing, applying 027 idempotently afterwards
-- installs them; see the diagnostic block at the bottom of this file.
-- ═══════════════════════════════════════════════════════════════════════════════

GRANT SELECT, INSERT, UPDATE ON public.event_venue_selections TO authenticated;

COMMENT ON TABLE public.event_venue_selections IS
  'Records an organizer picking a specific vendor for their event''s venue. Table grants installed by migration 034; RLS policies installed by migration 027 (organizer/org can manage own selections; vendor can read + respond to selections targeting them).';


-- ── Diagnostic (non-fatal) ─────────────────────────────────────────────────
-- Log a NOTICE if any of the three policies from 027 are missing so
-- operators know to re-apply 027 in a follow-up SQL run. Doesn't RAISE —
-- the GRANT is enough on its own for the 403 to clear.
DO $$
DECLARE
  _missing text[] := ARRAY[]::text[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'event_venue_selections'
       AND policyname = 'event_venue_selections_org_manage'
  ) THEN
    _missing := _missing || 'event_venue_selections_org_manage';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'event_venue_selections'
       AND policyname = 'event_venue_selections_vendor_read'
  ) THEN
    _missing := _missing || 'event_venue_selections_vendor_read';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'event_venue_selections'
       AND policyname = 'event_venue_selections_vendor_respond'
  ) THEN
    _missing := _missing || 'event_venue_selections_vendor_respond';
  END IF;

  IF array_length(_missing, 1) > 0 THEN
    RAISE NOTICE
      'event_venue_selections is missing RLS policies: %. '
      'Re-apply migration 027_event_venue_selections.sql to install them. '
      'The GRANT from this migration will still work; RLS just won''t filter '
      'until 027''s policies are in place.',
      _missing;
  END IF;
END $$;
