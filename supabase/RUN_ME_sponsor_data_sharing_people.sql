-- ═══════════════════════════════════════════════════════════════════════════════
-- Sponsor shares: speakers and attendees only, marked as which.
--
--   • People from sponsors are left out: anyone registered with a sponsor
--     ticket, or on the team of any sponsor of the event.
--   • Each participant is marked Speaker or Attendee. A speaker is someone with
--     a speaker ticket or listed as one of the event's speakers.
--   • The shared list can be filtered by attendance and by speaker or attendee.
--
-- Shares already made keep what they contained; sharing again makes a new version.
--
-- Run RUN_ME_sponsor_data_sharing_contacts.sql (070) first.
-- Safe to run more than once. Paste into the SQL Editor and Run.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Speakers and attendees of an event: approved, not cancelled, and not anyone from a sponsor.
CREATE OR REPLACE FUNCTION public._sponsor_share_eligible(_event uuid)
RETURNS SETOF public.registrations LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.* FROM registrations r
   WHERE r.event_id = _event AND r.approval_status = 'approved' AND r.status <> 'cancelled'
     AND COALESCE(r.ticket_type, '') <> 'sponsor'
     AND NOT EXISTS (SELECT 1 FROM event_sponsors es JOIN sponsor_members m ON m.sponsor_id = es.sponsor_id
                      WHERE es.event_id = _event AND lower(m.email) = lower(r.email));
$$;

-- Whether a registration is one of the event's speakers.
CREATE OR REPLACE FUNCTION public._registration_is_speaker(r public.registrations)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.ticket_type = 'speaker' OR EXISTS (
    SELECT 1 FROM event_speakers es JOIN speakers sp ON sp.id = es.speaker_id
     WHERE es.event_id = r.event_id AND lower(NULLIF(btrim(sp.email), '')) = lower(r.email));
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
    {"key":"ticket_type","label":"Ticket type","contact":false},
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
    WITH c AS (SELECT NULLIF(btrim(r.email), '') IS NOT NULL AS em, NULLIF(btrim(r.mobile_number), '') IS NOT NULL AS mo,
                      public._registration_is_speaker(r) AS sp
                 FROM public._sponsor_share_eligible(l.event_id) r)
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
DROP FUNCTION IF EXISTS public.shared_dataset_rows(uuid, text, text, text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.shared_dataset_rows(_share uuid, _q text DEFAULT NULL, _filter text DEFAULT 'all',
                                                      _sort text DEFAULT 'full_name', _dir text DEFAULT 'asc',
                                                      _limit integer DEFAULT 25, _offset integer DEFAULT 0, _type text DEFAULT 'all')
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
         AND CASE _type
               WHEN 'speaker' THEN d.data ->> 'participant_type' = 'Speaker'
               WHEN 'attendee' THEN COALESCE(d.data ->> 'participant_type', 'Attendee') = 'Attendee'
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

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['_registration_is_speaker(public.registrations)', '_sponsor_share_row(public.registrations, boolean)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
  EXECUTE 'REVOKE ALL ON FUNCTION public.shared_dataset_rows(uuid, text, text, text, text, integer, integer, text) FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.shared_dataset_rows(uuid, text, text, text, text, integer, integer, text) TO authenticated';
END $$;
