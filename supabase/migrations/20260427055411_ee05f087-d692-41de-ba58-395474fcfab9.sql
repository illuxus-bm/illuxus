
-- 1. Extend profiles with required onboarding fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS designation text,
  ADD COLUMN IF NOT EXISTS company text,
  ADD COLUMN IF NOT EXISTS mobile_number text,
  ADD COLUMN IF NOT EXISTS mobile_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS linkedin_url text,
  ADD COLUMN IF NOT EXISTS city_id uuid,
  ADD COLUMN IF NOT EXISTS profile_completed boolean NOT NULL DEFAULT false;

-- 2. Global cities directory
CREATE TABLE IF NOT EXISTS public.cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  geoname_id integer UNIQUE,
  name text NOT NULL,
  ascii_name text NOT NULL,
  region text,                  -- admin1 name (e.g. "Maharashtra")
  region_code text,             -- admin1 code
  country text NOT NULL,        -- full country name (e.g. "India")
  country_code text NOT NULL,   -- ISO-2 (e.g. "IN")
  population integer NOT NULL DEFAULT 0,
  latitude double precision,
  longitude double precision,
  timezone text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Fast prefix + trigram search
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS cities_name_trgm_idx
  ON public.cities USING gin (lower(ascii_name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS cities_population_idx
  ON public.cities (population DESC);
CREATE INDEX IF NOT EXISTS cities_country_code_idx
  ON public.cities (country_code);

ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read cities" ON public.cities;
CREATE POLICY "Anyone can read cities"
  ON public.cities FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins manage cities" ON public.cities;
CREATE POLICY "Admins manage cities"
  ON public.cities FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 3. Email OTP codes table for profile email verification
CREATE TABLE IF NOT EXISTS public.email_otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text NOT NULL,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_otp_codes_user_idx
  ON public.email_otp_codes (user_id, created_at DESC);

ALTER TABLE public.email_otp_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own otp codes" ON public.email_otp_codes;
CREATE POLICY "Users manage own otp codes"
  ON public.email_otp_codes FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 4. Search RPC: returns top matches "Mumbai, Maharashtra, India"-style
CREATE OR REPLACE FUNCTION public.search_cities(_q text, _limit integer DEFAULT 10)
RETURNS TABLE (
  id uuid,
  name text,
  region text,
  country text,
  country_code text,
  label text,
  population integer
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    c.id,
    c.name,
    c.region,
    c.country,
    c.country_code,
    (c.name
      || COALESCE(', ' || NULLIF(c.region, ''), '')
      || ', ' || c.country) AS label,
    c.population
  FROM public.cities c
  WHERE _q IS NOT NULL
    AND length(trim(_q)) >= 1
    AND lower(c.ascii_name) LIKE lower(trim(_q)) || '%'
  ORDER BY c.population DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 10), 1), 50);
$$;

GRANT EXECUTE ON FUNCTION public.search_cities(text, integer) TO anon, authenticated;
