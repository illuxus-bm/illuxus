-- ═══════════════════════════════════════════════════════════════════════════════
-- 030_org_admin_can_manage.sql
--
-- Extends day-to-day workspace management to teammates with the "admin" role
-- in org_members. Before this migration, RLS on `organizations`, `org_members`
-- and `org_invitations` gated all writes on `is_org_owner` (i.e., `owner_id`
-- or a teammate promoted to `role='owner'` via migration 007). That mismatch
-- with the product's stated role model — where the Settings → Team screen
-- offers Owner / Admin / Member / Viewer and describes Admin as "Manage
-- settings & members" — meant that anyone but an owner got a silent RLS
-- rejection when they clicked Save, Invite, or the role dropdown.
--
-- The fix mirrors the pattern already established for `events` (migration 012)
-- and `registrations` (migration 010): keep owners fully privileged, and add
-- narrower policies for admins that block only the owner-scoped edges —
-- creating/promoting an owner, or modifying an existing owner row.
--
-- Guardrails preserved for admins:
--   • Cannot INSERT an org_members row with role='owner'      (self-promotion)
--   • Cannot UPDATE any row whose current OR proposed role is 'owner'
--   • Cannot DELETE a row whose role is 'owner'               (kick an owner)
--   • Cannot INSERT/UPDATE an org_invitations row with role='owner'
--   • Cannot INSERT or DELETE a subscription (still owner-only billing)
--
-- Idempotent: `CREATE OR REPLACE` + `DROP POLICY IF EXISTS` throughout so the
-- migration can be re-run safely against a partially applied database.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ─── Helper ────────────────────────────────────────────────────────────────
-- is_org_manager(uid, org_id) → owner OR admin.
-- SECURITY DEFINER so RLS on `org_members` doesn't create a chicken-and-egg
-- loop when a policy calls this helper to evaluate itself.
CREATE OR REPLACE FUNCTION public.is_org_manager(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_org_owner(_user_id, _org_id)
    OR EXISTS (
      SELECT 1 FROM public.org_members
       WHERE org_id  = _org_id
         AND user_id = _user_id
         AND role    = 'admin'
    );
$$;

REVOKE EXECUTE ON FUNCTION public.is_org_manager(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_org_manager(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.is_org_manager(uuid, uuid) IS
  'True when the user is the canonical workspace owner, a teammate promoted to role=owner in org_members, or a teammate with role=admin. Used by RLS to allow admins to invite/edit teammates and update org settings without granting owner-only privileges (billing plan changes, promoting to owner).';


-- ─── organizations ─────────────────────────────────────────────────────────
-- UPDATE: managers (owner + admin) can edit workspace details. Platform
-- admins keep bypass access for support.
DROP POLICY IF EXISTS "Owner update org" ON public.organizations;
CREATE POLICY "Managers update org"
ON public.organizations
FOR UPDATE
TO authenticated
USING (
  public.is_org_manager(auth.uid(), id)
  OR public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  public.is_org_manager(auth.uid(), id)
  OR public.has_role(auth.uid(), 'admin')
);

COMMENT ON POLICY "Managers update org" ON public.organizations IS
  'UPDATE organizations: canonical owner, org_members with role owner or admin, or platform admin. INSERT stays owner-self-service (Auth create orgs); ownership transfer must go through a dedicated RPC.';


-- ─── org_members ───────────────────────────────────────────────────────────
-- Keep the owner-only ALL policy for full lifecycle. Split admin access into
-- per-verb policies with role-guards so admins cannot create/modify/remove an
-- owner row.
DROP POLICY IF EXISTS "Owner manage members" ON public.org_members;
DROP POLICY IF EXISTS "Owners manage all members"            ON public.org_members;
DROP POLICY IF EXISTS "Admins insert non-owner members"      ON public.org_members;
DROP POLICY IF EXISTS "Admins update non-owner members"      ON public.org_members;
DROP POLICY IF EXISTS "Admins delete non-owner members"      ON public.org_members;

CREATE POLICY "Owners manage all members"
ON public.org_members
FOR ALL
TO authenticated
USING (public.is_org_owner(auth.uid(), org_id))
WITH CHECK (public.is_org_owner(auth.uid(), org_id));

CREATE POLICY "Admins insert non-owner members"
ON public.org_members
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_org_manager(auth.uid(), org_id)
  AND role <> 'owner'
);

CREATE POLICY "Admins update non-owner members"
ON public.org_members
FOR UPDATE
TO authenticated
USING (
  public.is_org_manager(auth.uid(), org_id)
  AND role <> 'owner'
)
WITH CHECK (
  public.is_org_manager(auth.uid(), org_id)
  AND role <> 'owner'
);

CREATE POLICY "Admins delete non-owner members"
ON public.org_members
FOR DELETE
TO authenticated
USING (
  public.is_org_manager(auth.uid(), org_id)
  AND role <> 'owner'
);

COMMENT ON POLICY "Owners manage all members" ON public.org_members IS
  'ALL org_members verbs: canonical owner or role=owner teammate. Unrestricted, including promoting/demoting other owners.';
COMMENT ON POLICY "Admins insert non-owner members" ON public.org_members IS
  'INSERT org_members: admins can add teammates as admin/member/viewer, but never as owner (self-promotion guard).';
COMMENT ON POLICY "Admins update non-owner members" ON public.org_members IS
  'UPDATE org_members: admins can retitle a non-owner teammate to another non-owner role. Cannot touch rows whose current role is owner, nor promote to owner.';
COMMENT ON POLICY "Admins delete non-owner members" ON public.org_members IS
  'DELETE org_members: admins can remove non-owner teammates. Owners are protected from being kicked by an admin.';


-- ─── org_invitations ───────────────────────────────────────────────────────
-- Same pattern: owners keep the unrestricted ALL policy; admins get scoped
-- verbs that block owner-role invitations.
DROP POLICY IF EXISTS "Owner manage invitations"             ON public.org_invitations;
DROP POLICY IF EXISTS "Owners manage all invitations"        ON public.org_invitations;
DROP POLICY IF EXISTS "Admins manage non-owner invitations"  ON public.org_invitations;

CREATE POLICY "Owners manage all invitations"
ON public.org_invitations
FOR ALL
TO authenticated
USING (public.is_org_owner(auth.uid(), org_id))
WITH CHECK (public.is_org_owner(auth.uid(), org_id));

CREATE POLICY "Admins manage non-owner invitations"
ON public.org_invitations
FOR ALL
TO authenticated
USING (
  public.is_org_manager(auth.uid(), org_id)
  AND role <> 'owner'
)
WITH CHECK (
  public.is_org_manager(auth.uid(), org_id)
  AND role <> 'owner'
);

COMMENT ON POLICY "Owners manage all invitations" ON public.org_invitations IS
  'ALL org_invitations verbs: canonical owner or role=owner teammate. Includes issuing owner-role invitations.';
COMMENT ON POLICY "Admins manage non-owner invitations" ON public.org_invitations IS
  'ALL org_invitations verbs: admins can issue, retitle, cancel, or update non-owner invitations. Owner-role invitations remain restricted to owners so admins cannot self-promote via an accepted invite.';
