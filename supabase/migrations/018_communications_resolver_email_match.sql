-- ─────────────────────────────────────────────────────────────────────────────
-- 018_communications_resolver_email_match.sql
--
-- Allows the event communication resolver to address imported participants
-- who haven't signed in yet. Previously the resolver's `custom_set` filtered
-- by `user_id = ANY(_user_ids)` — but participants added via bulk import or
-- the Add Participant dialog often have `registrations.user_id = NULL`
-- until the auth signup completes (or forever, if signup fails). The
-- frontend's custom-selection UI then dropped them from the user_ids array
-- entirely, so they never made it into `communication_recipients` and the
-- organiser's "Send to selected" did nothing for those rows.
--
-- The dashboard's "All attendees" path was unaffected (it iterates over
-- every base row regardless of user_id), but custom selection and any
-- email-keyed targeting were broken.
--
-- Fix
-- ───
-- The `_filter` jsonb argument now also reads an `emails` array. For the
-- `custom` recipient type, a base row matches when EITHER:
--
--   • `b.user_id = ANY(_user_ids)` (existing behaviour, kept for users
--     who have signed in), OR
--
--   • `lower(b.email) = ANY(_emails)` (new — works for imported
--     participants regardless of auth state).
--
-- The function is otherwise identical to the version in 017 — same
-- orphan-user-id guard, same authorisation check, same DISTINCT ON dedupe.
-- Re-applying is safe.
-- ─────────────────────────────────────────────────────────────────────────────

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

GRANT EXECUTE ON FUNCTION public.communications_resolve_recipients(uuid, jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.communications_resolve_recipients(uuid, jsonb) IS
  'Resolves event communication recipients. Custom selection matches by user_id OR email so imported participants without an auth account still receive the message. Auth / password state is never used as a filter — everyone with an addressable email on the registration row is eligible.';
