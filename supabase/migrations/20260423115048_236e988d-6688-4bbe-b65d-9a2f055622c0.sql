
-- 1. Add slug column
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS slug text;

-- 2. Slugify helper
CREATE OR REPLACE FUNCTION public.slugify(_input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT trim(both '-' from
    regexp_replace(
      regexp_replace(lower(coalesce(_input, '')), '[^a-z0-9]+', '-', 'g'),
      '-+', '-', 'g'
    )
  );
$$;

-- 3. Generate unique slug within an org (or globally if org_id is null)
CREATE OR REPLACE FUNCTION public.generate_event_slug(_title text, _org_id uuid, _event_id uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  _base text;
  _candidate text;
  _i int := 0;
BEGIN
  _base := public.slugify(_title);
  IF _base IS NULL OR _base = '' THEN
    _base := 'event';
  END IF;
  -- truncate base to keep URLs reasonable
  _base := substring(_base from 1 for 60);
  _candidate := _base;

  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.events
      WHERE slug = _candidate
        AND (_org_id IS NULL OR org_id IS NOT DISTINCT FROM _org_id)
        AND (_event_id IS NULL OR id <> _event_id)
    );
    _i := _i + 1;
    _candidate := _base || '-' || _i;
  END LOOP;

  RETURN _candidate;
END;
$$;

-- 4. Trigger to auto-fill / sanitise slug on insert+update
CREATE OR REPLACE FUNCTION public.events_set_slug()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _clean text;
BEGIN
  IF NEW.slug IS NOT NULL AND length(trim(NEW.slug)) > 0 THEN
    _clean := public.slugify(NEW.slug);
    IF _clean = '' THEN
      _clean := public.slugify(NEW.title);
    END IF;
  ELSE
    _clean := public.slugify(NEW.title);
  END IF;

  IF _clean IS NULL OR _clean = '' THEN
    _clean := 'event';
  END IF;

  -- Ensure uniqueness within org
  IF EXISTS (
    SELECT 1 FROM public.events
    WHERE slug = _clean
      AND org_id IS NOT DISTINCT FROM NEW.org_id
      AND id <> NEW.id
  ) THEN
    _clean := public.generate_event_slug(_clean, NEW.org_id, NEW.id);
  END IF;

  NEW.slug := _clean;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_events_set_slug ON public.events;
CREATE TRIGGER trg_events_set_slug
  BEFORE INSERT OR UPDATE OF slug, title, org_id ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.events_set_slug();

-- 5. Backfill existing events
DO $$
DECLARE
  r record;
  _new_slug text;
BEGIN
  FOR r IN SELECT id, title, org_id FROM public.events WHERE slug IS NULL OR slug = '' LOOP
    _new_slug := public.generate_event_slug(r.title, r.org_id, r.id);
    UPDATE public.events SET slug = _new_slug WHERE id = r.id;
  END LOOP;
END $$;

-- 6. Make slug not-null and add unique index per org
ALTER TABLE public.events ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS events_slug_org_unique ON public.events (org_id, slug);
CREATE INDEX IF NOT EXISTS events_slug_idx ON public.events (slug);

-- 7. Public lookup: slug -> event id (anyone can resolve a published event)
CREATE OR REPLACE FUNCTION public.get_event_by_slug(_slug text, _org_slug text DEFAULT NULL)
RETURNS TABLE(id uuid, slug text, org_id uuid, status text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.slug, e.org_id, e.status
  FROM public.events e
  LEFT JOIN public.organizations o ON o.id = e.org_id
  WHERE e.slug = lower(_slug)
    AND (_org_slug IS NULL OR o.slug = _org_slug OR o.subdomain = _org_slug)
  ORDER BY (e.status = 'published') DESC
  LIMIT 1;
$$;
