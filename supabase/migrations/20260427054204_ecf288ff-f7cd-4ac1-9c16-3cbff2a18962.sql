UPDATE public.site_content
SET content = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          content,
          '{brandName}',
          '"Illuxus"'::jsonb,
          true
        ),
        '{tagline}',
        '"The modern event platform."'::jsonb,
        true
      ),
      '{copyright}',
      '"© 2026 Illuxus. All rights reserved."'::jsonb,
      true
    ),
    '{columns,1,links,1,href}',
    '"mailto:hello@illuxus.com"'::jsonb,
    true
  ),
  '{columns,1,links,1,label}',
  '"Contact"'::jsonb,
  true
),
updated_at = now()
WHERE section = 'footer';

UPDATE public.site_content
SET content = jsonb_set(
  content,
  '{items}',
  '[
    {"role": "Head of Events, Lumen", "quote": "We replaced four tools with Illuxus. Setup took an afternoon.", "author": "Aria Chen", "avatarUrl": ""},
    {"role": "Operations, NorthBeat", "quote": "Door check-in went from chaos to calm. The QR scanner is excellent.", "author": "Marcus Reyes", "avatarUrl": ""},
    {"role": "Founder, DevHaus", "quote": "Our sponsors finally get the visibility they pay for.", "author": "Priya Shah", "avatarUrl": ""}
  ]'::jsonb,
  true
),
updated_at = now()
WHERE section = 'testimonials';