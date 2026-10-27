# QA and Application Security Review

**Repository:** illuxus  
**Branch / commit:** `main` / `ad13829` (2026-10-20)  
**Review date:** 2026-10-27  
**Approach:** Read-only static review of application, Supabase, API, deployment, test, and documentation paths. No live services or database were accessed; no tests or builds were run.

## Executive summary

The codebase has several good security controls, including a shared edge-function identity helper, hardened event slug visibility, HTML sanitization, a same-origin redirect helper, and signature checks on provider webhooks. Those controls are not applied consistently across the platform.

**Do not enable paid ticket sales or describe the current login-time email code as enforced two-factor authentication until the critical and high findings below are fixed.** The public guest-registration function can create an approved ticket for a paid event without receiving payment. A second direct database path lets any signed-in user insert registration rows for arbitrary events. Several service-role email and WhatsApp functions also trust possession of the public project JWT rather than authorizing a user.

| Priority | Findings | Main risk |
|---|---:|---|
| Critical | 1 | Free approved tickets for paid events; capacity and revenue integrity |
| High | 3 | 2FA bypass, unauthorized privileged messaging, unverified account provisioning |
| Medium | 5 | Public draft/reaction access, privileged community creation, resource abuse |
| QA / release | 3 | No CI/typecheck gate, missing CSP, manual SQL outside migration history |

## Findings

### F-01 — Critical: Paid events issue approved tickets without payment

**Evidence:** `guest-registration` accepts requests for any published event, and its event lookup does not load or check the event price. It inserts an approved registration when approval is not required. The database trigger then explicitly sets `approval_status = 'approved'` whenever `events.price > 0`. The confirmation path sends the QR when status is approved. There is no payment or checkout implementation under `src/` or `supabase/functions/`.

Relevant locations:

- `supabase/functions/guest-registration/index.ts` — event eligibility and insert flow around lines 426–461; row insertion around 641–647.
- `supabase/migrations/000_full_schema.sql` — `registrations_validate()` around lines 9679–9702.
- `supabase/migrations/000_full_schema.sql` — `registrations` grants and RLS around lines 335–341. Any authenticated user can insert a row with their own `user_id` or `NULL`, without an event-manager, event-status, payment, or capacity check.
- `src/components/EventRsvpCard.tsx` — a priced event's button still invokes the registration flow; the price changes the button label only.

**Impact:** A visitor can receive an approved ticket/QR for an event advertised with a nonzero price without paying. A signed-in user can also bypass the public function's rate limits and capacity checks by inserting directly through PostgREST. This risks organizer revenue, attendee disputes, and over-capacity events. Public pages make concrete Stripe, Razorpay, UPI, refund, and tax-invoice claims that the repository does not implement; `docs/COMPLIANCE.md` already records this mismatch.

**Fix:** Until a payment integration exists, block registration for events with `price > 0` and remove the payment claims. When implemented, create the registration as pending, verify payment server-side through a signed provider webhook, and only then approve/issue the QR. Remove direct attendee INSERT access to `registrations`, or constrain inserts to a server-controlled flow; enforce capacity and event visibility in the same trusted transaction.

### F-02 — High: Login-time “2FA” does not gate the authenticated session

**Evidence:** Login calls Supabase password sign-in and receives a session before checking `profiles.two_factor_enabled`. It then opens a React dialog to request an email OTP. `AuthContext` stores any Supabase session immediately, and `ProtectedRoute` checks only whether `user` exists. The dialog's OTP verification changes UI flow but does not establish a Supabase MFA assurance level that the database or edge functions require.

Relevant locations:

- `src/pages/LoginPage.tsx` — sign-in/session handling around lines 397–445.
- `src/components/auth/TwoFactorChallengeDialog.tsx` — email OTP around lines 47–75.
- `src/contexts/AuthContext.tsx` — session is accepted in `onAuthStateChange` around lines 91–128.
- `src/App.tsx` — `ProtectedRoute` relies on a non-null user around lines 218–224.

**Impact:** Someone with the password can use the already-issued access token directly against PostgREST and edge functions without completing the dialog. A browser redirect is not an authorization boundary.

**Fix:** Use Supabase's native MFA flow and require the elevated assurance level for protected routes, RLS access, and privileged edge functions. Do not persist or authorize a full application session until the second factor is verified. Treat any client-only `must_change_password` flag similarly; user metadata is not a server-enforced control.

### F-03 — High: Public project JWTs can invoke service-role mail and messaging actions

**Evidence:** `verify_jwt = true` only establishes that the request has a project-signed JWT; the publishable/anon key is public and is sent by the browser. These handlers create a service-role client and act on caller-supplied IDs without resolving the caller or checking tenant ownership. For example, `send-email` loads a communication and all its recipients by `communication_id`, then sends to pending recipients. `send-communication-email` and `send-whatsapp` follow the same privileged pattern. The shared `_shared/auth.ts` helper is not used in these handlers.

Affected functions include:

- `supabase/functions/send-email/index.ts`
- `supabase/functions/send-communication-email/index.ts`
- `supabase/functions/send-whatsapp/index.ts`
- `supabase/functions/send-ticket-email/index.ts`
- `supabase/functions/send-speaker-invite-email/index.ts`
- `supabase/functions/send-sponsor-invite-email/index.ts`
- `supabase/functions/notify-venue-selection/index.ts`
- `supabase/functions/notify-organizer-venue-response/index.ts`

**Impact:** A caller with only the public project key can trigger campaign delivery, WhatsApp sends, ticket/invitation emails, or repeat venue notifications if they obtain a target row ID. This can expose private communication content to intended recipients, spam users, and incur provider costs. The database-triggered notification path also accepts direct client calls, so it needs an internal authorization mechanism.

**Fix:** For user actions, resolve the JWT to a user with `getCallerUser()` and verify event/workspace membership and target-row relationships before using service role. For database-triggered work, require a signed internal secret or another non-public service identity, and make delivery idempotent. Add per-user and per-target rate limits. Use the guarded `send-event-email` implementation as a pattern.

### F-04 — High: Organizers can provision an account for an unverified email and link other events' registrations

**Evidence:** `create-participant-account` correctly checks that the caller manages the event and that the requested email matches that event's registration. It then creates a confirmed auth account using an organizer-supplied password (`email_confirm: true`). Afterward it links every unclaimed registration with the same email, with no `event_id` predicate.

Relevant location: `supabase/functions/create-participant-account/index.ts` around lines 121–165.

**Impact:** A malicious event manager can add a registration under another person's email, create a confirmed account with a password they know, and attach the person's unclaimed registrations from other events to that account. The participant email is never proven before the account is confirmed; `must_change_password` is only a client-side flow.

**Fix:** Require the participant to prove email ownership through a single-use activation link before creating/confirming an account. Do not let an organizer choose a durable account password. Scope registration linking to the authorized event unless the participant has completed verified self-service account activation.

### F-05 — Medium: Anonymous users can read and forge webinar reactions

**Evidence:** The webinar migration first creates session-member-only reaction policies, but the later `018_fix_webinar_reactions.sql` section drops those policies, grants `anon` SELECT/INSERT, and replaces them with `USING (true)` and `WITH CHECK (true)` (`supabase/migrations/000_full_schema.sql`, around lines 6852–6863).

**Impact:** An anonymous caller can read reaction rows and insert arbitrary reactions for any session ID. This permits reaction spam and pollutes event analytics; no session membership, token, or rate limit is checked.

**Fix:** Authorize reactions through a session-scoped guest credential or authenticated attendee check. Apply rate limits and validate permitted emoji values. Avoid public SELECT of raw reaction records unless the product needs it; expose aggregate counts instead.

### F-06 — Medium: Public `site_content` reads include unpublished drafts

**Evidence:** The schema and the active `RUN_ME_site_editor_fix.sql` grant `anon` and `authenticated` SELECT on the whole `site_content` table with a public `USING (true)` policy. The table includes both `content` and `draft_content`. The public hook selects only `section, content`, but direct PostgREST clients can request `draft_content`.

Relevant locations:

- `supabase/RUN_ME_site_editor_fix.sql` around lines 30–33.
- `supabase/migrations/000_full_schema.sql` around lines 397–408.
- `src/pages/dashboard/admin/SiteEditorPage.tsx` reads `draft_content` around lines 817–830.

**Impact:** Any anonymous visitor can read unpublished copy and site-editor drafts. The argument-name fix in the SQL file matches the current RPC call names, but it does not close this disclosure.

**Fix:** Revoke public table-level SELECT and expose only published `content` through a narrowly scoped view or RPC. Keep drafts available only to platform admins. Treat the view/RPC as the public read contract.

### F-07 — Medium: Public OG edge function returns unpublished event details

**Evidence:** `supabase/config.toml` sets `og-event` to `verify_jwt = false`. The handler uses the service-role key, queries events by caller-supplied ID or slug, and selects title/date/location/banner/status without filtering for `published` or otherwise authorizing a draft preview. There is no later status check in the handler.

Relevant location: `supabase/functions/og-event/index.ts` around lines 420–480.

**Impact:** Anyone who knows or guesses an unpublished event ID or slug can generate a public share card containing its title, date, venue, and image. This bypasses table RLS because the function uses service role.

**Fix:** Require `status = 'published'` in the public query. If organizer previews are needed, use a separate authenticated preview path with event-manager authorization.

### F-08 — Medium: Any signed-in user can create a community for another user's event

**Evidence:** `ensure_event_community(uuid)` is `SECURITY DEFINER` and explicitly granted to `authenticated` (`000_full_schema.sql` around lines 2306–2355 and 2563–2564). The final replacement around lines 3802–3853 loads an event by ID and creates a community without checking the caller's ownership or membership. It also bypasses the event's `create_community` option when called directly; that option is only handled by the trigger path.

**Impact:** A user who knows an event UUID can cause a public community to be created for another organizer's event, even when the organizer disabled community creation. This can expose draft event naming and create unwanted public content surfaces.

**Fix:** Make the helper trigger-only by revoking client EXECUTE, or add an explicit event-manager check and enforce `create_community` inside the function itself.

### F-09 — Medium: `seed-cities` is a public, expensive service-role operation

**Evidence:** `seed-cities` creates a service-role client, contains no auth check, downloads GeoNames datasets, parses the full archive, and upserts the result. The code comment explicitly says “allow any caller.” The function has no rate limit or request-size control.

Relevant location: `supabase/functions/seed-cities/index.ts` around lines 55–130.

**Impact:** Anyone with the public project JWT can repeatedly trigger large upstream downloads and bulk database writes, consuming function/database resources and refreshing global reference data.

**Fix:** Remove this function from the public surface or require platform-admin authorization. Prefer a scheduled, signed operational job with strict timeout and a single-flight lock.

## QA and release findings

### Q-01 — No CI pipeline or TypeScript typecheck gate

There is no tracked `.github/workflows` pipeline, and `package.json` has no `typecheck` script. The production build uses Vite/SWC, which transpiles TypeScript without type-checking it. `tsconfig.app.json` has `strict: false` and `noImplicitAny: false`. There are many unit/property tests, but only one end-to-end spec under `tests/e2e/`, and this review did not execute any tests.

**Fix:** Add a CI workflow that runs typecheck, lint, unit tests, build, SQL/static security checks, and a small deterministic E2E suite against a controlled fixture database. Avoid a test that depends on a live public event slug.

### Q-02 — Missing Content-Security-Policy

`vercel.json` sets HSTS, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, and `Permissions-Policy`, but no Content-Security-Policy. The README also records this as open. CSP would not repair the authorization defects above, but it would reduce the impact of a future script injection.

**Fix:** Start with a tested `Content-Security-Policy-Report-Only`, then enforce a policy built around the actual Supabase, video, analytics, font, and image origins.

### Q-03 — The site-editor repair is a manual SQL script, outside migration history

`supabase/RUN_ME_site_editor_fix.sql` is a manual Supabase SQL Editor script, while `supabase/migrations/` contains only `000_full_schema.sql`. The baseline schema already has the current RPC argument names, so this manual patch addresses deployment drift that cannot be reproduced or tracked by the normal migration sequence.

**Fix:** Convert the repair into a numbered forward migration that safely handles the existing function signatures, or document and record the production schema version after the one-time repair. Keep the public `site_content` draft access fix in that same release change.

## Positive controls observed

- `src/lib/safe-redirect.ts` validates redirects with the URL parser and compares origins.
- Rich text sinks use `sanitizeHtml` / `renderRichText`; the sanitizer has a restrictive allowlist.
- `supabase/functions/_shared/auth.ts` provides caller identity and event/workspace authorization helpers, and several privileged functions use them correctly.
- LiveKit and Meta webhook handlers perform provider signature validation.
- The tracked-file inventory contains `.env.example` but no tracked `.env`, private-key, or certificate files. This was a filename-based check, not a dedicated secret-scanning pass.

## Review scope and limits

The Git inventory contains **694 tracked files**: 684 UTF-8 text files (about 224,797 lines) and 10 binary files. I inventoried the full tree and performed broad searches plus focused source review of database policy/trigger code, service-role edge functions, auth/session flows, public event registration, public APIs, build/deployment configuration, and prior audit documents. This was **not a literal line-by-line manual review of all 684 text files**; generated assets and media were not inspected. No live Supabase policy state, production configuration, service provider, dependency advisory database, test suite, or build was checked. Findings are source-level and should be confirmed against the deployed Supabase schema and enabled function set before remediation is closed.

## Remediation order

1. Disable priced-event registration or implement verified payment before ticket approval.
2. Fix the 2FA session boundary and public service-role messaging endpoints.
3. Replace organizer-created confirmed accounts with participant-verified activation and scope registration linking.
4. Restrict the public reaction, site-content, OG, community, and city-seed surfaces.
5. Add CI/typecheck/security checks, then update the historical audit reports and validate the deployed database state.
