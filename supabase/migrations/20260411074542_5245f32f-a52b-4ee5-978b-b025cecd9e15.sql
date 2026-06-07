
DROP POLICY "Anyone can register for events" ON public.registrations;

CREATE POLICY "Authenticated users can register"
  ON public.registrations FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);
