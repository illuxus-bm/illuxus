-- ═════════════════════════════════════════════════════════════════════════════
-- 006_admin_activity_log.sql — automated audit triggers + super-admin RPCs.
--
-- Adds the back-end machinery for the super-admin control suite:
--
--   • Generic `audit_log_row_change()` trigger function that captures
--     auth.uid() + actor email + a curated jsonb diff into `public.audit_logs`
--     for every INSERT / UPDATE / DELETE on the platform's critical tables.
--   • Trigger wiring for events, organizations, profiles, user_roles,
--     subscriptions, support_tickets.
--   • New columns:
--       profiles.banned_at / banned_reason
--       events.published    (boolean mirror of `status = 'published'`)
--       events.deleted_at   (soft-delete marker for admin force-delete)
--       subscriptions.cancelled_at
--   • New admin RPCs (all SECURITY DEFINER, gated by `has_role(_, 'admin')`):
--       admin_user_activity_feed
--       admin_recent_activity
--       admin_ban_user / admin_unban_user
--       admin_force_password_reset
--       admin_delete_user
--       admin_event_force_unpublish / admin_event_force_delete
--       admin_revenue_summary
--       admin_health_snapshot
--
-- Idempotent-safe: every DDL uses IF NOT EXISTS / DROP-and-recreate. The
-- migration is re-runnable on a partially-applied DB.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── 1. New columns ───────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS banned_at      timestamptz,
  ADD COLUMN IF NOT EXISTS banned_reason  text;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS published  boolean,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Backfill `published` from existing `status` so downstream code can rely on
-- the boolean. New rows default to `status = 'draft'` so published stays false.
UPDATE public.events
   SET published = (status = 'published')
 WHERE published IS NULL;

ALTER TABLE public.events ALTER COLUMN published SET DEFAULT false;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

-- ── 2. Helper: resolve actor email from auth.users ───────────────────────────

CREATE OR REPLACE FUNCTION public._audit_actor_email(_uid uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT email::text FROM auth.users WHERE id = _uid;
$$;

-- ── 3. Generic audit trigger function ────────────────────────────────────────
--
-- One function covers every wired-up table. We derive the verb from TG_OP and
-- the table name (e.g. event.created, event.updated, event.deleted), capture
-- a curated diff of the top-watched columns, and skip when auth.uid() is null
-- (service-role inserts during signup / migrations should not flood the log).
--
-- The set of "watched columns" is intentionally narrow per table so that big
-- jsonb blobs (page_config, plan_limits, landing_config, video_fx_prefs) never
-- end up in audit_logs.details.

CREATE OR REPLACE FUNCTION public.audit_log_row_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor_id   uuid := auth.uid();
  v_actor_email text;
  v_action     text;
  v_target_type text := TG_TABLE_NAME;
  v_target_id  text;
  v_details    jsonb := '{}'::jsonb;
  v_old        jsonb;
  v_new        jsonb;
  v_singular   text;
BEGIN
  -- Skip writes that don't have an auth.uid() (service-role / signup flow).
  -- Without an actor we can't attribute the change, and the noise would
  -- swamp the feed.
  IF v_actor_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Singularise table_name for nicer action verbs (events -> event).
  v_singular := CASE TG_TABLE_NAME
    WHEN 'events'           THEN 'event'
    WHEN 'organizations'    THEN 'org'
    WHEN 'profiles'         THEN 'profile'
    WHEN 'user_roles'       THEN 'role'
    WHEN 'subscriptions'    THEN 'subscription'
    WHEN 'support_tickets'  THEN 'ticket'
    ELSE TG_TABLE_NAME
  END;

  v_action := v_singular || '.' || CASE TG_OP
    WHEN 'INSERT' THEN 'created'
    WHEN 'UPDATE' THEN 'updated'
    WHEN 'DELETE' THEN 'deleted'
  END;

  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_target_id := COALESCE(v_old->>'id', '');
  ELSE
    v_new := to_jsonb(NEW);
    v_target_id := COALESCE(v_new->>'id', '');
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
  END IF;

  -- Build a curated diff per table. Each branch lists the top-10ish columns
  -- worth keeping in the audit trail; everything else (jsonb config blobs,
  -- timestamps, denormalised counters) is dropped.
  IF TG_TABLE_NAME = 'events' THEN
    v_details := jsonb_strip_nulls(jsonb_build_object(
      'title',     COALESCE(v_new->>'title',     v_old->>'title'),
      'slug',      COALESCE(v_new->>'slug',      v_old->>'slug'),
      'status',    COALESCE(v_new->>'status',    v_old->>'status'),
      'date',      COALESCE(v_new->>'date',      v_old->>'date'),
      'capacity',  COALESCE(v_new->>'capacity',  v_old->>'capacity'),
      'price',     COALESCE(v_new->>'price',     v_old->>'price'),
      'currency',  COALESCE(v_new->>'currency',  v_old->>'currency'),
      'published', COALESCE(v_new->>'published', v_old->>'published'),
      'deleted_at',COALESCE(v_new->>'deleted_at',v_old->>'deleted_at'),
      'org_id',    COALESCE(v_new->>'org_id',    v_old->>'org_id')
    ));

  ELSIF TG_TABLE_NAME = 'organizations' THEN
    v_details := jsonb_strip_nulls(jsonb_build_object(
      'name',          COALESCE(v_new->>'name',          v_old->>'name'),
      'slug',          COALESCE(v_new->>'slug',          v_old->>'slug'),
      'plan',          COALESCE(v_new->>'plan',          v_old->>'plan'),
      'owner_id',      COALESCE(v_new->>'owner_id',      v_old->>'owner_id'),
      'custom_domain', COALESCE(v_new->>'custom_domain', v_old->>'custom_domain'),
      'subdomain',     COALESCE(v_new->>'subdomain',     v_old->>'subdomain'),
      'billing_email', COALESCE(v_new->>'billing_email', v_old->>'billing_email')
    ));

  ELSIF TG_TABLE_NAME = 'profiles' THEN
    -- Profiles are noisy (every UI form submit touches at least display_name),
    -- so only log when account_type / completion flags / ban status changed.
    IF TG_OP = 'UPDATE' AND
       (v_old->>'account_type')          IS NOT DISTINCT FROM (v_new->>'account_type') AND
       (v_old->>'profile_completed')     IS NOT DISTINCT FROM (v_new->>'profile_completed') AND
       (v_old->>'onboarding_completed')  IS NOT DISTINCT FROM (v_new->>'onboarding_completed') AND
       (v_old->>'banned_at')             IS NOT DISTINCT FROM (v_new->>'banned_at')
    THEN
      RETURN COALESCE(NEW, OLD);
    END IF;
    v_details := jsonb_strip_nulls(jsonb_build_object(
      'user_id',              COALESCE(v_new->>'user_id',              v_old->>'user_id'),
      'account_type',         COALESCE(v_new->>'account_type',         v_old->>'account_type'),
      'profile_completed',    COALESCE(v_new->>'profile_completed',    v_old->>'profile_completed'),
      'onboarding_completed', COALESCE(v_new->>'onboarding_completed', v_old->>'onboarding_completed'),
      'banned_at',            COALESCE(v_new->>'banned_at',            v_old->>'banned_at'),
      'banned_reason',        COALESCE(v_new->>'banned_reason',        v_old->>'banned_reason')
    ));
    -- For profiles, target_id is the user_id (more useful than the profile pk).
    v_target_id := COALESCE(v_new->>'user_id', v_old->>'user_id', v_target_id);

  ELSIF TG_TABLE_NAME = 'user_roles' THEN
    -- Every grant/revoke is interesting. Encode the verb in the action name
    -- so the activity feed reads naturally ("role.granted: admin").
    v_action := 'role.' || CASE TG_OP
      WHEN 'INSERT' THEN 'granted'
      WHEN 'DELETE' THEN 'revoked'
      ELSE 'updated'
    END;
    v_details := jsonb_strip_nulls(jsonb_build_object(
      'user_id', COALESCE(v_new->>'user_id', v_old->>'user_id'),
      'role',    COALESCE(v_new->>'role',    v_old->>'role')
    ));
    v_target_id := COALESCE(v_new->>'user_id', v_old->>'user_id', v_target_id);

  ELSIF TG_TABLE_NAME = 'subscriptions' THEN
    v_details := jsonb_strip_nulls(jsonb_build_object(
      'org_id',       COALESCE(v_new->>'org_id',       v_old->>'org_id'),
      'plan',         COALESCE(v_new->>'plan',         v_old->>'plan'),
      'status',       COALESCE(v_new->>'status',       v_old->>'status'),
      'cancelled_at', COALESCE(v_new->>'cancelled_at', v_old->>'cancelled_at')
    ));

  ELSIF TG_TABLE_NAME = 'support_tickets' THEN
    v_details := jsonb_strip_nulls(jsonb_build_object(
      'ticket_number', COALESCE(v_new->>'ticket_number', v_old->>'ticket_number'),
      'status',        COALESCE(v_new->>'status',        v_old->>'status'),
      'priority',      COALESCE(v_new->>'priority',      v_old->>'priority'),
      'assigned_to',   COALESCE(v_new->>'assigned_to',   v_old->>'assigned_to')
    ));
  END IF;

  v_actor_email := public._audit_actor_email(v_actor_id);

  INSERT INTO public.audit_logs(actor_id, actor_email, action, target_type, target_id, details)
  VALUES (v_actor_id, v_actor_email, v_action, v_target_type, v_target_id, v_details);

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ── 4. Trigger wiring ────────────────────────────────────────────────────────
-- One DROP + CREATE per (table, event) so the migration is fully idempotent.
-- UPDATE triggers use WHEN (OLD.* IS DISTINCT FROM NEW.*) to avoid no-op
-- writes that would otherwise spam the feed.

-- events ────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS audit_events_insert ON public.events;
CREATE TRIGGER audit_events_insert
  AFTER INSERT ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_row_change();

DROP TRIGGER IF EXISTS audit_events_update ON public.events;
CREATE TRIGGER audit_events_update
  AFTER UPDATE ON public.events
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION public.audit_log_row_change();

DROP TRIGGER IF EXISTS audit_events_delete ON public.events;
CREATE TRIGGER audit_events_delete
  AFTER DELETE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_row_change();

-- organizations ─────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS audit_organizations_insert ON public.organizations;
CREATE TRIGGER audit_organizations_insert
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_row_change();

DROP TRIGGER IF EXISTS audit_organizations_update ON public.organizations;
CREATE TRIGGER audit_organizations_update
  AFTER UPDATE ON public.organizations
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION public.audit_log_row_change();

DROP TRIGGER IF EXISTS audit_organizations_delete ON public.organizations;
CREATE TRIGGER audit_organizations_delete
  AFTER DELETE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_row_change();

-- profiles ──────────────────────────────────────────────────────────────────
-- INSERT skipped intentionally: profile rows are created during signup with
-- auth.uid() set to the new user, and we don't need a "profile.created" entry
-- for every single signup.
DROP TRIGGER IF EXISTS audit_profiles_update ON public.profiles;
CREATE TRIGGER audit_profiles_update
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION public.audit_log_row_change();

-- user_roles ────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS audit_user_roles_insert ON public.user_roles;
CREATE TRIGGER audit_user_roles_insert
  AFTER INSERT ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_row_change();

DROP TRIGGER IF EXISTS audit_user_roles_delete ON public.user_roles;
CREATE TRIGGER audit_user_roles_delete
  AFTER DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_row_change();

-- subscriptions ─────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS audit_subscriptions_insert ON public.subscriptions;
CREATE TRIGGER audit_subscriptions_insert
  AFTER INSERT ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_row_change();

DROP TRIGGER IF EXISTS audit_subscriptions_update ON public.subscriptions;
CREATE TRIGGER audit_subscriptions_update
  AFTER UPDATE ON public.subscriptions
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION public.audit_log_row_change();

DROP TRIGGER IF EXISTS audit_subscriptions_delete ON public.subscriptions;
CREATE TRIGGER audit_subscriptions_delete
  AFTER DELETE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_row_change();

-- support_tickets ───────────────────────────────────────────────────────────
-- Tickets are mostly admin-facing edits, so we log every change.
DROP TRIGGER IF EXISTS audit_support_tickets_update ON public.support_tickets;
CREATE TRIGGER audit_support_tickets_update
  AFTER UPDATE ON public.support_tickets
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION public.audit_log_row_change();

-- ── 5. Admin RPCs ────────────────────────────────────────────────────────────

-- 5.1 admin_user_activity_feed ───────────────────────────────────────────────
-- Pull every audit row where the user was either the actor or the target
-- (matched via target_id::text — covers user_id, profile-user-id, etc).
CREATE OR REPLACE FUNCTION public.admin_user_activity_feed(
  _user_id uuid,
  _limit   int DEFAULT 50
)
RETURNS TABLE (
  id          uuid,
  actor_id    uuid,
  actor_email text,
  action      text,
  target_type text,
  target_id   text,
  details     jsonb,
  created_at  timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  RETURN QUERY
  SELECT a.id, a.actor_id, a.actor_email, a.action,
         a.target_type, a.target_id, a.details, a.created_at
  FROM public.audit_logs a
  WHERE a.actor_id = _user_id
     OR a.target_id = _user_id::text
  ORDER BY a.created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 500));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_user_activity_feed(uuid, int) TO authenticated;

-- 5.2 admin_recent_activity ──────────────────────────────────────────────────
-- Paginated platform-wide audit feed with optional action filter.
CREATE OR REPLACE FUNCTION public.admin_recent_activity(
  _limit         int  DEFAULT 100,
  _action_filter text DEFAULT NULL
)
RETURNS TABLE (
  id          uuid,
  actor_id    uuid,
  actor_email text,
  action      text,
  target_type text,
  target_id   text,
  details     jsonb,
  created_at  timestamptz,
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total bigint;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT count(*) INTO v_total
  FROM public.audit_logs a
  WHERE (_action_filter IS NULL OR a.action ILIKE _action_filter || '%');

  RETURN QUERY
  SELECT a.id, a.actor_id, a.actor_email, a.action,
         a.target_type, a.target_id, a.details, a.created_at,
         v_total
  FROM public.audit_logs a
  WHERE (_action_filter IS NULL OR a.action ILIKE _action_filter || '%')
  ORDER BY a.created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 500));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_recent_activity(int, text) TO authenticated;

-- 5.3 admin_ban_user / admin_unban_user ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_ban_user(_user_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot ban yourself';
  END IF;

  UPDATE public.profiles
     SET banned_at     = now(),
         banned_reason = _reason,
         updated_at    = now()
   WHERE user_id = _user_id;

  -- Trigger on profiles will fire, but we also write an explicit user.banned
  -- entry so the activity feed surfaces the ban as its own primary verb.
  INSERT INTO public.audit_logs(actor_id, actor_email, action, target_type, target_id, details)
  VALUES (auth.uid(), public._audit_actor_email(auth.uid()), 'user.banned', 'profiles',
          _user_id::text, jsonb_build_object('reason', _reason));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_ban_user(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_unban_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.profiles
     SET banned_at     = NULL,
         banned_reason = NULL,
         updated_at    = now()
   WHERE user_id = _user_id;

  INSERT INTO public.audit_logs(actor_id, actor_email, action, target_type, target_id, details)
  VALUES (auth.uid(), public._audit_actor_email(auth.uid()), 'user.unbanned', 'profiles',
          _user_id::text, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_unban_user(uuid) TO authenticated;

-- 5.4 admin_force_password_reset ─────────────────────────────────────────────
-- Generates a Supabase recovery token directly on auth.users. The admin can
-- copy-paste the magic link from the returned token. We intentionally do not
-- email the user — keeps the surface area small and avoids confusing
-- end-users who didn't request a reset.
CREATE OR REPLACE FUNCTION public.admin_force_password_reset(_user_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_token text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_token := replace(gen_random_uuid()::text, '-', '') ||
             replace(gen_random_uuid()::text, '-', '');

  UPDATE auth.users
     SET recovery_token  = v_token,
         recovery_sent_at = now()
   WHERE id = _user_id;

  INSERT INTO public.audit_logs(actor_id, actor_email, action, target_type, target_id, details)
  VALUES (auth.uid(), public._audit_actor_email(auth.uid()), 'user.password_reset_forced',
          'auth.users', _user_id::text, '{}'::jsonb);

  RETURN v_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_force_password_reset(uuid) TO authenticated;

-- 5.5 admin_delete_user ──────────────────────────────────────────────────────
-- Deletes the row from auth.users — cascades clean up profiles, user_roles,
-- registrations (where user_id matches), org_members, etc.
CREATE OR REPLACE FUNCTION public.admin_delete_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_admin_count int;
  v_target_is_admin boolean;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete yourself';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin')
    INTO v_target_is_admin;

  IF v_target_is_admin THEN
    SELECT count(*) INTO v_admin_count FROM public.user_roles WHERE role = 'admin';
    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'Cannot delete the last super admin';
    END IF;
  END IF;

  INSERT INTO public.audit_logs(actor_id, actor_email, action, target_type, target_id, details)
  VALUES (auth.uid(), public._audit_actor_email(auth.uid()), 'user.deleted', 'auth.users',
          _user_id::text, jsonb_build_object('was_admin', v_target_is_admin));

  DELETE FROM auth.users WHERE id = _user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;

-- 5.6 admin_event_force_unpublish ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_event_force_unpublish(_event_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.events
     SET status     = 'cancelled',
         published  = false,
         updated_at = now()
   WHERE id = _event_id;

  INSERT INTO public.audit_logs(actor_id, actor_email, action, target_type, target_id, details)
  VALUES (auth.uid(), public._audit_actor_email(auth.uid()), 'event.force_unpublished',
          'events', _event_id::text, jsonb_build_object('reason', _reason));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_event_force_unpublish(uuid, text) TO authenticated;

-- 5.7 admin_event_force_delete (soft delete) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_event_force_delete(_event_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.events
     SET deleted_at = now(),
         status     = 'cancelled',
         published  = false,
         updated_at = now()
   WHERE id = _event_id;

  INSERT INTO public.audit_logs(actor_id, actor_email, action, target_type, target_id, details)
  VALUES (auth.uid(), public._audit_actor_email(auth.uid()), 'event.force_deleted',
          'events', _event_id::text, jsonb_build_object('reason', _reason));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_event_force_delete(uuid, text) TO authenticated;

-- 5.8 admin_revenue_summary ──────────────────────────────────────────────────
-- All numbers are derived directly from registrations / subscriptions so the
-- super admin always sees the live snapshot, no caching layer involved.
--
--   gross_revenue        — sum of amount_paid on confirmed/paid registrations
--   platform_fees        — 2% of gross
--   refunds_issued       — sum of amount_paid on rows where status='refunded'
--   net_revenue          — gross - refunds - platform_fees
--   mrr                  — sum of plan-implied MRR for active paid subs
--   ticket_count_paid    — number of paid registrations contributing to gross
CREATE OR REPLACE FUNCTION public.admin_revenue_summary()
RETURNS TABLE (
  gross_revenue     numeric,
  platform_fees     numeric,
  refunds_issued    numeric,
  net_revenue       numeric,
  mrr               numeric,
  ticket_count_paid bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_gross  numeric;
  v_refunds numeric;
  v_fees   numeric;
  v_net    numeric;
  v_mrr    numeric;
  v_count  bigint;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT
    COALESCE(SUM(amount_paid) FILTER (WHERE status IN ('confirmed','paid')), 0)::numeric,
    COALESCE(SUM(amount_paid) FILTER (WHERE status = 'refunded'), 0)::numeric,
    COALESCE(count(*) FILTER (WHERE status IN ('confirmed','paid') AND amount_paid > 0), 0)::bigint
  INTO v_gross, v_refunds, v_count
  FROM public.registrations;

  v_fees := (v_gross * 0.02)::numeric;
  v_net  := (v_gross - v_refunds - v_fees)::numeric;

  -- Simple plan-to-MRR map. Edit alongside pricing changes in
  -- src/lib/billing/plan-meta.ts.
  SELECT COALESCE(SUM(
    CASE plan
      WHEN 'starter'   THEN 29
      WHEN 'pro'       THEN 99
      WHEN 'business'  THEN 299
      ELSE 0
    END
  ), 0)::numeric
  INTO v_mrr
  FROM public.subscriptions
  WHERE status = 'active';

  RETURN QUERY SELECT v_gross, v_fees, v_refunds, v_net, v_mrr, v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_revenue_summary() TO authenticated;

-- 5.9 admin_health_snapshot ──────────────────────────────────────────────────
-- Live counters for the System Health page.
CREATE OR REPLACE FUNCTION public.admin_health_snapshot()
RETURNS TABLE (
  db_size_mb                  numeric,
  total_users                 bigint,
  total_events                bigint,
  total_orgs                  bigint,
  total_tickets               bigint,
  total_communications_sent   bigint,
  last_24h_signups            bigint,
  last_24h_events_created     bigint,
  last_24h_failed_email_count bigint,
  last_24h_errors_logged      bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    -- pg_database_size returns bytes; convert to whole megabytes.
    (pg_database_size(current_database()) / (1024.0 * 1024.0))::numeric AS db_size_mb,
    (SELECT count(*)::bigint FROM public.profiles),
    (SELECT count(*)::bigint FROM public.events),
    (SELECT count(*)::bigint FROM public.organizations),
    (SELECT count(*)::bigint FROM public.support_tickets),
    (SELECT count(*)::bigint FROM public.communication_recipients
       WHERE email_status IN ('sent','delivered','opened','clicked')),
    (SELECT count(*)::bigint FROM public.profiles
       WHERE created_at >= now() - interval '24 hours'),
    (SELECT count(*)::bigint FROM public.events
       WHERE created_at >= now() - interval '24 hours'),
    (SELECT count(*)::bigint FROM public.communication_recipients
       WHERE email_status IN ('failed','bounced')
         AND created_at >= now() - interval '24 hours'),
    (SELECT count(*)::bigint FROM public.audit_logs
       WHERE action LIKE '%error%'
         AND created_at >= now() - interval '24 hours');
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_health_snapshot() TO authenticated;

-- ── 6. RLS hardening for banned users ────────────────────────────────────────
-- Banned users (`profiles.banned_at IS NOT NULL`) should not be able to
-- create new events or register for events. Existing RLS on each table is
-- preserved; we just AND in the not-banned predicate.

CREATE OR REPLACE FUNCTION public.is_user_banned(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE user_id = _user_id AND banned_at IS NOT NULL);
$$;

GRANT EXECUTE ON FUNCTION public.is_user_banned(uuid) TO authenticated;

-- Replace the event INSERT policy so banned users are blocked at the row level.
DROP POLICY IF EXISTS "Insert events" ON public.events;
CREATE POLICY "Insert events" ON public.events
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND NOT public.is_user_banned(auth.uid())
  );

-- And the registration INSERT policy.
DROP POLICY IF EXISTS "Auth register" ON public.registrations;
CREATE POLICY "Auth register" ON public.registrations
  FOR INSERT TO authenticated
  WITH CHECK (
    (user_id = auth.uid() OR user_id IS NULL)
    AND NOT public.is_user_banned(auth.uid())
  );

-- ── 7. End ───────────────────────────────────────────────────────────────────
-- Migration is fully idempotent: every CREATE OR REPLACE / DROP-and-CREATE
-- ensures a clean re-run on a partially-applied database.
