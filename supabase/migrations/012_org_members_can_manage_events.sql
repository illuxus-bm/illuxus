-- ─────────────────────────────────────────────────────────────────────────────
-- 012_org_members_can_manage_events.sql
--
-- Closes the manage-event editing gap. Before this migration, the events
-- table's RLS policies (UPDATE / DELETE) only allowed the original creator
-- (`events.user_id = auth.uid()`) or a platform admin to modify a row. When
-- a workspace owner, admin, or member — i.e. anyone except the literal
-- creator — opened the Manage Event → Settings tab on an event created by a
-- teammate, the form loaded fine but pressing "Save changes" silently
-- affected zero rows. Supabase does NOT raise an error for an RLS-blocked
-- UPDATE; the request returns 200 with an empty `data`, so the UI shows the
-- success toast and reloading reverts to the previous values.
--
-- Mirrors the pattern used in 010_org_members_can_view_event_registrations.sql.
-- Extends SELECT (so drafts authored by a teammate are visible to the rest
-- of the org), UPDATE (same audience, viewer excluded), and DELETE
-- (owner / admin / member only) to all org_members of the event's org.
--
-- INSERT keeps the existing predicate from 006_admin_activity_log.sql which
-- already covers banned-user enforcement.
--
-- Idempotent: drops the old policies by their original names before
-- recreating, so the migration can be re-run safely.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── SELECT ───────────────────────────────────────────────────────────────────
-- Drafts authored by a teammate must be visible to the workspace owner and
-- to every org_members row. Public/published events stay world-readable so
-- the marketing site continues to work.
DROP POLICY IF EXISTS "View published events" ON public.events;
CREATE POLICY "View published events"
ON public.events
FOR SELECT
TO anon, authenticated
USING (
  status = 'published'
  OR auth.uid() = user_id
  OR has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1
      FROM public.organizations o
      LEFT JOIN public.org_members m
        ON m.org_id = o.id AND m.user_id = auth.uid()
     WHERE o.id = events.org_id
       AND (o.owner_id = auth.uid() OR m.user_id IS NOT NULL)
  )
);

-- ── UPDATE ───────────────────────────────────────────────────────────────────
-- Anyone with a non-viewer org_members role can edit the event. Viewers stay
-- read-only. Platform admins and the canonical workspace owner keep access.
DROP POLICY IF EXISTS "Update events" ON public.events;
CREATE POLICY "Update events"
ON public.events
FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  OR has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1
      FROM public.organizations o
      LEFT JOIN public.org_members m
        ON m.org_id = o.id AND m.user_id = auth.uid()
     WHERE o.id = events.org_id
       AND (
            o.owner_id = auth.uid()
         OR (m.user_id IS NOT NULL AND COALESCE(m.role, 'member') <> 'viewer')
       )
  )
)
WITH CHECK (
  auth.uid() = user_id
  OR has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1
      FROM public.organizations o
      LEFT JOIN public.org_members m
        ON m.org_id = o.id AND m.user_id = auth.uid()
     WHERE o.id = events.org_id
       AND (
            o.owner_id = auth.uid()
         OR (m.user_id IS NOT NULL AND COALESCE(m.role, 'member') <> 'viewer')
       )
  )
);

-- ── DELETE ───────────────────────────────────────────────────────────────────
-- Destructive, so member is allowed (matches 010's behaviour for
-- registrations) but viewers explicitly cannot.
DROP POLICY IF EXISTS "Delete events" ON public.events;
CREATE POLICY "Delete events"
ON public.events
FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  OR has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1
      FROM public.organizations o
      LEFT JOIN public.org_members m
        ON m.org_id = o.id AND m.user_id = auth.uid()
     WHERE o.id = events.org_id
       AND (
            o.owner_id = auth.uid()
         OR (m.user_id IS NOT NULL AND COALESCE(m.role, 'member') IN ('owner', 'admin', 'member'))
       )
  )
);

-- ── Audit comments ───────────────────────────────────────────────────────────
COMMENT ON POLICY "View published events" ON public.events IS
  'SELECT events: anyone for published; otherwise creator, platform admin, org owner, or any org_member.';
COMMENT ON POLICY "Update events" ON public.events IS
  'UPDATE events: creator, platform admin, org owner, or org_members with role owner/admin/member (NOT viewer).';
COMMENT ON POLICY "Delete events" ON public.events IS
  'DELETE events: creator, platform admin, org owner, or org_members with role owner/admin/member (NOT viewer).';
