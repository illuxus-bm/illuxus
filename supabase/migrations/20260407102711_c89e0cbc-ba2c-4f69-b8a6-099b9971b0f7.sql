
-- Function for admin to list all orgs with counts
CREATE OR REPLACE FUNCTION public.admin_list_orgs()
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  owner_id uuid,
  plan text,
  billing_email text,
  created_at timestamptz,
  member_count bigint,
  event_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.id, o.name, o.slug, o.owner_id, o.plan, o.billing_email, o.created_at,
    (SELECT count(*) FROM org_members om WHERE om.org_id = o.id) as member_count,
    (SELECT count(*) FROM events e WHERE e.org_id = o.id) as event_count
  FROM organizations o
  WHERE has_role(auth.uid(), 'admin')
  ORDER BY o.created_at DESC
$$;

-- Function for admin to list all profiles
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
  user_id uuid,
  display_name text,
  avatar_url text,
  onboarding_completed boolean,
  created_at timestamptz,
  org_name text,
  org_plan text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.user_id, p.display_name, p.avatar_url, p.onboarding_completed, p.created_at,
    o.name as org_name, o.plan as org_plan
  FROM profiles p
  LEFT JOIN org_members om ON om.user_id = p.user_id
  LEFT JOIN organizations o ON o.id = om.org_id
  WHERE has_role(auth.uid(), 'admin')
  ORDER BY p.created_at DESC
$$;
