-- ============================================================================
-- Community Ecosystem — Phases 2, 3, 4
-- Adds: chat channels + messages, resources, polls, reports, connections,
--       badges/leaderboard, moderation/notification triggers, calendar view,
--       search RPC.
-- ============================================================================

-- ── Storage bucket for community attachments / resources ────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('community', 'community', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read community"   ON storage.objects;
DROP POLICY IF EXISTS "Members write community" ON storage.objects;
CREATE POLICY "Public read community"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'community');
CREATE POLICY "Members write community"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'community' AND auth.uid() IS NOT NULL);

-- ── 1. community_channels (chat channels + topic threads) ───────────────────
CREATE TABLE IF NOT EXISTS public.community_channels (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id    uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  kind            text NOT NULL DEFAULT 'general'
                  CHECK (kind IN ('general','sessions','networking','qa','custom')),
  name            text NOT NULL,
  description     text,
  archived        boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (community_id, name)
);
CREATE INDEX IF NOT EXISTS cchannels_community_idx ON public.community_channels(community_id);

ALTER TABLE public.community_channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read channels" ON public.community_channels;
CREATE POLICY "members read channels" ON public.community_channels FOR SELECT
  USING (public.is_community_member(auth.uid(), community_id) OR public.has_role(auth.uid(),'admin'::app_role));

DROP POLICY IF EXISTS "managers write channels" ON public.community_channels;
CREATE POLICY "managers write channels" ON public.community_channels FOR ALL TO authenticated
  USING (public.community_role_of(auth.uid(), community_id) IN ('manager','moderator') OR public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.community_role_of(auth.uid(), community_id) IN ('manager','moderator') OR public.has_role(auth.uid(),'admin'::app_role));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_channels TO authenticated;
GRANT ALL ON public.community_channels TO service_role;

-- ── 2. community_messages (chat) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.community_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id      uuid NOT NULL REFERENCES public.community_channels(id) ON DELETE CASCADE,
  author_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body            text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  attachments     jsonb NOT NULL DEFAULT '[]',
  reply_to        uuid REFERENCES public.community_messages(id) ON DELETE SET NULL,
  edited_at       timestamptz,
  deleted_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cmsgs_channel_idx ON public.community_messages(channel_id, created_at DESC);

ALTER TABLE public.community_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read messages" ON public.community_messages;
CREATE POLICY "members read messages" ON public.community_messages FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.community_channels c
            WHERE c.id = channel_id AND public.is_community_member(auth.uid(), c.community_id))
    OR public.has_role(auth.uid(),'admin'::app_role)
  );

DROP POLICY IF EXISTS "members send messages" ON public.community_messages;
CREATE POLICY "members send messages" ON public.community_messages FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.community_channels c
                WHERE c.id = channel_id AND public.is_community_member(auth.uid(), c.community_id))
  );

DROP POLICY IF EXISTS "edit own messages" ON public.community_messages;
CREATE POLICY "edit own messages" ON public.community_messages FOR UPDATE TO authenticated
  USING (
    author_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.community_channels c
               WHERE c.id = channel_id AND public.can_moderate_community(auth.uid(), c.community_id))
  );

DROP POLICY IF EXISTS "delete own messages" ON public.community_messages;
CREATE POLICY "delete own messages" ON public.community_messages FOR DELETE TO authenticated
  USING (
    author_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.community_channels c
               WHERE c.id = channel_id AND public.can_moderate_community(auth.uid(), c.community_id))
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_messages TO authenticated;
GRANT ALL ON public.community_messages TO service_role;

-- ── 3. community_resources ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.community_resources (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id    uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  uploaded_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  category        text NOT NULL DEFAULT 'general'
                  CHECK (category IN ('learning','event','sponsor','session','general')),
  title           text NOT NULL,
  description     text,
  file_url        text NOT NULL,
  file_name       text NOT NULL,
  file_size       bigint NOT NULL,
  mime_type       text NOT NULL,
  download_count  int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cresources_community_idx ON public.community_resources(community_id, created_at DESC);

ALTER TABLE public.community_resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read resources" ON public.community_resources;
CREATE POLICY "members read resources" ON public.community_resources FOR SELECT
  USING (public.is_community_member(auth.uid(), community_id) OR public.has_role(auth.uid(),'admin'::app_role));

DROP POLICY IF EXISTS "non-members write resources" ON public.community_resources;
CREATE POLICY "non-members write resources" ON public.community_resources FOR INSERT TO authenticated
  WITH CHECK (
    public.is_community_member(auth.uid(), community_id)
    AND public.community_role_of(auth.uid(), community_id) <> 'member'
    AND uploaded_by = auth.uid()
  );

DROP POLICY IF EXISTS "uploader/mod can edit/delete resources" ON public.community_resources;
CREATE POLICY "uploader/mod can edit/delete resources" ON public.community_resources FOR ALL TO authenticated
  USING (uploaded_by = auth.uid() OR public.can_moderate_community(auth.uid(), community_id))
  WITH CHECK (uploaded_by = auth.uid() OR public.can_moderate_community(auth.uid(), community_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_resources TO authenticated;
GRANT ALL ON public.community_resources TO service_role;

-- ── 4. community_polls + votes ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.community_polls (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id         uuid NOT NULL UNIQUE REFERENCES public.community_posts(id) ON DELETE CASCADE,
  multi           boolean NOT NULL DEFAULT false,
  options         jsonb NOT NULL,                             -- [{id,label}]
  closes_at       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.community_polls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members read polls" ON public.community_polls;
CREATE POLICY "members read polls" ON public.community_polls FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.community_posts p
            WHERE p.id = post_id AND public.is_community_member(auth.uid(), p.community_id))
    OR public.has_role(auth.uid(),'admin'::app_role)
  );

DROP POLICY IF EXISTS "create polls" ON public.community_polls;
CREATE POLICY "create polls" ON public.community_polls FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.community_posts p
            WHERE p.id = post_id AND p.author_id = auth.uid())
  );

GRANT SELECT, INSERT, DELETE ON public.community_polls TO authenticated;
GRANT ALL ON public.community_polls TO service_role;

CREATE TABLE IF NOT EXISTS public.community_poll_votes (
  poll_id         uuid NOT NULL REFERENCES public.community_polls(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  option_id       text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (poll_id, user_id, option_id)
);

ALTER TABLE public.community_poll_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read votes" ON public.community_poll_votes;
CREATE POLICY "members read votes" ON public.community_poll_votes FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.community_polls p
            JOIN public.community_posts cp ON cp.id = p.post_id
            WHERE p.id = poll_id AND public.is_community_member(auth.uid(), cp.community_id))
  );

DROP POLICY IF EXISTS "self vote" ON public.community_poll_votes;
CREATE POLICY "self vote" ON public.community_poll_votes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "self un-vote" ON public.community_poll_votes;
CREATE POLICY "self un-vote" ON public.community_poll_votes FOR DELETE TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON public.community_poll_votes TO authenticated;
GRANT ALL ON public.community_poll_votes TO service_role;

-- ── 5. community_reports ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.community_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id    uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  reporter_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id         uuid REFERENCES public.community_posts(id) ON DELETE CASCADE,
  comment_id      uuid REFERENCES public.community_comments(id) ON DELETE CASCADE,
  reason          text NOT NULL,
  notes           text,
  status          text NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','reviewing','actioned','dismissed')),
  resolved_by     uuid REFERENCES auth.users(id),
  resolved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK ((post_id IS NOT NULL)::int + (comment_id IS NOT NULL)::int = 1)
);

CREATE INDEX IF NOT EXISTS creports_community_idx ON public.community_reports(community_id, status, created_at DESC);

ALTER TABLE public.community_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "self report" ON public.community_reports;
CREATE POLICY "self report" ON public.community_reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid() AND public.is_community_member(auth.uid(), community_id));

DROP POLICY IF EXISTS "moderators read reports" ON public.community_reports;
CREATE POLICY "moderators read reports" ON public.community_reports FOR SELECT TO authenticated
  USING (public.can_moderate_community(auth.uid(), community_id) OR reporter_id = auth.uid());

DROP POLICY IF EXISTS "moderators resolve reports" ON public.community_reports;
CREATE POLICY "moderators resolve reports" ON public.community_reports FOR UPDATE TO authenticated
  USING (public.can_moderate_community(auth.uid(), community_id))
  WITH CHECK (public.can_moderate_community(auth.uid(), community_id));

GRANT SELECT, INSERT, UPDATE ON public.community_reports TO authenticated;
GRANT ALL ON public.community_reports TO service_role;

-- ── 6. community_connections (follow + connect) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.community_connections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN ('follow','connect')),
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','accepted','rejected','cancelled')),
  context_community_id uuid REFERENCES public.communities(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  responded_at    timestamptz,
  UNIQUE (requester_id, target_id, kind),
  CHECK (requester_id <> target_id)
);

CREATE INDEX IF NOT EXISTS cconn_requester_idx ON public.community_connections(requester_id, status);
CREATE INDEX IF NOT EXISTS cconn_target_idx    ON public.community_connections(target_id,    status);

ALTER TABLE public.community_connections ENABLE ROW LEVEL SECURITY;

-- Auto-accept follows by skipping pending state in the RPC; rows still created
-- so we keep an audit trail.
DROP POLICY IF EXISTS "view own connections" ON public.community_connections;
CREATE POLICY "view own connections" ON public.community_connections FOR SELECT TO authenticated
  USING (requester_id = auth.uid() OR target_id = auth.uid());

DROP POLICY IF EXISTS "self request" ON public.community_connections;
CREATE POLICY "self request" ON public.community_connections FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid());

DROP POLICY IF EXISTS "respond connection" ON public.community_connections;
CREATE POLICY "respond connection" ON public.community_connections FOR UPDATE TO authenticated
  USING (target_id = auth.uid() OR requester_id = auth.uid());

DROP POLICY IF EXISTS "cancel connection" ON public.community_connections;
CREATE POLICY "cancel connection" ON public.community_connections FOR DELETE TO authenticated
  USING (requester_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_connections TO authenticated;
GRANT ALL ON public.community_connections TO service_role;

-- ── 7. community_badges (catalogue) + community_user_badges (awards) ────────
CREATE TABLE IF NOT EXISTS public.community_badges (
  id              text PRIMARY KEY,
  label           text NOT NULL,
  icon            text NOT NULL,
  description     text,
  rule_kind       text NOT NULL CHECK (rule_kind IN ('points_gte','posts_gte','comments_gte','speaker','manual')),
  threshold       int
);

INSERT INTO public.community_badges(id, label, icon, description, rule_kind, threshold) VALUES
  ('new_member',  'New Member',     '👋', 'Joined a community',                'manual',       NULL),
  ('contributor', 'Contributor',    '✍️', 'Posted 5 times',                    'posts_gte',    5),
  ('active',      'Active Member',  '🔥', 'Posted 25 times',                   'posts_gte',    25),
  ('expert',      'Expert',         '🏆', 'Earned 500 points',                 'points_gte',   500),
  ('leader',      'Community Leader','⭐','Earned 1500 points',                'points_gte',   1500),
  ('speaker',     'Speaker',        '🎤', 'Spoke at a community event',        'speaker',      NULL)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.community_user_badges (
  community_id    uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id        text NOT NULL REFERENCES public.community_badges(id) ON DELETE CASCADE,
  awarded_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, user_id, badge_id)
);

ALTER TABLE public.community_user_badges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anyone read badges" ON public.community_user_badges;
CREATE POLICY "anyone read badges" ON public.community_user_badges FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.community_badges       TO authenticated, anon;
GRANT SELECT ON public.community_user_badges  TO authenticated, anon;
GRANT ALL    ON public.community_badges       TO service_role;
GRANT ALL    ON public.community_user_badges  TO service_role;

-- ── 8. Default channels auto-created with each community ────────────────────
CREATE OR REPLACE FUNCTION public._communities_after_insert_channels()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO community_channels (community_id, kind, name, description) VALUES
    (NEW.id, 'general',    'General',    'Chat about anything in the community.'),
    (NEW.id, 'sessions',   'Sessions',   'Discuss event sessions and talks.'),
    (NEW.id, 'networking', 'Networking', 'Introduce yourself and find collaborators.'),
    (NEW.id, 'qa',         'Q&A',        'Ask questions and get answers from speakers and peers.')
  ON CONFLICT (community_id, name) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS communities_after_insert_channels ON public.communities;
CREATE TRIGGER communities_after_insert_channels
AFTER INSERT ON public.communities
FOR EACH ROW EXECUTE FUNCTION public._communities_after_insert_channels();

-- Backfill existing communities that don't have any channels yet
INSERT INTO public.community_channels(community_id, kind, name, description)
SELECT c.id, 'general',    'General',    'Chat about anything in the community.'    FROM public.communities c
WHERE NOT EXISTS (SELECT 1 FROM public.community_channels ch WHERE ch.community_id = c.id);
INSERT INTO public.community_channels(community_id, kind, name, description)
SELECT c.id, 'sessions',   'Sessions',   'Discuss event sessions and talks.'        FROM public.communities c
WHERE NOT EXISTS (SELECT 1 FROM public.community_channels ch WHERE ch.community_id = c.id AND ch.name = 'Sessions');
INSERT INTO public.community_channels(community_id, kind, name, description)
SELECT c.id, 'networking', 'Networking', 'Introduce yourself and find collaborators.' FROM public.communities c
WHERE NOT EXISTS (SELECT 1 FROM public.community_channels ch WHERE ch.community_id = c.id AND ch.name = 'Networking');
INSERT INTO public.community_channels(community_id, kind, name, description)
SELECT c.id, 'qa',         'Q&A',        'Ask questions and get answers from speakers and peers.' FROM public.communities c
WHERE NOT EXISTS (SELECT 1 FROM public.community_channels ch WHERE ch.community_id = c.id AND ch.name = 'Q&A');

-- ── 9. Notification triggers (write to existing app_notifications) ──────────
CREATE OR REPLACE FUNCTION public._community_comments_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _post RECORD;
BEGIN
  SELECT id, author_id, community_id, COALESCE(title, substring(body_md from 1 for 60)) AS preview
    INTO _post
  FROM public.community_posts WHERE id = NEW.post_id;

  IF _post.author_id IS NOT NULL AND _post.author_id <> NEW.author_id THEN
    INSERT INTO public.app_notifications(user_id, type, title, body, link)
    VALUES (
      _post.author_id,
      'community.post.comment',
      'New comment on your post',
      coalesce(_post.preview,''),
      '/dashboard/community/' ||
        coalesce((SELECT slug FROM public.communities WHERE id = _post.community_id), '') ||
        '/feed'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_comments_notify ON public.community_comments;
CREATE TRIGGER community_comments_notify
AFTER INSERT ON public.community_comments
FOR EACH ROW EXECUTE FUNCTION public._community_comments_notify();

CREATE OR REPLACE FUNCTION public._community_announcement_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _slug text;
BEGIN
  IF NEW.type <> 'announcement' THEN RETURN NEW; END IF;
  SELECT slug INTO _slug FROM public.communities WHERE id = NEW.community_id;

  INSERT INTO public.app_notifications(user_id, type, title, body, link)
  SELECT cm.user_id,
         'community.announcement',
         coalesce(NEW.title, 'New announcement'),
         substring(NEW.body_md from 1 for 140),
         '/dashboard/community/' || coalesce(_slug,'') || '/announcements'
    FROM public.community_members cm
   WHERE cm.community_id = NEW.community_id
     AND cm.status = 'active'
     AND cm.user_id <> NEW.author_id
     AND cm.notify_push;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_announcement_notify ON public.community_posts;
CREATE TRIGGER community_announcement_notify
AFTER INSERT ON public.community_posts
FOR EACH ROW EXECUTE FUNCTION public._community_announcement_notify();

CREATE OR REPLACE FUNCTION public._community_connections_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.kind = 'connect' AND NEW.status = 'pending' THEN
    INSERT INTO public.app_notifications(user_id, type, title, body, link)
    VALUES (NEW.target_id, 'community.connection.request', 'New connection request', NULL, '/dashboard/community');
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status = 'accepted' THEN
    INSERT INTO public.app_notifications(user_id, type, title, body, link)
    VALUES (NEW.requester_id, 'community.connection.accepted', 'Your connection was accepted', NULL, '/dashboard/community');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_connections_notify ON public.community_connections;
CREATE TRIGGER community_connections_notify
AFTER INSERT OR UPDATE OF status ON public.community_connections
FOR EACH ROW EXECUTE FUNCTION public._community_connections_notify();

-- ── 10. Connections RPCs ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.community_connect(_target_id uuid, _kind text DEFAULT 'connect', _community_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _status text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;
  IF _kind NOT IN ('follow','connect') THEN RAISE EXCEPTION 'Invalid kind'; END IF;
  IF _target_id = auth.uid() THEN RAISE EXCEPTION 'Cannot connect with self'; END IF;

  -- Follows are auto-accepted; connects need approval
  _status := CASE WHEN _kind = 'follow' THEN 'accepted' ELSE 'pending' END;

  INSERT INTO community_connections (requester_id, target_id, kind, status, context_community_id, responded_at)
  VALUES (auth.uid(), _target_id, _kind, _status, _community_id, CASE WHEN _status='accepted' THEN now() ELSE NULL END)
  ON CONFLICT (requester_id, target_id, kind) DO UPDATE SET
    status = _status,
    responded_at = CASE WHEN _status='accepted' THEN now() ELSE community_connections.responded_at END
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_respond_connection(_request_id uuid, _accept boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;
  UPDATE community_connections
     SET status = CASE WHEN _accept THEN 'accepted' ELSE 'rejected' END,
         responded_at = now()
   WHERE id = _request_id AND target_id = auth.uid() AND status = 'pending';
END;
$$;

GRANT EXECUTE ON FUNCTION public.community_connect(uuid, text, uuid)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.community_respond_connection(uuid, boolean)     TO authenticated;

-- ── 11. Moderation RPCs ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.community_report(
  _post_id uuid DEFAULT NULL, _comment_id uuid DEFAULT NULL,
  _reason text DEFAULT 'inappropriate', _notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _community_id uuid; _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;
  IF (_post_id IS NULL) = (_comment_id IS NULL) THEN
    RAISE EXCEPTION 'Provide exactly one of post_id or comment_id';
  END IF;

  IF _post_id IS NOT NULL THEN
    SELECT community_id INTO _community_id FROM community_posts WHERE id = _post_id;
  ELSE
    SELECT p.community_id INTO _community_id FROM community_comments c
    JOIN community_posts p ON p.id = c.post_id WHERE c.id = _comment_id;
  END IF;

  IF _community_id IS NULL THEN RAISE EXCEPTION 'Target not found'; END IF;
  IF NOT is_community_member(auth.uid(), _community_id) THEN
    RAISE EXCEPTION 'Not a member';
  END IF;

  INSERT INTO community_reports (community_id, reporter_id, post_id, comment_id, reason, notes)
  VALUES (_community_id, auth.uid(), _post_id, _comment_id, _reason, _notes)
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_moderate(
  _post_id uuid DEFAULT NULL, _comment_id uuid DEFAULT NULL,
  _action text DEFAULT 'hide',
  _reason text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _community_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;
  IF _action NOT IN ('hide','unhide','delete','pin','unpin') THEN
    RAISE EXCEPTION 'Invalid action';
  END IF;
  IF (_post_id IS NULL) = (_comment_id IS NULL) THEN
    RAISE EXCEPTION 'Provide exactly one of post_id or comment_id';
  END IF;

  IF _post_id IS NOT NULL THEN
    SELECT community_id INTO _community_id FROM community_posts WHERE id = _post_id;
  ELSE
    SELECT p.community_id INTO _community_id FROM community_comments c
    JOIN community_posts p ON p.id = c.post_id WHERE c.id = _comment_id;
  END IF;

  IF NOT can_moderate_community(auth.uid(), _community_id) THEN
    RAISE EXCEPTION 'Not a moderator';
  END IF;

  IF _post_id IS NOT NULL THEN
    IF _action = 'hide'    THEN UPDATE community_posts SET hidden = true,  updated_at = now() WHERE id = _post_id; END IF;
    IF _action = 'unhide'  THEN UPDATE community_posts SET hidden = false, updated_at = now() WHERE id = _post_id; END IF;
    IF _action = 'delete'  THEN DELETE FROM community_posts WHERE id = _post_id; END IF;
    IF _action = 'pin'     THEN UPDATE community_posts SET pinned = true,  updated_at = now() WHERE id = _post_id; END IF;
    IF _action = 'unpin'   THEN UPDATE community_posts SET pinned = false, updated_at = now() WHERE id = _post_id; END IF;
  ELSE
    IF _action = 'hide'    THEN UPDATE community_comments SET hidden = true,  updated_at = now() WHERE id = _comment_id; END IF;
    IF _action = 'unhide'  THEN UPDATE community_comments SET hidden = false, updated_at = now() WHERE id = _comment_id; END IF;
    IF _action = 'delete'  THEN DELETE FROM community_comments WHERE id = _comment_id; END IF;
  END IF;

  PERFORM _record_audit(
    'community.moderate.' || _action,
    CASE WHEN _post_id IS NOT NULL THEN 'community_post' ELSE 'community_comment' END,
    coalesce(_post_id::text, _comment_id::text),
    jsonb_build_object('community_id', _community_id, 'reason', _reason)
  );
END;
$$;

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

GRANT EXECUTE ON FUNCTION public.community_report(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.community_moderate(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.community_set_member_status(uuid, uuid, text, text) TO authenticated;

-- ── 12. Polls RPCs ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.community_create_poll(
  _community_id uuid, _question text, _options jsonb,
  _multi boolean DEFAULT false, _closes_at timestamptz DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _post_id uuid; _poll_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;
  IF NOT is_community_member(auth.uid(), _community_id) THEN
    RAISE EXCEPTION 'Not a member';
  END IF;
  IF jsonb_array_length(_options) < 2 THEN
    RAISE EXCEPTION 'Need at least 2 options';
  END IF;

  INSERT INTO community_posts (community_id, author_id, type, title, body_md)
  VALUES (_community_id, auth.uid(), 'poll', _question, '')
  RETURNING id INTO _post_id;

  INSERT INTO community_polls (post_id, multi, options, closes_at)
  VALUES (_post_id, _multi, _options, _closes_at)
  RETURNING id INTO _poll_id;

  RETURN _post_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_vote(_poll_id uuid, _option_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _multi boolean; _closes_at timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;
  SELECT multi, closes_at INTO _multi, _closes_at FROM community_polls WHERE id = _poll_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Poll not found'; END IF;
  IF _closes_at IS NOT NULL AND _closes_at < now() THEN
    RAISE EXCEPTION 'Poll closed';
  END IF;

  IF NOT _multi THEN
    DELETE FROM community_poll_votes WHERE poll_id = _poll_id AND user_id = auth.uid();
  END IF;

  INSERT INTO community_poll_votes (poll_id, user_id, option_id)
  VALUES (_poll_id, auth.uid(), _option_id)
  ON CONFLICT DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.community_create_poll(uuid, text, jsonb, boolean, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.community_vote(uuid, text)                                     TO authenticated;

-- ── 13. Calendar view (events + sessions joined to community) ───────────────
CREATE OR REPLACE VIEW public.community_calendar AS
WITH base AS (
  -- events
  SELECT c.id AS community_id,
         e.id::text AS item_id,
         'event'::text AS kind,
         e.title,
         e.date AS starts_at,
         COALESCE(e.end_date, e.date) AS ends_at,
         e.location,
         e.slug AS event_slug,
         NULL::text AS session_id
  FROM communities c
  LEFT JOIN events e ON c.event_id = e.id OR (c.kind = 'parent' AND e.org_id IS NOT NULL AND e.org_id = c.org_id)
  WHERE e.id IS NOT NULL
  UNION ALL
  -- sessions belonging to event communities
  SELECT c.id AS community_id,
         s.id::text AS item_id,
         'session'::text AS kind,
         s.title,
         s.start_time AS starts_at,
         s.end_time   AS ends_at,
         s.location,
         e.slug AS event_slug,
         s.id::text AS session_id
  FROM communities c
  JOIN events e ON e.id = c.event_id
  JOIN sessions s ON s.event_id = e.id
)
SELECT * FROM base;

GRANT SELECT ON public.community_calendar TO authenticated, anon;

-- ── 14. Search RPC ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.community_search(_q text, _community_id uuid DEFAULT NULL, _limit int DEFAULT 30)
RETURNS TABLE(
  kind text, id uuid, community_id uuid, title text, snippet text, score real, created_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'post'::text, p.id, p.community_id,
         COALESCE(p.title, substring(p.body_md from 1 for 60)) AS title,
         substring(p.body_md from 1 for 200) AS snippet,
         ts_rank(p.ts_search, websearch_to_tsquery('simple', _q)) AS score,
         p.created_at
  FROM community_posts p
  WHERE (NOT p.hidden)
    AND p.ts_search @@ websearch_to_tsquery('simple', _q)
    AND (_community_id IS NULL OR p.community_id = _community_id)
    AND (
      is_community_member(auth.uid(), p.community_id)
      OR has_role(auth.uid(),'admin'::app_role)
    )
  UNION ALL
  SELECT 'community'::text, c.id, c.id,
         c.name, COALESCE(c.description,''),
         similarity(lower(c.name), lower(_q)),
         c.created_at
  FROM communities c
  WHERE (c.visibility = 'public' OR is_community_member(auth.uid(), c.id))
    AND (lower(c.name) LIKE '%' || lower(_q) || '%' OR lower(coalesce(c.description,'')) LIKE '%' || lower(_q) || '%')
  ORDER BY score DESC NULLS LAST, created_at DESC
  LIMIT _limit;
$$;

GRANT EXECUTE ON FUNCTION public.community_search(text, uuid, int) TO authenticated;

-- ── 15. Leaderboard view ────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.community_leaderboard AS
SELECT
  cm.community_id,
  cm.user_id,
  COALESCE(p.posts, 0)        AS posts,
  COALESCE(co.comments, 0)    AS comments,
  COALESCE(r.resources, 0)    AS resources,
  -- Points formula: post=5, comment=2, resource=20
  (COALESCE(p.posts, 0) * 5
   + COALESCE(co.comments, 0) * 2
   + COALESCE(r.resources, 0) * 20) AS points
FROM community_members cm
LEFT JOIN (
  SELECT community_id, author_id AS user_id, count(*) AS posts
  FROM community_posts WHERE NOT hidden GROUP BY community_id, author_id
) p ON p.community_id = cm.community_id AND p.user_id = cm.user_id
LEFT JOIN (
  SELECT cp.community_id, c.author_id AS user_id, count(*) AS comments
  FROM community_comments c JOIN community_posts cp ON cp.id = c.post_id
  WHERE NOT c.hidden
  GROUP BY cp.community_id, c.author_id
) co ON co.community_id = cm.community_id AND co.user_id = cm.user_id
LEFT JOIN (
  SELECT community_id, uploaded_by AS user_id, count(*) AS resources
  FROM community_resources GROUP BY community_id, uploaded_by
) r ON r.community_id = cm.community_id AND r.user_id = cm.user_id
WHERE cm.status = 'active';

GRANT SELECT ON public.community_leaderboard TO authenticated, anon;

-- ── 16. Realtime publications for new tables ────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='community_messages') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.community_messages';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='community_poll_votes') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.community_poll_votes';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='community_connections') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.community_connections';
  END IF;
END $$;

ALTER TABLE public.community_messages    REPLICA IDENTITY FULL;
ALTER TABLE public.community_poll_votes  REPLICA IDENTITY FULL;
ALTER TABLE public.community_connections REPLICA IDENTITY FULL;
