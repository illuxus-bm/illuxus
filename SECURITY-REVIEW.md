# Security Review Summary

**Repository:** illuxus
**Reviewed commit:** 3691a3b
**Review date:** 2026-11-03
**Detailed audit:** [docs/QA_SECURITY_AUDIT_2026-10-27.md](docs/QA_SECURITY_AUDIT_2026-10-27.md)

## Current status

The code fixes for findings F-01 through F-09 from the October 27 review are present in the current checkout. Their deployment to Supabase and Vercel has not been verified.

The current source audit found six medium-severity risks:

- Sponsor data sharing can include attendee and unregistered speaker contact details without an attendee opt-in path; copied snapshots have no source-row deletion link.
- Sponsor CSV exports do not cover all spreadsheet formula-triggering prefixes.
- The public OG image function fetches arbitrary event image URLs without destination or response-size controls.
- The public support-ticket endpoint has no rate limit or bot challenge.
- The shared Edge Function rate limiter uses a non-atomic count-then-insert sequence.
- Anonymous users can read reaction metadata across every webinar session through an unconditional SELECT policy.

**7 November 2026:** all six (F-10 to F-15) are fixed in the source, with tests, but not deployed. Migration 077 must run before the rate-limited functions deploy. See [Remediation status](docs/QA_SECURITY_AUDIT_2026-10-27.md#remediation-status-7-november-2026) for the deploy order and the decisions left to the privacy owner.

## Validation

- Vitest: 141 files, 1,510 tests passed.
- Tracked SQL scenario tests: 143 assertions passed across two suites.
- Build: blocked in this workspace because swiper/modules is not installed in node_modules, despite Swiper being declared in the manifest.
- Typecheck: 113 diagnostics.
- ESLint: 140 errors and 131 warnings.
- npm audit: unable to reach registry.npmjs.org; current dependency advisories remain unverified.
- CI does not block on typecheck, lint or high-severity dependency advisories.
- Content Security Policy is report-only.
- No live services or deployed database were accessed.
- The current worktree has uncommitted Capacitor dependencies in package.json and bun.lock that are absent from package-lock.json; see Q-06 in the detailed audit.

See the detailed audit for evidence, severity, limits and recommended fixes.
