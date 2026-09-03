-- ═══════════════════════════════════════════════════════════════════════════════
-- 032_venue_selection_service_details.sql
--
-- Persist which of the vendor's services the organizer selected when they
-- picked this vendor from the marketplace. Before this migration the
-- `event_venue_selections` row only recorded WHO the organizer wanted;
-- there was no room for WHAT services (e.g. "hall rental + food + AV").
--
-- Design decision: uuid[] on the parent row, not a join table.
--   • The list is small (a vendor typically has 3-10 services) and only
--     ever queried alongside its parent selection — a join table would
--     add a round-trip for every venue-request card the vendor sees.
--   • We use uuid[] instead of jsonb so we can rely on the FK-shaped
--     ids without teaching every reader how to parse a jsonb blob.
--   • No foreign key on the array — deleting a service that was
--     referenced from a historical selection shouldn't cascade-delete
--     the selection or throw. The vendor UI resolves ids to titles at
--     read time and handles missing ones gracefully.
--
-- Idempotent: `ADD COLUMN IF NOT EXISTS` is safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.event_venue_selections
  ADD COLUMN IF NOT EXISTS selected_service_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[];

COMMENT ON COLUMN public.event_venue_selections.selected_service_ids IS
  'Optional array of vendor_services.id values the organizer picked when contacting this vendor. Empty array = "no specific services chosen, please quote the venue itself". The vendor UI resolves these to service titles at read time.';
