-- ═══════════════════════════════════════════════════════════════════════════════
-- 054_meeting_disputes_history.sql
--
-- Makes meeting records dispute-proof (builds on 052):
--
--   1. Organisers have the final say. An outcome (Met / Didn't happen /
--      Cancelled) set by the organiser can't be changed by the sponsor; the
--      sponsor files a dispute with a reason and the organiser keeps or
--      changes it. Organiser changes to an outcome after the event need a
--      reason.
--   2. A sponsor can change its own outcome for 15 minutes (mis-clicks), then
--      it locks and changes go through a dispute. After the event the
--      sponsor can't move a meeting back to Interested / Arranged.
--   3. Nothing that progressed is deleted: "Remove interest" only works for a
--      meeting that never went past Interested; otherwise it's Cancelled
--      (a status, with an optional reason). A sponsor can't undo an
--      arrangement the organiser made.
--   4. Every change is written to `meeting_events`, an append-only history
--      (no one can edit or delete it) shown to both sides. Earlier changes are
--      backfilled from the audit log.
--   5. "Didn't happen" records a cause: attendee no-show, sponsor couldn't
--      make it, rescheduled, or other.
--   6. `sponsor_meeting_report` — the organiser's per-sponsor report with
--      check-in evidence and the full history.
--
-- Run after 053. Idempotent — safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Columns ────────────────────────────────────────────────────────────────
ALTER TABLE public.sponsor_meeting_interests DROP CONSTRAINT IF EXISTS sponsor_meeting_interests_status_check;
ALTER TABLE public.sponsor_meeting_interests
  ADD CONSTRAINT sponsor_meeting_interests_status_check
  CHECK (status IN ('interested', 'arranged', 'met', 'not_met', 'cancelled'));

ALTER TABLE public.sponsor_meeting_interests
  ADD COLUMN IF NOT EXISTS status_cause             text,
  ADD COLUMN IF NOT EXISTS ever_progressed          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS outcome_at               timestamptz,
  ADD COLUMN IF NOT EXISTS dispute_status           text,
  ADD COLUMN IF NOT EXISTS dispute_reason           text,
  ADD COLUMN IF NOT EXISTS dispute_requested_status text,
  ADD COLUMN IF NOT EXISTS disputed_at              timestamptz,
  ADD COLUMN IF NOT EXISTS dispute_resolution       text,
  ADD COLUMN IF NOT EXISTS dispute_note             text,
  ADD COLUMN IF NOT EXISTS resolved_at              timestamptz;

ALTER TABLE public.sponsor_meeting_interests DROP CONSTRAINT IF EXISTS sponsor_meeting_interests_cause_check;
ALTER TABLE public.sponsor_meeting_interests
  ADD CONSTRAINT sponsor_meeting_interests_cause_check
  CHECK (status_cause IS NULL OR status_cause IN ('attendee_no_show', 'sponsor_unavailable', 'rescheduled', 'other'));
ALTER TABLE public.sponsor_meeting_interests DROP CONSTRAINT IF EXISTS sponsor_meeting_interests_dispute_check;
ALTER TABLE public.sponsor_meeting_interests
  ADD CONSTRAINT sponsor_meeting_interests_dispute_check
  CHECK ((dispute_status IS NULL OR dispute_status IN ('open', 'resolved'))
     AND (dispute_resolution IS NULL OR dispute_resolution IN ('kept', 'changed'))
     AND (dispute_requested_status IS NULL OR dispute_requested_status IN ('interested', 'arranged', 'met', 'not_met', 'cancelled'))
     AND coalesce(length(dispute_reason), 0) <= 1000 AND coalesce(length(dispute_note), 0) <= 1000);

UPDATE public.sponsor_meeting_interests
   SET ever_progressed = true
 WHERE status <> 'interested' AND NOT ever_progressed;
UPDATE public.sponsor_meeting_interests
   SET outcome_at = coalesce(status_changed_at, updated_at)
 WHERE status IN ('met', 'not_met', 'cancelled') AND outcome_at IS NULL;

-- ── 2. Append-only history ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.meeting_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id      uuid,                 -- sponsor_meeting_interests.id (kept even if that row goes)
  event_id        uuid NOT NULL,
  sponsor_id      uuid NOT NULL,
  registration_id uuid,
  speaker_id      uuid,
  action          text NOT NULL,        -- interested | arranged | met | not_met | cancelled | removed
                                        -- | disputed | dispute_kept | dispute_changed | note
  from_status     text,
  to_status       text,
  side            text,                 -- sponsor | organiser
  actor_id        uuid,
  reason          text,
  cause           text,
  scheduled_at    timestamptz,
  location        text,
  backfilled      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS meeting_events_person_idx  ON public.meeting_events (event_id, sponsor_id, registration_id, speaker_id, created_at);
CREATE INDEX IF NOT EXISTS meeting_events_meeting_idx ON public.meeting_events (meeting_id);

ALTER TABLE public.meeting_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.meeting_events FROM anon, authenticated;

-- Nobody edits or deletes history — not organisers, not admins through the app.
CREATE OR REPLACE FUNCTION public._meeting_events_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Meeting history cannot be changed or deleted.' USING ERRCODE = '42501';
END;
$$;
DROP TRIGGER IF EXISTS meeting_events_append_only ON public.meeting_events;
CREATE TRIGGER meeting_events_append_only
  BEFORE UPDATE OR DELETE ON public.meeting_events
  FOR EACH ROW EXECUTE FUNCTION public._meeting_events_append_only();

COMMENT ON TABLE public.meeting_events IS
  'Append-only history of every Meeting Interest change (status, disputes, notes). Written only by the meeting functions; read through meeting_history / sponsor_meeting_report.';

-- Backfill from the audit log, once.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.meeting_events) THEN
    WITH log AS (
      SELECT a.*,
             (a.details->>'event_id')::uuid   AS ev,
             (a.details->>'sponsor_id')::uuid AS sp,
             CASE WHEN a.target_type = 'registration' THEN a.target_id::uuid END AS reg,
             CASE WHEN a.target_type = 'speaker'      THEN a.target_id::uuid END AS spk
        FROM public.audit_logs a
       WHERE a.action IN ('meeting_interest.added', 'meeting_interest.removed', 'meeting.status_changed')
         AND a.details ? 'event_id' AND a.details ? 'sponsor_id'
         AND a.target_type IN ('registration', 'speaker')
    )
    INSERT INTO public.meeting_events
      (meeting_id, event_id, sponsor_id, registration_id, speaker_id, action, from_status, to_status, side, actor_id, backfilled, created_at)
    SELECT (SELECT smi.id FROM public.sponsor_meeting_interests smi
             WHERE smi.event_id = a.ev AND smi.sponsor_id = a.sp
               AND (smi.registration_id = a.reg OR smi.speaker_id = a.spk) LIMIT 1),
           a.ev, a.sp, a.reg, a.spk,
           CASE a.action
             WHEN 'meeting_interest.added'   THEN 'interested'
             WHEN 'meeting_interest.removed' THEN 'removed'
             ELSE a.details->>'to' END,
           CASE WHEN a.action = 'meeting.status_changed' THEN a.details->>'from' END,
           CASE a.action
             WHEN 'meeting_interest.added'   THEN 'interested'
             WHEN 'meeting_interest.removed' THEN NULL
             ELSE a.details->>'to' END,
           CASE WHEN a.action = 'meeting.status_changed' THEN a.details->>'by' ELSE 'sponsor' END,
           a.actor_id,
           true,
           a.created_at
      FROM log a;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- History starts from now if the audit log can't be read; nothing else depends on it.
  RAISE NOTICE 'meeting_events backfill skipped: %', SQLERRM;
END $$;

-- ── 3. Helpers ────────────────────────────────────────────────────────────────
-- The event is over: its end, or 12 hours after the start when it has no end
-- (as the sponsor dashboard shows it).
CREATE OR REPLACE FUNCTION public._event_over(_eid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT now() > coalesce(e.end_date, e.date + interval '12 hours') FROM events e WHERE e.id = _eid), false);
$$;
REVOKE ALL ON FUNCTION public._event_over(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._log_meeting(
  _meeting_id uuid, _eid uuid, _sid uuid, _reg uuid, _spk uuid,
  _action text, _from text, _to text, _side text,
  _reason text DEFAULT NULL, _cause text DEFAULT NULL,
  _scheduled_at timestamptz DEFAULT NULL, _location text DEFAULT NULL
) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO meeting_events (meeting_id, event_id, sponsor_id, registration_id, speaker_id, action,
                              from_status, to_status, side, actor_id, reason, cause, scheduled_at, location)
  VALUES (_meeting_id, _eid, _sid, _reg, _spk, _action, _from, _to, _side, auth.uid(),
          NULLIF(btrim(left(_reason, 1000)), ''), _cause, _scheduled_at, _location);
$$;
REVOKE ALL ON FUNCTION public._log_meeting(uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, text, timestamptz, text) FROM PUBLIC, anon, authenticated;

-- ── 4. Change a meeting's status (with the dispute-proof rules) ─────────────
DROP FUNCTION IF EXISTS public.set_meeting_status(uuid, text, uuid, uuid, uuid, timestamptz, text, text);
DROP FUNCTION IF EXISTS public.set_meeting_status(uuid, text, uuid, uuid, uuid, timestamptz, text, text, text);

CREATE FUNCTION public.set_meeting_status(
  _eid             uuid,
  _status          text,
  _registration_id uuid        DEFAULT NULL,
  _speaker_id      uuid        DEFAULT NULL,
  _sponsor_id      uuid        DEFAULT NULL,   -- required for organisers
  _scheduled_at    timestamptz DEFAULT NULL,   -- arranged: when (optional)
  _location        text        DEFAULT NULL,   -- arranged: where (optional)
  _reason          text        DEFAULT NULL,   -- not_met / cancelled: why; organiser changes after the event: why
  _cause           text        DEFAULT NULL    -- not_met: attendee_no_show | sponsor_unavailable | rescheduled | other
)
RETURNS TABLE (registration_id uuid, speaker_id uuid, sponsor_id uuid, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _sid      uuid;
  _side     text;
  _row      sponsor_meeting_interests%ROWTYPE;
  _from     text;
  _over     boolean := public._event_over(_eid);
  _outcomes text[]  := ARRAY['met', 'not_met', 'cancelled'];
  _cz       text;
  _email    text;
BEGIN
  IF _status IS NULL OR _status NOT IN ('interested', 'arranged', 'met', 'not_met', 'cancelled') THEN
    RAISE EXCEPTION 'Unknown meeting status.' USING ERRCODE = '22023';
  END IF;
  _cz := CASE WHEN _status = 'not_met' THEN coalesce(_cause, 'other') END;
  IF _cz IS NOT NULL AND _cz NOT IN ('attendee_no_show', 'sponsor_unavailable', 'rescheduled', 'other') THEN
    RAISE EXCEPTION 'Unknown reason the meeting did not happen.' USING ERRCODE = '22023';
  END IF;

  SELECT a.sponsor_id, a.side INTO _sid, _side FROM public._meeting_actor(_eid, _sponsor_id) a;
  PERFORM public._meeting_person_check(_eid, _registration_id, _speaker_id);

  SELECT * INTO _row FROM sponsor_meeting_interests smi
   WHERE smi.event_id = _eid AND smi.sponsor_id = _sid
     AND (smi.registration_id = _registration_id OR smi.speaker_id = _speaker_id)
   FOR UPDATE;

  IF NOT FOUND THEN
    IF _status NOT IN ('interested', 'arranged') THEN
      RAISE EXCEPTION 'Mark interest or arrange the meeting first.' USING ERRCODE = '22023';
    END IF;
    IF _side = 'sponsor' AND _status = 'arranged' AND _over THEN
      RAISE EXCEPTION 'EVENT_OVER' USING ERRCODE = '22023';
    END IF;
    INSERT INTO sponsor_meeting_interests (event_id, sponsor_id, registration_id, speaker_id, created_by)
         VALUES (_eid, _sid, _registration_id, _speaker_id, auth.uid())
    RETURNING * INTO _row;
    _from := NULL;
  ELSE
    _from := _row.status;
  END IF;

  IF _side = 'sponsor' THEN
    IF _row.dispute_status = 'open' THEN
      RAISE EXCEPTION 'DISPUTE_OPEN' USING ERRCODE = '22023';
    END IF;
    IF _from = ANY (_outcomes) THEN
      -- The organiser's outcomes are final for the sponsor; its own lock after 15 minutes.
      IF _row.status_by_side = 'organiser' THEN
        RAISE EXCEPTION 'LOCKED_ORGANISER' USING ERRCODE = '42501';
      END IF;
      IF coalesce(_row.outcome_at, _row.status_changed_at, now()) < now() - interval '15 minutes' THEN
        RAISE EXCEPTION 'LOCKED' USING ERRCODE = '42501';
      END IF;
    ELSE
      -- After the event a sponsor only records outcomes.
      IF _over AND _status IN ('interested', 'arranged') AND _from IS NOT NULL THEN
        RAISE EXCEPTION 'EVENT_OVER' USING ERRCODE = '22023';
      END IF;
      IF _from = 'arranged' AND _status = 'interested' AND _row.status_by_side = 'organiser' THEN
        RAISE EXCEPTION 'ARRANGED_BY_ORGANISER' USING ERRCODE = '42501';
      END IF;
    END IF;
  ELSE
    -- Organisers may change anything; changing an outcome after the event needs a reason.
    IF _from = ANY (_outcomes) AND _over AND _from IS DISTINCT FROM _status AND coalesce(btrim(_reason), '') = '' THEN
      RAISE EXCEPTION 'REASON_REQUIRED' USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE sponsor_meeting_interests smi SET
    status            = _status,
    scheduled_at      = CASE _status WHEN 'arranged' THEN _scheduled_at
                                     WHEN 'interested' THEN NULL ELSE smi.scheduled_at END,
    location          = CASE _status WHEN 'arranged' THEN NULLIF(btrim(left(_location, 200)), '')
                                     WHEN 'interested' THEN NULL ELSE smi.location END,
    met_at            = CASE _status WHEN 'met' THEN COALESCE(CASE WHEN smi.status = 'met' THEN smi.met_at END, now())
                                     ELSE NULL END,
    status_reason     = CASE WHEN _status IN ('not_met', 'cancelled') THEN NULLIF(btrim(left(_reason, 500)), '') END,
    status_cause      = _cz,
    outcome_at        = CASE WHEN _status = ANY (_outcomes)
                             THEN CASE WHEN smi.status = ANY (_outcomes) THEN coalesce(smi.outcome_at, now()) ELSE now() END
                        END,
    ever_progressed   = smi.ever_progressed OR _status <> 'interested',
    status_by         = auth.uid(),
    status_by_side    = _side,
    status_changed_at = now(),
    updated_at        = now(),
    -- An organiser change settles an open dispute.
    dispute_status     = CASE WHEN _side = 'organiser' AND smi.dispute_status = 'open' THEN 'resolved' ELSE smi.dispute_status END,
    dispute_resolution = CASE WHEN _side = 'organiser' AND smi.dispute_status = 'open' THEN 'changed' ELSE smi.dispute_resolution END,
    dispute_note       = CASE WHEN _side = 'organiser' AND smi.dispute_status = 'open' THEN NULLIF(btrim(left(_reason, 1000)), '') ELSE smi.dispute_note END,
    resolved_at        = CASE WHEN _side = 'organiser' AND smi.dispute_status = 'open' THEN now() ELSE smi.resolved_at END
  WHERE smi.id = _row.id;

  PERFORM public._log_meeting(_row.id, _eid, _sid, _registration_id, _speaker_id,
          CASE WHEN _side = 'organiser' AND _row.dispute_status = 'open' THEN 'dispute_changed' ELSE _status END,
          _from, _status, _side, _reason, _cz,
          CASE WHEN _status = 'arranged' THEN _scheduled_at END,
          CASE WHEN _status = 'arranged' THEN NULLIF(btrim(left(_location, 200)), '') END);

  SELECT u.email INTO _email FROM auth.users u WHERE u.id = auth.uid();
  INSERT INTO audit_logs (actor_id, actor_email, action, target_type, target_id, details)
  VALUES (auth.uid(), _email, 'meeting.status_changed',
          CASE WHEN _speaker_id IS NOT NULL THEN 'speaker' ELSE 'registration' END,
          COALESCE(_speaker_id, _registration_id)::text,
          jsonb_build_object('event_id', _eid, 'sponsor_id', _sid, 'from', _from, 'to', _status, 'by', _side));

  registration_id := _registration_id;
  speaker_id      := _speaker_id;
  sponsor_id      := _sid;
  status          := _status;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.set_meeting_status(uuid, text, uuid, uuid, uuid, timestamptz, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_meeting_status(uuid, text, uuid, uuid, uuid, timestamptz, text, text, text) TO authenticated;

-- ── 5. Disputes ───────────────────────────────────────────────────────────────
-- The sponsor asks for a locked outcome to change, with a reason.
DROP FUNCTION IF EXISTS public.dispute_meeting(uuid, text, text, uuid, uuid, uuid);

CREATE FUNCTION public.dispute_meeting(
  _eid              uuid,
  _requested_status text,
  _reason           text,
  _registration_id  uuid DEFAULT NULL,
  _speaker_id       uuid DEFAULT NULL,
  _sponsor_id       uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _sid   uuid;
  _side  text;
  _row   sponsor_meeting_interests%ROWTYPE;
  _email text;
BEGIN
  SELECT a.sponsor_id, a.side INTO _sid, _side FROM public._meeting_actor(_eid, _sponsor_id) a;
  IF _side <> 'sponsor' THEN
    RAISE EXCEPTION 'Organisers change the meeting directly.' USING ERRCODE = '22023';
  END IF;
  PERFORM public._meeting_person_check(_eid, _registration_id, _speaker_id);
  IF coalesce(btrim(_reason), '') = '' THEN
    RAISE EXCEPTION 'Say why the record is wrong.' USING ERRCODE = '22023';
  END IF;
  IF _requested_status IS NULL OR _requested_status NOT IN ('interested', 'arranged', 'met', 'not_met', 'cancelled') THEN
    RAISE EXCEPTION 'Choose what the record should say.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _row FROM sponsor_meeting_interests smi
   WHERE smi.event_id = _eid AND smi.sponsor_id = _sid
     AND (smi.registration_id = _registration_id OR smi.speaker_id = _speaker_id)
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'There is no meeting to dispute.' USING ERRCODE = '22023'; END IF;
  IF _row.dispute_status = 'open' THEN RAISE EXCEPTION 'DISPUTE_OPEN' USING ERRCODE = '22023'; END IF;
  IF _requested_status = _row.status THEN
    RAISE EXCEPTION 'The record already says that.' USING ERRCODE = '22023';
  END IF;

  UPDATE sponsor_meeting_interests smi SET
    dispute_status = 'open', dispute_reason = btrim(left(_reason, 1000)),
    dispute_requested_status = _requested_status, disputed_at = now(),
    dispute_resolution = NULL, dispute_note = NULL, resolved_at = NULL,
    updated_at = now()
  WHERE smi.id = _row.id;

  PERFORM public._log_meeting(_row.id, _eid, _sid, _registration_id, _speaker_id,
          'disputed', _row.status, _requested_status, 'sponsor', _reason);

  SELECT u.email INTO _email FROM auth.users u WHERE u.id = auth.uid();
  INSERT INTO audit_logs (actor_id, actor_email, action, target_type, target_id, details)
  VALUES (auth.uid(), _email, 'meeting.disputed',
          CASE WHEN _speaker_id IS NOT NULL THEN 'speaker' ELSE 'registration' END,
          COALESCE(_speaker_id, _registration_id)::text,
          jsonb_build_object('event_id', _eid, 'sponsor_id', _sid, 'from', _row.status, 'requested', _requested_status));
END;
$$;
REVOKE ALL ON FUNCTION public.dispute_meeting(uuid, text, text, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dispute_meeting(uuid, text, text, uuid, uuid, uuid) TO authenticated;

-- The organiser keeps the record or changes it to what the sponsor asked for.
DROP FUNCTION IF EXISTS public.resolve_meeting_dispute(uuid, uuid, boolean, text, uuid, uuid);

CREATE FUNCTION public.resolve_meeting_dispute(
  _eid             uuid,
  _sponsor_id      uuid,
  _keep            boolean,
  _note            text DEFAULT NULL,
  _registration_id uuid DEFAULT NULL,
  _speaker_id      uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _sid   uuid;
  _side  text;
  _row   sponsor_meeting_interests%ROWTYPE;
  _to    text;
  _email text;
BEGIN
  SELECT a.sponsor_id, a.side INTO _sid, _side FROM public._meeting_actor(_eid, _sponsor_id) a;
  IF _side <> 'organiser' THEN RAISE EXCEPTION 'Only the organiser settles a dispute.' USING ERRCODE = '42501'; END IF;
  PERFORM public._meeting_person_check(_eid, _registration_id, _speaker_id);

  SELECT * INTO _row FROM sponsor_meeting_interests smi
   WHERE smi.event_id = _eid AND smi.sponsor_id = _sid
     AND (smi.registration_id = _registration_id OR smi.speaker_id = _speaker_id)
   FOR UPDATE;
  IF NOT FOUND OR _row.dispute_status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'There is no open dispute on this meeting.' USING ERRCODE = '22023';
  END IF;

  _to := CASE WHEN _keep THEN _row.status ELSE _row.dispute_requested_status END;

  UPDATE sponsor_meeting_interests smi SET
    status             = _to,
    met_at             = CASE WHEN _to = 'met' THEN coalesce(smi.met_at, now()) ELSE NULL END,
    status_cause       = CASE WHEN _to = 'not_met' THEN coalesce(smi.status_cause, 'other') END,
    status_reason      = CASE WHEN _to IN ('not_met', 'cancelled') THEN smi.status_reason END,
    scheduled_at       = CASE WHEN _to = 'interested' THEN NULL ELSE smi.scheduled_at END,
    location           = CASE WHEN _to = 'interested' THEN NULL ELSE smi.location END,
    outcome_at         = CASE WHEN _to IN ('met', 'not_met', 'cancelled') THEN coalesce(smi.outcome_at, now()) END,
    ever_progressed    = smi.ever_progressed OR _to <> 'interested',
    status_by          = auth.uid(),
    status_by_side     = 'organiser',
    status_changed_at  = now(),
    dispute_status     = 'resolved',
    dispute_resolution = CASE WHEN _keep THEN 'kept' ELSE 'changed' END,
    dispute_note       = NULLIF(btrim(left(_note, 1000)), ''),
    resolved_at        = now(),
    updated_at         = now()
  WHERE smi.id = _row.id;

  PERFORM public._log_meeting(_row.id, _eid, _sid, _registration_id, _speaker_id,
          CASE WHEN _keep THEN 'dispute_kept' ELSE 'dispute_changed' END,
          _row.status, _to, 'organiser', _note);

  SELECT u.email INTO _email FROM auth.users u WHERE u.id = auth.uid();
  INSERT INTO audit_logs (actor_id, actor_email, action, target_type, target_id, details)
  VALUES (auth.uid(), _email, 'meeting.dispute_resolved',
          CASE WHEN _speaker_id IS NOT NULL THEN 'speaker' ELSE 'registration' END,
          COALESCE(_speaker_id, _registration_id)::text,
          jsonb_build_object('event_id', _eid, 'sponsor_id', _sid, 'kept', _keep, 'to', _to));
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_meeting_dispute(uuid, uuid, boolean, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_meeting_dispute(uuid, uuid, boolean, text, uuid, uuid) TO authenticated;

-- ── 6. Ticking / unticking interest: removal only before anything happened ──
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
  _mid   uuid;
  _row   sponsor_meeting_interests%ROWTYPE;
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
      ON CONFLICT (event_id, sponsor_id, speaker_id) WHERE speaker_id IS NOT NULL DO NOTHING
      RETURNING id INTO _mid;
    ELSE
      INSERT INTO sponsor_meeting_interests (event_id, sponsor_id, registration_id, created_by)
           VALUES (_eid, _sid, _registration_id, auth.uid())
      ON CONFLICT ON CONSTRAINT sponsor_meeting_interests_unique DO NOTHING
      RETURNING id INTO _mid;
    END IF;
    IF _mid IS NOT NULL THEN
      PERFORM public._log_meeting(_mid, _eid, _sid, _registration_id, _speaker_id, 'interested', NULL, 'interested', 'sponsor');
    END IF;
  ELSE
    SELECT * INTO _row FROM sponsor_meeting_interests smi
     WHERE smi.event_id = _eid AND smi.sponsor_id = _sid
       AND (smi.registration_id = _registration_id OR smi.speaker_id = _speaker_id)
     FOR UPDATE;
    IF FOUND THEN
      IF _row.status <> 'interested' OR _row.ever_progressed THEN
        RAISE EXCEPTION 'CANCEL_INSTEAD' USING ERRCODE = '22023';
      END IF;
      PERFORM public._log_meeting(_row.id, _eid, _sid, _registration_id, _speaker_id, 'removed', 'interested', NULL, 'sponsor');
      DELETE FROM sponsor_meeting_interests smi WHERE smi.id = _row.id;
    END IF;
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

-- Notes are logged too (without their text).
CREATE OR REPLACE FUNCTION public.set_meeting_note(
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
BEGIN
  SELECT a.sponsor_id, a.side INTO _sid, _side FROM public._meeting_actor(_eid, _sponsor_id) a;
  PERFORM public._meeting_person_check(_eid, _registration_id, _speaker_id);

  UPDATE sponsor_meeting_interests smi SET note = _clean, updated_at = now()
   WHERE smi.event_id = _eid AND smi.sponsor_id = _sid
     AND (smi.registration_id = _registration_id OR smi.speaker_id = _speaker_id)
  RETURNING smi.id INTO _id;
  IF _id IS NULL THEN RAISE EXCEPTION 'Mark interest first.' USING ERRCODE = '22023'; END IF;

  PERFORM public._log_meeting(_id, _eid, _sid, _registration_id, _speaker_id, 'note', NULL, NULL, _side);

  note := _clean;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.set_meeting_note(uuid, text, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_meeting_note(uuid, text, uuid, uuid, uuid) TO authenticated;

-- ── 7. History, for both sides ────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.meeting_history(uuid, uuid, uuid, uuid);

CREATE FUNCTION public.meeting_history(
  _eid             uuid,
  _registration_id uuid DEFAULT NULL,
  _speaker_id      uuid DEFAULT NULL,
  _sponsor_id      uuid DEFAULT NULL    -- required for organisers
)
RETURNS TABLE (
  created_at timestamptz, action text, from_status text, to_status text, side text,
  reason text, cause text, scheduled_at timestamptz, location text, backfilled boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  _sid  uuid;
  _side text;
BEGIN
  SELECT a.sponsor_id, a.side INTO _sid, _side FROM public._meeting_actor(_eid, _sponsor_id) a;
  RETURN QUERY
    SELECT me.created_at, me.action, me.from_status, me.to_status, me.side,
           me.reason, me.cause, me.scheduled_at, me.location, me.backfilled
      FROM meeting_events me
     WHERE me.event_id = _eid AND me.sponsor_id = _sid
       AND (me.registration_id = _registration_id OR me.speaker_id = _speaker_id)
     ORDER BY me.created_at, me.id;
END;
$$;
REVOKE ALL ON FUNCTION public.meeting_history(uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.meeting_history(uuid, uuid, uuid, uuid) TO authenticated;

-- ── 8. Lists carry the dispute and lock fields ───────────────────────────────
DROP FUNCTION IF EXISTS public.sponsor_portal_people(uuid);

CREATE FUNCTION public.sponsor_portal_people(_eid uuid)
RETURNS TABLE(
  kind text, id uuid, name text, company text, designation text, ticket_type text,
  checked_in boolean, checked_in_at timestamptz, meeting_interest boolean,
  meeting_status text, interested_at timestamptz, scheduled_at timestamptz, location text,
  met_at timestamptz, status_reason text, note text, status_by_side text, status_changed_at timestamptz,
  status_cause text, ever_progressed boolean, outcome_at timestamptz,
  dispute_status text, dispute_reason text, dispute_requested_status text, disputed_at timestamptz,
  dispute_resolution text, dispute_note text, resolved_at timestamptz, event_over boolean
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
  ),
  over AS (SELECT public._event_over(_eid) AS v)
  SELECT 'speaker', sp.id, sp.name, sp.company, COALESCE(NULLIF(sp.designation, ''), sp.title), 'speaker',
         COALESCE(r.checked_in, false), r.checked_in_at,
         m.id IS NOT NULL, m.status, m.created_at, m.scheduled_at, m.location,
         m.met_at, m.status_reason, m.note, m.status_by_side, m.status_changed_at,
         m.status_cause, m.ever_progressed, m.outcome_at,
         m.dispute_status, m.dispute_reason, m.dispute_requested_status, m.disputed_at,
         m.dispute_resolution, m.dispute_note, m.resolved_at, (SELECT v FROM over)
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
         m.met_at, m.status_reason, m.note, m.status_by_side, m.status_changed_at,
         m.status_cause, m.ever_progressed, m.outcome_at,
         m.dispute_status, m.dispute_reason, m.dispute_requested_status, m.disputed_at,
         m.dispute_resolution, m.dispute_note, m.resolved_at, (SELECT v FROM over)
    FROM registrations r
    LEFT JOIN LATERAL (SELECT * FROM mine WHERE mine.registration_id = r.id ORDER BY mine.created_at LIMIT 1) m ON true
   WHERE r.event_id = _eid
     AND r.approval_status = 'approved'
     AND r.ticket_type <> 'speaker'
     AND EXISTS(SELECT 1 FROM allowed);
$$;
GRANT EXECUTE ON FUNCTION public.sponsor_portal_people(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.event_meeting_interests(uuid);

CREATE FUNCTION public.event_meeting_interests(_eid uuid)
RETURNS TABLE (
  registration_id uuid, speaker_id uuid, speaker_email text, sponsor_id uuid, sponsor_name text, created_at timestamptz,
  status text, scheduled_at timestamptz, location text, met_at timestamptz, status_reason text, note text,
  status_by_side text, status_changed_at timestamptz,
  status_cause text, ever_progressed boolean, outcome_at timestamptz,
  dispute_status text, dispute_reason text, dispute_requested_status text, disputed_at timestamptz,
  dispute_resolution text, dispute_note text, resolved_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT smi.registration_id, smi.speaker_id, lower(NULLIF(sp.email, '')), smi.sponsor_id, s.name, smi.created_at,
         smi.status, smi.scheduled_at, smi.location, smi.met_at, smi.status_reason, smi.note,
         smi.status_by_side, smi.status_changed_at,
         smi.status_cause, smi.ever_progressed, smi.outcome_at,
         smi.dispute_status, smi.dispute_reason, smi.dispute_requested_status, smi.disputed_at,
         smi.dispute_resolution, smi.dispute_note, smi.resolved_at
    FROM sponsor_meeting_interests smi
    JOIN sponsors s ON s.id = smi.sponsor_id
    LEFT JOIN speakers sp ON sp.id = smi.speaker_id
   WHERE smi.event_id = _eid
     AND public._can_view_event_registrations(_eid)
   ORDER BY s.name, smi.created_at;
$$;
REVOKE ALL ON FUNCTION public.event_meeting_interests(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.event_meeting_interests(uuid) TO authenticated;

-- ── 9. The organiser's meetings report for one sponsor ───────────────────────
DROP FUNCTION IF EXISTS public.sponsor_meeting_report(uuid, uuid);

CREATE FUNCTION public.sponsor_meeting_report(_eid uuid, _sponsor_id uuid)
RETURNS TABLE (
  kind text, name text, email text, company text, designation text,
  status text, status_cause text, status_reason text, interested_at timestamptz,
  scheduled_at timestamptz, location text, met_at timestamptz,
  checked_in boolean, checked_in_at timestamptz, status_by_side text,
  dispute_status text, dispute_reason text, dispute_resolution text, dispute_note text,
  history jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $
#variable_conflict use_column
BEGIN
  IF NOT public._can_view_event_registrations(_eid) THEN
    RAISE EXCEPTION 'Only the event organisers can download this report.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT CASE WHEN smi.speaker_id IS NOT NULL THEN 'speaker' ELSE 'attendee' END,
           coalesce(r.name, sp.name), coalesce(r.email, sp.email), coalesce(r.company, sp.company),
           coalesce(r.designation, NULLIF(sp.designation, ''), sp.title),
           smi.status, smi.status_cause, smi.status_reason, smi.created_at,
           smi.scheduled_at, smi.location, smi.met_at,
           coalesce(r.checked_in, sr.checked_in, false), coalesce(r.checked_in_at, sr.checked_in_at),
           smi.status_by_side,
           smi.dispute_status, smi.dispute_reason, smi.dispute_resolution, smi.dispute_note,
           coalesce((SELECT jsonb_agg(jsonb_build_object(
                       'at', me.created_at, 'action', me.action, 'from', me.from_status, 'to', me.to_status,
                       'side', me.side, 'reason', me.reason, 'cause', me.cause) ORDER BY me.created_at, me.id)
                       FROM meeting_events me
                      WHERE me.event_id = _eid AND me.sponsor_id = _sponsor_id
                        AND (me.registration_id = smi.registration_id OR me.speaker_id = smi.speaker_id)), '[]'::jsonb)
      FROM sponsor_meeting_interests smi
      LEFT JOIN registrations r ON r.id = smi.registration_id
      LEFT JOIN speakers sp ON sp.id = smi.speaker_id
      LEFT JOIN LATERAL (
        SELECT x.checked_in, x.checked_in_at FROM registrations x
         WHERE sp.id IS NOT NULL AND x.event_id = _eid AND x.ticket_type = 'speaker'
           AND lower(x.email) = lower(coalesce(sp.email, ''))
         LIMIT 1
      ) sr ON true
     WHERE smi.event_id = _eid AND smi.sponsor_id = _sponsor_id
     ORDER BY coalesce(r.name, sp.name);
END;
$$;
REVOKE ALL ON FUNCTION public.sponsor_meeting_report(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sponsor_meeting_report(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
