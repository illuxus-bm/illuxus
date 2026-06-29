-- ─────────────────────────────────────────────────────────────────────────────
-- 019_organiser_added_one_email_and_dedupe.sql
--
-- Two changes to support a single "ticket email only" flow for organiser-
-- added participants, plus a DB-level guarantee against duplicate
-- registrations for the same event + email.
--
-- 1. Auto-claim orphan registrations when an auth user signs up
-- ─────────────────────────────────────────────────────────────
-- Organiser-added participants get a registrations row with `user_id = NULL`
-- and the participant's email. When the participant later creates their own
-- account (or signs in with an existing one for the first time), the
-- registration must link to their freshly-minted `auth.users.id` so the
-- attendee-side policy `Attendee view own` (USING user_id = auth.uid())
-- returns their ticket. Until this migration, the link only happened when
-- the participant happened to land on the event page (`EventRsvpCard` does
-- an email-match → update). Anyone clicking the "View your ticket" link in
-- the email saw an empty ticket page because RLS hid the orphan row.
--
-- We extend the existing `handle_new_user` signup trigger so the link
-- happens automatically right after profile creation. The trigger is
-- SECURITY DEFINER, so it can update registrations under any RLS state.
--
-- 2. Hard duplicate guard
-- ──────────────────────
-- Application-level dedupe in AddParticipantDialog and
-- ImportRegistrationsDialog has been in place since session-day, but it's a
-- TOCTOU window — two organisers adding the same email at the same time
-- can each pass the check and then both insert. After this migration the DB
-- rejects the second insert with a unique-violation, which the application
-- handlers already surface as "Already added or checked in".
--
-- The index excludes cancelled rows so a participant who cancels can
-- re-register without a unique-violation.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Extend handle_new_user with orphan claiming ──────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _m jsonb := COALESCE(NEW.raw_user_meta_data, '{}');
  _at text; _t text; _fn text; _ln text; _d text; _co text; _mc text;
  _mn text; _li text; _cw text; _ce text; _ind text; _dn text; _done boolean;
BEGIN
  _at := COALESCE(_m->>'account_type','attendee');
  IF _at NOT IN ('attendee','organizer') THEN _at := 'attendee'; END IF;

  _t  := NULLIF(trim(_m->>'title'),'');
  _fn := NULLIF(trim(_m->>'first_name'),'');
  _ln := NULLIF(trim(_m->>'last_name'),'');
  _d  := NULLIF(trim(_m->>'designation'),'');
  _co := NULLIF(trim(_m->>'company'),'');
  _mc := NULLIF(trim(_m->>'mobile_country_code'),'');
  _mn := NULLIF(trim(_m->>'mobile_number'),'');
  _li := NULLIF(trim(_m->>'linkedin_url'),'');
  _cw := NULLIF(trim(_m->>'company_website'),'');
  _ce := NULLIF(trim(_m->>'company_employee_count'),'');
  _ind:= NULLIF(trim(_m->>'industry'),'');

  _dn := NULLIF(trim(COALESCE(_fn,'') || ' ' || COALESCE(_ln,'')), '');
  IF _dn IS NULL THEN _dn := COALESCE(_m->>'display_name', NEW.email); END IF;

  _done := _fn IS NOT NULL AND _ln IS NOT NULL AND _d IS NOT NULL
       AND _co IS NOT NULL AND _mn IS NOT NULL;

  INSERT INTO profiles(
    user_id, display_name, account_type, title, first_name, last_name,
    designation, company, mobile_country_code, mobile_number,
    linkedin_url, company_website, company_employee_count, industry,
    profile_completed
  ) VALUES (
    NEW.id, _dn, _at, _t, _fn, _ln, _d, _co, _mc, _mn,
    _li, _cw, _ce, _ind, _done
  );

  -- Auto-confirm email for organiser-created accounts (kept for
  -- backwards compatibility with any legacy `must_change_password` flow).
  IF (_m->>'must_change_password')::boolean IS TRUE AND NEW.email_confirmed_at IS NULL THEN
    UPDATE auth.users SET email_confirmed_at = now() WHERE id = NEW.id;
  END IF;

  -- NEW: claim every registration that was created for this email before
  -- the participant had an account. RLS doesn't apply here because the
  -- function is SECURITY DEFINER. We only stamp rows where `user_id IS
  -- NULL` so an existing link (from a previous signup of the same email
  -- — should never happen, but defensive) is not clobbered.
  IF NEW.email IS NOT NULL THEN
    UPDATE public.registrations
       SET user_id = NEW.id
     WHERE user_id IS NULL
       AND lower(email) = lower(NEW.email);
  END IF;

  RETURN NEW;
END;
$$;

-- The trigger object itself is unchanged — `CREATE OR REPLACE FUNCTION`
-- updates the body in place. Re-creating the trigger is unnecessary.

COMMENT ON FUNCTION public.handle_new_user() IS
  'On auth.users INSERT: create profile row, auto-confirm legacy must_change_password accounts, and claim any orphan registrations whose email matches the new user.';


-- ── 2. Unique index for duplicate-registration guard ────────────────────────
-- Partial: cancelled rows are exempt so an attendee who cancels and
-- re-registers later doesn't trip the constraint.
CREATE UNIQUE INDEX IF NOT EXISTS registrations_event_email_unique
  ON public.registrations (event_id, lower(email))
  WHERE status <> 'cancelled';

COMMENT ON INDEX public.registrations_event_email_unique IS
  'Prevents the same email from registering twice for the same event (excluding cancelled rows).';
