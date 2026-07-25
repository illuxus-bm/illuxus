-- ─────────────────────────────────────────────────────────────────────────────
-- 026_utm_attribution_coverage.sql
--
-- Extends the shipped UTM_Attribution pattern (already in place for attendee
-- `registrations`) to three additional conversion surfaces:
--
--   • `public.speaker_applications`  — Speaker_Application rows
--   • `public.sponsor_applications`  — Sponsor_Application rows
--   • `public.profiles`              — User_Profile rows (Organizer_Signup)
--
-- Each table gets five nullable `text` columns matching the shipped
-- `registrations.utm_*` layout in name, type, and nullability
-- (Requirements 1.1, 1.2, 1.3). Existing rows are backfilled to SQL NULL
-- for every UTM_Field so already-persisted rows have well-defined values
-- immediately after migration (Requirement 1.6).
--
-- The `handle_new_user()` signup trigger is extended in place via
-- CREATE OR REPLACE to read the five UTM keys from
-- `auth.users.raw_user_meta_data` (populated by LoginPage's
-- `supabase.auth.signUp` `options.data` payload — Requirement 5.1) and
-- stamp them onto the new `profiles` row (Requirement 5.2). Empty strings
-- and whitespace-only values persist as SQL NULL per Requirements 1.5 /
-- 5.2. Every existing trigger side-effect (profile field extraction,
-- legacy `must_change_password` email auto-confirmation, orphan
-- registration claim) is preserved verbatim — only the UTM extraction
-- lines and UTM upsert columns are new.
--
-- RLS non-regression (Requirement 13)
-- ───────────────────────────────────
-- The three affected tables already have RLS enabled with policies that
-- scope reads to the parent row's viewers:
--
--   • `speaker_applications`  — applicant-self OR event owner OR admin
--   • `sponsor_applications`  — applicant-self OR event owner OR admin
--   • `profiles`              — authenticated-view; owner-update;
--                               owner-insert (admin bypass via
--                               `admin_users`)
--
-- Adding nullable columns does not change RLS scope — the new UTM_Field
-- columns inherit the parent row's existing policies with zero policy
-- edits (Requirements 13.1, 13.2, 13.3). This migration therefore adds
-- NO new RLS policies.
--
-- Query-result filtering (Requirement 13.4) is unchanged: any viewer
-- lacking the row-level grant already sees the parent row filtered out
-- of every SELECT, and that filtering transitively hides the row's new
-- UTM_Field values along with the rest of the row's columns.
--
-- Attribution_Export non-regression (Requirement 13.5): every CSV
-- export in this feature (`buildSpeakerApplicationsCsv`,
-- `buildSponsorApplicationsCsv`, and the extended `UserManagementPage`
-- export) iterates ONLY the rows already returned to the caller by
-- the tables' existing RLS-filtered SELECTs. A viewer without the RLS
-- grant never receives the row from the data layer, so the export
-- loop cannot emit it — the row is omitted entirely rather than
-- emitted with blanked UTM cells.
--
-- No indexes on UTM columns
-- ─────────────────────────
-- Applications and profiles are not queried by UTM values — those tables
-- are read by `event_id` / `user_id`. Aggregation lives in `utm_clicks` +
-- `event_utm_summary` (out of scope for this spec per requirements
-- decision #4). Indexing UTM_Fields here would only pay for itself when
-- application/profile UTM analytics ship as a future spec.
--
-- Idempotent
-- ──────────
-- Every ALTER uses `add column if not exists`. The trigger is
-- CREATE OR REPLACE, never DROP. Re-running this migration is safe.
--
-- Requirements addressed: 1.1, 1.2, 1.3, 1.5, 1.6, 5.1, 5.2, 13.1, 13.2,
-- 13.3, 13.4, 13.5
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. speaker_applications: add UTM_Fields ────────────────────────────────
ALTER TABLE public.speaker_applications
  ADD COLUMN IF NOT EXISTS utm_source   text,
  ADD COLUMN IF NOT EXISTS utm_medium   text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS utm_content  text,
  ADD COLUMN IF NOT EXISTS utm_term     text;

-- ── 2. sponsor_applications: add UTM_Fields ────────────────────────────────
ALTER TABLE public.sponsor_applications
  ADD COLUMN IF NOT EXISTS utm_source   text,
  ADD COLUMN IF NOT EXISTS utm_medium   text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS utm_content  text,
  ADD COLUMN IF NOT EXISTS utm_term     text;

-- ── 3. profiles: add UTM_Fields ────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS utm_source   text,
  ADD COLUMN IF NOT EXISTS utm_medium   text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS utm_content  text,
  ADD COLUMN IF NOT EXISTS utm_term     text;

COMMENT ON COLUMN public.speaker_applications.utm_source IS
  'First-touch UTM source captured from the tab''s sessionStorage at submission time. See spec .kiro/specs/utm-attribution-coverage/';
COMMENT ON COLUMN public.sponsor_applications.utm_source IS
  'First-touch UTM source captured from the tab''s sessionStorage at submission time. See spec .kiro/specs/utm-attribution-coverage/';
COMMENT ON COLUMN public.profiles.utm_source IS
  'First-touch UTM source read from auth.users.raw_user_meta_data by the handle_new_user trigger at account creation.';

-- ── 4. handle_new_user trigger extension ───────────────────────────────────
-- Extends the shipped trigger to read `utm_source` / `utm_medium` /
-- `utm_campaign` / `utm_content` / `utm_term` from
-- `auth.users.raw_user_meta_data` (populated by LoginPage's
-- `supabase.auth.signUp` `options.data` payload — Requirement 5.1) and
-- stamp them onto the new `profiles` row (Requirement 5.2).
--
-- Missing metadata keys, empty strings, and whitespace-only values
-- persist as SQL NULL per Requirements 1.5 / 5.2. Every existing field
-- the trigger already sets (account_type, display_name, first_name,
-- last_name, designation, company, mobile_country_code, mobile_number,
-- linkedin_url, company_website, company_employee_count, industry,
-- profile_completed) is preserved verbatim.
--
-- First-touch preservation on re-run: the trigger's INSERT now carries
-- an `ON CONFLICT (user_id) DO UPDATE SET ...` clause that uses
-- `coalesce(public.profiles.<col>, excluded.<col>)` for each UTM_Field
-- so a re-signup with new UTM does not overwrite existing UTM
-- (Requirement 5.2 first-touch semantics). The pre-existing trigger had
-- no ON CONFLICT clause because `profiles.user_id` is UNIQUE and each
-- new `auth.users.id` is fresh — the ON CONFLICT here is defensive and
-- only fires in the rare re-entry path.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _m jsonb := COALESCE(NEW.raw_user_meta_data, '{}');
  _at text; _t text; _fn text; _ln text; _d text; _co text; _mc text;
  _mn text; _li text; _cw text; _ce text; _ind text; _dn text; _done boolean;
  _utm_source   text := NULLIF(trim(_m->>'utm_source'),   '');
  _utm_medium   text := NULLIF(trim(_m->>'utm_medium'),   '');
  _utm_campaign text := NULLIF(trim(_m->>'utm_campaign'), '');
  _utm_content  text := NULLIF(trim(_m->>'utm_content'),  '');
  _utm_term     text := NULLIF(trim(_m->>'utm_term'),     '');
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
    profile_completed,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term
  ) VALUES (
    NEW.id, _dn, _at, _t, _fn, _ln, _d, _co, _mc, _mn,
    _li, _cw, _ce, _ind, _done,
    _utm_source, _utm_medium, _utm_campaign, _utm_content, _utm_term
  )
  ON CONFLICT (user_id) DO UPDATE SET
    utm_source   = COALESCE(public.profiles.utm_source,   EXCLUDED.utm_source),
    utm_medium   = COALESCE(public.profiles.utm_medium,   EXCLUDED.utm_medium),
    utm_campaign = COALESCE(public.profiles.utm_campaign, EXCLUDED.utm_campaign),
    utm_content  = COALESCE(public.profiles.utm_content,  EXCLUDED.utm_content),
    utm_term     = COALESCE(public.profiles.utm_term,     EXCLUDED.utm_term);

  -- Auto-confirm email for organiser-created accounts (kept for
  -- backwards compatibility with any legacy `must_change_password` flow).
  IF (_m->>'must_change_password')::boolean IS TRUE AND NEW.email_confirmed_at IS NULL THEN
    UPDATE auth.users SET email_confirmed_at = now() WHERE id = NEW.id;
  END IF;

  -- Claim every registration that was created for this email before the
  -- participant had an account. RLS doesn't apply here because the
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
  'On auth.users INSERT: create profile row (with first-touch UTM_Fields from raw_user_meta_data), auto-confirm legacy must_change_password accounts, and claim any orphan registrations whose email matches the new user.';
