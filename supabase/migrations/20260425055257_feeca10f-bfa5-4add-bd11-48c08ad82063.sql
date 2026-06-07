-- 1) Profile flag for 2FA
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS two_factor_enabled boolean NOT NULL DEFAULT false;

-- 2) Approval audit columns on registrations
ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS decline_reason text;

-- 3) Email settings (platform-level, super-admin only)
CREATE TABLE IF NOT EXISTS public.email_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true,
  domain_configured boolean NOT NULL DEFAULT false,
  send_ticket_emails boolean NOT NULL DEFAULT true,
  send_approval_emails boolean NOT NULL DEFAULT true,
  require_2fa_for_admins boolean NOT NULL DEFAULT false,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_settings_singleton_unique UNIQUE (singleton)
);

ALTER TABLE public.email_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read email settings" ON public.email_settings;
CREATE POLICY "Admins can read email settings"
  ON public.email_settings FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update email settings" ON public.email_settings;
CREATE POLICY "Admins can update email settings"
  ON public.email_settings FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can insert email settings" ON public.email_settings;
CREATE POLICY "Admins can insert email settings"
  ON public.email_settings FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'));

INSERT INTO public.email_settings (singleton)
VALUES (true)
ON CONFLICT (singleton) DO NOTHING;

-- 4) Strengthen the registrations validate trigger to enforce approval rules.
CREATE OR REPLACE FUNCTION public.registrations_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  _requires_approval boolean;
  _price numeric;
BEGIN
  SELECT requires_approval, COALESCE(price, 0)
    INTO _requires_approval, _price
  FROM public.events
  WHERE id = NEW.event_id;

  -- Paid events bypass approvals (per product rule)
  IF _price > 0 THEN
    NEW.approval_status := 'approved';
  ELSIF _requires_approval IS TRUE AND TG_OP = 'INSERT' THEN
    -- Free + approval-required => force pending on creation
    NEW.approval_status := 'pending';
  END IF;

  IF NEW.approval_status NOT IN ('pending','approved','waitlisted','declined') THEN
    RAISE EXCEPTION 'Invalid approval_status: %', NEW.approval_status;
  END IF;

  IF NEW.qr_code IS NULL THEN
    NEW.qr_code := encode(gen_random_bytes(12), 'hex');
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS registrations_validate_trg ON public.registrations;
CREATE TRIGGER registrations_validate_trg
  BEFORE INSERT OR UPDATE ON public.registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.registrations_validate();

-- 5) Bulk approval RPC
CREATE OR REPLACE FUNCTION public.bulk_set_registration_approval(
  _registration_ids uuid[],
  _new_status text,
  _decline_reason text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _affected integer := 0;
BEGIN
  IF _new_status NOT IN ('approved','declined','waitlisted','pending') THEN
    RAISE EXCEPTION 'Invalid status: %', _new_status;
  END IF;

  WITH allowed AS (
    SELECT r.id
    FROM public.registrations r
    JOIN public.events e ON e.id = r.event_id
    WHERE r.id = ANY(_registration_ids)
      AND (e.user_id = auth.uid() OR has_role(auth.uid(), 'admin'))
  )
  UPDATE public.registrations r
     SET approval_status = _new_status,
         approved_by     = CASE WHEN _new_status = 'approved' THEN auth.uid() ELSE r.approved_by END,
         approved_at     = CASE WHEN _new_status = 'approved' THEN now()       ELSE r.approved_at END,
         decline_reason  = CASE WHEN _new_status = 'declined' THEN _decline_reason ELSE NULL END,
         updated_at      = now()
   WHERE r.id IN (SELECT id FROM allowed);

  GET DIAGNOSTICS _affected = ROW_COUNT;

  PERFORM _record_audit(
    'registration.bulk_status',
    'registration',
    array_to_string(_registration_ids, ','),
    jsonb_build_object('status', _new_status, 'count', _affected)
  );

  RETURN _affected;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.bulk_set_registration_approval(uuid[], text, text) TO authenticated;

-- 6) Allow attendees to cancel their own registration via RPC (cleaner for UI)
CREATE OR REPLACE FUNCTION public.cancel_my_registration(_registration_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.registrations
   WHERE id = _registration_id
     AND user_id = auth.uid();
END;
$function$;

GRANT EXECUTE ON FUNCTION public.cancel_my_registration(uuid) TO authenticated;