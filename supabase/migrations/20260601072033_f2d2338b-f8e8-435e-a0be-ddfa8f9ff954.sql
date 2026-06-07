
-- Custom sponsor tier label
ALTER TABLE public.sponsors ADD COLUMN IF NOT EXISTS tier_label text;

-- Audit RPC for registrant actions
CREATE OR REPLACE FUNCTION public.log_registrant_action(
  _action text,
  _registration_id uuid,
  _details jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _event_id uuid;
  _allowed boolean := false;
BEGIN
  IF _action IS NULL OR length(trim(_action)) = 0 THEN
    RAISE EXCEPTION 'Action required';
  END IF;

  -- Try to find event from registration; fall back to details payload
  SELECT event_id INTO _event_id FROM public.registrations WHERE id = _registration_id;
  IF _event_id IS NULL THEN
    BEGIN
      _event_id := (_details->>'event_id')::uuid;
    EXCEPTION WHEN others THEN
      _event_id := NULL;
    END;
  END IF;

  IF has_role(auth.uid(), 'admin'::app_role) THEN
    _allowed := true;
  ELSIF _event_id IS NOT NULL AND is_event_owner(auth.uid(), _event_id) THEN
    _allowed := true;
  END IF;

  IF NOT _allowed THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  PERFORM _record_audit(
    'registration.' || _action,
    'registration',
    COALESCE(_registration_id::text, ''),
    COALESCE(_details, '{}'::jsonb) || jsonb_build_object('event_id', _event_id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_registrant_action(text, uuid, jsonb) TO authenticated;
