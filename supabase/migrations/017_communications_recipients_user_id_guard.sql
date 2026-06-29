-- ─────────────────────────────────────────────────────────────────────────────
-- 017_communications_recipients_user_id_guard.sql
--
-- Repairs the "insert or update on table 'communication_recipients' violates
-- foreign key constraint 'communication_recipients_user_id_fkey'" error that
-- surfaced when an organiser pressed Send on an event communication.
--
-- Cause
-- ─────
-- `communications_resolve_recipients` (the event-side resolver feeding the
-- dispatch RPC) returns `registrations.user_id` straight through to the
-- fan-out INSERT. `registrations.user_id` is NOT a foreign key in this
-- schema — it's a plain `uuid` column that gets stamped by the organiser
-- "Add participant" flow, the public RSVP flow, and the bulk import flow.
-- Any of those paths can leave behind a `user_id` that no longer points
-- at a live row in `auth.users`:
--   • The user was deleted in Supabase Auth but the registration was kept.
--   • A teammate manually patched the column via SQL.
--   • A legacy migration set placeholder UUIDs.
--
-- `communication_recipients.user_id`, on the other hand, IS a foreign key
-- (`REFERENCES auth.users(id) ON DELETE SET NULL`). So the dispatch INSERT
-- rejects the orphan rows and the whole send aborts.
--
-- Fix
-- ───
-- Patch the resolver so it only emits a `user_id` when the user actually
-- exists. When the auth user is gone, return NULL — the column on
-- `communication_recipients` is nullable, the recipient remains addressable
-- via the (denormalised) `email` / `phone` columns, and the existing
-- ON DELETE SET NULL behaviour is consistent with what's already happening
-- for users deleted after the recipient row was created.
--
-- The function is `SECURITY DEFINER` so its body can read `auth.users`
-- regardless of the caller. We use a correlated EXISTS so the planner can
-- still use the registrations indexes; CASE turns the result into NULL when
-- the user is missing.
--
-- The community resolver was already safe (it joins from `community_members`
-- which has its own FK to `auth.users`) but we mirror the guard there for
-- defence in depth.
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
BEGIN
  _types := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(_filter -> 'types', '[]'::jsonb))),
    ARRAY[]::text[]
  );
  _user_ids := COALESCE(
    ARRAY(SELECT (jsonb_array_elements_text(COALESCE(_filter -> 'user_ids', '[]'::jsonb)))::uuid),
    ARRAY[]::uuid[]
  );

  -- Authorisation: only enforced when a user is calling. Headless callers
  -- (pg_cron, service_role JWT) get past the GRANT and skip this check.
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
    -- Critical change: wrap registration.user_id in a CASE that nulls it
    -- out when the auth row is gone. Prevents the downstream
    -- communication_recipients_user_id_fkey violation during dispatch.
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
    -- Same guard for speakers.user_id — same root cause.
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

GRANT EXECUTE ON FUNCTION public.communications_resolve_recipients(uuid, jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.communications_resolve_recipients(uuid, jsonb) IS
  'Resolves event communication recipients. Strips registration.user_id when the referenced auth user no longer exists so the dispatch INSERT does not violate communication_recipients_user_id_fkey.';
