-- ─────────────────────────────────────────────────────────────────────────────
-- 027_event_creatives_event_type.sql
--
-- Widens `event_creatives.creative_type` and its entity-shape CHECK
-- constraint to allow `'event'` — an Event_Promo creative (stats banner /
-- invite card announcing the event itself, no specific speaker or sponsor
-- entity). Both `speaker_id` and `sponsor_id` were already nullable columns
-- (see `022_event_creatives.sql`), so an event-level row simply carries
-- both as NULL; only the CHECK constraints needed widening to permit it.
--
-- Requirements addressed: Social_Creative_Generator Event_Promo extension.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.event_creatives
  DROP CONSTRAINT event_creatives_creative_type_check;

ALTER TABLE public.event_creatives
  ADD CONSTRAINT event_creatives_creative_type_check
  CHECK (creative_type IN ('speaker', 'sponsor', 'combo', 'event'));

ALTER TABLE public.event_creatives
  DROP CONSTRAINT event_creatives_entity_check;

ALTER TABLE public.event_creatives
  ADD CONSTRAINT event_creatives_entity_check CHECK (
    (creative_type = 'speaker' AND speaker_id IS NOT NULL AND sponsor_id IS NULL) OR
    (creative_type = 'sponsor' AND sponsor_id IS NOT NULL AND speaker_id IS NULL) OR
    (creative_type = 'combo'   AND speaker_id IS NOT NULL AND sponsor_id IS NOT NULL) OR
    (creative_type = 'event'  AND speaker_id IS NULL AND sponsor_id IS NULL)
  );
