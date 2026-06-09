-- Create event_emails table for the Communication / Marketing email campaigns feature

CREATE TABLE IF NOT EXISTS public.event_emails (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  subject         text NOT NULL,
  body            text NOT NULL DEFAULT '',
  recipient_filter text NOT NULL DEFAULT 'all',   -- all | confirmed | speakers | waitlist
  recipients      text NOT NULL DEFAULT 'All Registrants',  -- human-readable label
  status          text NOT NULL DEFAULT 'draft'   -- draft | sent
    CHECK (status IN ('draft', 'sent')),
  sent_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Index for fast per-event queries (the most common read pattern)
CREATE INDEX IF NOT EXISTS event_emails_event_id_idx
  ON public.event_emails (event_id, created_at DESC);

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION public.set_event_emails_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS event_emails_set_updated_at ON public.event_emails;
CREATE TRIGGER event_emails_set_updated_at
  BEFORE UPDATE ON public.event_emails
  FOR EACH ROW EXECUTE FUNCTION public.set_event_emails_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.event_emails ENABLE ROW LEVEL SECURITY;

-- Org members can read emails for events that belong to their org
CREATE POLICY "Org members can view event emails"
ON public.event_emails FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.events e
    JOIN public.org_members om ON om.org_id = e.org_id
    WHERE e.id = event_emails.event_id
      AND om.user_id = auth.uid()
  )
);

-- Org members can insert emails for their own events
CREATE POLICY "Org members can insert event emails"
ON public.event_emails FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.events e
    JOIN public.org_members om ON om.org_id = e.org_id
    WHERE e.id = event_emails.event_id
      AND om.user_id = auth.uid()
  )
);

-- Org members can update emails (e.g. status draft→sent) for their events
CREATE POLICY "Org members can update event emails"
ON public.event_emails FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.events e
    JOIN public.org_members om ON om.org_id = e.org_id
    WHERE e.id = event_emails.event_id
      AND om.user_id = auth.uid()
  )
);

-- Org members can delete emails for their events
CREATE POLICY "Org members can delete event emails"
ON public.event_emails FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.events e
    JOIN public.org_members om ON om.org_id = e.org_id
    WHERE e.id = event_emails.event_id
      AND om.user_id = auth.uid()
  )
);

-- Add to realtime publication so the MarketingPage live-updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.event_emails;
