-- ============================================================================
-- Attendance history RPCs — backs the History dialogs in the organizer UI
-- ----------------------------------------------------------------------------
-- The "Attendance history" button on the Registrations section (and the
-- per-row "Attendance history" menu item) call two RPCs that didn't exist:
--
--   - `event_attendance_audit(_event_id, _limit)`      — all events for a given event
--   - `registration_attendance_audit(p_registration_id, p_limit)` — one registrant's history
--
-- Without these, the dialog opened but stayed empty (or errored out silently
-- if RLS allowed nothing through). This migration adds both, reading from
-- the existing `attendance_events` table (single source of truth for
-- check-in / check-out activity).
--
-- Shape of return rows matches what the React side already expects:
--   id, actor_email, action, target_id, details(jsonb), created_at
--
-- Action mapping:
--   attendance_events.kind = 'in'       → "attendance.check_in"
--   attendance_events.kind = 'out'      → "attendance.check_out"
--   attendance_events.kind = 'auto_out' → "attendance.auto_check_out"
-- ============================================================================

-- ── 1. Per-event audit (icon next to attendance tabs)
CREATE OR REPLACE FUNCTION public.event_attendance_audit(
  _event_id uuid,
  _limit    int DEFAULT 200
)
RETURNS TABLE(
  id          uuid,
  actor_email text,
  action      text,
  target_id   uuid,
  details     jsonb,
  created_at  timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    ae.id,
    u.email                             AS actor_email,
    CASE ae.kind
      WHEN 'in'       THEN 'attendance.check_in'
      WHEN 'out'      THEN 'attendance.check_out'
      WHEN 'auto_out' THEN 'attendance.auto_check_out'
      ELSE 'attendance.' || ae.kind
    END                                 AS action,
    ae.registration_id                  AS target_id,
    jsonb_strip_nulls(jsonb_build_object(
      'method',            ae.method,
      'registration_name', COALESCE(NULLIF(r.name, ''), r.email),
      'ticket_type',       r.ticket_type,
      'event_day',         ae.event_day
    ))                                  AS details,
    ae.occurred_at                      AS created_at
  FROM public.attendance_events ae
  LEFT JOIN public.registrations r ON r.id = ae.registration_id
  LEFT JOIN auth.users u           ON u.id = ae.actor_id
  WHERE ae.event_id = _event_id
    AND (
      -- Event owner OR platform admin can read everything for this event.
      EXISTS (SELECT 1 FROM public.events e WHERE e.id = _event_id AND e.user_id = auth.uid())
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  ORDER BY ae.occurred_at DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 200), 1), 1000);
$$;

GRANT EXECUTE ON FUNCTION public.event_attendance_audit(uuid, int) TO authenticated;

-- ── 2. Per-registration audit (per-row "Attendance history" menu item)
CREATE OR REPLACE FUNCTION public.registration_attendance_audit(
  p_registration_id uuid,
  p_limit           int DEFAULT 50
)
RETURNS TABLE(
  id          uuid,
  actor_email text,
  action      text,
  target_id   uuid,
  details     jsonb,
  created_at  timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    ae.id,
    u.email                             AS actor_email,
    CASE ae.kind
      WHEN 'in'       THEN 'attendance.check_in'
      WHEN 'out'      THEN 'attendance.check_out'
      WHEN 'auto_out' THEN 'attendance.auto_check_out'
      ELSE 'attendance.' || ae.kind
    END                                 AS action,
    ae.registration_id                  AS target_id,
    jsonb_strip_nulls(jsonb_build_object(
      'method',            ae.method,
      'registration_name', COALESCE(NULLIF(r.name, ''), r.email),
      'ticket_type',       r.ticket_type,
      'event_day',         ae.event_day
    ))                                  AS details,
    ae.occurred_at                      AS created_at
  FROM public.attendance_events ae
  LEFT JOIN public.registrations r ON r.id = ae.registration_id
  LEFT JOIN auth.users u           ON u.id = ae.actor_id
  WHERE ae.registration_id = p_registration_id
    AND (
      -- Event owner OR platform admin.
      EXISTS (
        SELECT 1
          FROM public.events e
          JOIN public.registrations reg ON reg.event_id = e.id
         WHERE reg.id = p_registration_id
           AND e.user_id = auth.uid()
      )
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  ORDER BY ae.occurred_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 500);
$$;

GRANT EXECUTE ON FUNCTION public.registration_attendance_audit(uuid, int) TO authenticated;
