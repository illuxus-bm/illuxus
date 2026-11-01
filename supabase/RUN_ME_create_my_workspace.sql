-- ═══════════════════════════════════════════════════════════════════════════════
-- Onboarding could leave a half-made workspace.
--
-- The onboarding page created the organisation, then its owner membership,
-- then its Free subscription as three separate requests, and ignored the
-- last two failing. A failure left a workspace without a membership or a
-- subscription, and since owners cannot delete organisations, trying again
-- made a second one.
--
-- create_my_workspace() does all three in one transaction: either the
-- workspace exists with its owner and its subscription, or nothing was
-- saved. It runs as the caller (SECURITY INVOKER), so the existing row
-- security and the plan guard apply exactly as they did to the separate
-- requests — the plan is always Free here; upgrades go through the team.
--
-- Safe to run more than once. Paste into the Supabase SQL Editor and Run.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_my_workspace(
  _name      text,
  _slug      text,
  _subdomain text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  _uid   uuid := auth.uid();
  _email text;
  _org   uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to create a workspace' USING ERRCODE = '42501';
  END IF;
  IF _name IS NULL OR btrim(_name) = '' THEN
    RAISE EXCEPTION 'Enter a workspace name' USING ERRCODE = '22023';
  END IF;
  IF _slug IS NULL OR btrim(_slug) = '' THEN
    RAISE EXCEPTION 'Missing workspace slug' USING ERRCODE = '22023';
  END IF;

  SELECT public._auth_user_email() INTO _email;

  INSERT INTO public.organizations (name, slug, subdomain, owner_id, plan, billing_email)
  VALUES (btrim(_name), _slug, NULLIF(btrim(COALESCE(_subdomain, '')), ''), _uid, 'free', _email)
  RETURNING id INTO _org;

  INSERT INTO public.org_members (org_id, user_id, role)
  VALUES (_org, _uid, 'owner')
  ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'owner';

  INSERT INTO public.subscriptions (org_id, plan, status)
  VALUES (_org, 'free', 'active')
  ON CONFLICT (org_id) DO NOTHING;

  RETURN _org;
END;
$$;

REVOKE ALL ON FUNCTION public.create_my_workspace(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_my_workspace(text, text, text) TO authenticated;

COMMENT ON FUNCTION public.create_my_workspace(text, text, text) IS
  'Onboarding: creates the caller''s organisation, their owner membership and the Free subscription in one transaction. Runs as the caller, so row security and the plan guard apply.';
