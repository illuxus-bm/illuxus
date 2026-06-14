-- ============================================================================
-- Hotfix for Phase 1 — sponsor column names
-- ----------------------------------------------------------------------------
-- The first cut of `communications_resolve_recipients` referenced
-- `sponsors.contact_name` / `sponsors.contact_email`, which don't exist in
-- this schema. The actual sponsor table only has `name` and `email`.
-- This migration replaces the function with the corrected version. No data
-- changes; nothing else in 009/010 needs to be re-run.
-- ============================================================================

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
BEGIN
  _types := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(_filter -> 'types', '[]'::jsonb))),
    ARRAY[]::text[]
  );
  _user_ids := COALESCE(
    ARRAY(SELECT (jsonb_array_elements_text(COALESCE(_filter -> 'user_ids', '[]'::jsonb)))::uuid),
    ARRAY[]::uuid[]
  );

  IF _event_id IS NOT NULL THEN
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
    SELECT r.user_id,
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
    SELECT s.user_id,
           COALESCE(NULLIF(trim(coalesce(s.name,'')), ''), split_part(s.email,'@',1)) AS name,
           lower(s.email) AS email,
           NULL::text AS phone
      FROM event_speakers es
      JOIN speakers s ON s.id = es.speaker_id
     WHERE es.event_id = _event_id AND s.email IS NOT NULL
  ),
  sponsors_set AS (
    -- Sponsors table only has `name` + `email` (no contact_* split).
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
    SELECT b.user_id, b.name, b.email, b.phone
      FROM base b
     WHERE 'custom' = ANY(_types) AND b.user_id = ANY(_user_ids)
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
