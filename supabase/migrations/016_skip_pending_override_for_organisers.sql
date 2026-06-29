-- ═══════════════════════════════════════════════════════════════════════════
-- 016_skip_pending_override_for_organisers.sql
--
-- Problem
-- ───────
-- The `registrations_validate` BEFORE-INSERT trigger forces
-- `approval_status := 'pending'` whenever the parent event has
-- `requires_approval = true`. That's correct for self-serve attendee
-- sign-ups (organiser must approve them) but WRONG for participants
-- the organiser adds themselves via the Add Participant dialog or CSV
-- import — those should land pre-approved with no manual step.
--
-- Fix
-- ───
-- Skip the pending override when the inserting user is an organiser
-- (event owner, super admin, or org member). Self-serve attendees still
-- get flipped to 'pending' as before.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.registrations_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public','extensions'
AS $$
DECLARE
  _ra            boolean;
  _p             numeric;
  _org_id        uuid;
  _is_organiser  boolean;
BEGIN
  SELECT requires_approval, COALESCE(price, 0), org_id
    INTO _ra, _p, _org_id
  FROM events
  WHERE id = NEW.event_id;

  -- Is the actor an organiser? Event owner, super admin, or org member.
  _is_organiser := EXISTS (
    SELECT 1 FROM events e
    WHERE e.id = NEW.event_id
      AND (
        e.user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
        OR (e.org_id IS NOT NULL AND public.is_org_member(auth.uid(), e.org_id))
      )
  );

  -- Paid events: every registration is implicitly approved (payment IS the gate).
  IF _p > 0 THEN
    NEW.approval_status := 'approved';
  -- Free events that require approval: only force pending for self-serve
  -- registrants (NOT organisers adding people manually).
  ELSIF _ra AND TG_OP = 'INSERT' AND NOT _is_organiser THEN
    NEW.approval_status := 'pending';
  END IF;

  IF NEW.approval_status NOT IN ('pending', 'approved', 'waitlisted', 'declined') THEN
    RAISE EXCEPTION 'Invalid approval_status';
  END IF;

  IF NEW.qr_code IS NULL THEN
    NEW.qr_code := substring(
      replace(gen_random_uuid()::text, '-', '') ||
      replace(gen_random_uuid()::text, '-', '')
      FROM 1 FOR 24
    );
  END IF;

  RETURN NEW;
END;
$$;
