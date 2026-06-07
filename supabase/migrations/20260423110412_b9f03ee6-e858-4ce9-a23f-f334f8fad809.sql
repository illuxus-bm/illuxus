DROP FUNCTION IF EXISTS public.admin_list_users();

CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE(user_id uuid, display_name text, avatar_url text, onboarding_completed boolean, created_at timestamp with time zone, org_name text, org_plan text, is_platform_admin boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.user_id, p.display_name, p.avatar_url, p.onboarding_completed, p.created_at,
    o.name as org_name, o.plan as org_plan,
    EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = p.user_id AND ur.role = 'admin') as is_platform_admin
  FROM profiles p
  LEFT JOIN org_members om ON om.user_id = p.user_id
  LEFT JOIN organizations o ON o.id = om.org_id
  WHERE has_role(auth.uid(), 'admin')
  ORDER BY p.created_at DESC
$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_user_id_role_key'
  ) THEN
    ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);
  END IF;
END $$;

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
END;
$$;