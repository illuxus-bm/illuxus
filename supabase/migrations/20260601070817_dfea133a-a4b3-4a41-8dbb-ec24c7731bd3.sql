-- Add standardized profile fields to people-storing tables

-- 1) registrations
ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS designation text,
  ADD COLUMN IF NOT EXISTS mobile_country_code text,
  ADD COLUMN IF NOT EXISTS mobile_number text,
  ADD COLUMN IF NOT EXISTS linkedin_url text,
  ADD COLUMN IF NOT EXISTS company_website text,
  ADD COLUMN IF NOT EXISTS company_employee_count text,
  ADD COLUMN IF NOT EXISTS industry text;

-- backfill first/last names from existing `name`
UPDATE public.registrations
SET first_name = COALESCE(first_name, split_part(name, ' ', 1)),
    last_name  = COALESCE(last_name, NULLIF(trim(substring(name from position(' ' in name) + 1)), ''))
WHERE name IS NOT NULL AND (first_name IS NULL OR last_name IS NULL);

-- 2) speakers — rename existing `title` (job title) to `designation`, add honorific `title`
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='speakers' AND column_name='title'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='speakers' AND column_name='designation'
  ) THEN
    EXECUTE 'ALTER TABLE public.speakers RENAME COLUMN title TO designation';
  END IF;
END $$;

ALTER TABLE public.speakers
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS designation text,
  ADD COLUMN IF NOT EXISTS mobile_country_code text,
  ADD COLUMN IF NOT EXISTS mobile_number text,
  ADD COLUMN IF NOT EXISTS linkedin_url text,
  ADD COLUMN IF NOT EXISTS company_website text,
  ADD COLUMN IF NOT EXISTS company_employee_count text,
  ADD COLUMN IF NOT EXISTS industry text;

UPDATE public.speakers
SET first_name = COALESCE(first_name, split_part(name, ' ', 1)),
    last_name  = COALESCE(last_name, NULLIF(trim(substring(name from position(' ' in name) + 1)), ''))
WHERE name IS NOT NULL AND (first_name IS NULL OR last_name IS NULL);

-- 3) sponsor_members
ALTER TABLE public.sponsor_members
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS designation text,
  ADD COLUMN IF NOT EXISTS company text,
  ADD COLUMN IF NOT EXISTS mobile_country_code text,
  ADD COLUMN IF NOT EXISTS mobile_number text,
  ADD COLUMN IF NOT EXISTS linkedin_url text,
  ADD COLUMN IF NOT EXISTS company_website text,
  ADD COLUMN IF NOT EXISTS company_employee_count text,
  ADD COLUMN IF NOT EXISTS industry text;

UPDATE public.sponsor_members
SET first_name = COALESCE(first_name, split_part(COALESCE(display_name,''), ' ', 1)),
    last_name  = COALESCE(last_name, NULLIF(trim(substring(COALESCE(display_name,'') from position(' ' in COALESCE(display_name,'')) + 1)), ''))
WHERE display_name IS NOT NULL AND (first_name IS NULL OR last_name IS NULL);

-- 4) Validation trigger for title value (allow null + the four allowed values)
CREATE OR REPLACE FUNCTION public._validate_person_title()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.title IS NOT NULL AND NEW.title NOT IN ('Mr','Ms','Mrs','Prefer not to say') THEN
    RAISE EXCEPTION 'Invalid title: %', NEW.title;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_title_registrations ON public.registrations;
CREATE TRIGGER validate_title_registrations
  BEFORE INSERT OR UPDATE ON public.registrations
  FOR EACH ROW EXECUTE FUNCTION public._validate_person_title();

DROP TRIGGER IF EXISTS validate_title_speakers ON public.speakers;
CREATE TRIGGER validate_title_speakers
  BEFORE INSERT OR UPDATE ON public.speakers
  FOR EACH ROW EXECUTE FUNCTION public._validate_person_title();

DROP TRIGGER IF EXISTS validate_title_sponsor_members ON public.sponsor_members;
CREATE TRIGGER validate_title_sponsor_members
  BEFORE INSERT OR UPDATE ON public.sponsor_members
  FOR EACH ROW EXECUTE FUNCTION public._validate_person_title();

-- 5) helpful index
CREATE INDEX IF NOT EXISTS idx_registrations_event_lastname
  ON public.registrations(event_id, last_name);
