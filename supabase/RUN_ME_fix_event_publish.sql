-- ═══════════════════════════════════════════════════════════════════════════════
-- Drafts can be published again, and four missing objects are restored.
--
-- Publishing (and deleting) an event failed with "infinite recursion detected
-- in policy for relation events". The UPDATE and DELETE policies on events
-- read organizations directly, and the organizations policy "Public view orgs
-- with published events" reads events, so Postgres saw events inside its own
-- policy check and refused. The SELECT policy already avoided this with
-- SECURITY DEFINER helpers; UPDATE and DELETE now do the same. Who may edit or
-- delete an event is unchanged:
--   • edit:   the creator, a platform admin, the workspace owner, or any
--             teammate who isn't a viewer;
--   • delete: the same, except teammates need owner, admin or member.
--
-- CHECK_schema_drift.sql also found four objects missing from the live
-- database. They are recreated as the repo defines them:
--   • my_applications()            a user's speaker and sponsor applications
--   • registrant_audit_log         plus log_registrant_action(), the delete /
--                                  restore history of registrants
--   • event_creative_ai_drafts     saved AI copy for creatives (and the
--                                  per-event daily AI quota)
--
-- Safe to run more than once. Paste into the SQL Editor and Run.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. A teammate's role, read without row security ─────────────────────────
-- NULL when the user isn't in org_members for that workspace; a row with no
-- role counts as 'member', as the policies always assumed.
CREATE OR REPLACE FUNCTION public.org_member_role(_user_id uuid, _org_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(m.role, 'member')
    FROM public.org_members m
   WHERE m.org_id = _org_id AND m.user_id = _user_id
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.org_member_role(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_member_role(uuid, uuid) TO authenticated, service_role;

-- ── 2. events: UPDATE and DELETE without reading organizations directly ─────
DROP POLICY IF EXISTS "Update events" ON public.events;
CREATE POLICY "Update events"
ON public.events
FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  OR has_role(auth.uid(), 'admin')
  OR (
    events.org_id IS NOT NULL
    AND (
      is_org_owner(auth.uid(), events.org_id)
      OR org_member_role(auth.uid(), events.org_id) <> 'viewer'
    )
  )
)
WITH CHECK (
  auth.uid() = user_id
  OR has_role(auth.uid(), 'admin')
  OR (
    events.org_id IS NOT NULL
    AND (
      is_org_owner(auth.uid(), events.org_id)
      OR org_member_role(auth.uid(), events.org_id) <> 'viewer'
    )
  )
);

DROP POLICY IF EXISTS "Delete events" ON public.events;
CREATE POLICY "Delete events"
ON public.events
FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  OR has_role(auth.uid(), 'admin')
  OR (
    events.org_id IS NOT NULL
    AND (
      is_org_owner(auth.uid(), events.org_id)
      OR org_member_role(auth.uid(), events.org_id) IN ('owner', 'admin', 'member')
    )
  )
);

COMMENT ON POLICY "Update events" ON public.events IS
  'UPDATE events: creator, platform admin, org owner, or any non-viewer org_member. Uses SECURITY DEFINER helpers so the check never reads organizations (whose policy reads events) and cannot recurse.';
COMMENT ON POLICY "Delete events" ON public.events IS
  'DELETE events: creator, platform admin, org owner, or an org_member with role owner, admin or member. Uses SECURITY DEFINER helpers to avoid policy recursion.';

-- ── 3. my_applications ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.my_applications()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'speaker', COALESCE((SELECT jsonb_agg(to_jsonb(sa) ORDER BY sa.created_at DESC) FROM (
      SELECT sa.id, sa.event_id, sa.session_title, sa.expertise, sa.status, sa.rejection_reason,
             sa.created_at, sa.updated_at, e.title as event_title, e.date as event_date, e.image_url
      FROM speaker_applications sa
      JOIN events e ON e.id = sa.event_id
      WHERE sa.user_id = auth.uid()
    ) sa), '[]'::jsonb),
    'sponsor', COALESCE((SELECT jsonb_agg(to_jsonb(sp) ORDER BY sp.created_at DESC) FROM (
      SELECT sp.id, sp.event_id, sp.company_name, sp.sponsorship_tier, sp.status, sp.rejection_reason,
             sp.created_at, sp.updated_at, e.title as event_title, e.date as event_date, e.image_url
      FROM sponsor_applications sp
      JOIN events e ON e.id = sp.event_id
      WHERE sp.user_id = auth.uid()
    ) sp), '[]'::jsonb)
  );
$$;
GRANT EXECUTE ON FUNCTION public.my_applications() TO authenticated;

-- ── 4. registrant_audit_log and log_registrant_action ───────────────────────
CREATE TABLE IF NOT EXISTS public.registrant_audit_log (
  id          uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action      text          NOT NULL,
  reg_id      text          NOT NULL,  -- uuid stored as text to survive deleted rows
  actor_id    uuid          REFERENCES auth.users(id) ON DELETE SET NULL,
  details     jsonb         NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz   NOT NULL DEFAULT now()
);
ALTER TABLE public.registrant_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read audit log" ON public.registrant_audit_log;
CREATE POLICY "Admins read audit log" ON public.registrant_audit_log
  FOR SELECT TO authenticated
  USING(has_role(auth.uid(), 'admin'));
GRANT INSERT ON public.registrant_audit_log TO authenticated;
GRANT SELECT ON public.registrant_audit_log TO authenticated;

CREATE OR REPLACE FUNCTION public.log_registrant_action(
  _action          text,
  _registration_id uuid,
  _details         jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.registrant_audit_log(action, reg_id, actor_id, details)
  VALUES (_action, _registration_id::text, auth.uid(), COALESCE(_details, '{}'::jsonb));
EXCEPTION WHEN OTHERS THEN
  -- Audit failure must never break the calling operation.
  NULL;
END;
$$;
GRANT EXECUTE ON FUNCTION public.log_registrant_action(text, uuid, jsonb) TO authenticated;

-- ── 5. event_creative_ai_drafts ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_creative_ai_drafts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  entity_type   text NOT NULL CHECK (entity_type IN ('event', 'speaker', 'sponsor', 'combo')),
  entity_id     uuid,
  copy          jsonb NOT NULL,
  source        text NOT NULL DEFAULT 'on_demand' CHECK (source IN ('on_demand', 'auto_publish')),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'dismissed')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS event_creative_ai_drafts_event_idx
  ON public.event_creative_ai_drafts(event_id);
CREATE INDEX IF NOT EXISTS event_creative_ai_drafts_pending_idx
  ON public.event_creative_ai_drafts(event_id, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS event_creative_ai_drafts_quota_idx
  ON public.event_creative_ai_drafts(event_id, created_at DESC);
ALTER TABLE public.event_creative_ai_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner manage event_creative_ai_drafts" ON public.event_creative_ai_drafts;
CREATE POLICY "Owner manage event_creative_ai_drafts"
  ON public.event_creative_ai_drafts
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_creative_ai_drafts.event_id
        AND (e.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_creative_ai_drafts.event_id
        AND (e.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
    )
  );
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_creative_ai_drafts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_creative_ai_drafts TO service_role;

DROP TRIGGER IF EXISTS event_creative_ai_drafts_updated_at ON public.event_creative_ai_drafts;
CREATE TRIGGER event_creative_ai_drafts_updated_at
  BEFORE UPDATE ON public.event_creative_ai_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 6. Two-factor rule on the recreated tables ──────────────────────────────
-- Every table with row security carries this policy (F-03); tables created
-- after that fix need it added.
DO $$
DECLARE t text;
BEGIN
  IF to_regprocedure('public.mfa_satisfied()') IS NULL THEN RETURN; END IF;
  FOREACH t IN ARRAY ARRAY['registrant_audit_log', 'event_creative_ai_drafts'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Require two-factor when enabled" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "Require two-factor when enabled" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING ((SELECT public.mfa_satisfied())) WITH CHECK ((SELECT public.mfa_satisfied()))',
      t
    );
  END LOOP;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
