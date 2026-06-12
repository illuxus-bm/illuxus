-- ═══════════════════════════════════════════════════════════════════════════════
-- FILE 5/?: set_attendance — per-row RPC for the tabbed scanner
--
-- Spec: .kiro/specs/checkin-checkout-tabs (Task 1.2)
-- Requirements: 3, 4, 5, 6, 7, 8, 10, 12.1, 12.2, 13.2
--
-- This RPC is the SECURITY DEFINER entry point the new `QRScannerDialog`
-- calls once per scan. It delegates the entire transition rule set to the
-- private `_apply_attendance` helper introduced in migration 004, then
-- projects the resulting registration row so the dialog can render its
-- success / warn / error banner without a second round-trip.
--
-- Returned shape (per design.md "RPC surface (final shape)"):
--   code              text         -- ScanResultCode
--   registration_id   uuid
--   attendance_state  text
--   last_in_at        timestamptz
--   last_out_at       timestamptz
--   total_minutes     int
--   name              text
--   ticket_type       text
--
-- Exactly one row is returned per call. When `_apply_attendance` returned
-- `'not_found'` (the registration does not exist), the row carries the
-- code plus NULLs for every other column, mirroring the convention
-- `self_check_in` already uses.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_attendance(
  p_reg_id uuid,
  p_target text,
  p_method text DEFAULT 'qr'
) RETURNS TABLE(
  code             text,
  registration_id  uuid,
  attendance_state text,
  last_in_at       timestamptz,
  last_out_at      timestamptz,
  total_minutes    int,
  name             text,
  ticket_type      text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _code text;
BEGIN
  -- Delegate every rule (existence, authz, tracking window, status guards,
  -- state machine, and the audit-row INSERT) to the private helper. The
  -- helper runs as the same SECURITY DEFINER context, so its `auth.uid()`-
  -- driven authorization predicate sees this caller's identity.
  _code := public._apply_attendance(p_reg_id, p_target, p_method, auth.uid());

  -- Project the registration row the helper just (potentially) mutated via
  -- its `_attendance_recompute` AFTER-INSERT trigger. For every code other
  -- than 'not_found', this SELECT returns exactly one row.
  RETURN QUERY
    SELECT _code,
           r.id,
           r.attendance_state,
           r.last_in_at,
           r.last_out_at,
           r.total_minutes,
           r.name,
           r.ticket_type
    FROM public.registrations r
    WHERE r.id = p_reg_id;

  -- 'not_found' branch: keep the contract "exactly one row per call" so
  -- callers can rely on `.maybeSingle()` / first-row destructuring.
  IF NOT FOUND THEN
    RETURN QUERY
      SELECT _code,
             NULL::uuid,
             NULL::text,
             NULL::timestamptz,
             NULL::timestamptz,
             NULL::int,
             NULL::text,
             NULL::text;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_attendance(uuid, text, text) TO authenticated;
