ALTER TABLE public.registrations
  ADD COLUMN checked_in boolean NOT NULL DEFAULT false,
  ADD COLUMN checked_in_at timestamp with time zone;