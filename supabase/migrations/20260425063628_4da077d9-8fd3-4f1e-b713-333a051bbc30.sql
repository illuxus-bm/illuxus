-- Ensure pgcrypto is available in the extensions schema
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.registrations_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  _requires_approval boolean;
  _price numeric;
BEGIN
  SELECT requires_approval, COALESCE(price, 0)
    INTO _requires_approval, _price
  FROM public.events
  WHERE id = NEW.event_id;

  IF _price > 0 THEN
    NEW.approval_status := 'approved';
  ELSIF _requires_approval IS TRUE AND TG_OP = 'INSERT' THEN
    NEW.approval_status := 'pending';
  END IF;

  IF NEW.approval_status NOT IN ('pending','approved','waitlisted','declined') THEN
    RAISE EXCEPTION 'Invalid approval_status: %', NEW.approval_status;
  END IF;

  IF NEW.qr_code IS NULL THEN
    -- Use replace(gen_random_uuid()::text,'-','') as a portable fallback;
    -- pgcrypto's gen_random_bytes is also available now.
    NEW.qr_code := replace(gen_random_uuid()::text, '-', '') ||
                   replace(gen_random_uuid()::text, '-', '');
    NEW.qr_code := substring(NEW.qr_code from 1 for 24);
  END IF;

  RETURN NEW;
END;
$function$;

-- Make sure the trigger exists (re-create idempotently)
DROP TRIGGER IF EXISTS registrations_validate_trg ON public.registrations;
CREATE TRIGGER registrations_validate_trg
BEFORE INSERT OR UPDATE ON public.registrations
FOR EACH ROW
EXECUTE FUNCTION public.registrations_validate();