-- Security fixes

-- 1) Restrict org_followers SELECT to authenticated users (no anon enumeration)
DROP POLICY IF EXISTS "Anyone can view org followers" ON public.org_followers;
CREATE POLICY "Authenticated users can view org followers"
ON public.org_followers
FOR SELECT
TO authenticated
USING (true);

-- 2) Hide speaker/sponsor email from anonymous public via column-level privileges.
-- RLS already gates which rows anon may see; column-level REVOKE prevents anon
-- from selecting the email column at all.
REVOKE SELECT (email) ON public.speakers FROM anon;
REVOKE SELECT (email) ON public.sponsors FROM anon;

-- 3) Limit registrations realtime publication to non-PII columns. All
-- subscribers only use the event to trigger a refetch (which is RLS-scoped
-- via REST), so removing PII from the replication stream eliminates the
-- realtime PII broadcast risk while keeping change notifications working.
ALTER PUBLICATION supabase_realtime DROP TABLE public.registrations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.registrations
  (id, event_id, user_id, status, approval_status, checked_in, checked_in_at,
   attendance_state, active_session_id, active_session_started_at,
   last_in_at, last_out_at, total_minutes, created_at, updated_at);
