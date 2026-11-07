# Platform source audit — 7 November 2026

**Checkout:** `main` at `e9893c2`  
**Review type:** Source and configuration review. No production services or deployed database were accessed.

## Scope and method

Reviewed route and auth guards, webinar token issuance and session access, relevant database grants and RLS policies, selected edge-function authorization helpers, web security headers, native app configuration, and CI gates. Findings below are based on the current checkout. No tests, builds, or live service checks were run.

## Findings

### A-01 — Webinar join tokens are not scoped to their registration's event

**Severity: Medium · Authorization**

`livekit-token` looks up a registration using only `join_token` (`supabase/functions/livekit-token/index.ts:89-94`). It then loads the caller-supplied session and its event (`:122-133`). When a registration was found, `registrationId` is set, so the later attendee authorization branch is skipped (`:166-174`). The function does not compare `reg.event_id` with `session.event_id`, or reject cancelled and unapproved registrations before issuing the viewer token.

A person holding a join token for one event can therefore request a viewer token for a different webinar session if they know that session's ID. The token lookup also accepts a registration whose status or approval has since changed.

**Recommended fix:** Resolve the session first, then validate the registration token against that session's event and its current non-cancelled, approved state before updating the active browser session or signing a token. Keep the check in one server-side operation so the authorization decision cannot race with a status change.

### A-02 — Anonymous attendee and speaker links cannot load the webinar session

**Severity: Medium · Feature availability**

Approved guest registrations receive `/e/<event-id>/live?join=<token>` links (`supabase/functions/guest-registration/index.ts:367-375`). But `EventLivePage` first reads `webinar_sessions` directly from the browser client (`src/pages/EventLivePage.tsx:83-87`). The schema grants `SELECT` on that table only to `authenticated` and its read policies require event ownership or an approved attendee (`supabase/migrations/000_full_schema.sql:483-486`). A signed-out visitor with a valid join or speaker token cannot load the session row; the page stays in the lobby and the join handler exits because `session` is null (`src/pages/EventLivePage.tsx:245-251`).

**Recommended fix:** Provide a narrow server-side session lookup that validates the join or speaker token for the requested event and returns only the fields needed to enter the room. Apply the same access rule to the stream's live-session updates.

### A-03 — TypeScript and lint failures do not block CI

**Severity: Low · Release control**

The CI workflow marks both type checking and ESLint as `continue-on-error: true` (`.github/workflows/ci.yml`). A change can therefore merge with new type or lint failures even while the workflow reports success. This review did not run either command, so it does not quantify the current backlog.

**Recommended fix:** Keep these checks reported while the existing backlog is triaged, then make each blocking once clean, as the workflow comments already describe.

## Limits

This review did not exercise browser flows, run automated checks, inspect current production headers, verify the deployed Supabase schema, or test third-party provider configuration. In particular, A-01 and A-02 are source-level findings; their live behavior depends on the deployed function and database versions.
