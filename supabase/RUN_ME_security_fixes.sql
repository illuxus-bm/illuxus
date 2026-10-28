-- ═══════════════════════════════════════════════════════════════════════════════
-- Security fixes from the 2026-10-27 review (SECURITY-REVIEW.md).
--
-- One section per finding. Every statement is safe to run more than once.
-- Paste the whole file into the Supabase SQL Editor and Run.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────────
-- F-01 — Paid events issued approved tickets without payment.
--
-- There is no online checkout, so a paid event's place now waits for the
-- organiser to confirm payment: self-serve registrations for a priced event
-- are 'pending', and the ticket (QR) is only issued once the organiser
-- approves. Organisers adding people themselves keep the status they choose.
--
-- Every registration that does not come from an organiser — an attendee's
-- own insert through the API, the guest-registration function, a partner's
-- tracked link — is now checked here, in the database, rather than trusted:
--   • the event must be published;
--   • capacity is enforced (a full event waitlists), serialised per event;
--   • payment, check-in and approval fields cannot be set by the registrant.
-- A direct insert by a signed-in attendee can only register themselves.
-- ───────────────────────────────────────────────────────────────────────────────

-- Seats taken, counted past row security (an attendee only sees their own rows).
CREATE OR REPLACE FUNCTION public._event_seats_taken(_event_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int
    FROM registrations r
   WHERE r.event_id = _event_id
     AND r.status <> 'cancelled'
     AND COALESCE(r.approval_status, 'approved') NOT IN ('declined', 'waitlisted');
$$;
-- Called from the registration trigger, which runs as the inserting role.
-- The count is what the public event page already shows.
REVOKE ALL ON FUNCTION public._event_seats_taken(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._event_seats_taken(uuid) TO authenticated, service_role;

-- The signed-in user's own address, for pinning their self-registration to it.
CREATE OR REPLACE FUNCTION public._auth_user_email()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT lower(email) FROM auth.users WHERE id = auth.uid();
$$;
-- Returns only the caller's own address.
REVOKE ALL ON FUNCTION public._auth_user_email() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._auth_user_email() TO authenticated, service_role;

-- Not SECURITY DEFINER on purpose: `current_user` must stay the caller's role
-- so a direct API insert ('authenticated') can be told from a trusted server
-- path (service_role, or a SECURITY DEFINER function such as the partner RPC).
CREATE OR REPLACE FUNCTION public.registrations_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public','extensions'
AS $$
DECLARE
  _ra            boolean;
  _p             numeric;
  _cap           integer;
  _event_status  text;
  _is_organiser  boolean;
BEGIN
  SELECT requires_approval, COALESCE(price, 0), COALESCE(capacity, 0), status
    INTO _ra, _p, _cap, _event_status
    FROM events
   WHERE id = NEW.event_id;

  -- Is the actor an organiser? Event owner, super admin, or org member.
  _is_organiser := EXISTS (
    SELECT 1 FROM events e
    WHERE e.id = NEW.event_id
      AND (
        e.user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
        OR (e.org_id IS NOT NULL AND public.is_org_member(auth.uid(), e.org_id))
      )
  );

  IF TG_OP = 'INSERT' AND NOT _is_organiser THEN
    IF _event_status IS DISTINCT FROM 'published' THEN
      RAISE EXCEPTION 'This event is not open for registration' USING ERRCODE = '42501';
    END IF;

    -- A direct API insert registers the signed-in attendee, nobody else.
    IF current_user IN ('authenticated', 'anon') THEN
      IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Sign in to register' USING ERRCODE = '42501';
      END IF;
      NEW.user_id := auth.uid();
      NEW.email := COALESCE(public._auth_user_email(), lower(NEW.email));
      NEW.created_by := NULL;   -- only set when someone registers another person
      NEW.join_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
      NEW.qr_code := NULL;
    END IF;

    -- Only the organiser records payment, check-in and approval.
    NEW.amount_paid       := 0;
    NEW.checked_in        := false;
    NEW.checked_in_at     := NULL;
    NEW.checked_in_method := NULL;
    NEW.attendance_state  := 'never';
    NEW.approved_by       := NULL;
    NEW.approved_at       := NULL;

    -- One sign-up at a time per event, so two people can't take the last seat.
    PERFORM pg_advisory_xact_lock(hashtext('registrations_capacity:' || NEW.event_id::text));
    IF _cap > 0 AND public._event_seats_taken(NEW.event_id) >= _cap THEN
      NEW.approval_status := 'waitlisted';
    ELSIF _p > 0 OR _ra THEN
      -- Paid: waits for the organiser to confirm payment (no online checkout).
      NEW.approval_status := 'pending';
    ELSE
      NEW.approval_status := 'approved';
    END IF;
  END IF;

  IF NEW.approval_status NOT IN ('pending', 'approved', 'waitlisted', 'declined') THEN
    RAISE EXCEPTION 'Invalid approval_status';
  END IF;

  IF NEW.qr_code IS NULL THEN
    NEW.qr_code := substring(
      replace(gen_random_uuid()::text, '-', '') ||
      replace(gen_random_uuid()::text, '-', '')
      FROM 1 FOR 24
    );
  END IF;

  RETURN NEW;
END;
$$;


-- ───────────────────────────────────────────────────────────────────────────────
-- F-02 — Login "2FA" did not gate the session.
--
-- Two-factor sign-in now uses Supabase MFA (authenticator app). Signing in
-- with the password gives an `aal1` session; the code upgrades it to `aal2`.
-- For anyone who has two-factor on, an `aal1` session is refused here, in
-- the database, so skipping the code screen gets nothing:
--   • every API request (tables, views and RPC functions — including
--     SECURITY DEFINER ones, which row security doesn't reach) goes through
--     a PostgREST pre-request check;
--   • every table with row security also gets a RESTRICTIVE policy, which
--     covers realtime subscriptions and any path that bypasses the API.
-- Users without two-factor are unaffected.
--
-- Tables created later need the policy too: re-run this section, or add it.
-- The edge functions apply the same rule (supabase/functions/_shared/auth.ts).
-- ───────────────────────────────────────────────────────────────────────────────

-- True unless the caller has two-factor on and this session hasn't given the code.
CREATE OR REPLACE FUNCTION public.mfa_satisfied()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NULL
      OR COALESCE(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      OR NOT EXISTS (
           SELECT 1 FROM auth.mfa_factors f
            WHERE f.user_id = auth.uid() AND f.status = 'verified'
         );
$$;
REVOKE ALL ON FUNCTION public.mfa_satisfied() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mfa_satisfied() TO anon, authenticated, service_role;

-- Runs before every PostgREST request.
CREATE OR REPLACE FUNCTION public.require_second_factor()
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.mfa_satisfied() THEN
    RAISE EXCEPTION 'Two-factor verification required'
      USING ERRCODE = '42501', HINT = 'Enter the code from your authenticator app to continue.';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.require_second_factor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.require_second_factor() TO anon, authenticated, service_role;

ALTER ROLE authenticator SET pgrst.db_pre_request TO 'public.require_second_factor';
NOTIFY pgrst, 'reload config';

-- The same rule on every table that has row security.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relrowsecurity
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Require two-factor when enabled" ON public.%I', t.relname);
    EXECUTE format(
      'CREATE POLICY "Require two-factor when enabled" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING ((SELECT public.mfa_satisfied())) WITH CHECK ((SELECT public.mfa_satisfied()))',
      t.relname
    );
  END LOOP;
END;
$$;


-- ───────────────────────────────────────────────────────────────────────────────
-- F-05 — Anyone could read and forge webinar reactions.
--
-- Reactions are now posted only through webinar_react(), which checks the
-- reactor belongs to the session — a signed-in attendee, organiser or
-- speaker, or a guest holding a valid join link / speaker link — accepts
-- only the emoji the app offers, and allows at most 10 a person per 10s.
-- Nobody can insert, edit or delete rows directly any more.
--
-- Reading: anonymous live viewers still receive reactions (the floating
-- emoji), but only id/session/emoji/time — never who reacted. Signed-in
-- users read full rows for sessions they take part in, and their own.
-- ───────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.webinar_react(
  _session_id    uuid,
  _emoji         text,
  _join_token    text DEFAULT NULL,
  _speaker_token text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _event  uuid;
  _who    uuid;
  _recent integer;
BEGIN
  IF _emoji IS NULL OR NOT (_emoji = ANY (ARRAY['👏', '❤️', '🔥', '😂', '🎉', '👍'])) THEN
    RAISE EXCEPTION 'Unsupported reaction' USING ERRCODE = '22023';
  END IF;

  SELECT event_id INTO _event FROM webinar_sessions WHERE id = _session_id;
  IF _event IS NULL THEN
    RAISE EXCEPTION 'Session not found' USING ERRCODE = 'P0002';
  END IF;

  -- Who is reacting, and do they belong to this session?
  IF auth.uid() IS NOT NULL AND (
       public.is_event_approved_attendee(auth.uid(), _event)
    OR public.is_event_speaker(auth.uid(), _event)
    OR EXISTS (
         SELECT 1 FROM events e
          WHERE e.id = _event
            AND (e.user_id = auth.uid()
                 OR public.has_role(auth.uid(), 'admin')
                 OR (e.org_id IS NOT NULL AND public.is_org_member(auth.uid(), e.org_id)))
       )
  ) THEN
    _who := auth.uid();
  ELSIF _join_token IS NOT NULL THEN
    SELECT r.id INTO _who
      FROM registrations r
     WHERE r.join_token = _join_token
       AND r.event_id = _event
       AND r.status <> 'cancelled'
       AND r.approval_status = 'approved';
  ELSIF _speaker_token IS NOT NULL THEN
    SELECT ws.id INTO _who
      FROM webinar_speakers ws
     WHERE ws.invite_token = _speaker_token AND ws.session_id = _session_id;
  END IF;

  IF _who IS NULL THEN
    RAISE EXCEPTION 'Only this session''s attendees can react' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO _recent
    FROM webinar_reactions
   WHERE session_id = _session_id AND user_id = _who AND created_at > now() - interval '10 seconds';
  IF _recent >= 10 THEN
    RAISE EXCEPTION 'Too many reactions — slow down a little' USING ERRCODE = '54000';
  END IF;

  INSERT INTO webinar_reactions (session_id, user_id, emoji) VALUES (_session_id, _who, _emoji);
END;
$$;
REVOKE ALL ON FUNCTION public.webinar_react(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.webinar_react(uuid, text, text, text) TO anon, authenticated;

-- No direct writes.
DROP POLICY IF EXISTS "Post reactions" ON public.webinar_reactions;
REVOKE INSERT, UPDATE, DELETE ON public.webinar_reactions FROM anon, authenticated;

-- Anonymous viewers: the reaction, never who sent it.
REVOKE SELECT ON public.webinar_reactions FROM anon;
GRANT SELECT (id, session_id, emoji, created_at) ON public.webinar_reactions TO anon;

DROP POLICY IF EXISTS "Read reactions" ON public.webinar_reactions;
DROP POLICY IF EXISTS "Guests see reactions" ON public.webinar_reactions;
CREATE POLICY "Guests see reactions" ON public.webinar_reactions
  FOR SELECT TO anon USING (true);
CREATE POLICY "Read reactions" ON public.webinar_reactions
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM webinar_sessions s
       WHERE s.id = session_id
         AND (public.is_event_approved_attendee(auth.uid(), s.event_id)
              OR public.is_event_owner(auth.uid(), s.event_id)
              OR public.is_event_speaker(auth.uid(), s.event_id))
    )
  );


-- ───────────────────────────────────────────────────────────────────────────────
-- F-06 — Unpublished site-editor drafts were readable by anyone.
--
-- The public site reads only `section, content`. Everyone may now read just
-- the published columns; `draft_content` is reachable only through
-- get_site_drafts(), which only platform admins can call (the site editor
-- uses it). Saving and publishing already go through admin-only functions.
-- ───────────────────────────────────────────────────────────────────────────────

REVOKE SELECT ON public.site_content FROM anon, authenticated;
GRANT SELECT (id, section, content, published_at, created_at, updated_at) ON public.site_content TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_site_drafts()
RETURNS TABLE (section text, content jsonb, draft_content jsonb, published_at timestamptz, updated_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT sc.section, sc.content, sc.draft_content, sc.published_at, sc.updated_at
      FROM public.site_content sc;
END;
$$;
REVOKE ALL ON FUNCTION public.get_site_drafts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_site_drafts() TO authenticated;


-- ───────────────────────────────────────────────────────────────────────────────
-- F-08 — Any signed-in user could create a community for someone else's event.
--
-- ensure_event_community() is only meant for the events triggers, which run
-- as the table owner and honour the event's `create_community` setting. The
-- app never calls it, so users lose the right to: the triggers keep working.
-- ───────────────────────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.ensure_event_community(uuid) FROM PUBLIC, anon, authenticated;
