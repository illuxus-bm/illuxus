-- ============================================================================
-- Attendance — state machine helper, RPCs, self check-in/out
--
-- Consolidated from prior individual migration files. Contents are verbatim;
-- only file packaging changed. Sections are separated by their original filename.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Section: 004_apply_attendance_helper.sql
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- Section: 005_set_attendance_rpc.sql
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- Section: 006_bulk_set_attendance_per_row.sql
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- Section: 007_self_check_in_no_out.sql
-- ----------------------------------------------------------------------------
-- ═══════════════════════════════════════════════════════════════════════════════
-- 007_self_check_in_no_out.sql
--
-- Patch `public.self_check_in(p_token text, p_event_id uuid DEFAULT NULL)` so the
-- public self-check-in flow is check-in only (Requirement 14, feature
-- `checkin-checkout-tabs`):
--
--   • When the resolved registration's attendance_state = 'inside', return
--     status='already' and DO NOT insert any attendance_events row.
--     (REQ-14.1, REQ-14.2 — no kind='out', no kind='in')
--   • When attendance_state = 'outside', re-entry is preserved: insert
--     kind='in', method='self' and return status='ok'. (REQ-14.3)
--   • When attendance_state = 'never', behavior is unchanged: insert
--     kind='in', method='self' and return status='ok'.
--
-- Signature, RETURNS shape, security, search_path, and grants are kept identical
-- to the definition in 002_functions.sql. Only the body of the trailing
-- IF _wi … ELSE … END IF block is changed.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.self_check_in(p_token text, p_event_id uuid DEFAULT NULL)
RETURNS TABLE(status text, id uuid, event_id uuid, name text, email text, ticket_type text, checked_in_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r registrations%ROWTYPE; ev events%ROWTYPE; _wi boolean; _ee timestamptz; _k text; _ref uuid; _n text; _e text; _co text; _tt text; _ts timestamptz:=now(); _d date; _rid uuid;
BEGIN
  IF p_token IS NULL OR length(trim(p_token))=0 THEN RETURN QUERY SELECT 'invalid'::text,NULL::uuid,NULL::uuid,NULL::text,NULL::text,NULL::text,NULL::timestamptz; RETURN; END IF;
  IF p_token LIKE 'speaker:%' OR p_token LIKE 'sponsor_contact:%' THEN
    IF p_event_id IS NULL THEN RETURN QUERY SELECT 'wrong_event'::text,NULL::uuid,NULL::uuid,NULL::text,NULL::text,NULL::text,NULL::timestamptz; RETURN; END IF;
    _k:=split_part(p_token,':',1); BEGIN _ref:=split_part(p_token,':',2)::uuid; EXCEPTION WHEN others THEN RETURN QUERY SELECT 'invalid'::text,NULL::uuid,NULL::uuid,NULL::text,NULL::text,NULL::text,NULL::timestamptz; RETURN; END;
    IF _k='speaker' THEN SELECT sp.name,sp.email,sp.company,'speaker' INTO _n,_e,_co,_tt FROM speakers sp JOIN event_speakers es ON es.speaker_id=sp.id AND es.event_id=p_event_id WHERE sp.id=_ref;
    ELSE SELECT sm.display_name,sm.email,sp.name,'sponsor' INTO _n,_e,_co,_tt FROM sponsor_members sm JOIN sponsors sp ON sp.id=sm.sponsor_id JOIN event_sponsors es ON es.sponsor_id=sp.id AND es.event_id=p_event_id WHERE sm.id=_ref; END IF;
    IF _n IS NULL THEN RETURN QUERY SELECT 'not_found'::text,NULL::uuid,p_event_id,NULL::text,NULL::text,NULL::text,NULL::timestamptz; RETURN; END IF;
    SELECT reg.* INTO r FROM registrations reg WHERE reg.event_id=p_event_id AND reg.ticket_type=_tt AND lower(reg.email)=lower(COALESCE(_e,'')) LIMIT 1;
    IF NOT FOUND THEN INSERT INTO registrations(event_id,name,email,company,ticket_type,status,approval_status) VALUES(p_event_id,_n,COALESCE(_e,_n||'@no-email.local'),_co,_tt,'confirmed','approved') RETURNING * INTO r; END IF;
  ELSE SELECT reg.* INTO r FROM registrations reg WHERE reg.qr_code=p_token OR reg.join_token=p_token OR reg.id::text=p_token LIMIT 1;
    IF NOT FOUND THEN RETURN QUERY SELECT 'not_found'::text,NULL::uuid,NULL::uuid,NULL::text,NULL::text,NULL::text,NULL::timestamptz; RETURN; END IF;
  END IF;
  IF p_event_id IS NOT NULL AND r.event_id<>p_event_id THEN RETURN QUERY SELECT 'wrong_event'::text,r.id,r.event_id,r.name,r.email,r.ticket_type,r.checked_in_at; RETURN; END IF;
  SELECT e.* INTO ev FROM events e WHERE e.id=r.event_id;
  IF FOUND THEN _ee:=COALESCE(ev.end_date,ev.date); IF _ee IS NOT NULL AND now()>_ee+interval '2 hours' THEN RETURN QUERY SELECT 'expired'::text,r.id,r.event_id,r.name,r.email,r.ticket_type,r.checked_in_at; RETURN; END IF; END IF;
  IF r.status='cancelled' THEN RETURN QUERY SELECT 'cancelled'::text,r.id,r.event_id,r.name,r.email,r.ticket_type,r.checked_in_at; RETURN; END IF;
  _wi:=(r.attendance_state='inside'); _d:=(_ts AT TIME ZONE COALESCE(ev.timezone,'UTC'))::date; _rid:=r.id;
  -- Behavior change (REQ-14): when already inside, return 'already' WITHOUT
  -- inserting any attendance_events row. The previous implementation inserted
  -- kind='out' here; that is removed so the public self-check-in flow can never
  -- check a participant out (REQ-14.1, REQ-14.2).
  IF _wi THEN
    RETURN QUERY SELECT 'already'::text,r.id,r.event_id,r.name,r.email,r.ticket_type,r.last_in_at;
  ELSE
    -- Covers both attendance_state='never' (first check-in) and 'outside'
    -- (re-entry, REQ-14.3). The existing _attendance_recompute AFTER-INSERT
    -- trigger keeps registrations.attendance_state, last_in_at, and the legacy
    -- checked_in/checked_in_at columns in sync.
    INSERT INTO attendance_events(registration_id,event_id,event_day,kind,method,occurred_at) VALUES(_rid,r.event_id,_d,'in','self',_ts);
    SELECT reg.* INTO r FROM registrations reg WHERE reg.id=_rid;
    RETURN QUERY SELECT 'ok'::text,r.id,r.event_id,r.name,r.email,r.ticket_type,r.last_in_at;
  END IF;
END; $$;
GRANT EXECUTE ON FUNCTION public.self_check_in(text,uuid) TO anon,authenticated;

-- ----------------------------------------------------------------------------
-- Section: 008_self_check_out.sql
-- ----------------------------------------------------------------------------
-- ═══════════════════════════════════════════════════════════════════════════════
-- 008_self_check_out.sql
--
-- Adds `public.self_check_out(p_token text, p_event_id uuid DEFAULT NULL)` so
-- the new public self-check-out page can flip an attendee from
-- attendance_state='inside' to 'outside' without organizer-staff oversight.
--
-- Mirrors `self_check_in` from 002_functions.sql (and patched in 007) but with
-- inverted semantics:
--   • attendance_state='inside'   → insert kind='out', method='self', return 'ok'
--   • attendance_state='outside'  → return 'already' (no insert)
--   • attendance_state='never'    → return 'not_checked_in_yet' (no insert)
--
-- All other guards match self_check_in:
--   • Validates the token shape (`speaker:<UUID>`, `sponsor_contact:<UUID>`,
--     id, qr_code, or join_token).
--   • Enforces the wrong_event guard when p_event_id is supplied.
--   • Enforces the 2-hour-after-end-of-event tracking window.
--   • Rejects cancelled registrations.
--   • Returns the same row shape as self_check_in for symmetry on the client.
--
-- Granted to anon and authenticated so the public /checkout/:eventId page can
-- call it without a session, identical to the self_check_in grant.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.self_check_out(p_token text, p_event_id uuid DEFAULT NULL)
RETURNS TABLE(status text, id uuid, event_id uuid, name text, email text, ticket_type text, checked_out_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r registrations%ROWTYPE;
  ev events%ROWTYPE;
  _ee timestamptz;
  _k text;
  _ref uuid;
  _n text;
  _e text;
  _co text;
  _tt text;
  _ts timestamptz := now();
  _d date;
  _rid uuid;
  _state text;
BEGIN
  -- Empty / whitespace-only token = 'invalid'.
  IF p_token IS NULL OR length(trim(p_token)) = 0 THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  -- Speaker / sponsor scoped tokens require an event id and a valid UUID payload.
  IF p_token LIKE 'speaker:%' OR p_token LIKE 'sponsor_contact:%' THEN
    IF p_event_id IS NULL THEN
      RETURN QUERY SELECT 'wrong_event'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::timestamptz;
      RETURN;
    END IF;
    _k := split_part(p_token, ':', 1);
    BEGIN
      _ref := split_part(p_token, ':', 2)::uuid;
    EXCEPTION WHEN others THEN
      RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::timestamptz;
      RETURN;
    END;
    IF _k = 'speaker' THEN
      SELECT sp.name, sp.email, sp.company, 'speaker'
        INTO _n, _e, _co, _tt
        FROM speakers sp
        JOIN event_speakers es ON es.speaker_id = sp.id AND es.event_id = p_event_id
       WHERE sp.id = _ref;
    ELSE
      SELECT sm.display_name, sm.email, sp.name, 'sponsor'
        INTO _n, _e, _co, _tt
        FROM sponsor_members sm
        JOIN sponsors sp ON sp.id = sm.sponsor_id
        JOIN event_sponsors es ON es.sponsor_id = sp.id AND es.event_id = p_event_id
       WHERE sm.id = _ref;
    END IF;
    IF _n IS NULL THEN
      RETURN QUERY SELECT 'not_found'::text, NULL::uuid, p_event_id, NULL::text, NULL::text, NULL::text, NULL::timestamptz;
      RETURN;
    END IF;
    -- For self-check-out, the registration MUST already exist — we never lazy-
    -- create. If a speaker/sponsor scans without ever having checked in, we
    -- surface 'not_checked_in_yet' rather than 'not_found'.
    SELECT reg.* INTO r
      FROM registrations reg
     WHERE reg.event_id = p_event_id
       AND reg.ticket_type = _tt
       AND lower(reg.email) = lower(COALESCE(_e, ''))
     LIMIT 1;
    IF NOT FOUND THEN
      RETURN QUERY SELECT 'not_checked_in_yet'::text, NULL::uuid, p_event_id, _n, _e, _tt, NULL::timestamptz;
      RETURN;
    END IF;
  ELSE
    SELECT reg.* INTO r
      FROM registrations reg
     WHERE reg.qr_code = p_token OR reg.join_token = p_token OR reg.id::text = p_token
     LIMIT 1;
    IF NOT FOUND THEN
      RETURN QUERY SELECT 'not_found'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::timestamptz;
      RETURN;
    END IF;
  END IF;

  -- Wrong-event guard.
  IF p_event_id IS NOT NULL AND r.event_id <> p_event_id THEN
    RETURN QUERY SELECT 'wrong_event'::text, r.id, r.event_id, r.name, r.email, r.ticket_type, r.last_out_at;
    RETURN;
  END IF;

  -- Tracking window — same 2-hour-after-end policy as self_check_in.
  SELECT e.* INTO ev FROM events e WHERE e.id = r.event_id;
  IF FOUND THEN
    _ee := COALESCE(ev.end_date, ev.date);
    IF _ee IS NOT NULL AND now() > _ee + interval '2 hours' THEN
      RETURN QUERY SELECT 'expired'::text, r.id, r.event_id, r.name, r.email, r.ticket_type, r.last_out_at;
      RETURN;
    END IF;
  END IF;

  -- Cancelled registrations cannot self-checkout.
  IF r.status = 'cancelled' THEN
    RETURN QUERY SELECT 'cancelled'::text, r.id, r.event_id, r.name, r.email, r.ticket_type, r.last_out_at;
    RETURN;
  END IF;

  _state := COALESCE(r.attendance_state, 'never');
  _d := (_ts AT TIME ZONE COALESCE(ev.timezone, 'UTC'))::date;
  _rid := r.id;

  -- State-machine branching:
  --   inside  → insert kind='out', return 'ok'
  --   outside → no-op, return 'already' (already checked out)
  --   never   → no-op, return 'not_checked_in_yet'
  IF _state = 'inside' THEN
    INSERT INTO attendance_events(registration_id, event_id, event_day, kind, method, occurred_at)
    VALUES(_rid, r.event_id, _d, 'out', 'self', _ts);
    -- Re-read after the AFTER-INSERT trigger updates last_out_at / state.
    SELECT reg.* INTO r FROM registrations reg WHERE reg.id = _rid;
    RETURN QUERY SELECT 'ok'::text, r.id, r.event_id, r.name, r.email, r.ticket_type, r.last_out_at;
  ELSIF _state = 'outside' THEN
    RETURN QUERY SELECT 'already'::text, r.id, r.event_id, r.name, r.email, r.ticket_type, r.last_out_at;
  ELSE
    -- 'never' — never checked in, can't check out.
    RETURN QUERY SELECT 'not_checked_in_yet'::text, r.id, r.event_id, r.name, r.email, r.ticket_type, NULL::timestamptz;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.self_check_out(text, uuid) TO anon, authenticated;

