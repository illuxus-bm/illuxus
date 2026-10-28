# Security Review Summary

**Repository:** illuxus  
**Reviewed commit:** `3b1cb5d`  
**Review date:** 2026-10-27  
**Detailed report:** [docs/QA_SECURITY_AUDIT_2026-10-27.md](docs/QA_SECURITY_AUDIT_2026-10-27.md)

## Executive summary

The application builds, but it is not ready for paid ticket sales or a security-sensitive production release. The most serious issue allows approved tickets to be issued for paid events without payment. Authentication, service-role authorization, and several public Supabase surfaces also need remediation.

## Findings

| ID | Severity | Area | Summary | Recommended fix |
|---|---|---|---|---|
| F-01 | Critical | Ticketing | Paid-event registrations can be approved and issued without payment; authenticated users can also insert registrations directly. | Block paid registrations until verified payment exists; approve only from a signed server-side payment webhook; restrict direct registration inserts. |
| F-02 | High | Authentication | The email OTP dialog does not gate the already-issued Supabase session or API access. | Use Supabase MFA and enforce the elevated assurance level in routes, RLS, and privileged functions. |
| F-03 | High | Messaging | Public project JWTs can invoke service-role email and WhatsApp actions without caller/tenant authorization. | Resolve the caller, verify ownership or workspace membership, separate internal triggers from browser calls, and add idempotency/rate limits. |
| F-04 | High | Accounts | Organizers can create confirmed accounts with organizer-selected passwords and link matching registrations across unrelated events. | Use participant-controlled, single-use activation links and scope linking to the authorized event. |
| F-05 | Medium | Webinar reactions | Anonymous users can read and insert arbitrary reactions for any webinar session. | Require attendee/session authorization, validate reaction values, and expose aggregates rather than raw rows. |
| F-06 | Medium | Site editor | Public table access exposes unpublished `draft_content` through direct PostgREST queries. | Revoke table-wide public reads; expose only published content through a view/RPC and restrict drafts to admins. |
| F-07 | Medium | OG previews | The public OG function can disclose unpublished event metadata by ID or slug. | Filter public queries to published events; use an authenticated manager-only preview path. |
| F-08 | Medium | Communities | Any authenticated user can call a `SECURITY DEFINER` helper to create a community for another event. | Revoke client execution or enforce event ownership and the `create_community` setting inside the function. |
| F-09 | Medium | Operations | `seed-cities` is a public, expensive service-role operation with no authorization or rate limit. | Make it an admin-only or signed scheduled job with a single-flight lock. |

## QA and release blockers

- Production build passed.
- Unit tests failed in `src/components/layout/__tests__/gutters.test.tsx`.
- ESLint failed while opening a generated Vite timestamp file.
- TypeScript checking failed in application test files.
- `npm audit --omit=dev` reported a high-severity React Router dependency advisory.
- No tracked CI/typecheck gate is present.
- No Content-Security-Policy is configured.
- The site-editor repair remains a manual SQL script rather than a numbered migration.

## Positive controls

The review found good controls in safe same-origin redirects, HTML sanitization, shared edge-function identity helpers, webhook signature verification, and the absence of tracked service-role/private-key secrets. These controls should be applied consistently to all privileged paths.

## Remediation order

1. Disable paid-event approval or implement verified payment.
2. Repair MFA enforcement and service-role endpoint authorization.
3. Replace organizer-controlled account provisioning with verified activation.
4. Restrict public reactions, site drafts, OG previews, community creation, and city seeding.
5. Add CI, type checking, dependency scanning, CSP, and migration tracking.

## Remediation status (2026-10-28)

Fixed in code; **live only once deployed** (run `supabase/RUN_ME_security_fixes.sql`, deploy the edge functions listed below, push the frontend). SQL changes were tested against a local Postgres (PGlite) with stand-in roles and tables; edge functions were syntax-checked but not run (no Deno locally).

| ID | Status | What changed |
|---|---|---|
| F-01 | Fixed | No online checkout exists, so a paid event's self-serve registration is `pending` until the organiser confirms payment; the QR is only issued on approval. The registrations trigger now decides status, payment and check-in for every non-organiser insert (published events only, capacity enforced with a per-event lock, a direct API insert can only register the caller). Copy on the event card and guest email says "awaiting payment". Public pages still advertise Stripe/Razorpay — product decision, not changed. |
| F-02 | Fixed | Email-OTP dialog replaced by Supabase MFA (authenticator app), with a Settings toggle. A password-only (`aal1`) session of a user with two-factor on is refused by a PostgREST pre-request check, a RESTRICTIVE policy on every RLS table, and every edge function's caller lookup. |
| F-03 | Fixed | All eight functions resolve the caller (service role, or a user checked against the event / communication / vendor), claim delivery rows atomically, and rate-limit ticket, invite and venue emails. `notify-venue-selection` now uses only the saved request's ids. |
| F-04 | Fixed | `create-participant-account` removed (unused); participants activate through the single-use emailed link. Delete the deployed function too. |
| F-05 | Fixed | Reactions only via `webinar_react()` (session members or a valid join/speaker link, allow-listed emoji, 10 per 10 s). Anonymous viewers see emoji but not who sent them. |
| F-06 | Fixed | Public column grants exclude `draft_content`; the site editor reads drafts through admin-only `get_site_drafts()`. |
| F-07 | Fixed | `og-event` only renders published events. |
| F-08 | Fixed | `ensure_event_community()` is no longer executable by `anon`/`authenticated`; the owner-run triggers still create communities. |
| F-09 | Fixed | `seed-cities` requires a platform admin or the service role and runs at most once per 30 minutes. |

QA and release blockers:

- **Tests** — all pass. The gutters test now checks the redesigned header; the UTM tripwire hashes line-ending-neutral and was re-pinned after re-audit.
- **ESLint** — ignores Vite's timestamp files and the generated dashboard copies. 150 pre-existing errors remain (reported in CI, not yet blocking).
- **TypeScript** — test files are clean. The remaining app errors come mostly from the outdated `src/integrations/supabase/types.ts`; regenerate it.
- **Dependencies** — React Router 6.30.6, Swiper 12.2.0, and compatible audit fixes applied: 15 advisories (2 critical) → 6 (0 critical). Remaining need major upgrades: React Router 7, zod 4, exceljs.
- **CI** — `.github/workflows/ci.yml` blocks on tests, build, current dashboard copies and critical advisories; reports types, lint and high advisories.
- **CSP** — `Content-Security-Policy-Report-Only` added in `vercel.json`. Watch the browser console for violations, then switch it to enforcing.
- **Manual SQL** — the security fixes are migration section 056 in the bundle; the README lists each `RUN_ME_*.sql` script and where it lives in the bundle.
