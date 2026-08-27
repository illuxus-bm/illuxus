-- ─────────────────────────────────────────────────────────────────────────────
-- 029_event_creative_ai_drafts.sql
--
-- Backing store for the `generate-creative-copy` edge function's output.
-- Every AI-generated copy suggestion — whether from the composer's "AI
-- Suggest" button (on-demand) or from the event-publish auto-fire
-- (`autoGenerateEventDrafts`) — persists here so the organizer can
-- browse, review, and apply drafts asynchronously from a single
-- "AI Drafts" panel in the Creatives library.
--
-- The `generate-creative-copy` function also counts rows in this table
-- (matching event_id, within the last 24h) as its per-event daily quota
-- gate. That means EVERY generation — auto-fire, on-demand, dismissed,
-- or already-applied — counts against the budget. This is deliberate:
-- each row corresponds to one paid Gemini call, and the quota exists to
-- cap the Google-side cost per event.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.event_creative_ai_drafts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,

  -- Which creative type the copy was generated for. Mirrors
  -- `CreativeType` in `src/lib/creatives/creative-templates.ts`; the
  -- text values match `CopyKind` in
  -- `supabase/functions/generate-creative-copy/index.ts` exactly so a
  -- draft row is a faithful record of the generation request.
  entity_type   text NOT NULL CHECK (entity_type IN ('event', 'speaker', 'sponsor', 'combo')),
  -- `speakers.id` when entity_type='speaker'/'combo', `sponsors.id` when
  -- entity_type='sponsor'/'combo', NULL for entity_type='event'. Not a
  -- foreign key (would need two separate columns for two references);
  -- the row is denormalised so a deleted speaker/sponsor doesn't cascade
  -- delete drafts the organizer may still want to browse.
  entity_id     uuid,

  -- The parsed CopySuggestion JSON: { tagline, subtitle?, ctaLabel, stats? }.
  -- See CopySuggestion type in generate-creative-copy/index.ts for
  -- the exact shape.
  copy          jsonb NOT NULL,

  -- Where this draft came from — helps the UI style auto-fire drafts
  -- distinctly from on-demand suggestions.
  source        text NOT NULL DEFAULT 'on_demand' CHECK (source IN ('on_demand', 'auto_publish')),

  -- 'pending' = shows in the review UI. 'applied' = organizer opened
  -- the composer prefilled from this draft (records provenance).
  -- 'dismissed' = organizer explicitly rejected it (hidden from the
  -- review UI but retained so the quota keeps counting it).
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

-- Organizers (event owners) and admins can view + manage drafts for
-- their own events. Mirrors the RLS pattern used by `event_speakers` /
-- `event_sponsors` — reach through `events.user_id` + `has_role`.
DROP POLICY IF EXISTS "Owner manage event_creative_ai_drafts"
  ON public.event_creative_ai_drafts;
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
-- The `generate-creative-copy` edge function runs with the service role
-- to insert drafts on behalf of the caller (bypassing the RLS check
-- above so quota counts and inserts stay atomic even when the caller's
-- JWT is short-lived).
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.event_creative_ai_drafts
  TO service_role;

-- Keep `updated_at` fresh on every UPDATE so the UI can show "Applied
-- 2 minutes ago" style timestamps.
DROP TRIGGER IF EXISTS event_creative_ai_drafts_updated_at
  ON public.event_creative_ai_drafts;
CREATE TRIGGER event_creative_ai_drafts_updated_at
  BEFORE UPDATE ON public.event_creative_ai_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
