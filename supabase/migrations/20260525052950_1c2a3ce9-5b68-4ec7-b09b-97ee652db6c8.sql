
DROP VIEW IF EXISTS public.public_organizations;

CREATE OR REPLACE FUNCTION public.get_public_org_by_slug(_slug text)
RETURNS TABLE (
  id uuid, name text, slug text, subdomain text, custom_domain text,
  logo_url text, landing_config jsonb, landing_published boolean, plan text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.name, o.slug, o.subdomain, o.custom_domain, o.logo_url,
         o.landing_config, o.landing_published, o.plan
  FROM public.organizations o
  WHERE o.landing_published = true
    AND (o.slug = _slug OR o.subdomain = lower(_slug))
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_org_by_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_org_by_slug(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_org_brief(_org_id uuid)
RETURNS TABLE (id uuid, name text, slug text, logo_url text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.name, o.slug, o.logo_url
  FROM public.organizations o
  WHERE o.id = _org_id AND o.landing_published = true
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_org_brief(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_org_brief(uuid) TO anon, authenticated;
