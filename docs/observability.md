# Observability

This document is the developer onboarding guide for the observability layer that lives at
`src/lib/observability/`. It covers the Logger API, log-level guidance, structured field
conventions, the correlation-id flow, and how to opt out of remote logging.

If you're looking for the privacy and retention policy, see
[`docs/observability-privacy.md`](./observability-privacy.md).

## Why

The observability layer exists so that every log line in the app:

- has the same shape, regardless of where it was emitted from
- has its PII scrubbed before it leaves the browser
- carries a correlation id that links a user-visible error to the underlying RPC
- is gated by user privacy preferences and a server-side retention window
- never throws — a logging bug never crashes a user-facing flow

`console.*` cannot give us those guarantees. After Phase E of the rollout the lint rule
`no-console` is set to `error` for `src/**/*.{ts,tsx}`, so reaching for `console.log` will
fail CI. Use `logger` instead.

## Quick start

The single import you need:

```ts
import { logger, supabaseRpc } from '@/lib/observability';
```

### 1. Log a user action

```ts
logger.info('clicked rsvp', { event_id });
```

`info` is the right level for "something normal happened that we want to be able to count
later". It is recorded by the console sink in development and dropped in production (only
`warn` and above leave the device in production — see [Log levels](#log-levels)).

### 2. Log a failure

```ts
try {
  await doTheThing();
} catch (err) {
  logger.error('rsvp failed', {
    event_id,
    error_message: err instanceof Error ? err.message : String(err),
  });
}
```

`error` is for "a user-visible operation failed and we want this in the inbox". Pass the
`Error` itself as `error: err` if you want the stack to be captured — the redactor
preserves the stack but scrubs PII inside it.

### 3. Call an RPC through the wrapper

```ts
const { data, error, correlationId } = await supabaseRpc('set_attendance', { p_reg_id });

if (error) {
  toast.error('Could not check in', {
    description: `Reference: ${correlationId}`,
  });
  return;
}
```

`supabaseRpc` is a drop-in for `supabase.rpc` with three differences:

- It generates a UUIDv4 `correlationId` and threads it through every log emitted
  inside the call's promise chain.
- It sends that id as an `x-correlation-id` HTTP header so the server log lines and the
  browser log lines can be joined.
- It returns `{ data, error, correlationId }` so a toast can surface the id to the user.

The `data` and `error` shapes are identical to `supabase.rpc`'s return value — the
migration from `supabase.rpc` to `supabaseRpc` is a mechanical rename at every call
site. **`src/integrations/supabase/client.ts` is not touched** by the migration; the
wrapper sits on top of the existing client.

## Log levels

| Level   | Use it when…                                                                                | Console (dev) | Console (prod) | Remote sink |
| ------- | ------------------------------------------------------------------------------------------- | :-----------: | :------------: | :---------: |
| `trace` | Hot loop diagnostics. Almost never used in checked-in code.                                  |       ✓       |        ✗       |      ✗      |
| `debug` | Local-only detail useful when you have a bug in front of you (e.g. RPC params).              |       ✓       |        ✗       |      ✗      |
| `info`  | A normal user action or state transition you want to count.                                  |       ✓       |        ✗       |      ✗      |
| `warn`  | Something is wrong but the app recovered. Includes "we retried" / "we fell back".            |       ✓       |        ✓       |      ✓      |
| `error` | A user-visible operation failed. This goes into the on-call inbox.                           |       ✓       |        ✓       |      ✓      |
| `fatal` | The app cannot continue (caught at the root error boundary).                                 |       ✓       |        ✓       |      ✓      |

Rules of thumb:

- If a human needs to look at it, it's `warn` or above.
- If you're tempted to use `error` to draw attention to a non-error, use `warn`.
- The remote sink only sees `warn`/`error`/`fatal`. Lower levels are local-only.

## Structured fields

The Logger's second argument is a flat object. Prefer named, snake_case fields over
interpolating values into the message string — interpolated values are harder to query
and are still scrubbed by the redactor, but indexed fields are cheap.

### Recommended field names

Use these names where applicable so dashboards and alert queries are uniform across the
codebase:

| Field            | Type     | Meaning                                                       |
| ---------------- | -------- | ------------------------------------------------------------- |
| `event_id`       | `string` | Event UUID                                                    |
| `org_id`         | `string` | Organisation UUID                                              |
| `reg_id`         | `string` | Registration UUID                                             |
| `user_id`        | `string` | Auth user UUID (also set on the Sentry scope automatically)  |
| `route`          | `string` | `window.location.pathname` (set automatically — don't pass)   |
| `error_message`  | `string` | `err.message` for caught errors                                |
| `error_name`     | `string` | `err.name`                                                     |
| `duration_ms`    | `number` | Wall time of an operation, rounded to integer                  |
| `result_code`    | `string` | HTTP status or RPC code, as a string for consistent grouping  |
| `rpc_name`       | `string` | The RPC the wrapper just called (set automatically)            |
| `correlation_id` | `string` | Set automatically by the Logger from `getCorrelationId()`      |
| `build_sha`      | `string` | Set automatically from `import.meta.env.VITE_BUILD_SHA`        |
| `boundary`       | `string` | `'root'` or `'route'` — set by the error boundaries            |

### Deny-list keys (avoid these field names)

Fields whose name (case-insensitive substring match) contains any of the following are
replaced wholesale with `"[redacted]"` before the record leaves the Logger, regardless of
the value's type:

```
password    passwd    secret    token    access_token    refresh_token
authorization    cookie    p_token    p_password
```

If you find yourself wanting to log one of these, you don't — log a derived value
instead (a length, a hash prefix, an "is set" boolean).

### Free-text values are also scrubbed

Anywhere a string appears in the record (including the `message` argument and the
`stack` of an `Error`), substrings that match an email, a JWT, or an E.164-formatted
phone number are replaced with `[redacted-email]`, `[redacted-token]`, or
`[redacted-phone]`. The redactor walks up to depth 6 and is cycle-safe — circular
graphs are replaced with `[circular]` and depths beyond 6 are replaced with
`[truncated]`.

### Bound fields

If you're emitting many records that share a field, derive a child logger:

```ts
const log = logger.child({ event_id, org_id });
log.info('rsvp open');
log.warn('rsvp slow', { duration_ms: 1840 });
```

Per-call fields shallow-merge over bound fields.

## Correlation ids

A correlation id is a UUIDv4 that flows from the originating user action through the
RPC and any logs emitted on its promise chain. It's how you join "the user saw a red
toast" with "the server returned 409".

You almost never need to create one yourself. `supabaseRpc` does it for you, threads it
through `runWithCorrelationId`, and returns it on the result so you can stamp it into a
toast description:

```ts
const { error, correlationId } = await supabaseRpc('toggle_attendance', { p_reg_id });
if (error) {
  toast.error('Could not toggle attendance', {
    description: `Reference: ${correlationId}`,
  });
}
```

Inside any code that runs while a correlation id is active you can read it:

```ts
import { getCorrelationId } from '@/lib/observability';

logger.warn('parsing weird response', { correlation_id: getCorrelationId() });
```

The Logger already attaches the correlation id automatically, so you only need to read
it manually when surfacing it to the UI (e.g. in the error boundary's "Copy reference"
button).

If you're orchestrating something outside an RPC and want the same flow, wrap the
operation in `runWithCorrelationId`:

```ts
import { runWithCorrelationId } from '@/lib/observability';

await runWithCorrelationId(crypto.randomUUID(), async () => {
  // every logger.* call inside this fn (including across awaits) carries the id
});
```

## Privacy and opt-out

The Logger respects two opt-out signals:

- **Build-time**: `VITE_OBSERVABILITY_OPT_OUT=1` in `.env` disables the Remote Sink for
  the entire build. Useful for forks that don't want to point at our provider.
- **Runtime**: `localStorage.getItem('observability:opt-out') === '1'` disables the
  Remote Sink for the active session. Toggle with `setPrivacyOptOut(true | false)`:

  ```ts
  import { setPrivacyOptOut } from '@/lib/observability';

  setPrivacyOptOut(true);  // also drops in-memory batches and clears the offline queue
  ```

When either signal is truthy:

- The Remote Sink does not receive any record, **including `error` and `fatal`**.
- Any pending in-memory batch is dropped within one event-loop tick.
- The offline queue is cleared.
- The Console Sink continues to behave normally — local debugging is unaffected.

For the full list of what is and is not collected, the retention window, and how to
request deletion, see [`docs/observability-privacy.md`](./observability-privacy.md).

## FAQ

### Why is my email redacted?

The redactor scrubs anything that matches an email-shaped substring before the record
leaves the Logger. This applies to messages, fields, the bound fields of a child
logger, and even the contents of an `Error.stack`. The replacement is the literal
string `[redacted-email]` — if you see that in a log line, that's the redactor doing
its job.

If you legitimately need to log "this user logged in", log the `user_id` (a UUID) and
not the email. The Sentry scope is configured with `sendDefaultPii: false` and only
ever sees `user_id` — never `email` or `name` — even if you accidentally pass them.

### What happens offline?

When the browser reports `navigator.onLine === false`, or when a remote dispatch
fails with a retryable status (network error, 408, 425, 429, 5xx), the record is
written to an IndexedDB-backed FIFO queue (with a localStorage fallback for browsers
without IndexedDB). On the next `online` event the queue drains, rate-limited to ≤20
records per 5-second sliding window with exponential backoff per entry.

The queue is capped at 1000 records; older records are evicted first and a single
`warn 'offline queue overflow'` is emitted per eviction event. The queue survives a
tab close — at `pagehide` we mirror the in-memory queue to localStorage as a backup,
and the next page load reconciles whatever made it to durable storage.

Console Sink emits are immediate — they don't go through the queue. So in dev you'll
always see your `console`-equivalent line right away, even when offline.

### How do I add a new sink?

A sink is anything that implements the `Sink` interface in
`src/lib/observability/sinks/types.ts`:

```ts
interface Sink {
  readonly name: string;
  emit(record: LogRecord): void | Promise<void>;
  flushBeacon?(): void;        // synchronous, called from pagehide
  close?(): Promise<void>;     // cooperative shutdown (tests)
}
```

Three rules the Logger relies on:

1. `emit` **must never throw**. A rejected Promise is fine — the Logger swallows it.
2. `flushBeacon` is the only hook called during `pagehide` / `visibilitychange=hidden`.
   It must be synchronous and should use `navigator.sendBeacon` (no `fetch` fallback).
3. The records you receive are already redacted. Don't redact them again, but do
   treat the contents as untrusted (e.g. don't `eval` strings out of `fields`).

Add your sink to the list in `logger.ts` and it will participate in fan-out. The level
gate (`activeSinks(level)`) and the privacy opt-out are enforced before your sink is
called, so you don't need to recheck either.
