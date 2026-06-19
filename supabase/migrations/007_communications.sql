-- ============================================================================
-- Communications — schema, scheduling, WhatsApp, render pipeline, RBAC, grants
--
-- Consolidated from prior individual migration files. Contents are verbatim;
-- only file packaging changed. Sections are separated by their original filename.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Section: 009_communications.sql
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- Section: 010_communications_schedule.sql
-- ----------------------------------------------------------------------------
-- ============================================================================
-- Phase 2 — Communications scheduling + worker
-- ----------------------------------------------------------------------------
-- Lets organizers schedule a draft instead of sending immediately. A pg_cron
-- job ticks every minute and fan-outs any scheduled communications whose
-- send time has arrived.
--
-- Authorisation model:
--   - User-facing scheduling goes through `communications_schedule()` (RLS
--     update would also work but we wrap it so we can validate state +
--     scheduled_for in one place).
--   - The cron worker runs as the table owner (SECURITY DEFINER) and bypasses
--     `auth.uid()` checks via the new `_communications_dispatch_impl()` helper.
-- ============================================================================

-- ── 1. Refactor: extract dispatch core into an internal helper ─────────────
-- The user-facing `communications_dispatch()` already validates auth. The
-- worker has no auth context, so we move the actual fan-out into a private
-- impl function and have both callers wrap it.
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

-- User-facing dispatch keeps the same signature; just delegates after auth.
CREATE OR REPLACE FUNCTION public.communications_dispatch(_communication_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _org_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;

  SELECT org_id INTO _org_id FROM communications WHERE id = _communication_id;
  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'Communication % not found', _communication_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM org_members om
     WHERE om.org_id = _org_id AND om.user_id = auth.uid()
  ) AND NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorised to dispatch communications for this org';
  END IF;

  RETURN _communications_dispatch_impl(_communication_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.communications_dispatch(uuid) TO authenticated;

-- ── 2. Schedule RPC ─────────────────────────────────────────────────────────
-- Persists a future send time and flips the status to `scheduled`. The cron
-- worker picks it up once `scheduled_for <= now()`.
CREATE OR REPLACE FUNCTION public.communications_schedule(
  _communication_id uuid,
  _scheduled_for    timestamptz
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _comm communications%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;
  IF _scheduled_for IS NULL THEN RAISE EXCEPTION 'scheduled_for is required'; END IF;
  IF _scheduled_for <= now() THEN
    RAISE EXCEPTION 'scheduled_for must be in the future';
  END IF;

  SELECT * INTO _comm FROM communications WHERE id = _communication_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Communication % not found', _communication_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM org_members om
     WHERE om.org_id = _comm.org_id AND om.user_id = auth.uid()
  ) AND NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  IF _comm.status NOT IN ('draft', 'scheduled', 'failed') THEN
    RAISE EXCEPTION 'Communication is in % state and cannot be scheduled', _comm.status;
  END IF;

  UPDATE communications
     SET status        = 'scheduled',
         scheduled_for = _scheduled_for,
         updated_at    = now()
   WHERE id = _communication_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.communications_schedule(uuid, timestamptz) TO authenticated;

-- Cancel a schedule (drops back to draft so the user can edit it again).
CREATE OR REPLACE FUNCTION public.communications_unschedule(_communication_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _comm communications%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;
  SELECT * INTO _comm FROM communications WHERE id = _communication_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Communication % not found', _communication_id; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM org_members om
     WHERE om.org_id = _comm.org_id AND om.user_id = auth.uid()
  ) AND NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  IF _comm.status <> 'scheduled' THEN
    RAISE EXCEPTION 'Communication is not scheduled';
  END IF;

  UPDATE communications
     SET status        = 'draft',
         scheduled_for = NULL,
         updated_at    = now()
   WHERE id = _communication_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.communications_unschedule(uuid) TO authenticated;

-- ── 3. Duplicate RPC ────────────────────────────────────────────────────────
-- Clones a communication (sent or draft) into a fresh draft so the organizer
-- can tweak and resend. Stats / sent_at / scheduled_for / status are reset.
CREATE OR REPLACE FUNCTION public.communications_duplicate(_communication_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _comm communications%ROWTYPE;
  _new_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;
  SELECT * INTO _comm FROM communications WHERE id = _communication_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Communication % not found', _communication_id; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM org_members om
     WHERE om.org_id = _comm.org_id AND om.user_id = auth.uid()
  ) AND NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  INSERT INTO communications (
    org_id, event_id, community_id, channels, recipient_filter,
    subject, body_text, body_html, status, created_by
  )
  VALUES (
    _comm.org_id, _comm.event_id, _comm.community_id,
    _comm.channels, _comm.recipient_filter,
    'Copy of ' || _comm.subject,
    _comm.body_text, _comm.body_html,
    'draft', auth.uid()
  )
  RETURNING id INTO _new_id;

  RETURN _new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.communications_duplicate(uuid) TO authenticated;


-- ── 4. Cron worker ──────────────────────────────────────────────────────────
-- Picks up to 50 scheduled communications whose send time has arrived and
-- runs each through the dispatch impl. Failures are recorded on the row so
-- the organizer can retry from the UI.
CREATE OR REPLACE FUNCTION public.communications_run_scheduled()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _comm RECORD;
  _processed int := 0;
BEGIN
  FOR _comm IN
    SELECT id FROM communications
     WHERE status = 'scheduled' AND scheduled_for <= now()
     ORDER BY scheduled_for ASC
     LIMIT 50
  LOOP
    BEGIN
      PERFORM _communications_dispatch_impl(_comm.id);
      _processed := _processed + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE communications
         SET status = 'failed',
             updated_at = now()
       WHERE id = _comm.id;
      RAISE WARNING 'Failed to dispatch scheduled communication %: %', _comm.id, SQLERRM;
    END;
  END LOOP;
  RETURN _processed;
END;
$$;

-- The worker is intentionally NOT exposed to authenticated callers — only the
-- pg_cron job (which runs as table owner via SECURITY DEFINER) should call it.

-- ── 5. pg_cron schedule (best-effort) ───────────────────────────────────────
-- Registers the cron job if pg_cron is available. If the extension hasn't
-- been enabled yet, the migration logs a NOTICE and continues — the user can
-- enable pg_cron in Dashboard → Database → Extensions and re-run, or call
-- `communications_run_scheduled()` manually until then.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Drop any prior version of this job (idempotent re-run).
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'communications-tick') THEN
      PERFORM cron.unschedule('communications-tick');
    END IF;

    PERFORM cron.schedule(
      'communications-tick',
      '* * * * *',
      $cron$ SELECT public.communications_run_scheduled() $cron$
    );
    RAISE NOTICE 'Scheduled communications-tick to run every minute via pg_cron';
  ELSE
    RAISE NOTICE 'pg_cron is not installed — communications-tick is not scheduled. Enable pg_cron in the Supabase dashboard, then re-run this migration.';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- Section: 011_communications_resolver_fix.sql
-- ----------------------------------------------------------------------------
-- ============================================================================
-- Hotfix for Phase 1 — sponsor column names
-- ----------------------------------------------------------------------------
-- The first cut of `communications_resolve_recipients` referenced
-- `sponsors.contact_name` / `sponsors.contact_email`, which don't exist in
-- this schema. The actual sponsor table only has `name` and `email`.
-- This migration replaces the function with the corrected version. No data
-- changes; nothing else in 009/010 needs to be re-run.
-- ============================================================================

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
  _types := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(_filter -> 'types', '[]'::jsonb))),
    ARRAY[]::text[]
  );
  _user_ids := COALESCE(
    ARRAY(SELECT (jsonb_array_elements_text(COALESCE(_filter -> 'user_ids', '[]'::jsonb)))::uuid),
    ARRAY[]::uuid[]
  );

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
    -- Sponsors table only has `name` + `email` (no contact_* split).
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
  SELECT DISTINCT ON (lower(coalesce(ar.email,'')))
         ar.user_id, ar.name, ar.email, ar.phone
    FROM all_recipients ar
   WHERE ar.email IS NOT NULL AND ar.email <> ''
   ORDER BY lower(coalesce(ar.email,'')), ar.user_id NULLS LAST;
END;
$$;

-- ----------------------------------------------------------------------------
-- Section: 012_communications_whatsapp.sql
-- ----------------------------------------------------------------------------
-- ============================================================================
-- Phase 3 — WhatsApp Business Cloud API integration
-- ----------------------------------------------------------------------------
-- WhatsApp's Cloud API forces template-based delivery for any message sent
-- outside an active 24-hour customer-care window. Event organizers are
-- almost always reaching out proactively, so we standardise on templates
-- across the platform.
--
-- This migration adds:
--   - whatsapp_templates       — local cache of approved templates per org
--   - communications.whatsapp_template_name / language / variables — what
--     to send when the comm's channel array includes 'whatsapp'.
--
-- The actual HTTP calls to Meta live in the `send-whatsapp` edge function;
-- delivery/read callbacks land at `whatsapp-webhook`. Both update the
-- communication_recipients row's whatsapp_* fields directly.
-- ============================================================================

-- ── 1. Cached registry of approved templates ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Meta's template identifiers
  name            text NOT NULL,
  language        text NOT NULL,           -- e.g. "en", "en_US", "hi"
  category        text,                    -- MARKETING / UTILITY / AUTHENTICATION
  status          text NOT NULL DEFAULT 'APPROVED'
                    CHECK (status IN ('APPROVED','PENDING','REJECTED','PAUSED','DISABLED')),
  -- Raw `components` array from Meta. We don't try to model header/body/buttons
  -- in columns — the UI parses the JSON to render variable inputs.
  components      jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Convenience: list of placeholder variable counts per component, derived
  -- from `components` at sync time. Lets the UI render variable inputs without
  -- re-parsing.
  variable_count  int NOT NULL DEFAULT 0,
  synced_at       timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (org_id, name, language)
);

CREATE INDEX IF NOT EXISTS whatsapp_templates_org_idx
  ON public.whatsapp_templates(org_id, status);

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members view whatsapp templates" ON public.whatsapp_templates;
CREATE POLICY "Org members view whatsapp templates" ON public.whatsapp_templates
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = whatsapp_templates.org_id AND om.user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- Inserts/updates happen via the sync edge function (service role) — no
-- client-side write policy. The user_facing read policy is enough.
GRANT SELECT ON public.whatsapp_templates TO authenticated;

-- ── 2. Add WhatsApp template fields to communications ──────────────────────
ALTER TABLE public.communications
  ADD COLUMN IF NOT EXISTS whatsapp_template_name     text,
  ADD COLUMN IF NOT EXISTS whatsapp_template_language text DEFAULT 'en',
  -- jsonb array of { component: "body" | "header", values: ["v1","v2"] }
  -- — flexible enough to cover header substitutions when those are used.
  ADD COLUMN IF NOT EXISTS whatsapp_template_variables jsonb DEFAULT '{}'::jsonb;

-- Constraint: if 'whatsapp' is in the channels array, a template must be set.
-- We enforce this at the application layer rather than via CHECK so drafts
-- without templates can still exist while the user is composing.

-- ── 3. RPC: list approved templates for an org ─────────────────────────────
-- Convenience wrapper so the UI can pass an org_id without leaking other
-- columns from the table.
CREATE OR REPLACE FUNCTION public.whatsapp_templates_list(_org_id uuid)
RETURNS TABLE (
  name text,
  language text,
  category text,
  status text,
  variable_count int,
  components jsonb,
  synced_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.name, t.language, t.category, t.status, t.variable_count, t.components, t.synced_at
    FROM whatsapp_templates t
   WHERE t.org_id = _org_id
     AND t.status = 'APPROVED'
   ORDER BY t.name, t.language;
$$;

GRANT EXECUTE ON FUNCTION public.whatsapp_templates_list(uuid) TO authenticated;

-- ── 4. Internal helper used by the edge function to mark recipient status ──
-- The edge function runs with service role so it could write directly, but
-- centralising the update in an RPC keeps the constraint logic in one place.
CREATE OR REPLACE FUNCTION public._whatsapp_recipient_update(
  _recipient_id uuid,
  _status       text,
  _error        text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _status NOT IN ('pending','sending','sent','delivered','read','failed') THEN
    RAISE EXCEPTION 'Invalid whatsapp status: %', _status;
  END IF;

  UPDATE communication_recipients
     SET whatsapp_status      = _status,
         whatsapp_sent_at     = CASE WHEN _status = 'sent'      AND whatsapp_sent_at      IS NULL THEN now() ELSE whatsapp_sent_at      END,
         whatsapp_delivered_at = CASE WHEN _status = 'delivered' AND whatsapp_delivered_at IS NULL THEN now() ELSE whatsapp_delivered_at END,
         whatsapp_read_at     = CASE WHEN _status = 'read'      AND whatsapp_read_at      IS NULL THEN now() ELSE whatsapp_read_at      END,
         error_message        = COALESCE(_error, error_message)
   WHERE id = _recipient_id;
END;
$$;

-- service-role-only; we don't grant to authenticated.

-- ── 5. Realtime ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND tablename = 'whatsapp_templates'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_templates';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- Section: 013_communications_community.sql
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- Section: 014_communications_render.sql
-- ----------------------------------------------------------------------------
-- ============================================================================
-- Phase 5.1 — Server-side variable substitution at fan-out
-- ----------------------------------------------------------------------------
-- The compose preview interpolates `{{user_name}}`, `{{event_name}}`, etc.
-- using sample data. Until now the actual fan-out left the raw tokens in the
-- persisted recipient rows, so any future provider integration would have to
-- duplicate the substitution logic.
--
-- This migration:
--   1. Adds `rendered_subject` / `rendered_body` columns on
--      `communication_recipients`.
--   2. Adds a private `_communications_render_text()` helper that mirrors
--      the client-side `applyVariables()` exactly.
--   3. Updates `_communications_dispatch_impl()` to fan out per-recipient
--      rendered text alongside the existing status columns.
-- ============================================================================

-- ── 1. New columns ─────────────────────────────────────────────────────────
ALTER TABLE public.communication_recipients
  ADD COLUMN IF NOT EXISTS rendered_subject text,
  ADD COLUMN IF NOT EXISTS rendered_body    text;

-- ── 2. Render helper ───────────────────────────────────────────────────────
-- Single-purpose: substitute a small set of curly-brace variables in a string.
-- Tokens not present in the context map are left unchanged so the organizer
-- can spot mis-typed names.
CREATE OR REPLACE FUNCTION public._communications_render_text(
  _text text,
  _ctx  jsonb
) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  _key   text;
  _value text;
  _out   text := COALESCE(_text, '');
BEGIN
  IF _out = '' THEN RETURN _out; END IF;

  -- Iterate the keys of `_ctx` and replace every `{{key}}` occurrence.
  -- Using regexp_replace with a literal token keeps the substitution safe
  -- even if the value contains regex meta-chars (we use replace(), not regexp).
  FOR _key, _value IN SELECT k, v FROM jsonb_each_text(COALESCE(_ctx, '{}'::jsonb)) AS x(k, v) LOOP
    IF _value IS NULL OR _value = '' THEN CONTINUE; END IF;
    _out := replace(_out, '{{' || _key || '}}', _value);
    -- Tolerate inner whitespace ({{ user_name }}) the same way the JS regex does.
    _out := regexp_replace(_out, '\{\{\s*' || _key || '\s*\}\}', _value, 'g');
  END LOOP;

  RETURN _out;
END;
$$;

-- ── 3. Update dispatch impl to render at fan-out ───────────────────────────
CREATE OR REPLACE FUNCTION public._communications_dispatch_impl(_communication_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _comm           communications%ROWTYPE;
  _recipient_count int := 0;
  _now             timestamptz := now();
  _has_email       boolean;
  _has_whatsapp    boolean;
  _scope_ctx       jsonb := '{}'::jsonb;   -- event / community fields shared by all recipients
BEGIN
  SELECT * INTO _comm FROM communications WHERE id = _communication_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Communication % not found', _communication_id; END IF;

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

  -- Build scope-level context once (event_name / event_date / event_location
  -- or community_name). Per-recipient pieces (`user_name`) get layered on
  -- inside the INSERT below.
  IF _comm.event_id IS NOT NULL THEN
    SELECT jsonb_strip_nulls(jsonb_build_object(
      'event_name',     e.title,
      'event_date',     to_char(e.date, 'FMMonth FMDD, YYYY'),
      'event_location', COALESCE(e.venue, e.location)
    ))
      INTO _scope_ctx
      FROM events e
     WHERE e.id = _comm.event_id;
  ELSIF _comm.community_id IS NOT NULL THEN
    SELECT jsonb_strip_nulls(jsonb_build_object(
      'community_name', c.name
    ))
      INTO _scope_ctx
      FROM communities c
     WHERE c.id = _comm.community_id;
  END IF;

  IF _comm.event_id IS NOT NULL THEN
    WITH resolved AS (
      SELECT * FROM communications_resolve_recipients(_comm.event_id, _comm.recipient_filter)
    ),
    inserted AS (
      INSERT INTO communication_recipients (
        communication_id, user_id, email, phone, name,
        rendered_subject, rendered_body,
        email_status, email_sent_at,
        whatsapp_status
      )
      SELECT _communication_id, r.user_id, r.email, r.phone, r.name,
             _communications_render_text(_comm.subject,   _scope_ctx || jsonb_build_object('user_name', r.name)),
             _communications_render_text(_comm.body_text, _scope_ctx || jsonb_build_object('user_name', r.name)),
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
        rendered_subject, rendered_body,
        email_status, email_sent_at,
        whatsapp_status
      )
      SELECT _communication_id, r.user_id, r.email, r.phone, r.name,
             _communications_render_text(_comm.subject,   _scope_ctx || jsonb_build_object('user_name', r.name)),
             _communications_render_text(_comm.body_text, _scope_ctx || jsonb_build_object('user_name', r.name)),
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

-- ----------------------------------------------------------------------------
-- Section: 015_communications_render_strip.sql
-- ----------------------------------------------------------------------------
-- ============================================================================
-- Phase 5.2 — Strip unresolved tokens at render time
-- ----------------------------------------------------------------------------
-- The earlier render helper (014) left `{{token}}` literally in place when a
-- value wasn't supplied for the key. That's nice for compose-time debugging
-- but ugly for recipients — they'd see "Welcome to {{community_name}}!" in
-- their inbox.
--
-- This migration replaces `_communications_render_text` so that:
--   1. Known tokens with values get substituted.
--   2. Any other `{{...}}` tokens are stripped along with one leading space
--      to avoid leaving double-gaps in the rendered text.
--   3. Excess whitespace + orphan punctuation (" ." / " ,") are tightened.
--
-- The behaviour mirrors `applyVariables()` in `src/lib/communications/substitute.ts`
-- so the preview matches what gets persisted byte-for-byte.
--
-- The compose dialog independently warns the organizer about out-of-scope
-- tokens at edit time so they can fix them before send.
-- ============================================================================

CREATE OR REPLACE FUNCTION public._communications_render_text(
  _text text,
  _ctx  jsonb
) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  _key   text;
  _value text;
  _out   text := COALESCE(_text, '');
BEGIN
  IF _out = '' THEN RETURN _out; END IF;

  -- 1. Substitute every key present in `_ctx`.
  FOR _key, _value IN
    SELECT k, v FROM jsonb_each_text(COALESCE(_ctx, '{}'::jsonb)) AS x(k, v)
  LOOP
    IF _value IS NULL OR _value = '' THEN CONTINUE; END IF;
    -- Tolerate inner whitespace: `{{ user_name }}` matches `{{user_name}}`.
    -- Use POSIX `[[:space:]]` instead of `\s` for max portability.
    _out := regexp_replace(_out, '\{\{[[:space:]]*' || _key || '[[:space:]]*\}\}', _value, 'gi');
  END LOOP;

  -- 2. Strip any tokens that didn't get substituted, eating one leading
  -- whitespace char so we don't leave gaps. Pattern mirrors the JS regex
  -- in `applyVariables()`.
  _out := regexp_replace(_out, '[[:space:]]?\{\{[[:space:]]*[a-z_][a-z_0-9]*[[:space:]]*\}\}', '', 'gi');

  -- 3. Collapse runs of whitespace + tighten orphaned punctuation.
  _out := regexp_replace(_out, '[[:space:]]{2,}', ' ', 'g');
  _out := regexp_replace(_out, '[[:space:]]+([.,!?;:])', '\1', 'g');
  _out := btrim(_out);

  RETURN _out;
END;
$$;

-- ----------------------------------------------------------------------------
-- Section: 016_communications_email_pending.sql
-- ----------------------------------------------------------------------------
-- ============================================================================
-- Phase 6 — Real email delivery via Resend
-- ----------------------------------------------------------------------------
-- The earlier dispatch impl pre-stamped `email_status='sent'` because there
-- was no provider integration yet. Now that the `send-communication-email`
-- edge function actually ships emails, dispatch should mark recipients as
-- `pending` and let the worker advance them to `sent` / `failed`.
--
-- This migration replaces `_communications_dispatch_impl` only — schema and
-- RLS stay untouched. After applying, the dispatch flow is:
--
--   1. RPC `communications_dispatch(id)` validates auth + fans out recipient
--      rows with `email_status='pending'` and `whatsapp_status='pending'`
--      where applicable, marks the parent row `status='sent'` (the comm has
--      been queued — delivery happens off-thread).
--   2. The client immediately invokes `send-communication-email` which
--      batches pending email rows through Resend and updates statuses.
--
-- WhatsApp delivery is intentionally untouched in this migration. WhatsApp
-- rows are still inserted as `whatsapp_status='pending'` and wait for the
-- future phase to ship them.
-- ============================================================================

CREATE OR REPLACE FUNCTION public._communications_dispatch_impl(_communication_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _comm           communications%ROWTYPE;
  _recipient_count int := 0;
  _now             timestamptz := now();
  _has_email       boolean;
  _has_whatsapp    boolean;
  _scope_ctx       jsonb := '{}'::jsonb;
BEGIN
  SELECT * INTO _comm FROM communications WHERE id = _communication_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Communication % not found', _communication_id; END IF;

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

  -- Build scope-level context once.
  IF _comm.event_id IS NOT NULL THEN
    SELECT jsonb_strip_nulls(jsonb_build_object(
      'event_name',     e.title,
      'event_date',     to_char(e.date, 'FMMonth FMDD, YYYY'),
      'event_location', COALESCE(e.venue, e.location)
    ))
      INTO _scope_ctx
      FROM events e
     WHERE e.id = _comm.event_id;
  ELSIF _comm.community_id IS NOT NULL THEN
    SELECT jsonb_strip_nulls(jsonb_build_object('community_name', c.name))
      INTO _scope_ctx
      FROM communities c
     WHERE c.id = _comm.community_id;
  END IF;

  IF _comm.event_id IS NOT NULL THEN
    WITH resolved AS (
      SELECT * FROM communications_resolve_recipients(_comm.event_id, _comm.recipient_filter)
    ),
    inserted AS (
      INSERT INTO communication_recipients (
        communication_id, user_id, email, phone, name,
        rendered_subject, rendered_body,
        email_status, whatsapp_status
      )
      SELECT _communication_id, r.user_id, r.email, r.phone, r.name,
             _communications_render_text(_comm.subject,   _scope_ctx || jsonb_build_object('user_name', r.name)),
             _communications_render_text(_comm.body_text, _scope_ctx || jsonb_build_object('user_name', r.name)),
             -- Now using 'pending' so the worker is the source of truth
             CASE WHEN _has_email AND r.email IS NOT NULL THEN 'pending' ELSE NULL END,
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
        rendered_subject, rendered_body,
        email_status, whatsapp_status
      )
      SELECT _communication_id, r.user_id, r.email, r.phone, r.name,
             _communications_render_text(_comm.subject,   _scope_ctx || jsonb_build_object('user_name', r.name)),
             _communications_render_text(_comm.body_text, _scope_ctx || jsonb_build_object('user_name', r.name)),
             CASE WHEN _has_email AND r.email IS NOT NULL THEN 'pending' ELSE NULL END,
             CASE WHEN _has_whatsapp AND r.phone IS NOT NULL THEN 'pending' ELSE NULL END
        FROM resolved r
      RETURNING 1
    )
    SELECT count(*) INTO _recipient_count FROM inserted;
  END IF;

  -- Parent row is "sent" in the sense that fan-out is complete. Per-recipient
  -- delivery state lives in `communication_recipients.email_status`.
  UPDATE communications
     SET status          = 'sent',
         recipient_count = _recipient_count,
         sent_count      = 0,
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

-- ── Helper: roll up per-recipient email status into the parent's counts ─────
-- Called by the edge function after each batch flushes so the list view's
-- "5/342 delivered" copy stays in sync without polling every recipient row.
CREATE OR REPLACE FUNCTION public.communications_recompute_email_counts(
  _communication_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE communications
     SET sent_count   = (SELECT count(*)
                            FROM communication_recipients
                           WHERE communication_id = _communication_id
                             AND email_status IN ('sent','delivered','opened','clicked')),
         failed_count = (SELECT count(*)
                            FROM communication_recipients
                           WHERE communication_id = _communication_id
                             AND email_status IN ('bounced','failed')),
         updated_at   = now()
   WHERE id = _communication_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.communications_recompute_email_counts(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- Section: 017_communications_service_role_grants.sql
-- ----------------------------------------------------------------------------
-- ============================================================================
-- Phase 6 hotfix — service_role privileges on communications tables
-- ----------------------------------------------------------------------------
-- The `send-communication-email` edge function connects as `service_role`
-- (via `SUPABASE_SERVICE_ROLE_KEY`). The original 009 migration only
-- granted privileges to `authenticated`, so the edge function gets a
-- `permission denied for table communication_recipients` (SQLSTATE 42501)
-- when it tries to read pending rows.
--
-- This migration adds explicit grants for `service_role`. RLS still applies
-- if it were enforced for service_role — but service_role bypasses RLS by
-- default in Supabase, so the grants are the only thing in the way.
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.communications          TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.communication_recipients TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_templates       TO service_role;

-- RPCs the edge function calls. EXECUTE on functions is typically default
-- but we grant explicitly so the migration is a complete reference.
GRANT EXECUTE ON FUNCTION public.communications_recompute_email_counts(uuid)        TO service_role;
GRANT EXECUTE ON FUNCTION public.communications_resolve_recipients(uuid, jsonb)     TO service_role;
GRANT EXECUTE ON FUNCTION public._communications_render_text(text, jsonb)           TO service_role;
GRANT EXECUTE ON FUNCTION public._communications_dispatch_impl(uuid)                TO service_role;

-- ----------------------------------------------------------------------------
-- Section: 018_whatsapp_service_role_grants.sql
-- ----------------------------------------------------------------------------
-- ============================================================================
-- Phase 7 hotfix — service_role privileges on WhatsApp tables / helpers
-- ----------------------------------------------------------------------------
-- The `send-whatsapp` and `whatsapp-sync-templates` edge functions connect
-- as `service_role`. The original 012 migration only granted privileges to
-- `authenticated`, which would make the edge functions hit
-- `permission denied for table whatsapp_templates` (SQLSTATE 42501) on the
-- first sync.
--
-- This mirrors migration 017 for the email side.
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_templates       TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.communication_recipients TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.communications          TO service_role;

GRANT EXECUTE ON FUNCTION public._whatsapp_recipient_update(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.whatsapp_templates_list(uuid)                TO service_role;

