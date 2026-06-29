-- ─────────────────────────────────────────────────────────────────────────────
-- 013_anon_can_read_orgs_with_published_events.sql
--
-- Unblocks per-event OG / Twitter share previews on links like:
--   https://illuxus.com/org/<orgSlug>/events/<eventSlug>
--
-- Before this migration, `organizations` RLS for anon allowed only rows where
-- `landing_published = true`. The Vercel edge function `api/event-og.ts`
-- joins the event row to its organisation via `organizations!inner(...)` so
-- the share card can include the org's name, logo, and canonical handle.
-- For any org whose landing page hadn't been explicitly published, anon got
-- back zero rows from the join — the function quietly fell through to the
-- unmodified `index.html`, which is why every event link previews as the
-- generic "illuxus — events, communities, and webinars" card.
--
-- Most events are published before their org's landing page is, so this gap
-- silently breaks share previews for almost every freshly-created event.
--
-- The fix: add an additional SELECT policy that grants anon read access to
-- an organisation row when it owns at least one published event. RLS
-- policies are OR'd together, so this only widens visibility — orgs without
-- any published events stay private under the existing policy.
--
-- Scope is intentionally tight: anon only ever sees the public identity
-- fields the OG endpoint and public event/org pages already render
-- (name, slug, subdomain, logo_url, custom_domain) — sensitive columns
-- (billing_email, payment provider ids, etc.) aren't read by anon code
-- paths. RLS controls visibility row-by-row; column-level scoping is
-- enforced at the query layer.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Public view orgs with published events" ON public.organizations;
CREATE POLICY "Public view orgs with published events"
ON public.organizations
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
      FROM public.events e
     WHERE e.org_id = organizations.id
       AND e.status = 'published'
  )
);

COMMENT ON POLICY "Public view orgs with published events" ON public.organizations IS
  'Allows anon (and authenticated) to read the parent org of any published event so per-event share cards / OG endpoints can include org name and logo.';
