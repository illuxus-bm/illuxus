-- ═══════════════════════════════════════════════════════════════════════════════
-- Sponsors receive participants' contact details.
--
-- The Privacy Policy and both registration forms now tell participants that
-- their registration details are shared with the event's sponsors. So a share
-- now carries email, mobile and LinkedIn for every participant, and the choice
-- to leave out people without separate permission is gone.
--
-- Shares already made keep exactly what they contained; sharing again makes a
-- new version with the contact details.
--
-- Run RUN_ME_sponsor_data_sharing.sql (069) first.
-- Safe to run more than once. Paste into the SQL Editor and Run.
-- ═══════════════════════════════════════════════════════════════════════════════

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
    {"key":"minutes_attended","label":"Minutes attended","contact":false}
  ]'::jsonb;
$$;

-- One participant as shared, with their contact details.
CREATE OR REPLACE FUNCTION public._sponsor_share_row(r public.registrations, _ended boolean)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'full_name', COALESCE(NULLIF(btrim(COALESCE(r.first_name, '') || ' ' || COALESCE(r.last_name, '')), ''), r.name),
    'title', NULLIF(btrim(r.title), ''),
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
    'ticket_type', r.ticket_type,
    'registered_at', r.created_at,
    'attendance', CASE WHEN r.checked_in OR r.attendance_state <> 'never' THEN 'Attended'
                       WHEN _ended THEN 'Did not attend' ELSE 'Not yet' END,
    'checked_in_at', r.checked_in_at,
    'minutes_attended', NULLIF(r.total_minutes, 0)
  ));
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
    WITH c AS (SELECT NULLIF(btrim(r.email), '') IS NOT NULL AS em, NULLIF(btrim(r.mobile_number), '') IS NOT NULL AS mo
                 FROM public._sponsor_share_eligible(l.event_id) r)
    SELECT jsonb_build_object(
      'event', jsonb_build_object('id', e.id, 'title', e.title, 'date', e.date, 'end_date', e.end_date, 'ended', public._event_has_ended(e.id)),
      'sponsor', (SELECT jsonb_build_object('id', s.id, 'name', COALESCE(co.name, s.name), 'title', l.tier, 'title_label', l.tier_label)
                    FROM sponsors s LEFT JOIN companies co ON co.id = public._canonical_company(s.company_id) WHERE s.id = l.sponsor_id),
      'eligible', (SELECT count(*) FROM c),
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

/*
 * Publishes the participant list to this sponsorship's sponsor, as a new
 * version. Needs an explicit choice to share before the event ends. Notifies
 * the sponsor's team members on this event. The last argument is no longer used.
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
         COALESCE(_allow_export, true), true, public._sponsor_share_fields(),
         count(*),
         count(*) FILTER (WHERE NULLIF(btrim(r.email), '') IS NOT NULL),
         count(*) FILTER (WHERE NULLIF(btrim(r.mobile_number), '') IS NOT NULL),
         count(*) FILTER (WHERE NULLIF(btrim(r.email), '') IS NOT NULL AND NULLIF(btrim(r.mobile_number), '') IS NOT NULL),
         count(*) FILTER (WHERE NULLIF(btrim(r.email), '') IS NULL AND NULLIF(btrim(r.mobile_number), '') IS NULL),
         0, NOT _ended, _uid
    FROM public._sponsor_share_eligible(l.event_id) r;

  INSERT INTO sponsor_data_share_rows (share_id, registration_id, data)
  SELECT _id, r.id, public._sponsor_share_row(r, _ended) FROM public._sponsor_share_eligible(l.event_id) r;

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

-- Separate sponsor permission is no longer asked for; what was recorded stays as it is.
DROP TRIGGER IF EXISTS registrations_sponsor_consent ON public.registrations;
