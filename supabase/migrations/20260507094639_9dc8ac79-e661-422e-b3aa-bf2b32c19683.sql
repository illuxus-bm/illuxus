
-- 1. events: format & virtual fields
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS event_format text NOT NULL DEFAULT 'physical',
  ADD COLUMN IF NOT EXISTS virtual_provider text,
  ADD COLUMN IF NOT EXISTS virtual_url text;

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_event_format_check;
ALTER TABLE public.events
  ADD CONSTRAINT events_event_format_check
  CHECK (event_format IN ('physical','virtual','hybrid'));

-- 2. organizations: addons list
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS addons text[] NOT NULL DEFAULT '{}';

-- 3. webinar_sessions: extra fields
ALTER TABLE public.webinar_sessions
  ADD COLUMN IF NOT EXISTS layout text NOT NULL DEFAULT 'grid',
  ADD COLUMN IF NOT EXISTS branding jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS lobby_open_at timestamptz,
  ADD COLUMN IF NOT EXISTS reactions_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS lounge_enabled boolean NOT NULL DEFAULT false;

-- 4. webinar_lounge_tables
CREATE TABLE IF NOT EXISTS public.webinar_lounge_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.webinar_sessions(id) ON DELETE CASCADE,
  name text NOT NULL,
  capacity integer NOT NULL DEFAULT 6,
  livekit_subroom text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.webinar_lounge_tables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved attendees read lounge tables"
ON public.webinar_lounge_tables FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.webinar_sessions s
  WHERE s.id = webinar_lounge_tables.session_id
    AND (public.is_event_approved_attendee(auth.uid(), s.event_id)
         OR public.is_event_owner(auth.uid(), s.event_id))
));

CREATE POLICY "Owners manage lounge tables"
ON public.webinar_lounge_tables FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.webinar_sessions s
  WHERE s.id = webinar_lounge_tables.session_id
    AND public.is_event_owner(auth.uid(), s.event_id)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.webinar_sessions s
  WHERE s.id = webinar_lounge_tables.session_id
    AND public.is_event_owner(auth.uid(), s.event_id)
));

-- 5. webinar_reactions (ephemeral emoji floats)
CREATE TABLE IF NOT EXISTS public.webinar_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.webinar_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.webinar_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved attendees read reactions"
ON public.webinar_reactions FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.webinar_sessions s
  WHERE s.id = webinar_reactions.session_id
    AND (public.is_event_approved_attendee(auth.uid(), s.event_id)
         OR public.is_event_owner(auth.uid(), s.event_id))
));

CREATE POLICY "Approved attendees post reactions"
ON public.webinar_reactions FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.webinar_sessions s
    WHERE s.id = webinar_reactions.session_id
      AND (public.is_event_approved_attendee(auth.uid(), s.event_id)
           OR public.is_event_owner(auth.uid(), s.event_id))
  )
);

-- 6. webinar_announcements
CREATE TABLE IF NOT EXISTS public.webinar_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.webinar_sessions(id) ON DELETE CASCADE,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.webinar_announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved attendees read announcements"
ON public.webinar_announcements FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.webinar_sessions s
  WHERE s.id = webinar_announcements.session_id
    AND (public.is_event_approved_attendee(auth.uid(), s.event_id)
         OR public.is_event_owner(auth.uid(), s.event_id))
));

CREATE POLICY "Owners manage announcements"
ON public.webinar_announcements FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.webinar_sessions s
  WHERE s.id = webinar_announcements.session_id
    AND public.is_event_owner(auth.uid(), s.event_id)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.webinar_sessions s
  WHERE s.id = webinar_announcements.session_id
    AND public.is_event_owner(auth.uid(), s.event_id)
));

-- 7. webinar_booths
CREATE TABLE IF NOT EXISTS public.webinar_booths (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  sponsor_id uuid,
  title text NOT NULL,
  description text,
  logo_url text,
  cta_label text,
  cta_url text,
  video_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.webinar_booths ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved attendees read booths"
ON public.webinar_booths FOR SELECT TO authenticated
USING (
  public.is_event_approved_attendee(auth.uid(), event_id)
  OR public.is_event_owner(auth.uid(), event_id)
);

CREATE POLICY "Owners manage booths"
ON public.webinar_booths FOR ALL TO authenticated
USING (public.is_event_owner(auth.uid(), event_id))
WITH CHECK (public.is_event_owner(auth.uid(), event_id));

-- Realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.webinar_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.webinar_announcements;
ALTER PUBLICATION supabase_realtime ADD TABLE public.webinar_lounge_tables;
