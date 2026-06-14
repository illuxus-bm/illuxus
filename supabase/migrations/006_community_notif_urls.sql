-- ============================================================================
-- Community: relocate notification deep-links from /dashboard/community/...
-- to the new top-level /community/... URLs introduced when the area was made
-- standalone. Updates the three trigger functions that emit links.
-- ============================================================================

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
      '/community/' ||
        coalesce((SELECT slug FROM public.communities WHERE id = _post.community_id), '') ||
        '/feed'
    );
  END IF;
  RETURN NEW;
END;
$$;

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
         '/community/' || coalesce(_slug,'') || '/announcements'
    FROM public.community_members cm
   WHERE cm.community_id = NEW.community_id
     AND cm.status = 'active'
     AND cm.user_id <> NEW.author_id
     AND cm.notify_push;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public._community_connections_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.kind = 'connect' AND NEW.status = 'pending' THEN
    INSERT INTO public.app_notifications(user_id, type, title, body, link)
    VALUES (NEW.target_id, 'community.connection.request', 'New connection request', NULL, '/community');
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status = 'accepted' THEN
    INSERT INTO public.app_notifications(user_id, type, title, body, link)
    VALUES (NEW.requester_id, 'community.connection.accepted', 'Your connection was accepted', NULL, '/community');
  END IF;
  RETURN NEW;
END;
$$;

-- Backfill any existing notification rows with /dashboard/community → /community
UPDATE public.app_notifications
SET link = regexp_replace(link, '^/dashboard/community', '/community')
WHERE link LIKE '/dashboard/community%';
