
-- Extend the existing validation trigger to also normalize/validate slug
CREATE OR REPLACE FUNCTION public.validate_organization_domains()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.slug IS NOT NULL THEN
    NEW.slug := lower(NEW.slug);
    IF NEW.slug !~ '^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$' THEN
      RAISE EXCEPTION 'Invalid slug format. Use 2-60 lowercase letters, numbers or hyphens.';
    END IF;
  END IF;

  IF NEW.subdomain IS NOT NULL THEN
    NEW.subdomain := lower(NEW.subdomain);
    IF NEW.subdomain !~ '^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$' THEN
      RAISE EXCEPTION 'Invalid subdomain format. Use 2-40 lowercase letters, numbers or hyphens.';
    END IF;
  END IF;

  IF NEW.custom_domain IS NOT NULL THEN
    NEW.custom_domain := lower(NEW.custom_domain);
    IF NEW.custom_domain !~ '^[a-z0-9.-]+\.[a-z]{2,}$' THEN
      RAISE EXCEPTION 'Invalid custom domain format.';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Ensure org slugs are globally unique (used in public URLs)
CREATE UNIQUE INDEX IF NOT EXISTS organizations_slug_unique ON public.organizations (slug);
