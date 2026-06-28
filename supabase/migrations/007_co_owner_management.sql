-- ═════════════════════════════════════════════════════════════════════════════
-- 007_co_owner_management.sql — allow co-owners to manage org team roles.
--
-- Before this migration, `is_org_owner(uid, org_id)` only returned TRUE when
-- the user matched `organizations.owner_id` (a singular column). When an
-- existing owner promoted a teammate to the "owner" role via the org member
-- dropdown, the new owner's `org_members.role` was set to 'owner' but RLS
-- still rejected them from inviting members, changing roles, or removing
-- people because `is_org_owner` ignored that membership row.
--
-- The fix: extend `is_org_owner` to return TRUE in EITHER case —
--   (a) the user is the canonical workspace owner (organizations.owner_id),
--   (b) the user has org_members.role = 'owner' in that workspace.
--
-- All policies that USED `is_org_owner` automatically inherit the new
-- behaviour because they call the helper rather than encoding the predicate
-- inline. The function is idempotent — CREATE OR REPLACE handles re-runs.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_org_owner(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.organizations
       WHERE id = _org_id AND owner_id = _user_id
    )
    OR EXISTS (
      SELECT 1 FROM public.org_members
       WHERE org_id = _org_id
         AND user_id = _user_id
         AND role = 'owner'
    );
$$;

-- No GRANT needed — the helper is SECURITY DEFINER and is called by RLS
-- policies + RPCs that already have access. The original definition in
-- 000_full_schema.sql had no explicit GRANT either.
