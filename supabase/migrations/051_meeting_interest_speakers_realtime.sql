-- ═══════════════════════════════════════════════════════════════════════════════
-- 051_meeting_interest_speakers_realtime.sql
--
-- Two additions to Meeting Interest (050):
--
--   A. Speakers can be marked too. Speakers aren't registrations, so an
--      interest now points at exactly one of a registration (attendee) or a
--      speaker profile (`speaker_id`). The speaker must be on the event.
--      `sponsor_set_meeting_interest` takes an optional `_speaker_id`; calls
--      made the 050 way (registration only) keep working.
--
--   B. Live updates. When a sponsor ticks or unticks someone, the organiser's
--      Registrations tab and the sponsor's own team see it without
--      refreshing. Supabase Realtime only delivers rows the receiver may
--      SELECT, so the table gets read access matching what each side already
--      sees through the functions:
--        • organisers — every interest on events whose registrations they can
--          view (as `event_meeting_interests`);
--        • sponsors — their own sponsor's interests (as `sponsor_portal_people`).
--      Writes still go only through `sponsor_set_meeting_interest`.
--
-- Run after 050. Idempotent — safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── A1. Table: a registration OR a speaker ───────────────────────────────────
ALTER TABLE public.sponsor_meeting_interests
  ADD COLUMN IF NOT EXISTS speaker_id uuid REFERENCES public.speakers(id) ON DELETE CASCADE;
ALTER TABLE public.sponsor_meeting_interests ALTER COLUMN registration_id DROP NOT NULL;

ALTER TABLE public.sponsor_meeting_interests DROP CONSTRAINT IF EXISTS sponsor_meeting_interests_one_person;
ALTER TABLE public.sponsor_meeting_interests
  ADD CONSTRAINT sponsor_meeting_interests_one_person CHECK (num_nonnulls(registration_id, speaker_id) = 1);

-- Attendees stay unique through 050's constraint; speakers through this.
CREATE UNIQUE INDEX IF NOT EXISTS sponsor_meeting_interests_speaker_unique
  ON public.sponsor_meeting_interests (event_id, sponsor_id, speaker_id) WHERE speaker_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sponsor_meeting_interests_speaker_idx
  ON public.sponsor_meeting_interests (speaker_id) WHERE speaker_id IS NOT NULL;

COMMENT ON TABLE public.sponsor_meeting_interests IS
  'Meeting Interest: sponsor S would like to meet a person at event E — an attendee (registration_id) or a speaker (speaker_id), exactly one. One row per (event, sponsor, person). Written only through sponsor_set_meeting_interest.';

-- ── A2. Set / clear the caller's own selection ───────────────────────────────
DROP FUNCTION IF EXISTS public.sponsor_set_meeting_interest(uuid, uuid, boolean, uuid);
DROP FUNCTION IF EXISTS public.sponsor_set_meeting_interest(uuid, uuid, boolean, uuid, uuid);

CREATE FUNCTION public.sponsor_set_meeting_interest(
  _eid             uuid,
  _registration_id uuid,     -- the attendee, or NULL for a speaker
  _interested      boolean,
  _sponsor_id      uuid DEFAULT NULL,
  _speaker_id      uuid DEFAULT NULL
)
RETURNS TABLE (registration_id uuid, speaker_id uuid, sponsor_id uuid, meeting_interest boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _sid   uuid;
  _count int;
  _email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first.' USING ERRCODE = '42501'; END IF;
  IF num_nonnulls(_registration_id, _speaker_id) <> 1 THEN
    RAISE EXCEPTION 'Choose one attendee or one speaker.' USING ERRCODE = '22023';
  END IF;

  -- Which sponsor is acting: worked out from the session, never taken on
  -- trust. `_sponsor_id` only chooses between the caller's own sponsors.
  SELECT count(*) INTO _count FROM public._my_event_sponsors(_eid);
  IF _count = 0 THEN RAISE EXCEPTION 'You are not a sponsor of this event.' USING ERRCODE = '42501'; END IF;
  IF _sponsor_id IS NOT NULL THEN
    SELECT ms.sponsor_id INTO _sid FROM public._my_event_sponsors(_eid) ms WHERE ms.sponsor_id = _sponsor_id;
    IF _sid IS NULL THEN RAISE EXCEPTION 'You are not that sponsor.' USING ERRCODE = '42501'; END IF;
  ELSIF _count = 1 THEN
    SELECT ms.sponsor_id INTO _sid FROM public._my_event_sponsors(_eid) ms;
  ELSE
    RAISE EXCEPTION 'You represent more than one sponsor of this event; choose which.' USING ERRCODE = '22023';
  END IF;

  -- Only people the sponsor can see in its dashboard.
  IF _registration_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM registrations r
     WHERE r.id = _registration_id AND r.event_id = _eid
       AND r.approval_status = 'approved' AND r.ticket_type <> 'speaker'
  ) THEN
    RAISE EXCEPTION 'That attendee is not available.' USING ERRCODE = '42501';
  END IF;
  IF _speaker_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM event_speakers esp WHERE esp.event_id = _eid AND esp.speaker_id = _speaker_id
  ) THEN
    RAISE EXCEPTION 'That speaker is not available.' USING ERRCODE = '42501';
  END IF;

  IF _interested THEN
    IF _speaker_id IS NOT NULL THEN
      INSERT INTO sponsor_meeting_interests (event_id, sponsor_id, speaker_id, created_by)
           VALUES (_eid, _sid, _speaker_id, auth.uid())
      ON CONFLICT (event_id, sponsor_id, speaker_id) WHERE speaker_id IS NOT NULL DO NOTHING;
    ELSE
      INSERT INTO sponsor_meeting_interests (event_id, sponsor_id, registration_id, created_by)
           VALUES (_eid, _sid, _registration_id, auth.uid())
      ON CONFLICT ON CONSTRAINT sponsor_meeting_interests_unique DO NOTHING;
    END IF;
  ELSE
    -- Only this sponsor's row; every other sponsor's selection stays.
    DELETE FROM sponsor_meeting_interests smi
     WHERE smi.event_id = _eid AND smi.sponsor_id = _sid
       AND (smi.registration_id = _registration_id OR smi.speaker_id = _speaker_id);
  END IF;

  SELECT u.email INTO _email FROM auth.users u WHERE u.id = auth.uid();
  INSERT INTO audit_logs (actor_id, actor_email, action, target_type, target_id, details)
  VALUES (auth.uid(), _email,
          CASE WHEN _interested THEN 'meeting_interest.added' ELSE 'meeting_interest.removed' END,
          CASE WHEN _speaker_id IS NOT NULL THEN 'speaker' ELSE 'registration' END,
          COALESCE(_speaker_id, _registration_id)::text,
          jsonb_build_object('event_id', _eid, 'sponsor_id', _sid));

  registration_id  := _registration_id;
  speaker_id       := _speaker_id;
  sponsor_id       := _sid;
  meeting_interest := _interested;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.sponsor_set_meeting_interest(uuid, uuid, boolean, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sponsor_set_meeting_interest(uuid, uuid, boolean, uuid, uuid) TO authenticated;

-- ── A3. The sponsor dashboard's list: speakers carry their flag too ──────────
CREATE OR REPLACE FUNCTION public.sponsor_portal_people(_eid uuid)
RETURNS TABLE(
  kind text, id uuid, name text, company text, designation text, ticket_type text,
  checked_in boolean, checked_in_at timestamptz, meeting_interest boolean
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH allowed AS (
    SELECT 1
      FROM sponsor_members sm
      JOIN event_sponsors es ON es.sponsor_id = sm.sponsor_id
     WHERE sm.user_id = auth.uid() AND sm.accepted_at IS NOT NULL AND es.event_id = _eid
    UNION ALL
    SELECT 1
      FROM sponsors s
      JOIN event_sponsors es ON es.sponsor_id = s.id
     WHERE s.user_id = auth.uid() AND es.event_id = _eid
    LIMIT 1
  ),
  mine AS (SELECT sponsor_id FROM public._my_event_sponsors(_eid))
  SELECT 'speaker', sp.id, sp.name, sp.company, COALESCE(NULLIF(sp.designation, ''), sp.title), 'speaker',
         COALESCE(r.checked_in, false), r.checked_in_at,
         EXISTS (SELECT 1 FROM sponsor_meeting_interests smi
                  WHERE smi.event_id = _eid AND smi.speaker_id = sp.id
                    AND smi.sponsor_id IN (SELECT sponsor_id FROM mine))
    FROM event_speakers esp
    JOIN speakers sp ON sp.id = esp.speaker_id
    LEFT JOIN registrations r ON r.event_id = _eid
                              AND r.ticket_type = 'speaker'
                              AND lower(r.email) = lower(COALESCE(sp.email, ''))
   WHERE esp.event_id = _eid
     AND EXISTS(SELECT 1 FROM allowed)
  UNION ALL
  SELECT 'attendee', r.id, r.name, r.company, r.designation, r.ticket_type, r.checked_in, r.checked_in_at,
         EXISTS (SELECT 1 FROM sponsor_meeting_interests smi
                  WHERE smi.event_id = _eid AND smi.registration_id = r.id
                    AND smi.sponsor_id IN (SELECT sponsor_id FROM mine))
    FROM registrations r
   WHERE r.event_id = _eid
     AND r.approval_status = 'approved'
     AND r.ticket_type <> 'speaker'
     AND EXISTS(SELECT 1 FROM allowed);
$$;
GRANT EXECUTE ON FUNCTION public.sponsor_portal_people(uuid) TO authenticated;

-- ── A4. Organisers: every interest, with the speaker's email so a speaker who
--        also registered is matched on their registration row ───────────────
DROP FUNCTION IF EXISTS public.event_meeting_interests(uuid);

CREATE FUNCTION public.event_meeting_interests(_eid uuid)
RETURNS TABLE (registration_id uuid, speaker_id uuid, speaker_email text, sponsor_id uuid, sponsor_name text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT smi.registration_id, smi.speaker_id, lower(NULLIF(sp.email, '')), smi.sponsor_id, s.name, smi.created_at
    FROM sponsor_meeting_interests smi
    JOIN sponsors s ON s.id = smi.sponsor_id
    LEFT JOIN speakers sp ON sp.id = smi.speaker_id
   WHERE smi.event_id = _eid
     AND public._can_view_event_registrations(_eid)
   ORDER BY s.name, smi.created_at;
$$;
REVOKE ALL ON FUNCTION public.event_meeting_interests(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.event_meeting_interests(uuid) TO authenticated;

-- ── B. Live updates ───────────────────────────────────────────────────────────
-- The policies call these as the signed-in user. Each only answers about the
-- caller (their own sponsors / whether they may view the event's registrations).
GRANT EXECUTE ON FUNCTION public._my_event_sponsors(uuid)            TO authenticated;
GRANT EXECUTE ON FUNCTION public._can_view_event_registrations(uuid) TO authenticated;

GRANT SELECT ON public.sponsor_meeting_interests TO authenticated;

DROP POLICY IF EXISTS "Organisers view meeting interests" ON public.sponsor_meeting_interests;
CREATE POLICY "Organisers view meeting interests" ON public.sponsor_meeting_interests
  FOR SELECT TO authenticated
  USING (public._can_view_event_registrations(event_id));

DROP POLICY IF EXISTS "Sponsors view their meeting interests" ON public.sponsor_meeting_interests;
CREATE POLICY "Sponsors view their meeting interests" ON public.sponsor_meeting_interests
  FOR SELECT TO authenticated
  USING (sponsor_id IN (SELECT ms.sponsor_id FROM public._my_event_sponsors(event_id) ms));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                  WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sponsor_meeting_interests') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.sponsor_meeting_interests';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
