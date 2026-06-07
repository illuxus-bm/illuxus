
-- Admin function to update an org's plan
CREATE OR REPLACE FUNCTION public.admin_update_org_plan(_org_id uuid, _new_plan text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  UPDATE organizations SET plan = _new_plan, updated_at = now() WHERE id = _org_id;
  UPDATE subscriptions SET plan = _new_plan, updated_at = now() WHERE org_id = _org_id;
END;
$$;

-- Admin function to delete an org and its related data
CREATE OR REPLACE FUNCTION public.admin_delete_org(_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  DELETE FROM subscriptions WHERE org_id = _org_id;
  DELETE FROM org_members WHERE org_id = _org_id;
  DELETE FROM events WHERE org_id = _org_id;
  DELETE FROM organizations WHERE id = _org_id;
END;
$$;
