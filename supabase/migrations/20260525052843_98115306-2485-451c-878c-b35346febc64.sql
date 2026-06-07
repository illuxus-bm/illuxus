
-- 1. Remove org_members self-insert escalation; owner creation flows through the
--    "Org owners can manage members" policy which already permits the creator.
DROP POLICY IF EXISTS "Users can insert themselves as members" ON public.org_members;

-- 2. Lock down public organization landing exposure (billing_email leak).
DROP POLICY IF EXISTS "Public can view published org landing pages" ON public.organizations;

CREATE OR REPLACE VIEW public.public_organizations
WITH (security_invoker = false) AS
SELECT id, name, slug, subdomain, custom_domain, logo_url,
       landing_config, landing_published, plan
FROM public.organizations
WHERE landing_published = true;

GRANT SELECT ON public.public_organizations TO anon, authenticated;

-- 3. Profiles: restrict reads to authenticated and hide sensitive PII columns
--    from other users via column-level grants. Own-row reads of sensitive
--    columns go through the get_my_profile() RPC below.
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;

CREATE POLICY "Authenticated can view profiles"
ON public.profiles FOR SELECT TO authenticated USING (true);

REVOKE SELECT ON public.profiles FROM anon, authenticated, PUBLIC;
GRANT SELECT (
  id, user_id, display_name, avatar_url, bio, account_type, username, headline,
  title, first_name, last_name, department, designation, company,
  city_id, profile_completed, onboarding_completed, created_at, updated_at
) ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS public.profiles
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;

-- 4. Remove attendee-facing read of webinar_speakers (exposed email + invite_token).
--    The dashboard owner policy remains; attendee UI does not read this table.
DROP POLICY IF EXISTS "Approved attendees read speaker list" ON public.webinar_speakers;
