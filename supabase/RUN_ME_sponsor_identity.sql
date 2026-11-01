-- ═══════════════════════════════════════════════════════════════════════════════
-- Sponsor identity: one company, one sponsor record per organiser, and each
-- event's sponsorship kept separately.
--
-- Why sponsors repeated: the partnership title lived on the sponsor record, so
-- giving a company a different title on another event meant creating another
-- record, and nothing tied those records together. Merging companies could not
-- help, because sponsors were not linked to companies at all until migration 065.
--
--   companies              the company identity (unchanged)
--   sponsors               the sponsor identity: an organiser's record of a
--                          company. Gains merged_into.
--   event_sponsors         the event sponsorship. Gains its own partnership title
--                          (tier, tier_label) and event logo, which stay public.
--   event_sponsorship_details  package, commercial value, deliverables, status,
--                          contract, payment and notes. New and private:
--                          event_sponsors is readable by everyone, so these
--                          cannot live on it.
--   sponsor_members        a person on a sponsor's team (unchanged)
--   event_sponsor_contacts which team members work on which event sponsorship,
--                          and in what role. New.
--
-- Every event keeps exactly the title it shows today. Team members keep the
-- access they have today: the sponsor portal still works per sponsor record,
-- and assignments describe who does what on each event.
--
-- Sponsor records of the same organiser and company can be merged by Super Admin,
-- with rollback. Records of different organisers stay separate because each
-- organiser edits their own; they are grouped by company instead. Nothing here
-- merges anything by itself.
--
-- Run RUN_ME_intelligence_part2.sql (065) first.
-- Safe to run more than once. Paste into the SQL Editor and Run.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ── 1. Structure ─────────────────────────────────────────────────────────────

DO $$
DECLARE
  f record;
  _want constant jsonb := '{"intel_search_contacts":7,"intel_search_companies":8,"intel_duplicate_queue":5,"intel_corrections":5,"intel_audit_history":8}';
BEGIN
  IF to_regclass('public.merge_operations') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.sponsors'::regclass AND attname = 'company_id' AND NOT attisdropped) THEN
    RAISE EXCEPTION 'Run RUN_ME_intelligence_centre.sql and then RUN_ME_intelligence_part2.sql first';
  END IF;
  -- Older versions of these lists, left by running the Intelligence Centre script again, make them ambiguous to call.
  FOR f IN
    SELECT p.oid::regprocedure AS sig, p.proname, p.pronargs
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND _want ? p.proname::text
  LOOP
    IF f.pronargs <> (_want ->> f.proname::text)::int
       AND EXISTS (SELECT 1 FROM pg_proc q JOIN pg_namespace m ON m.oid = q.pronamespace
                    WHERE m.nspname = 'public' AND q.proname = f.proname AND q.pronargs = (_want ->> f.proname::text)::int) THEN
      EXECUTE format('DROP FUNCTION %s', f.sig);
    END IF;
  END LOOP;
END $$;

ALTER TABLE public.sponsors ADD COLUMN IF NOT EXISTS merged_into uuid REFERENCES public.sponsors(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS sponsors_merged_into_idx ON public.sponsors (merged_into) WHERE merged_into IS NOT NULL;

ALTER TABLE public.event_sponsors ADD COLUMN IF NOT EXISTS tier       text;
ALTER TABLE public.event_sponsors ADD COLUMN IF NOT EXISTS tier_label text;
ALTER TABLE public.event_sponsors ADD COLUMN IF NOT EXISTS logo_url   text;

-- Each event keeps the title it shows today.
UPDATE public.event_sponsors es
   SET tier = CASE WHEN es.tier_override IS NULL THEN s.tier
                   WHEN lower(es.tier_override) IN ('platinum','gold','silver','bronze') THEN lower(es.tier_override)
                   ELSE 'custom' END,
       tier_label = CASE WHEN es.tier_override IS NULL THEN s.tier_label
                         WHEN lower(es.tier_override) IN ('platinum','gold','silver','bronze') THEN NULL
                         ELSE es.tier_override END
  FROM public.sponsors s
 WHERE s.id = es.sponsor_id AND es.tier IS NULL;

CREATE TABLE IF NOT EXISTS public.event_sponsorship_details (
  event_sponsor_id uuid PRIMARY KEY REFERENCES public.event_sponsors(id) ON DELETE CASCADE,
  package          text,
  commercial_value numeric(14,2),
  currency         text NOT NULL DEFAULT 'INR',
  deliverables     text,
  status           text NOT NULL DEFAULT 'confirmed'
                   CHECK (status IN ('prospect','proposed','confirmed','active','completed','cancelled')),
  contract_url     text,
  payment_status   text NOT NULL DEFAULT 'not_invoiced'
                   CHECK (payment_status IN ('not_invoiced','invoiced','part_paid','paid','overdue','waived')),
  notes            text,
  updated_by       uuid,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.event_sponsor_contacts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_sponsor_id uuid NOT NULL REFERENCES public.event_sponsors(id) ON DELETE CASCADE,
  member_id        uuid NOT NULL REFERENCES public.sponsor_members(id) ON DELETE CASCADE,
  role_label       text,
  responsibilities text,
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_sponsor_id, member_id)
);
CREATE INDEX IF NOT EXISTS event_sponsor_contacts_member_idx ON public.event_sponsor_contacts (member_id);

-- Reached only through the functions below, which check the caller's access.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['event_sponsorship_details','event_sponsor_contacts'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- Today a team member works on every event of their sponsor, so that is what is recorded.
INSERT INTO public.event_sponsor_contacts (event_sponsor_id, member_id)
SELECT es.id, m.id FROM public.event_sponsors es JOIN public.sponsor_members m ON m.sponsor_id = es.sponsor_id
ON CONFLICT (event_sponsor_id, member_id) DO NOTHING;

-- merge_operations also records sponsor merges.
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
   WHERE conrelid = 'public.merge_operations'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%entity_type%';
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE public.merge_operations DROP CONSTRAINT %I', c); END IF;
  ALTER TABLE public.merge_operations ADD CONSTRAINT merge_operations_entity_type_check CHECK (entity_type IN ('person','company','sponsor'));
END $$;


-- ── 2. Canonical company, titles, access ─────────────────────────────────────

-- The company a record now belongs to, following any merges.
CREATE OR REPLACE FUNCTION public._canonical_company(_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH RECURSIVE c AS (
    SELECT id, merged_into, 0 AS depth FROM companies WHERE id = _id
    UNION ALL
    SELECT n.id, n.merged_into, c.depth + 1 FROM companies n JOIN c ON n.id = c.merged_into WHERE c.depth < 20
  )
  SELECT id FROM c WHERE merged_into IS NULL LIMIT 1;
$$;

-- A link saved while its company was being merged still reaches the survivor.
UPDATE public.sponsors s SET company_id = public._canonical_company(s.company_id)
 WHERE s.company_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.companies c WHERE c.id = s.company_id AND c.merged_into IS NOT NULL);

-- Comparable form of a partnership title.
CREATE OR REPLACE FUNCTION public._sponsorship_title(_tier text, _label text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN _tier = 'custom' THEN lower(btrim(COALESCE(_label, ''))) ELSE lower(COALESCE(_tier, '')) END;
$$;

/*
 * What the caller may do with an event's sponsorships: 'commercial' (everything),
 * 'manage' (everything except commercial details) or NULL (nothing). Viewers
 * and other organisations get nothing.
 */
CREATE OR REPLACE FUNCTION public._sponsorship_access(_event uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
           WHEN e.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR o.owner_id = auth.uid() OR m.role IN ('owner','admin') THEN 'commercial'
           WHEN m.role = 'member' THEN 'manage'
         END
    FROM events e
    LEFT JOIN organizations o ON o.id = e.org_id
    LEFT JOIN org_members m ON m.org_id = e.org_id AND m.user_id = auth.uid()
   WHERE e.id = _event AND auth.uid() IS NOT NULL;
$$;

-- A new event sponsorship starts with the sponsor's usual title, so every existing way of adding one keeps working.
CREATE OR REPLACE FUNCTION public.event_sponsors_default_title()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.tier IS NULL THEN
    SELECT s.tier, s.tier_label INTO NEW.tier, NEW.tier_label FROM sponsors s WHERE s.id = NEW.sponsor_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS event_sponsors_a_default_title ON public.event_sponsors;
CREATE TRIGGER event_sponsors_a_default_title BEFORE INSERT ON public.event_sponsors
  FOR EACH ROW EXECUTE FUNCTION public.event_sponsors_default_title();

/*
 * One company cannot hold the same title twice on one event: that is one
 * sponsorship entered twice. Different titles are separate agreements and stay
 * allowed, as does the same company on any number of events.
 */
CREATE OR REPLACE FUNCTION public.event_sponsors_no_repeat()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _company uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND public._sponsorship_title(NEW.tier, NEW.tier_label) = public._sponsorship_title(OLD.tier, OLD.tier_label) THEN
    RETURN NEW;
  END IF;
  SELECT company_id INTO _company FROM sponsors WHERE id = NEW.sponsor_id;
  IF _company IS NOT NULL AND EXISTS (
       SELECT 1 FROM event_sponsors o JOIN sponsors s ON s.id = o.sponsor_id
        WHERE o.event_id = NEW.event_id AND o.id <> NEW.id AND s.company_id = _company
          AND public._sponsorship_title(o.tier, o.tier_label) = public._sponsorship_title(NEW.tier, NEW.tier_label)) THEN
    RAISE EXCEPTION 'This company already has this partnership title on this event' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS event_sponsors_b_no_repeat ON public.event_sponsors;
CREATE TRIGGER event_sponsors_b_no_repeat BEFORE INSERT OR UPDATE OF tier, tier_label ON public.event_sponsors
  FOR EACH ROW EXECUTE FUNCTION public.event_sponsors_no_repeat();

CREATE OR REPLACE FUNCTION public.sponsor_portal_events()
RETURNS TABLE(
  event_id uuid, event_title text, event_date timestamptz, end_date timestamptz, location text,
  sponsor_id uuid, sponsor_name text, tier text,
  registrations_count bigint, checked_in_count bigint
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH user_sponsors AS (
    SELECT sm.sponsor_id
      FROM sponsor_members sm
     WHERE sm.user_id = auth.uid() AND sm.accepted_at IS NOT NULL
    UNION
    SELECT s.id AS sponsor_id
      FROM sponsors s
     WHERE s.user_id = auth.uid()
  )
  SELECT
    e.id, e.title, e.date, e.end_date, e.location,
    s.id, s.name, COALESCE(es.tier_override, CASE WHEN es.tier = 'custom' THEN es.tier_label END, es.tier, s.tier),
    (SELECT count(*) FROM registrations r WHERE r.event_id = e.id AND r.approval_status = 'approved'),
    (SELECT count(*) FROM registrations r WHERE r.event_id = e.id AND r.checked_in = true)
  FROM user_sponsors us
  JOIN sponsors s         ON s.id = us.sponsor_id
  JOIN event_sponsors es  ON es.sponsor_id = s.id
  JOIN events e           ON e.id = es.event_id
  ORDER BY e.date DESC;
$$;


-- ── 3. Organisers: an event's sponsorships ───────────────────────────────────

-- Sponsorships on an event, one row each. Commercial value only for those allowed to see it.
CREATE OR REPLACE FUNCTION public.organizer_event_sponsorships(_event uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _access text := public._sponsorship_access(_event);
BEGIN
  IF _access IS NULL THEN RAISE EXCEPTION 'You don''t have access to this event''s sponsors' USING ERRCODE = '42501'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'event_sponsor_id', es.id, 'sponsor_id', es.sponsor_id, 'company_id', s.company_id,
      'company', c.name, 'tier', es.tier, 'tier_label', es.tier_label, 'logo_url', COALESCE(es.logo_url, s.logo_url),
      'package', d.package, 'status', COALESCE(d.status, 'confirmed'),
      'commercial_value', CASE WHEN _access = 'commercial' THEN d.commercial_value END,
      'currency', CASE WHEN _access = 'commercial' THEN d.currency END,
      'contacts', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', m.id, 'name', COALESCE(m.display_name, m.email), 'role', a.role_label) ORDER BY m.created_at)
                              FROM event_sponsor_contacts a JOIN sponsor_members m ON m.id = a.member_id WHERE a.event_sponsor_id = es.id), '[]'::jsonb)
    ) ORDER BY es.display_order, es.created_at)
      FROM event_sponsors es
      JOIN sponsors s ON s.id = es.sponsor_id
      LEFT JOIN companies c ON c.id = public._canonical_company(s.company_id)
      LEFT JOIN event_sponsorship_details d ON d.event_sponsor_id = es.id
     WHERE es.event_id = _event), '[]'::jsonb);
END;
$$;

/*
 * One sponsorship, split the way the organiser works with it: the company, this
 * event's sponsorship, the team, and past sponsorships. Past sponsorships and
 * other records' contacts appear only for events and sponsors the caller
 * already has access to.
 */
CREATE OR REPLACE FUNCTION public.organizer_sponsorship_detail(_event_sponsor uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  l       event_sponsors%ROWTYPE;
  s       sponsors%ROWTYPE;
  d       event_sponsorship_details%ROWTYPE;
  _access text;
  _co     uuid;
BEGIN
  SELECT * INTO l FROM event_sponsors WHERE id = _event_sponsor;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sponsorship not found' USING ERRCODE = 'P0002'; END IF;
  _access := public._sponsorship_access(l.event_id);
  IF _access IS NULL THEN RAISE EXCEPTION 'You don''t have access to this event''s sponsors' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM sponsors WHERE id = l.sponsor_id;
  SELECT * INTO d FROM event_sponsorship_details WHERE event_sponsor_id = l.id;
  _co := public._canonical_company(s.company_id);
  RETURN jsonb_build_object(
    'access', _access,
    'sponsor', jsonb_build_object('id', s.id, 'name', s.name, 'email', s.email, 'website', s.website, 'logo_url', s.logo_url, 'description', s.description),
    'company', (SELECT jsonb_build_object('id', c.id, 'name', c.name, 'website', c.website, 'industry', c.industry, 'description', c.description,
                  'domains', ARRAY(SELECT dm.domain FROM company_domains dm WHERE dm.company_id = c.id ORDER BY dm.domain))
                  FROM companies c WHERE c.id = _co),
    'sponsorship', jsonb_build_object(
      'id', l.id, 'event_id', l.event_id, 'tier', l.tier, 'tier_label', l.tier_label, 'logo_url', l.logo_url,
      'package', d.package, 'deliverables', d.deliverables, 'status', COALESCE(d.status, 'confirmed'), 'notes', d.notes,
      'commercial_value', CASE WHEN _access = 'commercial' THEN d.commercial_value END,
      'currency', CASE WHEN _access = 'commercial' THEN COALESCE(d.currency, 'INR') END,
      'contract_url', CASE WHEN _access = 'commercial' THEN d.contract_url END,
      'payment_status', CASE WHEN _access = 'commercial' THEN COALESCE(d.payment_status, 'not_invoiced') END),
    'team', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', m.id, 'person_id', m.person_id, 'name', m.display_name, 'email', m.email, 'designation', m.designation,
              'accepted_at', m.accepted_at, 'invite_token', m.invite_token, 'assigned', a.id IS NOT NULL, 'role_label', a.role_label, 'responsibilities', a.responsibilities) ORDER BY a.id IS NULL, m.created_at)
              FROM sponsor_members m LEFT JOIN event_sponsor_contacts a ON a.member_id = m.id AND a.event_sponsor_id = l.id
             WHERE m.sponsor_id = l.sponsor_id), '[]'::jsonb),
    'history', COALESCE((SELECT jsonb_agg(jsonb_build_object('event_sponsor_id', o.id, 'event_id', e.id, 'event', e.title, 'date', e.date, 'tier', o.tier, 'tier_label', o.tier_label) ORDER BY e.date DESC NULLS LAST)
              FROM event_sponsors o JOIN sponsors os ON os.id = o.sponsor_id JOIN events e ON e.id = o.event_id
             WHERE o.id <> l.id AND public._sponsorship_access(o.event_id) IS NOT NULL
               AND (o.sponsor_id = l.sponsor_id OR (_co IS NOT NULL AND public._canonical_company(os.company_id) = _co))), '[]'::jsonb)
  );
END;
$$;

-- This event's title, logo and details. Commercial fields need commercial access.
CREATE OR REPLACE FUNCTION public.organizer_update_sponsorship(_event_sponsor uuid, _changes jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  l       event_sponsors%ROWTYPE;
  _access text;
  _c      jsonb := COALESCE(_changes, '{}'::jsonb);
BEGIN
  SELECT * INTO l FROM event_sponsors WHERE id = _event_sponsor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sponsorship not found' USING ERRCODE = 'P0002'; END IF;
  _access := public._sponsorship_access(l.event_id);
  IF _access IS NULL THEN RAISE EXCEPTION 'You don''t have access to this event''s sponsors' USING ERRCODE = '42501'; END IF;
  IF _access <> 'commercial' AND (_c ?| ARRAY['commercial_value','currency','contract_url','payment_status']) THEN
    RAISE EXCEPTION 'Only the event owner or an organisation admin can change commercial details' USING ERRCODE = '42501';
  END IF;

  UPDATE event_sponsors
     SET tier       = CASE WHEN _c ? 'tier' THEN NULLIF(_c ->> 'tier', '') ELSE tier END,
         tier_label = CASE WHEN _c ? 'tier_label' THEN NULLIF(btrim(_c ->> 'tier_label'), '') ELSE tier_label END,
         logo_url   = CASE WHEN _c ? 'logo_url' THEN NULLIF(btrim(_c ->> 'logo_url'), '') ELSE logo_url END
   WHERE id = l.id;

  IF _c ?| ARRAY['package','commercial_value','currency','deliverables','status','contract_url','payment_status','notes'] THEN
    INSERT INTO event_sponsorship_details (event_sponsor_id) VALUES (l.id) ON CONFLICT (event_sponsor_id) DO NOTHING;
    UPDATE event_sponsorship_details
       SET package          = CASE WHEN _c ? 'package' THEN NULLIF(btrim(_c ->> 'package'), '') ELSE package END,
           commercial_value = CASE WHEN _c ? 'commercial_value' THEN NULLIF(_c ->> 'commercial_value', '')::numeric ELSE commercial_value END,
           currency         = CASE WHEN _c ? 'currency' THEN COALESCE(NULLIF(upper(btrim(_c ->> 'currency')), ''), currency) ELSE currency END,
           deliverables     = CASE WHEN _c ? 'deliverables' THEN NULLIF(btrim(_c ->> 'deliverables'), '') ELSE deliverables END,
           status           = CASE WHEN _c ? 'status' THEN _c ->> 'status' ELSE status END,
           contract_url     = CASE WHEN _c ? 'contract_url' THEN NULLIF(btrim(_c ->> 'contract_url'), '') ELSE contract_url END,
           payment_status   = CASE WHEN _c ? 'payment_status' THEN _c ->> 'payment_status' ELSE payment_status END,
           notes            = CASE WHEN _c ? 'notes' THEN NULLIF(btrim(_c ->> 'notes'), '') ELSE notes END,
           updated_by = auth.uid(), updated_at = now()
     WHERE event_sponsor_id = l.id;
  END IF;
END;
$$;


-- ── 4. Organisers: the sponsor's team ────────────────────────────────────────

-- The sponsor's company, connecting the record first if it has none yet.
CREATE OR REPLACE FUNCTION public._sponsor_company(_sponsor uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s sponsors%ROWTYPE;
BEGIN
  SELECT * INTO s FROM sponsors WHERE id = _sponsor;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF s.company_id IS NOT NULL THEN RETURN public._canonical_company(s.company_id); END IF;
  s.company_id := public._ensure_company_for_sponsor(s.name, s.website);
  IF s.company_id IS NOT NULL THEN UPDATE sponsors SET company_id = s.company_id WHERE id = _sponsor; END IF;
  RETURN s.company_id;
END;
$$;

-- Ties a team member's person record to the sponsor's company without replacing a current company they already have.
CREATE OR REPLACE FUNCTION public._link_member_to_company(_member uuid, _company uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m sponsor_members%ROWTYPE;
  _name text;
BEGIN
  SELECT * INTO m FROM sponsor_members WHERE id = _member;
  IF NOT FOUND OR m.person_id IS NULL OR _company IS NULL THEN RETURN m.person_id; END IF;
  SELECT name INTO _name FROM companies WHERE id = _company;
  PERFORM public.ensure_contact_person(m.email, m.display_name, m.mobile_country_code, m.mobile_number, m.linkedin_url,
                                       _name, _company, m.designation, 'sponsor_contact');
  IF EXISTS (SELECT 1 FROM people WHERE id = m.person_id AND current_company_id IS NULL) THEN
    PERFORM public._intel_set_field('person', m.person_id, 'current_company_id', _company::text, 'inferred', 'Added to a sponsor''s team', auth.uid());
  END IF;
  RETURN m.person_id;
END;
$$;

/*
 * Adds a person to a sponsor's team on one event. The company is never asked
 * for: it comes from the sponsorship. The same email always reaches the same
 * person record, and an address already on this team is assigned, not added
 * twice. Sends nothing; the caller sends the invitation for a new member.
 */
CREATE OR REPLACE FUNCTION public.organizer_add_sponsor_contact(
  _event_sponsor uuid, _first_name text, _last_name text, _email text,
  _designation text DEFAULT NULL, _phone_cc text DEFAULT NULL, _phone text DEFAULT NULL, _linkedin text DEFAULT NULL,
  _title text DEFAULT NULL, _role_label text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  l        event_sponsors%ROWTYPE;
  _company uuid;
  _cname   text;
  _member  uuid;
  _person  uuid;
  _exists  boolean := true;
  _addr    text := lower(btrim(COALESCE(_email, '')));
  _name    text := NULLIF(btrim(COALESCE(_first_name, '') || ' ' || COALESCE(_last_name, '')), '');
BEGIN
  SELECT * INTO l FROM event_sponsors WHERE id = _event_sponsor;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sponsorship not found' USING ERRCODE = 'P0002'; END IF;
  IF public._sponsorship_access(l.event_id) IS NULL THEN
    RAISE EXCEPTION 'You don''t have access to this event''s sponsors' USING ERRCODE = '42501';
  END IF;
  IF public.norm_email(_addr) IS NULL THEN RAISE EXCEPTION 'Enter a valid email address' USING ERRCODE = '22023'; END IF;
  IF _name IS NULL THEN RAISE EXCEPTION 'Enter the person''s name' USING ERRCODE = '22023'; END IF;

  _company := public._sponsor_company(l.sponsor_id);
  SELECT COALESCE((SELECT c.name FROM companies c WHERE c.id = _company), s.name) INTO _cname FROM sponsors s WHERE s.id = l.sponsor_id;

  SELECT id INTO _member FROM sponsor_members WHERE sponsor_id = l.sponsor_id AND lower(email) = _addr LIMIT 1;
  IF _member IS NULL THEN
    _exists := false;
    INSERT INTO sponsor_members (sponsor_id, email, display_name, title, first_name, last_name, designation, company,
                                 mobile_country_code, mobile_number, linkedin_url)
    VALUES (l.sponsor_id, _addr, _name, NULLIF(btrim(COALESCE(_title, '')), ''), NULLIF(btrim(COALESCE(_first_name, '')), ''), NULLIF(btrim(COALESCE(_last_name, '')), ''),
            NULLIF(btrim(COALESCE(_designation, '')), ''), _cname, NULLIF(btrim(COALESCE(_phone_cc, '')), ''), NULLIF(btrim(COALESCE(_phone, '')), ''), NULLIF(btrim(COALESCE(_linkedin, '')), ''))
    RETURNING id INTO _member;
  END IF;
  _person := public._link_member_to_company(_member, _company);

  INSERT INTO event_sponsor_contacts (event_sponsor_id, member_id, role_label, created_by)
  VALUES (l.id, _member, NULLIF(btrim(COALESCE(_role_label, '')), ''), auth.uid())
  ON CONFLICT (event_sponsor_id, member_id) DO UPDATE SET role_label = COALESCE(EXCLUDED.role_label, event_sponsor_contacts.role_label);

  RETURN jsonb_build_object('member_id', _member, 'person_id', _person, 'company_id', _company, 'company', _cname,
                            'sponsor_id', l.sponsor_id, 'event_id', l.event_id, 'event_sponsor_id', l.id, 'existing', _exists);
END;
$$;

/*
 * Known contacts of the sponsor's company, by name, email, phone or
 * designation, from this sponsor record and from other records of the same
 * company that the caller already manages. Another organisation's contacts
 * are not included.
 */
CREATE OR REPLACE FUNCTION public.organizer_search_company_contacts(_event_sponsor uuid, _q text DEFAULT NULL, _limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  l    event_sponsors%ROWTYPE;
  _co  uuid;
  _t   text := lower(btrim(COALESCE(_q, '')));
  _ph  text := regexp_replace(COALESCE(_q, ''), '[^0-9]', '', 'g');
BEGIN
  SELECT * INTO l FROM event_sponsors WHERE id = _event_sponsor;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sponsorship not found' USING ERRCODE = 'P0002'; END IF;
  IF public._sponsorship_access(l.event_id) IS NULL THEN
    RAISE EXCEPTION 'You don''t have access to this event''s sponsors' USING ERRCODE = '42501';
  END IF;
  SELECT public._canonical_company(company_id) INTO _co FROM sponsors WHERE id = l.sponsor_id;
  RETURN COALESCE((
    SELECT jsonb_agg(x.row ORDER BY x.name) FROM (
      SELECT DISTINCT ON (lower(m.email))
             lower(COALESCE(m.display_name, m.email)) AS name,
             jsonb_build_object('member_id', m.id, 'person_id', m.person_id, 'name', m.display_name, 'email', m.email,
               'designation', m.designation, 'phone', NULLIF(btrim(COALESCE(m.mobile_country_code, '') || ' ' || COALESCE(m.mobile_number, '')), ''),
               'assigned', EXISTS (SELECT 1 FROM event_sponsor_contacts a JOIN sponsor_members t ON t.id = a.member_id
                                    WHERE a.event_sponsor_id = l.id AND lower(t.email) = lower(m.email))) AS row
        FROM sponsor_members m JOIN sponsors s ON s.id = m.sponsor_id
       WHERE (m.sponsor_id = l.sponsor_id
              OR (_co IS NOT NULL AND public._canonical_company(s.company_id) = _co
                  AND (s.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public._organises_sponsor_event(s.id, auth.uid()))))
         AND (_t = '' OR lower(COALESCE(m.display_name, '')) LIKE '%' || _t || '%' OR lower(m.email) LIKE '%' || _t || '%'
              OR lower(COALESCE(m.designation, '')) LIKE '%' || _t || '%'
              OR (length(_ph) >= 4 AND regexp_replace(COALESCE(m.mobile_number, ''), '[^0-9]', '', 'g') LIKE '%' || _ph || '%'))
       ORDER BY lower(m.email), (m.sponsor_id = l.sponsor_id) DESC, m.created_at
       LIMIT LEAST(GREATEST(COALESCE(_limit, 20), 1), 50)) x), '[]'::jsonb);
END;
$$;

/*
 * Puts a known contact on this sponsorship. Someone on another record of the
 * same company joins this sponsor's team too, as the same person; they get
 * access to this sponsor only by accepting their own invitation.
 */
CREATE OR REPLACE FUNCTION public.organizer_assign_sponsor_contact(_event_sponsor uuid, _member uuid, _role_label text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  l    event_sponsors%ROWTYPE;
  m    sponsor_members%ROWTYPE;
  ms   sponsors%ROWTYPE;
  _co  uuid;
  _id  uuid;
  _new boolean := false;
BEGIN
  SELECT * INTO l FROM event_sponsors WHERE id = _event_sponsor;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sponsorship not found' USING ERRCODE = 'P0002'; END IF;
  IF public._sponsorship_access(l.event_id) IS NULL THEN
    RAISE EXCEPTION 'You don''t have access to this event''s sponsors' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO m FROM sponsor_members WHERE id = _member;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contact not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO ms FROM sponsors WHERE id = m.sponsor_id;
  _co := public._sponsor_company(l.sponsor_id);
  IF m.sponsor_id <> l.sponsor_id AND NOT (
       public._canonical_company(ms.company_id) = _co
       AND (ms.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public._organises_sponsor_event(ms.id, auth.uid()))) THEN
    RAISE EXCEPTION 'That contact isn''t one of this company''s contacts you can use' USING ERRCODE = '42501';
  END IF;

  IF m.sponsor_id = l.sponsor_id THEN
    _id := m.id;
  ELSE
    SELECT id INTO _id FROM sponsor_members WHERE sponsor_id = l.sponsor_id AND lower(email) = lower(m.email) LIMIT 1;
    IF _id IS NULL THEN
      _new := true;
      INSERT INTO sponsor_members (sponsor_id, email, display_name, title, first_name, last_name, designation, company,
                                   mobile_country_code, mobile_number, linkedin_url)
      VALUES (l.sponsor_id, lower(m.email), m.display_name, m.title, m.first_name, m.last_name, m.designation,
              (SELECT name FROM companies WHERE id = _co), m.mobile_country_code, m.mobile_number, m.linkedin_url)
      RETURNING id INTO _id;
    END IF;
  END IF;
  PERFORM public._link_member_to_company(_id, _co);
  INSERT INTO event_sponsor_contacts (event_sponsor_id, member_id, role_label, created_by)
  VALUES (l.id, _id, NULLIF(btrim(COALESCE(_role_label, '')), ''), auth.uid())
  ON CONFLICT (event_sponsor_id, member_id) DO UPDATE SET role_label = COALESCE(EXCLUDED.role_label, event_sponsor_contacts.role_label);
  RETURN jsonb_build_object('member_id', _id, 'new_member', _new, 'sponsor_id', l.sponsor_id, 'event_id', l.event_id);
END;
$$;

-- A contact's role on this event, or takes them off it (_remove). They stay on the sponsor's team.
CREATE OR REPLACE FUNCTION public.organizer_set_sponsor_contact(_event_sponsor uuid, _member uuid, _role_label text DEFAULT NULL, _responsibilities text DEFAULT NULL, _remove boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l event_sponsors%ROWTYPE;
BEGIN
  SELECT * INTO l FROM event_sponsors WHERE id = _event_sponsor;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sponsorship not found' USING ERRCODE = 'P0002'; END IF;
  IF public._sponsorship_access(l.event_id) IS NULL THEN
    RAISE EXCEPTION 'You don''t have access to this event''s sponsors' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM sponsor_members WHERE id = _member AND sponsor_id = l.sponsor_id) THEN
    RAISE EXCEPTION 'That person isn''t on this sponsor''s team' USING ERRCODE = '22023';
  END IF;
  IF _remove THEN
    DELETE FROM event_sponsor_contacts WHERE event_sponsor_id = l.id AND member_id = _member;
  ELSE
    INSERT INTO event_sponsor_contacts (event_sponsor_id, member_id, role_label, responsibilities, created_by)
    VALUES (l.id, _member, NULLIF(btrim(COALESCE(_role_label, '')), ''), NULLIF(btrim(COALESCE(_responsibilities, '')), ''), auth.uid())
    ON CONFLICT (event_sponsor_id, member_id) DO UPDATE SET role_label = EXCLUDED.role_label, responsibilities = EXCLUDED.responsibilities;
  END IF;
END;
$$;


-- ── 5. Super Admin: sponsor records ──────────────────────────────────────────

/*
 * What merging sponsor records would do, before it happens: their events and
 * titles, team sizes, and any event where they can't be combined.
 */
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
    'same_owner', (SELECT count(DISTINCT user_id) = 1 FROM sponsors WHERE id = ANY (_all)),
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
 * Merges an organiser's sponsor records for one company, in one transaction.
 * Events, teams, meetings and creatives move to the surviving record. Every
 * event keeps its own title and logo. Two records on one event are combined
 * only if they hold the same title; different titles are separate agreements,
 * so the merge is refused and nothing changes. Records of different organisers
 * are never merged. Can be rolled back.
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
  IF EXISTS (SELECT 1 FROM sponsors WHERE id = ANY (_others) AND user_id IS DISTINCT FROM _surv.user_id) THEN
    RAISE EXCEPTION 'These records belong to different organisers, who each edit their own. Connect them to one company instead.' USING ERRCODE = '42501';
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

-- Rollback of a sponsor merge. Called from intel_revert_merge.
CREATE OR REPLACE FUNCTION public._intel_revert_sponsor_merge(_merge uuid, _reason text, _uid uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m    merge_operations%ROWTYPE;
  x    jsonb;
  _tbl text;
BEGIN
  SELECT * INTO m FROM merge_operations WHERE id = _merge;
  UPDATE sponsors SET merged_into = NULL WHERE id = ANY (m.merged_ids) AND merged_into = m.survivor_id;
  UPDATE sponsors SET email = m.survivor_before ->> 'email', logo_url = m.survivor_before ->> 'logo_url', description = m.survivor_before ->> 'description'
   WHERE id = m.survivor_id;

  -- Removed rows return first (parents before what refers to them), then moved rows go back.
  FOR x IN SELECT e FROM jsonb_array_elements(m.removed) e
            ORDER BY CASE e ->> 'table' WHEN 'event_sponsors' THEN 1 WHEN 'sponsor_members' THEN 1 ELSE 2 END LOOP
    EXECUTE format('INSERT INTO public.%I SELECT * FROM jsonb_populate_record(NULL::public.%I, $1) ON CONFLICT DO NOTHING',
                   x ->> 'table', x ->> 'table') USING x -> 'row';
  END LOOP;
  FOR x IN SELECT * FROM jsonb_array_elements(m.moved) LOOP
    _tbl := x ->> 'table';
    IF _tbl = 'member_access' THEN
      UPDATE sponsor_members SET user_id = (x ->> 'user_id')::uuid, accepted_at = (x ->> 'accepted_at')::timestamptz WHERE id = (x ->> 'id')::uuid;
    ELSIF _tbl = 'contact_member' THEN
      UPDATE event_sponsor_contacts SET member_id = (x ->> 'from')::uuid WHERE id = (x ->> 'id')::uuid;
    ELSIF _tbl = 'contact_link' THEN
      UPDATE event_sponsor_contacts SET event_sponsor_id = (x ->> 'from')::uuid WHERE id = (x ->> 'id')::uuid;
    ELSIF _tbl = 'details_link' THEN
      UPDATE event_sponsorship_details SET event_sponsor_id = (x ->> 'from')::uuid WHERE event_sponsor_id = (x ->> 'id')::uuid;
    ELSIF _tbl = 'event_sponsors' THEN
      UPDATE event_sponsors SET sponsor_id = (x ->> 'from')::uuid, logo_url = x ->> 'logo_url' WHERE id = (x ->> 'id')::uuid;
    ELSE
      EXECUTE format('UPDATE public.%I SET sponsor_id = $1 WHERE id = $2', _tbl) USING (x ->> 'from')::uuid, (x ->> 'id')::uuid;
    END IF;
  END LOOP;

  UPDATE merge_operations SET reverted_at = now(), reverted_by = _uid WHERE id = m.id;
  INSERT INTO audit_logs (actor_id, action, target_type, target_id, details)
  VALUES (_uid, 'intel.merge_reverted', 'sponsor', m.survivor_id::text,
          jsonb_build_object('merge_id', m.id, 'restored', m.merged_ids, 'reason', _reason));
END;
$$;

/*
 * After a company merge: merges each organiser's records for that company.
 * Records that can't be combined (different titles on one event) are reported,
 * not forced. Each merge rolls back on its own.
 */
CREATE OR REPLACE FUNCTION public.intel_consolidate_company_sponsors(_company uuid, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g        record;
  _merged  integer := 0;
  _skipped jsonb := '[]'::jsonb;
BEGIN
  PERFORM public._require_super_admin();
  FOR g IN
    SELECT s.user_id, (ARRAY_AGG(s.id ORDER BY (SELECT count(*) FROM event_sponsors es WHERE es.sponsor_id = s.id) DESC, s.created_at, s.id)) AS ids
      FROM sponsors s WHERE s.company_id = _company AND s.merged_into IS NULL
     GROUP BY s.user_id HAVING count(*) > 1
  LOOP
    BEGIN
      PERFORM public.intel_merge_sponsors(g.ids[1], g.ids[2:], COALESCE(_reason, 'Company merged'));
      _merged := _merged + array_length(g.ids, 1) - 1;
    EXCEPTION WHEN unique_violation OR insufficient_privilege THEN
      _skipped := _skipped || jsonb_build_object('ids', g.ids, 'reason', SQLERRM);
    END;
  END LOOP;
  RETURN jsonb_build_object('merged', _merged, 'skipped', _skipped);
END;
$$;

/*
 * Moves one event's sponsorship to the right company, when it was linked to the
 * wrong one. Its title, details, meetings and assigned contacts go with it; the
 * organiser's record for that company is used, or created. Other events are not
 * touched. Moving it back undoes it.
 */
CREATE OR REPLACE FUNCTION public.intel_move_sponsorship(_event_sponsor uuid, _company uuid, _reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid    uuid := public._require_super_admin();
  l       event_sponsors%ROWTYPE;
  s       sponsors%ROWTYPE;
  c       companies%ROWTYPE;
  _target uuid;
  r       record;
  _mid    uuid;
BEGIN
  SELECT * INTO l FROM event_sponsors WHERE id = _event_sponsor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sponsorship not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO s FROM sponsors WHERE id = l.sponsor_id;
  SELECT * INTO c FROM companies WHERE id = _company AND merged_into IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown company' USING ERRCODE = '22023'; END IF;
  IF s.company_id = _company THEN RAISE EXCEPTION 'This sponsorship is already with that company' USING ERRCODE = '22023'; END IF;

  SELECT id INTO _target FROM sponsors WHERE user_id = s.user_id AND company_id = _company AND merged_into IS NULL ORDER BY created_at LIMIT 1;
  IF _target IS NULL THEN
    INSERT INTO sponsors (user_id, name, website, tier, tier_label, company_id)
    VALUES (s.user_id, c.name, c.website, COALESCE(l.tier, s.tier, 'bronze'), l.tier_label, _company)
    RETURNING id INTO _target;
  END IF;
  IF EXISTS (SELECT 1 FROM event_sponsors WHERE event_id = l.event_id AND sponsor_id = _target) THEN
    RAISE EXCEPTION 'That company already has a sponsorship on this event; review the two together' USING ERRCODE = '23505';
  END IF;

  UPDATE event_sponsors SET sponsor_id = _target, logo_url = COALESCE(logo_url, s.logo_url) WHERE id = l.id;
  UPDATE sponsor_meeting_interests SET sponsor_id = _target WHERE event_id = l.event_id AND sponsor_id = s.id;
  UPDATE event_creatives SET sponsor_id = _target WHERE event_id = l.event_id AND sponsor_id = s.id;
  -- Assigned contacts follow, with the access they have.
  FOR r IN SELECT a.id AS assignment, m.* FROM event_sponsor_contacts a JOIN sponsor_members m ON m.id = a.member_id WHERE a.event_sponsor_id = l.id LOOP
    SELECT id INTO _mid FROM sponsor_members WHERE sponsor_id = _target AND lower(email) = lower(r.email) LIMIT 1;
    IF _mid IS NULL THEN
      INSERT INTO sponsor_members (sponsor_id, user_id, email, display_name, role, accepted_at, title, first_name, last_name, company, designation,
                                   mobile_country_code, mobile_number, linkedin_url)
      VALUES (_target, r.user_id, lower(r.email), r.display_name, r.role, r.accepted_at, r.title, r.first_name, r.last_name, c.name, r.designation,
              r.mobile_country_code, r.mobile_number, r.linkedin_url)
      RETURNING id INTO _mid;
    END IF;
    UPDATE event_sponsor_contacts SET member_id = _mid WHERE id = r.assignment;
  END LOOP;

  INSERT INTO audit_logs (actor_id, action, target_type, target_id, details)
  VALUES (_uid, 'intel.sponsorship_moved', 'event_sponsor', l.id::text,
          jsonb_build_object('event_id', l.event_id, 'from_sponsor', s.id, 'to_sponsor', _target, 'from_company', s.company_id, 'to_company', _company, 'reason', _reason));
  RETURN _target;
END;
$$;

/*
 * Sponsor data for a person to decide on. Worked out fresh each time and changes
 * nothing: a suggestion disappears once the data is put right. _kind narrows it to
 * one kind; counts always covers all of them.
 */
CREATE OR REPLACE FUNCTION public.intel_sponsor_review(_kind text DEFAULT NULL, _limit integer DEFAULT 25, _offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._require_super_admin();
  RETURN (
    WITH live AS (SELECT s.*, public._canonical_company(s.company_id) AS co FROM sponsors s WHERE s.merged_into IS NULL),
    mem AS (SELECT m.*, l.co, l.name AS sponsor_name, COALESCE(m.display_name, m.email) AS label FROM sponsor_members m JOIN live l ON l.id = m.sponsor_id),
    items AS (
      -- Records of one organiser for one company.
      SELECT 'duplicate_sponsor_records' AS kind, c.name AS title,
             count(*) || ' records from ' || COALESCE((SELECT u.email FROM auth.users u WHERE u.id = l.user_id), 'one organiser') AS detail,
             c.id AS company_id, ARRAY_AGG(l.id ORDER BY l.created_at) AS sponsor_ids, '{}'::uuid[] AS person_ids
        FROM live l JOIN companies c ON c.id = l.co GROUP BY c.id, c.name, l.user_id HAVING count(*) > 1
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


-- Part 2's versions, restored in case the Intelligence Centre script was run again after it.

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
      'sponsors',      (SELECT count(*) FROM sponsors WHERE company_id = ANY (_all) AND merged_into IS NULL),
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

  IF m.entity_type = 'sponsor' THEN
    PERFORM public._intel_revert_sponsor_merge(m.id, _reason, _uid);
    RETURN;
  END IF;
  -- Sponsor records combined after this company merge come apart first.
  IF m.entity_type = 'company' AND EXISTS (
       SELECT 1 FROM merge_operations o JOIN sponsors s ON s.id = o.survivor_id
        WHERE o.entity_type = 'sponsor' AND o.reverted_at IS NULL AND o.created_at > m.created_at AND s.company_id = m.survivor_id) THEN
    RAISE EXCEPTION 'Sponsor records were merged after this; roll those back first' USING ERRCODE = '40001';
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
          'same_owner', ARRAY(SELECT o.id FROM sponsors o WHERE p.company_id IS NOT NULL AND o.company_id = p.company_id AND o.user_id IS NOT DISTINCT FROM p.user_id AND o.id <> p.id AND o.merged_into IS NULL),
          'events', (SELECT count(*) FROM event_sponsors es WHERE es.sponsor_id = p.id),
          'sponsorships', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', es.id, 'event', e.title, 'date', e.date, 'tier', es.tier, 'tier_label', es.tier_label) ORDER BY e.date DESC NULLS LAST)
                             FROM event_sponsors es JOIN events e ON e.id = es.event_id WHERE es.sponsor_id = p.id), '[]'::jsonb),
          'team', (SELECT count(*) FROM sponsor_members sm WHERE sm.sponsor_id = p.id),
          'created_by', (SELECT u.email FROM auth.users u WHERE u.id = p.user_id))
          ORDER BY CASE WHEN _filter = 'repeats' THEN p.company_sort END, lower(p.name), p.id) FROM page p), '[]'::jsonb))
  );
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
                  'owner', (SELECT u.email FROM auth.users u WHERE u.id = s.user_id),
                  'events', (SELECT count(*) FROM event_sponsors es WHERE es.sponsor_id = s.id)))
                  FROM sponsors s WHERE s.company_id = _id AND s.merged_into IS NULL), '[]'),
    'event_sponsorships', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', es.id, 'event_id', e.id, 'event', e.title, 'date', e.date,
                  'tier', es.tier, 'tier_label', es.tier_label, 'sponsor_id', s.id, 'sponsor', s.name,
                  'owner', (SELECT u.email FROM auth.users u WHERE u.id = s.user_id),
                  'package', d.package, 'status', COALESCE(d.status, 'confirmed'), 'commercial_value', d.commercial_value, 'currency', d.currency,
                  'contacts', COALESCE((SELECT jsonb_agg(COALESCE(m.display_name, m.email)) FROM event_sponsor_contacts a JOIN sponsor_members m ON m.id = a.member_id WHERE a.event_sponsor_id = es.id), '[]'::jsonb))
                  ORDER BY e.date DESC NULLS LAST)
                  FROM sponsors s JOIN event_sponsors es ON es.sponsor_id = s.id JOIN events e ON e.id = es.event_id
                  LEFT JOIN event_sponsorship_details d ON d.event_sponsor_id = es.id
                 WHERE s.company_id = _id), '[]'),
    'sponsor_team', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', m.id, 'person_id', m.person_id, 'name', COALESCE(m.display_name, m.email), 'email', m.email,
                  'designation', m.designation, 'sponsor', s.name, 'accepted_at', m.accepted_at,
                  'events', (SELECT count(*) FROM event_sponsor_contacts a WHERE a.member_id = m.id)) ORDER BY lower(COALESCE(m.display_name, m.email)))
                  FROM sponsor_members m JOIN sponsors s ON s.id = m.sponsor_id WHERE s.company_id = _id AND s.merged_into IS NULL), '[]'),
    'merged_from', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name)) FROM companies m WHERE m.merged_into = _id), '[]'),
    'history', COALESCE((SELECT jsonb_agg(to_jsonb(h) ORDER BY h.created_at DESC) FROM (
                  SELECT * FROM intel_field_history WHERE entity_type = 'company' AND entity_id = _id ORDER BY created_at DESC LIMIT 100) h), '[]'),
    'suggestions', COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM correction_suggestions s
                  WHERE s.entity_type = 'company' AND s.entity_id = _id AND s.status = 'open'), '[]')
  );
END;
$$;
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
                                                  WHEN 'sponsor' THEN (SELECT name FROM sponsors WHERE id = m.survivor_id)
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
    'sponsors_unconnected', (SELECT count(*) FROM sponsors WHERE company_id IS NULL AND merged_into IS NULL),
    'sponsors_repeats', (SELECT count(*) FROM sponsors s WHERE s.company_id IS NOT NULL AND s.merged_into IS NULL
                          AND EXISTS (SELECT 1 FROM sponsors o WHERE o.company_id = s.company_id AND o.id <> s.id AND o.merged_into IS NULL)),
    -- A connected company counts once, however many organisers have a record of it.
    'sponsor_identities', (SELECT count(DISTINCT company_id) + count(*) FILTER (WHERE company_id IS NULL) FROM sponsors WHERE merged_into IS NULL),
    'event_sponsorships', (SELECT count(*) FROM event_sponsors),
    'merge_recommendations',
      (SELECT count(*) FROM identity_match_candidates m JOIN people a ON a.id = m.person_a JOIN people b ON b.id = m.person_b
        WHERE m.status = 'open' AND a.merged_into IS NULL AND b.merged_into IS NULL AND m.score >= 80)
    + (SELECT count(*) FROM company_match_candidates m JOIN companies a ON a.id = m.company_a JOIN companies b ON b.id = m.company_b
        WHERE m.status = 'open' AND a.merged_into IS NULL AND b.merged_into IS NULL AND m.score >= 80)
    + (SELECT count(*) FROM (SELECT 1 FROM sponsors WHERE company_id IS NOT NULL AND merged_into IS NULL GROUP BY company_id, user_id HAVING count(*) > 1) g)
  );
END;
$$;


-- ── 6. Who may call what ─────────────────────────────────────────────────────

DO $$
DECLARE f text;
BEGIN
  -- Internal helpers: never callable by clients.
  FOREACH f IN ARRAY ARRAY['_canonical_company(uuid)', '_sponsorship_title(text, text)', '_sponsorship_access(uuid)',
                           '_sponsor_company(uuid)', '_link_member_to_company(uuid, uuid)', '_intel_revert_sponsor_merge(uuid, text, uuid)',
                           'event_sponsors_default_title()', 'event_sponsors_no_repeat()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
  -- Signed-in callers only; each function checks the caller's access itself.
  FOREACH f IN ARRAY ARRAY[
    'organizer_event_sponsorships(uuid)', 'organizer_sponsorship_detail(uuid)', 'organizer_update_sponsorship(uuid, jsonb)',
    'organizer_add_sponsor_contact(uuid, text, text, text, text, text, text, text, text, text)',
    'organizer_search_company_contacts(uuid, text, integer)', 'organizer_assign_sponsor_contact(uuid, uuid, text)',
    'organizer_set_sponsor_contact(uuid, uuid, text, text, boolean)',
    'intel_sponsor_merge_preview(uuid, uuid[])', 'intel_merge_sponsors(uuid, uuid[], text)', 'intel_consolidate_company_sponsors(uuid, text)',
    'intel_move_sponsorship(uuid, uuid, text)', 'intel_sponsor_review(text, integer, integer)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;
