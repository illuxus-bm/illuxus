-- ─────────────────────────────────────────────────────────────────────────────
-- 015_event_og_rpc.sql
--
-- Robust support for per-event share previews (WhatsApp / Twitter / LinkedIn /
-- iMessage / Slack / Discord / Telegram / Facebook).
--
-- The Vercel edge function `api/event-og.ts` rewrites <title>, <meta og:*>,
-- and `<link rel="canonical">` into the served HTML so crawlers see an
-- event-specific share card. To do that it needs to fetch the event row plus
-- its parent organisation (for org name + logo).
--
-- Previously this lookup ran over PostgREST as the anon role and used the
-- standard table policies. That path is brittle:
--   • `organizations` RLS for anon requires `landing_published = true`. Most
--     events go live before their org's landing page is published, so the
--     join silently returned nothing and the function fell through to the
--     generic shell.
--   • Even after 013 widened anon visibility, an in-flight migration state
--     could still leave the function returning nothing.
--
-- Solution: expose a SECURITY DEFINER RPC that returns ONLY the public OG
-- fields, callable by `anon`. SECURITY DEFINER lets the function bypass RLS
-- and the table grants safely because the function itself enforces the
-- "published only" predicate at the top of its query — no row that isn't
-- already meant to be public can be returned through this path.
--
-- The edge function now calls this single RPC instead of two queries; it
-- can't return a half-populated result, and behaviour is identical whether
-- or not 013 has been applied.
--
-- Idempotent: DROP + CREATE so re-runs are safe.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_event_og(text, text, uuid);

CREATE FUNCTION public.get_event_og(
  _event_slug text DEFAULT NULL,
  _org_slug   text DEFAULT NULL,
  _event_id   uuid DEFAULT NULL
)
RETURNS TABLE (
  id                   uuid,
  title                text,
  description          text,
  date                 timestamptz,
  end_date             timestamptz,
  venue                text,
  location             text,
  banner_landscape_url text,
  image_url            text,
  slug                 text,
  timezone             text,
  event_format         text,
  status               text,
  price                numeric,
  currency             text,
  virtual_url          text,
  org_id               uuid,
  org_name             text,
  org_slug             text,
  org_subdomain        text,
  org_logo_url         text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.id,
    e.title,
    e.description,
    e.date,
    e.end_date,
    e.venue,
    e.location,
    e.banner_landscape_url,
    e.image_url,
    e.slug,
    e.timezone,
    e.event_format,
    e.status,
    e.price,
    e.currency,
    e.virtual_url,
    o.id          AS org_id,
    o.name        AS org_name,
    o.slug        AS org_slug,
    o.subdomain   AS org_subdomain,
    o.logo_url    AS org_logo_url
    FROM public.events e
    LEFT JOIN public.organizations o ON o.id = e.org_id
   WHERE e.status = 'published'
     AND (
          (_event_id IS NOT NULL AND e.id = _event_id)
       OR (
            _event_id IS NULL
            AND _event_slug IS NOT NULL
            AND e.slug = _event_slug
            AND (
                 _org_slug IS NULL
              OR o.slug      = _org_slug
              OR o.subdomain = _org_slug
            )
          )
        )
   ORDER BY e.created_at DESC NULLS LAST
   LIMIT 1;
$$;

-- anon needs EXECUTE so the edge function can call this without elevated
-- credentials. SECURITY DEFINER means the function body runs with the owner's
-- privileges regardless of caller, so RLS on events / organizations doesn't
-- apply inside the function — the WHERE clause enforces "published only"
-- itself.
GRANT EXECUTE ON FUNCTION public.get_event_og(text, text, uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.get_event_og(text, text, uuid) IS
  'Public-safe lookup for per-event share previews. Returns one row containing the event + org identity fields needed to render an OG card. Only published events are ever returned. Callable by anon.';
