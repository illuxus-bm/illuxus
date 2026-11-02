-- ═══════════════════════════════════════════════════════════════════════════════
-- The sponsor's event page counts people the way the organiser's analytics do.
--
--   Registered   everyone holding a seat: not cancelled, declined or waitlisted
--                (registrations awaiting approval hold theirs)
--   Speakers     the event's speaker line-up
--   Attendees    registered people who aren't speakers
--   Checked in   registered people who checked in
--
-- Before this, the sponsor page counted only approved attendees plus the
-- speaker line-up, so its numbers never matched the organiser's.
--
-- Safe to run more than once. Paste into the SQL Editor and Run.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.sponsor_event_counts(_eid uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- The event's sponsors (their accepted team members) and its organisers.
  IF NOT EXISTS (SELECT 1 FROM public._my_event_sponsors(_eid))
     AND NOT EXISTS (SELECT 1 FROM events e WHERE e.id = _eid AND (e.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin')
                     OR EXISTS (SELECT 1 FROM org_members m WHERE m.org_id = e.org_id AND m.user_id = auth.uid()))) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN (
    WITH seats AS (
      SELECT r.*, (r.ticket_type = 'speaker' OR EXISTS (
               SELECT 1 FROM event_speakers es JOIN speakers sp ON sp.id = es.speaker_id
                WHERE es.event_id = r.event_id AND lower(NULLIF(btrim(sp.email), '')) = lower(r.email))) AS is_speaker
        FROM registrations r
       WHERE r.event_id = _eid AND r.status <> 'cancelled' AND r.approval_status NOT IN ('declined', 'waitlisted')
    )
    SELECT jsonb_build_object(
      'registered', (SELECT count(*) FROM seats),
      'checked_in', (SELECT count(*) FROM seats WHERE checked_in),
      'speakers', (SELECT count(*) FROM event_speakers WHERE event_id = _eid),
      'speakers_checked_in', (SELECT count(*) FROM seats WHERE is_speaker AND checked_in),
      'attendees', (SELECT count(*) FROM seats WHERE NOT is_speaker),
      'attendees_checked_in', (SELECT count(*) FROM seats WHERE NOT is_speaker AND checked_in))
  );
END;
$$;
REVOKE ALL ON FUNCTION public.sponsor_event_counts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sponsor_event_counts(uuid) TO authenticated;
