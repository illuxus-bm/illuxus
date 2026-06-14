-- ═══════════════════════════════════════════════════════════════════════════════
-- 009_application_toggles.sql
--
-- Adds per-event enable/disable flags for the public Call-for-Speakers and
-- Call-for-Sponsors CTAs. Organisers and platform admins toggle these from
-- the event Settings tab to open or close applications without having to
-- unpublish the event.
--
-- Behaviour
--   * Both columns default to TRUE so every existing event keeps its current
--     behaviour (CTAs visible) without needing a backfill.
--   * The frontend hides the corresponding CTA when its flag is FALSE.
--   * Existing speaker_applications / sponsor_applications rows are
--     untouched; this migration only gates new submissions.
--
-- Reversibility: drop the two columns to revert. No data loss because nothing
-- else references them yet.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS speaker_applications_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sponsor_applications_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.events.speaker_applications_enabled IS
  'When false, the public event page hides the "Apply as Speaker" CTA. Defaults to true so existing events keep accepting applications until the organiser explicitly closes them.';

COMMENT ON COLUMN public.events.sponsor_applications_enabled IS
  'When false, the public event page hides the "Become a Sponsor" CTA. Defaults to true so existing events keep accepting applications until the organiser explicitly closes them.';
