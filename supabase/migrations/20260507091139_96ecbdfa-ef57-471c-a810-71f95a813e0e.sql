
-- Helper: is the current user a registered, approved attendee of an event?
CREATE OR REPLACE FUNCTION public.is_event_approved_attendee(_user_id uuid, _event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.registrations r
    WHERE r.event_id = _event_id
      AND r.user_id = _user_id
      AND r.approval_status = 'approved'
  );
$$;

-- Helper: is the current user the owner of an event (or admin)?
CREATE OR REPLACE FUNCTION public.is_event_owner(_user_id uuid, _event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = _event_id
      AND (e.user_id = _user_id OR public.has_role(_user_id, 'admin'::app_role))
  );
$$;

-- ============ webinar_sessions ============
CREATE TABLE public.webinar_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  livekit_room text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','ended','error')),
  record_enabled boolean NOT NULL DEFAULT false,
  recording_url text,
  egress_id text,
  started_at timestamptz,
  ended_at timestamptz,
  viewer_peak integer NOT NULL DEFAULT 0,
  publisher_peak integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_webinar_sessions_event ON public.webinar_sessions(event_id);
ALTER TABLE public.webinar_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage sessions" ON public.webinar_sessions
  FOR ALL TO authenticated
  USING (public.is_event_owner(auth.uid(), event_id))
  WITH CHECK (public.is_event_owner(auth.uid(), event_id));

CREATE POLICY "Approved attendees read sessions" ON public.webinar_sessions
  FOR SELECT TO authenticated
  USING (public.is_event_approved_attendee(auth.uid(), event_id));

CREATE TRIGGER trg_webinar_sessions_updated
  BEFORE UPDATE ON public.webinar_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ webinar_speakers ============
CREATE TABLE public.webinar_speakers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.webinar_sessions(id) ON DELETE CASCADE,
  user_id uuid,
  email text NOT NULL,
  display_name text NOT NULL,
  role text NOT NULL DEFAULT 'speaker' CHECK (role IN ('host','cohost','speaker')),
  invite_token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text,'-',''),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_webinar_speakers_session ON public.webinar_speakers(session_id);
ALTER TABLE public.webinar_speakers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage speakers" ON public.webinar_speakers
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.webinar_sessions s WHERE s.id = session_id AND public.is_event_owner(auth.uid(), s.event_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.webinar_sessions s WHERE s.id = session_id AND public.is_event_owner(auth.uid(), s.event_id)));

CREATE POLICY "Approved attendees read speaker list" ON public.webinar_speakers
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.webinar_sessions s WHERE s.id = session_id AND public.is_event_approved_attendee(auth.uid(), s.event_id)));

-- ============ webinar_stage_requests ============
CREATE TABLE public.webinar_stage_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.webinar_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, user_id)
);
CREATE INDEX idx_stage_requests_session ON public.webinar_stage_requests(session_id);
ALTER TABLE public.webinar_stage_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Attendee creates own request" ON public.webinar_stage_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.webinar_sessions s WHERE s.id = session_id AND public.is_event_approved_attendee(auth.uid(), s.event_id))
  );
CREATE POLICY "Attendee cancels own request" ON public.webinar_stage_requests
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Attendee reads own request" ON public.webinar_stage_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Owners manage requests" ON public.webinar_stage_requests
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.webinar_sessions s WHERE s.id = session_id AND public.is_event_owner(auth.uid(), s.event_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.webinar_sessions s WHERE s.id = session_id AND public.is_event_owner(auth.uid(), s.event_id)));

-- ============ webinar_qa ============
CREATE TABLE public.webinar_qa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.webinar_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  question text NOT NULL CHECK (length(question) BETWEEN 1 AND 1000),
  upvotes integer NOT NULL DEFAULT 0,
  answered boolean NOT NULL DEFAULT false,
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_qa_session ON public.webinar_qa(session_id);
ALTER TABLE public.webinar_qa ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved attendees read qa" ON public.webinar_qa
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.webinar_sessions s WHERE s.id = session_id AND (public.is_event_approved_attendee(auth.uid(), s.event_id) OR public.is_event_owner(auth.uid(), s.event_id))));
CREATE POLICY "Approved attendees ask qa" ON public.webinar_qa
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.webinar_sessions s WHERE s.id = session_id AND public.is_event_approved_attendee(auth.uid(), s.event_id)));
CREATE POLICY "Owners moderate qa" ON public.webinar_qa
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.webinar_sessions s WHERE s.id = session_id AND public.is_event_owner(auth.uid(), s.event_id)));
CREATE POLICY "Owners delete qa" ON public.webinar_qa
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.webinar_sessions s WHERE s.id = session_id AND public.is_event_owner(auth.uid(), s.event_id)));

-- ============ webinar_polls + votes ============
CREATE TABLE public.webinar_polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.webinar_sessions(id) ON DELETE CASCADE,
  question text NOT NULL,
  options jsonb NOT NULL,
  open boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.webinar_polls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved attendees read polls" ON public.webinar_polls
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.webinar_sessions s WHERE s.id = session_id AND (public.is_event_approved_attendee(auth.uid(), s.event_id) OR public.is_event_owner(auth.uid(), s.event_id))));
CREATE POLICY "Owners manage polls" ON public.webinar_polls
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.webinar_sessions s WHERE s.id = session_id AND public.is_event_owner(auth.uid(), s.event_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.webinar_sessions s WHERE s.id = session_id AND public.is_event_owner(auth.uid(), s.event_id)));

CREATE TABLE public.webinar_poll_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.webinar_polls(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  option_index integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (poll_id, user_id)
);
ALTER TABLE public.webinar_poll_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vote on open polls" ON public.webinar_poll_votes
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.webinar_polls p
      JOIN public.webinar_sessions s ON s.id = p.session_id
      WHERE p.id = poll_id AND p.open
        AND public.is_event_approved_attendee(auth.uid(), s.event_id)
    )
  );
CREATE POLICY "Read votes" ON public.webinar_poll_votes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.webinar_polls p
      JOIN public.webinar_sessions s ON s.id = p.session_id
      WHERE p.id = poll_id
        AND (public.is_event_approved_attendee(auth.uid(), s.event_id) OR public.is_event_owner(auth.uid(), s.event_id))
    )
  );

-- ============ webinar_chat ============
CREATE TABLE public.webinar_chat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.webinar_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  message text NOT NULL CHECK (length(message) BETWEEN 1 AND 500),
  deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_chat_session ON public.webinar_chat(session_id);
ALTER TABLE public.webinar_chat ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved attendees read chat" ON public.webinar_chat
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.webinar_sessions s WHERE s.id = session_id AND (public.is_event_approved_attendee(auth.uid(), s.event_id) OR public.is_event_owner(auth.uid(), s.event_id))));
CREATE POLICY "Approved attendees post chat" ON public.webinar_chat
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.webinar_sessions s WHERE s.id = session_id AND public.is_event_approved_attendee(auth.uid(), s.event_id)));
CREATE POLICY "Owners moderate chat" ON public.webinar_chat
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.webinar_sessions s WHERE s.id = session_id AND public.is_event_owner(auth.uid(), s.event_id)));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.webinar_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.webinar_qa;
ALTER PUBLICATION supabase_realtime ADD TABLE public.webinar_polls;
ALTER PUBLICATION supabase_realtime ADD TABLE public.webinar_poll_votes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.webinar_chat;
ALTER PUBLICATION supabase_realtime ADD TABLE public.webinar_stage_requests;

ALTER TABLE public.webinar_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.webinar_qa REPLICA IDENTITY FULL;
ALTER TABLE public.webinar_polls REPLICA IDENTITY FULL;
ALTER TABLE public.webinar_poll_votes REPLICA IDENTITY FULL;
ALTER TABLE public.webinar_chat REPLICA IDENTITY FULL;
ALTER TABLE public.webinar_stage_requests REPLICA IDENTITY FULL;

-- Storage bucket for recordings
INSERT INTO storage.buckets (id, name, public)
VALUES ('webinar-recordings', 'webinar-recordings', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Owners read recordings" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'webinar-recordings'
    AND EXISTS (
      SELECT 1 FROM public.webinar_sessions s
      WHERE s.livekit_room = (storage.foldername(name))[1]
        AND public.is_event_owner(auth.uid(), s.event_id)
    )
  );

CREATE POLICY "Owners write recordings" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'webinar-recordings'
    AND EXISTS (
      SELECT 1 FROM public.webinar_sessions s
      WHERE s.livekit_room = (storage.foldername(name))[1]
        AND public.is_event_owner(auth.uid(), s.event_id)
    )
  );
