-- ═══════════════════════════════════════════════════════════════════════════
-- 008_utm_tracking.sql — UTM parameter capture + link analytics
--
-- Adds first-touch UTM attribution to every registration so organisers can
-- measure which campaigns / channels drive the most sign-ups and ticket
-- sales for each event.
--
-- Changes:
--   1. Add 5 nullable utm_* columns to public.registrations
--   2. Create public.utm_clicks — lightweight page-view tracking table so
--      we can compute funnel drop-off (views → registrations) per campaign.
--   3. Admin / organiser RPC: event_utm_summary(_event_id) that returns an
--      aggregated breakdown by source × medium × campaign with click + reg
--      + conversion-rate columns.
--
-- Idempotent: every DDL uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. UTM columns on registrations ─────────────────────────────────────────

ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS utm_source   text,
  ADD COLUMN IF NOT EXISTS utm_medium   text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS utm_content  text,
  ADD COLUMN IF NOT EXISTS utm_term     text;

-- Index the most common group-by columns for the analytics query.
CREATE INDEX IF NOT EXISTS idx_registrations_utm_source
  ON public.registrations(event_id, utm_source)
  WHERE utm_source IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_registrations_utm_campaign
  ON public.registrations(event_id, utm_campaign)
  WHERE utm_campaign IS NOT NULL;

-- ── 2. utm_clicks — page-view / link-click events ───────────────────────────
-- Each row is a single page-view on a public event URL that carried at least
-- one utm_* parameter. Stored client-side via a SECURITY DEFINER RPC so
-- anonymous visitors can write without exposing the table directly.

CREATE TABLE IF NOT EXISTS public.utm_clicks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  utm_content  text,
  utm_term     text,
  -- Referrer and path are stored for debugging; never store PII here.
  referrer     text,
  path         text,
  -- Nullable session fingerprint (non-PII): helps de-duplicate rapid re-loads.
  session_key  text,
  clicked_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_utm_clicks_event
  ON public.utm_clicks(event_id, clicked_at DESC);

CREATE INDEX IF NOT EXISTS idx_utm_clicks_campaign
  ON public.utm_clicks(event_id, utm_campaign)
  WHERE utm_campaign IS NOT NULL;

-- RLS: organisers and admins can read; no direct inserts from the client.
ALTER TABLE public.utm_clicks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org owners read utm_clicks" ON public.utm_clicks;
CREATE POLICY "Org owners read utm_clicks"
  ON public.utm_clicks FOR SELECT TO authenticated
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

-- ── 3. record_utm_click — SECURITY DEFINER RPC called from the SPA ──────────
-- Anonymous-safe: the SPA calls this on every public event page-load that
-- has at least one utm_* parameter. The function validates the event_id is
-- published before inserting.

CREATE OR REPLACE FUNCTION public.record_utm_click(
  _event_id     uuid,
  _utm_source   text DEFAULT NULL,
  _utm_medium   text DEFAULT NULL,
  _utm_campaign text DEFAULT NULL,
  _utm_content  text DEFAULT NULL,
  _utm_term     text DEFAULT NULL,
  _referrer     text DEFAULT NULL,
  _path         text DEFAULT NULL,
  _session_key  text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Only track clicks on published events to avoid polluting analytics with
  -- draft previews.
  IF NOT EXISTS (
    SELECT 1 FROM public.events
    WHERE id = _event_id AND status = 'published'
  ) THEN
    RETURN;
  END IF;

  -- De-duplicate: skip if the same session_key already recorded a click for
  -- this event in the last 30 minutes (prevents rapid browser-reload spam).
  IF _session_key IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.utm_clicks
    WHERE event_id = _event_id
      AND session_key = _session_key
      AND clicked_at > now() - interval '30 minutes'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.utm_clicks (
    event_id, utm_source, utm_medium, utm_campaign,
    utm_content, utm_term, referrer, path, session_key
  ) VALUES (
    _event_id, _utm_source, _utm_medium, _utm_campaign,
    _utm_content, _utm_term,
    -- Truncate to 1000 chars to prevent oversized rows.
    left(_referrer, 1000),
    left(_path,     500),
    left(_session_key, 128)
  );
END $$;

GRANT EXECUTE ON FUNCTION public.record_utm_click TO anon, authenticated;

-- ── 4. event_utm_summary — analytics RPC ────────────────────────────────────
-- Returns one row per (utm_source, utm_medium, utm_campaign) combination for
-- a given event, with click count, registration count, and conversion rate.
-- Gated: caller must be the event owner, an org member, or a super admin.

CREATE OR REPLACE FUNCTION public.event_utm_summary(_event_id uuid)
RETURNS TABLE (
  utm_source        text,
  utm_medium        text,
  utm_campaign      text,
  clicks            bigint,
  registrations     bigint,
  conversion_rate   numeric  -- percentage, 0-100
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Auth gate
  IF NOT EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = _event_id
      AND (
        e.user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
        OR public.is_org_member(auth.uid(), e.org_id)
      )
  ) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  RETURN QUERY
  WITH click_agg AS (
    SELECT
      coalesce(uc.utm_source,   '(direct)') AS src,
      coalesce(uc.utm_medium,   '(none)')   AS med,
      coalesce(uc.utm_campaign, '(none)')   AS camp,
      count(*) AS clicks
    FROM public.utm_clicks uc
    WHERE uc.event_id = _event_id
    GROUP BY 1, 2, 3
  ),
  reg_agg AS (
    SELECT
      coalesce(r.utm_source,   '(direct)') AS src,
      coalesce(r.utm_medium,   '(none)')   AS med,
      coalesce(r.utm_campaign, '(none)')   AS camp,
      count(*) AS regs
    FROM public.registrations r
    WHERE r.event_id = _event_id
      AND r.status <> 'cancelled'
    GROUP BY 1, 2, 3
  )
  SELECT
    coalesce(c.src, r.src)   AS utm_source,
    coalesce(c.med, r.med)   AS utm_medium,
    coalesce(c.camp, r.camp) AS utm_campaign,
    coalesce(c.clicks, 0)    AS clicks,
    coalesce(r.regs, 0)      AS registrations,
    CASE
      WHEN coalesce(c.clicks, 0) = 0 THEN 0
      ELSE round(coalesce(r.regs, 0)::numeric / c.clicks * 100, 1)
    END AS conversion_rate
  FROM click_agg c
  FULL OUTER JOIN reg_agg r
    ON r.src = c.src AND r.med = c.med AND r.camp = c.camp
  ORDER BY coalesce(r.regs, 0) DESC, coalesce(c.clicks, 0) DESC;
END $$;

GRANT EXECUTE ON FUNCTION public.event_utm_summary TO authenticated;

-- ── 5. platform_utm_summary — super-admin cross-event view ──────────────────
-- Returns top campaigns across the whole platform, ranked by registrations.
-- Restricted to super admins only.

CREATE OR REPLACE FUNCTION public.platform_utm_summary(
  _limit int DEFAULT 50
)
RETURNS TABLE (
  event_id      uuid,
  event_title   text,
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  clicks        bigint,
  registrations bigint,
  conversion_rate numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  RETURN QUERY
  SELECT
    e.id                                    AS event_id,
    e.title                                 AS event_title,
    coalesce(r.utm_source,   '(direct)')    AS utm_source,
    coalesce(r.utm_medium,   '(none)')      AS utm_medium,
    coalesce(r.utm_campaign, '(none)')      AS utm_campaign,
    coalesce(ck.clicks, 0)                  AS clicks,
    count(r.id)                             AS registrations,
    CASE
      WHEN coalesce(ck.clicks, 0) = 0 THEN 0
      ELSE round(count(r.id)::numeric / ck.clicks * 100, 1)
    END                                     AS conversion_rate
  FROM public.registrations r
  JOIN public.events e ON e.id = r.event_id
  LEFT JOIN LATERAL (
    SELECT count(*) AS clicks
    FROM public.utm_clicks uc
    WHERE uc.event_id = r.event_id
      AND coalesce(uc.utm_source,   '(direct)') = coalesce(r.utm_source,   '(direct)')
      AND coalesce(uc.utm_medium,   '(none)')   = coalesce(r.utm_medium,   '(none)')
      AND coalesce(uc.utm_campaign, '(none)')   = coalesce(r.utm_campaign, '(none)')
  ) ck ON true
  WHERE r.status <> 'cancelled'
  GROUP BY e.id, e.title, r.utm_source, r.utm_medium, r.utm_campaign, ck.clicks
  ORDER BY count(r.id) DESC
  LIMIT _limit;
END $$;

GRANT EXECUTE ON FUNCTION public.platform_utm_summary TO authenticated;
