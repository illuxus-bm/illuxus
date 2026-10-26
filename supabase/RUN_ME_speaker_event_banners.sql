-- ═══════════════════════════════════════════════════════════════════════════════
-- Speaker dashboard: event cards show no banner.
--
-- speaker_portal_events() returned only events.image_url, but event banners
-- are uploaded to banner_landscape_url / banner_portrait_url, so image_url is
-- empty for most events and the card fell back to the placeholder icon.
-- The function now returns the landscape banner, then image_url, then the
-- portrait banner, in the same `image_url` column, so the app needs no change.
--
-- Same signature as before, so CREATE OR REPLACE is enough.
-- Safe to run more than once. Paste into the Supabase SQL Editor and Run.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.speaker_portal_events()
RETURNS TABLE(
  event_id uuid, event_slug text, event_title text, event_description text,
  event_date timestamptz, end_date timestamptz, location text, venue text, image_url text, status text,
  organizer_name text,
  speaker_id uuid, speaker_name text, speaker_photo_url text, speaker_company text,
  session_count bigint
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT
    e.id, e.slug, e.title, e.description, e.date, e.end_date, e.location, e.venue,
    COALESCE(NULLIF(e.banner_landscape_url, ''), NULLIF(e.image_url, ''), NULLIF(e.banner_portrait_url, '')),
    e.status,
    o.name,
    sp.id, sp.name, sp.photo_url, sp.company,
    (SELECT count(*) FROM sessions s WHERE s.event_id = e.id AND s.speaker_id = sp.id)
  FROM speakers sp
  JOIN event_speakers es ON es.speaker_id = sp.id
  JOIN events e         ON e.id = es.event_id
  LEFT JOIN organizations o ON o.id = e.org_id
  WHERE sp.user_id = auth.uid()
     OR lower(sp.email) = lower((SELECT email FROM auth.users WHERE id = auth.uid()))
  ORDER BY e.date DESC;
$$;

GRANT EXECUTE ON FUNCTION public.speaker_portal_events() TO authenticated;
