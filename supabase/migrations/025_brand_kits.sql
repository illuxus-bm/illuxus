-- ─────────────────────────────────────────────────────────────────────────────
-- 025_brand_kits.sql
--
-- Creates `public.brand_kits` — organization-scoped named theme snapshots
-- for the Creative_Customization feature (Requirement 9). A Brand_Kit
-- captures a `primaryColor`, `accentColor`, `fontFamily`, `logoUrl`, and
-- optional `preferredTemplateIds`/`preferredFormats` lists in its
-- `snapshot` JSONB. When applied at render time it is baked into the
-- `event_creatives.customization` blob under `appliedBrandKitId` so the
-- Creative reproduces byte-for-byte identically even if the Brand_Kit is
-- later edited or deleted (Requirement 9.7).
--
-- Authorisation (Requirements 9.6, 11.3)
-- ───────────────────────────────────────
-- • SELECT — any member of the org (`org_members.user_id = auth.uid()`)
--   OR platform admin (`public.has_role(auth.uid(), 'admin')`).
-- • INSERT/UPDATE/DELETE — only the org's owner
--   (`organizations.owner_id = auth.uid()`) OR platform admin.
--
-- The RLS truth table this migration implements (Property 48) — every
-- (is_org_member, is_org_owner, is_platform_admin) triple × verb combo,
-- 8 × 4 = 32 cells total:
--
--   is_member | is_owner | is_admin | SELECT | INSERT | UPDATE | DELETE
--   ----------+----------+----------+--------+--------+--------+--------
--       F     |    F     |    F     |  deny  |  deny  |  deny  |  deny
--       T     |    F     |    F     |  allow |  deny  |  deny  |  deny
--       F     |    T     |    F     |  allow*|  allow |  allow |  allow
--       T     |    T     |    F     |  allow |  allow |  allow |  allow
--       F     |    F     |    T     |  allow |  allow |  allow |  allow
--       T     |    F     |    T     |  allow |  allow |  allow |  allow
--       F     |    T     |    T     |  allow |  allow |  allow |  allow
--       T     |    T     |    T     |  allow |  allow |  allow |  allow
--
--   * The owner is transitively an org_member via the `org_members` row
--     inserted when the org is provisioned, so the SELECT policy's
--     `org_members` predicate covers the owner case as well.
--
-- Storage
-- ───────
-- No storage bucket work — the Brand_Kit's `logoUrl` references an image
-- that already lives in the existing `site-assets` bucket (or any public
-- URL). This migration does not create new storage policies.
--
-- Requirements addressed: 9.1, 9.2, 9.6, 9.7, 11.3
-- ─────────────────────────────────────────────────────────────────────────────

-- New table for organization-scoped named Brand_Kits (Requirement 9).

create table if not exists public.brand_kits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  snapshot jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists brand_kits_org_idx
  on public.brand_kits (org_id, created_at desc);

alter table public.brand_kits enable row level security;

-- SELECT: any member of the org OR platform admin (Requirement 9.6).
create policy "brand_kits: org members and admins can select"
  on public.brand_kits
  for select
  to authenticated
  using (
    exists (
      select 1 from public.org_members om
      where om.org_id = brand_kits.org_id
        and om.user_id = auth.uid()
    )
    or public.has_role(auth.uid(), 'admin')
  );

-- INSERT: only the org's owner OR platform admin (Requirement 9.6).
create policy "brand_kits: org owner and admins can insert"
  on public.brand_kits
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.organizations o
      where o.id = brand_kits.org_id
        and o.owner_id = auth.uid()
    )
    or public.has_role(auth.uid(), 'admin')
  );

-- UPDATE: only the org's owner OR platform admin.
create policy "brand_kits: org owner and admins can update"
  on public.brand_kits
  for update
  to authenticated
  using (
    exists (
      select 1 from public.organizations o
      where o.id = brand_kits.org_id
        and o.owner_id = auth.uid()
    )
    or public.has_role(auth.uid(), 'admin')
  )
  with check (
    exists (
      select 1 from public.organizations o
      where o.id = brand_kits.org_id
        and o.owner_id = auth.uid()
    )
    or public.has_role(auth.uid(), 'admin')
  );

-- DELETE: only the org's owner OR platform admin.
create policy "brand_kits: org owner and admins can delete"
  on public.brand_kits
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.organizations o
      where o.id = brand_kits.org_id
        and o.owner_id = auth.uid()
    )
    or public.has_role(auth.uid(), 'admin')
  );

comment on table public.brand_kits is
  'Organization-scoped Brand_Kits for the Creative_Customization feature. RLS: any org_member (or admin) may select; only the org.owner_id (or admin) may insert/update/delete.';
