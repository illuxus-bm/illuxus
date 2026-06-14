-- ============================================================================
-- Phase 5 — Community integration + role-based gating + retry
-- ----------------------------------------------------------------------------
-- This migration:
--   1. Lets community managers / moderators compose communications scoped to
--      a community (event_id NULL, community_id NOT NULL).
--   2. Adds a community-scoped recipient resolver mirroring the event one.
--   3. Teaches `_communications_dispatch_impl` to pick the right resolver
--      based on which scope the comm has set.
--   4. Adds a "retry only failed recipients" RPC for partial-failure recovery
--      (typically a few WhatsApp recipients failing inside an otherwise sent
--      communication).
-- ============================================================================

-- ── 1. Schema: connect community_id to communities ──────────────────────────
-- The original 009 migration declared community_id as plain uuid (no FK)
-- because the communities table was reserved for a later phase. Add the FK
-- now that the table exists.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'communications_community_id_fkey'
  ) THEN
    ALTER TABLE public.communications
      ADD CONSTRAINT communications_community_id_fkey
      FOREIGN KEY (community_id) REFERENCES public.communities(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS communications_community_idx
  ON public.communications(community_id, created_at DESC) WHERE community_id IS NOT NULL;

-- A communication must have exactly one scope: event_id XOR community_id.
-- This prevents accidental cross-pollination once we start dispatching.
ALTER TABLE public.communications
  DROP CONSTRAINT IF EXISTS communications_scope_check;
ALTER TABLE public.communications
  ADD  CONSTRAINT communications_scope_check
       CHECK (
         (event_id IS NOT NULL AND community_id IS NULL)
         OR (event_id IS NULL AND community_id IS NOT NULL)
       );

-- ── 2. RLS: extend org-member policies to include community managers ───────
-- The base policies from 009 already cover org members. Add parallel policies
-- so a community manager / moderator can manage comms scoped to their
-- community even if they aren't org_members of the parent org.
DROP POLICY IF EXISTS "Community managers view communications" ON public.communications;
CREATE POLICY "Community managers view communications" ON public.communications
  FOR SELECT TO authenticated
  USING (
    community_id IS NOT NULL
    AND public.can_moderate_community(auth.uid(), community_id)
  );

DROP POLICY IF EXISTS "Community managers insert communications" ON public.communications;
CREATE POLICY "Community managers insert communications" ON public.communications
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND community_id IS NOT NULL
    AND public.can_moderate_community(auth.uid(), community_id)
  );

DROP POLICY IF EXISTS "Community managers update communications" ON public.communications;
CREATE POLICY "Community managers update communications" ON public.communications
  FOR UPDATE TO authenticated
  USING (
    community_id IS NOT NULL
    AND public.can_moderate_community(auth.uid(), community_id)
  );

DROP POLICY IF EXISTS "Community managers delete communications" ON public.communications;
CREATE POLICY "Community managers delete communications" ON public.communications
  FOR DELETE TO authenticated
  USING (
    community_id IS NOT NULL
    AND public.can_moderate_community(auth.uid(), community_id)
  );

-- Recipient rows: same extension — community managers should be able to read
-- their own communication's delivery rows.
DROP POLICY IF EXISTS "Community managers view comm recipients" ON public.communication_recipients;
CREATE POLICY "Community managers view comm recipients" ON public.communication_recipients
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.communications c
       WHERE c.id = communication_recipients.communication_id
         AND c.community_id IS NOT NULL
         AND public.can_moderate_community(auth.uid(), c.community_id)
    )
  );


-- ── 3. Community recipient resolver ────────────────────────────────────────
-- Filter shape:
--   { "types": ["all_members"|"managers"|"moderators"|"organizers"|"mentors"|
--               "speakers"|"sponsors"|"custom"],
--     "user_ids": ["..."] }
--
-- Email comes from auth.users (profiles.email doesn't exist in this schema).
-- Phone comes from profiles.{mobile_country_code, mobile_number}.
CREATE OR REPLACE FUNCTION public.communications_resolve_community_recipients(
  _community_id uuid,
  _filter       jsonb
) RETURNS TABLE (
  user_id uuid,
  name    text,
  email   text,
  phone   text
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  _types     text[];
  _user_ids  uuid[];
BEGIN
  _types := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(_filter -> 'types', '[]'::jsonb))),
    ARRAY[]::text[]
  );
  _user_ids := COALESCE(
    ARRAY(SELECT (jsonb_array_elements_text(COALESCE(_filter -> 'user_ids', '[]'::jsonb)))::uuid),
    ARRAY[]::uuid[]
  );

  -- Authorisation: only managers / moderators / admins can read members.
  IF NOT can_moderate_community(auth.uid(), _community_id) THEN
    RAISE EXCEPTION 'Not authorised to read community members';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT cm.user_id,
           cm.role,
           COALESCE(
             NULLIF(trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), ''),
             p.display_name,
             p.username,
             split_part(u.email,'@',1)
           ) AS name,
           lower(u.email) AS email,
           NULLIF(trim(coalesce(p.mobile_country_code,'') || ' ' || coalesce(p.mobile_number,'')), '') AS phone
      FROM community_members cm
      JOIN auth.users u ON u.id = cm.user_id
      LEFT JOIN profiles p ON p.user_id = cm.user_id
     WHERE cm.community_id = _community_id
       AND cm.status = 'active'
  ),
  filtered AS (
    SELECT b.user_id, b.name, b.email, b.phone, b.role
      FROM base b
     WHERE
       'all_members' = ANY(_types)
       OR ('managers'   = ANY(_types) AND b.role = 'manager'::community_role)
       OR ('moderators' = ANY(_types) AND b.role = 'moderator'::community_role)
       OR ('organizers' = ANY(_types) AND b.role = 'organizer'::community_role)
       OR ('mentors'    = ANY(_types) AND b.role = 'mentor'::community_role)
       OR ('speakers'   = ANY(_types) AND b.role = 'speaker'::community_role)
       OR ('sponsors'   = ANY(_types) AND b.role = 'sponsor'::community_role)
       OR ('custom'     = ANY(_types) AND b.user_id = ANY(_user_ids))
  )
  SELECT DISTINCT ON (lower(coalesce(f.email,'')))
         f.user_id, f.name, f.email, f.phone
    FROM filtered f
   WHERE f.email IS NOT NULL AND f.email <> ''
   ORDER BY lower(coalesce(f.email,'')), f.user_id NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION
  public.communications_resolve_community_recipients(uuid, jsonb) TO authenticated;

-- ── 4. Update dispatch impl to pick the right resolver ─────────────────────
CREATE OR REPLACE FUNCTION public._communications_dispatch_impl(_communication_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _comm           communications%ROWTYPE;
  _recipient_count int := 0;
  _now             timestamptz := now();
  _has_email       boolean;
  _has_whatsapp    boolean;
BEGIN
  SELECT * INTO _comm FROM communications WHERE id = _communication_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Communication % not found', _communication_id;
  END IF;

  IF _comm.status NOT IN ('draft', 'scheduled', 'failed') THEN
    RAISE EXCEPTION 'Communication is in % state and cannot be dispatched', _comm.status;
  END IF;

  _has_email    := 'email'    = ANY(_comm.channels);
  _has_whatsapp := 'whatsapp' = ANY(_comm.channels);

  UPDATE communications
     SET status = 'sending', updated_at = _now
   WHERE id = _communication_id;

  -- Fresh fan-out: clear any previous recipient rows from a failed attempt.
  DELETE FROM communication_recipients WHERE communication_id = _communication_id;

  -- Pick resolver based on scope (one of event_id / community_id is NOT NULL,
  -- enforced by communications_scope_check).
  IF _comm.event_id IS NOT NULL THEN
    WITH resolved AS (
      SELECT * FROM communications_resolve_recipients(_comm.event_id, _comm.recipient_filter)
    ),
    inserted AS (
      INSERT INTO communication_recipients (
        communication_id, user_id, email, phone, name,
        email_status, email_sent_at,
        whatsapp_status
      )
      SELECT _communication_id, r.user_id, r.email, r.phone, r.name,
             CASE WHEN _has_email AND r.email IS NOT NULL THEN 'sent' ELSE NULL END,
             CASE WHEN _has_email AND r.email IS NOT NULL THEN _now ELSE NULL END,
             CASE WHEN _has_whatsapp AND r.phone IS NOT NULL THEN 'pending' ELSE NULL END
        FROM resolved r
      RETURNING 1
    )
    SELECT count(*) INTO _recipient_count FROM inserted;
  ELSE
    WITH resolved AS (
      SELECT * FROM communications_resolve_community_recipients(_comm.community_id, _comm.recipient_filter)
    ),
    inserted AS (
      INSERT INTO communication_recipients (
        communication_id, user_id, email, phone, name,
        email_status, email_sent_at,
        whatsapp_status
      )
      SELECT _communication_id, r.user_id, r.email, r.phone, r.name,
             CASE WHEN _has_email AND r.email IS NOT NULL THEN 'sent' ELSE NULL END,
             CASE WHEN _has_email AND r.email IS NOT NULL THEN _now ELSE NULL END,
             CASE WHEN _has_whatsapp AND r.phone IS NOT NULL THEN 'pending' ELSE NULL END
        FROM resolved r
      RETURNING 1
    )
    SELECT count(*) INTO _recipient_count FROM inserted;
  END IF;

  UPDATE communications
     SET status          = 'sent',
         recipient_count = _recipient_count,
         sent_count      = _recipient_count,
         failed_count    = 0,
         sent_at         = _now,
         updated_at      = _now
   WHERE id = _communication_id;

  RETURN jsonb_build_object(
    'communication_id', _communication_id,
    'recipient_count', _recipient_count,
    'channels', to_jsonb(_comm.channels),
    'sent_at', _now
  );
END;
$$;

-- ── 5. Update user-facing dispatch auth to include community managers ──────
CREATE OR REPLACE FUNCTION public.communications_dispatch(_communication_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _comm communications%ROWTYPE;
  _allowed boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;

  SELECT * INTO _comm FROM communications WHERE id = _communication_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Communication % not found', _communication_id;
  END IF;

  -- Org members can dispatch event-scoped comms; community managers can
  -- dispatch community-scoped comms; admins can dispatch anything.
  IF _comm.event_id IS NOT NULL THEN
    _allowed := EXISTS (
      SELECT 1 FROM org_members om
       WHERE om.org_id = _comm.org_id AND om.user_id = auth.uid()
    );
  ELSIF _comm.community_id IS NOT NULL THEN
    _allowed := can_moderate_community(auth.uid(), _comm.community_id);
  END IF;

  IF NOT _allowed AND NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorised to dispatch this communication';
  END IF;

  RETURN _communications_dispatch_impl(_communication_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.communications_dispatch(uuid) TO authenticated;

-- Same auth model for schedule / unschedule.
CREATE OR REPLACE FUNCTION public.communications_schedule(
  _communication_id uuid,
  _scheduled_for    timestamptz
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _comm communications%ROWTYPE;
  _allowed boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;
  IF _scheduled_for IS NULL THEN RAISE EXCEPTION 'scheduled_for is required'; END IF;
  IF _scheduled_for <= now() THEN RAISE EXCEPTION 'scheduled_for must be in the future'; END IF;

  SELECT * INTO _comm FROM communications WHERE id = _communication_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Communication % not found', _communication_id; END IF;

  IF _comm.event_id IS NOT NULL THEN
    _allowed := EXISTS (
      SELECT 1 FROM org_members om
       WHERE om.org_id = _comm.org_id AND om.user_id = auth.uid()
    );
  ELSIF _comm.community_id IS NOT NULL THEN
    _allowed := can_moderate_community(auth.uid(), _comm.community_id);
  END IF;
  IF NOT _allowed AND NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  IF _comm.status NOT IN ('draft', 'scheduled', 'failed') THEN
    RAISE EXCEPTION 'Communication is in % state and cannot be scheduled', _comm.status;
  END IF;

  UPDATE communications
     SET status = 'scheduled', scheduled_for = _scheduled_for, updated_at = now()
   WHERE id = _communication_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.communications_schedule(uuid, timestamptz) TO authenticated;


-- ── 6. Retry only failed recipients (partial-failure recovery) ──────────────
-- Resets failed recipient rows back to pending for the given channel.
-- The frontend can then re-invoke the relevant edge function (send-whatsapp
-- for now; send-email when wired). Returns the number of rows reset.
CREATE OR REPLACE FUNCTION public.communications_retry_failed(
  _communication_id uuid,
  _channel          text DEFAULT 'whatsapp'
) RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _comm communications%ROWTYPE;
  _allowed boolean := false;
  _reset int := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;
  IF _channel NOT IN ('email','whatsapp') THEN
    RAISE EXCEPTION 'Invalid channel: %', _channel;
  END IF;

  SELECT * INTO _comm FROM communications WHERE id = _communication_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Communication % not found', _communication_id; END IF;

  IF _comm.event_id IS NOT NULL THEN
    _allowed := EXISTS (
      SELECT 1 FROM org_members om
       WHERE om.org_id = _comm.org_id AND om.user_id = auth.uid()
    );
  ELSIF _comm.community_id IS NOT NULL THEN
    _allowed := can_moderate_community(auth.uid(), _comm.community_id);
  END IF;
  IF NOT _allowed AND NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  IF _channel = 'whatsapp' THEN
    UPDATE communication_recipients
       SET whatsapp_status = 'pending', error_message = NULL
     WHERE communication_id = _communication_id
       AND whatsapp_status = 'failed';
    GET DIAGNOSTICS _reset = ROW_COUNT;
  ELSE
    UPDATE communication_recipients
       SET email_status = 'pending', error_message = NULL
     WHERE communication_id = _communication_id
       AND email_status = 'failed';
    GET DIAGNOSTICS _reset = ROW_COUNT;
  END IF;

  RETURN _reset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.communications_retry_failed(uuid, text) TO authenticated;
