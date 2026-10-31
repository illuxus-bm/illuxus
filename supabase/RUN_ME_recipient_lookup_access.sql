-- ═══════════════════════════════════════════════════════════════════════════════
-- Recipient lookups were readable without signing in.
--
-- communications_resolve_recipients() and
-- communications_resolve_community_recipients() return the name, email and
-- phone of everyone an event or community message would reach. They are
-- SECURITY DEFINER and only checked the caller when one was signed in, so a
-- caller with no user skipped the check. Nothing revoked Postgres' default
-- EXECUTE for PUBLIC (or Supabase's for anon), so the public anon key alone
-- could list any event's attendees, speakers and sponsor contacts.
--
-- Now:
--   • anon and PUBLIC can no longer execute either function;
--   • inside, a caller with no signed-in user is refused unless it is the
--     service role or an internal job (the scheduled-send pg_cron worker,
--     which makes no API request). Signed-in callers get the same checks
--     as before.
--
-- Same signatures as before, so CREATE OR REPLACE is enough.
-- Safe to run more than once. Paste into the Supabase SQL Editor and Run.
-- ═══════════════════════════════════════════════════════════════════════════════

-- True for the service role, or for code running outside any API request
-- (pg_cron, the SQL Editor). Every PostgREST request carries JWT claims —
-- including the anon key's — so an anonymous API caller is never internal.
CREATE OR REPLACE FUNCTION public._is_internal_caller()
RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT COALESCE(auth.role(), '') = 'service_role'
      OR (NULLIF(current_setting('request.jwt.claims', true), '') IS NULL
          AND NULLIF(current_setting('request.jwt.claim.role', true), '') IS NULL);
$$;
REVOKE ALL ON FUNCTION public._is_internal_caller() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._is_internal_caller() TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.communications_resolve_recipients(
  _event_id uuid,
  _filter   jsonb
) RETURNS TABLE (
  user_id uuid,
  name    text,
  email   text,
  phone   text
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  _types     text[];
  _user_ids  uuid[];
  _emails    text[];
BEGIN
  _types := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(_filter -> 'types', '[]'::jsonb))),
    ARRAY[]::text[]
  );
  _user_ids := COALESCE(
    ARRAY(SELECT (jsonb_array_elements_text(COALESCE(_filter -> 'user_ids', '[]'::jsonb)))::uuid),
    ARRAY[]::uuid[]
  );
  _emails := COALESCE(
    ARRAY(SELECT lower(jsonb_array_elements_text(COALESCE(_filter -> 'emails', '[]'::jsonb)))),
    ARRAY[]::text[]
  );

  -- No signed-in user: only the service role or an internal job (pg_cron,
  -- not an API request) may continue. The public anon key is neither.
  IF auth.uid() IS NULL AND NOT public._is_internal_caller() THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501';
  END IF;

  IF auth.uid() IS NOT NULL AND _event_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
        FROM events e
        JOIN org_members om ON om.org_id = e.org_id
       WHERE e.id = _event_id AND om.user_id = auth.uid()
    ) AND NOT has_role(auth.uid(), 'admin'::app_role) THEN
      RAISE EXCEPTION 'Not authorised to read recipients for this event';
    END IF;
  END IF;

  RETURN QUERY
  WITH base AS (
    -- Orphan-user-id guard from migration 017 retained.
    SELECT CASE
             WHEN r.user_id IS NULL THEN NULL
             WHEN EXISTS (SELECT 1 FROM auth.users u WHERE u.id = r.user_id)
               THEN r.user_id
             ELSE NULL
           END AS user_id,
           COALESCE(NULLIF(trim(coalesce(r.first_name,'') || ' ' || coalesce(r.last_name,'')), ''),
                    r.name, split_part(r.email,'@',1)) AS name,
           lower(r.email) AS email,
           NULLIF(trim(coalesce(r.mobile_country_code,'') || ' ' || coalesce(r.mobile_number,'')), '') AS phone,
           COALESCE(r.attendance_state, 'never') AS attendance_state,
           COALESCE(r.amount_paid, 0)::numeric AS amount_paid
      FROM registrations r
     WHERE r.event_id = _event_id
       AND r.status <> 'cancelled'
       AND COALESCE(r.approval_status, 'approved') NOT IN ('declined','waitlisted')
  ),
  speakers_set AS (
    SELECT CASE
             WHEN s.user_id IS NULL THEN NULL
             WHEN EXISTS (SELECT 1 FROM auth.users u WHERE u.id = s.user_id)
               THEN s.user_id
             ELSE NULL
           END AS user_id,
           COALESCE(NULLIF(trim(coalesce(s.name,'')), ''), split_part(s.email,'@',1)) AS name,
           lower(s.email) AS email,
           NULL::text AS phone
      FROM event_speakers es
      JOIN speakers s ON s.id = es.speaker_id
     WHERE es.event_id = _event_id AND s.email IS NOT NULL
  ),
  sponsors_set AS (
    SELECT NULL::uuid AS user_id,
           COALESCE(NULLIF(trim(coalesce(s.name,'')), ''),
                    split_part(s.email,'@',1)) AS name,
           lower(s.email) AS email,
           NULL::text AS phone
      FROM event_sponsors es
      JOIN sponsors s ON s.id = es.sponsor_id
     WHERE es.event_id = _event_id AND s.email IS NOT NULL
  ),
  sponsor_contacts_set AS (
    -- The people listed under a sponsor (sponsor_members). The compose
    -- picker offers each of them, so a custom selection has to reach them,
    -- not only the sponsor's own email.
    SELECT CASE
             WHEN m.user_id IS NULL THEN NULL
             WHEN EXISTS (SELECT 1 FROM auth.users u WHERE u.id = m.user_id)
               THEN m.user_id
             ELSE NULL
           END AS user_id,
           COALESCE(NULLIF(trim(coalesce(m.display_name,'')), ''),
                    NULLIF(trim(coalesce(m.first_name,'') || ' ' || coalesce(m.last_name,'')), ''),
                    split_part(m.email,'@',1)) AS name,
           lower(m.email) AS email,
           NULLIF(trim(coalesce(m.mobile_country_code,'') || ' ' || coalesce(m.mobile_number,'')), '') AS phone
      FROM event_sponsors es
      JOIN sponsor_members m ON m.sponsor_id = es.sponsor_id
     WHERE es.event_id = _event_id AND m.email IS NOT NULL
  ),
  filtered_attendees AS (
    SELECT b.user_id, b.name, b.email, b.phone
      FROM base b
     WHERE
       (
         'all_attendees' = ANY(_types)
       )
       OR (
         'checked_in' = ANY(_types) AND b.attendance_state IN ('inside','outside')
       )
       OR (
         'paid' = ANY(_types) AND b.amount_paid > 0
       )
  ),
  custom_set AS (
    -- New: match by user_id OR email. Imported participants without an
    -- auth account (user_id NULL) still match via their email — which is
    -- always present because the form/import validation requires it.
    SELECT b.user_id, b.name, b.email, b.phone
      FROM base b
     WHERE 'custom' = ANY(_types)
       AND (
            (b.user_id IS NOT NULL AND b.user_id = ANY(_user_ids))
         OR (lower(b.email) = ANY(_emails))
       )
    UNION
    -- Speakers and sponsors in custom selection follow the same rule, so
    -- the organiser can pick a single speaker without bringing the whole
    -- speaker group along.
    SELECT s.user_id, s.name, s.email, s.phone
      FROM speakers_set s
     WHERE 'custom' = ANY(_types)
       AND (
            (s.user_id IS NOT NULL AND s.user_id = ANY(_user_ids))
         OR (lower(s.email) = ANY(_emails))
       )
    UNION
    SELECT sp.user_id, sp.name, sp.email, sp.phone
      FROM sponsors_set sp
     WHERE 'custom' = ANY(_types)
       AND lower(sp.email) = ANY(_emails)
    UNION
    SELECT sc.user_id, sc.name, sc.email, sc.phone
      FROM sponsor_contacts_set sc
     WHERE 'custom' = ANY(_types)
       AND (
            (sc.user_id IS NOT NULL AND sc.user_id = ANY(_user_ids))
         OR (sc.email = ANY(_emails))
       )
  ),
  all_recipients AS (
    SELECT user_id, name, email, phone FROM filtered_attendees
    UNION
    SELECT user_id, name, email, phone FROM custom_set
    UNION ALL
    SELECT user_id, name, email, phone FROM speakers_set
     WHERE 'speakers' = ANY(_types)
    UNION ALL
    SELECT user_id, name, email, phone FROM sponsors_set
     WHERE 'sponsors' = ANY(_types)
  )
  SELECT DISTINCT ON (lower(coalesce(ar.email,'')))
         ar.user_id, ar.name, ar.email, ar.phone
    FROM all_recipients ar
   WHERE ar.email IS NOT NULL AND ar.email <> ''
   ORDER BY lower(coalesce(ar.email,'')), ar.user_id NULLS LAST;
END;
$$;

CREATE OR REPLACE FUNCTION public.communications_resolve_community_recipients(
  _community_id uuid,
  _filter       jsonb
) RETURNS TABLE (
  user_id uuid,
  name    text,
  email   text,
  phone   text
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  _types     text[];
  _user_ids  uuid[];
BEGIN
  _types := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(_filter -> 'types', '[]'::jsonb))),
    ARRAY[]::text[]
  );
  _user_ids := COALESCE(
    ARRAY(SELECT (jsonb_array_elements_text(COALESCE(_filter -> 'user_ids', '[]'::jsonb)))::uuid),
    ARRAY[]::uuid[]
  );

  -- No signed-in user: only the service role or an internal job (pg_cron,
  -- not an API request) may continue. The public anon key is neither.
  IF auth.uid() IS NULL AND NOT public._is_internal_caller() THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT can_moderate_community(auth.uid(), _community_id) THEN
    RAISE EXCEPTION 'Not authorised to read community members';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT cm.user_id,
           cm.role,
           COALESCE(
             NULLIF(trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), ''),
             p.display_name,
             p.username,
             split_part(u.email,'@',1)
           ) AS name,
           lower(u.email) AS email,
           NULLIF(trim(coalesce(p.mobile_country_code,'') || ' ' || coalesce(p.mobile_number,'')), '') AS phone
      FROM community_members cm
      JOIN auth.users u ON u.id = cm.user_id
      LEFT JOIN profiles p ON p.user_id = cm.user_id
     WHERE cm.community_id = _community_id
       AND cm.status = 'active'
  ),
  filtered AS (
    SELECT b.user_id, b.name, b.email, b.phone, b.role
      FROM base b
     WHERE
       'all_members' = ANY(_types)
       OR ('managers'   = ANY(_types) AND b.role = 'manager'::community_role)
       OR ('moderators' = ANY(_types) AND b.role = 'moderator'::community_role)
       OR ('organizers' = ANY(_types) AND b.role = 'organizer'::community_role)
       OR ('mentors'    = ANY(_types) AND b.role = 'mentor'::community_role)
       OR ('speakers'   = ANY(_types) AND b.role = 'speaker'::community_role)
       OR ('sponsors'   = ANY(_types) AND b.role = 'sponsor'::community_role)
       OR ('custom'     = ANY(_types) AND b.user_id = ANY(_user_ids))
  )
  SELECT DISTINCT ON (lower(coalesce(f.email,'')))
         f.user_id, f.name, f.email, f.phone
    FROM filtered f
   WHERE f.email IS NOT NULL AND f.email <> ''
   ORDER BY lower(coalesce(f.email,'')), f.user_id NULLS LAST;
END;
$$;

-- Signed-in users (the compose dialog's live count) and the service role only.
REVOKE ALL ON FUNCTION public.communications_resolve_recipients(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.communications_resolve_community_recipients(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.communications_resolve_recipients(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.communications_resolve_community_recipients(uuid, jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.communications_resolve_recipients(uuid, jsonb) IS
  'Resolves event communication recipients. Custom selection matches by user_id OR email so imported participants without an auth account still receive the message, and reaches sponsor contacts (sponsor_members) as well as the sponsor''s own email. Auth / password state is never used as a filter — everyone with an addressable email on the registration row is eligible. Not executable by anon; a caller with no signed-in user must be the service role or an internal job.';
