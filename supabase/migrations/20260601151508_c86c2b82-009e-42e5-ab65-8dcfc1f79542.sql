-- Profiles was missing several fields that the UI already collects.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS mobile_country_code text,
  ADD COLUMN IF NOT EXISTS company_website text,
  ADD COLUMN IF NOT EXISTS company_employee_count text,
  ADD COLUMN IF NOT EXISTS industry text;

-- Sync profile updates into the user's future registrations so the three
-- surfaces (profile, registrations, signup) stay in lockstep.
CREATE OR REPLACE FUNCTION public.sync_profile_to_registrations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.registrations r
  SET
    title = COALESCE(NEW.title, r.title),
    first_name = COALESCE(NEW.first_name, r.first_name),
    last_name = COALESCE(NEW.last_name, r.last_name),
    name = COALESCE(
      NULLIF(TRIM(COALESCE(NEW.first_name, '') || ' ' || COALESCE(NEW.last_name, '')), ''),
      r.name
    ),
    designation = COALESCE(NEW.designation, r.designation),
    company = COALESCE(NEW.company, r.company),
    mobile_country_code = COALESCE(NEW.mobile_country_code, r.mobile_country_code),
    mobile_number = COALESCE(NEW.mobile_number, r.mobile_number),
    linkedin_url = COALESCE(NEW.linkedin_url, r.linkedin_url),
    company_website = COALESCE(NEW.company_website, r.company_website),
    company_employee_count = COALESCE(NEW.company_employee_count, r.company_employee_count),
    industry = COALESCE(NEW.industry, r.industry),
    updated_at = now()
  FROM public.events e
  WHERE r.user_id = NEW.user_id
    AND r.event_id = e.id
    AND COALESCE(e.end_date, e.date) >= now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_sync_to_registrations ON public.profiles;
CREATE TRIGGER profiles_sync_to_registrations
AFTER UPDATE OF
  title, first_name, last_name, designation, company,
  mobile_country_code, mobile_number, linkedin_url,
  company_website, company_employee_count, industry
ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_to_registrations();