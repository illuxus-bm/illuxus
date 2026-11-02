-- ═══════════════════════════════════════════════════════════════════════════════
-- Shared participant data fills a registered speaker's blanks from their
-- speaker profile on the event.
--
-- A speaker who registered was shared with only what the registration held,
-- so a speaker added with just a name and email showed no designation, mobile
-- or LinkedIn even though their speaker profile had them. Each field now comes
-- from the registration and, where that is empty, from the speaker profile.
--
-- Shares already made are snapshots: share again ("Share updated data") to
-- send the filled-in details.
--
-- Safe to run more than once. Paste into the SQL Editor and Run.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._sponsor_share_row(r public.registrations, _ended boolean)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH s AS (
    -- The registrant's speaker profile on this event, if they're on the line-up.
    SELECT sp.* FROM event_speakers es JOIN speakers sp ON sp.id = es.speaker_id
     WHERE es.event_id = r.event_id AND lower(NULLIF(btrim(sp.email), '')) = lower(btrim(r.email))
     ORDER BY sp.updated_at DESC LIMIT 1
  ), v AS (
    SELECT
      COALESCE(NULLIF(btrim(r.title), ''), NULLIF(btrim(s.title), '')) AS title,
      COALESCE(NULLIF(btrim(r.first_name), ''), NULLIF(btrim(s.first_name), '')) AS first_name,
      COALESCE(NULLIF(btrim(r.last_name), ''), NULLIF(btrim(s.last_name), '')) AS last_name,
      COALESCE(NULLIF(btrim(r.designation), ''), NULLIF(btrim(s.designation), '')) AS designation,
      COALESCE(NULLIF(btrim(r.company), ''), NULLIF(btrim(s.company), '')) AS company,
      -- The country code travels with its number, so the pair comes from one place.
      CASE WHEN NULLIF(btrim(r.mobile_number), '') IS NOT NULL THEN NULLIF(btrim(r.mobile_country_code), '') ELSE NULLIF(btrim(s.mobile_country_code), '') END AS mobile_country_code,
      COALESCE(NULLIF(btrim(r.mobile_number), ''), NULLIF(btrim(s.mobile_number), '')) AS mobile_number,
      COALESCE(NULLIF(btrim(r.linkedin_url), ''), NULLIF(btrim(s.linkedin_url), '')) AS linkedin_url,
      COALESCE(NULLIF(btrim(r.company_website), ''), NULLIF(btrim(s.company_website), '')) AS company_website,
      COALESCE(NULLIF(btrim(r.company_employee_count), ''), NULLIF(btrim(s.company_employee_count), '')) AS company_employee_count,
      COALESCE(NULLIF(btrim(r.industry), ''), NULLIF(btrim(s.industry), '')) AS industry
    FROM (SELECT 1) one LEFT JOIN s ON true
  )
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'participant_type', CASE WHEN public._registration_is_speaker(r) THEN 'Speaker' ELSE 'Attendee' END,
    'full_name', COALESCE(NULLIF(btrim(COALESCE(r.first_name, '') || ' ' || COALESCE(r.last_name, '')), ''), r.name),
    'title', NULLIF(v.title, 'Prefer not to say'),
    'first_name', v.first_name,
    'last_name', v.last_name,
    'designation', v.designation,
    'company', v.company,
    'email', NULLIF(btrim(r.email), ''),
    'mobile', CASE WHEN v.mobile_number IS NOT NULL THEN btrim(COALESCE(v.mobile_country_code, '') || ' ' || v.mobile_number) END,
    'mobile_country_code', CASE WHEN v.mobile_number IS NOT NULL THEN v.mobile_country_code END,
    'mobile_number', v.mobile_number,
    'linkedin_url', v.linkedin_url,
    'company_website', v.company_website,
    'company_employee_count', v.company_employee_count,
    'industry', v.industry,
    'registered_at', r.created_at,
    'attendance', CASE WHEN r.checked_in OR r.attendance_state <> 'never' THEN 'Attended'
                       WHEN _ended THEN 'Did not attend' ELSE 'Not yet' END,
    'checked_in_at', r.checked_in_at,
    'minutes_attended', NULLIF(r.total_minutes, 0)
  )) FROM v;
$$;

REVOKE ALL ON FUNCTION public._sponsor_share_row(public.registrations, boolean) FROM PUBLIC, anon, authenticated;
