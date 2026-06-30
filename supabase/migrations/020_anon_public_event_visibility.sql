-- Anon SELECT on join + detail tables for published events
--
-- Why: PublicEventPage.tsx queries event_speakers, event_sponsors,
-- sessions, and session_speakers directly with the anon JWT to render
-- speaker / sponsor / agenda sections. The current RLS only grants
-- SELECT on these tables to {authenticated}, so logged-out visitors
-- see empty lists and the Speakers / Sponsors / Agenda blocks vanish.
--
-- The speakers / sponsors tables already have "Anon view ... for
-- published" policies, but those policies do an EXISTS through
-- event_speakers / event_sponsors / events — which the anon role
-- cannot read either, so the EXISTS resolves false and the policy
-- effectively returns nothing. Adding read policies on the join
-- tables (and on sessions / session_speakers) completes the chain.
--
-- Authenticated visibility is unchanged — the existing "Auth view ..."
-- policies stay in place.

-- Joins: event_speakers
DROP POLICY IF EXISTS "Anon view event_speakers for published" ON public.event_speakers;
CREATE POLICY "Anon view event_speakers for published"
  ON public.event_speakers
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_speakers.event_id
        AND e.status = 'published'
    )
  );

-- Joins: event_sponsors
DROP POLICY IF EXISTS "Anon view event_sponsors for published" ON public.event_sponsors;
CREATE POLICY "Anon view event_sponsors for published"
  ON public.event_sponsors
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_sponsors.event_id
        AND e.status = 'published'
    )
  );

-- Agenda: sessions
DROP POLICY IF EXISTS "Anon view sessions for published" ON public.sessions;
CREATE POLICY "Anon view sessions for published"
  ON public.sessions
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = sessions.event_id
        AND e.status = 'published'
    )
  );

-- Agenda: session_speakers
DROP POLICY IF EXISTS "Anon view session_speakers for published" ON public.session_speakers;
CREATE POLICY "Anon view session_speakers for published"
  ON public.session_speakers
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.sessions s
      JOIN public.events e ON e.id = s.event_id
      WHERE s.id = session_speakers.session_id
        AND e.status = 'published'
    )
  );
