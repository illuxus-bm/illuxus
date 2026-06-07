ALTER TABLE public.event_speakers ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.event_sponsors ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;

WITH ordered AS (
  SELECT id, row_number() OVER (PARTITION BY event_id ORDER BY created_at, id) - 1 AS rn
  FROM public.event_speakers
)
UPDATE public.event_speakers es SET display_order = ordered.rn
FROM ordered WHERE es.id = ordered.id;

WITH ordered AS (
  SELECT id, row_number() OVER (PARTITION BY event_id ORDER BY created_at, id) - 1 AS rn
  FROM public.event_sponsors
)
UPDATE public.event_sponsors es SET display_order = ordered.rn
FROM ordered WHERE es.id = ordered.id;

CREATE INDEX IF NOT EXISTS event_speakers_event_order_idx ON public.event_speakers(event_id, display_order);
CREATE INDEX IF NOT EXISTS event_sponsors_event_order_idx ON public.event_sponsors(event_id, display_order);