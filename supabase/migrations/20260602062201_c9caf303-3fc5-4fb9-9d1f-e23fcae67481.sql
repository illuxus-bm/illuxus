CREATE OR REPLACE FUNCTION public.self_check_in(p_token text, p_event_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(status text, id uuid, event_id uuid, name text, email text, ticket_type text, checked_in_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r public.registrations%ROWTYPE;
  ev public.events%ROWTYPE;
  was_already boolean;
  effective_end timestamp with time zone;
  _kind text;
  _ref uuid;
  _name text;
  _email text;
  _company text;
  _ticket text;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) = 0 THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

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
      INSERT INTO public.registrations(event_id, name, email, company, ticket_type, status, approval_status, checked_in, checked_in_at, checked_in_method)
      VALUES (p_event_id, _name, COALESCE(_email, _name || '@no-email.local'), _company, _ticket, 'confirmed', 'approved', true, now(), 'self')
      RETURNING * INTO r;
      RETURN QUERY SELECT 'ok'::text, r.id, r.event_id, r.name, r.email, r.ticket_type, r.checked_in_at;
      RETURN;
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
    IF effective_end IS NOT NULL AND effective_end < (now() - interval '1 day') THEN
      RETURN QUERY SELECT 'expired'::text, r.id, r.event_id, r.name, r.email, r.ticket_type, r.checked_in_at;
      RETURN;
    END IF;
  END IF;

  IF r.status = 'cancelled' THEN
    RETURN QUERY SELECT 'cancelled'::text, r.id, r.event_id, r.name, r.email, r.ticket_type, r.checked_in_at;
    RETURN;
  END IF;

  was_already := COALESCE(r.checked_in, false);

  IF NOT was_already THEN
    UPDATE public.registrations reg
       SET checked_in = true,
           checked_in_at = now(),
           checked_in_method = 'self'
     WHERE reg.id = r.id
    RETURNING reg.* INTO r;
  END IF;

  RETURN QUERY SELECT
    CASE WHEN was_already THEN 'already' ELSE 'ok' END,
    r.id, r.event_id, r.name, r.email, r.ticket_type, r.checked_in_at;
END;
$function$;