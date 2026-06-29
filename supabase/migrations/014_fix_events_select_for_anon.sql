-- ─────────────────────────────────────────────────────────────────────────────
-- 014_fix_events_select_for_anon.sql
--
-- Repairs a regression introduced by 012_org_members_can_manage_events.sql.
--
-- 012 widened the events SELECT policy so workspace teammates could see draft
-- events authored by colleagues. The new predicate referenced
-- `public.org_members` directly inside an EXISTS / LEFT JOIN. That works for
-- authenticated callers — they have `GRANT SELECT ON org_members` — but
-- anonymous (public) callers do not. Postgres evaluates a RLS policy as the
-- caller's role; when anon hits /discover, /events, or any public event
-- listing, the SELECT policy fails permission checks on org_members and the
-- entire row is hidden, even though `status = 'published'` would have matched
-- on its own.
--
-- Net effect: every public events listing went empty after 012 was applied.
--
-- Fix
-- ────
-- Switch from raw table references to the existing SECURITY DEFINER helpers
-- `is_org_member` and `is_org_owner` (defined in 000_full_schema.sql + 007).
-- SECURITY DEFINER functions execute with the function owner's privileges,
-- which bypasses both the missing GRANT and the org_members RLS — exactly
-- what RLS policies need when they have to "look across" tables a caller
-- doesn't otherwise own.
--
-- UPDATE / DELETE policies from 012 stay as-is — they're scoped `TO
-- authenticated`, who do have access to org_members, so they were never
-- broken.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "View published events" ON public.events;
CREATE POLICY "View published events"
ON public.events
FOR SELECT
TO anon, authenticated
USING (
  status = 'published'
  OR auth.uid() = user_id
  OR has_role(auth.uid(), 'admin')
  OR (
    auth.uid() IS NOT NULL
    AND events.org_id IS NOT NULL
    AND (
      is_org_owner(auth.uid(), events.org_id)
      OR is_org_member(auth.uid(), events.org_id)
    )
  )
);

COMMENT ON POLICY "View published events" ON public.events IS
  'SELECT events: anyone for published rows; otherwise creator, platform admin, org owner (canonical or via org_members.role=owner), or any org_member. Uses SECURITY DEFINER helpers so anon callers do not need direct access to org_members.';
