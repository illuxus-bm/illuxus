-- ═══════════════════════════════════════════════════════════════════════════════
-- Tracked links can differ by content or term alone.
--
-- A saved link was identified by source + medium + campaign, so links that
-- differed only in utm_content or utm_term (one per team member, say) replaced
-- each other, and the analytics merged their clicks and registrations into one
-- row. A link is now identified by all five values:
--
--   • utm_links is unique per event + source + medium + campaign + content +
--     term (blank content / term count as "none").
--   • event_utm_summary returns one row per link, content and term included.
--   • delete_utm_tracking takes the link's content and term and deletes only
--     that link and its clicks. Partner shares belong to the campaign, so they
--     are removed only once no saved link with that source / medium / campaign
--     is left.
--   • utm_link_has_data matches on content and term too.
--
-- Partner dashboards stay per source + medium + campaign.
-- Needs Postgres 15+ (NULLS NOT DISTINCT). Safe to run more than once.
-- Paste into the SQL Editor and Run.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Saved-link identity ─────────────────────────────────────────────────────
UPDATE public.utm_links
   SET utm_content = NULLIF(btrim(utm_content), ''),
       utm_term    = NULLIF(btrim(utm_term), '')
 WHERE utm_content IS DISTINCT FROM NULLIF(btrim(utm_content), '')
    OR utm_term    IS DISTINCT FROM NULLIF(btrim(utm_term), '');

DO $$
DECLARE
  _c text;
BEGIN
  FOR _c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.utm_links'::regclass AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE public.utm_links DROP CONSTRAINT %I', _c);
  END LOOP;
END $$;

ALTER TABLE public.utm_links
  ADD CONSTRAINT utm_links_link_key UNIQUE NULLS NOT DISTINCT
  (event_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term);

-- ── 2. Analytics: one row per link ─────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.event_utm_summary(uuid);
CREATE FUNCTION public.event_utm_summary(_event_id uuid)
RETURNS TABLE (
  utm_source        text,
  utm_medium        text,
  utm_campaign      text,
  utm_content       text,
  utm_term          text,
  clicks            bigint,
  registrations     bigint,
  conversion_rate   numeric  -- percentage, 0-100
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
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
      NULLIF(btrim(uc.utm_content), '')     AS cont,
      NULLIF(btrim(uc.utm_term), '')        AS trm,
      count(*) AS clicks
    FROM public.utm_clicks uc
    WHERE uc.event_id = _event_id
    GROUP BY 1, 2, 3, 4, 5
  ),
  reg_agg AS (
    SELECT
      coalesce(r.utm_source,   '(direct)') AS src,
      coalesce(r.utm_medium,   '(none)')   AS med,
      coalesce(r.utm_campaign, '(none)')   AS camp,
      NULLIF(btrim(r.utm_content), '')     AS cont,
      NULLIF(btrim(r.utm_term), '')        AS trm,
      count(*) AS regs
    FROM public.registrations r
    WHERE r.event_id = _event_id
      AND r.status <> 'cancelled'
    GROUP BY 1, 2, 3, 4, 5
  )
  SELECT
    coalesce(c.src, r.src)   AS utm_source,
    coalesce(c.med, r.med)   AS utm_medium,
    coalesce(c.camp, r.camp) AS utm_campaign,
    coalesce(c.cont, r.cont) AS utm_content,
    coalesce(c.trm, r.trm)   AS utm_term,
    coalesce(c.clicks, 0)    AS clicks,
    coalesce(r.regs, 0)      AS registrations,
    CASE
      WHEN coalesce(c.clicks, 0) = 0 THEN 0
      ELSE round(coalesce(r.regs, 0)::numeric / c.clicks * 100, 1)
    END AS conversion_rate
  FROM click_agg c
  FULL OUTER JOIN reg_agg r
    ON r.src = c.src AND r.med = c.med AND r.camp = c.camp
   AND r.cont IS NOT DISTINCT FROM c.cont
   AND r.trm  IS NOT DISTINCT FROM c.trm
  ORDER BY coalesce(r.regs, 0) DESC, coalesce(c.clicks, 0) DESC;
END $$;

GRANT EXECUTE ON FUNCTION public.event_utm_summary(uuid) TO authenticated;

-- ── 3. Delete one link (content and term included) ────────────────────────────
DROP FUNCTION IF EXISTS public.delete_utm_tracking(uuid, text, text, text);
CREATE OR REPLACE FUNCTION public.delete_utm_tracking(
  _event_id     uuid,
  _utm_source   text,
  _utm_medium   text,
  _utm_campaign text,
  _utm_content  text DEFAULT NULL,
  _utm_term     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_content  text := NULLIF(btrim(_utm_content), '');
  v_term     text := NULLIF(btrim(_utm_term), '');
  v_links    int := 0;
  v_clicks   int := 0;
  v_regs     int := 0;
  v_partners int := 0;
  r          record;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = _event_id
      AND (
        e.user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
        OR public.is_org_member(auth.uid(), e.org_id)
      )
  ) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  IF coalesce(trim(_utm_source), '') IN ('', '(direct)') THEN
    RAISE EXCEPTION 'Direct traffic is not a tracked link' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.utm_links l
   WHERE l.event_id     = _event_id
     AND l.utm_source   = _utm_source
     AND l.utm_medium   = _utm_medium
     AND l.utm_campaign = _utm_campaign
     AND l.utm_content IS NOT DISTINCT FROM v_content
     AND l.utm_term    IS NOT DISTINCT FROM v_term;
  GET DIAGNOSTICS v_links = ROW_COUNT;

  DELETE FROM public.utm_clicks c
   WHERE c.event_id   = _event_id
     AND c.utm_source = _utm_source
     AND coalesce(c.utm_medium,   '(none)') = coalesce(_utm_medium,   '(none)')
     AND coalesce(c.utm_campaign, '(none)') = coalesce(_utm_campaign, '(none)')
     AND NULLIF(btrim(c.utm_content), '') IS NOT DISTINCT FROM v_content
     AND NULLIF(btrim(c.utm_term), '')    IS NOT DISTINCT FROM v_term;
  GET DIAGNOSTICS v_clicks = ROW_COUNT;

  -- Shares cover the whole campaign: end them only when its last saved link goes.
  IF NOT EXISTS (
    SELECT 1 FROM public.utm_links l
     WHERE l.event_id     = _event_id
       AND l.utm_source   = _utm_source
       AND l.utm_medium   = _utm_medium
       AND l.utm_campaign = _utm_campaign
  ) THEN
    FOR r IN
      DELETE FROM public.utm_partner_access a
       WHERE a.event_id     = _event_id
         AND a.utm_source   = _utm_source
         AND a.utm_medium   = coalesce(_utm_medium,   '(none)')
         AND a.utm_campaign = coalesce(_utm_campaign, '(none)')
      RETURNING a.id, a.invited_email, a.status
    LOOP
      v_partners := v_partners + 1;
      PERFORM public._utm_partner_audit('utm_partner.removed', r.id,
        jsonb_build_object('email', r.invited_email, 'previous_status', r.status, 'reason', 'link deleted'));
    END LOOP;
  END IF;

  SELECT count(*) INTO v_regs
    FROM public.registrations r2
   WHERE r2.event_id   = _event_id
     AND r2.status    <> 'cancelled'
     AND r2.utm_source = _utm_source
     AND coalesce(r2.utm_medium,   '(none)') = coalesce(_utm_medium,   '(none)')
     AND coalesce(r2.utm_campaign, '(none)') = coalesce(_utm_campaign, '(none)')
     AND NULLIF(btrim(r2.utm_content), '') IS NOT DISTINCT FROM v_content
     AND NULLIF(btrim(r2.utm_term), '')    IS NOT DISTINCT FROM v_term;

  RETURN jsonb_build_object(
    'links_deleted',      v_links,
    'clicks_deleted',     v_clicks,
    'registrations_kept', v_regs,
    'partners_removed',   v_partners
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_utm_tracking(uuid, text, text, text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.delete_utm_tracking(uuid, text, text, text, text, text) TO authenticated, service_role;

-- ── 4. "Has this link recorded anything?" (content and term included) ──────────
CREATE OR REPLACE FUNCTION public.utm_link_has_data(_link_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  l public.utm_links;
BEGIN
  SELECT * INTO l FROM public.utm_links WHERE id = _link_id;
  IF l.id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS(
    SELECT 1 FROM public.utm_clicks c
    WHERE c.event_id = l.event_id
      AND coalesce(c.utm_source,   '') = coalesce(l.utm_source,   '')
      AND coalesce(c.utm_medium,   '') = coalesce(l.utm_medium,   '')
      AND coalesce(c.utm_campaign, '') = coalesce(l.utm_campaign, '')
      AND NULLIF(btrim(c.utm_content), '') IS NOT DISTINCT FROM l.utm_content
      AND NULLIF(btrim(c.utm_term), '')    IS NOT DISTINCT FROM l.utm_term
  ) OR EXISTS(
    SELECT 1 FROM public.registrations r
    WHERE r.event_id = l.event_id
      AND coalesce(r.utm_source,   '') = coalesce(l.utm_source,   '')
      AND coalesce(r.utm_medium,   '') = coalesce(l.utm_medium,   '')
      AND coalesce(r.utm_campaign, '') = coalesce(l.utm_campaign, '')
      AND NULLIF(btrim(r.utm_content), '') IS NOT DISTINCT FROM l.utm_content
      AND NULLIF(btrim(r.utm_term), '')    IS NOT DISTINCT FROM l.utm_term
      AND r.status <> 'cancelled'
  );
END $$;

GRANT EXECUTE ON FUNCTION public.utm_link_has_data(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
