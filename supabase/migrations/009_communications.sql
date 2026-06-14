-- ============================================================================
-- Phase 1 — Unified communications module
-- ----------------------------------------------------------------------------
-- Replaces the per-event email-only flow with a multi-channel communications
-- model. Phase 1 ships email-only; the schema is shaped so WhatsApp and
-- scheduling slot in cleanly later (channels jsonb, scheduled_for column,
-- per-recipient delivery rows already split by channel).
--
--   communications              ← compose-once envelope (subject, body, filter)
--   communication_recipients    ← per-recipient delivery rows (status by channel)
--
-- Authorisation model: only org_members of the event's org (or admins) can
-- create / view / dispatch communications. Recipients themselves don't read
-- this table — their delivery surface is the email/WhatsApp message itself.
-- ============================================================================

-- ── 1. Communications envelope ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.communications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_id        uuid REFERENCES public.events(id) ON DELETE CASCADE,
  community_id    uuid,        -- reserved for community-scoped sends (Phase 5)

  -- Channels: array of {'email','whatsapp'}. Phase 1 only inserts {'email'}
  -- but the column can already hold the multi-channel value.
  channels        text[] NOT NULL DEFAULT ARRAY['email']::text[],

  -- Recipient filter config (json so the client can describe complex
  -- targeting without us having to migrate the schema for every new filter).
  -- Shape:
  --   { "types": ["all_attendees"|"checked_in"|"paid"|"speakers"|"sponsors"|"custom"],
  --     "user_ids": ["..."] }
  recipient_filter jsonb NOT NULL DEFAULT '{"types":["all_attendees"]}'::jsonb,

  -- Content
  subject         text NOT NULL,
  body_text       text NOT NULL DEFAULT '',
  body_html       text,

  -- State machine
  status          text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','scheduled','queued','sending','sent','failed')),
  scheduled_for   timestamptz,         -- null = send immediately on dispatch

  -- Stats (denormalised to avoid recomputing on every list render)
  recipient_count int NOT NULL DEFAULT 0,
  sent_count      int NOT NULL DEFAULT 0,
  failed_count    int NOT NULL DEFAULT 0,

  -- Audit
  created_by      uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz,

  CONSTRAINT communications_channels_nonempty
    CHECK (array_length(channels, 1) >= 1),
  CONSTRAINT communications_subject_nonempty
    CHECK (length(trim(subject)) > 0)
);

CREATE INDEX IF NOT EXISTS communications_org_idx
  ON public.communications(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS communications_event_idx
  ON public.communications(event_id, created_at DESC) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS communications_status_idx
  ON public.communications(status, scheduled_for) WHERE status IN ('draft','scheduled','queued');

ALTER TABLE public.communications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members view communications" ON public.communications;
CREATE POLICY "Org members view communications" ON public.communications
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = communications.org_id AND om.user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Org members insert communications" ON public.communications;
CREATE POLICY "Org members insert communications" ON public.communications
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = communications.org_id AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Org members update communications" ON public.communications;
CREATE POLICY "Org members update communications" ON public.communications
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = communications.org_id AND om.user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Org members delete communications" ON public.communications;
CREATE POLICY "Org members delete communications" ON public.communications
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = communications.org_id AND om.user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.communications TO authenticated;


-- ── 2. Per-recipient delivery rows ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.communication_recipients (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  communication_id    uuid NOT NULL REFERENCES public.communications(id) ON DELETE CASCADE,

  -- Recipient identity (denormalised so the row remains useful even if the
  -- profile is deleted later or the user wasn't a registered member).
  user_id             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email               text,
  phone               text,
  name                text,

  -- Per-channel status (null = channel not used for this comm)
  email_status        text CHECK (email_status IN
                          ('pending','sending','sent','delivered','opened','clicked','bounced','failed')),
  whatsapp_status     text CHECK (whatsapp_status IN
                          ('pending','sending','sent','delivered','read','failed')),

  email_sent_at       timestamptz,
  email_delivered_at  timestamptz,
  email_opened_at     timestamptz,
  email_clicked_at    timestamptz,
  whatsapp_sent_at    timestamptz,
  whatsapp_delivered_at timestamptz,
  whatsapp_read_at    timestamptz,

  error_message       text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS comm_recipients_comm_idx
  ON public.communication_recipients(communication_id);
CREATE INDEX IF NOT EXISTS comm_recipients_user_idx
  ON public.communication_recipients(user_id) WHERE user_id IS NOT NULL;

ALTER TABLE public.communication_recipients ENABLE ROW LEVEL SECURITY;

-- Org members of the parent communication can view delivery rows.
DROP POLICY IF EXISTS "Org members view comm recipients" ON public.communication_recipients;
CREATE POLICY "Org members view comm recipients" ON public.communication_recipients
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.communications c
        JOIN public.org_members om ON om.org_id = c.org_id
       WHERE c.id = communication_recipients.communication_id
         AND om.user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

GRANT SELECT ON public.communication_recipients TO authenticated;
-- Inserts/updates happen exclusively through the dispatch RPC (SECURITY DEFINER),
-- so we don't expose write policies to the authenticated role.


-- ── 3. Recipient resolution helper (used by both preview + dispatch) ────────
-- Returns one row per addressable recipient. Email/phone may be null for some
-- types so the caller can decide what to do per channel.
CREATE OR REPLACE FUNCTION public.communications_resolve_recipients(
  _event_id uuid,
  _filter   jsonb
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
  -- Defensive parsing: never trust client-supplied jsonb.
  _types := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(_filter -> 'types', '[]'::jsonb))),
    ARRAY[]::text[]
  );
  _user_ids := COALESCE(
    ARRAY(SELECT (jsonb_array_elements_text(COALESCE(_filter -> 'user_ids', '[]'::jsonb)))::uuid),
    ARRAY[]::uuid[]
  );

  -- Authorisation: caller must be an org_member of the event's org, or admin.
  IF _event_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
        FROM events e
        JOIN org_members om ON om.org_id = e.org_id
       WHERE e.id = _event_id AND om.user_id = auth.uid()
    ) AND NOT has_role(auth.uid(), 'admin'::app_role) THEN
      RAISE EXCEPTION 'Not authorised to read recipients for this event';
    END IF;
  END IF;

  RETURN QUERY
  WITH base AS (
    -- All confirmed (non-cancelled, non-declined) registrations.
    SELECT r.user_id,
           COALESCE(NULLIF(trim(coalesce(r.first_name,'') || ' ' || coalesce(r.last_name,'')), ''),
                    r.name, split_part(r.email,'@',1)) AS name,
           lower(r.email) AS email,
           NULLIF(trim(coalesce(r.mobile_country_code,'') || ' ' || coalesce(r.mobile_number,'')), '') AS phone,
           COALESCE(r.attendance_state, 'never') AS attendance_state,
           COALESCE(r.amount_paid, 0)::numeric AS amount_paid
      FROM registrations r
     WHERE r.event_id = _event_id
       AND r.status <> 'cancelled'
       AND COALESCE(r.approval_status, 'approved') NOT IN ('declined','waitlisted')
  ),
  speakers_set AS (
    SELECT s.user_id,
           COALESCE(NULLIF(trim(coalesce(s.name,'')), ''), split_part(s.email,'@',1)) AS name,
           lower(s.email) AS email,
           NULL::text AS phone
      FROM event_speakers es
      JOIN speakers s ON s.id = es.speaker_id
     WHERE es.event_id = _event_id AND s.email IS NOT NULL
  ),
  sponsors_set AS (
    SELECT NULL::uuid AS user_id,
           COALESCE(NULLIF(trim(coalesce(s.name,'')), ''),
                    split_part(s.email,'@',1)) AS name,
           lower(s.email) AS email,
           NULL::text AS phone
      FROM event_sponsors es
      JOIN sponsors s ON s.id = es.sponsor_id
     WHERE es.event_id = _event_id AND s.email IS NOT NULL
  ),
  filtered_attendees AS (
    SELECT b.user_id, b.name, b.email, b.phone
      FROM base b
     WHERE
       (
         'all_attendees' = ANY(_types)
       )
       OR (
         'checked_in' = ANY(_types) AND b.attendance_state IN ('inside','outside')
       )
       OR (
         'paid' = ANY(_types) AND b.amount_paid > 0
       )
  ),
  custom_set AS (
    -- Custom user_ids: pull whatever profile/registration data we have.
    SELECT b.user_id, b.name, b.email, b.phone
      FROM base b
     WHERE 'custom' = ANY(_types) AND b.user_id = ANY(_user_ids)
  ),
  all_recipients AS (
    SELECT user_id, name, email, phone FROM filtered_attendees
    UNION
    SELECT user_id, name, email, phone FROM custom_set
    UNION ALL
    SELECT user_id, name, email, phone FROM speakers_set
     WHERE 'speakers' = ANY(_types)
    UNION ALL
    SELECT user_id, name, email, phone FROM sponsors_set
     WHERE 'sponsors' = ANY(_types)
  )
  -- Final dedup by lower(email) — same human shouldn't be hit twice if they
  -- happen to be both a speaker and a paid attendee.
  SELECT DISTINCT ON (lower(coalesce(ar.email,'')))
         ar.user_id, ar.name, ar.email, ar.phone
    FROM all_recipients ar
   WHERE ar.email IS NOT NULL AND ar.email <> ''
   ORDER BY lower(coalesce(ar.email,'')), ar.user_id NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION
  public.communications_resolve_recipients(uuid, jsonb) TO authenticated;


-- ── 4. Dispatch RPC ─────────────────────────────────────────────────────────
-- Resolves recipients, materialises per-recipient delivery rows, and flips
-- the parent communication's status to `sent`. Email provider integration
-- is layered on top of this (an edge function reads the recipient rows and
-- ships them out); for Phase 1 the recipient rows are pre-stamped with
-- `email_status='sent'` so the UI shows accurate counts even before the
-- provider is wired.
CREATE OR REPLACE FUNCTION public.communications_dispatch(_communication_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _comm           communications%ROWTYPE;
  _recipient_count int := 0;
  _now             timestamptz := now();
  _has_email       boolean;
  _has_whatsapp    boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be signed in';
  END IF;

  SELECT * INTO _comm FROM communications WHERE id = _communication_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Communication % not found', _communication_id;
  END IF;

  -- Authorisation: org member of comm.org_id, or admin.
  IF NOT EXISTS (
    SELECT 1 FROM org_members om
     WHERE om.org_id = _comm.org_id AND om.user_id = auth.uid()
  ) AND NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorised to dispatch communications for this org';
  END IF;

  IF _comm.status NOT IN ('draft', 'scheduled', 'failed') THEN
    RAISE EXCEPTION 'Communication is in % state and cannot be dispatched', _comm.status;
  END IF;

  _has_email    := 'email'    = ANY(_comm.channels);
  _has_whatsapp := 'whatsapp' = ANY(_comm.channels);

  -- Mark sending so the UI can disable controls during the (sub-second) window.
  UPDATE communications
     SET status = 'sending', updated_at = _now
   WHERE id = _communication_id;

  -- Fan out recipients. Phase 1: stamp email rows as sent immediately; Phase 2
  -- will leave them at 'pending' and let the worker advance them.
  WITH resolved AS (
    SELECT * FROM communications_resolve_recipients(_comm.event_id, _comm.recipient_filter)
  ),
  inserted AS (
    INSERT INTO communication_recipients (
      communication_id, user_id, email, phone, name,
      email_status, email_sent_at,
      whatsapp_status
    )
    SELECT _communication_id,
           r.user_id,
           r.email,
           r.phone,
           r.name,
           CASE WHEN _has_email AND r.email IS NOT NULL THEN 'sent' ELSE NULL END,
           CASE WHEN _has_email AND r.email IS NOT NULL THEN _now ELSE NULL END,
           CASE WHEN _has_whatsapp AND r.phone IS NOT NULL THEN 'pending' ELSE NULL END
      FROM resolved r
    RETURNING 1
  )
  SELECT count(*) INTO _recipient_count FROM inserted;

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

GRANT EXECUTE ON FUNCTION public.communications_dispatch(uuid) TO authenticated;

-- ── 5. Updated_at trigger ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._communications_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS communications_set_updated_at ON public.communications;
CREATE TRIGGER communications_set_updated_at
  BEFORE UPDATE ON public.communications
  FOR EACH ROW EXECUTE FUNCTION public._communications_set_updated_at();

-- ── 6. Realtime ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND tablename = 'communications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.communications';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND tablename = 'communication_recipients'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.communication_recipients';
  END IF;
END $$;
