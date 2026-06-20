-- ═══════════════════════════════════════════════════════════════════════════════
-- 014_video_provider.sql
--
-- Per-event override for the live video provider used by the in-house webinar
-- studio. NULL means "use the platform default" (resolved by the client via
-- VITE_WEBINAR_PROVIDER, falling back to 'livekit').
--
-- Allowed values today: 'livekit' | 'agora'.
--
-- This is the canary knob: organisers can flip a single event to Agora to
-- validate the cut-over before the platform default is changed. The frontend
-- reads it with getWebinarProvider({ eventOverride: events.video_provider }).
--
-- Reversibility: drop the column to revert. No data loss because nothing else
-- references it.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS video_provider text;

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_video_provider_check;
ALTER TABLE public.events
  ADD CONSTRAINT events_video_provider_check
  CHECK (video_provider IS NULL OR video_provider IN ('livekit', 'agora'));

COMMENT ON COLUMN public.events.video_provider IS
  'Per-event override for the live video provider. NULL means "use platform default" (VITE_WEBINAR_PROVIDER). Today only ''livekit'' and ''agora'' are accepted.';
