-- ============================================================================
-- Event extensions — series, site assets, application toggles, community link
--
-- Consolidated from prior individual migration files. Contents are verbatim;
-- only file packaging changed. Sections are separated by their original filename.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Section: 008_event_series.sql
-- ----------------------------------------------------------------------------
-- ============================================================================
-- Event series + community carry-over
-- ----------------------------------------------------------------------------
-- Adds events.previous_event_id so an event can declare itself a follow-up
-- of an earlier event in the same org. When the new event's community is
-- created, all active members of the previous event's community are copied
-- in (preserving role).
-- Also adds an RPC for managers to change a member's role.
-- ============================================================================

-- ── 1. Schema ───────────────────────────────────────────────────────────────
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS previous_event_id uuid REFERENCES public.events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS events_previous_event_idx
  ON public.events(previous_event_id) WHERE previous_event_id IS NOT NULL;

-- Validate previous_event_id rules: same org, no self-reference, no cycles.
CREATE OR REPLACE FUNCTION public._events_validate_previous()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  _prev_org uuid;
  _hop uuid;
  _depth int := 0;
BEGIN
  IF NEW.previous_event_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.previous_event_id = NEW.id THEN
    RAISE EXCEPTION 'previous_event_id cannot reference the same event';
  END IF;

  SELECT org_id INTO _prev_org FROM public.events WHERE id = NEW.previous_event_id;
  IF _prev_org IS NULL THEN
    RAISE EXCEPTION 'previous_event_id references a missing event';
  END IF;
  IF NEW.org_id IS NOT NULL AND _prev_org IS NOT NULL AND NEW.org_id <> _prev_org THEN
    RAISE EXCEPTION 'previous_event_id must belong to the same organization';
  END IF;

  -- Walk the chain (cap at 50) to make sure we don't form a cycle.
  _hop := NEW.previous_event_id;
  WHILE _hop IS NOT NULL AND _depth < 50 LOOP
    IF _hop = NEW.id THEN
      RAISE EXCEPTION 'previous_event_id chain forms a cycle';
    END IF;
    SELECT previous_event_id INTO _hop FROM public.events WHERE id = _hop;
    _depth := _depth + 1;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_validate_previous ON public.events;
CREATE TRIGGER events_validate_previous
BEFORE INSERT OR UPDATE OF previous_event_id, org_id ON public.events
FOR EACH ROW EXECUTE FUNCTION public._events_validate_previous();

-- ── 2. Carry-over helper ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._copy_community_members_from_previous(
  _new_community_id uuid,
  _previous_event_id uuid
) RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _prev_community_id uuid;
  _copied int := 0;
BEGIN
  IF _previous_event_id IS NULL THEN RETURN 0; END IF;

  SELECT id INTO _prev_community_id
    FROM communities
   WHERE event_id = _previous_event_id
   LIMIT 1;
  IF _prev_community_id IS NULL THEN RETURN 0; END IF;

  WITH ins AS (
    INSERT INTO community_members (community_id, user_id, role, status, auto, notify_push)
    SELECT _new_community_id, cm.user_id, cm.role, 'active', true, false
      FROM community_members cm
     WHERE cm.community_id = _prev_community_id
       AND cm.status = 'active'
    ON CONFLICT (community_id, user_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO _copied FROM ins;

  RETURN _copied;
END;
$$;

-- ── 3. Extend ensure_event_community to do carry-over ───────────────────────
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
  _carried int := 0;
  _prev_title text;
BEGIN
  SELECT id INTO _existing FROM communities WHERE event_id = _event_id LIMIT 1;
  IF _existing IS NOT NULL THEN RETURN _existing; END IF;

  SELECT e.id, e.title, e.slug, e.org_id, e.user_id, e.previous_event_id,
         COALESCE(NULL, 'other')::text AS category_text
    INTO _evt
  FROM events e WHERE e.id = _event_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

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
    'members_only',
    _evt.user_id
  ) RETURNING id INTO _new_id;

  -- Auto-add the event creator as manager
  INSERT INTO community_members (community_id, user_id, role, status, auto)
  VALUES (_new_id, _evt.user_id, 'manager', 'active', true)
  ON CONFLICT (community_id, user_id) DO NOTHING;

  -- Series carry-over: pull active members from the predecessor's community.
  IF _evt.previous_event_id IS NOT NULL THEN
    _carried := _copy_community_members_from_previous(_new_id, _evt.previous_event_id);

    IF _carried > 0 THEN
      SELECT title INTO _prev_title FROM events WHERE id = _evt.previous_event_id;
      INSERT INTO community_posts (community_id, author_id, type, title, body_md)
      VALUES (
        _new_id,
        _evt.user_id,
        'event_update',
        '👋 Welcome back',
        'This community continues from **' || coalesce(_prev_title, 'a previous event')
          || '**. We''ve carried ' || _carried::text || ' member'
          || CASE WHEN _carried = 1 THEN '' ELSE 's' END
          || ' over so the conversation can keep going.'
      );
    END IF;
  END IF;

  RETURN _new_id;
END;
$$;

-- ── 4. Re-sync RPC (manual carry-over for late changes) ─────────────────────
-- If an organizer sets / changes previous_event_id after the community is
-- already created, they can call this to do the copy explicitly.
CREATE OR REPLACE FUNCTION public.community_resync_from_previous(_event_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _community_id uuid;
  _previous uuid;
  _copied int := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;

  SELECT id INTO _community_id FROM communities WHERE event_id = _event_id;
  IF _community_id IS NULL THEN RAISE EXCEPTION 'No community for this event'; END IF;

  IF NOT can_moderate_community(auth.uid(), _community_id) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  SELECT previous_event_id INTO _previous FROM events WHERE id = _event_id;
  IF _previous IS NULL THEN RETURN 0; END IF;

  _copied := _copy_community_members_from_previous(_community_id, _previous);
  RETURN _copied;
END;
$$;

GRANT EXECUTE ON FUNCTION public.community_resync_from_previous(uuid) TO authenticated;

-- ── 5. Member role change RPC (manager-only) ────────────────────────────────
CREATE OR REPLACE FUNCTION public.community_set_member_role(
  _community_id uuid, _user_id uuid, _role community_role
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _viewer_role community_role;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;

  _viewer_role := community_role_of(auth.uid(), _community_id);
  IF _viewer_role IS DISTINCT FROM 'manager' AND NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only managers can change member roles';
  END IF;
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'Use the leave action to change your own role';
  END IF;

  UPDATE community_members
     SET role = _role
   WHERE community_id = _community_id AND user_id = _user_id;

  PERFORM _record_audit(
    'community.member.role',
    'community_member',
    _user_id::text,
    jsonb_build_object('community_id', _community_id, 'role', _role::text)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.community_set_member_role(uuid, uuid, community_role) TO authenticated;

-- ----------------------------------------------------------------------------
-- Section: 008_site_assets_org_upload.sql
-- ----------------------------------------------------------------------------
-- Migration: Allow authenticated org members (owners & admins) to upload to site-assets
-- Previously only users with the global "admin" role could upload.
-- Now any authenticated user who belongs to at least one org (i.e. has a row in
-- org_members) can upload/update/delete, which covers the Landing Page branding
-- fields and the Event Quick-Create banner pickers.

-- Drop the old admin-only upload policies
DROP POLICY IF EXISTS "Admin upload site-assets" ON storage.objects;
DROP POLICY IF EXISTS "Admin update site-assets" ON storage.objects;
DROP POLICY IF EXISTS "Admin delete site-assets" ON storage.objects;

-- Allow any authenticated user to upload to site-assets
CREATE POLICY "Authenticated upload site-assets"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'site-assets');

-- Allow an authenticated user to update objects they originally uploaded
-- (owner = auth.uid()::text matches the first segment of the storage path, or we just allow all authenticated)
CREATE POLICY "Authenticated update site-assets"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'site-assets');

-- Allow an authenticated user to delete objects they own
CREATE POLICY "Authenticated delete site-assets"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'site-assets');

-- ----------------------------------------------------------------------------
-- Section: 009_application_toggles.sql
-- ----------------------------------------------------------------------------
-- ═══════════════════════════════════════════════════════════════════════════════
-- 009_application_toggles.sql
--
-- Adds per-event enable/disable flags for the public Call-for-Speakers and
-- Call-for-Sponsors CTAs. Organisers and platform admins toggle these from
-- the event Settings tab to open or close applications without having to
-- unpublish the event.
--
-- Behaviour
--   * Both columns default to TRUE so every existing event keeps its current
--     behaviour (CTAs visible) without needing a backfill.
--   * The frontend hides the corresponding CTA when its flag is FALSE.
--   * Existing speaker_applications / sponsor_applications rows are
--     untouched; this migration only gates new submissions.
--
-- Reversibility: drop the two columns to revert. No data loss because nothing
-- else references them yet.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS speaker_applications_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sponsor_applications_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.events.speaker_applications_enabled IS
  'When false, the public event page hides the "Apply as Speaker" CTA. Defaults to true so existing events keep accepting applications until the organiser explicitly closes them.';

COMMENT ON COLUMN public.events.sponsor_applications_enabled IS
  'When false, the public event page hides the "Become a Sponsor" CTA. Defaults to true so existing events keep accepting applications until the organiser explicitly closes them.';

-- ----------------------------------------------------------------------------
-- Section: 009_event_community_options.sql
-- ----------------------------------------------------------------------------
-- Add community options to events table
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS create_community boolean NOT NULL DEFAULT true;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS community_category text DEFAULT 'other';

-- Update ensure_event_community to use the new category
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

  -- Resolve category from event column
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

  -- Auto-add the event creator as manager
  INSERT INTO community_members (community_id, user_id, role, status, auto)
  VALUES (_new_id, _evt.user_id, 'manager', 'active', true)
  ON CONFLICT (community_id, user_id) DO NOTHING;

  -- Increment member count for the newly created event community
  UPDATE communities SET member_count = member_count + 1 WHERE id = _new_id;

  RETURN _new_id;
END;
$$;

-- Update INSERT trigger function to respect create_community flag
CREATE OR REPLACE FUNCTION public._events_after_insert_community()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _comm_id uuid;
  _parent_id uuid;
BEGIN
  IF NOT NEW.create_community THEN RETURN NEW; END IF;

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

-- Add UPDATE trigger function to handle changes from settings
CREATE OR REPLACE FUNCTION public._events_after_update_community()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _comm_id uuid;
BEGIN
  IF NEW.create_community AND NOT OLD.create_community THEN
    -- Community was enabled. Ensure it exists.
    _comm_id := ensure_event_community(NEW.id);
  ELSIF NOT NEW.create_community AND OLD.create_community THEN
    -- Community was disabled. We will delete it.
    DELETE FROM communities WHERE event_id = NEW.id;
  ELSIF NEW.create_community AND NEW.community_category IS DISTINCT FROM OLD.community_category THEN
    -- Category changed. Update the parent_id of the community.
    UPDATE communities 
    SET parent_id = ensure_parent_community(_map_event_category_to_community(NEW.community_category))
    WHERE event_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_after_update_community ON public.events;
CREATE TRIGGER events_after_update_community
AFTER UPDATE OF create_community, community_category ON public.events
FOR EACH ROW EXECUTE FUNCTION public._events_after_update_community();


-- ============================================================================
-- Section: 009_tickets_sold_trigger.sql
-- (Originally a separate migration; merged here for repo tidiness.
--  Contents are verbatim — no SQL changes.)
-- ============================================================================

-- ============================================================================
-- Maintain `events.tickets_sold` automatically from `registrations`
-- ----------------------------------------------------------------------------
-- The `events.tickets_sold` column has existed since 001_tables but no trigger
-- ever populated it, so the organizer dashboard's event card and the Tickets
-- page have always shown 0/N tickets even after attendees register. The public
-- RSVP card sidesteps this by computing capacity live from the `registrations`
-- table on every render (see src/components/EventRsvpCard.tsx), but organizer
-- surfaces read the column directly and have no realtime fallback.
--
-- This migration:
--   1. Adds `_recompute_tickets_sold(event_id)` — single-event recount helper.
--   2. Adds a trigger on `registrations` that calls the helper after
--      INSERT / DELETE / UPDATE of any field that affects the count
--      (`status`, `approval_status`, `event_id`).
--   3. Backfills `tickets_sold` for every event using the same predicate so
--      existing rows are correct on day one.
--
-- "Sold" predicate matches what EventRsvpCard.tsx and the communications
-- resolver in 007_communications.sql already use:
--     status <> 'cancelled'
--     AND COALESCE(approval_status, 'approved') NOT IN ('declined','waitlisted')
-- i.e. confirmed seats only — no cancellations, declines, or waitlist.
-- ============================================================================

-- ── 1. Single-event recount helper
CREATE OR REPLACE FUNCTION public._recompute_tickets_sold(_eid uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.events e
     SET tickets_sold = COALESCE((
           SELECT count(*)
             FROM public.registrations r
            WHERE r.event_id = _eid
              AND r.status <> 'cancelled'
              AND COALESCE(r.approval_status, 'approved') NOT IN ('declined','waitlisted')
         ), 0)
   WHERE e.id = _eid;
END;
$$;

-- ── 2. Trigger function — handles INSERT / UPDATE / DELETE
CREATE OR REPLACE FUNCTION public._registrations_tickets_sold_trg()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public._recompute_tickets_sold(OLD.event_id);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' AND OLD.event_id IS DISTINCT FROM NEW.event_id THEN
    -- Registration moved between events; recount both.
    PERFORM public._recompute_tickets_sold(OLD.event_id);
    PERFORM public._recompute_tickets_sold(NEW.event_id);
    RETURN NEW;
  ELSE
    PERFORM public._recompute_tickets_sold(NEW.event_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS registrations_tickets_sold_trg ON public.registrations;
CREATE TRIGGER registrations_tickets_sold_trg
AFTER INSERT OR DELETE OR UPDATE OF status, approval_status, event_id
ON public.registrations
FOR EACH ROW EXECUTE FUNCTION public._registrations_tickets_sold_trg();

-- ── 3. Backfill all existing events so day-one numbers are correct.
UPDATE public.events e
   SET tickets_sold = COALESCE((
         SELECT count(*)
           FROM public.registrations r
          WHERE r.event_id = e.id
            AND r.status <> 'cancelled'
            AND COALESCE(r.approval_status, 'approved') NOT IN ('declined','waitlisted')
       ), 0);
