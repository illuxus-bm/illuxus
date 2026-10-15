-- ═══════════════════════════════════════════════════════════════════════════════
-- 048_sponsor_portal_designation.sql
--
-- The sponsor dashboard's participant list shows each person's designation.
-- `sponsor_portal_people` gains a `designation` column:
--   - speakers:  speakers.designation, falling back to speakers.title
--   - attendees: registrations.designation
--
-- Who may call it is unchanged (an accepted sponsor team member, or the
-- sponsor itself, of a sponsor attached to the event). The return type
-- changes, so the function is dropped and created again.
-- ═══════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.sponsor_portal_people(uuid);

CREATE FUNCTION public.sponsor_portal_people(_eid uuid)
RETURNS TABLE(
  kind text, id uuid, name text, company text, designation text, ticket_type text,
  checked_in boolean, checked_in_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH allowed AS (
    SELECT 1
      FROM sponsor_members sm
      JOIN event_sponsors es ON es.sponsor_id = sm.sponsor_id
     WHERE sm.user_id = auth.uid()
       AND sm.accepted_at IS NOT NULL
       AND es.event_id = _eid
    UNION ALL
    SELECT 1
      FROM sponsors s
      JOIN event_sponsors es ON es.sponsor_id = s.id
     WHERE s.user_id = auth.uid()
       AND es.event_id = _eid
    LIMIT 1
  )
  SELECT 'speaker', sp.id, sp.name, sp.company, COALESCE(NULLIF(sp.designation, ''), sp.title), 'speaker',
         COALESCE(r.checked_in, false), r.checked_in_at
    FROM event_speakers esp
    JOIN speakers sp ON sp.id = esp.speaker_id
    LEFT JOIN registrations r ON r.event_id = _eid
                              AND r.ticket_type = 'speaker'
                              AND lower(r.email) = lower(COALESCE(sp.email, ''))
   WHERE esp.event_id = _eid
     AND EXISTS(SELECT 1 FROM allowed)
  UNION ALL
  SELECT 'attendee', r.id, r.name, r.company, r.designation, r.ticket_type, r.checked_in, r.checked_in_at
    FROM registrations r
   WHERE r.event_id = _eid
     AND r.approval_status = 'approved'
     AND r.ticket_type <> 'speaker'
     AND EXISTS(SELECT 1 FROM allowed);
$$;

GRANT EXECUTE ON FUNCTION public.sponsor_portal_people(uuid) TO authenticated;
