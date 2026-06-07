
-- Speakers table
CREATE TABLE public.speakers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  bio TEXT,
  photo_url TEXT,
  company TEXT,
  title TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.speakers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creators can manage their speakers" ON public.speakers
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage all speakers" ON public.speakers
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Junction: event_speakers
CREATE TABLE public.event_speakers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  speaker_id UUID NOT NULL REFERENCES public.speakers(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(event_id, speaker_id)
);

ALTER TABLE public.event_speakers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view event speakers" ON public.event_speakers
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Event owners can manage event speakers" ON public.event_speakers
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events WHERE events.id = event_id AND (events.user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.events WHERE events.id = event_id AND (events.user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))));

-- Sessions / Agenda table
CREATE TABLE public.sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  session_type TEXT NOT NULL DEFAULT 'talk',
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  location TEXT,
  speaker_id UUID REFERENCES public.speakers(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view sessions" ON public.sessions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Event owners can manage sessions" ON public.sessions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events WHERE events.id = event_id AND (events.user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.events WHERE events.id = event_id AND (events.user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))));

-- Triggers for updated_at
CREATE TRIGGER update_speakers_updated_at BEFORE UPDATE ON public.speakers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
