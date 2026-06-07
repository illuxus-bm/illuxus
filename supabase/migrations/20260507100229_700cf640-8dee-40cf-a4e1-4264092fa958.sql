
CREATE TABLE IF NOT EXISTS public.webinar_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  user_id uuid,
  identity text NOT NULL,
  display_name text,
  role text NOT NULL DEFAULT 'viewer',
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  duration_seconds integer
);

CREATE INDEX IF NOT EXISTS idx_webinar_attendance_session ON public.webinar_attendance(session_id);
CREATE INDEX IF NOT EXISTS idx_webinar_attendance_open ON public.webinar_attendance(session_id, identity) WHERE left_at IS NULL;

ALTER TABLE public.webinar_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read attendance"
  ON public.webinar_attendance FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.webinar_sessions s
    WHERE s.id = webinar_attendance.session_id AND public.is_event_owner(auth.uid(), s.event_id)
  ));

ALTER TABLE public.webinar_sessions ADD COLUMN IF NOT EXISTS viewer_total integer NOT NULL DEFAULT 0;
ALTER TABLE public.webinar_sessions ADD COLUMN IF NOT EXISTS attendance_minutes integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.get_webinar_analytics(_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _event_id uuid;
  _result jsonb;
BEGIN
  SELECT event_id INTO _event_id FROM webinar_sessions WHERE id = _session_id;
  IF _event_id IS NULL THEN RAISE EXCEPTION 'Session not found'; END IF;
  IF NOT is_event_owner(auth.uid(), _event_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;

  WITH a AS (
    SELECT * FROM webinar_attendance WHERE session_id = _session_id
  ),
  kpis AS (
    SELECT
      (SELECT viewer_peak FROM webinar_sessions WHERE id = _session_id) AS peak_viewers,
      COUNT(DISTINCT identity) AS unique_viewers,
      COALESCE(AVG(EXTRACT(EPOCH FROM (COALESCE(left_at, now()) - joined_at)) / 60.0), 0) AS avg_watch_minutes,
      (SELECT COUNT(*) FROM webinar_chat WHERE session_id = _session_id AND deleted = false) AS chat_count,
      (SELECT COUNT(*) FROM webinar_qa WHERE session_id = _session_id) AS qa_count,
      (SELECT COUNT(*) FROM webinar_polls WHERE session_id = _session_id) AS polls_count,
      (SELECT COUNT(*) FROM webinar_reactions WHERE session_id = _session_id) AS reactions_count,
      (SELECT COUNT(*) FROM webinar_announcements WHERE session_id = _session_id) AS announcements_count
    FROM a
  ),
  buckets AS (
    SELECT
      date_trunc('minute', gs) AS bucket,
      (SELECT COUNT(*) FROM a WHERE joined_at <= gs AND COALESCE(left_at, now()) >= gs) AS viewers
    FROM generate_series(
      COALESCE((SELECT MIN(joined_at) FROM a), now()),
      COALESCE((SELECT MAX(COALESCE(left_at, now())) FROM a), now()),
      interval '1 minute'
    ) gs
  ),
  top_attendees AS (
    SELECT
      a.identity,
      COALESCE(p.display_name, a.display_name, 'Guest') AS name,
      ROUND(SUM(EXTRACT(EPOCH FROM (COALESCE(a.left_at, now()) - a.joined_at)) / 60.0)::numeric, 1) AS minutes
    FROM a
    LEFT JOIN profiles p ON p.user_id = a.user_id
    GROUP BY a.identity, p.display_name, a.display_name
    ORDER BY minutes DESC NULLS LAST
    LIMIT 50
  )
  SELECT jsonb_build_object(
    'kpis', (SELECT to_jsonb(kpis) FROM kpis),
    'timeline', COALESCE((SELECT jsonb_agg(jsonb_build_object('t', bucket, 'v', viewers) ORDER BY bucket) FROM buckets), '[]'::jsonb),
    'top_attendees', COALESCE((SELECT jsonb_agg(to_jsonb(top_attendees)) FROM top_attendees), '[]'::jsonb)
  ) INTO _result;

  RETURN _result;
END;
$$;
