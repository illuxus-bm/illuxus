# Codebase Audit — Security, QA, Reliability & Architecture

**Project:** illuxus — event management / ticketing / webinar platform
**Commit audited:** `becdfd2` on `main`, plus uncommitted working-tree changes
**Date:** 2026-08-27
**Method:** Read-only static review, dependency scan, type check, lint, unit test run, production build. No destructive testing, no exploitation against live systems, no code modified.

> **Disclosure note.** This repository is public. Findings below are written at
> defect-class level — exact locations, impact, root cause, and remediation —
> deliberately without step-by-step exploit payloads. Anyone remediating has
> everything they need; anyone else gains nothing not already derivable from the
> published source. Treat the P0 list as embargoed until fixed.

---

## 1. Executive Summary

**Is this system production-ready? No.** Feature-complete, but not release-ready.

Much of this codebase is carefully built. Row-Level Security is enabled on 66 of 67
tables. All 157 `SECURITY DEFINER` functions correctly pin `search_path`. There is a
real observability layer with PII redaction, 500 passing tests including 13
property-based suites over the attendance state machine, correct HMAC verification on
the LiveKit webhook, and one edge function (`generate-creative-background`) that is a
genuinely good reference implementation of auth + authorization + quota.

The problem is that the server-side trust boundary is inconsistent. **Twelve Supabase
Edge Functions create a service-role client — which bypasses RLS entirely — and perform
privileged writes with no caller identity check.** The `verify_jwt = true` setting is
treated in code comments as the control, but it only proves the caller holds a
project-signed JWT. The anon key is exactly that, and it ships in the browser bundle by
design. So `verify_jwt` gates nothing an ordinary visitor doesn't already have.

The most serious consequence is an account-creation function that will mint a
pre-confirmed auth user for an arbitrary email with a caller-supplied password, then
reassign matching unclaimed registrations to it. Separately, the `registrations` INSERT
policy is not scoped to the caller's own events, so any authenticated user can write
rows into any organizer's event — including payment and check-in fields.

### Biggest risks

| Rank | Risk | Root cause |
|---|---|---|
| 1 | Account takeover of arbitrary users | `create-participant-account` has no caller check (SEC-001) |
| 2 | Platform used as an open mail / WhatsApp relay | 8 unauthenticated sender functions (SEC-003, SEC-004) |
| 3 | Cross-tenant corruption of guest lists and revenue figures | Unscoped `registrations` INSERT policy (SEC-005) |
| 4 | Moderation bypass — banned users reinstate themselves | Unrestricted `profiles` self-update (SEC-006) |
| 5 | Full user directory incl. mobile numbers readable by any account | `profiles SELECT USING(true)` (SEC-007) |
| 6 | Unauthorized webinar publishing | `agora-token` mints publisher tokens for any channel (SEC-002) |
| 7 | Credential compromise | GitHub PAT in plaintext in git remote (SEC-000) |
| 8 | Service failure under load | Missing index + no rate limiting (PERF-001, SEC-016) |

**What could cause the worst security incident:** SEC-001. It is a pre-authentication
primitive that yields a working session as another user, and it silently claims that
user's registrations across every tenant.

**What could cause data loss:** `admin_delete_user` runs `DELETE FROM auth.users`, which
cascades `events → registrations → attendance_events`. One admin misclick destroys an
organizer's entire event and attendance history. No soft delete, no confirmation token,
no export-first step (QA-010).

**What could cause unauthorized access:** SEC-002 and SEC-011 both grant access to live
webinar rooms without establishing that the caller belongs in them.

**What should be fixed immediately:** SEC-000 through SEC-006.

### Scores

| Dimension | Score | Rationale |
|---|---|---|
| Security | **3/10** | Database layer is thoughtfully designed. The edge-function layer has no consistent authentication model. Seven confirmed critical findings. |
| QA | **5/10** | 500 passing tests and real property-based testing, undercut by 143 type errors, zero authorization tests, and confirmed logic gaps (oversell race, unenforced plan limits). |
| Reliability | **4/10** | Good error boundaries and structured logging. No CI/CD, no health checks, no retry or circuit-breaker discipline, migrations that cannot apply to a fresh database. |
| Architecture | **6/10** | Clear layering, sound conventions, correct RLS helper patterns. Undermined by ~2,000 LOC of duplicated edge-function copies, drifting CORS implementations, and 118 `any` casts defeating generated types. |
| Performance | **5/10** | Real optimization work. Missing the single most important index; 1.58 MB uncompressed chunk; `REPLICA IDENTITY FULL` on 12 tables. |
| Production Readiness | **3/10** | Blocked on the P0 list. |

---

## 2. System Understanding

A multi-tenant, Lu.ma-style events platform. Organizers create branded event pages,
issue tickets, check attendees in and out by QR, host live webinars, and run community
spaces. Personas: attendee, speaker, sponsor, organizer, platform super-admin.

Stack verified against the code, not the README:

| Layer | Actual |
|---|---|
| Build | Vite 5.4.19 + SWC, TypeScript 5.8, PWA via `vite-plugin-pwa` 1.3 |
| UI | React 18.3, Tailwind 3.4, shadcn/Radix, Framer Motion, Sonner |
| Routing | `react-router-dom` 6.30, `React.lazy` route splitting |
| Server state | TanStack Query 5.83 |
| Backend | Supabase — Postgres + RLS, Realtime, Storage, 28 Deno Edge Functions |
| Auth | Supabase Auth, session in `localStorage` |
| Video | LiveKit **and** Agora — dual providers, env + per-event column switch |
| Email | SMTP via `_shared/smtp.ts` |
| Messaging | Meta WhatsApp Cloud API |
| AI | Google Gemini `imagen-4.0-generate-001` (images), plus an in-progress copy generator |
| Observability | Custom logger + Sentry-compatible remote sink |
| Hosting | Vercel — SPA + 2 Edge API routes |
| Tests | Vitest 3.2.4, fast-check 3.23, Playwright 1.57 |

**Scale:** 477 TS/TSX files, ~126,500 LOC in `src/`. One 536 KB consolidated migration
(`000_full_schema.sql`, 10,572 lines) plus 9 incremental migrations.

### README accuracy

The README should not be relied on. Verified discrepancies:

- Links to `specs/`, `steering/`, and `.kiro/specs`. **All three directories do not
  exist** — removed in commits `6e3503c` and `becdfd2`. Every "see the audit report"
  and "start at project-overview.md" pointer is dead.
- Lists "Rate limiting on edge functions" and "HMAC verification on webhooks" under a
  **Security Features** heading, annotated `(TODO: implement)`. The heading is
  misleading; only one function has a quota and only one webhook was verified at the
  audited commit.
- Documents `VITE_SUPABASE_ANON_KEY`; the client actually reads
  `VITE_SUPABASE_PUBLISHABLE_KEY` (`src/integrations/supabase/client.ts:6`).
- Marketing copy claims Stripe and Razorpay support (`src/pages/FaqsPage.tsx:115`,
  `src/components/FeaturesSection.tsx:549`). **There is no payment gateway integration
  anywhere in the repository.** `amount_paid` is a manually entered numeric column.
- Claims a `@tanstack/react-virtual` dependency for virtualized lists. Not in
  `package.json`.
- Claims the consolidated schema is idempotent and safe to re-run. Three migrations are
  not (QA-011).

---

## 3. Architecture Overview

```
                        ┌──────── TRUST BOUNDARY 1 ────────┐
Browser (untrusted)     │  Vercel CDN / Edge                │
  React SPA             │   ├─ static SPA + PWA SW          │
  session in            │   ├─ /api/event-og   (anon key)   │
  localStorage ─────────┤   └─ /api/widget     (anon key)   │
  anon key in bundle    └───────────────────────────────────┘
       │
       ├──── PostgREST (anon or user JWT) ──►┌─ TRUST BOUNDARY 2 ─┐
       │                                     │ Postgres + RLS     │ ◄── the real
       ├──── Realtime WS (33 channels) ─────►│ 66/67 tables RLS   │     boundary
       │                                     │ 157 SECURITY       │
       ├──── Storage (public buckets) ──────►│ DEFINER fns        │
       │                                     └────────────────────┘
       │                                              ▲
       └──── Edge Functions (28) ──────────────────────┘
             !! 12 use SERVICE ROLE and bypass RLS
             !! only 4 verify caller identity AND authorization
                    │
                    ├──► LiveKit Cloud    (HMAC-verified webhook — correct)
                    ├──► Agora RTC/RTM    (token minted with no caller check)
                    ├──► Meta WhatsApp    (webhook now HMAC-verified — see SEC-013)
                    ├──► Google Gemini    (authorized + quota — correct)
                    ├──► SMTP relay       (reachable by unauthenticated callers)
                    ├──► open.er-api.com  (FX rates)
                    └──► GeoNames         (city seed, unauthenticated trigger)

       pg_cron (1/min) ──► communications_run_scheduled()
                            └─ net.http_post w/ service key ──► sender functions
```

### Trust boundary strength

| Boundary | Intended control | Verified reality |
|---|---|---|
| Browser → Postgres | RLS + column grants | **Strong.** Well-designed policies, correct `SECURITY DEFINER` helpers to break circular RLS. Three permissive gaps. |
| Browser → Edge Functions | `verify_jwt` + origin allowlist | **Effectively absent.** `verify_jwt` is satisfied by the public anon key; the allowlist accepts any `*.vercel.app`. |
| Third party → Webhooks | Signature verification | **Now correct for both.** LiveKit always was; WhatsApp fixed in the working tree. |
| Tenant → Tenant | `org_members` / `is_org_owner` | **Mostly correct for reads.** One broken policy, one unscoped INSERT. |
| Client → Privileged fields | RLS `WITH CHECK` | **Weak.** `profiles` permits self-update of every column, including `banned_at`. |

---

## 4. Security Assessment

### 4.1 The systemic issue

`supabase/config.toml` sets `verify_jwt = true` for the email, WhatsApp, and
account-creation functions, and code comments treat that as the security control —
for example `supabase/functions/agora-token/index.ts:26` claims the function is safe
because it "can sit behind Supabase's edge runtime auth (verify_jwt = true in
config.toml)."

Two problems:

1. `agora-token` is **not listed in `config.toml` at all**. Fourteen of 28 functions are
   absent and fall back to the platform default.
2. More fundamentally, `verify_jwt` only checks that the presented JWT is signed by the
   project secret. The anon key is such a JWT and is public by design — it is in
   `dist/assets/*.js`. `verify_jwt = true` therefore means "requires a token every
   visitor already has."

Only **4 of 28** functions perform a real caller check: `send-ticket-reply`,
`whatsapp-sync-templates`, `generate-creative-background`, and the LiveKit control
family (`livekit-room-create` / `-end` / `-go-live` / `-promote`, `recording-start` /
`-stop`).

### 4.2 Authentication

| Check | Result |
|---|---|
| Password hashing | Delegated to Supabase Auth. Correct. |
| Session storage | `localStorage`, `persistSession`, `autoRefreshToken` (`client.ts:11-17`). Supabase default; makes any XSS a refresh-token compromise. |
| Session invalidation | Clears the Supabase token only. Query cache, LiveKit token, IndexedDB queue all survive (SEC-022). |
| 2FA | **Bypassable.** Session is issued before the OTP dialog; no gate consults 2FA state (SEC-008). |
| Forced password change | **Bypassable and self-clearable.** Flag lives in user-writable `user_metadata` (SEC-009). |
| Password policy | Inconsistent. Signup enforces a strength score; the recovery flow enforces only `minLength={6}` (SEC-027). |
| Account enumeration | Primary paths correctly generic. One fall-through leaks raw provider messages (SEC-028). |
| Rate limiting | None client-side. None in edge functions except one quota. Relies entirely on Supabase Auth defaults. |

### 4.3 Authorization

Load-bearing strengths, confirmed by reading the SQL:

- **No self-grant path to admin.** `user_roles` has exactly two policies, both
  `FOR SELECT`. Migration `021` grants only `SELECT`. Under RLS default-deny every
  write by `authenticated` / `anon` is refused. The sole mutator,
  `admin_set_user_role`, checks `has_role(auth.uid(),'admin')` first and refuses to
  remove the last admin. Writes are audited by triggers.
- **`registrations` SELECT / UPDATE / DELETE policies are correct** — a real three-way
  join with role differentiation that excludes `viewer` from writes
  (`000_full_schema.sql:9126-9191`).
- **All `admin_*` mutators gate on `has_role` before acting.**
- **`get_event_attendees_public` is properly scoped** — `approval_status='approved' AND
  status='published'`, returns display name and avatar only, never email.

**A false positive I want to retract explicitly.** `src/pages/dashboard/SettingsPage.tsx:432`
updates `org_members.role` from the client keyed on row id alone, which reads like
privilege escalation. The server blocks it: `CREATE POLICY "Owner manage members" ON
public.org_members FOR ALL TO authenticated USING(is_org_owner(...)) WITH
CHECK(is_org_owner(...))`. **Not a vulnerability.** The same applies to the
`OrgContext` auto-repair insert — its `WITH CHECK` requires the caller to already be
`organizations.owner_id`. Reported here so nobody spends a sprint on it.

The genuine authorization failures are SEC-005, SEC-006, SEC-011, and SEC-017.

### 4.4 Input security

| Class | Finding |
|---|---|
| SQL injection | **Not found.** All access via PostgREST builders or `.rpc()`. No raw SQL string construction in any edge function. |
| PostgREST filter injection | **One instance** — `org-events/index.ts:35-43` interpolates unvalidated input into an `.or()` filter (SEC-019). Limited blast radius: it is the only function using the anon key, so RLS still applies. |
| Command injection | **Not found.** No `Deno.Command`, `Deno.run`, or `child_process` anywhere in `supabase/functions/`. |
| XSS | Sanitizer is solid — `src/lib/sanitize-html.ts:35-104` uses DOMPurify with an explicit allow-list, `FORBID_ATTR: ["style","srcdoc","formaction","ping"]`, `ALLOW_DATA_ATTR: false`, and a hook forcing `rel="noopener noreferrer"`. `markdown.ts` escapes *then* sanitizes. 3 of 4 `dangerouslySetInnerHTML` sites are covered; the 4th is stock shadcn chart CSS (SEC-025, needs verification). |
| SSRF | No user-supplied URL is fetched. One indirect blind vector: `og-event` fetches a banner URL read from the DB. Response bytes are only image-decoded, never returned. |
| Open redirect | **Correctly defended** in first-party code — `App.tsx:202` and `LoginPage.tsx:70-78` both require `startsWith("/") && !startsWith("//")`. Note the dependency-level advisory in §14. |
| Path traversal / deserialization / prototype pollution | Not found in first-party code. Present in transitive dependencies (§14). |

### 4.5 Web security

`vercel.json` sets `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, HSTS with
preload, `Referrer-Policy: strict-origin-when-cross-origin`, and a restrictive
`Permissions-Policy`. A good baseline.

**There is no `Content-Security-Policy` header.** Verified absent from `vercel.json`,
`index.html`, `public/`, `api/`, and `src/`. Combined with sessions in `localStorage`,
any XSS becomes full account takeover including the long-lived refresh token (SEC-014).

CORS has two structural weaknesses in `supabase/functions/_shared/cors.ts`, both of
which defeat the CSRF rationale stated in that file's own header comment:

```ts
} else if (origin && /^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.vercel\.app$/i.test(origin)) {
  headers["Access-Control-Allow-Origin"] = origin;
  headers["Access-Control-Allow-Credentials"] = "true";
```

Anyone can deploy to `*.vercel.app`, making this an attacker-controllable allowlist
entry with credentials enabled (SEC-012). Separately, `DEV_ORIGINS`
(`localhost:5173` / `:8080`) is seeded unconditionally with no environment gate
(SEC-030).

`generate-creative-background` keeps a **private copy** of `buildCorsHeaders`
reproducing the same hole, so fixing `_shared/cors.ts` will not fix that function
(ARCH-002).

### 4.6 Secrets and cryptography

**The application bundle is clean.** Verified by scanning 225 built JS files in
`dist/assets/` and `git ls-files`:

- No service-role key, SMTP password, Agora certificate, LiveKit secret, or WhatsApp
  token in the bundle. The single `SMTP_PASSWORD` string match is a UI hint in
  `SettingsPage.tsx:400`.
- No JWT-shaped literals in the bundle.
- Only `.env.example` is tracked. `dist/` is untracked.
- Edge functions log presence booleans, never values.
- Token generation uses `gen_random_uuid()` / `gen_random_bytes()`.
  `generate_ticket_number()` draws from `gen_random_bytes(4)` — ~16.7M values/year,
  adequate.

**One credential is exposed, outside the bundle.** See SEC-000.

Residual leakage is error detail rather than credentials: raw upstream provider bodies
returned to callers (`send-whatsapp/index.ts:201`, `recording-start/index.ts:44-47`),
internal exception strings (`agora-token/index.ts:126,153`), and a `step` field naming
the failed internal phase (SEC-024).

---

## 5. QA / Functional Assessment

### Confirmed logic defects

**Ticket oversell race (QA-002).** `events.capacity` exists but no constraint or trigger
enforces it. `src/components/EventRsvpCard.tsx:186` checks `isFull` client-side from a
live count and the comment calls it "defense-in-depth" — but it is the *only* depth. Two
concurrent RSVPs both read `count = capacity - 1` and both succeed.
`_recompute_tickets_sold` runs `AFTER INSERT`, so it records the oversell rather than
preventing it.

**Plan limits are decorative (QA-003).** `organizations.plan_limits` defaults to
`{"max_events":3,"max_attendees_per_event":50,"max_team_members":1}`. Grepping every
migration: **no policy, trigger, or function reads `plan_limits`.** A free-tier org can
create unlimited events and accept unlimited attendees by calling PostgREST directly.
Direct revenue impact.

**`accountType` fails open (QA-006).** `src/contexts/AuthContext.tsx:56` —
`setAccountType(t === "attendee" ? "attendee" : "organizer")`. A missing profile row, an
RLS denial, or a null column all resolve to `"organizer"`, the permissive branch that
`OrganizerRoute` gates on. Client-side only, so RLS remains the real boundary, but the
default is inverted.

**Impure state updater on the auth critical path (QA-007).** `AuthContext.tsx:106-124`
calls `setLoading` and `setUser` *inside* the `setSession` updater callback. React state
updaters must be pure; under StrictMode or concurrent rendering the updater can run
twice, double-firing the `user_roles` fetch. Every route gate keys off `loading`.

**No `UNIQUE` on `events.slug` (QA-005).** The column is `text NOT NULL` with no
constraint in its `CREATE TABLE`. Uniqueness is policed by application-level collision
retry plus `scripts/check-event-slugs.mjs`. Concurrent creates can collide, and public
event URLs are built from the slug. *HIGH CONFIDENCE — absence confirmed in the table
definition; I did not exhaustively enumerate all 10,572 lines for a later
`CREATE UNIQUE INDEX`.*

**Missing foreign keys (QA-009).** These are `uuid` with no `REFERENCES`:
`organizations.owner_id NOT NULL` and `org_members.user_id NOT NULL` — the two columns
the entire tenant model pivots on — plus `registrations.user_id`,
`registrations.approved_by`, and every `webinar_*.user_id`. Orphan rows survive user and
org deletion.

**Cascade blast radius (QA-010).** `events.user_id → auth.users ON DELETE CASCADE`, then
`registrations.event_id → events ON DELETE CASCADE`, then `attendance_events`,
`sessions`, `event_creatives`, `event_venue_selections`. `admin_delete_user`
(`000_full_schema.sql:8409`) runs `DELETE FROM auth.users`. No soft delete, no
confirmation token, no export-first step. By contrast `events.org_id` is
`ON DELETE SET NULL`, so deleting an org alone is non-destructive — the asymmetry is
worth preserving deliberately rather than by accident.

**Migrations cannot apply to a fresh database (QA-011).**
`027_event_venue_selections.sql:13,52` references `vendors(id)` and
`is_vendor_member(uuid,uuid)`, **neither defined anywhere in this repository**.
Additionally: two files share the `027_` prefix, breaking Supabase's
one-file-per-version assumption; and `022`, `023`, and
`027_event_creatives_event_type` are not idempotent (`CREATE TABLE` and
`DROP CONSTRAINT` without `IF EXISTS`), contradicting the README.

**Client-side lifecycle fallback (REL-003).**
`src/pages/dashboard/event/BroadcastPage.tsx:243,255,259,309` writes
`webinar_sessions.status = "live" / "ended"` directly when the edge function is
unavailable. Deliberate graceful degradation, but it makes session lifecycle
client-writable.

### Correctness strengths worth protecting

- The attendance state machine is a pure function with 13 fast-check property suites
  covering transitions, ordering invariants, idempotence, and rapid-scan dedup.
- `self_check_in` was deliberately hardened so the public flow can never check someone
  *out*; the comment documents the removed `kind='out'` insert.
- `accept_org_invitation` closes the revoked-invite replay loophole and was later made
  idempotent for double-submit races.
- The `registrations` realtime publication uses an **explicit non-PII column list**
  rather than the whole row — a deliberate, correct decision.

---

## 6. Authentication & Authorization Assessment

All 11 client gates in `src/App.tsx` render `<FullPageLoader />` while resolving.
**None renders children before its check completes.** Consistently correct.

| Gate | Line | Checks |
|---|---|---|
| `ProfileGate` | 174 | waits on auth + org; redirects to `/complete-profile` |
| `ProtectedRoute` | 206 | `!user` → login |
| `OrganizerRoute` | 218 | attendee && !admin && !member → `/my/tickets` |
| `AttendeeRoute` | 235 | auth only |
| `SuperAdminRoute` | 244 | `!isAdmin` → `/dashboard` |
| `AuthOrgGate` | 256 | waits on org loading |
| `OnboardingGuard` | 262 | waits on **org** loading only |
| `RequireAuthOnly` | 486 | auth without profile check |
| `DashboardLanding` | 524 | routes admins to the control tower |

**Admin determination is clean.** Read from the DB at `AuthContext.tsx:38-46` and
independently at `LoginPage.tsx:262-269`. Grep confirms **zero** hits for `ADMIN_EMAILS`;
no client-side `is_admin` computation; `user_metadata` is read only for display names and
`must_change_password`. Fails closed on query error.

**Structural gaps.** Eight routes have no gate wrapper and self-gate inside the page
(`App.tsx:354-363`): `/e/:id/live`, `/checkin/:eventId`, `/checkout/:eventId`, and the
`/sponsor/*` and `/speaker/*` families. Functionally fine today, but a new page added
under those prefixes inherits no protection. `OnboardingGuard` waits on org loading but
not auth loading — safe only because of where it is nested.

`/community/*` uses `AttendeeRoute`, so any authenticated user can mount any community
page; RBAC is claimed to live inside `CommunityLayout`. **NOT VERIFIED** — I did not
audit that layer.

The four confirmed authorization defects are all server-side. Client gates are cosmetic
by definition, and the code comments correctly acknowledge this.

---

## 7. AI / LLM / RAG Security Assessment

**Scope note:** there is **no RAG, no vector store, no agent, and no tool-calling**,
which removes most of this category. Two text→image/text Gemini integrations exist.

`supabase/functions/generate-creative-background/index.ts` — Gemini
`imagen-4.0-generate-001`:

| Concern | Finding |
|---|---|
| Authentication | Bearer required, `auth.getUser(jwt)` verified (`:437-462`) |
| Authorization | Event-owner check with `has_role('admin')` fallback (`:464-501`) |
| Rate limiting | **The only rate limit in the codebase** — 20/event/24h, returns 429 (`:545-573`) |
| Caching | SHA-256 cache key over `(eventId, prompt, preset, ratio)`; prevents redundant paid calls |
| Prompt injection | **Low risk by architecture.** Output is an image, not text fed back into a decision. No tool-calling, no system-prompt concatenation with retrieved content. |
| Prompt length clamp | **Missing.** `promptText` is validated non-empty (`:361-375`) but never truncated before `instances: [{ prompt: ... }]` (`:607`). Quota is per-event count, not per-token — cost amplification, not injection (AI-001). |
| PII to third party | Prompt composed client-side from event metadata. No attendee PII in the path. |
| Prompt retention | Stored in `event_creative_backgrounds` (`:776`), organizer-scoped. Acceptable. |
| Secret handling | Key from env, never returned. Error bodies excerpted to 500 chars. |

`supabase/functions/generate-creative-copy/` (untracked, in progress) follows the same
pattern — `Authorization` required, `auth.getUser`, `GEMINI_COPY_DAILY_QUOTA`,
`rate_limit` error code. **NOT FULLY AUDITED** — new since the audited commit; it should
get a focused review before deploy, specifically on prompt-length clamping and whether
generated copy is ever rendered as HTML rather than text.

**Assessment:** the background generator is the best-engineered function in the
repository. Use it as the reference pattern when fixing the other 24.

---

## 8. Database Assessment

**Strengths.** RLS on 66/67 tables. `SET search_path` on 157/157 `SECURITY DEFINER`
functions — zero search-path hijack surface. Correct use of `SECURITY DEFINER` helpers
(`is_org_member`, `is_org_owner`, `has_role`) to break circular RLS, with migration
`014` documenting precisely why raw table references inside policies broke anonymous
reads. Partial unique index `registrations(event_id, lower(email)) WHERE status <>
'cancelled'` correctly exempts cancellations. `registrations(join_token)` and
`registrations(qr_code)` both uniquely indexed.

**Confirmed problems.**

| Issue | Evidence |
|---|---|
| `profiles SELECT USING(true)` for `authenticated` | `000:85`; table holds `mobile_number`, `linkedin_url`, `company`, `designation` (`000:78-92`) |
| `profiles UPDATE` with **no column restriction and no `WITH CHECK`** | `000:86`. Only trigger is `update_profiles_updated_at`. Permits self-clearing `banned_at`, self-setting `email_verified`, flipping `account_type`, disabling `two_factor_enabled`. |
| `registrations` INSERT not scoped to the caller's events | `000:8594-8599` |
| `event_venue_selections` policy never references the caller | `027_event_venue_selections.sql:35-45` — the second disjunct compares two row columns |
| `webinar_reactions` anon INSERT `WITH CHECK (true)`, `user_id` has no FK | `000:6859-6866` |
| `organizations.billing_email` anon-readable | `000:135` + `000:9450-9461` |
| `community_badges` — the only table without RLS | `000:2876`. Low impact: static catalogue, `SELECT`-only grant. |
| `ALTER DEFAULT PRIVILEGES … TO service_role` on all future tables | `000:9254-9260`. Permanently forecloses least-privilege. |

**Indexes — the README's own claim is correct.** There is **no usable index on
`registrations(event_id)`**. The only indexes with `event_id` leading are all *partial*:
`idx_registrations_utm_source` and `idx_registrations_utm_campaign`
(`000:8679-8685`, both `WHERE … IS NOT NULL`) and
`registrations_event_email_unique` (`000:10296-10298`, `WHERE status <> 'cancelled'`).
A plain `WHERE event_id = $1` — exactly what the `"Owner view regs"` policy filters on —
qualifies for none of them and falls back to a sequential scan plus a correlated
`EXISTS` per row. Also missing: `registrations(user_id)`, despite the
`"Attendee view own"` policy filtering on it for every attendee page load, and
`registrations(email)`, used by the orphan-claim path in `handle_new_user()`.

**Realtime.** `REPLICA IDENTITY FULL` on 12 tables, which writes every column of the old
row into the WAL. 17 tables in `supabase_realtime` plus community and communications
tables. No RLS bypass found — Supabase evaluates RLS per subscriber for
`postgres_changes`. The one place the layers compose badly is `webinar_reactions`: in the
publication *and* `USING(true)` for `anon`, so anonymous subscribers legitimately receive
a live feed. Whether Realtime is configured with RLS enforcement on this project is
**NOT VERIFIABLE from SQL** — it is server config.

**Secrets in SQL.** None hardcoded. `net.http_post` calls at `000:5870-6010` use a
`_service_key` variable guarded by a NULL check. **NOT VERIFIED:** where `_service_key`
is populated. If it is read from a row in `public.app_settings`, then read access to that
table is equivalent to holding the service-role key. `app_settings` has RLS enabled but I
did not read its policies. **This is the highest-value follow-up in this section.**

---

## 9. API Assessment

The "API" is three surfaces: PostgREST (governed by RLS), 28 Edge Functions, and 2 Vercel
Edge routes.

| Concern | Finding |
|---|---|
| Missing authentication | 12 functions, service-role, no caller check (SEC-001 – SEC-004, SEC-018) |
| Missing authorization | Present even in some authenticated functions — `send-speaker-invite-email` and `send-sponsor-invite-email` fetch the speaker/sponsor and the event **independently**, never checking the two are linked |
| Excessive data exposure | `og-event` selects `status` and never filters on it, rendering unpublished event title, date, venue, and banner into a publicly cacheable PNG (SEC-020) |
| Mass assignment | `RegistrantQuickView.tsx:290` destructures a denylist then `insert(rest as any)`; `SettingsPage.tsx:168` uses `update(payload as never)`. Both defeat the generated types (SEC-026) |
| Rate limiting | One quota, one function. Nothing else — including the public contact form and every mail sender |
| Improper error responses | Raw upstream provider bodies and internal `step` names returned to callers (SEC-024) |
| API versioning | None. Acceptable for a single-client SPA |
| Pagination | 35 `.limit()` calls, **zero `.range()` calls** — no cursor/offset pagination anywhere (PERF-002) |

The Vercel routes are sound: `api/widget.ts` exists specifically to stop leaking the
Supabase URL and anon key into third-party embed snippets, and `api/event-og.ts` falls
back to unmodified `index.html` on every error path so crawlers never see a 5xx. Both use
the anon key, so RLS still applies.

---

## 10. Frontend Assessment

**Good:** sanitizer discipline (§4.4), correct open-redirect guards, `RootErrorBoundary`
plus per-route `RouteErrorBoundary`, `lazyWithLog` so chunk-load failures reach the logger
before the boundary, no secrets in the bundle, gates that never leak children early.

**Issues:**

- **Logout leaves the previous user's data in memory (SEC-022).** `signOut` is two lines.
  `queryClient` is a module-level singleton with `gcTime: 5 * 60_000`, and grep for
  `queryClient.clear` / `removeQueries` across `src/` returns **zero hits**. Because
  `navigate("/")` is an SPA transition with no reload, the outgoing user's cached data
  stays resident — attendee PII, registration lists, revenue figures, the admin
  user-management table. Also uncleared: a LiveKit JWT in `sessionStorage`
  (`EventLivePage.tsx:273`) and the IndexedDB observability queue.
- **No CSP (SEC-014)**, with sessions in `localStorage`.
- Unvalidated organizer-supplied `mapEmbedUrl` in an `<iframe src>` in
  `PublicEventRenderer.tsx` — a phishing/framing surface on the org's own page rather
  than direct XSS.
- `src/lib/webinar/agora-token.ts` exports certificate-signing helpers and lives under
  `src/`. Currently tree-shaken out (only a test imports it), but one stray import would
  put an Agora certificate path in the browser bundle. Move it out of `src/`.
- Accessibility and mobile responsiveness were **NOT VERIFIED** — that requires manual
  testing with assistive technologies and expert review, which is outside a static audit.

---

## 11. Performance Assessment

| ID | Finding |
|---|---|
| PERF-001 | **No usable index on `registrations(event_id)`.** Every organizer registration list, check-in scan, and analytics query sequentially scans plus runs a correlated `EXISTS` per row inside the RLS policy. This is the documented first failure mode of the authenticated API. |
| PERF-002 | **Zero `.range()` calls** — no real pagination. Registration lists and admin tables fetch whole result sets. |
| PERF-003 | `REPLICA IDENTITY FULL` on 12 tables multiplies WAL volume; the documented failure mode for a single live event page at ~500 concurrent attendees. |
| PERF-004 | 33 realtime channel subscriptions; `EventLivePage` alone opens 5. Concurrent-connection quota is reached well before CPU. |
| PERF-005 | Bundle: `AgoraWebinarStage` 1.58 MB (439 KB gzip), `index` 1.08 MB (318 KB gzip), `excel` 939 KB. Heavy deps are lazily loaded, but the Agora chunk is large for a mobile live-event join. |
| PERF-006 | `create-participant-account` calls `auth.admin.listUsers()` with no pagination to find one user by email — O(all users) per invocation. |
| PERF-007 | `whatsapp-webhook` fetches the 200 most recent recipient rows across **all orgs** and matches on phone-digit suffix in application code, rather than an indexed lookup. |

Positive: route-level code splitting, `staleTime: 30s` / `gcTime: 5min`, lazy ExcelJS /
jsPDF / Agora, image `loading="lazy" decoding="async"`, service-worker cache-first for
storage assets and network-first with a 3s timeout for REST.

---

## 12. Reliability Assessment

| Question | Answer |
|---|---|
| What happens when SMTP fails? | Handled well — `submit-support-ticket` returns 200 with `email_delivered: false` so the ticket still exists and is trackable. |
| When Gemini fails? | Handled — typed error codes, `service_outage`, cache preserved. |
| When LiveKit fails? | Client falls back to writing session status directly (REL-003) — degrades, but moves a server concern to the client. |
| When Meta WhatsApp fails? | Per-recipient `error_message` rows; parent envelope flipped to `failed` with a retry button. |
| When the FX API fails? | 5-minute cache with stale fallback. |
| When Postgres is slow? | Service worker serves REST responses from a 5-minute cache after a 3s timeout. Reasonable. |
| When an edge function is down? | `EventRsvpCard` surfaces a discreet toast and keeps the registration. Correct: the durable write already happened. |

**Gaps:** no CI/CD at all (`.github/` does not exist), so nothing runs tests, type checks,
or `npm audit` before deploy. No health or readiness endpoint. No idempotency keys on
sender functions — the only guard is the `pending` status filter. `pg_cron` fires
`communications_run_scheduled()` every minute with no distributed lock; overlap safety
rests entirely on that status filter. No documented rollback strategy, no backup
verification, and migrations that cannot apply cleanly to a fresh database (QA-011) mean
disaster recovery is unproven.

---

## 13. DevOps / Infrastructure Assessment

No Docker, Kubernetes, or Terraform — Vercel + Supabase managed. That removes container
and IaC risk entirely.

| ID | Finding |
|---|---|
| SEC-000 | **GitHub PAT in plaintext in the git remote URL** (`.git/config`). Any tool that prints the remote leaks it. **Rotate immediately.** |
| DEV-001 | **No CI/CD.** Nothing gates a deploy on tests, types, lint, or dependency audit — which is why 143 type errors and 154 lint errors are on `main`. |
| DEV-002 | `.npmrc` sets `legacy-peer-deps=true` globally to work around one Agora peer conflict, silencing all future peer-dependency errors. |
| DEV-003 | Source maps are `"hidden"` in production and uploaded only when `OBSERVABILITY_AUTH_TOKEN` is set; otherwise `.map` files ship to `dist/`. `vercel.json` sets `no-store` + `noindex` on `.map`, but they remain fetchable. |
| DEV-004 | `ALLOWED_ORIGINS` cannot be verified from the repo. If unset, `_shared/cors.ts` falls back to dev origins plus the `*.vercel.app` wildcard. **NOT VERIFIED — check the deployed secret.** |
| DEV-005 | `supabase/fix_communities.sql` and `fix_missing_members.sql` sit outside `migrations/` as untracked-intent repair scripts. Schema drift risk. |

`.gitignore` correctly excludes `.env*` (except `.env.example`), `dist`, and
`supabase/.temp/`. Verified: only `.env.example` is tracked.

---

## 14. Dependency & Supply Chain Assessment

`npm audit`: **24 advisories — 1 critical, 16 high, 6 moderate, 1 low.** Every one has a
fix available. No abandoned or typosquat-looking packages; all direct dependencies are
mainstream.

| Severity | Package | Issue | Real-world relevance here |
|---|---|---|---|
| CRITICAL | `vitest` <3.2.6 | Arbitrary file read/execute when the UI server listens | Dev-only. Low real risk — UI server not used in CI (there is no CI). |
| HIGH | `react-router-dom` 6.0–6.30.2, `react-router`, `@remix-run/router` | XSS via open redirect; protocol-relative `//` reinterpretation | **Most relevant advisory.** First-party guards already reject `//`, but this is at the router layer, beneath those checks. Upgrade. |
| HIGH | `vite` ≤6.4.2 | Path traversal in optimized-deps `.map`; middleware file disclosure | Dev-server surface. Upgrade. |
| HIGH | `postcss` ≤8.5.22 | XSS via unescaped `</style>`; file read via `sourceMappingURL` | Build-time. Compounds SEC-025. |
| HIGH | `lodash` ≤4.17.23 | Prototype pollution in `_.unset`/`_.omit`; code injection via `_.template` | Transitive. |
| HIGH | `ws`, `form-data`, `glob`, `js-yaml`, `minimatch`, `picomatch`, `nanoid`, `flatted`, `fast-uri`, `brace-expansion` | DoS/ReDoS, CRLF injection, prototype pollution | Mostly transitive build tooling. |
| MODERATE | `dompurify` ≤3.4.12 | `IN_PLACE` hook removal leaves a detached subtree executable; `CUSTOM_ELEMENT_HANDLING` bypass | **Direct dependency and the primary XSS control.** Upgrade first among the moderates. |
| MODERATE | `esbuild` ≤0.24.2 | Dev server accepts any origin's requests | Dev-only. |

**Lockfile hygiene:** three lockfiles coexist — `bun.lock`, `bun.lockb`,
`package-lock.json`, `pnpm-lock.yaml`. The README says bun is canonical and to ignore the
pnpm files, but Vercel's `installCommand` is `bun install --frozen-lockfile` while
`api/` dependencies install via npm. **Two package managers resolve the dependency tree
for one deploy.** Delete the unused lockfiles.

No `postinstall` scripts in first-party `package.json`.

---

## 15. Test Coverage Assessment

**Ran:** `npx vitest run` → **120 files, 500 tests, all passing, 16.09s.** Genuinely
healthy for a unit suite.

**Distribution — this is the finding:**

| Area | Test files |
|---|---|
| `src/lib/creatives` | 40 |
| `src/lib/brochure` | 22 |
| `src/lib/observability` | 19 |
| `src/lib/attendance` | 13 |
| `src/lib` (misc) | 8 |
| `src/lib/utm` | 7 |
| components / pages | **6** |
| E2E (Playwright) | **1 file, 50 lines** |
| Visual regression | 1 file, 46 lines |

Testing is concentrated on pure functions — PDF layout, creative rendering, redaction,
the attendance state machine. That work is high quality: the attendance PBT suite covers
transitions, ordering, idempotence, and rapid-scan dedup, and the redaction tests check
scrubbing completeness.

**What is not tested at all:**

- **Every authorization boundary.** Zero tests assert that a non-owner cannot read
  another org's registrations, that an attendee cannot reach organizer routes, or that
  `user_roles` writes are refused. The one RLS-named test
  (`property-48-brand-kit-rls.pbt.test.ts`) tests a client-side predicate mirroring an
  RLS rule, not the database.
- **Every edge function.** No test exercises any of the 28 functions — which is exactly
  where the critical findings are.
- Auth flows: login, signup, password reset, 2FA, `must_change_password`.
- Concurrency: the oversell race (QA-002) and the `join_token` single-device claim.
- The E2E suite is one logged-out smoke test against a hardcoded event path
  (`/org/wybe/events/tech-summit-2026`), which will silently fail if that fixture is
  removed.

**Tests are not evidence of correctness here.** Every confirmed finding in this report
lives in code the suite does not touch. See §21 for the specific tests I would write.

---

## 16. Code Quality & Architecture Assessment

Distinguishing engineering risk from maintainability from cosmetics.

**Engineering risk:**

- **ARCH-001 — ~2,000 LOC of duplicated edge-function copies.** Six
  `dashboard-inline.ts` files each re-implement CORS parsing and mail sending. They are
  not the deployed entrypoints but are the copy-paste source, and they already carry the
  `no-console` violations the project bans elsewhere.
- **ARCH-002 — CORS implementation drift.** `generate-creative-background` maintains a
  private `buildCorsHeaders` reproducing the `*.vercel.app` hole. Fixing `_shared/cors.ts`
  will not fix it.
- **ARCH-003 — 143 TypeScript errors on `main`.** Including real type mismatches
  (`event_emails` missing from generated `Database` types in `MarketingPage.tsx`,
  `video_provider` column mismatch in `EventLivePage.tsx`). Generated types are stale
  relative to the schema, and 118 `any` casts plus `as never` escapes hide the gap.

**Maintainability:**

- God files: `brochure-pdf.ts` 2,792 LOC; `editor-templates.ts` 2,230;
  `RegistrationsSection.tsx` 2,049; `creative-renderer.ts` 1,847.
- 154 lint errors / 44 warnings: 118 `no-explicit-any`, 14 `no-console` (all in
  `supabase/functions`, outside the intended `src/` scope), 8 `no-empty`.
- `000_full_schema.sql` at 10,572 lines with minified single-line function bodies is
  effectively unreviewable. The consolidation was well-intentioned but has made the
  authorization model hard to audit — which is itself a security property.
- README rot (§2) actively misleads.

**Cosmetic, not worth prioritizing:** `no-empty` blocks, `prefer-const`,
`no-useless-escape`, `require()` in `tailwind.config.ts`.

**Genuinely good patterns to preserve:** the `supabaseRpc` wrapper enforced by lint;
`SECURITY DEFINER` helpers to break circular RLS; migration comments that explain *why*
a previous approach broke (`014` on anon reads is a model of this); the explicit non-PII
realtime column list; `publicOrigin()` centralizing host resolution.

---

## 17. Detailed Findings

### SEC-000 — GitHub PAT stored in plaintext in the git remote
**Category** DevOps / Secrets · **Severity** CRITICAL · **Confidence** CONFIRMED
**Location** `.git/config`, `remote.origin.url`

**Problem.** A GitHub Personal Access Token is embedded in the remote URL. Any command
that prints the remote (`git remote -v`, `git config --list`, most CI logs, most
diagnostic scripts) discloses it. Value redacted here and not committed.

**Impact.** The token grants whatever scopes it was issued with against
`illuxus-bm/illuxus` and any other repo in scope — push access at minimum, meaning code
injection into a production deploy path.

**Failure scenario.** A developer pastes terminal output into an issue, a screen share, or
an AI tool. The token is now third-party. It was printed to a terminal during this audit,
so treat it as already disclosed.

**Root cause.** Credential embedded in a URL rather than delegated to a credential helper.

**Fix.** Revoke the token in GitHub settings now. Re-point the remote at the bare HTTPS
or SSH URL and use `osxkeychain` credential helper or SSH keys. Then audit the account's
recent activity for unexpected pushes.

**Priority** P0. Independent of every other finding and takes two minutes.

---

### SEC-001 — Unauthenticated account creation and registration hijack
**Category** Security / AuthN · **Severity** CRITICAL · **Confidence** CONFIRMED
**Location** `supabase/functions/create-participant-account/index.ts:38-152`

**Problem.** Between `Deno.serve` and the privileged write there is no `Authorization`
read, no `auth.getUser`, and no ownership check. The function then, with a service-role
client: enumerates the full user directory via `auth.admin.listUsers()`; creates an auth
user with `email_confirm: true` for a caller-supplied email and password; and reassigns
every `registrations` row matching that email where `user_id IS NULL`.

**Evidence.** `config.toml:31-32` sets `verify_jwt = true`, which the public anon key
satisfies. `:74-77` constructs the service-role client. `:80-83` lists users. `:93-113`
creates a pre-confirmed user. `:146-150` bulk-claims registrations by email with no
tenant scoping.

**Impact.** Pre-authentication account takeover of any person who has been added to an
event but has not yet signed up — a large population for this product. The attacker
receives a working session as that identity plus their registrations across every tenant.
`listUsers()` alone is a full user-enumeration primitive.

**Attack path (conceptual).** Read the anon key from the published bundle. Call the
function naming a target email and a chosen password. Sign in normally.

**Root cause.** The function was designed as an internal callee of the organizer's
"Add Participant" dialog, and the caller's trustworthiness was assumed from the calling
context rather than verified.

**Fix.** Require a bearer token, `auth.getUser`, then confirm the caller owns or is a
member of the org that owns `registration_id` — and derive `email` from that registration
row rather than the request body. Replace `listUsers()` with
`auth.admin.getUserByEmail`. Scope the bulk-claim to that org's events.

**Priority** P0. Highest-severity finding in the report.

---

### SEC-002 — Video tokens minted for any channel without a caller check
**Category** Security / AuthZ · **Severity** CRITICAL · **Confidence** CONFIRMED
**Location** `supabase/functions/agora-token/index.ts:47-159`

**Problem.** The function contains no `createClient`, no `getUser`, and no session
lookup. It is input validation plus signing. `channel`, `uid`, and
`role: "publisher"` all come from the request body; expiry is caller-controlled up to
24h.

**Impact.** Any caller obtains a **publisher** token for any channel name and an RTM
token for any user id — joining a private webinar, publishing audio/video into a live
event, or impersonating another participant in RTM. Also drives Agora billing.

**Root cause.** The header comment at `:26` asserts safety via `verify_jwt = true`, but
`agora-token` is **not listed in `config.toml` at all**, and the anon key would satisfy it
regardless.

**Fix.** Require a bearer token, resolve the caller, then derive `channel`, `uid`, and
`role` **server-side** from the `webinar_sessions` / `webinar_speakers` / `registrations`
rows. Never accept `role` from the client. Mirror the pattern in `livekit-promote`, which
requires a `webinar_speakers` row for self-promotion.

**Priority** P0.

---

### SEC-003 — Authorization bypass in the bulk email sender
**Category** Security / AuthZ · **Severity** CRITICAL · **Confidence** CONFIRMED
**Location** `supabase/functions/send-event-email/index.ts:32-83`

**Problem.** No caller authentication. The only gate is a row-existence lookup on
`event_emails`, and that gate is skipped entirely when `event_id` is one of two magic
string values used for system mail. Caller supplies `subject`, `body`, and
`recipient_emails[]`.

**Impact.** Arbitrary subject and body to arbitrary recipients over the platform's SMTP
identity and sending domain. Recipients are deduplicated but **not capped**. Domain
reputation damage, phishing with authentic headers, and likely blocklisting.

**Note on the error message.** The 403 reads "Email record not found or access denied" —
there is no access check, only a row-existence check, and even that is bypassable. The
message describes a control that does not exist.

**Fix.** Require a bearer token; verify the caller owns/belongs to the event's org; derive
recipients server-side from the event's registrations rather than the request body; cap
recipient count; remove the magic-string bypass in favour of a separate, authorized
internal path.

**Priority** P0.

---

### SEC-004 — Six further unauthenticated service-role senders
**Category** Security / AuthZ · **Severity** HIGH · **Confidence** CONFIRMED
**Locations**
`send-whatsapp/index.ts:55-96` · `send-email/index.ts:59-121` ·
`send-communication-email/index.ts:37-92` · `send-ticket-email/index.ts:218-247` ·
`send-speaker-invite-email/index.ts:168-195` · `send-sponsor-invite-email/index.ts:158-180` ·
`notify-venue-selection/index.ts:25-90`

**Problem.** All take an id from the request body, read it with the service role, and
send. None authenticates the caller. None ties the resource to a tenant.

Two carry an additional authorization defect: the speaker and sponsor invite senders
fetch the person and the event **independently** (`Promise.all`) and never verify the
person is linked to that event.

**Impact.** Trigger any org's email and WhatsApp campaigns; mail any registrant their
ticket and QR; deliver another tenant's event title, date, venue, and capacity to an
arbitrary vendor's owners. Cross-tenant data egress via email, which leaves no trace in
the victim's UI.

**Confirmed still present** in the working tree: `send-whatsapp` gained no auth in the
uncommitted changes.

**Fix.** Apply the reference pattern from `whatsapp-sync-templates:80-101` — build an
anon-key client carrying the caller's JWT, verify `getUser`, check `org_members` for the
target org, *then* switch to the service role. Add the missing person↔event link check.

**Priority** P0 for the two campaign senders (`send-whatsapp`, `send-communication-email`),
P1 for the rest.

---

### SEC-005 — Registration INSERT policy not scoped to the caller's events
**Category** Security / AuthZ / Data integrity · **Severity** CRITICAL · **Confidence** CONFIRMED
**Location** `supabase/migrations/000_full_schema.sql:8594-8599`

```sql
CREATE POLICY "Auth register" ON public.registrations
  FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid() OR user_id IS NULL)
              AND NOT public.is_user_banned(auth.uid()));
```

**Problem.** The predicate constrains *who the row claims to be* but never which
**event** it targets, and `user_id IS NULL` waives even that. There is no check that the
event is published, that registration is open, or that the caller has any relationship to
it. `GRANT INSERT ON public.registrations TO authenticated` is table-wide, so every
column is settable — including `amount_paid`, `checked_in`, `attendance_state`,
`total_minutes`, and `ticket_type`. I verified no trigger resets any of those on insert.

**Impact, compounded by the validation trigger.** `registrations_validate`
(`000:9671-9707`) sets `approval_status := 'approved'` whenever `events.price > 0`, on the
stated premise that "payment IS the gate." **There is no payment gateway in this
codebase.** So for paid events the trigger converts an unauthenticated-in-spirit insert
into an approved ticket. For free approval-gated events the trigger forces `pending`
only for non-organisers, which is correct.

Consequences: pollute any organizer's guest list with approved attendees; inflate
`events.tickets_sold` via the `AFTER` trigger; corrupt revenue reporting through
`amount_paid` (the admin Revenue page aggregates `registrations` directly); and forge
check-in state.

**Fix.** Add to `WITH CHECK`: the event exists and is `published`; `user_id = auth.uid()`
(drop the `IS NULL` waiver for the `authenticated` role — organizer-added guests already
flow through an authorized path); and revoke column-level INSERT on `amount_paid`,
`checked_in`, `attendance_state`, `total_minutes`, `approved_by`, `approved_at` via
`GRANT INSERT (col, …)` instead of a table-wide grant. Enforce capacity in the same
predicate or a `BEFORE INSERT` trigger (fixes QA-002 simultaneously).

**Priority** P0.

---

### SEC-006 — Users can rewrite any column of their own profile, including the ban flag
**Category** Security / AuthZ · **Severity** CRITICAL · **Confidence** CONFIRMED
**Location** `supabase/migrations/000_full_schema.sql:86`

```sql
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE USING(auth.uid()=user_id);
```

**Problem.** No `WITH CHECK`, no column restriction, and `GRANT … UPDATE ON
public.profiles TO authenticated` is table-wide. I verified the only trigger is
`update_profiles_updated_at`, and grep found no column-immutability guard
(`OLD.banned_at`, `OLD.account_type`, `OLD.email_verified` — no matches).

**Impact, in severity order.**
1. **Ban evasion.** `profiles.banned_at` is the sole input to `is_user_banned()`, which
   gates the `events` and `registrations` INSERT policies. A banned user clears their own
   `banned_at` and is fully reinstated. `admin_ban_user` is thereby advisory.
2. **`email_verified` self-assertion.** `CompleteProfilePage.tsx:150` already sets this
   from the client, so the app treats it as client-owned; anything downstream trusting it
   is unsound.
3. **`two_factor_enabled` self-disable** — an attacker holding a stolen session can
   remove the (already weak) 2FA.
4. `account_type` self-promotion to `organizer`.

**Fix.** Replace with a policy carrying `WITH CHECK`, and restrict the grant to
user-owned columns: `GRANT UPDATE (display_name, avatar_url, bio, first_name, …) ON
public.profiles TO authenticated`. Move `banned_at`, `banned_reason`, `email_verified`,
`account_type`, `two_factor_enabled`, `profile_completed` to service-role/RPC control
only. Add a `BEFORE UPDATE` trigger asserting those columns are unchanged as
defence-in-depth.

**Priority** P0. Cheapest critical fix in the report and it restores the moderation
system.

---

### SEC-007 — Full user directory including mobile numbers readable by any account
**Category** Security / Privacy · **Severity** HIGH · **Confidence** CONFIRMED
**Location** `000_full_schema.sql:85` + table at `:78-92`

`CREATE POLICY "Auth can view profiles" … FOR SELECT TO authenticated USING(true);`
with a table-wide `GRANT SELECT`. The table holds `mobile_country_code`,
`mobile_number`, `first_name`, `last_name`, `company`, `designation`, `linkedin_url`,
`industry`, `city_id`.

**Impact.** One free signup yields the complete user directory with phone numbers — a
GDPR/DPDPA-relevant disclosure and a ready-made list for smishing. PostgREST clients
choose their own select list, so "we only query display_name" is not a control.

**Fix.** Replace with a policy exposing rows only where a relationship exists
(shared org, shared event, or public profile opt-in), and use column-scoped grants for
the public subset (`display_name`, `avatar_url`, `username`, `headline`). Route directory
lookups through a `SECURITY DEFINER` RPC returning only public fields — the pattern
`get_event_attendees_public` already gets right.

**Priority** P1, or P0 if operating under GDPR/DPDPA with real user data.

---

### SEC-008 — Two-factor authentication is bypassable
**Category** Security / AuthN · **Severity** HIGH · **Confidence** CONFIRMED
**Location** `src/pages/LoginPage.tsx:213`, `:283-286`; `src/components/auth/TwoFactorChallengeDialog.tsx:47-59`

**Problem.** `signInWithPassword` completes and writes a valid session to `localStorage`.
*Only then* does the code open a React dialog if `two_factor_enabled`. No route gate
consults 2FA state. Navigating to `/dashboard`, reopening the tab, or reading the token
out of storage all skip it. `onCancel` calls `signOut()`, but that is cooperative.

The challenge is `signInWithOtp` + `verifyOtp({ type: "email" })` — a *second independent
email sign-in*, not a factor bound to the first. Supabase's real MFA
(`auth.mfa.challenge` / `verify`, AAL2) is not used anywhere.

**Impact.** An attacker with the password is fully authenticated. 2FA is a UI speed bump.
Users who enabled it have a false assurance.

**Fix.** Migrate to Supabase MFA and gate routes on AAL2, or set a server-side
`mfa_pending` flag at sign-in that RLS honours until an OTP is verified. Add attempt
caps and resend cooldown.

**Priority** P1.

---

### SEC-009 — Forced password change is skippable and self-clearable
**Category** Security / AuthN · **Severity** HIGH · **Confidence** CONFIRMED
**Location** `src/pages/LoginPage.tsx:243-255`, `:385-387`

**Problem.** Same shape as SEC-008: the session is already valid and no gate checks the
flag, so navigating away skips the change. Worse, the flag lives in `user_metadata` and is
cleared **by the client** via `supabase.auth.updateUser({ data: { must_change_password:
false } })` — `raw_user_meta_data` is user-owned.

**Impact.** Organizer-created accounts keep their initial password, which per
`create-participant-account` is **the participant's mobile number** — guessable, and
often present in the same guest list an organizer might share.

**Fix.** Move the flag to a `profiles` column that the user cannot write (see SEC-006) or
to `app_metadata`, and enforce it in a route gate plus RLS.

**Priority** P1.

---

### SEC-011 — One join link grants access to any webinar session
**Category** Security / AuthZ · **Severity** HIGH · **Confidence** CONFIRMED
**Location** `supabase/functions/livekit-token/index.ts:88-116`, gate at `:152-160`

**Problem.** The registration is looked up by `join_token` and its `event_id` is selected
but **never compared to `session.event_id`**. Setting `registrationId` short-circuits the
only registration/approval gate, which lives in the `else if (!registrationId)` branch.

**Impact.** A valid `join_token` for event A yields a viewer `roomJoin` token for **any**
`session_id`, including another tenant's event B. `approval_status` is never checked on
the `join_token` path. The function also writes `active_session_id` onto the registration
before any session validation, so probing can disturb a legitimate attendee's
single-device claim.

**Contrast.** The `speaker_token` path is correctly scoped with
`.eq("session_id", session_id)`, so publisher escalation there is contained. This is a
missed check, not a missing design.

**Fix.** After loading `session`, assert `reg.event_id === session.event_id` and
`reg.approval_status === 'approved'` before assigning `registrationId`. Move the
`active_session_id` write after validation.

**Priority** P1.

---

### SEC-012 — CORS allowlist accepts any `*.vercel.app` origin with credentials
**Category** Security / Web · **Severity** MEDIUM · **Confidence** CONFIRMED
**Location** `supabase/functions/_shared/cors.ts` (allowlist branch)

Any attacker can deploy to `*.vercel.app`, so this is an attacker-controllable allowlist
entry with `Access-Control-Allow-Credentials: true` — defeating the CSRF rationale in the
file's own header. Severity is MEDIUM only because the functions it protects mostly lack
authentication anyway (SEC-001–004); it rises to HIGH once those are fixed and CORS
becomes load-bearing.

**Fix.** Match the exact production and preview hosts, or require a signed preview header.
Then delete the private copy in `generate-creative-background` (ARCH-002).

**Priority** P1, sequenced immediately after the P0 auth fixes.

---

### SEC-013 — WhatsApp webhook signature verification
**Category** Security / Integrity · **Severity** HIGH · **Confidence** CONFIRMED — **REMEDIATED IN WORKING TREE**
**Location** `supabase/functions/whatsapp-webhook/index.ts`

At the audited commit this endpoint had `verify_jwt = false`, wildcard CORS, a
service-role client, and **no POST signature check**, while its own comment claimed "the
security boundary is the verify_token + signature header." Forgeable delivery statuses.

**Your uncommitted changes fix this correctly.** I verified: HMAC-SHA256 over the **raw**
body; `sha256=` prefix check; 64-hex-char format validation *before* any crypto work
(avoiding a timing probe); `timingSafeEqualHex` comparison; `401` on mismatch; and a hard
refusal with an error log when `WHATSAPP_APP_SECRET` is unset — it fails closed.

**Remaining issue, unchanged.** The matcher still selects the 200 most recent
`communication_recipients` rows **across all orgs** within a 7-day window and matches on
phone-digit suffix. With signatures enforced this is no longer forgeable, but it remains a
cross-tenant match surface and an unindexed scan (PERF-007).

**Fix.** Commit and deploy this change, set the secret, then narrow the matcher to the
`communication_id` in the payload and add an index.

**Priority** P1 — commit and deploy.

---

### SEC-014 — No Content-Security-Policy
**Category** Security / Web · **Severity** MEDIUM · **Confidence** CONFIRMED
**Location** `vercel.json` `headers` (absent)

Verified absent from `vercel.json`, `index.html`, `public/`, `api/`, `src/`. With sessions
in `localStorage`, any XSS yields the refresh token. The other headers are well chosen,
which makes the omission look accidental.

**Fix.** Add a `Content-Security-Policy` with explicit allowances for Supabase, LiveKit,
Agora, Sentry, and Google Fonts. Deploy `Content-Security-Policy-Report-Only` first to
find violations without breaking the app. Consider moving sessions to httpOnly cookies as
a follow-up.

**Priority** P1.

---

### SEC-016 — No rate limiting on any public endpoint
**Category** Security / Availability · **Severity** HIGH · **Confidence** CONFIRMED

The only limiter in the codebase is the per-event daily quota in
`generate-creative-background:545-573`. Unthrottled: every mail and WhatsApp sender, the
anonymous `submit-support-ticket` (which does validate and hash the IP but never limits),
`self_check_in` / `self_check_out`, `record_utm_click` (dedupe keys on a
caller-supplied `session_key`, so rotating it gives unbounded inserts), `seed-cities`
(downloads a GeoNames archive and upserts ~50k rows per call), and login/signup/reset.

**Impact.** Cost amplification, mail-reputation damage, DB write floods, and unimpeded
credential stuffing.

**Fix.** Short term: a shared limiter in `_shared/` keyed on IP hash plus caller id,
applied to every function; require auth on `seed-cities`. Medium term: Supabase Auth rate
limits plus a WAF/Cloudflare rule in front of the functions domain.

**Priority** P1.

---

### SEC-017 — Tenant-isolation policy that never references the caller
**Category** Security / AuthZ · **Severity** HIGH (latent) · **Confidence** CONFIRMED
**Location** `supabase/migrations/027_event_venue_selections.sql:35-45`

```sql
USING (EXISTS (SELECT 1 FROM events e
               WHERE e.id = event_venue_selections.event_id
                 AND (e.user_id = auth.uid()
                      OR e.org_id = event_venue_selections.org_id)))
```

The second disjunct compares two **row** columns and never mentions the caller, so it is
true for every well-formed row — making the policy effectively `USING (true)`. Compounded
by no `TO` clause (defaults to `public`, including `anon`) and `FOR ALL` with no
`WITH CHECK`, so Postgres reuses the `USING` expression as the insert check.

**Why HIGH but latent.** The file issues no `GRANT` to `anon`/`authenticated`, so
PostgREST clients most likely cannot reach the table today. It becomes live the moment
anyone adds a grant. The same migration also references an undefined `vendors` table and
`is_vendor_member()` (QA-011).

**Fix.** Replace the second disjunct with `public.is_org_member(auth.uid(),
event_venue_selections.org_id)`, add `TO authenticated`, and add an explicit `WITH CHECK`.

**Priority** P1 — fix before granting access, not after.

---

### SEC-018 — `seed-cities` is unauthenticated with dead auth code
**Category** Security / Availability · **Severity** MEDIUM · **Confidence** CONFIRMED
**Location** `supabase/functions/seed-cities/index.ts:60-68`

The `Authorization` header and anon key are read into variables and **never used**. The
comment claims "The DB is protected by RLS" — untrue, the client is service-role. The file
header says "Admin-only"; it is not. Each call downloads the GeoNames archive and upserts
~50k rows.

**Fix.** Add the bearer + `has_role('admin')` check the file already claims to have, or
convert it to a one-off script outside the deployed function set.

**Priority** P2.

---

### SEC-019 — PostgREST filter injection in the public widget endpoint
**Category** Security / Injection · **Severity** MEDIUM · **Confidence** CONFIRMED
**Location** `supabase/functions/org-events/index.ts:35-43`

The non-UUID branch interpolates unvalidated input into an `.or()` filter string; only the
UUID branch validates. Input containing `,` or `or(...)` alters the filter tree. Blast
radius is limited because this is the only function using the anon key, so RLS still
applies — but `custom_domain` and `landing_published` are in the select list and the
pattern is unsafe by construction.

**Fix.** Validate `handle` against `^[a-z0-9-]{1,63}$` before interpolation, or use two
separate `.eq()` queries.

**Priority** P2.

---

### SEC-020 — Unpublished event metadata leaked via the OG image endpoint
**Category** Security / Data exposure · **Severity** MEDIUM · **Confidence** CONFIRMED
**Location** `supabase/functions/og-event/index.ts:427-461`

`verify_jwt = false`, service-role client, and the query filters on `id` **or** `slug`
with **no `status` filter** — `status` is selected but never checked. A draft event's
title, date, venue, and banner render into a publicly cacheable PNG for anyone who
guesses the slug. `org-events:58` does `.eq("status", "published")` correctly, so the
correct pattern exists two files away.

**Fix.** Add `.eq("status", "published")` and return the fallback card otherwise.
One line.

**Priority** P2. Trivial fix, real confidentiality impact for unannounced events.

---

### SEC-021 — Anonymous forgeable writes to `webinar_reactions`
**Category** Security / Integrity · **Severity** MEDIUM · **Confidence** CONFIRMED
**Location** `000_full_schema.sql:6859-6866`

`GRANT SELECT, INSERT … TO anon` with `WITH CHECK (true)`. `user_id` has **no FK and no
`= auth.uid()` check**, so an anonymous caller inserts rows attributed to any user id,
unbounded. The table is in `supabase_realtime`, so forged rows fan out live to every
viewer.

**Fix.** Require a valid `join_token`-derived identity via an RPC rather than direct
anon INSERT; add a FK on `user_id`; rate-limit per session.

**Priority** P2.

---

### SEC-022 — Logout leaves the previous user's data resident
**Category** Security / Privacy · **Severity** MEDIUM · **Confidence** CONFIRMED
**Location** `src/contexts/AuthContext.tsx:138-140`

`signOut` awaits `supabase.auth.signOut()` and nothing else. `queryClient` is a
module-level singleton with `gcTime: 5 * 60_000`; grep for `queryClient.clear` /
`removeQueries` across `src/` returns **zero hits**. Callers do `signOut(); navigate("/")`
— an SPA transition with no reload, so the cache survives. Also uncleared: the LiveKit
JWT in `sessionStorage` (`EventLivePage.tsx:273`) and the IndexedDB observability queue.

**Impact.** On a shared device or a second sign-in in the same tab, the next user can be
served the previous user's cached attendee PII, registration lists, revenue figures, and —
for an admin — the platform user-management table.

**Fix.** In `signOut`: `queryClient.clear()`, remove `lk-token-*` from `sessionStorage`,
drop the IndexedDB queue, clear `illuxus.active-org-id`. Simplest robust option is a hard
`window.location.assign("/")` after sign-out.

**Priority** P1. Small, self-contained fix.

---

### SEC-023 — Anonymous check-in RPC returns attendee PII and accepts the primary key as a credential
**Category** Security / Privacy · **Severity** MEDIUM · **Confidence** CONFIRMED
**Location** `000_full_schema.sql:1597-1634` (`self_check_in`), mirrored in `self_check_out`

Granted to `anon`. `RETURNS TABLE(..., name, email, ...)` hands attendee name and email to
an unauthenticated caller. The lookup is
`WHERE reg.qr_code=p_token OR reg.join_token=p_token OR reg.id::text=p_token` — so the
registration **primary key** is a valid bearer credential. Registration ids appear in
URLs, CSV exports, logs, and the realtime payload column list, so each of those becomes a
check-in token and a PII lookup key.

Separately, the `speaker:` / `sponsor_contact:` branch **inserts** `registrations` rows
marked `confirmed`/`approved` from caller-supplied ids whose only gate is that the id is
linked to the supplied event — and both are anon-discoverable.

**Credit where due:** this function was deliberately hardened (REQ-14) so the public flow
can never check someone out. The remaining issues are the PII in the return shape and the
id-as-token behaviour.

**Fix.** Drop `reg.id::text=p_token`. Return only `status` and a display-safe first name.
Require the event to be within its tracking window before the speaker/sponsor insert
branch, and prefer pre-provisioning those registrations at link time.

**Priority** P2.

---

### SEC-024 — Internal error detail returned to callers
**Category** Security / Info disclosure · **Severity** LOW · **Confidence** CONFIRMED

Raw upstream provider bodies (`send-whatsapp:201`, `whatsapp-sync-templates:126-131`,
`recording-start:44-47`), internal exception strings (`agora-token:126,153`,
`seed-cities:135-142`, `org-events:94-98`, `String(e)` across the LiveKit family), and a
`step` field naming the failed internal phase — which maps control flow for an attacker.
No credentials leak.

**Fix.** Return a generic message plus a correlation id; log detail server-side. The
`edge-logger` already supports this.

**Priority** P2.

---

### SEC-025 — Unsanitized `<style>` innerHTML in the chart primitive
**Category** Security / XSS · **Severity** MEDIUM · **Confidence** NEEDS VERIFICATION
**Location** `src/components/ui/chart.tsx:70-83`

The only one of four `dangerouslySetInnerHTML` sites not routed through `sanitizeHtml`.
`id` and every `itemConfig.theme[...] || itemConfig.color` are interpolated straight into
a `<style>` element. Stock shadcn/ui code. Exploitable **only if** a chart `config`'s
color values ever originate from user- or DB-supplied data — a value containing a closing
`</style>` could break out.

**I did not trace every `ChartContainer` call site**, so this stays NEEDS VERIFICATION
rather than CONFIRMED. Worth ten minutes because, given sessions in `localStorage` and no
CSP, an XSS here is account takeover.

**Fix.** Validate color values against a strict CSS-color pattern before interpolation.

**Priority** P2 — verify first, then fix or close.

---

### SEC-026 — Mass assignment via type-check escapes
**Category** Security / Data integrity · **Severity** MEDIUM · **Confidence** HIGH CONFIDENCE
**Location** `src/components/event/registrations/RegistrantQuickView.tsx:290-294`, `src/pages/dashboard/SettingsPage.tsx:168-171`

The first destructures a denylist (`id`, `qr_code`, `join_token`, `created_at`,
`updated_at`) and inserts the rest with `insert(rest as any)` — denylist filtering plus a
cast that disables the generated types, so any new column is client-settable. The second
uses `update(payload as never)` on `profiles`, which combines badly with SEC-006.

**Fix.** Switch to explicit allow-lists and remove the `as any` / `as never` casts so the
generated types enforce the shape.

**Priority** P2.

---

### SEC-027 — Password recovery accepts weaker passwords than signup
**Category** Security / AuthN · **Severity** LOW · **Confidence** CONFIRMED
**Location** `src/pages/ResetPasswordPage.tsx:82`

`minLength={6}` with no strength check, while signup and the must-change screen both
require `scorePassword(...).acceptable` at `minLength={8}`. The recovery path can set a
password the signup path would reject.

**Fix.** Reuse `scorePassword` and `PasswordStrengthMeter` on the recovery form.

**Priority** P2.

---

### SEC-028 — Account enumeration via fall-through error messages
**Category** Security / Info disclosure · **Severity** LOW · **Confidence** CONFIRMED
**Location** `src/pages/LoginPage.tsx:174`, `:231`

The primary branches are correctly generic ("Invalid email or password") and
forgot-password returns a fixed string. The fall-through surfaces the provider message
verbatim — "Email not confirmed" distinguishes a registered-but-unconfirmed account from
a nonexistent one, and signup errors for an existing address pass through unchanged.

**Fix.** Map known codes to generic copy; log the original.

**Priority** P3.

---

### SEC-029 — Certificate-signing helper inside `src/`
**Category** Security / Supply chain · **Severity** LOW · **Confidence** CONFIRMED
**Location** `src/lib/webinar/agora-token.ts`

Exports `signRtcToken` / `signRtmToken`, both taking an `appCertificate`. Its header
states it is not used in the production bundle, and I confirmed the only importer is its
own test, so Rollup tree-shakes it. But it sits at an app-code path; one stray import puts
the signing path and SDK in the browser bundle.

**Fix.** Move to a test-only or server-only directory outside `src/`.

**Priority** P3.

---

### SEC-030 — Dev origins allowlisted in production CORS
**Category** Security / Web · **Severity** LOW · **Confidence** CONFIRMED
**Location** `supabase/functions/_shared/cors.ts` (`DEV_ORIGINS` seeding)

`localhost:5173` / `:8080` are seeded into the allowlist unconditionally, with no
environment gate. Low impact on its own — an attacker cannot make a victim's browser send
a localhost origin — but it widens the surface for a local malicious app.

**Fix.** Gate on an explicit environment flag.

**Priority** P3.

---

### AI-001 — No prompt-length clamp on the Gemini path
**Category** Performance / Cost · **Severity** LOW · **Confidence** CONFIRMED
**Location** `supabase/functions/generate-creative-background/index.ts:361-375`, `:607`

`promptText` is validated non-empty but never truncated. The quota is per-event *count*,
not per-token, so an authorized caller can send arbitrarily long prompts 20×/day.
Cost amplification, not injection.

**Fix.** Clamp to a few hundred characters before the provider call.

**Priority** P3.

---

## 18. Risk Matrix

| ID | Category | Severity | Confidence | Area | Status |
|---|---|---|---|---|---|
| SEC-000 | Security | CRITICAL | CONFIRMED | DevOps / secrets | Open |
| SEC-001 | Security | CRITICAL | CONFIRMED | Edge fn / AuthN | Open |
| SEC-002 | Security | CRITICAL | CONFIRMED | Edge fn / AuthZ | Open |
| SEC-003 | Security | CRITICAL | CONFIRMED | Edge fn / AuthZ | Open |
| SEC-005 | Security | CRITICAL | CONFIRMED | Database / RLS | Open |
| SEC-006 | Security | CRITICAL | CONFIRMED | Database / RLS | Open |
| SEC-004 | Security | HIGH | CONFIRMED | Edge fn / AuthZ | Open |
| SEC-007 | Security | HIGH | CONFIRMED | Database / privacy | Open |
| SEC-008 | Security | HIGH | CONFIRMED | Frontend / AuthN | Open |
| SEC-009 | Security | HIGH | CONFIRMED | Frontend / AuthN | Open |
| SEC-011 | Security | HIGH | CONFIRMED | Edge fn / AuthZ | Open |
| SEC-013 | Security | HIGH | CONFIRMED | Webhook integrity | **Remediated (uncommitted)** |
| SEC-016 | Security | HIGH | CONFIRMED | Availability | Open |
| SEC-017 | Security | HIGH | CONFIRMED | Database / RLS | Open (latent) |
| SEC-012 | Security | MEDIUM | CONFIRMED | Web / CORS | Open |
| SEC-014 | Security | MEDIUM | CONFIRMED | Web / headers | Open |
| SEC-018 | Security | MEDIUM | CONFIRMED | Edge fn / AuthZ | Open |
| SEC-019 | Security | MEDIUM | CONFIRMED | Injection | Open |
| SEC-020 | Security | MEDIUM | CONFIRMED | Data exposure | Open |
| SEC-021 | Security | MEDIUM | CONFIRMED | Database / integrity | Open |
| SEC-022 | Security | MEDIUM | CONFIRMED | Frontend / privacy | Open |
| SEC-023 | Security | MEDIUM | CONFIRMED | Database / privacy | Open |
| SEC-025 | Security | MEDIUM | NEEDS VERIFICATION | Frontend / XSS | Open |
| SEC-026 | Security | MEDIUM | HIGH CONFIDENCE | API / integrity | Open |
| SEC-024 | Security | LOW | CONFIRMED | Info disclosure | Open |
| SEC-027 | Security | LOW | CONFIRMED | Frontend / AuthN | Open |
| SEC-028 | Security | LOW | CONFIRMED | Info disclosure | Open |
| SEC-029 | Security | LOW | CONFIRMED | Supply chain | Open |
| SEC-030 | Security | LOW | CONFIRMED | Web / CORS | Open |
| QA-002 | QA | HIGH | CONFIRMED | Business logic | Open |
| QA-003 | QA | HIGH | CONFIRMED | Business logic / billing | Open |
| QA-005 | QA | MEDIUM | HIGH CONFIDENCE | Data integrity | Open |
| QA-006 | QA | MEDIUM | CONFIRMED | Frontend / state | Open |
| QA-007 | QA | MEDIUM | CONFIRMED | Frontend / state | Open |
| QA-009 | QA | MEDIUM | CONFIRMED | Data integrity | Open |
| QA-010 | QA | HIGH | CONFIRMED | Data loss | Open |
| QA-011 | QA | HIGH | CONFIRMED | Migrations | Open |
| PERF-001 | Performance | HIGH | CONFIRMED | Database index | Open |
| PERF-002 | Performance | MEDIUM | CONFIRMED | API pagination | Open |
| PERF-003 | Performance | MEDIUM | CONFIRMED | Realtime / WAL | Open |
| PERF-004 | Performance | MEDIUM | CONFIRMED | Realtime / conns | Open |
| PERF-005 | Performance | LOW | CONFIRMED | Bundle size | Open |
| PERF-006 | Performance | MEDIUM | CONFIRMED | Edge fn | Open |
| PERF-007 | Performance | MEDIUM | CONFIRMED | Edge fn / query | Open |
| REL-001 | Reliability | HIGH | CONFIRMED | CI/CD absent | Open |
| REL-002 | Reliability | MEDIUM | CONFIRMED | Idempotency / cron | Open |
| REL-003 | Reliability | MEDIUM | CONFIRMED | Client-side fallback | Open |
| REL-004 | Reliability | MEDIUM | CONFIRMED | No health checks | Open |
| ARCH-001 | Architecture | MEDIUM | CONFIRMED | Duplication | Open |
| ARCH-002 | Architecture | MEDIUM | CONFIRMED | CORS drift | Open |
| ARCH-003 | Architecture | HIGH | CONFIRMED | Type safety | Open |
| DEV-002 | DevOps | LOW | CONFIRMED | Dependency resolution | Open |
| DEV-003 | DevOps | LOW | CONFIRMED | Source maps | Open |
| DEV-004 | DevOps | MEDIUM | NEEDS VERIFICATION | CORS config | Open |
| DEV-005 | DevOps | LOW | CONFIRMED | Schema drift | Open |
| DEP-001 | Supply chain | HIGH | CONFIRMED (scanner) | Dependencies | Open |
| TEST-001 | QA | HIGH | CONFIRMED | Coverage gap | Open |
| AI-001 | Performance | LOW | CONFIRMED | Cost | Open |
| DOC-001 | Documentation | MEDIUM | CONFIRMED | README rot | Open |

### Totals

**By severity:** Critical 6 · High 15 · Medium 24 · Low 11 · Informational 0 — **56 findings**

**By confidence:** Confirmed 51 · High confidence 2 · Needs verification 2 · Scanner-only 1

**By disposition:** Open 55 · Remediated in working tree 1

**Explicitly retracted after server-side verification (not counted):** direct client
`org_members.role` update, and the `OrgContext` owner auto-repair insert. Both are blocked
by the `"Owner manage members"` policy. Documented in §4.3 so they are not re-reported.

---

## 19. Top 10 Most Important Issues

1. **SEC-001** — Unauthenticated account creation and registration hijack. Pre-auth
   account takeover of any invited-but-unregistered user.
2. **SEC-000** — GitHub PAT in plaintext in the git remote. Push access to a public
   production repo. Two-minute fix.
3. **SEC-006** — Users can rewrite any column of their own profile, including
   `banned_at`. Makes the entire moderation system advisory.
4. **SEC-005** — `registrations` INSERT not scoped to the caller's events. Cross-tenant
   guest-list and revenue corruption; combined with the validation trigger, yields
   approved tickets on paid events that have no payment gate at all.
5. **SEC-003** — Authorization bypass in the bulk email sender via a magic-string
   `event_id`. Open mail relay on the platform's sending domain.
6. **SEC-002** — `agora-token` mints publisher tokens for any channel. Unauthorized
   publishing into live events.
7. **SEC-007** — Every authenticated user can read every user's mobile number. Regulatory
   exposure and a smishing list.
8. **SEC-004** — Six more unauthenticated service-role senders, two with a missing
   person↔event link check. Cross-tenant data egress by email.
9. **PERF-001 + SEC-016** — No usable index on `registrations(event_id)` and no rate
   limiting anywhere. Together these are the most likely cause of a real outage.
10. **REL-001 + ARCH-003 + TEST-001** — No CI/CD, 143 type errors on `main`, and zero
    authorization tests. This is *why* the findings above accumulated, and it is what
    prevents them recurring.

---

## 20. Remediation Roadmap

### P0 — Fix immediately (pre-production blockers)

**P0.1 — Rotate the GitHub PAT (SEC-000)**
*Change:* revoke the token; re-point `remote.origin.url` at a bare URL; use a credential
helper or SSH. *Where:* `.git/config` and GitHub settings. *Why:* live credential with
push access to a public production repo, already printed to a terminal. *Impact:* removes
code-injection risk. *Dependencies:* none. *Testing:* `git remote -v` shows no token;
`git fetch` still authenticates.

**P0.2 — Add authentication + authorization to the 12 service-role functions
(SEC-001, SEC-002, SEC-003, SEC-004)**
*Change:* extract a shared `requireCaller(req)` helper in `supabase/functions/_shared/`
that (a) requires a bearer token, (b) verifies via an anon-key client carrying the caller's
JWT, (c) checks `org_members` for the target org, and only then returns a service-role
client. Apply to `create-participant-account`, `agora-token`, `send-event-email`,
`send-whatsapp`, `send-email`, `send-communication-email`, `send-ticket-email`,
`send-speaker-invite-email`, `send-sponsor-invite-email`, `notify-venue-selection`,
`seed-cities`, `livekit-token`. Derive privileged inputs (recipients, channel, role,
email) **server-side** from authorized rows rather than the request body. Remove the
`"support"`/`"invite"` magic-string bypass. Replace `listUsers()` with
`getUserByEmail`.
*Why:* this single change closes four of six criticals. *Impact:* eliminates the
account-takeover, mail-relay, and video-token classes. *Dependencies:* the reference
patterns already exist in `whatsapp-sync-templates:80-101` and
`generate-creative-background:437-501`. *Testing:* per function, assert 401/403 with no
token, with an anon-key-only token, and with a valid token for a *different* org; assert
200 for the legitimate owner. These are the highest-value tests in the codebase.

**P0.3 — Restrict `profiles` self-update (SEC-006)**
*Change:* add `WITH CHECK (auth.uid() = user_id)`; replace the table-wide `GRANT UPDATE`
with a column-scoped grant excluding `banned_at`, `banned_reason`, `email_verified`,
`account_type`, `two_factor_enabled`, `profile_completed`; add a `BEFORE UPDATE` trigger
asserting those are unchanged. Move `CompleteProfilePage.tsx:150`'s `email_verified` write
to a server path. *Why:* restores moderation. *Impact:* ban evasion closed. *Dependencies:*
none. *Testing:* a banned user's attempt to clear `banned_at` must fail; normal profile
edits must still succeed.

**P0.4 — Scope the `registrations` INSERT policy (SEC-005, QA-002)**
*Change:* extend `WITH CHECK` to require the event exists and is `published`, drop the
`user_id IS NULL` waiver for `authenticated`, and enforce `capacity` in the predicate or a
`BEFORE INSERT` trigger. Replace the table-wide `GRANT INSERT` with a column-scoped grant
excluding `amount_paid`, `checked_in`, `attendance_state`, `total_minutes`, `approved_by`,
`approved_at`. Revisit the `price > 0 → approved` rule in `registrations_validate`, since
no payment gateway exists to justify it. *Why:* closes cross-tenant write and the oversell
race together. *Dependencies:* confirm the organizer "Add Participant" path still works —
it goes through an authorized function after P0.2. *Testing:* a non-owner insert into
another org's event must fail; concurrent RSVPs at capacity−1 must yield exactly one
success.

### P1 — Fix before production

| Item | Findings | Change | Testing |
|---|---|---|---|
| P1.1 Commit + deploy the WhatsApp HMAC fix | SEC-013 | Commit the working-tree change; set `WHATSAPP_APP_SECRET`; narrow the recipient matcher to the payload's `communication_id` | Valid signature → 200; tampered body → 401; missing secret → 500 |
| P1.2 Add `registrations` indexes | PERF-001 | `CREATE INDEX CONCURRENTLY` on `(event_id)`, `(user_id)`, `(lower(email))` | `EXPLAIN ANALYZE` the owner-list query before/after |
| P1.3 Real 2FA + enforce password change | SEC-008, SEC-009 | Migrate to Supabase MFA/AAL2; move `must_change_password` to a non-user-writable column enforced by a gate | Direct navigation to `/dashboard` mid-challenge must be refused |
| P1.4 Fix the `join_token` cross-event hole | SEC-011 | Assert `reg.event_id === session.event_id` and `approval_status === 'approved'`; move the `active_session_id` write after validation | A token for event A against a session in event B must 403 |
| P1.5 Restrict `profiles` SELECT | SEC-007 | Relationship-scoped policy + column-scoped grant; route directory reads through an RPC | A fresh account must not be able to read another user's `mobile_number` |
| P1.6 Rate limiting | SEC-016 | Shared limiter in `_shared/` keyed on IP hash + caller id, applied to every function; WAF in front of the functions domain | Burst test returns 429 |
| P1.7 Tighten CORS | SEC-012, SEC-030, ARCH-002 | Exact-match production/preview hosts; gate dev origins on an env flag; delete the private copy in `generate-creative-background` | Preflight from an arbitrary `*.vercel.app` must not be allowed |
| P1.8 Add CSP | SEC-014 | `Content-Security-Policy-Report-Only` first, then enforce | No violations reported for normal flows |
| P1.9 Clear state on logout | SEC-022 | `queryClient.clear()` + purge `lk-token-*`, IndexedDB queue, active-org id | Sign out, sign in as user B, assert no user-A data renders |
| P1.10 Fix the venue-selection policy | SEC-017 | Use `is_org_member`, add `TO authenticated` and an explicit `WITH CHECK` | Cross-tenant read/write must fail once grants are added |
| P1.11 Enforce plan limits server-side | QA-003 | `BEFORE INSERT` triggers on `events` and `registrations` reading `plan_limits` | Free-tier org blocked at 4th event and 51st attendee |
| P1.12 Stand up CI | REL-001, ARCH-003, DEP-001 | GitHub Actions running `tsc --noEmit`, `eslint`, `vitest run`, `npm audit --audit-level=high`; block merge on failure | Pipeline red on current `main`, which is the point |
| P1.13 Patch dependencies | DEP-001 | Upgrade `react-router-dom`, `dompurify`, `vite`, `postcss`, `vitest` first | Full suite + build green |

### P2 — Fix soon

`SEC-018` add the admin check `seed-cities` claims to have · `SEC-019` validate the handle
before filter interpolation · `SEC-020` one-line `.eq("status","published")` ·
`SEC-021` route reactions through an authenticated RPC, add the FK · `SEC-023` drop
id-as-token, stop returning email · `SEC-024` generic errors + correlation id ·
`SEC-025` verify chart configs, then fix or close · `SEC-026` allow-lists instead of
`as any` · `SEC-027` reuse `scorePassword` on recovery · `QA-005` add `UNIQUE` on
`events.slug` · `QA-009` add the missing FKs · `QA-010` soft-delete + export-first before
`admin_delete_user` · `QA-011` define or vendor `vendors`/`is_vendor_member`, resolve the
duplicate `027_` prefix, make `022`/`023`/`027` idempotent · `PERF-002` real pagination ·
`PERF-006` `getUserByEmail` · `PERF-007` indexed matcher · `REL-002` idempotency keys +
an advisory lock on the cron worker · `REL-004` health/readiness endpoint ·
`ARCH-001` delete the six `dashboard-inline.ts` copies · `DOC-001` fix the README's dead
links and false claims.

### P3 — Technical debt

`SEC-028` generic auth errors · `SEC-029` move the signing helper out of `src/` ·
`SEC-030` (if not done in P1.7) · `AI-001` clamp prompt length ·
`PERF-003`/`PERF-004` narrow `REPLICA IDENTITY` and consolidate realtime channels ·
`PERF-005` split the Agora chunk · `QA-006` fail closed on `accountType` ·
`QA-007` make the `setSession` updater pure · `DEV-002` scope `legacy-peer-deps` ·
`DEV-003` stop shipping `.map` when upload is skipped · `DEV-005` fold the `fix_*.sql`
scripts into migrations · delete the three unused lockfiles · split the four god files ·
burn down the 118 `any` casts · regenerate `src/integrations/supabase/types.ts`.

---

## 21. Missing Tests

Specific, ordered by value. Not "add more tests."

**Tier 1 — authorization (none of this exists today)**

1. **Edge-function auth matrix.** For each of the 12 functions in P0.2, four cases: no
   token → 401; anon-key-only token → 403; valid token for a *different* org → 403; valid
   owner token → 200. This is the regression net for four criticals.
2. **RLS integration tests** against a local Supabase, one per boundary:
   non-owner cannot `SELECT` another org's `registrations`; non-owner cannot `INSERT` into
   another org's event (SEC-005); a user cannot `UPDATE` their own `banned_at` (SEC-006); a
   user cannot `INSERT`/`UPDATE` `user_roles` (guards the currently-correct behaviour); a
   fresh account cannot read another user's `mobile_number` (SEC-007).
3. **`join_token` scoping** — a token for event A against a session in event B must 403
   (SEC-011).

**Tier 2 — business logic**

4. **Oversell concurrency** — fire N parallel RSVPs at `capacity - 1`; assert exactly one
   success (QA-002). A property test over N is a natural fit given the existing fast-check
   setup.
5. **Plan-limit enforcement** — free-tier org blocked at the 4th event and 51st attendee
   (QA-003).
6. **`registrations_validate` column coverage** — assert `status`, `amount_paid`, and
   `checked_in` cannot be client-asserted, which is exactly what the current code comment
   leaves unstated.
7. **Single-device `join_token` claim** — two concurrent claims, one wins with 409.

**Tier 3 — auth flows**

8. 2FA cannot be bypassed by direct navigation after `signInWithPassword` (SEC-008).
9. `must_change_password` cannot be skipped or self-cleared (SEC-009).
10. Logout leaves no user-A data in the query cache or client storage (SEC-022).
11. Password-reset `redirectTo` cannot be influenced by query input.

**Tier 4 — contracts and shape**

12. **Webhook signature tests** — valid, tampered, missing header, missing secret
    (locks in the SEC-013 fix).
13. **Generated-types drift check** in CI — fail if `types.ts` does not match the schema.
    This would have caught the `event_emails` and `video_provider` errors.
14. Broaden E2E beyond one hardcoded event path; seed a fixture rather than depending on
    `/org/wybe/events/tech-summit-2026`.

---

## 22. Recommended Security Improvements

Structural, beyond individual fixes.

1. **One authentication chokepoint for edge functions.** The root cause of six findings is
   that each function decides its own auth policy. A single `_shared/auth.ts` exporting
   `requireCaller()` / `requireOrgMember()` / `requireEventOwner()`, with a lint rule
   forbidding a bare service-role `createClient` outside it, makes the secure path the
   easy path. This mirrors the existing, working `supabaseRpc` convention.
2. **Column-scoped grants as the default.** Three findings (SEC-005, SEC-006, SEC-007)
   share a cause: table-wide `GRANT` with a row-level-only policy. RLS governs *rows*;
   grants govern *columns*. Both are needed.
3. **Delete `ALTER DEFAULT PRIVILEGES … TO service_role`.** Every future table becomes
   fully writable by every function holding the service key. Grant explicitly per table.
4. **Move sessions to httpOnly cookies.** Combined with a CSP, this converts XSS from
   account takeover into a contained incident.
5. **Adopt Supabase MFA (AAL2)** rather than a second email sign-in.
6. **Split `000_full_schema.sql`.** A 10,572-line file with minified function bodies
   cannot be meaningfully reviewed, and unreviewable authorization code is a security
   property in itself. One file per domain, formatted.
7. **Secret hygiene:** rotate the PAT (P0.1), audit every Supabase Function secret,
   confirm `ALLOWED_ORIGINS` is set (DEV-004), and locate `_service_key`'s source — if it
   lives in `app_settings`, read access there equals holding the service key.
8. **Add a `SECURITY.md`** with a disclosure address. The repo is public; there is
   currently no way for a researcher to report privately. `public/.well-known/security.txt`
   exists — align them.

---

## 23. Recommended Architecture Improvements

1. **Make the generated types authoritative.** 143 type errors and 118 `any` casts mean
   the DB contract is not enforced anywhere. Regenerate `types.ts`, fix the errors, and
   gate CI on `tsc --noEmit`. This is the cheapest large reduction in defect surface.
2. **Delete the `dashboard-inline.ts` duplicates** (~2,000 LOC). They are the copy-paste
   source for CORS drift and already violate the project's own `no-console` rule.
3. **One CORS implementation.** Delete the private copy in
   `generate-creative-background`.
4. **Pick one package manager.** Four lockfiles and two resolvers for one deploy is a
   supply-chain hazard. Keep `bun.lock`, delete the rest, and make `api/` install with the
   same tool.
5. **Wrap route gates so new routes are protected by default.** Eight routes currently
   self-gate; a new page under `/sponsor/*` inherits nothing. Prefer a layout route with
   the gate applied at the parent.
6. **Split the four god files** (`brochure-pdf.ts` 2,792 LOC; `editor-templates.ts` 2,230;
   `RegistrationsSection.tsx` 2,049; `creative-renderer.ts` 1,847) along existing seams.
7. **Consolidate realtime.** 33 channels with `REPLICA IDENTITY FULL` on 12 tables is the
   documented ceiling at ~500 concurrent attendees. Narrow replica identity and multiplex
   channels per page.
8. **Decide on the dual video providers.** LiveKit and Agora are both fully wired, which
   doubles the auth surface, the client bundle, and the maintenance burden. Two of the
   critical/high findings (SEC-002, SEC-011) are one in each stack.

---

## 24. Production Readiness Assessment

| Gate | Status | Blocking |
|---|---|---|
| No known critical vulnerabilities | **FAIL** — 6 confirmed | Yes |
| Authentication enforced server-side | **FAIL** — 12 functions unauthenticated | Yes |
| Authorization enforced server-side | **FAIL** — 4 confirmed bypasses | Yes |
| Secrets managed | **FAIL** — PAT in git remote | Yes |
| Tenant isolation | **PARTIAL** — reads mostly correct, writes not | Yes |
| Security headers | **PARTIAL** — good baseline, no CSP | No |
| Rate limiting / abuse controls | **FAIL** — one quota, one function | Yes |
| Dependency hygiene | **FAIL** — 1 critical, 16 high, all fixable | Yes |
| Build reproducible | **PASS** — `vite build` succeeds in 15.84s | No |
| Type checking clean | **FAIL** — 143 errors | Yes |
| Lint clean | **FAIL** — 154 errors, 44 warnings | No |
| Unit tests pass | **PASS** — 500/500 in 16.09s | No |
| Critical paths tested | **FAIL** — zero authorization tests | Yes |
| CI/CD | **FAIL** — none exists | Yes |
| Migrations apply to a fresh DB | **FAIL** — undefined `vendors` dependency | Yes |
| Rollback strategy | **FAIL** — undocumented | Yes |
| Backup / DR verified | **NOT VERIFIED** — outside repo | Unknown |
| Health / readiness checks | **FAIL** — none | No |
| Observability | **PASS** — structured logging, redaction, correlation ids, Sentry | No |
| Error handling / graceful degradation | **PASS** — genuinely good | No |
| Accessibility | **NOT VERIFIED** — needs manual testing with assistive tech | Unknown |

**11 blocking gates.** The strongest areas are observability, graceful degradation, and
pure-function test discipline. The weakest is the server-side trust boundary.

---

## 25. Final Verdict

**Do not ship to production in the current state.**

This is not a low-quality codebase. The database authorization model is thoughtfully
designed — correct `SECURITY DEFINER` helpers, `search_path` pinned on all 157 functions,
no self-grant path to admin, an explicit non-PII realtime column list, and migration
comments that explain *why* previous approaches broke. The observability layer, the
attendance state machine with its property tests, and `generate-creative-background` are
work I would hold up as examples.

The failure is architectural and localized: **the edge-function layer has no shared
authentication contract.** Each of the 28 functions decides for itself, four got it right,
and the rest inherited a mistaken belief that `verify_jwt = true` is an authentication
control. Because the anon key satisfies that check and is public by design, twelve
functions holding service-role credentials are reachable by anyone who views source. Every
critical finding except SEC-005, SEC-006, and SEC-000 traces to that one gap.

That is encouraging, because it is fixable as one change rather than twelve. A shared
`requireCaller()` helper plus a lint rule banning bare service-role clients closes four of
six criticals. Two SQL changes — column-scoped grants on `profiles` and an event-scoped
`WITH CHECK` on `registrations` — close the other two. Rotating the PAT takes minutes.
**The P0 list is roughly one focused engineering week.**

What worries me more than any single finding is the absence of a feedback loop. There is no
CI, 143 type errors sit on `main`, and there is not one test asserting an authorization
boundary. The 500 passing tests are real but they cover pure functions, so the suite is
structurally incapable of catching the bugs that matter here. Without P1.12 and Tier-1
tests, these findings will recur.

Two things to correct in how the project describes itself. The README lists rate limiting
and webhook HMAC under **Security Features** with a parenthetical TODO — that reads as
implemented to anyone skimming. And the marketing pages advertise Stripe and Razorpay
support when no payment integration exists, while the database trigger grants approved
tickets on the premise that "payment IS the gate." Those two facts are load-bearing
against each other and should be reconciled before anyone processes real money.

Credit where it is due: the WhatsApp webhook fix sitting uncommitted in the working tree is
exactly right — raw-body HMAC, format check before crypto, timing-safe compare, fails
closed on a missing secret. That is the standard to hold the rest of the functions to.

---

### Verification log

| Command | Result | Significance |
|---|---|---|
| `npx vitest run` | 120 files, **500 passed**, 16.09s | Unit suite healthy; covers pure functions only |
| `npx tsc -p tsconfig.app.json --noEmit` | **143 errors** across 32 files | Generated types stale; real mismatches (ARCH-003) |
| `npx eslint .` | **154 errors, 44 warnings** | 118 `no-explicit-any`, 14 `no-console` |
| `npx vite build` | **Success**, 15.84s, PWA 250 entries | Ships despite type errors — `vite build` does not type-check |
| `npm audit` | **24 advisories** — 1 critical, 16 high, 6 moderate, 1 low | All fixable (DEP-001) |
| Bundle secret scan (225 files in `dist/assets/`) | **No secrets**; one benign UI hint string | Client bundle is clean |
| `git ls-files` secret scan | Only `.env.example` tracked | Repo history clean of env files |
| `git remote -v` | **PAT exposed** | SEC-000 |
| Schema cross-reference (`CREATE TABLE` vs `ENABLE ROW LEVEL SECURITY`) | 67 tables, **66 with RLS** | Only `community_badges` uncovered |
| `SECURITY DEFINER` header parse | **157/157 pin `search_path`** | No search-path hijack surface |
| Injection grep across `supabase/functions/` | No `Deno.Command`, `Deno.run`, `child_process`, or raw SQL | Command/SQL injection not present |
| CSP grep across `vercel.json`, `index.html`, `public/`, `api/`, `src/` | **No match** | SEC-014 |
| Unauthenticated GitHub API probe | HTTP 200 | Repository is public — informed the disclosure posture of this document |

### Not verified

Stated explicitly so nothing here is mistaken for a clean bill of health:

- **Deployed configuration** — whether `ALLOWED_ORIGINS`, `WHATSAPP_APP_SECRET`, and the
  Supabase Auth "Redirect URLs" allowlist are set correctly in the live project.
- **`_service_key`'s source** in the `net.http_post` calls at `000:5867-6010`. If it is
  read from `app_settings`, read access to that table equals holding the service-role key.
  **Highest-value follow-up.**
- **`app_settings` RLS policy bodies.**
- **Community RBAC** inside `CommunityLayout` / `useCommunityBySlug`.
- **Runtime exploitability** — every finding is from static reading plus schema analysis.
  Nothing was tested against a live system.
- **`generate-creative-copy`** — new and untracked; needs a focused review before deploy.
- **Accessibility and WCAG conformance** — requires manual testing with assistive
  technologies and expert review.
- **Backup, DR, and rollback** — outside the repository.
- Whether a `CREATE UNIQUE INDEX` on `events.slug` exists somewhere in the 10,572-line
  schema (QA-005 is HIGH CONFIDENCE, not CONFIRMED).

---

*Audit conducted read-only. No application code, configuration, schema, or data was
modified. No credentials were rotated. No requests were made to production systems. The
sole file added is this report.*
