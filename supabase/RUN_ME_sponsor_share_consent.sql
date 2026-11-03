-- ═══════════════════════════════════════════════════════════════════════════════
-- Sponsors get contact details only from people who agreed (QA audit F-10).
--
--   • Registering asks a separate, optional question: share my email, mobile
--     and LinkedIn with the event's sponsors. The answer, when it was given and
--     which wording was shown are kept on the registration. Only the registrant
--     (or the guest-registration server, on their behalf) can say yes; an
--     organiser adding, importing or editing a registration cannot. Saying no
--     later is always allowed (set_my_sponsor_share_consent).
--   • A share still lists everyone eligible, with name, company, role and
--     attendance, but carries contact details only for people who agreed.
--     Listed speakers who never registered had no way to agree, so a share
--     carries no contact details for them.
--   • Copies are kept only as long as they are in use. A revoked share's rows
--     and the rows of a version replaced by a newer one are deleted (the share
--     record, its counts and the audit log stay). Deleting a registration or a
--     speaker deletes their rows from every share, and withdrawing agreement
--     removes their contact details from shares already made.
--
-- Run after the sponsor-sharing migrations (069–075).
-- Safe to run more than once. Paste into the SQL Editor and Run.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. The registrant's answer ───────────────────────────────────────────────

ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS sponsor_share_consent    boolean NOT NULL DEFAULT false;
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS sponsor_share_consent_at timestamptz;
-- Which wording of the question was answered (the app's SPONSOR_SHARE_NOTICE).
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS sponsor_share_notice     text;

/*
 * Agreement is the registrant's own: kept only when it comes from the
 * registrant signed in as themselves, or from the server (guest registration,
 * where no one is signed in). Withdrawing it is always allowed.
 */
CREATE OR REPLACE FUNCTION public.registrations_sponsor_consent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.sponsor_share_consent IS NOT TRUE THEN
    NEW.sponsor_share_consent := false;
    NEW.sponsor_share_consent_at := NULL;
    NEW.sponsor_share_notice := NULL;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.sponsor_share_consent THEN
    -- Still agreed: keep when, and to which wording.
    NEW.sponsor_share_consent_at := OLD.sponsor_share_consent_at;
    NEW.sponsor_share_notice := OLD.sponsor_share_notice;
    RETURN NEW;
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM NEW.user_id THEN
    NEW.sponsor_share_consent := false;
    NEW.sponsor_share_consent_at := NULL;
    NEW.sponsor_share_notice := NULL;
  ELSE
    NEW.sponsor_share_consent_at := now();
    NEW.sponsor_share_notice := left(NULLIF(btrim(NEW.sponsor_share_notice), ''), 32);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.registrations_sponsor_consent() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS registrations_sponsor_consent ON public.registrations;
CREATE TRIGGER registrations_sponsor_consent
  BEFORE INSERT OR UPDATE OF sponsor_share_consent, sponsor_share_notice ON public.registrations
  FOR EACH ROW EXECUTE FUNCTION public.registrations_sponsor_consent();

-- The registrant changes their answer for one of their own registrations.
CREATE OR REPLACE FUNCTION public.set_my_sponsor_share_consent(_registration uuid, _consent boolean, _notice text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _now boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first' USING ERRCODE = '42501'; END IF;
  UPDATE registrations SET sponsor_share_consent = COALESCE(_consent, false), sponsor_share_notice = _notice
   WHERE id = _registration AND user_id = auth.uid()
  RETURNING sponsor_share_consent INTO _now;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registration not found' USING ERRCODE = 'P0002'; END IF;
  RETURN _now;
END;
$$;
REVOKE ALL ON FUNCTION public.set_my_sponsor_share_consent(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_sponsor_share_consent(uuid, boolean, text) TO authenticated;

-- ── 2. What a share carries ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._sponsor_share_contact_keys()
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT ARRAY['email', 'mobile', 'mobile_country_code', 'mobile_number', 'linkedin_url'];
$$;

/*
 * Everyone a share holds: speakers and attendees from registrations (contact
 * details only if they agreed), then the event's listed speakers who never
 * registered (no contact details: they were never asked).
 */
CREATE OR REPLACE FUNCTION public._sponsor_share_people(_event uuid, _ended boolean)
RETURNS TABLE (person_id uuid, data jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id,
         CASE WHEN r.sponsor_share_consent THEN public._sponsor_share_row(r, _ended)
              ELSE public._sponsor_share_row(r, _ended) - public._sponsor_share_contact_keys() END
    FROM public._sponsor_share_eligible(_event) r
  UNION ALL
  SELECT sp.id, jsonb_strip_nulls(jsonb_build_object(
    'participant_type', 'Speaker',
    'full_name', COALESCE(NULLIF(btrim(COALESCE(sp.first_name, '') || ' ' || COALESCE(sp.last_name, '')), ''), sp.name),
    'title', NULLIF(NULLIF(btrim(sp.title), ''), 'Prefer not to say'),
    'first_name', NULLIF(btrim(sp.first_name), ''),
    'last_name', NULLIF(btrim(sp.last_name), ''),
    'designation', NULLIF(btrim(sp.designation), ''),
    'company', NULLIF(btrim(sp.company), ''),
    'company_website', NULLIF(btrim(sp.company_website), ''),
    'company_employee_count', NULLIF(btrim(sp.company_employee_count), ''),
    'industry', NULLIF(btrim(sp.industry), ''),
    'attendance', CASE WHEN _ended THEN 'Did not attend' ELSE 'Not yet' END))
    FROM event_speakers es JOIN speakers sp ON sp.id = es.speaker_id
   WHERE es.event_id = _event
     AND NOT EXISTS (SELECT 1 FROM public._sponsor_share_eligible(_event) r
                      WHERE NULLIF(btrim(sp.email), '') IS NOT NULL AND lower(r.email) = lower(btrim(sp.email)))
     AND COALESCE(lower(btrim(sp.email)), '') NOT IN (SELECT public._event_sponsor_emails(_event));
$$;
REVOKE ALL ON FUNCTION public._sponsor_share_people(uuid, boolean) FROM PUBLIC, anon, authenticated;

-- Of the people a share holds, those who haven't agreed to share contact details.
CREATE OR REPLACE FUNCTION public._sponsor_share_without_permission(_event uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*) FROM public._sponsor_share_people(_event, false) p
   WHERE NOT EXISTS (SELECT 1 FROM registrations r WHERE r.id = p.person_id AND r.sponsor_share_consent);
$$;
REVOKE ALL ON FUNCTION public._sponsor_share_without_permission(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.organizer_sponsor_share_preview(_event_sponsor uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  l  event_sponsors%ROWTYPE;
  e  events%ROWTYPE;
BEGIN
  SELECT * INTO l FROM event_sponsors WHERE id = _event_sponsor;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sponsorship not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public._require_share_access(l.event_id);
  SELECT * INTO e FROM events WHERE id = l.event_id;
  RETURN (
    WITH c AS (SELECT p.data ? 'email' AS em, p.data ? 'mobile' AS mo, p.data ->> 'participant_type' = 'Speaker' AS sp
                 FROM public._sponsor_share_people(l.event_id, public._event_has_ended(l.event_id)) p)
    SELECT jsonb_build_object(
      'event', jsonb_build_object('id', e.id, 'title', e.title, 'date', e.date, 'end_date', e.end_date, 'ended', public._event_has_ended(e.id)),
      'sponsor', (SELECT jsonb_build_object('id', s.id, 'name', COALESCE(co.name, s.name), 'title', l.tier, 'title_label', l.tier_label)
                    FROM sponsors s LEFT JOIN companies co ON co.id = public._canonical_company(s.company_id) WHERE s.id = l.sponsor_id),
      'eligible', (SELECT count(*) FROM c),
      'speakers', (SELECT count(*) FROM c WHERE sp),
      'attendees', (SELECT count(*) FROM c WHERE NOT sp),
      'with_email', (SELECT count(*) FROM c WHERE em),
      'with_mobile', (SELECT count(*) FROM c WHERE mo),
      'with_both', (SELECT count(*) FROM c WHERE em AND mo),
      'without_contact', (SELECT count(*) FROM c WHERE NOT em AND NOT mo),
      'without_permission', public._sponsor_share_without_permission(l.event_id),
      'fields', public._sponsor_share_fields(),
      'not_collected', '["Department","Country","City","Location","Custom questions"]'::jsonb,
      'current', (SELECT to_jsonb(x) - 'fields' FROM sponsor_data_shares x WHERE x.event_sponsor_id = l.id ORDER BY x.version DESC LIMIT 1)
    )
  );
END;
$$;

-- ── 3. Sharing, with replaced versions' copies deleted ───────────────────────

CREATE OR REPLACE FUNCTION public.organizer_share_sponsor_data(_event_sponsor uuid, _share_before_end boolean DEFAULT false,
                                                               _allow_export boolean DEFAULT true, _include_without_permission boolean DEFAULT true)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  l       event_sponsors%ROWTYPE;
  _uid    uuid;
  _ended  boolean;
  _id     uuid := gen_random_uuid();
  _ver    integer;
  _title  text;
  _name   text;
BEGIN
  SELECT * INTO l FROM event_sponsors WHERE id = _event_sponsor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sponsorship not found' USING ERRCODE = 'P0002'; END IF;
  _uid := public._require_share_access(l.event_id);
  _ended := public._event_has_ended(l.event_id);
  IF NOT _ended AND NOT COALESCE(_share_before_end, false) THEN
    RAISE EXCEPTION 'This event hasn''t ended. Confirm that you mean to share before it ends.' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(max(version), 0) + 1 INTO _ver FROM sponsor_data_shares WHERE event_id = l.event_id AND sponsor_id = l.sponsor_id;
  -- The version being replaced: its record stays, its copy of people's details doesn't.
  DELETE FROM sponsor_data_share_rows
   WHERE share_id IN (SELECT id FROM sponsor_data_shares WHERE event_sponsor_id = l.id AND status = 'active');
  UPDATE sponsor_data_shares SET status = 'superseded' WHERE event_sponsor_id = l.id AND status = 'active';

  CREATE TEMP TABLE IF NOT EXISTS _share_people (person_id uuid, data jsonb) ON COMMIT DROP;
  -- Supabase refuses a DELETE without a WHERE clause, so it says which rows: all of them.
  DELETE FROM _share_people WHERE true;
  INSERT INTO _share_people SELECT * FROM public._sponsor_share_people(l.event_id, _ended);

  INSERT INTO sponsor_data_shares (id, event_sponsor_id, event_id, sponsor_id, company_id, version, allow_export, includes_without_permission,
                                   fields, record_count, with_email, with_mobile, with_both, without_contact, without_permission,
                                   shared_before_end, shared_by)
  SELECT _id, l.id, l.event_id, l.sponsor_id, (SELECT public._canonical_company(company_id) FROM sponsors WHERE id = l.sponsor_id), _ver,
         COALESCE(_allow_export, true), true, public._sponsor_share_fields(),
         count(*), count(*) FILTER (WHERE p.data ? 'email'), count(*) FILTER (WHERE p.data ? 'mobile'),
         count(*) FILTER (WHERE p.data ? 'email' AND p.data ? 'mobile'), count(*) FILTER (WHERE NOT p.data ? 'email' AND NOT p.data ? 'mobile'),
         count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM registrations r WHERE r.id = p.person_id AND r.sponsor_share_consent)),
         NOT _ended, _uid
    FROM _share_people p;
  INSERT INTO sponsor_data_share_rows (share_id, registration_id, data) SELECT _id, p.person_id, p.data FROM _share_people p;

  SELECT title INTO _title FROM events WHERE id = l.event_id;
  SELECT name INTO _name FROM sponsors WHERE id = l.sponsor_id;
  INSERT INTO app_notifications (user_id, type, title, body, link)
  SELECT DISTINCT m.user_id, 'sponsor_data_shared', 'Event data shared with you',
         COALESCE(_title, 'An event') || ': the participant list is ready to view.', '/sponsor/events/' || l.event_id || '#shared-data'
    FROM sponsor_members m
   WHERE m.sponsor_id = l.sponsor_id AND m.user_id IS NOT NULL AND m.accepted_at IS NOT NULL
     AND (m.role = 'admin' OR EXISTS (SELECT 1 FROM event_sponsor_contacts a WHERE a.event_sponsor_id = l.id AND a.member_id = m.id));

  INSERT INTO audit_logs (actor_id, action, target_type, target_id, details)
  VALUES (_uid, 'sponsor_data.shared', 'event_sponsor', l.id::text,
          jsonb_build_object('share_id', _id, 'version', _ver, 'event_id', l.event_id, 'sponsor', _name, 'before_end', NOT _ended,
                             'records', (SELECT record_count FROM sponsor_data_shares WHERE id = _id)));
  RETURN _id;
END;
$$;

-- Revoking a share deletes its copy of people's details; the record stays.
CREATE OR REPLACE FUNCTION public.organizer_revoke_sponsor_data(_share uuid, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  x    sponsor_data_shares%ROWTYPE;
  _uid uuid;
BEGIN
  SELECT * INTO x FROM sponsor_data_shares WHERE id = _share FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Share not found' USING ERRCODE = 'P0002'; END IF;
  _uid := public._require_share_access(x.event_id);
  DELETE FROM sponsor_data_share_rows WHERE share_id = _share;
  IF x.status = 'revoked' THEN RETURN; END IF;
  UPDATE sponsor_data_shares SET status = 'revoked', revoked_by = _uid, revoked_at = now(), revoke_reason = NULLIF(btrim(COALESCE(_reason, '')), '')
   WHERE id = _share;
  INSERT INTO audit_logs (actor_id, action, target_type, target_id, details)
  VALUES (_uid, 'sponsor_data.revoked', 'event_sponsor', x.event_sponsor_id::text,
          jsonb_build_object('share_id', x.id, 'version', x.version, 'event_id', x.event_id, 'reason', _reason));
END;
$$;

-- ── 4. Copies follow their source ────────────────────────────────────────────

-- A deleted registration or speaker leaves every share.
CREATE OR REPLACE FUNCTION public._sponsor_share_rows_forget()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM sponsor_data_share_rows WHERE registration_id = OLD.id;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public._sponsor_share_rows_forget() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS registrations_sponsor_share_forget ON public.registrations;
CREATE TRIGGER registrations_sponsor_share_forget AFTER DELETE ON public.registrations
  FOR EACH ROW EXECUTE FUNCTION public._sponsor_share_rows_forget();
DROP TRIGGER IF EXISTS speakers_sponsor_share_forget ON public.speakers;
CREATE TRIGGER speakers_sponsor_share_forget AFTER DELETE ON public.speakers
  FOR EACH ROW EXECUTE FUNCTION public._sponsor_share_rows_forget();

-- Withdrawing agreement takes the contact details out of shares already made.
CREATE OR REPLACE FUNCTION public._sponsor_share_rows_withdraw()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE sponsor_data_share_rows SET data = data - public._sponsor_share_contact_keys()
   WHERE registration_id = NEW.id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._sponsor_share_rows_withdraw() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS registrations_sponsor_share_withdraw ON public.registrations;
CREATE TRIGGER registrations_sponsor_share_withdraw AFTER UPDATE OF sponsor_share_consent ON public.registrations
  FOR EACH ROW WHEN (OLD.sponsor_share_consent AND NOT NEW.sponsor_share_consent)
  EXECUTE FUNCTION public._sponsor_share_rows_withdraw();

-- Copies already held by revoked or replaced shares.
DELETE FROM public.sponsor_data_share_rows
 WHERE share_id IN (SELECT id FROM public.sponsor_data_shares WHERE status IN ('revoked', 'superseded'));

NOTIFY pgrst, 'reload schema';

-- ── 5. Shares made before this, under notice only (decide before running) ────
--
-- Active shares made before now carry contact details for everyone, and no
-- one has agreed yet. Running this takes those details out of them: sponsors
-- keep names, companies and attendance, and organisers can share again once
-- people have answered. It changes what sponsors see at once, so it is left
-- for the privacy owner to run.
--
-- UPDATE public.sponsor_data_share_rows d
--    SET data = d.data - public._sponsor_share_contact_keys()
--  WHERE NOT EXISTS (SELECT 1 FROM public.registrations r WHERE r.id = d.registration_id AND r.sponsor_share_consent);
