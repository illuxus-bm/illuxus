
-- Create org_invitations table
CREATE TABLE public.org_invitations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'member',
  invited_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(org_id, email)
);

ALTER TABLE public.org_invitations ENABLE ROW LEVEL SECURITY;

-- Org members can view invitations for their org
CREATE POLICY "Org members can view invitations"
  ON public.org_invitations FOR SELECT
  TO authenticated
  USING (is_org_member(auth.uid(), org_id));

-- Org owners can manage invitations
CREATE POLICY "Org owners can manage invitations"
  ON public.org_invitations FOR ALL
  TO authenticated
  USING (is_org_owner(auth.uid(), org_id))
  WITH CHECK (is_org_owner(auth.uid(), org_id));

-- Trigger for updated_at
CREATE TRIGGER update_org_invitations_updated_at
  BEFORE UPDATE ON public.org_invitations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
