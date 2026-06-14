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
