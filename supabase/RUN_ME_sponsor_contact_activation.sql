-- ═══════════════════════════════════════════════════════════════════════════════
-- A sponsor team member who sets up their account from the invitation email
-- gets their sponsor access straight away.
--
-- The set-up link (migration 062) created the account and then relied on the
-- browser going on to /sponsor/accept to accept the team invitation. When
-- that step didn't happen — an older guest-registration function, a closed
-- tab, a failed sign-in — the account existed but the person had no sponsor
-- access.
--
-- Now the guest-registration function accepts the invitation on the server,
-- in the same step that creates the account, through
-- accept_sponsor_invite_as(). That account was created for the invited
-- address and that address was proven by the emailed link, so this is the
-- person the organiser invited.
--
-- One-off repair: anyone who already set up their account from a sponsor
-- team link and whose invitation is still open is accepted now.
--
-- Run RUN_ME_invitation_prefill.sql (062) first.
-- Safe to run more than once. Paste into the Supabase SQL Editor and Run.
-- ═══════════════════════════════════════════════════════════════════════════════

/*
 * Accepts the sponsor-team invitation behind _token for _user_id, as
 * accept_sponsor_invite() does for a signed-in user. Only when the
 * account's verified address is the invited one. Returns 'accepted',
 * 'already_yours', or why not: 'invalid', 'email_mismatch', 'organiser',
 * 'claimed'. Service role only (the guest-registration function).
 */
CREATE OR REPLACE FUNCTION public.accept_sponsor_invite_as(_token text, _user_id uuid)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _m     sponsor_members%ROWTYPE;
  _email text;
BEGIN
  IF _token IS NULL OR length(btrim(_token)) < 8 OR _user_id IS NULL THEN RETURN 'invalid'; END IF;
  SELECT * INTO _m FROM sponsor_members sm WHERE sm.invite_token = btrim(_token) FOR UPDATE;
  IF NOT FOUND THEN RETURN 'invalid'; END IF;

  SELECT lower(u.email) INTO _email FROM auth.users u WHERE u.id = _user_id AND u.email_confirmed_at IS NOT NULL;
  IF _email IS NULL OR _email <> lower(btrim(_m.email)) THEN RETURN 'email_mismatch'; END IF;

  IF public._organises_sponsor_event(_m.sponsor_id, _user_id) THEN RETURN 'organiser'; END IF;
  IF _m.user_id = _user_id AND _m.accepted_at IS NOT NULL THEN RETURN 'already_yours'; END IF;
  IF _m.user_id IS NOT NULL AND _m.user_id <> _user_id
     AND NOT public._organises_sponsor_event(_m.sponsor_id, _m.user_id) THEN
    RETURN 'claimed';
  END IF;

  UPDATE sponsor_members sm SET user_id = _user_id, accepted_at = now() WHERE sm.id = _m.id;
  INSERT INTO audit_logs (actor_id, actor_email, action, target_type, target_id, details)
  VALUES (_user_id, _email, 'sponsor_invite.accepted', 'sponsor_member', _m.id::text,
          jsonb_build_object('sponsor_id', _m.sponsor_id, 'invited_email', _m.email, 'via', 'account_setup_link'));
  RETURN 'accepted';
END;
$$;
REVOKE ALL ON FUNCTION public.accept_sponsor_invite_as(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_sponsor_invite_as(text, uuid) TO service_role;


-- One-off repair: accounts set up from a sponsor-team link whose invitation
-- was never accepted.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT u.id AS user_id, substring(t.next_path FROM '^/sponsor/accept\?token=([0-9a-f]+)$') AS invite
      FROM account_activation_tokens t
      JOIN auth.users u ON lower(u.email) = t.email AND u.email_confirmed_at IS NOT NULL
     WHERE t.purpose = 'sponsor_contact'
       AND t.used_at IS NOT NULL
       AND t.next_path ~ '^/sponsor/accept\?token=[0-9a-f]+$'
  LOOP
    PERFORM public.accept_sponsor_invite_as(r.invite, r.user_id);
  END LOOP;
END $$;
