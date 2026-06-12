// Remote_Sink — fans observability records to a Sentry-compatible
// backend (`@sentry/browser`'s low-level `BrowserClient`).
//
// Behaviour (design.md "Remote_Sink (sinks/remote.ts)" and requirements
// 5.2-5.6, 6.5, 6.6, 8.1, 8.3-8.7, 8.10, 11.4):
//
//   - DSN empty / undefined → the sink is a no-op. `BrowserClient` is
//     never constructed (REQ 8.3). This is also the case in vitest /
//     dev runs where `VITE_OBSERVABILITY_DSN` is intentionally unset.
//   - `BrowserClient` SDK options (REQ 8.4-8.7): `release` from
//     `VITE_BUILD_SHA`, `sendDefaultPii: false`, `defaultIntegrations:
//     false`, custom `transport` and `stackParser`, `beforeSend` runs
//     `safeRedact()`, and transactions are dropped via
//     `beforeSendTransaction: () => null`.
//   - User payload contains only `{ id: user_id }` — never email or
//     name (REQ 8.10).
//   - In-memory batcher in front of the client (REQ 5.2): flushes when
//     20 records have accumulated OR when the oldest record is 5 s old,
//     whichever fires first.
//   - Offline routing (REQ 5.6): if `navigator.onLine === false` and an
//     OfflineQueue is wired in, `emit` persists to the queue instead of
//     batching. On the next `online` event the sink drains the queue.
//   - `flushBeacon()` (REQ 5.3-5.5): only `navigator.sendBeacon` is
//     used; if it's unavailable or returns false the pending batch is
//     dropped. No fetch fallback at end-of-life.
//   - Privacy opt-out (REQ 11.4): `getPrivacyOptOut()` is rechecked on
//     every emit; when truthy the in-memory batch is dropped and the
//     emit becomes a no-op. The Logger separately clears the
//     OfflineQueue when the user toggles opt-out (handled in
//     `logger.ts`).
//   - HTTP retry classification (REQ 6.5/6.6) — applied during offline
//     queue drain via a wrapped fetch transport that surfaces status
//     codes back to the sink:
//       network error / 408 / 425 / 429 / 5xx → requeue with
//         exponential backoff via `OfflineQueue.requeue`
//       other 4xx → drop the record (ack) and emit a single
//         `warn 'remote sink rejected record'` via the `onError`
//         callback
//       2xx → ack
//
// Dependency injection via `opts` keeps this file unit-testable: tests
// can supply a stub `client`, a controlled `OfflineQueue`, and a
// callback to capture the `onError` warn — without booting Sentry.

import {
  BrowserClient,
  defaultStackParser,
  makeFetchTransport,
} from '@sentry/browser';
import type {
  Envelope,
  Transport,
  TransportMakeRequestResponse,
  BaseTransportOptions,
} from '@sentry/core';

import { safeRedact } from '../redaction';
import type { OfflineQueue, OfflineQueueEntry } from '../offline-queue';
import type { LogLevel, LogRecord, Sink } from './types';

// ---------------------------------------------------------------------------
// Public option types
// ---------------------------------------------------------------------------

/**
 * Subset of `BrowserClient` the sink relies on. Kept narrow so tests can
 * inject a hand-written stub without modelling the entire SDK surface.
 */
export interface SinkClient {
  captureException(exception: unknown, hint?: unknown, scope?: unknown): string;
  captureMessage(
    message: string,
    level?: unknown,
    hint?: unknown,
    scope?: unknown,
  ): string;
  flush?(timeout?: number): PromiseLike<boolean>;
}

/**
 * Callback used by the sink to surface internal warnings (e.g. a rejected
 * record from the remote backend, REQ 6.6). Wired by `logger.ts` to
 * `logger.warn(...)`. Optional in tests.
 */
export type RemoteSinkErrorCallback = (
  message: string,
  fields: Record<string, unknown>,
) => void;

export interface CreateRemoteSinkOptions {
  /** DSN; defaults to `import.meta.env.VITE_OBSERVABILITY_DSN`. */
  dsn?: string;
  /** Offline queue used when `navigator.onLine === false`. */
  queue?: OfflineQueue;
  /** Privacy opt-out callback rechecked on every emit (REQ 11.4). */
  getPrivacyOptOut?: () => boolean;
  /** Pre-built client (test injection). When set, DSN is not used to construct one. */
  client?: SinkClient;
  /** Surfaced for `warn 'remote sink rejected record'` and similar (REQ 6.6). */
  onError?: RemoteSinkErrorCallback;
  /**
   * Test-only hook. When present, `drainOfflineQueue` dispatches each
   * record through `client.captureXxx` (so stub clients can record
   * calls) and then awaits this hook for the `SendStatus` used by the
   * retry classifier — bypassing the wrapped-transport observer dance
   * that requires a real `BrowserClient`. Production builds never set
   * this; it exists so unit tests can exercise the REQ 6.5 / 6.6 retry
   * classification deterministically.
   *
   * @internal
   */
  _dispatchHook?: (record: LogRecord) => Promise<SendStatus>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_BATCH = 20;
const MAX_AGE_MS = 5_000;

/**
 * Map our LogLevel onto Sentry's severity strings. Sentry uses
 * `'warning'` (not `'warn'`) and lacks a `'trace'` level — we coalesce
 * `trace` and `debug` to Sentry's `debug`.
 */
const LEVEL_TO_SENTRY: Record<LogLevel, string> = {
  trace: 'debug',
  debug: 'debug',
  info: 'info',
  warn: 'warning',
  error: 'error',
  fatal: 'fatal',
};

// ---------------------------------------------------------------------------
// Env helpers
// ---------------------------------------------------------------------------

function readEnv(name: string): string | undefined {
  // `import.meta.env` is replaced at build time by Vite; wrapped in
  // try/catch so this module is safe to import in environments where
  // the constant is unset (Node test runs, plain script tags, etc.).
  try {
    const env = (import.meta as { env?: Record<string, unknown> }).env;
    if (!env) return undefined;
    const v = env[name];
    return typeof v === 'string' ? v : undefined;
  } catch {
    return undefined;
  }
}

function getOnlineState(): boolean {
  try {
    if (typeof navigator === 'undefined') return true;
    // `navigator.onLine === false` is the only signal we treat as
    // offline; any other value (true, undefined) is treated as online,
    // matching REQ 5.6 wording.
    return navigator.onLine !== false;
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------------------
// Status-capturing transport
// ---------------------------------------------------------------------------

/**
 * Result observed by the sink for a single envelope sent through the
 * wrapped transport. `code === undefined && networkError === true`
 * indicates a transport-level failure (no HTTP response).
 */
export interface SendStatus {
  code?: number;
  networkError: boolean;
}

type StatusObserver = (status: SendStatus) => void;

/**
 * Wrap `makeFetchTransport` so the sink can observe per-send HTTP
 * statuses for offline-queue retry classification (REQ 6.5, 6.6).
 *
 * The wrapper keeps a FIFO queue of observers. Each `send()` consumes
 * the next observer (if any) and notifies it with the resolved status
 * code or a network-error sentinel. Observers are pushed by the drain
 * loop *immediately before* it calls `client.captureXxx`, and the drain
 * loop processes records sequentially so the observer order matches
 * the transport's send order.
 *
 * When no observer is queued (e.g. during normal in-memory batch
 * flushes that don't need per-record status awareness), the wrapper is
 * transparent.
 */
function makeCapturingTransport(observers: StatusObserver[]) {
  return (options: BaseTransportOptions): Transport => {
    const inner = makeFetchTransport(options);
    return {
      send(envelope: Envelope): PromiseLike<TransportMakeRequestResponse> {
        const observer = observers.shift();
        return Promise.resolve(inner.send(envelope)).then(
          (res) => {
            if (observer) {
              observer({ code: res?.statusCode, networkError: false });
            }
            return res;
          },
          (err: unknown) => {
            if (observer) observer({ code: undefined, networkError: true });
            throw err;
          },
        );
      },
      flush(timeout?: number): PromiseLike<boolean> {
        return inner.flush(timeout);
      },
    };
  };
}

// ---------------------------------------------------------------------------
// Retry classification
// ---------------------------------------------------------------------------

/**
 * Classify an HTTP response (or absence thereof) per REQ 6.5 / 6.6.
 *
 *   network error / 408 / 425 / 429 / 5xx → 'retry'
 *   any other 4xx                          → 'drop'
 *   2xx                                    → 'ack'
 *   anything else (e.g. 3xx, 1xx, unknown) → 'ack' (best effort —
 *     Sentry's SDK never returns these in practice)
 */
function classifyStatus(status: SendStatus): 'retry' | 'drop' | 'ack' {
  if (status.networkError) return 'retry';
  const code = status.code ?? 0;
  if (code === 408 || code === 425 || code === 429) return 'retry';
  if (code >= 500 && code < 600) return 'retry';
  if (code >= 400 && code < 500) return 'drop';
  return 'ack';
}

/**
 * Test-path counterpart to the wrapped-transport observer dance. The
 * hook receives the record (after we run it through `dispatchRecord` so
 * stub clients can record the capture call) and resolves to a
 * `SendStatus` that the retry classifier consumes. Defensive try/catch
 * mirrors the production path: if the SDK or hook throws, we treat the
 * dispatch as a network error so the record is requeued.
 */
async function acquireStatusViaHook(
  c: SinkClient,
  record: LogRecord,
  hook: (record: LogRecord) => Promise<SendStatus>,
): Promise<SendStatus> {
  try {
    dispatchRecord(c, record);
  } catch {
    return { code: undefined, networkError: true };
  }
  try {
    return await hook(record);
  } catch {
    return { code: undefined, networkError: true };
  }
}

// ---------------------------------------------------------------------------
// LogRecord → Sentry capture
// ---------------------------------------------------------------------------

/**
 * Build the Sentry `captureContext` payload from a `LogRecord`. Only
 * `user.id` is set — never email / name (REQ 8.10). Tags are kept to
 * cardinality-bounded fields (`route`, `correlation_id`); the rest of
 * the record lives under `contexts.observability` so it remains
 * inspectable but not faceted.
 */
function buildCaptureContext(
  record: LogRecord,
): Record<string, unknown> {
  return {
    level: LEVEL_TO_SENTRY[record.level],
    tags: {
      route: record.route,
      correlation_id: record.correlation_id ?? '',
    },
    contexts: {
      observability: {
        ...record.fields,
        timestamp: record.timestamp,
        build_sha: record.build_sha,
      },
    },
    user: record.user_id ? { id: record.user_id } : undefined,
  };
}

/**
 * Dispatch one record through the SDK client. If `fields.error` is an
 * `Error` instance the call routes to `captureException`; otherwise to
 * `captureMessage` with the mapped severity.
 */
function dispatchRecord(client: SinkClient, record: LogRecord): void {
  const captureContext = buildCaptureContext(record);
  const errField = record.fields?.error;
  if (errField instanceof Error) {
    client.captureException(errField, { captureContext });
    return;
  }
  client.captureMessage(
    record.message,
    LEVEL_TO_SENTRY[record.level],
    { captureContext },
  );
}

// ---------------------------------------------------------------------------
// createRemoteSink — factory
// ---------------------------------------------------------------------------

/**
 * Construct a Remote_Sink. Pass `opts.client` to inject a stub for
 * tests; pass `opts.queue` and `opts.getPrivacyOptOut` to wire in the
 * real OfflineQueue and Logger-managed opt-out cell.
 *
 * The factory does not perform network or storage I/O — the
 * `BrowserClient` is constructed lazily on first emit (and only when
 * the DSN is non-empty per REQ 8.3).
 */
export function createRemoteSink(
  opts: CreateRemoteSinkOptions = {},
): Sink {
  const dsn = opts.dsn ?? readEnv('VITE_OBSERVABILITY_DSN') ?? '';
  const release = readEnv('VITE_BUILD_SHA') ?? 'unknown';

  // `noop` is true when we have neither a DSN nor an injected client —
  // this is the common "DSN unset / dev build" case (REQ 8.3).
  const noop = !dsn && !opts.client;

  const queue = opts.queue;
  const getOptOut = opts.getPrivacyOptOut;
  const onError = opts.onError;
  const dispatchHook = opts._dispatchHook;

  // Status observers consumed by the wrapped transport during drain.
  const statusObservers: StatusObserver[] = [];

  // Lazy client. `null` until first emit; once constructed (or
  // recognised as an injected stub) it stays for the lifetime of the
  // sink. `clientFailed` flips on a one-time construction throw and
  // turns subsequent emits into no-ops to honour REQ 1.6 / 4.1.
  let client: SinkClient | null = opts.client ?? null;
  let clientInitialized = !!opts.client;
  let clientFailed = false;

  function ensureClient(): SinkClient | null {
    if (client) return client;
    if (clientInitialized || clientFailed || noop) return null;
    clientInitialized = true;
    try {
      // `BrowserClient`'s constructor takes the resolved
      // `BrowserClientOptions`, which requires both `integrations` and
      // `defaultIntegrations` to be set explicitly when bypassing
      // `Sentry.init()`. We want zero default integrations (REQ 8.6),
      // so we set both. The cast is necessary because the public
      // option types lift `integrations` into a required field.
      const browserOpts = {
        dsn,
        release,
        sendDefaultPii: false,
        defaultIntegrations: false as const,
        integrations: [],
        transport: makeCapturingTransport(statusObservers),
        stackParser: defaultStackParser,
        beforeSend: (event: unknown) => safeRedact(event) as never,
        beforeSendTransaction: () => null,
      };
      // `BrowserClient` is a class; its options shape evolves with the
      // SDK. We construct the well-known fields above and let the
      // assertion bridge the structural mismatch at the boundary.
      client = new BrowserClient(
        browserOpts as unknown as ConstructorParameters<typeof BrowserClient>[0],
      ) as unknown as SinkClient;
      return client;
    } catch {
      clientFailed = true;
      client = null;
      return null;
    }
  }

  // ---- in-memory batcher --------------------------------------------------

  let batch: LogRecord[] = [];
  let batchTimer: ReturnType<typeof setTimeout> | null = null;

  function clearBatchTimer(): void {
    if (batchTimer !== null) {
      try {
        clearTimeout(batchTimer);
      } catch {
        /* ignore */
      }
      batchTimer = null;
    }
  }

  function scheduleBatchFlush(): void {
    if (batchTimer !== null) return;
    try {
      batchTimer = setTimeout(() => {
        batchTimer = null;
        void flushBatch();
      }, MAX_AGE_MS);
    } catch {
      /* setTimeout unavailable — flush will still happen on next emit-driven trigger */
    }
  }

  function flushBatch(): void {
    if (batch.length === 0) return;
    // Privacy: if the user toggled opt-out between batch-fill and
    // flush time, drop the batch (REQ 11.4 / 11.6).
    if (isOptedOut()) {
      batch = [];
      clearBatchTimer();
      return;
    }
    const c = ensureClient();
    if (!c) {
      batch = [];
      clearBatchTimer();
      return;
    }
    const drain = batch;
    batch = [];
    clearBatchTimer();
    for (const record of drain) {
      try {
        dispatchRecord(c, record);
      } catch {
        /* REQ 4.1 — sinks must never throw */
      }
    }
  }

  function isOptedOut(): boolean {
    if (!getOptOut) return false;
    try {
      return getOptOut() === true;
    } catch {
      return false;
    }
  }

  // ---- offline drain ------------------------------------------------------

  let draining = false;

  /**
   * Drain a single batch from the OfflineQueue, applying the retry
   * classification per REQ 6.5 / 6.6. Designed to be called on the
   * `online` event and re-armed after each successful pass while the
   * queue still has eligible entries and tokens are available.
   */
  async function drainOfflineQueue(): Promise<void> {
    if (!queue || draining) return;
    if (isOptedOut()) return;
    if (!getOnlineState()) return;
    const c = ensureClient();
    if (!c) return;

    draining = true;
    try {
      // `peekBatch` honours the queue's own ≤20/5 s token bucket.
      const entries: OfflineQueueEntry[] = await queue.peekBatch(MAX_BATCH);
      if (entries.length === 0) return;

      for (const entry of entries) {
        if (isOptedOut()) break;

        const status: SendStatus = dispatchHook
          ? await acquireStatusViaHook(c, entry.record, dispatchHook)
          : await new Promise<SendStatus>((resolve) => {
              // Push observer first so the wrapped transport's FIFO queue
              // matches the order in which we hand records to the SDK.
              statusObservers.push(resolve);
              try {
                dispatchRecord(c, entry.record);
              } catch {
                // The SDK threw before reaching the transport — pop our
                // observer and treat as a network error so the record is
                // requeued for a later attempt.
                const idx = statusObservers.indexOf(resolve);
                if (idx >= 0) statusObservers.splice(idx, 1);
                resolve({ code: undefined, networkError: true });
                return;
              }
              // Safety net: if the transport never fires (unusual), give up
              // after a generous timeout and treat as network error.
              setTimeout(() => {
                const idx = statusObservers.indexOf(resolve);
                if (idx >= 0) {
                  statusObservers.splice(idx, 1);
                  resolve({ code: undefined, networkError: true });
                }
              }, 30_000);
            });

        const verdict = classifyStatus(status);
        try {
          if (verdict === 'ack' || verdict === 'drop') {
            await queue.ack([entry.key]);
            if (verdict === 'drop' && onError) {
              try {
                onError('remote sink rejected record', {
                  status: status.code,
                  rpc_name: undefined,
                });
              } catch {
                /* never throw from drain */
              }
            }
          } else {
            // 'retry' — schedule exponential backoff on the queue.
            await queue.requeue(entry.key);
          }
        } catch {
          /* queue write failures are non-fatal here */
        }
      }
    } finally {
      draining = false;
    }
  }

  // Online listener — best-effort drain trigger. Wrapped in try/catch so
  // environments without `addEventListener` (some test harnesses) do
  // not break sink construction.
  try {
    if (typeof globalThis.addEventListener === 'function') {
      globalThis.addEventListener('online', () => {
        void drainOfflineQueue();
      });
    }
  } catch {
    /* ignore */
  }

  // ---- public Sink surface ------------------------------------------------

  const sink: Sink = {
    name: 'remote',

    emit(record: LogRecord): void {
      try {
        if (noop) return;

        // Privacy opt-out is rechecked per emit (REQ 11.4 / 11.5). When
        // toggled mid-session, also drop any pending in-memory batch.
        if (isOptedOut()) {
          batch = [];
          clearBatchTimer();
          return;
        }

        // Offline routing (REQ 5.6). When offline, persist via the
        // queue rather than batching in memory. The Logger is
        // responsible for making sure the queue is wired in; without
        // one we fall back to the in-memory batch.
        if (queue && !getOnlineState()) {
          // Fire-and-forget; queue write failures are non-fatal.
          queue.enqueue(record).catch(() => {
            /* never throw from emit */
          });
          return;
        }

        batch.push(record);
        if (batch.length >= MAX_BATCH) {
          flushBatch();
        } else {
          scheduleBatchFlush();
        }
      } catch {
        // REQ 4.1 — sinks must never throw.
      }
    },

    flushBeacon(): void {
      try {
        if (noop) return;
        if (batch.length === 0) return;
        if (!dsn) {
          // No URL to beacon to (e.g. an injected stub client without a
          // DSN). Drop the batch — no fetch fallback (REQ 5.5).
          batch = [];
          clearBatchTimer();
          return;
        }
        const beacon =
          typeof navigator !== 'undefined' &&
          typeof navigator.sendBeacon === 'function'
            ? navigator.sendBeacon.bind(navigator)
            : null;
        if (!beacon) {
          // sendBeacon unavailable → drop, no fetch fallback (REQ 5.5).
          batch = [];
          clearBatchTimer();
          return;
        }

        const body = JSON.stringify(batch);
        let ok = false;
        try {
          ok = beacon(dsn, body);
        } catch {
          ok = false;
        }
        // Whether the beacon was queued or rejected, the batch is
        // released — there is no retry path at end-of-life (REQ 5.5).
        batch = [];
        clearBatchTimer();
        if (!ok) {
          // Best-effort: the spec says drop. Nothing else to do.
          return;
        }
      } catch {
        /* never throw */
      }
    },

    async close(): Promise<void> {
      // Cooperative test cleanup: cancel any pending timer, drop the
      // batch, and best-effort flush the underlying client so any
      // in-flight envelopes resolve before the test moves on.
      clearBatchTimer();
      batch = [];
      const c = client;
      if (c && typeof c.flush === 'function') {
        try {
          await c.flush(0);
        } catch {
          /* ignore */
        }
      }
    },
  };

  // Test-only escape hatch: expose `drainOfflineQueue` so unit tests
  // can drive the offline-drain path deterministically without
  // dispatching a real `online` event and racing the listener.
  // Non-enumerable so it does not appear in `Object.keys(sink)` and
  // never leaks through `JSON.stringify`. Production code should never
  // reach for this property.
  Object.defineProperty(sink, '_drainOfflineQueue', {
    value: drainOfflineQueue,
    enumerable: false,
    configurable: false,
    writable: false,
  });

  return sink;
}

// ---------------------------------------------------------------------------
// Default sink — env-driven
// ---------------------------------------------------------------------------

/**
 * Default Remote_Sink instance constructed with `import.meta.env`-driven
 * defaults. When `VITE_OBSERVABILITY_DSN` is empty (the typical dev /
 * test situation) the sink is a no-op and `BrowserClient` is never
 * constructed (REQ 8.3).
 *
 * The Logger wires in the OfflineQueue, the privacy opt-out callback,
 * and the `onError` callback at runtime via `createRemoteSink(...)`;
 * call sites that just need the public default surface should import
 * the singleton from `index.ts`.
 */
export const remoteSink: Sink = createRemoteSink();
