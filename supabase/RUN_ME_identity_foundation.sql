-- ═══════════════════════════════════════════════════════════════════════════════
-- Unified identity and company records (foundation).
--
-- Until now a person existed only as copies: a profile (if they had an
-- account), a registration row per event, a speakers row per organiser, a
-- sponsor_members row per sponsor — each with its own name, company and
-- phone, joined up only by matching email text. This adds one record per
-- person and per company, and links the existing rows to them. Nothing is
-- dropped, renamed or rewritten; every existing column keeps working.
--
--   people                 one per person; account (user_id) optional, unique
--   person_emails          one person per address; verified_at = ownership proven
--   person_phones          numbers as +<country><number>; shared numbers allowed
--   person_links           LinkedIn and other profile URLs
--   companies              master company records (provisional until verified)
--   company_aliases / company_domains / company_identifiers / company_locations
--   company_source_records data from licensed providers, per provider
--   person_company_affiliations
--   identity_match_candidates  possible duplicates for review — never merged
--                              automatically
--   registrations / speakers / sponsor_members .person_id
--
-- Rules the functions below enforce:
--   • A person is linked to an account only through an address Supabase
--     Auth has verified (claim_person_for_verified_email). Typing an
--     address proves nothing.
--   • Registration stays open without an account; a registration gets a
--     person_id by its email and never changes that person's name, profile
--     or other details.
--   • Registrations are linked to a company only on reliable evidence — a
--     website or work-email domain on record, or the exact name of a
--     verified company — and never create one.
--   • Possible duplicates (same phone, same LinkedIn, same name at the same
--     company) are queued in identity_match_candidates. Nothing merges
--     people.
--   • Clients cannot read or write these tables; they use the functions,
--     which show only what the caller's events already let them see.
--
-- Matching rules mirror src/lib/intelligence/normalization.ts; the shared
-- cases in src/lib/intelligence/__tests__/vectors.ts are checked against
-- both.
--
-- Run RUN_ME_signup_email_verification.sql (058) first.
-- Safe to run more than once. Paste into the Supabase SQL Editor and Run.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ── 1. Normalisation (same rules as normalization.ts) ─────────────────────────

-- NFKC, zero-width characters removed, whitespace collapsed and trimmed.
CREATE OR REPLACE FUNCTION public.norm_text(_raw text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
  SELECT btrim(regexp_replace(
           regexp_replace(normalize(COALESCE(_raw, ''), NFKC), '[​-‍﻿]', '', 'g'),
           '\s+', ' ', 'g'));
$$;

-- Lower case, accents removed.
CREATE OR REPLACE FUNCTION public.fold_text(_raw text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
  SELECT lower(regexp_replace(normalize(public.norm_text(_raw), NFKD),
                              '[̀-ͯ᪰-᫿᷀-᷿⃐-⃿︠-︯]', '', 'g'));
$$;

-- Address as typed apart from case and outer whitespace; null if implausible.
CREATE OR REPLACE FUNCTION public.norm_email(_raw text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
  SELECT CASE
           WHEN e ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' AND e !~ '\.\.' AND length(e) <= 254 THEN e
         END
    FROM (SELECT lower(public.norm_text(_raw)) AS e) s;
$$;

CREATE OR REPLACE FUNCTION public.email_domain(_raw text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
  SELECT NULLIF(split_part(public.norm_email(_raw), '@', 2), '');
$$;

-- Countries the app offers (src/lib/phone-country.ts).
CREATE TABLE IF NOT EXISTS public.dial_codes (
  iso  text PRIMARY KEY,
  dial text NOT NULL
);
INSERT INTO public.dial_codes (iso, dial) VALUES
    ('IN', '+91'),
    ('US', '+1'),
    ('GB', '+44'),
    ('AE', '+971'),
    ('SG', '+65'),
    ('AU', '+61'),
    ('CA', '+1'),
    ('DE', '+49'),
    ('FR', '+33'),
    ('ES', '+34'),
    ('IT', '+39'),
    ('NL', '+31'),
    ('CH', '+41'),
    ('SE', '+46'),
    ('NO', '+47'),
    ('DK', '+45'),
    ('IE', '+353'),
    ('JP', '+81'),
    ('KR', '+82'),
    ('CN', '+86'),
    ('HK', '+852'),
    ('MY', '+60'),
    ('ID', '+62'),
    ('PH', '+63'),
    ('TH', '+66'),
    ('VN', '+84'),
    ('BD', '+880'),
    ('PK', '+92'),
    ('LK', '+94'),
    ('NP', '+977'),
    ('SA', '+966'),
    ('QA', '+974'),
    ('KW', '+965'),
    ('BH', '+973'),
    ('OM', '+968'),
    ('EG', '+20'),
    ('ZA', '+27'),
    ('NG', '+234'),
    ('KE', '+254'),
    ('BR', '+55'),
    ('MX', '+52'),
    ('AR', '+54'),
    ('CL', '+56'),
    ('CO', '+57'),
    ('NZ', '+64'),
    ('TR', '+90'),
    ('RU', '+7'),
    ('PL', '+48'),
    ('PT', '+351'),
    ('BE', '+32'),
    ('AT', '+43'),
    ('FI', '+358'),
    ('GR', '+30'),
    ('IL', '+972')
ON CONFLICT (iso) DO UPDATE SET dial = EXCLUDED.dial;
ALTER TABLE public.dial_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dial_codes FROM anon, authenticated;

-- "+91", "91", "0091", "IN" → "+91".
CREATE OR REPLACE FUNCTION public.norm_country_code(_raw text)
RETURNS text LANGUAGE plpgsql STABLE PARALLEL SAFE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _t      text := upper(public.norm_text(_raw));
  _dial   text;
  _rest   text;
  _digits text;
BEGIN
  IF _t = '' THEN RETURN NULL; END IF;
  SELECT d.dial INTO _dial FROM public.dial_codes d WHERE d.iso = _t;
  IF _dial IS NOT NULL THEN RETURN _dial; END IF;
  _rest := regexp_replace(_t, '^00', '');
  IF _rest ~ '[^0-9+\s()-]' THEN RETURN NULL; END IF;
  _digits := regexp_replace(_rest, '[^0-9]', '', 'g');
  IF _digits !~ '^[0-9]{1,4}$' THEN RETURN NULL; END IF;
  RETURN '+' || _digits;
END;
$$;

-- Phone as +<country><number>; null when it can't be read (normalizePhone).
CREATE OR REPLACE FUNCTION public.norm_phone(_country_code text, _number text)
RETURNS text LANGUAGE plpgsql STABLE PARALLEL SAFE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _raw    text := public.norm_text(_number);
  _no_ext text;
  _digits text;
  _cc     text;
  _given  text;
  _best   text;
BEGIN
  IF _raw = '' THEN RETURN NULL; END IF;
  _no_ext := regexp_replace(_raw, '\s*(ext|x)\.?\s*[0-9]+$', '', 'i');
  IF _no_ext ~* '[a-z]' THEN RETURN NULL; END IF;
  _digits := regexp_replace(_no_ext, '[\s().-]', '', 'g');

  IF _digits ~ '^(\+|00)' THEN
    -- The number carries its own country code.
    _digits := regexp_replace(_digits, '^(\+|00)', '');
    IF _digits !~ '^[0-9]+$' THEN RETURN NULL; END IF;
    _given := public.norm_country_code(_country_code);
    SELECT x.p INTO _best
      FROM (SELECT substr(d.dial, 2) AS p FROM public.dial_codes d
            UNION SELECT substr(_given, 2) WHERE _given IS NOT NULL) x
     WHERE _digits LIKE x.p || '%'
     ORDER BY length(x.p) DESC
     LIMIT 1;
    IF _best IS NULL THEN RETURN NULL; END IF;
    _cc := '+' || _best;
    _digits := substr(_digits, length(_best) + 1);
  ELSE
    IF _digits !~ '^[0-9]+$' THEN RETURN NULL; END IF;
    _cc := public.norm_country_code(_country_code);
    IF _cc IS NULL THEN RETURN NULL; END IF;
    _digits := regexp_replace(_digits, '^0+', '');           -- national trunk 0
    IF length(_digits) > 10 AND _digits LIKE substr(_cc, 2) || '%' THEN
      _digits := substr(_digits, length(_cc));               -- code typed twice
    END IF;
  END IF;

  IF length(_digits) < 6 OR length(_cc) - 1 + length(_digits) > 15 THEN RETURN NULL; END IF;
  RETURN _cc || _digits;
END;
$$;

-- Personal-name key: accents, punctuation and leading titles removed.
CREATE OR REPLACE FUNCTION public.person_name_key(_raw text)
RETURNS text LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
DECLARE
  _w text[];
BEGIN
  _w := regexp_split_to_array(
          btrim(regexp_replace(
            regexp_replace(public.fold_text(_raw), '[''’`]', '', 'g'),
            '[!-/:-@\[-`{-~ -¿‐-‧‰-⁞\s]+', ' ', 'g')),
          ' ');
  IF _w IS NULL OR _w = ARRAY[''] THEN RETURN ''; END IF;
  WHILE array_length(_w, 1) > 1 AND _w[1] ~ '^(mr|mrs|ms|miss|mx|dr|prof|sir|shri|smt|er|adv|ca)$' LOOP
    _w := _w[2:];
  END LOOP;
  RETURN array_to_string(_w, ' ');
END;
$$;

-- Company-name key, for finding candidates only (companyNameKey).
CREATE OR REPLACE FUNCTION public.company_name_key(_raw text)
RETURNS text LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
DECLARE
  _k        text;
  _s        text;
  _stripped boolean := true;
  _suffixes text[] := ARRAY['private limited','incorporated','corporation','limited','company','pvt ltd',
                            'sarl','gmbh','pvt','ltd','llp','llc','inc','corp','plc','pte','pty','srl','spa',
                            'co','ag','sa','bv','nv','oy','ab','as','kk'];
BEGIN
  _k := btrim(regexp_replace(
          regexp_replace(replace(public.fold_text(_raw), '&', ' and '), '[.''’`]', '', 'g'),
          '[!-/:-@\[-`{-~ -¿‐-‧‰-⁞\s]+', ' ', 'g'));
  WHILE _stripped LOOP
    _stripped := false;
    FOREACH _s IN ARRAY _suffixes LOOP
      IF right(_k, length(_s) + 1) = ' ' || _s AND length(_k) > length(_s) + 1 THEN
        _k := btrim(left(_k, length(_k) - length(_s) - 1));
        _stripped := true;
        EXIT;
      END IF;
    END LOOP;
  END LOOP;
  RETURN regexp_replace(_k, '^the ', '');
END;
$$;

-- Website → domain key with "www." removed; null for anything else (normalizeWebsite).
CREATE OR REPLACE FUNCTION public.norm_website_domain(_raw text)
RETURNS text LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
DECLARE
  _t    text := public.norm_text(_raw);
  _host text;
BEGIN
  IF _t = '' OR _t ~ '\s' THEN RETURN NULL; END IF;
  IF _t ~* '^[a-z][a-z0-9+.-]*://' AND _t !~* '^https?://' THEN RETURN NULL; END IF;
  _host := lower(substring(regexp_replace(_t, '^https?://', '', 'i') FROM '^([^/?#:]+)'));
  _host := regexp_replace(regexp_replace(_host, '^www\.', ''), '\.$', '');
  IF _host !~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$' OR _host ~ '^[0-9]+(\.[0-9]+){3}$' THEN RETURN NULL; END IF;
  RETURN _host;
END;
$$;

-- The handle of a LinkedIn profile URL, lower-cased; null otherwise.
CREATE OR REPLACE FUNCTION public.linkedin_key(_raw text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
  SELECT NULLIF(lower(substring(public.norm_text(_raw)
                FROM '^(?:https?://)?(?:[a-z]+\.)?linkedin\.com/(?:in|pub)/([^/?#]+)')), '');
$$;

-- Mail providers whose domain says nothing about a company.
CREATE TABLE IF NOT EXISTS public.personal_email_domains (domain text PRIMARY KEY);
INSERT INTO public.personal_email_domains (domain) VALUES
  ('gmail.com'),('googlemail.com'),('yahoo.com'),('yahoo.co.in'),('yahoo.co.uk'),('outlook.com'),('hotmail.com'),
  ('live.com'),('msn.com'),('icloud.com'),('me.com'),('mac.com'),('aol.com'),('proton.me'),('protonmail.com'),
  ('rediffmail.com'),('zoho.com'),('zohomail.in'),('yandex.com'),('gmx.com'),('mail.com')
ON CONFLICT DO NOTHING;
ALTER TABLE public.personal_email_domains ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.personal_email_domains FROM anon, authenticated;


-- ── 2. People ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.people (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The account this person signs in with, once proven; one person per account.
  user_id       uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  display_name  text,
  name_key      text NOT NULL DEFAULT '',
  created_via   text NOT NULL DEFAULT 'unknown'
                CHECK (created_via IN ('signup','registration','speaker','sponsor_contact','import','manual','backfill','unknown')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS people_name_key_idx ON public.people (name_key) WHERE name_key <> '';

CREATE TABLE IF NOT EXISTS public.person_emails (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id    uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  email        text NOT NULL,                       -- as entered
  email_key    text NOT NULL UNIQUE,                -- one person per address
  verified_at  timestamptz,                         -- ownership proven by Supabase Auth
  source       text NOT NULL DEFAULT 'unknown',
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS person_emails_person_idx ON public.person_emails (person_id);

CREATE TABLE IF NOT EXISTS public.person_phones (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id    uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  country_code text,
  number       text NOT NULL,                       -- as entered
  phone_e164   text NOT NULL,
  verified_at  timestamptz,
  source       text NOT NULL DEFAULT 'unknown',
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (person_id, phone_e164)
);
CREATE INDEX IF NOT EXISTS person_phones_e164_idx ON public.person_phones (phone_e164);

CREATE TABLE IF NOT EXISTS public.person_links (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id  uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('linkedin','website','other')),
  url        text NOT NULL,
  url_key    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (person_id, kind, url_key)
);
CREATE INDEX IF NOT EXISTS person_links_key_idx ON public.person_links (kind, url_key);


-- ── 3. Companies ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.companies (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL,
  name_key             text NOT NULL,
  legal_name           text,
  description          text,
  website              text,
  industry             text,
  sub_industry         text,
  employee_range       text,
  revenue_range        text,
  hq_city              text,
  hq_country           text,
  technologies         jsonb NOT NULL DEFAULT '[]'::jsonb,
  parent_company_id    uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  corporate_group      text,
  verification_status  text NOT NULL DEFAULT 'provisional'
                       CHECK (verification_status IN ('provisional','verified','rejected')),
  source               text NOT NULL DEFAULT 'user_entered',
  last_enriched_at     timestamptz,
  created_by           uuid,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (parent_company_id IS DISTINCT FROM id)
);
CREATE INDEX IF NOT EXISTS companies_name_key_idx ON public.companies (name_key);

CREATE TABLE IF NOT EXISTS public.company_aliases (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  alias      text NOT NULL,
  alias_key  text NOT NULL,
  kind       text NOT NULL DEFAULT 'alternate' CHECK (kind IN ('trading','former','alternate','abbreviation')),
  UNIQUE (company_id, alias_key)
);
CREATE INDEX IF NOT EXISTS company_aliases_key_idx ON public.company_aliases (alias_key);

-- A domain belongs to one company; email and website domains alike.
CREATE TABLE IF NOT EXISTS public.company_domains (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  domain     text NOT NULL UNIQUE,
  kind       text NOT NULL DEFAULT 'website' CHECK (kind IN ('website','email','both')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Registry identifiers: India CIN and GSTIN, LEI, DUNS, VAT, …
CREATE TABLE IF NOT EXISTS public.company_identifiers (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  scheme     text NOT NULL CHECK (scheme IN ('CIN','GSTIN','LEI','DUNS','VAT','EIN','CRN','OTHER')),
  value      text NOT NULL,
  verified   boolean NOT NULL DEFAULT false,
  UNIQUE (scheme, value)
);

CREATE TABLE IF NOT EXISTS public.company_locations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  kind       text NOT NULL DEFAULT 'office' CHECK (kind IN ('hq','office','plant','other')),
  city       text,
  region     text,
  country    text
);
CREATE INDEX IF NOT EXISTS company_locations_company_idx ON public.company_locations (company_id);

-- What a licensed data provider said, kept per provider and never mixed into
-- the master record without a decision. No provider is assumed.
CREATE TABLE IF NOT EXISTS public.company_source_records (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  provider    text NOT NULL,
  external_id text NOT NULL,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  licence     text,                                -- terms the data was obtained under
  fetched_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, external_id)
);

CREATE TABLE IF NOT EXISTS public.person_company_affiliations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id       uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  designation     text,
  designation_key text NOT NULL DEFAULT '',
  is_current      boolean NOT NULL DEFAULT true,
  started_on      date,
  ended_on        date,
  source          text NOT NULL DEFAULT 'unknown',
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (person_id, company_id, designation_key)
);


-- ── 4. Possible duplicates, for review ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.identity_match_candidates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_a     uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  person_b     uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  reasons      text[] NOT NULL,
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open','same_person','different_people')),
  reviewed_by  uuid,
  reviewed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (person_a < person_b),
  UNIQUE (person_a, person_b)
);


-- ── 5. Links from the existing tables ────────────────────────────────────────

ALTER TABLE public.registrations   ADD COLUMN IF NOT EXISTS person_id  uuid REFERENCES public.people(id) ON DELETE SET NULL;
ALTER TABLE public.registrations   ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.speakers        ADD COLUMN IF NOT EXISTS person_id  uuid REFERENCES public.people(id) ON DELETE SET NULL;
ALTER TABLE public.sponsor_members ADD COLUMN IF NOT EXISTS person_id  uuid REFERENCES public.people(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS registrations_person_idx   ON public.registrations (person_id);
CREATE INDEX IF NOT EXISTS speakers_person_idx        ON public.speakers (person_id);
CREATE INDEX IF NOT EXISTS sponsor_members_person_idx ON public.sponsor_members (person_id);


-- ── 6. No direct client access ────────────────────────────────────────────────

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['people','person_emails','person_phones','person_links','companies','company_aliases',
                           'company_domains','company_identifiers','company_locations','company_source_records',
                           'person_company_affiliations','identity_match_candidates'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', t);
  END LOOP;
END $$;


-- ── 7. Resolving a person ─────────────────────────────────────────────────────

-- Queues a possible duplicate pair for review (idempotent; reasons accumulate).
CREATE OR REPLACE FUNCTION public._queue_identity_candidate(_a uuid, _b uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _a IS NULL OR _b IS NULL OR _a = _b THEN RETURN; END IF;
  INSERT INTO identity_match_candidates (person_a, person_b, reasons)
  VALUES (LEAST(_a, _b), GREATEST(_a, _b), ARRAY[_reason])
  ON CONFLICT (person_a, person_b) DO UPDATE
    SET reasons = ARRAY(SELECT DISTINCT x FROM unnest(identity_match_candidates.reasons || EXCLUDED.reasons) x ORDER BY x);
END;
$$;

/*
 * The person behind an email address, created if there is none. Adds a
 * phone, LinkedIn URL or company link the person doesn't have yet; never
 * changes their name or anything already recorded. Concurrent calls for
 * the same address wait for each other, so one address is one person.
 * Possible duplicates found on the way are queued, not merged.
 */
CREATE OR REPLACE FUNCTION public.ensure_contact_person(
  _email        text,
  _name         text DEFAULT NULL,
  _phone_cc     text DEFAULT NULL,
  _phone        text DEFAULT NULL,
  _linkedin     text DEFAULT NULL,
  _company      text DEFAULT NULL,
  _company_id   uuid DEFAULT NULL,
  _designation  text DEFAULT NULL,
  _source       text DEFAULT 'unknown'
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _key      text := public.norm_email(_email);
  _person   uuid;
  _created  boolean := false;
  _e164     text := public.norm_phone(_phone_cc, _phone);
  _li       text := public.linkedin_key(_linkedin);
  _other    uuid;
BEGIN
  IF _key IS NULL THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('person_email:' || _key, 0));

  SELECT person_id INTO _person FROM person_emails WHERE email_key = _key;
  IF _person IS NULL THEN
    INSERT INTO people (display_name, name_key, created_via)
    VALUES (NULLIF(public.norm_text(_name), ''), public.person_name_key(_name),
            CASE WHEN _source IN ('signup','registration','speaker','sponsor_contact','import','manual','backfill')
                 THEN _source ELSE 'unknown' END)
    RETURNING id INTO _person;
    INSERT INTO person_emails (person_id, email, email_key, source)
    VALUES (_person, public.norm_text(_email), _key, _source);
    _created := true;
  END IF;

  IF _e164 IS NOT NULL THEN
    INSERT INTO person_phones (person_id, country_code, number, phone_e164, source)
    VALUES (_person, NULLIF(public.norm_text(_phone_cc), ''), public.norm_text(_phone), _e164, _source)
    ON CONFLICT (person_id, phone_e164) DO NOTHING;
    FOR _other IN SELECT DISTINCT pp.person_id FROM person_phones pp WHERE pp.phone_e164 = _e164 AND pp.person_id <> _person LOOP
      PERFORM public._queue_identity_candidate(_person, _other, 'phone');
    END LOOP;
  END IF;

  IF _li IS NOT NULL THEN
    INSERT INTO person_links (person_id, kind, url, url_key)
    VALUES (_person, 'linkedin', public.norm_text(_linkedin), _li)
    ON CONFLICT (person_id, kind, url_key) DO NOTHING;
    FOR _other IN SELECT DISTINCT pl.person_id FROM person_links pl
                   WHERE pl.kind = 'linkedin' AND pl.url_key = _li AND pl.person_id <> _person LOOP
      PERFORM public._queue_identity_candidate(_person, _other, 'linkedin');
    END LOOP;
  END IF;

  IF _company_id IS NOT NULL THEN
    INSERT INTO person_company_affiliations (person_id, company_id, designation, designation_key, source)
    VALUES (_person, _company_id, NULLIF(public.norm_text(_designation), ''), lower(public.norm_text(_designation)), _source)
    ON CONFLICT (person_id, company_id, designation_key) DO NOTHING;
  END IF;

  -- A new contact with the same name at the same company as someone else.
  IF _created AND public.person_name_key(_name) <> '' AND public.company_name_key(_company) <> '' THEN
    FOR _other IN
      SELECT DISTINCT p.id
        FROM people p
        JOIN registrations r ON r.person_id = p.id
       WHERE p.id <> _person
         AND p.name_key = public.person_name_key(_name)
         AND public.company_name_key(r.company) = public.company_name_key(_company)
       LIMIT 20
    LOOP
      PERFORM public._queue_identity_candidate(_person, _other, 'name_company');
    END LOOP;
  END IF;

  RETURN _person;
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_contact_person(text, text, text, text, text, text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_contact_person(text, text, text, text, text, text, uuid, text, text) TO service_role;

/*
 * Supabase Auth has verified that this account owns this address: the
 * person behind the address becomes this account's person, and the
 * address is marked proven. If that person already belongs to another
 * account, nothing is linked and the conflict is logged.
 */
CREATE OR REPLACE FUNCTION public.claim_person_for_verified_email(_user_id uuid, _email text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _key     text := public.norm_email(_email);
  _person  uuid;
  _mine    uuid;
  _owner   uuid;
  _name    text;
BEGIN
  IF _user_id IS NULL OR _key IS NULL THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('person_email:' || _key, 0));

  SELECT id INTO _mine FROM people WHERE user_id = _user_id;
  SELECT person_id INTO _person FROM person_emails WHERE email_key = _key;

  IF _person IS NULL THEN
    -- An address nobody had: it goes on the account's person.
    IF _mine IS NULL THEN
      SELECT NULLIF(btrim(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')), '')
        INTO _name FROM profiles WHERE user_id = _user_id;
      INSERT INTO people (user_id, display_name, name_key, created_via)
      VALUES (_user_id, _name, public.person_name_key(_name), 'signup')
      RETURNING id INTO _mine;
    END IF;
    INSERT INTO person_emails (person_id, email, email_key, verified_at, source)
    VALUES (_mine, public.norm_text(_email), _key, now(), 'auth');
    RETURN _mine;
  END IF;

  SELECT user_id INTO _owner FROM people WHERE id = _person;
  IF _owner IS NOT NULL AND _owner <> _user_id THEN
    INSERT INTO audit_logs (actor_id, action, target_type, target_id, details)
    VALUES (_user_id, 'identity.claim_conflict', 'person', _person::text,
            jsonb_build_object('email_key', _key, 'linked_account', _owner));
    RETURN NULL;
  END IF;

  IF _mine IS NOT NULL AND _mine <> _person THEN
    -- The account already has a person and this address has another: the
    -- address is proven, and the two records wait for review.
    UPDATE person_emails SET verified_at = COALESCE(verified_at, now()) WHERE email_key = _key;
    PERFORM public._queue_identity_candidate(_mine, _person, 'verified_email_same_account');
    RETURN _mine;
  END IF;

  IF _owner IS NULL THEN
    UPDATE people SET user_id = _user_id, updated_at = now() WHERE id = _person;
    INSERT INTO audit_logs (actor_id, action, target_type, target_id, details)
    VALUES (_user_id, 'identity.linked_account', 'person', _person::text, jsonb_build_object('email_key', _key));
  END IF;
  UPDATE person_emails SET verified_at = COALESCE(verified_at, now()) WHERE email_key = _key;
  RETURN _person;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_person_for_verified_email(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_person_for_verified_email(uuid, text) TO service_role;

-- Verified address → also claim the person (extends migration 058).
CREATE OR REPLACE FUNCTION public.link_verified_email_records(_user_id uuid, _email text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _user_id IS NULL OR _email IS NULL OR btrim(_email) = '' THEN RETURN; END IF;
  -- Rows already attached to an account are left alone.
  UPDATE public.registrations
     SET user_id = _user_id
   WHERE user_id IS NULL
     AND lower(email) = lower(btrim(_email));
  PERFORM public.claim_person_for_verified_email(_user_id, _email);
END;
$$;
REVOKE ALL ON FUNCTION public.link_verified_email_records(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_verified_email_records(uuid, text) TO service_role;


-- ── 8. Companies: reliable matches only ──────────────────────────────────────

/*
 * The company a registration can be linked to without anyone checking: a
 * website domain on record, a work-email domain on record, or the exact
 * name (or alias) of a VERIFIED company — each only when unambiguous.
 * Null otherwise; similar names are not the same legal entity.
 */
CREATE OR REPLACE FUNCTION public.reliable_company_match(_name text, _website text DEFAULT NULL, _email text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _domain text := public.norm_website_domain(_website);
  _mail   text := public.email_domain(_email);
  _key    text := public.company_name_key(_name);
  _ids    uuid[];
BEGIN
  IF _domain IS NOT NULL THEN
    SELECT ARRAY_AGG(company_id) INTO _ids FROM company_domains WHERE domain = _domain;
    IF array_length(_ids, 1) = 1 THEN RETURN _ids[1]; END IF;
  END IF;
  IF _mail IS NOT NULL AND NOT EXISTS (SELECT 1 FROM personal_email_domains WHERE domain = _mail) THEN
    SELECT ARRAY_AGG(company_id) INTO _ids FROM company_domains WHERE domain = _mail AND kind IN ('email','both');
    IF array_length(_ids, 1) = 1 THEN RETURN _ids[1]; END IF;
  END IF;
  IF _key <> '' THEN
    SELECT ARRAY_AGG(DISTINCT c.id) INTO _ids
      FROM companies c
      LEFT JOIN company_aliases a ON a.company_id = c.id
     WHERE c.verification_status = 'verified'
       AND (c.name_key = _key OR a.alias_key = _key);
    IF array_length(_ids, 1) = 1 THEN RETURN _ids[1]; END IF;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.reliable_company_match(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reliable_company_match(text, text, text) TO service_role;


-- ── 9. Keeping links current ──────────────────────────────────────────────────

-- A registration is linked to the person behind its email (and a company
-- when one matches reliably). Registration stays open without an account,
-- and this never changes the person's profile.
CREATE OR REPLACE FUNCTION public.registrations_link_person()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.email IS DISTINCT FROM OLD.email THEN
    IF NEW.company_id IS NULL THEN
      NEW.company_id := public.reliable_company_match(NEW.company, NULL, NEW.email);
    END IF;
    NEW.person_id := public.ensure_contact_person(
      NEW.email,
      COALESCE(NULLIF(btrim(COALESCE(NEW.first_name, '') || ' ' || COALESCE(NEW.last_name, '')), ''), NEW.name),
      NEW.mobile_country_code, NEW.mobile_number, NULL,
      NEW.company, NEW.company_id, NEW.designation, 'registration');
  END IF;
  RETURN NEW;
END;
$$;
-- Triggers on the same event fire in name order. This one must run after
-- registrations_validate_trg, which can replace the email (a signed-in
-- attendee registers under their own address), hence the "zz_" name.
DROP TRIGGER IF EXISTS registrations_link_person ON public.registrations;
DROP TRIGGER IF EXISTS zz_registrations_link_person ON public.registrations;
CREATE TRIGGER zz_registrations_link_person
  BEFORE INSERT OR UPDATE OF email ON public.registrations
  FOR EACH ROW EXECUTE FUNCTION public.registrations_link_person();

CREATE OR REPLACE FUNCTION public.speakers_link_person()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.email IS DISTINCT FROM OLD.email THEN
    NEW.person_id := public.ensure_contact_person(
      NEW.email, NEW.name, NEW.mobile_country_code, NEW.mobile_number, NEW.linkedin_url,
      NEW.company, NULL, NEW.designation, 'speaker');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS speakers_link_person ON public.speakers;
CREATE TRIGGER speakers_link_person
  BEFORE INSERT OR UPDATE OF email ON public.speakers
  FOR EACH ROW EXECUTE FUNCTION public.speakers_link_person();

CREATE OR REPLACE FUNCTION public.sponsor_members_link_person()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.email IS DISTINCT FROM OLD.email THEN
    NEW.person_id := public.ensure_contact_person(
      NEW.email,
      COALESCE(NULLIF(btrim(COALESCE(NEW.first_name, '') || ' ' || COALESCE(NEW.last_name, '')), ''), NEW.display_name),
      NEW.mobile_country_code, NEW.mobile_number, NEW.linkedin_url,
      NEW.company, NULL, NEW.designation, 'sponsor_contact');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sponsor_members_link_person ON public.sponsor_members;
CREATE TRIGGER sponsor_members_link_person
  BEFORE INSERT OR UPDATE OF email ON public.sponsor_members
  FOR EACH ROW EXECUTE FUNCTION public.sponsor_members_link_person();

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['_queue_identity_candidate(uuid, uuid, text)', 'registrations_link_person()',
                           'speakers_link_person()', 'sponsor_members_link_person()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
END $$;


-- ── 10. Backfill (idempotent) ─────────────────────────────────────────────────

-- Accounts with a verified address: their person, proven.
DO $$
DECLARE u record;
BEGIN
  FOR u IN SELECT id, email FROM auth.users WHERE email IS NOT NULL AND email_confirmed_at IS NOT NULL LOOP
    PERFORM public.claim_person_for_verified_email(u.id, u.email);
  END LOOP;
END $$;

-- Registrations, speakers and sponsor contacts not yet linked.
UPDATE public.registrations r
   SET person_id = public.ensure_contact_person(
         r.email,
         COALESCE(NULLIF(btrim(COALESCE(r.first_name, '') || ' ' || COALESCE(r.last_name, '')), ''), r.name),
         r.mobile_country_code, r.mobile_number, NULL, r.company, NULL, r.designation, 'backfill')
 WHERE r.person_id IS NULL AND public.norm_email(r.email) IS NOT NULL;

UPDATE public.speakers s
   SET person_id = public.ensure_contact_person(
         s.email, s.name, s.mobile_country_code, s.mobile_number, s.linkedin_url, s.company, NULL, s.designation, 'backfill')
 WHERE s.person_id IS NULL AND public.norm_email(s.email) IS NOT NULL;

UPDATE public.sponsor_members m
   SET person_id = public.ensure_contact_person(
         m.email,
         COALESCE(NULLIF(btrim(COALESCE(m.first_name, '') || ' ' || COALESCE(m.last_name, '')), ''), m.display_name),
         m.mobile_country_code, m.mobile_number, m.linkedin_url, m.company, NULL, m.designation, 'backfill')
 WHERE m.person_id IS NULL AND public.norm_email(m.email) IS NOT NULL;


-- ── 11. Lookups for the app (Add Person, imports) ────────────────────────────

-- Who may look people up and add companies: Super Admin, workspace owners,
-- and team members other than viewers.
CREATE OR REPLACE FUNCTION public._is_organiser(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND (
       has_role(_uid, 'admin')
    OR EXISTS (SELECT 1 FROM org_members WHERE user_id = _uid AND COALESCE(role, 'member') <> 'viewer')
    OR EXISTS (SELECT 1 FROM organizations WHERE owner_id = _uid)
  );
$$;
REVOKE ALL ON FUNCTION public._is_organiser(uuid) FROM PUBLIC, anon, authenticated;

-- Can this user see the person's details? Only through records they already
-- manage — a registration, speaker or sponsor contact on one of their events
-- — or because it is themselves.
CREATE OR REPLACE FUNCTION public._person_visible_to(_uid uuid, _person uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND (
       EXISTS (SELECT 1 FROM people p WHERE p.id = _person AND p.user_id = _uid)
    OR has_role(_uid, 'admin')
    OR EXISTS (SELECT 1 FROM registrations r JOIN events e ON e.id = r.event_id
                WHERE r.person_id = _person
                  AND (e.user_id = _uid OR (e.org_id IS NOT NULL AND is_org_member(_uid, e.org_id))))
    OR EXISTS (SELECT 1 FROM speakers s JOIN event_speakers es ON es.speaker_id = s.id JOIN events e ON e.id = es.event_id
                WHERE s.person_id = _person
                  AND (e.user_id = _uid OR (e.org_id IS NOT NULL AND is_org_member(_uid, e.org_id))))
    OR EXISTS (SELECT 1 FROM sponsor_members m JOIN event_sponsors es ON es.sponsor_id = m.sponsor_id JOIN events e ON e.id = es.event_id
                WHERE m.person_id = _person
                  AND (e.user_id = _uid OR (e.org_id IS NOT NULL AND is_org_member(_uid, e.org_id))))
  );
$$;
REVOKE ALL ON FUNCTION public._person_visible_to(uuid, uuid) FROM PUBLIC, anon, authenticated;

/*
 * Possible existing people for what an organiser is about to add: the ids,
 * how each matched and whether they have an account. Name, full address and
 * company come back only for people the caller can already see through
 * their own events; anyone else is "an existing contact" with a masked
 * address — looking someone up never reveals their details.
 */
CREATE OR REPLACE FUNCTION public.identity_candidates(
  _email    text DEFAULT NULL,
  _phone_cc text DEFAULT NULL,
  _phone    text DEFAULT NULL,
  _linkedin text DEFAULT NULL,
  _name     text DEFAULT NULL,
  _company  text DEFAULT NULL
)
RETURNS TABLE (
  person_id    uuid,
  reasons      text[],
  has_account  boolean,
  visible      boolean,
  display_name text,
  email_hint   text,
  company      text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid  uuid := auth.uid();
  _key  text := public.norm_email(_email);
  _e164 text := public.norm_phone(_phone_cc, _phone);
  _li   text := public.linkedin_key(_linkedin);
  _nk   text := public.person_name_key(_name);
  _ck   text := public.company_name_key(_company);
BEGIN
  IF NOT public._is_organiser(_uid) THEN
    RAISE EXCEPTION 'Only organisers can look people up' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH hits AS (
    SELECT pe.person_id AS pid, 'email'::text AS why FROM person_emails pe WHERE _key IS NOT NULL AND pe.email_key = _key
    UNION ALL
    SELECT pp.person_id, 'phone' FROM person_phones pp WHERE _e164 IS NOT NULL AND pp.phone_e164 = _e164
    UNION ALL
    SELECT pl.person_id, 'linkedin' FROM person_links pl WHERE _li IS NOT NULL AND pl.kind = 'linkedin' AND pl.url_key = _li
    UNION ALL
    SELECT DISTINCT p.id, 'name_company' FROM people p JOIN registrations r ON r.person_id = p.id
     WHERE _nk <> '' AND _ck <> '' AND p.name_key = _nk AND public.company_name_key(r.company) = _ck
  ), grouped AS (
    SELECT h.pid, ARRAY_AGG(DISTINCT h.why ORDER BY h.why) AS why FROM hits h GROUP BY h.pid LIMIT 25
  ), shown AS (
    SELECT g.pid, g.why, public._person_visible_to(_uid, g.pid) AS ok FROM grouped g
  )
  SELECT s.pid,
         s.why,
         p.user_id IS NOT NULL,
         s.ok,
         CASE WHEN s.ok THEN p.display_name END,
         (SELECT CASE WHEN s.ok THEN pe.email
                      ELSE left(pe.email_key, 1) || '•••@' || split_part(pe.email_key, '@', 2) END
            FROM person_emails pe WHERE pe.person_id = s.pid
           ORDER BY (pe.email_key = _key) DESC NULLS LAST, pe.verified_at IS NULL, pe.created_at LIMIT 1),
         CASE WHEN s.ok THEN
           (SELECT r.company FROM registrations r WHERE r.person_id = s.pid AND r.company IS NOT NULL
             ORDER BY r.created_at DESC LIMIT 1) END
    FROM shown s JOIN people p ON p.id = s.pid
   ORDER BY ('email' = ANY (s.why)) DESC, array_length(s.why, 1) DESC, s.pid;
END;
$$;
REVOKE ALL ON FUNCTION public.identity_candidates(text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.identity_candidates(text, text, text, text, text, text) TO authenticated;

/*
 * Companies that might be the one typed: by website domain, work-email
 * domain, name or alias. For the company picker; choosing is the user's call.
 */
CREATE OR REPLACE FUNCTION public.company_candidates(_name text DEFAULT NULL, _website text DEFAULT NULL, _email text DEFAULT NULL)
RETURNS TABLE (company_id uuid, name text, website text, verification_status text, reasons text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _domain text := public.norm_website_domain(_website);
  _mail   text := public.email_domain(_email);
  _key    text := public.company_name_key(_name);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to look companies up' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH hits AS (
    SELECT d.company_id AS cid, 'website_domain'::text AS why FROM company_domains d WHERE _domain IS NOT NULL AND d.domain = _domain
    UNION ALL
    SELECT d.company_id, 'email_domain' FROM company_domains d
     WHERE _mail IS NOT NULL AND d.domain = _mail
       AND NOT EXISTS (SELECT 1 FROM personal_email_domains x WHERE x.domain = _mail)
    UNION ALL
    SELECT c.id, 'name' FROM companies c WHERE _key <> '' AND c.name_key = _key
    UNION ALL
    SELECT a.company_id, 'alias' FROM company_aliases a WHERE _key <> '' AND a.alias_key = _key
  )
  SELECT c.id, c.name, c.website, c.verification_status, ARRAY_AGG(DISTINCT h.why ORDER BY h.why)
    FROM hits h JOIN companies c ON c.id = h.cid
   WHERE c.verification_status <> 'rejected'
   GROUP BY c.id
   ORDER BY bool_or(h.why IN ('website_domain','email_domain')) DESC, (c.verification_status = 'verified') DESC, c.name
   LIMIT 25;
END;
$$;
REVOKE ALL ON FUNCTION public.company_candidates(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_candidates(text, text, text) TO authenticated;

-- A provisional company for a name nothing matched. Organisers only; a
-- website domain already on record returns that company instead.
CREATE OR REPLACE FUNCTION public.create_provisional_company(_name text, _website text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid    uuid := auth.uid();
  _domain text := public.norm_website_domain(_website);
  _id     uuid;
BEGIN
  IF NOT public._is_organiser(_uid) THEN
    RAISE EXCEPTION 'Only organisers can add companies' USING ERRCODE = '42501';
  END IF;
  IF public.company_name_key(_name) = '' THEN
    RAISE EXCEPTION 'Enter a company name' USING ERRCODE = '22023';
  END IF;
  IF _domain IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('company_domain:' || _domain, 0));
    SELECT company_id INTO _id FROM company_domains WHERE domain = _domain;
    IF _id IS NOT NULL THEN RETURN _id; END IF;
  END IF;
  INSERT INTO companies (name, name_key, website, source, created_by)
  VALUES (public.norm_text(_name), public.company_name_key(_name),
          CASE WHEN _domain IS NOT NULL THEN 'https://' || _domain END, 'user_entered', _uid)
  RETURNING id INTO _id;
  IF _domain IS NOT NULL THEN
    INSERT INTO company_domains (company_id, domain, kind) VALUES (_id, _domain, 'website');
  END IF;
  INSERT INTO audit_logs (actor_id, action, target_type, target_id, details)
  VALUES (_uid, 'company.created_provisional', 'company', _id::text, jsonb_build_object('name', _name, 'domain', _domain));
  RETURN _id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_provisional_company(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_provisional_company(text, text) TO authenticated;

-- The normalisers are pure; signed-in users may call them (e.g. previews).
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['norm_text(text)', 'fold_text(text)', 'norm_email(text)', 'email_domain(text)',
                           'norm_country_code(text)', 'norm_phone(text, text)', 'person_name_key(text)',
                           'company_name_key(text)', 'norm_website_domain(text)', 'linkedin_key(text)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', f);
  END LOOP;
END $$;
