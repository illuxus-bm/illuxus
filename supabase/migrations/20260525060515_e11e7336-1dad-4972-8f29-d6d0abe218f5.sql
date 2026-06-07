ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS video_fx_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.profiles.video_fx_prefs IS
  'Per-user Studio Effects settings: { lowLight, smoothSkin, brightenFace, bgBlur } each 0-100.';