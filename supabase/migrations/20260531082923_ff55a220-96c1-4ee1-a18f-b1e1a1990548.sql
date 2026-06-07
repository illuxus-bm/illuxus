DROP FUNCTION IF EXISTS public.get_public_org_brief(uuid);

CREATE OR REPLACE FUNCTION public.get_public_org_brief(_org_id uuid)
 RETURNS TABLE(id uuid, name text, slug text, subdomain text, logo_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT o.id, o.name, o.slug, o.subdomain, o.logo_url
  FROM public.organizations o
  WHERE o.id = _org_id AND o.landing_published = true
  LIMIT 1;
$function$;