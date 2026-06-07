
-- Org-level webinar branding default
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS webinar_branding_enabled boolean NOT NULL DEFAULT true;

-- Per-event override (NULL = use org default)
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS webinar_branding_enabled boolean;

-- Server-side fallback for single-active-session enforcement.
-- Persists the chosen browser_session_id per registration so the same
-- person re-opening their join link from a fresh browser/cleared storage
-- isn't self-kicked. We keep a short TTL + a fingerprint hash.
CREATE TABLE IF NOT EXISTS public.webinar_browser_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL,
  browser_session_id text NOT NULL,
  fingerprint text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (registration_id, browser_session_id)
);

CREATE INDEX IF NOT EXISTS idx_wbs_reg ON public.webinar_browser_sessions(registration_id);

ALTER TABLE public.webinar_browser_sessions ENABLE ROW LEVEL SECURITY;

-- Only event owners can read; writes happen via SECURITY DEFINER edge function.
CREATE POLICY "Event owners read browser sessions"
  ON public.webinar_browser_sessions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.registrations r
    JOIN public.events e ON e.id = r.event_id
    WHERE r.id = webinar_browser_sessions.registration_id
      AND (e.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  ));

-- Helper: resolve or remember the canonical browser_session_id for a join link.
-- Returns the active browser_session_id (existing or freshly stored).
CREATE OR REPLACE FUNCTION public.resolve_browser_session(
  _join_token text,
  _candidate_session_id text,
  _fingerprint text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _reg_id uuid;
  _existing text;
BEGIN
  SELECT id INTO _reg_id FROM public.registrations WHERE join_token = _join_token;
  IF _reg_id IS NULL THEN
    RETURN _candidate_session_id;
  END IF;

  -- Already-known session for this registration (matched by id or fingerprint)
  SELECT browser_session_id INTO _existing
  FROM public.webinar_browser_sessions
  WHERE registration_id = _reg_id
    AND (browser_session_id = _candidate_session_id
         OR (_fingerprint IS NOT NULL AND fingerprint = _fingerprint))
  ORDER BY last_seen_at DESC
  LIMIT 1;

  IF _existing IS NOT NULL THEN
    UPDATE public.webinar_browser_sessions
       SET last_seen_at = now()
     WHERE registration_id = _reg_id AND browser_session_id = _existing;
    RETURN _existing;
  END IF;

  INSERT INTO public.webinar_browser_sessions (registration_id, browser_session_id, fingerprint)
  VALUES (_reg_id, _candidate_session_id, _fingerprint)
  ON CONFLICT (registration_id, browser_session_id) DO UPDATE SET last_seen_at = now();

  RETURN _candidate_session_id;
END;
$$;

-- Effective branding flag for an event (event override > org default > true)
CREATE OR REPLACE FUNCTION public.event_branding_enabled(_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    e.webinar_branding_enabled,
    o.webinar_branding_enabled,
    true
  )
  FROM public.events e
  LEFT JOIN public.organizations o ON o.id = e.org_id
  WHERE e.id = _event_id;
$$;
