# Requirements Document

## Introduction

The Observability Foundation is the cross-cutting layer that every other production-readiness spec depends on (PWA shell, offline scanner, productionization sweep, offline reads). Today the application has ~50 ad-hoc `console.*` calls scattered across `src/components`, `src/pages`, and `src/hooks`, no global error boundary, no remote error reporting, and no correlation between a user-visible failure and the upstream Supabase RPC that produced it.

This spec introduces:

1. A single structured Logger module with leveled, redacted, env-aware sinks.
2. A top-level Error Boundary plus per-route Error Boundaries with a branded fallback that surfaces a correlation id.
3. A privacy-first Remote Sink (Sentry or equivalent) with PII scrubbing, release tagging, and source maps uploaded at build time but never shipped to the public bundle.
4. Correlation ids generated per Supabase RPC call, propagated through the resulting promise chain, and surfaced in logs and the user-facing error fallback.
5. A development-only RPC Wrapper that logs RPC name, redacted params, duration, and result code.
6. Privacy and data-retention rules with a GDPR-friendly opt-out.
7. Performance budgets for the Logger itself, including offline buffering and an end-of-life flush on `pagehide` / `visibilitychange=hidden`.
8. A migration plan that replaces or explicitly justifies every existing `console.*` callsite, including the `console.warn('UI sync failure')` emitted by the live-updates-delayed indicator in `RegistrationsSection.tsx`.

Out of scope (handled by other specs in this batch): the PWA shell, the offline check-in scanner queue, the broader productionization sweep, and offline read-side caching. The Logger MUST, however, expose the primitives those specs need (correlation id propagation across replay attempts, durable buffering across tab close).

## Glossary

- **Logger**: The single module exported from `src/lib/observability/logger`. Provides leveled emit functions and structured-field attachment.
- **Log_Level**: One of `trace`, `debug`, `info`, `warn`, `error`, `fatal`, ordered from least to most severe.
- **Log_Record**: The structured object produced by the Logger for a single emit call. Contains a level, a message, structured fields, and metadata (timestamp, correlation id, build sha, route, user id).
- **Sink**: A destination for Log_Records. The two sinks defined by this spec are the Console_Sink (browser devtools) and the Remote_Sink (Sentry or equivalent).
- **Console_Sink**: Sink that writes Log_Records to `console.*` for human inspection during development.
- **Remote_Sink**: Sink that ships Log_Records of severity `warn` or higher to a third-party error-reporting service.
- **Correlation_Id**: A 128-bit identifier (rendered as a UUIDv4 string) assigned to a single Supabase RPC call and threaded through every Log_Record emitted while that RPC's promise chain is in flight.
- **Correlation_Context**: The browser-equivalent of AsyncLocalStorage that the Logger uses to read the active Correlation_Id. Implemented with an explicit `runWithCorrelationId(id, fn)` API plus a thin Promise.then patch contained to the RPC_Wrapper.
- **RPC_Wrapper**: The thin wrapper around `@supabase/supabase-js` that generates a Correlation_Id, attaches it as a request header (`x-correlation-id`), runs the call inside a Correlation_Context, and (in development) logs name/params/duration/result.
- **Error_Boundary**: A React class component that catches errors thrown during render or lifecycle of its descendants and renders a fallback. This spec defines two flavors: the Root_Error_Boundary (wraps the whole app) and the Route_Error_Boundary (wraps each top-level route element in `src/App.tsx`).
- **Fallback_View**: The branded UI rendered by an Error_Boundary when its subtree has errored. Surfaces a Correlation_Id, a Reload action, and a Go_Home action.
- **Offline_Queue**: A durable FIFO buffer (IndexedDB-backed, with a localStorage fallback for environments without IndexedDB) where the Logger stores undelivered Log_Records when the network or the Remote_Sink is unavailable.
- **Redaction_Set**: The fixed set of field-name patterns and value patterns the Logger MUST replace with the literal string `"[redacted]"` before any Log_Record leaves the process. Includes email addresses, bearer/JWT-shaped tokens, phone numbers, and a deny-list of Supabase RPC parameter names (e.g., `p_token`, `p_password`, `access_token`, `refresh_token`).
- **Build_Sha**: The short git commit sha injected by Vite at build time as `VITE_BUILD_SHA`. Used as the Remote_Sink release tag and as a structured field on every Log_Record.
- **Privacy_Opt_Out**: A boolean read from `import.meta.env.VITE_OBSERVABILITY_OPT_OUT` and from `localStorage.getItem('observability:opt-out')`. When either is truthy, the Remote_Sink MUST NOT receive any Log_Record.
- **Boot_Buffer**: An in-memory bounded ring buffer (max 64 records) populated by a no-dep stub Logger that is loaded synchronously in `index.html` / `main.tsx` before the real Logger module is available, then flushed into the real Logger once it loads.
- **PII**: Personally Identifiable Information. The categories the Redaction_Set actively scrubs are: email addresses, phone numbers, bearer/JWT tokens, Supabase access/refresh tokens, participant join tokens (`p_token`), and passwords. Raw IP addresses are also classified as PII for the purpose of the Remote_Sink's privacy configuration (no-IP capture), but the Logger does not attempt to auto-strip arbitrary IP-shaped strings from free-text fields — developers are expected not to pass raw IPs into log calls.

## Requirements

### Requirement 1: Single Structured Logger Module

**User Story:** As a developer, I want a single typed Logger imported from one path, so that all log output across the app is consistent, structured, and centrally governable.

#### Acceptance Criteria

1. THE Logger SHALL be exported from the module path `src/lib/observability/logger` as a named export `logger`.
2. THE Logger SHALL expose exactly six emit methods named `trace`, `debug`, `info`, `warn`, `error`, and `fatal`, each accepting a string message and an optional structured-fields object of type `Record<string, unknown>`.
3. THE Logger SHALL expose a `child(fields)` method that returns a new Logger whose emitted Log_Records merge the bound fields with per-call fields, with per-call fields taking precedence on key collision.
4. THE Logger SHALL attach the following metadata to every Log_Record it produces: `timestamp` (ISO 8601 string), `level` (Log_Level), `build_sha` (Build_Sha), `route` (current `window.location.pathname`), `correlation_id` (active Correlation_Id or `null`), and `user_id` (current authenticated user id or `null`).
5. WHEN the Logger is imported, THE Logger SHALL be initialized lazily on first emit and SHALL NOT perform any network or storage I/O at module-load time.
6. IF the Logger's lazy initialization throws on the first emit, THEN THE Logger SHALL silently discard the emit and SHALL leave the Logger uninitialized so that subsequent emits also no-op without throwing.
7. THE Logger's TypeScript types SHALL prohibit calling an emit method with a `message` argument that is not a string.

### Requirement 2: Environment-Aware Sinks

**User Story:** As a developer, I want different log destinations in development and production, so that local debugging is verbose while shipped builds are quiet and privacy-preserving.

#### Acceptance Criteria

1. WHEN `import.meta.env.DEV` is true, THE Logger SHALL route every Log_Record to the Console_Sink at its native level.
2. WHEN `import.meta.env.PROD` is true, THE Console_Sink SHALL only emit Log_Records of severity `warn`, `error`, or `fatal`.
3. WHEN `import.meta.env.PROD` is true, THE Remote_Sink SHALL receive only Log_Records of severity `warn`, `error`, or `fatal`.
4. WHEN `import.meta.env.DEV` is true, THE Remote_Sink SHALL NOT receive any Log_Record.
5. WHERE `Privacy_Opt_Out` is truthy, THE Remote_Sink SHALL NOT receive any Log_Record regardless of build mode.
6. WHILE the user has not yet authenticated, THE Logger SHALL set the `user_id` field of every Log_Record to `null`.
7. WHEN a Log_Record reaches a sink, THE Sink SHALL receive it with all fields already redacted per the Redaction_Set.

### Requirement 3: PII Redaction

**User Story:** As an end user, I want my personal data scrubbed from logs before they leave my browser, so that operational telemetry never exposes my identity.

#### Acceptance Criteria

1. THE Logger SHALL apply redaction to every Log_Record before passing it to any Sink.
2. WHEN a structured-field key matches any name in the Redaction_Set deny-list (case-insensitive: `password`, `passwd`, `secret`, `token`, `access_token`, `refresh_token`, `authorization`, `cookie`, `p_token`, `p_password`), THE Logger SHALL replace the value with the literal string `"[redacted]"`.
3. WHEN a string value within any Log_Record field matches the email pattern (RFC 5322 simplified: one or more non-whitespace characters, an `@`, one or more non-whitespace characters, a `.`, and at least two non-whitespace characters), THE Logger SHALL replace the matched substring with `"[redacted-email]"`.
4. WHEN a string value within any Log_Record field matches the JWT pattern (three base64url segments separated by dots, each at least 8 characters), THE Logger SHALL replace the matched substring with `"[redacted-token]"`.
5. WHEN a string value within any Log_Record field matches an E.164-shaped phone-number pattern (an optional leading `+`, followed by 7 to 15 digits, allowing spaces, dashes, and parentheses as separators), THE Logger SHALL replace the matched substring with `"[redacted-phone]"`.
6. THE Logger SHALL apply redaction recursively to nested objects and arrays up to a depth of 6 levels.
7. WHERE a structured field is the literal `Error` object, THE Logger SHALL preserve its `name`, `message`, and `stack` properties and SHALL apply redaction to `message` and `stack` as if they were strings.
8. WHEN the redaction routine encounters a circular reference, THE Logger SHALL replace the cycle with the literal string `"[circular]"` and continue without throwing.
9. THE Redaction routine, given any input, SHALL produce an output containing zero substrings matching the email pattern, zero substrings matching the JWT pattern, and zero substrings matching the E.164 phone-number pattern (correctness property: redaction is total over the Redaction_Set).

### Requirement 4: Logger Robustness

**User Story:** As an end user, I want logging failures to be invisible to me, so that an observability bug never crashes the app I am using.

#### Acceptance Criteria

1. IF an emit call throws synchronously inside any Sink, THEN THE Logger SHALL catch the thrown value and SHALL NOT propagate it to the caller (correctness property: the Logger never throws).
2. IF a Sink returns a rejected Promise, THEN THE Logger SHALL attach a `.catch` handler that swallows the rejection and SHALL NOT surface an unhandled rejection.
3. IF the redaction routine throws on a malformed input, THEN THE Logger SHALL emit a Log_Record at level `warn` with the message `"redaction failed"` and SHALL forward a sanitized record containing only the level, the original message, and the literal field `{ "redaction_error": true }`.
4. IF the Logger is invoked before its initialization has completed, THEN the in-memory Boot_Buffer SHALL accept the call and the records SHALL be flushed in order once initialization completes.
5. WHEN the Boot_Buffer reaches its capacity of 64 records before the real Logger is ready, THE Boot_Buffer SHALL drop the oldest record to make room for the newest (FIFO eviction) and SHALL emit a single `warn` record `"boot buffer overflowed"` once flushed.

### Requirement 5: Performance Budget

**User Story:** As a developer, I want logging to be cheap, so that adding observability never becomes the new bottleneck.

#### Acceptance Criteria

1. WHEN measured on a representative laptop (defined as: Chromium 120+, Apple M-series or x86-64 with a 3 GHz baseline, at least 8 GB of RAM, and the page idle), THE Logger SHALL complete a single emit call (including redaction and enqueue, but excluding network I/O) within 5 milliseconds for Log_Records up to 16 KB serialized.
2. THE Logger SHALL batch outbound Remote_Sink deliveries with a maximum batch size of 20 records and a maximum batch age of 5 seconds, whichever is reached first.
3. WHEN the document fires a `pagehide` event, THE Logger SHALL flush all pending Remote_Sink batches via the `navigator.sendBeacon` API.
4. WHEN the document's `visibilitychange` event fires with `document.visibilityState === "hidden"`, THE Logger SHALL flush all pending Remote_Sink batches via `navigator.sendBeacon`.
5. IF `navigator.sendBeacon` is unavailable or returns `false` for a flush attempt, THEN THE Logger SHALL drop the affected batch and SHALL NOT fall back to a synchronous or `fetch`-based dispatch (correctness property: end-of-life flush is sendBeacon-only).
6. WHILE the browser reports `navigator.onLine === false`, THE Logger SHALL persist Remote_Sink-bound records to the Offline_Queue instead of dispatching them.
7. WHEN `navigator.onLine` transitions from `false` to `true`, THE Logger SHALL drain the Offline_Queue in FIFO order at a rate not exceeding 20 records per 5-second window.
8. WHERE the Offline_Queue exceeds 1000 records, THE Logger SHALL evict the oldest records to enforce the cap and SHALL emit a single `warn` record `"offline queue overflow"` per eviction event.
9. THE Logger SHALL NOT perform synchronous IndexedDB or localStorage I/O on the call site of an emit method (correctness property: emit is non-blocking on persistence).

### Requirement 6: Offline Durability

**User Story:** As an on-call engineer, I want logs collected while a user is offline to survive a tab close and arrive when connectivity returns, so that I have full context for incidents that started offline.

#### Acceptance Criteria

1. WHERE IndexedDB is available in the host environment, THE Offline_Queue SHALL persist records to an IndexedDB object store named `observability_queue`.
2. WHERE IndexedDB is unavailable, THE Offline_Queue SHALL fall back to a single `localStorage` key named `observability:queue` containing a JSON array of records.
3. WHEN a tab containing a non-empty Offline_Queue is closed, THE Offline_Queue contents SHALL be flushed to durable storage before the unload completes such that the queue is readable immediately upon tab closure (correctness property: durability across tab close — no in-flight write is lost on close).
4. WHEN a record is successfully delivered to the Remote_Sink, THE Offline_Queue SHALL remove that exact record before delivering the next.
5. IF a delivery to the Remote_Sink fails with a retryable error (HTTP status 408, 425, 429, 500, 502, 503, 504, or a network error), THEN THE Offline_Queue SHALL retain the record and SHALL retry with exponential backoff starting at 1 second and capping at 60 seconds.
6. IF a delivery to the Remote_Sink fails with a non-retryable HTTP status (4xx other than 408, 425, 429), THEN THE Offline_Queue SHALL drop the record and SHALL emit a single `warn` record `"remote sink rejected record"` with the rejected status code.

### Requirement 7: Root and Per-Route Error Boundaries

**User Story:** As an end user, when something breaks, I want a friendly screen with a way out instead of a blank page, so that I can recover the session or escalate to support.

#### Acceptance Criteria

1. THE Root_Error_Boundary SHALL wrap the entire React tree rendered inside `<BrowserRouter>` in `src/App.tsx`.
2. THE Route_Error_Boundary SHALL wrap the element of every top-level `<Route>` declared in `src/App.tsx`.
3. WHEN a descendant of an Error_Boundary throws during render, lifecycle, or commit, THE Error_Boundary SHALL render a Fallback_View instead of the descendant subtree.
4. WHEN an Error_Boundary catches an error, THE Error_Boundary SHALL emit a Log_Record at level `error` containing the structured fields `boundary` (`"root"` or `"route"`), `route` (current pathname), `error_name`, `error_message`, `component_stack`, and the active `correlation_id`.
5. THE Fallback_View SHALL display a heading, an explanatory body, a Reload action, a Go_Home action, and the active Correlation_Id in a copyable element.
6. WHEN the user activates the Reload action, THE Fallback_View SHALL invoke `window.location.reload()`.
7. WHEN the user activates the Go_Home action, THE Fallback_View SHALL navigate to the path `/` and reset the Error_Boundary's caught-error state.
8. THE Fallback_View SHALL render an interactive control labelled `"Copy reference"` that copies the Correlation_Id to the user's clipboard.
9. THE Fallback_View SHALL be reachable in zero `console.*` calls (correctness property: no `console.*` calls remain in the Fallback_View source).
10. WHEN no Correlation_Id is active at the time of the catch, THE Fallback_View SHALL display the literal text `"no reference"` in place of the Correlation_Id and the Copy action SHALL be disabled.

### Requirement 8: Remote Error Reporting

**User Story:** As an on-call engineer, I want production errors to land in a queryable inbox with release context and source-mapped stack traces, so that I can triage incidents without reproducing them locally.

#### Acceptance Criteria

1. THE Remote_Sink SHALL be implemented as a single adapter module under `src/lib/observability/remote-sink/` that conforms to the same Sink interface used by the Console_Sink.
2. WHEN initialized, THE Remote_Sink SHALL read its DSN from `import.meta.env.VITE_OBSERVABILITY_DSN`.
3. IF `VITE_OBSERVABILITY_DSN` is empty or missing, THEN THE Remote_Sink SHALL operate as a no-op and SHALL NOT attempt any network I/O.
4. THE Remote_Sink SHALL tag every outbound record with the active Build_Sha as the release identifier.
5. THE Remote_Sink SHALL configure the underlying SDK with the option that disables IP-address capture.
6. THE Remote_Sink SHALL configure the underlying SDK with the option that disables automatic breadcrumbs of input-field values.
7. THE Remote_Sink SHALL apply the Logger's redaction routine as the SDK's `beforeSend` hook so that even SDK-collected breadcrumbs flow through redaction.
8. THE Build_Pipeline SHALL upload source maps to the Remote_Sink provider as part of the production build step.
9. THE Build_Pipeline SHALL configure Vite so that `*.map` files are NOT emitted into the public `dist/` artifact (correctness property: source maps are uploaded but not served).
10. WHEN an authenticated user is present, THE Remote_Sink SHALL send only the user's id, never the user's email, name, or other profile fields.

### Requirement 9: Correlation IDs on Supabase RPC Calls

**User Story:** As an on-call engineer, I want a single id that links the user-facing error a customer quoted to the exact backend RPC that produced it, so that I can pivot from a support ticket to a server log in one click.

#### Acceptance Criteria

1. THE RPC_Wrapper SHALL be exported from `src/lib/observability/rpc.ts` and SHALL be the single way the application invokes Supabase RPCs from production code.
2. WHEN the RPC_Wrapper is invoked, THE RPC_Wrapper SHALL generate a fresh UUIDv4 Correlation_Id.
3. THE RPC_Wrapper SHALL attach the generated Correlation_Id to the outbound HTTP request as the header `x-correlation-id`.
4. THE RPC_Wrapper SHALL execute the wrapped call inside a Correlation_Context such that every Log_Record emitted in the resulting promise chain carries the same Correlation_Id (correctness property: each RPC call produces exactly one Correlation_Id, observable on every Log_Record causally downstream of that call).
5. WHEN multiple RPC_Wrapper invocations are in flight concurrently, THE Correlation_Context SHALL keep their Correlation_Ids isolated such that no Log_Record carries a Correlation_Id from a different in-flight call.
6. WHEN an RPC_Wrapper invocation completes (resolved or rejected), THE RPC_Wrapper SHALL emit one Log_Record at level `info` if resolved or `warn` if rejected, including the fields `rpc_name`, `duration_ms`, `result_code`, and the Correlation_Id.
7. WHEN the offline replay subsystem (defined in a separate spec) re-issues a previously-failed RPC, THE RPC_Wrapper SHALL accept an optional `correlation_id` argument and SHALL reuse it instead of generating a new one (correctness property: the original attempt and the replay attempt share a Correlation_Id).
8. THE RPC_Wrapper's signature SHALL be assignment-compatible with the existing `supabase.rpc(name, params)` call sites so that migrating a callsite is a one-line rename.

### Requirement 10: Development RPC Logging

**User Story:** As a developer, I want to see what RPC was called, with what params, how long it took, and how it responded — without sprinkling `console.log` everywhere — so that I can debug Supabase interactions efficiently.

#### Acceptance Criteria

1. WHEN `import.meta.env.DEV` is true, THE RPC_Wrapper SHALL emit a Log_Record at level `debug` immediately before dispatching the RPC, with fields `rpc_name`, `params` (redacted), and the Correlation_Id.
2. WHEN `import.meta.env.DEV` is true and the RPC resolves, THE RPC_Wrapper SHALL emit a Log_Record at level `debug` with fields `rpc_name`, `duration_ms`, `result_code`, and the Correlation_Id.
3. WHEN `import.meta.env.DEV` is true and the RPC rejects, THE RPC_Wrapper SHALL emit a Log_Record at level `warn` with fields `rpc_name`, `duration_ms`, `result_code`, `error_message`, and the Correlation_Id.
4. WHEN `import.meta.env.PROD` is true, THE RPC_Wrapper SHALL NOT emit the pre-dispatch `debug` record (correctness property: dev-only RPC logging is silent in production).
5. THE RPC_Wrapper SHALL apply the Logger's redaction routine to the `params` field before logging it.

### Requirement 11: Privacy and Data Retention Defaults

**User Story:** As an end user, I want sensible privacy defaults and an opt-out, so that my observability data does not become a liability for me or for the operator.

#### Acceptance Criteria

1. THE Remote_Sink SHALL be configured to retain records for no longer than 30 days at the provider level (configured via SDK options or provider dashboard documentation, asserted by build-time configuration check).
2. THE Logger SHALL never emit a Log_Record containing a raw email address, raw JWT, raw participant join token, raw Supabase access token, raw Supabase refresh token, or raw password (correctness property: raw PII never leaves the browser for these field categories, enforced by the Redaction_Set).
3. THE Logger SHALL rely on developers to avoid passing raw IP addresses to the Logger and SHALL NOT auto-strip arbitrary IP-shaped strings from free-text fields. Derived identifiers (hashed IPs, truncated email domains) SHALL be permitted as Log_Record fields provided the raw values they were derived from are not also present.
4. WHERE `Privacy_Opt_Out` is truthy, THE Remote_Sink SHALL be initialized as a no-op for the lifetime of the page, including for severity `error` and `fatal` records (correctness property: opt-out is unconditional across all severities).
5. THE Logger SHALL expose a function `setPrivacyOptOut(value: boolean)` that writes `value` to `localStorage.getItem('observability:opt-out')` and SHALL update the active Remote_Sink's enabled state to reflect the new value within one event-loop tick.
6. WHEN the user toggles the privacy opt-out from off to on, THE Logger SHALL drop any in-memory pending Remote_Sink batches and the Offline_Queue contents.
7. THE application SHALL document the privacy policy and retention windows in the file `docs/observability-privacy.md` as part of this spec's deliverables.

### Requirement 12: Boot-Stage Logging

**User Story:** As a developer, I want errors that happen before the Logger module is loaded to still be captured, so that boot-time failures are not invisible.

#### Acceptance Criteria

1. THE Boot_Buffer SHALL be installed as a tiny script in `index.html` or in `src/main.tsx` before any application module imports run.
2. THE Boot_Buffer SHALL expose a global `window.__observabilityBoot` object with the same six emit method names as the Logger.
3. WHEN the real Logger module finishes initialization, THE Logger SHALL drain `window.__observabilityBoot` in the order calls were made and SHALL set `window.__observabilityBoot` to a no-op shim.
4. THE Boot_Buffer SHALL hold no more than 64 records.
5. THE Boot_Buffer SHALL register a global `window.addEventListener('error', ...)` handler and a `window.addEventListener('unhandledrejection', ...)` handler that record into the buffer.

### Requirement 13: Migration of Existing `console.*` Calls

**User Story:** As a developer, I want every existing `console.*` callsite either replaced by the Logger or annotated with a justification, so that the Logger is the canonical channel and CI prevents regressions.

#### Acceptance Criteria

1. THE migration deliverable SHALL replace every `console.*` callsite in the directories `src/components`, `src/pages`, `src/hooks`, `src/lib`, and `src/contexts` with the equivalent Logger call.
2. WHERE a `console.*` callsite must remain (for example, the live-updates-delayed indicator in `src/components/event/RegistrationsSection.tsx` whose contract is that it emits exactly `console.warn('UI sync failure')`), THE callsite SHALL also emit an equivalent `logger.warn(...)` call AND SHALL retain a comment referencing the contract that mandates the literal `console.warn`.
3. THE ESLint configuration SHALL be updated to forbid `console.*` calls in `src/**/*.{ts,tsx}` via a `no-console` rule with an allowlist mechanism for the contractually-mandated callsites.
4. WHEN the lint rule is run on the codebase after migration, THE lint run SHALL report zero `no-console` violations (correctness property: no unaccounted console.* survives migration).
5. THE migration SHALL preserve the existing user-visible behavior of the live-updates-delayed indicator: the indicator SHALL still appear when the same condition holds, and the same `console.warn('UI sync failure')` SHALL still be emitted exactly once per occurrence.

### Requirement 14: Build-Time Wiring

**User Story:** As a developer, I want the build to inject the Build_Sha and to upload source maps to the Remote_Sink without me remembering, so that releases are always tagged correctly.

#### Acceptance Criteria

1. THE Vite configuration SHALL define `import.meta.env.VITE_BUILD_SHA` from the current git commit short sha resolved at build start time.
2. IF the git command to resolve the commit sha fails, THEN THE build SHALL set `VITE_BUILD_SHA` to the literal string `"unknown"` and SHALL NOT abort.
3. THE production Vite configuration SHALL set `build.sourcemap` to `'hidden'` so that map files are generated for the Remote_Sink uploader but the references are stripped from the public bundle.
4. THE production build pipeline SHALL invoke the Remote_Sink provider's source-map upload command, configured to upload the contents of the `dist/` map files and then delete them before the artifact is published.
5. WHERE the environment variable that gates source-map upload (e.g., `OBSERVABILITY_AUTH_TOKEN`) is missing, THE build SHALL skip the upload step and SHALL print a single warning, but SHALL NOT fail.

### Requirement 15: Documentation and Developer Onboarding

**User Story:** As a new developer joining the project, I want to know how to use the Logger correctly the first time, so that I do not reach for `console.*` out of habit.

#### Acceptance Criteria

1. THE repository SHALL include the file `docs/observability.md` describing the Logger API, the Log_Level guidance, the Redaction_Set, the Correlation_Id flow, and the privacy opt-out.
2. THE repository SHALL include a runnable example in `docs/observability.md` showing `logger.info`, `logger.error`, and an RPC call wrapped through the RPC_Wrapper.
3. THE README SHALL link to `docs/observability.md` from a new top-level "Observability" section.
4. THE repository SHALL include the file `docs/observability-privacy.md` describing what is and is not logged, the retention window, and the opt-out mechanism (referenced in Requirement 11.7).
