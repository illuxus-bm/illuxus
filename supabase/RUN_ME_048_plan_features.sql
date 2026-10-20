-- ═══════════════════════════════════════════════════════════════════════════════
-- 048_plan_features.sql
--
-- Plans and the features each one includes, controlled by super admins.
--
--   • `plans` — one row per plan: name, limits and the list of feature keys
--     it includes (keys are defined in src/lib/plans/features.ts). Anyone can
--     read it; only super admins can change it, through admin_save_plan /
--     admin_delete_plan.
--   • `organizations.feature_overrides` — per-organisation exceptions,
--     {"certificates": true, "webinar": false}, set by super admins only.
--   • org_entitlements(org) / org_has_feature(org, key) — the single answer to
--     "what can this organisation use", for the app and the edge functions.
--     Plan features + legacy `addons` + overrides set true − overrides set false.
--   • Triggers stop anyone but a super admin (or the service role) changing an
--     organisation's plan, limits, add-ons or overrides — until now an owner
--     could set their own plan, and onboarding let anyone pick a paid plan.
--     New organisations created by users always start on 'free'.
--   • BEFORE INSERT triggers refuse new certificates, certificate templates,
--     creatives, UTM links and venue selections when the organisation's plan
--     doesn't include the feature. Triggers also cover inserts made inside
--     SECURITY DEFINER functions such as issue_certificates.
--
-- The seeded plans keep every module on for every plan (the webinar studio
-- stays an add-on), so applying this changes nothing for existing organisers
-- until a super admin edits the matrix at /dashboard/admin/plans.
--
-- Idempotent — safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── pre-checks ────────────────────────────────────────────────────────────────
-- Stop early, with a clear message, if a helper this relies on is missing.
DO $$
DECLARE _fn text;
BEGIN
  FOREACH _fn IN ARRAY ARRAY['public.has_role(uuid,public.app_role)', 'public.is_org_member(uuid,uuid)', 'public.is_org_owner(uuid,uuid)'] LOOP
    IF to_regprocedure(_fn) IS NULL THEN
      RAISE EXCEPTION 'Missing function %: apply the base schema first.', _fn;
    END IF;
  END LOOP;
  IF to_regclass('public.organizations') IS NULL OR to_regclass('public.events') IS NULL THEN
    RAISE EXCEPTION 'Missing organizations or events table: apply the base schema first.';
  END IF;
END $$;

-- Columns used below, in case an older database predates them.
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS plan        text   NOT NULL DEFAULT 'free';
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS plan_limits jsonb  NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS addons      text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS updated_at  timestamptz NOT NULL DEFAULT now();

-- Own helpers, so this section doesn't depend on others that may be missing.
CREATE OR REPLACE FUNCTION public.plans_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

-- Audit entries are best-effort: a missing or changed audit_logs table must
-- never block a plan change.
CREATE OR REPLACE FUNCTION public._plan_audit(_action text, _target_type text, _target_id text, _details jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_logs (actor_id, actor_email, action, target_type, target_id, details)
  VALUES (auth.uid(), (SELECT u.email FROM auth.users u WHERE u.id = auth.uid()), _action, _target_type, _target_id, COALESCE(_details, '{}'::jsonb));
EXCEPTION WHEN OTHERS THEN
  NULL;
END; $$;
REVOKE ALL ON FUNCTION public._plan_audit(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;

-- ── plans ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plans (
  key          text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]{1,31}$'),
  name         text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 60),
  description  text NOT NULL DEFAULT '',
  sort_order   int  NOT NULL DEFAULT 0,
  is_public    boolean NOT NULL DEFAULT true,
  limits       jsonb NOT NULL DEFAULT '{"max_events":-1,"max_attendees_per_event":-1,"max_team_members":-1}'::jsonb,
  features     text[] NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone reads plans" ON public.plans;
CREATE POLICY "Anyone reads plans" ON public.plans FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.plans TO anon, authenticated;
GRANT ALL ON public.plans TO service_role;

DROP TRIGGER IF EXISTS update_plans_updated_at ON public.plans;
CREATE TRIGGER update_plans_updated_at BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.plans_touch_updated_at();

-- Seed. Must match DEFAULT_PLANS in src/lib/plans/features.ts.
INSERT INTO public.plans (key, name, description, sort_order, limits, features) VALUES
  ('free', 'Free', 'For trying things out', 0,
   '{"max_events":3,"max_attendees_per_event":50,"max_team_members":1}',
   ARRAY['website_builder','agenda','speakers','sponsor_management','venue_sourcing','badges','self_checkin','communications','whatsapp','community','creatives','creatives_ai','brochure','certificates','utm_tracking','reports','marketing','landing_builder','custom_domain']),
  ('starter', 'Starter', 'For growing organisers', 1,
   '{"max_events":10,"max_attendees_per_event":200,"max_team_members":3}',
   ARRAY['website_builder','agenda','speakers','sponsor_management','venue_sourcing','badges','self_checkin','communications','whatsapp','community','creatives','creatives_ai','brochure','certificates','utm_tracking','reports','marketing','landing_builder','custom_domain']),
  ('pro', 'Pro', 'For serious teams', 2,
   '{"max_events":50,"max_attendees_per_event":1000,"max_team_members":10}',
   ARRAY['website_builder','agenda','speakers','sponsor_management','venue_sourcing','badges','self_checkin','communications','whatsapp','community','creatives','creatives_ai','brochure','certificates','utm_tracking','reports','marketing','landing_builder','custom_domain','advanced_analytics']),
  ('business', 'Business', 'For agencies & enterprises', 3,
   '{"max_events":-1,"max_attendees_per_event":-1,"max_team_members":-1}',
   ARRAY['website_builder','agenda','speakers','sponsor_management','venue_sourcing','badges','self_checkin','communications','whatsapp','community','creatives','creatives_ai','brochure','certificates','utm_tracking','reports','marketing','landing_builder','custom_domain','advanced_analytics','white_label','api_access','priority_support'])
ON CONFLICT (key) DO NOTHING;

-- ── per-organisation overrides ────────────────────────────────────────────────
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS feature_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ── entitlements ──────────────────────────────────────────────────────────────
-- Internal: no caller check. Used by org_has_feature, the triggers below and
-- the public wrapper.
CREATE OR REPLACE FUNCTION public._org_entitlements(_org_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _plan     text := 'free';
  _addons   text[] := '{}';
  _over     jsonb := '{}'::jsonb;
  _p        public.plans%ROWTYPE;
  _features text[];
BEGIN
  SELECT o.plan, COALESCE(o.addons, '{}'), COALESCE(o.feature_overrides, '{}'::jsonb)
    INTO _plan, _addons, _over
  FROM public.organizations o WHERE o.id = _org_id;
  -- No such organisation leaves the targets NULL.
  _plan := COALESCE(_plan, 'free');
  _addons := COALESCE(_addons, '{}');
  _over := COALESCE(_over, '{}'::jsonb);

  SELECT * INTO _p FROM public.plans WHERE key = _plan;
  IF NOT FOUND THEN
    SELECT * INTO _p FROM public.plans WHERE key = 'free';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT f ORDER BY f), '{}') INTO _features
  FROM (
    SELECT unnest(COALESCE(_p.features, '{}')) AS f
    UNION SELECT unnest(_addons)
    UNION SELECT e.key FROM jsonb_each(_over) e WHERE e.value = 'true'::jsonb
  ) granted
  WHERE f NOT IN (SELECT e.key FROM jsonb_each(_over) e WHERE e.value = 'false'::jsonb);

  RETURN jsonb_build_object(
    'org_id',    _org_id,
    'plan',      _plan,
    'plan_name', COALESCE(_p.name, initcap(_plan)),
    'limits',    COALESCE(_p.limits, '{}'::jsonb),
    'features',  to_jsonb(_features),
    'overrides', _over
  );
END; $$;
REVOKE ALL ON FUNCTION public._org_entitlements(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._org_entitlements(uuid) TO service_role;

-- Public: members of the organisation, owners of its events, super admins and
-- the service role.
CREATE OR REPLACE FUNCTION public.org_entitlements(_org_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin')
     AND NOT public.is_org_member(auth.uid(), _org_id)
     AND NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = _org_id AND o.owner_id = auth.uid())
     AND NOT EXISTS (SELECT 1 FROM public.events e WHERE e.org_id = _org_id AND e.user_id = auth.uid())
  THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN public._org_entitlements(_org_id);
END; $$;
REVOKE ALL ON FUNCTION public.org_entitlements(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_entitlements(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.org_has_feature(_org_id uuid, _feature text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((public._org_entitlements(_org_id) -> 'features') ? _feature, false);
$$;
REVOKE ALL ON FUNCTION public.org_has_feature(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_has_feature(uuid, text) TO authenticated, service_role;

-- ── only super admins change plans ────────────────────────────────────────────
-- Non-admin writes keep the stored plan columns (silently, so existing
-- "save organisation settings" calls that send the whole row keep working),
-- and a new organisation created by a user starts on 'free'.
CREATE OR REPLACE FUNCTION public.guard_org_plan_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _free public.plans%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO _free FROM public.plans WHERE key = 'free';
    NEW.plan := 'free';
    NEW.addons := '{}';
    NEW.feature_overrides := '{}'::jsonb;
    IF FOUND THEN
      NEW.plan_limits := _free.limits || jsonb_build_object('features', to_jsonb(_free.features));
    END IF;
  ELSE
    NEW.plan := OLD.plan;
    NEW.plan_limits := OLD.plan_limits;
    NEW.addons := OLD.addons;
    NEW.feature_overrides := OLD.feature_overrides;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS organizations_guard_plan ON public.organizations;
CREATE TRIGGER organizations_guard_plan BEFORE INSERT OR UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.guard_org_plan_columns();

-- Subscriptions: owners may create their organisation's row (onboarding);
-- only super admins change it. The plan always follows the organisation.
CREATE OR REPLACE FUNCTION public.guard_subscription_plan()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  SELECT o.plan INTO NEW.plan FROM public.organizations o WHERE o.id = NEW.org_id;
  NEW.plan := COALESCE(NEW.plan, 'free');
  RETURN NEW;
END; $$;

DO $$
BEGIN
  IF to_regclass('public.subscriptions') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
  DROP POLICY IF EXISTS "Owner manage sub" ON public.subscriptions;
  DROP POLICY IF EXISTS "Owner create sub" ON public.subscriptions;
  DROP POLICY IF EXISTS "Admin manage subs" ON public.subscriptions;
  CREATE POLICY "Owner create sub" ON public.subscriptions FOR INSERT TO authenticated
    WITH CHECK (public.is_org_owner(auth.uid(), org_id));
  CREATE POLICY "Admin manage subs" ON public.subscriptions FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
  DROP TRIGGER IF EXISTS subscriptions_guard_plan ON public.subscriptions;
  CREATE TRIGGER subscriptions_guard_plan BEFORE INSERT OR UPDATE ON public.subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.guard_subscription_plan();
END $$;

-- ── server-side feature checks ────────────────────────────────────────────────
-- TG_ARGV[0] is the feature key. The organisation comes from the row's
-- org_id, or its event's org_id. Rows with no organisation (legacy personal
-- events) are let through.
CREATE OR REPLACE FUNCTION public.enforce_plan_feature()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _feature text := TG_ARGV[0];
  _row     jsonb := to_jsonb(NEW);
  _org     uuid;
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF _row ? 'org_id' AND NULLIF(_row ->> 'org_id', '') IS NOT NULL THEN
    _org := (_row ->> 'org_id')::uuid;
  ELSIF _row ? 'event_id' AND NULLIF(_row ->> 'event_id', '') IS NOT NULL THEN
    SELECT e.org_id INTO _org FROM public.events e WHERE e.id = (_row ->> 'event_id')::uuid;
  END IF;
  IF _org IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT public.org_has_feature(_org, _feature) THEN
    RAISE EXCEPTION 'Your plan does not include this feature (%). Ask us to upgrade your plan.', _feature
      USING ERRCODE = 'P0001', HINT = 'plan_feature:' || _feature;
  END IF;
  RETURN NEW;
END; $$;

DO $$
DECLARE
  _t record;
BEGIN
  FOR _t IN
    SELECT * FROM (VALUES
      ('certificate_templates',  'certificates'),
      ('certificates',           'certificates'),
      ('event_creatives',        'creatives'),
      ('utm_links',              'utm_tracking'),
      ('event_venue_selections', 'venue_sourcing')
    ) AS v(tbl, feature)
  LOOP
    IF to_regclass('public.' || _t.tbl) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', _t.tbl || '_plan_feature', _t.tbl);
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_feature(%L)',
        _t.tbl || '_plan_feature', _t.tbl, _t.feature
      );
    END IF;
  END LOOP;
END $$;

-- ── super-admin functions ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_save_plan(
  _key text, _name text, _description text, _sort_order int, _is_public boolean,
  _limits jsonb, _features text[]
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _k text;
  _clean jsonb := '{}'::jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF _key IS NULL OR _key !~ '^[a-z][a-z0-9_]{1,31}$' THEN RAISE EXCEPTION 'Invalid plan key'; END IF;
  FOREACH _k IN ARRAY ARRAY['max_events','max_attendees_per_event','max_team_members'] LOOP
    IF jsonb_typeof(_limits -> _k) IS DISTINCT FROM 'number' OR (_limits ->> _k)::numeric < -1 THEN
      RAISE EXCEPTION 'Limit % must be a number (-1 for unlimited)', _k;
    END IF;
    _clean := _clean || jsonb_build_object(_k, floor((_limits ->> _k)::numeric)::int);
  END LOOP;

  INSERT INTO public.plans (key, name, description, sort_order, is_public, limits, features)
  VALUES (_key, btrim(_name), COALESCE(_description, ''), COALESCE(_sort_order, 0), COALESCE(_is_public, true),
          _clean, (SELECT COALESCE(array_agg(DISTINCT f ORDER BY f), '{}') FROM unnest(COALESCE(_features, '{}')) f))
  ON CONFLICT (key) DO UPDATE SET
    name = EXCLUDED.name, description = EXCLUDED.description, sort_order = EXCLUDED.sort_order,
    is_public = EXCLUDED.is_public, limits = EXCLUDED.limits, features = EXCLUDED.features;

  -- Keep the legacy per-organisation snapshot in step.
  UPDATE public.organizations o
     SET plan_limits = p.limits || jsonb_build_object('features', to_jsonb(p.features))
    FROM public.plans p
   WHERE p.key = _key AND o.plan = _key;

  PERFORM public._plan_audit('plan.save', 'plan', _key,
    jsonb_build_object('name', _name, 'limits', _clean, 'features', to_jsonb(COALESCE(_features, '{}'))));
END; $$;
REVOKE ALL ON FUNCTION public.admin_save_plan(text, text, text, int, boolean, jsonb, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_plan(text, text, text, int, boolean, jsonb, text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_plan(_key text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF _key = 'free' THEN RAISE EXCEPTION 'The free plan cannot be deleted'; END IF;
  SELECT count(*) INTO _n FROM public.organizations WHERE plan = _key;
  IF _n > 0 THEN RAISE EXCEPTION '% organisation(s) are on this plan. Move them to another plan first.', _n; END IF;
  DELETE FROM public.plans WHERE key = _key;
  PERFORM public._plan_audit('plan.delete', 'plan', _key, '{}'::jsonb);
END; $$;
REVOKE ALL ON FUNCTION public.admin_delete_plan(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_plan(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_org_features(_oid uuid, _overrides jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _e record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF jsonb_typeof(COALESCE(_overrides, '{}'::jsonb)) <> 'object' THEN RAISE EXCEPTION 'Overrides must be an object'; END IF;
  FOR _e IN SELECT * FROM jsonb_each(COALESCE(_overrides, '{}'::jsonb)) LOOP
    IF jsonb_typeof(_e.value) <> 'boolean' THEN
      RAISE EXCEPTION 'Override % must be true or false', _e.key;
    END IF;
  END LOOP;
  UPDATE public.organizations SET feature_overrides = COALESCE(_overrides, '{}'::jsonb), updated_at = now() WHERE id = _oid;
  PERFORM public._plan_audit('org.features', 'organization', _oid::text, jsonb_build_object('overrides', _overrides));
END; $$;
REVOKE ALL ON FUNCTION public.admin_set_org_features(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_org_features(uuid, jsonb) TO authenticated;

-- Plan changes must name a plan that exists, and refresh the snapshot.
CREATE OR REPLACE FUNCTION public.admin_update_org_plan(_oid uuid, _plan text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.plans%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT * INTO _p FROM public.plans WHERE key = _plan;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown plan %', _plan; END IF;
  UPDATE public.organizations
     SET plan = _plan,
         plan_limits = _p.limits || jsonb_build_object('features', to_jsonb(_p.features)),
         updated_at = now()
   WHERE id = _oid;
  IF to_regclass('public.subscriptions') IS NOT NULL THEN
    UPDATE public.subscriptions SET plan = _plan, updated_at = now() WHERE org_id = _oid;
  END IF;
  PERFORM public._plan_audit('org.plan', 'organization', _oid::text, jsonb_build_object('plan', _plan));
END; $$;

CREATE OR REPLACE FUNCTION public.admin_update_org(
  _oid uuid, _name text DEFAULT NULL, _subdomain text DEFAULT NULL,
  _billing_email text DEFAULT NULL, _plan text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF _plan IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.plans WHERE key = _plan) THEN
    RAISE EXCEPTION 'Unknown plan %', _plan;
  END IF;
  UPDATE public.organizations
     SET name = COALESCE(_name, name),
         subdomain = COALESCE(_subdomain, subdomain),
         billing_email = COALESCE(_billing_email, billing_email),
         updated_at = now()
   WHERE id = _oid;
  IF _plan IS NOT NULL THEN
    PERFORM public.admin_update_org_plan(_oid, _plan);
  END IF;
END; $$;
