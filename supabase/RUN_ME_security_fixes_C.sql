-- ═══════════════════════════════════════════════════════════════════════════════
-- Security fixes, backend review B — remaining items (2026-11-03).
--
--   C-1  Organisations' billing email, plan details and owner were public.
--   C-2  Online events' external join links (virtual_url) were public, and
--        published in the event page's search-engine data.
--   C-3  community_calendar / community_leaderboard ignored row security
--        (the calendar listed unpublished draft events to anyone).
--   C-4  Anyone could ask whether any user is an admin or banned.
--   C-5  No length limits on community posts, comments and registrations.
--   C-6  Storage: no size limits; anyone signed in could upload anywhere in
--        the community bucket.
--
-- Run after RUN_ME_security_fixes_B.sql (uses _can_manage_event).
-- One section per finding. Every statement is safe to run more than once.
-- Paste the whole file into the Supabase SQL Editor and Run.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────────
-- C-1 — Organisation details.
--
-- Anonymous visitors now read only the columns public pages use. Signed-in
-- users read everything except billing_email, which members read through
-- org_billing_email(). (The admin screens use admin_list_orgs, unchanged.)
--
-- Column-level grants: a column added to organizations later is NOT readable
-- by the app until it is granted here — re-run this section after adding one.
-- ───────────────────────────────────────────────────────────────────────────────

REVOKE SELECT ON public.organizations FROM anon, authenticated;

GRANT SELECT (id, name, slug, subdomain, custom_domain, custom_domain_verified, logo_url,
              landing_config, landing_published, webinar_branding_enabled, created_at, updated_at)
  ON public.organizations TO anon;

DO $$
DECLARE
  _cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO _cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'organizations'
     AND column_name <> 'billing_email';
  EXECUTE format('GRANT SELECT (%s) ON public.organizations TO authenticated', _cols);
END;
$$;

CREATE OR REPLACE FUNCTION public.org_billing_email(_org_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.billing_email FROM public.organizations o
   WHERE o.id = _org_id
     AND auth.uid() IS NOT NULL
     AND (o.owner_id = auth.uid()
          OR public.is_org_member(auth.uid(), o.id)
          OR public.has_role(auth.uid(), 'admin'));
$$;
REVOKE ALL ON FUNCTION public.org_billing_email(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_billing_email(uuid) TO authenticated;


-- ───────────────────────────────────────────────────────────────────────────────
-- C-2 — External join links.
--
-- events.virtual_url was readable by anyone and went into the public event
-- page's structured data. The link now lives in event_private_details, which
-- clients cannot read; a trigger moves anything written to events.virtual_url
-- there and leaves the column empty, so the event forms keep working
-- unchanged. Organisers, approved attendees and the event's speakers read it
-- with get_event_join_url(event_id).
-- ───────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.event_private_details (
  event_id    uuid PRIMARY KEY
              REFERENCES public.events(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  virtual_url text CHECK (virtual_url IS NULL OR char_length(virtual_url) <= 2000),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.event_private_details ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_private_details FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.event_private_details TO service_role;

CREATE OR REPLACE FUNCTION public.events_stash_virtual_url()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.virtual_url IS NOT NULL THEN
    INSERT INTO event_private_details (event_id, virtual_url)
    VALUES (NEW.id, NULLIF(btrim(NEW.virtual_url), ''))
    ON CONFLICT (event_id) DO UPDATE
      SET virtual_url = excluded.virtual_url, updated_at = now();
    NEW.virtual_url := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS events_stash_virtual_url ON public.events;
CREATE TRIGGER events_stash_virtual_url
  BEFORE INSERT OR UPDATE OF virtual_url ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.events_stash_virtual_url();

-- Move links already saved.
INSERT INTO public.event_private_details (event_id, virtual_url)
SELECT id, NULLIF(btrim(virtual_url), '') FROM public.events WHERE virtual_url IS NOT NULL
ON CONFLICT (event_id) DO UPDATE SET virtual_url = excluded.virtual_url, updated_at = now();
UPDATE public.events SET virtual_url = NULL WHERE virtual_url IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_event_join_url(_event_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT d.virtual_url FROM public.event_private_details d
   WHERE d.event_id = _event_id
     AND auth.uid() IS NOT NULL
     AND (public._can_manage_event(auth.uid(), _event_id)
          OR public.is_event_approved_attendee(auth.uid(), _event_id)
          OR public.is_event_speaker(auth.uid(), _event_id));
$$;
REVOKE ALL ON FUNCTION public.get_event_join_url(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_event_join_url(uuid) TO authenticated;


-- ───────────────────────────────────────────────────────────────────────────────
-- C-3 — Community views run with the reader's rights.
--
-- Both were owner-rights views, so they skipped row security: the calendar
-- listed every event a community is linked to, drafts included, and the
-- leaderboard listed members of private communities. They now return only
-- what the reader could read from the tables themselves. The leaderboard is
-- for signed-in members only.
-- ───────────────────────────────────────────────────────────────────────────────

ALTER VIEW public.community_calendar    SET (security_invoker = true);
ALTER VIEW public.community_leaderboard SET (security_invoker = true);
REVOKE SELECT ON public.community_leaderboard FROM anon;


-- ───────────────────────────────────────────────────────────────────────────────
-- C-4 — Role and ban lookups answer only about yourself.
--
-- has_role() and is_user_banned() are callable by anyone (row-security
-- policies need them), so anyone could ask "is this user an admin / banned?"
-- about any user id. They now answer truthfully when asked about the caller,
-- when the caller is a platform admin, and for server-side callers (service
-- role, SQL editor, cron); otherwise they return false. Policies always pass
-- auth.uid(), so access rules are unchanged.
-- ───────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._caller_may_look_up(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  -- Always true or false, never NULL: a NULL here would make has_role()
  -- NULL, and `IF NOT has_role(...)` checks would then let callers through.
  SELECT COALESCE(_user_id = auth.uid(), false)
      OR COALESCE(auth.jwt() ->> 'role', '') NOT IN ('anon', 'authenticated')
      OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin');
$$;
REVOKE ALL ON FUNCTION public._caller_may_look_up(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
     AND public._caller_may_look_up(_user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_user_banned(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _user_id AND banned_at IS NOT NULL)
     AND public._caller_may_look_up(_user_id);
$$;


-- ───────────────────────────────────────────────────────────────────────────────
-- C-5 — Length limits on user-written text.
--
-- Generous limits (well above anything the app's forms send) so one request
-- can't store megabytes. NOT VALID: rows already saved aren't checked; new
-- and edited rows are.
-- ───────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT * FROM (VALUES
      ('community_posts',    'community_posts_title_len',     'title',          300),
      ('community_posts',    'community_posts_body_len',      'body_md',        20000),
      ('community_posts',    'community_posts_link_len',      'link_url',       2000),
      ('community_comments', 'community_comments_body_len',   'body_md',        10000),
      ('registrations',      'registrations_name_len',        'name',           200),
      ('registrations',      'registrations_email_len',       'email',          320),
      ('registrations',      'registrations_title_len',       'title',          100),
      ('registrations',      'registrations_first_name_len',  'first_name',     200),
      ('registrations',      'registrations_last_name_len',   'last_name',      200),
      ('registrations',      'registrations_company_len',     'company',        300),
      ('registrations',      'registrations_designation_len', 'designation',    300),
      ('registrations',      'registrations_mobile_len',      'mobile_number',  40),
      ('registrations',      'registrations_linkedin_len',    'linkedin_url',   500),
      ('registrations',      'registrations_website_len',     'company_website',500),
      ('registrations',      'registrations_decline_len',     'decline_reason', 2000)
    ) AS t(tbl, con, col, max_len)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = c.con) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (%I IS NULL OR char_length(%I) <= %s) NOT VALID',
                     c.tbl, c.con, c.col, c.col, c.max_len);
    END IF;
  END LOOP;
END;
$$;


-- ───────────────────────────────────────────────────────────────────────────────
-- C-6 — Storage limits.
--
-- Size limits per bucket (the app's own limits: avatars 5 MB, brand files and
-- resources 25 MB). Avatars accept images only. site-assets and community also
-- take PDFs, design files and documents, so they get a size limit only.
-- Community uploads go to <community id>/…; only that community's members
-- (or its organisers) can upload there now.
-- ───────────────────────────────────────────────────────────────────────────────

UPDATE storage.buckets SET file_size_limit = 25 * 1024 * 1024 WHERE id IN ('site-assets', 'community');
UPDATE storage.buckets
   SET file_size_limit = 5 * 1024 * 1024,
       allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
 WHERE id = 'avatars';

DROP POLICY IF EXISTS "Members write community" ON storage.objects;
CREATE POLICY "Members write community" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'community'
    AND split_part(name, '/', 1) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND (public.is_community_member(auth.uid(), split_part(name, '/', 1)::uuid)
         OR public.can_moderate_community(auth.uid(), split_part(name, '/', 1)::uuid))
  );
