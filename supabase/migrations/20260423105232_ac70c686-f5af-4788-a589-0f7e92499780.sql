-- Add domain + landing fields to organizations
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS subdomain text,
  ADD COLUMN IF NOT EXISTS custom_domain text,
  ADD COLUMN IF NOT EXISTS custom_domain_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS landing_config jsonb NOT NULL DEFAULT '{"blocks":[],"theme":{"primaryColor":"#6366f1","secondaryColor":"#8b5cf6","backgroundColor":"#ffffff","textColor":"#1a1a2e","accentColor":"#f59e0b","fontFamily":"Inter"}}'::jsonb,
  ADD COLUMN IF NOT EXISTS landing_published boolean NOT NULL DEFAULT false;

-- Unique indexes (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS organizations_subdomain_unique
  ON public.organizations (lower(subdomain))
  WHERE subdomain IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS organizations_custom_domain_unique
  ON public.organizations (lower(custom_domain))
  WHERE custom_domain IS NOT NULL;

-- Validation trigger for subdomain format (lowercase letters, numbers, hyphens; 2-40 chars)
CREATE OR REPLACE FUNCTION public.validate_organization_domains()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
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
$$;

DROP TRIGGER IF EXISTS organizations_validate_domains ON public.organizations;
CREATE TRIGGER organizations_validate_domains
  BEFORE INSERT OR UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_organization_domains();

-- Public can view orgs that have a published landing page (so /o/:slug works without auth)
DROP POLICY IF EXISTS "Public can view published org landing pages" ON public.organizations;
CREATE POLICY "Public can view published org landing pages"
  ON public.organizations
  FOR SELECT
  TO anon, authenticated
  USING (landing_published = true);

-- Lookup org by subdomain or custom domain (security definer to bypass RLS for domain routing)
CREATE OR REPLACE FUNCTION public.get_org_by_host(_host text)
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  subdomain text,
  custom_domain text,
  logo_url text,
  landing_config jsonb,
  landing_published boolean,
  plan text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.name, o.slug, o.subdomain, o.custom_domain, o.logo_url,
         o.landing_config, o.landing_published, o.plan
  FROM organizations o
  WHERE o.landing_published = true
    AND (lower(o.custom_domain) = lower(_host) OR lower(o.subdomain) = lower(_host))
  LIMIT 1;
$$;