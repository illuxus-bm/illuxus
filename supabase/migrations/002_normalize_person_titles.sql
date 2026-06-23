-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 002: normalise legacy person titles.
--
-- The `_validate_person_title` trigger (see 000_full_schema.sql) only accepts
-- titles in the set ('Mr','Ms','Mrs','Prefer not to say'). Earlier UI revisions
-- of RegistrantQuickView wrote the dotted forms ('Mr.', 'Ms.', 'Mrs.',
-- 'Prefer Not to Say') so saves now fail with "Invalid title: Mr." until the
-- existing rows are rewritten to the canonical form.
--
-- The UPDATE goes through the same trigger; the new values are in the allowed
-- set so it accepts them. Re-running this migration is a no-op once the data
-- has been normalised.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  tbl  text;
  tbls text[] := ARRAY['registrations', 'speakers', 'sponsor_members', 'profiles'];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'title'
    ) THEN
      EXECUTE format($f$
        UPDATE public.%I SET title = CASE title
          WHEN 'Mr.'                THEN 'Mr'
          WHEN 'Ms.'                THEN 'Ms'
          WHEN 'Mrs.'               THEN 'Mrs'
          WHEN 'Prefer Not to Say'  THEN 'Prefer not to say'
          WHEN 'prefer not to say'  THEN 'Prefer not to say'
          WHEN ''                   THEN NULL
          ELSE title
        END
        WHERE title IN (
          'Mr.', 'Ms.', 'Mrs.', 'Prefer Not to Say', 'prefer not to say', ''
        );
      $f$, tbl);
    END IF;
  END LOOP;
END $$;
