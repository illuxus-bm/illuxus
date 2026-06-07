
CREATE OR REPLACE FUNCTION public.self_check_in(p_token text)
RETURNS TABLE (
  id uuid,
  event_id uuid,
  name text,
  email text,
  ticket_type text,
  already_checked_in boolean,
  checked_in_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.registrations%ROWTYPE;
  was_already boolean;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) = 0 THEN
    RAISE EXCEPTION 'Missing token';
  END IF;

  SELECT * INTO r FROM public.registrations
   WHERE qr_code = p_token
      OR join_token = p_token
      OR id::text = p_token
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;

  IF r.status = 'cancelled' THEN
    RAISE EXCEPTION 'Registration cancelled';
  END IF;

  was_already := COALESCE(r.checked_in, false);

  IF NOT was_already THEN
    UPDATE public.registrations
       SET checked_in = true,
           checked_in_at = now()
     WHERE id = r.id
    RETURNING * INTO r;
  END IF;

  RETURN QUERY SELECT r.id, r.event_id, r.name, r.email, r.ticket_type,
                      was_already, r.checked_in_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.self_check_in(text) TO anon, authenticated;
