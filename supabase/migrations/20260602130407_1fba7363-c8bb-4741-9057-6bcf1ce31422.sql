
-- 1. Realtime publication for attendance_events (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'attendance_events'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_events';
  END IF;
END $$;

-- 2. Audit-log every check-in / check-out via attendance_events AFTER INSERT
CREATE OR REPLACE FUNCTION public._attendance_audit_after_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _email text;
  _reg public.registrations%ROWTYPE;
  _action text;
BEGIN
  SELECT * INTO _reg FROM public.registrations WHERE id = NEW.registration_id;
  SELECT email INTO _email FROM auth.users WHERE id = NEW.actor_id;

  _action := CASE NEW.kind
    WHEN 'in'  THEN 'attendance.check_in'
    WHEN 'out' THEN 'attendance.check_out'
    WHEN 'auto_out' THEN 'attendance.auto_check_out'
    ELSE 'attendance.' || NEW.kind
  END;

  INSERT INTO public.audit_logs(actor_id, actor_email, action, target_type, target_id, details)
  VALUES (
    NEW.actor_id, _email, _action, 'registration', NEW.registration_id::text,
    jsonb_build_object(
      'event_id', NEW.event_id,
      'method', NEW.method,
      'occurred_at', NEW.occurred_at,
      'kind', NEW.kind,
      'registration_name', _reg.name,
      'registration_email', _reg.email,
      'ticket_type', _reg.ticket_type
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'attendance audit insert failed: % %', SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attendance_events_audit_insert ON public.attendance_events;
CREATE TRIGGER attendance_events_audit_insert
AFTER INSERT ON public.attendance_events
FOR EACH ROW EXECUTE FUNCTION public._attendance_audit_after_insert();

-- 3. Fix undo_attendance: return deleted flag + log undo action
DROP FUNCTION IF EXISTS public.undo_attendance(uuid, text);
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

  IF _target_id IS NULL THEN
    RETURN QUERY SELECT false, r.attendance_state, r.total_minutes;
    RETURN;
  END IF;

  DELETE FROM public.attendance_events WHERE id = _target_id;

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
      'registration_name', r.name,
      'registration_email', r.email
    )
  );

  SELECT * INTO r FROM public.registrations WHERE id = p_registration_id;
  RETURN QUERY SELECT true, r.attendance_state, r.total_minutes;
END;
$$;
GRANT EXECUTE ON FUNCTION public.undo_attendance(uuid, text) TO authenticated;

-- 4. Harden _attendance_after_delete to surface errors via RAISE LOG
CREATE OR REPLACE FUNCTION public._attendance_after_delete()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public._attendance_recompute(OLD.registration_id);
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'attendance recompute (delete) failed for reg %: % %',
    OLD.registration_id, SQLERRM, SQLSTATE;
  RAISE;
END;
$$;

-- 5. Event-scoped audit reader (no widening of audit_logs RLS)
CREATE OR REPLACE FUNCTION public.event_attendance_audit(_event_id uuid, _limit int DEFAULT 200)
RETURNS TABLE(
  id uuid,
  actor_email text,
  action text,
  target_id text,
  details jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (is_event_owner(auth.uid(), _event_id) OR has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
    SELECT al.id, al.actor_email, al.action, al.target_id, al.details, al.created_at
      FROM public.audit_logs al
     WHERE al.action LIKE 'attendance.%'
       AND (al.details->>'event_id')::uuid = _event_id
     ORDER BY al.created_at DESC
     LIMIT LEAST(GREATEST(COALESCE(_limit, 200), 1), 1000);
END;
$$;
GRANT EXECUTE ON FUNCTION public.event_attendance_audit(uuid, int) TO authenticated;

-- 6. Per-registration audit reader (used by row history)
CREATE OR REPLACE FUNCTION public.registration_attendance_audit(_registration_id uuid, _limit int DEFAULT 50)
RETURNS TABLE(
  id uuid,
  actor_email text,
  action text,
  details jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _event_id uuid;
BEGIN
  SELECT event_id INTO _event_id FROM public.registrations WHERE id = _registration_id;
  IF _event_id IS NULL THEN RAISE EXCEPTION 'Registration not found'; END IF;

  IF NOT (
    is_event_owner(auth.uid(), _event_id)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.registrations WHERE id = _registration_id AND user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
    SELECT al.id, al.actor_email, al.action, al.details, al.created_at
      FROM public.audit_logs al
     WHERE al.action LIKE 'attendance.%'
       AND al.target_id = _registration_id::text
     ORDER BY al.created_at DESC
     LIMIT LEAST(GREATEST(COALESCE(_limit, 50), 1), 500);
END;
$$;
GRANT EXECUTE ON FUNCTION public.registration_attendance_audit(uuid, int) TO authenticated;

-- 7. Diagnostics: list every registration + reason it can or can't be checked in
CREATE OR REPLACE FUNCTION public.attendance_diagnostics(_event_id uuid)
RETURNS TABLE(
  id uuid,
  name text,
  email text,
  ticket_type text,
  attendance_state text,
  last_event_at timestamptz,
  can_check_in boolean,
  blocked_reason text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (is_event_owner(auth.uid(), _event_id) OR has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
    WITH last_evt AS (
      SELECT registration_id, MAX(occurred_at) AS last_at
        FROM public.attendance_events
       WHERE event_id = _event_id
       GROUP BY registration_id
    )
    SELECT
      r.id, r.name, r.email, r.ticket_type, r.attendance_state,
      le.last_at,
      CASE
        WHEN public.event_tracking_closed(r.event_id) THEN false
        WHEN r.status = 'cancelled' THEN false
        WHEN r.approval_status <> 'approved' THEN false
        ELSE true
      END AS can_check_in,
      CASE
        WHEN public.event_tracking_closed(r.event_id) THEN 'tracking_closed'
        WHEN r.status = 'cancelled' THEN 'cancelled'
        WHEN r.approval_status <> 'approved' THEN 'not_approved'
        WHEN r.email IS NULL OR r.email = '' THEN 'missing_email'
        WHEN r.email LIKE '%@no-email.local' THEN 'synthetic_email'
        ELSE 'ok'
      END AS blocked_reason
    FROM public.registrations r
    LEFT JOIN last_evt le ON le.registration_id = r.id
    WHERE r.event_id = _event_id
    ORDER BY (CASE WHEN r.attendance_state = 'never' THEN 0 ELSE 1 END), r.name;
END;
$$;
GRANT EXECUTE ON FUNCTION public.attendance_diagnostics(uuid) TO authenticated;
