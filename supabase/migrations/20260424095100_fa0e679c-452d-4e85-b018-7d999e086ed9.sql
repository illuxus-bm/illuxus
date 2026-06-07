-- 1. profiles: add username + headline
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS headline text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL;

-- 2. events: requires_approval, cover_video_url, timezone
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS requires_approval boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cover_video_url text,
  ADD COLUMN IF NOT EXISTS timezone text;

-- 3. registrations: approval_status + qr_code
ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS qr_code text;

-- Backfill qr codes for existing rows
UPDATE public.registrations
SET qr_code = encode(gen_random_bytes(12), 'hex')
WHERE qr_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS registrations_qr_code_unique
  ON public.registrations (qr_code)
  WHERE qr_code IS NOT NULL;

-- Validate approval_status via trigger (avoids immutable CHECK pitfalls if we extend later)
CREATE OR REPLACE FUNCTION public.registrations_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.approval_status NOT IN ('pending','approved','waitlisted','declined') THEN
    RAISE EXCEPTION 'Invalid approval_status: %', NEW.approval_status;
  END IF;
  IF NEW.qr_code IS NULL THEN
    NEW.qr_code := encode(gen_random_bytes(12), 'hex');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS registrations_validate_trigger ON public.registrations;
CREATE TRIGGER registrations_validate_trigger
  BEFORE INSERT OR UPDATE ON public.registrations
  FOR EACH ROW EXECUTE FUNCTION public.registrations_validate();

-- Allow attendees to read their OWN registration rows (so /u/me/events and /t/:id work)
DROP POLICY IF EXISTS "Attendees can view their own registrations" ON public.registrations;
CREATE POLICY "Attendees can view their own registrations"
  ON public.registrations
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Attendees can cancel their own registration" ON public.registrations;
CREATE POLICY "Attendees can cancel their own registration"
  ON public.registrations
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- 4. org_followers
CREATE TABLE IF NOT EXISTS public.org_followers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  org_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, org_id)
);

CREATE INDEX IF NOT EXISTS org_followers_org_idx ON public.org_followers (org_id);
CREATE INDEX IF NOT EXISTS org_followers_user_idx ON public.org_followers (user_id);

ALTER TABLE public.org_followers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view org followers" ON public.org_followers;
CREATE POLICY "Anyone can view org followers"
  ON public.org_followers
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can follow orgs" ON public.org_followers;
CREATE POLICY "Users can follow orgs"
  ON public.org_followers
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can unfollow orgs" ON public.org_followers;
CREATE POLICY "Users can unfollow orgs"
  ON public.org_followers
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
