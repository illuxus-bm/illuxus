-- ═══════════════════════════════════════════════════════════════════════════════
-- 084_plan_pricing.sql
--
-- Plan prices, set by super admins on /dashboard/admin/plans.
--
--   • `plans.price_monthly` / `plans.price_yearly` — what the plan costs, in
--     `plans.currency` (ISO 4217, e.g. INR, USD). NULL monthly means "Custom"
--     (contact sales); 0 means free; NULL yearly means no yearly option.
--   • admin_save_plan takes an optional `_pricing` jsonb
--     {"monthly": 2499, "yearly": 24990, "currency": "INR"}. Leaving it out
--     keeps the plan's current prices, so an older app saving only features
--     and limits never wipes them.
--
-- The first run seeds the prices the onboarding screen used to hard-code
-- (Free $0, Starter $29, Pro $79, Business $199 a month). Later runs leave
-- prices alone. Run after 048_plan_features.sql.
--
-- Idempotent — safe to run more than once. Paste into the SQL Editor and Run.
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF to_regclass('public.plans') IS NULL THEN
    RAISE EXCEPTION 'Missing plans table: run 048_plan_features.sql first.';
  END IF;

  -- Seed only when the columns are first added, so a later run never
  -- overwrites prices a super admin has set (NULL is a real choice: "Custom").
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'plans' AND column_name = 'price_monthly'
  ) THEN
    ALTER TABLE public.plans
      ADD COLUMN price_monthly numeric(12,2) CHECK (price_monthly IS NULL OR price_monthly >= 0),
      ADD COLUMN price_yearly  numeric(12,2) CHECK (price_yearly  IS NULL OR price_yearly  >= 0),
      ADD COLUMN currency      text NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$');

    UPDATE public.plans SET price_monthly = v.price
      FROM (VALUES ('free', 0), ('starter', 29), ('pro', 79), ('business', 199)) AS v(key, price)
     WHERE plans.key = v.key;
  END IF;
END $$;

-- Columns again, for a database where a partial run added only some of them.
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS price_monthly numeric(12,2) CHECK (price_monthly IS NULL OR price_monthly >= 0);
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS price_yearly  numeric(12,2) CHECK (price_yearly  IS NULL OR price_yearly  >= 0);
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS currency      text NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$');

-- One function, not two overloads: with both, a call naming only the first
-- seven arguments would be ambiguous.
DROP FUNCTION IF EXISTS public.admin_save_plan(text, text, text, int, boolean, jsonb, text[]);

CREATE OR REPLACE FUNCTION public.admin_save_plan(
  _key text, _name text, _description text, _sort_order int, _is_public boolean,
  _limits jsonb, _features text[], _pricing jsonb DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _k        text;
  _clean    jsonb := '{}'::jsonb;
  _monthly  numeric;
  _yearly   numeric;
  _currency text;
  _cur      public.plans%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF _key IS NULL OR _key !~ '^[a-z][a-z0-9_]{1,31}$' THEN RAISE EXCEPTION 'Invalid plan key'; END IF;
  FOREACH _k IN ARRAY ARRAY['max_events','max_attendees_per_event','max_team_members'] LOOP
    IF jsonb_typeof(_limits -> _k) IS DISTINCT FROM 'number' OR (_limits ->> _k)::numeric < -1 THEN
      RAISE EXCEPTION 'Limit % must be a number (-1 for unlimited)', _k;
    END IF;
    _clean := _clean || jsonb_build_object(_k, floor((_limits ->> _k)::numeric)::int);
  END LOOP;

  SELECT * INTO _cur FROM public.plans WHERE key = _key;

  IF _pricing IS NULL THEN
    -- Not given: keep what the plan has (a new plan starts as "Custom").
    _monthly  := _cur.price_monthly;
    _yearly   := _cur.price_yearly;
    _currency := COALESCE(_cur.currency, 'USD');
  ELSE
    IF jsonb_typeof(_pricing) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Pricing must be an object';
    END IF;
    FOREACH _k IN ARRAY ARRAY['monthly','yearly'] LOOP
      IF jsonb_typeof(_pricing -> _k) NOT IN ('number', 'null')
         OR (jsonb_typeof(_pricing -> _k) = 'number'
             AND ((_pricing ->> _k)::numeric < 0 OR (_pricing ->> _k)::numeric > 9999999999)) THEN
        RAISE EXCEPTION 'The % price must be empty or a number from 0 up', _k;
      END IF;
    END LOOP;
    _monthly  := round((_pricing ->> 'monthly')::numeric, 2);
    _yearly   := round((_pricing ->> 'yearly')::numeric, 2);
    _currency := upper(btrim(COALESCE(_pricing ->> 'currency', _cur.currency, 'USD')));
    IF _currency !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'Currency must be a three-letter code such as INR'; END IF;
  END IF;

  INSERT INTO public.plans (key, name, description, sort_order, is_public, limits, features, price_monthly, price_yearly, currency)
  VALUES (_key, btrim(_name), COALESCE(_description, ''), COALESCE(_sort_order, 0), COALESCE(_is_public, true),
          _clean, (SELECT COALESCE(array_agg(DISTINCT f ORDER BY f), '{}') FROM unnest(COALESCE(_features, '{}')) f),
          _monthly, _yearly, _currency)
  ON CONFLICT (key) DO UPDATE SET
    name = EXCLUDED.name, description = EXCLUDED.description, sort_order = EXCLUDED.sort_order,
    is_public = EXCLUDED.is_public, limits = EXCLUDED.limits, features = EXCLUDED.features,
    price_monthly = EXCLUDED.price_monthly, price_yearly = EXCLUDED.price_yearly, currency = EXCLUDED.currency;

  -- Keep the legacy per-organisation snapshot in step.
  UPDATE public.organizations o
     SET plan_limits = p.limits || jsonb_build_object('features', to_jsonb(p.features))
    FROM public.plans p
   WHERE p.key = _key AND o.plan = _key;

  PERFORM public._plan_audit('plan.save', 'plan', _key,
    jsonb_build_object('name', _name, 'limits', _clean, 'features', to_jsonb(COALESCE(_features, '{}')),
                       'pricing', jsonb_build_object('monthly', _monthly, 'yearly', _yearly, 'currency', _currency)));
END; $$;
REVOKE ALL ON FUNCTION public.admin_save_plan(text, text, text, int, boolean, jsonb, text[], jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_plan(text, text, text, int, boolean, jsonb, text[], jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
