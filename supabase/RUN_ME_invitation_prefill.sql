-- ═══════════════════════════════════════════════════════════════════════════════
-- Invitations reuse what the organiser already entered.
--
-- An organiser who adds a speaker, sponsor, sponsor contact, team member or
-- partner types their name, company, designation and phone. The invitee
-- then had to type all of it again to sign up. Now:
--
--   • invitation_prefill(email): the details Illuxus already holds for an
--     address, newest first, field by field — pending team invitations,
--     speaker and sponsor-contact records, registrations. Server only; it is
--     shown to the invitee only after they prove the inbox (the link in the
--     email), never to anyone else.
--   • issue_invitation_activation(email, purpose, next_path): the same
--     single-use, 72-hour, hashed link guest registration already uses, now
--     also for invitations, with where to go once the account exists. None
--     is issued when the address already has an account — that person signs
--     in instead and nothing about their account is changed.
--   • Existing accounts: my_profile_suggestions() lists where an organiser's
--     details differ from the person's own profile; the person applies or
--     dismisses each one (apply_profile_suggestion / dismiss_profile_
--     suggestion). Nothing is ever overwritten without them; every applied
--     change is in the audit log.
--
-- The new account itself is linked to the existing person record by
-- migration 060 (the address is verified by the emailed link), so no second
-- person or contact is created.
--
-- Run RUN_ME_identity_foundation.sql (060) first.
-- Safe to run more than once. Paste into the Supabase SQL Editor and Run.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ── 1. What an activation link is for ────────────────────────────────────────

ALTER TABLE public.account_activation_tokens ADD COLUMN IF NOT EXISTS purpose   text NOT NULL DEFAULT 'guest';
ALTER TABLE public.account_activation_tokens ADD COLUMN IF NOT EXISTS next_path text;
ALTER TABLE public.account_activation_tokens ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES public.people(id) ON DELETE SET NULL;
DO $$
BEGIN
  ALTER TABLE public.account_activation_tokens
    ADD CONSTRAINT account_activation_tokens_purpose_check
    CHECK (purpose IN ('guest','speaker','sponsor','sponsor_contact','partner','team'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  -- Only an in-app path: never another site.
  ALTER TABLE public.account_activation_tokens
    ADD CONSTRAINT account_activation_tokens_next_path_check
    CHECK (next_path IS NULL OR (next_path ~ '^/[A-Za-z0-9/_?=&.%-]*$' AND next_path !~ '^//'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ── 2. Details already held for an address ───────────────────────────────────

/*
 * {title, first_name, last_name, designation, company, mobile_country_code,
 * mobile_number, linkedin_url}, each the newest non-empty value found. With
 * _organiser_only, registrations (which the person typed themselves) are
 * left out. Service role only.
 */
CREATE OR REPLACE FUNCTION public.invitation_prefill(_email text, _organiser_only boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _key    text := public.norm_email(_email);
  _person uuid;
  _out    jsonb := '{}'::jsonb;
  _fields text[] := ARRAY['title','designation','company','mobile_country_code','mobile_number','linkedin_url'];
  _named  boolean := false;
  _first  text;
  _last   text;
  _f      text;
  r       record;
  _full   text;
BEGIN
  IF _key IS NULL THEN RETURN _out; END IF;
  SELECT person_id INTO _person FROM person_emails WHERE email_key = _key;

  FOR r IN
    SELECT x.at, x.d FROM (
      SELECT i.updated_at AS at, i.prefill AS d
        FROM org_invitations i
       WHERE lower(btrim(i.email)) = _key AND i.status = 'pending'
      UNION ALL
      SELECT s.updated_at, jsonb_build_object('title', s.title, 'first_name', s.first_name, 'last_name', s.last_name,
               'full_name', s.name, 'designation', s.designation, 'company', s.company,
               'mobile_country_code', s.mobile_country_code, 'mobile_number', s.mobile_number, 'linkedin_url', s.linkedin_url)
        FROM speakers s
       WHERE (_person IS NOT NULL AND s.person_id = _person) OR lower(btrim(s.email)) = _key
      UNION ALL
      SELECT m.updated_at, jsonb_build_object('title', m.title, 'first_name', m.first_name, 'last_name', m.last_name,
               'full_name', m.display_name, 'designation', m.designation, 'company', m.company,
               'mobile_country_code', m.mobile_country_code, 'mobile_number', m.mobile_number, 'linkedin_url', m.linkedin_url)
        FROM sponsor_members m
       WHERE (_person IS NOT NULL AND m.person_id = _person) OR lower(btrim(m.email)) = _key
      UNION ALL
      SELECT g.updated_at, jsonb_build_object('title', g.title, 'first_name', g.first_name, 'last_name', g.last_name,
               'full_name', g.name, 'designation', g.designation, 'company', g.company,
               'mobile_country_code', g.mobile_country_code, 'mobile_number', g.mobile_number, 'linkedin_url', g.linkedin_url)
        FROM registrations g
       WHERE NOT _organiser_only
         AND ((_person IS NOT NULL AND g.person_id = _person) OR lower(btrim(g.email)) = _key)
    ) x
    ORDER BY x.at DESC NULLS LAST
  LOOP
    FOREACH _f IN ARRAY _fields LOOP
      IF NOT (_out ? _f) AND NULLIF(btrim(r.d ->> _f), '') IS NOT NULL THEN
        _out := _out || jsonb_build_object(_f, public.norm_text(r.d ->> _f));
      END IF;
    END LOOP;
    -- A name is taken whole from the newest record that has one, never a
    -- first name from one record and a last name from another. A record with
    -- only a full name is split once: first word, then the rest.
    IF NOT _named THEN
      _first := NULLIF(public.norm_text(r.d ->> 'first_name'), '');
      _last  := NULLIF(public.norm_text(r.d ->> 'last_name'), '');
      _full  := NULLIF(public.norm_text(r.d ->> 'full_name'), '');
      IF _first IS NULL AND _full IS NOT NULL AND position('@' IN _full) = 0 THEN
        _first := split_part(_full, ' ', 1);
        _last  := NULLIF(substr(_full, length(_first) + 2), '');
      END IF;
      IF _first IS NOT NULL THEN
        _out := _out || jsonb_build_object('first_name', _first);
        IF _last IS NOT NULL THEN _out := _out || jsonb_build_object('last_name', _last); END IF;
        _named := true;
      END IF;
    END IF;
  END LOOP;

  IF NOT _named THEN
    _full := NULLIF(public.norm_text((SELECT display_name FROM people WHERE id = _person)), '');
    IF _full IS NOT NULL AND position('@' IN _full) = 0 THEN
      _out := _out || jsonb_build_object('first_name', split_part(_full, ' ', 1));
      IF position(' ' IN _full) > 0 THEN
        _out := _out || jsonb_build_object('last_name', substr(_full, position(' ' IN _full) + 1));
      END IF;
    END IF;
  END IF;
  RETURN _out;
END;
$$;
REVOKE ALL ON FUNCTION public.invitation_prefill(text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invitation_prefill(text, boolean) TO service_role;


-- ── 3. Set-up links for invitations ──────────────────────────────────────────

/*
 * A single-use link for an invited address with no account yet: returns
 * the token (stored only as its SHA-256 hash, valid 72 hours) and retires
 * the address's earlier unused links. Null when the address already has an
 * account. The caller emails it to that address — the only way it reaches
 * anyone. Service role only (the invitation functions).
 */
CREATE OR REPLACE FUNCTION public.issue_invitation_activation(_email text, _purpose text, _next_path text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _key    text := public.norm_email(_email);
  _token  text;
  _person uuid;
BEGIN
  IF _key IS NULL THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = _key) THEN RETURN NULL; END IF;
  SELECT person_id INTO _person FROM person_emails WHERE email_key = _key;
  _token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  UPDATE account_activation_tokens SET used_at = now() WHERE email = _key AND used_at IS NULL;
  INSERT INTO account_activation_tokens (email, token_hash, expires_at, purpose, next_path, person_id)
  VALUES (_key, encode(sha256(convert_to(_token, 'UTF8')), 'hex'), now() + interval '72 hours',
          _purpose, _next_path, _person);
  RETURN _token;
END;
$$;
REVOKE ALL ON FUNCTION public.issue_invitation_activation(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_invitation_activation(text, text, text) TO service_role;

/*
 * Where an invited address without an account should land after setting
 * one up, or null when nothing is waiting for it: an open sponsor-contact
 * invitation, an open partner share, a speaker or a sponsor on an event.
 * Team invitations have their own link. Service role only.
 */
CREATE OR REPLACE FUNCTION public.pending_invitation_path(_email text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH k AS (SELECT public.norm_email(_email) AS key)
  SELECT COALESCE(
    (SELECT '/sponsor/accept?token=' || m.invite_token FROM sponsor_members m, k
      WHERE lower(btrim(m.email)) = k.key AND m.accepted_at IS NULL ORDER BY m.created_at DESC LIMIT 1),
    (SELECT '/partner' FROM utm_partner_access a, k WHERE a.invited_email = k.key AND a.status IN ('pending','accepted') LIMIT 1),
    (SELECT '/speaker' FROM speakers s JOIN event_speakers es ON es.speaker_id = s.id, k WHERE lower(btrim(s.email)) = k.key LIMIT 1),
    (SELECT '/sponsor' FROM sponsors s JOIN event_sponsors es ON es.sponsor_id = s.id, k WHERE lower(btrim(s.email)) = k.key LIMIT 1)
  );
$$;
REVOKE ALL ON FUNCTION public.pending_invitation_path(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pending_invitation_path(text) TO service_role;


-- ── 4. Existing accounts: suggestions, never overwrites ──────────────────────

CREATE TABLE IF NOT EXISTS public.profile_suggestion_dismissals (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  field      text NOT NULL,
  value_key  text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, field, value_key)
);
ALTER TABLE public.profile_suggestion_dismissals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profile_suggestion_dismissals FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.profile_suggestion_dismissals TO service_role;

/*
 * Where details an organiser entered for the signed-in person (as a speaker,
 * sponsor contact or team invitee) differ from their own profile, and the
 * profile field is empty or different. Comparison ignores case and spacing.
 */
CREATE OR REPLACE FUNCTION public.my_profile_suggestions()
RETURNS TABLE (field text, current_value text, suggested_value text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid   uuid := auth.uid();
  _email text;
  _pre   jsonb;
  _prof  profiles%ROWTYPE;
  _f     text;
  _cur   text;
  _sug   text;
BEGIN
  IF _uid IS NULL THEN RETURN; END IF;
  SELECT email INTO _email FROM auth.users WHERE id = _uid AND email_confirmed_at IS NOT NULL;
  IF _email IS NULL THEN RETURN; END IF;
  SELECT * INTO _prof FROM profiles WHERE user_id = _uid;
  IF NOT FOUND THEN RETURN; END IF;
  _pre := public.invitation_prefill(_email, true);
  FOREACH _f IN ARRAY ARRAY['title','first_name','last_name','designation','company',
                            'mobile_country_code','mobile_number','linkedin_url'] LOOP
    _sug := NULLIF(public.norm_text(_pre ->> _f), '');
    _cur := NULLIF(public.norm_text(to_jsonb(_prof) ->> _f), '');
    IF _sug IS NOT NULL AND lower(_sug) IS DISTINCT FROM lower(COALESCE(_cur, ''))
       AND NOT EXISTS (SELECT 1 FROM profile_suggestion_dismissals d
                        WHERE d.user_id = _uid AND d.field = _f AND d.value_key = lower(_sug)) THEN
      field := _f; current_value := _cur; suggested_value := _sug;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.my_profile_suggestions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_profile_suggestions() TO authenticated;

-- Applies one suggestion to the caller's own profile, as it stands now.
CREATE OR REPLACE FUNCTION public.apply_profile_suggestion(_field text)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _s   record;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Sign in first' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _s FROM public.my_profile_suggestions() x WHERE x.field = _field;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nothing to apply for %', _field USING ERRCODE = '22023'; END IF;
  -- _field is one of the fixed names my_profile_suggestions() returns.
  EXECUTE format('UPDATE public.profiles SET %I = $1, updated_at = now() WHERE user_id = $2', _s.field)
    USING _s.suggested_value, _uid;
  INSERT INTO audit_logs (actor_id, action, target_type, target_id, details)
  VALUES (_uid, 'profile.suggestion_applied', 'profile', _uid::text,
          jsonb_build_object('field', _s.field, 'from', _s.current_value, 'to', _s.suggested_value));
  RETURN _s.suggested_value;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_profile_suggestion(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_profile_suggestion(text) TO authenticated;

-- Keeps the profile as it is; this suggestion is not shown again.
CREATE OR REPLACE FUNCTION public.dismiss_profile_suggestion(_field text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _s   record;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Sign in first' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _s FROM public.my_profile_suggestions() x WHERE x.field = _field;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO profile_suggestion_dismissals (user_id, field, value_key)
  VALUES (_uid, _s.field, lower(_s.suggested_value)) ON CONFLICT DO NOTHING;
  INSERT INTO audit_logs (actor_id, action, target_type, target_id, details)
  VALUES (_uid, 'profile.suggestion_dismissed', 'profile', _uid::text,
          jsonb_build_object('field', _s.field, 'kept', _s.current_value, 'suggested', _s.suggested_value));
END;
$$;
REVOKE ALL ON FUNCTION public.dismiss_profile_suggestion(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dismiss_profile_suggestion(text) TO authenticated;
