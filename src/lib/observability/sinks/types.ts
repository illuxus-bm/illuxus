// Public types for the observability layer's sink adapter pattern.
//
// These are the canonical types referenced by the rest of the module
// (logger.ts, sinks/console.ts, sinks/remote.ts, rpc.ts) and re-exported
// from `src/lib/observability/index.ts` so call sites can type-check
// against the public API even before the implementations land.
//
// Source of truth: design.md "Public API surface" and "Sink interface".

/**
 * Severity levels supported by the Logger.
 * Ordered low → high in `LEVEL_RANK` below.
 */
export type LogLevel =
  | 'trace'
  | 'debug'
  | 'info'
  | 'warn'
  | 'error'
  | 'fatal';

/**
 * Numeric ranking used for severity comparisons.
 * Severity gates read e.g. `LEVEL_RANK[level] >= LEVEL_RANK['warn']`.
 */
export const LEVEL_RANK: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

/**
 * A fully built, redacted log record handed to every active sink.
 *
 * Sinks MUST treat this record as immutable; the Logger never mutates
 * it after fan-out and any mutation by a sink is undefined behaviour.
 */
export interface LogRecord {
  /** Severity level. */
  level: LogLevel;
  /** Human-readable message (already redacted). */
  message: string;
  /** Structured fields (already redacted). */
  fields: Record<string, unknown>;
  /** ISO-8601 timestamp captured at emit time. */
  timestamp: string;
  /** Build SHA from `import.meta.env.VITE_BUILD_SHA`, or `"unknown"`. */
  build_sha: string;
  /** `window.location.pathname` captured at emit time. */
  route: string;
  /** Active correlation id, if any. */
  correlation_id: string | null;
  /** Authenticated user id, if any. Never email or name. */
  user_id: string | null;
}

/**
 * Single seam every output destination plugs into.
 *
 * Implementations MUST NOT throw from `emit`. Returning a rejected
 * Promise is allowed; the Logger swallows it. See requirements 4.1, 4.2.
 */
export interface Sink {
  /** Stable identifier used in diagnostics (e.g. `"console"`, `"remote"`). */
  readonly name: string;
  /**
   * Deliver a single record. Must never throw.
   * May return a Promise; rejections are swallowed by the Logger.
   */
  emit(record: LogRecord): void | Promise<void>;
  /**
   * Synchronous flush hook called from `pagehide` / `visibilitychange=hidden`.
   * Implementations should use `navigator.sendBeacon` only — no `fetch`
   * fallback is permitted at end-of-life (REQ 5.5).
   */
  flushBeacon?(): void;
  /** Cooperative shutdown for tests. */
  close?(): Promise<void>;
}

/**
 * Options accepted by the `supabaseRpc(name, params, opts?)` wrapper.
 *
 * `correlationId` is the future-hook for the offline-replay spec: a
 * replayed call can supply the original id so logs from the replay
 * thread the same correlation as the original attempt.
 */
export interface SupabaseRpcOpts {
  /** Reuse a specific correlation id (e.g. for offline replay). */
  correlationId?: string;
  /** Optional `AbortSignal` forwarded to the underlying request. */
  signal?: AbortSignal;
}
