-- ============================================================================
-- Make the scheduled-communications cron actually deliver
-- ----------------------------------------------------------------------------
-- The Phase 2 cron tick (`communications_run_scheduled`) calls
-- `_communications_dispatch_impl` to fan a scheduled communication out to
-- recipient rows, but it never tells the `send-communication-email` /
-- `send-whatsapp` edge functions to ship those rows. The pending rows sit
-- forever unless someone clicks "Send now" again from the UI.
--
-- This migration replaces the cron worker with a version that also POSTs to
-- the edge functions via `pg_net.http_post`, mirroring what the frontend does
-- on a manual send.
--
-- Settings storage: hosted Supabase doesn't let non-superusers run
-- `ALTER DATABASE ... SET app.settings.*`, so we use a small `app_settings`
-- table instead. RLS is enabled with no policies — `authenticated` and `anon`
-- can't read it, but the cron worker runs as SECURITY DEFINER (function owner)
-- and bypasses RLS, so it can read the values just fine.
--
-- One-time setup AFTER running this migration (run in SQL Editor):
--
--   INSERT INTO app_settings (key, value) VALUES
--     ('supabase_url',     'https://<project_ref>.supabase.co'),
--     ('service_role_key', '<your service_role JWT>')
--   ON CONFLICT (key) DO UPDATE
--     SET value = EXCLUDED.value, updated_at = now();
-- ============================================================================

-- ── 1. Ensure pg_net is available (HTTP-from-Postgres)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── 2. Settings table (locked down via RLS, readable by SECURITY DEFINER)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies — `authenticated` and `anon` cannot read this.
-- service_role bypasses RLS implicitly. The SECURITY DEFINER cron function
-- below also bypasses RLS by virtue of running as the function owner.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO service_role;

-- ── 3. Drop the old worker (returns `int`) so we can replace with one that
--      returns `jsonb`. Postgres rejects `CREATE OR REPLACE FUNCTION` if the
--      return type changes.
DROP FUNCTION IF EXISTS public.communications_run_scheduled();

-- ── 4. Create the replacement worker
CREATE OR REPLACE FUNCTION public.communications_run_scheduled()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  _comm        RECORD;
  _processed   INT := 0;
  _failed      INT := 0;
  _invoked     INT := 0;
  _supabase_url text;
  _service_key  text;
BEGIN
  -- Pull credentials from the locked-down settings table.
  SELECT value INTO _supabase_url FROM public.app_settings WHERE key = 'supabase_url';
  SELECT value INTO _service_key  FROM public.app_settings WHERE key = 'service_role_key';

  FOR _comm IN
    SELECT id, channels
      FROM communications
     WHERE status = 'scheduled'
       AND scheduled_for <= now()
     ORDER BY scheduled_for
     LIMIT 50
  LOOP
    BEGIN
      -- Fan out the recipient rows (sets the parent row to "sent" and creates
      -- per-recipient `pending` rows that the edge functions will pick up).
      PERFORM _communications_dispatch_impl(_comm.id);
      _processed := _processed + 1;

      -- Fire the edge functions via pg_net so the pending rows actually ship.
      -- We POST per channel and per communication; the edge functions are
      -- idempotent (they only pick up `pending` rows).
      IF _supabase_url IS NOT NULL AND _service_key IS NOT NULL THEN
        IF 'email' = ANY(_comm.channels) THEN
          PERFORM net.http_post(
            url     := _supabase_url || '/functions/v1/send-communication-email',
            headers := jsonb_build_object(
              'Authorization', 'Bearer ' || _service_key,
              'Content-Type',  'application/json'
            ),
            body    := jsonb_build_object('communication_id', _comm.id)
          );
          _invoked := _invoked + 1;
        END IF;

        IF 'whatsapp' = ANY(_comm.channels) THEN
          PERFORM net.http_post(
            url     := _supabase_url || '/functions/v1/send-whatsapp',
            headers := jsonb_build_object(
              'Authorization', 'Bearer ' || _service_key,
              'Content-Type',  'application/json'
            ),
            body    := jsonb_build_object('communication_id', _comm.id)
          );
          _invoked := _invoked + 1;
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      _failed := _failed + 1;
      -- Parent `communications` row has no `error_message` column — per-recipient
      -- errors live on `communication_recipients.error_message`. Just flip the
      -- envelope to `failed` here so the UI can surface a retry button.
      UPDATE communications
         SET status        = 'failed',
             updated_at    = now()
       WHERE id = _comm.id;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', _processed,
    'failed',    _failed,
    'invoked',   _invoked,
    'has_url',   _supabase_url IS NOT NULL,
    'has_key',   _service_key  IS NOT NULL
  );
END;
$$;

-- The worker is private — only the pg_cron job (running as table owner via
-- SECURITY DEFINER) and the SQL Editor (for manual catch-up) should call it.
REVOKE EXECUTE ON FUNCTION public.communications_run_scheduled() FROM PUBLIC, authenticated, anon;

-- ── 5. Re-register the pg_cron job (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'communications-tick') THEN
      PERFORM cron.unschedule('communications-tick');
    END IF;
    PERFORM cron.schedule(
      'communications-tick',
      '* * * * *',
      $cron$ SELECT public.communications_run_scheduled() $cron$
    );
    RAISE NOTICE 'communications-tick re-registered (runs every minute)';
  ELSE
    RAISE NOTICE 'pg_cron is not installed — enable it in Dashboard -> Database -> Extensions, then re-run this migration.';
  END IF;
END $$;
