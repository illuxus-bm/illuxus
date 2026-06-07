ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS checked_in_method text;

DROP FUNCTION IF EXISTS public.self_check_in(text, uuid);

CREATE OR REPLACE FUNCTION public.self_check_in(p_token text, p_event_id uuid DEFAULT NULL)
RETURNS TABLE(
  status text,
  id uuid,
  event_id uuid,
  name text,
  email text,
  ticket_type text,
  checked_in_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r public.registrations%ROWTYPE;
  ev public.events%ROWTYPE;
  was_already boolean;
  effective_end timestamp with time zone;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) = 0 THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT * INTO r FROM public.registrations
   WHERE qr_code = p_token OR join_token = p_token OR id::text = p_token
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  IF p_event_id IS NOT NULL AND r.event_id <> p_event_id THEN
    RETURN QUERY SELECT 'wrong_event'::text, r.id, r.event_id, r.name, r.email, r.ticket_type, r.checked_in_at;
    RETURN;
  END IF;

  SELECT * INTO ev FROM public.events WHERE id = r.event_id;
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
    UPDATE public.registrations
       SET checked_in = true,
           checked_in_at = now(),
           checked_in_method = 'self'
     WHERE id = r.id
    RETURNING * INTO r;
  END IF;

  RETURN QUERY SELECT
    CASE WHEN was_already THEN 'already' ELSE 'ok' END,
    r.id, r.event_id, r.name, r.email, r.ticket_type, r.checked_in_at;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.self_check_in(text, uuid) TO anon, authenticated;

ALTER TABLE public.registrations REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'registrations'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.registrations';
  END IF;
END $$;