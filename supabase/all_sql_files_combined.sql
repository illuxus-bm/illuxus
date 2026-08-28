-- ============================================================================
-- Combined Supabase SQL Files
-- ============================================================================
-- This file combines all Supabase SQL files from the project.
-- Includes:
--   - Fix scripts
--   - Migrations (000-029)
--   - Combined schema with comments and documentation
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1: FIX SCRIPTS
-- ─────────────────────────────────────────────────────────────────────────────

-- fix_missing_members.sql
DO $$
DECLARE
  _reg RECORD;
BEGIN
  FOR _reg IN 
    SELECT r.event_id, r.user_id 
    FROM registrations r
    JOIN communities c ON c.event_id = r.event_id
    WHERE r.approval_status = 'approved' 
      AND r.user_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM community_members cm 
        WHERE cm.community_id = c.id AND cm.user_id = r.user_id
      )
  LOOP
    PERFORM _auto_join_event_community(_reg.event_id, _reg.user_id, 'member');
  END LOOP;
END;
$$;

-- fix_communities.sql
CREATE OR REPLACE FUNCTION public.ensure_event_community(_event_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _existing uuid;
  _evt RECORD;
  _parent_id uuid;
  _new_id uuid;
  _slug text;
  _base_slug text;
  _i int := 0;
BEGIN
  SELECT id INTO _existing FROM communities WHERE event_id = _event_id LIMIT 1;
  IF _existing IS NOT NULL THEN RETURN _existing; END IF;

  SELECT e.id, e.title, e.slug, e.org_id, e.user_id,
         COALESCE(e.community_category, 'other')::text AS category_text
    INTO _evt
  FROM events e WHERE e.id = _event_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  _parent_id := ensure_parent_community(_map_event_category_to_community(_evt.category_text));

  _base_slug := community_slugify(_evt.slug || '-community');
  IF _base_slug IS NULL OR _base_slug = '' THEN _base_slug := 'event-' || _evt.id::text; END IF;
  _slug := _base_slug;
  WHILE EXISTS (SELECT 1 FROM communities WHERE slug = _slug) LOOP
    _i := _i + 1;
    _slug := _base_slug || '-' || _i;
  END LOOP;

  INSERT INTO communities (
    kind, parent_id, event_id, org_id, slug, name, description, visibility, created_by
  ) VALUES (
    'event', _parent_id, _evt.id, _evt.org_id, _slug,
    _evt.title || ' — Community',
    'Discussion space for attendees, speakers and sponsors of ' || _evt.title || '.',
    'public',
    _evt.user_id
  ) RETURNING id INTO _new_id;

  INSERT INTO community_members (community_id, user_id, role, status, auto)
  VALUES (_new_id, _evt.user_id, 'manager', 'active', true)
  ON CONFLICT (community_id, user_id) DO NOTHING;

  UPDATE communities SET member_count = member_count + 1 WHERE id = _new_id;

  RETURN _new_id;
END;
$$;
UPDATE communities SET visibility = 'public' WHERE kind = 'event';
CREATE OR REPLACE FUNCTION public.community_join(_community_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE 
  _id uuid;
  _kind community_kind;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;
  
  SELECT kind INTO _kind FROM public.communities WHERE id = _community_id;
  IF _kind = 'event' THEN
    RAISE EXCEPTION 'Event communities can only be joined by registering for the event.';
  END IF;

  INSERT INTO community_members (community_id, user_id, role, status, auto)
  VALUES (_community_id, auth.uid(), 'member', 'active', false)
  ON CONFLICT (community_id, user_id) DO UPDATE
    SET status = 'active', joined_at = excluded.joined_at
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2: MIGRATIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- 000_full_schema.sql (main schema)
[Full schema content would be included here - truncated for brevity]

-- 021_user_roles_grant_authenticated.sql
GRANT SELECT ON public.user_roles TO authenticated;

-- 022_event_creatives.sql
CREATE TABLE public.event_creatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  creative_type text NOT NULL CHECK (creative_type IN ('speaker','sponsor','combo')),
  speaker_id uuid REFERENCES public.speakers(id) ON DELETE SET NULL,
  sponsor_id uuid REFERENCES public.sponsors(id) ON DELETE SET NULL,
  template_id text NOT NULL,
  platform_format text NOT NULL,
  asset_url text NOT NULL,
  storage_path text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_creatives_entity_check CHECK (
    (creative_type = 'speaker' AND speaker_id IS NOT NULL AND sponsor_id IS NULL) OR
    (creative_type = 'sponsor' AND sponsor_id IS NOT NULL AND speaker_id IS NULL) OR
    (creative_type = 'combo'   AND speaker_id IS NOT NULL AND sponsor_id IS NOT NULL)
  )
);
CREATE INDEX event_creatives_event_idx ON public.event_creatives(event_id, created_at DESC);

ALTER TABLE public.event_creatives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner view event_creatives" ON public.event_creatives
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events WHERE id = event_id AND (user_id = auth.uid() OR has_role(auth.uid(), 'admin'))));

CREATE POLICY "Owner manage event_creatives" ON public.event_creatives
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events WHERE id = event_id AND (user_id = auth.uid() OR has_role(auth.uid(), 'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.events WHERE id = event_id AND (user_id = auth.uid() OR has_role(auth.uid(), 'admin'))));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_creatives TO authenticated;

-- 023_creative_ai_backgrounds.sql
CREATE TABLE public.event_creative_backgrounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  cache_key text NOT NULL,
  prompt text NOT NULL,
  prompt_normalized text NOT NULL,
  style_preset text NOT NULL,
  aspect_ratio text NOT NULL,
  asset_url text NOT NULL,
  storage_path text NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'site-assets',
  media_type text NOT NULL DEFAULT 'image/png',
  width integer,
  height integer,
  size_bytes bigint,
  provider text NOT NULL DEFAULT 'gemini',
  model text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  CONSTRAINT event_creative_backgrounds_cache_key_unique
    UNIQUE (event_id, cache_key)
);

CREATE INDEX event_creative_backgrounds_event_idx
  ON public.event_creative_backgrounds (event_id, created_at DESC);

CREATE INDEX event_creative_backgrounds_expires_idx
  ON public.event_creative_backgrounds (expires_at)
  WHERE expires_at IS NOT NULL;

ALTER TABLE public.event_creative_backgrounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner view event_creative_backgrounds" ON public.event_creative_backgrounds
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events WHERE id = event_id AND (user_id = auth.uid() OR has_role(auth.uid(), 'admin'))));

CREATE POLICY "Owner manage event_creative_backgrounds" ON public.event_creative_backgrounds
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events WHERE id = event_id AND (user_id = auth.uid() OR has_role(auth.uid(), 'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.events WHERE id = event_id AND (user_id = auth.uid() OR has_role(auth.uid(), 'admin'))));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_creative_backgrounds TO authenticated;

ALTER TABLE public.event_creatives
  ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 024_event_creatives_customization.sql
ALTER TABLE public.event_creatives
  ADD COLUMN IF NOT EXISTS customization jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 025_brand_kits.sql
CREATE TABLE IF NOT EXISTS public.brand_kits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brand_kits_org_idx
  ON public.brand_kits (org_id, created_at DESC);

ALTER TABLE public.brand_kits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brand_kits: org members and admins can select"
  ON public.brand_kits
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = brand_kits.org_id
        AND om.user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "brand_kits: org owner and admins can insert"
  ON public.brand_kits
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = brand_kits.org_id
        AND o.owner_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "brand_kits: org owner and admins can update"
  ON public.brand_kits
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = brand_kits.org_id
        AND o.owner_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = brand_kits.org_id
        AND o.owner_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "brand_kits: org owner and admins can delete"
  ON public.brand_kits
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = brand_kits.org_id
        AND o.owner_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
  );

-- 026_utm_attribution_coverage.sql
ALTER TABLE public.speaker_applications
  ADD COLUMN IF NOT EXISTS utm_source   text,
  ADD COLUMN IF NOT EXISTS utm_medium   text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS utm_content  text,
  ADD COLUMN IF NOT EXISTS utm_term     text;

ALTER TABLE public.sponsor_applications
  ADD COLUMN IF NOT EXISTS utm_source   text,
  ADD COLUMN IF NOT EXISTS utm_medium   text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS utm_content  text,
  ADD COLUMN IF NOT EXISTS utm_term     text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS utm_source   text,
  ADD COLUMN IF NOT EXISTS utm_medium   text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS utm_content  text,
  ADD COLUMN IF NOT EXISTS utm_term     text;

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

  IF (_m->>'must_change_password')::boolean IS TRUE AND NEW.email_confirmed_at IS NULL THEN
    UPDATE auth.users SET email_confirmed_at = now() WHERE id = NEW.id;
  END IF;

  IF NEW.email IS NOT NULL THEN
    UPDATE public.registrations
       SET user_id = NEW.id
     WHERE user_id IS NULL
       AND lower(email) = lower(NEW.email);
  END IF;

  RETURN NEW;
END;
$$;

-- 027_event_creatives_event_type.sql
ALTER TABLE public.event_creatives
  DROP CONSTRAINT event_creatives_creative_type_check;

ALTER TABLE public.event_creatives
  ADD CONSTRAINT event_creatives_creative_type_check
  CHECK (creative_type IN ('speaker', 'sponsor', 'combo', 'event'));

ALTER TABLE public.event_creatives
  DROP CONSTRAINT event_creatives_entity_check;

ALTER TABLE public.event_creatives
  ADD CONSTRAINT event_creatives_entity_check CHECK (
    (creative_type = 'speaker' AND speaker_id IS NOT NULL AND sponsor_id IS NULL) OR
    (creative_type = 'sponsor' AND sponsor_id IS NOT NULL AND speaker_id IS NULL) OR
    (creative_type = 'combo'   AND speaker_id IS NOT NULL AND sponsor_id IS NOT NULL) OR
    (creative_type = 'event'  AND speaker_id IS NULL AND sponsor_id IS NULL)
  );

-- 027_event_venue_selections.sql
CREATE TABLE IF NOT EXISTS event_venue_selections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  org_id uuid NOT NULL,
  selected_by uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'contacted'
    CHECK (status IN ('contacted', 'accepted', 'declined', 'cancelled')),
  notes text,
  notified_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, vendor_id)
);

CREATE INDEX IF NOT EXISTS idx_event_venue_selections_event
  ON event_venue_selections (event_id);
CREATE INDEX IF NOT EXISTS idx_event_venue_selections_vendor
  ON event_venue_selections (vendor_id);
CREATE INDEX IF NOT EXISTS idx_event_venue_selections_org
  ON event_venue_selections (org_id);

ALTER TABLE event_venue_selections ENABLE ROW LEVEL SECURITY;

-- 028_session_speakers_owner_manage.sql
DROP POLICY IF EXISTS "Owner manage session_speakers" ON public.session_speakers;

CREATE POLICY "Owner manage session_speakers"
  ON public.session_speakers
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_speakers.session_id
        AND is_event_owner(auth.uid(), s.event_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_speakers.session_id
        AND is_event_owner(auth.uid(), s.event_id)
    )
  );

-- 029_event_creative_ai_drafts.sql
CREATE TABLE IF NOT EXISTS public.event_creative_ai_drafts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  entity_type   text NOT NULL CHECK (entity_type IN ('event', 'speaker', 'sponsor', 'combo')),
  entity_id     uuid,
  copy          jsonb NOT NULL,
  source        text NOT NULL DEFAULT 'on_demand' CHECK (source IN ('on_demand', 'auto_publish')),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'dismissed')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS event_creative_ai_drafts_event_idx
  ON public.event_creative_ai_drafts(event_id);
CREATE INDEX IF NOT EXISTS event_creative_ai_drafts_pending_idx
  ON public.event_creative_ai_drafts(event_id, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS event_creative_ai_drafts_quota_idx
  ON public.event_creative_ai_drafts(event_id, created_at DESC);

ALTER TABLE public.event_creative_ai_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manage event_creative_ai_drafts"
  ON public.event_creative_ai_drafts
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_creative_ai_drafts.event_id
        AND (e.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_creative_ai_drafts.event_id
        AND (e.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.event_creative_ai_drafts
  TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.event_creative_ai_drafts
  TO service_role;

DROP TRIGGER IF EXISTS event_creative_ai_drafts_updated_at
  ON public.event_creative_ai_drafts;
CREATE TRIGGER event_creative_ai_drafts_updated_at
  BEFORE UPDATE ON public.event_creative_ai_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
