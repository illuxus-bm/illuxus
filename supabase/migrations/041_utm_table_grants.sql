-- ═══════════════════════════════════════════════════════════════════════════════
-- 041_utm_table_grants.sql
--
-- `utm_links` and `utm_clicks` were created with row-level-security policies
-- but without table privileges for signed-in users. RLS policies only narrow
-- access that a GRANT has already given, so every save of a tracked link
-- failed with "permission denied for table utm_links", and the UTM page could
-- not read saved links or recent clicks directly.
--
-- Who may touch which rows is unchanged — the existing policies still limit
-- everything to the event's creator, its organisation's members and admins.
-- `utm_clicks` stays read-only for clients (clicks are written by the
-- record-click function and removed by delete_utm_tracking).
--
-- Idempotent — safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════════

GRANT SELECT, INSERT, UPDATE, DELETE ON public.utm_links  TO authenticated;
GRANT ALL                            ON public.utm_links  TO service_role;

GRANT SELECT                         ON public.utm_clicks TO authenticated;
GRANT ALL                            ON public.utm_clicks TO service_role;

NOTIFY pgrst, 'reload schema';
