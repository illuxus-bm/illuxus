-- ─────────────────────────────────────────────────────────────────────────────
-- 028_session_speakers_owner_manage.sql
--
-- Fixes a real bug: organizers could not attach MULTIPLE speakers to an
-- agenda session. `SessionManagement.tsx`'s save flow does:
--
--   await supabase.from("session_speakers").delete().eq("session_id", id);
--   await supabase.from("session_speakers").insert([{ session_id, speaker_id, position }, ...]);
--
-- `public.session_speakers` has Row-Level Security ENABLED (000_full_schema.sql)
-- but only ever had a SELECT policy:
--
--   CREATE POLICY "Auth view session_speakers" ON public.session_speakers
--     FOR SELECT TO authenticated USING(true);
--
-- Per Postgres RLS semantics, once RLS is enabled on a table, EVERY
-- operation with no matching policy is denied by default — regardless of
-- the plain SQL-privilege GRANTs also present in that same migration
-- (`GRANT SELECT,INSERT,UPDATE,DELETE ON public.session_speakers TO
-- authenticated`). A GRANT only says a role is ALLOWED to attempt the
-- statement; RLS policies then decide whether any row actually qualifies.
-- With no INSERT/UPDATE/DELETE policy, every delete/insert against this
-- table silently affected zero rows for every organizer, including the
-- event owner — the UI's speaker checkboxes appeared to "not save."
--
-- The sibling junction tables `event_speakers` / `event_sponsors` (same
-- migration) and `webinar_speakers` (also same migration) all correctly
-- ship an owner-scoped `FOR ALL` policy alongside their SELECT policy.
-- This migration brings `session_speakers` in line with that established
-- pattern, reusing the same `is_event_owner(uuid, uuid)` helper —
-- reached through `sessions.event_id` since `session_speakers` itself has
-- no `event_id` column of its own.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Owner manage session_speakers" ON public.session_speakers;

CREATE POLICY "Owner manage session_speakers"
  ON public.session_speakers
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_speakers.session_id
        AND is_event_owner(auth.uid(), s.event_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_speakers.session_id
        AND is_event_owner(auth.uid(), s.event_id)
    )
  );
