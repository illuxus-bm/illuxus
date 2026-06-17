-- ============================================================================
-- Community Ecosystem — Phase 1
-- Tables, helpers, RLS, triggers, auto-link, and RPCs needed for:
--   communities + memberships + feed (posts/comments/reactions/bookmarks)
-- ============================================================================

-- ── Enums ───────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'community_kind') THEN
    CREATE TYPE community_kind AS ENUM ('parent','event');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'community_category') THEN
    CREATE TYPE community_category AS ENUM (
      'tech','ai','startup','hackathon','cybersecurity','finance','education',
      'design','marketing','health','sustainability','other'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'community_role') THEN
    CREATE TYPE community_role AS ENUM (
      'member','speaker','sponsor','organizer','moderator','manager','mentor'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'community_post_type') THEN
    CREATE TYPE community_post_type AS ENUM (
      'discussion','question','announcement','resource','poll','event_update'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'community_visibility') THEN
    CREATE TYPE community_visibility AS ENUM ('public','members_only','private');
  END IF;
END $$;

-- ── 1. communities ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.communities (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            community_kind NOT NULL,
  category        community_category,
  parent_id       uuid REFERENCES public.communities(id) ON DELETE SET NULL,
  event_id        uuid UNIQUE REFERENCES public.events(id) ON DELETE CASCADE,
  org_id          uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  slug            text NOT NULL UNIQUE,
  name            text NOT NULL,
  description     text,
  banner_url      text,
  logo_url        text,
  visibility      community_visibility NOT NULL DEFAULT 'public',
  rules           text,
  member_count    int NOT NULL DEFAULT 0,
  post_count      int NOT NULL DEFAULT 0,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT communities_event_kind_chk
    CHECK (kind = 'parent' OR (kind = 'event' AND event_id IS NOT NULL AND parent_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS communities_kind_idx     ON public.communities(kind);
CREATE INDEX IF NOT EXISTS communities_category_idx ON public.communities(category) WHERE kind='parent';
CREATE INDEX IF NOT EXISTS communities_parent_idx   ON public.communities(parent_id);

-- ── 2. community_members ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.community_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id    uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            community_role NOT NULL DEFAULT 'member',
  status          text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','suspended','banned','left')),
  auto            boolean NOT NULL DEFAULT false,
  joined_at       timestamptz NOT NULL DEFAULT now(),
  notify_email    boolean NOT NULL DEFAULT false,
  notify_push     boolean NOT NULL DEFAULT true,
  last_read_at    timestamptz,
  UNIQUE (community_id, user_id)
);

CREATE INDEX IF NOT EXISTS cmembers_user_idx ON public.community_members(user_id);
CREATE INDEX IF NOT EXISTS cmembers_role_idx ON public.community_members(community_id, role);

-- ── 3. community_posts ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.community_posts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id    uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  author_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type            community_post_type NOT NULL DEFAULT 'discussion',
  title           text,
  body_md         text NOT NULL DEFAULT '',
  attachments     jsonb NOT NULL DEFAULT '[]',
  link_url        text,
  pinned          boolean NOT NULL DEFAULT false,
  important       boolean NOT NULL DEFAULT false,
  hidden          boolean NOT NULL DEFAULT false,
  comment_count   int NOT NULL DEFAULT 0,
  reaction_count  int NOT NULL DEFAULT 0,
  view_count      int NOT NULL DEFAULT 0,
  ts_search       tsvector,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  edited_at       timestamptz,
  deleted_at      timestamptz
);

CREATE INDEX IF NOT EXISTS cposts_community_idx ON public.community_posts(community_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cposts_pinned_idx    ON public.community_posts(community_id, pinned, created_at DESC) WHERE pinned;
CREATE INDEX IF NOT EXISTS cposts_type_idx      ON public.community_posts(community_id, type);
CREATE INDEX IF NOT EXISTS cposts_search_idx    ON public.community_posts USING gin(ts_search);

-- ── 4. community_comments ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.community_comments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id         uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  parent_id       uuid REFERENCES public.community_comments(id) ON DELETE CASCADE,
  author_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body_md         text NOT NULL,
  hidden          boolean NOT NULL DEFAULT false,
  reaction_count  int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ccomments_post_idx ON public.community_comments(post_id, created_at);

-- ── 5. community_reactions ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.community_reactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id         uuid REFERENCES public.community_posts(id) ON DELETE CASCADE,
  comment_id      uuid REFERENCES public.community_comments(id) ON DELETE CASCADE,
  emoji           text NOT NULL DEFAULT '👍',
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK ((post_id IS NOT NULL) <> (comment_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS creactions_post_uniq
  ON public.community_reactions(user_id, post_id, emoji) WHERE post_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS creactions_comment_uniq
  ON public.community_reactions(user_id, comment_id, emoji) WHERE comment_id IS NOT NULL;

-- ── 6. community_bookmarks ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.community_bookmarks (
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id         uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

-- ── Helper functions (SECURITY DEFINER, no RLS recursion) ───────────────────
CREATE OR REPLACE FUNCTION public.is_community_member(_user_id uuid, _community_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_members
    WHERE community_id = _community_id AND user_id = _user_id AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.community_role_of(_user_id uuid, _community_id uuid)
RETURNS community_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.community_members
  WHERE community_id = _community_id AND user_id = _user_id AND status = 'active'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.can_moderate_community(_user_id uuid, _community_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.community_role_of(_user_id, _community_id) IN ('moderator','manager')
      OR public.has_role(_user_id, 'admin');
$$;

GRANT EXECUTE ON FUNCTION public.is_community_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.community_role_of(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_moderate_community(uuid, uuid) TO authenticated;

-- ── Slugify helper for community slugs (idempotent) ─────────────────────────
CREATE OR REPLACE FUNCTION public.community_slugify(_input text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT trim(both '-' from
    regexp_replace(
      regexp_replace(lower(coalesce(_input, '')), '[^a-z0-9]+', '-', 'g'),
      '-+', '-', 'g'
    )
  );
$$;

-- ── tsvector trigger for full-text search ───────────────────────────────────
CREATE OR REPLACE FUNCTION public._community_posts_tsvector()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.ts_search := to_tsvector('simple',
    coalesce(NEW.title, '') || ' ' || coalesce(NEW.body_md, ''));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_posts_ts ON public.community_posts;
CREATE TRIGGER community_posts_ts
BEFORE INSERT OR UPDATE OF title, body_md ON public.community_posts
FOR EACH ROW EXECUTE FUNCTION public._community_posts_tsvector();

-- ── Counter triggers (member_count, post_count, comment_count, reaction_count)
CREATE OR REPLACE FUNCTION public._cmembers_count_trg()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'active' THEN
    UPDATE public.communities SET member_count = member_count + 1, updated_at = now() WHERE id = NEW.community_id;
  ELSIF TG_OP = 'DELETE' AND OLD.status = 'active' THEN
    UPDATE public.communities SET member_count = greatest(0, member_count - 1), updated_at = now() WHERE id = OLD.community_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.status <> NEW.status THEN
    IF NEW.status = 'active' THEN
      UPDATE public.communities SET member_count = member_count + 1, updated_at = now() WHERE id = NEW.community_id;
    ELSIF OLD.status = 'active' THEN
      UPDATE public.communities SET member_count = greatest(0, member_count - 1), updated_at = now() WHERE id = NEW.community_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS cmembers_count ON public.community_members;
CREATE TRIGGER cmembers_count
AFTER INSERT OR UPDATE OF status OR DELETE ON public.community_members
FOR EACH ROW EXECUTE FUNCTION public._cmembers_count_trg();

CREATE OR REPLACE FUNCTION public._cposts_count_trg()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.communities SET post_count = post_count + 1, updated_at = now() WHERE id = NEW.community_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.communities SET post_count = greatest(0, post_count - 1), updated_at = now() WHERE id = OLD.community_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS cposts_count ON public.community_posts;
CREATE TRIGGER cposts_count
AFTER INSERT OR DELETE ON public.community_posts
FOR EACH ROW EXECUTE FUNCTION public._cposts_count_trg();

CREATE OR REPLACE FUNCTION public._ccomments_count_trg()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.community_posts SET comment_count = comment_count + 1, updated_at = now() WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.community_posts SET comment_count = greatest(0, comment_count - 1), updated_at = now() WHERE id = OLD.post_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS ccomments_count ON public.community_comments;
CREATE TRIGGER ccomments_count
AFTER INSERT OR DELETE ON public.community_comments
FOR EACH ROW EXECUTE FUNCTION public._ccomments_count_trg();

CREATE OR REPLACE FUNCTION public._creactions_count_trg()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.post_id IS NOT NULL THEN
      UPDATE public.community_posts SET reaction_count = reaction_count + 1 WHERE id = NEW.post_id;
    ELSE
      UPDATE public.community_comments SET reaction_count = reaction_count + 1 WHERE id = NEW.comment_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.post_id IS NOT NULL THEN
      UPDATE public.community_posts SET reaction_count = greatest(0, reaction_count - 1) WHERE id = OLD.post_id;
    ELSE
      UPDATE public.community_comments SET reaction_count = greatest(0, reaction_count - 1) WHERE id = OLD.comment_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS creactions_count ON public.community_reactions;
CREATE TRIGGER creactions_count
AFTER INSERT OR DELETE ON public.community_reactions
FOR EACH ROW EXECUTE FUNCTION public._creactions_count_trg();

-- ── updated_at trigger (reuses existing function) ───────────────────────────
DROP TRIGGER IF EXISTS communities_updated_at ON public.communities;
CREATE TRIGGER communities_updated_at
BEFORE UPDATE ON public.communities
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS community_posts_updated_at ON public.community_posts;
CREATE TRIGGER community_posts_updated_at
BEFORE UPDATE ON public.community_posts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS community_comments_updated_at ON public.community_comments;
CREATE TRIGGER community_comments_updated_at
BEFORE UPDATE ON public.community_comments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.communities          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_members    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_posts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_comments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_reactions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_bookmarks  ENABLE ROW LEVEL SECURITY;

-- communities
DROP POLICY IF EXISTS "view communities" ON public.communities;
CREATE POLICY "view communities" ON public.communities FOR SELECT
  USING (
    visibility = 'public'
    OR public.is_community_member(auth.uid(), id)
    OR (org_id IS NOT NULL AND public.is_org_member(auth.uid(), org_id))
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS "manage communities" ON public.communities;
CREATE POLICY "manage communities" ON public.communities FOR ALL TO authenticated
  USING (
    public.community_role_of(auth.uid(), id) = 'manager'
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR (org_id IS NOT NULL AND public.is_org_owner(auth.uid(), org_id))
  )
  WITH CHECK (
    public.community_role_of(auth.uid(), id) = 'manager'
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR (org_id IS NOT NULL AND public.is_org_owner(auth.uid(), org_id))
  );

-- community_members
DROP POLICY IF EXISTS "view members" ON public.community_members;
CREATE POLICY "view members" ON public.community_members FOR SELECT
  USING (
    public.is_community_member(auth.uid(), community_id)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS "self join" ON public.community_members;
CREATE POLICY "self join" ON public.community_members FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "self update notif" ON public.community_members;
CREATE POLICY "self update notif" ON public.community_members FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "self leave" ON public.community_members;
CREATE POLICY "self leave" ON public.community_members FOR DELETE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "moderate members" ON public.community_members;
CREATE POLICY "moderate members" ON public.community_members FOR UPDATE TO authenticated
  USING (public.can_moderate_community(auth.uid(), community_id))
  WITH CHECK (public.can_moderate_community(auth.uid(), community_id));

-- community_posts
DROP POLICY IF EXISTS "members read posts" ON public.community_posts;
CREATE POLICY "members read posts" ON public.community_posts FOR SELECT
  USING (
    public.is_community_member(auth.uid(), community_id)
    AND (NOT hidden OR public.can_moderate_community(auth.uid(), community_id))
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS "members write posts" ON public.community_posts;
CREATE POLICY "members write posts" ON public.community_posts FOR INSERT TO authenticated
  WITH CHECK (
    public.is_community_member(auth.uid(), community_id)
    AND author_id = auth.uid()
    AND CASE
      WHEN type = 'announcement' THEN
        public.community_role_of(auth.uid(), community_id) IN ('organizer','moderator','manager')
      ELSE true
    END
  );

DROP POLICY IF EXISTS "edit own posts" ON public.community_posts;
CREATE POLICY "edit own posts" ON public.community_posts FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR public.can_moderate_community(auth.uid(), community_id))
  WITH CHECK (author_id = auth.uid() OR public.can_moderate_community(auth.uid(), community_id));

DROP POLICY IF EXISTS "delete own posts" ON public.community_posts;
CREATE POLICY "delete own posts" ON public.community_posts FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.can_moderate_community(auth.uid(), community_id));

-- community_comments
DROP POLICY IF EXISTS "read comments" ON public.community_comments;
CREATE POLICY "read comments" ON public.community_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.community_posts p
      WHERE p.id = post_id AND public.is_community_member(auth.uid(), p.community_id)
    )
    AND (NOT hidden OR EXISTS (
      SELECT 1 FROM public.community_posts p
      WHERE p.id = post_id AND public.can_moderate_community(auth.uid(), p.community_id)
    ))
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS "write comments" ON public.community_comments;
CREATE POLICY "write comments" ON public.community_comments FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.community_posts p
      WHERE p.id = post_id AND public.is_community_member(auth.uid(), p.community_id)
    )
  );

DROP POLICY IF EXISTS "edit own comments" ON public.community_comments;
CREATE POLICY "edit own comments" ON public.community_comments FOR UPDATE TO authenticated
  USING (
    author_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.community_posts p
      WHERE p.id = post_id AND public.can_moderate_community(auth.uid(), p.community_id)
    )
  );

DROP POLICY IF EXISTS "delete own comments" ON public.community_comments;
CREATE POLICY "delete own comments" ON public.community_comments FOR DELETE TO authenticated
  USING (
    author_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.community_posts p
      WHERE p.id = post_id AND public.can_moderate_community(auth.uid(), p.community_id)
    )
  );

-- community_reactions
DROP POLICY IF EXISTS "read reactions" ON public.community_reactions;
CREATE POLICY "read reactions" ON public.community_reactions FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "self react" ON public.community_reactions;
CREATE POLICY "self react" ON public.community_reactions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "self un-react" ON public.community_reactions;
CREATE POLICY "self un-react" ON public.community_reactions FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- community_bookmarks
DROP POLICY IF EXISTS "self bookmarks" ON public.community_bookmarks;
CREATE POLICY "self bookmarks" ON public.community_bookmarks FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── Grants (REST works under RLS once granted) ─────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.communities          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_members    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_posts      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_comments   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_reactions  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_bookmarks  TO authenticated;
GRANT ALL ON public.communities,         public.community_members,  public.community_posts,
            public.community_comments,   public.community_reactions, public.community_bookmarks TO service_role;

-- Public read of public communities (for org pages, marketing)
GRANT SELECT ON public.communities TO anon;

-- ── Auto-link: ensure parent + event communities are created/linked ─────────
-- Mapping events.category → community_category. Falls back to 'other'.
CREATE OR REPLACE FUNCTION public._map_event_category_to_community(_cat text)
RETURNS community_category LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE lower(coalesce(_cat,''))
    WHEN 'tech'           THEN 'tech'::community_category
    WHEN 'technology'     THEN 'tech'::community_category
    WHEN 'ai'             THEN 'ai'::community_category
    WHEN 'startup'        THEN 'startup'::community_category
    WHEN 'hackathon'      THEN 'hackathon'::community_category
    WHEN 'cybersecurity'  THEN 'cybersecurity'::community_category
    WHEN 'security'       THEN 'cybersecurity'::community_category
    WHEN 'finance'        THEN 'finance'::community_category
    WHEN 'fintech'        THEN 'finance'::community_category
    WHEN 'education'      THEN 'education'::community_category
    WHEN 'design'         THEN 'design'::community_category
    WHEN 'marketing'      THEN 'marketing'::community_category
    WHEN 'health'         THEN 'health'::community_category
    WHEN 'sustainability' THEN 'sustainability'::community_category
    ELSE 'other'::community_category
  END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_parent_community(_category community_category)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _id uuid;
  _name text;
  _slug text;
BEGIN
  SELECT id INTO _id FROM communities WHERE kind='parent' AND category=_category LIMIT 1;
  IF _id IS NOT NULL THEN RETURN _id; END IF;

  _name := initcap(replace(_category::text, '_', ' ')) || ' Community';
  _slug := community_slugify(_name);

  INSERT INTO communities (kind, category, slug, name, description, visibility, created_by)
  VALUES ('parent', _category, _slug,
          _name,
          'Industry hub for ' || lower(replace(_category::text,'_',' ')) || ' events and discussions.',
          'public',
          NULL)
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_event_community(_event_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _existing uuid;
  _evt RECORD;
  _parent_id uuid;
  _new_id uuid;
  _slug text;
  _base_slug text;
  _i int := 0;
BEGIN
  SELECT id INTO _existing FROM communities WHERE event_id = _event_id LIMIT 1;
  IF _existing IS NOT NULL THEN RETURN _existing; END IF;

  SELECT e.id, e.title, e.slug, e.org_id, e.user_id,
         COALESCE(NULL, 'other')::text AS category_text
    INTO _evt
  FROM events e WHERE e.id = _event_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Resolve category from optional column if it exists. We coalesce to 'other'
  -- since events.category may not exist in this schema.
  _parent_id := ensure_parent_community(_map_event_category_to_community('other'));

  _base_slug := community_slugify(_evt.slug || '-community');
  IF _base_slug IS NULL OR _base_slug = '' THEN _base_slug := 'event-' || _evt.id::text; END IF;
  _slug := _base_slug;
  WHILE EXISTS (SELECT 1 FROM communities WHERE slug = _slug) LOOP
    _i := _i + 1;
    _slug := _base_slug || '-' || _i;
  END LOOP;

  INSERT INTO communities (
    kind, parent_id, event_id, org_id, slug, name, description, visibility, created_by
  ) VALUES (
    'event', _parent_id, _evt.id, _evt.org_id, _slug,
    _evt.title || ' — Community',
    'Discussion space for attendees, speakers and sponsors of ' || _evt.title || '.',
    'public',
    _evt.user_id
  ) RETURNING id INTO _new_id;

  -- Auto-add the event creator as manager
  INSERT INTO community_members (community_id, user_id, role, status, auto)
  VALUES (_new_id, _evt.user_id, 'manager', 'active', true)
  ON CONFLICT (community_id, user_id) DO NOTHING;

  RETURN _new_id;
END;
$$;

-- Trigger: create event community + auto-feed entry when event is inserted
CREATE OR REPLACE FUNCTION public._events_after_insert_community()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _comm_id uuid;
  _parent_id uuid;
BEGIN
  _comm_id := ensure_event_community(NEW.id);
  IF _comm_id IS NULL THEN RETURN NEW; END IF;

  SELECT parent_id INTO _parent_id FROM communities WHERE id = _comm_id;
  IF _parent_id IS NOT NULL THEN
    INSERT INTO community_posts (community_id, author_id, type, title, body_md)
    VALUES (
      _parent_id,
      NEW.user_id,
      'event_update',
      '🚀 New event: ' || NEW.title,
      'A new event has been added to the community: **' || NEW.title || '**.'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_after_insert_community ON public.events;
CREATE TRIGGER events_after_insert_community
AFTER INSERT ON public.events
FOR EACH ROW EXECUTE FUNCTION public._events_after_insert_community();

-- Auto-join speakers/sponsors/attendees to event community
CREATE OR REPLACE FUNCTION public._auto_join_event_community(
  _event_id uuid, _user_id uuid, _role community_role
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _comm_id uuid;
BEGIN
  IF _user_id IS NULL THEN RETURN; END IF;
  SELECT id INTO _comm_id FROM communities WHERE event_id = _event_id LIMIT 1;
  IF _comm_id IS NULL THEN RETURN; END IF;

  INSERT INTO community_members (community_id, user_id, role, status, auto, notify_push)
  VALUES (_comm_id, _user_id, _role, 'active', true, false)
  ON CONFLICT (community_id, user_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public._registrations_join_community()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND NEW.approval_status = 'approved' THEN
    PERFORM _auto_join_event_community(NEW.event_id, NEW.user_id, 'member');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS registrations_join_community ON public.registrations;
CREATE TRIGGER registrations_join_community
AFTER INSERT OR UPDATE OF approval_status, user_id ON public.registrations
FOR EACH ROW EXECUTE FUNCTION public._registrations_join_community();

CREATE OR REPLACE FUNCTION public._event_speakers_join_community()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid;
BEGIN
  -- speakers table doesn't link to user_id directly; we match by email
  SELECT p.user_id INTO _uid
  FROM speakers s
  LEFT JOIN profiles p ON p.user_id IS NOT NULL AND lower(s.email) = lower((SELECT email FROM auth.users u WHERE u.id = p.user_id))
  WHERE s.id = NEW.speaker_id LIMIT 1;
  IF _uid IS NOT NULL THEN
    PERFORM _auto_join_event_community(NEW.event_id, _uid, 'speaker');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS event_speakers_join_community ON public.event_speakers;
CREATE TRIGGER event_speakers_join_community
AFTER INSERT ON public.event_speakers
FOR EACH ROW EXECUTE FUNCTION public._event_speakers_join_community();

CREATE OR REPLACE FUNCTION public._event_sponsors_join_community()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid;
BEGIN
  SELECT s.user_id INTO _uid FROM sponsors s WHERE s.id = NEW.sponsor_id LIMIT 1;
  IF _uid IS NOT NULL THEN
    PERFORM _auto_join_event_community(NEW.event_id, _uid, 'sponsor');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS event_sponsors_join_community ON public.event_sponsors;
CREATE TRIGGER event_sponsors_join_community
AFTER INSERT ON public.event_sponsors
FOR EACH ROW EXECUTE FUNCTION public._event_sponsors_join_community();

-- ── RPCs ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.community_join(_community_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE 
  _id uuid;
  _kind community_kind;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;
  
  SELECT kind INTO _kind FROM public.communities WHERE id = _community_id;
  IF _kind = 'event' THEN
    RAISE EXCEPTION 'Event communities can only be joined by registering for the event.';
  END IF;

  INSERT INTO community_members (community_id, user_id, role, status, auto)
  VALUES (_community_id, auth.uid(), 'member', 'active', false)
  ON CONFLICT (community_id, user_id) DO UPDATE
    SET status = 'active', joined_at = excluded.joined_at
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_leave(_community_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;
  UPDATE community_members SET status = 'left'
  WHERE community_id = _community_id AND user_id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.community_create_post(
  _community_id uuid,
  _type community_post_type,
  _title text,
  _body_md text,
  _attachments jsonb DEFAULT '[]'::jsonb,
  _link_url text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _id uuid;
  _role community_role;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;
  IF NOT is_community_member(auth.uid(), _community_id) THEN
    RAISE EXCEPTION 'Not a member of this community';
  END IF;
  IF _type = 'announcement' THEN
    _role := community_role_of(auth.uid(), _community_id);
    IF _role NOT IN ('organizer','moderator','manager') THEN
      RAISE EXCEPTION 'Only organizers, moderators, or managers can post announcements';
    END IF;
  END IF;

  INSERT INTO community_posts (community_id, author_id, type, title, body_md, attachments, link_url)
  VALUES (_community_id, auth.uid(), _type, NULLIF(trim(_title), ''), coalesce(_body_md, ''),
          COALESCE(_attachments, '[]'::jsonb), _link_url)
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_react(
  _post_id uuid DEFAULT NULL,
  _comment_id uuid DEFAULT NULL,
  _emoji text DEFAULT '👍'
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _existing uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;
  IF (_post_id IS NULL) = (_comment_id IS NULL) THEN
    RAISE EXCEPTION 'Provide exactly one of _post_id or _comment_id';
  END IF;

  IF _post_id IS NOT NULL THEN
    SELECT id INTO _existing FROM community_reactions
    WHERE user_id = auth.uid() AND post_id = _post_id AND emoji = _emoji;
  ELSE
    SELECT id INTO _existing FROM community_reactions
    WHERE user_id = auth.uid() AND comment_id = _comment_id AND emoji = _emoji;
  END IF;

  IF _existing IS NOT NULL THEN
    DELETE FROM community_reactions WHERE id = _existing;
    RETURN false;
  END IF;

  INSERT INTO community_reactions (user_id, post_id, comment_id, emoji)
  VALUES (auth.uid(), _post_id, _comment_id, _emoji);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_resolve_event(_event_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM communities WHERE event_id = _event_id LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.community_join(uuid)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.community_leave(uuid)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.community_create_post(uuid, community_post_type, text, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.community_react(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.community_resolve_event(uuid)    TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.ensure_parent_community(community_category) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_event_community(uuid)     TO authenticated;

-- ── Realtime publication for live feed ──────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'community_posts'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.community_posts';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'community_comments'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.community_comments';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'community_reactions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.community_reactions';
  END IF;
END $$;

ALTER TABLE public.community_posts     REPLICA IDENTITY FULL;
ALTER TABLE public.community_comments  REPLICA IDENTITY FULL;
ALTER TABLE public.community_reactions REPLICA IDENTITY FULL;
