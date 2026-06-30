-- Backfill: link orphan sponsors to their owner's event
--
-- Why: sponsor_portal_events() gates analytics by event_sponsors. When an
-- organiser created a sponsor + invited a team member via SponsorManagement
-- but forgot to attach the sponsor to an event from the event Sponsors tab,
-- the team member who claimed the invite via /sponsor/accept ended up with
-- a sponsor_members row but no event_sponsors row. The sponsor portal then
-- shows "No events yet" instead of the analytics for the event the sponsor
-- was actually invited to support.
--
-- This migration links each orphan sponsor (sponsor with an accepted
-- sponsor_members row but zero event_sponsors rows) to its owner's single
-- published event, but only when the owner has exactly one such event so
-- the inference is unambiguous. Owners with zero or multiple published
-- events are left untouched and need a manual fix from the Sponsors tab.
--
-- Idempotent: ON CONFLICT DO NOTHING protects against re-running.

WITH orphans AS (
  SELECT
    s.id      AS sponsor_id,
    s.user_id AS owner_id
  FROM public.sponsors s
  WHERE EXISTS (
    SELECT 1 FROM public.sponsor_members sm
     WHERE sm.sponsor_id = s.id
       AND sm.accepted_at IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.event_sponsors es WHERE es.sponsor_id = s.id
  )
),
owner_events AS (
  SELECT
    o.sponsor_id,
    e.id AS event_id,
    count(*) OVER (PARTITION BY o.owner_id) AS event_count
  FROM orphans o
  JOIN public.events e
    ON e.user_id = o.owner_id
   AND e.status = 'published'
)
INSERT INTO public.event_sponsors (event_id, sponsor_id)
SELECT event_id, sponsor_id
  FROM owner_events
 WHERE event_count = 1
ON CONFLICT (event_id, sponsor_id) DO NOTHING;
