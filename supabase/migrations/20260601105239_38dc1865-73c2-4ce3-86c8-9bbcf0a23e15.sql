CREATE TABLE public.session_speakers (
  session_id uuid NOT NULL,
  speaker_id uuid NOT NULL,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, speaker_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_speakers TO authenticated;
GRANT ALL ON public.session_speakers TO service_role;

ALTER TABLE public.session_speakers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view session speakers"
ON public.session_speakers FOR SELECT TO authenticated USING (true);

CREATE POLICY "Event owners can manage session speakers"
ON public.session_speakers FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.sessions s
  JOIN public.events e ON e.id = s.event_id
  WHERE s.id = session_speakers.session_id
    AND (e.user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.sessions s
  JOIN public.events e ON e.id = s.event_id
  WHERE s.id = session_speakers.session_id
    AND (e.user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
));

CREATE INDEX idx_session_speakers_session ON public.session_speakers(session_id);
CREATE INDEX idx_session_speakers_speaker ON public.session_speakers(speaker_id);

INSERT INTO public.session_speakers (session_id, speaker_id, position)
SELECT id, speaker_id, 0 FROM public.sessions WHERE speaker_id IS NOT NULL
ON CONFLICT DO NOTHING;