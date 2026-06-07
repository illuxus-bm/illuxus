
-- 1) sponsor_members table
CREATE TABLE public.sponsor_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_id uuid NOT NULL REFERENCES public.sponsors(id) ON DELETE CASCADE,
  user_id uuid,
  email text NOT NULL,
  display_name text,
  role text NOT NULL DEFAULT 'member',
  invite_token text NOT NULL DEFAULT replace(gen_random_uuid()::text,'-',''),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sponsor_id, email)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sponsor_members TO authenticated;
GRANT ALL ON public.sponsor_members TO service_role;

ALTER TABLE public.sponsor_members ENABLE ROW LEVEL SECURITY;

-- Sponsor owner (creator) or platform admin can manage
CREATE POLICY "Sponsor owners manage members"
ON public.sponsor_members
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.sponsors s
    WHERE s.id = sponsor_members.sponsor_id
      AND (s.user_id = auth.uid() OR has_role(auth.uid(),'admin'))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.sponsors s
    WHERE s.id = sponsor_members.sponsor_id
      AND (s.user_id = auth.uid() OR has_role(auth.uid(),'admin'))
  )
);

-- A sponsor member can read their own row (needed for portal gating)
CREATE POLICY "Sponsor members read own membership"
ON public.sponsor_members
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE INDEX idx_sponsor_members_user ON public.sponsor_members(user_id);
CREATE INDEX idx_sponsor_members_sponsor ON public.sponsor_members(sponsor_id);

CREATE TRIGGER trg_sponsor_members_updated
BEFORE UPDATE ON public.sponsor_members
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Helper: is the calling user a sponsor member?
CREATE OR REPLACE FUNCTION public.is_sponsor_member(_user_id uuid, _sponsor_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sponsor_members
    WHERE sponsor_id = _sponsor_id AND user_id = _user_id AND accepted_at IS NOT NULL
  );
$$;

-- 3) Sponsor portal: events the caller can see
CREATE OR REPLACE FUNCTION public.sponsor_portal_events()
RETURNS TABLE(
  event_id uuid,
  event_title text,
  event_date timestamptz,
  end_date timestamptz,
  location text,
  sponsor_id uuid,
  sponsor_name text,
  tier text,
  registrations_count bigint,
  checked_in_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.id,
    e.title,
    e.date,
    e.end_date,
    e.location,
    s.id,
    s.name,
    COALESCE(es.tier_override, s.tier),
    (SELECT count(*) FROM public.registrations r WHERE r.event_id = e.id AND r.approval_status = 'approved'),
    (SELECT count(*) FROM public.registrations r WHERE r.event_id = e.id AND r.checked_in = true)
  FROM public.sponsor_members sm
  JOIN public.sponsors s ON s.id = sm.sponsor_id
  JOIN public.event_sponsors es ON es.sponsor_id = s.id
  JOIN public.events e ON e.id = es.event_id
  WHERE sm.user_id = auth.uid()
    AND sm.accepted_at IS NOT NULL
  ORDER BY e.date DESC NULLS LAST;
$$;

-- 4) Sponsor portal: people for one event (no email/mobile)
CREATE OR REPLACE FUNCTION public.sponsor_portal_people(_event_id uuid)
RETURNS TABLE(
  kind text,
  id uuid,
  name text,
  company text,
  ticket_type text,
  checked_in boolean,
  checked_in_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH allowed AS (
    SELECT 1
    FROM public.sponsor_members sm
    JOIN public.event_sponsors es ON es.sponsor_id = sm.sponsor_id
    WHERE sm.user_id = auth.uid()
      AND sm.accepted_at IS NOT NULL
      AND es.event_id = _event_id
    LIMIT 1
  )
  SELECT 'speaker'::text, sp.id, sp.name, sp.company, 'speaker'::text,
         COALESCE(r.checked_in, false), r.checked_in_at
  FROM public.event_speakers esp
  JOIN public.speakers sp ON sp.id = esp.speaker_id
  LEFT JOIN public.registrations r
    ON r.event_id = _event_id
   AND r.ticket_type = 'speaker'
   AND lower(r.email) = lower(COALESCE(sp.email,''))
  WHERE esp.event_id = _event_id
    AND EXISTS (SELECT 1 FROM allowed)
  UNION ALL
  SELECT 'attendee'::text, r.id, r.name, r.company, r.ticket_type,
         r.checked_in, r.checked_in_at
  FROM public.registrations r
  WHERE r.event_id = _event_id
    AND r.approval_status = 'approved'
    AND r.ticket_type <> 'speaker'
    AND EXISTS (SELECT 1 FROM allowed);
$$;

GRANT EXECUTE ON FUNCTION public.is_sponsor_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sponsor_portal_events() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sponsor_portal_people(uuid) TO authenticated;

-- 5) Extend self_check_in to accept synthetic speaker:/sponsor_contact: tokens
CREATE OR REPLACE FUNCTION public.self_check_in(p_token text, p_event_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(status text, id uuid, event_id uuid, name text, email text, ticket_type text, checked_in_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r public.registrations%ROWTYPE;
  ev public.events%ROWTYPE;
  was_already boolean;
  effective_end timestamp with time zone;
  _kind text;
  _ref uuid;
  _name text;
  _email text;
  _company text;
  _ticket text;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) = 0 THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  -- Synthetic tokens: speaker:<uuid> or sponsor_contact:<uuid>
  IF p_token LIKE 'speaker:%' OR p_token LIKE 'sponsor_contact:%' THEN
    IF p_event_id IS NULL THEN
      RETURN QUERY SELECT 'wrong_event'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::timestamptz;
      RETURN;
    END IF;
    _kind := split_part(p_token, ':', 1);
    BEGIN
      _ref := split_part(p_token, ':', 2)::uuid;
    EXCEPTION WHEN others THEN
      RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::timestamptz;
      RETURN;
    END;

    IF _kind = 'speaker' THEN
      SELECT sp.name, sp.email, sp.company, 'speaker'
        INTO _name, _email, _company, _ticket
      FROM public.speakers sp
      JOIN public.event_speakers es ON es.speaker_id = sp.id AND es.event_id = p_event_id
      WHERE sp.id = _ref;
    ELSE
      SELECT sm.display_name, sm.email, sp.name, 'sponsor'
        INTO _name, _email, _company, _ticket
      FROM public.sponsor_members sm
      JOIN public.sponsors sp ON sp.id = sm.sponsor_id
      JOIN public.event_sponsors es ON es.sponsor_id = sp.id AND es.event_id = p_event_id
      WHERE sm.id = _ref;
    END IF;

    IF _name IS NULL THEN
      RETURN QUERY SELECT 'not_found'::text, NULL::uuid, p_event_id, NULL::text, NULL::text, NULL::text, NULL::timestamptz;
      RETURN;
    END IF;

    -- Find existing registration row for this person, or create one
    SELECT * INTO r
    FROM public.registrations
    WHERE event_id = p_event_id
      AND ticket_type = _ticket
      AND lower(email) = lower(COALESCE(_email,''))
    LIMIT 1;

    IF NOT FOUND THEN
      INSERT INTO public.registrations(event_id, name, email, company, ticket_type, status, approval_status, checked_in, checked_in_at, checked_in_method)
      VALUES (p_event_id, _name, COALESCE(_email, _name || '@no-email.local'), _company, _ticket, 'confirmed', 'approved', true, now(), 'self')
      RETURNING * INTO r;
      RETURN QUERY SELECT 'ok'::text, r.id, r.event_id, r.name, r.email, r.ticket_type, r.checked_in_at;
      RETURN;
    END IF;
  ELSE
    SELECT * INTO r FROM public.registrations
     WHERE qr_code = p_token OR join_token = p_token OR id::text = p_token
     LIMIT 1;

    IF NOT FOUND THEN
      RETURN QUERY SELECT 'not_found'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::timestamptz;
      RETURN;
    END IF;
  END IF;

  IF p_event_id IS NOT NULL AND r.event_id <> p_event_id THEN
    RETURN QUERY SELECT 'wrong_event'::text, r.id, r.event_id, r.name, r.email, r.ticket_type, r.checked_in_at;
    RETURN;
  END IF;

  SELECT * INTO ev FROM public.events WHERE id = r.event_id;
  IF FOUND THEN
    effective_end := COALESCE(ev.end_date, ev.date);
    IF effective_end IS NOT NULL AND effective_end < (now() - interval '1 day') THEN
      RETURN QUERY SELECT 'expired'::text, r.id, r.event_id, r.name, r.email, r.ticket_type, r.checked_in_at;
      RETURN;
    END IF;
  END IF;

  IF r.status = 'cancelled' THEN
    RETURN QUERY SELECT 'cancelled'::text, r.id, r.event_id, r.name, r.email, r.ticket_type, r.checked_in_at;
    RETURN;
  END IF;

  was_already := COALESCE(r.checked_in, false);

  IF NOT was_already THEN
    UPDATE public.registrations
       SET checked_in = true,
           checked_in_at = now(),
           checked_in_method = 'self'
     WHERE id = r.id
    RETURNING * INTO r;
  END IF;

  RETURN QUERY SELECT
    CASE WHEN was_already THEN 'already' ELSE 'ok' END,
    r.id, r.event_id, r.name, r.email, r.ticket_type, r.checked_in_at;
END;
$function$;
