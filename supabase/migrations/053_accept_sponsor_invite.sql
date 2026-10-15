-- ═══════════════════════════════════════════════════════════════════════════════
-- 053_accept_sponsor_invite.sql
--
-- Sponsor team invites (/sponsor/accept?token=…) could not be accepted.
-- The page claimed the invite with a direct UPDATE on sponsor_members, but
-- the table's policies only let the sponsor's owner and the event's organiser
-- update rows — so for the actual invitee nothing changed and the page said
-- "Invite is invalid or already claimed by another account". Worse, when an
-- organiser opened the copied link themselves, the UPDATE *was* allowed and
-- the invite was claimed by the organiser's account, locking the real
-- invitee out.
--
-- `accept_sponsor_invite(_token)` claims it on the server instead:
--   • unknown token                                  → error INVITE_INVALID
--   • already this account's                         → ok ('already_yours')
--   • claimed by another account                     → error INVITE_CLAIMED
--   • the caller organises an event the sponsor is on → error INVITE_ORGANISER
--     (organisers share the link; they don't become sponsor team members)
--   • an invite an organiser claimed by mistake counts as unclaimed, so the
--     real invitee can still take it.
-- The link stays a bearer link, as before: whoever opens it first (and isn't
-- an organiser) joins. Audit-logged.
--
-- Idempotent — safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Whether `_uid` runs any event this sponsor is attached to.
CREATE OR REPLACE FUNCTION public._organises_sponsor_event(_sponsor_id uuid, _uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
      FROM event_sponsors es
      JOIN events e ON e.id = es.event_id
      LEFT JOIN organizations o ON o.id = e.org_id
     WHERE es.sponsor_id = _sponsor_id
       AND (e.user_id = _uid
            OR o.owner_id = _uid
            OR EXISTS (SELECT 1 FROM org_members m WHERE m.org_id = e.org_id AND m.user_id = _uid))
  );
$$;
REVOKE ALL ON FUNCTION public._organises_sponsor_event(uuid, uuid) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.accept_sponsor_invite(text);

CREATE FUNCTION public.accept_sponsor_invite(_token text)
RETURNS TABLE (sponsor_id uuid, sponsor_name text, result text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _m     sponsor_members%ROWTYPE;
  _uid   uuid := auth.uid();
  _email text;
  _name  text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Sign in first.' USING ERRCODE = '42501'; END IF;
  IF _token IS NULL OR length(btrim(_token)) < 8 THEN
    RAISE EXCEPTION 'INVITE_INVALID' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO _m FROM sponsor_members sm WHERE sm.invite_token = btrim(_token) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVITE_INVALID' USING ERRCODE = 'P0002'; END IF;

  SELECT s.name INTO _name FROM sponsors s WHERE s.id = _m.sponsor_id;

  -- Organisers share the link; they don't join the sponsor's team (even if
  -- the old page let them claim it).
  IF public._organises_sponsor_event(_m.sponsor_id, _uid) THEN
    RAISE EXCEPTION 'INVITE_ORGANISER' USING ERRCODE = '42501';
  END IF;

  IF _m.user_id = _uid AND _m.accepted_at IS NOT NULL THEN
    sponsor_id := _m.sponsor_id; sponsor_name := _name; result := 'already_yours';
    RETURN NEXT; RETURN;
  END IF;

  -- Taken by someone else — unless that someone was an organiser who opened
  -- the link by mistake (the old page let them claim it).
  IF _m.user_id IS NOT NULL AND _m.user_id <> _uid
     AND NOT public._organises_sponsor_event(_m.sponsor_id, _m.user_id) THEN
    RAISE EXCEPTION 'INVITE_CLAIMED' USING ERRCODE = '42501';
  END IF;

  UPDATE sponsor_members sm
     SET user_id = _uid, accepted_at = now()
   WHERE sm.id = _m.id;

  SELECT u.email INTO _email FROM auth.users u WHERE u.id = _uid;
  INSERT INTO audit_logs (actor_id, actor_email, action, target_type, target_id, details)
  VALUES (_uid, _email, 'sponsor_invite.accepted', 'sponsor_member', _m.id::text,
          jsonb_build_object('sponsor_id', _m.sponsor_id, 'invited_email', _m.email,
                             'replaced_organiser_claim', _m.user_id IS NOT NULL));

  sponsor_id := _m.sponsor_id; sponsor_name := _name; result := 'accepted';
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.accept_sponsor_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_sponsor_invite(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
