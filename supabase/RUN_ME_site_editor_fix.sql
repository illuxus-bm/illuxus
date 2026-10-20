-- ═══════════════════════════════════════════════════════════════════════════════
-- Site editor fix: "Could not find the function public.save_site_draft(_content,
-- _section) in the schema cache".
--
-- The site editor calls save_site_draft(_section, _content),
-- publish_site_section(_section) and discard_site_draft(_section). The
-- database has these functions with differently named parameters (_s, _c),
-- so the API can't match the call. Postgres can't rename parameters with
-- CREATE OR REPLACE, so the old versions are dropped and recreated.
--
-- Safe to run more than once. Paste into the Supabase SQL Editor and Run.
-- ═══════════════════════════════════════════════════════════════════════════════

-- What the functions need from site_content, in case an older database lacks it.
CREATE TABLE IF NOT EXISTS public.site_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  draft_content jsonb,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.site_content ADD COLUMN IF NOT EXISTS draft_content jsonb;
ALTER TABLE public.site_content ADD COLUMN IF NOT EXISTS published_at timestamptz;
ALTER TABLE public.site_content ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
-- ON CONFLICT (section) needs a unique index on section.
CREATE UNIQUE INDEX IF NOT EXISTS site_content_section_key ON public.site_content (section);

ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone view site_content" ON public.site_content;
CREATE POLICY "Anyone view site_content" ON public.site_content FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.site_content TO anon, authenticated;

-- Old versions (either argument order), then the ones the app calls.
DROP FUNCTION IF EXISTS public.save_site_draft(text, jsonb);
DROP FUNCTION IF EXISTS public.save_site_draft(jsonb, text);
DROP FUNCTION IF EXISTS public.publish_site_section(text);
DROP FUNCTION IF EXISTS public.discard_site_draft(text);

CREATE OR REPLACE FUNCTION public.save_site_draft(_section text, _content jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  INSERT INTO public.site_content (section, content, draft_content)
  VALUES (_section, '{}'::jsonb, _content)
  ON CONFLICT (section) DO UPDATE SET draft_content = EXCLUDED.draft_content, updated_at = now();
END; $$;

CREATE OR REPLACE FUNCTION public.publish_site_section(_section text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _d jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT draft_content INTO _d FROM public.site_content WHERE section = _section;
  IF _d IS NULL THEN RAISE EXCEPTION 'No draft'; END IF;
  UPDATE public.site_content
     SET content = _d, draft_content = NULL, published_at = now(), updated_at = now()
   WHERE section = _section;
END; $$;

CREATE OR REPLACE FUNCTION public.discard_site_draft(_section text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  UPDATE public.site_content SET draft_content = NULL, updated_at = now() WHERE section = _section;
END; $$;

REVOKE ALL ON FUNCTION public.save_site_draft(text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.publish_site_section(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.discard_site_draft(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_site_draft(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_site_section(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.discard_site_draft(text) TO authenticated;

-- Make the API see the new functions immediately.
NOTIFY pgrst, 'reload schema';
