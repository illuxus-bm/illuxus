
-- Create registrations table
CREATE TABLE public.registrations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id uuid,
  name text NOT NULL,
  email text NOT NULL,
  ticket_type text NOT NULL DEFAULT 'general',
  status text NOT NULL DEFAULT 'confirmed',
  amount_paid numeric DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;

-- Event owners and admins can view registrations
CREATE POLICY "Event owners can view registrations"
  ON public.registrations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = registrations.event_id
        AND (events.user_id = auth.uid() OR has_role(auth.uid(), 'admin'))
    )
  );

-- Anyone can insert a registration (for public event signup)
CREATE POLICY "Anyone can register for events"
  ON public.registrations FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Event owners and admins can update registrations
CREATE POLICY "Event owners can update registrations"
  ON public.registrations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = registrations.event_id
        AND (events.user_id = auth.uid() OR has_role(auth.uid(), 'admin'))
    )
  );

-- Event owners and admins can delete registrations
CREATE POLICY "Event owners can delete registrations"
  ON public.registrations FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = registrations.event_id
        AND (events.user_id = auth.uid() OR has_role(auth.uid(), 'admin'))
    )
  );

-- Trigger for updated_at
CREATE TRIGGER update_registrations_updated_at
  BEFORE UPDATE ON public.registrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
