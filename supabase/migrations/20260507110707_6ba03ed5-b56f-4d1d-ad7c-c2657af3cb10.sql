
ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS join_token text,
  ADD COLUMN IF NOT EXISTS active_session_id text,
  ADD COLUMN IF NOT EXISTS active_session_started_at timestamptz;

UPDATE public.registrations
SET join_token = replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','')
WHERE join_token IS NULL;

ALTER TABLE public.registrations
  ALTER COLUMN join_token SET NOT NULL,
  ALTER COLUMN join_token SET DEFAULT (replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''));

CREATE UNIQUE INDEX IF NOT EXISTS registrations_join_token_idx ON public.registrations(join_token);

CREATE OR REPLACE FUNCTION public.claim_join_session(_join_token text, _session_id text)
RETURNS TABLE(registration_id uuid, event_id uuid, user_id uuid, name text, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _reg public.registrations;
BEGIN
  SELECT * INTO _reg FROM public.registrations WHERE join_token = _join_token;
  IF _reg.id IS NULL THEN
    RAISE EXCEPTION 'Invalid join link';
  END IF;
  IF _reg.user_id IS NOT NULL AND _reg.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'This join link belongs to another account';
  END IF;
  UPDATE public.registrations
     SET active_session_id = _session_id,
         active_session_started_at = now(),
         user_id = COALESCE(user_id, auth.uid())
   WHERE id = _reg.id;
  RETURN QUERY SELECT _reg.id, _reg.event_id, COALESCE(_reg.user_id, auth.uid()), _reg.name, _reg.email;
END;
$$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.registrations;
