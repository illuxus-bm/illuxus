-- ============================================================================
-- Speakers can interact (chat, react, Q&A, polls) in webinar sessions
-- ----------------------------------------------------------------------------
-- Safe to re-run.
-- ============================================================================

-- Create helper function to check if user is a speaker for the event
CREATE OR REPLACE FUNCTION public.is_event_speaker(_user_id uuid, _event_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.event_speakers es
      JOIN public.speakers s ON s.id = es.speaker_id
     WHERE es.event_id = _event_id
       AND (
         s.user_id = _user_id
         OR lower(s.email) = lower((SELECT email FROM auth.users WHERE id = _user_id))
       )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_event_speaker(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_event_speaker(uuid,uuid) TO authenticated;

-- Update webinar_chat policies
DROP POLICY IF EXISTS "Read chat" ON public.webinar_chat;
CREATE POLICY "Read chat" ON public.webinar_chat FOR SELECT TO authenticated
USING(
  EXISTS(
    SELECT 1 FROM webinar_sessions s WHERE s.id = session_id AND (
      is_event_approved_attendee(auth.uid(), s.event_id) OR
      is_event_owner(auth.uid(), s.event_id) OR
      is_event_speaker(auth.uid(), s.event_id)
    )
  )
);

DROP POLICY IF EXISTS "Post chat" ON public.webinar_chat;
CREATE POLICY "Post chat" ON public.webinar_chat FOR INSERT TO authenticated
WITH CHECK(
  user_id = auth.uid() AND EXISTS(
    SELECT 1 FROM webinar_sessions s WHERE s.id = session_id AND (
      is_event_approved_attendee(auth.uid(), s.event_id) OR
      is_event_owner(auth.uid(), s.event_id) OR
      is_event_speaker(auth.uid(), s.event_id)
    )
  )
);

-- Update webinar_reactions policies
DROP POLICY IF EXISTS "Read reactions" ON public.webinar_reactions;
CREATE POLICY "Read reactions" ON public.webinar_reactions FOR SELECT TO authenticated
USING(
  EXISTS(
    SELECT 1 FROM webinar_sessions s WHERE s.id = session_id AND (
      is_event_approved_attendee(auth.uid(), s.event_id) OR
      is_event_owner(auth.uid(), s.event_id) OR
      is_event_speaker(auth.uid(), s.event_id)
    )
  )
);

DROP POLICY IF EXISTS "Post reactions" ON public.webinar_reactions;
CREATE POLICY "Post reactions" ON public.webinar_reactions FOR INSERT TO authenticated
WITH CHECK(
  user_id = auth.uid() AND EXISTS(
    SELECT 1 FROM webinar_sessions s WHERE s.id = session_id AND (
      is_event_approved_attendee(auth.uid(), s.event_id) OR
      is_event_owner(auth.uid(), s.event_id) OR
      is_event_speaker(auth.uid(), s.event_id)
    )
  )
);

-- Update webinar_qa policies
DROP POLICY IF EXISTS "Read qa" ON public.webinar_qa;
CREATE POLICY "Read qa" ON public.webinar_qa FOR SELECT TO authenticated
USING(
  EXISTS(
    SELECT 1 FROM webinar_sessions s WHERE s.id = session_id AND (
      is_event_approved_attendee(auth.uid(), s.event_id) OR
      is_event_owner(auth.uid(), s.event_id) OR
      is_event_speaker(auth.uid(), s.event_id)
    )
  )
);

DROP POLICY IF EXISTS "Ask qa" ON public.webinar_qa;
CREATE POLICY "Ask qa" ON public.webinar_qa FOR INSERT TO authenticated
WITH CHECK(
  user_id = auth.uid() AND EXISTS(
    SELECT 1 FROM webinar_sessions s WHERE s.id = session_id AND (
      is_event_approved_attendee(auth.uid(), s.event_id) OR
      is_event_owner(auth.uid(), s.event_id) OR
      is_event_speaker(auth.uid(), s.event_id)
    )
  )
);

-- Update webinar_polls policies
DROP POLICY IF EXISTS "Read polls" ON public.webinar_polls;
CREATE POLICY "Read polls" ON public.webinar_polls FOR SELECT TO authenticated
USING(
  EXISTS(
    SELECT 1 FROM webinar_sessions s WHERE s.id = session_id AND (
      is_event_approved_attendee(auth.uid(), s.event_id) OR
      is_event_owner(auth.uid(), s.event_id) OR
      is_event_speaker(auth.uid(), s.event_id)
    )
  )
);

-- Update webinar_poll_votes policies
DROP POLICY IF EXISTS "Vote" ON public.webinar_poll_votes;
CREATE POLICY "Vote" ON public.webinar_poll_votes FOR INSERT TO authenticated
WITH CHECK(
  user_id = auth.uid() AND EXISTS(
    SELECT 1 FROM webinar_polls p JOIN webinar_sessions s ON s.id = p.session_id WHERE p.id = poll_id AND p.open AND (
      is_event_approved_attendee(auth.uid(), s.event_id) OR
      is_event_owner(auth.uid(), s.event_id) OR
      is_event_speaker(auth.uid(), s.event_id)
    )
  )
);

DROP POLICY IF EXISTS "Read votes" ON public.webinar_poll_votes;
CREATE POLICY "Read votes" ON public.webinar_poll_votes FOR SELECT TO authenticated
USING(
  EXISTS(
    SELECT 1 FROM webinar_polls p JOIN webinar_sessions s ON s.id = p.session_id WHERE p.id = poll_id AND (
      is_event_approved_attendee(auth.uid(), s.event_id) OR
      is_event_owner(auth.uid(), s.event_id) OR
      is_event_speaker(auth.uid(), s.event_id)
    )
  )
);
