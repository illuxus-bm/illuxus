-- ═══════════════════════════════════════════════════════════════════════════════
-- FILE 6/?: bulk_set_attendance — tightened per-row return shape
--
-- Spec: .kiro/specs/checkin-checkout-tabs (Task 1.3)
-- Requirements: 15.1, 15.2, 15.3
--
-- Replaces the legacy `bulk_set_attendance(uuid[], text, text) RETURNS int`
-- (count of successful changes) with a per-row result form
-- `RETURNS TABLE(registration_id uuid, code text)` so callers can render
-- per-registration outcomes (REQ-15.3).
--
-- Behaviour change:
--   • Iterates `p_ids`, delegating each id to `public._apply_attendance`
--     (migration 004) so the bulk path uses the SAME state-machine, status
--     guards, tracking-window, and authorization checks as the per-row
--     `set_attendance` RPC (migration 005). REQ-15.1 + REQ-15.2.
--   • Yields exactly one row per input id — including unauthorized,
--     not_found, cancelled, declined, pending_approval, tracking_closed,
--     wrong-state, and invalid-target cases — so result-array length always
--     equals input-array length. REQ-15.3.
--
-- Migration mechanics:
--   • This is a breaking change to the function's return type. PostgreSQL's
--     `CREATE OR REPLACE FUNCTION` cannot change the return type of an
--     existing function, so we `DROP FUNCTION` with the original signature
--     first. The DROP is wrapped in `IF EXISTS` so the migration is
--     idempotent and safe to re-run.
--   • Re-grants `EXECUTE` to `authenticated`, matching the prior grant
--     surface.
-- ═══════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.bulk_set_attendance(uuid[], text, text);

CREATE OR REPLACE FUNCTION public.bulk_set_attendance(
  p_ids    uuid[],
  p_target text,
  p_method text DEFAULT 'bulk'
) RETURNS TABLE(registration_id uuid, code text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _id     uuid;
  _actor  uuid := auth.uid();
  _code   text;
BEGIN
  -- Defensive: target must be one of the two permitted values. The helper
  -- also rejects malformed targets with `'invalid'`, but checking here lets
  -- us return a uniform `'invalid'` row per id without entering the helper
  -- per id when the entire call is malformed.
  IF p_target NOT IN ('inside','outside') THEN
    FOREACH _id IN ARRAY COALESCE(p_ids, ARRAY[]::uuid[]) LOOP
      registration_id := _id;
      code            := 'invalid';
      RETURN NEXT;
    END LOOP;
    RETURN;
  END IF;

  -- Guard against NULL input array — yield zero rows.
  IF p_ids IS NULL THEN
    RETURN;
  END IF;

  -- Per-row delegation: every id (even rejected ones) produces a result row,
  -- so callers can pair `result[i].registration_id` with `p_ids[i]` and
  -- surface a per-row toast / log entry for non-success codes.
  FOREACH _id IN ARRAY p_ids LOOP
    _code := public._apply_attendance(_id, p_target, p_method, _actor);
    registration_id := _id;
    code            := _code;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

-- Re-grant EXECUTE to authenticated (matches the prior grant surface; the
-- DROP above also dropped any privileges attached to the old signature).
GRANT EXECUTE ON FUNCTION public.bulk_set_attendance(uuid[], text, text) TO authenticated;
