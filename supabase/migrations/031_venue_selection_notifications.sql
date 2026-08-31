-- ============================================================================
-- 031_venue_selection_notifications.sql
-- ----------------------------------------------------------------------------
-- Two fixes / additions for the venue-selection flow that ships in 027:
--
--   1. Define `is_vendor_member(user_id, vendor_id)` — migration 027 already
--      references this helper in its RLS policies, but the function itself
--      was never created. Without it every SELECT / UPDATE against
--      event_venue_selections from a vendor account errors out with
--      "function is_vendor_member(...) does not exist".
--
--   2. Notify the organizer when the vendor accepts or declines their venue
--      request. The existing `notify-venue-selection` edge function only
--      handles organizer → vendor. This trigger fires the reverse
--      direction (vendor → organizer) via pg_net → the new
--      `notify-organizer-venue-response` edge function.
--
-- Both apps (Illuxus and vendor-connect-standalone) share this Supabase
-- project, so the trigger fires regardless of which frontend flips the
-- status.
-- ============================================================================

-- ── 1. is_vendor_member helper ──────────────────────────────────────────────
-- SECURITY DEFINER so calls from RLS policies bypass the recursion that would
-- otherwise happen if an ordinary function tried to read vendor_members while
-- vendor_members' own RLS is being evaluated.
CREATE OR REPLACE FUNCTION public.is_vendor_member(_user_id uuid, _vendor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.vendor_members vm
     WHERE vm.user_id   = _user_id
       AND vm.vendor_id = _vendor_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_vendor_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_vendor_member(uuid, uuid) TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.is_vendor_member(uuid, uuid) IS
  'Returns true when the given user is a member of the given vendor. Used by RLS policies on event_venue_selections (see migration 027).';

-- ── 2. keep updated_at fresh on status changes ──────────────────────────────
-- The client-side upsert sets updated_at explicitly, but a vendor accept /
-- decline from another surface (SQL, admin console, another app) will bypass
-- that — so bake it into a BEFORE trigger.
CREATE OR REPLACE FUNCTION public.event_venue_selections_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('accepted', 'declined')
     AND NEW.responded_at IS NULL
  THEN
    NEW.responded_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_venue_selections_touch ON public.event_venue_selections;
CREATE TRIGGER trg_event_venue_selections_touch
  BEFORE UPDATE ON public.event_venue_selections
  FOR EACH ROW
  EXECUTE FUNCTION public.event_venue_selections_touch_updated_at();

-- ── 3. Organizer notification on vendor accept / decline ────────────────────
-- Mirrors the pattern in 000_full_schema.sql for communications_run_scheduled:
-- pulls the service role key + supabase URL out of app_settings, then POSTs
-- to the edge function via pg_net. Any failure is swallowed so the vendor's
-- accept / decline never gets blocked by an email hiccup.
CREATE OR REPLACE FUNCTION public.notify_organizer_venue_response()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _supabase_url text;
  _service_key  text;
BEGIN
  -- Only fire on real status transitions into accepted / declined. Skips
  -- the initial contacted → contacted upsert and any no-op UPDATE.
  IF TG_OP <> 'UPDATE'
     OR NEW.status = OLD.status
     OR NEW.status NOT IN ('accepted', 'declined') THEN
    RETURN NEW;
  END IF;

  SELECT value INTO _supabase_url FROM public.app_settings WHERE key = 'supabase_url';
  SELECT value INTO _service_key  FROM public.app_settings WHERE key = 'service_role_key';

  IF _supabase_url IS NULL OR _service_key IS NULL THEN
    -- Not configured yet — dev / preview environment. Silently skip so the
    -- vendor's accept / decline still commits.
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url     := _supabase_url || '/functions/v1/notify-organizer-venue-response',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || _service_key,
        'Content-Type',  'application/json'
      ),
      body    := jsonb_build_object(
        'selection_id',  NEW.id,
        'event_id',      NEW.event_id,
        'vendor_id',     NEW.vendor_id,
        'status',        NEW.status,
        'previous_status', OLD.status,
        'notes',         NEW.notes
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- Never fail the trigger for a delivery hiccup. Row is already saved.
    RAISE NOTICE 'notify_organizer_venue_response dispatch failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_organizer_venue_response() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_event_venue_selections_notify ON public.event_venue_selections;
CREATE TRIGGER trg_event_venue_selections_notify
  AFTER UPDATE OF status ON public.event_venue_selections
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_organizer_venue_response();

COMMENT ON TRIGGER trg_event_venue_selections_notify ON public.event_venue_selections IS
  'Emails the event organizer whenever a vendor accepts or declines their venue request. Handled asynchronously via pg_net → notify-organizer-venue-response edge function.';
