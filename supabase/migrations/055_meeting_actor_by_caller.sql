-- ═══════════════════════════════════════════════════════════════════════════════
-- 055_meeting_actor_by_caller.sql
--
-- Fix: on the sponsor dashboard, changing a meeting failed with "Choose the
-- sponsor." for accounts that are both on a sponsor's team and able to manage
-- the event's registrations (a Super Admin, for example). `_meeting_actor`
-- (052) treated anyone who can view registrations as the organiser, and the
-- organiser must name the sponsor — which the sponsor page never does.
--
-- Now the call decides:
--   • no sponsor named   → the caller acts as its own sponsor (the sponsor
--                          dashboard); organisers who aren't on a sponsor's
--                          team are told to choose one;
--   • a sponsor named    → organisers act as the organiser for that sponsor
--                          (the Registrations tab always names it); anyone
--                          else must be on that sponsor's team.
-- The sponsor rules (locks, disputes) therefore apply on the sponsor page
-- whoever is signed in.
--
-- Run after 054. Idempotent — safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._meeting_actor(_eid uuid, _sponsor_id uuid)
RETURNS TABLE (sponsor_id uuid, side text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  _sid   uuid;
  _count int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first.' USING ERRCODE = '42501'; END IF;

  IF _sponsor_id IS NULL THEN
    -- The sponsor dashboard: act as the caller's own sponsor.
    SELECT count(*) INTO _count FROM public._my_event_sponsors(_eid);
    IF _count = 0 THEN
      IF public._can_view_event_registrations(_eid) THEN
        RAISE EXCEPTION 'Choose the sponsor.' USING ERRCODE = '22023';
      END IF;
      RAISE EXCEPTION 'You are not a sponsor of this event.' USING ERRCODE = '42501';
    ELSIF _count > 1 THEN
      RAISE EXCEPTION 'You represent more than one sponsor of this event; choose which.' USING ERRCODE = '22023';
    END IF;
    SELECT ms.sponsor_id INTO _sid FROM public._my_event_sponsors(_eid) ms;
    sponsor_id := _sid; side := 'sponsor'; RETURN NEXT; RETURN;
  END IF;

  -- A sponsor is named: organisers act for it; otherwise it must be the caller's own.
  IF public._can_view_event_registrations(_eid) THEN
    IF NOT EXISTS (SELECT 1 FROM event_sponsors es WHERE es.event_id = _eid AND es.sponsor_id = _sponsor_id) THEN
      RAISE EXCEPTION 'That sponsor is not on this event.' USING ERRCODE = '42501';
    END IF;
    sponsor_id := _sponsor_id; side := 'organiser'; RETURN NEXT; RETURN;
  END IF;

  SELECT ms.sponsor_id INTO _sid FROM public._my_event_sponsors(_eid) ms WHERE ms.sponsor_id = _sponsor_id;
  IF _sid IS NULL THEN RAISE EXCEPTION 'You are not that sponsor.' USING ERRCODE = '42501'; END IF;
  sponsor_id := _sid; side := 'sponsor'; RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public._meeting_actor(uuid, uuid) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
