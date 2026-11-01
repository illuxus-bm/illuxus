-- ═══════════════════════════════════════════════════════════════════════════════
-- Intelligence Centre: contact and company correction, duplicates, merges.
--
-- Builds on migration 060 (people, companies) and its review queue. For
-- Super Admin only — every function below checks the platform admin role
-- itself; nothing here is reachable by organisers or attendees, and the
-- tables stay closed to clients.
--
--   • people gain a current profile (first/last name, designation,
--     department, location, current company); filled once from the newest
--     records, never from or into registrations, which keep exactly what
--     was submitted.
--   • intel_field_history: every change to a contact or company field —
--     old value, new value, source, who, why — so nothing is overwritten
--     without a trace and single changes can be reverted.
--   • Duplicates: weighted scores for contact pairs (shared phone, LinkedIn,
--     name, company, designation, swapped names) and company pairs (same
--     name, alias, initials, domain), never for separate legal entities.
--     Scores are recommendations; nothing merges on its own.
--   • Merges: one transaction each. The surviving record keeps its id; the
--     others point at it (merged_into) and everything that referred to them
--     — emails, phones, links, affiliations, registrations, speaker and
--     sponsor-contact records, set-up links — moves to it. Two login
--     accounts are never merged and a login is never transferred: the
--     record with the login must be the one that survives. Every merge can
--     be rolled back until something changes afterwards.
--   • Corrections: suggestions (capitalisation, spacing, swapped names,
--     missing details, conflicting designations, missing company domains)
--     with the current value, the suggested one, the reason, a confidence
--     and the evidence. Formatting-only fixes can be approved in bulk;
--     everything else one at a time.
--
-- Run RUN_ME_company_suggestions.sql (061) and RUN_ME_invitation_prefill.sql
-- (062) first. Safe to run more than once. Paste into the SQL Editor and Run.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ── 1. Records ────────────────────────────────────────────────────────────────

ALTER TABLE public.people ADD COLUMN IF NOT EXISTS first_name         text;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS last_name          text;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS designation        text;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS department         text;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS city               text;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS country            text;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS current_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS merged_into        uuid REFERENCES public.people(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS people_merged_into_idx ON public.people (merged_into) WHERE merged_into IS NOT NULL;

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS common_name        text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS company_type       text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS company_status     text NOT NULL DEFAULT 'active';
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS registered_address text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS merged_into        uuid REFERENCES public.companies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS companies_merged_into_idx ON public.companies (merged_into) WHERE merged_into IS NOT NULL;

-- Review queue: a score, and more decisions than same/different.
ALTER TABLE public.identity_match_candidates ADD COLUMN IF NOT EXISTS score integer NOT NULL DEFAULT 0;
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
   WHERE conrelid = 'public.identity_match_candidates'::regclass AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%status%';
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE public.identity_match_candidates DROP CONSTRAINT %I', c); END IF;
  ALTER TABLE public.identity_match_candidates ADD CONSTRAINT identity_match_candidates_status_check
    CHECK (status IN ('open','same_person','different_people','ignored','flagged','merged'));
END $$;

CREATE TABLE IF NOT EXISTS public.company_match_candidates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_a   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  company_b   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  reasons     text[] NOT NULL,
  score       integer NOT NULL DEFAULT 0,
  status      text NOT NULL DEFAULT 'open'
              CHECK (status IN ('open','same_company','different_companies','ignored','flagged','merged')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (company_a < company_b),
  UNIQUE (company_a, company_b)
);

-- Field-level provenance: one row per change.
CREATE TABLE IF NOT EXISTS public.intel_field_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('person','company')),
  entity_id   uuid NOT NULL,
  field       text NOT NULL,
  old_value   text,
  new_value   text,
  source      text NOT NULL CHECK (source IN ('manual','correction','merge','rollback','inferred','import','enriched','registration')),
  reason      text,
  actor_id    uuid,
  merge_id    uuid,
  reverted_at timestamptz,
  reverted_by uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS intel_field_history_entity_idx ON public.intel_field_history (entity_type, entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.merge_operations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type     text NOT NULL CHECK (entity_type IN ('person','company')),
  survivor_id     uuid NOT NULL,
  merged_ids      uuid[] NOT NULL,
  field_choices   jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- {table, id, from} for every row moved to the survivor
  moved           jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- full rows removed because the survivor already had the same value
  removed         jsonb NOT NULL DEFAULT '[]'::jsonb,
  survivor_before jsonb NOT NULL,
  reason          text,
  actor_id        uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  reverted_at     timestamptz,
  reverted_by     uuid
);

CREATE TABLE IF NOT EXISTS public.correction_suggestions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type     text NOT NULL CHECK (entity_type IN ('person','company')),
  entity_id       uuid NOT NULL,
  field           text NOT NULL,
  kind            text NOT NULL,
  current_value   text,
  suggested_value text,
  reason          text NOT NULL,
  confidence      integer NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  evidence        text,
  -- formatting only (case, spacing): may be approved in bulk
  safe            boolean NOT NULL DEFAULT false,
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open','approved','rejected','stale')),
  reviewed_by     uuid,
  reviewed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS correction_suggestions_one_open
  ON public.correction_suggestions (entity_type, entity_id, field, kind) WHERE status = 'open';

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['company_match_candidates','intel_field_history','merge_operations','correction_suggestions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', t);
  END LOOP;
END $$;


-- ── 2. Guards and the one way fields change ──────────────────────────────────

CREATE OR REPLACE FUNCTION public._require_super_admin()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only Super Admin can use the Intelligence Centre' USING ERRCODE = '42501';
  END IF;
  RETURN auth.uid();
END;
$$;

-- Editable fields, per kind of record.
CREATE OR REPLACE FUNCTION public._intel_field_allowed(_entity text, _field text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE _entity
    WHEN 'person'  THEN _field IN ('first_name','last_name','display_name','designation','department','city','country','current_company_id')
    WHEN 'company' THEN _field IN ('name','legal_name','common_name','description','website','industry','sub_industry',
                                   'employee_range','revenue_range','hq_city','hq_country','registered_address',
                                   'company_type','company_status','parent_company_id','corporate_group','verification_status')
    ELSE false END;
$$;

/*
 * Sets one field on a person or company and records the change (old value,
 * new value, source, who, why). The only way these functions change a
 * field. Returns false when the value is unchanged.
 */
CREATE OR REPLACE FUNCTION public._intel_set_field(
  _entity text, _id uuid, _field text, _value text, _source text, _reason text, _actor uuid, _merge uuid DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _table text := CASE _entity WHEN 'person' THEN 'people' WHEN 'company' THEN 'companies' END;
  _old   text;
  _new   text := NULLIF(public.norm_text(_value), '');
BEGIN
  IF _table IS NULL OR NOT public._intel_field_allowed(_entity, _field) THEN
    RAISE EXCEPTION 'Field % cannot be edited here', _field USING ERRCODE = '22023';
  END IF;
  IF _field IN ('current_company_id','parent_company_id') AND _new IS NOT NULL THEN
    PERFORM 1 FROM companies WHERE id = _new::uuid AND merged_into IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Unknown company' USING ERRCODE = '22023'; END IF;
    IF _field = 'parent_company_id' AND _new::uuid = _id THEN
      RAISE EXCEPTION 'A company cannot be its own parent' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF _field = 'verification_status' AND _new NOT IN ('provisional','verified','rejected') THEN
    RAISE EXCEPTION 'Unknown verification status' USING ERRCODE = '22023';
  END IF;
  IF _field = 'name' AND _new IS NULL THEN
    RAISE EXCEPTION 'A company needs a name' USING ERRCODE = '22023';
  END IF;

  EXECUTE format('SELECT %I::text FROM public.%I WHERE id = $1 FOR UPDATE', _field, _table) INTO _old USING _id;
  IF _old IS NOT DISTINCT FROM _new THEN RETURN false; END IF;

  IF _field IN ('current_company_id','parent_company_id') THEN
    EXECUTE format('UPDATE public.%I SET %I = $1::uuid, updated_at = now() WHERE id = $2', _table, _field) USING _new, _id;
  ELSE
    EXECUTE format('UPDATE public.%I SET %I = $1, updated_at = now() WHERE id = $2', _table, _field) USING _new, _id;
  END IF;
  IF _entity = 'person' AND _field IN ('first_name','last_name','display_name') THEN
    UPDATE people
       SET display_name = CASE WHEN _field = 'display_name' THEN display_name
                               ELSE COALESCE(NULLIF(btrim(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')), ''), display_name) END,
           name_key = public.person_name_key(CASE WHEN _field = 'display_name' THEN display_name
                               ELSE COALESCE(NULLIF(btrim(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')), ''), display_name) END)
     WHERE id = _id;
  ELSIF _entity = 'company' AND _field = 'name' THEN
    UPDATE companies SET name_key = public.company_name_key(name) WHERE id = _id;
  END IF;

  INSERT INTO intel_field_history (entity_type, entity_id, field, old_value, new_value, source, reason, actor_id, merge_id)
  VALUES (_entity, _id, _field, _old, _new, _source, _reason, _actor, _merge);
  RETURN true;
END;
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['_require_super_admin()', '_intel_field_allowed(text, text)',
                           '_intel_set_field(text, uuid, text, text, text, text, uuid, uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
END $$;


-- ── 3. A current profile for each person (once; never overwrites) ───────────

DO $$
DECLARE
  p   record;
  pre jsonb;
BEGIN
  FOR p IN
    SELECT pe.id, (SELECT e.email FROM person_emails e WHERE e.person_id = pe.id ORDER BY e.verified_at IS NULL, e.created_at LIMIT 1) AS email
      FROM people pe
     WHERE pe.merged_into IS NULL AND pe.first_name IS NULL AND pe.last_name IS NULL AND pe.designation IS NULL
  LOOP
    CONTINUE WHEN p.email IS NULL;
    pre := public.invitation_prefill(p.email, false);
    UPDATE people
       SET first_name  = COALESCE(first_name,  pre ->> 'first_name'),
           last_name   = COALESCE(last_name,   pre ->> 'last_name'),
           designation = COALESCE(designation, pre ->> 'designation')
     WHERE id = p.id;
    INSERT INTO intel_field_history (entity_type, entity_id, field, old_value, new_value, source, reason)
    SELECT 'person', p.id, f, NULL, pre ->> f, 'inferred', 'Filled from the newest registration, speaker or sponsor-contact record'
      FROM unnest(ARRAY['first_name','last_name','designation']) f
     WHERE NULLIF(pre ->> f, '') IS NOT NULL;
  END LOOP;
  UPDATE people pe
     SET current_company_id = (SELECT a.company_id FROM person_company_affiliations a
                                WHERE a.person_id = pe.id AND a.is_current ORDER BY a.created_at DESC LIMIT 1)
   WHERE pe.current_company_id IS NULL;
END $$;


-- ── 4. Duplicate scores ──────────────────────────────────────────────────────

/*
 * Scores pairs of people that may be the same person. Each signal adds
 * weight; a phone or LinkedIn verified on both sides weighs most. The score
 * is a recommendation — shared phones can be office lines, shared names are
 * common. Decided pairs keep their decision.
 */
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

-- Initials, for "TCS" against "Tata Consultancy Services".
CREATE OR REPLACE FUNCTION public._company_initials(_key text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT string_agg(left(w, 1), '' ORDER BY i)
    FROM unnest(string_to_array(_key, ' ')) WITH ORDINALITY AS t(w, i)
   WHERE w NOT IN ('and','of','the','for');
$$;

/*
 * Scores pairs of companies that may be one company. Never pairs records
 * with different registry identifiers of the same kind (two legal
 * entities), or a parent with its subsidiary; a different website domain
 * on each side lowers the score.
 */
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


-- ── 5. Corrections ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._intel_suggest(
  _entity text, _id uuid, _field text, _kind text, _current text, _suggested text,
  _reason text, _confidence integer, _evidence text, _safe boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- A suggestion already decided for this exact value is not raised again.
  IF EXISTS (SELECT 1 FROM correction_suggestions c
              WHERE c.entity_type = _entity AND c.entity_id = _id AND c.field = _field AND c.kind = _kind
                AND c.status IN ('rejected','approved') AND c.suggested_value IS NOT DISTINCT FROM _suggested
                AND c.current_value IS NOT DISTINCT FROM _current) THEN
    RETURN;
  END IF;
  INSERT INTO correction_suggestions (entity_type, entity_id, field, kind, current_value, suggested_value, reason, confidence, evidence, safe)
  VALUES (_entity, _id, _field, _kind, _current, _suggested, _reason, _confidence, _evidence, _safe)
  ON CONFLICT (entity_type, entity_id, field, kind) WHERE status = 'open'
  DO UPDATE SET current_value = EXCLUDED.current_value, suggested_value = EXCLUDED.suggested_value,
                reason = EXCLUDED.reason, confidence = EXCLUDED.confidence, evidence = EXCLUDED.evidence;
END;
$$;
REVOKE ALL ON FUNCTION public._intel_suggest(text, uuid, text, text, text, text, text, integer, text, boolean) FROM PUBLIC, anon, authenticated;

-- "AMAN" / "aman" → "Aman"; leaves mixed case ("McKenzie", "deShawn") alone.
CREATE OR REPLACE FUNCTION public._intel_name_case(_v text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN _v IS NULL OR length(_v) < 2 THEN NULL
              WHEN _v = upper(_v) OR _v = lower(_v) THEN initcap(_v)
         END;
$$;

/*
 * Looks for fixable data and queues suggestions: names in all capitals or
 * all lower case, extra spaces, first and last names swapped against the
 * person's own registrations, details missing from the profile but present
 * in their records, designations that conflict between records, and
 * companies without a domain or industry. Suggestions that no longer apply
 * are marked stale. Returns the number of open suggestions.
 */
CREATE OR REPLACE FUNCTION public.intel_generate_corrections()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p   record;
  c   record;
  f   text;
  v   text;
  fix text;
  pre jsonb;
  _n  integer;
BEGIN
  PERFORM public._require_super_admin();

  FOR p IN SELECT * FROM people WHERE merged_into IS NULL LOOP
    FOREACH f IN ARRAY ARRAY['first_name','last_name','designation','department','city'] LOOP
      v := to_jsonb(p) ->> f;
      CONTINUE WHEN v IS NULL;
      IF v <> public.norm_text(v) THEN
        PERFORM public._intel_suggest('person', p.id, f, 'spacing', v, public.norm_text(v),
          'Extra or unusual spaces', 95, 'Formatting rule', true);
      ELSIF f IN ('first_name','last_name','city') AND public._intel_name_case(v) IS NOT NULL AND public._intel_name_case(v) <> v THEN
        PERFORM public._intel_suggest('person', p.id, f, 'capitalisation', v, public._intel_name_case(v),
          'Written in all capitals or all lower case', 90, 'Formatting rule', true);
      END IF;
    END LOOP;

    -- Swapped names: the person's own registration has them the other way round.
    IF p.first_name IS NOT NULL AND p.last_name IS NOT NULL AND EXISTS (
         SELECT 1 FROM registrations r WHERE r.person_id = p.id
            AND public.person_name_key(r.first_name) = public.person_name_key(p.last_name)
            AND public.person_name_key(r.last_name)  = public.person_name_key(p.first_name)) THEN
      PERFORM public._intel_suggest('person', p.id, 'first_name', 'swapped_names', p.first_name, p.last_name,
        'First and last name look swapped', 60,
        'A registration by this person has them the other way round', false);
    END IF;

    -- Missing details that the person's own records hold.
    v := NULL;
    IF p.first_name IS NULL OR p.last_name IS NULL OR p.designation IS NULL THEN
      SELECT e.email INTO v FROM person_emails e WHERE e.person_id = p.id ORDER BY e.verified_at IS NULL, e.created_at LIMIT 1;
    END IF;
    IF v IS NOT NULL THEN
      pre := public.invitation_prefill(v, false);
      FOREACH f IN ARRAY ARRAY['first_name','last_name','designation'] LOOP
        IF to_jsonb(p) ->> f IS NULL AND NULLIF(pre ->> f, '') IS NOT NULL THEN
          PERFORM public._intel_suggest('person', p.id, f, 'missing', NULL, pre ->> f,
            'Missing from the profile', 75, 'Newest registration, speaker or sponsor-contact record', false);
        END IF;
      END LOOP;
    END IF;

    -- Designations that disagree between the person's records.
    SELECT string_agg(DISTINCT public.norm_text(d), ' | ') INTO v
      FROM (SELECT r.designation d FROM registrations r WHERE r.person_id = p.id
            UNION ALL SELECT s.designation FROM speakers s WHERE s.person_id = p.id
            UNION ALL SELECT m.designation FROM sponsor_members m WHERE m.person_id = p.id) x
     WHERE NULLIF(btrim(d), '') IS NOT NULL;
    IF v LIKE '%|%' THEN
      SELECT public.norm_text(d) INTO fix FROM (
        SELECT r.designation d, r.created_at t FROM registrations r WHERE r.person_id = p.id
        UNION ALL SELECT s.designation, s.updated_at FROM speakers s WHERE s.person_id = p.id
        UNION ALL SELECT m.designation, m.updated_at FROM sponsor_members m WHERE m.person_id = p.id) x
       WHERE NULLIF(btrim(d), '') IS NOT NULL ORDER BY t DESC LIMIT 1;
      IF fix IS DISTINCT FROM p.designation THEN
        PERFORM public._intel_suggest('person', p.id, 'designation', 'conflicting', p.designation, fix,
          'Records disagree on the designation; this is the newest', 50, 'Seen: ' || v, false);
      END IF;
    END IF;
  END LOOP;

  FOR c IN SELECT * FROM companies WHERE merged_into IS NULL AND verification_status <> 'rejected' LOOP
    IF c.name <> public.norm_text(c.name) THEN
      PERFORM public._intel_suggest('company', c.id, 'name', 'spacing', c.name, public.norm_text(c.name),
        'Extra or unusual spaces', 95, 'Formatting rule', true);
    END IF;
    -- Website from the work-email domain most of its people share.
    IF c.website IS NULL AND NOT EXISTS (SELECT 1 FROM company_domains d WHERE d.company_id = c.id) THEN
      SELECT x.dom INTO fix FROM (
        SELECT public.email_domain(e.email) dom, count(*) n
          FROM company_mentions m JOIN person_emails e ON e.person_id = m.person_id
         WHERE m.company_id = c.id
         GROUP BY 1) x
       WHERE x.dom IS NOT NULL AND NOT EXISTS (SELECT 1 FROM personal_email_domains pd WHERE pd.domain = x.dom)
         AND NOT EXISTS (SELECT 1 FROM company_domains d WHERE d.domain = x.dom)
       ORDER BY x.n DESC LIMIT 1;
      IF fix IS NOT NULL THEN
        PERFORM public._intel_suggest('company', c.id, 'website', 'missing_domain', NULL, 'https://' || fix,
          'No website or domain on record', 55, 'Work-email domain of people who entered this company', false);
      ELSE
        PERFORM public._intel_suggest('company', c.id, 'website', 'missing_domain', NULL, NULL,
          'No website or domain on record', 40, 'No work-email domain to suggest', false);
      END IF;
    END IF;
    IF c.industry IS NULL THEN
      PERFORM public._intel_suggest('company', c.id, 'industry', 'incomplete', NULL, NULL,
        'Industry missing', 40, NULL, false);
    END IF;
  END LOOP;

  -- Suggestions whose field has changed since are no longer valid.
  UPDATE correction_suggestions s SET status = 'stale'
   WHERE s.status = 'open' AND s.current_value IS DISTINCT FROM (
     CASE s.entity_type
       WHEN 'person'  THEN (SELECT to_jsonb(x) ->> s.field FROM people x WHERE x.id = s.entity_id)
       WHEN 'company' THEN (SELECT to_jsonb(x) ->> s.field FROM companies x WHERE x.id = s.entity_id)
     END);

  SELECT count(*) INTO _n FROM correction_suggestions WHERE status = 'open';
  RETURN _n;
END;
$$;

/*
 * Approves (optionally with an edited value) or rejects one suggestion.
 * Approving writes the field through _intel_set_field, so the old value is
 * kept in the history. A suggestion with nothing to apply can only be
 * approved with a value.
 */
CREATE OR REPLACE FUNCTION public.intel_review_correction(_id uuid, _approve boolean, _value text DEFAULT NULL, _reason text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := public._require_super_admin();
  s    correction_suggestions%ROWTYPE;
  _v   text;
  _cur text;
BEGIN
  SELECT * INTO s FROM correction_suggestions WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR s.status <> 'open' THEN RAISE EXCEPTION 'This suggestion is no longer open' USING ERRCODE = '22023'; END IF;
  IF NOT _approve THEN
    UPDATE correction_suggestions SET status = 'rejected', reviewed_by = _uid, reviewed_at = now() WHERE id = _id;
    INSERT INTO audit_logs (actor_id, action, target_type, target_id, details)
    VALUES (_uid, 'intel.correction_rejected', s.entity_type, s.entity_id::text,
            jsonb_build_object('field', s.field, 'kind', s.kind, 'current', s.current_value, 'suggested', s.suggested_value, 'reason', _reason));
    RETURN 'rejected';
  END IF;
  _v := COALESCE(NULLIF(public.norm_text(_value), ''), s.suggested_value);
  IF _v IS NULL THEN RAISE EXCEPTION 'Enter the value to apply' USING ERRCODE = '22023'; END IF;
  -- Refuse if the field changed after the suggestion was made.
  _cur := CASE s.entity_type
            WHEN 'person'  THEN (SELECT to_jsonb(x) ->> s.field FROM people x WHERE x.id = s.entity_id)
            ELSE (SELECT to_jsonb(x) ->> s.field FROM companies x WHERE x.id = s.entity_id) END;
  IF _cur IS DISTINCT FROM s.current_value THEN
    UPDATE correction_suggestions SET status = 'stale' WHERE id = _id;
    RAISE EXCEPTION 'The field changed since this was suggested; review it again' USING ERRCODE = '40001';
  END IF;
  IF s.kind = 'swapped_names' THEN
    PERFORM public._intel_set_field('person', s.entity_id, 'last_name', s.current_value, 'correction', COALESCE(_reason, s.reason), _uid);
  END IF;
  PERFORM public._intel_set_field(s.entity_type, s.entity_id, s.field, _v, 'correction', COALESCE(_reason, s.reason), _uid);
  UPDATE correction_suggestions SET status = 'approved', suggested_value = _v, reviewed_by = _uid, reviewed_at = now() WHERE id = _id;
  INSERT INTO audit_logs (actor_id, action, target_type, target_id, details)
  VALUES (_uid, 'intel.correction_approved', s.entity_type, s.entity_id::text,
          jsonb_build_object('field', s.field, 'kind', s.kind, 'from', s.current_value, 'to', _v, 'edited', _value IS NOT NULL));
  RETURN 'approved';
END;
$$;

-- Bulk approval: formatting-only suggestions (spacing, capitalisation) alone.
CREATE OR REPLACE FUNCTION public.intel_bulk_approve_safe(_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _id uuid;
  _n  integer := 0;
BEGIN
  PERFORM public._require_super_admin();
  FOR _id IN SELECT id FROM correction_suggestions WHERE id = ANY (_ids) AND status = 'open' AND safe LOOP
    BEGIN
      PERFORM public.intel_review_correction(_id, true, NULL, 'Bulk-approved formatting fix');
      _n := _n + 1;
    EXCEPTION WHEN SQLSTATE '40001' THEN NULL;  -- changed meanwhile: left for individual review
    END;
  END LOOP;
  RETURN _n;
END;
$$;


-- ── 6. Search, detail and editing ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.intel_search_contacts(_q text DEFAULT NULL, _limit integer DEFAULT 50, _offset integer DEFAULT 0, _filter text DEFAULT 'all')
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
             ELSE true END
  )
  SELECT m.id, m.display_name, m.first_name, m.last_name,
         (SELECT e.email FROM person_emails e WHERE e.person_id = m.id ORDER BY e.verified_at IS NULL, e.created_at LIMIT 1),
         (SELECT ph.phone_e164 FROM person_phones ph WHERE ph.person_id = m.id ORDER BY ph.verified_at IS NULL, ph.created_at LIMIT 1),
         (SELECT c.name FROM companies c WHERE c.id = m.current_company_id),
         m.designation, m.user_id IS NOT NULL,
         (SELECT count(*)::int FROM registrations r WHERE r.person_id = m.id),
         m.created_at, m.updated_at, count(*) OVER ()
    FROM m
   ORDER BY m.updated_at DESC
   LIMIT LEAST(GREATEST(COALESCE(_limit, 50), 1), 200) OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.intel_contact_detail(_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE p people%ROWTYPE;
BEGIN
  PERFORM public._require_super_admin();
  SELECT * INTO p FROM people WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contact not found' USING ERRCODE = 'P0002'; END IF;
  RETURN jsonb_build_object(
    'person', to_jsonb(p) || jsonb_build_object('company_name', (SELECT name FROM companies WHERE id = p.current_company_id)),
    'merged_into', p.merged_into,
    'emails', COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.created_at) FROM person_emails e WHERE e.person_id = _id), '[]'),
    'phones', COALESCE((SELECT jsonb_agg(to_jsonb(ph) ORDER BY ph.created_at) FROM person_phones ph WHERE ph.person_id = _id), '[]'),
    'links', COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.created_at) FROM person_links l WHERE l.person_id = _id), '[]'),
    'affiliations', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'company_id', a.company_id, 'company', c.name,
                     'designation', a.designation, 'is_current', a.is_current, 'source', a.source, 'created_at', a.created_at) ORDER BY a.created_at DESC)
                     FROM person_company_affiliations a JOIN companies c ON c.id = a.company_id WHERE a.person_id = _id), '[]'),
    'registrations', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'event_id', r.event_id, 'event', e.title, 'date', e.date,
                     'name', r.name, 'email', r.email, 'company', r.company, 'designation', r.designation,
                     'approval_status', r.approval_status, 'checked_in', r.checked_in, 'created_at', r.created_at) ORDER BY r.created_at DESC)
                     FROM registrations r LEFT JOIN events e ON e.id = r.event_id WHERE r.person_id = _id), '[]'),
    'speakers', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'email', s.email, 'company', s.company,
                     'designation', s.designation, 'events', (SELECT COALESCE(jsonb_agg(ev.title), '[]') FROM event_speakers es JOIN events ev ON ev.id = es.event_id WHERE es.speaker_id = s.id)))
                     FROM speakers s WHERE s.person_id = _id), '[]'),
    'sponsor_contacts', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', m.id, 'sponsor', sp.name, 'email', m.email,
                     'designation', m.designation, 'accepted_at', m.accepted_at))
                     FROM sponsor_members m JOIN sponsors sp ON sp.id = m.sponsor_id WHERE m.person_id = _id), '[]'),
    'organisations', COALESCE((SELECT jsonb_agg(jsonb_build_object('org', o.name, 'role', om.role))
                     FROM org_members om JOIN organizations o ON o.id = om.org_id WHERE p.user_id IS NOT NULL AND om.user_id = p.user_id), '[]'),
    'history', COALESCE((SELECT jsonb_agg(to_jsonb(h) ORDER BY h.created_at DESC) FROM (
                     SELECT * FROM intel_field_history WHERE entity_type = 'person' AND entity_id = _id ORDER BY created_at DESC LIMIT 100) h), '[]'),
    'suggestions', COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM correction_suggestions s
                     WHERE s.entity_type = 'person' AND s.entity_id = _id AND s.status = 'open'), '[]')
  );
END;
$$;

-- Edits a contact: {field: value, …}. Every change goes into the history.
CREATE OR REPLACE FUNCTION public.intel_update_contact(_id uuid, _changes jsonb, _reason text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := public._require_super_admin();
  k    text;
  _n   integer := 0;
BEGIN
  PERFORM 1 FROM people WHERE id = _id AND merged_into IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contact not found or merged' USING ERRCODE = 'P0002'; END IF;
  FOR k IN SELECT jsonb_object_keys(COALESCE(_changes, '{}'::jsonb)) LOOP
    IF public._intel_set_field('person', _id, k, _changes ->> k, 'manual', _reason, _uid) THEN _n := _n + 1; END IF;
  END LOOP;
  IF _n > 0 THEN
    INSERT INTO audit_logs (actor_id, action, target_type, target_id, details)
    VALUES (_uid, 'intel.contact_edited', 'person', _id::text, jsonb_build_object('changes', _changes, 'reason', _reason));
  END IF;
  RETURN _n;
END;
$$;

/*
 * Emails, phones and LinkedIn on a contact: add, remove, mark verified or
 * unverified. An address that signs in to an account cannot be removed or
 * moved here; an address on another person cannot be added.
 */
CREATE OR REPLACE FUNCTION public.intel_contact_identifier(_id uuid, _op text, _value text, _country_code text DEFAULT NULL, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid  uuid := public._require_super_admin();
  _key  text;
  _e164 text;
  _li   text;
  _owner uuid;
  _user uuid;
BEGIN
  SELECT user_id INTO _user FROM people WHERE id = _id AND merged_into IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contact not found or merged' USING ERRCODE = 'P0002'; END IF;

  IF _op IN ('add_email','remove_email','verify_email','unverify_email') THEN
    _key := public.norm_email(_value);
    IF _key IS NULL THEN RAISE EXCEPTION 'Not a valid email address' USING ERRCODE = '22023'; END IF;
    SELECT person_id INTO _owner FROM person_emails WHERE email_key = _key;
    IF _op = 'add_email' THEN
      IF _owner IS NOT NULL AND _owner <> _id THEN
        RAISE EXCEPTION 'That address belongs to another contact — merge them instead' USING ERRCODE = '23505';
      END IF;
      INSERT INTO person_emails (person_id, email, email_key, source) VALUES (_id, public.norm_text(_value), _key, 'manual')
      ON CONFLICT (email_key) DO NOTHING;
    ELSE
      IF _owner IS DISTINCT FROM _id THEN RAISE EXCEPTION 'That address is not on this contact' USING ERRCODE = '22023'; END IF;
      IF _op = 'remove_email' THEN
        IF _user IS NOT NULL AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = _user AND lower(u.email) = _key) THEN
          RAISE EXCEPTION 'This address signs in to the contact''s account and cannot be removed here' USING ERRCODE = '42501';
        END IF;
        DELETE FROM person_emails WHERE email_key = _key;
      ELSIF _op = 'verify_email' THEN
        UPDATE person_emails SET verified_at = COALESCE(verified_at, now()) WHERE email_key = _key;
      ELSE
        IF _user IS NOT NULL AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = _user AND lower(u.email) = _key) THEN
          RAISE EXCEPTION 'This address was verified by the contact''s own sign-in' USING ERRCODE = '42501';
        END IF;
        UPDATE person_emails SET verified_at = NULL WHERE email_key = _key;
      END IF;
    END IF;
  ELSIF _op IN ('add_phone','remove_phone','verify_phone','unverify_phone') THEN
    _e164 := public.norm_phone(_country_code, _value);
    IF _e164 IS NULL THEN RAISE EXCEPTION 'Not a valid phone number' USING ERRCODE = '22023'; END IF;
    IF _op = 'add_phone' THEN
      INSERT INTO person_phones (person_id, country_code, number, phone_e164, source)
      VALUES (_id, public.norm_country_code(_country_code), public.norm_text(_value), _e164, 'manual')
      ON CONFLICT (person_id, phone_e164) DO NOTHING;
    ELSIF _op = 'remove_phone' THEN
      DELETE FROM person_phones WHERE person_id = _id AND phone_e164 = _e164;
    ELSE
      UPDATE person_phones SET verified_at = CASE WHEN _op = 'verify_phone' THEN COALESCE(verified_at, now()) END
       WHERE person_id = _id AND phone_e164 = _e164;
    END IF;
  ELSIF _op IN ('add_linkedin','remove_linkedin') THEN
    _li := public.linkedin_key(_value);
    IF _li IS NULL THEN RAISE EXCEPTION 'Not a LinkedIn profile URL' USING ERRCODE = '22023'; END IF;
    IF _op = 'add_linkedin' THEN
      INSERT INTO person_links (person_id, kind, url, url_key)
      VALUES (_id, 'linkedin', 'https://www.linkedin.com/in/' || _li, _li)
      ON CONFLICT (person_id, kind, url_key) DO NOTHING;
    ELSE
      DELETE FROM person_links WHERE person_id = _id AND kind = 'linkedin' AND url_key = _li;
    END IF;
  ELSE
    RAISE EXCEPTION 'Unknown operation %', _op USING ERRCODE = '22023';
  END IF;

  INSERT INTO intel_field_history (entity_type, entity_id, field, old_value, new_value, source, reason, actor_id)
  VALUES ('person', _id, split_part(_op, '_', 2) || 's', CASE WHEN _op LIKE 'remove%' OR _op LIKE 'unverify%' THEN _value END,
          CASE WHEN _op LIKE 'add%' OR _op LIKE 'verify%' THEN _value END, 'manual', COALESCE(_reason, _op), _uid);
  INSERT INTO audit_logs (actor_id, action, target_type, target_id, details)
  VALUES (_uid, 'intel.contact_' || _op, 'person', _id::text, jsonb_build_object('value', _value, 'reason', _reason));
END;
$$;

CREATE OR REPLACE FUNCTION public.intel_search_companies(_q text DEFAULT NULL, _limit integer DEFAULT 50, _offset integer DEFAULT 0, _filter text DEFAULT 'all')
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
             ELSE true END
  )
  SELECT m.id, m.name, m.website, m.industry, m.hq_country, m.verification_status, m.source,
         (SELECT count(DISTINCT pp.id)::int FROM people pp WHERE pp.current_company_id = m.id AND pp.merged_into IS NULL),
         m.entry_count,
         ARRAY(SELECT d.domain FROM company_domains d WHERE d.company_id = m.id ORDER BY d.domain),
         m.created_at, m.updated_at, count(*) OVER ()
    FROM m
   ORDER BY m.entry_count DESC, m.name
   LIMIT LEAST(GREATEST(COALESCE(_limit, 50), 1), 200) OFFSET GREATEST(COALESCE(_offset, 0), 0);
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
                  FROM sponsors s
                 WHERE public.company_name_key(s.name) = c.name_key
                    OR public.norm_website_domain(s.website) IN (SELECT d.domain FROM company_domains d WHERE d.company_id = _id)), '[]'),
    'merged_from', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name)) FROM companies m WHERE m.merged_into = _id), '[]'),
    'history', COALESCE((SELECT jsonb_agg(to_jsonb(h) ORDER BY h.created_at DESC) FROM (
                  SELECT * FROM intel_field_history WHERE entity_type = 'company' AND entity_id = _id ORDER BY created_at DESC LIMIT 100) h), '[]'),
    'suggestions', COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM correction_suggestions s
                  WHERE s.entity_type = 'company' AND s.entity_id = _id AND s.status = 'open'), '[]')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.intel_update_company(_id uuid, _changes jsonb, _reason text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := public._require_super_admin();
  k    text;
  _n   integer := 0;
BEGIN
  PERFORM 1 FROM companies WHERE id = _id AND merged_into IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Company not found or merged' USING ERRCODE = 'P0002'; END IF;
  FOR k IN SELECT jsonb_object_keys(COALESCE(_changes, '{}'::jsonb)) LOOP
    IF public._intel_set_field('company', _id, k, _changes ->> k, 'manual', _reason, _uid) THEN _n := _n + 1; END IF;
  END LOOP;
  IF _n > 0 THEN
    INSERT INTO audit_logs (actor_id, action, target_type, target_id, details)
    VALUES (_uid, 'intel.company_edited', 'company', _id::text, jsonb_build_object('changes', _changes, 'reason', _reason));
  END IF;
  RETURN _n;
END;
$$;

-- Aliases, domains and registry identifiers on a company.
CREATE OR REPLACE FUNCTION public.intel_company_identifier(_id uuid, _op text, _value text, _kind text DEFAULT NULL, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := public._require_super_admin();
  _dom text;
  _other uuid;
BEGIN
  PERFORM 1 FROM companies WHERE id = _id AND merged_into IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Company not found or merged' USING ERRCODE = 'P0002'; END IF;
  IF _op = 'add_alias' THEN
    IF public.company_name_key(_value) = '' THEN RAISE EXCEPTION 'Enter the alias' USING ERRCODE = '22023'; END IF;
    INSERT INTO company_aliases (company_id, alias, alias_key, kind)
    VALUES (_id, public.norm_text(_value), public.company_name_key(_value), COALESCE(NULLIF(_kind, ''), 'alternate'))
    ON CONFLICT (company_id, alias_key) DO NOTHING;
  ELSIF _op = 'remove_alias' THEN
    DELETE FROM company_aliases WHERE company_id = _id AND alias_key = public.company_name_key(_value);
  ELSIF _op = 'add_domain' THEN
    _dom := public.norm_website_domain(_value);
    IF _dom IS NULL THEN RAISE EXCEPTION 'Not a valid domain' USING ERRCODE = '22023'; END IF;
    SELECT company_id INTO _other FROM company_domains WHERE domain = _dom;
    IF _other IS NOT NULL AND _other <> _id THEN
      RAISE EXCEPTION 'That domain belongs to another company — merge them instead' USING ERRCODE = '23505';
    END IF;
    INSERT INTO company_domains (company_id, domain, kind) VALUES (_id, _dom, COALESCE(NULLIF(_kind, ''), 'website'))
    ON CONFLICT (domain) DO NOTHING;
  ELSIF _op = 'remove_domain' THEN
    DELETE FROM company_domains WHERE company_id = _id AND domain = public.norm_website_domain(_value);
  ELSIF _op = 'add_identifier' THEN
    IF _kind NOT IN ('CIN','GSTIN','LEI','DUNS','VAT','EIN','CRN','OTHER') OR NULLIF(btrim(_value), '') IS NULL THEN
      RAISE EXCEPTION 'Choose the identifier type and enter its value' USING ERRCODE = '22023';
    END IF;
    SELECT company_id INTO _other FROM company_identifiers WHERE scheme = _kind AND value = upper(btrim(_value));
    IF _other IS NOT NULL AND _other <> _id THEN
      RAISE EXCEPTION 'That identifier belongs to another company' USING ERRCODE = '23505';
    END IF;
    INSERT INTO company_identifiers (company_id, scheme, value) VALUES (_id, _kind, upper(btrim(_value)))
    ON CONFLICT (scheme, value) DO NOTHING;
  ELSIF _op = 'remove_identifier' THEN
    DELETE FROM company_identifiers WHERE company_id = _id AND scheme = _kind AND value = upper(btrim(_value));
  ELSE
    RAISE EXCEPTION 'Unknown operation %', _op USING ERRCODE = '22023';
  END IF;
  INSERT INTO intel_field_history (entity_type, entity_id, field, old_value, new_value, source, reason, actor_id)
  VALUES ('company', _id, split_part(_op, '_', 2) || 's', CASE WHEN _op LIKE 'remove%' THEN _value END,
          CASE WHEN _op LIKE 'add%' THEN _value END, 'manual', COALESCE(_reason, _op), _uid);
  INSERT INTO audit_logs (actor_id, action, target_type, target_id, details)
  VALUES (_uid, 'intel.company_' || _op, 'company', _id::text, jsonb_build_object('value', _value, 'kind', _kind, 'reason', _reason));
END;
$$;


-- ── 7. Overview and queues ───────────────────────────────────────────────────

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
    'merges', (SELECT count(*) FROM merge_operations WHERE reverted_at IS NULL)
  );
END;
$$;

/*
 * Possible duplicates for review: pairs with both records, scores and
 * reasons. _entity 'person' or 'company'; _status 'open', 'flagged',
 * 'ignored', … ; only pairs whose records are both still live.
 */
CREATE OR REPLACE FUNCTION public.intel_duplicate_queue(_entity text, _status text DEFAULT 'open', _min_score integer DEFAULT 0, _limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._require_super_admin();
  IF _entity = 'person' THEN
    RETURN COALESCE((
      SELECT jsonb_agg(row ORDER BY (row ->> 'score')::int DESC) FROM (
        SELECT jsonb_build_object('id', m.id, 'score', m.score, 'reasons', m.reasons, 'status', m.status,
                 'a', public._intel_person_card(m.person_a), 'b', public._intel_person_card(m.person_b)) row
          FROM identity_match_candidates m
          JOIN people a ON a.id = m.person_a AND a.merged_into IS NULL
          JOIN people b ON b.id = m.person_b AND b.merged_into IS NULL
         WHERE m.status = COALESCE(_status, 'open') AND m.score >= COALESCE(_min_score, 0)
         ORDER BY m.score DESC LIMIT LEAST(GREATEST(COALESCE(_limit, 100), 1), 500)) x), '[]');
  ELSIF _entity = 'company' THEN
    RETURN COALESCE((
      SELECT jsonb_agg(row ORDER BY (row ->> 'score')::int DESC) FROM (
        SELECT jsonb_build_object('id', m.id, 'score', m.score, 'reasons', m.reasons, 'status', m.status,
                 'a', public._intel_company_card(m.company_a), 'b', public._intel_company_card(m.company_b)) row
          FROM company_match_candidates m
          JOIN companies a ON a.id = m.company_a AND a.merged_into IS NULL
          JOIN companies b ON b.id = m.company_b AND b.merged_into IS NULL
         WHERE m.status = COALESCE(_status, 'open') AND m.score >= COALESCE(_min_score, 0)
         ORDER BY m.score DESC LIMIT LEAST(GREATEST(COALESCE(_limit, 100), 1), 500)) x), '[]');
  END IF;
  RAISE EXCEPTION 'Unknown record type' USING ERRCODE = '22023';
END;
$$;

CREATE OR REPLACE FUNCTION public._intel_person_card(_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('id', p.id, 'name', p.display_name, 'first_name', p.first_name, 'last_name', p.last_name,
    'designation', p.designation, 'company', (SELECT name FROM companies WHERE id = p.current_company_id),
    'emails', ARRAY(SELECT e.email FROM person_emails e WHERE e.person_id = p.id ORDER BY e.created_at),
    'phones', ARRAY(SELECT ph.phone_e164 FROM person_phones ph WHERE ph.person_id = p.id ORDER BY ph.created_at),
    'linkedin', ARRAY(SELECT l.url FROM person_links l WHERE l.person_id = p.id AND l.kind = 'linkedin'),
    'has_account', p.user_id IS NOT NULL, 'created_at', p.created_at, 'updated_at', p.updated_at,
    'events', ARRAY(SELECT DISTINCT e.title FROM registrations r JOIN events e ON e.id = r.event_id WHERE r.person_id = p.id))
    FROM people p WHERE p.id = _id;
$$;

CREATE OR REPLACE FUNCTION public._intel_company_card(_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('id', c.id, 'name', c.name, 'legal_name', c.legal_name, 'website', c.website,
    'industry', c.industry, 'country', c.hq_country, 'verification_status', c.verification_status, 'source', c.source,
    'domains', ARRAY(SELECT d.domain FROM company_domains d WHERE d.company_id = c.id),
    'aliases', ARRAY(SELECT a.alias FROM company_aliases a WHERE a.company_id = c.id),
    'identifiers', ARRAY(SELECT i.scheme || ' ' || i.value FROM company_identifiers i WHERE i.company_id = c.id),
    'contacts', (SELECT count(*) FROM people p WHERE p.current_company_id = c.id AND p.merged_into IS NULL),
    'entry_count', c.entry_count, 'created_at', c.created_at, 'updated_at', c.updated_at)
    FROM companies c WHERE c.id = _id;
$$;

-- Decides a duplicate suggestion without merging.
CREATE OR REPLACE FUNCTION public.intel_set_duplicate_status(_entity text, _id uuid, _status text, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := public._require_super_admin();
BEGIN
  IF _entity = 'person' THEN
    IF _status NOT IN ('open','different_people','ignored','flagged') THEN RAISE EXCEPTION 'Unknown decision' USING ERRCODE = '22023'; END IF;
    UPDATE identity_match_candidates SET status = _status, reviewed_by = _uid, reviewed_at = now() WHERE id = _id;
  ELSIF _entity = 'company' THEN
    IF _status NOT IN ('open','different_companies','ignored','flagged') THEN RAISE EXCEPTION 'Unknown decision' USING ERRCODE = '22023'; END IF;
    UPDATE company_match_candidates SET status = _status, reviewed_by = _uid, reviewed_at = now() WHERE id = _id;
  ELSE
    RAISE EXCEPTION 'Unknown record type' USING ERRCODE = '22023';
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Suggestion not found' USING ERRCODE = 'P0002'; END IF;
  INSERT INTO audit_logs (actor_id, action, target_type, target_id, details)
  VALUES (_uid, 'intel.duplicate_' || _status, _entity || '_match', _id::text, jsonb_build_object('reason', _reason));
END;
$$;


-- ── 8. Merges ─────────────────────────────────────────────────────────────────

-- What a merge would touch, before it happens.
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
      'sponsorships',  (SELECT count(*) FROM event_sponsors es JOIN sponsors s ON s.id = es.sponsor_id
                         WHERE public.company_name_key(s.name) IN (SELECT name_key FROM companies WHERE id = ANY (_all))),
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

/*
 * Merges people into a survivor, in one transaction. _choices: {field:
 * value} for the survivor's profile. Two login accounts are never merged
 * and a login never moves: if one of the others has an account, it must
 * be the survivor. Registrations keep exactly what was submitted; only
 * which person they belong to changes. Returns the merge id.
 */
CREATE OR REPLACE FUNCTION public.intel_merge_people(_survivor uuid, _others uuid[], _choices jsonb DEFAULT '{}'::jsonb, _reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid     uuid := public._require_super_admin();
  _surv    people%ROWTYPE;
  _op      uuid := gen_random_uuid();
  _moved   jsonb := '[]'::jsonb;
  _removed jsonb := '[]'::jsonb;
  _n       integer;
  k        text;
  r        record;
BEGIN
  IF _others IS NULL OR array_length(_others, 1) IS NULL OR _survivor = ANY (_others) THEN
    RAISE EXCEPTION 'Choose a surviving contact and at least one other' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO _surv FROM people WHERE id = _survivor AND merged_into IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'The surviving contact no longer exists' USING ERRCODE = 'P0002'; END IF;
  SELECT count(*) INTO _n FROM people WHERE id = ANY (_others) AND merged_into IS NULL;
  IF _n <> array_length(_others, 1) THEN RAISE EXCEPTION 'A contact to merge no longer exists or was already merged' USING ERRCODE = 'P0002'; END IF;
  PERFORM 1 FROM people WHERE id = ANY (_others) FOR UPDATE;
  IF EXISTS (SELECT 1 FROM people WHERE id = ANY (_others) AND user_id IS NOT NULL) THEN
    IF _surv.user_id IS NOT NULL THEN
      RAISE EXCEPTION 'These contacts belong to two different login accounts; accounts are never merged' USING ERRCODE = '42501';
    END IF;
    RAISE EXCEPTION 'Keep the contact that has a login account as the surviving record' USING ERRCODE = '42501';
  END IF;

  -- Rows the survivor already has the same value for are removed (kept here
  -- for rollback); everything else moves.
  FOR r IN SELECT * FROM person_phones x WHERE x.person_id = ANY (_others) LOOP
    IF EXISTS (SELECT 1 FROM person_phones s WHERE s.person_id = _survivor AND s.phone_e164 = r.phone_e164) THEN
      _removed := _removed || jsonb_build_object('table', 'person_phones', 'row', to_jsonb(r));
      DELETE FROM person_phones WHERE id = r.id;
    ELSE
      _moved := _moved || jsonb_build_object('table', 'person_phones', 'id', r.id, 'from', r.person_id);
      UPDATE person_phones SET person_id = _survivor WHERE id = r.id;
    END IF;
  END LOOP;
  FOR r IN SELECT * FROM person_links x WHERE x.person_id = ANY (_others) LOOP
    IF EXISTS (SELECT 1 FROM person_links s WHERE s.person_id = _survivor AND s.kind = r.kind AND s.url_key = r.url_key) THEN
      _removed := _removed || jsonb_build_object('table', 'person_links', 'row', to_jsonb(r));
      DELETE FROM person_links WHERE id = r.id;
    ELSE
      _moved := _moved || jsonb_build_object('table', 'person_links', 'id', r.id, 'from', r.person_id);
      UPDATE person_links SET person_id = _survivor WHERE id = r.id;
    END IF;
  END LOOP;
  FOR r IN SELECT * FROM person_company_affiliations x WHERE x.person_id = ANY (_others) LOOP
    IF EXISTS (SELECT 1 FROM person_company_affiliations s WHERE s.person_id = _survivor AND s.company_id = r.company_id AND s.designation_key = r.designation_key) THEN
      _removed := _removed || jsonb_build_object('table', 'person_company_affiliations', 'row', to_jsonb(r));
      DELETE FROM person_company_affiliations WHERE id = r.id;
    ELSE
      _moved := _moved || jsonb_build_object('table', 'person_company_affiliations', 'id', r.id, 'from', r.person_id);
      UPDATE person_company_affiliations SET person_id = _survivor WHERE id = r.id;
    END IF;
  END LOOP;
  FOR r IN SELECT * FROM company_mentions x WHERE x.person_id = ANY (_others) LOOP
    IF EXISTS (SELECT 1 FROM company_mentions s WHERE s.person_id = _survivor AND s.company_id = r.company_id) THEN
      _removed := _removed || jsonb_build_object('table', 'company_mentions', 'row', to_jsonb(r));
      DELETE FROM company_mentions WHERE company_id = r.company_id AND person_id = r.person_id;
      UPDATE companies SET entry_count = GREATEST(entry_count - 1, 0) WHERE id = r.company_id;
    ELSE
      _moved := _moved || jsonb_build_object('table', 'company_mentions', 'company_id', r.company_id, 'from', r.person_id);
      UPDATE company_mentions SET person_id = _survivor WHERE company_id = r.company_id AND person_id = r.person_id;
    END IF;
  END LOOP;
  -- One person per address: every address moves.
  FOR r IN SELECT id, person_id FROM person_emails WHERE person_id = ANY (_others) LOOP
    _moved := _moved || jsonb_build_object('table', 'person_emails', 'id', r.id, 'from', r.person_id);
  END LOOP;
  UPDATE person_emails SET person_id = _survivor WHERE person_id = ANY (_others);
  -- Records that refer to the person; their own contents are untouched.
  FOR r IN SELECT 'registrations' t, id, person_id FROM registrations WHERE person_id = ANY (_others)
           UNION ALL SELECT 'speakers', id, person_id FROM speakers WHERE person_id = ANY (_others)
           UNION ALL SELECT 'sponsor_members', id, person_id FROM sponsor_members WHERE person_id = ANY (_others)
           UNION ALL SELECT 'account_activation_tokens', id, person_id FROM account_activation_tokens WHERE person_id = ANY (_others) LOOP
    _moved := _moved || jsonb_build_object('table', r.t, 'id', r.id, 'from', r.person_id);
  END LOOP;
  UPDATE registrations SET person_id = _survivor WHERE person_id = ANY (_others);
  UPDATE speakers SET person_id = _survivor WHERE person_id = ANY (_others);
  UPDATE sponsor_members SET person_id = _survivor WHERE person_id = ANY (_others);
  UPDATE account_activation_tokens SET person_id = _survivor WHERE person_id = ANY (_others);

  INSERT INTO merge_operations (id, entity_type, survivor_id, merged_ids, field_choices, moved, removed, survivor_before, reason, actor_id)
  VALUES (_op, 'person', _survivor, _others, COALESCE(_choices, '{}'::jsonb), _moved, _removed, to_jsonb(_surv), _reason, _uid);

  FOR k IN SELECT jsonb_object_keys(COALESCE(_choices, '{}'::jsonb)) LOOP
    PERFORM public._intel_set_field('person', _survivor, k, _choices ->> k, 'merge', COALESCE(_reason, 'Merge'), _uid, _op);
  END LOOP;

  UPDATE people SET merged_into = _survivor, updated_at = now() WHERE id = ANY (_others);
  UPDATE identity_match_candidates SET status = 'merged', reviewed_by = _uid, reviewed_at = now()
   WHERE (person_a = _survivor AND person_b = ANY (_others)) OR (person_b = _survivor AND person_a = ANY (_others))
      OR (person_a = ANY (_others) AND person_b = ANY (_others));
  INSERT INTO audit_logs (actor_id, action, target_type, target_id, details)
  VALUES (_uid, 'intel.contacts_merged', 'person', _survivor::text,
          jsonb_build_object('merge_id', _op, 'merged', _others, 'choices', _choices, 'reason', _reason,
                             'moved', jsonb_array_length(_moved), 'deduplicated', jsonb_array_length(_removed)));
  RETURN _op;
END;
$$;

/*
 * Merges companies into a survivor, in one transaction. Records with
 * different registry identifiers of the same kind are separate legal
 * entities, and a parent and its subsidiary are separate companies: both
 * need _allow_distinct = true. The others' names become aliases of the
 * survivor. Returns the merge id.
 */
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
           UNION ALL SELECT 'companies', id, parent_company_id FROM companies WHERE parent_company_id = ANY (_others) AND id <> _survivor LOOP
    _moved := _moved || jsonb_build_object('table', r.t, 'id', r.id, 'from', r.company_id);
  END LOOP;
  UPDATE company_domains SET company_id = _survivor WHERE company_id = ANY (_others);
  UPDATE company_identifiers SET company_id = _survivor WHERE company_id = ANY (_others);
  UPDATE company_locations SET company_id = _survivor WHERE company_id = ANY (_others);
  UPDATE company_source_records SET company_id = _survivor WHERE company_id = ANY (_others);
  UPDATE registrations SET company_id = _survivor WHERE company_id = ANY (_others);
  UPDATE people SET current_company_id = _survivor WHERE current_company_id = ANY (_others);
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

/*
 * Rolls a merge back: everything moved goes back, deduplicated rows are
 * restored, the merged records are live again and the survivor's fields
 * return to their values before the merge. Refused when the survivor has
 * been edited since (a later change is never silently overwritten) or a
 * merged record was merged again. The rollback is itself recorded.
 */
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

  UPDATE merge_operations SET reverted_at = now(), reverted_by = _uid WHERE id = m.id;
  INSERT INTO audit_logs (actor_id, action, target_type, target_id, details)
  VALUES (_uid, 'intel.merge_reverted', m.entity_type, m.survivor_id::text,
          jsonb_build_object('merge_id', m.id, 'restored', m.merged_ids, 'reason', _reason));
END;
$$;

/*
 * Reverts one field change, if the field still holds the value that change
 * wrote — a later change is never overwritten. Recorded as a rollback.
 */
CREATE OR REPLACE FUNCTION public.intel_revert_change(_history uuid, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := public._require_super_admin();
  h    intel_field_history%ROWTYPE;
  _cur text;
BEGIN
  SELECT * INTO h FROM intel_field_history WHERE id = _history FOR UPDATE;
  IF NOT FOUND OR h.reverted_at IS NOT NULL OR h.source IN ('rollback','merge')
     OR NOT public._intel_field_allowed(h.entity_type, h.field) THEN
    RAISE EXCEPTION 'This change cannot be reverted here' USING ERRCODE = '22023';
  END IF;
  _cur := CASE h.entity_type
            WHEN 'person'  THEN (SELECT to_jsonb(x) ->> h.field FROM people x WHERE x.id = h.entity_id)
            ELSE (SELECT to_jsonb(x) ->> h.field FROM companies x WHERE x.id = h.entity_id) END;
  IF _cur IS DISTINCT FROM h.new_value THEN
    RAISE EXCEPTION 'The field has changed again since; revert the later change first' USING ERRCODE = '40001';
  END IF;
  PERFORM public._intel_set_field(h.entity_type, h.entity_id, h.field, h.old_value, 'rollback', COALESCE(_reason, 'Reverted'), _uid);
  UPDATE intel_field_history SET reverted_at = now(), reverted_by = _uid WHERE id = h.id;
  INSERT INTO audit_logs (actor_id, action, target_type, target_id, details)
  VALUES (_uid, 'intel.change_reverted', h.entity_type, h.entity_id::text,
          jsonb_build_object('history_id', h.id, 'field', h.field, 'restored', h.old_value, 'replaced', h.new_value, 'reason', _reason));
END;
$$;

CREATE OR REPLACE FUNCTION public.intel_corrections(_status text DEFAULT 'open', _entity text DEFAULT NULL, _kind text DEFAULT NULL, _limit integer DEFAULT 200)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._require_super_admin();
  RETURN COALESCE((SELECT jsonb_agg(row) FROM (
    SELECT to_jsonb(s) || jsonb_build_object('label',
             CASE s.entity_type WHEN 'person' THEN (SELECT display_name FROM people WHERE id = s.entity_id)
                                ELSE (SELECT name FROM companies WHERE id = s.entity_id) END) row
      FROM correction_suggestions s
     WHERE s.status = COALESCE(_status, 'open')
       AND (_entity IS NULL OR s.entity_type = _entity)
       AND (_kind IS NULL OR s.kind = _kind)
     ORDER BY s.safe DESC, s.confidence DESC, s.created_at
     LIMIT LEAST(GREATEST(COALESCE(_limit, 200), 1), 1000)) x), '[]');
END;
$$;

-- Audit history: Intelligence Centre actions, newest first.
CREATE OR REPLACE FUNCTION public.intel_audit_history(_entity text DEFAULT NULL, _entity_id uuid DEFAULT NULL, _action text DEFAULT NULL,
                                                      _from timestamptz DEFAULT NULL, _to timestamptz DEFAULT NULL, _limit integer DEFAULT 200)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._require_super_admin();
  RETURN jsonb_build_object(
    'events', COALESCE((SELECT jsonb_agg(row) FROM (
       SELECT jsonb_build_object('id', a.id, 'action', a.action, 'target_type', a.target_type, 'target_id', a.target_id,
                'details', a.details, 'actor_id', a.actor_id,
                'actor', COALESCE(a.actor_email, (SELECT u.email FROM auth.users u WHERE u.id = a.actor_id)),
                'created_at', a.created_at) row
         FROM audit_logs a
        WHERE (a.action LIKE 'intel.%' OR a.action LIKE 'identity.%' OR a.action LIKE 'company.%')
          AND (_entity IS NULL OR a.target_type = _entity)
          AND (_entity_id IS NULL OR a.target_id = _entity_id::text)
          AND (_action IS NULL OR a.action = _action)
          AND (_from IS NULL OR a.created_at >= _from) AND (_to IS NULL OR a.created_at < _to)
        ORDER BY a.created_at DESC
        LIMIT LEAST(GREATEST(COALESCE(_limit, 200), 1), 1000)) x), '[]'),
    'merges', COALESCE((SELECT jsonb_agg(row) FROM (
       SELECT jsonb_build_object('id', m.id, 'entity_type', m.entity_type, 'survivor_id', m.survivor_id, 'merged_ids', m.merged_ids,
                'reason', m.reason, 'created_at', m.created_at, 'reverted_at', m.reverted_at,
                'survivor', CASE m.entity_type WHEN 'person' THEN (SELECT display_name FROM people WHERE id = m.survivor_id)
                                                ELSE (SELECT name FROM companies WHERE id = m.survivor_id) END) row
         FROM merge_operations m
        WHERE (_entity IS NULL OR m.entity_type = _entity)
          AND (_entity_id IS NULL OR m.survivor_id = _entity_id OR _entity_id = ANY (m.merged_ids))
        ORDER BY m.created_at DESC LIMIT 100) x), '[]')
  );
END;
$$;


-- ── 9. Who may call what ─────────────────────────────────────────────────────

DO $$
DECLARE f text;
BEGIN
  -- Internal helpers: never callable by clients.
  FOREACH f IN ARRAY ARRAY['_company_initials(text)', '_intel_name_case(text)', '_intel_person_card(uuid)', '_intel_company_card(uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
  -- Super Admin functions: signed-in callers only; each checks the admin role itself.
  FOREACH f IN ARRAY ARRAY[
    'intel_refresh_person_duplicates()', 'intel_refresh_company_duplicates()', 'intel_generate_corrections()',
    'intel_review_correction(uuid, boolean, text, text)', 'intel_bulk_approve_safe(uuid[])',
    'intel_search_contacts(text, integer, integer, text)', 'intel_contact_detail(uuid)', 'intel_update_contact(uuid, jsonb, text)',
    'intel_contact_identifier(uuid, text, text, text, text)', 'intel_search_companies(text, integer, integer, text)',
    'intel_company_detail(uuid)', 'intel_update_company(uuid, jsonb, text)', 'intel_company_identifier(uuid, text, text, text, text)',
    'intel_overview(timestamptz, timestamptz, text, text)', 'intel_duplicate_queue(text, text, integer, integer)',
    'intel_set_duplicate_status(text, uuid, text, text)', 'intel_merge_preview(text, uuid, uuid[])',
    'intel_merge_people(uuid, uuid[], jsonb, text)', 'intel_merge_companies(uuid, uuid[], jsonb, text, boolean)',
    'intel_revert_merge(uuid, text)', 'intel_revert_change(uuid, text)', 'intel_corrections(text, text, text, integer)',
    'intel_audit_history(text, uuid, text, timestamptz, timestamptz, integer)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;
