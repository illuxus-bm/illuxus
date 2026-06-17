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
         COALESCE(e.community_category, 'other')::text AS category_text
    INTO _evt
  FROM events e WHERE e.id = _event_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  _parent_id := ensure_parent_community(_map_event_category_to_community(_evt.category_text));

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

  INSERT INTO community_members (community_id, user_id, role, status, auto)
  VALUES (_new_id, _evt.user_id, 'manager', 'active', true)
  ON CONFLICT (community_id, user_id) DO NOTHING;

  UPDATE communities SET member_count = member_count + 1 WHERE id = _new_id;

  RETURN _new_id;
END;
$$;
UPDATE communities SET visibility = 'public' WHERE kind = 'event';
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
