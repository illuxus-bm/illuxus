-- ═══════════════════════════════════════════════════════════════════════════════
-- Sign-up could mark its own email as verified.
--
-- handle_new_user() runs on every new auth.users row and read
-- `must_change_password` from raw_user_meta_data — which is whatever the
-- person signing up sent — and, when true, set email_confirmed_at itself.
-- Anyone could sign up with someone else's address, skip the emailed code
-- and sign in. The same trigger also attached every registration for that
-- address to the new account at once, verified or not, so the account
-- received that person's tickets, QR codes and webinar join links.
--
-- Now:
--   • nothing in the trigger marks an email verified — only Supabase Auth;
--   • registrations for an address are attached only once it is proven:
--       – at creation, for accounts created already verified (the emailed
--         one-time links in guest-registration and team-invitation);
--       – when Supabase Auth verifies the address (sign-up code or link),
--         or verifies a changed address (on_auth_user_email_verified);
--   • registrations already attached to accounts that never verified their
--     address are detached; they re-attach if that address is verified.
--
-- Requires Supabase Auth → Providers → Email → "Confirm email" to be ON;
-- with it off, every sign-up counts as verified.
--
-- Safe to run more than once. Paste into the Supabase SQL Editor and Run.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Attaches records kept under an email address to the account that has just
-- proven it owns that address. Only ever called by the auth triggers.
CREATE OR REPLACE FUNCTION public.link_verified_email_records(_user_id uuid, _email text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _user_id IS NULL OR _email IS NULL OR btrim(_email) = '' THEN RETURN; END IF;
  -- Rows already attached to an account are left alone.
  UPDATE public.registrations
     SET user_id = _user_id
   WHERE user_id IS NULL
     AND lower(email) = lower(btrim(_email));
END;
$$;
REVOKE ALL ON FUNCTION public.link_verified_email_records(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_verified_email_records(uuid, text) TO service_role;


CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _m jsonb := COALESCE(NEW.raw_user_meta_data, '{}');
  _at text; _t text; _fn text; _ln text; _d text; _co text; _mc text;
  _mn text; _li text; _cw text; _ce text; _ind text; _dn text; _done boolean;
  _utm_source   text := NULLIF(trim(_m->>'utm_source'),   '');
  _utm_medium   text := NULLIF(trim(_m->>'utm_medium'),   '');
  _utm_campaign text := NULLIF(trim(_m->>'utm_campaign'), '');
  _utm_content  text := NULLIF(trim(_m->>'utm_content'),  '');
  _utm_term     text := NULLIF(trim(_m->>'utm_term'),     '');
BEGIN
  _at := COALESCE(_m->>'account_type','attendee');
  IF _at NOT IN ('attendee','organizer') THEN _at := 'attendee'; END IF;

  _t  := NULLIF(trim(_m->>'title'),'');
  _fn := NULLIF(trim(_m->>'first_name'),'');
  _ln := NULLIF(trim(_m->>'last_name'),'');
  _d  := NULLIF(trim(_m->>'designation'),'');
  _co := NULLIF(trim(_m->>'company'),'');
  _mc := NULLIF(trim(_m->>'mobile_country_code'),'');
  _mn := NULLIF(trim(_m->>'mobile_number'),'');
  _li := NULLIF(trim(_m->>'linkedin_url'),'');
  _cw := NULLIF(trim(_m->>'company_website'),'');
  _ce := NULLIF(trim(_m->>'company_employee_count'),'');
  _ind:= NULLIF(trim(_m->>'industry'),'');

  _dn := NULLIF(trim(COALESCE(_fn,'') || ' ' || COALESCE(_ln,'')), '');
  IF _dn IS NULL THEN _dn := COALESCE(_m->>'display_name', NEW.email); END IF;

  _done := _fn IS NOT NULL AND _ln IS NOT NULL AND _d IS NOT NULL
       AND _co IS NOT NULL AND _mn IS NOT NULL;

  INSERT INTO profiles(
    user_id, display_name, account_type, title, first_name, last_name,
    designation, company, mobile_country_code, mobile_number,
    linkedin_url, company_website, company_employee_count, industry,
    profile_completed,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term
  ) VALUES (
    NEW.id, _dn, _at, _t, _fn, _ln, _d, _co, _mc, _mn,
    _li, _cw, _ce, _ind, _done,
    _utm_source, _utm_medium, _utm_campaign, _utm_content, _utm_term
  )
  ON CONFLICT (user_id) DO UPDATE SET
    utm_source   = COALESCE(public.profiles.utm_source,   EXCLUDED.utm_source),
    utm_medium   = COALESCE(public.profiles.utm_medium,   EXCLUDED.utm_medium),
    utm_campaign = COALESCE(public.profiles.utm_campaign, EXCLUDED.utm_campaign),
    utm_content  = COALESCE(public.profiles.utm_content,  EXCLUDED.utm_content),
    utm_term     = COALESCE(public.profiles.utm_term,     EXCLUDED.utm_term);

  -- Nothing here marks an email as verified: raw_user_meta_data is whatever
  -- the person signing up sent. Only Supabase Auth confirms an address.

  -- Registrations for this email are attached only once the address is
  -- proven. An account created already verified (the emailed one-time links
  -- in guest-registration and team-invitation) is linked here; a public
  -- sign-up is linked by on_auth_user_email_verified when it confirms.
  IF NEW.email IS NOT NULL AND NEW.email_confirmed_at IS NOT NULL THEN
    PERFORM public.link_verified_email_records(NEW.id, NEW.email);
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'On auth.users INSERT: create the profile row (with first-touch UTM fields from raw_user_meta_data). Never marks an email verified. Attaches registrations for the email only when the account is created already verified; otherwise on_auth_user_email_verified does it when Supabase Auth verifies the address.';


-- When Supabase Auth verifies an address — a sign-up's first confirmation,
-- or a confirmed change of address — attach what is kept under it.
CREATE OR REPLACE FUNCTION public.handle_auth_email_verified()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.link_verified_email_records(NEW.id, NEW.email);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_auth_email_verified() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_email_verified ON auth.users;
CREATE TRIGGER on_auth_user_email_verified
  AFTER UPDATE OF email_confirmed_at, email ON auth.users
  FOR EACH ROW
  WHEN (NEW.email IS NOT NULL AND NEW.email_confirmed_at IS NOT NULL
        AND (OLD.email_confirmed_at IS NULL OR NEW.email IS DISTINCT FROM OLD.email))
  EXECUTE FUNCTION public.handle_auth_email_verified();


-- One-off: detach registrations from accounts that never verified their
-- address. Such an account cannot sign in, so nobody loses access; the rows
-- re-attach through the trigger above if the address is ever verified.
UPDATE public.registrations r
   SET user_id = NULL
  FROM auth.users u
 WHERE r.user_id = u.id
   AND u.email_confirmed_at IS NULL;


-- ── Optional review (read-only) ─────────────────────────────────────────────
-- Accounts whose sign-up carried the flag, i.e. possibly verified by the old
-- trigger rather than by their owner. Legacy organiser-created accounts carry
-- it too, so review each one before acting:
--
--   SELECT id, email, created_at, email_confirmed_at, last_sign_in_at
--     FROM auth.users
--    WHERE (raw_user_meta_data->>'must_change_password')::boolean IS TRUE
--    ORDER BY created_at DESC;
