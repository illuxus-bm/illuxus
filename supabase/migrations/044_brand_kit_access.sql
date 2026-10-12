-- ═══════════════════════════════════════════════════════════════════════════════
-- 044_brand_kit_access.sql
--
-- Makes `public.brand_kits` usable from the dashboard's Organization → Brand
-- kit tab, where a workspace keeps its logos (CMYK, white, black, icon),
-- colours, fonts, brand guidelines and other brand files.
--
-- Three things were in the way:
--
--   1. Migration 025 created the table with row-level-security policies but
--      no table privileges for signed-in users. RLS only narrows access that a
--      GRANT has already given, so every read and write was refused with
--      "permission denied for table brand_kits".
--   2. Only the canonical owner (`organizations.owner_id`) could write. Org
--      admins manage the rest of the workspace (migration 030), so they may
--      manage the brand kit too.
--   3. The canonical owner could only read through an `org_members` row. The
--      read policy now names the owner directly.
--
-- The table definition is repeated with IF NOT EXISTS so this file also works
-- on a database where 025 was never applied. The files themselves are stored
-- in the existing public `site-assets` bucket under `brand-kits/<org id>/`;
-- no storage changes are needed.
--
-- Idempotent — safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.brand_kits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brand_kits_org_idx
  ON public.brand_kits (org_id, created_at DESC);

ALTER TABLE public.brand_kits ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_kits TO authenticated;
GRANT ALL                            ON public.brand_kits TO service_role;

-- Replace the 025 policies (and any earlier run of this file).
DROP POLICY IF EXISTS "brand_kits: org members and admins can select" ON public.brand_kits;
DROP POLICY IF EXISTS "brand_kits: org owner and admins can insert"   ON public.brand_kits;
DROP POLICY IF EXISTS "brand_kits: org owner and admins can update"   ON public.brand_kits;
DROP POLICY IF EXISTS "brand_kits: org owner and admins can delete"   ON public.brand_kits;
DROP POLICY IF EXISTS "brand_kits: workspace can read"                ON public.brand_kits;
DROP POLICY IF EXISTS "brand_kits: managers can insert"               ON public.brand_kits;
DROP POLICY IF EXISTS "brand_kits: managers can update"               ON public.brand_kits;
DROP POLICY IF EXISTS "brand_kits: managers can delete"               ON public.brand_kits;

-- Read: anyone in the workspace (owner or member), or a platform admin.
CREATE POLICY "brand_kits: workspace can read"
  ON public.brand_kits FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = brand_kits.org_id AND o.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = brand_kits.org_id AND om.user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

-- Write: the workspace's owners and admins (`is_org_manager`, migration 030),
-- or a platform admin.
CREATE POLICY "brand_kits: managers can insert"
  ON public.brand_kits FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (public.is_org_manager(auth.uid(), org_id) OR public.has_role(auth.uid(), 'admin'))
  );

CREATE POLICY "brand_kits: managers can update"
  ON public.brand_kits FOR UPDATE TO authenticated
  USING      (public.is_org_manager(auth.uid(), org_id) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_org_manager(auth.uid(), org_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "brand_kits: managers can delete"
  ON public.brand_kits FOR DELETE TO authenticated
  USING (public.is_org_manager(auth.uid(), org_id) OR public.has_role(auth.uid(), 'admin'));

COMMENT ON TABLE public.brand_kits IS
  'Organization brand kits: logos, colours, fonts and brand files in `snapshot`. RLS: any workspace member (or platform admin) may read; workspace owners and admins (or platform admin) may write.';

NOTIFY pgrst, 'reload schema';
