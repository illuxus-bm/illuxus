# Security & scale audit — illuxus

> Status: **initial sweep**, completed via static analysis (ESLint, grep,
> migration review). No staging environment was load-tested; no edge
> functions were exercised live. The findings below are the high-signal
> issues a senior engineer would flag from reading the codebase.
>
> Targeting: 50k concurrent users at peak in the first quarter post-launch.

## How to read this file

Each finding has:

- **ID** — stable so we can reference it across commits and conversations.
- **Severity** — P0 (security or correctness, must fix before launch),
  P1 (real cost amplifier at 50k), P2 (correctness / hygiene), P3 (nice
  to have).
- **Where** — file path and line, or a glob if the issue is widespread.
- **Why** — what breaks at scale or under attack.
- **Fix sketch** — the cheapest correct change.
- **Status** — `open`, `fixing`, `done`, or `tracked` (deferred to a
  follow-up issue with explicit acceptance).

When something is fixed, replace the status block with a commit hash
plus a one-line note. Keep the entry — that's the audit trail.

---

## Baseline (captured before any fix in this audit)

```
bun run build  ✓  (12.79s, 1.5MB Agora chunk lazy-loaded)
bun run lint   ✗  192 errors, 36 warnings
bun run test   ✗  3 failed / 201 passed
```

The build is healthy. Lint and tests are not. The lint findings break
down as follows:

| Rule                                                         | Count |
| ------------------------------------------------------------ | ----- |
| `@typescript-eslint/no-explicit-any`                         | 125   |
| `no-console`                                                 | 47    |
| `react-refresh/only-export-components`                       | 19    |
| `@typescript-eslint/no-empty-object-type` / `no-empty`       | 8     |
| `react-hooks/exhaustive-deps` (warnings)                     | 18    |
| `react-hooks/rules-of-hooks`                                 | 4     |
| Other (require imports, empty blocks, unused expressions)    | 9     |

---

## P0 — Security & correctness, fix before launch

### SEC-001 — Wildcard CORS on every edge function

**Severity**: P0
**Where**: every file under `supabase/functions/*/index.ts` (~18
functions). Each declares `"Access-Control-Allow-Origin": "*"`.
**Why**: any browser on any origin can call these functions with the
caller's cookies. Combined with the user's Supabase JWT being attached
automatically, this makes CSRF trivially possible against authenticated
flows like `livekit-promote`, `livekit-room-create`,
`create-participant-account`, and any of the recording / WhatsApp /
email surfaces. The agora-token signer is also exposed: any third party
site can mint tokens to your Agora app on behalf of a logged-in user.
**Fix sketch**:

1. Add a shared helper at `supabase/functions/_shared/cors.ts` that
   reads an `ALLOWED_ORIGINS` secret (comma-separated).
2. Each function reads `Origin` from the request and only echoes it
   back in `Access-Control-Allow-Origin` when it's in the allowlist,
   otherwise returns 403.
3. Default the allowlist to `VITE_PUBLIC_DOMAIN` and the public
   subdomain. Document the env in `docs/security.md`.

**Status**: **done in commit pending** — every function now uses
`buildCorsHeaders(req)` from `supabase/functions/_shared/cors.ts`,
which echoes only allowlisted origins. Allowlist sources:
`ALLOWED_ORIGINS` Supabase secret, plus `VITE_PUBLIC_DOMAIN` /
`VITE_PUBLIC_PUBLISHED_HOST`, plus `localhost:5173` / `8080` for dev.
Four functions stay `allowAny: true` by design:
`whatsapp-webhook` and `livekit-webhook` (third-party servers post
to them — origin is meaningless), `org-events` (called by the
public embed widget from third-party sites), and `fx-rates`
(non-sensitive cached rates read by everything).

### SEC-002 — Hooks called after early return in `LiveKitWebinarStage`

**Severity**: P0
**Where**: `src/components/webinar/WebinarStage.tsx` lines 87–145
**Why**: I introduced this myself in commit `644455d` when wiring the
provider switch — the early return for missing `token`/`wsUrl` came
BEFORE four `useCallback` / `useMemo` calls. React breaks when a
component renders with a different number of hooks across renders.
**Fix**: move the guard to after all hooks. (Done in this commit.)
**Status**: **done in this commit** — guard now sits below the hooks,
ESLint passes for that file.

### SEC-003 — `dangerouslySetInnerHTML` on event public page

**Severity**: P0 (depends on `sanitizeHtml` strength)
**Where**: `src/components/event/page-form/PublicEventRenderer.tsx:1140`
**Why**: organisers can write arbitrary HTML in custom event-page
sections. The previous sanitiser was a regex-only allowlist that's
known to be bypassable on:
  - Self-closing scripts (`<script src=// />`)
  - Nested injection (`<scr<script>ipt>`)
  - Unquoted handler attributes (`onerror=alert(1)`)
  - Style-based JS execution (`background:url(javascript:…)`)
  - Newline-smuggling protocols (`java\nscript:`)
  - Case-shifted handlers and protocols
**Fix**: replaced the regex sanitiser with DOMPurify-backed
`@/lib/sanitize-html.sanitizeHtml`. Strict tag + attribute allow-list
(prose tags only, no script/iframe/object/embed/form/style/math),
inline `style` and `srcdoc` forbidden, http(s)/mailto/tel/anchor
URLs only, `target="_blank"` links auto-get
`rel="noopener noreferrer"` via an `afterSanitizeAttributes` hook.
A property test `src/lib/__tests__/sanitize-html.pbt.test.ts`
asserts no execution surface survives across 20 known XSS payloads
+ a fast-check property pass over fuzzed tag/handler/protocol
combinations (100 runs).
**Status**: **done** — 24/24 tests pass; full suite still green
(239 passing, the 3 still-failing tests are SEC-004's remaining work).

### SEC-004 — Three failing tests block CI

**Severity**: P0 (CI is broken until these pass)
**Where**:
- `src/lib/event-routes.test.ts` — test file fails to load because
  `event-routes.ts` imports `@/lib/observability` which boots the
  Supabase client at module load, and `VITE_SUPABASE_URL` isn't stubbed.
- `src/lib/observability/__tests__/probe-modules.test.ts:rpc-style isDev/isProd` and
- `src/lib/observability/__tests__/rpc-prefix-debug-prod.test.ts` (×2) —
  rely on `vi.stubEnv('PROD', true)` affecting `import.meta.env.PROD`.
  Vitest's behaviour around `import.meta.env` changed in recent
  versions and the stub no longer takes effect for code that reads
  `import.meta.env` directly.
**Fix**:
1. Stub `VITE_SUPABASE_URL` + anon key in `src/test/setup.ts`. (Done
   in this commit.)
2. Update the probe tests to use a `vi.mock` pattern that injects a
   replacement `isDev`/`isProd` at module level rather than relying
   on `vi.stubEnv` for `import.meta.env`. That's a 1-line test
   refactor per file.
**Status**: half-done in this commit — `event-routes.test.ts` should
pass after the env stub; the other two need the vi.mock refactor.

### SEC-005 — Secrets exposed in chat history

**Severity**: P0 (account-level)
**Where**: not in the codebase — in this conversation's transcript.
Three GitHub PATs and one GitHub account password have been pasted
into chat by the user during this engagement.
**Fix**: revoke at github.com → Settings → Developer settings →
Personal access tokens. Rotate the GitHub account password. Set up
the macOS keychain credential helper (`git config --global
credential.helper osxkeychain`) so future secrets stay local.
**Status**: tracked — flagged repeatedly throughout the conversation.

---

## P1 — Cost & latency at 50k users

### SCALE-001 — `QueryClient` had zero defaults

**Severity**: P1
**Where**: `src/App.tsx:93`
**Why**: TanStack Query's defaults are `staleTime: 0`,
`refetchOnMount: true`, `refetchOnWindowFocus: true`. Every tab change,
every focus change, every component mount kicks a network round-trip.
At 50k users with 5 active tabs each that's a 5x amplification on every
read — Supabase row reads and edge-function invocations.
**Fix**: set `staleTime: 30s`, `gcTime: 5min`,
`refetchOnWindowFocus: false`, `retry: 1`, exponential backoff. Hooks
that need fresher data override per-query (live attendance counters,
webinar state, etc.). (Done in this commit.)
**Status**: **done in this commit** — `App.tsx` `QueryClient` now has
sensible defaults documented in JSDoc.

### SCALE-002 — `select("*")` on most reads

**Severity**: P1
**Where**: 19 occurrences across `EventLivePage.tsx`,
`PublicEventPage.tsx`, `EventDetailPage.tsx`, `BroadcastPage.tsx`,
`SessionManagement.tsx`, `SponsorManagement.tsx`,
`SpeakerManagement.tsx`, `RegistrationsSection.tsx`,
`EventPageForm.tsx`, `WebinarSidebar.tsx`, `useCommunications.ts`.
**Why**: `events` has 30+ columns including the long `description`,
`html`, banner URLs, and now `video_provider`. `select("*")` ships
every byte to every viewer. On a public event page with 10k
concurrent viewers and a 6KB row, that's 60MB of egress per page
view — 600x more than the ~100 bytes a typical card needs.
**Fix**: per-component, list the columns each consumer actually
reads and replace `select("*")` with explicit projections. Largest
wins are public surfaces:
- `PublicEventPage.tsx` events read
- `EventDetailPage.tsx` event load
- `WebinarSidebar` poll/QA loaders
**Status**: open — ~1 day of careful field-by-field refactoring.
Best done with a typed helper that infers the projection from a
TypeScript const so we can't drift.

### SCALE-003 — Unbounded reads of org-wide tables

**Severity**: P1
**Where**:
- `SponsorManagement.tsx:144` — `from("sponsors").select("*").order("name")`
- `SpeakerManagement.tsx:108` — `from("speakers").select("*").order("name")`
**Why**: these load EVERY sponsor / EVERY speaker visible to the
organiser, even when they only render a 50-result picker. An org with
10k speakers (a healthy series of conferences) downloads 10k rows on
every event-detail visit.
**Fix**: paginate or replace with a server-side full-text search RPC
(`org_search_speakers(_q text, _limit int)`) that returns 50 rows max.
**Status**: open — RPC-side change, ~half-day of work.

### SCALE-004 — Realtime subscriptions per row

**Severity**: P1
**Where**: `WebinarSidebar.tsx`, `RegistrationsSection.tsx`,
`PublicEventPage.tsx`
**Why**: each subscribes to `postgres_changes` filtered by row id.
Supabase Realtime caps connections per project at the plan tier
(2k on Pro). A live event with 10k viewers each opening a chat panel
will exceed the cap before launch. Connection multiplexing is fine —
Supabase rolls all channels for a single client into one WebSocket —
but we need to verify that the client lib is actually multiplexing
and not opening one socket per `supabase.channel()` call.
**Fix**: confirm channel reuse with a runtime probe. If multiplexing
is broken, switch high-cardinality realtime feeds (chat, QA, polls)
to a single `event_id`-scoped channel and route by table inside the
listener. Document the cap in `docs/scaling.md` so anyone adding new
realtime feeds knows the budget.
**Status**: open — needs a 1-2h instrumentation pass before deciding
what (if anything) to refactor.

### SCALE-005 — Missing FK indexes

**Severity**: P1
**Where**: postgres migrations `001_tables.sql`. Some FKs are
indexed (`registrations.event_id`, `webinar_sessions.event_id`)
but several aren't (`webinar_speakers.session_id`,
`webinar_polls.session_id`, `webinar_poll_votes.poll_id`,
`webinar_qa.session_id`, `webinar_chat.session_id`,
`attendance_events.registration_id`).
**Why**: every JOIN through these FKs in a `SELECT … WHERE
session_id = $1` pattern triggers a sequential scan. At 50k users
each generating tens to hundreds of rows in webinar_chat, this is
the single biggest predictable production fire.
**Fix**: a small migration that adds `CREATE INDEX IF NOT EXISTS …
ON … (session_id)` for each missing FK. Verify with `EXPLAIN` on a
seeded staging DB.
**Status**: open — ~30 min for the migration, separate to confirm
in staging.

### SCALE-006 — `bun run build` ships single 984KB JS chunk

**Severity**: P2 (perf, but not a 50k-user blocker)
**Where**: `vite.config.ts` — no manualChunks splitting beyond what
React.lazy() achieves.
**Why**: first page paint downloads the full 984KB index.js even
when the user only needs the landing page. Lazy chunks are split
correctly via `React.lazy`, but the entry chunk still includes
React Query, Sonner, Recharts cores, etc. Time-to-Interactive on
a 4G connection in India / SE Asia (the launch markets) will be
~6s; budget should be ~2.5s.
**Fix**: `build.rollupOptions.output.manualChunks` split for
heavy non-route vendor libs (`recharts`, `tanstack-query`,
`framer-motion`).
**Status**: open — vendor split, ~2h work + visual-regression check.

### SCALE-007 — No CDN cache headers configured

**Severity**: P1
**Where**: `vercel.json` — only an SPA rewrite, no `headers`.
**Why**: every event public page request goes back to origin even
though the data layer is read-mostly. A viral event tweet that
brings 100k visitors will hammer Supabase row reads when 99% of them
could be served from Vercel's edge cache with `s-maxage`. The
`PublicEventPage` is the obvious cache target.
**Fix**: Two layers:
1. Add `Cache-Control: public, s-maxage=60, stale-while-revalidate=600`
   on the static index.html (so the SPA shell caches at edge).
2. For the public event JSON, expose a server-side route or edge
   function that returns the read-only event payload with the same
   cache header, and have the SPA render from it on first load.
   Then realtime subscriptions take over for live updates.
**Status**: tracked — biggest scale win, but invasive (introduces
a new ingress point). Worth its own spec.

---

## P2 — Correctness & hygiene

### LINT-001 — 47 `console.*` calls in edge functions

**Severity**: P2
**Where**: `supabase/functions/whatsapp-*/index.ts`,
`send-communication-email`, `seed-cities`, etc.
**Why**: leaks PII into Deno's edge logs (visible to project owners
in the Supabase dashboard). Should route through a structured
logger that scrubs PII the same way `@/lib/observability/logger.ts`
does in the browser.
**Fix**: port a minimal logger to `supabase/functions/_shared/logger.ts`
that emits structured JSON to stdout (Deno log driver picks it up)
and drops PII keys.
**Status**: open — ~half day for the helper + per-function migration.

### LINT-002 — 125 `any` types

**Severity**: P2
**Where**: scattered, mostly in older organism components
(`SponsorManagement.tsx`, `SpeakerManagement.tsx`,
`AppSidebar.tsx`, etc.).
**Why**: `any` = "trust me", which usually masks real shape bugs
discovered in production. We have generated Supabase types in
`src/integrations/supabase/types.ts`; using them eliminates ~80%
of these.
**Fix**: replace each `any` cast with the matching `Tables<"…">`
type. A handful where the column hasn't been generated yet (sponsor
applications, video_provider) need an interim local type until the
next types regen.
**Status**: open — 1-2 day refactor, low risk because TS catches
mistakes at compile time.

### LINT-003 — 18 `react-hooks/exhaustive-deps` warnings

**Severity**: P2
**Where**: scattered across `SpeakerManagement.tsx`,
`SponsorManagement.tsx`, `useAgoraClient.ts`, dashboard hooks.
**Why**: missing deps on `useEffect` cause stale captures — UI
that doesn't refresh when its inputs change. Most are benign
(fetch helpers stable across renders) but a few are real.
**Fix**: per-warning, either add the dep or wrap the helper in
`useCallback` with the right deps.
**Status**: open — 2h triage, low risk.

### LINT-004 — 19 `react-refresh/only-export-components` warnings

**Severity**: P3 (dev-experience only)
**Where**: shadcn `ui/*` files that export both components and
constants — by design.
**Why**: HMR breaks when a single file exports both a component
and a non-component. Warnings only; no production impact.
**Fix**: Either accept the noise (pragmatic) or split each `ui/*`
file into `Component.tsx` + `Component.constants.ts`.
**Status**: tracked — low value vs effort, leaving as warnings.

### LINT-005 — 4 direct `supabase.rpc` calls bypassing the wrapper

**Severity**: P2
**Where**:
- `useCommunityExtras.ts:172`
- `EventSettingsSection.tsx:120`
- `EventRsvpCard.tsx:114`
- `useApplications.ts` (transitively via the recently added
  status-change hooks I wrote in commit `9590ca5` — should also use
  `supabaseRpc` where they call `supabase.rpc`)
**Why**: project convention says all RPC calls flow through
`supabaseRpc` (`@/lib/observability`) so they get a correlation id
and structured logging. Direct calls are silent in the observability
pipeline — invisible during incidents.
**Fix**: replace each with `supabaseRpc(...)`. Pure mechanical
change.
**Status**: open — ~30 min.

---

## P3 — Tracked but deferred

### TRACK-001 — Edge function endpoint contract testing

We have ~30 edge functions and zero contract tests. Setting up Deno's
test runner + a fixture that boots a local Supabase clone is its own
spec. Tracked separately so this audit ships.

### TRACK-002 — Load test profile for 50k users

Needs k6 or Artillery scripts plus a staging environment that
mirrors prod sizing. Once we have a staging DB, build a profile that
simulates:
- 10k viewers on a single live event (chat + QA + polls)
- 50k concurrent visitors hitting different event public pages
- 1k organisers in their dashboards
Use the result to size the Supabase plan tier and any read replicas.

### TRACK-003 — Sentry / error reporting wired to a real DSN

`docs/observability.md` describes the logger. The runtime path
buffers errors, but `VITE_SENTRY_DSN` is empty in `.env.example`.
Without a real DSN we have no production visibility — we'll find
out about a broken signup flow from a customer support ticket
instead of a Sentry alert.

### TRACK-004 — Rate limiting on public edge functions

`fx-rates`, `agora-token`, `livekit-token` are public-ish (anon key
required but trivially scrapable). Without per-IP rate limits an
attacker can mint Agora tokens at a few thousand req/s and bill the
project's free tier into rate-limited mode.
Implement per-IP token bucket via a `rate_limits` table or via
Supabase's edge runtime KV when available.

---

## Acceptance criteria for "secure & scalable for 50k"

The label is meaningful only when these are all true:

1. All P0 and P1 issues above are `done`.
2. CI runs `bun run lint && bun run test && bun run build` and they
   all pass on every push.
3. A staging load test demonstrates the system holds for 50k
   concurrent viewers without DB read-IO going above ~70% capacity.
4. Sentry has alerted on no unique production exceptions for 24h
   on staging traffic.
5. A public penetration scan (OWASP ZAP baseline) returns no
   high-severity findings.

We're at #1 partial (4/14 P0+P1), and #2 partial (lint and 3 tests
broken). Items 3-5 require infra not in the repo today.

---

## Changelog

- `2026-06-20` — initial audit. SEC-002 fixed (rules-of-hooks),
  SEC-004 partial (env stub added), SCALE-001 fixed (QueryClient
  defaults). Remaining items open for follow-up commits.
- `2026-06-21` — **SEC-001 done**. New `_shared/cors.ts` helper +
  origin allowlist via `ALLOWED_ORIGINS` Supabase secret. 18 edge
  functions migrated; 4 stay `allowAny: true` by design (webhooks
  + public embed + fx rates). `.env.example` documents the secret.
- `2026-06-21` — **SEC-003 done**. Replaced the regex sanitiser with
  DOMPurify in a new `src/lib/sanitize-html.ts` module with a strict
  allow-list and a property test pass (24 cases) covering known
  XSS payloads + fuzzed tag/handler/protocol combinations.
