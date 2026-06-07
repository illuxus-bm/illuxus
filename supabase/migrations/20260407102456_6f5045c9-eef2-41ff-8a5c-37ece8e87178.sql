
-- Fix infinite recursion: org_members SELECT references itself, organizations SELECT references org_members which references organizations

-- Drop problematic policies
DROP POLICY IF EXISTS "Members can view org members" ON public.org_members;
DROP POLICY IF EXISTS "Org owners can manage members" ON public.org_members;
DROP POLICY IF EXISTS "Users can insert themselves as members" ON public.org_members;
DROP POLICY IF EXISTS "Members can view their org" ON public.organizations;
DROP POLICY IF EXISTS "Authenticated users can create orgs" ON public.organizations;
DROP POLICY IF EXISTS "Owner can update org" ON public.organizations;
DROP POLICY IF EXISTS "Org members can view subscription" ON public.subscriptions;
DROP POLICY IF EXISTS "Org owners can manage subscription" ON public.subscriptions;

-- Create security definer functions to break circular RLS references
CREATE OR REPLACE FUNCTION public.is_org_member(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE user_id = _user_id AND org_id = _org_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_org_owner(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = _org_id AND owner_id = _user_id
  )
$$;

-- org_members policies
CREATE POLICY "Members can view org members" ON public.org_members
  FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), org_id));

CREATE POLICY "Org owners can manage members" ON public.org_members
  FOR ALL TO authenticated
  USING (is_org_owner(auth.uid(), org_id))
  WITH CHECK (is_org_owner(auth.uid(), org_id));

CREATE POLICY "Users can insert themselves as members" ON public.org_members
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- organizations policies
CREATE POLICY "Authenticated users can create orgs" ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Members can view their org" ON public.organizations
  FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), id) OR owner_id = auth.uid());

CREATE POLICY "Owner can update org" ON public.organizations
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid());

-- subscriptions policies
CREATE POLICY "Org members can view subscription" ON public.subscriptions
  FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), org_id));

CREATE POLICY "Org owners can manage subscription" ON public.subscriptions
  FOR ALL TO authenticated
  USING (is_org_owner(auth.uid(), org_id))
  WITH CHECK (is_org_owner(auth.uid(), org_id));
