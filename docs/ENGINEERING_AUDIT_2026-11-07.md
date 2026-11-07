# Illuxus Engineering, QA, Security, and Operations Audit

**Review date:** 7 November 2026  
**Checkout:** `app-launch-release` at `d9f9bb2`  
**Review type:** Static source and configuration review  
**Execution:** No tests, builds, live services, deployed database, or production endpoints were exercised.

## Executive summary

The checkout has useful security foundations: a restrictive browser security policy, row-level security on webinar session records, service-role-only atomic rate limiting, structured log redaction, and native storage protections. The main risks are concentrated in webinar admission, incomplete mobile link association assets, and quality checks that do not currently cover the browser and native release paths.

The attendee join-token handler does not bind a bearer token to the event requested by the client or re-check the registration's current status. Separately, anonymous attendees and invite-link speakers cannot load the session record because the client queries a table whose read grants and policies require an authenticated user. Together, these create an authorization boundary defect and a broken anonymous join path.

The Android and iOS projects declare verified HTTPS links, but the repository contains neither required association file. Browser end-to-end tests also appear unusable from this checkout and are not part of CI. TypeScript and lint failures are explicitly non-blocking.

## Scope and method

Reviewed selected application route code, the LiveKit token Edge Function, webinar database grants and policies, shared Edge Function authorization and rate-limit code, deployment headers and rewrites, CI configuration, Playwright setup, and Android/iOS release configuration. Findings are tied to the checked-in source, not to an assertion about the currently deployed service.

This is not a penetration test or a full line-by-line review. No credentials were used. Deployed Edge Function versions, production database policies, Vercel routing, third-party provider settings, real devices, and current production headers remain unverified.

## Findings

### F-01 — Attendee join tokens are not scoped to the requested event

**Severity: Medium · Authorization · Remediate before relying on webinar event isolation**

`supabase/functions/livekit-token/index.ts:88-112` resolves a registration by `join_token`, then updates its active browser session before loading the requested webinar session. It selects the registration's `event_id`, but never compares it with the session's `event_id`. The token flow also does not select or validate registration approval/cancellation state. Later, `:122-128` loads whichever session ID the caller supplied, and `:166-174` skips the normal event registration check whenever `registrationId` is set.

A holder of a valid attendee link can therefore request a token for a different webinar session if they know its ID. A cancelled or otherwise no-longer-approved registration may also continue to use a token if that token remains on its row. Because the active-session update happens before session authorization, a failed or mismatched request can also claim the registration's single-device slot.

**Recommended action:** Load and validate the target session first. In one server-side operation, verify the token's registration belongs to that session's event and is currently eligible, then claim the browser session and issue a room-scoped token. Reject invalid states without changing the registration. Add negative tests for cross-event IDs, cancelled/unapproved rows, and failed requests that must not reserve a device.

### F-02 — Signed-out attendees and invite-link speakers cannot load the webinar session

**Severity: Medium · Availability and access flow**

`src/pages/EventLivePage.tsx:83-91` fetches `webinar_sessions` directly from the browser client before it can request a LiveKit token. In `supabase/migrations/000_full_schema.sql:485-488`, the table grants `SELECT` only to `authenticated`; its read policies also apply only to authenticated owners or approved attendees. There is no anonymous read policy for a valid attendee `join_token` or speaker invite token.

As a result, a signed-out visitor arriving from a valid attendee or speaker link receives no session row. The join handler then stops because `session` is missing, so the server-side token endpoint cannot complete the flow. The policy itself is appropriately restrictive; the missing piece is a narrow token-authorized session lookup.

**Recommended action:** Add a server-side lookup that validates the event-scoped attendee or speaker token and returns only the session fields required for the lobby. Gate realtime updates with the same authorization rule or provide a token-validated update channel. Exercise the flow signed out, including expired, wrong-event, and revoked tokens.

### F-03 — HTTPS app-link association files are absent

**Severity: Medium · Mobile release and navigation reliability**

`android/app/src/main/AndroidManifest.xml:29-37` declares Android App Links, while `ios/App/App.entitlements:5-10` declares Apple Universal Links. `vercel.json:145-168` sets headers for `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json`, and its SPA rewrite deliberately excludes `/.well-known` at `:122-124`. The only checked-in file under `public/.well-known/` is `security.txt`; neither app-association file exists in the repository or API routes.

Without valid association responses for the deployed app IDs and signing identities, the operating systems cannot verify these HTTPS links and may open them in a browser instead of the app. This review did not make a live HTTP request, so a separately managed production route cannot be ruled out.

**Recommended action:** Add the Apple and Android association documents to the deployment source (or document and verify the external route), confirm bundle/package IDs and signing fingerprints, then check status, content type, and body on both domains and test links on devices.

### F-04 — Browser end-to-end tests are not wired into CI and the checked-in fixture references an undeclared package

**Severity: Medium · QA and release confidence**

`playwright-fixture.ts:3` re-exports from `lovable-agent-playwright-config/fixture`. That package is not declared in `package.json`. The existing e2e spec imports this fixture (`tests/e2e/public-event.spec.ts:1`) and targets a fixed published event (`:11`). The CI workflow runs Vitest and the web build (`.github/workflows/ci.yml:39-43`) but does not run Playwright. CI also does not type-check Deno Edge Functions or build the native app targets.

The repository therefore has no checked-in, CI-gated browser smoke path, and the existing Playwright spec is not self-contained with the declared dependencies. This review did not attempt to run it.

**Recommended action:** Use the installed `@playwright/test` fixture or add and pin the intended fixture dependency. Provide deterministic test data or a controlled staging target, then add a browser smoke job. Add separate Edge Function type checks and native build/sync checks where the required toolchains are available.

### F-05 — TypeScript and lint checks can fail without failing CI

**Severity: Low · Release control**

`.github/workflows/ci.yml:59-65` uses `continue-on-error: true` for both `bun run typecheck` and `bun run lint`. `tsconfig.app.json` also sets `strict: false`. The workflow comments describe an existing backlog, but this review did not run the commands or measure the current failure count.

New typing or lint defects can be merged while CI remains green, reducing the value of these checks as release controls.

**Recommended action:** Establish and track the current baseline, fix or narrowly suppress existing debt, enable strictness incrementally, and remove `continue-on-error` as each check reaches an agreed threshold.

### F-06 — LiveKit publisher-cap enforcement fails open and is race-prone

**Severity: Low to Medium · Capacity and cost control**

`supabase/functions/livekit-token/index.ts:159-165` issues publish permission when the current publisher count is below `MAX_PUBLISHERS`. However, `getPublisherCount` returns `0` when the RoomService call is non-2xx (`:227-234`) and also returns `0` for any exception (`:236-237`). A RoomService outage is thus treated as an empty room and the limit is bypassed. The read-count-then-issue sequence is also not atomic, so concurrent requests can all pass at the same count.

This weakens the ten-publisher capacity control during provider errors or bursts of simultaneous joins. It does not by itself grant publish rights to a caller who lacks a valid host or speaker identity.

**Recommended action:** Represent provider failure separately from a count of zero and fail closed or return a retryable error for new publishers. If the limit is a hard invariant, use an atomic reservation/admission mechanism and reconcile it with participant events.

## Security and engineering controls observed

- `vercel.json` sets a Content Security Policy, `X-Content-Type-Options`, frame restrictions, HSTS, and a restrictive referrer policy.
- `supabase/functions/_shared/cors.ts` uses explicit browser/native origins and preview-origin validation. CORS is not a substitute for server authorization, so each privileged function still needs its own caller checks.
- The shared authorization code verifies user identity with Supabase and checks the user's AAL when two-factor is enabled.
- `take_rate_limit` uses a transaction-scoped advisory lock, hashes caller keys in the Edge Function, and is executable only by `service_role` (`supabase/migrations/000_full_schema.sql:25955-25981`).
- The observability logger redacts structured fields and messages before sending records to sinks (`src/lib/observability/logger.ts:400-430`).
- Android disables backups and excludes application data from cloud/device transfer. The iOS project includes a privacy manifest and declares the required-reason file timestamp API. These are present in the checked-in configuration; no store upload or device validation was performed.

These controls are positive source observations, not evidence that every endpoint, deployed policy, or production setting is correct.

## QA and DevOps disposition

The CI workflow already has useful blocking checks for unit tests, the web build, generated dashboard Edge Function copies, and critical production dependency advisories. The lockfile root dependency specifications matched `package.json` during this static review.

Before treating the pipeline as a complete release gate, repair and run the browser smoke suite, make TypeScript/lint status actionable, type-check Edge Functions, and add mobile build/sync validation. Keep native device behavior and production Edge Function/database versions as explicit release verification items until those environments are exercised.

## Documentation consolidation

The project README and this report are the only retained Markdown documents. Other Markdown guides, prior audit/test notes, the roadmap, feature design/task specs, readmes, and public AI/LLM text guides were removed. The sitemap no longer advertises the removed `llms.txt`. `robots.txt` and `/.well-known/security.txt` remain because they are served operational/security endpoints rather than project guides. The in-app `/docs` route remains application functionality.
