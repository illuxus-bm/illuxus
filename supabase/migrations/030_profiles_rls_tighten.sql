-- ============================================================================
-- 030_profiles_rls_tighten.sql
--
-- SECURITY FIX (P1): `public.profiles` was readable in full by every
-- authenticated user.
--
-- The policy created in `000_full_schema.sql` was:
--
--     CREATE POLICY "Auth can view profiles" ON public.profiles
--       FOR SELECT TO authenticated USING(true);
--
-- `profiles` holds `mobile_country_code`, `mobile_number`, `company`,
-- `designation`, `linkedin_url`, `company_website`, `industry`, `city_id`
-- and `two_factor_enabled`. With `USING(true)`, a single
-- `supabase.from('profiles').select('*')` from ANY signed-up account
-- returned the whole platform's user directory including phone numbers.
-- That is a cross-tenant PII disclosure, and it also meant the
-- `SuperAdminRoute` client-side gate was the only thing standing between a
-- normal user and the admin user-management roster.
--
-- This migration replaces that policy with a relationship-scoped one: you
-- may read a profile when you are that person, when you are a platform
-- admin, or when you and they share an actual context on the platform
-- (an organization, a community, or an event as organizer/attendee).
--
-- ── Compatibility: every existing cross-user read still works ───────────────
-- Verified against the call sites that read OTHER users' profiles:
--
--   src/pages/dashboard/SettingsPage.tsx:131,458      shared org      -> allowed
--   src/pages/dashboard/community/CommunityMembersPage.tsx:74
--                                                     shared community-> allowed
--   src/hooks/community/useCommunityFeed.ts:24,125     shared community-> allowed
--   src/hooks/community/useCommunityChat.ts:45,65      shared community-> allowed
--   src/lib/application-notify.ts:100                  shared org      -> allowed
--   src/pages/dashboard/admin/UserManagementPage.tsx:212,244
--                                                     platform admin  -> allowed
--   src/pages/dashboard/admin/PlatformAnalyticsPage.tsx:94
--                                                     platform admin  -> allowed
--
-- Self-reads (AuthContext, OrgContext, CompleteProfilePage, ProfilePage,
-- EventLivePage, ComposeMessageDialog, EventCommunicate) match the
-- `auth.uid() = user_id` branch.
--
-- Edge functions that read profiles (e.g. `livekit-token`) use the
-- service-role key, which bypasses RLS entirely and is unaffected.
--
-- ── Rollback ───────────────────────────────────────────────────────────────
-- This migration is fully reversible with no data change:
--
--     DROP POLICY IF EXISTS "Relationship-scoped profile read" ON public.profiles;
--     CREATE POLICY "Auth can view profiles" ON public.profiles
--       FOR SELECT TO authenticated USING(true);
--
-- Reverting restores the prior (insecure) behaviour exactly. No columns,
-- rows, or grants are altered by this file.
-- ============================================================================

-- ── Supporting index ───────────────────────────────────────────────────────
-- The organizer/attendee branches of `can_view_profile` join
-- `registrations` by `user_id`. `registrations` had indexes on `qr_code`,
-- `join_token`, the UTM columns and `(event_id, email)` — but none on
-- `user_id`, so those branches would sequential-scan. This index also
-- benefits the pre-existing "Attendee view own" / "Attendee cancel own"
-- RLS policies, which both filter `registrations.user_id = auth.uid()`.
-- CONCURRENTLY is deliberately NOT used: Supabase runs migrations inside a
-- transaction, where CONCURRENTLY is not permitted. `registrations` is
-- small enough that a brief ACCESS EXCLUSIVE lock at deploy time is
-- acceptable; if this table grows large, build the index out-of-band first
-- and this statement becomes a no-op thanks to IF NOT EXISTS.
CREATE INDEX IF NOT EXISTS idx_registrations_user_id
  ON public.registrations(user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_registrations_event_user
  ON public.registrations(event_id, user_id);

-- ── Visibility predicate ───────────────────────────────────────────────────
-- SECURITY DEFINER so the membership lookups inside are not themselves
-- subject to RLS on `org_members` / `community_members` / `registrations`,
-- which would otherwise recurse (reading a profile would require reading a
-- membership, whose own policy may read a profile). This mirrors the
-- existing `is_org_member` / `is_org_owner` / `can_moderate_community`
-- helpers in `000_full_schema.sql`.
--
-- STABLE (not VOLATILE) so the planner may cache the result per row within
-- a statement — important because this runs once per candidate row on a
-- bulk `.in('user_id', [...])` read.
--
-- Branch order is cheapest-first: the identity check and the single-row
-- role lookup resolve the overwhelming majority of calls before any join
-- is considered.
CREATE OR REPLACE FUNCTION public.can_view_profile(_viewer uuid, _target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- 1. Always your own profile.
    _viewer = _target
    -- 2. Platform admins (backs the /dashboard/admin surfaces).
    OR public.has_role(_viewer, 'admin')
    -- 3. Shared organization membership (team member lists, org directory).
    OR EXISTS (
      SELECT 1
        FROM public.org_members me
        JOIN public.org_members them ON them.org_id = me.org_id
       WHERE me.user_id = _viewer
         AND them.user_id = _target
    )
    -- 4. Org owner viewing a member of their org, and vice versa. Owners do
    --    not necessarily have an `org_members` row of their own.
    OR EXISTS (
      SELECT 1
        FROM public.organizations o
        JOIN public.org_members m ON m.org_id = o.id
       WHERE (o.owner_id = _viewer AND m.user_id = _target)
          OR (o.owner_id = _target AND m.user_id = _viewer)
    )
    -- 5. Shared community membership (feed authors, chat authors, member
    --    directory).
    OR EXISTS (
      SELECT 1
        FROM public.community_members me
        JOIN public.community_members them ON them.community_id = me.community_id
       WHERE me.user_id = _viewer
         AND them.user_id = _target
    )
    -- 6. Event organizer viewing one of their registrants.
    OR EXISTS (
      SELECT 1
        FROM public.events e
        JOIN public.registrations r ON r.event_id = e.id
       WHERE e.user_id = _viewer
         AND r.user_id = _target
    )
    -- 7. Registrant viewing the organizer of an event they registered for.
    OR EXISTS (
      SELECT 1
        FROM public.registrations r
        JOIN public.events e ON e.id = r.event_id
       WHERE r.user_id = _viewer
         AND e.user_id = _target
    );
$$;

COMMENT ON FUNCTION public.can_view_profile(uuid, uuid) IS
  'True when _viewer may read _target''s profiles row: self, platform admin, or a shared org / community / event-organizer relationship. SECURITY DEFINER to avoid recursive RLS through the membership tables. Backs the "Relationship-scoped profile read" policy on public.profiles.';

-- ── Swap the policy ────────────────────────────────────────────────────────
-- Dropped and recreated rather than ALTERed so this migration is
-- idempotent and safe to re-run.
DROP POLICY IF EXISTS "Auth can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Relationship-scoped profile read" ON public.profiles;

-- The two cheapest branches are inlined into the policy ahead of the
-- function call, and this is a deliberate performance decision rather than
-- redundancy:
--
--   * `auth.uid() = user_id` is a plain column comparison, no call overhead.
--   * `has_role(auth.uid(), 'admin')` depends only on the *viewer*, not on
--     the candidate row. Written here it is a row-independent expression,
--     so the planner evaluates it ONCE per statement and short-circuits the
--     whole scan for admins. Buried inside `can_view_profile(…, user_id)`
--     it would instead be re-evaluated per row, because the planner cannot
--     see which arguments the function body actually uses.
--
-- This matters for `/dashboard/admin/analytics`, which reads the entire
-- `profiles` table in one statement.
CREATE POLICY "Relationship-scoped profile read"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin')
    OR public.can_view_profile(auth.uid(), user_id)
  );

-- The write policies from `000_full_schema.sql` are already correctly
-- self-scoped (`auth.uid() = user_id`) and are intentionally left alone:
--   "Users update own profile" ... USING(auth.uid()=user_id)
--   "Users insert own profile" ... WITH CHECK(auth.uid()=user_id)
