CREATE TABLE public.org_sponsor_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  label text NOT NULL,
  color text,
  display_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX org_sponsor_tiers_org_label_unique
  ON public.org_sponsor_tiers (org_id, lower(label));
CREATE INDEX org_sponsor_tiers_org_id_idx ON public.org_sponsor_tiers (org_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_sponsor_tiers TO authenticated;
GRANT ALL ON public.org_sponsor_tiers TO service_role;

ALTER TABLE public.org_sponsor_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view sponsor tier presets"
  ON public.org_sponsor_tiers
  FOR SELECT
  TO authenticated
  USING (is_org_member(auth.uid(), org_id) OR is_org_owner(auth.uid(), org_id) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Org members can create sponsor tier presets"
  ON public.org_sponsor_tiers
  FOR INSERT
  TO authenticated
  WITH CHECK (is_org_member(auth.uid(), org_id) OR is_org_owner(auth.uid(), org_id) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Org owners can update sponsor tier presets"
  ON public.org_sponsor_tiers
  FOR UPDATE
  TO authenticated
  USING (is_org_owner(auth.uid(), org_id) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (is_org_owner(auth.uid(), org_id) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Org owners can delete sponsor tier presets"
  ON public.org_sponsor_tiers
  FOR DELETE
  TO authenticated
  USING (is_org_owner(auth.uid(), org_id) OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_org_sponsor_tiers_updated_at
  BEFORE UPDATE ON public.org_sponsor_tiers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();