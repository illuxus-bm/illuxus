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
