-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 001: let event organizers edit linked speakers / sponsor members.
--
-- Apply this file in the Supabase SQL editor (or via `supabase db push`).
-- It is idempotent — re-running drops and recreates the policies and
-- functions cleanly.
--
-- Why:
--   The QuickView panel on the Registrations page lets an event organizer edit
--   the contact details (mobile, designation, company, LinkedIn, etc.) of any
--   attendee, speaker, or sponsor for their event.
--   - `registrations` already has an "Owner update regs" policy, so attendee
--     edits save fine.
--   - `speakers` only had a "Creators manage speakers" policy
--     (auth.uid = speakers.user_id), so the event organizer could NEVER
--     update a speaker row.
--   - `sponsor_members` had the same restriction.
--
-- This migration:
--   1. Adds additive RLS policies so the event organizer (events.user_id =
--      auth.uid) can read/update speakers and sponsor_members linked to one
--      of their events.
--   2. Adds SECURITY DEFINER RPC fallbacks the client can call when an
--      organizer is editing through a role (org member, future team roles)
--      where the direct RLS path can't see them. The RPC re-validates that
--      the caller owns the event and then updates the row with elevated
--      privileges.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Speakers: RLS policy for event organizers ─────────────────────────────────

DROP POLICY IF EXISTS "Event owner update linked speakers" ON public.speakers;
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

-- ── Sponsor members: RLS policies for event organizers ────────────────────────

DROP POLICY IF EXISTS "Event owner view linked sponsor_members" ON public.sponsor_members;
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

DROP POLICY IF EXISTS "Event owner update linked sponsor_members" ON public.sponsor_members;
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

-- ── Helper used by the RPCs ───────────────────────────────────────────────────
-- Returns true if the calling user owns the event or is an admin.
-- SECURITY DEFINER so it can read events even when the caller's own SELECT
-- policy on events would have hidden the row.

CREATE OR REPLACE FUNCTION public._is_event_organizer(_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = _event_id
      AND (e.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  );
$$;

REVOKE ALL ON FUNCTION public._is_event_organizer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._is_event_organizer(uuid) TO authenticated;

-- ── SECURITY DEFINER RPC: update a speaker for an organizer ───────────────────
-- Accepts a jsonb payload of column → value. Only columns in the whitelist are
-- considered. Any key the payload contains overrides that column; keys NOT
-- present are left untouched. Explicit `null` values are written as null.

CREATE OR REPLACE FUNCTION public.organizer_update_speaker(
  _event_id uuid,
  _speaker_id uuid,
  _payload jsonb
)
RETURNS public.speakers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result public.speakers;
BEGIN
  IF NOT public._is_event_organizer(_event_id) THEN
    RAISE EXCEPTION 'Not authorized to edit speakers for this event'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.event_speakers
    WHERE event_id = _event_id AND speaker_id = _speaker_id
  ) THEN
    RAISE EXCEPTION 'Speaker is not linked to this event'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  UPDATE public.speakers SET
    title                  = CASE WHEN _payload ? 'title'                  THEN _payload->>'title'                  ELSE title                  END,
    first_name             = CASE WHEN _payload ? 'first_name'             THEN _payload->>'first_name'             ELSE first_name             END,
    last_name              = CASE WHEN _payload ? 'last_name'              THEN _payload->>'last_name'              ELSE last_name              END,
    name                   = CASE WHEN _payload ? 'name'                   THEN _payload->>'name'                   ELSE name                   END,
    email                  = CASE WHEN _payload ? 'email'                  THEN _payload->>'email'                  ELSE email                  END,
    designation            = CASE WHEN _payload ? 'designation'            THEN _payload->>'designation'            ELSE designation            END,
    company                = CASE WHEN _payload ? 'company'                THEN _payload->>'company'                ELSE company                END,
    mobile_country_code    = CASE WHEN _payload ? 'mobile_country_code'    THEN _payload->>'mobile_country_code'    ELSE mobile_country_code    END,
    mobile_number          = CASE WHEN _payload ? 'mobile_number'          THEN _payload->>'mobile_number'          ELSE mobile_number          END,
    linkedin_url           = CASE WHEN _payload ? 'linkedin_url'           THEN _payload->>'linkedin_url'           ELSE linkedin_url           END,
    company_website        = CASE WHEN _payload ? 'company_website'        THEN _payload->>'company_website'        ELSE company_website        END,
    company_employee_count = CASE WHEN _payload ? 'company_employee_count' THEN _payload->>'company_employee_count' ELSE company_employee_count END,
    industry               = CASE WHEN _payload ? 'industry'               THEN _payload->>'industry'               ELSE industry               END
  WHERE id = _speaker_id
  RETURNING * INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.organizer_update_speaker(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.organizer_update_speaker(uuid, uuid, jsonb) TO authenticated;

-- ── SECURITY DEFINER RPC: update a sponsor member for an organizer ────────────

CREATE OR REPLACE FUNCTION public.organizer_update_sponsor_member(
  _event_id uuid,
  _member_id uuid,
  _payload jsonb
)
RETURNS public.sponsor_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result public.sponsor_members;
  v_sponsor_id uuid;
BEGIN
  IF NOT public._is_event_organizer(_event_id) THEN
    RAISE EXCEPTION 'Not authorized to edit sponsor members for this event'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT sponsor_id INTO v_sponsor_id
  FROM public.sponsor_members WHERE id = _member_id;

  IF v_sponsor_id IS NULL THEN
    RAISE EXCEPTION 'Sponsor member not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.event_sponsors
    WHERE event_id = _event_id AND sponsor_id = v_sponsor_id
  ) THEN
    RAISE EXCEPTION 'Sponsor is not linked to this event'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  UPDATE public.sponsor_members SET
    title                  = CASE WHEN _payload ? 'title'                  THEN _payload->>'title'                  ELSE title                  END,
    first_name             = CASE WHEN _payload ? 'first_name'             THEN _payload->>'first_name'             ELSE first_name             END,
    last_name              = CASE WHEN _payload ? 'last_name'              THEN _payload->>'last_name'              ELSE last_name              END,
    display_name           = CASE WHEN _payload ? 'display_name'           THEN _payload->>'display_name'           ELSE display_name           END,
    email                  = CASE WHEN _payload ? 'email'                  THEN _payload->>'email'                  ELSE email                  END,
    designation            = CASE WHEN _payload ? 'designation'            THEN _payload->>'designation'            ELSE designation            END,
    company                = CASE WHEN _payload ? 'company'                THEN _payload->>'company'                ELSE company                END,
    mobile_country_code    = CASE WHEN _payload ? 'mobile_country_code'    THEN _payload->>'mobile_country_code'    ELSE mobile_country_code    END,
    mobile_number          = CASE WHEN _payload ? 'mobile_number'          THEN _payload->>'mobile_number'          ELSE mobile_number          END,
    linkedin_url           = CASE WHEN _payload ? 'linkedin_url'           THEN _payload->>'linkedin_url'           ELSE linkedin_url           END,
    company_website        = CASE WHEN _payload ? 'company_website'        THEN _payload->>'company_website'        ELSE company_website        END,
    company_employee_count = CASE WHEN _payload ? 'company_employee_count' THEN _payload->>'company_employee_count' ELSE company_employee_count END,
    industry               = CASE WHEN _payload ? 'industry'               THEN _payload->>'industry'               ELSE industry               END
  WHERE id = _member_id
  RETURNING * INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.organizer_update_sponsor_member(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.organizer_update_sponsor_member(uuid, uuid, jsonb) TO authenticated;
