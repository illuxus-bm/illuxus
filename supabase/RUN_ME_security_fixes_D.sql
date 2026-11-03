-- ═══════════════════════════════════════════════════════════════════════════════
-- Security fixes, browser review C (2026-11-03): links people can save.
--
-- A community member could save a `javascript:` URL as a post link or a
-- resource file URL; the app rendered it as a clickable link, and clicking it
-- ran script on illuxus.com (stored XSS). The app now refuses such URLs when
-- showing them (src/lib/safe-url.ts) and the site's Content-Security-Policy
-- blocks javascript: URLs; this makes the database refuse to store them too.
--
--   • community_posts.link_url      — http(s) links only;
--   • community_resources.file_url  — https only (the app stores the file's
--                                      public storage URL).
--
-- Existing post links that aren't http(s) are cleared first. Safe to run more
-- than once. Paste the whole file into the Supabase SQL Editor and Run.
-- ═══════════════════════════════════════════════════════════════════════════════

UPDATE public.community_posts
   SET link_url = NULL
 WHERE link_url IS NOT NULL AND link_url !~* '^https?://[^[:space:]]+$';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'community_posts_link_url_http') THEN
    ALTER TABLE public.community_posts
      ADD CONSTRAINT community_posts_link_url_http
      CHECK (link_url IS NULL OR link_url ~* '^https?://[^[:space:]]+$');
  END IF;

  -- NOT VALID: rows saved before this aren't checked (file_url is required, so
  -- they can't simply be cleared); every new or edited row is.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'community_resources_file_url_https') THEN
    ALTER TABLE public.community_resources
      ADD CONSTRAINT community_resources_file_url_https
      CHECK (file_url ~* '^https://[^[:space:]]+$') NOT VALID;
  END IF;
END;
$$;
