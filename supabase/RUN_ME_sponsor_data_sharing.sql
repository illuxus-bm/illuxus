-- ═══════════════════════════════════════════════════════════════════════════════
-- Sharing an event's participant data with a sponsor.
--
-- Why sponsors never received emails or mobile numbers: nobody agreed to it.
-- Both registration forms ask participants to agree to their details "being
-- shared with the event organiser", and the Privacy Policy names organisers,
-- not sponsors. So the sponsor portal deliberately leaves contact details out.
--
--   • An event can ask registrants for permission to share their contact
--     details with its sponsors: an optional, unticked box on the registration
--     form. What a participant ticked is recorded on their registration, with
--     the time. Only the participant can give it; an organiser cannot tick it
--     for them, by editing or by import.
--   • Share Data, per event sponsorship, publishes a copy of the participant
--     list to that sponsor. Email, mobile and LinkedIn are included only for
--     participants who gave permission. Everyone else appears with what the
--     sponsor portal already shows (name, company, designation, attendance),
--     or not at all if the organiser chooses.
--   • Each share is a frozen version: what was shared, when, by whom, and how
--     many records. Sharing again makes a new version. Access can be revoked.
--   • Only accepted team members working on that event's sponsorship see it.
--     Every view and export is logged.
--
-- Registrations themselves are never changed by sharing.
--
-- Run RUN_ME_sponsor_identity.sql (066) first.
-- Safe to run more than once. Paste into the SQL Editor and Run.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ── 1. Permission from participants ──────────────────────────────────────────

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS ask_sponsor_consent boolean NOT NULL DEFAULT false;

ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS sponsor_share_consent    boolean NOT NULL DEFAULT false;
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS sponsor_share_consent_at timestamptz;

/*
 * Permission to share with sponsors is the participant's own. It is kept only
 * when the event asked for it and the participant gave it: through their own
 * registration (signed in as themselves) or the guest form (the server). An
 * organiser adding, importing or editing a registration cannot set it.
 * Withdrawing it is always allowed.
 */
CREATE OR REPLACE FUNCTION public.registrations_sponsor_consent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _asked boolean;
BEGIN
  IF NEW.sponsor_share_consent IS NOT TRUE THEN
    NEW.sponsor_share_consent := false;
    NEW.sponsor_share_consent_at := NULL;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.sponsor_share_consent THEN
    NEW.sponsor_share_consent_at := OLD.sponsor_share_consent_at;
    RETURN NEW;
  END IF;
  SELECT ask_sponsor_consent INTO _asked FROM events WHERE id = NEW.event_id;
  IF NOT COALESCE(_asked, false) OR (auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM NEW.user_id) THEN
    NEW.sponsor_share_consent := false;
    NEW.sponsor_share_consent_at := NULL;
  ELSE
    NEW.sponsor_share_consent_at := now();
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS registrations_sponsor_consent ON public.registrations;
CREATE TRIGGER registrations_sponsor_consent BEFORE INSERT OR UPDATE OF sponsor_share_consent ON public.registrations
  FOR EACH ROW EXECUTE FUNCTION public.registrations_sponsor_consent();


-- ── 2. Shares ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sponsor_data_shares (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_sponsor_id   uuid REFERENCES public.event_sponsors(id) ON DELETE SET NULL,
  event_id           uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  sponsor_id         uuid NOT NULL REFERENCES public.sponsors(id) ON DELETE CASCADE,
  company_id         uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  version            integer NOT NULL,
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded','revoked')),
  allow_export       boolean NOT NULL DEFAULT true,
  includes_without_permission boolean NOT NULL DEFAULT true,
  -- The fields shared, with labels, and which of them needed permission.
  fields             jsonb NOT NULL,
  record_count       integer NOT NULL,
  with_email         integer NOT NULL,
  with_mobile        integer NOT NULL,
  with_both          integer NOT NULL,
  without_contact    integer NOT NULL,
  without_permission integer NOT NULL,
  shared_before_end  boolean NOT NULL DEFAULT false,
  shared_by          uuid,
  shared_at          timestamptz NOT NULL DEFAULT now(),
  revoked_by         uuid,
  revoked_at         timestamptz,
  revoke_reason      text,
  UNIQUE (event_id, sponsor_id, version)
);
CREATE INDEX IF NOT EXISTS sponsor_data_shares_link_idx ON public.sponsor_data_shares (event_sponsor_id, version DESC);
CREATE INDEX IF NOT EXISTS sponsor_data_shares_sponsor_idx ON public.sponsor_data_shares (sponsor_id) WHERE status = 'active';

-- Exactly what each version contained. Registrations are not touched.
CREATE TABLE IF NOT EXISTS public.sponsor_data_share_rows (
  share_id        uuid NOT NULL REFERENCES public.sponsor_data_shares(id) ON DELETE CASCADE,
  registration_id uuid,
  data            jsonb NOT NULL,
  PRIMARY KEY (share_id, registration_id)
);

CREATE TABLE IF NOT EXISTS public.sponsor_data_access_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id   uuid NOT NULL REFERENCES public.sponsor_data_shares(id) ON DELETE CASCADE,
  user_id    uuid,
  action     text NOT NULL CHECK (action IN ('view','export')),
  detail     jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sponsor_data_access_log_share_idx ON public.sponsor_data_access_log (share_id, created_at DESC);

-- Reached only through the functions below, which check who is asking.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sponsor_data_shares','sponsor_data_share_rows','sponsor_data_access_log'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', t);
  END LOOP;
END $$;


-- ── 3. What is shared ────────────────────────────────────────────────────────

/*
 * The registration fields that can be shared, with their labels, in display
 * order. `contact` fields go only to participants who gave permission. Internal
 * columns (ids, tokens, QR codes, payment and approval details, notes) are
 * never on this list.
 */
CREATE OR REPLACE FUNCTION public._sponsor_share_fields()
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT '[
    {"key":"full_name","label":"Full name","contact":false},
    {"key":"title","label":"Title","contact":false},
    {"key":"first_name","label":"First name","contact":false},
    {"key":"last_name","label":"Last name","contact":false},
    {"key":"designation","label":"Designation","contact":false},
    {"key":"company","label":"Company","contact":false},
    {"key":"email","label":"Email","contact":true},
    {"key":"mobile","label":"Mobile","contact":true},
    {"key":"mobile_country_code","label":"Country code","contact":true},
    {"key":"mobile_number","label":"Mobile number","contact":true},
    {"key":"linkedin_url","label":"LinkedIn","contact":true},
    {"key":"company_website","label":"Company website","contact":false},
    {"key":"company_employee_count","label":"Employee size","contact":false},
    {"key":"industry","label":"Industry","contact":false},
    {"key":"ticket_type","label":"Ticket type","contact":false},
    {"key":"registered_at","label":"Registration date","contact":false},
    {"key":"attendance","label":"Attendance","contact":false},
    {"key":"checked_in_at","label":"Checked in at","contact":false},
    {"key":"minutes_attended","label":"Minutes attended","contact":false},
    {"key":"contact_permission","label":"Contact permission","contact":false}
  ]'::jsonb;
$$;

CREATE OR REPLACE FUNCTION public._event_has_ended(_event uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.status = 'completed' OR COALESCE(e.end_date, e.date) < now() FROM events e WHERE e.id = _event;
$$;

-- One participant as shared: contact details only with their permission.
CREATE OR REPLACE FUNCTION public._sponsor_share_row(r public.registrations, _ended boolean)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'full_name', COALESCE(NULLIF(btrim(COALESCE(r.first_name, '') || ' ' || COALESCE(r.last_name, '')), ''), r.name),
    'title', NULLIF(btrim(r.title), ''),
    'first_name', NULLIF(btrim(r.first_name), ''),
    'last_name', NULLIF(btrim(r.last_name), ''),
    'designation', NULLIF(btrim(r.designation), ''),
    'company', NULLIF(btrim(r.company), ''),
    'email', CASE WHEN r.sponsor_share_consent THEN NULLIF(btrim(r.email), '') END,
    'mobile', CASE WHEN r.sponsor_share_consent AND NULLIF(btrim(r.mobile_number), '') IS NOT NULL
                   THEN btrim(COALESCE(r.mobile_country_code, '') || ' ' || r.mobile_number) END,
    'mobile_country_code', CASE WHEN r.sponsor_share_consent AND NULLIF(btrim(r.mobile_number), '') IS NOT NULL THEN NULLIF(btrim(r.mobile_country_code), '') END,
    'mobile_number', CASE WHEN r.sponsor_share_consent THEN NULLIF(btrim(r.mobile_number), '') END,
    'linkedin_url', CASE WHEN r.sponsor_share_consent THEN NULLIF(btrim(r.linkedin_url), '') END,
    'company_website', NULLIF(btrim(r.company_website), ''),
    'company_employee_count', NULLIF(btrim(r.company_employee_count), ''),
    'industry', NULLIF(btrim(r.industry), ''),
    'ticket_type', r.ticket_type,
    'registered_at', r.created_at,
    'attendance', CASE WHEN r.checked_in OR r.attendance_state <> 'never' THEN 'Attended'
                       WHEN _ended THEN 'Did not attend' ELSE 'Not yet' END,
    'checked_in_at', r.checked_in_at,
    'minutes_attended', NULLIF(r.total_minutes, 0),
    'contact_permission', CASE WHEN r.sponsor_share_consent THEN 'Given' ELSE 'Not given' END
  ));
$$;

/*
 * Participants of an event who can be shared: approved registrations that
 * weren't cancelled. Speakers are included; they registered too.
 */
CREATE OR REPLACE FUNCTION public._sponsor_share_eligible(_event uuid)
RETURNS SETOF public.registrations LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.* FROM registrations r WHERE r.event_id = _event AND r.approval_status = 'approved' AND r.status <> 'cancelled';
$$;


-- ── 4. Organisers: share, reshare, revoke ────────────────────────────────────

-- Sharing participant data is for the event owner and organisation admins.
CREATE OR REPLACE FUNCTION public._require_share_access(_event uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public._sponsorship_access(_event) IS DISTINCT FROM 'commercial' THEN
    RAISE EXCEPTION 'Only the event owner or an organisation admin can share participant data' USING ERRCODE = '42501';
  END IF;
  RETURN auth.uid();
END;
$$;

-- What sharing now would send, before anything is shared.
CREATE OR REPLACE FUNCTION public.organizer_sponsor_share_preview(_event_sponsor uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  l  event_sponsors%ROWTYPE;
  e  events%ROWTYPE;
BEGIN
  SELECT * INTO l FROM event_sponsors WHERE id = _event_sponsor;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sponsorship not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public._require_share_access(l.event_id);
  SELECT * INTO e FROM events WHERE id = l.event_id;
  RETURN (
    WITH r AS (SELECT * FROM public._sponsor_share_eligible(l.event_id)),
    c AS (SELECT r.sponsor_share_consent AS ok, NULLIF(btrim(r.email), '') IS NOT NULL AS em,
                 NULLIF(btrim(r.mobile_number), '') IS NOT NULL AS mo FROM r)
    SELECT jsonb_build_object(
      'event', jsonb_build_object('id', e.id, 'title', e.title, 'date', e.date, 'end_date', e.end_date,
                                  'ended', public._event_has_ended(e.id), 'asks_consent', e.ask_sponsor_consent),
      'sponsor', (SELECT jsonb_build_object('id', s.id, 'name', COALESCE(co.name, s.name), 'title', l.tier, 'title_label', l.tier_label)
                    FROM sponsors s LEFT JOIN companies co ON co.id = public._canonical_company(s.company_id) WHERE s.id = l.sponsor_id),
      'eligible', (SELECT count(*) FROM c),
      'with_permission', (SELECT count(*) FROM c WHERE ok),
      'without_permission', (SELECT count(*) FROM c WHERE NOT ok),
      'with_email', (SELECT count(*) FROM c WHERE ok AND em),
      'with_mobile', (SELECT count(*) FROM c WHERE ok AND mo),
      'with_both', (SELECT count(*) FROM c WHERE ok AND em AND mo),
      'without_contact', (SELECT count(*) FROM c WHERE NOT (ok AND (em OR mo))),
      'fields', public._sponsor_share_fields(),
      'not_collected', '["Department","Country","City","Location","Custom questions"]'::jsonb,
      'current', (SELECT to_jsonb(x) - 'fields' FROM sponsor_data_shares x WHERE x.event_sponsor_id = l.id ORDER BY x.version DESC LIMIT 1)
    ) FROM (SELECT 1) one
  );
END;
$$;

/*
 * Publishes the participant list to this sponsorship's sponsor, as a new
 * version. Needs an explicit choice to share before the event ends. Notifies
 * the sponsor's team members on this event.
 */
CREATE OR REPLACE FUNCTION public.organizer_share_sponsor_data(_event_sponsor uuid, _share_before_end boolean DEFAULT false,
                                                               _allow_export boolean DEFAULT true, _include_without_permission boolean DEFAULT true)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  l       event_sponsors%ROWTYPE;
  _uid    uuid;
  _ended  boolean;
  _id     uuid := gen_random_uuid();
  _ver    integer;
  _title  text;
  _name   text;
BEGIN
  SELECT * INTO l FROM event_sponsors WHERE id = _event_sponsor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sponsorship not found' USING ERRCODE = 'P0002'; END IF;
  _uid := public._require_share_access(l.event_id);
  _ended := public._event_has_ended(l.event_id);
  IF NOT _ended AND NOT COALESCE(_share_before_end, false) THEN
    RAISE EXCEPTION 'This event hasn''t ended. Confirm that you mean to share before it ends.' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(max(version), 0) + 1 INTO _ver FROM sponsor_data_shares WHERE event_id = l.event_id AND sponsor_id = l.sponsor_id;
  UPDATE sponsor_data_shares SET status = 'superseded' WHERE event_sponsor_id = l.id AND status = 'active';

  INSERT INTO sponsor_data_shares (id, event_sponsor_id, event_id, sponsor_id, company_id, version, allow_export, includes_without_permission,
                                   fields, record_count, with_email, with_mobile, with_both, without_contact, without_permission,
                                   shared_before_end, shared_by)
  SELECT _id, l.id, l.event_id, l.sponsor_id, (SELECT public._canonical_company(company_id) FROM sponsors WHERE id = l.sponsor_id), _ver,
         COALESCE(_allow_export, true), COALESCE(_include_without_permission, true), public._sponsor_share_fields(),
         count(*),
         count(*) FILTER (WHERE r.sponsor_share_consent AND NULLIF(btrim(r.email), '') IS NOT NULL),
         count(*) FILTER (WHERE r.sponsor_share_consent AND NULLIF(btrim(r.mobile_number), '') IS NOT NULL),
         count(*) FILTER (WHERE r.sponsor_share_consent AND NULLIF(btrim(r.email), '') IS NOT NULL AND NULLIF(btrim(r.mobile_number), '') IS NOT NULL),
         count(*) FILTER (WHERE NOT (r.sponsor_share_consent AND (NULLIF(btrim(r.email), '') IS NOT NULL OR NULLIF(btrim(r.mobile_number), '') IS NOT NULL))),
         count(*) FILTER (WHERE NOT r.sponsor_share_consent),
         NOT _ended, _uid
    FROM public._sponsor_share_eligible(l.event_id) r
   WHERE COALESCE(_include_without_permission, true) OR r.sponsor_share_consent;

  INSERT INTO sponsor_data_share_rows (share_id, registration_id, data)
  SELECT _id, r.id, public._sponsor_share_row(r, _ended)
    FROM public._sponsor_share_eligible(l.event_id) r
   WHERE COALESCE(_include_without_permission, true) OR r.sponsor_share_consent;

  SELECT title INTO _title FROM events WHERE id = l.event_id;
  SELECT name INTO _name FROM sponsors WHERE id = l.sponsor_id;
  INSERT INTO app_notifications (user_id, type, title, body, link)
  SELECT DISTINCT m.user_id, 'sponsor_data_shared', 'Event data shared with you',
         COALESCE(_title, 'An event') || ': the participant list is ready to view.', '/sponsor/data/' || _id
    FROM sponsor_members m
   WHERE m.sponsor_id = l.sponsor_id AND m.user_id IS NOT NULL AND m.accepted_at IS NOT NULL
     AND (m.role = 'admin' OR EXISTS (SELECT 1 FROM event_sponsor_contacts a WHERE a.event_sponsor_id = l.id AND a.member_id = m.id));

  INSERT INTO audit_logs (actor_id, action, target_type, target_id, details)
  VALUES (_uid, 'sponsor_data.shared', 'event_sponsor', l.id::text,
          jsonb_build_object('share_id', _id, 'version', _ver, 'event_id', l.event_id, 'sponsor', _name, 'before_end', NOT _ended,
                             'records', (SELECT record_count FROM sponsor_data_shares WHERE id = _id)));
  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.organizer_revoke_sponsor_data(_share uuid, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  x    sponsor_data_shares%ROWTYPE;
  _uid uuid;
BEGIN
  SELECT * INTO x FROM sponsor_data_shares WHERE id = _share FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Share not found' USING ERRCODE = 'P0002'; END IF;
  _uid := public._require_share_access(x.event_id);
  IF x.status = 'revoked' THEN RETURN; END IF;
  UPDATE sponsor_data_shares SET status = 'revoked', revoked_by = _uid, revoked_at = now(), revoke_reason = NULLIF(btrim(COALESCE(_reason, '')), '')
   WHERE id = _share;
  INSERT INTO audit_logs (actor_id, action, target_type, target_id, details)
  VALUES (_uid, 'sponsor_data.revoked', 'event_sponsor', x.event_sponsor_id::text,
          jsonb_build_object('share_id', x.id, 'version', x.version, 'event_id', x.event_id, 'reason', _reason));
END;
$$;

-- Each sponsorship on an event with its latest share, for the sponsor tiles.
CREATE OR REPLACE FUNCTION public.organizer_sponsor_share_status(_event uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public._sponsorship_access(_event) IS NULL THEN
    RAISE EXCEPTION 'You don''t have access to this event''s sponsors' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('event_sponsor_id', es.id, 'sponsor_id', es.sponsor_id, 'share',
             (SELECT to_jsonb(x) - 'fields' FROM sponsor_data_shares x WHERE x.event_sponsor_id = es.id ORDER BY x.version DESC LIMIT 1)))
      FROM event_sponsors es WHERE es.event_id = _event), '[]'::jsonb);
END;
$$;

-- Every version shared for a sponsorship, with how often it was opened.
CREATE OR REPLACE FUNCTION public.organizer_sponsor_share_history(_event_sponsor uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE l event_sponsors%ROWTYPE;
BEGIN
  SELECT * INTO l FROM event_sponsors WHERE id = _event_sponsor;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sponsorship not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public._require_share_access(l.event_id);
  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(x) - 'fields' || jsonb_build_object(
             'shared_by_email', (SELECT u.email FROM auth.users u WHERE u.id = x.shared_by),
             'views', (SELECT count(*) FROM sponsor_data_access_log g WHERE g.share_id = x.id AND g.action = 'view'),
             'exports', (SELECT count(*) FROM sponsor_data_access_log g WHERE g.share_id = x.id AND g.action = 'export'),
             'last_opened', (SELECT max(g.created_at) FROM sponsor_data_access_log g WHERE g.share_id = x.id)) ORDER BY x.version DESC)
      FROM sponsor_data_shares x WHERE x.event_sponsor_id = l.id), '[]'::jsonb);
END;
$$;


-- ── 5. Reading a share ───────────────────────────────────────────────────────

/*
 * Who may read a share: 'organiser' (sharing access to its event, any version)
 * or 'sponsor' (an accepted team member of the sponsor, working on this event's
 * sponsorship or an admin of the sponsor's team, while the share is active).
 */
CREATE OR REPLACE FUNCTION public._share_reader(_share uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN public._sponsorship_access(x.event_id) = 'commercial' THEN 'organiser'
    WHEN x.status = 'active' AND EXISTS (
           SELECT 1 FROM event_sponsors es JOIN sponsor_members m ON m.sponsor_id = es.sponsor_id
            WHERE es.id = x.event_sponsor_id AND m.user_id = auth.uid() AND m.accepted_at IS NOT NULL
              AND (m.role = 'admin' OR EXISTS (SELECT 1 FROM event_sponsor_contacts a WHERE a.event_sponsor_id = es.id AND a.member_id = m.id)))
      THEN 'sponsor'
    END
    FROM sponsor_data_shares x WHERE x.id = _share AND auth.uid() IS NOT NULL;
$$;

-- The shares the caller's sponsor teams have received.
CREATE OR REPLACE FUNCTION public.sponsor_shared_datasets()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', x.id, 'version', x.version, 'event_id', e.id, 'event', e.title, 'event_date', e.date,
           'title', es.tier, 'title_label', es.tier_label,
           'sponsor', COALESCE((SELECT c.name FROM companies c WHERE c.id = public._canonical_company(s.company_id)), s.name),
           'record_count', x.record_count, 'with_email', x.with_email, 'with_mobile', x.with_mobile,
           'shared_at', x.shared_at, 'shared_by', (SELECT COALESCE(p.display_name, u.email) FROM auth.users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = x.shared_by),
           'allow_export', x.allow_export, 'status', x.status) ORDER BY x.shared_at DESC), '[]'::jsonb)
    FROM sponsor_data_shares x
    JOIN event_sponsors es ON es.id = x.event_sponsor_id
    JOIN events e ON e.id = x.event_id
    JOIN sponsors s ON s.id = es.sponsor_id
   WHERE x.status = 'active' AND public._share_reader(x.id) = 'sponsor';
$$;

/*
 * One page of a share, searched (name, company, designation, email, mobile),
 * filtered and sorted. The sponsor's first look at each share is logged.
 */
CREATE OR REPLACE FUNCTION public.shared_dataset_rows(_share uuid, _q text DEFAULT NULL, _filter text DEFAULT 'all',
                                                      _sort text DEFAULT 'full_name', _dir text DEFAULT 'asc',
                                                      _limit integer DEFAULT 25, _offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _who  text := public._share_reader(_share);
  _t    text := lower(btrim(COALESCE(_q, '')));
  _ph   text := regexp_replace(COALESCE(_q, ''), '[^0-9]', '', 'g');
  _key  text := CASE WHEN _sort IN (SELECT f ->> 'key' FROM jsonb_array_elements(public._sponsor_share_fields()) f) THEN _sort ELSE 'full_name' END;
BEGIN
  IF _who IS NULL THEN RAISE EXCEPTION 'This shared data isn''t available to you' USING ERRCODE = '42501'; END IF;
  IF _who = 'sponsor' AND COALESCE(_offset, 0) = 0 AND _t = '' THEN
    INSERT INTO sponsor_data_access_log (share_id, user_id, action) VALUES (_share, auth.uid(), 'view');
  END IF;
  RETURN (
    WITH q AS (
      SELECT d.data FROM sponsor_data_share_rows d
       WHERE d.share_id = _share
         AND (_t = '' OR lower(COALESCE(d.data ->> 'full_name', '')) LIKE '%' || _t || '%'
              OR lower(COALESCE(d.data ->> 'company', '')) LIKE '%' || _t || '%'
              OR lower(COALESCE(d.data ->> 'designation', '')) LIKE '%' || _t || '%'
              OR lower(COALESCE(d.data ->> 'email', '')) LIKE '%' || _t || '%'
              OR (length(_ph) >= 4 AND regexp_replace(COALESCE(d.data ->> 'mobile', ''), '[^0-9]', '', 'g') LIKE '%' || _ph || '%'))
         AND CASE _filter
               WHEN 'attended' THEN d.data ->> 'attendance' = 'Attended'
               WHEN 'not_attended' THEN d.data ->> 'attendance' <> 'Attended'
               WHEN 'with_email' THEN d.data ? 'email'
               WHEN 'with_mobile' THEN d.data ? 'mobile'
               WHEN 'with_contact' THEN d.data ? 'email' OR d.data ? 'mobile'
               ELSE true END
    ), page AS (
      SELECT q.data FROM q
       ORDER BY CASE WHEN lower(_dir) = 'desc' THEN NULL ELSE lower(q.data ->> _key) END ASC NULLS LAST,
                CASE WHEN lower(_dir) = 'desc' THEN lower(q.data ->> _key) END DESC NULLS LAST,
                lower(q.data ->> 'full_name')
       LIMIT LEAST(GREATEST(COALESCE(_limit, 25), 1), 500) OFFSET GREATEST(COALESCE(_offset, 0), 0)
    )
    SELECT jsonb_build_object(
      'total', (SELECT count(*) FROM q),
      'fields', (SELECT x.fields FROM sponsor_data_shares x WHERE x.id = _share),
      'reader', _who,
      'rows', COALESCE((SELECT jsonb_agg(p.data) FROM page p), '[]'::jsonb))
  );
END;
$$;

-- The whole share, for a file. Sponsors need the share to allow export; each export is logged.
CREATE OR REPLACE FUNCTION public.shared_dataset_export(_share uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _who text := public._share_reader(_share);
  x    sponsor_data_shares%ROWTYPE;
BEGIN
  IF _who IS NULL THEN RAISE EXCEPTION 'This shared data isn''t available to you' USING ERRCODE = '42501'; END IF;
  SELECT * INTO x FROM sponsor_data_shares WHERE id = _share;
  IF _who = 'sponsor' AND NOT x.allow_export THEN
    RAISE EXCEPTION 'The organiser hasn''t allowed this data to be downloaded' USING ERRCODE = '42501';
  END IF;
  IF _who = 'sponsor' THEN
    INSERT INTO sponsor_data_access_log (share_id, user_id, action, detail) VALUES (_share, auth.uid(), 'export', jsonb_build_object('rows', x.record_count));
  END IF;
  RETURN jsonb_build_object('fields', x.fields, 'rows',
    COALESCE((SELECT jsonb_agg(d.data ORDER BY lower(d.data ->> 'full_name')) FROM sponsor_data_share_rows d WHERE d.share_id = _share), '[]'::jsonb));
END;
$$;

-- A share's header for the sponsor's database page.
CREATE OR REPLACE FUNCTION public.shared_dataset_info(_share uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _who text := public._share_reader(_share);
BEGIN
  IF _who IS NULL THEN RAISE EXCEPTION 'This shared data isn''t available to you' USING ERRCODE = '42501'; END IF;
  RETURN (
    SELECT to_jsonb(x) - 'fields' || jsonb_build_object('reader', _who, 'event', e.title, 'event_date', e.date,
             'title', es.tier, 'title_label', es.tier_label,
             'sponsor', COALESCE((SELECT c.name FROM companies c WHERE c.id = x.company_id), s.name))
      FROM sponsor_data_shares x JOIN events e ON e.id = x.event_id JOIN sponsors s ON s.id = x.sponsor_id
      LEFT JOIN event_sponsors es ON es.id = x.event_sponsor_id
     WHERE x.id = _share);
END;
$$;


-- ── 6. Who may call what ─────────────────────────────────────────────────────

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['registrations_sponsor_consent()', '_sponsor_share_fields()', '_event_has_ended(uuid)',
                           '_sponsor_share_row(public.registrations, boolean)', '_sponsor_share_eligible(uuid)',
                           '_require_share_access(uuid)', '_share_reader(uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
  FOREACH f IN ARRAY ARRAY[
    'organizer_sponsor_share_preview(uuid)', 'organizer_share_sponsor_data(uuid, boolean, boolean, boolean)',
    'organizer_revoke_sponsor_data(uuid, text)', 'organizer_sponsor_share_status(uuid)', 'organizer_sponsor_share_history(uuid)',
    'sponsor_shared_datasets()', 'shared_dataset_rows(uuid, text, text, text, text, integer, integer)',
    'shared_dataset_export(uuid)', 'shared_dataset_info(uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;
