-- ═══════════════════════════════════════════════════════════════════════════
-- 036_selections_reference_venue.sql
--
-- Adds `venue_id` to `event_venue_selections` so a request records
-- WHICH specific venue the organizer picked, not just which vendor.
-- Necessary now that a single vendor can own multiple venues
-- (introduced by illuxus-vendor migration 106).
--
-- Nullable + ON DELETE SET NULL: historical rows created before this
-- migration have no venue_id, and a vendor deleting a venue shouldn't
-- cascade-delete the historical request record.
--
-- The UNIQUE (event_id, vendor_id) constraint is intentionally left
-- alone — one venue per event is still the norm, and even when a
-- vendor has multiple venues an organizer would only pick one for the
-- event. If that ever changes, drop this constraint and add
-- UNIQUE (event_id, venue_id) in a follow-up.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.event_venue_selections
  add column if not exists venue_id uuid references public.venues(id) on delete set null;

comment on column public.event_venue_selections.venue_id is
  'The specific venue (from public.venues) the organizer selected. Nullable — rows created before migration 036 have no venue_id and represent a vendor-level request. New rows should always populate this.';

create index if not exists event_venue_selections_venue_id_idx
  on public.event_venue_selections (venue_id);
