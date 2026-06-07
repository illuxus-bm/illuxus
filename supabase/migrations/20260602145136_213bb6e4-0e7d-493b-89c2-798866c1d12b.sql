CREATE OR REPLACE FUNCTION public.registration_attendance_audit(_registration_id uuid, _limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, actor_email text, action text, details jsonb, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _event_id uuid;
BEGIN
  SELECT r.event_id INTO _event_id FROM public.registrations r WHERE r.id = _registration_id;
  IF _event_id IS NULL THEN RAISE EXCEPTION 'Registration not found'; END IF;

  IF NOT (
    is_event_owner(auth.uid(), _event_id)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.registrations r WHERE r.id = _registration_id AND r.user_id = auth.uid())
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
$function$;

CREATE OR REPLACE FUNCTION public.claim_join_session(_join_token text, _session_id text)
 RETURNS TABLE(registration_id uuid, event_id uuid, user_id uuid, name text, email text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _reg public.registrations;
BEGIN
  SELECT * INTO _reg FROM public.registrations r WHERE r.join_token = _join_token;
  IF _reg.id IS NULL THEN
    RAISE EXCEPTION 'Invalid join link';
  END IF;
  IF _reg.user_id IS NOT NULL AND _reg.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'This join link belongs to another account';
  END IF;
  UPDATE public.registrations r
     SET active_session_id = _session_id,
         active_session_started_at = now(),
         user_id = COALESCE(r.user_id, auth.uid())
   WHERE r.id = _reg.id;
  RETURN QUERY SELECT _reg.id, _reg.event_id, COALESCE(_reg.user_id, auth.uid()), _reg.name, _reg.email;
END;
$function$;