-- ============================================================================
-- Fix `events.create_community` toggle so it actually creates the community
-- ----------------------------------------------------------------------------
-- The original update trigger (`_events_after_update_community` in
-- 006_event_extensions.sql) only ran `ensure_event_community` on a
-- FALSE → TRUE transition. Events created with the default
-- (`create_community = true`) before the INSERT trigger existed — or any case
-- where the INSERT trigger silently no-op'd — end up stuck:
--   * `create_community = true` so the settings UI shows "Community is active"
--   * but no row in `communities` for the event
--   * `community_resolve_event` returns NULL, so the Community tab shows
--     "No Community Setup" and saving the toggle / changing the category
--     never wires anything up because the trigger sees OLD = NEW = true and
--     skips the create branch entirely.
--
-- This migration:
--   1. Replaces `_events_after_update_community` with a defensive version
--      that calls `ensure_event_community` whenever `create_community = true`
--      (the helper is idempotent — returns the existing id if one exists).
--   2. Handles category change on an already-existing community.
--   3. Drops the community on toggle-off (unchanged behavior).
--   4. Backfills every event currently in the "should have a community but
--      doesn't" state.
-- ============================================================================

-- ── 1. Patched UPDATE trigger function
CREATE OR REPLACE FUNCTION public._events_after_update_community()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _comm_id uuid;
BEGIN
  IF NEW.create_community THEN
    -- Idempotent: returns the existing community id if one is already linked,
    -- otherwise creates it. This fixes the "toggle is on but no community"
    -- limbo state that pre-trigger events get stuck in.
    _comm_id := ensure_event_community(NEW.id);

    -- Sync the parent (industry) link when the category changes.
    IF _comm_id IS NOT NULL
       AND NEW.community_category IS DISTINCT FROM OLD.community_category THEN
      UPDATE communities
         SET parent_id = ensure_parent_community(
           _map_event_category_to_community(NEW.community_category)
         )
       WHERE event_id = NEW.id;
    END IF;
  ELSIF NOT NEW.create_community AND OLD.create_community THEN
    -- Toggle flipped off — remove the linked community.
    DELETE FROM communities WHERE event_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger definition unchanged — only the function body changes.
DROP TRIGGER IF EXISTS events_after_update_community ON public.events;
CREATE TRIGGER events_after_update_community
AFTER UPDATE OF create_community, community_category ON public.events
FOR EACH ROW EXECUTE FUNCTION public._events_after_update_community();

-- ── 2. Backfill: create the missing community for every event whose toggle
--      is on but has no `communities` row yet.
DO $$
DECLARE
  _eid uuid;
BEGIN
  FOR _eid IN
    SELECT e.id
      FROM public.events e
     WHERE e.create_community = true
       AND NOT EXISTS (
         SELECT 1 FROM public.communities c WHERE c.event_id = e.id
       )
  LOOP
    PERFORM public.ensure_event_community(_eid);
  END LOOP;
END $$;
