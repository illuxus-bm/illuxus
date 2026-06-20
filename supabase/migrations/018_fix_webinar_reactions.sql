-- Make user_id nullable in webinar_reactions to support anonymous guests
ALTER TABLE public.webinar_reactions ALTER COLUMN user_id DROP NOT NULL;

-- Grant access to anonymous users
GRANT SELECT, INSERT ON public.webinar_reactions TO anon;

-- Simplify and update policies to allow both authenticated and anon users to react
DROP POLICY IF EXISTS "Read reactions" ON public.webinar_reactions;
DROP POLICY IF EXISTS "Post reactions" ON public.webinar_reactions;

CREATE POLICY "Read reactions" ON public.webinar_reactions FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "Post reactions" ON public.webinar_reactions FOR INSERT TO authenticated, anon WITH CHECK (true);
