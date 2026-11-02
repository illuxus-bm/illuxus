-- ═══════════════════════════════════════════════════════════════════════════════
-- Sponsor shares: every speaker, no sponsors, no ticket type.
--
--   • Speakers on the event's speaker list are shared even if they never
--     registered, from their speaker details. A speaker who registered appears
--     once, from their registration.
--   • A sponsor's own contact email is treated as a sponsor's, like its team.
--   • The raw ticket type ("general", "sponsor") is no longer shared; Type says
--     Speaker or Attendee.
--
-- Shares already made keep what they contained; sharing again makes a new version.
--
-- Run RUN_ME_sponsor_data_sharing_people.sql (071) first.
-- Safe to run more than once. Paste into the SQL Editor and Run.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Addresses that belong to a sponsor of the event: its contact email and its team.
CREATE OR REPLACE FUNCTION public._event_sponsor_emails(_event uuid)
RETURNS SETOF text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT lower(btrim(m.email)) FROM event_sponsors es JOIN sponsor_members m ON m.sponsor_id = es.sponsor_id
   WHERE es.event_id = _event AND NULLIF(btrim(m.email), '') IS NOT NULL
  UNION
  SELECT lower(btrim(s.email)) FROM event_sponsors es JOIN sponsors s ON s.id = es.sponsor_id
   WHERE es.event_id = _event AND NULLIF(btrim(s.email), '') IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public._sponsor_share_eligible(_event uuid)
RETURNS SETOF public.registrations LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.* FROM registrations r
   WHERE r.event_id = _event AND r.approval_status = 'approved' AND r.status <> 'cancelled'
     AND COALESCE(r.ticket_type, '') <> 'sponsor'
     AND lower(btrim(r.email)) NOT IN (SELECT public._event_sponsor_emails(_event));
$$;

CREATE OR REPLACE FUNCTION public._sponsor_share_fields()
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT '[
    {"key":"full_name","label":"Full name","contact":false},
    {"key":"participant_type","label":"Type","contact":false},
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
    {"key":"registered_at","label":"Registration date","contact":false},
    {"key":"attendance","label":"Attendance","contact":false},
    {"key":"checked_in_at","label":"Checked in at","contact":false},
    {"key":"minutes_attended","label":"Minutes attended","contact":false}
  ]'::jsonb;
$$;

CREATE OR REPLACE FUNCTION public._sponsor_share_row(r public.registrations, _ended boolean)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'participant_type', CASE WHEN public._registration_is_speaker(r) THEN 'Speaker' ELSE 'Attendee' END,
    'full_name', COALESCE(NULLIF(btrim(COALESCE(r.first_name, '') || ' ' || COALESCE(r.last_name, '')), ''), r.name),
    'title', NULLIF(NULLIF(btrim(r.title), ''), 'Prefer not to say'),
    'first_name', NULLIF(btrim(r.first_name), ''),
    'last_name', NULLIF(btrim(r.last_name), ''),
    'designation', NULLIF(btrim(r.designation), ''),
    'company', NULLIF(btrim(r.company), ''),
    'email', NULLIF(btrim(r.email), ''),
    'mobile', CASE WHEN NULLIF(btrim(r.mobile_number), '') IS NOT NULL THEN btrim(COALESCE(r.mobile_country_code, '') || ' ' || r.mobile_number) END,
    'mobile_country_code', CASE WHEN NULLIF(btrim(r.mobile_number), '') IS NOT NULL THEN NULLIF(btrim(r.mobile_country_code), '') END,
    'mobile_number', NULLIF(btrim(r.mobile_number), ''),
    'linkedin_url', NULLIF(btrim(r.linkedin_url), ''),
    'company_website', NULLIF(btrim(r.company_website), ''),
    'company_employee_count', NULLIF(btrim(r.company_employee_count), ''),
    'industry', NULLIF(btrim(r.industry), ''),
    'registered_at', r.created_at,
    'attendance', CASE WHEN r.checked_in OR r.attendance_state <> 'never' THEN 'Attended'
                       WHEN _ended THEN 'Did not attend' ELSE 'Not yet' END,
    'checked_in_at', r.checked_in_at,
    'minutes_attended', NULLIF(r.total_minutes, 0)
  ));
$$;

/*
 * Everyone a share holds: speakers and attendees from registrations, then the
 * event's listed speakers who never registered, from their speaker details.
 */
CREATE OR REPLACE FUNCTION public._sponsor_share_people(_event uuid, _ended boolean)
RETURNS TABLE (person_id uuid, data jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, public._sponsor_share_row(r, _ended) FROM public._sponsor_share_eligible(_event) r
  UNION ALL
  SELECT sp.id, jsonb_strip_nulls(jsonb_build_object(
    'participant_type', 'Speaker',
    'full_name', COALESCE(NULLIF(btrim(COALESCE(sp.first_name, '') || ' ' || COALESCE(sp.last_name, '')), ''), sp.name),
    'title', NULLIF(NULLIF(btrim(sp.title), ''), 'Prefer not to say'),
    'first_name', NULLIF(btrim(sp.first_name), ''),
    'last_name', NULLIF(btrim(sp.last_name), ''),
    'designation', NULLIF(btrim(sp.designation), ''),
    'company', NULLIF(btrim(sp.company), ''),
    'email', NULLIF(btrim(sp.email), ''),
    'mobile', CASE WHEN NULLIF(btrim(sp.mobile_number), '') IS NOT NULL THEN btrim(COALESCE(sp.mobile_country_code, '') || ' ' || sp.mobile_number) END,
    'mobile_country_code', CASE WHEN NULLIF(btrim(sp.mobile_number), '') IS NOT NULL THEN NULLIF(btrim(sp.mobile_country_code), '') END,
    'mobile_number', NULLIF(btrim(sp.mobile_number), ''),
    'linkedin_url', NULLIF(btrim(sp.linkedin_url), ''),
    'company_website', NULLIF(btrim(sp.company_website), ''),
    'company_employee_count', NULLIF(btrim(sp.company_employee_count), ''),
    'industry', NULLIF(btrim(sp.industry), ''),
    'attendance', CASE WHEN _ended THEN 'Did not attend' ELSE 'Not yet' END))
    FROM event_speakers es JOIN speakers sp ON sp.id = es.speaker_id
   WHERE es.event_id = _event
     AND NOT EXISTS (SELECT 1 FROM public._sponsor_share_eligible(_event) r
                      WHERE NULLIF(btrim(sp.email), '') IS NOT NULL AND lower(r.email) = lower(btrim(sp.email)))
     AND COALESCE(lower(btrim(sp.email)), '') NOT IN (SELECT public._event_sponsor_emails(_event));
$$;

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
    WITH c AS (SELECT p.data ? 'email' AS em, p.data ? 'mobile' AS mo, p.data ->> 'participant_type' = 'Speaker' AS sp
                 FROM public._sponsor_share_people(l.event_id, public._event_has_ended(l.event_id)) p)
    SELECT jsonb_build_object(
      'event', jsonb_build_object('id', e.id, 'title', e.title, 'date', e.date, 'end_date', e.end_date, 'ended', public._event_has_ended(e.id)),
      'sponsor', (SELECT jsonb_build_object('id', s.id, 'name', COALESCE(co.name, s.name), 'title', l.tier, 'title_label', l.tier_label)
                    FROM sponsors s LEFT JOIN companies co ON co.id = public._canonical_company(s.company_id) WHERE s.id = l.sponsor_id),
      'eligible', (SELECT count(*) FROM c),
      'speakers', (SELECT count(*) FROM c WHERE sp),
      'attendees', (SELECT count(*) FROM c WHERE NOT sp),
      'with_email', (SELECT count(*) FROM c WHERE em),
      'with_mobile', (SELECT count(*) FROM c WHERE mo),
      'with_both', (SELECT count(*) FROM c WHERE em AND mo),
      'without_contact', (SELECT count(*) FROM c WHERE NOT em AND NOT mo),
      'fields', public._sponsor_share_fields(),
      'not_collected', '["Department","Country","City","Location","Custom questions"]'::jsonb,
      'current', (SELECT to_jsonb(x) - 'fields' FROM sponsor_data_shares x WHERE x.event_sponsor_id = l.id ORDER BY x.version DESC LIMIT 1)
    )
  );
END;
$$;

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

  CREATE TEMP TABLE IF NOT EXISTS _share_people (person_id uuid, data jsonb) ON COMMIT DROP;
  -- Supabase refuses a DELETE without a WHERE clause, so it says which rows: all of them.
  DELETE FROM _share_people WHERE true;
  INSERT INTO _share_people SELECT * FROM public._sponsor_share_people(l.event_id, _ended);

  INSERT INTO sponsor_data_shares (id, event_sponsor_id, event_id, sponsor_id, company_id, version, allow_export, includes_without_permission,
                                   fields, record_count, with_email, with_mobile, with_both, without_contact, without_permission,
                                   shared_before_end, shared_by)
  SELECT _id, l.id, l.event_id, l.sponsor_id, (SELECT public._canonical_company(company_id) FROM sponsors WHERE id = l.sponsor_id), _ver,
         COALESCE(_allow_export, true), true, public._sponsor_share_fields(),
         count(*), count(*) FILTER (WHERE p.data ? 'email'), count(*) FILTER (WHERE p.data ? 'mobile'),
         count(*) FILTER (WHERE p.data ? 'email' AND p.data ? 'mobile'), count(*) FILTER (WHERE NOT p.data ? 'email' AND NOT p.data ? 'mobile'),
         0, NOT _ended, _uid
    FROM _share_people p;
  INSERT INTO sponsor_data_share_rows (share_id, registration_id, data) SELECT _id, p.person_id, p.data FROM _share_people p;

  SELECT title INTO _title FROM events WHERE id = l.event_id;
  SELECT name INTO _name FROM sponsors WHERE id = l.sponsor_id;
  INSERT INTO app_notifications (user_id, type, title, body, link)
  SELECT DISTINCT m.user_id, 'sponsor_data_shared', 'Event data shared with you',
         COALESCE(_title, 'An event') || ': the participant list is ready to view.', '/sponsor/events/' || l.event_id || '#shared-data'
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

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['_event_sponsor_emails(uuid)', '_sponsor_share_people(uuid, boolean)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
END $$;
