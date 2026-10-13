-- ═══════════════════════════════════════════════════════════════════════════════
-- 047_certificates.sql
--
-- Event certificates: an editable template studio, immutable published
-- versions, issuing to an event's attendees, public verification, revocation
-- and an audit trail.
--
--   1. Helpers  can_manage_org_certificates / can_manage_event_certificates —
--      the same people who manage an event's registrations: the event's
--      creator, the workspace owner, non-viewer workspace members, and
--      platform admins.
--   2. certificate_templates  — a workspace's designs (editable configuration,
--      not pictures). Optionally tied to the event they were made for.
--   3. certificate_template_versions — a frozen copy made each time a template
--      is published. Certificates point at a version, so editing a template
--      never changes a certificate that was already issued. No one can edit
--      or delete a version.
--   4. certificates — one per attendee per event. Holds the values printed on
--      it (name, event, dates…) as they were when issued, and a random
--      verification code used by the QR code.
--   5. certificate_audit — issued / revoked / emailed, with who and when.
--   6. Functions: publish_certificate_template, issue_certificates (audience
--      'all' registered attendees or only 'checked_in' ones),
--      revoke_certificate, record_certificate_emails, and the public
--      get_certificate_public for the verification page.
--
-- Browsers write templates directly (RLS). Versions, certificates and the
-- audit log are written only by the functions above.
--
-- Idempotent — safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Helpers ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_manage_org_certificates(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND _org_id IS NOT NULL AND (
       EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = _org_id AND o.owner_id = _user_id)
    OR EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = _org_id AND m.user_id = _user_id AND m.role IN ('owner', 'admin', 'member'))
    OR public.has_role(_user_id, 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_event_certificates(_user_id uuid, _event_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.events e
     WHERE e.id = _event_id
       AND (e.user_id = _user_id
            OR public.can_manage_org_certificates(_user_id, e.org_id)
            OR public.has_role(_user_id, 'admin'))
  );
$$;

REVOKE EXECUTE ON FUNCTION public.can_manage_org_certificates(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_event_certificates(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.can_manage_org_certificates(uuid, uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.can_manage_event_certificates(uuid, uuid) TO authenticated;


-- ── 2. Templates ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.certificate_templates (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_id             uuid REFERENCES public.events(id) ON DELETE SET NULL,
  name                 text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  category             text,
  orientation          text NOT NULL DEFAULT 'landscape' CHECK (orientation IN ('landscape', 'portrait')),
  source_template      text,
  design               jsonb NOT NULL,
  settings             jsonb NOT NULL DEFAULT '{}'::jsonb,
  status               text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  current_version      int  NOT NULL DEFAULT 0,
  published_version_id uuid,
  published_at         timestamptz,
  created_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  -- Uploaded backgrounds and signatures travel inside the design; keep rows sane.
  CONSTRAINT certificate_templates_design_size CHECK (octet_length(design::text) + octet_length(settings::text) <= 15000000)
);

CREATE INDEX IF NOT EXISTS certificate_templates_org_idx ON public.certificate_templates (org_id, status, updated_at DESC);

ALTER TABLE public.certificate_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.certificate_templates FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.certificate_templates TO authenticated;
GRANT ALL ON public.certificate_templates TO service_role;

DROP POLICY IF EXISTS "Workspace members view certificate templates" ON public.certificate_templates;
CREATE POLICY "Workspace members view certificate templates" ON public.certificate_templates
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id) OR public.can_manage_org_certificates(auth.uid(), org_id));

DROP POLICY IF EXISTS "Managers create certificate templates" ON public.certificate_templates;
CREATE POLICY "Managers create certificate templates" ON public.certificate_templates
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_org_certificates(auth.uid(), org_id)
    AND (event_id IS NULL OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.org_id = certificate_templates.org_id))
  );

DROP POLICY IF EXISTS "Managers edit certificate templates" ON public.certificate_templates;
CREATE POLICY "Managers edit certificate templates" ON public.certificate_templates
  FOR UPDATE TO authenticated
  USING (public.can_manage_org_certificates(auth.uid(), org_id))
  WITH CHECK (
    public.can_manage_org_certificates(auth.uid(), org_id)
    AND (event_id IS NULL OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.org_id = certificate_templates.org_id))
  );

-- Browsers may draft, edit and archive. Publishing, version numbers and the
-- workspace a template belongs to are the server's to set.
CREATE OR REPLACE FUNCTION public.certificate_templates_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Server code (service_role, and publish_certificate_template below, which
  -- sets this flag for its own transaction) sets the publishing fields itself.
  IF auth.uid() IS NULL OR current_setting('illuxus.certificate_publish', true) = 'on' THEN
    RETURN NEW;
  END IF;
  NEW.updated_at := now();
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
    NEW.status := CASE WHEN NEW.status = 'archived' THEN 'archived' ELSE 'draft' END;
    NEW.current_version := 0;
    NEW.published_version_id := NULL;
    NEW.published_at := NULL;
  ELSE
    NEW.org_id := OLD.org_id;
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
    NEW.current_version := OLD.current_version;
    NEW.published_version_id := OLD.published_version_id;
    NEW.published_at := OLD.published_at;
    -- Archiving and un-archiving are allowed; becoming 'published' is not.
    IF NEW.status = 'published' AND OLD.status <> 'published' THEN
      NEW.status := CASE WHEN OLD.published_version_id IS NOT NULL THEN 'published' ELSE 'draft' END;
    END IF;
    IF NEW.status = 'draft' AND OLD.published_version_id IS NOT NULL THEN
      NEW.status := 'published';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS certificate_templates_guard ON public.certificate_templates;
CREATE TRIGGER certificate_templates_guard
  BEFORE INSERT OR UPDATE ON public.certificate_templates
  FOR EACH ROW EXECUTE FUNCTION public.certificate_templates_guard();


-- ── 3. Versions ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.certificate_template_versions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  uuid NOT NULL REFERENCES public.certificate_templates(id) ON DELETE RESTRICT,
  org_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  version      int  NOT NULL,
  name         text NOT NULL,
  design       jsonb NOT NULL,
  settings     jsonb NOT NULL,
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version)
);

ALTER TABLE public.certificate_template_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.certificate_template_versions FROM anon, authenticated;
GRANT SELECT ON public.certificate_template_versions TO authenticated;
GRANT ALL ON public.certificate_template_versions TO service_role;

DROP POLICY IF EXISTS "Workspace members view certificate versions" ON public.certificate_template_versions;
CREATE POLICY "Workspace members view certificate versions" ON public.certificate_template_versions
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id) OR public.can_manage_org_certificates(auth.uid(), org_id));


-- ── 4. Certificates ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.certificates (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  org_id              uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  registration_id     uuid REFERENCES public.registrations(id) ON DELETE SET NULL,
  template_version_id uuid NOT NULL REFERENCES public.certificate_template_versions(id) ON DELETE RESTRICT,
  code                text NOT NULL UNIQUE,
  recipient_name      text NOT NULL,
  recipient_email     text,
  field_values        jsonb NOT NULL DEFAULT '{}'::jsonb,
  status              text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'revoked')),
  issued_at           timestamptz NOT NULL DEFAULT now(),
  issued_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at          timestamptz,
  revoked_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_reason      text,
  emailed_at          timestamptz,
  email_count         int NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS certificates_one_per_registration
  ON public.certificates (event_id, registration_id) WHERE status = 'issued' AND registration_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS certificates_event_idx ON public.certificates (event_id, issued_at DESC);

ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.certificates FROM anon, authenticated;
GRANT SELECT ON public.certificates TO authenticated;
GRANT ALL ON public.certificates TO service_role;

DROP POLICY IF EXISTS "Event managers view certificates" ON public.certificates;
CREATE POLICY "Event managers view certificates" ON public.certificates
  FOR SELECT TO authenticated
  USING (public.can_manage_event_certificates(auth.uid(), event_id));


-- ── 5. Audit ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.certificate_audit (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  certificate_id uuid REFERENCES public.certificates(id) ON DELETE CASCADE,
  event_id       uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  action         text NOT NULL CHECK (action IN ('issued', 'revoked', 'emailed', 'template_published')),
  actor          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  detail         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS certificate_audit_event_idx ON public.certificate_audit (event_id, created_at DESC);

ALTER TABLE public.certificate_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.certificate_audit FROM anon, authenticated;
GRANT SELECT ON public.certificate_audit TO authenticated;
GRANT ALL ON public.certificate_audit TO service_role;

DROP POLICY IF EXISTS "Event managers view certificate audit" ON public.certificate_audit;
CREATE POLICY "Event managers view certificate audit" ON public.certificate_audit
  FOR SELECT TO authenticated
  USING (public.can_manage_event_certificates(auth.uid(), event_id));


-- ── 6a. Publish ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.publish_certificate_template(_template_id uuid)
RETURNS TABLE (version_id uuid, version int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  tpl      record;
  _bad     text;
  _next    int;
  _vid     uuid;
  _allowed text[] := ARRAY['participant_name','event_name','event_date','certificate_type','issue_date','certificate_id',
                           'organization_name','participant_designation','participant_company','ticket_type','event_venue'];
BEGIN
  SELECT * INTO tpl FROM public.certificate_templates t WHERE t.id = _template_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Template not found'; END IF;
  IF NOT public.can_manage_org_certificates(auth.uid(), tpl.org_id) THEN
    RAISE EXCEPTION 'You do not have permission to publish certificate templates for this workspace' USING ERRCODE = '42501';
  END IF;
  IF tpl.status = 'archived' THEN RAISE EXCEPTION 'Restore this template before publishing it'; END IF;

  IF jsonb_typeof(tpl.design->'pages') <> 'array' OR jsonb_array_length(tpl.design->'pages') < 1 THEN
    RAISE EXCEPTION 'This template has no page';
  END IF;
  IF tpl.design::text !~ '\{\{\s*participant_name\s*\}\}' THEN
    RAISE EXCEPTION 'Add the participant name field before publishing';
  END IF;
  SELECT m[1] INTO _bad
    FROM regexp_matches(tpl.design::text, '\{\{\s*([A-Za-z0-9_]+)\s*\}\}', 'g') AS m
   WHERE NOT (m[1] = ANY (_allowed))
   LIMIT 1;
  IF _bad IS NOT NULL THEN RAISE EXCEPTION 'Unknown field {{%}} in the template', _bad; END IF;

  IF jsonb_typeof(tpl.settings->'signatures') = 'array' THEN
    IF jsonb_array_length(tpl.settings->'signatures') > 3 THEN
      RAISE EXCEPTION 'A certificate can have at most three signatures';
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(tpl.settings->'signatures') s
       WHERE (s->>'enabled')::boolean IS TRUE AND btrim(coalesce(s->>'name', '')) = ''
    ) THEN
      RAISE EXCEPTION 'Every signature that is switched on needs the signatory''s name';
    END IF;
  END IF;

  _next := tpl.current_version + 1;
  INSERT INTO public.certificate_template_versions (template_id, org_id, version, name, design, settings, published_by)
       VALUES (tpl.id, tpl.org_id, _next, tpl.name, tpl.design, tpl.settings, auth.uid())
    RETURNING id INTO _vid;

  PERFORM set_config('illuxus.certificate_publish', 'on', true);
  UPDATE public.certificate_templates
     SET status = 'published', current_version = _next, published_version_id = _vid, published_at = now(), updated_at = now()
   WHERE id = tpl.id;
  PERFORM set_config('illuxus.certificate_publish', 'off', true);

  IF tpl.event_id IS NOT NULL THEN
    INSERT INTO public.certificate_audit (event_id, action, actor, detail)
         VALUES (tpl.event_id, 'template_published', auth.uid(), jsonb_build_object('template_id', tpl.id, 'version', _next));
  END IF;

  version_id := _vid;
  version := _next;
  RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.publish_certificate_template(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.publish_certificate_template(uuid) TO authenticated;


-- ── 6b. Issue ────────────────────────────────────────────────────────────────
-- Dates as "14 November 2026" / "14–15 November 2026" in the event's time zone.
CREATE OR REPLACE FUNCTION public.certificate_date_text(_start timestamptz, _end timestamptz, _tz text)
RETURNS text
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  z  text := coalesce(nullif(_tz, ''), 'UTC');
  s  timestamp;
  e  timestamp;
BEGIN
  IF _start IS NULL THEN RETURN ''; END IF;
  BEGIN
    s := _start AT TIME ZONE z;
    e := coalesce(_end, _start) AT TIME ZONE z;
  EXCEPTION WHEN OTHERS THEN
    s := _start AT TIME ZONE 'UTC';
    e := coalesce(_end, _start) AT TIME ZONE 'UTC';
  END;
  IF s::date = e::date THEN RETURN to_char(s, 'FMDD FMMonth YYYY'); END IF;
  IF to_char(s, 'YYYY-MM') = to_char(e, 'YYYY-MM') THEN RETURN to_char(s, 'FMDD') || '–' || to_char(e, 'FMDD FMMonth YYYY'); END IF;
  IF to_char(s, 'YYYY') = to_char(e, 'YYYY') THEN RETURN to_char(s, 'FMDD FMMonth') || ' – ' || to_char(e, 'FMDD FMMonth YYYY'); END IF;
  RETURN to_char(s, 'FMDD FMMonth YYYY') || ' – ' || to_char(e, 'FMDD FMMonth YYYY');
END;
$$;

CREATE OR REPLACE FUNCTION public.new_certificate_code()
RETURNS text
LANGUAGE sql VOLATILE SET search_path = public AS $$
  -- 48 random bits (the first 12 hex digits of a v4 uuid are all random).
  SELECT 'ILX-' || substr(h, 1, 4) || '-' || substr(h, 5, 4) || '-' || substr(h, 9, 4)
    FROM (SELECT upper(replace(gen_random_uuid()::text, '-', '')) AS h) x;
$$;

CREATE OR REPLACE FUNCTION public.issue_certificates(
  _event_id         uuid,
  _version_id       uuid,
  _audience         text,
  _registration_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (certificate_id uuid, registration_id uuid, code text, created boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ev      record;
  ver     record;
  org     record;
  r       record;
  _cid    uuid;
  _code   text;
  _name   text;
  _today  text;
BEGIN
  IF NOT public.can_manage_event_certificates(auth.uid(), _event_id) THEN
    RAISE EXCEPTION 'You do not have permission to issue certificates for this event' USING ERRCODE = '42501';
  END IF;
  IF _audience NOT IN ('all', 'checked_in') THEN
    RAISE EXCEPTION 'Choose who receives certificates: all registered attendees or only checked-in attendees';
  END IF;

  SELECT e.id, e.org_id, e.title, e.date, e.end_date, e.timezone, e.venue, e.location INTO ev
    FROM public.events e WHERE e.id = _event_id;
  IF ev.org_id IS NULL THEN RAISE EXCEPTION 'This event is not part of a workspace'; END IF;

  SELECT v.id, v.org_id, v.settings, t.event_id AS template_event_id INTO ver
    FROM public.certificate_template_versions v
    JOIN public.certificate_templates t ON t.id = v.template_id
   WHERE v.id = _version_id;
  IF NOT FOUND OR ver.org_id <> ev.org_id OR (ver.template_event_id IS NOT NULL AND ver.template_event_id <> ev.id) THEN
    RAISE EXCEPTION 'That certificate template is not available for this event';
  END IF;

  SELECT o.name INTO org FROM public.organizations o WHERE o.id = ev.org_id;
  _today := to_char(now() AT TIME ZONE coalesce(nullif(ev.timezone, ''), 'UTC'), 'FMDD FMMonth YYYY');

  FOR r IN
    SELECT g.* FROM public.registrations g
     WHERE g.event_id = _event_id
       AND g.status <> 'cancelled'
       AND g.approval_status = 'approved'
       AND (_audience = 'all' OR g.checked_in IS TRUE)
       AND (_registration_ids IS NULL OR g.id = ANY (_registration_ids))
     ORDER BY g.created_at
  LOOP
    SELECT c.id, c.code INTO _cid, _code
      FROM public.certificates c
     WHERE c.event_id = _event_id AND c.registration_id = r.id AND c.status = 'issued';
    IF FOUND THEN
      certificate_id := _cid; registration_id := r.id; code := _code; created := false;
      RETURN NEXT;
      CONTINUE;
    END IF;

    _name := coalesce(nullif(btrim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), ''), nullif(btrim(r.name), ''), r.email);
    LOOP
      _code := public.new_certificate_code();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.certificates c WHERE c.code = _code);
    END LOOP;

    INSERT INTO public.certificates (event_id, org_id, registration_id, template_version_id, code, recipient_name, recipient_email, field_values, issued_by)
    VALUES (
      _event_id, ev.org_id, r.id, ver.id, _code, _name, lower(r.email),
      jsonb_strip_nulls(jsonb_build_object(
        'participant_name', _name,
        'participant_designation', nullif(btrim(r.designation), ''),
        'participant_company', nullif(btrim(r.company), ''),
        'ticket_type', nullif(btrim(r.ticket_type), ''),
        'event_name', ev.title,
        'event_date', public.certificate_date_text(ev.date, ev.end_date, ev.timezone),
        'event_venue', nullif(concat_ws(', ', nullif(btrim(ev.venue), ''), nullif(btrim(ev.location), '')), ''),
        'organization_name', org.name,
        'certificate_type', nullif(btrim(ver.settings->>'certificateType'), ''),
        'issue_date', _today,
        'certificate_id', _code
      )),
      auth.uid()
    )
    RETURNING id INTO _cid;

    INSERT INTO public.certificate_audit (certificate_id, event_id, action, actor, detail)
         VALUES (_cid, _event_id, 'issued', auth.uid(), jsonb_build_object('audience', _audience, 'version_id', ver.id));

    certificate_id := _cid; registration_id := r.id; code := _code; created := true;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.issue_certificates(uuid, uuid, text, uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.issue_certificates(uuid, uuid, text, uuid[]) TO authenticated;


-- ── 6c. Revoke ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.revoke_certificate(_certificate_id uuid, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c record;
BEGIN
  SELECT * INTO c FROM public.certificates WHERE id = _certificate_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Certificate not found'; END IF;
  IF NOT public.can_manage_event_certificates(auth.uid(), c.event_id) THEN
    RAISE EXCEPTION 'You do not have permission to revoke certificates for this event' USING ERRCODE = '42501';
  END IF;
  IF c.status = 'revoked' THEN RETURN; END IF;
  UPDATE public.certificates
     SET status = 'revoked', revoked_at = now(), revoked_by = auth.uid(), revoked_reason = left(nullif(btrim(_reason), ''), 500)
   WHERE id = c.id;
  INSERT INTO public.certificate_audit (certificate_id, event_id, action, actor, detail)
       VALUES (c.id, c.event_id, 'revoked', auth.uid(), jsonb_build_object('reason', left(coalesce(_reason, ''), 500)));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.revoke_certificate(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.revoke_certificate(uuid, text) TO authenticated;


-- ── 6d. Emailed ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_certificate_emails(_certificate_ids uuid[])
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _n int := 0;
  c  record;
BEGIN
  FOR c IN SELECT * FROM public.certificates WHERE id = ANY (_certificate_ids) AND status = 'issued' LOOP
    IF public.can_manage_event_certificates(auth.uid(), c.event_id) THEN
      UPDATE public.certificates SET emailed_at = now(), email_count = email_count + 1 WHERE id = c.id;
      INSERT INTO public.certificate_audit (certificate_id, event_id, action, actor) VALUES (c.id, c.event_id, 'emailed', auth.uid());
      _n := _n + 1;
    END IF;
  END LOOP;
  RETURN _n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_certificate_emails(uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.record_certificate_emails(uuid[]) TO authenticated;


-- ── 6e. Public verification ──────────────────────────────────────────────────
-- What the QR code opens. A valid certificate comes back with its design so
-- the holder can download it; a revoked one only says so.
CREATE OR REPLACE FUNCTION public.get_certificate_public(_code text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c record;
BEGIN
  SELECT c2.*, e.title AS event_title, o.name AS org_name, v.design, v.settings
    INTO c
    FROM public.certificates c2
    JOIN public.events e ON e.id = c2.event_id
    JOIN public.organizations o ON o.id = c2.org_id
    JOIN public.certificate_template_versions v ON v.id = c2.template_version_id
   WHERE c2.code = upper(btrim(coalesce(_code, '')));
  IF NOT FOUND THEN RETURN jsonb_build_object('found', false); END IF;
  IF c.status = 'revoked' THEN
    RETURN jsonb_build_object('found', true, 'status', 'revoked', 'code', c.code, 'recipient_name', c.recipient_name,
                              'event_name', c.event_title, 'organization_name', c.org_name, 'issued_at', c.issued_at, 'revoked_at', c.revoked_at);
  END IF;
  RETURN jsonb_build_object('found', true, 'status', 'issued', 'code', c.code, 'recipient_name', c.recipient_name,
                            'event_name', c.event_title, 'organization_name', c.org_name, 'issued_at', c.issued_at,
                            'field_values', c.field_values, 'design', c.design, 'settings', c.settings);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_certificate_public(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_certificate_public(text) TO anon, authenticated;
