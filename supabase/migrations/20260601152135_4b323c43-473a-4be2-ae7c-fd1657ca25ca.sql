-- Persist all PersonFieldsForm fields from the signup metadata onto the
-- new profile, and pre-mark profile_completed when the required set is
-- present so users skip the "Complete your profile" page.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _meta jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  _account_type text;
  _title text;
  _first_name text;
  _last_name text;
  _designation text;
  _company text;
  _mobile_country_code text;
  _mobile_number text;
  _linkedin_url text;
  _company_website text;
  _company_employee_count text;
  _industry text;
  _display_name text;
  _completed boolean;
BEGIN
  _account_type := COALESCE(_meta->>'account_type', 'attendee');
  IF _account_type NOT IN ('attendee', 'organizer') THEN
    _account_type := 'attendee';
  END IF;

  _title                  := NULLIF(trim(_meta->>'title'), '');
  _first_name             := NULLIF(trim(_meta->>'first_name'), '');
  _last_name              := NULLIF(trim(_meta->>'last_name'), '');
  _designation            := NULLIF(trim(_meta->>'designation'), '');
  _company                := NULLIF(trim(_meta->>'company'), '');
  _mobile_country_code    := NULLIF(trim(_meta->>'mobile_country_code'), '');
  _mobile_number          := NULLIF(trim(_meta->>'mobile_number'), '');
  _linkedin_url           := NULLIF(trim(_meta->>'linkedin_url'), '');
  _company_website        := NULLIF(trim(_meta->>'company_website'), '');
  _company_employee_count := NULLIF(trim(_meta->>'company_employee_count'), '');
  _industry               := NULLIF(trim(_meta->>'industry'), '');

  _display_name := NULLIF(trim(COALESCE(_first_name, '') || ' ' || COALESCE(_last_name, '')), '');
  IF _display_name IS NULL THEN
    _display_name := COALESCE(_meta->>'display_name', NEW.email);
  END IF;

  _completed := _first_name IS NOT NULL
            AND _last_name IS NOT NULL
            AND _designation IS NOT NULL
            AND _company IS NOT NULL
            AND _mobile_number IS NOT NULL;

  INSERT INTO public.profiles (
    user_id, display_name, account_type,
    title, first_name, last_name, designation, company,
    mobile_country_code, mobile_number, linkedin_url,
    company_website, company_employee_count, industry,
    profile_completed
  )
  VALUES (
    NEW.id, _display_name, _account_type,
    _title, _first_name, _last_name, _designation, _company,
    _mobile_country_code, _mobile_number, _linkedin_url,
    _company_website, _company_employee_count, _industry,
    _completed
  );
  RETURN NEW;
END;
$$;