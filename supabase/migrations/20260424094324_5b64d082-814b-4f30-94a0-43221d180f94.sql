-- 1) Add account_type column with safe default for backfill
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'organizer';

-- 2) Constrain values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_account_type_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_account_type_check
      CHECK (account_type IN ('attendee', 'organizer'));
  END IF;
END $$;

-- 3) Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_profiles_account_type
  ON public.profiles (account_type);

-- 4) Change column default to 'attendee' going forward (existing rows keep 'organizer')
ALTER TABLE public.profiles
  ALTER COLUMN account_type SET DEFAULT 'attendee';

-- 5) Update handle_new_user trigger to honour signup metadata; default to attendee
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _account_type text;
BEGIN
  _account_type := COALESCE(NEW.raw_user_meta_data->>'account_type', 'attendee');
  IF _account_type NOT IN ('attendee', 'organizer') THEN
    _account_type := 'attendee';
  END IF;

  INSERT INTO public.profiles (user_id, display_name, account_type)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email),
    _account_type
  );
  RETURN NEW;
END;
$function$;