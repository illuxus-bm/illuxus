# Implementation Plan: Observability Foundation

## Overview

Convert the feature design into a series of prompts for a code-generation LLM that will implement each step with incremental progress. Make sure that each prompt builds on the previous prompts, and ends with wiring things together. There should be no hanging or orphaned code that isn't integrated into a previous step. Focus ONLY on tasks that involve writing, modifying, or testing code.

The plan is grouped into the six phases described in `design.md` "Rollout / Migration Plan" (Phase A through Phase F). Property-Based Tests are tagged `[PBT]` and each test file MUST start with the comment header `// Feature: observability-foundation, Property N: <property text>` and run with `fc.assert(prop, { numRuns: 100 })` minimum (Property 1 runs at 500 per the testing strategy).

Standard instruction for every `migrate-console-*` task:
> If the listed file does not currently contain a `console.*` call, mark the task complete with "no calls found" — do not add new logger calls speculatively.

Mark only truly optional sub-tasks with `*` (per user direction, only the perf bench and the post-build `*.map` shell smoke check are optional). All PBT tasks and example/unit tests are required.

## Tasks

- [ ] 1. Phase A — Logger landing
  - [x] 1.1 Install Remote_Sink dependencies
    - Run `bun add @sentry/browser` (production dep) and `bun add -d @sentry/vite-plugin` (dev dep)
    - Verify versions in `package.json` and `bun.lock`; do not bump unrelated deps
    - `fast-check` is already in `devDependencies` and MUST NOT be reinstalled
    - _Requirements: 8.1, 8.2, 14.4_

  - [x] 1.2 Scaffold `src/lib/observability/` module skeleton
    - Create `src/lib/observability/index.ts` with placeholder re-exports (filled in by 1.19 / 3.1)
    - Create `src/lib/observability/sinks/types.ts` defining `LogLevel`, `LEVEL_RANK`, `LogRecord`, `Sink`, `SupabaseRpcOpts` per "Public API surface" and "Sink interface"
    - Create empty stub files: `logger.ts`, `boot.ts`, `correlation.ts`, `redaction.ts`, `offline-queue.ts`, `rpc.ts`, `sinks/console.ts`, `sinks/remote.ts`
    - Create `src/lib/observability/boundaries/` directory (files added in Phase B)
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 1.3 Implement `redaction.ts`
    - Pure recursive `redact(value, depth = 0, seen = new WeakSet())` per "Redaction" section
    - Depth cap 6 returns `"[truncated]"`; cycles return `"[circular]"`
    - String regex set for email, JWT, E.164 phone (replace with `[redacted-email]` / `[redacted-token]` / `[redacted-phone]`)
    - Deny-list keys: case-insensitive substring match against `password|passwd|secret|token|access_token|refresh_token|authorization|cookie|p_token|p_password` → value becomes `"[redacted]"` regardless of value type
    - Error objects: preserve `name`, recurse on `message` and `stack` as strings
    - Export `safeRedact()` wrapper that catches throws and returns `{ redaction_error: true, message }`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 4.3_

  - [x] 1.4 [PBT] Property 1 — Redaction is total over the Redaction_Set
    - File: `src/lib/observability/__tests__/redaction.property.test.ts`
    - Header: `// Feature: observability-foundation, Property 1: Redaction is total over the Redaction_Set`
    - Use `fc.anything()` plus injection of email / JWT / E.164 phone fragments at random nested positions
    - Generate cyclic graphs via `fc.letrec`; include `Error` instances as a generator branch
    - Walk `redact(input)` exhaustively and assert: zero email matches, zero JWT matches, zero E.164 matches, and zero non-`[redacted]` values at deny-list key paths
    - Run with `fc.assert(prop, { numRuns: 500 })` (largest generator space)
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 8.7, 10.5, 11.2_

  - [x] 1.5 Example test — redaction-failure
    - File: `src/lib/observability/__tests__/redaction-failure.test.ts`
    - Forced redaction throw (e.g., `Object.defineProperty` getter that throws) → assert logger emits `warn 'redaction failed'` with `{ redaction_error: true }` and never throws
    - _Requirements: 4.3_

  - [x] 1.6 Implement `correlation.ts`
    - Module-scoped `currentCorrelationId: string | null`
    - `getCorrelationId()` and `runWithCorrelationId(id, fn)` per "Concurrency model"; restore in `try/finally`, handle Promise return via `.finally`
    - `installPromisePatch()` is idempotent and only triggers on first `runWithCorrelationId` call
    - Promise.then patch captures id at registration and restores during callback
    - _Requirements: 9.4, 9.5, 9.7_

  - [x] 1.7 Implement `boot.ts` (Boot_Buffer + global stub)
    - Bounded ring buffer capacity 64; FIFO eviction with single-shot overflow flag
    - Install `window.__observabilityBoot` exposing the six emit method names
    - Register `window.addEventListener('error', ...)` and `window.addEventListener('unhandledrejection', ...)` writing to the buffer
    - Expose `__drain__(logger)` that replays in order then replaces global with no-op shim
    - If overflow flag set, append a synthetic `warn 'boot buffer overflowed'` as the first replay record
    - _Requirements: 4.4, 4.5, 12.1, 12.2, 12.3, 12.4, 12.5_

  - [x] 1.8 Example test — boot-overflow
    - File: `src/lib/observability/__tests__/boot-overflow.test.ts`
    - Push 65 pre-init emits → assert exactly 64 records retained, oldest dropped, drain order preserved, overflow `warn` appended
    - _Requirements: 4.5, 12.4_

  - [~] 1.9 [PBT] Property 5 — Boot buffer replay preserves order
    - File: `src/lib/observability/__tests__/boot-replay.property.test.ts`
    - Header: `// Feature: observability-foundation, Property 5: Boot buffer replay preserves order`
    - Generator: `fc.array(emitTuple, { maxLength: 64 })` of `(level, message, fields)` tuples
    - Push all into boot stub before init, init real Logger with stub sink, drain, assert observed sink sequence equals input
    - `fc.assert(prop, { numRuns: 100 })`
    - _Requirements: 4.4, 12.3_

  - [x] 1.10 Implement `offline-queue.ts`
    - IndexedDB store `observability_queue` with auto-increment keys; localStorage fallback under key `observability:queue`
    - Operations: `enqueue(record)`, `peekBatch(n)` (eligible by `nextAttemptAt`), `ack(keys)`, `requeue(key)` with exponential backoff (1 s → 60 s cap)
    - Cap enforcement at 1000 entries on enqueue, evict oldest, emit single `warn 'offline queue overflow'` per eviction event
    - Token-bucket rate limit (≤ 20 dispatches per 5-second sliding window)
    - `pagehide` listener mirrors in-memory queue to localStorage as durability backup
    - All disk I/O is asynchronous (no sync IDB / localStorage on emit hot path)
    - _Requirements: 5.6, 5.7, 5.8, 5.9, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 1.11 Example test — offline-cap
    - File: `src/lib/observability/__tests__/offline-cap.test.ts`
    - Enqueue 1001 records → assert 1000 retained, oldest evicted, exactly one `warn 'offline queue overflow'` emitted
    - _Requirements: 5.8_

  - [x] 1.12 [PBT] Property 7 — Offline_Queue is durable and FIFO across tab close
    - File: `src/lib/observability/__tests__/offline-durability.property.test.ts`
    - Header: `// Feature: observability-foundation, Property 7: Offline_Queue is durable and FIFO across tab close`
    - Use `fake-indexeddb` (or in-memory shim per design); generate emit-while-offline sequences; simulate `pagehide`; reload into fresh module instance; assert recovered list equals enqueued in order
    - Verify successful delivery removes exactly the delivered record before the next dispatch
    - `fc.assert(prop, { numRuns: 100 })`
    - _Requirements: 5.6, 6.3, 6.4_

  - [x] 1.13 [PBT] Property 8 — Offline drain is rate-limited to ≤ 20 records per 5 s window
    - File: `src/lib/observability/__tests__/drain-rate.property.test.ts`
    - Header: `// Feature: observability-foundation, Property 8: Offline drain is rate-limited to ≤ 20 records per 5 s window`
    - Use `vi.useFakeTimers()`; generate arbitrary queue prefill sizes and timeline events (online toggle, ticks)
    - Slide a 5 000 ms window across the dispatch log; assert max 20 dispatches in any window
    - `fc.assert(prop, { numRuns: 100 })`
    - _Requirements: 5.7_

  - [x] 1.14 Implement `sinks/console.ts` (Console_Sink)
    - Map `LogLevel → console.method`: `trace→debug`, `debug→debug`, `info→info`, `warn→warn`, `error→error`, `fatal→error`
    - Honour production gate (severity ≥ warn only when `import.meta.env.PROD`)
    - Single-line format `[<level>] <message>` with structured fields as second arg
    - `flushBeacon` is no-op; `close` is no-op
    - _Requirements: 2.1, 2.2_

  - [x] 1.15 Implement `sinks/remote.ts` (Remote_Sink — Sentry adapter)
    - Construct `BrowserClient` only when `VITE_OBSERVABILITY_DSN` is non-empty (REQ 8.3)
    - `defaultIntegrations: false`, `sendDefaultPii: false`, `release = VITE_BUILD_SHA`, `beforeSend = redact`, `beforeSendTransaction: () => null`
    - Translate `LogRecord` to `captureException` (when `fields.error` is an Error) or `captureMessage(message, { level, contexts: { observability: fields } })`
    - Set scope to `{ user: { id: user_id } }` only — never email/name (REQ 8.10)
    - Batcher in front: max 20 records OR max 5 s age, whichever first
    - `flushBeacon` uses `navigator.sendBeacon` only; no `fetch` fallback
    - HTTP retry classification per design: 408/425/429/5xx → requeue; other 4xx → drop + `warn 'remote sink rejected record'`; 2xx → ack
    - When `getPrivacyOptOut()` is true, emit becomes no-op and pending in-memory batch is dropped
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 6.5, 6.6, 8.1, 8.3, 8.4, 8.5, 8.6, 8.7, 8.10, 11.4_

  - [x] 1.16 Example test — remote-sink-config
    - File: `src/lib/observability/__tests__/remote-sink-config.test.ts`
    - Mock `@sentry/browser` `BrowserClient`; assert SDK options include `sendDefaultPii: false`, `defaultIntegrations: false`, `release = VITE_BUILD_SHA`, `beforeSend` is a function, scope contains only `user.id`
    - _Requirements: 8.5, 8.6, 8.10_

  - [x] 1.17 Example test — dsn-empty-noop
    - File: `src/lib/observability/__tests__/dsn-empty-noop.test.ts`
    - With `VITE_OBSERVABILITY_DSN=''`, assert `BrowserClient` constructor is never called and `Sink.emit` is a no-op (no transport call)
    - _Requirements: 8.3_

  - [x] 1.18 Example test — non-retryable-drop
    - File: `src/lib/observability/__tests__/non-retryable-drop.test.ts`
    - Stub transport to return 401, 403, 404, 422 → assert record is dropped from offline queue and exactly one `warn 'remote sink rejected record'` is emitted with the status code
    - _Requirements: 6.6_

  - [x] 1.19 Implement `logger.ts` and wire `index.ts` public API
    - Logger class with `boundFields` and `child(boundFields)` factory; six emit methods (`trace`/`debug`/`info`/`warn`/`error`/`fatal`)
    - Per-emit flow per design: lazy init guard (`disabled` flag flips on first init throw), boot buffer fallback before init, build `LogRecord`, run `safeRedact`, fan-out to active sinks
    - Active sinks computed per-emit: production gate (REQ 2.2/2.3), DEV-only Remote_Sink suppression (REQ 2.4), `getPrivacyOptOut()` recheck (REQ 2.5, 11.4, 11.5)
    - Each sink emit wrapped in `try/catch` and rejected promises swallowed via `.catch(() => {})`
    - Register `pagehide` and `visibilitychange=hidden` listeners that call each sink's `flushBeacon`
    - `setPrivacyOptOut(value)` writes `localStorage['observability:opt-out']`, invalidates memoized opt-out cell, drops Remote_Sink in-memory batch and clears Offline_Queue (REQ 11.5, 11.6)
    - `getPrivacyOptOut()` reads env override + localStorage
    - User-id provider hook: pluggable, defaults to `null`; wired to Supabase auth in 3.4 follow-up (or here if simple)
    - Re-export `logger`, `runWithCorrelationId`, `getCorrelationId`, `setPrivacyOptOut`, `getPrivacyOptOut`, types from `index.ts`
    - On first init, call `window.__observabilityBoot.__drain__(logger)` and replace global with no-op shim
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5, 5.9, 11.4, 11.5, 11.6, 12.3_

  - [x] 1.20 Example test — logger-init
    - File: `src/lib/observability/__tests__/logger-init.test.ts`
    - Assert logger import shape (six methods, `child`); assert no network or storage I/O at module-load time (spy on `BrowserClient`, `indexedDB.open`, `localStorage.getItem`)
    - Force first-emit init throw → assert subsequent emits no-op without throwing
    - _Requirements: 1.1, 1.5, 1.6_

  - [~] 1.21 [PBT] Property 2 — The Logger never throws and never leaks rejections
    - File: `src/lib/observability/__tests__/logger-never-throws.property.test.ts`
    - Header: `// Feature: observability-foundation, Property 2: The Logger never throws and never leaks rejections`
    - Generators: arbitrary `(level, message, fields)` including malformed values, deeply nested cycles, oversized strings; sink behaviour matrix (sync throw / rejected promise / resolved promise)
    - Hook `process.on('unhandledRejection', ...)` (or `window` equivalent under jsdom) to detect leaks; assert zero unhandled rejections and zero throws to caller
    - `fc.assert(prop, { numRuns: 100 })`
    - _Requirements: 1.6, 4.1, 4.2_

  - [~] 1.22 [PBT] Property 4 — Privacy opt-out is unconditional across all severities
    - File: `src/lib/observability/__tests__/optout.property.test.ts`
    - Header: `// Feature: observability-foundation, Property 4: Privacy opt-out is unconditional across all severities`
    - With `getPrivacyOptOut()` forced to `true`, generate `fc.array` of arbitrary emit calls at every level → assert Remote_Sink `emit` invocation count is 0
    - `fc.assert(prop, { numRuns: 100 })`
    - _Requirements: 2.5, 11.4_

  - [~] 1.23 [PBT] Property 6 — Sinks only ever see redacted records
    - File: `src/lib/observability/__tests__/sink-receives-redacted.property.test.ts`
    - Header: `// Feature: observability-foundation, Property 6: Sinks only ever see redacted records`
    - Stub sink captures every record passed to `emit`; for each captured record, assert `redact(record.fields)` deep-equals `record.fields` (fixed-point property)
    - `fc.assert(prop, { numRuns: 100 })`
    - _Requirements: 2.7, 3.1_

  - [~] 1.24 Example test — sendBeacon-flush
    - File: `src/lib/observability/__tests__/sendBeacon-flush.test.ts`
    - Mock `navigator.sendBeacon`; dispatch `pagehide` and `visibilitychange=hidden` events; assert each sink's `flushBeacon` is called and only `sendBeacon` is used (no `fetch` fallback)
    - When `sendBeacon` returns `false`, assert the affected batch is dropped
    - _Requirements: 5.3, 5.4, 5.5_

  - [~] 1.25 Example test — optout-toggle
    - File: `src/lib/observability/__tests__/optout-toggle.test.ts`
    - Pre-fill in-memory Remote_Sink batch and Offline_Queue → call `setPrivacyOptOut(true)` → after one event-loop tick assert batch is empty and queue is cleared
    - Subsequent emits do not reach Remote_Sink
    - _Requirements: 11.5, 11.6_

  - [x] 1.26 Hoist boot stub install in `src/main.tsx`
    - Add `import './lib/observability/boot';` as line 1 of `src/main.tsx` (before any other imports)
    - Confirm Vite ships the boot stub before the rest of the app (verify via build output if needed)
    - _Requirements: 12.1, 12.2, 12.5_

  - [x] 1.27 Update `vite.config.ts`
    - Add `resolveBuildSha()` helper using `execSync('git rev-parse --short HEAD')`; fallback `'unknown'` on failure
    - Inject `import.meta.env.VITE_BUILD_SHA` via `define`
    - Set `build.sourcemap = mode === 'production' ? 'hidden' : true`
    - Conditionally include `sentryVitePlugin` only when `mode === 'production'` AND `process.env.OBSERVABILITY_AUTH_TOKEN` is set; otherwise print a single `console.warn('[observability] OBSERVABILITY_AUTH_TOKEN not set; skipping source-map upload')`
    - Plugin config: `sourcemaps.assets = './dist/**/*.{js,map}'`, `sourcemaps.filesToDeleteAfterUpload = './dist/**/*.map'`, `release.name = BUILD_SHA`
    - _Requirements: 8.8, 8.9, 14.1, 14.2, 14.3, 14.4, 14.5_

  - [x] 1.28 Update `eslint.config.js` — install `no-console` at `'warn'`
    - Add `'no-console': ['warn', { allow: [] }]` to the `src/**/*.{ts,tsx}` rule block
    - Will be promoted to `'error'` in Phase E (task 5.1)
    - _Requirements: 13.3_

  - [x] 1.29 Author docs files and link from README
    - Create `docs/observability.md` with sections: Why, Quick start (three examples), Log levels, Structured fields, Correlation ids, Privacy and opt-out, FAQ
    - Create `docs/observability-privacy.md` with: What we collect, What we do not collect, Retention (30 days), Opt-out, Where the data lives
    - Add an "Observability" top-level section to `README.md` linking to both docs
    - _Requirements: 11.7, 15.1, 15.2, 15.3, 15.4_

  - [x] 1.30 Add `.env.example` entries
    - `VITE_OBSERVABILITY_DSN=""` with comment
    - `VITE_OBSERVABILITY_OPT_OUT=""` with comment
    - Document CI-only `OBSERVABILITY_AUTH_TOKEN`, `OBSERVABILITY_ORG`, `OBSERVABILITY_PROJECT` in a comment block (these MUST NOT be Vite-prefixed)
    - _Requirements: 8.2, 11.5, 14.5_

  - [ ]* 1.31 Implement perf bench `emit-budget.bench.ts` (optional)
    - File: `src/lib/observability/__tests__/emit-budget.bench.ts`
    - Use `vitest bench` to emit a 16 KB-serialized record 1 000× and assert mean per-call wall time < 50 ms (CI-friendly threshold)
    - Document the 5 ms representative-laptop budget (REQ 5.1) in a comment for manual pre-release verification
    - _Requirements: 5.1_

  - [~] 1.32 Phase A checkpoint
    - Ensure all tests pass, ask the user if questions arise.

- [ ] 2. Phase B — Error boundaries
  - [x] 2.1 Implement `RootErrorBoundary.tsx`
    - File: `src/lib/observability/boundaries/RootErrorBoundary.tsx`
    - React class component with `getDerivedStateFromError`, `componentDidCatch(error, info)` emitting `logger.error('boundary caught', { boundary: 'root', route, error_name, error_message, component_stack, correlation_id: getCorrelationId() })`
    - Render `<FallbackView correlationId={...} onReset={() => this.setState({ error: null })} />` on caught state
    - _Requirements: 7.1, 7.3, 7.4_

  - [~] 2.2 Implement `RouteErrorBoundary.tsx`
    - File: `src/lib/observability/boundaries/RouteErrorBoundary.tsx`
    - Same shape as RootErrorBoundary but emits `boundary: 'route'`
    - _Requirements: 7.2, 7.3, 7.4_

  - [~] 2.3 Implement `FallbackView.tsx`
    - File: `src/lib/observability/boundaries/FallbackView.tsx`
    - Heading "Something went wrong"; brand-aligned body paragraph
    - Monospace block with active Correlation_Id or literal `"no reference"` when null
    - `Button` "Copy reference" (disabled when no id) using `navigator.clipboard.writeText`; falls back to `Range` / `Selection` when Clipboard API absent; `aria-label="Copy error reference"`; toast.success("Reference copied") on success
    - `Button` "Reload" → `window.location.reload()`
    - `Button asChild` with `<Link to="/">Go home</Link>` calling `props.onReset()` on click
    - Source MUST contain zero `console.*` calls
    - _Requirements: 7.5, 7.6, 7.7, 7.8, 7.9, 7.10_

  - [~] 2.4 Wire boundaries into `src/App.tsx` and migrate LazyRoute helper logging
    - Wrap entire tree under `<BrowserRouter>` with `<RootErrorBoundary>`
    - Wrap every top-level `<Route>` element with `<RouteErrorBoundary>`
    - Migrate the inline LazyRoute helper logging in `src/App.tsx`: `console.info('[LazyRoute] loading ${name}')` → `logger.debug('lazy-route loading', { name })` and `console.error('[LazyRoute] failed to load ${name}', …)` → `logger.error('lazy-route load failed', { name, error_name, error_message })`
    - Keep `LazyRouteBoundary` for chunk-load specialisation (migrated in 2.5)
    - If the listed file does not currently contain a `console.*` call, mark the migration portion of the task complete with "no calls found" — do not add new logger calls speculatively (the boundary wiring portion still proceeds)
    - _Requirements: 7.1, 7.2, 13.1_

  - [x] 2.5 Migrate `src/components/LazyRouteBoundary.tsx` from `console.error` to `logger.error`
    - Replace `console.error('[LazyRoute] render error', …)` → `logger.error('lazy-route render error', { error_name, error_message, stack, componentStack })`
    - Preserve existing user-visible behaviour (chunk-load fallback UI unchanged)
    - If the listed file does not currently contain a `console.*` call, mark the task complete with "no calls found" — do not add new logger calls speculatively
    - _Requirements: 13.1_

  - [~] 2.6 Example test — `RootErrorBoundary.test.tsx`
    - File: `src/lib/observability/boundaries/__tests__/RootErrorBoundary.test.tsx`
    - Render a child that throws; assert `<FallbackView />` is rendered and a `logger.error` call was emitted with `boundary: 'root'`, `route`, `error_name`, `error_message`, `component_stack`, `correlation_id`
    - _Requirements: 7.3, 7.4, 7.5_

  - [~] 2.7 Example test — `RouteErrorBoundary.test.tsx`
    - File: `src/lib/observability/boundaries/__tests__/RouteErrorBoundary.test.tsx`
    - Same shape as 2.6 but asserts `boundary: 'route'`
    - _Requirements: 7.3, 7.4, 7.5_

  - [~] 2.8 Example test — `FallbackView.test.tsx`
    - File: `src/lib/observability/boundaries/__tests__/FallbackView.test.tsx`
    - Render with and without a correlation id → assert "no reference" text, Copy button disabled state, Reload triggers `window.location.reload`, Go home navigates to `/` and calls `onReset`, Copy uses `navigator.clipboard.writeText` and falls back to Range/Selection when API absent
    - _Requirements: 7.5, 7.6, 7.7, 7.8, 7.10_

  - [~] 2.9 Example test — `no-console-in-fallback.test.ts`
    - File: `src/lib/observability/boundaries/__tests__/no-console-in-fallback.test.ts`
    - Read `FallbackView.tsx` source as text; assert no `console.` substring present
    - _Requirements: 7.9_

  - [~] 2.10 Phase B checkpoint
    - Ensure all tests pass, ask the user if questions arise.

- [ ] 3. Phase C — RPC wrapper rollout
  - [x] 3.1 Implement `rpc.ts` and export `supabaseRpc` from `index.ts`
    - File: `src/lib/observability/rpc.ts`
    - Internal `postRpc(name, params, { headers, signal })` helper: posts to `${SUPABASE_URL}/rest/v1/rpc/${name}`, reuses session JWT from `supabase.auth.getSession()` and `apikey` from existing client config, attaches `x-correlation-id` header
    - `supabaseRpc<T>(name, params?, opts?)` per "RPC wrapper" section: generates `crypto.randomUUID()` correlation id (or reuses `opts.correlationId`), runs body inside `runWithCorrelationId`, emits dev-only `debug 'rpc dispatch'`, emits `info|debug 'rpc resolved'` or `warn 'rpc rejected'` with `duration_ms` / `result_code`
    - Returns `{ data, error, correlationId }` matching `@supabase/supabase-js` shape plus correlation id
    - `src/integrations/supabase/client.ts` MUST remain untouched
    - Re-export from `src/lib/observability/index.ts`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.6, 9.7, 9.8, 10.1, 10.2, 10.3, 10.4, 10.5_

  - [~] 3.2 [PBT] Property 3 — Correlation context is causal and concurrency-isolated
    - File: `src/lib/observability/__tests__/correlation.property.test.ts`
    - Header: `// Feature: observability-foundation, Property 3: Correlation context is causal and concurrency-isolated`
    - Generator: `fc.array(rpcInvocation, { minLength: 2, maxLength: 8 })` of concurrent invocations with random await schedules and emit points
    - Stub transport captures `x-correlation-id` header per request
    - Assert: every emitted record's `correlation_id === c_i` for its invocation; no record carries `c_j` for `j ≠ i`; outbound header equals the active id
    - `fc.assert(prop, { numRuns: 100 })`
    - _Requirements: 9.2, 9.3, 9.4, 9.5, 9.7_

  - [~] 3.3 Example test — rpc-prefix-debug-prod
    - File: `src/lib/observability/__tests__/rpc-prefix-debug-prod.test.ts`
    - Shim `import.meta.env.PROD = true`, `import.meta.env.DEV = false`; invoke `supabaseRpc` against a stub transport; assert no pre-dispatch `debug 'rpc dispatch'` record is emitted
    - In DEV mode, assert the pre-dispatch `debug` record IS emitted with redacted `params`
    - _Requirements: 10.1, 10.4, 10.5_

  - [~] 3.4 Migrate existing `supabase.rpc(...)` call sites to `supabaseRpc(...)`
    - Grep for `supabase.rpc(` across `src/{components,pages,hooks,lib,contexts}` and rename each to `supabaseRpc` with the import `import { supabaseRpc } from '@/lib/observability'`
    - Preserve identical `data` / `error` handling at every call site (the wrapper return shape matches and adds `correlationId`)
    - Where a call site already shows a toast on failure, append the correlation id as `description: 'Reference: ${correlationId}'`
    - Existing RPCs (`set_attendance`, `bulk_set_attendance`, `self_check_in`, `toggle_attendance`, `undo_attendance`, …) require zero SQL changes
    - _Requirements: 9.1, 9.8_

  - [~] 3.5 Phase C checkpoint
    - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Phase D — `console.*` migration batches
  - [~] 4.1 migrate-console-`src/components/event/RegistrationsSection.tsx` (contractual — special)
    - Preserve the existing `console.warn('UI sync failure')` call verbatim with `// eslint-disable-next-line no-console -- contract: live-updates-delayed indicator`
    - Add an equivalent `logger.warn('ui sync failure', { reg_id })` immediately after the preserved `console.warn`
    - Migrate the other lines (`console.warn('self_check_in failed', …)` etc. at lines 381 / 386 / 419 / 424) to `logger.warn('self-check-in failed', { row, error_message })` etc.
    - User-visible behaviour (the indicator) MUST be unchanged; the literal `console.warn('UI sync failure')` is still emitted exactly once per off→on transition
    - If the listed file does not currently contain a `console.*` call, mark the task complete with "no calls found" — do not add new logger calls speculatively
    - _Requirements: 13.1, 13.2, 13.5_

  - [~] 4.2 [PBT] Property 9 — Live-updates indicator emits exactly one warn per occurrence
    - File: `src/components/event/__tests__/registrations-live-warn.property.test.ts`
    - Header: `// Feature: observability-foundation, Property 9: Live-updates indicator emits exactly one warn per occurrence`
    - Render `RegistrationsSection` with stubbed realtime channel; spy on `console.warn` and `logger.warn`
    - Generator: `fc.array(fc.boolean(), { maxLength: 50 })` of `liveLag` state values
    - Apply states sequentially via test renderer; count off→on transitions; assert `console.warn('UI sync failure')` and `logger.warn('ui sync failure', …)` call counts each equal the transition count
    - `fc.assert(prop, { numRuns: 100 })`
    - _Requirements: 13.2, 13.5_

  - [~] 4.3 migrate-console-`src/components/event/AddParticipantDialog.tsx`
    - Replace `console.warn('SignUp error:', …)` → `logger.warn('signup error', { error_message })`
    - If the listed file does not currently contain a `console.*` call, mark the task complete with "no calls found" — do not add new logger calls speculatively
    - _Requirements: 13.1_

  - [~] 4.4 migrate-console-`src/components/event/SpeakerManagement.tsx`
    - Replace `console.error/warn('[SpeakerManagement] …', …)` → `logger.error('speaker management failure', { kind, error_message })` (or `logger.warn(...)` matching original severity)
    - If the listed file does not currently contain a `console.*` call, mark the task complete with "no calls found" — do not add new logger calls speculatively
    - _Requirements: 13.1_

  - [~] 4.5 migrate-console-`src/components/event/SponsorManagement.tsx`
    - Replace `console.error/warn('[SponsorManagement] …', …)` → analogous `logger.error/warn('sponsor management failure', { kind, error_message })`
    - If the listed file does not currently contain a `console.*` call, mark the task complete with "no calls found" — do not add new logger calls speculatively
    - _Requirements: 13.1_

  - [~] 4.6 migrate-console-`src/components/event/attendance/EventAttendanceHistoryDialog.tsx`
    - Replace `console.warn('event audit fetch failed', …)` → `logger.warn('event audit fetch failed', { event_id, error_message })`
    - If the listed file does not currently contain a `console.*` call, mark the task complete with "no calls found" — do not add new logger calls speculatively
    - _Requirements: 13.1_

  - [~] 4.7 migrate-console-`src/components/event/attendance/AttendanceHistoryDialog.tsx`
    - Replace `console.warn('audit fetch failed', …)` → `logger.warn('audit fetch failed', { registration_id, error_message })`
    - If the listed file does not currently contain a `console.*` call, mark the task complete with "no calls found" — do not add new logger calls speculatively
    - _Requirements: 13.1_

  - [~] 4.8 migrate-console-`src/pages/NotFound.tsx`
    - Replace `console.error('404 …', pathname)` → `logger.warn('not-found route', { pathname })`
    - If the listed file does not currently contain a `console.*` call, mark the task complete with "no calls found" — do not add new logger calls speculatively
    - _Requirements: 13.1_

  - [~] 4.9 migrate-console-`src/pages/DiscoverFeed.tsx`
    - Replace `console.error('[DiscoverFeed] events query failed', error)` → `logger.error('discover events query failed', { error_message })`
    - If the listed file does not currently contain a `console.*` call, mark the task complete with "no calls found" — do not add new logger calls speculatively
    - _Requirements: 13.1_

  - [~] 4.10 migrate-console-`src/pages/dashboard/AttendeesPage.tsx`
    - Replace `console.error('Failed to fetch attendees:', message)` → `logger.error('fetch attendees failed', { error_message })`
    - If the listed file does not currently contain a `console.*` call, mark the task complete with "no calls found" — do not add new logger calls speculatively
    - _Requirements: 13.1_

  - [~] 4.11 migrate-console-`src/lib/event-routes.ts`
    - Replace `console.warn('[event-route-anomaly]', a)` → `logger.warn('event route anomaly', { anomaly: a })`
    - If the listed file does not currently contain a `console.*` call, mark the task complete with "no calls found" — do not add new logger calls speculatively
    - _Requirements: 13.1_

  - [~] 4.12 migrate-console-`src/hooks/usePortalAccess.ts`
    - Replace `console.warn('[usePortalAccess]', message)` → `logger.warn('portal access fetch failed', { error_message })`
    - If the listed file does not currently contain a `console.*` call, mark the task complete with "no calls found" — do not add new logger calls speculatively
    - _Requirements: 13.1_

  - [~] 4.13 migrate-console-`src/hooks/useApplications.ts`
    - Replace `console.warn('sponsor_members upsert:', message)` → `logger.warn('sponsor members upsert failed', { error_message })`
    - If the listed file does not currently contain a `console.*` call, mark the task complete with "no calls found" — do not add new logger calls speculatively
    - _Requirements: 13.1_

  - [~] 4.14 Phase D checkpoint
    - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Phase E — Lint flip
  - [~] 5.1 Promote `no-console` rule from `'warn'` to `'error'`
    - In `eslint.config.js`, change `'no-console': ['warn', { allow: [] }]` to `'no-console': ['error', { allow: [] }]` for the `src/**/*.{ts,tsx}` rule block
    - Run `bun run lint` (or `pnpm lint`); fix any remaining unaccounted callsites OR add an inline `eslint-disable-next-line` only when the callsite is contractually mandated (only the `RegistrationsSection.tsx` `console.warn('UI sync failure')` qualifies)
    - Final assertion: `pnpm lint` reports zero `no-console` violations
    - _Requirements: 13.3, 13.4_

  - [~] 5.2 Phase E checkpoint
    - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Phase F — Remote_Sink in production
  - [~] 6.1 Document production env wiring
    - In `docs/observability.md`, add a "Deploying to production" section that lists: setting `VITE_OBSERVABILITY_DSN` in the production build env, setting `OBSERVABILITY_AUTH_TOKEN` / `OBSERVABILITY_ORG` / `OBSERVABILITY_PROJECT` as CI-only secrets, and the canary-org rollout pattern from "Rollout / Migration Plan" Phase A
    - In `docs/observability-privacy.md`, confirm the 30-day retention is configured at the provider dashboard
    - _Requirements: 8.2, 11.1, 11.7, 14.5_

  - [~] 6.2 Example test — sentry-release-tag
    - File: `src/lib/observability/__tests__/sentry-release-tag.test.ts`
    - Mock the Sentry client; emit several records → assert each captured event has `release === VITE_BUILD_SHA`
    - _Requirements: 8.4, 14.1_

  - [~] 6.3 Build smoke test — no-source-maps-in-dist
    - File: `tests/build/no-source-maps-in-dist.test.ts`
    - Vitest test that runs (or asserts on the output of a prior) `bun run build` and walks `dist/` asserting zero `*.map` files remain
    - Skip on CI when `OBSERVABILITY_AUTH_TOKEN` is unset (the upload+delete step is the path that removes `.map` files)
    - _Requirements: 8.9, 14.4_

  - [ ]* 6.4 Add post-build `*.map` shell smoke check (optional)
    - Add a `postbuild` script (or CI step) running: `find dist -name '*.map' -type f | grep -q . && echo "::error::Source maps leaked into dist/" && exit 1 || true`
    - _Requirements: 8.9, 14.4_

  - [~] 6.5 Final checkpoint
    - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped (per direction, only the perf bench and the post-build `*.map` shell smoke check are optional)
- All PBT and example/unit tests are required
- Each PBT runs with `fc.assert(prop, { numRuns: 100 })` minimum (Property 1 / redaction runs 500)
- Every PBT test file starts with `// Feature: observability-foundation, Property N: <text>`
- Every `migrate-console-*` task carries the standard "no calls found" early-exit instruction
- Phase A-F structure mirrors the design's Rollout / Migration Plan
- The `console.warn('UI sync failure')` contract in `RegistrationsSection.tsx` is preserved verbatim and lands in the same task as the equivalent `logger.warn` to keep behaviour intact at every step
- `src/integrations/supabase/client.ts` is intentionally untouched — the wrapper sits above the existing client
- Existing RPCs require zero SQL changes; only the call-site rename in 3.4 is needed

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.27", "1.28", "1.29", "1.30"] },
    { "id": 2, "tasks": ["1.3", "1.6", "1.7", "1.10", "1.14"] },
    { "id": 3, "tasks": ["1.4", "1.12", "1.13", "1.15", "1.26"] },
    { "id": 4, "tasks": ["1.19"] },
    { "id": 5, "tasks": ["1.16", "1.17", "1.18", "2.5", "3.1"] },
    { "id": 6, "tasks": ["1.5", "1.8", "1.11", "1.20", "2.1"] },
    { "id": 7, "tasks": ["1.9", "1.24", "1.25", "2.2", "2.3"] },
    { "id": 8, "tasks": ["1.21", "1.22", "1.23", "3.2", "3.3"] },
    { "id": 9, "tasks": ["2.4", "2.6", "2.7", "2.8", "2.9"] },
    { "id": 10, "tasks": ["1.31", "3.4"] },
    { "id": 11, "tasks": ["4.1", "4.3", "4.4", "4.5", "4.6"] },
    { "id": 12, "tasks": ["4.2", "4.7", "4.8", "4.9", "4.10"] },
    { "id": 13, "tasks": ["4.11", "4.12", "4.13"] },
    { "id": 14, "tasks": ["5.1"] },
    { "id": 15, "tasks": ["6.1", "6.2", "6.3", "6.4"] }
  ]
}
```
