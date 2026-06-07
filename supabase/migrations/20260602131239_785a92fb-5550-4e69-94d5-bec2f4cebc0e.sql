-- Make undo_attendance also clear "stuck" legacy state when no matching
-- attendance_events row exists. Some registrations were checked in via
-- direct UPDATE (checked_in=true) before attendance_events existed, so the
-- previous undo found nothing to delete and left the row stuck as 'inside'.

CREATE OR REPLACE FUNCTION public.undo_attendance(
  p_registration_id uuid,
  p_kind text
)
RETURNS TABLE(deleted boolean, state text, total_minutes int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r public.registrations%ROWTYPE;
  _allowed boolean := false;
  _target_id uuid;
  _target_occurred timestamptz;
  _email text;
  _had_event boolean := false;
  _legacy_cleared boolean := false;
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
    SELECT id, occurred_at INTO _target_id, _target_occurred
      FROM public.attendance_events
      WHERE registration_id = p_registration_id AND kind = 'in'
      ORDER BY occurred_at DESC LIMIT 1;
  ELSE
    SELECT id, occurred_at INTO _target_id, _target_occurred
      FROM public.attendance_events
      WHERE registration_id = p_registration_id AND kind IN ('out','auto_out')
      ORDER BY occurred_at DESC LIMIT 1;
  END IF;

  _had_event := _target_id IS NOT NULL;

  IF _had_event THEN
    DELETE FROM public.attendance_events WHERE id = _target_id;
  ELSE
    -- Legacy / stuck state with no event rows. Fix the registration directly.
    IF p_kind = 'in' AND r.attendance_state IN ('inside','outside') THEN
      UPDATE public.registrations
         SET attendance_state = 'never',
             checked_in = false,
             checked_in_at = NULL,
             last_in_at = NULL,
             last_out_at = NULL,
             total_minutes = 0,
             active_session_id = NULL,
             active_session_started_at = NULL,
             updated_at = now()
       WHERE id = p_registration_id;
      _legacy_cleared := true;
    ELSIF p_kind = 'out' AND r.attendance_state = 'outside' THEN
      -- Move back to 'inside' if a last_in_at exists, else clear entirely.
      IF r.last_in_at IS NOT NULL THEN
        UPDATE public.registrations
           SET attendance_state = 'inside',
               checked_in = true,
               last_out_at = NULL,
               updated_at = now()
         WHERE id = p_registration_id;
      ELSE
        UPDATE public.registrations
           SET attendance_state = 'never',
               checked_in = false,
               last_out_at = NULL,
               updated_at = now()
         WHERE id = p_registration_id;
      END IF;
      _legacy_cleared := true;
    END IF;

    IF NOT _legacy_cleared THEN
      RETURN QUERY SELECT false, r.attendance_state, r.total_minutes;
      RETURN;
    END IF;
  END IF;

  -- Audit log entry
  SELECT email INTO _email FROM auth.users WHERE id = auth.uid();
  INSERT INTO public.audit_logs(actor_id, actor_email, action, target_type, target_id, details)
  VALUES (
    auth.uid(), _email,
    CASE p_kind WHEN 'in' THEN 'attendance.undo_in' ELSE 'attendance.undo_out' END,
    'registration', p_registration_id::text,
    jsonb_build_object(
      'event_id', r.event_id,
      'removed_event_id', _target_id,
      'removed_occurred_at', _target_occurred,
      'legacy_cleared', _legacy_cleared,
      'registration_name', r.name,
      'registration_email', r.email
    )
  );

  SELECT * INTO r FROM public.registrations WHERE id = p_registration_id;
  RETURN QUERY SELECT true, r.attendance_state, r.total_minutes;
END;
$$;

GRANT EXECUTE ON FUNCTION public.undo_attendance(uuid, text) TO authenticated;