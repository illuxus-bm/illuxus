-- ═══════════════════════════════════════════════════════════════════════════════
-- 040_utm_partner_access.sql
--
-- Partner UTM sharing: an organiser shares ONE tracked link (an event's
-- utm_source + utm_medium + utm_campaign) with an external partner (agency).
-- The partner gets a dashboard that shows — and can add to — only the
-- registrations attributed to that link.
--
-- Isolation model
--   • `utm_partner_access` has RLS enabled and NO client policies: the table
--     cannot be read or written directly. Everything goes through the
--     SECURITY DEFINER functions below.
--   • Partners get no RLS access to `registrations`, `utm_clicks`,
--     `utm_links` or `attendance_events`. Every partner function takes a
--     grant id, re-validates it on every call (must be the caller's own,
--     accepted, not revoked) and derives the event + link from the grant row —
--     never from caller-supplied event ids or UTM values.
--   • Per-grant permissions are enforced here, not in the UI: fields the
--     grant doesn't cover are returned as NULL and filters on them ignored.
--   • Organiser-only data (decline reasons, notes, payment, tokens, QR codes)
--     is never returned by any partner function.
--
-- Reuses: registrations (+ its validation trigger, which applies the event's
-- approval rule, and the unique email index for duplicates), check-in columns
-- on registrations, audit_logs, registrant_audit_log, app_notifications.
--
-- Idempotent — safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Who created a registration ───────────────────────────────────────────
ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.registrations.created_by IS
  'User who created the row on someone else''s behalf (e.g. a UTM partner). NULL for self-registrations and older rows.';

-- ── 2. Access grants ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.utm_partner_access (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  -- The shared link. Medium / campaign use '(none)' when absent, matching
  -- how event_utm_summary labels them.
  utm_source        text NOT NULL CHECK (btrim(utm_source) <> '' AND utm_source <> '(direct)'),
  utm_medium        text NOT NULL DEFAULT '(none)',
  utm_campaign      text NOT NULL DEFAULT '(none)',
  invited_email     text NOT NULL CHECK (invited_email = lower(btrim(invited_email)) AND position('@' in invited_email) > 1),
  partner_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Viewing the shared participants is implied by the grant itself.
  can_register      boolean NOT NULL DEFAULT false,
  can_view_approval boolean NOT NULL DEFAULT true,
  can_view_checkin  boolean NOT NULL DEFAULT true,
  can_export        boolean NOT NULL DEFAULT false,
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  granted_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at        timestamptz NOT NULL DEFAULT now(),
  accepted_at       timestamptz,
  revoked_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  -- One grant per partner per link.
  UNIQUE (event_id, utm_source, utm_medium, utm_campaign, invited_email)
);

CREATE INDEX IF NOT EXISTS idx_utm_partner_access_user  ON public.utm_partner_access(partner_user_id) WHERE status = 'accepted';
CREATE INDEX IF NOT EXISTS idx_utm_partner_access_email ON public.utm_partner_access(invited_email)   WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_utm_partner_access_event ON public.utm_partner_access(event_id);

DROP TRIGGER IF EXISTS update_utm_partner_access_updated_at ON public.utm_partner_access;
CREATE TRIGGER update_utm_partner_access_updated_at
  BEFORE UPDATE ON public.utm_partner_access
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS on, no policies: no direct client access at all.
ALTER TABLE public.utm_partner_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.utm_partner_access FROM PUBLIC, anon, authenticated;
GRANT  ALL ON public.utm_partner_access TO service_role;

-- ── 3. Internal helpers (not callable by clients) ───────────────────────────

-- Event creator, a member of its organisation, or a platform admin — the same
-- rule the UTM page and utm_links policies use.
CREATE OR REPLACE FUNCTION public._utm_partner_manages_event(_event_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = _event_id
      AND (
        e.user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
        OR public.is_org_member(auth.uid(), e.org_id)
      )
  );
$$;

-- The caller's own active grant, or an error. Missing, revoked, pending and
-- someone-else's grants are indistinguishable to the caller.
CREATE OR REPLACE FUNCTION public._utm_partner_grant(_access_id uuid)
RETURNS public.utm_partner_access
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g public.utm_partner_access;
BEGIN
  IF auth.uid() IS NOT NULL AND _access_id IS NOT NULL THEN
    SELECT a.* INTO g
      FROM public.utm_partner_access a
     WHERE a.id = _access_id
       AND a.partner_user_id = auth.uid()
       AND a.status = 'accepted';
  END IF;
  IF g.id IS NULL OR public.is_user_banned(auth.uid()) THEN
    RAISE EXCEPTION 'You don''t have access to this shared link' USING ERRCODE = '42501';
  END IF;
  RETURN g;
END;
$$;

-- Registration counts for one link of one event (cancelled rows excluded).
CREATE OR REPLACE FUNCTION public._utm_partner_stats(_event_id uuid, _source text, _medium text, _campaign text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'total',          count(*),
    'approved',       count(*) FILTER (WHERE r.approval_status = 'approved'),
    'pending',        count(*) FILTER (WHERE r.approval_status = 'pending'),
    'declined',       count(*) FILTER (WHERE r.approval_status = 'declined'),
    'waitlisted',     count(*) FILTER (WHERE r.approval_status = 'waitlisted'),
    'checked_in',     count(*) FILTER (WHERE r.checked_in),
    'not_checked_in', count(*) FILTER (WHERE NOT r.checked_in AND r.approval_status = 'approved')
  )
  FROM public.registrations r
  WHERE r.event_id   = _event_id
    AND r.status    <> 'cancelled'
    AND r.utm_source = _source
    AND coalesce(r.utm_medium,   '(none)') = _medium
    AND coalesce(r.utm_campaign, '(none)') = _campaign;
$$;

CREATE OR REPLACE FUNCTION public._utm_partner_audit(_action text, _access_id uuid, _details jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_logs(actor_id, actor_email, action, target_type, target_id, details)
  VALUES (
    auth.uid(),
    (SELECT u.email FROM auth.users u WHERE u.id = auth.uid()),
    _action, 'utm_partner_access', _access_id::text, coalesce(_details, '{}'::jsonb)
  );
EXCEPTION WHEN OTHERS THEN
  NULL; -- auditing must never break the operation it records
END;
$$;

CREATE OR REPLACE FUNCTION public._utm_partner_notify(_user_id uuid, _type text, _title text, _body text, _link text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _user_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.app_notifications(user_id, type, title, body, link)
  VALUES (_user_id, _type, _title, _body, _link);
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

-- What an organiser sees for one grant.
CREATE OR REPLACE FUNCTION public._utm_partner_row(a public.utm_partner_access)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'id', a.id, 'event_id', a.event_id,
    'utm_source', a.utm_source, 'utm_medium', a.utm_medium, 'utm_campaign', a.utm_campaign,
    'invited_email', a.invited_email,
    'partner_name', (SELECT p.display_name FROM public.profiles p WHERE p.user_id = a.partner_user_id),
    'can_register', a.can_register, 'can_view_approval', a.can_view_approval,
    'can_view_checkin', a.can_view_checkin, 'can_export', a.can_export,
    'status', a.status, 'granted_at', a.granted_at, 'accepted_at', a.accepted_at, 'revoked_at', a.revoked_at,
    'stats', public._utm_partner_stats(a.event_id, a.utm_source, a.utm_medium, a.utm_campaign),
    'registered_by_partner', (
      SELECT count(*) FROM public.registrations r
       WHERE a.partner_user_id IS NOT NULL
         AND r.created_by = a.partner_user_id
         AND r.event_id   = a.event_id
         AND r.status    <> 'cancelled'
         AND r.utm_source = a.utm_source
         AND coalesce(r.utm_medium,   '(none)') = a.utm_medium
         AND coalesce(r.utm_campaign, '(none)') = a.utm_campaign
    )
  );
$$;

-- ── 4. Organiser functions ──────────────────────────────────────────────────

-- Share a link with a partner (or update / re-activate an existing share).
CREATE OR REPLACE FUNCTION public.utm_partner_share(
  _event_id     uuid,
  _utm_source   text,
  _utm_medium   text,
  _utm_campaign text,
  _email        text,
  _permissions  jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email    text := lower(btrim(coalesce(_email, '')));
  v_source   text := btrim(coalesce(_utm_source, ''));
  v_medium   text := coalesce(nullif(btrim(coalesce(_utm_medium, '')), ''), '(none)');
  v_campaign text := coalesce(nullif(btrim(coalesce(_utm_campaign, '')), ''), '(none)');
  v_perms    jsonb := coalesce(_permissions, '{}'::jsonb);
  v_user     uuid;
  v_title    text;
  v_existing public.utm_partner_access;
  v_row      public.utm_partner_access;
  v_new      boolean := false;
BEGIN
  IF NOT public._utm_partner_manages_event(_event_id) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;
  IF v_source IN ('', '(direct)') THEN
    RAISE EXCEPTION 'Direct traffic is not a tracked link and can''t be shared' USING ERRCODE = '22023';
  END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(v_email) > 255 THEN
    RAISE EXCEPTION 'Enter a valid email address' USING ERRCODE = '22023';
  END IF;

  -- The link must belong to this event: saved, clicked or registered through.
  IF NOT (
    EXISTS (SELECT 1 FROM public.utm_links l
             WHERE l.event_id = _event_id AND l.utm_source = v_source
               AND l.utm_medium = v_medium AND l.utm_campaign = v_campaign)
    OR EXISTS (SELECT 1 FROM public.utm_clicks c
                WHERE c.event_id = _event_id AND c.utm_source = v_source
                  AND coalesce(c.utm_medium, '(none)') = v_medium AND coalesce(c.utm_campaign, '(none)') = v_campaign)
    OR EXISTS (SELECT 1 FROM public.registrations r
                WHERE r.event_id = _event_id AND r.utm_source = v_source
                  AND coalesce(r.utm_medium, '(none)') = v_medium AND coalesce(r.utm_campaign, '(none)') = v_campaign)
  ) THEN
    RAISE EXCEPTION 'That tracked link doesn''t exist for this event' USING ERRCODE = '22023';
  END IF;

  SELECT u.id INTO v_user FROM auth.users u
   WHERE lower(u.email) = v_email AND u.email_confirmed_at IS NOT NULL
   LIMIT 1;
  SELECT e.title INTO v_title FROM public.events e WHERE e.id = _event_id;

  SELECT a.* INTO v_existing FROM public.utm_partner_access a
   WHERE a.event_id = _event_id AND a.utm_source = v_source AND a.utm_medium = v_medium
     AND a.utm_campaign = v_campaign AND a.invited_email = v_email
   FOR UPDATE;

  IF v_existing.id IS NULL THEN
    v_new := true;
    INSERT INTO public.utm_partner_access(
      event_id, utm_source, utm_medium, utm_campaign, invited_email,
      can_register, can_view_approval, can_view_checkin, can_export, granted_by
    ) VALUES (
      _event_id, v_source, v_medium, v_campaign, v_email,
      coalesce((v_perms->>'can_register')::boolean, false),
      coalesce((v_perms->>'can_view_approval')::boolean, true),
      coalesce((v_perms->>'can_view_checkin')::boolean, true),
      coalesce((v_perms->>'can_export')::boolean, false),
      auth.uid()
    ) RETURNING * INTO v_row;
  ELSE
    UPDATE public.utm_partner_access a SET
      can_register      = coalesce((v_perms->>'can_register')::boolean,      a.can_register),
      can_view_approval = coalesce((v_perms->>'can_view_approval')::boolean, a.can_view_approval),
      can_view_checkin  = coalesce((v_perms->>'can_view_checkin')::boolean,  a.can_view_checkin),
      can_export        = coalesce((v_perms->>'can_export')::boolean,        a.can_export),
      -- Re-sharing after a revoke starts a fresh invitation.
      status          = CASE WHEN a.status = 'revoked' THEN 'pending' ELSE a.status END,
      partner_user_id = CASE WHEN a.status = 'revoked' THEN NULL      ELSE a.partner_user_id END,
      accepted_at     = CASE WHEN a.status = 'revoked' THEN NULL      ELSE a.accepted_at END,
      revoked_at      = NULL,
      granted_by      = CASE WHEN a.status = 'revoked' THEN auth.uid() ELSE a.granted_by END,
      granted_at      = CASE WHEN a.status = 'revoked' THEN now()      ELSE a.granted_at END
    WHERE a.id = v_existing.id
    RETURNING * INTO v_row;
    v_new := v_existing.status = 'revoked';
  END IF;

  IF v_new THEN
    PERFORM public._utm_partner_audit('utm_partner.invited', v_row.id, jsonb_build_object(
      'event_id', _event_id, 'utm_source', v_source, 'utm_medium', v_medium, 'utm_campaign', v_campaign,
      'email', v_email, 'permissions', v_perms));
    PERFORM public._utm_partner_notify(v_user, 'utm_partner_invite',
      'A tracked link was shared with you',
      'You can now see and manage registrations for ' || coalesce(v_title, 'an event') || '.',
      '/partner');
  ELSE
    PERFORM public._utm_partner_audit('utm_partner.permissions_changed', v_row.id, jsonb_build_object('permissions', v_perms));
  END IF;

  RETURN public._utm_partner_row(v_row) || jsonb_build_object('has_account', v_user IS NOT NULL, 'created', v_new, 'event_title', v_title);
END;
$$;

-- Every share of an event, with each partner's performance.
CREATE OR REPLACE FUNCTION public.utm_partner_list(_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._utm_partner_manages_event(_event_id) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(public._utm_partner_row(a) ORDER BY a.created_at DESC)
      FROM public.utm_partner_access a
     WHERE a.event_id = _event_id
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.utm_partner_update(_access_id uuid, _permissions jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_perms jsonb := coalesce(_permissions, '{}'::jsonb);
  v_row   public.utm_partner_access;
BEGIN
  SELECT a.* INTO v_row FROM public.utm_partner_access a WHERE a.id = _access_id;
  IF v_row.id IS NULL OR NOT public._utm_partner_manages_event(v_row.event_id) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;
  UPDATE public.utm_partner_access a SET
    can_register      = coalesce((v_perms->>'can_register')::boolean,      a.can_register),
    can_view_approval = coalesce((v_perms->>'can_view_approval')::boolean, a.can_view_approval),
    can_view_checkin  = coalesce((v_perms->>'can_view_checkin')::boolean,  a.can_view_checkin),
    can_export        = coalesce((v_perms->>'can_export')::boolean,        a.can_export)
  WHERE a.id = _access_id
  RETURNING * INTO v_row;
  PERFORM public._utm_partner_audit('utm_partner.permissions_changed', v_row.id, jsonb_build_object('permissions', v_perms));
  RETURN public._utm_partner_row(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.utm_partner_revoke(_access_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row   public.utm_partner_access;
  v_title text;
BEGIN
  SELECT a.* INTO v_row FROM public.utm_partner_access a WHERE a.id = _access_id;
  IF v_row.id IS NULL OR NOT public._utm_partner_manages_event(v_row.event_id) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;
  IF v_row.status <> 'revoked' THEN
    UPDATE public.utm_partner_access a
       SET status = 'revoked', revoked_at = now()
     WHERE a.id = _access_id
    RETURNING * INTO v_row;
    SELECT e.title INTO v_title FROM public.events e WHERE e.id = v_row.event_id;
    PERFORM public._utm_partner_audit('utm_partner.revoked', v_row.id, jsonb_build_object('email', v_row.invited_email));
    PERFORM public._utm_partner_notify(v_row.partner_user_id, 'utm_partner_revoked',
      'Access to a shared link was removed',
      'You no longer have partner access for ' || coalesce(v_title, 'an event') || '.', NULL);
  END IF;
  RETURN public._utm_partner_row(v_row);
END;
$$;

-- ── 5. Partner functions ────────────────────────────────────────────────────

-- Cheap check for the account menu. No side effects.
CREATE OR REPLACE FUNCTION public.partner_utm_has_access()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.utm_partner_access a
     WHERE (a.status = 'accepted' AND a.partner_user_id = auth.uid())
        OR (a.status = 'pending' AND a.invited_email = (
              SELECT lower(u.email) FROM auth.users u
               WHERE u.id = auth.uid() AND u.email_confirmed_at IS NOT NULL))
  );
$$;

-- The caller's shared links. Opening the dashboard accepts any invitation
-- addressed to the caller's verified email.
CREATE OR REPLACE FUNCTION public.partner_utm_grants()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_email text;
  r       record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501';
  END IF;
  IF public.is_user_banned(v_uid) THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT lower(u.email) INTO v_email FROM auth.users u
   WHERE u.id = v_uid AND u.email_confirmed_at IS NOT NULL;

  IF v_email IS NOT NULL THEN
    FOR r IN
      UPDATE public.utm_partner_access a
         SET status = 'accepted', partner_user_id = v_uid, accepted_at = now()
       WHERE a.status = 'pending' AND a.invited_email = v_email
      RETURNING a.id, a.granted_by, a.event_id
    LOOP
      PERFORM public._utm_partner_audit('utm_partner.accepted', r.id, jsonb_build_object('email', v_email));
      PERFORM public._utm_partner_notify(r.granted_by, 'utm_partner_accepted',
        'Partner invitation accepted', v_email || ' opened the link you shared.',
        '/dashboard/events/' || r.event_id::text);
    END LOOP;
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', a.id,
      'utm_source', a.utm_source, 'utm_medium', a.utm_medium, 'utm_campaign', a.utm_campaign,
      'label', (SELECT l.label FROM public.utm_links l
                 WHERE l.event_id = a.event_id AND l.utm_source = a.utm_source
                   AND l.utm_medium = a.utm_medium AND l.utm_campaign = a.utm_campaign),
      'link_url', (SELECT l.url FROM public.utm_links l
                    WHERE l.event_id = a.event_id AND l.utm_source = a.utm_source
                      AND l.utm_medium = a.utm_medium AND l.utm_campaign = a.utm_campaign),
      'can_register', a.can_register, 'can_view_approval', a.can_view_approval,
      'can_view_checkin', a.can_view_checkin, 'can_export', a.can_export,
      'event', jsonb_build_object(
        'title', e.title, 'date', e.date, 'end_date', e.end_date, 'timezone', e.timezone,
        'venue', e.venue, 'location', e.location, 'event_format', e.event_format,
        'status', e.status, 'requires_approval', e.requires_approval,
        'description', left(coalesce(e.description, ''), 600),
        'image_url', coalesce(e.banner_landscape_url, e.image_url),
        'organizer_name', (SELECT o.name FROM public.organizations o WHERE o.id = e.org_id)
      ),
      -- Counts cover this link only; parts the grant doesn't include are NULL.
      'stats', (
        SELECT jsonb_build_object(
          'total',          s->'total',
          'approved',       CASE WHEN a.can_view_approval THEN s->'approved'   END,
          'pending',        CASE WHEN a.can_view_approval THEN s->'pending'    END,
          'declined',       CASE WHEN a.can_view_approval THEN s->'declined'   END,
          'waitlisted',     CASE WHEN a.can_view_approval THEN s->'waitlisted' END,
          'checked_in',     CASE WHEN a.can_view_checkin  THEN s->'checked_in' END,
          'not_checked_in', CASE WHEN a.can_view_checkin AND a.can_view_approval THEN s->'not_checked_in' END
        )
        FROM (SELECT public._utm_partner_stats(a.event_id, a.utm_source, a.utm_medium, a.utm_campaign) AS s) x
      )
    ) ORDER BY e.date DESC, a.created_at DESC)
    FROM public.utm_partner_access a
    JOIN public.events e ON e.id = a.event_id
    WHERE a.partner_user_id = v_uid AND a.status = 'accepted'
  ), '[]'::jsonb);
END;
$$;

-- One page of the participants attributed to a shared link.
CREATE OR REPLACE FUNCTION public.partner_utm_participants(
  _access_id uuid,
  _search    text        DEFAULT NULL,
  _approval  text        DEFAULT NULL,   -- pending | approved | declined | waitlisted
  _checkin   text        DEFAULT NULL,   -- in | out
  _from      timestamptz DEFAULT NULL,
  _to        timestamptz DEFAULT NULL,
  _limit     int         DEFAULT 25,
  _offset    int         DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g          public.utm_partner_access := public._utm_partner_grant(_access_id);
  v_limit    int  := least(greatest(coalesce(_limit, 25), 1), 200);
  v_offset   int  := greatest(coalesce(_offset, 0), 0);
  v_search   text := nullif(btrim(coalesce(_search, '')), '');
  -- Filtering on a field the grant can't see would leak it through counts.
  v_approval text := CASE WHEN g.can_view_approval THEN nullif(_approval, '') END;
  v_checkin  text := CASE WHEN g.can_view_checkin  THEN nullif(_checkin, '')  END;
  v_result   jsonb;
BEGIN
  IF v_search IS NOT NULL THEN
    v_search := '%' || replace(replace(replace(left(v_search, 100), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;

  WITH scoped AS (
    SELECT r.*
      FROM public.registrations r
     WHERE r.event_id   = g.event_id
       AND r.status    <> 'cancelled'
       AND r.utm_source = g.utm_source
       AND coalesce(r.utm_medium,   '(none)') = g.utm_medium
       AND coalesce(r.utm_campaign, '(none)') = g.utm_campaign
  ), filtered AS (
    SELECT * FROM scoped s
     WHERE (v_search IS NULL
            OR s.name ILIKE v_search OR s.email ILIKE v_search
            OR coalesce(s.company, '') ILIKE v_search OR coalesce(s.designation, '') ILIKE v_search)
       AND (v_approval IS NULL OR s.approval_status = v_approval)
       AND (v_checkin IS NULL OR (v_checkin = 'in' AND s.checked_in) OR (v_checkin = 'out' AND NOT s.checked_in))
       AND (_from IS NULL OR s.created_at >= _from)
       AND (_to   IS NULL OR s.created_at <  _to)
  ), page AS (
    SELECT * FROM filtered ORDER BY created_at DESC, id LIMIT v_limit OFFSET v_offset
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM filtered),
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'email', p.email,
        'company', p.company, 'designation', p.designation,
        'registered_at', p.created_at,
        'added_by_you', p.created_by IS NOT NULL AND p.created_by = auth.uid(),
        'approval_status', CASE WHEN g.can_view_approval THEN p.approval_status END,
        'approved_at',     CASE WHEN g.can_view_approval THEN p.approved_at END,
        'checked_in',      CASE WHEN g.can_view_checkin  THEN p.checked_in END,
        'checked_in_at',   CASE WHEN g.can_view_checkin  THEN p.checked_in_at END
      ) ORDER BY p.created_at DESC, p.id)
      FROM page p), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Every participant of a shared link, for export. Needs the export permission.
CREATE OR REPLACE FUNCTION public.partner_utm_export(_access_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g        public.utm_partner_access := public._utm_partner_grant(_access_id);
  v_result jsonb;
BEGIN
  IF NOT g.can_export THEN
    RAISE EXCEPTION 'Export isn''t enabled for this shared link' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'name', r.name, 'email', r.email, 'company', r.company, 'designation', r.designation,
      'registered_at', r.created_at,
      'approval_status', CASE WHEN g.can_view_approval THEN r.approval_status END,
      'checked_in',      CASE WHEN g.can_view_checkin  THEN r.checked_in END,
      'checked_in_at',   CASE WHEN g.can_view_checkin  THEN r.checked_in_at END
    ) ORDER BY r.created_at DESC, r.id), '[]'::jsonb)
    INTO v_result
    FROM public.registrations r
   WHERE r.event_id   = g.event_id
     AND r.status    <> 'cancelled'
     AND r.utm_source = g.utm_source
     AND coalesce(r.utm_medium,   '(none)') = g.utm_medium
     AND coalesce(r.utm_campaign, '(none)') = g.utm_campaign;

  PERFORM public._utm_partner_audit('utm_partner.exported', g.id, jsonb_build_object('rows', jsonb_array_length(v_result)));
  RETURN v_result;
END;
$$;

-- Register a participant under a shared link. The event and the UTM values
-- come from the grant; nothing the caller sends can change them.
CREATE OR REPLACE FUNCTION public.partner_utm_register(_access_id uuid, _person jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g        public.utm_partner_access := public._utm_partner_grant(_access_id);
  p        jsonb := coalesce(_person, '{}'::jsonb);
  e        public.events;
  v_first  text := btrim(coalesce(p->>'first_name', ''));
  v_last   text := btrim(coalesce(p->>'last_name', ''));
  v_email  text := lower(btrim(coalesce(p->>'email', '')));
  v_company text := btrim(coalesce(p->>'company', ''));
  v_desig  text := btrim(coalesce(p->>'designation', ''));
  v_cc     text := btrim(coalesce(p->>'mobile_country_code', ''));
  v_mobile text := btrim(coalesce(p->>'mobile_number', ''));
  v_going  int;
  v_reg    public.registrations;
BEGIN
  IF NOT g.can_register THEN
    RAISE EXCEPTION 'Registering participants isn''t enabled for this shared link' USING ERRCODE = '42501';
  END IF;

  SELECT ev.* INTO e FROM public.events ev WHERE ev.id = g.event_id;
  IF e.status <> 'published' THEN
    RAISE EXCEPTION 'Registration isn''t open for this event' USING ERRCODE = 'P0001';
  END IF;
  IF coalesce(e.end_date, e.date) < now() THEN
    RAISE EXCEPTION 'Registration for this event has closed' USING ERRCODE = 'P0001';
  END IF;
  IF coalesce(e.price, 0) > 0 THEN
    RAISE EXCEPTION 'This is a paid event — share your tracked link so participants can buy a ticket' USING ERRCODE = 'P0001';
  END IF;

  IF v_first = '' OR v_last = '' OR length(v_first) > 80 OR length(v_last) > 80 THEN
    RAISE EXCEPTION 'First and last name are required' USING ERRCODE = '22023';
  END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(v_email) > 255 THEN
    RAISE EXCEPTION 'Enter a valid email address' USING ERRCODE = '22023';
  END IF;
  IF v_company = '' OR length(v_company) > 160 THEN
    RAISE EXCEPTION 'Company is required' USING ERRCODE = '22023';
  END IF;
  IF v_desig = '' OR length(v_desig) > 120 THEN
    RAISE EXCEPTION 'Designation is required' USING ERRCODE = '22023';
  END IF;
  IF v_cc !~ '^\+\d{1,4}$' OR v_mobile !~ '^\d{6,15}$' THEN
    RAISE EXCEPTION 'Enter a valid mobile number' USING ERRCODE = '22023';
  END IF;

  -- Abuse guard: one partner account, at most 300 registrations an hour.
  IF (SELECT count(*) FROM public.registrations r
       WHERE r.created_by = auth.uid() AND r.created_at > now() - interval '1 hour') >= 300 THEN
    RAISE EXCEPTION 'Too many registrations in a short time — please try again later' USING ERRCODE = 'P0001';
  END IF;

  -- Serialise capacity + duplicate checks per event.
  PERFORM pg_advisory_xact_lock(hashtext('partner_utm_register:' || g.event_id::text));

  IF EXISTS (SELECT 1 FROM public.registrations r
              WHERE r.event_id = g.event_id AND lower(r.email) = v_email AND r.status <> 'cancelled') THEN
    RAISE EXCEPTION 'This email is already registered for the event' USING ERRCODE = '23505';
  END IF;

  IF coalesce(e.capacity, 0) > 0 THEN
    SELECT count(*) INTO v_going FROM public.registrations r
     WHERE r.event_id = g.event_id AND r.status <> 'cancelled'
       AND r.approval_status NOT IN ('declined', 'waitlisted');
    IF v_going >= e.capacity THEN
      RAISE EXCEPTION 'This event is full' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  BEGIN
    -- approval_status: the registrations_validate trigger turns this into
    -- 'pending' when the event requires approval (a partner is not an organiser).
    INSERT INTO public.registrations(
      event_id, user_id, name, email, title, first_name, last_name, company, designation,
      mobile_country_code, mobile_number, linkedin_url, company_website, company_employee_count, industry,
      ticket_type, status, approval_status,
      utm_source, utm_medium, utm_campaign, created_by
    ) VALUES (
      g.event_id, NULL, btrim(v_first || ' ' || v_last), v_email,
      nullif(btrim(coalesce(p->>'title', '')), ''), v_first, v_last, v_company, v_desig,
      v_cc, v_mobile,
      nullif(left(btrim(coalesce(p->>'linkedin_url', '')), 255), ''),
      nullif(left(btrim(coalesce(p->>'company_website', '')), 255), ''),
      nullif(btrim(coalesce(p->>'company_employee_count', '')), ''),
      nullif(btrim(coalesce(p->>'industry', '')), ''),
      CASE WHEN e.event_format = 'virtual' THEN 'webinar' ELSE 'general' END,
      'confirmed', 'approved',
      g.utm_source, nullif(g.utm_medium, '(none)'), nullif(g.utm_campaign, '(none)'), auth.uid()
    ) RETURNING * INTO v_reg;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'This email is already registered for the event' USING ERRCODE = '23505';
  END;

  PERFORM public.log_registrant_action('partner_registered', v_reg.id,
    jsonb_build_object('partner_access_id', g.id, 'utm_source', g.utm_source));
  PERFORM public._utm_partner_audit('utm_partner.registered', g.id, jsonb_build_object('registration_id', v_reg.id));

  RETURN jsonb_build_object(
    'id', v_reg.id, 'name', v_reg.name, 'email', v_reg.email,
    'approval_status', CASE WHEN g.can_view_approval THEN v_reg.approval_status END
  );
END;
$$;

-- ── 6. Grants ───────────────────────────────────────────────────────────────
DO $$
DECLARE
  fn text;
BEGIN
  -- Internal helpers: service role only.
  FOREACH fn IN ARRAY ARRAY[
    '_utm_partner_manages_event(uuid)',
    '_utm_partner_grant(uuid)',
    '_utm_partner_stats(uuid, text, text, text)',
    '_utm_partner_audit(text, uuid, jsonb)',
    '_utm_partner_notify(uuid, text, text, text, text)',
    '_utm_partner_row(public.utm_partner_access)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', fn);
  END LOOP;

  -- Client-callable: signed-in users only.
  FOREACH fn IN ARRAY ARRAY[
    'utm_partner_share(uuid, text, text, text, text, jsonb)',
    'utm_partner_list(uuid)',
    'utm_partner_update(uuid, jsonb)',
    'utm_partner_revoke(uuid)',
    'partner_utm_has_access()',
    'partner_utm_grants()',
    'partner_utm_participants(uuid, text, text, text, timestamptz, timestamptz, int, int)',
    'partner_utm_export(uuid)',
    'partner_utm_register(uuid, jsonb)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', fn);
  END LOOP;
END $$;

COMMENT ON TABLE public.utm_partner_access IS
  'An organiser''s share of one tracked link (event + utm_source/medium/campaign) with an external partner. No direct client access — use the utm_partner_* (organiser) and partner_utm_* (partner) functions.';

NOTIFY pgrst, 'reload schema';
