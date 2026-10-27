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
