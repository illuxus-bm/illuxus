-- ═══════════════════════════════════════════════════════════════════════════════
-- 048_session_moderator.sql
--
-- A session can have a moderator, kept apart from its speakers / panellists.
--
--   `session_speakers.role` — 'speaker' (every existing row, and the default)
--   or 'moderator'. A session has at most one moderator; the partial unique
--   index enforces it. The organiser turns the moderator on per session in
--   the agenda editor, and the public agenda shows the moderator first, then
--   the panellists.
--
-- Additive only: existing links stay speakers, and readers that don't know
-- the column keep working.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.session_speakers
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'speaker';

ALTER TABLE public.session_speakers
  DROP CONSTRAINT IF EXISTS session_speakers_role_check;
ALTER TABLE public.session_speakers
  ADD CONSTRAINT session_speakers_role_check CHECK (role IN ('speaker', 'moderator'));

CREATE UNIQUE INDEX IF NOT EXISTS session_speakers_one_moderator
  ON public.session_speakers (session_id)
  WHERE role = 'moderator';
