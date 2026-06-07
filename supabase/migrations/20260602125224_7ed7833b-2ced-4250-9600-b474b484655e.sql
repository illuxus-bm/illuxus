
-- Recompute helper extracted from insert trigger, also used after DELETE
CREATE OR REPLACE FUNCTION public._attendance_recompute(_reg_id uuid)
RETURNS void
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
    FROM public.attendance_events WHERE registration_id = _reg_id;
  SELECT MAX(occurred_at) FILTER (WHERE kind IN ('out','auto_out')) INTO _last_out
    FROM public.attendance_events WHERE registration_id = _reg_id;
  SELECT MIN(occurred_at) FILTER (WHERE kind = 'in') INTO _first_in
    FROM public.attendance_events WHERE registration_id = _reg_id;

  IF _last_in IS NULL THEN
    _state := 'never';
  ELSIF _last_out IS NULL OR _last_in > _last_out THEN
    _state := 'inside';
  ELSE
    _state := 'outside';
  END IF;

  WITH ordered AS (
    SELECT occurred_at, kind,
           ROW_NUMBER() OVER (ORDER BY occurred_at) AS rn
    FROM public.attendance_events
    WHERE registration_id = _reg_id
  ),
  pairs AS (
    SELECT a.occurred_at AS in_at,
      (SELECT MIN(b.occurred_at) FROM ordered b
        WHERE b.rn > a.rn AND b.kind IN ('out','auto_out')) AS out_at
    FROM ordered a WHERE a.kind = 'in'
  )
  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (out_at - in_at)) / 60)::int, 0)
    INTO _minutes FROM pairs WHERE out_at IS NOT NULL;

  UPDATE public.registrations
     SET attendance_state = _state,
         last_in_at = _last_in,
         last_out_at = _last_out,
         total_minutes = COALESCE(_minutes, 0),
         checked_in = (_state <> 'never'),
         checked_in_at = CASE WHEN _first_in IS NULL THEN NULL ELSE _first_in END,
         updated_at = now()
   WHERE id = _reg_id;
END;
$$;

-- After-delete trigger to recompute
CREATE OR REPLACE FUNCTION public._attendance_after_delete()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public._attendance_recompute(OLD.registration_id);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS attendance_events_after_delete ON public.attendance_events;
CREATE TRIGGER attendance_events_after_delete
AFTER DELETE ON public.attendance_events
FOR EACH ROW EXECUTE FUNCTION public._attendance_after_delete();

-- Undo last in/out for a registration (admin/owner/self)
CREATE OR REPLACE FUNCTION public.undo_attendance(
  p_registration_id uuid,
  p_kind text -- 'in' or 'out'
)
RETURNS TABLE(state text, total_minutes int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r public.registrations%ROWTYPE;
  _allowed boolean := false;
  _target_id uuid;
BEGIN
  IF p_kind NOT IN ('in','out') THEN
    RAISE EXCEPTION 'Invalid kind: %', p_kind;
  END IF;

  SELECT * INTO r FROM public.registrations WHERE id = p_registration_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registration not found'; END IF;

  IF has_role(auth.uid(), 'admin'::app_role)
     OR is_event_owner(auth.uid(), r.event_id)
     OR r.user_id = auth.uid() THEN
    _allowed := true;
  END IF;
  IF NOT _allowed THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  IF p_kind = 'in' THEN
    SELECT id INTO _target_id FROM public.attendance_events
      WHERE registration_id = p_registration_id AND kind = 'in'
      ORDER BY occurred_at DESC LIMIT 1;
  ELSE
    SELECT id INTO _target_id FROM public.attendance_events
      WHERE registration_id = p_registration_id AND kind IN ('out','auto_out')
      ORDER BY occurred_at DESC LIMIT 1;
  END IF;

  IF _target_id IS NULL THEN
    RETURN QUERY SELECT r.attendance_state, r.total_minutes;
    RETURN;
  END IF;

  DELETE FROM public.attendance_events WHERE id = _target_id;

  SELECT * INTO r FROM public.registrations WHERE id = p_registration_id;
  RETURN QUERY SELECT r.attendance_state, r.total_minutes;
END;
$$;

GRANT EXECUTE ON FUNCTION public.undo_attendance(uuid, text) TO authenticated;
