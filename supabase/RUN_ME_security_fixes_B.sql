-- ═══════════════════════════════════════════════════════════════════════════════
-- Security fixes, backend review B (2026-11-03).
--
--   B-1  Speaker and sponsor contact details were public.
--   B-2  Any signed-in user could change or delete the website's files.
--   B-3  A banned user could lift their own ban (platform and community), a
--        community member could make themselves an admin, and any signed-in
--        user could moderate any community (can_moderate_community NULL bug).
--
-- (B-4, the support form, is an edge-function change: submit-support-ticket.)
--
-- One section per finding. Every statement is safe to run more than once.
-- Paste the whole file into the Supabase SQL Editor and Run.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────────
-- Shared helpers
-- ───────────────────────────────────────────────────────────────────────────────

-- The signed-in user's own address (also defined by RUN_ME_security_fixes.sql).
CREATE OR REPLACE FUNCTION public._auth_user_email()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT lower(email) FROM auth.users WHERE id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public._auth_user_email() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._auth_user_email() TO authenticated, service_role;

-- An event's organisers: its owner, its organisation's owner and members, and
-- platform admins. The same rule the registration checks use.
CREATE OR REPLACE FUNCTION public._can_manage_event(_user_id uuid, _event_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.events e
     WHERE e.id = _event_id
       AND (
         e.user_id = _user_id
         OR public.has_role(_user_id, 'admin')
         OR (e.org_id IS NOT NULL AND (public.is_org_owner(_user_id, e.org_id)
                                       OR public.is_org_member(_user_id, e.org_id)))
       )
  );
$$;
REVOKE ALL ON FUNCTION public._can_manage_event(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._can_manage_event(uuid, uuid) TO authenticated, service_role;


-- ───────────────────────────────────────────────────────────────────────────────
-- B-1 — Speaker and sponsor contact details were public.
--
-- Anyone could read every column of a speaker or sponsor on a published
-- event, including email and mobile number. Now a speaker's or sponsor's full
-- record (with contact details) is readable only by:
--   • the organisers of an event they are part of (event owner, the event's
--     organisation, platform admins);
--   • whoever added them (existing "Creators manage …" policy);
--   • the speaker themselves (matched on their sign-in email) or the sponsor's
--     own team.
-- Public pages read speakers_public / sponsors_public instead: the same
-- people, for published events only, with no email or phone columns.
-- ───────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Anon view speakers for published"      ON public.speakers;
DROP POLICY IF EXISTS "Auth view speakers for published"      ON public.speakers;
DROP POLICY IF EXISTS "Event owner view linked speakers"      ON public.speakers;
DROP POLICY IF EXISTS "Organisers view their events' speakers" ON public.speakers;
DROP POLICY IF EXISTS "Speakers view their own record"        ON public.speakers;

CREATE POLICY "Organisers view their events' speakers" ON public.speakers
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.event_speakers es
     WHERE es.speaker_id = speakers.id
       AND public._can_manage_event(auth.uid(), es.event_id)
  ));
CREATE POLICY "Speakers view their own record" ON public.speakers
  FOR SELECT TO authenticated
  USING (email IS NOT NULL AND lower(email) = public._auth_user_email());

DROP POLICY IF EXISTS "Anon view sponsors for published"       ON public.sponsors;
DROP POLICY IF EXISTS "Auth view sponsors for published"       ON public.sponsors;
DROP POLICY IF EXISTS "Event owner view linked sponsors"       ON public.sponsors;
DROP POLICY IF EXISTS "Organisers view their events' sponsors" ON public.sponsors;
DROP POLICY IF EXISTS "Sponsor team views its sponsor"         ON public.sponsors;

CREATE POLICY "Organisers view their events' sponsors" ON public.sponsors
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.event_sponsors es
     WHERE es.sponsor_id = sponsors.id
       AND public._can_manage_event(auth.uid(), es.event_id)
  ));
CREATE POLICY "Sponsor team views its sponsor" ON public.sponsors
  FOR SELECT TO authenticated
  USING (public.is_sponsor_member(auth.uid(), id));

-- Public views. Plain (owner-rights) views on purpose: they must return people
-- the base tables now hide, and they carry no contact column.
DROP VIEW IF EXISTS public.speakers_public;
CREATE VIEW public.speakers_public AS
SELECT s.id, s.name, s.first_name, s.last_name, s.title, s.designation,
       s.company, s.bio, s.photo_url, s.linkedin_url, s.company_website,
       s.industry, s.created_at, s.updated_at
  FROM public.speakers s
 WHERE EXISTS (
   SELECT 1 FROM public.event_speakers es
     JOIN public.events e ON e.id = es.event_id
    WHERE es.speaker_id = s.id AND e.status = 'published'
 );
REVOKE ALL ON public.speakers_public FROM PUBLIC;
GRANT SELECT ON public.speakers_public TO anon, authenticated, service_role;
COMMENT ON VIEW public.speakers_public IS
  'Speakers of published events, without contact details. Public pages read this; the speakers table is for organisers.';

DROP VIEW IF EXISTS public.sponsors_public;
CREATE VIEW public.sponsors_public AS
SELECT s.id, s.name, s.logo_url, s.website, s.tier, s.tier_label,
       s.description, s.created_at, s.updated_at
  FROM public.sponsors s
 WHERE EXISTS (
   SELECT 1 FROM public.event_sponsors es
     JOIN public.events e ON e.id = es.event_id
    WHERE es.sponsor_id = s.id AND e.status = 'published'
 );
REVOKE ALL ON public.sponsors_public FROM PUBLIC;
GRANT SELECT ON public.sponsors_public TO anon, authenticated, service_role;
COMMENT ON VIEW public.sponsors_public IS
  'Sponsors of published events, without contact details. Public pages read this; the sponsors table is for organisers.';


-- ───────────────────────────────────────────────────────────────────────────────
-- B-2 — Any signed-in user could change or delete the website's files.
--
-- The `site-assets` bucket holds both the website's own files (logo, favicon,
-- site-editor images) and organisers' event and organisation images. Writes
-- are now decided by folder:
--   event-covers/<event>/, event-creatives/<event>/, ai-backgrounds/<event>/
--                                    → that event's organisers
--   event-covers/drafts/<user>/      → that user
--   webinar-branding/<session>/      → organisers of the session's event
--   org-<org>/…, brand-kits/<org>/   → that organisation's owner and members
--   speaker-photos/, sponsor-logos/  → upload: any signed-in user;
--                                      change/delete: only who uploaded it
--   anything else (the website's own files)
--                                    → platform admins only
-- Platform admins can change anything. Reading stays public (the site shows
-- these files to visitors).
-- ───────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.site_asset_writable(_name text, _owner text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid    uuid := auth.uid();
  _top    text := split_part(_name, '/', 1);
  _second text := split_part(_name, '/', 2);
  _third  text := split_part(_name, '/', 3);
  _org    text;
  _event  uuid;
  _uuid_re constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
BEGIN
  IF _uid IS NULL OR _name IS NULL THEN RETURN false; END IF;
  IF public.has_role(_uid, 'admin') THEN RETURN true; END IF;

  IF _top = 'event-covers' AND _second = 'drafts' THEN
    RETURN _third = _uid::text;
  ELSIF _top IN ('event-covers', 'event-creatives', 'ai-backgrounds') THEN
    RETURN _second ~ _uuid_re AND public._can_manage_event(_uid, _second::uuid);
  ELSIF _top = 'webinar-branding' THEN
    IF _second !~ _uuid_re THEN RETURN false; END IF;
    SELECT ws.event_id INTO _event FROM public.webinar_sessions ws WHERE ws.id = _second::uuid;
    RETURN _event IS NOT NULL AND public._can_manage_event(_uid, _event);
  ELSIF _top = 'brand-kits' OR _top LIKE 'org-%' THEN
    _org := CASE WHEN _top = 'brand-kits' THEN _second ELSE substring(_top FROM 5) END;
    RETURN _org ~ _uuid_re
       AND (public.is_org_owner(_uid, _org::uuid) OR public.is_org_member(_uid, _org::uuid));
  ELSIF _top IN ('speaker-photos', 'sponsor-logos') THEN
    -- No owner in the path: the uploader owns the file.
    RETURN _owner IS NULL OR _owner = _uid::text;
  END IF;

  -- The website's own files.
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.site_asset_writable(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.site_asset_writable(text, text) TO authenticated, service_role;

DROP POLICY IF EXISTS "Authenticated upload site-assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update site-assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete site-assets" ON storage.objects;
DROP POLICY IF EXISTS "Admin upload site-assets"         ON storage.objects;
DROP POLICY IF EXISTS "Admin update site-assets"         ON storage.objects;
DROP POLICY IF EXISTS "Admin delete site-assets"         ON storage.objects;
DROP POLICY IF EXISTS "site-assets upload by folder"     ON storage.objects;
DROP POLICY IF EXISTS "site-assets update by folder"     ON storage.objects;
DROP POLICY IF EXISTS "site-assets delete by folder"     ON storage.objects;

CREATE POLICY "site-assets upload by folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'site-assets'
              AND public.site_asset_writable(name, COALESCE(owner_id, owner::text)));
CREATE POLICY "site-assets update by folder" ON storage.objects
  FOR UPDATE TO authenticated
  USING      (bucket_id = 'site-assets'
              AND public.site_asset_writable(name, COALESCE(owner_id, owner::text)))
  WITH CHECK (bucket_id = 'site-assets'
              AND public.site_asset_writable(name, COALESCE(owner_id, owner::text)));
CREATE POLICY "site-assets delete by folder" ON storage.objects
  FOR DELETE TO authenticated
  USING      (bucket_id = 'site-assets'
              AND public.site_asset_writable(name, COALESCE(owner_id, owner::text)));


-- ───────────────────────────────────────────────────────────────────────────────
-- B-3 — Bans could be lifted by the banned user.
--
-- Platform ban (profiles.banned_at): users could edit it on their own profile.
-- Community ban (community_members.status): members could edit their own
-- membership (status, and role — so a member could make themselves an admin),
-- rejoin through community_join, or delete the row and insert a fresh one.
--
-- Now:
--   • only the server can change a ban; the banned user cannot, by any path;
--   • a ban is lifted only by approving the user's unban request:
--       – platform bans by a platform admin;
--       – community bans by that community's organisers (moderators /
--         managers) or a platform admin;
--   • members can no longer insert or edit their own membership rows directly
--     (the app always goes through community_join / community_leave), and a
--     banned or suspended member can't delete theirs to start over.
--
-- In an emergency, a platform admin can lift a platform ban by hand in the SQL
-- Editor with, in the same transaction:
--   SELECT set_config('illuxus.unban_approved', 'on', true);
-- ───────────────────────────────────────────────────────────────────────────────

-- can_moderate_community() returned NULL, not false, for anyone who isn't a
-- member of the community (community_role_of finds no row). Checks written as
-- `IF NOT can_moderate_community(...) THEN RAISE` then let everyone through,
-- so any signed-in user could ban or reinstate members (community_set_member_status),
-- hide or delete posts (community_moderate), re-sync members
-- (community_resync_from_previous) and list a community's recipients
-- (communications_resolve_community_recipients). It now always returns
-- true or false, which closes all four.
CREATE OR REPLACE FUNCTION public.can_moderate_community(_user_id uuid, _community_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(public.community_role_of(_user_id, _community_id) IN ('moderator','manager'), false)
      OR COALESCE(public.has_role(_user_id, 'admin'), false);
$$;
GRANT EXECUTE ON FUNCTION public.can_moderate_community(uuid, uuid) TO authenticated;

-- Platform ban columns.
CREATE OR REPLACE FUNCTION public.guard_profile_ban_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.banned_at IS DISTINCT FROM OLD.banned_at
     OR NEW.banned_reason IS DISTINCT FROM OLD.banned_reason THEN
    -- Not SECURITY DEFINER: current_user is the caller's role, so a direct
    -- API update ('authenticated') is told apart from the admin functions.
    IF current_user IN ('authenticated', 'anon') THEN
      RAISE EXCEPTION 'Only a platform admin can change a ban' USING ERRCODE = '42501';
    END IF;
    IF OLD.banned_at IS NOT NULL AND NEW.banned_at IS NULL
       AND COALESCE(current_setting('illuxus.unban_approved', true), '') <> 'on' THEN
      RAISE EXCEPTION 'A ban is lifted only by approving the user''s unban request'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS profiles_guard_ban ON public.profiles;
CREATE TRIGGER profiles_guard_ban
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_ban_columns();

-- Community membership: no direct self-insert / self-edit; no self-delete while
-- banned or suspended.
DROP POLICY IF EXISTS "self join"         ON public.community_members;
DROP POLICY IF EXISTS "self update notif" ON public.community_members;
DROP POLICY IF EXISTS "self leave"        ON public.community_members;
CREATE POLICY "self leave" ON public.community_members
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND status NOT IN ('banned', 'suspended'));

CREATE OR REPLACE FUNCTION public.guard_community_member_ban()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'banned' AND NEW.status IS DISTINCT FROM 'banned'
     AND COALESCE(current_setting('illuxus.unban_approved', true), '') <> 'on' THEN
    IF current_user IN ('authenticated', 'anon') THEN
      RAISE EXCEPTION 'A ban is lifted only by approving the member''s unban request'
        USING ERRCODE = '42501';
    END IF;
    -- Server paths that re-add people (event registration auto-join) keep
    -- the ban in place rather than failing the whole operation.
    NEW.status := OLD.status;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS community_members_guard_ban ON public.community_members;
CREATE TRIGGER community_members_guard_ban
  BEFORE UPDATE ON public.community_members
  FOR EACH ROW EXECUTE FUNCTION public.guard_community_member_ban();

-- Joining again doesn't undo a ban or suspension.
CREATE OR REPLACE FUNCTION public.community_join(_community_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _id uuid;
  _kind community_kind;
  _status text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;

  SELECT kind INTO _kind FROM public.communities WHERE id = _community_id;
  IF _kind = 'event' THEN
    RAISE EXCEPTION 'Event communities can only be joined by registering for the event.';
  END IF;

  SELECT status INTO _status FROM public.community_members
   WHERE community_id = _community_id AND user_id = auth.uid();
  IF _status IN ('banned', 'suspended') THEN
    RAISE EXCEPTION 'You were removed from this community. You can ask its organisers to let you back in from My Communities.'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO community_members (community_id, user_id, role, status, auto)
  VALUES (_community_id, auth.uid(), 'member', 'active', false)
  ON CONFLICT (community_id, user_id) DO UPDATE
    SET status = 'active', joined_at = excluded.joined_at
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.community_join(uuid) TO authenticated;

-- Moderators can still ban and suspend, but not lift a ban directly.
CREATE OR REPLACE FUNCTION public.community_set_member_status(
  _community_id uuid, _user_id uuid, _status text, _reason text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;
  IF _status NOT IN ('active','suspended','banned') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;
  IF NOT can_moderate_community(auth.uid(), _community_id) THEN
    RAISE EXCEPTION 'Not a moderator';
  END IF;
  IF _status <> 'banned' AND EXISTS (
       SELECT 1 FROM community_members
        WHERE community_id = _community_id AND user_id = _user_id AND status = 'banned') THEN
    RAISE EXCEPTION 'This member is banned. A ban is lifted only by approving their unban request.'
      USING ERRCODE = '42501';
  END IF;
  UPDATE community_members SET status = _status
  WHERE community_id = _community_id AND user_id = _user_id;

  PERFORM _record_audit(
    'community.member.' || _status,
    'community_member',
    _user_id::text,
    jsonb_build_object('community_id', _community_id, 'reason', _reason)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.community_set_member_status(uuid, uuid, text, text) TO authenticated;

-- Unban requests.
CREATE TABLE IF NOT EXISTS public.unban_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope         text NOT NULL CHECK (scope IN ('platform', 'community')),
  community_id  uuid REFERENCES public.communities(id) ON DELETE CASCADE,
  message       text NOT NULL CHECK (char_length(message) BETWEEN 10 AND 2000),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at   timestamptz,
  review_note   text CHECK (review_note IS NULL OR char_length(review_note) <= 2000),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK ((scope = 'platform') = (community_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS unban_requests_one_pending
  ON public.unban_requests (user_id, scope, COALESCE(community_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS unban_requests_review_queue
  ON public.unban_requests (scope, community_id, created_at) WHERE status = 'pending';

ALTER TABLE public.unban_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.unban_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.unban_requests TO authenticated;
GRANT ALL ON public.unban_requests TO service_role;

DROP POLICY IF EXISTS "Users see their own unban requests" ON public.unban_requests;
DROP POLICY IF EXISTS "Reviewers see unban requests"       ON public.unban_requests;
CREATE POLICY "Users see their own unban requests" ON public.unban_requests
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Reviewers see unban requests" ON public.unban_requests
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin')
         OR (scope = 'community' AND public.can_moderate_community(auth.uid(), community_id)));

-- The signed-in user's bans and where their requests stand.
CREATE OR REPLACE FUNCTION public.my_bans()
RETURNS TABLE (
  scope text, community_id uuid, community_name text, community_slug text,
  banned_at timestamptz, reason text,
  request_id uuid, request_status text, request_created_at timestamptz, review_note text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH bans AS (
    SELECT 'platform'::text AS scope, NULL::uuid AS community_id, NULL::text AS community_name,
           NULL::text AS community_slug, p.banned_at, p.banned_reason AS reason
      FROM profiles p
     WHERE p.user_id = auth.uid() AND p.banned_at IS NOT NULL
    UNION ALL
    SELECT 'community', cm.community_id, c.name, c.slug, NULL::timestamptz, NULL::text
      FROM community_members cm JOIN communities c ON c.id = cm.community_id
     WHERE cm.user_id = auth.uid() AND cm.status = 'banned'
  )
  SELECT b.scope, b.community_id, b.community_name, b.community_slug, b.banned_at, b.reason,
         r.id, r.status, r.created_at, r.review_note
    FROM bans b
    LEFT JOIN LATERAL (
      SELECT * FROM unban_requests ur
       WHERE ur.user_id = auth.uid() AND ur.scope = b.scope
         AND ur.community_id IS NOT DISTINCT FROM b.community_id
       ORDER BY ur.created_at DESC LIMIT 1
    ) r ON true;
$$;
REVOKE ALL ON FUNCTION public.my_bans() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_bans() TO authenticated;

-- A banned user asks to be let back in.
CREATE OR REPLACE FUNCTION public.request_unban(_scope text, _community_id uuid, _message text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _msg text := btrim(COALESCE(_message, ''));
  _id  uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Sign in to send a request' USING ERRCODE = '42501'; END IF;
  IF _scope NOT IN ('platform', 'community') THEN RAISE EXCEPTION 'Invalid request' USING ERRCODE = '22023'; END IF;
  IF _scope = 'platform' THEN _community_id := NULL; END IF;
  IF char_length(_msg) < 10 OR char_length(_msg) > 2000 THEN
    RAISE EXCEPTION 'Write between 10 and 2000 characters' USING ERRCODE = '22023';
  END IF;

  IF _scope = 'platform' AND NOT EXISTS (
       SELECT 1 FROM profiles WHERE user_id = _uid AND banned_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Your account is not banned' USING ERRCODE = '22023';
  END IF;
  IF _scope = 'community' AND NOT EXISTS (
       SELECT 1 FROM community_members
        WHERE user_id = _uid AND community_id = _community_id AND status = 'banned') THEN
    RAISE EXCEPTION 'You are not banned from this community' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM unban_requests
              WHERE user_id = _uid AND scope = _scope AND status = 'pending'
                AND community_id IS NOT DISTINCT FROM _community_id) THEN
    RAISE EXCEPTION 'Your request is already waiting for a decision' USING ERRCODE = '23505';
  END IF;
  IF (SELECT count(*) FROM unban_requests
       WHERE user_id = _uid AND scope = _scope AND status = 'rejected'
         AND community_id IS NOT DISTINCT FROM _community_id
         AND created_at > now() - interval '30 days') >= 3 THEN
    RAISE EXCEPTION 'Too many requests. You can ask again 30 days after your last one.' USING ERRCODE = '54000';
  END IF;

  INSERT INTO unban_requests (user_id, scope, community_id, message)
  VALUES (_uid, _scope, _community_id, _msg)
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;
REVOKE ALL ON FUNCTION public.request_unban(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_unban(text, uuid, text) TO authenticated;

-- Pending requests a reviewer may decide: platform admins see every platform
-- request (and any community's); organisers see their community's.
CREATE OR REPLACE FUNCTION public.unban_requests_to_review(_community_id uuid DEFAULT NULL)
RETURNS TABLE (
  id uuid, user_id uuid, display_name text, avatar_url text,
  scope text, community_id uuid, community_name text,
  message text, created_at timestamptz, ban_reason text, banned_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _admin boolean := public.has_role(_uid, 'admin');
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  IF _community_id IS NULL AND NOT _admin THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;
  IF _community_id IS NOT NULL AND NOT public.can_moderate_community(_uid, _community_id) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT ur.id, ur.user_id,
           COALESCE(NULLIF(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), p.display_name, 'Member'),
           p.avatar_url, ur.scope, ur.community_id, c.name, ur.message, ur.created_at,
           CASE WHEN ur.scope = 'platform' THEN p.banned_reason END,
           CASE WHEN ur.scope = 'platform' THEN p.banned_at END
      FROM unban_requests ur
      LEFT JOIN profiles p ON p.user_id = ur.user_id
      LEFT JOIN communities c ON c.id = ur.community_id
     WHERE ur.status = 'pending'
       AND (CASE WHEN _community_id IS NULL THEN ur.scope = 'platform'
                 ELSE ur.scope = 'community' AND ur.community_id = _community_id END)
     ORDER BY ur.created_at;
END;
$$;
REVOKE ALL ON FUNCTION public.unban_requests_to_review(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unban_requests_to_review(uuid) TO authenticated;

-- Approve (lifts the ban) or reject a pending request.
CREATE OR REPLACE FUNCTION public.review_unban_request(_request_id uuid, _approve boolean, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _req unban_requests%ROWTYPE;
  _note_clean text := NULLIF(btrim(COALESCE(_note, '')), '');
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _req FROM unban_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002'; END IF;
  IF _req.status <> 'pending' THEN RAISE EXCEPTION 'This request was already decided' USING ERRCODE = '22023'; END IF;

  IF _req.scope = 'platform' AND NOT public.has_role(_uid, 'admin') THEN
    RAISE EXCEPTION 'Only a platform admin can decide this request' USING ERRCODE = '42501';
  END IF;
  IF _req.scope = 'community' AND NOT public.can_moderate_community(_uid, _req.community_id) THEN
    RAISE EXCEPTION 'Only this community''s organisers can decide this request' USING ERRCODE = '42501';
  END IF;
  IF char_length(COALESCE(_note_clean, '')) > 2000 THEN
    RAISE EXCEPTION 'Keep the note under 2000 characters' USING ERRCODE = '22023';
  END IF;

  UPDATE unban_requests
     SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
         reviewed_by = _uid, reviewed_at = now(), review_note = _note_clean
   WHERE id = _request_id;

  IF _approve THEN
    PERFORM set_config('illuxus.unban_approved', 'on', true);
    IF _req.scope = 'platform' THEN
      UPDATE profiles SET banned_at = NULL, banned_reason = NULL, updated_at = now()
       WHERE user_id = _req.user_id;
    ELSE
      UPDATE community_members SET status = 'active'
       WHERE community_id = _req.community_id AND user_id = _req.user_id AND status = 'banned';
    END IF;
    PERFORM set_config('illuxus.unban_approved', 'off', true);
  END IF;

  IF _req.scope = 'platform' THEN
    INSERT INTO audit_logs(actor_id, actor_email, action, target_type, target_id, details)
    VALUES (_uid, public._audit_actor_email(_uid),
            CASE WHEN _approve THEN 'user.unbanned' ELSE 'user.unban_rejected' END,
            'profiles', _req.user_id::text,
            jsonb_build_object('request_id', _request_id, 'note', _note_clean));
  ELSE
    PERFORM _record_audit(
      CASE WHEN _approve THEN 'community.member.unbanned' ELSE 'community.member.unban_rejected' END,
      'community_member', _req.user_id::text,
      jsonb_build_object('community_id', _req.community_id, 'request_id', _request_id, 'note', _note_clean));
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.review_unban_request(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_unban_request(uuid, boolean, text) TO authenticated;

-- The admin "Unban" button now approves the user's pending request.
CREATE OR REPLACE FUNCTION public.admin_unban_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _req uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  SELECT id INTO _req FROM unban_requests
   WHERE user_id = _user_id AND scope = 'platform' AND status = 'pending'
   ORDER BY created_at DESC LIMIT 1;
  IF _req IS NULL THEN
    RAISE EXCEPTION 'This user has not asked to be unbanned. A ban is lifted only by approving their unban request.'
      USING ERRCODE = '42501';
  END IF;
  PERFORM public.review_unban_request(_req, true, NULL);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_unban_user(uuid) TO authenticated;
