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
