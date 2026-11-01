-- ═══════════════════════════════════════════════════════════════════════════════
-- Intelligence Centre, part 2.
--
--   • Merged companies disappear from suggestions. Lookups (suggestions,
--     candidates, reliable matches, typed entries) ignored merged_into, so a
--     merged company could still be offered and new entries could attach to
--     it. Now only the surviving company is offered, and its former names
--     still find it. A merged person is no longer offered by name either.
--   • Sponsors are connected to company records (sponsors.company_id): existing
--     ones by website domain or exact name, new ones as they are saved, and by
--     hand in the Intelligence Centre. A manual connection is never replaced
--     automatically, and merging companies carries their sponsors along. The
--     sponsor records themselves, their logos, tiers and event links, are
--     untouched.
--   • Lists page, sort and filter on the server, and report their totals.
--   • Duplicate scans also catch near-identical names ("Priya" / "Priyaa" at the
--     same company, "Acme India" / "Acme Indian"), as possible matches only.
--   • Rolling a merge back reopens its duplicate suggestions.
--
-- Run RUN_ME_intelligence_centre.sql (064) first.
-- Safe to run more than once. Paste into the SQL Editor and Run.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ── 1. Sponsors belong to a company record ───────────────────────────────────

ALTER TABLE public.sponsors ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS sponsors_company_idx ON public.sponsors (company_id);


-- ── 2. Merged records are never offered ──────────────────────────────────────

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
   WHERE c.verification_status <> 'rejected' AND c.merged_into IS NULL
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
   WHERE c.verification_status <> 'rejected' AND c.merged_into IS NULL
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
   WHERE c.verification_status <> 'rejected' AND c.merged_into IS NULL
   GROUP BY c.id
   ORDER BY bool_or(h.why IN ('website_domain','email_domain')) DESC, (c.verification_status = 'verified') DESC, c.name
   LIMIT 25;
END;
$$;
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
     WHERE c.verification_status = 'verified' AND c.merged_into IS NULL
       AND (c.name_key = _key OR a.alias_key = _key);
    IF array_length(_ids, 1) = 1 THEN RETURN _ids[1]; END IF;
  END IF;
  RETURN NULL;
END;
$$;
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
     WHERE p.merged_into IS NULL AND _nk <> '' AND _ck <> '' AND p.name_key = _nk AND public.company_name_key(r.company) = _ck
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


-- ── 3. Connecting sponsors ───────────────────────────────────────────────────

-- Saved sponsors connect themselves; an existing connection is kept.
CREATE OR REPLACE FUNCTION public.note_company_from_sponsor()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _company uuid;
BEGIN
  IF TG_OP = 'INSERT' OR NEW.name IS DISTINCT FROM OLD.name OR NEW.website IS DISTINCT FROM OLD.website THEN
    _company := public._ensure_company_for_sponsor(NEW.name, NEW.website);
    IF _company IS NOT NULL AND NEW.company_id IS NULL THEN
      UPDATE sponsors SET company_id = _company WHERE id = NEW.id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DO $$
DECLARE s record;
BEGIN
  FOR s IN SELECT id, name, website FROM public.sponsors WHERE company_id IS NULL AND name IS NOT NULL LOOP
    UPDATE public.sponsors SET company_id = public._ensure_company_for_sponsor(s.name, s.website) WHERE id = s.id;
  END LOOP;
END $$;

/*
 * Sponsor records for review, with the company each belongs to. _filter:
 * 'unconnected', 'repeats' (more than one record for one company) or 'all'.
 */
CREATE OR REPLACE FUNCTION public.intel_search_sponsors(_q text DEFAULT NULL, _limit integer DEFAULT 25, _offset integer DEFAULT 0, _filter text DEFAULT 'all')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _k text := COALESCE(public.company_name_key(_q), '');
  _t text := lower(COALESCE(public.norm_text(_q), ''));
BEGIN
  PERFORM public._require_super_admin();
  RETURN (
    WITH m AS (
      SELECT s.*, (SELECT lower(c.name) FROM companies c WHERE c.id = s.company_id) AS company_sort FROM sponsors s
       WHERE (_t = '' OR s.id::text = _t OR public.company_name_key(s.name) LIKE '%' || _k || '%'
              OR lower(COALESCE(s.email, '')) LIKE '%' || _t || '%' OR lower(COALESCE(s.website, '')) LIKE '%' || _t || '%')
         AND CASE _filter
               WHEN 'unconnected' THEN s.company_id IS NULL
               WHEN 'repeats' THEN s.company_id IS NOT NULL AND EXISTS (SELECT 1 FROM sponsors o WHERE o.company_id = s.company_id AND o.id <> s.id)
               ELSE true END
    ), page AS (
      -- Repeats read best side by side, so they are grouped by company.
      SELECT * FROM m ORDER BY CASE WHEN _filter = 'repeats' THEN m.company_sort END, lower(m.name), m.id
       LIMIT LEAST(GREATEST(COALESCE(_limit, 25), 1), 200) OFFSET GREATEST(COALESCE(_offset, 0), 0)
    )
    SELECT jsonb_build_object(
      'total', (SELECT count(*) FROM m),
      'rows', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id', p.id, 'name', p.name, 'email', p.email, 'website', p.website, 'logo_url', p.logo_url,
          'company_id', p.company_id, 'company', (SELECT c.name FROM companies c WHERE c.id = p.company_id),
          'same_company', (SELECT count(*) FROM sponsors o WHERE p.company_id IS NOT NULL AND o.company_id = p.company_id AND o.id <> p.id),
          'events', (SELECT count(*) FROM event_sponsors es WHERE es.sponsor_id = p.id),
          'team', (SELECT count(*) FROM sponsor_members sm WHERE sm.sponsor_id = p.id),
          'created_by', (SELECT u.email FROM auth.users u WHERE u.id = p.user_id))
          ORDER BY CASE WHEN _filter = 'repeats' THEN p.company_sort END, lower(p.name), p.id) FROM page p), '[]'::jsonb))
  );
END;
$$;

-- Connects a sponsor record to a company, or disconnects it (_company NULL).
CREATE OR REPLACE FUNCTION public.intel_connect_sponsor(_sponsor uuid, _company uuid, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := public._require_super_admin();
  _old uuid;
BEGIN
  SELECT company_id INTO _old FROM sponsors WHERE id = _sponsor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sponsor not found' USING ERRCODE = 'P0002'; END IF;
  IF _company IS NOT NULL THEN
    PERFORM 1 FROM companies WHERE id = _company AND merged_into IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Unknown company' USING ERRCODE = '22023'; END IF;
  END IF;
  UPDATE sponsors SET company_id = _company WHERE id = _sponsor;
  INSERT INTO audit_logs (actor_id, action, target_type, target_id, details)
  VALUES (_uid, 'intel.sponsor_connected', 'sponsor', _sponsor::text,
          jsonb_build_object('from', _old, 'to', _company, 'reason', _reason));
END;
$$;


-- ── 4. Merges carry sponsors; rollbacks reopen suggestions ───────────────────

CREATE OR REPLACE FUNCTION public.intel_merge_companies(_survivor uuid, _others uuid[], _choices jsonb DEFAULT '{}'::jsonb,
                                                        _reason text DEFAULT NULL, _allow_distinct boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid     uuid := public._require_super_admin();
  _surv    companies%ROWTYPE;
  _op      uuid := gen_random_uuid();
  _moved   jsonb := '[]'::jsonb;
  _removed jsonb := '[]'::jsonb;
  _all     uuid[];
  _n       integer;
  k        text;
  r        record;
BEGIN
  IF _others IS NULL OR array_length(_others, 1) IS NULL OR _survivor = ANY (_others) THEN
    RAISE EXCEPTION 'Choose a surviving company and at least one other' USING ERRCODE = '22023';
  END IF;
  _all := _others || _survivor;
  SELECT * INTO _surv FROM companies WHERE id = _survivor AND merged_into IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'The surviving company no longer exists' USING ERRCODE = 'P0002'; END IF;
  SELECT count(*) INTO _n FROM companies WHERE id = ANY (_others) AND merged_into IS NULL;
  IF _n <> array_length(_others, 1) THEN RAISE EXCEPTION 'A company to merge no longer exists or was already merged' USING ERRCODE = 'P0002'; END IF;
  PERFORM 1 FROM companies WHERE id = ANY (_others) FOR UPDATE;

  IF NOT _allow_distinct AND (
       EXISTS (SELECT 1 FROM company_identifiers i1 JOIN company_identifiers i2 ON i1.scheme = i2.scheme AND i1.value <> i2.value
                WHERE i1.company_id = ANY (_all) AND i2.company_id = ANY (_all))
    OR EXISTS (SELECT 1 FROM companies c WHERE c.id = ANY (_all) AND c.parent_company_id = ANY (_all))) THEN
    RAISE EXCEPTION 'These look like separate legal entities (different registry identifiers, or parent and subsidiary). Confirm explicitly to merge them.'
      USING ERRCODE = '42501';
  END IF;

  FOR r IN SELECT * FROM person_company_affiliations x WHERE x.company_id = ANY (_others) LOOP
    IF EXISTS (SELECT 1 FROM person_company_affiliations s WHERE s.company_id = _survivor AND s.person_id = r.person_id AND s.designation_key = r.designation_key) THEN
      _removed := _removed || jsonb_build_object('table', 'person_company_affiliations', 'row', to_jsonb(r));
      DELETE FROM person_company_affiliations WHERE id = r.id;
    ELSE
      _moved := _moved || jsonb_build_object('table', 'person_company_affiliations', 'id', r.id, 'from', r.company_id);
      UPDATE person_company_affiliations SET company_id = _survivor WHERE id = r.id;
    END IF;
  END LOOP;
  FOR r IN SELECT * FROM company_mentions x WHERE x.company_id = ANY (_others) LOOP
    IF EXISTS (SELECT 1 FROM company_mentions s WHERE s.company_id = _survivor AND s.person_id = r.person_id) THEN
      _removed := _removed || jsonb_build_object('table', 'company_mentions', 'row', to_jsonb(r));
      DELETE FROM company_mentions WHERE company_id = r.company_id AND person_id = r.person_id;
    ELSE
      _moved := _moved || jsonb_build_object('table', 'company_mentions', 'person_id', r.person_id, 'from', r.company_id);
      UPDATE company_mentions SET company_id = _survivor WHERE company_id = r.company_id AND person_id = r.person_id;
    END IF;
  END LOOP;
  FOR r IN SELECT * FROM company_aliases x WHERE x.company_id = ANY (_others) LOOP
    IF EXISTS (SELECT 1 FROM company_aliases s WHERE s.company_id = _survivor AND s.alias_key = r.alias_key) THEN
      _removed := _removed || jsonb_build_object('table', 'company_aliases', 'row', to_jsonb(r));
      DELETE FROM company_aliases WHERE id = r.id;
    ELSE
      _moved := _moved || jsonb_build_object('table', 'company_aliases', 'id', r.id, 'from', r.company_id);
      UPDATE company_aliases SET company_id = _survivor WHERE id = r.id;
    END IF;
  END LOOP;
  FOR r IN SELECT 'company_domains' t, id, company_id FROM company_domains WHERE company_id = ANY (_others)
           UNION ALL SELECT 'company_identifiers', id, company_id FROM company_identifiers WHERE company_id = ANY (_others)
           UNION ALL SELECT 'company_locations', id, company_id FROM company_locations WHERE company_id = ANY (_others)
           UNION ALL SELECT 'company_source_records', id, company_id FROM company_source_records WHERE company_id = ANY (_others)
           UNION ALL SELECT 'registrations', id, company_id FROM registrations WHERE company_id = ANY (_others)
           UNION ALL SELECT 'people', id, current_company_id FROM people WHERE current_company_id = ANY (_others)
           UNION ALL SELECT 'sponsors', id, company_id FROM sponsors WHERE company_id = ANY (_others)
           UNION ALL SELECT 'companies', id, parent_company_id FROM companies WHERE parent_company_id = ANY (_others) AND id <> _survivor LOOP
    _moved := _moved || jsonb_build_object('table', r.t, 'id', r.id, 'from', r.company_id);
  END LOOP;
  UPDATE company_domains SET company_id = _survivor WHERE company_id = ANY (_others);
  UPDATE company_identifiers SET company_id = _survivor WHERE company_id = ANY (_others);
  UPDATE company_locations SET company_id = _survivor WHERE company_id = ANY (_others);
  UPDATE company_source_records SET company_id = _survivor WHERE company_id = ANY (_others);
  UPDATE registrations SET company_id = _survivor WHERE company_id = ANY (_others);
  UPDATE people SET current_company_id = _survivor WHERE current_company_id = ANY (_others);
  UPDATE sponsors SET company_id = _survivor WHERE company_id = ANY (_others);
  UPDATE companies SET parent_company_id = _survivor WHERE parent_company_id = ANY (_others) AND id <> _survivor;
  IF _surv.parent_company_id = ANY (_others) THEN
    _moved := _moved || jsonb_build_object('table', 'companies_parent_of_survivor', 'id', _survivor, 'from', _surv.parent_company_id);
    UPDATE companies SET parent_company_id = NULL WHERE id = _survivor;
  END IF;

  -- The others' names stay findable, as former names of the survivor.
  FOR r IN SELECT id, name, name_key FROM companies WHERE id = ANY (_others) LOOP
    IF r.name_key <> _surv.name_key AND NOT EXISTS (SELECT 1 FROM company_aliases WHERE company_id = _survivor AND alias_key = r.name_key) THEN
      INSERT INTO company_aliases (company_id, alias, alias_key, kind) VALUES (_survivor, r.name, r.name_key, 'former')
      RETURNING id INTO k;
      _moved := _moved || jsonb_build_object('table', 'company_aliases_added', 'id', k);
    END IF;
  END LOOP;

  INSERT INTO merge_operations (id, entity_type, survivor_id, merged_ids, field_choices, moved, removed, survivor_before, reason, actor_id)
  VALUES (_op, 'company', _survivor, _others, COALESCE(_choices, '{}'::jsonb), _moved, _removed, to_jsonb(_surv), _reason, _uid);

  FOR k IN SELECT jsonb_object_keys(COALESCE(_choices, '{}'::jsonb)) LOOP
    PERFORM public._intel_set_field('company', _survivor, k, _choices ->> k, 'merge', COALESCE(_reason, 'Merge'), _uid, _op);
  END LOOP;

  UPDATE companies SET merged_into = _survivor, updated_at = now() WHERE id = ANY (_others);
  UPDATE companies SET entry_count = (SELECT count(*) FROM company_mentions WHERE company_id = _survivor) WHERE id = _survivor;
  UPDATE company_match_candidates SET status = 'merged', reviewed_by = _uid, reviewed_at = now()
   WHERE company_a = ANY (_all) AND company_b = ANY (_all);
  INSERT INTO audit_logs (actor_id, action, target_type, target_id, details)
  VALUES (_uid, 'intel.companies_merged', 'company', _survivor::text,
          jsonb_build_object('merge_id', _op, 'merged', _others, 'choices', _choices, 'reason', _reason,
                             'distinct_entities_confirmed', _allow_distinct, 'moved', jsonb_array_length(_moved)));
  RETURN _op;
END;
$$;
CREATE OR REPLACE FUNCTION public.intel_merge_preview(_entity text, _survivor uuid, _others uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _all uuid[] := _others;
BEGIN
  PERFORM public._require_super_admin();
  IF _entity = 'person' THEN
    RETURN jsonb_build_object(
      'registrations',    (SELECT count(*) FROM registrations WHERE person_id = ANY (_all)),
      'events',           (SELECT count(DISTINCT event_id) FROM registrations WHERE person_id = ANY (_all)),
      'speaker_records',  (SELECT count(*) FROM speakers WHERE person_id = ANY (_all)),
      'sponsor_contacts', (SELECT count(*) FROM sponsor_members WHERE person_id = ANY (_all)),
      'emails',           (SELECT count(*) FROM person_emails WHERE person_id = ANY (_all)),
      'phones',           (SELECT count(*) FROM person_phones WHERE person_id = ANY (_all)),
      'affiliations',     (SELECT count(*) FROM person_company_affiliations WHERE person_id = ANY (_all)),
      'accounts',         (SELECT count(*) FROM people WHERE id = ANY (_all) AND user_id IS NOT NULL),
      'survivor_has_account', (SELECT user_id IS NOT NULL FROM people WHERE id = _survivor));
  ELSIF _entity = 'company' THEN
    RETURN jsonb_build_object(
      'contacts',      (SELECT count(*) FROM people WHERE current_company_id = ANY (_all) AND merged_into IS NULL),
      'affiliations',  (SELECT count(*) FROM person_company_affiliations WHERE company_id = ANY (_all)),
      'registrations', (SELECT count(*) FROM registrations WHERE company_id = ANY (_all)),
      'events',        (SELECT count(DISTINCT event_id) FROM registrations WHERE company_id = ANY (_all)),
      'sponsorships',  (SELECT count(*) FROM event_sponsors es JOIN sponsors s ON s.id = es.sponsor_id WHERE s.company_id = ANY (_all)),
      'sponsors',      (SELECT count(*) FROM sponsors WHERE company_id = ANY (_all)),
      'subsidiaries',  (SELECT count(*) FROM companies WHERE parent_company_id = ANY (_all) AND merged_into IS NULL),
      'domains',       (SELECT count(*) FROM company_domains WHERE company_id = ANY (_all)),
      'identifiers',   (SELECT count(*) FROM company_identifiers WHERE company_id = ANY (_all)),
      'distinct_legal_entities', EXISTS (
         SELECT 1 FROM company_identifiers i1 JOIN company_identifiers i2 ON i1.scheme = i2.scheme AND i1.value <> i2.value
          WHERE i1.company_id = ANY (_all || _survivor) AND i2.company_id = ANY (_all || _survivor)),
      'parent_child', EXISTS (
         SELECT 1 FROM companies c WHERE c.id = ANY (_all || _survivor) AND c.parent_company_id = ANY (_all || _survivor)));
  END IF;
  RAISE EXCEPTION 'Unknown record type' USING ERRCODE = '22023';
END;
$$;
CREATE OR REPLACE FUNCTION public.intel_revert_merge(_merge uuid, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := public._require_super_admin();
  m    merge_operations%ROWTYPE;
  x    jsonb;
  _tbl text;
  _ref text;
  f    text;
BEGIN
  SELECT * INTO m FROM merge_operations WHERE id = _merge FOR UPDATE;
  IF NOT FOUND OR m.reverted_at IS NOT NULL THEN RAISE EXCEPTION 'This merge cannot be rolled back' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM intel_field_history h WHERE h.entity_type = m.entity_type AND h.entity_id = m.survivor_id
              AND h.created_at > m.created_at AND h.merge_id IS DISTINCT FROM m.id AND h.reverted_at IS NULL
              -- an entry that undid a later edit restores what the merge left
              AND h.source <> 'rollback') THEN
    RAISE EXCEPTION 'The surviving record was edited after this merge; revert those changes first' USING ERRCODE = '40001';
  END IF;
  IF EXISTS (SELECT 1 FROM merge_operations o WHERE o.reverted_at IS NULL AND o.created_at > m.created_at AND o.entity_type = m.entity_type
              AND (o.survivor_id = ANY (m.merged_ids || m.survivor_id) OR o.merged_ids && (m.merged_ids || m.survivor_id))) THEN
    RAISE EXCEPTION 'A later merge involves these records; roll that back first' USING ERRCODE = '40001';
  END IF;

  _ref := CASE m.entity_type WHEN 'person' THEN 'person_id' ELSE 'company_id' END;
  FOR x IN SELECT * FROM jsonb_array_elements(m.moved) LOOP
    _tbl := x ->> 'table';
    IF _tbl = 'company_aliases_added' THEN
      DELETE FROM company_aliases WHERE id = (x ->> 'id')::uuid;
    ELSIF _tbl = 'companies_parent_of_survivor' THEN
      UPDATE companies SET parent_company_id = (x ->> 'from')::uuid WHERE id = m.survivor_id;
    ELSIF _tbl = 'company_mentions' AND m.entity_type = 'person' THEN
      UPDATE company_mentions SET person_id = (x ->> 'from')::uuid
       WHERE company_id = (x ->> 'company_id')::uuid AND person_id = m.survivor_id;
    ELSIF _tbl = 'company_mentions' THEN
      UPDATE company_mentions SET company_id = (x ->> 'from')::uuid
       WHERE person_id = (x ->> 'person_id')::uuid AND company_id = m.survivor_id;
    ELSIF _tbl = 'people' AND m.entity_type = 'company' THEN
      UPDATE people SET current_company_id = (x ->> 'from')::uuid WHERE id = (x ->> 'id')::uuid AND current_company_id = m.survivor_id;
    ELSIF _tbl = 'companies' THEN
      UPDATE companies SET parent_company_id = (x ->> 'from')::uuid WHERE id = (x ->> 'id')::uuid AND parent_company_id = m.survivor_id;
    ELSE
      EXECUTE format('UPDATE public.%I SET %I = $1 WHERE id = $2 AND %I = $3', _tbl, _ref, _ref)
        USING (x ->> 'from')::uuid, (x ->> 'id')::uuid, m.survivor_id;
    END IF;
  END LOOP;
  FOR x IN SELECT * FROM jsonb_array_elements(m.removed) LOOP
    EXECUTE format('INSERT INTO public.%I SELECT * FROM jsonb_populate_record(NULL::public.%I, $1) ON CONFLICT DO NOTHING',
                   x ->> 'table', x ->> 'table') USING x -> 'row';
  END LOOP;

  -- The survivor's fields as they were, recorded as a rollback.
  FOR f IN SELECT jsonb_object_keys(m.field_choices) LOOP
    PERFORM public._intel_set_field(m.entity_type, m.survivor_id, f, m.survivor_before ->> f, 'rollback',
                                    COALESCE(_reason, 'Merge rolled back'), _uid, m.id);
  END LOOP;
  UPDATE intel_field_history SET reverted_at = now(), reverted_by = _uid
   WHERE merge_id = m.id AND source = 'merge';

  IF m.entity_type = 'person' THEN
    UPDATE people SET merged_into = NULL, updated_at = now() WHERE id = ANY (m.merged_ids) AND merged_into = m.survivor_id;
    UPDATE companies c SET entry_count = (SELECT count(*) FROM company_mentions cm WHERE cm.company_id = c.id)
     WHERE c.id IN (SELECT company_id FROM company_mentions WHERE person_id = ANY (m.merged_ids || m.survivor_id));
  ELSE
    UPDATE companies SET merged_into = NULL, updated_at = now() WHERE id = ANY (m.merged_ids) AND merged_into = m.survivor_id;
    UPDATE companies c SET entry_count = (SELECT count(*) FROM company_mentions cm WHERE cm.company_id = c.id)
     WHERE c.id = ANY (m.merged_ids || m.survivor_id);
  END IF;

  -- These records are separate again, so their suggestions are open again.
  IF m.entity_type = 'person' THEN
    UPDATE identity_match_candidates SET status = 'open', reviewed_by = NULL, reviewed_at = NULL
     WHERE status = 'merged' AND person_a = ANY (m.merged_ids || m.survivor_id) AND person_b = ANY (m.merged_ids || m.survivor_id);
  ELSE
    UPDATE company_match_candidates SET status = 'open', reviewed_by = NULL, reviewed_at = NULL
     WHERE status = 'merged' AND company_a = ANY (m.merged_ids || m.survivor_id) AND company_b = ANY (m.merged_ids || m.survivor_id);
  END IF;
  UPDATE merge_operations SET reverted_at = now(), reverted_by = _uid WHERE id = m.id;
  INSERT INTO audit_logs (actor_id, action, target_type, target_id, details)
  VALUES (_uid, 'intel.merge_reverted', m.entity_type, m.survivor_id::text,
          jsonb_build_object('merge_id', m.id, 'restored', m.merged_ids, 'reason', _reason));
END;
$$;
CREATE OR REPLACE FUNCTION public.intel_company_detail(_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c companies%ROWTYPE;
BEGIN
  PERFORM public._require_super_admin();
  SELECT * INTO c FROM companies WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Company not found' USING ERRCODE = 'P0002'; END IF;
  RETURN jsonb_build_object(
    'company', to_jsonb(c) || jsonb_build_object('parent_name', (SELECT name FROM companies WHERE id = c.parent_company_id)),
    'aliases', COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.alias) FROM company_aliases a WHERE a.company_id = _id), '[]'),
    'domains', COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.domain) FROM company_domains d WHERE d.company_id = _id), '[]'),
    'identifiers', COALESCE((SELECT jsonb_agg(to_jsonb(i)) FROM company_identifiers i WHERE i.company_id = _id), '[]'),
    'subsidiaries', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name)) FROM companies s WHERE s.parent_company_id = _id AND s.merged_into IS NULL), '[]'),
    'contacts', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name, 'designation', p.designation)) FROM (
                  SELECT * FROM people WHERE current_company_id = _id AND merged_into IS NULL ORDER BY display_name LIMIT 200) p), '[]'),
    'registrations', (SELECT count(*) FROM registrations WHERE company_id = _id),
    'sponsors', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'website', s.website,
                  'events', (SELECT count(*) FROM event_sponsors es WHERE es.sponsor_id = s.id)))
                  FROM sponsors s WHERE s.company_id = _id), '[]'),
    'merged_from', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name)) FROM companies m WHERE m.merged_into = _id), '[]'),
    'history', COALESCE((SELECT jsonb_agg(to_jsonb(h) ORDER BY h.created_at DESC) FROM (
                  SELECT * FROM intel_field_history WHERE entity_type = 'company' AND entity_id = _id ORDER BY created_at DESC LIMIT 100) h), '[]'),
    'suggestions', COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM correction_suggestions s
                  WHERE s.entity_type = 'company' AND s.entity_id = _id AND s.status = 'open'), '[]')
  );
END;
$$;


-- ── 5. Near-identical names ──────────────────────────────────────────────────

-- Share of three-letter sequences two keys have in common, 0 to 1.
CREATE OR REPLACE FUNCTION public._intel_name_similarity(_a text, _b text)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  WITH a AS (SELECT DISTINCT substr('  ' || _a || ' ', i, 3) g FROM generate_series(1, length(_a) + 1) i),
       b AS (SELECT DISTINCT substr('  ' || _b || ' ', i, 3) g FROM generate_series(1, length(_b) + 1) i)
  SELECT CASE WHEN COALESCE(_a, '') = '' OR COALESCE(_b, '') = '' THEN 0
              ELSE (SELECT count(*) FROM a JOIN b USING (g))::numeric
                 / NULLIF((SELECT count(*) FROM (SELECT g FROM a UNION SELECT g FROM b) u), 0) END;
$$;

CREATE OR REPLACE FUNCTION public.intel_refresh_person_duplicates()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n integer;
BEGIN
  PERFORM public._require_super_admin();
  WITH live AS (SELECT * FROM people WHERE merged_into IS NULL),
  -- Keys worked out once, so names are matched by a hash join rather than by
  -- comparing every contact with every other.
  name_parts AS MATERIALIZED (
    SELECT id, public.person_name_key(first_name) fk, public.person_name_key(last_name) lk
      FROM live WHERE first_name IS NOT NULL AND last_name IS NOT NULL
  ),
  company_keys AS (
    SELECT x.person_id, x.k FROM (
      SELECT r.person_id, public.company_name_key(r.company) k FROM registrations r WHERE r.person_id IS NOT NULL
      UNION SELECT s.person_id, public.company_name_key(s.company) FROM speakers s WHERE s.person_id IS NOT NULL
      UNION SELECT m.person_id, public.company_name_key(m.company) FROM sponsor_members m WHERE m.person_id IS NOT NULL
      UNION SELECT l.id, c.name_key FROM live l JOIN companies c ON c.id = l.current_company_id
    ) x WHERE x.k <> ''
  ),
  signals AS (
    SELECT LEAST(a.person_id, b.person_id) pa, GREATEST(a.person_id, b.person_id) pb,
           CASE WHEN a.verified_at IS NOT NULL AND b.verified_at IS NOT NULL THEN 70 ELSE 50 END w, 'phone' why
      FROM person_phones a JOIN person_phones b ON a.phone_e164 = b.phone_e164 AND a.person_id < b.person_id
    UNION ALL
    SELECT LEAST(a.person_id, b.person_id), GREATEST(a.person_id, b.person_id), 60, 'linkedin'
      FROM person_links a JOIN person_links b ON a.kind = 'linkedin' AND b.kind = 'linkedin' AND a.url_key = b.url_key AND a.person_id < b.person_id
    UNION ALL
    SELECT a.id, b.id, 25, 'same_name'
      FROM live a JOIN live b ON a.name_key = b.name_key AND a.id < b.id
     WHERE a.name_key LIKE '% %'
    UNION ALL
    SELECT LEAST(a.id, b.id), GREATEST(a.id, b.id), 20, 'swapped_name'
      FROM name_parts a JOIN name_parts b ON a.fk = b.lk AND a.lk = b.fk AND a.id <> b.id
     WHERE a.fk <> '' AND a.lk <> '' AND a.fk <> a.lk
    UNION ALL
    -- Nearly the same name at the same company. Only looked for within a
    -- company, so one common name elsewhere is never a signal.
    SELECT DISTINCT LEAST(a.id, b.id), GREATEST(a.id, b.id), 45, 'similar_name'
      FROM company_keys x JOIN company_keys y ON x.k = y.k AND x.person_id < y.person_id
      JOIN live a ON a.id = x.person_id JOIN live b ON b.id = y.person_id
     WHERE a.name_key <> '' AND b.name_key <> '' AND a.name_key <> b.name_key
       AND left(a.name_key, 1) = left(b.name_key, 1)
       AND public._intel_name_similarity(a.name_key, b.name_key) >= 0.6
  ),
  named AS (SELECT DISTINCT pa, pb FROM signals),
  extra AS (
    SELECT n.pa, n.pb, 20, 'same_company' FROM named n
     WHERE EXISTS (SELECT 1 FROM company_keys x JOIN company_keys y ON x.k = y.k WHERE x.person_id = n.pa AND y.person_id = n.pb)
    UNION ALL
    SELECT n.pa, n.pb, 5, 'same_designation' FROM named n JOIN live a ON a.id = n.pa JOIN live b ON b.id = n.pb
     WHERE lower(public.norm_text(a.designation)) = lower(public.norm_text(b.designation)) AND a.designation IS NOT NULL
  ),
  scored AS (
    SELECT pa, pb, LEAST(100, sum(w))::int score, ARRAY_AGG(DISTINCT why ORDER BY why) reasons
      FROM (SELECT * FROM signals UNION ALL SELECT * FROM extra) s
     WHERE pa IN (SELECT id FROM live) AND pb IN (SELECT id FROM live)
     GROUP BY pa, pb
  )
  INSERT INTO identity_match_candidates (person_a, person_b, reasons, score)
  SELECT pa, pb, reasons, score FROM scored WHERE score >= 40
  ON CONFLICT (person_a, person_b) DO UPDATE
    SET score = EXCLUDED.score,
        reasons = ARRAY(SELECT DISTINCT r FROM unnest(identity_match_candidates.reasons || EXCLUDED.reasons) r ORDER BY r);
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;
CREATE OR REPLACE FUNCTION public.intel_refresh_company_duplicates()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n integer;
BEGIN
  PERFORM public._require_super_admin();
  WITH live AS (SELECT * FROM companies WHERE merged_into IS NULL AND verification_status <> 'rejected'),
  signals AS (
    SELECT a.id ca, b.id cb, 60 w, 'same_name' why FROM live a JOIN live b ON a.name_key = b.name_key AND a.id < b.id
    UNION ALL
    SELECT LEAST(a.id, x.company_id), GREATEST(a.id, x.company_id), 50, 'alias'
      FROM live a JOIN company_aliases x ON x.alias_key = a.name_key AND x.company_id <> a.id
    UNION ALL
    SELECT LEAST(a.id, b.id), GREATEST(a.id, b.id), 35, 'initials'
      FROM live a JOIN live b ON a.id <> b.id AND length(a.name_key) BETWEEN 2 AND 6 AND a.name_key !~ ' '
       AND a.name_key = public._company_initials(b.name_key) AND b.name_key ~ ' '
    UNION ALL
    -- Nearly the same name; spelling slips and small additions.
    SELECT a.id, b.id, 45, 'similar_name'
      FROM live a JOIN live b ON a.id < b.id AND left(a.name_key, 3) = left(b.name_key, 3) AND a.name_key <> b.name_key
     WHERE public._intel_name_similarity(a.name_key, b.name_key) >= 0.6
  ),
  pairs AS (SELECT DISTINCT ca, cb FROM signals),
  domain_conflict AS (
    SELECT p.ca, p.cb, -30, 'different_domains' FROM pairs p
     WHERE EXISTS (SELECT 1 FROM company_domains d WHERE d.company_id = p.ca)
       AND EXISTS (SELECT 1 FROM company_domains d WHERE d.company_id = p.cb)
       AND NOT EXISTS (SELECT 1 FROM company_domains d1 JOIN company_domains d2 ON split_part(d1.domain, '.', 1) = split_part(d2.domain, '.', 1)
                        WHERE d1.company_id = p.ca AND d2.company_id = p.cb)
  ),
  scored AS (
    SELECT ca, cb, GREATEST(0, LEAST(100, sum(w)))::int score,
           ARRAY_AGG(DISTINCT why ORDER BY why) FILTER (WHERE w > 0) reasons
      FROM (SELECT * FROM signals UNION ALL SELECT * FROM domain_conflict) s
     GROUP BY ca, cb
  )
  INSERT INTO company_match_candidates (company_a, company_b, reasons, score)
  SELECT s.ca, s.cb, s.reasons, s.score FROM scored s
   WHERE s.score >= 30
     AND s.ca IN (SELECT id FROM live) AND s.cb IN (SELECT id FROM live)
     -- separate legal entities: different identifiers of the same kind
     AND NOT EXISTS (SELECT 1 FROM company_identifiers i1 JOIN company_identifiers i2 ON i1.scheme = i2.scheme AND i1.value <> i2.value
                      WHERE i1.company_id = s.ca AND i2.company_id = s.cb)
     -- parent and subsidiary
     AND NOT EXISTS (SELECT 1 FROM companies c WHERE (c.id = s.ca AND c.parent_company_id = s.cb) OR (c.id = s.cb AND c.parent_company_id = s.ca))
  ON CONFLICT (company_a, company_b) DO UPDATE SET score = EXCLUDED.score, reasons = EXCLUDED.reasons;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;


-- ── 6. Lists: pages, sorting, filters, totals ────────────────────────────────

DROP FUNCTION IF EXISTS public.intel_search_contacts(text, integer, integer, text);
DROP FUNCTION IF EXISTS public.intel_search_companies(text, integer, integer, text);
DROP FUNCTION IF EXISTS public.intel_duplicate_queue(text, text, integer, integer);
DROP FUNCTION IF EXISTS public.intel_corrections(text, text, text, integer);
DROP FUNCTION IF EXISTS public.intel_audit_history(text, uuid, text, timestamptz, timestamptz, integer);

CREATE OR REPLACE FUNCTION public.intel_search_contacts(_q text DEFAULT NULL, _limit integer DEFAULT 50, _offset integer DEFAULT 0, _filter text DEFAULT 'all',
  _sort text DEFAULT 'updated', _dir text DEFAULT 'desc', _country text DEFAULT NULL)
RETURNS TABLE (person_id uuid, display_name text, first_name text, last_name text, email text, phone text,
               company text, designation text, has_account boolean, registrations integer,
               created_at timestamptz, updated_at timestamptz, total bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _t  text := lower(public.norm_text(_q));
  _nk text := public.person_name_key(_q);
  _ph text := regexp_replace(COALESCE(_q, ''), '[^0-9]', '', 'g');
BEGIN
  PERFORM public._require_super_admin();
  RETURN QUERY
  WITH m AS (
    SELECT p.* FROM people p
     WHERE p.merged_into IS NULL
       AND (_t = '' OR p.id::text = _t
            OR (_nk <> '' AND p.name_key LIKE '%' || _nk || '%')
            OR EXISTS (SELECT 1 FROM person_emails e WHERE e.person_id = p.id AND e.email_key LIKE '%' || _t || '%')
            OR (length(_ph) >= 5 AND EXISTS (SELECT 1 FROM person_phones ph WHERE ph.person_id = p.id AND ph.phone_e164 LIKE '%' || _ph || '%'))
            OR EXISTS (SELECT 1 FROM person_links l WHERE l.person_id = p.id AND l.url_key LIKE '%' || _t || '%')
            OR lower(COALESCE(p.designation, '')) LIKE '%' || _t || '%'
            OR EXISTS (SELECT 1 FROM companies c WHERE c.id = p.current_company_id AND c.name_key LIKE '%' || public.company_name_key(_q) || '%' AND public.company_name_key(_q) <> ''))
       AND CASE _filter
             WHEN 'no_company' THEN p.current_company_id IS NULL
             WHEN 'incomplete' THEN p.first_name IS NULL OR p.last_name IS NULL OR p.designation IS NULL OR p.current_company_id IS NULL
             WHEN 'unverified' THEN NOT EXISTS (SELECT 1 FROM person_emails e WHERE e.person_id = p.id AND e.verified_at IS NOT NULL)
             WHEN 'with_account' THEN p.user_id IS NOT NULL
             WHEN 'possible_duplicate' THEN EXISTS (SELECT 1 FROM identity_match_candidates d WHERE d.status IN ('open','flagged') AND (d.person_a = p.id OR d.person_b = p.id))
             ELSE true END
       AND (NULLIF(btrim(_country), '') IS NULL OR lower(p.country) = lower(btrim(_country)))
  )
  SELECT m.id, m.display_name, m.first_name, m.last_name,
         (SELECT e.email FROM person_emails e WHERE e.person_id = m.id ORDER BY e.verified_at IS NULL, e.created_at LIMIT 1),
         (SELECT ph.phone_e164 FROM person_phones ph WHERE ph.person_id = m.id ORDER BY ph.verified_at IS NULL, ph.created_at LIMIT 1),
         (SELECT c.name FROM companies c WHERE c.id = m.current_company_id),
         m.designation, m.user_id IS NOT NULL,
         (SELECT count(*)::int FROM registrations r WHERE r.person_id = m.id),
         m.created_at, m.updated_at, count(*) OVER ()
    FROM m
    CROSS JOIN LATERAL (SELECT CASE _sort
        WHEN 'name' THEN lower(m.display_name)
        WHEN 'designation' THEN lower(m.designation)
        WHEN 'company' THEN (SELECT lower(c.name) FROM companies c WHERE c.id = m.current_company_id)
        WHEN 'events' THEN lpad((SELECT count(*) FROM registrations r WHERE r.person_id = m.id)::text, 10, '0')
        WHEN 'created' THEN m.created_at::text
        ELSE m.updated_at::text END AS k) o
   ORDER BY CASE WHEN lower(_dir) = 'asc' THEN o.k END ASC NULLS LAST,
            CASE WHEN lower(_dir) <> 'asc' THEN o.k END DESC NULLS LAST, m.id
   LIMIT LEAST(GREATEST(COALESCE(_limit, 50), 1), 200) OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$$;
CREATE OR REPLACE FUNCTION public.intel_search_companies(_q text DEFAULT NULL, _limit integer DEFAULT 50, _offset integer DEFAULT 0, _filter text DEFAULT 'all',
  _sort text DEFAULT 'entries', _dir text DEFAULT 'desc', _country text DEFAULT NULL, _industry text DEFAULT NULL)
RETURNS TABLE (company_id uuid, name text, website text, industry text, hq_country text, verification_status text,
               source text, contacts integer, entry_count integer, domains text[], created_at timestamptz, updated_at timestamptz, total bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _k text := public.company_name_key(_q);
  _d text := lower(public.norm_text(_q));
BEGIN
  PERFORM public._require_super_admin();
  RETURN QUERY
  WITH m AS (
    SELECT c.* FROM companies c
     WHERE c.merged_into IS NULL
       AND (_d = '' OR c.id::text = _d
            OR (_k <> '' AND (c.name_key LIKE '%' || _k || '%'
                              OR EXISTS (SELECT 1 FROM company_aliases a WHERE a.company_id = c.id AND a.alias_key LIKE '%' || _k || '%')))
            OR EXISTS (SELECT 1 FROM company_domains d WHERE d.company_id = c.id AND d.domain LIKE '%' || _d || '%')
            OR EXISTS (SELECT 1 FROM company_identifiers i WHERE i.company_id = c.id AND lower(i.value) = _d))
       AND CASE _filter
             WHEN 'no_domain'  THEN NOT EXISTS (SELECT 1 FROM company_domains d WHERE d.company_id = c.id)
             WHEN 'incomplete' THEN c.industry IS NULL OR c.website IS NULL OR c.hq_country IS NULL
             WHEN 'verified'   THEN c.verification_status = 'verified'
             WHEN 'provisional' THEN c.verification_status = 'provisional'
             WHEN 'has_sponsors' THEN EXISTS (SELECT 1 FROM sponsors s WHERE s.company_id = c.id)
             WHEN 'possible_duplicate' THEN EXISTS (SELECT 1 FROM company_match_candidates d WHERE d.status IN ('open','flagged') AND (d.company_a = c.id OR d.company_b = c.id))
             ELSE true END
       AND (NULLIF(btrim(_country), '') IS NULL OR lower(c.hq_country) = lower(btrim(_country)))
       AND (NULLIF(btrim(_industry), '') IS NULL OR lower(c.industry) = lower(btrim(_industry)))
  )
  SELECT m.id, m.name, m.website, m.industry, m.hq_country, m.verification_status, m.source,
         (SELECT count(DISTINCT pp.id)::int FROM people pp WHERE pp.current_company_id = m.id AND pp.merged_into IS NULL),
         m.entry_count,
         ARRAY(SELECT d.domain FROM company_domains d WHERE d.company_id = m.id ORDER BY d.domain),
         m.created_at, m.updated_at, count(*) OVER ()
    FROM m
    CROSS JOIN LATERAL (SELECT CASE _sort
        WHEN 'name' THEN lower(m.name)
        WHEN 'industry' THEN lower(m.industry)
        WHEN 'contacts' THEN lpad((SELECT count(*) FROM people pp WHERE pp.current_company_id = m.id AND pp.merged_into IS NULL)::text, 10, '0')
        WHEN 'created' THEN m.created_at::text
        WHEN 'updated' THEN m.updated_at::text
        ELSE lpad(m.entry_count::text, 10, '0') END AS k) o
   ORDER BY CASE WHEN lower(_dir) = 'asc' THEN o.k END ASC NULLS LAST,
            CASE WHEN lower(_dir) <> 'asc' THEN o.k END DESC NULLS LAST, m.name, m.id
   LIMIT LEAST(GREATEST(COALESCE(_limit, 50), 1), 200) OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$$;

-- {rows, total} — one page of duplicate suggestions, strongest first.
CREATE OR REPLACE FUNCTION public.intel_duplicate_queue(_entity text, _status text DEFAULT 'open', _min_score integer DEFAULT 0, _limit integer DEFAULT 25, _offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _lim integer := LEAST(GREATEST(COALESCE(_limit, 25), 1), 200);
  _off integer := GREATEST(COALESCE(_offset, 0), 0);
BEGIN
  PERFORM public._require_super_admin();
  IF _entity = 'person' THEN
    RETURN (
      WITH q AS (
        SELECT m.* FROM identity_match_candidates m
          JOIN people a ON a.id = m.person_a AND a.merged_into IS NULL
          JOIN people b ON b.id = m.person_b AND b.merged_into IS NULL
         WHERE m.status = COALESCE(_status, 'open') AND m.score >= COALESCE(_min_score, 0)
      ), page AS (SELECT * FROM q ORDER BY q.score DESC, q.id LIMIT _lim OFFSET _off)
      SELECT jsonb_build_object('total', (SELECT count(*) FROM q), 'rows', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', p.id, 'score', p.score, 'reasons', p.reasons, 'status', p.status,
                 'a', public._intel_person_card(p.person_a), 'b', public._intel_person_card(p.person_b)) ORDER BY p.score DESC, p.id)
          FROM page p), '[]'::jsonb)));
  ELSIF _entity = 'company' THEN
    RETURN (
      WITH q AS (
        SELECT m.* FROM company_match_candidates m
          JOIN companies a ON a.id = m.company_a AND a.merged_into IS NULL
          JOIN companies b ON b.id = m.company_b AND b.merged_into IS NULL
         WHERE m.status = COALESCE(_status, 'open') AND m.score >= COALESCE(_min_score, 0)
      ), page AS (SELECT * FROM q ORDER BY q.score DESC, q.id LIMIT _lim OFFSET _off)
      SELECT jsonb_build_object('total', (SELECT count(*) FROM q), 'rows', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', p.id, 'score', p.score, 'reasons', p.reasons, 'status', p.status,
                 'a', public._intel_company_card(p.company_a), 'b', public._intel_company_card(p.company_b)) ORDER BY p.score DESC, p.id)
          FROM page p), '[]'::jsonb)));
  END IF;
  RAISE EXCEPTION 'Unknown record type' USING ERRCODE = '22023';
END;
$$;

-- One decision on several suggestions, all or none.
CREATE OR REPLACE FUNCTION public.intel_set_duplicate_statuses(_entity text, _ids uuid[], _status text, _reason text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _id uuid;
  _n  integer := 0;
BEGIN
  PERFORM public._require_super_admin();
  FOREACH _id IN ARRAY COALESCE(_ids, '{}') LOOP
    PERFORM public.intel_set_duplicate_status(_entity, _id, _status, _reason);
    _n := _n + 1;
  END LOOP;
  RETURN _n;
END;
$$;

-- {rows, total} — one page of correction suggestions.
CREATE OR REPLACE FUNCTION public.intel_corrections(_status text DEFAULT 'open', _entity text DEFAULT NULL, _kind text DEFAULT NULL, _limit integer DEFAULT 25, _offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._require_super_admin();
  RETURN (
    WITH q AS (
      SELECT s.* FROM correction_suggestions s
       WHERE s.status = COALESCE(_status, 'open')
         AND (_entity IS NULL OR s.entity_type = _entity)
         AND (_kind IS NULL OR s.kind = _kind)
    ), page AS (
      SELECT * FROM q ORDER BY q.safe DESC, q.confidence DESC, q.created_at, q.id
       LIMIT LEAST(GREATEST(COALESCE(_limit, 25), 1), 200) OFFSET GREATEST(COALESCE(_offset, 0), 0)
    )
    SELECT jsonb_build_object(
      'total', (SELECT count(*) FROM q),
      'safe_total', (SELECT count(*) FROM q WHERE q.safe),
      'rows', COALESCE((SELECT jsonb_agg(to_jsonb(p) || jsonb_build_object('label',
             CASE p.entity_type WHEN 'person' THEN (SELECT display_name FROM people WHERE id = p.entity_id)
                                ELSE (SELECT name FROM companies WHERE id = p.entity_id) END)
             ORDER BY p.safe DESC, p.confidence DESC, p.created_at, p.id) FROM page p), '[]'::jsonb))
  );
END;
$$;

-- Bulk approval of every open formatting fix matching the current filters, not just one page.
CREATE OR REPLACE FUNCTION public.intel_approve_all_safe(_entity text DEFAULT NULL, _kind text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._require_super_admin();
  RETURN public.intel_bulk_approve_safe(ARRAY(
    SELECT id FROM correction_suggestions
     WHERE status = 'open' AND safe AND (_entity IS NULL OR entity_type = _entity) AND (_kind IS NULL OR kind = _kind)));
END;
$$;

-- {events, total, merges, merges_total} — one page of each.
CREATE OR REPLACE FUNCTION public.intel_audit_history(_entity text DEFAULT NULL, _entity_id uuid DEFAULT NULL, _action text DEFAULT NULL,
                                                      _from timestamptz DEFAULT NULL, _to timestamptz DEFAULT NULL, _limit integer DEFAULT 25, _offset integer DEFAULT 0, _merge_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _lim integer := LEAST(GREATEST(COALESCE(_limit, 25), 1), 200);
  _off integer := GREATEST(COALESCE(_offset, 0), 0);
BEGIN
  PERFORM public._require_super_admin();
  RETURN (
    WITH ev AS (
      SELECT a.* FROM audit_logs a
       WHERE (a.action LIKE 'intel.%' OR a.action LIKE 'identity.%' OR a.action LIKE 'company.%')
         AND (_entity IS NULL OR a.target_type = _entity)
         AND (_entity_id IS NULL OR a.target_id = _entity_id::text)
         AND (_action IS NULL OR a.action = _action)
         AND (_from IS NULL OR a.created_at >= _from) AND (_to IS NULL OR a.created_at < _to)
    ), evp AS (SELECT * FROM ev ORDER BY ev.created_at DESC, ev.id LIMIT _lim OFFSET _off),
    mo AS (
      SELECT m.* FROM merge_operations m
       WHERE (_entity IS NULL OR m.entity_type = _entity)
         AND (_entity_id IS NULL OR m.survivor_id = _entity_id OR _entity_id = ANY (m.merged_ids))
    )
    SELECT jsonb_build_object(
      'total', (SELECT count(*) FROM ev),
      'events', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'action', a.action, 'target_type', a.target_type, 'target_id', a.target_id,
                  'details', a.details, 'actor_id', a.actor_id,
                  'actor', COALESCE(a.actor_email, (SELECT u.email FROM auth.users u WHERE u.id = a.actor_id)),
                  'created_at', a.created_at) ORDER BY a.created_at DESC, a.id) FROM evp a), '[]'::jsonb),
      'merges_total', (SELECT count(*) FROM mo),
      'merges', COALESCE((SELECT jsonb_agg(row) FROM (
         SELECT jsonb_build_object('id', m.id, 'entity_type', m.entity_type, 'survivor_id', m.survivor_id, 'merged_ids', m.merged_ids,
                  'reason', m.reason, 'created_at', m.created_at, 'reverted_at', m.reverted_at,
                  'survivor', CASE m.entity_type WHEN 'person' THEN (SELECT display_name FROM people WHERE id = m.survivor_id)
                                                  ELSE (SELECT name FROM companies WHERE id = m.survivor_id) END) row
           FROM mo m ORDER BY m.created_at DESC, m.id LIMIT 10 OFFSET GREATEST(COALESCE(_merge_offset, 0), 0)) x), '[]'::jsonb))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.intel_overview(_from timestamptz DEFAULT NULL, _to timestamptz DEFAULT NULL, _country text DEFAULT NULL, _industry text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _p jsonb;
  _c jsonb;
BEGIN
  PERFORM public._require_super_admin();
  WITH pp AS (
    SELECT p.* FROM people p
     WHERE p.merged_into IS NULL
       AND (_from IS NULL OR p.created_at >= _from) AND (_to IS NULL OR p.created_at < _to)
       AND (_country IS NULL OR lower(p.country) = lower(_country))
  )
  SELECT jsonb_build_object(
    'contacts', count(*),
    'unverified', count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM person_emails e WHERE e.person_id = pp.id AND e.verified_at IS NOT NULL)),
    'incomplete', count(*) FILTER (WHERE pp.first_name IS NULL OR pp.last_name IS NULL OR pp.designation IS NULL OR pp.current_company_id IS NULL),
    'without_company', count(*) FILTER (WHERE pp.current_company_id IS NULL),
    'with_account', count(*) FILTER (WHERE pp.user_id IS NOT NULL),
    -- Quality: share of name, company, designation and a verified address present.
    'quality', COALESCE(round(100.0 * avg(
        ((pp.first_name IS NOT NULL AND pp.last_name IS NOT NULL)::int
       + (pp.current_company_id IS NOT NULL)::int
       + (pp.designation IS NOT NULL)::int
       + EXISTS (SELECT 1 FROM person_emails e WHERE e.person_id = pp.id AND e.verified_at IS NOT NULL)::int) / 4.0)), 0)
  ) INTO _p FROM pp;

  WITH cc AS (
    SELECT c.* FROM companies c
     WHERE c.merged_into IS NULL AND c.verification_status <> 'rejected'
       AND (_from IS NULL OR c.created_at >= _from) AND (_to IS NULL OR c.created_at < _to)
       AND (_country IS NULL OR lower(c.hq_country) = lower(_country))
       AND (_industry IS NULL OR lower(c.industry) = lower(_industry))
  )
  SELECT jsonb_build_object(
    'companies', count(*),
    'missing_domain', count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM company_domains d WHERE d.company_id = cc.id)),
    'provisional', count(*) FILTER (WHERE cc.verification_status = 'provisional'),
    'incomplete', count(*) FILTER (WHERE cc.industry IS NULL OR cc.website IS NULL)
  ) INTO _c FROM cc;

  RETURN jsonb_build_object(
    'people', _p, 'companies', _c,
    'duplicate_contacts', (SELECT count(*) FROM identity_match_candidates m JOIN people a ON a.id = m.person_a JOIN people b ON b.id = m.person_b
                            WHERE m.status IN ('open','flagged') AND a.merged_into IS NULL AND b.merged_into IS NULL AND m.score >= 60),
    'duplicate_companies', (SELECT count(*) FROM company_match_candidates m JOIN companies a ON a.id = m.company_a JOIN companies b ON b.id = m.company_b
                            WHERE m.status IN ('open','flagged') AND a.merged_into IS NULL AND b.merged_into IS NULL AND m.score >= 60),
    'flagged', (SELECT count(*) FROM identity_match_candidates WHERE status = 'flagged') + (SELECT count(*) FROM company_match_candidates WHERE status = 'flagged'),
    'corrections_open', (SELECT count(*) FROM correction_suggestions WHERE status = 'open'),
    'corrections_safe', (SELECT count(*) FROM correction_suggestions WHERE status = 'open' AND safe),
    'association_suggestions', (SELECT count(*) FROM correction_suggestions WHERE status = 'open' AND kind IN ('conflicting','missing_domain')),
    'merges', (SELECT count(*) FROM merge_operations WHERE reverted_at IS NULL),
    'sponsors_unconnected', (SELECT count(*) FROM sponsors WHERE company_id IS NULL),
    'sponsors_repeats', (SELECT count(*) FROM sponsors s WHERE s.company_id IS NOT NULL
                          AND EXISTS (SELECT 1 FROM sponsors o WHERE o.company_id = s.company_id AND o.id <> s.id))
  );
END;
$$;


-- ── 7. Who may call what ─────────────────────────────────────────────────────

DO $$
DECLARE f text;
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public._intel_name_similarity(text, text) FROM PUBLIC, anon, authenticated';
  EXECUTE 'REVOKE ALL ON FUNCTION public.note_company_from_sponsor() FROM PUBLIC, anon, authenticated';
  FOREACH f IN ARRAY ARRAY[
    'intel_search_contacts(text, integer, integer, text, text, text, text)',
    'intel_search_companies(text, integer, integer, text, text, text, text, text)',
    'intel_duplicate_queue(text, text, integer, integer, integer)',
    'intel_corrections(text, text, text, integer, integer)',
    'intel_audit_history(text, uuid, text, timestamptz, timestamptz, integer, integer, integer)',
    'intel_set_duplicate_statuses(text, uuid[], text, text)',
    'intel_search_sponsors(text, integer, integer, text)',
    'intel_connect_sponsor(uuid, uuid, text)',
    'intel_approve_all_safe(text, text)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;
