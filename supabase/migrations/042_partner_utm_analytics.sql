-- ═══════════════════════════════════════════════════════════════════════════════
-- 042_partner_utm_analytics.sql
--
-- Analytics for the Partner dashboard's event view (follows 040).
--
-- `partner_utm_analytics(_access_id)` returns, for ONE shared link only:
--   • clicks on the link,
--   • a day-by-day series of clicks, registrations and check-ins,
--   • the companies most represented among its participants.
--
-- Same isolation rules as the other partner functions: the grant is
-- re-validated on every call, the event and UTM values come from the grant,
-- and anything the grant's permissions don't cover is returned as NULL.
-- Days are bucketed in the event's own timezone.
--
-- Idempotent — safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.partner_utm_analytics(_access_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g        public.utm_partner_access := public._utm_partner_grant(_access_id);
  v_tz     text;
  v_clicks bigint;
  v_series jsonb;
  v_top    jsonb;
BEGIN
  SELECT coalesce(nullif(e.timezone, ''), 'UTC') INTO v_tz FROM public.events e WHERE e.id = g.event_id;
  -- An unknown timezone name must not break the dashboard.
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = v_tz) THEN
    v_tz := 'UTC';
  END IF;

  SELECT count(*) INTO v_clicks
    FROM public.utm_clicks c
   WHERE c.event_id   = g.event_id
     AND c.utm_source = g.utm_source
     AND coalesce(c.utm_medium,   '(none)') = g.utm_medium
     AND coalesce(c.utm_campaign, '(none)') = g.utm_campaign;

  WITH regs AS (
    SELECT r.created_at, r.checked_in, r.checked_in_at
      FROM public.registrations r
     WHERE r.event_id   = g.event_id
       AND r.status    <> 'cancelled'
       AND r.utm_source = g.utm_source
       AND coalesce(r.utm_medium,   '(none)') = g.utm_medium
       AND coalesce(r.utm_campaign, '(none)') = g.utm_campaign
  ), days AS (
    SELECT (c.clicked_at AT TIME ZONE v_tz)::date AS day, 1 AS clicks, 0 AS registrations, 0 AS check_ins
      FROM public.utm_clicks c
     WHERE c.event_id   = g.event_id
       AND c.utm_source = g.utm_source
       AND coalesce(c.utm_medium,   '(none)') = g.utm_medium
       AND coalesce(c.utm_campaign, '(none)') = g.utm_campaign
    UNION ALL
    SELECT (created_at AT TIME ZONE v_tz)::date, 0, 1, 0 FROM regs
    UNION ALL
    SELECT (checked_in_at AT TIME ZONE v_tz)::date, 0, 0, 1 FROM regs
     WHERE g.can_view_checkin AND checked_in AND checked_in_at IS NOT NULL
  ), per_day AS (
    SELECT day, sum(clicks) AS clicks, sum(registrations) AS registrations, sum(check_ins) AS check_ins
      FROM days GROUP BY day
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'day', to_char(day, 'YYYY-MM-DD'),
           'clicks', clicks,
           'registrations', registrations,
           'check_ins', CASE WHEN g.can_view_checkin THEN check_ins END
         ) ORDER BY day), '[]'::jsonb)
    INTO v_series
    FROM per_day;

  SELECT coalesce(jsonb_agg(jsonb_build_object('company', company, 'registrations', n) ORDER BY n DESC, company), '[]'::jsonb)
    INTO v_top
    FROM (
      SELECT btrim(r.company) AS company, count(*) AS n
        FROM public.registrations r
       WHERE r.event_id   = g.event_id
         AND r.status    <> 'cancelled'
         AND r.utm_source = g.utm_source
         AND coalesce(r.utm_medium,   '(none)') = g.utm_medium
         AND coalesce(r.utm_campaign, '(none)') = g.utm_campaign
         AND nullif(btrim(coalesce(r.company, '')), '') IS NOT NULL
       GROUP BY btrim(r.company)
       ORDER BY count(*) DESC, btrim(r.company)
       LIMIT 8
    ) t;

  RETURN jsonb_build_object('clicks', v_clicks, 'timezone', v_tz, 'series', v_series, 'top_companies', v_top);
END;
$$;

REVOKE ALL ON FUNCTION public.partner_utm_analytics(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_utm_analytics(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
