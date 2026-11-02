-- ═══════════════════════════════════════════════════════════════════════════════
-- Adding a sponsor brings its website and logo.
--
-- Picking a known company now fills in its website and logo. The logo comes only
-- from a sponsor record already shown on a published event, so nothing private
-- is passed between organisations. A sponsor record missing a website or logo
-- is offered the company's, and takes it only when the sponsor is added.
--
-- Run RUN_ME_sponsor_consolidation.sql (067) first.
-- Safe to run more than once. Paste into the SQL Editor and Run.
-- ═══════════════════════════════════════════════════════════════════════════════

-- A company's website, from its record or its domains.
CREATE OR REPLACE FUNCTION public._company_website(_company uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(c.website, (SELECT 'https://' || d.domain FROM company_domains d WHERE d.company_id = c.id ORDER BY d.domain LIMIT 1))
    FROM companies c WHERE c.id = _company;
$$;

-- A company's logo as already shown publicly: on a sponsor of a published event.
CREATE OR REPLACE FUNCTION public._company_public_logo(_company uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(es.logo_url, s.logo_url)
    FROM sponsors s
    JOIN event_sponsors es ON es.sponsor_id = s.id
    JOIN events e ON e.id = es.event_id
   WHERE s.company_id = _company AND e.status = 'published' AND COALESCE(es.logo_url, s.logo_url) IS NOT NULL
   ORDER BY e.date DESC NULLS LAST, s.id
   LIMIT 1;
$$;


CREATE OR REPLACE FUNCTION public.organizer_sponsor_options(_event uuid, _q text DEFAULT NULL, _limit integer DEFAULT 12)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _t     text := lower(COALESCE(public.norm_text(_q), ''));
  _k     text := COALESCE(public.company_name_key(_q), '');
  _lim   integer := LEAST(GREATEST(COALESCE(_limit, 12), 1), 30);
  _scope text := public._event_scope(_event);
BEGIN
  IF public._sponsorship_access(_event) IS NULL THEN
    RAISE EXCEPTION 'You don''t have access to this event''s sponsors' USING ERRCODE = '42501';
  END IF;
  RETURN (
    WITH mine AS (
      SELECT s.*, public._canonical_company(s.company_id) AS co,
             (SELECT count(*) FROM event_sponsors es WHERE es.sponsor_id = s.id) AS n
        FROM sponsors s
       WHERE s.merged_into IS NULL
         AND (s.user_id = auth.uid() OR public._sponsor_scope(s.id) = _scope)
         AND (_t = '' OR lower(s.name) LIKE '%' || _t || '%' OR lower(COALESCE(s.email, '')) LIKE '%' || _t || '%'
              OR lower(COALESCE(s.website, '')) LIKE '%' || _t || '%'
              OR (_k <> '' AND EXISTS (SELECT 1 FROM companies c WHERE c.id = public._canonical_company(s.company_id)
                    AND (c.name_key LIKE '%' || _k || '%'
                         OR EXISTS (SELECT 1 FROM company_aliases a WHERE a.company_id = c.id AND a.alias_key LIKE '%' || _k || '%')))))
    ), once AS (
      -- A company with two records yet to be combined is offered once.
      SELECT DISTINCT ON (COALESCE(m.co::text, m.id::text)) m.* FROM mine m
       ORDER BY COALESCE(m.co::text, m.id::text),
                EXISTS (SELECT 1 FROM event_sponsors es WHERE es.sponsor_id = m.id AND es.event_id = _event) DESC, m.n DESC, m.created_at, m.id
    ), rec AS (SELECT * FROM once ORDER BY lower(btrim(once.name)), once.id LIMIT _lim),
    dir AS (
      SELECT c.id, c.name, c.website, c.verification_status = 'verified' AS verified, c.entry_count
        FROM companies c
       WHERE _k <> '' AND c.merged_into IS NULL AND c.verification_status <> 'rejected'
         AND NOT EXISTS (SELECT 1 FROM mine m WHERE m.co = c.id)
         AND (c.name_key LIKE _k || '%' OR c.name_key LIKE '% ' || _k || '%'
              OR EXISTS (SELECT 1 FROM company_aliases a WHERE a.company_id = c.id AND a.alias_key LIKE _k || '%')
              OR EXISTS (SELECT 1 FROM company_domains d WHERE d.company_id = c.id AND d.domain LIKE _t || '%'))
       ORDER BY (c.name_key LIKE _k || '%') DESC, (c.verification_status = 'verified') DESC, c.entry_count DESC, c.name
       LIMIT _lim
    )
    SELECT jsonb_build_object(
      'records', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'sponsor_id', r.id, 'name', btrim(r.name), 'company_id', r.co, 'company', (SELECT c.name FROM companies c WHERE c.id = r.co),
          'website', COALESCE(r.website, public._company_website(r.co)), 'has_website', r.website IS NOT NULL,
          'email', r.email, 'logo_url', COALESCE(r.logo_url, public._company_public_logo(r.co)), 'tier', r.tier, 'tier_label', r.tier_label, 'events', r.n,
          'on_event', EXISTS (SELECT 1 FROM event_sponsors es JOIN sponsors o ON o.id = es.sponsor_id
                               WHERE es.event_id = _event AND (o.id = r.id OR (r.co IS NOT NULL AND o.company_id = r.co))))
          ORDER BY lower(btrim(r.name)), r.id) FROM rec r), '[]'::jsonb),
      'companies', COALESCE((SELECT jsonb_agg(jsonb_build_object('company_id', d.id, 'name', d.name, 'website', public._company_website(d.id), 'logo_url', public._company_public_logo(d.id), 'verified', d.verified)
          ORDER BY (lower(d.name) LIKE _t || '%') DESC, d.verified DESC, d.entry_count DESC, d.name) FROM dir d), '[]'::jsonb),
      -- Whether what was typed is already exactly one of the options.
      'exact', _k <> '' AND (EXISTS (SELECT 1 FROM rec r WHERE public.company_name_key(r.name) = _k)
                             OR EXISTS (SELECT 1 FROM dir d WHERE public.company_name_key(d.name) = _k)))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.organizer_add_event_sponsor(
  _event uuid, _sponsor uuid DEFAULT NULL, _company uuid DEFAULT NULL, _name text DEFAULT NULL,
  _tier text DEFAULT 'bronze', _tier_label text DEFAULT NULL,
  _email text DEFAULT NULL, _website text DEFAULT NULL, _logo_url text DEFAULT NULL, _description text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _scope   text := public._event_scope(_event);
  _rec     sponsors%ROWTYPE;
  _co      uuid := _company;
  _created boolean := false;
  _link    uuid;
  _cname   text;
  _label   text := NULLIF(btrim(COALESCE(_tier_label, '')), '');
  _logo    text := NULLIF(btrim(COALESCE(_logo_url, '')), '');
BEGIN
  IF public._sponsorship_access(_event) IS NULL THEN
    RAISE EXCEPTION 'You don''t have access to this event''s sponsors' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(_tier, 'bronze') = 'custom' AND _label IS NULL THEN RAISE EXCEPTION 'Enter the partnership title' USING ERRCODE = '22023'; END IF;

  IF _sponsor IS NOT NULL THEN
    IF NOT public._sponsor_usable_on(_sponsor, _event) THEN
      RAISE EXCEPTION 'That sponsor isn''t one of your organisation''s' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO _rec FROM sponsors WHERE id = _sponsor;
    _co := public._canonical_company(_rec.company_id);
  ELSE
    IF _co IS NOT NULL THEN
      _co := public._canonical_company(_co);
      IF _co IS NULL THEN RAISE EXCEPTION 'Unknown company' USING ERRCODE = '22023'; END IF;
    ELSE
      IF NULLIF(public.norm_text(_name), '') IS NULL THEN RAISE EXCEPTION 'Enter the company name' USING ERRCODE = '22023'; END IF;
      _co := public._ensure_company_for_sponsor(_name, _website);
    END IF;
    IF _co IS NOT NULL THEN
      SELECT s.* INTO _rec FROM sponsors s
       WHERE s.company_id = _co AND s.merged_into IS NULL AND (s.user_id = auth.uid() OR public._sponsor_scope(s.id) = _scope)
       ORDER BY EXISTS (SELECT 1 FROM event_sponsors es WHERE es.sponsor_id = s.id AND es.event_id = _event) DESC,
                (SELECT count(*) FROM event_sponsors es WHERE es.sponsor_id = s.id) DESC, s.created_at, s.id
       LIMIT 1;
    END IF;
  END IF;

  SELECT name INTO _cname FROM companies WHERE id = _co;
  IF _rec.id IS NULL THEN
    _created := true;
    INSERT INTO sponsors (user_id, name, email, website, logo_url, description, tier, tier_label, company_id)
    VALUES (auth.uid(), COALESCE(_cname, public.norm_text(_name)), NULLIF(btrim(COALESCE(_email, '')), ''),
            COALESCE(NULLIF(btrim(COALESCE(_website, '')), ''), public._company_website(_co)), COALESCE(_logo, public._company_public_logo(_co)),
            NULLIF(btrim(COALESCE(_description, '')), ''), COALESCE(_tier, 'bronze'), _label, _co)
    RETURNING * INTO _rec;
  ELSE
    UPDATE sponsors
       SET email = COALESCE(email, NULLIF(btrim(COALESCE(_email, '')), '')),
           website = COALESCE(website, NULLIF(btrim(COALESCE(_website, '')), '')),
           logo_url = COALESCE(logo_url, _logo),
           description = COALESCE(description, NULLIF(btrim(COALESCE(_description, '')), ''))
     WHERE id = _rec.id
    RETURNING * INTO _rec;
  END IF;

  IF EXISTS (SELECT 1 FROM event_sponsors WHERE event_id = _event AND sponsor_id = _rec.id) THEN
    RAISE EXCEPTION 'This sponsor is already on this event. Open it there to change its title.' USING ERRCODE = '23505';
  END IF;
  INSERT INTO event_sponsors (event_id, sponsor_id, tier, tier_label, logo_url, display_order)
  VALUES (_event, _rec.id, COALESCE(_tier, 'bronze'), CASE WHEN _tier = 'custom' THEN _label END,
          CASE WHEN _logo IS DISTINCT FROM _rec.logo_url THEN _logo END,
          COALESCE((SELECT max(display_order) + 1 FROM event_sponsors WHERE event_id = _event), 0))
  RETURNING id INTO _link;

  RETURN jsonb_build_object('event_sponsor_id', _link, 'sponsor_id', _rec.id, 'name', _rec.name, 'email', _rec.email,
                            'company_id', _co, 'company', _cname, 'created', _created);
END;
$$;


DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['_company_website(uuid)', '_company_public_logo(uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
END $$;
