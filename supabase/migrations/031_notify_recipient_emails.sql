-- ============================================================================
-- 031_notify_recipient_emails.sql
--
-- BUG FIX (QA-01): two notification workflows have been silently sending to
-- zero recipients.
--
-- ── Root cause ─────────────────────────────────────────────────────────────
-- `public.profiles` has NO `email` column. This is by design — the schema
-- says so at 000_full_schema.sql:5064:
--
--     "Email comes from auth.users (profiles.email doesn't exist in this
--      schema)."
--
-- But two client call sites select it anyway:
--
--   1. src/lib/application-notify.ts:101
--        .from("profiles").select("user_id, email").in("user_id", ids)
--      PostgREST rejects the request ("column profiles.email does not
--      exist"). The call site destructures ONLY `data` and ignores `error`,
--      so `profileRows` is null, `emails` resolves to `[]`, and the
--      organiser is never told a speaker/sponsor application arrived. The
--      very problem the helper's own doc comment says it exists to solve
--      ("Most missed applications for days or weeks") still happens.
--
--   2. src/pages/dashboard/SettingsPage.tsx:459
--        .from("profiles").select("email, display_name, first_name, last_name")
--      Same silent failure. Its comment asserts "the `profiles` table
--      mirrors it", which is false. Consequences: the removed teammate never
--      gets the removal notice, AND the follow-up step that revokes their
--      pending `org_invitations` rows never runs, because it is guarded on
--      `if (removedEmail)`.
--
-- Neither failure produces a log line, a toast, or a test failure. They are
-- invisible from the outside, which is why they survived.
--
-- ── Why RPCs rather than adding profiles.email ──────────────────────────────
-- Mirroring emails into `profiles` would duplicate the authoritative value in
-- `auth.users`, need a sync trigger, and drift on email change. Worse, given
-- the profiles SELECT policy it would put every user's email one query away
-- from every other user.
--
-- Instead: two narrow SECURITY DEFINER functions that read `auth.users`
-- directly (the client can never read that table) and return ONLY the small,
-- purpose-scoped set of addresses each workflow needs, each behind its own
-- authorization check.
--
-- ── Anti-harvesting design ─────────────────────────────────────────────────
-- Both functions RETURN AN EMPTY SET rather than RAISE when the caller is not
-- authorized. An exception would let a prober distinguish "not allowed" from
-- "no recipients" and walk event ids to harvest organiser addresses. An empty
-- result is indistinguishable between the two cases.
--
-- Neither function accepts a caller-supplied list of user ids or emails. Each
-- takes a single resource id and derives the recipients server-side, so it
-- cannot be turned into a general-purpose "resolve these users' emails" oracle.
--
-- ── Rollback ───────────────────────────────────────────────────────────────
--     DROP FUNCTION IF EXISTS public.event_application_notify_emails(uuid);
--     DROP FUNCTION IF EXISTS public.org_member_contact(uuid, uuid);
--
-- Reverting restores the prior behaviour (both workflows silently no-op).
-- No table, column, row, or policy is altered by this file.
-- ============================================================================


-- ── 1. Application-notification recipients ─────────────────────────────────
-- Returns the addresses that should hear about a new speaker/sponsor
-- application for one event: the event creator, the owning organisation's
-- owner, and any org_members holding role owner/admin.
--
-- Authorized callers:
--   * a genuine applicant for THIS event — they have a speaker_applications
--     or sponsor_applications row for it. Both dialogs INSERT the application
--     before calling the notifier (SpeakerApplicationDialog.tsx:137 then :187),
--     so the row exists by the time this runs.
--   * the event's own organiser, or a platform admin.
--
-- Anyone else gets an empty set. This is deliberately tighter than "any
-- authenticated user": without the applicant check, a signed-up account could
-- iterate published event ids and collect every organiser's email.
CREATE OR REPLACE FUNCTION public.event_application_notify_emails(_event_id uuid)
RETURNS TABLE (email text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
BEGIN
  IF _caller IS NULL OR _event_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT (
       EXISTS (SELECT 1 FROM public.speaker_applications sa
                WHERE sa.event_id = _event_id AND sa.user_id = _caller)
    OR EXISTS (SELECT 1 FROM public.sponsor_applications sp
                WHERE sp.event_id = _event_id AND sp.user_id = _caller)
    OR EXISTS (SELECT 1 FROM public.events e
                WHERE e.id = _event_id AND e.user_id = _caller)
    OR public.has_role(_caller, 'admin')
  ) THEN
    -- Empty set, never an exception. See "Anti-harvesting design" above.
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT lower(u.email)::text
    FROM auth.users u
   WHERE u.email IS NOT NULL
     AND u.id IN (
           -- event creator
           SELECT e.user_id
             FROM public.events e
            WHERE e.id = _event_id AND e.user_id IS NOT NULL
           UNION
           -- owning organisation's owner
           SELECT o.owner_id
             FROM public.events e
             JOIN public.organizations o ON o.id = e.org_id
            WHERE e.id = _event_id AND o.owner_id IS NOT NULL
           UNION
           -- privileged workspace members
           SELECT m.user_id
             FROM public.events e
             JOIN public.org_members m ON m.org_id = e.org_id
            WHERE e.id = _event_id
              AND m.role IN ('owner', 'admin')
              AND m.user_id IS NOT NULL
         );
END $$;

COMMENT ON FUNCTION public.event_application_notify_emails(uuid) IS
  'Emails to notify about a new speaker/sponsor application for one event (creator + org owner + owner/admin members). Callable by a genuine applicant for that event, the organiser, or a platform admin; returns an empty set otherwise so it cannot be used to harvest organiser addresses. Reads auth.users, which clients cannot query directly. Fixes the silent no-op in src/lib/application-notify.ts.';

-- authenticated only. anon must never reach this — an unauthenticated caller
-- has no applicant relationship and no legitimate need.
REVOKE ALL ON FUNCTION public.event_application_notify_emails(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.event_application_notify_emails(uuid) TO authenticated;


-- ── 2. Single org-member contact lookup ────────────────────────────────────
-- Returns one workspace member's email and display name. Used by the
-- remove-member flow, which needs the email to revoke the member's
-- outstanding `org_invitations` rows and to send the removal notice.
--
-- Authorized callers: the organisation's owner, an org_members row with role
-- owner/admin, or a platform admin. Scoped to a single (org, user) pair, so it
-- cannot enumerate a directory.
--
-- Note the argument order and the org_id requirement: passing the org
-- explicitly is what lets the function verify the CALLER's rights over that
-- org before revealing anything about the target.
CREATE OR REPLACE FUNCTION public.org_member_contact(_org_id uuid, _user_id uuid)
RETURNS TABLE (email text, display_name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
BEGIN
  IF _caller IS NULL OR _org_id IS NULL OR _user_id IS NULL THEN
    RETURN;
  END IF;

  -- Caller must administer this organisation.
  IF NOT (
       EXISTS (SELECT 1 FROM public.organizations o
                WHERE o.id = _org_id AND o.owner_id = _caller)
    OR EXISTS (SELECT 1 FROM public.org_members m
                WHERE m.org_id = _org_id AND m.user_id = _caller
                  AND m.role IN ('owner', 'admin'))
    OR public.has_role(_caller, 'admin')
  ) THEN
    RETURN;
  END IF;

  -- Target must actually belong to this organisation. Without this, an admin
  -- of org A could read the email of any user in org B by passing their id.
  IF NOT EXISTS (
    SELECT 1 FROM public.org_members m
     WHERE m.org_id = _org_id AND m.user_id = _user_id
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT lower(u.email)::text,
         COALESCE(
           NULLIF(p.display_name, ''),
           NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''),
           lower(u.email)::text
         )
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.user_id = u.id
   WHERE u.id = _user_id
     AND u.email IS NOT NULL
   LIMIT 1;
END $$;

COMMENT ON FUNCTION public.org_member_contact(uuid, uuid) IS
  'Email + display name for ONE member of ONE organisation. Callable only by that org''s owner / owner-admin members / platform admins, and only for a user who is actually a member of that org; returns an empty set otherwise. Reads auth.users, which clients cannot query directly. Fixes the silent no-op in SettingsPage.tsx that prevented invitation revocation on member removal.';

REVOKE ALL ON FUNCTION public.org_member_contact(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_member_contact(uuid, uuid) TO authenticated;


-- ── 3. Support-form rate-limit index (SEC-09) ──────────────────────────────
-- `submit-support-ticket` is a public, unauthenticated, service-role endpoint
-- that sends two emails per accepted call. It now throttles per IP by counting
-- that IP's own recent tickets:
--
--     SELECT count(*) FROM support_tickets
--      WHERE ip_hash = $1 AND created_at >= now() - interval '15 minutes'
--
-- The existing indexes cover `lower(email)`, `status`, `created_at`,
-- `category`, `priority` and `assigned_to` — none serves this predicate, so
-- the count would scan. Since the check runs on EVERY submission, including
-- during the flood it exists to stop, it has to be indexed or the throttle
-- becomes its own denial-of-service.
--
-- Column order matters: `ip_hash` is the equality key and must lead;
-- `created_at DESC` then satisfies the range without a sort.
--
-- Partial (`WHERE ip_hash IS NOT NULL`) because `ip_hash` is nullable and the
-- function skips the check entirely when it could not derive an address, so
-- NULL rows are never probed.
CREATE INDEX IF NOT EXISTS idx_support_tickets_ip_hash_created
  ON public.support_tickets(ip_hash, created_at DESC)
  WHERE ip_hash IS NOT NULL;
