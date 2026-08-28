# PLATFORM AUDIT REPORT

**Platform:** illuxus — Lu.ma-style events platform
**Audit cycle:** 2026-08-28 (cycle 2)
**Auditor role:** Principal Engineer / AppSec / DevSecOps / SRE / DBA / QA Lead
**Branch audited:** `main` @ `4694315`
**Method:** static analysis, dependency scan, executed tests, targeted exploit modelling. No live database or production environment was accessed.

> **This is a living document.** Update it after every significant change. Scores and statuses reflect the **verified state of `main`**, not of any feature branch.

---

## ⚠️ READ THIS FIRST — AUDIT-00

**The entire cycle-1 security remediation is NOT on `main`.** It sits on branch `audit/security-review-2026-08-27` (`21f91a6`), unmerged.

Verified on `main` @ `4694315` at time of writing:

| Check | Result |
|---|---|
| `git merge-base HEAD audit/security-review-2026-08-27` | `4694315` — identical to HEAD |
| Commits on `main` not on the audit branch | **none** (clean fast-forward available) |
| `create-participant-account` identity checks | **0** occurrences of `requireUser` / `auth.getUser` |
| `create-participant-account` bulk re-link scoping | lines 138–139 still `.eq("email", …).is("user_id", null)` with **no `event_id`** |
| `agora-token` trusts request body | lines 95–96 still read `body.uid` / `body.role` |
| `supabase/functions/_shared/auth.ts` | **absent** |
| `.github/workflows/ci.yml` | **absent** |
| migrations `030`, `031` | **absent** |
| `typecheck` npm script | **absent** |

**Both P0 vulnerabilities are OPEN on the branch that deploys.** Any prior statement of readiness applied to the audit branch, not to `main`.

**Required action:** fast-forward `main` to `21f91a6`, or open a PR from `audit/security-review-2026-08-27`. Mechanically low-risk (clean fast-forward, no divergent commits). **Not performed by this audit** — merging to a shared branch requires owner authorisation.

---

## EXECUTIVE DASHBOARD

Scores describe **`main` as it stands today**.

| Dimension | Score | Note |
|---|---|---|
| SECURITY | **3/10** | Two P0s open on `main`; one new P1 open-redirect found and fixed this cycle |
| QA | **6/10** | 530 tests pass, strong property suites; no CI on `main`, e2e never runs |
| RELIABILITY | **6/10** | Dependencies fail closed; no SMTP retry on `main`; no health endpoint |
| PERFORMANCE | **6/10** | Route splitting + PWA caching good; no vendor chunking on `main` |
| CODE QUALITY | **6/10** | Well-commented, disciplined patterns; 154 lint errors, 14 untyped tables |
| DEPENDENCY HEALTH | **4/10** | **80 advisories** (1 critical, 35 high); `react-router` open-redirect CVEs unpatched |
| DEVOPS | **2/10** | No CI on `main`. Push-to-deploy runs `vite build` only |
| DOCUMENTATION | **7/10** | Unusually good inline docs; env inventory only on the audit branch |
| **PRODUCTION READINESS** | **3/10** | Blocked by AUDIT-00 |
| **OVERALL PLATFORM HEALTH** | **4/10** | Strong engineering, unmerged fixes, unpatched deps |

**Issue counts (this cycle):** CRITICAL 3 · HIGH 6 · MEDIUM 7 · LOW 4
**Status:** OPEN 13 · FIXED (working tree) 4 · FIXED (unmerged branch) 12 · DEFERRED 3

---

## PLATFORM OVERVIEW

Single-page React app on Supabase. Organisers run branded events, sell tickets, check attendees in/out by QR, host LiveKit **or** Agora webinars, and run communities.

**Inventory**

| Component | Detail | Criticality | Risk |
|---|---|---|---|
| Frontend | Vite 5, React 18, TS 5, Tailwind 3, shadcn/ui | Critical | Medium |
| Server state | TanStack Query v5 | High | Low |
| Backend | Supabase Postgres — **69 tables, 67 with RLS** | Critical | Medium |
| Edge functions | **28** Deno functions | Critical | **High** |
| Vercel functions | `api/event-og.ts`, `api/widget.ts` | Medium | Low |
| Auth | Supabase Auth; `app_role` enum in separate `user_roles` table | Critical | Low |
| Realtime | `registrations` published **non-PII columns only** (good) | High | Low |
| Storage | `site-assets`, `community` buckets | Medium | Medium |
| Video | LiveKit + Agora (dual provider) | High | **High** |
| AI | Gemini — Imagen (backgrounds) + 1.5 Flash (copy) | Medium | Medium |
| Email | SMTP (denomailer); Resend path vestigial | **Critical** | High |
| WhatsApp | Meta Cloud API + HMAC-verified webhook | Medium | Low |
| Observability | Custom logger → Sentry; **inert without DSN** | High | High |
| CI/CD | **none on `main`** | Critical | **Critical** |

**Trust boundaries:** browser → PostgREST (RLS) · browser → edge functions (`verify_jwt`, weak — see SEC-CLASS-01) · edge functions → Postgres (**service_role, bypasses all RLS**) · anon → `SECURITY DEFINER` RPCs (**body `WHERE` is the only boundary**).

**Critical journeys:** event create→publish · public RSVP→ticket email→QR check-in · webinar join (host/speaker/attendee/link-guest) · speaker/sponsor applications · org team management.

---

## THE SYSTEMIC ISSUE

**SEC-CLASS-01 · CONFIRMED · P0 · `verify_jwt = true` is not authentication.**

The Supabase gateway only checks that the bearer token is signed by the project JWT secret. **The anon/publishable key shipped in the browser bundle is such a token.** Any function whose only gate is `verify_jwt`, and which then uses `SUPABASE_SERVICE_ROLE_KEY` (bypassing all RLS) while trusting a body-supplied id, is an IDOR reachable by anyone on the internet.

This single misconception is the root cause of AUDIT-00's two P0s and of nine P1s. The fix pattern — resolve the caller with `auth.getUser(jwt)`, *then* authorise the resource, *then* elevate — exists on the audit branch as `_shared/auth.ts`.

**SEC-CLASS-02 · CONFIRMED · P1 · Postgres functions default to `EXECUTE TO PUBLIC`.**
There is no `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`. A `SECURITY DEFINER` function with a forgotten `GRANT` is therefore **anon-callable by default** — fails *open*. Three functions are anon-reachable purely by omission (`get_event_by_slug`, `claim_join_session`, `resolve_browser_session`). The codebase clearly knows the risk: it explicitly revokes on `is_event_owner`, `_apply_attendance`, and five others.

---

## FINDINGS

Confidence: **CONFIRMED** = I read the code/ran the command. **HIGH** = strong inference. Nothing here is speculative.

### CRITICAL (P0)

| ID | Component | Issue | Confidence | Status |
|---|---|---|---|---|
| AUDIT-00 | git / release | Cycle-1 remediation unmerged; both P0s open on `main` | CONFIRMED | **OPEN** |
| SEC-01 | `create-participant-account` | Account takeover + IDOR | CONFIRMED | FIXED on branch, **OPEN on main** |
| SEC-02 | `agora-token` | Unauthenticated publisher-token minting | CONFIRMED | FIXED on branch, **OPEN on main** |

**SEC-01** — No `getUser()`; holds service role; calls `auth.admin.createUser` with **caller-supplied email *and* password** plus `email_confirm: true`; then bulk re-links every unlinked registration matching that email platform-wide.
*Impact:* mint a confirmed account for `victim@corp.com` with a known password; or steal another organiser's registration and its check-in QR.
*Aggravating:* the function **has no callsite in the app** — live, exploitable, zero legitimate consumers.
*Fix:* `requireUser` + `assertRegistrationAccess`; scope re-link to the authorised `event_id`.

**SEC-02** — No Supabase client at all. Caller supplies `channel`, `uid`, `role: "publisher"` and receives a signed Agora RTC token.
*Impact:* publish A/V into any live webinar; impersonate any participant.
*Fix:* derive channel/uid/role server-side from the caller's JWT + session membership; add a token-grant path so `?join=`/`?speaker=` guests keep working.

### HIGH (P1)

| ID | Component | Issue | Confidence | Status |
|---|---|---|---|---|
| **SEC-11** | `LoginPage.tsx` | **Open redirect via backslash** | CONFIRMED | **FIXED + TESTED this cycle** |
| DEP-01 | `react-router` 6.30.1 | 4 open-redirect / injection CVEs | CONFIRMED | **OPEN** |
| AUDIT-01 | `get_event_attendees_public` | Unclamped `_limit` → full attendee-roster dump | CONFIRMED | **FIXED this cycle (mig 032)** |
| AUDIT-03 | `self_check_in` / `_out` | Returns `email` to anon; defeats an explicit `REVOKE` | CONFIRMED | **FIXED this cycle (mig 032)** |
| SEC-03 | `profiles` RLS | `USING(true)` → platform-wide PII read | CONFIRMED | FIXED on branch (mig 030), **OPEN on main** |
| SEC-04…10 | 9 × `send-*` / `notify-*` / `seed-cities` / `og-event` | Service-role + no authz | CONFIRMED | FIXED on branch, **OPEN on main** |
| OPS-01 | CI | No pipeline on `main` | CONFIRMED | FIXED on branch, **OPEN on main** |
| QA-01 | `application-notify.ts` | Organiser application emails never sent | CONFIRMED | FIXED on branch (mig 031), **OPEN on main** |

**SEC-11 — Open redirect (NEW, found and fixed this cycle).**
`LoginPage.tsx` validated `?next=` with `decoded.startsWith("/") && !decoded.startsWith("//")`, then passed it to `window.location.assign()`. The browser normalises a **backslash** into a forward slash before resolving the authority. Modelled against Node's WHATWG `URL` (base `https://illuxus.com`):

```
"/dashboard"    → https://illuxus.com   safe
"//evil.com"    → blocked
"/\evil.com"    → https://evil.com      ESCAPES
"/%5Cevil.com"  → https://evil.com      ESCAPES
"/\/evil.com"   → https://evil.com      ESCAPES
"/\t/evil.com"  → https://evil.com      ESCAPES
```

*Impact:* `illuxus.com/login?next=/\evil.com` is a link on the **real domain** that lands the victim on an attacker page **after** authentication — a high-quality phishing and token-harvesting primitive.
*Root cause:* string-prefix validation of a value later parsed by a full URL parser. The two disagree.
*Fix:* `src/lib/safe-redirect.ts` — resolves the candidate against the current origin and compares origins, delegating to the same parser the browser will use. Rejects control characters (tab/CR/LF are *stripped* by URL parsers, revealing `//`). Returns path-only.
*Verification:* 30 tests, including a self-check asserting the blocked payloads genuinely resolve off-origin, so the test cannot silently stop testing anything.

**DEP-01 — `react-router` 6.30.1, advisories require ≥ 6.30.2.** Note SEC-11 is **application-level**; upgrading the library alone would not have closed it. Both are needed.

### MEDIUM (P2)

| ID | Component | Issue | Confidence | Status |
|---|---|---|---|---|
| AUDIT-02 | `get_event_by_slug` | No visibility predicate → draft events leak to anon | CONFIRMED | **FIXED this cycle (mig 032)** |
| AUDIT-04 | `self_check_in` | Anon token-holder can create an `approved` registration + forge attendance; no rate limit | CONFIRMED | **DEFERRED** — needs product sign-off |
| AUDIT-05 | `claim_join_session` | Authenticated holder of a leaked join link **irreversibly binds** the registration to their account, locking out the real attendee | CONFIRMED | OPEN |
| SEC-12 | `submit-support-ticket` | Public, unauthenticated, no rate limit | CONFIRMED | FIXED on branch, OPEN on main |
| SEC-13 | headers | No CSP | CONFIRMED | Report-Only on branch, OPEN on main |
| OPS-02 | `types.ts` | 14 tables missing → zero query type safety | CONFIRMED | OPEN (needs `supabase gen types`) |
| OPS-03 | build | Source maps ship unless `OBSERVABILITY_AUTH_TOKEN` set | CONFIRMED | OPEN |

### LOW (P3) / INFORMATIONAL (P4)

| ID | Issue | Confidence | Status |
|---|---|---|---|
| OPS-04 | Remote error reporting inert — `VITE_OBSERVABILITY_DSN` empty by default | CONFIRMED | OPEN |
| DEP-02 | `vitest` critical CVE — **dev-only**, UI server never started (`vitest run`) | CONFIRMED | Low real risk |
| DEP-03 | `ws`/`fast-uri`/`picomatch` advisories — all dev-only transitives | CONFIRMED | Monitor |
| CQ-01 | 8 retired page-section types are unreachable dead code | CONFIRMED | DEFERRED |
| DB-01 | Duplicate `027_` migration prefix — apply order filename-dependent | CONFIRMED | OPEN |

---

## SECURITY POSTURE

**What is genuinely strong — do not change:**
- **RLS coverage: 67/69 tables.** The only table without it (`community_badges`) is a static catalogue with no user data.
- **No privilege escalation.** `user_roles` has **only two `FOR SELECT` policies** — no INSERT/UPDATE/DELETE policy at all, so RLS deny-by-default makes self-promotion impossible. `admin_set_user_role` gates on `has_role` *and* guards against removing the last admin.
- **`has_role` is `SECURITY DEFINER` with `SET search_path = public`** — correctly hardened against search-path hijacking. Roles live in a separate table, not in `profiles` or JWT claims, so they are not user-writable.
- **Secrets hygiene clean.** `SUPABASE_SERVICE_ROLE_KEY` appears **nowhere** in `src/` or `api/` — all 31 uses are confined to `supabase/functions/`. `.gitignore` covers `.env*` with `!.env.example`. No committed credentials found.
- **XSS defence is real, not decorative.** `src/lib/sanitize-html.ts` wraps DOMPurify with a strict allow-list, `FORBID_ATTR: ["style","srcdoc","formaction","ping"]`, `FORBID_TAGS` incl. `iframe`/`math`, `ALLOW_DATA_ATTR: false`, and an `afterSanitizeAttributes` hook forcing `rel="noopener noreferrer"` on `target="_blank"`. Every `dangerouslySetInnerHTML` site traces to `sanitizeHtml` or `renderRichText`.
- **Webhooks verify provider signatures** — LiveKit via `WebhookReceiver.receive`, Meta via HMAC-SHA256 with 401 when the secret is unset.
- **Realtime publishes non-PII columns only** for `registrations` — a deliberate, correct choice.
- **`get_event_og` is the model anon RPC**: `WHERE e.status = 'published'` leads the predicate, with a comment explaining that SECURITY DEFINER bypasses RLS.

**AI-specific (Gemini):** prompts are composed server-side from event fields; organiser-supplied text is appended, not templated into instructions. Output is length-clamped and written only to a drafts table pending human review — no tool-calling, no filesystem access, no RAG, no cross-tenant retrieval. Per-event daily quota enforced. **Prompt injection risk is low**; the realistic exposure is an organiser injecting text into *their own* event's copy. No action required.

---

## RELIABILITY

Every external dependency **fails closed**: SMTP absent → 500 "not configured"; Gemini absent → `code:"configuration"`; LiveKit absent → toast, no crash. `RootErrorBoundary` + per-route `RouteErrorBoundary` are applied consistently. `AbortSignal.timeout` guards outbound AI/OG calls.

**Gaps on `main`:** no SMTP retry (a single transient blip permanently marks a recipient `failed` — fixed on branch with a classified retry + 40 tests); no health endpoint; no alerting; PWA `registerType: "prompt"` + `skipWaiting: false` makes a bad service worker the slowest thing to roll back.

---

## PERFORMANCE

Measured, not assumed. Entry chunk on `main` is **1,078 kB (318 kB gzip)**; sourcemap attribution shows it is **86% third-party** (445 kB app vs 766 kB Supabase SDK, 452 kB framer-motion, 307 kB router). Vendor splitting on the audit branch takes the entry to **122.9 kB gzip** — first load 4.5 kB *smaller*, repeat visits after an app-only deploy **61% less** re-download.

Added indexes (on branch): `idx_registrations_user_id`, `idx_registrations_event_user`, `idx_support_tickets_ip_hash_created`. `registrations` had **no `user_id` index** despite two RLS policies filtering on it.

---

## TESTING

| Metric | `main` | Audit branch |
|---|---|---|
| Test files | 121 | 122 |
| Tests | **530 pass** | **581 pass** |
| Typecheck | script absent | 193 errors (ratcheted) |
| Lint | 154 err / 44 warn | 108 err / 44 warn |
| E2E | never runs | never runs |

Property-based suites (`fast-check`) are a real strength: 13 for the attendance state machine, plus observability redaction/offline-queue and creative-render parity. **Property 58** is a SHA-256 content tripwire on three attendee-critical files that forces a human re-audit on any change — it caught one of my own edits this session and I re-audited REQ 6.4/6.6 before re-locking.

**Gaps:** no e2e in CI, no concurrency tests, no DB-level RLS tests (policies verified only by reading SQL).

---

## FIXES IMPLEMENTED THIS CYCLE (working tree, on `main`)

| File | Change | Why | Risk | Tests |
|---|---|---|---|---|
| `src/lib/safe-redirect.ts` (new) | Origin-comparison redirect validator | SEC-11 | Low | 30 pass |
| `src/lib/__tests__/safe-redirect.test.ts` (new) | Regression guard incl. threat self-check | SEC-11 | None | 30 pass |
| `src/pages/LoginPage.tsx` | Use `safeInternalPath` | SEC-11 | Low | verified all 3 nav sinks |
| `supabase/migrations/032_anon_rpc_hardening.sql` (new) | Clamp `_limit`; add visibility gate; drop `email` from check-in RPCs | AUDIT-01/02/03 | **Medium** — `DROP FUNCTION` needed | not applied |
| `docs/PLATFORM_AUDIT.md` (new) | This report | — | None | — |

**Verification run (`main` toolchain):** `bun run test` → **530/530 pass**. `bun run lint` → **154 errors / 44 warnings = exact baseline, 0 new**. `bun run build` → **exit 0**. CI destructive-SQL and duplicate-version gates dry-run **PASS** against migration 032.

**Migration 032 deployment note:** removing `email` changes a return type, and Postgres cannot do that with `CREATE OR REPLACE`. It requires `DROP FUNCTION` + `CREATE` + re-`GRANT`, leaving a sub-second window where check-in RPCs do not exist. Apply outside active door check-in. No table, row, or column is touched; no data loss. Rollback = re-apply the prior definitions from `000_full_schema.sql`.

---

## RISK REGISTER

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| P0s exploited on `main` | **High** — trivially reachable, no auth needed | Account takeover, webinar hijack | Merge `21f91a6` | Release |
| Phishing via open redirect | Medium | Credential theft | **Fixed** (SEC-11) | — |
| Attendee roster scraped | Medium | PII breach, GDPR | **Fixed** (mig 032) | — |
| Platform-wide PII read | High | PII breach | mig 030 (unmerged) | DBA |
| Regression ships silently | **High** — no CI on `main` | Any | Merge CI | DevOps |
| Blind production outage | High | Long MTTR | Set DSN + health monitor | SRE |
| Source maps exposed | Medium | Source disclosure | Set `OBSERVABILITY_AUTH_TOKEN` | DevOps |

---

## PRODUCTION CHECKLIST

- [ ] **Security** — 2 P0 + 8 P1 open on `main`
- [ ] **Authentication** — edge-fn identity checks unmerged
- [ ] **Authorization** — `profiles` RLS unmerged
- [ ] **Database** — migrations 030/031 absent; 032 pending
- [x] **Tests** — 530/530 pass on `main`
- [x] **Build** — exit 0
- [ ] **Dependencies** — 80 advisories; `react-router` needs 6.30.2
- [ ] **Configuration / Secrets** — DSN + `OBSERVABILITY_AUTH_TOKEN` unset
- [x] **Logging** — structured, PII-scrubbing, correlation IDs
- [ ] **Monitoring / Alerts** — none
- [ ] **CI/CD** — none on `main`
- [ ] **Backups** — not verified
- [x] **Rollback** — documented per component
- [x] **Documentation** — this report
- [ ] **Health checks** — endpoint unmerged
- [x] **Smoke tests** — defined below

---

## NEXT AUDIT ACTIONS (priority order)

1. **Merge `audit/security-review-2026-08-27` into `main`.** Closes both P0s and 12 other findings. Clean fast-forward. *Nothing else on this list matters until this is done.*
2. **`bun update react-router-dom`** → ≥ 6.30.2 (DEP-01). Defence-in-depth behind SEC-11.
3. **Apply migrations** in order: `030` → `031` → `032`, after a verified backup. Smoke-test profile reads, then check-in.
4. **Set `VITE_OBSERVABILITY_DSN` and `OBSERVABILITY_AUTH_TOKEN`** in Vercel. Today's likely state is *source maps shipped, errors unreported*.
5. **Enable branch protection** on the `quality` and `db` CI jobs. Leave `types` advisory.
6. **`supabase gen types typescript`** → regenerate `types.ts` (OPS-02). Unblocks ~100 type errors and ~100 `any`s. **Do not hand-write these** — a second source of truth that drifts is worse than a missing one.
7. Decide on **AUDIT-04** (anon token-holder can create approved registrations / forge attendance) and **AUDIT-05** (irreversible join-link binding). Both need product sign-off, not a unilateral code change.
8. Add `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` (SEC-CLASS-02) so a forgotten `GRANT` fails closed. **Stage carefully** — will break any function silently relying on the default grant.
9. Promote CSP from Report-Only after an observation pass (`docs/security-headers.md` has the checklist).
10. Resolve the duplicate `027_` prefix (DB-01).

**Smoke tests after merge + migrate:** org team member list · community feed avatars · admin user roster · public event attendee avatars · RSVP → ticket email arrives · organiser re-sends a ticket · webinar join as host / signed-in attendee / `?join=` guest / `?speaker=` guest · send an org communication · approve a speaker application · `/api/health?deep=1` → 200 · `/login?next=/\evil.com` stays on-origin.

---

## FINAL VERDICT

# NOT PRODUCTION READY

**Reasoning, on evidence:**

`main` @ `4694315` contains **two confirmed P0 vulnerabilities reachable by any anonymous internet caller**, verified by direct inspection minutes before writing this:

- `create-participant-account` — **0** identity checks, holds the service-role key, and creates email-confirmed auth users with a caller-chosen password. Lines 138–139 still re-link registrations by email with no event scoping. It has no callsite in the application, so it is pure attack surface.
- `agora-token` — lines 95–96 still read `body.uid` and `body.role`, minting publisher tokens for any channel under any identity.

There is also **no CI on `main`**, so nothing prevents further regression, and `react-router` carries four unpatched advisories.

This verdict is **not a judgement on the engineering**. The codebase is better than most: 67/69 tables have RLS, the role model provably resists self-escalation, the service-role key never touches client code, DOMPurify is configured properly rather than decoratively, the observability layer scrubs PII, and the property-based tests include a content tripwire that caught one of my own edits. The fixes for nearly everything already exist and are verified — on a branch.

**The blocker is a release-process gap, not a code-quality gap.** `main` and the audit branch have not diverged, so the remedy is a fast-forward merge, not a rewrite.

**Path to READY WITH CONDITIONS:** complete Next Actions 1–5. On the evidence, that flips SECURITY to ~8/10 and PRODUCTION READINESS to ~7/10, and I would expect to re-verify rather than re-audit.

---

## CHANGE LOG

| ID | Date | Issue | File | Change | Risk | Tests | Status |
|---|---|---|---|---|---|---|---|
| C-201 | 2026-08-28 | SEC-11 | `src/lib/safe-redirect.ts` | Origin-comparison validator | Low | 30 pass | **VERIFIED** |
| C-202 | 2026-08-28 | SEC-11 | `src/lib/__tests__/safe-redirect.test.ts` | Regression guard | None | 30 pass | **VERIFIED** |
| C-203 | 2026-08-28 | SEC-11 | `src/pages/LoginPage.tsx` | Use `safeInternalPath` | Low | suite pass | **VERIFIED** |
| C-204 | 2026-08-28 | AUDIT-01/02/03 | `supabase/migrations/032_…sql` | Clamp limit; visibility gate; drop `email` | Medium | gates pass | **PENDING APPLY** |
| C-205 | 2026-08-28 | SEC-11 | `src/lib/safe-redirect.ts` | Scoped `no-control-regex` disable | None | lint at baseline | **VERIFIED** |
| C-206 | 2026-08-28 | — | `docs/PLATFORM_AUDIT.md` | This report | None | — | **VERIFIED** |

**Cycle-1 changes (C-101…C-140)** are recorded in commit `95eba76` on `audit/security-review-2026-08-27`. They are verified **on that branch** and unverified on `main` because they are not present there.
