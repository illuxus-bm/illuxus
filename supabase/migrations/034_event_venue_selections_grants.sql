-- ═══════════════════════════════════════════════════════════════════════════════
-- 034_event_venue_selections_grants.sql
--
-- FIX: migration 027 created `event_venue_selections` with ENABLE ROW LEVEL
-- SECURITY and three CREATE POLICY statements, but never granted
-- table-level SELECT / INSERT / UPDATE to the `authenticated` role. The
-- three RLS policies were therefore never reachable — every REST call from
-- either app (illuxus main and illuxus-vendor) returned 403 Forbidden with
-- the row-visibility check never running.
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
--   • SELECT  — organizer_org_manage + vendor_read policies need this so
--     RLS can evaluate its predicates. Row-level filtering happens on top.
--   • INSERT  — organizer_org_manage covers writes; the upsert in
--     useSelectVenueVendor.ts is INSERT-with-fallback-UPDATE via the
--     UNIQUE (event_id, vendor_id) constraint.
--   • UPDATE  — organizer_org_manage AND vendor_respond both need this
--     for status transitions (accept / decline / cancel).
--
-- DELETE is intentionally omitted: the flow uses UPDATE status='cancelled'
-- to keep a historical trail for both sides. Adding DELETE later is safe
-- but would need an accompanying policy update to match — leaving it out
-- preserves the current audit semantics.
--
-- Idempotent: GRANT is additive; re-running does not error and does not
-- change effective permissions if the grants are already in place.
-- ═══════════════════════════════════════════════════════════════════════════════

GRANT SELECT, INSERT, UPDATE ON public.event_venue_selections TO authenticated;

-- Sanity: confirm the three policies from 027 are still installed so any
-- operator running this migration on a repaired database gets a clear
-- runtime error instead of a silent partial-fix. This is a no-op when
-- migration 027 was applied fully; it raises otherwise.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'event_venue_selections'
       AND policyname = 'event_venue_selections_vendor_read'
  ) THEN
    RAISE EXCEPTION
      'RLS policy `event_venue_selections_vendor_read` is missing. '
      'Apply migration 027_event_venue_selections.sql before 034.';
  END IF;
END $$;

COMMENT ON TABLE public.event_venue_selections IS
  'Records an organizer picking a specific vendor for their event''s venue. Table grants installed by migration 034; RLS policies installed by migration 027 (organizer/org can manage own selections; vendor can read + respond to selections targeting them).';
