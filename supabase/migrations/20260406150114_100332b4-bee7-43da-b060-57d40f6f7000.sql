
-- Sponsors table
CREATE TABLE public.sponsors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  logo_url TEXT,
  website TEXT,
  tier TEXT NOT NULL DEFAULT 'bronze',
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.sponsors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creators can manage their sponsors" ON public.sponsors
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage all sponsors" ON public.sponsors
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Junction: event_sponsors
CREATE TABLE public.event_sponsors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  sponsor_id UUID NOT NULL REFERENCES public.sponsors(id) ON DELETE CASCADE,
  tier_override TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(event_id, sponsor_id)
);

ALTER TABLE public.event_sponsors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view event sponsors" ON public.event_sponsors
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Event owners can manage event sponsors" ON public.event_sponsors
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events WHERE events.id = event_id AND (events.user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.events WHERE events.id = event_id AND (events.user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))));

-- Trigger for updated_at
CREATE TRIGGER update_sponsors_updated_at BEFORE UPDATE ON public.sponsors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
