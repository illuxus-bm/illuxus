-- ═══════════════════════════════════════════════════════════════════════════════
-- Company suggestions while typing.
--
-- The company boxes on every form (sign-up, event registration, Add
-- participant, speakers, sponsors, profile) were plain text. This gives
-- them suggestions from the company records:
--
--   • Seeding: every company name already typed — registrations, profiles,
--     speakers, sponsor contacts — becomes a provisional company record,
--     one per distinct name (spelled the way most people spelled it).
--     Sponsors become companies too, with their website domain. Obvious
--     non-names ("NA", "self", "student", …) are skipped.
--   • Growth: new entries keep doing the same, so suggestions improve as
--     people register. company_mentions records which people entered which
--     company; entry_count is how many different people did.
--   • Linking a registration to a company still needs reliable evidence
--     (migration 060's reliable_company_match). A typed name creates or
--     finds a provisional record for suggestions; it does not link.
--   • suggest_companies(q): names starting with (or containing a word
--     starting with) what was typed, 2+ characters, at most 8. Organisers
--     see every record. Everyone else — including visitors on the public
--     registration form — sees only companies that are verified, came from
--     an organiser (sponsors), or were entered by at least two different
--     people, so one prank entry is never shown to anybody else. Visitors
--     who aren't signed in are rate-limited per network address.
--
-- Run RUN_ME_identity_foundation.sql (060) first.
-- Safe to run more than once. Paste into the Supabase SQL Editor and Run.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ── 1. Records ────────────────────────────────────────────────────────────────

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS entry_count integer NOT NULL DEFAULT 0;

-- One provisional record per typed name (verified records may share a name:
-- two legal entities can).
CREATE UNIQUE INDEX IF NOT EXISTS companies_typed_name_key_uq ON public.companies (name_key) WHERE source = 'typed';
CREATE INDEX IF NOT EXISTS companies_name_key_prefix_idx ON public.companies (name_key text_pattern_ops);
CREATE INDEX IF NOT EXISTS company_aliases_key_prefix_idx ON public.company_aliases (alias_key text_pattern_ops);

-- Who entered which company (one row per person and company).
CREATE TABLE IF NOT EXISTS public.company_mentions (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  person_id  uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, person_id)
);
ALTER TABLE public.company_mentions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.company_mentions FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_mentions TO service_role;


-- ── 2. Helpers ────────────────────────────────────────────────────────────────

-- Is this typed value a company name at all?
CREATE OR REPLACE FUNCTION public._company_name_usable(_key text)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
  SELECT _key IS NOT NULL
     AND length(_key) >= 2
     AND _key ~ '[a-z0-9]|[^\x00-\x7F]'
     AND _key NOT IN ('na','n a','none','nil','null','self','self employed','selfemployed','freelance','freelancer',
                      'student','students','unemployed','not applicable','not employed','test','testing','xyz','abc',
                      'private','individual','personal','home','homemaker','housewife','retired','nothing','no',
                      'yes','other','others','nan','undefined','tbd','unknown','company','my company');
$$;

/*
 * The company record for a typed name: an existing record with that name or
 * alias (verified first), else a new provisional one. Null for non-names.
 * Concurrent calls for the same name wait for each other.
 */
CREATE OR REPLACE FUNCTION public._ensure_company_for_name(_name text, _source text DEFAULT 'typed')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _key text := public.company_name_key(_name);
  _id  uuid;
BEGIN
  IF NOT public._company_name_usable(_key) THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('company_name:' || _key, 0));
  SELECT c.id INTO _id
    FROM companies c
   WHERE c.verification_status <> 'rejected'
     AND (c.name_key = _key OR EXISTS (SELECT 1 FROM company_aliases a WHERE a.company_id = c.id AND a.alias_key = _key))
   ORDER BY (c.verification_status = 'verified') DESC, c.entry_count DESC, c.created_at
   LIMIT 1;
  IF _id IS NOT NULL THEN RETURN _id; END IF;
  INSERT INTO companies (name, name_key, source)
  VALUES (public.norm_text(_name), _key, CASE WHEN _source IN ('typed','sponsor','organiser') THEN _source ELSE 'typed' END)
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

-- Records that this person entered this company; counts distinct people.
CREATE OR REPLACE FUNCTION public._note_company_mention(_person uuid, _name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _id  uuid := public._ensure_company_for_name(_name, 'typed');
  _new integer;
BEGIN
  IF _id IS NULL OR _person IS NULL THEN RETURN _id; END IF;
  INSERT INTO company_mentions (company_id, person_id) VALUES (_id, _person) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS _new = ROW_COUNT;
  IF _new > 0 THEN
    UPDATE companies SET entry_count = entry_count + 1 WHERE id = _id;
  END IF;
  RETURN _id;
END;
$$;

-- A sponsor is a company an organiser entered, with its website.
CREATE OR REPLACE FUNCTION public._ensure_company_for_sponsor(_name text, _website text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _domain text := public.norm_website_domain(_website);
  _id     uuid;
BEGIN
  IF _domain IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('company_domain:' || _domain, 0));
    SELECT company_id INTO _id FROM company_domains WHERE domain = _domain;
    IF _id IS NOT NULL THEN RETURN _id; END IF;
  END IF;
  _id := public._ensure_company_for_name(_name, 'sponsor');
  IF _id IS NULL THEN RETURN NULL; END IF;
  -- An organiser named it, so a record first made from typed entries counts as theirs.
  UPDATE companies SET source = 'sponsor' WHERE id = _id AND source = 'typed'
     AND NOT EXISTS (SELECT 1 FROM companies o WHERE o.source = 'sponsor' AND o.name_key = companies.name_key AND o.id <> companies.id);
  IF _domain IS NOT NULL THEN
    INSERT INTO company_domains (company_id, domain, kind) VALUES (_id, _domain, 'website') ON CONFLICT (domain) DO NOTHING;
    UPDATE companies SET website = COALESCE(website, 'https://' || _domain) WHERE id = _id;
  END IF;
  RETURN _id;
END;
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['_company_name_usable(text)', '_ensure_company_for_name(text, text)',
                           '_note_company_mention(uuid, text)', '_ensure_company_for_sponsor(text, text)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $$;


-- ── 3. Keeping it growing ─────────────────────────────────────────────────────

-- After a registration, speaker or sponsor contact is linked to its person
-- (060's BEFORE triggers), note the company they typed. AFTER, so the
-- person is known; never changes the row.
CREATE OR REPLACE FUNCTION public.note_company_from_entry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.company IS NOT NULL AND btrim(NEW.company) <> ''
     AND (TG_OP = 'INSERT' OR NEW.company IS DISTINCT FROM OLD.company OR NEW.person_id IS DISTINCT FROM OLD.person_id) THEN
    PERFORM public._note_company_mention(NEW.person_id, NEW.company);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS note_company_from_registration ON public.registrations;
CREATE TRIGGER note_company_from_registration
  AFTER INSERT OR UPDATE OF company, person_id ON public.registrations
  FOR EACH ROW EXECUTE FUNCTION public.note_company_from_entry();
DROP TRIGGER IF EXISTS note_company_from_speaker ON public.speakers;
CREATE TRIGGER note_company_from_speaker
  AFTER INSERT OR UPDATE OF company, person_id ON public.speakers
  FOR EACH ROW EXECUTE FUNCTION public.note_company_from_entry();
DROP TRIGGER IF EXISTS note_company_from_sponsor_member ON public.sponsor_members;
CREATE TRIGGER note_company_from_sponsor_member
  AFTER INSERT OR UPDATE OF company, person_id ON public.sponsor_members
  FOR EACH ROW EXECUTE FUNCTION public.note_company_from_entry();

-- A profile's company counts for the account's person.
CREATE OR REPLACE FUNCTION public.note_company_from_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.company IS NOT NULL AND btrim(NEW.company) <> ''
     AND (TG_OP = 'INSERT' OR NEW.company IS DISTINCT FROM OLD.company) THEN
    PERFORM public._note_company_mention((SELECT id FROM people WHERE user_id = NEW.user_id), NEW.company);
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS note_company_from_profile ON public.profiles;
CREATE TRIGGER note_company_from_profile
  AFTER INSERT OR UPDATE OF company ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.note_company_from_profile();

CREATE OR REPLACE FUNCTION public.note_company_from_sponsor()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.name IS DISTINCT FROM OLD.name OR NEW.website IS DISTINCT FROM OLD.website THEN
    PERFORM public._ensure_company_for_sponsor(NEW.name, NEW.website);
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS note_company_from_sponsor ON public.sponsors;
CREATE TRIGGER note_company_from_sponsor
  AFTER INSERT OR UPDATE OF name, website ON public.sponsors
  FOR EACH ROW EXECUTE FUNCTION public.note_company_from_sponsor();

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['note_company_from_entry()', 'note_company_from_profile()', 'note_company_from_sponsor()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
END $$;


-- ── 4. Seeding from what is already there (idempotent) ──────────────────────

-- Sponsors first, so their records (with websites) take the names.
DO $$
DECLARE s record;
BEGIN
  FOR s IN SELECT name, website FROM public.sponsors WHERE name IS NOT NULL LOOP
    PERFORM public._ensure_company_for_sponsor(s.name, s.website);
  END LOOP;
END $$;

-- One record per distinct typed name, spelled the way most people did.
WITH typed AS (
  SELECT public.norm_text(company) AS name FROM public.registrations   WHERE company IS NOT NULL
  UNION ALL SELECT public.norm_text(company) FROM public.speakers        WHERE company IS NOT NULL
  UNION ALL SELECT public.norm_text(company) FROM public.sponsor_members WHERE company IS NOT NULL
  UNION ALL SELECT public.norm_text(company) FROM public.profiles        WHERE company IS NOT NULL
), keyed AS (
  SELECT name, public.company_name_key(name) AS k FROM typed WHERE name <> ''
), spellings AS (
  SELECT k, name, count(*) AS n FROM keyed WHERE public._company_name_usable(k) GROUP BY k, name
), best AS (
  SELECT DISTINCT ON (k) k, name FROM spellings ORDER BY k, n DESC, name
)
INSERT INTO public.companies (name, name_key, source)
SELECT b.name, b.k, 'typed'
  FROM best b
 WHERE NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.name_key = b.k)
   AND NOT EXISTS (SELECT 1 FROM public.company_aliases a WHERE a.alias_key = b.k)
ON CONFLICT DO NOTHING;

-- Who entered what, then the counts.
INSERT INTO public.company_mentions (company_id, person_id)
SELECT DISTINCT c.id, e.person_id
  FROM (
    SELECT person_id, company FROM public.registrations   WHERE person_id IS NOT NULL AND company IS NOT NULL
    UNION ALL SELECT person_id, company FROM public.speakers        WHERE person_id IS NOT NULL AND company IS NOT NULL
    UNION ALL SELECT person_id, company FROM public.sponsor_members WHERE person_id IS NOT NULL AND company IS NOT NULL
    UNION ALL SELECT p.id, pr.company FROM public.profiles pr JOIN public.people p ON p.user_id = pr.user_id WHERE pr.company IS NOT NULL
  ) e
  JOIN LATERAL (
    SELECT c.id FROM public.companies c
     WHERE c.verification_status <> 'rejected' AND c.name_key = public.company_name_key(e.company)
     ORDER BY (c.verification_status = 'verified') DESC, c.created_at
     LIMIT 1
  ) c ON true
ON CONFLICT DO NOTHING;

UPDATE public.companies c
   SET entry_count = m.n
  FROM (SELECT company_id, count(*)::int AS n FROM public.company_mentions GROUP BY company_id) m
 WHERE m.company_id = c.id AND c.entry_count IS DISTINCT FROM m.n;


-- ── 5. Suggestions ────────────────────────────────────────────────────────────

/*
 * Company names for what is being typed: names starting with it first,
 * then names with a word starting with it. Only names — never who entered
 * them. Organisers see every record; everyone else sees verified ones,
 * sponsors' and names at least two different people entered. Visitors who
 * are not signed in get 60 lookups a minute per network address.
 */
CREATE OR REPLACE FUNCTION public.suggest_companies(_q text, _limit integer DEFAULT 8)
RETURNS TABLE (company_id uuid, name text, verified boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid       uuid := auth.uid();
  _p         text;
  _organiser boolean;
  _headers   jsonb;
  _ip        text;
  _ip_hash   text;
BEGIN
  -- What was typed, as a key prefix (accents and punctuation removed; this
  -- also removes LIKE's % and _).
  _p := btrim(regexp_replace(replace(public.fold_text(_q), '&', ' and '),
              '[!-/:-@\[-`{-~\u00A0-\u00BF\u2010-\u2027\u2030-\u205E\s]+', ' ', 'g'));
  _p := regexp_replace(_p, '^the ', '');
  IF length(_p) < 2 THEN RETURN; END IF;

  _organiser := public._is_organiser(_uid);

  IF _uid IS NULL THEN
    BEGIN
      _headers := NULLIF(current_setting('request.headers', true), '')::jsonb;
    EXCEPTION WHEN others THEN
      _headers := NULL;
    END;
    _ip := COALESCE(_headers ->> 'cf-connecting-ip',
                    btrim(split_part(_headers ->> 'x-forwarded-for', ',', 1)),
                    'unknown');
    _ip_hash := encode(sha256(convert_to('company_suggest:' || _ip, 'UTF8')), 'hex');
    IF (SELECT count(*) FROM guest_rate_limits
         WHERE bucket = 'company_suggest' AND key_hash = _ip_hash
           AND created_at > now() - interval '1 minute') >= 60 THEN
      RAISE EXCEPTION 'Too many lookups — wait a moment' USING ERRCODE = '54000';
    END IF;
    INSERT INTO guest_rate_limits (bucket, key_hash) VALUES ('company_suggest', _ip_hash);
  END IF;

  RETURN QUERY
  SELECT c.id, c.name, c.verification_status = 'verified'
    FROM companies c
   WHERE c.verification_status <> 'rejected'
     AND (_organiser OR c.verification_status = 'verified' OR c.source IN ('sponsor','organiser') OR c.entry_count >= 2)
     AND (c.name_key LIKE _p || '%'
          OR c.name_key LIKE '% ' || _p || '%'
          OR EXISTS (SELECT 1 FROM company_aliases a WHERE a.company_id = c.id AND a.alias_key LIKE _p || '%'))
   ORDER BY (c.name_key LIKE _p || '%') DESC,
            (c.verification_status = 'verified') DESC,
            c.entry_count DESC,
            c.name
   LIMIT LEAST(GREATEST(COALESCE(_limit, 8), 1), 8);
END;
$$;
REVOKE ALL ON FUNCTION public.suggest_companies(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.suggest_companies(text, integer) TO anon, authenticated, service_role;
