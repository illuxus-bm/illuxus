-- ═══════════════════════════════════════════════════════════════════════════════
-- Anonymous viewers see reactions only on a live session of a published event
-- (QA audit F-15).
--
-- "Guests see reactions" let anyone with the public key read reaction rows
-- for every webinar session, including sessions of private or unpublished
-- events. Viewers without an account only need reactions while they watch a
-- live stream (EventLivePage subscribes to new ones), so that is all the
-- policy allows now. Signed-in attendees, speakers and organisers keep their
-- own policy ("Read reactions"), which is unchanged.
--
-- Safe to run more than once. Paste into the SQL Editor and Run.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Anonymous viewers can't read sessions or events themselves, so the policy asks this.
CREATE OR REPLACE FUNCTION public._session_reactions_public(_session uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM webinar_sessions s JOIN events e ON e.id = s.event_id
     WHERE s.id = _session AND s.status = 'live' AND s.reactions_enabled AND e.status = 'published'
  );
$$;

REVOKE ALL ON FUNCTION public._session_reactions_public(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._session_reactions_public(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "Guests see reactions" ON public.webinar_reactions;
CREATE POLICY "Guests see reactions" ON public.webinar_reactions
  FOR SELECT TO anon USING (public._session_reactions_public(session_id));
