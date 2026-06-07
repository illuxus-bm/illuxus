GRANT SELECT ON public.speakers TO anon;
GRANT SELECT ON public.sessions TO anon;
GRANT SELECT ON public.sponsors TO anon;
GRANT SELECT ON public.event_speakers TO anon;
GRANT SELECT ON public.event_sponsors TO anon;
GRANT SELECT ON public.session_speakers TO anon;

CREATE POLICY "Public can view event_speakers for published events"
ON public.event_speakers FOR SELECT
TO anon
USING (EXISTS (
  SELECT 1 FROM public.events e
  WHERE e.id = event_speakers.event_id AND e.status = 'published'
));

CREATE POLICY "Public can view event_sponsors for published events"
ON public.event_sponsors FOR SELECT
TO anon
USING (EXISTS (
  SELECT 1 FROM public.events e
  WHERE e.id = event_sponsors.event_id AND e.status = 'published'
));

CREATE POLICY "Public can view sessions for published events"
ON public.sessions FOR SELECT
TO anon
USING (EXISTS (
  SELECT 1 FROM public.events e
  WHERE e.id = sessions.event_id AND e.status = 'published'
));

CREATE POLICY "Public can view session_speakers for published events"
ON public.session_speakers FOR SELECT
TO anon
USING (EXISTS (
  SELECT 1
  FROM public.sessions s
  JOIN public.events e ON e.id = s.event_id
  WHERE s.id = session_speakers.session_id AND e.status = 'published'
));

CREATE POLICY "Public can view speakers used by published events"
ON public.speakers FOR SELECT
TO anon
USING (EXISTS (
  SELECT 1
  FROM public.event_speakers es
  JOIN public.events e ON e.id = es.event_id
  WHERE es.speaker_id = speakers.id AND e.status = 'published'
));

CREATE POLICY "Public can view sponsors used by published events"
ON public.sponsors FOR SELECT
TO anon
USING (EXISTS (
  SELECT 1
  FROM public.event_sponsors es
  JOIN public.events e ON e.id = es.event_id
  WHERE es.sponsor_id = sponsors.id AND e.status = 'published'
));