-- ═══════════════════════════════════════════════════════════════════════════════
-- 052_meeting_status.sql
--
-- Meetings: follow each Meeting Interest (050/051) through to a result.
--
--   interested ──► arranged ──► met
--        │             └──────► not_met ("Didn't happen")
--        └──────────► met / not_met   (arranging is optional)
--
--   • Each sponsor–person row now has a `status`, an optional time and place
--     (arranged), when it was met, an optional reason it didn't happen, and a
--     private `note` (seen only by that sponsor's team and the organisers).
--   • `set_meeting_status` — the sponsor (for its own rows) or the event's
--     organisers (for any sponsor on the event) change the status. A meeting
--     must start as interested or arranged; after that it can move to any
--     state, so a mistake can be undone. Records who changed it and which side.
--   • `set_meeting_note` — the same people edit the private note.
--   • `sponsor_set_meeting_interest` — unticking is refused once a meeting is
--     arranged, met or didn't happen, so the record stays.
--   • `sponsor_portal_people` and `event_meeting_interests` return the status
--     fields. Status changes are streamed live like the rest (051).
--   • No contact details are revealed and nobody is notified.
--
-- Run after 051. Idempotent — safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Columns ────────────────────────────────────────────────────────────────
ALTER TABLE public.sponsor_meeting_interests
  ADD COLUMN IF NOT EXISTS status            text NOT NULL DEFAULT 'interested',
  ADD COLUMN IF NOT EXISTS scheduled_at      timestamptz,
  ADD COLUMN IF NOT EXISTS location          text,
  ADD COLUMN IF NOT EXISTS met_at            timestamptz,
  ADD COLUMN IF NOT EXISTS status_reason     text,
  ADD COLUMN IF NOT EXISTS note              text,
  ADD COLUMN IF NOT EXISTS status_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status_by_side    text,
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz;

ALTER TABLE public.sponsor_meeting_interests DROP CONSTRAINT IF EXISTS sponsor_meeting_interests_status_check;
ALTER TABLE public.sponsor_meeting_interests
  ADD CONSTRAINT sponsor_meeting_interests_status_check CHECK (status IN ('interested', 'arranged', 'met', 'not_met'));
ALTER TABLE public.sponsor_meeting_interests DROP CONSTRAINT IF EXISTS sponsor_meeting_interests_side_check;
ALTER TABLE public.sponsor_meeting_interests
  ADD CONSTRAINT sponsor_meeting_interests_side_check CHECK (status_by_side IS NULL OR status_by_side IN ('sponsor', 'organiser'));
ALTER TABLE public.sponsor_meeting_interests DROP CONSTRAINT IF EXISTS sponsor_meeting_interests_lengths;
ALTER TABLE public.sponsor_meeting_interests
  ADD CONSTRAINT sponsor_meeting_interests_lengths
  CHECK (coalesce(length(location), 0) <= 200 AND coalesce(length(status_reason), 0) <= 500 AND coalesce(length(note), 0) <= 2000);

CREATE INDEX IF NOT EXISTS sponsor_meeting_interests_status_idx ON public.sponsor_meeting_interests (event_id, status);

-- ── 2. Helpers ────────────────────────────────────────────────────────────────
-- Who is acting, and for which sponsor. Organisers of the event act for the
-- sponsor they name (it must be on the event); sponsors act for their own
-- sponsor, worked out from the session as in 050.
CREATE OR REPLACE FUNCTION public._meeting_actor(_eid uuid, _sponsor_id uuid)
RETURNS TABLE (sponsor_id uuid, side text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  _sid   uuid;
  _count int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first.' USING ERRCODE = '42501'; END IF;

  IF public._can_view_event_registrations(_eid) THEN
    IF _sponsor_id IS NULL THEN RAISE EXCEPTION 'Choose the sponsor.' USING ERRCODE = '22023'; END IF;
    IF NOT EXISTS (SELECT 1 FROM event_sponsors es WHERE es.event_id = _eid AND es.sponsor_id = _sponsor_id) THEN
      RAISE EXCEPTION 'That sponsor is not on this event.' USING ERRCODE = '42501';
    END IF;
    sponsor_id := _sponsor_id; side := 'organiser'; RETURN NEXT; RETURN;
  END IF;

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
  sponsor_id := _sid; side := 'sponsor'; RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public._meeting_actor(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- The person must be one the sponsor dashboard lists: an approved,
-- non-speaker registration of the event, or a speaker on the event.
CREATE OR REPLACE FUNCTION public._meeting_person_check(_eid uuid, _registration_id uuid, _speaker_id uuid)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF num_nonnulls(_registration_id, _speaker_id) <> 1 THEN
    RAISE EXCEPTION 'Choose one attendee or one speaker.' USING ERRCODE = '22023';
  END IF;
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
END;
$$;
REVOKE ALL ON FUNCTION public._meeting_person_check(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ── 3. Change a meeting's status ─────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.set_meeting_status(uuid, text, uuid, uuid, uuid, timestamptz, text, text);

CREATE FUNCTION public.set_meeting_status(
  _eid             uuid,
  _status          text,
  _registration_id uuid        DEFAULT NULL,
  _speaker_id      uuid        DEFAULT NULL,
  _sponsor_id      uuid        DEFAULT NULL,   -- required for organisers
  _scheduled_at    timestamptz DEFAULT NULL,   -- arranged: when (optional)
  _location        text        DEFAULT NULL,   -- arranged: where (optional)
  _reason          text        DEFAULT NULL    -- not_met: why (optional)
)
RETURNS TABLE (
  registration_id uuid, speaker_id uuid, sponsor_id uuid, status text,
  scheduled_at timestamptz, location text, met_at timestamptz, status_reason text,
  status_by_side text, status_changed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _sid   uuid;
  _side  text;
  _row   sponsor_meeting_interests%ROWTYPE;
  _from  text;
  _email text;
BEGIN
  IF _status IS NULL OR _status NOT IN ('interested', 'arranged', 'met', 'not_met') THEN
    RAISE EXCEPTION 'Unknown meeting status.' USING ERRCODE = '22023';
  END IF;
  SELECT a.sponsor_id, a.side INTO _sid, _side FROM public._meeting_actor(_eid, _sponsor_id) a;
  PERFORM public._meeting_person_check(_eid, _registration_id, _speaker_id);

  SELECT * INTO _row FROM sponsor_meeting_interests smi
   WHERE smi.event_id = _eid AND smi.sponsor_id = _sid
     AND (smi.registration_id = _registration_id OR smi.speaker_id = _speaker_id)
   FOR UPDATE;

  IF NOT FOUND THEN
    -- A meeting starts as interest or as an arranged meeting.
    IF _status NOT IN ('interested', 'arranged') THEN
      RAISE EXCEPTION 'Mark interest or arrange the meeting first.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO sponsor_meeting_interests (event_id, sponsor_id, registration_id, speaker_id, created_by)
         VALUES (_eid, _sid, _registration_id, _speaker_id, auth.uid())
    RETURNING * INTO _row;
    _from := NULL;
  ELSE
    _from := _row.status;
  END IF;

  UPDATE sponsor_meeting_interests smi SET
    status            = _status,
    scheduled_at      = CASE _status WHEN 'arranged' THEN _scheduled_at
                                     WHEN 'interested' THEN NULL ELSE smi.scheduled_at END,
    location          = CASE _status WHEN 'arranged' THEN NULLIF(btrim(left(_location, 200)), '')
                                     WHEN 'interested' THEN NULL ELSE smi.location END,
    met_at            = CASE _status WHEN 'met' THEN COALESCE(CASE WHEN smi.status = 'met' THEN smi.met_at END, now())
                                     ELSE NULL END,
    status_reason     = CASE _status WHEN 'not_met' THEN NULLIF(btrim(left(_reason, 500)), '') ELSE NULL END,
    status_by         = auth.uid(),
    status_by_side    = _side,
    status_changed_at = now(),
    updated_at        = now()
  WHERE smi.id = _row.id
  RETURNING * INTO _row;

  SELECT u.email INTO _email FROM auth.users u WHERE u.id = auth.uid();
  INSERT INTO audit_logs (actor_id, actor_email, action, target_type, target_id, details)
  VALUES (auth.uid(), _email, 'meeting.status_changed',
          CASE WHEN _speaker_id IS NOT NULL THEN 'speaker' ELSE 'registration' END,
          COALESCE(_speaker_id, _registration_id)::text,
          jsonb_build_object('event_id', _eid, 'sponsor_id', _sid, 'from', _from, 'to', _status, 'by', _side));

  registration_id   := _row.registration_id;
  speaker_id        := _row.speaker_id;
  sponsor_id        := _row.sponsor_id;
  status            := _row.status;
  scheduled_at      := _row.scheduled_at;
  location          := _row.location;
  met_at            := _row.met_at;
  status_reason     := _row.status_reason;
  status_by_side    := _row.status_by_side;
  status_changed_at := _row.status_changed_at;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.set_meeting_status(uuid, text, uuid, uuid, uuid, timestamptz, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_meeting_status(uuid, text, uuid, uuid, uuid, timestamptz, text, text) TO authenticated;

-- ── 4. The private note ───────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.set_meeting_note(uuid, text, uuid, uuid, uuid);

CREATE FUNCTION public.set_meeting_note(
  _eid             uuid,
  _note            text,
  _registration_id uuid DEFAULT NULL,
  _speaker_id      uuid DEFAULT NULL,
  _sponsor_id      uuid DEFAULT NULL
)
RETURNS TABLE (note text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _sid   uuid;
  _side  text;
  _id    uuid;
  _clean text := NULLIF(btrim(left(_note, 2000)), '');
  _email text;
BEGIN
  SELECT a.sponsor_id, a.side INTO _sid, _side FROM public._meeting_actor(_eid, _sponsor_id) a;
  PERFORM public._meeting_person_check(_eid, _registration_id, _speaker_id);

  UPDATE sponsor_meeting_interests smi SET note = _clean, updated_at = now()
   WHERE smi.event_id = _eid AND smi.sponsor_id = _sid
     AND (smi.registration_id = _registration_id OR smi.speaker_id = _speaker_id)
  RETURNING smi.id INTO _id;
  IF _id IS NULL THEN RAISE EXCEPTION 'Mark interest first.' USING ERRCODE = '22023'; END IF;

  -- The note itself stays out of the audit log.
  SELECT u.email INTO _email FROM auth.users u WHERE u.id = auth.uid();
  INSERT INTO audit_logs (actor_id, actor_email, action, target_type, target_id, details)
  VALUES (auth.uid(), _email, 'meeting.note_updated',
          CASE WHEN _speaker_id IS NOT NULL THEN 'speaker' ELSE 'registration' END,
          COALESCE(_speaker_id, _registration_id)::text,
          jsonb_build_object('event_id', _eid, 'sponsor_id', _sid, 'by', _side));

  note := _clean;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.set_meeting_note(uuid, text, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_meeting_note(uuid, text, uuid, uuid, uuid) TO authenticated;

-- ── 5. Unticking keeps arranged / finished meetings ─────────────────────────
CREATE OR REPLACE FUNCTION public.sponsor_set_meeting_interest(
  _eid             uuid,
  _registration_id uuid,
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

  PERFORM public._meeting_person_check(_eid, _registration_id, _speaker_id);

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
    IF EXISTS (
      SELECT 1 FROM sponsor_meeting_interests smi
       WHERE smi.event_id = _eid AND smi.sponsor_id = _sid
         AND (smi.registration_id = _registration_id OR smi.speaker_id = _speaker_id)
         AND smi.status <> 'interested'
    ) THEN
      RAISE EXCEPTION 'This meeting is already arranged or done. Change its status instead.' USING ERRCODE = '22023';
    END IF;
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

-- ── 6. The sponsor dashboard's list, with the meeting ────────────────────────
DROP FUNCTION IF EXISTS public.sponsor_portal_people(uuid);

CREATE FUNCTION public.sponsor_portal_people(_eid uuid)
RETURNS TABLE(
  kind text, id uuid, name text, company text, designation text, ticket_type text,
  checked_in boolean, checked_in_at timestamptz, meeting_interest boolean,
  meeting_status text, interested_at timestamptz, scheduled_at timestamptz, location text,
  met_at timestamptz, status_reason text, note text, status_by_side text, status_changed_at timestamptz
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
  mine AS (
    SELECT smi.*
      FROM sponsor_meeting_interests smi
     WHERE smi.event_id = _eid
       AND smi.sponsor_id IN (SELECT sponsor_id FROM public._my_event_sponsors(_eid))
  )
  SELECT 'speaker', sp.id, sp.name, sp.company, COALESCE(NULLIF(sp.designation, ''), sp.title), 'speaker',
         COALESCE(r.checked_in, false), r.checked_in_at,
         m.id IS NOT NULL, m.status, m.created_at, m.scheduled_at, m.location,
         m.met_at, m.status_reason, m.note, m.status_by_side, m.status_changed_at
    FROM event_speakers esp
    JOIN speakers sp ON sp.id = esp.speaker_id
    LEFT JOIN registrations r ON r.event_id = _eid
                              AND r.ticket_type = 'speaker'
                              AND lower(r.email) = lower(COALESCE(sp.email, ''))
    LEFT JOIN LATERAL (SELECT * FROM mine WHERE mine.speaker_id = sp.id ORDER BY mine.created_at LIMIT 1) m ON true
   WHERE esp.event_id = _eid
     AND EXISTS(SELECT 1 FROM allowed)
  UNION ALL
  SELECT 'attendee', r.id, r.name, r.company, r.designation, r.ticket_type, r.checked_in, r.checked_in_at,
         m.id IS NOT NULL, m.status, m.created_at, m.scheduled_at, m.location,
         m.met_at, m.status_reason, m.note, m.status_by_side, m.status_changed_at
    FROM registrations r
    LEFT JOIN LATERAL (SELECT * FROM mine WHERE mine.registration_id = r.id ORDER BY mine.created_at LIMIT 1) m ON true
   WHERE r.event_id = _eid
     AND r.approval_status = 'approved'
     AND r.ticket_type <> 'speaker'
     AND EXISTS(SELECT 1 FROM allowed);
$$;
GRANT EXECUTE ON FUNCTION public.sponsor_portal_people(uuid) TO authenticated;

-- ── 7. Organisers: every meeting with its status ─────────────────────────────
DROP FUNCTION IF EXISTS public.event_meeting_interests(uuid);

CREATE FUNCTION public.event_meeting_interests(_eid uuid)
RETURNS TABLE (
  registration_id uuid, speaker_id uuid, speaker_email text, sponsor_id uuid, sponsor_name text, created_at timestamptz,
  status text, scheduled_at timestamptz, location text, met_at timestamptz, status_reason text, note text,
  status_by_side text, status_changed_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT smi.registration_id, smi.speaker_id, lower(NULLIF(sp.email, '')), smi.sponsor_id, s.name, smi.created_at,
         smi.status, smi.scheduled_at, smi.location, smi.met_at, smi.status_reason, smi.note,
         smi.status_by_side, smi.status_changed_at
    FROM sponsor_meeting_interests smi
    JOIN sponsors s ON s.id = smi.sponsor_id
    LEFT JOIN speakers sp ON sp.id = smi.speaker_id
   WHERE smi.event_id = _eid
     AND public._can_view_event_registrations(_eid)
   ORDER BY s.name, smi.created_at;
$$;
REVOKE ALL ON FUNCTION public.event_meeting_interests(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.event_meeting_interests(uuid) TO authenticated;

-- ── 8. Live: status changes signal the sponsor page too ──────────────────────
DROP TRIGGER IF EXISTS sponsor_meeting_interests_signal_event_live ON public.sponsor_meeting_interests;
CREATE TRIGGER sponsor_meeting_interests_signal_event_live
  AFTER INSERT OR UPDATE OR DELETE ON public.sponsor_meeting_interests
  FOR EACH ROW EXECUTE FUNCTION public._signal_event_live();

NOTIFY pgrst, 'reload schema';
