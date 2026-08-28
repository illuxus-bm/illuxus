-- ============================================================================
-- 032_anon_rpc_hardening.sql
--
-- SECURITY FIXES for three CONFIRMED data-exposure defects in `SECURITY
-- DEFINER` functions that are executable by the `anon` role.
--
-- Why this class of function is dangerous: `SECURITY DEFINER` runs the body
-- with the owner's privileges, so **Row Level Security does not apply inside
-- it**. For an anon-callable function, the body's own `WHERE` clause is the
-- ONLY access boundary. Two of the three functions below were missing that
-- clause entirely.
--
-- Each fix is independent and each preserves the caller-visible behaviour the
-- application actually relies on (verified against the call sites, cited
-- inline).
--
-- ── AUDIT-01 (P1) — `get_event_attendees_public` unbounded attendee dump ────
--   The function takes `_limit int DEFAULT 12` and interpolates it straight
--   into `LIMIT _limit` with no clamp. It is granted to `anon`. So while the
--   intended contract is "≤12 avatars for the going-strip", an anonymous
--   caller passing `_limit => 2147483647` receives the NAME of every approved
--   attendee of any published event in a single request.
--   The visibility gate itself was already correct
--   (`approval_status='approved' AND e.status='published'`) — only the bound
--   was missing. `search_cities`, defined ~6 lines away in
--   000_full_schema.sql, already demonstrates the correct idiom:
--   `LIMIT LEAST(GREATEST(COALESCE(_limit,10),1),50)`.
--
-- ── AUDIT-02 (P2) — `get_event_by_slug` returns unpublished events ──────────
--   `WHERE e.slug = lower(_slug) AND (...)` with NO visibility predicate. The
--   only reference to publication state is `ORDER BY (e.status='published')
--   DESC`, which merely *prefers* a published row on slug collision; when only
--   a draft matches, the draft is returned. An anonymous caller can therefore
--   confirm the existence of unannounced events and harvest their UUIDs (which
--   are inputs to other RPCs), with `status` in the result telling them
--   exactly what they found.
--
-- ── AUDIT-03 (P1) — `self_check_in` / `self_check_out` leak email ───────────
--   Both are granted to `anon` (the public `/checkin/:eventId` route is
--   unauthenticated) and both return `email` on EVERY path, including the
--   `wrong_event`, `expired` and `cancelled` failure paths. Anyone who obtains
--   a token — a photographed QR code, a forwarded ticket link, a screenshot —
--   reads the registrant's email address out of the database.
--
--   Worse, the `speaker:%` / `sponsor_contact:%` branches read
--   `speakers.email` and `sponsor_members.email` from inside the SECURITY
--   DEFINER body, which **defeats an explicit column-level revoke** that this
--   same schema sets at 000_full_schema.sql:275 and :294:
--       REVOKE SELECT(email) ON public.speakers FROM anon;
--       REVOKE SELECT(email) ON public.sponsors FROM anon;
--   The project deliberately hid those addresses from anon; these functions
--   handed them back. The `speakers.id` needed to trigger that branch is
--   published on public event pages.
--
--   VERIFIED SAFE TO REMOVE: no caller reads the field. Checked every call
--   site — src/pages/SelfCheckInPage.tsx:121, src/pages/SelfCheckOutPage.tsx:117,
--   src/components/event/RegistrationsSection.tsx:513 and :801,
--   src/components/event/registrations/BulkCheckInDialog.tsx:75. None
--   references `.email` on the RPC result; the UI renders `status` and `name`.
--
-- ── DEPLOYMENT NOTE (read before applying) ─────────────────────────────────
--   Postgres cannot change a function's return type with
--   `CREATE OR REPLACE` — it raises "cannot change return type of existing
--   function". Removing the `email` column therefore requires DROP + CREATE,
--   which means a sub-second window where `self_check_in` / `self_check_out`
--   do not exist. Apply during a period with no active door check-in, or
--   accept that a scan in that window returns a transient error and succeeds
--   on retry. The DROP is of a FUNCTION only — no table, row, or column is
--   touched, and there is no data loss.
--
--   `GRANT` is re-issued after each CREATE because DROP discards grants.
--
-- ── ROLLBACK ───────────────────────────────────────────────────────────────
--   Every change is reversible by re-applying the prior definition from
--   000_full_schema.sql (`get_event_attendees_public` line 908,
--   `get_event_by_slug` line 907, `self_check_in` line 1597, `self_check_out`
--   line 1664) and re-issuing the same GRANTs. No data is modified by this
--   migration.
-- ============================================================================


-- ── AUDIT-01: clamp the attendee-preview limit ─────────────────────────────
-- Return type is unchanged, so CREATE OR REPLACE is sufficient and grants are
-- preserved. The clamp mirrors `search_cities`: floor 1, ceiling 50, default 12.
-- 50 is comfortably above the 12 the UI requests
-- (src/pages/PublicEventPage.tsx passes `_limit: 12`) while making a full
-- roster dump impossible.
CREATE OR REPLACE FUNCTION public.get_event_attendees_public(_eid uuid, _limit int DEFAULT 12)
RETURNS TABLE(going_count bigint, attendees jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ap AS (
    SELECT r.user_id, r.name, r.created_at
      FROM registrations r
      JOIN events e ON e.id = r.event_id
     WHERE r.event_id = _eid
       AND r.approval_status = 'approved'
       AND e.status = 'published'
  ),
  sa AS (
    SELECT a.user_id, a.name, a.created_at, p.display_name, p.avatar_url
      FROM ap a
      LEFT JOIN profiles p ON p.user_id = a.user_id
     ORDER BY a.created_at
     -- CLAMPED. Was a bare `LIMIT _limit`, letting an anon caller request the
     -- entire approved-attendee roster by name.
     LIMIT LEAST(GREATEST(COALESCE(_limit, 12), 1), 50)
  )
  SELECT
    (SELECT count(*) FROM ap),
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
                'name', COALESCE(s.display_name, s.name),
                'avatar_url', s.avatar_url))
         FROM sa s),
      '[]'
    );
$$;

COMMENT ON FUNCTION public.get_event_attendees_public(uuid, int) IS
  'Going-count plus a small avatar preview of approved attendees for a PUBLISHED event. `_limit` is clamped to 1..50 (default 12): the unclamped version allowed an anonymous caller to dump the full attendee roster by name. `going_count` is a total and is unaffected by the clamp.';


-- ── AUDIT-02: restrict slug resolution to publicly-visible events ──────────
-- Return type unchanged -> CREATE OR REPLACE, grants preserved.
--
-- A bare `AND e.status = 'published'` would BREAK organizer draft preview:
-- src/pages/PublicEventPage.tsx resolves the slug through this RPC (lines 80
-- and 93) for both public visitors and the organizer previewing their own
-- unpublished event. The predicate below therefore mirrors the `events` table's
-- own SELECT policy ("View published events", as widened by migration 012):
-- published, OR the caller owns it, OR the caller is a platform admin, OR the
-- caller is a member of the owning organisation.
--
-- `is_event_owner` is not used here because it is REVOKEd from anon
-- (000_full_schema.sql:1222) and this function must remain anon-callable; the
-- ownership test is inlined instead. `has_role` and `is_org_member` are both
-- SECURITY DEFINER and safe to call from this context.
--
-- For an anonymous caller every OR branch after the first evaluates against
-- `auth.uid() = NULL` and yields false, so anon sees published events only.
CREATE OR REPLACE FUNCTION public.get_event_by_slug(_slug text, _org_slug text DEFAULT NULL)
RETURNS TABLE(id uuid, slug text, org_id uuid, status text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.slug, e.org_id, e.status
    FROM events e
    LEFT JOIN organizations o ON o.id = e.org_id
   WHERE e.slug = lower(_slug)
     AND (_org_slug IS NULL OR o.slug = _org_slug OR o.subdomain = _org_slug)
     -- VISIBILITY GATE (added). Previously absent entirely, so any slug guess
     -- returned draft/cancelled events to anonymous callers.
     AND (
          e.status = 'published'
       OR e.user_id = auth.uid()
       OR public.has_role(auth.uid(), 'admin')
       OR (e.org_id IS NOT NULL AND public.is_org_member(auth.uid(), e.org_id))
     )
   ORDER BY (e.status = 'published') DESC
   LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_event_by_slug(text, text) IS
  'Resolves an event slug to its id. Visibility mirrors the events SELECT policy: published, or owned by the caller, or caller is platform admin / member of the owning org. Anonymous callers see published events only. The prior version had no visibility predicate and leaked draft events.';


-- ── AUDIT-03: drop `email` from the public check-in/out return shape ───────
-- DROP + CREATE is required: the return type changes. See the DEPLOYMENT NOTE
-- at the top of this file.
--
-- The bodies below are otherwise transcribed unchanged from
-- 000_full_schema.sql (self_check_in at 1597, self_check_out at 1664),
-- including the REQ-14 guarantee that an already-inside registration returns
-- 'already' WITHOUT inserting an attendance row, so the public flow can never
-- check someone out. Only the `email` column is removed from `RETURNS TABLE`
-- and from every `RETURN QUERY`.
--
-- NOTE ON RESIDUAL RISK (not fixed here, tracked as AUDIT-04): the
-- `speaker:%` / `sponsor_contact:%` branch still LAZY-CREATES a
-- `status='confirmed', approval_status='approved'` registration row, and the
-- success path still inserts an `attendance_events` row, both driven purely by
-- token possession with no rate limit. Removing that is a behavioural change
-- to the door-check-in product flow and needs product sign-off, so it is
-- reported rather than silently altered. Dropping `email` closes the
-- disclosure half of the finding, which is the part with no behavioural cost.

DROP FUNCTION IF EXISTS public.self_check_in(text, uuid);

CREATE FUNCTION public.self_check_in(p_token text, p_event_id uuid DEFAULT NULL)
RETURNS TABLE(status text, id uuid, event_id uuid, name text, ticket_type text, checked_in_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r registrations%ROWTYPE; ev events%ROWTYPE; _wi boolean; _ee timestamptz;
  _k text; _ref uuid; _n text; _e text; _co text; _tt text;
  _ts timestamptz := now(); _d date; _rid uuid;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) = 0 THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::timestamptz; RETURN;
  END IF;

  IF p_token LIKE 'speaker:%' OR p_token LIKE 'sponsor_contact:%' THEN
    IF p_event_id IS NULL THEN
      RETURN QUERY SELECT 'wrong_event'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::timestamptz; RETURN;
    END IF;
    _k := split_part(p_token, ':', 1);
    BEGIN _ref := split_part(p_token, ':', 2)::uuid;
    EXCEPTION WHEN others THEN
      RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::timestamptz; RETURN;
    END;
    -- `_e` is still read internally: it is the key used to match or create the
    -- registration row. It is simply never returned to the caller now.
    IF _k = 'speaker' THEN
      SELECT sp.name, sp.email, sp.company, 'speaker' INTO _n, _e, _co, _tt
        FROM speakers sp
        JOIN event_speakers es ON es.speaker_id = sp.id AND es.event_id = p_event_id
       WHERE sp.id = _ref;
    ELSE
      SELECT sm.display_name, sm.email, sp.name, 'sponsor' INTO _n, _e, _co, _tt
        FROM sponsor_members sm
        JOIN sponsors sp ON sp.id = sm.sponsor_id
        JOIN event_sponsors es ON es.sponsor_id = sp.id AND es.event_id = p_event_id
       WHERE sm.id = _ref;
    END IF;
    IF _n IS NULL THEN
      RETURN QUERY SELECT 'not_found'::text, NULL::uuid, p_event_id, NULL::text, NULL::text, NULL::timestamptz; RETURN;
    END IF;
    SELECT reg.* INTO r FROM registrations reg
     WHERE reg.event_id = p_event_id AND reg.ticket_type = _tt
       AND lower(reg.email) = lower(COALESCE(_e, '')) LIMIT 1;
    IF NOT FOUND THEN
      INSERT INTO registrations(event_id, name, email, company, ticket_type, status, approval_status)
      VALUES (p_event_id, _n, COALESCE(_e, _n || '@no-email.local'), _co, _tt, 'confirmed', 'approved')
      RETURNING * INTO r;
    END IF;
  ELSE
    SELECT reg.* INTO r FROM registrations reg
     WHERE reg.qr_code = p_token OR reg.join_token = p_token OR reg.id::text = p_token LIMIT 1;
    IF NOT FOUND THEN
      RETURN QUERY SELECT 'not_found'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::timestamptz; RETURN;
    END IF;
  END IF;

  IF p_event_id IS NOT NULL AND r.event_id <> p_event_id THEN
    RETURN QUERY SELECT 'wrong_event'::text, r.id, r.event_id, r.name, r.ticket_type, r.checked_in_at; RETURN;
  END IF;

  SELECT e.* INTO ev FROM events e WHERE e.id = r.event_id;
  IF FOUND THEN
    _ee := COALESCE(ev.end_date, ev.date);
    IF _ee IS NOT NULL AND now() > _ee + interval '2 hours' THEN
      RETURN QUERY SELECT 'expired'::text, r.id, r.event_id, r.name, r.ticket_type, r.checked_in_at; RETURN;
    END IF;
  END IF;

  IF r.status = 'cancelled' THEN
    RETURN QUERY SELECT 'cancelled'::text, r.id, r.event_id, r.name, r.ticket_type, r.checked_in_at; RETURN;
  END IF;

  _wi := (r.attendance_state = 'inside');
  _d  := (_ts AT TIME ZONE COALESCE(ev.timezone, 'UTC'))::date;
  _rid := r.id;

  -- REQ-14 (preserved verbatim): when already inside, return 'already' WITHOUT
  -- inserting any attendance_events row, so the public self-check-in flow can
  -- never check a participant out.
  IF _wi THEN
    RETURN QUERY SELECT 'already'::text, r.id, r.event_id, r.name, r.ticket_type, r.last_in_at;
  ELSE
    INSERT INTO attendance_events(registration_id, event_id, event_day, kind, method, occurred_at)
    VALUES (_rid, r.event_id, _d, 'in', 'self', _ts);
    SELECT reg.* INTO r FROM registrations reg WHERE reg.id = _rid;
    RETURN QUERY SELECT 'ok'::text, r.id, r.event_id, r.name, r.ticket_type, r.last_in_at;
  END IF;
END $$;

-- Re-issued: DROP FUNCTION discarded the previous grant. The public
-- `/checkin/:eventId` route is unauthenticated and depends on this.
GRANT EXECUTE ON FUNCTION public.self_check_in(text, uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.self_check_in(text, uuid) IS
  'Public self-check-in by QR / join token. Returns status + name + ticket_type; `email` was REMOVED from the return shape because this function is anon-callable and every path (including failures) previously disclosed the registrant address, which also defeated the REVOKE SELECT(email) on speakers/sponsors. Never inserts an out-event (REQ-14).';


DROP FUNCTION IF EXISTS public.self_check_out(text, uuid);

CREATE FUNCTION public.self_check_out(p_token text, p_event_id uuid DEFAULT NULL)
RETURNS TABLE(status text, id uuid, event_id uuid, name text, ticket_type text, checked_out_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r registrations%ROWTYPE; ev events%ROWTYPE; _ee timestamptz;
  _k text; _ref uuid; _n text; _e text; _co text; _tt text;
  _ts timestamptz := now(); _d date; _rid uuid; _state text;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) = 0 THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::timestamptz; RETURN;
  END IF;

  IF p_token LIKE 'speaker:%' OR p_token LIKE 'sponsor_contact:%' THEN
    IF p_event_id IS NULL THEN
      RETURN QUERY SELECT 'wrong_event'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::timestamptz; RETURN;
    END IF;
    _k := split_part(p_token, ':', 1);
    BEGIN _ref := split_part(p_token, ':', 2)::uuid;
    EXCEPTION WHEN others THEN
      RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::timestamptz; RETURN;
    END;
    IF _k = 'speaker' THEN
      SELECT sp.name, sp.email, sp.company, 'speaker' INTO _n, _e, _co, _tt
        FROM speakers sp
        JOIN event_speakers es ON es.speaker_id = sp.id AND es.event_id = p_event_id
       WHERE sp.id = _ref;
    ELSE
      SELECT sm.display_name, sm.email, sp.name, 'sponsor' INTO _n, _e, _co, _tt
        FROM sponsor_members sm
        JOIN sponsors sp ON sp.id = sm.sponsor_id
        JOIN event_sponsors es ON es.sponsor_id = sp.id AND es.event_id = p_event_id
       WHERE sm.id = _ref;
    END IF;
    IF _n IS NULL THEN
      RETURN QUERY SELECT 'not_found'::text, NULL::uuid, p_event_id, NULL::text, NULL::text, NULL::timestamptz; RETURN;
    END IF;
    -- Self-check-out never lazy-creates a registration.
    SELECT reg.* INTO r FROM registrations reg
     WHERE reg.event_id = p_event_id AND reg.ticket_type = _tt
       AND lower(reg.email) = lower(COALESCE(_e, '')) LIMIT 1;
    IF NOT FOUND THEN
      RETURN QUERY SELECT 'not_checked_in_yet'::text, NULL::uuid, p_event_id, _n, _tt, NULL::timestamptz; RETURN;
    END IF;
  ELSE
    SELECT reg.* INTO r FROM registrations reg
     WHERE reg.qr_code = p_token OR reg.join_token = p_token OR reg.id::text = p_token LIMIT 1;
    IF NOT FOUND THEN
      RETURN QUERY SELECT 'not_found'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::timestamptz; RETURN;
    END IF;
  END IF;

  IF p_event_id IS NOT NULL AND r.event_id <> p_event_id THEN
    RETURN QUERY SELECT 'wrong_event'::text, r.id, r.event_id, r.name, r.ticket_type, r.last_out_at; RETURN;
  END IF;

  SELECT e.* INTO ev FROM events e WHERE e.id = r.event_id;
  IF FOUND THEN
    _ee := COALESCE(ev.end_date, ev.date);
    IF _ee IS NOT NULL AND now() > _ee + interval '2 hours' THEN
      RETURN QUERY SELECT 'expired'::text, r.id, r.event_id, r.name, r.ticket_type, r.last_out_at; RETURN;
    END IF;
  END IF;

  IF r.status = 'cancelled' THEN
    RETURN QUERY SELECT 'cancelled'::text, r.id, r.event_id, r.name, r.ticket_type, r.last_out_at; RETURN;
  END IF;

  _state := r.attendance_state;
  _d := (_ts AT TIME ZONE COALESCE(ev.timezone, 'UTC'))::date;
  _rid := r.id;

  IF _state = 'inside' THEN
    INSERT INTO attendance_events(registration_id, event_id, event_day, kind, method, occurred_at)
    VALUES (_rid, r.event_id, _d, 'out', 'self', _ts);
    SELECT reg.* INTO r FROM registrations reg WHERE reg.id = _rid;
    RETURN QUERY SELECT 'ok'::text, r.id, r.event_id, r.name, r.ticket_type, r.last_out_at;
  ELSIF _state = 'outside' THEN
    RETURN QUERY SELECT 'already'::text, r.id, r.event_id, r.name, r.ticket_type, r.last_out_at;
  ELSE
    RETURN QUERY SELECT 'not_checked_in_yet'::text, r.id, r.event_id, r.name, r.ticket_type, NULL::timestamptz;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.self_check_out(text, uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.self_check_out(text, uuid) IS
  'Public self-check-out by QR / join token. Mirrors self_check_in with inverted semantics. `email` was REMOVED from the return shape for the same anon-disclosure reason.';
