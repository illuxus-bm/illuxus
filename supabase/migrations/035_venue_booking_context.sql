-- ═══════════════════════════════════════════════════════════════════════════════
-- 035_venue_booking_context.sql
--
-- Adds the "venue brief" fields the organizer fills in when they book a
-- venue. Before this migration the vendor only saw the ticked services on
-- the request card; they had no idea whether the event was a wedding or a
-- product launch, whether it needed 40 seats or 400, banquet vs theater
-- layout, VIP zone, breakout rooms, etc.
--
-- These fields describe what the organizer wants from the venue for THIS
-- specific booking — hence they live on `event_venue_selections` rather
-- than on `events`. That means:
--   • Two vendors contacted for the same event can each get a different
--     brief (rare, but supported by the model).
--   • If the organizer later changes vendors, the client copies the
--     previous brief onto the new selection so nothing is retyped.
--
-- Every column is nullable / boolean-with-default so historical rows
-- created before this migration continue to render correctly.
--
-- Idempotent: `ADD COLUMN IF NOT EXISTS` is safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════════

alter table public.event_venue_selections
  add column if not exists event_type              text,
  add column if not exists event_duration_hours    numeric(6,2),
  add column if not exists expected_attendees      int,
  add column if not exists seating_capacity        int,
  add column if not exists seating_arrangement     text,
  add column if not exists needs_pre_function_area boolean not null default false,
  add column if not exists needs_vip_area          boolean not null default false,
  add column if not exists needs_additional_rooms  boolean not null default false,
  add column if not exists venue_link              text;

-- Cheap sanity guard: seating_arrangement is free text on purpose (letting
-- the organizer pick "Other" or type a custom arrangement) but we cap the
-- length so a copy-paste accident doesn't ship a novel to the vendor.
alter table public.event_venue_selections
  drop constraint if exists event_venue_selections_seating_arrangement_length;
alter table public.event_venue_selections
  add  constraint event_venue_selections_seating_arrangement_length
    check (seating_arrangement is null or length(seating_arrangement) <= 60);

-- Same for event_type — short free text.
alter table public.event_venue_selections
  drop constraint if exists event_venue_selections_event_type_length;
alter table public.event_venue_selections
  add  constraint event_venue_selections_event_type_length
    check (event_type is null or length(event_type) <= 60);

-- Venue link — URL-ish text with a length cap. We don't hard-validate the
-- URL shape (letting mailto:, tel:, or a raw address through) but keep it
-- short enough that it isn't storing arbitrary payloads.
alter table public.event_venue_selections
  drop constraint if exists event_venue_selections_venue_link_length;
alter table public.event_venue_selections
  add  constraint event_venue_selections_venue_link_length
    check (venue_link is null or length(venue_link) <= 500);

comment on column public.event_venue_selections.event_type              is 'Business type of the event (e.g. Wedding, Corporate offsite, Product launch). Free text, capped at 60 chars.';
comment on column public.event_venue_selections.event_duration_hours    is 'Planned event duration in hours. Numeric so half-days like 4.5 or overnight retreats can be modelled.';
comment on column public.event_venue_selections.expected_attendees      is 'Organizer''s attendee estimate — informs staffing / catering / capacity.';
comment on column public.event_venue_selections.seating_capacity        is 'Seat count the organizer needs the venue to comfortably support.';
comment on column public.event_venue_selections.seating_arrangement     is 'Layout preference (Theater, Classroom, Banquet, U-shape, Boardroom, Cocktail, Custom text). Free text, capped at 60 chars.';
comment on column public.event_venue_selections.needs_pre_function_area is 'Organizer wants a lobby / reception / registration space.';
comment on column public.event_venue_selections.needs_vip_area          is 'Organizer wants a segregated VIP / green-room area.';
comment on column public.event_venue_selections.needs_additional_rooms  is 'Organizer wants breakout / secondary rooms beyond the main space.';
comment on column public.event_venue_selections.venue_link              is 'Reference URL — a preferred layout, a mood board, or an existing venue''s site the organizer wants to match.';
