
DROP FUNCTION IF EXISTS public.admin_list_orgs();

CREATE FUNCTION public.admin_list_orgs()
 RETURNS TABLE(
   id uuid, name text, slug text, owner_id uuid, plan text,
   billing_email text, subdomain text, custom_domain text,
   created_at timestamp with time zone,
   member_count bigint, event_count bigint
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    o.id, o.name, o.slug, o.owner_id, o.plan, o.billing_email,
    o.subdomain, o.custom_domain, o.created_at,
    (SELECT count(*) FROM org_members om WHERE om.org_id = o.id) as member_count,
    (SELECT count(*) FROM events e WHERE e.org_id = o.id) as event_count
  FROM organizations o
  WHERE has_role(auth.uid(), 'admin')
  ORDER BY o.created_at DESC
$function$;
