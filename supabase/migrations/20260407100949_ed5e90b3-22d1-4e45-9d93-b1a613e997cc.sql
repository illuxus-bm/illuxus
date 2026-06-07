
-- Organizations table
CREATE TABLE public.organizations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  owner_id UUID NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  plan_limits JSONB NOT NULL DEFAULT '{"max_events": 3, "max_attendees_per_event": 50, "max_team_members": 1, "features": ["basic_analytics"]}'::jsonb,
  billing_email TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Organization members
CREATE TABLE public.org_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(org_id, user_id)
);

-- Subscriptions (mock)
CREATE TABLE public.subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active',
  current_period_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  current_period_end TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '30 days'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add org_id to events
ALTER TABLE public.events ADD COLUMN org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

-- Add onboarding_completed to profiles
ALTER TABLE public.profiles ADD COLUMN onboarding_completed BOOLEAN NOT NULL DEFAULT false;

-- RLS for organizations
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their org"
ON public.organizations FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.org_members WHERE org_members.org_id = organizations.id AND org_members.user_id = auth.uid()));

CREATE POLICY "Owner can update org"
ON public.organizations FOR UPDATE TO authenticated
USING (owner_id = auth.uid());

CREATE POLICY "Authenticated users can create orgs"
ON public.organizations FOR INSERT TO authenticated
WITH CHECK (owner_id = auth.uid());

-- RLS for org_members
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view org members"
ON public.org_members FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.org_members AS om WHERE om.org_id = org_members.org_id AND om.user_id = auth.uid()));

CREATE POLICY "Org owners can manage members"
ON public.org_members FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.organizations WHERE organizations.id = org_members.org_id AND organizations.owner_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.organizations WHERE organizations.id = org_members.org_id AND organizations.owner_id = auth.uid()));

CREATE POLICY "Users can insert themselves as members"
ON public.org_members FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- RLS for subscriptions
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view subscription"
ON public.subscriptions FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.org_members WHERE org_members.org_id = subscriptions.org_id AND org_members.user_id = auth.uid()));

CREATE POLICY "Org owners can manage subscription"
ON public.subscriptions FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.organizations WHERE organizations.id = subscriptions.org_id AND organizations.owner_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.organizations WHERE organizations.id = subscriptions.org_id AND organizations.owner_id = auth.uid()));
