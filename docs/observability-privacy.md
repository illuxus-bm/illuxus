# Observability — Privacy and Data Retention

This document is the user-facing privacy policy for the observability layer. For
the developer guide, see [`docs/observability.md`](./observability.md).

## What we collect

The remote sink only receives log records of severity `warn`, `error`, or `fatal`.
Lower-severity records (`trace`, `debug`, `info`) stay on the local device and are
written only to the browser console in development.

Each record that does leave the browser carries:

- The **severity** (`warn`, `error`, `fatal`) and a short, structured **message**.
- For caught errors: the **error name**, **message**, and **stack trace**, with PII
  scrubbed from the stack frames.
- The **route** the user was on (`window.location.pathname`).
- The **auth user id** (a UUID), if one is available.
- The **build sha** of the bundle that emitted the record.
- The **correlation id** of the originating action (a UUIDv4), if any.
- A **structured fields** object containing whatever named fields the call site
  passed (e.g. `event_id`, `org_id`, `duration_ms`, `result_code`). All values are
  passed through the redactor before leaving the browser.

## What we do not collect

The Logger and the remote sink are configured so that the following **never leave the
browser**:

- **Email addresses** — substrings matching an email pattern are replaced with
  `[redacted-email]` anywhere they appear (messages, field values, error stacks).
- **Names** — the SDK is configured with `sendDefaultPii: false`, and only the
  auth user id is set on the user scope. Names are not collected even if a call
  site accidentally passes them.
- **Phone numbers** — substrings matching the E.164 format are replaced with
  `[redacted-phone]`.
- **JWTs / bearer tokens** — substrings matching a JWT shape are replaced with
  `[redacted-token]`.
- **Passwords, API keys, refresh tokens, access tokens, cookies, authorization
  headers** — any field whose key (case-insensitive) contains `password`, `passwd`,
  `secret`, `token`, `access_token`, `refresh_token`, `authorization`, `cookie`,
  `p_token`, or `p_password` has its value replaced wholesale with `[redacted]`.
- **Raw IP addresses** — the SDK is configured with `sendDefaultPii: false`, so
  the provider does not capture or store the originating IP.
- **Input field values** — the SDK's default integrations are disabled, so we do
  not capture form input contents, click targets' text, or other DOM contents
  outside of records the call site explicitly emitted.
- **Session replay** — we do not record video, screen content, DOM mutations, or
  user interaction streams. The provider's session replay product is not enabled.

## Retention

Records sent to the remote sink are retained for **30 days**, after which they are
deleted by the provider. There is no separate long-term archive.

The provider is [Sentry](https://sentry.io). The 30-day window is configured at the
project level on the provider dashboard. Confirm by visiting Settings → Privacy & Data
Scrubbing on sentry.io for the project.

## Opt-out

You can opt out of remote logging at any time. Local console output in development
is not affected — only the records that would otherwise be sent to the remote sink.

There are two ways to opt out:

- **In-app**: any UI surface that calls `setPrivacyOptOut(true)` will persist the
  preference in `localStorage` under the key `observability:opt-out` and apply it
  immediately. The Logger rechecks this preference on every emit, so the change
  takes effect within one event-loop tick.
- **Build-level**: a fork or self-hosted deployment can set
  `VITE_OBSERVABILITY_OPT_OUT=1` at build time, which forces opt-out for every
  user of that build regardless of the per-user preference.

When opt-out becomes truthy:

- No further records are sent to the remote sink, **including `error` and `fatal`**.
- Any in-memory batch waiting to be sent is dropped.
- The offline queue (records buffered while the device was offline) is cleared.

To opt back in, call `setPrivacyOptOut(false)` (or remove the
`VITE_OBSERVABILITY_OPT_OUT` env var and rebuild).

## Where the data lives

- **Provider**: [Sentry](https://sentry.io).
- **Region**: the project's data residency is whichever region the Sentry project is
  configured for. New projects default to the United States; EU residency is
  available on request from the operator. Check the project settings on
  sentry.io to confirm the active region for this deployment.
- **Access**: only members of the operator's Sentry organisation with project access
  can view records. Access is revoked when a team member leaves the organisation.
- **Deletion**: to request deletion of records associated with your auth user id,
  contact the operator with the user id. Records are also deleted automatically
  after the 30-day retention window.
