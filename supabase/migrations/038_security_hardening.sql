-- ═══════════════════════════════════════════════════════════════════════════════
-- 038_security_hardening.sql
--
-- Closes four data-exposure defects found in the security review. Idempotent:
-- safe to re-run.
--
-- ── SEC-01 (HIGH) — every signed-in user could read every profile ───────────
--   `"Auth can view profiles" … FOR SELECT TO authenticated USING (true)` let
--   any account (sign-up is open) read every user's mobile number, 2FA flag,
--   verification flags, UTM attribution and ban reason straight from
--   `profiles`.
--
--   Fix: a row is readable only by its owner or a platform admin. What other
--   users legitimately see (name, avatar, headline, company, designation —
--   community feed/chat, member lists, team list) is exposed through the
--   `profiles_public` view, which carries only those columns.
--
--   VERIFIED against the codebase before changing the policy:
--     • No SECURITY INVOKER function, RLS policy or view reads `profiles`
--       (every reader is SECURITY DEFINER), so nothing server-side depends on
--       the open policy.
--     • All 25 client queries were audited: own-row reads keep working; the
--       reads of *other* users' rows were moved to `profiles_public`
--       (src/lib/public-profiles.ts); the two admin pages are covered by the
--       admin branch of the new policy.
--
-- ── SEC-02 (HIGH) — `_audit_actor_email(uuid)` returned any user's email ────
--   SECURITY DEFINER, reads auth.users, and was executable by PUBLIC (the
--   Postgres default), i.e. callable through PostgREST by anon. User ids are
--   exposed throughout the app, so this was an email-harvesting oracle.
--   Its only callers are SECURITY DEFINER functions (audit trigger and the
--   admin_* functions), which run as the owner and keep working.
--
-- ── SEC-03 (HIGH) — `communications_diagnose(uuid)` open to all users ───────
--   Granted to `authenticated` with no ownership check: any signed-in user
--   could dispatch another organisation's draft communication and read its
--   audience filter. It is a SQL-Editor troubleshooting helper and is not
--   called by the app, so it is restricted to service_role. The internal
--   `_communications_dispatch_impl` it wraps had the same PUBLIC default and
--   is restricted too (callers: communications_dispatch / _run_scheduled,
--   both SECURITY DEFINER).
--
-- ── SEC-04 (MEDIUM) — internal helpers callable by anyone ───────────────────
--   `_whatsapp_recipient_update` (only edge functions call it, as
--   service_role) and `_copy_community_members_from_previous` (only
--   community_resync_from_previous, SECURITY DEFINER) were PUBLIC-executable.
--   The latter let a caller copy another event's community member list into
--   a community they control.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ─── SEC-01: profiles ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Auth can view profiles"            ON public.profiles;
DROP POLICY IF EXISTS "Users view own profile or admin"   ON public.profiles;

CREATE POLICY "Users view own profile or admin"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin')
);

COMMENT ON POLICY "Users view own profile or admin" ON public.profiles IS
  'A profile row (which holds mobile number, verification and 2FA flags, UTM attribution, ban reason) is readable only by its owner or a platform admin. Other users read the safe columns through the profiles_public view.';

-- The only profile data other signed-in users may see. Deliberately a plain
-- (owner-rights) view — the Postgres default, so no WITH (security_invoker)
-- clause: it must return every user's row even though the table's RLS now
-- hides them, and it exposes no sensitive column.
CREATE OR REPLACE VIEW public.profiles_public AS
SELECT
  user_id,
  display_name,
  first_name,
  last_name,
  username,
  avatar_url,
  headline,
  bio,
  company,
  designation
FROM public.profiles;

REVOKE ALL    ON public.profiles_public FROM PUBLIC, anon;
GRANT  SELECT ON public.profiles_public TO authenticated, service_role;

COMMENT ON VIEW public.profiles_public IS
  'Public-facing subset of profiles (name, avatar, headline, bio, company, designation) for signed-in users: community feed/chat, member lists, team list. Never add contact details, verification/2FA flags or attribution columns here.';


-- ─── SEC-02 / SEC-03 / SEC-04: lock internal functions to service_role ─────
-- Each of these is SECURITY DEFINER and was executable by PUBLIC (Postgres'
-- default) or explicitly by `authenticated`. Their legitimate callers are
-- other SECURITY DEFINER functions (which run as the owner) or edge
-- functions (service_role), so client roles lose nothing.
--
-- Done in a loop that skips any signature not present, so the migration
-- still applies cleanly on a database that has drifted from these files.
DO $$
DECLARE
  sig text;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public._audit_actor_email(uuid)',                              -- SEC-02
    'public.communications_diagnose(uuid)',                         -- SEC-03
    'public._communications_dispatch_impl(uuid)',                   -- SEC-03
    'public._whatsapp_recipient_update(uuid, text, text)',          -- SEC-04
    'public._copy_community_members_from_previous(uuid, uuid)'      -- SEC-04
  ]
  LOOP
    IF to_regprocedure(sig) IS NULL THEN
      RAISE NOTICE '038: % not found, skipping', sig;
    ELSE
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', sig);
      EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO service_role', sig);
    END IF;
  END LOOP;
END $$;


-- ─── Support for the hardened create-participant-account edge function ─────
-- The function used auth.admin.listUsers(), which returns only the first page
-- (50 users), so existing accounts beyond that were not found. This gives the
-- service role an exact lookup instead. Not callable by anon/authenticated:
-- it would otherwise reveal whether an email has an account.
CREATE OR REPLACE FUNCTION public.admin_user_id_by_email(_email text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(trim(_email)) LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_user_id_by_email(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_user_id_by_email(text) TO service_role;

COMMENT ON FUNCTION public.admin_user_id_by_email(text) IS
  'Exact auth.users lookup by email for edge functions running as service_role. Not granted to anon/authenticated (would be an account-existence oracle).';
