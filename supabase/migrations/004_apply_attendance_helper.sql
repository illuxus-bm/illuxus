-- ═══════════════════════════════════════════════════════════════════════════════
-- FILE 4/?: _apply_attendance — internal helper for the tabbed scanner
--
-- Spec: .kiro/specs/checkin-checkout-tabs (Task 1.1)
-- Requirements: 3, 4, 5, 6, 7, 8, 12.1, 12.2, 13.2
--
-- This helper is the single source of truth for attendance state transitions.
-- It is invoked by the SECURITY DEFINER RPCs `set_attendance` (Task 1.2) and
-- `bulk_set_attendance` (Task 1.3). It is intentionally PRIVATE — no
-- `GRANT EXECUTE` is issued — so it can only be reached through those callers.
--
-- Branch order (per design.md "Internal helper _apply_attendance"):
--   1. existence
--   2. authorization (platform admin OR event owner)
--   3. tracking window
--   4. status / approval guard
--   5. state machine
--
-- Inserts into `attendance_events` only on the success branches; the existing
-- `attendance_events_after_insert` trigger on that table fires
-- `_attendance_recompute(NEW.registration_id)`, which keeps `registrations`
-- (`attendance_state`, `last_in_at`, `last_out_at`, `total_minutes`,
-- `checked_in`, `checked_in_at`) in sync. This helper does not touch
-- `registrations` directly.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._apply_attendance(
  _reg_id uuid,
  _target text,
  _method text,
  _actor  uuid
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r   registrations%ROWTYPE;
  _ts timestamptz := now();
  _d  date;
BEGIN
  -- Defensive: target must be one of the two permitted values. Callers
  -- already constrain this, but a malformed value should not fall through.
  IF _target NOT IN ('inside','outside') THEN
    RETURN 'invalid';
  END IF;

  -- 1. Existence ──────────────────────────────────────────────────────────────
  SELECT * INTO r FROM registrations WHERE id = _reg_id;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  -- 2. Authorization (REQ-13.2) ───────────────────────────────────────────────
  -- Reuses the same predicate pair already used by `bulk_set_attendance` and
  -- `toggle_attendance`. Note: unlike `toggle_attendance`, the scanner-driven
  -- transitions do NOT permit `r.user_id = _actor` self-service; the public
  -- self-check-in path goes through `self_check_in` instead.
  IF NOT (has_role(_actor, 'admin') OR is_event_owner(_actor, r.event_id)) THEN
    RETURN 'unauthorized';
  END IF;

  -- 3. Tracking window (REQ-8.1) ──────────────────────────────────────────────
  IF event_tracking_closed(r.event_id) THEN
    RETURN 'tracking_closed';
  END IF;

  -- 4. Status / approval guard (REQ-7) ────────────────────────────────────────
  IF r.status = 'cancelled' THEN
    RETURN 'cancelled';
  END IF;
  IF r.approval_status = 'declined' THEN
    RETURN 'declined';
  END IF;
  IF r.approval_status IN ('pending','waitlisted') THEN
    RETURN 'pending_approval';
  END IF;

  -- 5. State machine (REQ-3, REQ-4, REQ-5, REQ-6) ─────────────────────────────
  -- `event_day` is computed in the event's timezone (matching the existing
  -- pattern in `bulk_set_attendance` / `toggle_attendance`).
  _d := (_ts AT TIME ZONE COALESCE((SELECT timezone FROM events WHERE id = r.event_id), 'UTC'))::date;

  IF _target = 'inside' THEN
    -- Permitted starts: 'never', 'outside' → INSERT kind='in'
    -- Rejected start: 'inside' → 'already_inside' (no write)
    IF r.attendance_state = 'inside' THEN
      RETURN 'already_inside';
    END IF;

    INSERT INTO attendance_events (registration_id, event_id, event_day, kind, method, actor_id, occurred_at)
    VALUES (r.id, r.event_id, _d, 'in', _method, _actor, _ts);

    RETURN 'applied_in';

  ELSE -- _target = 'outside'
    -- Permitted start: 'inside' → INSERT kind='out'
    -- Rejected starts:
    --   'never'   → 'not_checked_in_yet' (also enforces the REQ-6.1 ordering
    --              invariant: count(out) ≤ count(in) at every prefix, since
    --              an 'out' insert before any 'in' is impossible)
    --   'outside' → 'already_outside' (no write)
    IF r.attendance_state = 'never' THEN
      RETURN 'not_checked_in_yet';
    END IF;
    IF r.attendance_state = 'outside' THEN
      RETURN 'already_outside';
    END IF;

    INSERT INTO attendance_events (registration_id, event_id, event_day, kind, method, actor_id, occurred_at)
    VALUES (r.id, r.event_id, _d, 'out', _method, _actor, _ts);

    RETURN 'applied_out';
  END IF;
END;
$$;

-- ── Privacy ───────────────────────────────────────────────────────────────────
-- This helper is intentionally not exposed to PostgREST. Revoke any default
-- PUBLIC execute privilege; do NOT grant to `anon` or `authenticated`. Only
-- the SECURITY DEFINER callers (`set_attendance`, `bulk_set_attendance`)
-- reach it.
REVOKE ALL ON FUNCTION public._apply_attendance(uuid, text, text, uuid) FROM PUBLIC;
