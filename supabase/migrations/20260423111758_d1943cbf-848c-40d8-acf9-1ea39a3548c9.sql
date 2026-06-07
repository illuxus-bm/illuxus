
-- 1. AUDIT LOG TABLE
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_email text,
  action text NOT NULL,
  target_type text,
  target_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs (action);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins can read audit logs" ON public.audit_logs;
CREATE POLICY "Super admins can read audit logs"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'));

-- No INSERT/UPDATE/DELETE policy: writes only happen through SECURITY DEFINER functions.

-- 2. INTERNAL HELPER (not exposed to clients - prefixed with underscore semantics via security)
CREATE OR REPLACE FUNCTION public._record_audit(
  _action text,
  _target_type text,
  _target_id text,
  _details jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email text;
BEGIN
  SELECT email INTO _email FROM auth.users WHERE id = auth.uid();
  INSERT INTO audit_logs (actor_id, actor_email, action, target_type, target_id, details)
  VALUES (auth.uid(), _email, _action, _target_type, _target_id, COALESCE(_details, '{}'::jsonb));
END;
$$;

-- 3. STAGING COLUMNS ON SITE_CONTENT
ALTER TABLE public.site_content
  ADD COLUMN IF NOT EXISTS draft_content jsonb,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

-- 4. PUBLISH / DISCARD HELPERS
CREATE OR REPLACE FUNCTION public.publish_site_section(_section text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _draft jsonb;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  SELECT draft_content INTO _draft FROM site_content WHERE section = _section;
  IF _draft IS NULL THEN
    RAISE EXCEPTION 'No draft to publish for section %', _section;
  END IF;
  UPDATE site_content
  SET content = _draft,
      draft_content = NULL,
      published_at = now(),
      updated_at = now()
  WHERE section = _section;

  PERFORM _record_audit('site.publish', 'site_content', _section, jsonb_build_object('section', _section));
END;
$$;

CREATE OR REPLACE FUNCTION public.discard_site_draft(_section text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  UPDATE site_content SET draft_content = NULL, updated_at = now() WHERE section = _section;
  PERFORM _record_audit('site.discard_draft', 'site_content', _section, jsonb_build_object('section', _section));
END;
$$;

CREATE OR REPLACE FUNCTION public.save_site_draft(_section text, _content jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  INSERT INTO site_content (section, content, draft_content)
  VALUES (_section, '{}'::jsonb, _content)
  ON CONFLICT (section) DO UPDATE
    SET draft_content = EXCLUDED.draft_content,
        updated_at = now();

  PERFORM _record_audit('site.save_draft', 'site_content', _section, jsonb_build_object('section', _section));
END;
$$;

-- Ensure site_content.section is unique for upsert
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_content_section_key') THEN
    ALTER TABLE public.site_content ADD CONSTRAINT site_content_section_key UNIQUE (section);
  END IF;
END $$;

-- 5. AUDITED ADMIN FUNCTIONS (replace existing)
CREATE OR REPLACE FUNCTION public.admin_set_user_role(_target_user_id uuid, _role app_role, _grant boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF _grant = false AND _role = 'admin' THEN
    IF (SELECT count(*) FROM user_roles WHERE role = 'admin') <= 1
       AND EXISTS (SELECT 1 FROM user_roles WHERE user_id = _target_user_id AND role = 'admin') THEN
      RAISE EXCEPTION 'Cannot remove the last platform admin';
    END IF;
  END IF;

  IF _grant THEN
    INSERT INTO user_roles (user_id, role)
    VALUES (_target_user_id, _role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    DELETE FROM user_roles WHERE user_id = _target_user_id AND role = _role;
  END IF;

  PERFORM _record_audit(
    CASE WHEN _grant THEN 'role.grant' ELSE 'role.revoke' END,
    'user',
    _target_user_id::text,
    jsonb_build_object('role', _role::text, 'grant', _grant)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_org(_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _name text;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  SELECT name INTO _name FROM organizations WHERE id = _org_id;
  DELETE FROM subscriptions WHERE org_id = _org_id;
  DELETE FROM org_members WHERE org_id = _org_id;
  DELETE FROM events WHERE org_id = _org_id;
  DELETE FROM organizations WHERE id = _org_id;

  PERFORM _record_audit('org.delete', 'organization', _org_id::text, jsonb_build_object('name', _name));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_org_plan(_org_id uuid, _new_plan text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _old_plan text;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  SELECT plan INTO _old_plan FROM organizations WHERE id = _org_id;
  UPDATE organizations SET plan = _new_plan, updated_at = now() WHERE id = _org_id;
  UPDATE subscriptions SET plan = _new_plan, updated_at = now() WHERE org_id = _org_id;

  PERFORM _record_audit('org.plan_change', 'organization', _org_id::text,
    jsonb_build_object('from', _old_plan, 'to', _new_plan));
END;
$$;

-- 6. AUDIT LIST FUNCTION
CREATE OR REPLACE FUNCTION public.admin_list_audit_logs(_limit int DEFAULT 200)
RETURNS TABLE(
  id uuid,
  actor_id uuid,
  actor_email text,
  action text,
  target_type text,
  target_id text,
  details jsonb,
  created_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, actor_id, actor_email, action, target_type, target_id, details, created_at
  FROM audit_logs
  WHERE has_role(auth.uid(), 'admin')
  ORDER BY created_at DESC
  LIMIT COALESCE(_limit, 200);
$$;
