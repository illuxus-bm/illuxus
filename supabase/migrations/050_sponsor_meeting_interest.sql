-- ═══════════════════════════════════════════════════════════════════════════════
-- 050_sponsor_meeting_interest.sql
--
-- Meeting Interest: a sponsor marks attendees of an event it sponsors that it
-- would like to meet. Each sponsor's selection is its own; many sponsors can
-- mark the same attendee. It records interest only — nothing is scheduled,
-- nobody is notified, and no further attendee details are revealed.
--
--   1. `sponsor_meeting_interests` — one row per (event, sponsor, attendee
--      registration). Unique, so repeating a request never duplicates it.
--      No client reads or writes it directly; everything goes through the
--      functions below.
--   2. `sponsor_set_meeting_interest(_eid, _registration_id, _interested,
--      _sponsor_id?)` — the signed-in sponsor sets or clears ITS OWN
--      selection. The sponsor is worked out on the server from the session:
--      an accepted team member of a sponsor attached to the event, or the
--      sponsor itself (approved application) on an event it does not run.
--      The registration must be one the sponsor can see in its dashboard (an
--      approved, non-speaker registration of that event). Audit-logged.
--   3. `sponsor_portal_people(_eid)` — the sponsor dashboard's list, now with
--      `designation` (as migration 048) and the caller's `meeting_interest`.
--   4. `event_meeting_interests(_eid)` — for the event's organisers (same
--      access as viewing registrations): every interest with the sponsor's
--      name, for the Registrations tab's column and filter.
--
-- Idempotent — safe to run more than once. Supersedes 048's version of
-- `sponsor_portal_people` (either order works).
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Table ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sponsor_meeting_interests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  sponsor_id      uuid NOT NULL REFERENCES public.sponsors(id) ON DELETE CASCADE,
  registration_id uuid NOT NULL REFERENCES public.registrations(id) ON DELETE CASCADE,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sponsor_meeting_interests_unique UNIQUE (event_id, sponsor_id, registration_id)
);

CREATE INDEX IF NOT EXISTS sponsor_meeting_interests_event_idx        ON public.sponsor_meeting_interests (event_id);
CREATE INDEX IF NOT EXISTS sponsor_meeting_interests_registration_idx ON public.sponsor_meeting_interests (registration_id);
CREATE INDEX IF NOT EXISTS sponsor_meeting_interests_sponsor_idx      ON public.sponsor_meeting_interests (sponsor_id, event_id);

ALTER TABLE public.sponsor_meeting_interests ENABLE ROW LEVEL SECURITY;
-- No policies: browsers go through the SECURITY DEFINER functions below.
REVOKE ALL ON public.sponsor_meeting_interests FROM anon, authenticated;

COMMENT ON TABLE public.sponsor_meeting_interests IS
  'Meeting Interest: sponsor S would like to meet the attendee of registration R at event E. One row per (event, sponsor, registration). Read and written only through sponsor_set_meeting_interest, sponsor_portal_people and event_meeting_interests.';

-- ── Helpers ───────────────────────────────────────────────────────────────────
-- The sponsors the caller acts for at this event: accepted team membership, or
-- owning the sponsor record on an event the caller does not run (an organiser
-- who merely created a sponsor for their own event is not that sponsor).
CREATE OR REPLACE FUNCTION public._my_event_sponsors(_eid uuid)
RETURNS TABLE (sponsor_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT es.sponsor_id
    FROM event_sponsors es
    JOIN sponsor_members sm ON sm.sponsor_id = es.sponsor_id
   WHERE es.event_id = _eid AND sm.user_id = auth.uid() AND sm.accepted_at IS NOT NULL
  UNION
  SELECT es.sponsor_id
    FROM event_sponsors es
    JOIN sponsors s ON s.id = es.sponsor_id
    JOIN events e   ON e.id = es.event_id
    LEFT JOIN organizations o ON o.id = e.org_id
   WHERE es.event_id = _eid AND s.user_id = auth.uid()
     AND e.user_id IS DISTINCT FROM auth.uid()
     AND o.owner_id IS DISTINCT FROM auth.uid()
     AND NOT EXISTS (SELECT 1 FROM org_members m WHERE m.org_id = e.org_id AND m.user_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public._my_event_sponsors(uuid) FROM PUBLIC, anon, authenticated;

-- Same access as the "Owner view regs" policy on registrations.
CREATE OR REPLACE FUNCTION public._can_view_event_registrations(_eid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
      FROM events e
      LEFT JOIN organizations o ON o.id = e.org_id
      LEFT JOIN org_members  m ON m.org_id = e.org_id AND m.user_id = auth.uid()
     WHERE e.id = _eid
       AND (e.user_id = auth.uid() OR o.owner_id = auth.uid() OR m.user_id IS NOT NULL OR has_role(auth.uid(), 'admin'))
  );
$$;
REVOKE ALL ON FUNCTION public._can_view_event_registrations(uuid) FROM PUBLIC, anon, authenticated;

-- ── 2. Set / clear the caller's own selection ────────────────────────────────
CREATE OR REPLACE FUNCTION public.sponsor_set_meeting_interest(
  _eid             uuid,
  _registration_id uuid,
  _interested      boolean,
  _sponsor_id      uuid DEFAULT NULL
)
RETURNS TABLE (registration_id uuid, sponsor_id uuid, meeting_interest boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _sid   uuid;
  _count int;
  _email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first.' USING ERRCODE = '42501'; END IF;

  -- Which sponsor is acting: worked out from the session, never taken on
  -- trust. `_sponsor_id` only chooses between the caller's own sponsors.
  SELECT count(*) INTO _count FROM public._my_event_sponsors(_eid);
  IF _count = 0 THEN RAISE EXCEPTION 'You are not a sponsor of this event.' USING ERRCODE = '42501'; END IF;
  IF _sponsor_id IS NOT NULL THEN
    SELECT ms.sponsor_id INTO _sid FROM public._my_event_sponsors(_eid) ms WHERE ms.sponsor_id = _sponsor_id;
    IF _sid IS NULL THEN RAISE EXCEPTION 'You are not that sponsor.' USING ERRCODE = '42501'; END IF;
  ELSIF _count = 1 THEN
    SELECT ms.sponsor_id INTO _sid FROM public._my_event_sponsors(_eid) ms;
  ELSE
    RAISE EXCEPTION 'You represent more than one sponsor of this event; choose which.' USING ERRCODE = '22023';
  END IF;

  -- Only attendees the sponsor can see in its dashboard.
  IF NOT EXISTS (
    SELECT 1 FROM registrations r
     WHERE r.id = _registration_id AND r.event_id = _eid
       AND r.approval_status = 'approved' AND r.ticket_type <> 'speaker'
  ) THEN
    RAISE EXCEPTION 'That attendee is not available.' USING ERRCODE = '42501';
  END IF;

  IF _interested THEN
    INSERT INTO sponsor_meeting_interests (event_id, sponsor_id, registration_id, created_by)
         VALUES (_eid, _sid, _registration_id, auth.uid())
    ON CONFLICT ON CONSTRAINT sponsor_meeting_interests_unique DO NOTHING;
  ELSE
    -- Only this sponsor's row; every other sponsor's selection stays.
    DELETE FROM sponsor_meeting_interests smi
     WHERE smi.event_id = _eid AND smi.sponsor_id = _sid AND smi.registration_id = _registration_id;
  END IF;

  SELECT u.email INTO _email FROM auth.users u WHERE u.id = auth.uid();
  INSERT INTO audit_logs (actor_id, actor_email, action, target_type, target_id, details)
  VALUES (auth.uid(), _email,
          CASE WHEN _interested THEN 'meeting_interest.added' ELSE 'meeting_interest.removed' END,
          'registration', _registration_id::text,
          jsonb_build_object('event_id', _eid, 'sponsor_id', _sid));

  registration_id  := _registration_id;
  sponsor_id       := _sid;
  meeting_interest := _interested;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.sponsor_set_meeting_interest(uuid, uuid, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sponsor_set_meeting_interest(uuid, uuid, boolean, uuid) TO authenticated;

-- ── 3. The sponsor dashboard's list ──────────────────────────────────────────
DROP FUNCTION IF EXISTS public.sponsor_portal_people(uuid);

CREATE FUNCTION public.sponsor_portal_people(_eid uuid)
RETURNS TABLE(
  kind text, id uuid, name text, company text, designation text, ticket_type text,
  checked_in boolean, checked_in_at timestamptz, meeting_interest boolean
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH allowed AS (
    SELECT 1
      FROM sponsor_members sm
      JOIN event_sponsors es ON es.sponsor_id = sm.sponsor_id
     WHERE sm.user_id = auth.uid() AND sm.accepted_at IS NOT NULL AND es.event_id = _eid
    UNION ALL
    SELECT 1
      FROM sponsors s
      JOIN event_sponsors es ON es.sponsor_id = s.id
     WHERE s.user_id = auth.uid() AND es.event_id = _eid
    LIMIT 1
  ),
  mine AS (SELECT sponsor_id FROM public._my_event_sponsors(_eid))
  SELECT 'speaker', sp.id, sp.name, sp.company, COALESCE(NULLIF(sp.designation, ''), sp.title), 'speaker',
         COALESCE(r.checked_in, false), r.checked_in_at, false
    FROM event_speakers esp
    JOIN speakers sp ON sp.id = esp.speaker_id
    LEFT JOIN registrations r ON r.event_id = _eid
                              AND r.ticket_type = 'speaker'
                              AND lower(r.email) = lower(COALESCE(sp.email, ''))
   WHERE esp.event_id = _eid
     AND EXISTS(SELECT 1 FROM allowed)
  UNION ALL
  SELECT 'attendee', r.id, r.name, r.company, r.designation, r.ticket_type, r.checked_in, r.checked_in_at,
         EXISTS (SELECT 1 FROM sponsor_meeting_interests smi
                  WHERE smi.event_id = _eid AND smi.registration_id = r.id
                    AND smi.sponsor_id IN (SELECT sponsor_id FROM mine))
    FROM registrations r
   WHERE r.event_id = _eid
     AND r.approval_status = 'approved'
     AND r.ticket_type <> 'speaker'
     AND EXISTS(SELECT 1 FROM allowed);
$$;
GRANT EXECUTE ON FUNCTION public.sponsor_portal_people(uuid) TO authenticated;

-- ── 4. Organisers: every interest with the sponsor's name ────────────────────
CREATE OR REPLACE FUNCTION public.event_meeting_interests(_eid uuid)
RETURNS TABLE (registration_id uuid, sponsor_id uuid, sponsor_name text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT smi.registration_id, smi.sponsor_id, s.name, smi.created_at
    FROM sponsor_meeting_interests smi
    JOIN sponsors s ON s.id = smi.sponsor_id
   WHERE smi.event_id = _eid
     AND public._can_view_event_registrations(_eid)
   ORDER BY s.name, smi.created_at;
$$;
REVOKE ALL ON FUNCTION public.event_meeting_interests(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.event_meeting_interests(uuid) TO authenticated;
