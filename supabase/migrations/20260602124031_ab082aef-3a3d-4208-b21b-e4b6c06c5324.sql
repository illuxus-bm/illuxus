
-- Attendance tracking system: check-in / check-out log + derived state on registrations.

-- 1) Derived columns on registrations
ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS attendance_state text NOT NULL DEFAULT 'never',
  ADD COLUMN IF NOT EXISTS last_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_out_at timestamptz,
  ADD COLUMN IF NOT EXISTS total_minutes integer NOT NULL DEFAULT 0;

-- Backfill: anyone already checked in is considered 'inside' at time of migration
UPDATE public.registrations
   SET attendance_state = 'inside',
       last_in_at = COALESCE(last_in_at, checked_in_at)
 WHERE checked_in = true
   AND attendance_state = 'never';

-- 2) Attendance log table
CREATE TABLE IF NOT EXISTS public.attendance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL,
  event_id uuid NOT NULL,
  event_day date,
  kind text NOT NULL CHECK (kind IN ('in','out','auto_out')),
  method text NOT NULL DEFAULT 'manual',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attendance_events_reg ON public.attendance_events(registration_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_attendance_events_event ON public.attendance_events(event_id, occurred_at);

GRANT SELECT ON public.attendance_events TO authenticated;
GRANT ALL ON public.attendance_events TO service_role;

ALTER TABLE public.attendance_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Event owners read attendance events"
ON public.attendance_events
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = attendance_events.event_id
      AND (e.user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  )
);

CREATE POLICY "Attendees read own attendance"
ON public.attendance_events
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.registrations r
    WHERE r.id = attendance_events.registration_id
      AND r.user_id = auth.uid()
  )
);

-- 3) Helper: tracking closed = now() > end + 2h
CREATE OR REPLACE FUNCTION public.event_tracking_closed(_event_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT now() > (COALESCE(e.end_date, e.date) + interval '2 hours')
  FROM public.events e WHERE e.id = _event_id;
$$;

-- 4) Trigger: maintain derived columns on registrations from attendance_events
CREATE OR REPLACE FUNCTION public._attendance_after_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _state text;
  _last_in timestamptz;
  _last_out timestamptz;
  _minutes integer;
  _first_in timestamptz;
BEGIN
  SELECT MAX(occurred_at) FILTER (WHERE kind = 'in') INTO _last_in
    FROM public.attendance_events WHERE registration_id = NEW.registration_id;
  SELECT MAX(occurred_at) FILTER (WHERE kind IN ('out','auto_out')) INTO _last_out
    FROM public.attendance_events WHERE registration_id = NEW.registration_id;
  SELECT MIN(occurred_at) FILTER (WHERE kind = 'in') INTO _first_in
    FROM public.attendance_events WHERE registration_id = NEW.registration_id;

  IF _last_in IS NULL THEN
    _state := 'never';
  ELSIF _last_out IS NULL OR _last_in > _last_out THEN
    _state := 'inside';
  ELSE
    _state := 'outside';
  END IF;

  -- Sum completed in→out spans (paired in chronological order)
  WITH ordered AS (
    SELECT occurred_at, kind,
           ROW_NUMBER() OVER (ORDER BY occurred_at) AS rn
    FROM public.attendance_events
    WHERE registration_id = NEW.registration_id
  ),
  pairs AS (
    SELECT
      a.occurred_at AS in_at,
      (SELECT MIN(b.occurred_at) FROM ordered b
        WHERE b.rn > a.rn AND b.kind IN ('out','auto_out')) AS out_at
    FROM ordered a WHERE a.kind = 'in'
  )
  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (out_at - in_at)) / 60)::int, 0)
    INTO _minutes
    FROM pairs WHERE out_at IS NOT NULL;

  UPDATE public.registrations
     SET attendance_state = _state,
         last_in_at = _last_in,
         last_out_at = _last_out,
         total_minutes = COALESCE(_minutes, 0),
         checked_in = (_state <> 'never'),
         checked_in_at = COALESCE(checked_in_at, _first_in),
         checked_in_method = COALESCE(checked_in_method, NEW.method),
         updated_at = now()
   WHERE id = NEW.registration_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attendance_events_after_insert ON public.attendance_events;
CREATE TRIGGER attendance_events_after_insert
AFTER INSERT ON public.attendance_events
FOR EACH ROW EXECUTE FUNCTION public._attendance_after_insert();

-- 5) toggle_attendance: in if outside, out if inside
CREATE OR REPLACE FUNCTION public.toggle_attendance(
  p_registration_id uuid,
  p_method text DEFAULT 'manual'
)
RETURNS TABLE(state text, event_id uuid, occurred_at timestamptz, total_minutes int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r public.registrations%ROWTYPE;
  _allowed boolean := false;
  _new_kind text;
  _ts timestamptz := now();
  _day date;
BEGIN
  SELECT * INTO r FROM public.registrations WHERE id = p_registration_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registration not found'; END IF;

  IF has_role(auth.uid(), 'admin'::app_role)
     OR is_event_owner(auth.uid(), r.event_id)
     OR r.user_id = auth.uid() THEN
    _allowed := true;
  END IF;
  IF NOT _allowed THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  IF public.event_tracking_closed(r.event_id) THEN
    RETURN QUERY SELECT 'tracking_closed'::text, r.event_id, _ts, r.total_minutes;
    RETURN;
  END IF;

  _new_kind := CASE WHEN r.attendance_state = 'inside' THEN 'out' ELSE 'in' END;
  _day := (_ts AT TIME ZONE COALESCE((SELECT timezone FROM public.events WHERE id = r.event_id), 'UTC'))::date;

  INSERT INTO public.attendance_events(registration_id, event_id, event_day, kind, method, actor_id, occurred_at)
  VALUES (r.id, r.event_id, _day, _new_kind, COALESCE(p_method,'manual'), auth.uid(), _ts);

  SELECT * INTO r FROM public.registrations WHERE id = p_registration_id;
  RETURN QUERY SELECT r.attendance_state, r.event_id, _ts, r.total_minutes;
END;
$$;

-- 6) bulk_set_attendance
CREATE OR REPLACE FUNCTION public.bulk_set_attendance(
  p_ids uuid[],
  p_target_state text,
  p_method text DEFAULT 'bulk'
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _id uuid;
  _count int := 0;
  r public.registrations%ROWTYPE;
  _new_kind text;
  _day date;
  _ts timestamptz := now();
BEGIN
  IF p_target_state NOT IN ('inside','outside') THEN
    RAISE EXCEPTION 'Invalid target state: %', p_target_state;
  END IF;

  FOREACH _id IN ARRAY p_ids LOOP
    SELECT * INTO r FROM public.registrations WHERE id = _id;
    CONTINUE WHEN NOT FOUND;
    CONTINUE WHEN NOT (has_role(auth.uid(),'admin'::app_role) OR is_event_owner(auth.uid(), r.event_id));
    CONTINUE WHEN public.event_tracking_closed(r.event_id);
    CONTINUE WHEN r.attendance_state = p_target_state;

    _new_kind := CASE WHEN p_target_state = 'inside' THEN 'in' ELSE 'out' END;
    _day := (_ts AT TIME ZONE COALESCE((SELECT timezone FROM public.events WHERE id = r.event_id), 'UTC'))::date;

    INSERT INTO public.attendance_events(registration_id, event_id, event_day, kind, method, actor_id, occurred_at)
    VALUES (r.id, r.event_id, _day, _new_kind, COALESCE(p_method,'bulk'), auth.uid(), _ts);

    _count := _count + 1;
  END LOOP;

  RETURN _count;
END;
$$;

-- 7) attendance_auto_close: stamp auto_out for everyone still 'inside' after event end + 2h
CREATE OR REPLACE FUNCTION public.attendance_auto_close()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _count int := 0;
  rec record;
  _cutoff timestamptz;
BEGIN
  FOR rec IN
    SELECT r.id AS registration_id, r.event_id,
           (COALESCE(e.end_date, e.date) + interval '2 hours') AS cutoff,
           e.timezone
    FROM public.registrations r
    JOIN public.events e ON e.id = r.event_id
    WHERE r.attendance_state = 'inside'
      AND now() > (COALESCE(e.end_date, e.date) + interval '2 hours')
  LOOP
    _cutoff := LEAST(rec.cutoff, now());
    INSERT INTO public.attendance_events(registration_id, event_id, event_day, kind, method, occurred_at)
    VALUES (rec.registration_id, rec.event_id,
            (_cutoff AT TIME ZONE COALESCE(rec.timezone,'UTC'))::date,
            'auto_out', 'system', _cutoff);
    _count := _count + 1;
  END LOOP;
  RETURN _count;
END;
$$;

-- 8) Rewrite self_check_in: log to attendance_events, preserve role, allow toggle in/out
CREATE OR REPLACE FUNCTION public.self_check_in(p_token text, p_event_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(status text, id uuid, event_id uuid, name text, email text, ticket_type text, checked_in_at timestamp with time zone)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r public.registrations%ROWTYPE;
  ev public.events%ROWTYPE;
  was_inside boolean;
  effective_end timestamptz;
  _kind text;
  _ref uuid;
  _name text;
  _email text;
  _company text;
  _ticket text;
  _ts timestamptz := now();
  _day date;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) = 0 THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  -- Resolve target registration (speaker/sponsor virtual tokens or attendee tokens)
  IF p_token LIKE 'speaker:%' OR p_token LIKE 'sponsor_contact:%' THEN
    IF p_event_id IS NULL THEN
      RETURN QUERY SELECT 'wrong_event'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::timestamptz;
      RETURN;
    END IF;
    _kind := split_part(p_token, ':', 1);
    BEGIN
      _ref := split_part(p_token, ':', 2)::uuid;
    EXCEPTION WHEN others THEN
      RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::timestamptz;
      RETURN;
    END;

    IF _kind = 'speaker' THEN
      SELECT sp.name, sp.email, sp.company, 'speaker'
        INTO _name, _email, _company, _ticket
      FROM public.speakers sp
      JOIN public.event_speakers es ON es.speaker_id = sp.id AND es.event_id = p_event_id
      WHERE sp.id = _ref;
    ELSE
      SELECT sm.display_name, sm.email, sp.name, 'sponsor'
        INTO _name, _email, _company, _ticket
      FROM public.sponsor_members sm
      JOIN public.sponsors sp ON sp.id = sm.sponsor_id
      JOIN public.event_sponsors es ON es.sponsor_id = sp.id AND es.event_id = p_event_id
      WHERE sm.id = _ref;
    END IF;

    IF _name IS NULL THEN
      RETURN QUERY SELECT 'not_found'::text, NULL::uuid, p_event_id, NULL::text, NULL::text, NULL::text, NULL::timestamptz;
      RETURN;
    END IF;

    SELECT reg.* INTO r
    FROM public.registrations reg
    WHERE reg.event_id = p_event_id
      AND reg.ticket_type = _ticket
      AND lower(reg.email) = lower(COALESCE(_email,''))
    LIMIT 1;

    IF NOT FOUND THEN
      INSERT INTO public.registrations(event_id, name, email, company, ticket_type, status, approval_status)
      VALUES (p_event_id, _name, COALESCE(_email, _name || '@no-email.local'), _company, _ticket, 'confirmed', 'approved')
      RETURNING * INTO r;
    END IF;
  ELSE
    SELECT reg.* INTO r FROM public.registrations reg
     WHERE reg.qr_code = p_token OR reg.join_token = p_token OR reg.id::text = p_token
     LIMIT 1;

    IF NOT FOUND THEN
      RETURN QUERY SELECT 'not_found'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::timestamptz;
      RETURN;
    END IF;
  END IF;

  IF p_event_id IS NOT NULL AND r.event_id <> p_event_id THEN
    RETURN QUERY SELECT 'wrong_event'::text, r.id, r.event_id, r.name, r.email, r.ticket_type, r.checked_in_at;
    RETURN;
  END IF;

  SELECT e.* INTO ev FROM public.events e WHERE e.id = r.event_id;
  IF FOUND THEN
    effective_end := COALESCE(ev.end_date, ev.date);
    IF effective_end IS NOT NULL AND now() > effective_end + interval '2 hours' THEN
      RETURN QUERY SELECT 'expired'::text, r.id, r.event_id, r.name, r.email, r.ticket_type, r.checked_in_at;
      RETURN;
    END IF;
  END IF;

  IF r.status = 'cancelled' THEN
    RETURN QUERY SELECT 'cancelled'::text, r.id, r.event_id, r.name, r.email, r.ticket_type, r.checked_in_at;
    RETURN;
  END IF;

  was_inside := (r.attendance_state = 'inside');
  _day := (_ts AT TIME ZONE COALESCE(ev.timezone, 'UTC'))::date;

  IF was_inside THEN
    -- Toggle to out (self-checkout)
    INSERT INTO public.attendance_events(registration_id, event_id, event_day, kind, method, occurred_at)
    VALUES (r.id, r.event_id, _day, 'out', 'self', _ts);
    SELECT * INTO r FROM public.registrations WHERE id = r.id;
    RETURN QUERY SELECT 'checked_out'::text, r.id, r.event_id, r.name, r.email, r.ticket_type, r.last_out_at;
  ELSE
    INSERT INTO public.attendance_events(registration_id, event_id, event_day, kind, method, occurred_at)
    VALUES (r.id, r.event_id, _day, 'in', 'self', _ts);
    SELECT * INTO r FROM public.registrations WHERE id = r.id;
    RETURN QUERY SELECT 'ok'::text, r.id, r.event_id, r.name, r.email, r.ticket_type, r.last_in_at;
  END IF;
END;
$$;
