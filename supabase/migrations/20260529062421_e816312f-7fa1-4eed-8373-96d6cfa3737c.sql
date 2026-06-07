ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS banner_landscape_url text,
  ADD COLUMN IF NOT EXISTS banner_portrait_url text;