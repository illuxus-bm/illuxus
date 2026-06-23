-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 001: let event organizers edit linked speakers / sponsor members.
--
-- Why:
--   The QuickView panel on the Registrations page lets an event organizer edit
--   the contact details (mobile, designation, company, LinkedIn, etc.) of any
--   attendee, speaker, or sponsor for their event.
--   - `registrations` already has an "Owner update regs" policy, so attendees
--     save fine.
--   - `speakers` only has a "Creators manage speakers" policy (auth.uid =
--     speakers.user_id), so the event organizer could NEVER update a speaker
--     row. Updates returned no error and no rows, the UI showed "Saved", and
--     the data was silently lost.
--   - `sponsor_members` only has a "Sponsor owner manage" policy, so the same
--     silent failure happened for sponsor contacts.
--
-- This migration adds additive UPDATE policies (no DROP, no breaking change):
--   - Event organizer can UPDATE a speaker linked to one of their events via
--     event_speakers.
--   - Event organizer can UPDATE / SELECT a sponsor_member whose sponsor is
--     linked to one of their events via event_sponsors.
-- ─────────────────────────────────────────────────────────────────────────────

-- Speakers ---------------------------------------------------------------------

CREATE POLICY "Event owner update linked speakers"
  ON public.speakers
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.event_speakers es
      JOIN public.events e ON e.id = es.event_id
      WHERE es.speaker_id = speakers.id
        AND (e.user_id = auth.uid() OR has_role(auth.uid(), 'admin'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.event_speakers es
      JOIN public.events e ON e.id = es.event_id
      WHERE es.speaker_id = speakers.id
        AND (e.user_id = auth.uid() OR has_role(auth.uid(), 'admin'))
    )
  );

-- Sponsor members --------------------------------------------------------------

CREATE POLICY "Event owner view linked sponsor_members"
  ON public.sponsor_members
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.event_sponsors es
      JOIN public.events e ON e.id = es.event_id
      WHERE es.sponsor_id = sponsor_members.sponsor_id
        AND (e.user_id = auth.uid() OR has_role(auth.uid(), 'admin'))
    )
  );

CREATE POLICY "Event owner update linked sponsor_members"
  ON public.sponsor_members
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.event_sponsors es
      JOIN public.events e ON e.id = es.event_id
      WHERE es.sponsor_id = sponsor_members.sponsor_id
        AND (e.user_id = auth.uid() OR has_role(auth.uid(), 'admin'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.event_sponsors es
      JOIN public.events e ON e.id = es.event_id
      WHERE es.sponsor_id = sponsor_members.sponsor_id
        AND (e.user_id = auth.uid() OR has_role(auth.uid(), 'admin'))
    )
  );
