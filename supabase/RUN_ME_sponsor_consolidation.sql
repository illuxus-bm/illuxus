-- ═══════════════════════════════════════════════════════════════════════════════
-- Sponsor consolidation: one record per company inside an organisation.
--
--   • Teammates in one organisation can now share one sponsor record. Before,
--     only records created by the same person could be combined, so a company
--     added by two teammates stayed twice. Each teammate who manages the
--     organisation's events can edit the shared record.
--   • Different organisations still keep separate records. A sponsor's team
--     sees every event of its record, so sharing one across organisations would
--     show one organisation's sponsor team another's events and attendees.
--   • Adding a sponsor goes through one server function: it reuses the
--     organisation's record for that company and never creates a repeat. The
--     search behind it lists only this organisation's sponsors, plus company
--     names from the directory, never another organisation's records.
--   • Super Admin sees one row per company and can combine all repeats at once.
--   • Sponsors left unconnected are connected, unless someone disconnected them.
--
-- Combining still happens only when Super Admin asks for it, and can be rolled back.
--
-- Run RUN_ME_sponsor_identity.sql (066) first.
-- Safe to run more than once. Paste into the SQL Editor and Run.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ── 1. Which organisation a sponsor record belongs to ────────────────────────

/*
 * The organisation a sponsor record works within: that of its events, or its
 * owner's when it has none. A record on no organisation's events, or on several
 * organisations' events, belongs only to its owner ('user:<id>').
 */
CREATE OR REPLACE FUNCTION public._sponsor_scope(_sponsor uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _owner uuid;
  _orgs  text[];
BEGIN
  SELECT user_id INTO _owner FROM sponsors WHERE id = _sponsor;
  SELECT ARRAY_AGG(DISTINCT COALESCE(e.org_id::text, 'user:' || e.user_id::text)) INTO _orgs
    FROM event_sponsors es JOIN events e ON e.id = es.event_id WHERE es.sponsor_id = _sponsor;
  IF _orgs IS NULL THEN
    SELECT ARRAY_AGG(DISTINCT x.org) INTO _orgs FROM (
      SELECT o.id::text AS org FROM organizations o WHERE o.owner_id = _owner
      UNION SELECT m.org_id::text FROM org_members m WHERE m.user_id = _owner) x;
  END IF;
  IF array_length(_orgs, 1) = 1 THEN RETURN _orgs[1]; END IF;
  RETURN 'user:' || COALESCE(_owner::text, _sponsor::text);
END;
$$;

CREATE OR REPLACE FUNCTION public._event_scope(_event uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(org_id::text, 'user:' || user_id::text) FROM events WHERE id = _event;
$$;

-- Whether the caller may use a sponsor record on this event: their own, or their organisation's.
CREATE OR REPLACE FUNCTION public._sponsor_usable_on(_sponsor uuid, _event uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM sponsors s WHERE s.id = _sponsor AND s.merged_into IS NULL
                  AND (s.user_id = auth.uid() OR public._sponsor_scope(s.id) = public._event_scope(_event)));
$$;

-- For access rules: the caller manages an event this record sponsors.
CREATE OR REPLACE FUNCTION public._can_manage_sponsor(_sponsor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM event_sponsors es WHERE es.sponsor_id = _sponsor AND public._sponsorship_access(es.event_id) IS NOT NULL);
$$;

CREATE OR REPLACE FUNCTION public._can_manage_event_sponsors(_event uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public._sponsorship_access(_event) IS NOT NULL;
$$;

-- A shared record is edited by those who run its events, not only whoever created it.
DROP POLICY IF EXISTS "Event managers edit linked sponsors" ON public.sponsors;
CREATE POLICY "Event managers edit linked sponsors" ON public.sponsors FOR UPDATE TO authenticated
  USING (public._can_manage_sponsor(id)) WITH CHECK (public._can_manage_sponsor(id));
DROP POLICY IF EXISTS "Event managers manage linked sponsor teams" ON public.sponsor_members;
CREATE POLICY "Event managers manage linked sponsor teams" ON public.sponsor_members FOR ALL TO authenticated
  USING (public._can_manage_sponsor(sponsor_id)) WITH CHECK (public._can_manage_sponsor(sponsor_id));
DROP POLICY IF EXISTS "Event managers manage event_sponsors" ON public.event_sponsors;
CREATE POLICY "Event managers manage event_sponsors" ON public.event_sponsors FOR ALL TO authenticated
  USING (public._can_manage_event_sponsors(event_id)) WITH CHECK (public._can_manage_event_sponsors(event_id));


-- ── 2. Sponsors left unconnected ─────────────────────────────────────────────

-- Connected by website or name. Someone's explicit disconnection stands.
DO $$
DECLARE s record;
BEGIN
  FOR s IN
    SELECT x.id, x.name, x.website FROM public.sponsors x
     WHERE x.company_id IS NULL AND x.merged_into IS NULL
       AND COALESCE((SELECT (a.details ->> 'to') IS NULL FROM public.audit_logs a
                      WHERE a.action = 'intel.sponsor_connected' AND a.target_id = x.id::text
                      ORDER BY a.created_at DESC LIMIT 1), false) = false
  LOOP
    UPDATE public.sponsors SET company_id = public._ensure_company_for_sponsor(s.name, s.website) WHERE id = s.id;
  END LOOP;
END $$;


-- ── 3. Adding a sponsor ──────────────────────────────────────────────────────

/*
 * What to offer when adding a sponsor to an event: the organisation's own
 * sponsors, once per company, and companies from the directory it has no
 * record of. Directory entries are names and websites only.
 */
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
          'website', r.website, 'email', r.email, 'logo_url', r.logo_url, 'tier', r.tier, 'tier_label', r.tier_label, 'events', r.n,
          'on_event', EXISTS (SELECT 1 FROM event_sponsors es JOIN sponsors o ON o.id = es.sponsor_id
                               WHERE es.event_id = _event AND (o.id = r.id OR (r.co IS NOT NULL AND o.company_id = r.co))))
          ORDER BY lower(btrim(r.name)), r.id) FROM rec r), '[]'::jsonb),
      'companies', COALESCE((SELECT jsonb_agg(jsonb_build_object('company_id', d.id, 'name', d.name, 'website', d.website, 'verified', d.verified)
          ORDER BY (lower(d.name) LIKE _t || '%') DESC, d.verified DESC, d.entry_count DESC, d.name) FROM dir d), '[]'::jsonb),
      -- Whether what was typed is already exactly one of the options.
      'exact', _k <> '' AND (EXISTS (SELECT 1 FROM rec r WHERE public.company_name_key(r.name) = _k)
                             OR EXISTS (SELECT 1 FROM dir d WHERE public.company_name_key(d.name) = _k)))
  );
END;
$$;

/*
 * Puts a company on an event. Takes a sponsor record, a directory company, or a
 * new name, and resolves them the same way: the organisation's record for that
 * company is reused, or one is made. Each event holds its own title. Anything
 * given that the record lacks is filled in; nothing it has is replaced, and a
 * different logo stays with this event.
 */
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
            COALESCE(NULLIF(btrim(COALESCE(_website, '')), ''), (SELECT website FROM companies WHERE id = _co)), _logo,
            NULLIF(btrim(COALESCE(_description, '')), ''), COALESCE(_tier, 'bronze'), _label, _co)
    RETURNING * INTO _rec;
  ELSE
    UPDATE sponsors
       SET email = COALESCE(email, NULLIF(btrim(COALESCE(_email, '')), '')),
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


-- ── 4. Super Admin: combining ────────────────────────────────────────────────


/*
 * Merges sponsor records for one company within one organisation, in one
 * transaction. Events, teams, meetings and creatives move to the surviving
 * record. Every event keeps its own title and logo. Two records on one event are
 * combined only if they hold the same title; different titles are separate
 * agreements, so the merge is refused and nothing changes. Records of different
 * organisations are never merged. Can be rolled back.
 */
CREATE OR REPLACE FUNCTION public.intel_merge_sponsors(_survivor uuid, _others uuid[], _reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid     uuid := public._require_super_admin();
  _surv    sponsors%ROWTYPE;
  _op      uuid := gen_random_uuid();
  _moved   jsonb := '[]'::jsonb;
  _removed jsonb := '[]'::jsonb;
  _n       integer;
  r        record;
  a        record;
  t        sponsor_members%ROWTYPE;
  l        event_sponsors%ROWTYPE;
  d        event_sponsorship_details%ROWTYPE;
BEGIN
  IF _others IS NULL OR array_length(_others, 1) IS NULL OR _survivor = ANY (_others) THEN
    RAISE EXCEPTION 'Choose a surviving sponsor record and at least one other' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO _surv FROM sponsors WHERE id = _survivor AND merged_into IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'The surviving record no longer exists' USING ERRCODE = 'P0002'; END IF;
  SELECT count(*) INTO _n FROM sponsors WHERE id = ANY (_others) AND merged_into IS NULL;
  IF _n <> array_length(_others, 1) THEN RAISE EXCEPTION 'A record to merge no longer exists or was already merged' USING ERRCODE = 'P0002'; END IF;
  PERFORM 1 FROM sponsors WHERE id = ANY (_others) FOR UPDATE;
  IF EXISTS (SELECT 1 FROM sponsors WHERE id = ANY (_others) AND user_id IS DISTINCT FROM _surv.user_id
              AND public._sponsor_scope(id) IS DISTINCT FROM public._sponsor_scope(_survivor)) THEN
    RAISE EXCEPTION 'These records belong to different organisations. A sponsor''s team sees every event of its record, so they stay separate, under one company.' USING ERRCODE = '42501';
  END IF;
  IF _surv.company_id IS NULL OR EXISTS (SELECT 1 FROM sponsors WHERE id = ANY (_others) AND company_id IS DISTINCT FROM _surv.company_id) THEN
    RAISE EXCEPTION 'Connect these records to the same company before merging them' USING ERRCODE = '22023';
  END IF;

  -- Team. An address on both teams stays once, keeping whichever access exists.
  FOR r IN SELECT * FROM sponsor_members WHERE sponsor_id = ANY (_others) ORDER BY created_at LOOP
    SELECT * INTO t FROM sponsor_members WHERE sponsor_id = _survivor AND lower(email) = lower(r.email) LIMIT 1;
    IF NOT FOUND THEN
      _moved := _moved || jsonb_build_object('table', 'sponsor_members', 'id', r.id, 'from', r.sponsor_id);
      UPDATE sponsor_members SET sponsor_id = _survivor WHERE id = r.id;
      CONTINUE;
    END IF;
    IF t.user_id IS NOT NULL AND r.user_id IS NOT NULL AND t.user_id <> r.user_id THEN
      RAISE EXCEPTION '% is linked to two different accounts on these records; resolve that first', r.email USING ERRCODE = '42501';
    END IF;
    IF (r.user_id IS NOT NULL AND t.user_id IS NULL) OR (r.accepted_at IS NOT NULL AND t.accepted_at IS NULL) THEN
      _moved := _moved || jsonb_build_object('table', 'member_access', 'id', t.id, 'user_id', t.user_id, 'accepted_at', t.accepted_at);
      UPDATE sponsor_members SET user_id = COALESCE(t.user_id, r.user_id), accepted_at = COALESCE(t.accepted_at, r.accepted_at) WHERE id = t.id;
    END IF;
    FOR a IN SELECT * FROM event_sponsor_contacts WHERE member_id = r.id LOOP
      IF EXISTS (SELECT 1 FROM event_sponsor_contacts x WHERE x.event_sponsor_id = a.event_sponsor_id AND x.member_id = t.id) THEN
        _removed := _removed || jsonb_build_object('table', 'event_sponsor_contacts', 'row', to_jsonb(a));
      ELSE
        _moved := _moved || jsonb_build_object('table', 'contact_member', 'id', a.id, 'from', a.member_id);
        UPDATE event_sponsor_contacts SET member_id = t.id WHERE id = a.id;
      END IF;
    END LOOP;
    _removed := _removed || jsonb_build_object('table', 'sponsor_members', 'row', to_jsonb(r));
    DELETE FROM sponsor_members WHERE id = r.id;
  END LOOP;

  -- Events.
  FOR r IN SELECT es.*, s.logo_url AS sponsor_logo FROM event_sponsors es JOIN sponsors s ON s.id = es.sponsor_id
            WHERE es.sponsor_id = ANY (_others) ORDER BY es.created_at LOOP
    SELECT * INTO l FROM event_sponsors WHERE event_id = r.event_id AND sponsor_id = _survivor;
    IF NOT FOUND THEN
      _moved := _moved || jsonb_build_object('table', 'event_sponsors', 'id', r.id, 'from', r.sponsor_id, 'logo_url', r.logo_url);
      -- The event keeps showing the logo it showed.
      UPDATE event_sponsors
         SET sponsor_id = _survivor,
             logo_url = CASE WHEN r.logo_url IS NULL AND r.sponsor_logo IS DISTINCT FROM _surv.logo_url THEN r.sponsor_logo ELSE r.logo_url END
       WHERE id = r.id;
    ELSE
      IF public._sponsorship_title(l.tier, l.tier_label) <> public._sponsorship_title(r.tier, r.tier_label) THEN
        RAISE EXCEPTION 'These records hold different titles on "%". Those may be separate agreements, so they were not merged. Nothing was changed.',
          (SELECT title FROM events WHERE id = r.event_id) USING ERRCODE = '23505';
      END IF;
      -- The same sponsorship entered twice: its details and contacts join the one that stays.
      SELECT * INTO d FROM event_sponsorship_details WHERE event_sponsor_id = r.id;
      IF FOUND THEN
        IF EXISTS (SELECT 1 FROM event_sponsorship_details WHERE event_sponsor_id = l.id) THEN
          _removed := _removed || jsonb_build_object('table', 'event_sponsorship_details', 'row', to_jsonb(d));
        ELSE
          _moved := _moved || jsonb_build_object('table', 'details_link', 'id', l.id, 'from', r.id);
          UPDATE event_sponsorship_details SET event_sponsor_id = l.id WHERE event_sponsor_id = r.id;
        END IF;
      END IF;
      FOR a IN SELECT * FROM event_sponsor_contacts WHERE event_sponsor_id = r.id LOOP
        IF EXISTS (SELECT 1 FROM event_sponsor_contacts x WHERE x.event_sponsor_id = l.id AND x.member_id = a.member_id) THEN
          _removed := _removed || jsonb_build_object('table', 'event_sponsor_contacts', 'row', to_jsonb(a));
        ELSE
          _moved := _moved || jsonb_build_object('table', 'contact_link', 'id', a.id, 'from', a.event_sponsor_id);
          UPDATE event_sponsor_contacts SET event_sponsor_id = l.id WHERE id = a.id;
        END IF;
      END LOOP;
      _removed := _removed || jsonb_build_object('table', 'event_sponsors',
        'row', to_jsonb((SELECT x FROM event_sponsors x WHERE x.id = r.id)));
      DELETE FROM event_sponsors WHERE id = r.id;
    END IF;
  END LOOP;

  -- Meetings and creatives. The append-only meeting history keeps the ids it recorded.
  FOR r IN SELECT * FROM sponsor_meeting_interests WHERE sponsor_id = ANY (_others) LOOP
    IF EXISTS (SELECT 1 FROM sponsor_meeting_interests x WHERE x.sponsor_id = _survivor AND x.event_id = r.event_id
                AND x.registration_id IS NOT DISTINCT FROM r.registration_id AND x.speaker_id IS NOT DISTINCT FROM r.speaker_id) THEN
      _removed := _removed || jsonb_build_object('table', 'sponsor_meeting_interests', 'row', to_jsonb(r));
      DELETE FROM sponsor_meeting_interests WHERE id = r.id;
    ELSE
      _moved := _moved || jsonb_build_object('table', 'sponsor_meeting_interests', 'id', r.id, 'from', r.sponsor_id);
      UPDATE sponsor_meeting_interests SET sponsor_id = _survivor WHERE id = r.id;
    END IF;
  END LOOP;
  FOR r IN SELECT id, sponsor_id FROM event_creatives WHERE sponsor_id = ANY (_others) LOOP
    _moved := _moved || jsonb_build_object('table', 'event_creatives', 'id', r.id, 'from', r.sponsor_id);
    UPDATE event_creatives SET sponsor_id = _survivor WHERE id = r.id;
  END LOOP;

  INSERT INTO merge_operations (id, entity_type, survivor_id, merged_ids, moved, removed, survivor_before, reason, actor_id)
  VALUES (_op, 'sponsor', _survivor, _others, _moved, _removed, to_jsonb(_surv), _reason, _uid);

  -- Details the survivor lacks; nothing it has is replaced.
  UPDATE sponsors s
     SET email = COALESCE(s.email, o.email), logo_url = COALESCE(s.logo_url, o.logo_url), description = COALESCE(s.description, o.description)
    FROM (SELECT max(email) AS email, max(logo_url) AS logo_url, max(description) AS description FROM sponsors WHERE id = ANY (_others)) o
   WHERE s.id = _survivor;
  UPDATE sponsors SET merged_into = _survivor WHERE id = ANY (_others);

  INSERT INTO audit_logs (actor_id, action, target_type, target_id, details)
  VALUES (_uid, 'intel.sponsors_merged', 'sponsor', _survivor::text,
          jsonb_build_object('merge_id', _op, 'merged', _others, 'reason', _reason, 'moved', jsonb_array_length(_moved), 'deduplicated', jsonb_array_length(_removed)));
  RETURN _op;
END;
$$;
CREATE OR REPLACE FUNCTION public.intel_sponsor_merge_preview(_survivor uuid, _others uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _all uuid[] := _others || _survivor;
BEGIN
  PERFORM public._require_super_admin();
  RETURN jsonb_build_object(
    'records', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'email', s.email, 'website', s.website, 'logo_url', s.logo_url,
        'description', s.description, 'company_id', s.company_id, 'company', (SELECT c.name FROM companies c WHERE c.id = s.company_id), 'user_id', s.user_id,
        'owner', (SELECT u.email FROM auth.users u WHERE u.id = s.user_id), 'created_at', s.created_at,
        'team', (SELECT count(*) FROM sponsor_members m WHERE m.sponsor_id = s.id),
        'events', COALESCE((SELECT jsonb_agg(jsonb_build_object('event', e.title, 'date', e.date, 'tier', es.tier, 'tier_label', es.tier_label) ORDER BY e.date DESC NULLS LAST)
                      FROM event_sponsors es JOIN events e ON e.id = es.event_id WHERE es.sponsor_id = s.id), '[]'::jsonb)))
        FROM sponsors s WHERE s.id = ANY (_all)), '[]'::jsonb),
    'same_owner', (SELECT count(DISTINCT user_id) = 1 OR count(DISTINCT public._sponsor_scope(id)) = 1 FROM sponsors WHERE id = ANY (_all)),
    'same_company', (SELECT count(DISTINCT company_id) = 1 AND bool_and(company_id IS NOT NULL) FROM sponsors WHERE id = ANY (_all)),
    'conflicts', COALESCE((SELECT jsonb_agg(DISTINCT e.title)
        FROM event_sponsors a JOIN event_sponsors b ON a.event_id = b.event_id AND a.id < b.id JOIN events e ON e.id = a.event_id
       WHERE a.sponsor_id = ANY (_all) AND b.sponsor_id = ANY (_all)
         AND public._sponsorship_title(a.tier, a.tier_label) <> public._sponsorship_title(b.tier, b.tier_label)), '[]'::jsonb),
    'repeats', (SELECT count(*) FROM event_sponsors a JOIN event_sponsors b ON a.event_id = b.event_id AND a.id < b.id
       WHERE a.sponsor_id = ANY (_all) AND b.sponsor_id = ANY (_all)
         AND public._sponsorship_title(a.tier, a.tier_label) = public._sponsorship_title(b.tier, b.tier_label))
  );
END;
$$;

/*
 * Combines the repeat records of one company: first those in one organisation,
 * then any left that one person owns. What can't be combined (different titles
 * on one event) is reported, not forced. Each merge rolls back on its own.
 */
CREATE OR REPLACE FUNCTION public.intel_consolidate_company_sponsors(_company uuid, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g        record;
  _pass    integer;
  _merged  integer := 0;
  _skipped jsonb := '[]'::jsonb;
BEGIN
  PERFORM public._require_super_admin();
  FOR _pass IN 1..2 LOOP
    FOR g IN
      SELECT (ARRAY_AGG(x.id ORDER BY x.n DESC, x.created_at, x.id)) AS ids, max(x.name) AS name
        FROM (SELECT s.id, s.name, s.created_at, (SELECT count(*) FROM event_sponsors es WHERE es.sponsor_id = s.id) AS n,
                     CASE _pass WHEN 1 THEN public._sponsor_scope(s.id) ELSE s.user_id::text END AS grp
                FROM sponsors s WHERE s.company_id = _company AND s.merged_into IS NULL) x
       GROUP BY x.grp HAVING count(*) > 1
    LOOP
      BEGIN
        PERFORM public.intel_merge_sponsors(g.ids[1], g.ids[2:], COALESCE(_reason, 'Company merged'));
        _merged := _merged + array_length(g.ids, 1) - 1;
      EXCEPTION WHEN unique_violation OR insufficient_privilege THEN
        IF _pass = 2 OR NOT _skipped @> jsonb_build_array(jsonb_build_object('ids', g.ids)) THEN
          _skipped := _skipped || jsonb_build_object('ids', g.ids, 'name', g.name, 'reason', SQLERRM);
        END IF;
      END;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('merged', _merged, 'skipped', _skipped);
END;
$$;

-- Every company's repeats, on Super Admin's request.
CREATE OR REPLACE FUNCTION public.intel_combine_all_sponsor_repeats(_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c        uuid;
  r        jsonb;
  _merged  integer := 0;
  _skipped jsonb := '[]'::jsonb;
BEGIN
  PERFORM public._require_super_admin();
  FOR c IN SELECT company_id FROM sponsors WHERE company_id IS NOT NULL AND merged_into IS NULL GROUP BY company_id HAVING count(*) > 1 LOOP
    r := public.intel_consolidate_company_sponsors(c, COALESCE(_reason, 'Combined repeat sponsor records'));
    _merged := _merged + (r ->> 'merged')::int;
    _skipped := _skipped || (r -> 'skipped');
  END LOOP;
  RETURN jsonb_build_object('merged', _merged, 'skipped', _skipped);
END;
$$;

/*
 * Sponsors by company: one row for each company, with its records and every
 * event's sponsorship under it. A record with no company is a row of its own.
 * _filter: 'all', 'unconnected', or 'repeats' (more than one record).
 */
CREATE OR REPLACE FUNCTION public.intel_sponsor_companies(_q text DEFAULT NULL, _limit integer DEFAULT 25, _offset integer DEFAULT 0, _filter text DEFAULT 'all')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _k text := COALESCE(public.company_name_key(_q), '');
  _t text := lower(COALESCE(public.norm_text(_q), ''));
BEGIN
  PERFORM public._require_super_admin();
  RETURN (
    WITH live AS (
      SELECT s.*, public._sponsor_scope(s.id) AS scope, COALESCE(s.company_id::text, s.id::text) AS grp FROM sponsors s WHERE s.merged_into IS NULL
    ), grouped AS (
      SELECT l.grp, max(l.company_id::text)::uuid AS company_id, count(*) AS records,
             lower(COALESCE((SELECT c.name FROM companies c WHERE c.id = max(l.company_id::text)::uuid), btrim(min(l.name)))) AS sort_name,
             COALESCE((SELECT c.name FROM companies c WHERE c.id = max(l.company_id::text)::uuid), btrim(min(l.name))) AS name
        FROM live l
       WHERE _t = '' OR EXISTS (SELECT 1 FROM live o WHERE o.grp = l.grp
               AND (public.company_name_key(o.name) LIKE '%' || _k || '%' OR lower(COALESCE(o.email, '')) LIKE '%' || _t || '%' OR lower(COALESCE(o.website, '')) LIKE '%' || _t || '%'))
       GROUP BY l.grp
    ), q AS (
      SELECT g.* FROM grouped g
       WHERE CASE _filter WHEN 'unconnected' THEN g.company_id IS NULL WHEN 'repeats' THEN g.records > 1 ELSE true END
    ), page AS (
      SELECT * FROM q ORDER BY q.sort_name, q.grp
       LIMIT LEAST(GREATEST(COALESCE(_limit, 25), 1), 200) OFFSET GREATEST(COALESCE(_offset, 0), 0)
    )
    SELECT jsonb_build_object(
      'total', (SELECT count(*) FROM q),
      -- How many records Combine all would fold in.
      'combinable', (SELECT COALESCE(sum(n - 1), 0) FROM (SELECT count(*) AS n FROM live WHERE company_id IS NOT NULL GROUP BY company_id, scope HAVING count(*) > 1) x),
      'rows', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'key', p.grp, 'company_id', p.company_id, 'name', p.name, 'record_count', p.records,
        'domains', ARRAY(SELECT d.domain FROM company_domains d WHERE d.company_id = p.company_id ORDER BY d.domain),
        'records', (SELECT jsonb_agg(jsonb_build_object('id', l.id, 'name', btrim(l.name), 'email', l.email, 'website', l.website,
                      'owner', (SELECT u.email FROM auth.users u WHERE u.id = l.user_id),
                      'events', (SELECT count(*) FROM event_sponsors es WHERE es.sponsor_id = l.id),
                      'team', (SELECT count(*) FROM sponsor_members m WHERE m.sponsor_id = l.id)) ORDER BY l.created_at, l.id)
                      FROM live l WHERE l.grp = p.grp),
        -- Sets of records that can become one; records outside them belong to other organisations.
        'combine_sets', COALESCE((SELECT jsonb_agg(x.ids) FROM (
                      SELECT ARRAY_AGG(l.id ORDER BY (SELECT count(*) FROM event_sponsors es WHERE es.sponsor_id = l.id) DESC, l.created_at, l.id) AS ids
                        FROM live l WHERE l.grp = p.grp AND p.company_id IS NOT NULL GROUP BY l.scope HAVING count(*) > 1) x), '[]'::jsonb),
        'organisations', (SELECT count(DISTINCT l.scope) FROM live l WHERE l.grp = p.grp),
        'team', (SELECT count(*) FROM sponsor_members m JOIN live l ON l.id = m.sponsor_id WHERE l.grp = p.grp),
        'sponsorships', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', es.id, 'event', e.title, 'date', e.date, 'tier', es.tier, 'tier_label', es.tier_label,
                      'sponsor_id', l.id, 'owner', (SELECT u.email FROM auth.users u WHERE u.id = l.user_id)) ORDER BY e.date DESC NULLS LAST, es.id)
                      FROM live l JOIN event_sponsors es ON es.sponsor_id = l.id JOIN events e ON e.id = es.event_id WHERE l.grp = p.grp), '[]'::jsonb))
        ORDER BY p.sort_name, p.grp) FROM page p), '[]'::jsonb))
  );
END;
$$;


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
       WHERE s.merged_into IS NULL
         AND (_t = '' OR s.id::text = _t OR public.company_name_key(s.name) LIKE '%' || _k || '%'
              OR lower(COALESCE(s.email, '')) LIKE '%' || _t || '%' OR lower(COALESCE(s.website, '')) LIKE '%' || _t || '%')
         AND CASE _filter
               WHEN 'unconnected' THEN s.company_id IS NULL
               WHEN 'repeats' THEN s.company_id IS NOT NULL AND EXISTS (SELECT 1 FROM sponsors o WHERE o.company_id = s.company_id AND o.id <> s.id AND o.merged_into IS NULL)
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
          'same_company', (SELECT count(*) FROM sponsors o WHERE p.company_id IS NOT NULL AND o.company_id = p.company_id AND o.id <> p.id AND o.merged_into IS NULL),
          'same_owner', ARRAY(SELECT o.id FROM sponsors o WHERE p.company_id IS NOT NULL AND o.company_id = p.company_id AND o.id <> p.id AND o.merged_into IS NULL
                               AND (o.user_id IS NOT DISTINCT FROM p.user_id OR public._sponsor_scope(o.id) = public._sponsor_scope(p.id))),
          'events', (SELECT count(*) FROM event_sponsors es WHERE es.sponsor_id = p.id),
          'sponsorships', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', es.id, 'event', e.title, 'date', e.date, 'tier', es.tier, 'tier_label', es.tier_label) ORDER BY e.date DESC NULLS LAST)
                             FROM event_sponsors es JOIN events e ON e.id = es.event_id WHERE es.sponsor_id = p.id), '[]'::jsonb),
          'team', (SELECT count(*) FROM sponsor_members sm WHERE sm.sponsor_id = p.id),
          'created_by', (SELECT u.email FROM auth.users u WHERE u.id = p.user_id))
          ORDER BY CASE WHEN _filter = 'repeats' THEN p.company_sort END, lower(p.name), p.id) FROM page p), '[]'::jsonb))
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.intel_sponsor_review(_kind text DEFAULT NULL, _limit integer DEFAULT 25, _offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._require_super_admin();
  RETURN (
    WITH live AS (SELECT s.*, public._canonical_company(s.company_id) AS co FROM sponsors s WHERE s.merged_into IS NULL),
    mem AS (SELECT m.*, l.co, l.name AS sponsor_name, COALESCE(m.display_name, m.email) AS label FROM sponsor_members m JOIN live l ON l.id = m.sponsor_id),
    items AS (
      -- Records of one organisation for one company.
      SELECT 'duplicate_sponsor_records' AS kind, c.name AS title,
             count(*) || ' records from ' || string_agg(DISTINCT COALESCE((SELECT u.email FROM auth.users u WHERE u.id = l.user_id), 'an organiser'), ', ') AS detail,
             c.id AS company_id, ARRAY_AGG(l.id ORDER BY l.created_at) AS sponsor_ids, '{}'::uuid[] AS person_ids
        FROM live l JOIN companies c ON c.id = l.co GROUP BY c.id, c.name, public._sponsor_scope(l.id) HAVING count(*) > 1
      UNION ALL
      -- One company twice on one event, on any organiser's records.
      SELECT 'same_event_repeat', c.name, count(*) || ' sponsorships on ' || COALESCE(e.title, 'an event') || ': ' ||
             string_agg(COALESCE(NULLIF(es.tier_label, ''), es.tier, 'no title'), ', ' ORDER BY es.created_at),
             c.id, ARRAY_AGG(l.id ORDER BY es.created_at), '{}'::uuid[]
        FROM event_sponsors es JOIN live l ON l.id = es.sponsor_id JOIN companies c ON c.id = l.co JOIN events e ON e.id = es.event_id
       GROUP BY c.id, c.name, e.id, e.title HAVING count(*) > 1
      UNION ALL
      -- Records not tied to a company, which means their team isn't either.
      SELECT 'contact_no_company', l.name, count(m.id) || ' team members; this sponsor isn''t connected to a company',
             NULL::uuid, ARRAY[l.id], '{}'::uuid[]
        FROM live l JOIN sponsor_members m ON m.sponsor_id = l.id WHERE l.co IS NULL GROUP BY l.id, l.name
      UNION ALL
      SELECT 'contact_no_person', m.label, m.sponsor_name || ' team; no contact record, probably an invalid email (' || m.email || ')',
             m.co, ARRAY[m.sponsor_id], '{}'::uuid[]
        FROM mem m WHERE m.person_id IS NULL
      UNION ALL
      -- The team member's own record names a different company from their sponsor's.
      SELECT 'contact_company_mismatch', m.label, 'Entered as "' || m.company || '", but on the team of ' || c.name,
             c.id, ARRAY[m.sponsor_id], ARRAY_REMOVE(ARRAY[m.person_id], NULL)
        FROM mem m JOIN companies c ON c.id = m.co
       WHERE public.company_name_key(m.company) <> '' AND public.company_name_key(m.company) <> c.name_key
         AND NOT EXISTS (SELECT 1 FROM company_aliases a WHERE a.company_id = c.id AND a.alias_key = public.company_name_key(m.company))
      UNION ALL
      -- Same name at one company under different contact records.
      SELECT 'duplicate_contact', max(m.label), 'Same name at ' || c.name || ' with ' || count(DISTINCT m.person_id) || ' contact records',
             c.id, '{}'::uuid[], ARRAY_AGG(DISTINCT m.person_id)
        FROM mem m JOIN companies c ON c.id = m.co JOIN people p ON p.id = m.person_id
       WHERE p.name_key <> '' GROUP BY c.id, c.name, p.name_key HAVING count(DISTINCT m.person_id) > 1
      UNION ALL
      -- One person on the teams of different companies.
      SELECT 'contact_multiple_companies', COALESCE(p.display_name, 'Contact'), 'On the teams of ' || string_agg(DISTINCT c.name, ', '),
             NULL::uuid, ARRAY_AGG(DISTINCT m.sponsor_id), ARRAY[p.id]
        FROM mem m JOIN companies c ON c.id = m.co JOIN people p ON p.id = m.person_id
       GROUP BY p.id, p.display_name HAVING count(DISTINCT m.co) > 1
    ),
    q AS (SELECT * FROM items WHERE _kind IS NULL OR kind = _kind),
    page AS (SELECT * FROM q ORDER BY kind, title, company_id LIMIT LEAST(GREATEST(COALESCE(_limit, 25), 1), 200) OFFSET GREATEST(COALESCE(_offset, 0), 0))
    SELECT jsonb_build_object(
      'total', (SELECT count(*) FROM q),
      'counts', COALESCE((SELECT jsonb_object_agg(kind, n) FROM (SELECT kind, count(*) n FROM items GROUP BY kind) k), '{}'::jsonb),
      'rows', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.kind, p.title, p.company_id) FROM page p), '[]'::jsonb))
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
    'sponsors_unconnected', (SELECT count(*) FROM sponsors WHERE company_id IS NULL AND merged_into IS NULL),
    'sponsors_repeats', (SELECT COALESCE(sum(n - 1), 0) FROM (SELECT count(*) AS n FROM sponsors WHERE company_id IS NOT NULL AND merged_into IS NULL GROUP BY company_id, public._sponsor_scope(id) HAVING count(*) > 1) g),
    -- A connected company counts once, however many organisers have a record of it.
    'sponsor_identities', (SELECT count(DISTINCT company_id) + count(*) FILTER (WHERE company_id IS NULL) FROM sponsors WHERE merged_into IS NULL),
    'event_sponsorships', (SELECT count(*) FROM event_sponsors),
    'merge_recommendations',
      (SELECT count(*) FROM identity_match_candidates m JOIN people a ON a.id = m.person_a JOIN people b ON b.id = m.person_b
        WHERE m.status = 'open' AND a.merged_into IS NULL AND b.merged_into IS NULL AND m.score >= 80)
    + (SELECT count(*) FROM company_match_candidates m JOIN companies a ON a.id = m.company_a JOIN companies b ON b.id = m.company_b
        WHERE m.status = 'open' AND a.merged_into IS NULL AND b.merged_into IS NULL AND m.score >= 80)
    + (SELECT count(*) FROM (SELECT 1 FROM sponsors WHERE company_id IS NOT NULL AND merged_into IS NULL GROUP BY company_id, public._sponsor_scope(id) HAVING count(*) > 1) g)
  );
END;
$$;


-- ── 5. Who may call what ─────────────────────────────────────────────────────

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['_sponsor_scope(uuid)', '_event_scope(uuid)', '_sponsor_usable_on(uuid, uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
  -- Used inside access rules, so signed-in callers need them; they reveal only yes or no about the caller.
  FOREACH f IN ARRAY ARRAY['_can_manage_sponsor(uuid)', '_can_manage_event_sponsors(uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
  FOREACH f IN ARRAY ARRAY[
    'organizer_sponsor_options(uuid, text, integer)',
    'organizer_add_event_sponsor(uuid, uuid, uuid, text, text, text, text, text, text, text)',
    'intel_combine_all_sponsor_repeats(text)', 'intel_sponsor_companies(text, integer, integer, text)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;
