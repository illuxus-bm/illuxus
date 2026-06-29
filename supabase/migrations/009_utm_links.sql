-- ═══════════════════════════════════════════════════════════════════════════
-- 009_utm_links.sql — Persistent UTM link registry
--
-- Purpose
-- ───────
-- When an organiser generates a tracked share link via the UTM / Links tab,
-- save it to this table so the link can be reviewed, renamed, edited, and
-- (if unused) deleted. Links with any click or registration data attached
-- may be edited but NOT deleted — their history must be preserved.
--
-- Rules enforced
-- ───────────────
--   CREATE  → always allowed (INSERT).
--   EDIT    → allowed when at least one row exists in utm_clicks OR
--              registrations for the same (event_id, utm_campaign,
--              utm_source, utm_medium) combination.
--              Also allowed when zero data rows exist.
--   DELETE  → only allowed when zero clicks AND zero registrations have
--              been recorded for this link's coordinates.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.utm_links (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- UTM parameters (source + medium + campaign uniquely identify a link per event)
  utm_source   text NOT NULL,
  utm_medium   text NOT NULL,
  utm_campaign text NOT NULL,
  utm_content  text,
  utm_term     text,

  -- Human-readable label the organiser optionally gives the link
  label        text,

  -- The full generated URL (stored for quick copy — derived from utm_* + event)
  url          text NOT NULL,

  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  -- Enforce uniqueness: one saved link per (event, source, medium, campaign)
  UNIQUE (event_id, utm_source, utm_medium, utm_campaign)
);

CREATE INDEX IF NOT EXISTS idx_utm_links_event
  ON public.utm_links(event_id, created_at DESC);

ALTER TABLE public.utm_links ENABLE ROW LEVEL SECURITY;

-- Org members + super admins can read
DROP POLICY IF EXISTS "Org members read utm_links" ON public.utm_links;
CREATE POLICY "Org members read utm_links"
  ON public.utm_links FOR SELECT TO authenticated
  USING (
    EXISTS(
      SELECT 1 FROM public.events e
      WHERE e.id = event_id
        AND (
          e.user_id = auth.uid()
          OR public.has_role(auth.uid(), 'admin')
          OR public.is_org_member(auth.uid(), e.org_id)
        )
    )
  );

-- Org members can insert
DROP POLICY IF EXISTS "Org members insert utm_links" ON public.utm_links;
CREATE POLICY "Org members insert utm_links"
  ON public.utm_links FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.events e
      WHERE e.id = event_id
        AND (
          e.user_id = auth.uid()
          OR public.has_role(auth.uid(), 'admin')
          OR public.is_org_member(auth.uid(), e.org_id)
        )
    )
  );

-- Org members can update (edit is always allowed)
DROP POLICY IF EXISTS "Org members update utm_links" ON public.utm_links;
CREATE POLICY "Org members update utm_links"
  ON public.utm_links FOR UPDATE TO authenticated
  USING (
    EXISTS(
      SELECT 1 FROM public.events e
      WHERE e.id = event_id
        AND (
          e.user_id = auth.uid()
          OR public.has_role(auth.uid(), 'admin')
          OR public.is_org_member(auth.uid(), e.org_id)
        )
    )
  );

-- DELETE is allowed only when the link has received no data.
-- The check is enforced in the application layer via the
-- `utm_link_has_data` helper function below; the RLS policy
-- permits deletion for org members (the function call gates it).
DROP POLICY IF EXISTS "Org members delete utm_links" ON public.utm_links;
CREATE POLICY "Org members delete utm_links"
  ON public.utm_links FOR DELETE TO authenticated
  USING (
    EXISTS(
      SELECT 1 FROM public.events e
      WHERE e.id = event_id
        AND (
          e.user_id = auth.uid()
          OR public.has_role(auth.uid(), 'admin')
          OR public.is_org_member(auth.uid(), e.org_id)
        )
    )
  );

-- ── Helper: does a utm_link row have any associated data? ────────────────────
-- Returns true when at least one utm_click or registration exists that
-- matches the link's (event_id, utm_source, utm_medium, utm_campaign).
-- Used client-side to decide whether to show Delete vs Edit-only.

CREATE OR REPLACE FUNCTION public.utm_link_has_data(_link_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_event_id     uuid;
  v_utm_source   text;
  v_utm_medium   text;
  v_utm_campaign text;
  v_has_data     boolean;
BEGIN
  SELECT event_id, utm_source, utm_medium, utm_campaign
  INTO   v_event_id, v_utm_source, v_utm_medium, v_utm_campaign
  FROM   public.utm_links
  WHERE  id = _link_id;

  IF v_event_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT (
    EXISTS(
      SELECT 1 FROM public.utm_clicks
      WHERE event_id   = v_event_id
        AND coalesce(utm_source,   '') = coalesce(v_utm_source,   '')
        AND coalesce(utm_medium,   '') = coalesce(v_utm_medium,   '')
        AND coalesce(utm_campaign, '') = coalesce(v_utm_campaign, '')
    )
    OR
    EXISTS(
      SELECT 1 FROM public.registrations
      WHERE event_id   = v_event_id
        AND coalesce(utm_source,   '') = coalesce(v_utm_source,   '')
        AND coalesce(utm_medium,   '') = coalesce(v_utm_medium,   '')
        AND coalesce(utm_campaign, '') = coalesce(v_utm_campaign, '')
        AND status <> 'cancelled'
    )
  ) INTO v_has_data;

  RETURN v_has_data;
END $$;

GRANT EXECUTE ON FUNCTION public.utm_link_has_data TO authenticated;

-- ── updated_at trigger ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.utm_links_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_utm_links_updated ON public.utm_links;
CREATE TRIGGER trg_utm_links_updated
  BEFORE UPDATE ON public.utm_links
  FOR EACH ROW EXECUTE FUNCTION public.utm_links_set_updated_at();
