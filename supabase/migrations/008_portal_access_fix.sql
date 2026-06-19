-- ============================================================================
-- Hotfix — Sponsor / Speaker portal access for application-approved users
-- ----------------------------------------------------------------------------
-- The original RPCs (in `002_functions.sql`) only recognised users who became
-- speakers/sponsors via the team-invite flow:
--
--   - Sponsor: must have a `sponsor_members` row with `accepted_at IS NOT NULL`
--   - Speaker: matched by `speakers.email = auth.users.email`
--
-- That misses two real-world cases:
--
--   1. APPLICATIONS — When an organiser approves a sponsor application,
--      `useApplications.ts` inserts a row into `sponsors` with
--      `user_id = applicant_user_id` and links via `event_sponsors`. NO row is
--      created in `sponsor_members` (that table is for team-mate invites only),
--      so `has_sponsor` returned `false` and the dropdown hid "Sponsor dashboard".
--
--   2. SPEAKER EMAIL DRIFT — Speakers added by the organiser may have an email
--      that doesn't match the user's auth email (e.g. business vs personal,
--      or after the user changes email). Email-only matching makes them invisible
--      to the speaker portal even when the user_id is set on `speakers`.
--
-- This migration replaces the four affected RPCs to recognise both paths.
-- Pure SQL replace; no schema changes; safe to re-run.
-- ============================================================================

-- ── 1. user_role_assignments — covers BOTH paths for has_sponsor + has_speaker
CREATE OR REPLACE FUNCTION public.user_role_assignments()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'has_speaker', EXISTS(
      -- match by user_id first (most reliable), fall back to email
      SELECT 1 FROM speakers sp
      JOIN event_speakers es ON es.speaker_id = sp.id
      WHERE sp.user_id = auth.uid()
         OR lower(sp.email) = lower((SELECT email FROM auth.users WHERE id = auth.uid()))
    ),
    'has_sponsor', EXISTS(
      -- team-invite path: a `sponsor_members` row that's been accepted
      SELECT 1 FROM sponsor_members sm
      WHERE sm.user_id = auth.uid() AND sm.accepted_at IS NOT NULL
    ) OR EXISTS(
      -- application-approval path: the user IS the sponsor (sponsors.user_id),
      -- and that sponsor is attached to at least one event via event_sponsors
      SELECT 1 FROM sponsors s
      JOIN event_sponsors es ON es.sponsor_id = s.id
      WHERE s.user_id = auth.uid()
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_role_assignments() TO authenticated;

-- ── 2. sponsor_portal_events — list events where the user is a sponsor via either path
CREATE OR REPLACE FUNCTION public.sponsor_portal_events()
RETURNS TABLE(
  event_id uuid, event_title text, event_date timestamptz, end_date timestamptz, location text,
  sponsor_id uuid, sponsor_name text, tier text,
  registrations_count bigint, checked_in_count bigint
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  -- Combine both paths via UNION on the underlying sponsor IDs the user owns.
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
    s.id, s.name, COALESCE(es.tier_override, s.tier),
    (SELECT count(*) FROM registrations r WHERE r.event_id = e.id AND r.approval_status = 'approved'),
    (SELECT count(*) FROM registrations r WHERE r.event_id = e.id AND r.checked_in = true)
  FROM user_sponsors us
  JOIN sponsors s         ON s.id = us.sponsor_id
  JOIN event_sponsors es  ON es.sponsor_id = s.id
  JOIN events e           ON e.id = es.event_id
  ORDER BY e.date DESC;
$$;

GRANT EXECUTE ON FUNCTION public.sponsor_portal_events() TO authenticated;

-- ── 3. sponsor_portal_people — gate on either path
CREATE OR REPLACE FUNCTION public.sponsor_portal_people(_eid uuid)
RETURNS TABLE(
  kind text, id uuid, name text, company text, ticket_type text,
  checked_in boolean, checked_in_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH allowed AS (
    -- Either path can grant access to the event's people list:
    SELECT 1
      FROM sponsor_members sm
      JOIN event_sponsors es ON es.sponsor_id = sm.sponsor_id
     WHERE sm.user_id = auth.uid()
       AND sm.accepted_at IS NOT NULL
       AND es.event_id = _eid
    UNION ALL
    SELECT 1
      FROM sponsors s
      JOIN event_sponsors es ON es.sponsor_id = s.id
     WHERE s.user_id = auth.uid()
       AND es.event_id = _eid
    LIMIT 1
  )
  SELECT 'speaker', sp.id, sp.name, sp.company, 'speaker',
         COALESCE(r.checked_in, false), r.checked_in_at
    FROM event_speakers esp
    JOIN speakers sp ON sp.id = esp.speaker_id
    LEFT JOIN registrations r ON r.event_id = _eid
                              AND r.ticket_type = 'speaker'
                              AND lower(r.email) = lower(COALESCE(sp.email, ''))
   WHERE esp.event_id = _eid
     AND EXISTS(SELECT 1 FROM allowed)
  UNION ALL
  SELECT 'attendee', r.id, r.name, r.company, r.ticket_type, r.checked_in, r.checked_in_at
    FROM registrations r
   WHERE r.event_id = _eid
     AND r.approval_status = 'approved'
     AND r.ticket_type <> 'speaker'
     AND EXISTS(SELECT 1 FROM allowed);
$$;

GRANT EXECUTE ON FUNCTION public.sponsor_portal_people(uuid) TO authenticated;

-- ── 4. speaker_portal_events — match by user_id OR email
CREATE OR REPLACE FUNCTION public.speaker_portal_events()
RETURNS TABLE(
  event_id uuid, event_slug text, event_title text, event_description text,
  event_date timestamptz, end_date timestamptz, location text, venue text, image_url text, status text,
  organizer_name text,
  speaker_id uuid, speaker_name text, speaker_photo_url text, speaker_company text,
  session_count bigint
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT
    e.id, e.slug, e.title, e.description, e.date, e.end_date, e.location, e.venue, e.image_url, e.status,
    o.name,
    sp.id, sp.name, sp.photo_url, sp.company,
    (SELECT count(*) FROM sessions s WHERE s.event_id = e.id AND s.speaker_id = sp.id)
  FROM speakers sp
  JOIN event_speakers es ON es.speaker_id = sp.id
  JOIN events e         ON e.id = es.event_id
  LEFT JOIN organizations o ON o.id = e.org_id
  WHERE sp.user_id = auth.uid()
     OR lower(sp.email) = lower((SELECT email FROM auth.users WHERE id = auth.uid()))
  ORDER BY e.date DESC;
$$;

GRANT EXECUTE ON FUNCTION public.speaker_portal_events() TO authenticated;

-- ── 5. speaker_portal_event_details — gate / filter both paths
CREATE OR REPLACE FUNCTION public.speaker_portal_event_details(_eid uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _email text;
  _result jsonb;
BEGIN
  SELECT email INTO _email FROM auth.users WHERE id = auth.uid();

  -- Verify the user is a speaker for this event by user_id OR email match.
  IF NOT EXISTS (
    SELECT 1 FROM speakers sp
    JOIN event_speakers es ON es.speaker_id = sp.id
    WHERE es.event_id = _eid
      AND (sp.user_id = auth.uid() OR lower(sp.email) = lower(COALESCE(_email, '')))
  ) THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'event', (SELECT to_jsonb(e) FROM (
      SELECT e.id, e.slug, e.title, e.description, e.date, e.end_date, e.location, e.venue,
             e.image_url, e.banner_landscape_url, e.status, e.timezone, e.event_format,
             o.name as organizer_name, o.slug as organizer_slug, o.logo_url as organizer_logo
      FROM events e LEFT JOIN organizations o ON o.id = e.org_id WHERE e.id = _eid
    ) e),
    'speaker', (SELECT to_jsonb(s) FROM (
      SELECT sp.id, sp.name, sp.email, sp.bio, sp.photo_url, sp.company, sp.designation,
             sp.linkedin_url, sp.company_website, sp.title, sp.first_name, sp.last_name
      FROM speakers sp
      JOIN event_speakers es ON es.speaker_id = sp.id
      WHERE es.event_id = _eid
        AND (sp.user_id = auth.uid() OR lower(sp.email) = lower(COALESCE(_email, '')))
      LIMIT 1
    ) s),
    'sessions', COALESCE((SELECT jsonb_agg(to_jsonb(ss) ORDER BY ss.start_time) FROM (
      SELECT s.id, s.title, s.description, s.session_type, s.start_time, s.end_time, s.location
      FROM sessions s
      WHERE s.event_id = _eid
        AND s.speaker_id IN (
          SELECT sp.id FROM speakers sp
          WHERE sp.user_id = auth.uid()
             OR lower(sp.email) = lower(COALESCE(_email, ''))
        )
    ) ss), '[]'::jsonb),
    'analytics', (SELECT jsonb_build_object(
      'total_registrations', (SELECT count(*) FROM registrations r
                                WHERE r.event_id = _eid AND r.approval_status = 'approved'),
      'checked_in_count',    (SELECT count(*) FROM registrations r
                                WHERE r.event_id = _eid AND r.checked_in = true)
    ))
  ) INTO _result;

  RETURN _result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.speaker_portal_event_details(uuid) TO authenticated;
