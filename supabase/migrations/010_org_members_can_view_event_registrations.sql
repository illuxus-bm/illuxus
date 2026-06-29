-- ─────────────────────────────────────────────────────────────────────────────
-- 010_org_members_can_view_event_registrations.sql
--
-- Closes a long-standing visibility gap: when an organisation has multiple
-- team members and one of them creates an event, ONLY that creator (or a
-- platform admin) could see the registrations. Any other member of the same
-- organisation — including the org owner — got back zero rows from the
-- registrations table because the original RLS policy keyed off
-- `events.user_id` alone.
--
-- This is the bug behind reports like "I see Total: 4 in Registrations but
-- the Pending Approvals tab is empty even though an attendee just requested
-- to join" — the new pending row exists in the DB but RLS hides it from
-- everyone except the event creator.
--
-- The fix extends every registrations policy (SELECT / UPDATE / DELETE) to
-- also allow:
--   • Any member of the event's organisation (via org_members)
--   • Any user who is also the organisation's owner directly (legacy fallback)
--
-- INSERT stays as-is — attendees still register themselves.
--
-- Idempotent: drops the old policies before recreating with the same names so
-- the migration can be re-run safely.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── SELECT ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Owner view regs" ON public.registrations;
CREATE POLICY "Owner view regs"
ON public.registrations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
      FROM public.events e
      LEFT JOIN public.organizations o ON o.id = e.org_id
      LEFT JOIN public.org_members  m ON m.org_id = e.org_id AND m.user_id = auth.uid()
     WHERE e.id = registrations.event_id
       AND (
            e.user_id = auth.uid()                    -- event creator
         OR o.owner_id = auth.uid()                   -- organisation owner
         OR m.user_id IS NOT NULL                     -- any org_members row for this user
         OR has_role(auth.uid(), 'admin')             -- platform admin
       )
  )
);

-- ── UPDATE ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Owner update regs" ON public.registrations;
CREATE POLICY "Owner update regs"
ON public.registrations
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
      FROM public.events e
      LEFT JOIN public.organizations o ON o.id = e.org_id
      LEFT JOIN public.org_members  m ON m.org_id = e.org_id AND m.user_id = auth.uid()
     WHERE e.id = registrations.event_id
       AND (
            e.user_id = auth.uid()
         OR o.owner_id = auth.uid()
         OR (m.user_id IS NOT NULL AND COALESCE(m.role, 'member') <> 'viewer')
         OR has_role(auth.uid(), 'admin')
       )
  )
);

-- ── DELETE ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Owner delete regs" ON public.registrations;
CREATE POLICY "Owner delete regs"
ON public.registrations
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
      FROM public.events e
      LEFT JOIN public.organizations o ON o.id = e.org_id
      LEFT JOIN public.org_members  m ON m.org_id = e.org_id AND m.user_id = auth.uid()
     WHERE e.id = registrations.event_id
       AND (
            e.user_id = auth.uid()
         OR o.owner_id = auth.uid()
         OR (m.user_id IS NOT NULL AND COALESCE(m.role, 'member') IN ('admin', 'member'))
         OR has_role(auth.uid(), 'admin')
       )
  )
);

-- ── Audit-friendly comments so future engineers can find this quickly ───────
COMMENT ON POLICY "Owner view regs"   ON public.registrations IS
  'SELECT registrations: event creator, org owner, any org_member, or platform admin.';
COMMENT ON POLICY "Owner update regs" ON public.registrations IS
  'UPDATE registrations: event creator, org owner, org_members with role admin/member (NOT viewer), or platform admin.';
COMMENT ON POLICY "Owner delete regs" ON public.registrations IS
  'DELETE registrations: event creator, org owner, org_members with role admin/member (NOT viewer), or platform admin.';
