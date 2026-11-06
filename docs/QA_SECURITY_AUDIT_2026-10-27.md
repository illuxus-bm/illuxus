# QA and Application Security Audit

**Repository:** illuxus
**Branch / commit:** main / 3691a3b
**Review date:** 2026-11-03
**Review type:** Repository-level source, configuration, SQL and test review. No production systems were accessed.

## Executive summary

I rechecked the current source for the nine findings in the 2026-10-27 audit. Their principal code fixes are present in this checkout. This does not establish that those fixes or later changes are deployed to Supabase or Vercel.

The current review found six medium-severity risks:

| ID | Area | Summary |
|---|---|---|
| F-10 | Privacy / sponsor sharing | Sharing can expose contact details for every eligible attendee and unregistered speaker without an attendee opt-in in the current UI or final SQL path. Copied snapshots are not tied to source-row deletion. |
| F-11 | CSV export | Sponsor CSV export does not neutralize all spreadsheet formula-triggering prefixes. |
| F-12 | Server-side fetching | The public event-card function fetches organizer-supplied image URLs without destination or response-size controls. |
| F-13 | Public support endpoint | Anonymous support submissions create database rows and send email without a rate limit or abuse challenge. |
| F-14 | Rate limiting | The shared edge-function limiter checks and inserts in separate requests, so concurrent calls can exceed its configured limits. |
| F-15 | Webinar reactions | Anonymous users can read reaction metadata for every session because the SELECT policy is unconditional. |

No critical or high-severity issue was confirmed in the reviewed paths. This is a source-level audit, not a penetration test, and the rating does not imply the deployed system is safe.

## Remediation status, 7 November 2026

F-10 to F-15 are fixed in the source. None of the fixes is deployed yet.

| ID | Fix | Tests |
|---|---|---|
| F-10 | Registration forms ask a separate, optional question: share my email, mobile and LinkedIn with the event's sponsors. Signed-in and guest forms both ask it, unticked. Migration 079 records each answer, its time and its wording, and only the registrant (or the guest-registration server) can say yes. Shares list everyone but carry contact details only for people who agreed; listed speakers who never registered get none. A registrant can change their answer on their ticket, and withdrawing removes their details from shares already made. Copies are deleted when a share is revoked or replaced, and when a registration or speaker is deleted. Organisers see how many people haven't agreed. The Privacy Policy describes this (version 3.2). | `supabase/tests/079_sponsor_share_consent.test.mjs` (14), plus component and client tests |
| F-11 | The sponsor CSV marks as text any value starting with `=` `+` `-` `@`, tab, CR, LF or NUL, or their full-width forms. It quotes tabs, separators and line breaks (`src/lib/csv-safety.ts`). | `csv-safety.test.ts` (25), `data-sharing.test.ts` |
| F-12 | og-event fetches banners only from the project's own public Storage. It doesn't follow redirects, reads at most 8 MB, and decodes only images up to 6000 px per side and 24 MP (size read from the header first). Anything else gets the brand gradient (`og-event/image-guard.ts`). | `og-event-image-guard.test.ts` (19) |
| F-13 | submit-support-ticket reads at most 64 KB before parsing. It takes the client address from `cf-connecting-ip` first, and has a 200-an-hour cap across everyone, on top of the per-address and per-email limits and the honeypot added on 3 November. | Compile-checked only (no Deno test harness) |
| F-14 | `take_rate_limit` (migration 077) counts and records under a per-key transaction lock. The shared helper, guest-registration and team-invitation all use it. | `077_078_rate_limit_reactions.test.mjs` |
| F-15 | Anonymous viewers can read reactions only for a live session, with reactions on, of a published event (migration 078). | `077_078_rate_limit_reactions.test.mjs` |

**Deploy in this order:**

1. Run `supabase/RUN_ME_atomic_rate_limit.sql` (077), then deploy the functions that rate-limit. Deploying them first would refuse every limited request, because the limiter fails closed. Those functions are: guest-registration, team-invitation, submit-support-ticket, send-ticket-email, send-speaker-invite-email, send-sponsor-invite-email, notify-venue-selection and seed-cities. Use the `dashboard-inline.ts` copy for any function deployed by pasting.
2. Deploy og-event.
3. Run `supabase/RUN_ME_reaction_reads.sql` (078). It can go at any time.
4. Run `supabase/RUN_ME_sponsor_share_consent.sql` (079). The app works before or after it, but the ticket-page setting needs it.
5. Decide whether to run step 5 of that file, which is left commented out. It removes contact details from shares made before 079, which nobody agreed to under the new question.

**Before release:**

- The privacy owner should confirm the legal basis for sharing name, company and attendance with sponsors without opt-in, and approve the Privacy Policy wording (version 3.2).
- Other CSV exports (registrations, guest list, UTM) don't neutralise formulas yet. They go to the organiser, not to third parties.

## Validation results

| Check | Result | Evidence |
|---|---|---|
| Vitest suite: npm test -- --run | **PASS** | 141 test files; 1,510 tests passed. |
| Tracked SQL scenario tests: node --test supabase/tests/*.test.mjs | **PASS** | Two suites passed: 99 partner-access assertions and 44 plan-feature assertions. These are not tests for the later sponsor-sharing and identity migrations. |
| Production build: npm run build | **BLOCKED in this checkout** | Vite could not resolve swiper/modules from VenueMediaCarousel.tsx. Swiper 12.2.0 is in package.json and the lockfiles, but npm ls reports no installed swiper package. This points to an incomplete local node_modules tree; the CI install/build path was not run. |
| ESLint: npm run lint | **FAIL** | 140 errors and 131 warnings. The lint script now ignores Vite temporary files, so this run reports source diagnostics. |
| TypeScript: npm run typecheck | **FAIL** | 113 TypeScript diagnostics across application files, including stale Supabase generated types and component/API mismatches. |
| Production dependency audit: npm audit --omit=dev --audit-level=high | **UNVERIFIED** | npm could not resolve registry.npmjs.org (ENOTFOUND). Current advisories could not be fetched. |
| High-confidence secret-pattern scan | **No matches** | Scanned tracked text files in the working tree for private-key headers, AWS access-key IDs, GitHub token formats and live Stripe secret-key formats. This was not a full secret scanner and did not scan Git history. |
| Browser E2E / deployed functions | **NOT RUN** | No production or live Supabase instance was accessed. |

The CI workflow runs tests and build as blocking steps and blocks critical dependency advisories. Typecheck, lint, and high-severity dependency advisories use continue-on-error and do not block a merge. See .github/workflows/ci.yml.

## Current findings

### F-10 — Medium: Sponsor sharing includes contact data without an attendee opt-in path

**Evidence**

- The final sponsor-sharing code in supabase/migrations/000_full_schema.sql builds rows with email, mobile number and LinkedIn for registered attendees at lines 25380–25397.
- The same function adds event speakers who never registered, including their email and mobile fields, at lines 25403–25428.
- organizer_share_sponsor_data snapshots those rows into sponsor_data_share_rows at lines 25486–25500.
- The later migrations remove the earlier sponsor-consent trigger, and the final row-building function does not filter on sponsor_share_consent. The frontend has no reference to that field or an attendee opt-in control.
- The Privacy page says an organiser may share registration details with sponsors, but that notice is not connected to a recorded attendee choice. It describes registrants; the SQL also shares unregistered speakers. See src/pages/PrivacyPage.tsx:101.

**Impact**

An authorized event organiser can publish a bulk list of participant and speaker contact details, attendance, and related profile data to sponsor team members. The sponsor must be linked to the event, and only approved event managers can share it, so this is not an anonymous access-control bypass. It is a data-governance and privacy boundary: attendees and speakers have no in-product way to refuse this sharing, and the current flow does not record purpose-specific permission.

The rows are copied into snapshots. Revoking access changes the share status and blocks subsequent reads, but does not delete its copied rows. sponsor_data_share_rows.registration_id has no foreign key to the source registration or speaker, and the repository contains no snapshot purge in the account/registration deletion path. A deletion request currently becomes a support ticket, not an automated purge operation.

**Recommended action**

Add a clear event-specific notice and affirmative choice for attendee and speaker contact sharing, store the choice and notice version, and filter share generation by that choice. Define retention and erasure behavior for active, superseded and revoked snapshots. Have the privacy owner confirm the intended legal basis and notices before using sponsor sharing broadly.

### F-11 — Medium: Spreadsheet formula injection can bypass the sponsor CSV guard

**Evidence:** src/lib/sponsors/data-sharing.ts:74–80 only marks values beginning with ASCII equals, plus, minus or at-sign as text. The cell serializer does not quote tab characters, and the guard does not account for leading tab, carriage return, line feed, null or full-width formula characters. The rows contain attendee-controlled names, company names, email addresses and other profile values. Existing tests cover leading equals and plus, but not the additional prefixes.

**Impact:** A malicious registrant can place a crafted value into a field later included in a sponsor download. When a sponsor opens the CSV in spreadsheet software, the value may be interpreted as a formula. This requires a sponsor to open the generated export. OWASP lists these control characters and locale-dependent full-width characters as CSV injection cases and recommends validating mitigations in the spreadsheet applications used: [OWASP CSV Injection](https://community.owasp.org/attacks/CSV_Injection).

**Recommended action**

Use a tested export strategy that neutralizes all supported spreadsheet formula prefixes, or generate an XLSX file with untrusted cells explicitly typed as text. Add regression cases for tabs, line breaks, nulls, full-width prefixes, quotes and separators.

### F-12 — Medium: Public OG endpoint fetches arbitrary event image URLs

**Evidence:** supabase/functions/og-event/index.ts:270–282 fetches each banner URL and reads the full response body before decoding it. The caller-supplied event identifier is resolved to a published event, but its banner_landscape_url and image_url can be organizer-controlled. The endpoint has no JWT requirement in supabase/config.toml. The fetch uses the default redirect behavior and has no host allowlist, destination-IP check, response-size limit, or image-dimension limit.

**Impact**

A user who can publish an event can make the server request an arbitrary URL when a public social-card image is generated. Depending on the Edge runtime's network restrictions, this can be used for blind requests to private or link-local destinations, network probing, or excessive memory and CPU use through large or malformed image responses. The public endpoint can also be called repeatedly. OWASP recommends validating destinations, preventing redirect bypasses, and restricting outbound requests: [OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html).

**Recommended action**

Prefer serving images from the platform's own storage. Otherwise restrict destinations to approved hosts, reject private and reserved IP ranges after DNS resolution, revalidate redirects or disable them, and enforce strict response-byte and decoded-image dimension limits.

### F-13 — Medium: Public support-ticket submission can be abused to send email and fill storage

**Evidence:** supabase/functions/submit-support-ticket/index.ts accepts anonymous POST requests, parses JSON before applying field-length clamps, inserts a ticket through a service-role client, then sends a confirmation email to the supplied address and a staff notification. supabase/config.toml sets verify_jwt = false for this function. The code records an IP hash but does not use it for a rate limit. No CAPTCHA, honeypot, duplicate suppression or per-email cooldown was found.

**Impact**

A bot can create unbounded support-ticket rows, flood the support inbox, or send unsolicited confirmation emails to arbitrary recipients. Field clamps limit stored string lengths, but happen after req.json() has parsed the request body.

**Recommended action**

Enforce a request-body size limit before JSON parsing, add an atomic IP and email rate limit, and add an abuse challenge or equivalent bot control. Use only a trusted proxy-provided client address when keying the limiter.

### F-14 — Medium: Shared edge-function rate limits are raceable

**Evidence:** supabase/functions/_shared/rate-limit.ts reads the number of recent rows and inserts a separate row afterward. There is no transaction, advisory lock or unique constraint that makes the check and increment atomic. Multiple concurrent requests can all observe a count below the limit and then insert.

This helper is used by ticket and invitation email flows and city seeding. It does not bypass their identity and ownership checks, but it can defeat per-ticket email throttling and other abuse controls under concurrent requests.

**Recommended action**

Move check-and-increment into one database RPC/transaction that serializes by bucket and key, or use an atomic counter with a fixed window. Add a concurrency test proving the configured maximum cannot be exceeded.

### F-15 — Medium: Anonymous reaction reads are not limited to public sessions

**Evidence:** supabase/migrations/000_full_schema.sql:17221–17229 grants anon SELECT on reaction IDs, session IDs, emoji and timestamps, then creates the Guests see reactions policy with USING (true). The write path now checks attendee/speaker/join-token membership, but the read policy does not check that a session is public, published or live.

**Impact:** Anyone with the public project key can query reaction metadata across all webinar sessions, including sessions that are not otherwise public. The rows no longer reveal who reacted, but session IDs and reaction timing can disclose activity around private events.

**Recommended action**

Limit anonymous reads to explicitly public/live sessions, or expose only a session-scoped aggregate through an RPC. Keep authenticated attendee access under its own membership policy.

## Previous findings rechecked

The following October 27 findings appear fixed in the current source. The deployed state remains unverified.

| ID | Current source status |
|---|---|
| F-01 Paid-event approval without payment | Fixed in code: non-organiser registrations are constrained by the database trigger, and priced registrations wait for organiser approval. No online payment provider integration or payment webhook was found. Public pages still advertise Stripe, Razorpay, UPI and automatic ticket payments; README.md:428 says payment collection is not built. Treat these product claims as a separate release-correctness issue. |
| F-02 Login-time 2FA bypass | Fix present: Supabase MFA and aal checks exist in application/session and edge-function paths; the database pre-request and restrictive RLS policy are in the security migration. |
| F-03 Unauthorised service-role email and WhatsApp sends | Fix present in the reviewed handlers: caller identity and event/communication access checks are applied before service-role delivery, with delivery claims and limits in the sending paths. |
| F-04 Organizer-provisioned accounts | Fix present: create-participant-account is removed; account activation uses emailed single-use links. |
| F-05 Anonymous webinar reaction reads/writes | Partially fixed: writes require session/token checks and direct anonymous writes are revoked; anonymous SELECT still exposes reaction metadata across all sessions. See F-15. |
| F-06 Public site-editor drafts | Fix present: public column grants omit draft_content; draft reads use an admin-checked RPC. |
| F-07 Unpublished OG disclosure | Fix present: og-event queries published events only. |
| F-08 Unauthorised community creation | Fix present: client EXECUTE on ensure_event_community is revoked. |
| F-09 Public city seeding | Fix present: seed-cities resolves a service/admin caller and has a global rate limit. F-14 describes the concurrency limitation in that limiter. |

## QA and release risks

### Q-01 — Build, typecheck and lint are not green in the current workspace

Tests pass, but build currently cannot resolve an installed package, and typecheck and lint report substantial backlogs. The CI workflow does not block on typecheck or lint. Repair the local dependency installation, regenerate Supabase types, address the diagnostics, and make both checks blocking after they are clean.

### Q-02 — High dependency advisories do not block CI, and this review could not refresh advisories

The high-severity npm audit job is continue-on-error. The local audit could not reach npm's registry, so this review makes no current claim about vulnerable dependency versions. Restore network access for dependency review and make high-severity results an explicit release gate.

### Q-03 — Later SQL security features lack tracked database tests

The tracked SQL test suite covers partner access and plans, but not the later security, MFA, identity, webinar-reaction and sponsor-data-sharing migration sections. Add database tests for authorization, anonymous reaction visibility, consent, revocation, data retention, and direct RPC access in migrations 056–074. Run schema drift checks against the deployment before release.

### Q-04 — Content Security Policy remains report-only

vercel.json configures Content-Security-Policy-Report-Only. It reports violations but does not block scripts or other content. Review collected violations and enforce a policy when the required application origins are understood.

### Q-05 — Payment copy contradicts the implemented product

Public pricing, FAQ and landing pages describe Stripe, Razorpay, UPI and automatic paid ticket handling. The README says payment collection is not built, and no payment checkout or signed payment webhook was found. Remove or correct these claims until the flow exists.

### Q-06 — Current Capacitor dependency edits are missing from npm's lockfile

The working tree now contains 12 Capacitor dependencies in package.json and bun.lock, but none of those entries appear in package-lock.json. The repository's .npmrc says Vercel uses npm for API-route dependencies, so npm-based installs that require a synchronized lockfile can fail or resolve a different dependency tree. These dependency edits were not made as part of this audit and were left untouched.

Update package-lock.json with the intended package manager and verify both the Bun and npm install paths before deployment. The dependency advisory check also needs to be repeated when npm registry access is available.

## Review scope and limits

The tracked repository contains 787 files: 777 text-like files and 10 binary/media files. The inventory includes 649 files under src, 76 under supabase, 5 API routes, 20 public assets and the root/build/test documentation and configuration. All tracked paths were inventoried; repository-wide searches and available linters/tests were applied across the text sources. The focused manual review covered authentication and MFA, database policies and privileged functions, service-role Edge Functions, public API routes, registration and ticket workflows, sponsor and identity data, exports, build/deployment configuration, and related documentation.

This was not a literal manual line-by-line inspection of all 777 text files. Binary and media files were inventoried but not semantically inspected. No deployed Supabase policies, Edge Function configuration, Vercel environment, external provider, or live user data was accessed. The npm advisory service was unreachable. Findings are source-level and should be verified against the deployed database and function versions.

The worktree contains uncommitted Capacitor dependency additions in package.json and bun.lock that were not present in the initial clean checkout. They were preserved and are documented in Q-06; the validation results above do not cover installing or building that updated dependency set.

## Remediation order

1. Restrict sponsor data sharing and define opt-in, notice, retention and erasure behavior.
2. Close SSRF and resource-exhaustion paths in public image and support endpoints.
3. Harden CSV export and make rate limiting atomic.
4. Repair build/type/lint gates, add database tests for migrations 056–074, and enforce CSP.
5. Correct payment claims and confirm that all security migrations and Edge Functions are deployed.
