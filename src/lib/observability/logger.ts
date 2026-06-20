// Logger — orchestrates redaction, record building, and sink fan-out.
//
// Source of truth: design.md "Logger (logger.ts)" and "Concurrency model".
// Validates: Requirements 1.1-1.7, 2.1-2.7, 4.1-4.5, 5.1-5.5, 5.9, 11.4-11.6,
// 12.3.
//
// Module surface
// ──────────────
// Side effects on import: NONE. The Logger does no I/O at module-load
// time (no `BrowserClient` construction, no `indexedDB.open`, no
// `localStorage` reads, no `addEventListener` calls). Initialization is
// deferred to the first `emit` and wrapped in `try/catch` so a failing
// init flips a permanent `disabled = true` flag and every subsequent
// emit becomes a no-op (REQ 1.6).
//
// Flow per emit (after init):
//   1. merge boundFields with per-call fields (per-call wins on collision)
//   2. `safeRedact()` the merged fields and the message string
//   3. stamp timestamp / build_sha / route / correlation_id / user_id
//   4. fan out to active sinks chosen by:
//        - dev → console all levels, no remote (REQ 2.1, 2.4)
//        - prod → console warn+ (REQ 2.2), remote warn+ unless opted-out (REQ 2.3, 2.5, 11.4)
//   5. sink emits are wrapped in try/catch and rejected promises are
//      neutralized with `.catch(() => {})` (REQ 4.1, 4.2)

import { getCorrelationId } from './correlation';
import { isProd as readIsProd } from './env-mode';
import { OfflineQueue } from './offline-queue';
import { safeRedact } from './redaction';
import { consoleSink } from './sinks/console';
import { createRemoteSink } from './sinks/remote';
import {
  LEVEL_RANK,
  type LogLevel,
  type LogRecord,
  type Sink,
} from './sinks/types';

// ---------------------------------------------------------------------------
// Module-scoped state
// ---------------------------------------------------------------------------
//
// All Logger instances share the same sinks, init guard, boot fallback, and
// privacy/user-id cells. Only `boundFields` is per-instance (so `child(...)`
// can attach scoped context without duplicating sinks).

let initialized = false;
let initAttempted = false;
let disabled = false;

interface BootBufferEntry {
  level: LogLevel;
  message: string;
  /** Already-merged (boundFields ∪ perCallFields) at emit time. */
  effectiveFields: Record<string, unknown>;
}
let bootBuffer: BootBufferEntry[] = [];

let offlineQueue: OfflineQueue | null = null;
let remoteSink: Sink | null = null;
let flushListenersInstalled = false;

let userIdProvider: () => string | null = () => null;

// Privacy opt-out memoization. The cell is invalidated by
// `setPrivacyOptOut` so toggling mid-session takes effect on the very
// next emit (REQ 11.5).
let optOutCache: boolean | undefined;

// ---------------------------------------------------------------------------
// Env / global helpers
// ---------------------------------------------------------------------------

function readEnvString(key: string): string | undefined {
  try {
    const env = (import.meta as { env?: Record<string, unknown> }).env;
    if (!env) return undefined;
    const v = env[key];
    return typeof v === 'string' ? v : undefined;
  } catch {
    return undefined;
  }
}

function isProd(): boolean {
  // Delegates to ./env-mode so tests can mock the prod-vs-dev branch
  // without trying to override Vite's compile-time-inlined import.meta.env.
  return readIsProd();
}

function getRoute(): string {
  try {
    if (typeof window !== 'undefined' && window.location && window.location.pathname) {
      return window.location.pathname;
    }
  } catch {
    /* ignore */
  }
  return '/';
}

function getBuildSha(): string {
  return readEnvString('VITE_BUILD_SHA') ?? 'unknown';
}

// ---------------------------------------------------------------------------
// Privacy opt-out
// ---------------------------------------------------------------------------

const OPT_OUT_LS_KEY = 'observability:opt-out';

export function getPrivacyOptOut(): boolean {
  if (optOutCache !== undefined) return optOutCache;
  // Build-time opt-out wins (rare).
  if (readEnvString('VITE_OBSERVABILITY_OPT_OUT') === '1') {
    optOutCache = true;
    return true;
  }
  let value = false;
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      value = localStorage.getItem(OPT_OUT_LS_KEY) === '1';
    }
  } catch {
    value = false;
  }
  optOutCache = value;
  return value;
}

export function setPrivacyOptOut(value: boolean): void {
  // Persist the choice.
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      if (value) {
        localStorage.setItem(OPT_OUT_LS_KEY, '1');
      } else {
        localStorage.removeItem(OPT_OUT_LS_KEY);
      }
    }
  } catch {
    /* best-effort persistence */
  }
  // Invalidate the cache so the next `getPrivacyOptOut()` re-reads.
  optOutCache = undefined;

  if (value) {
    // REQ 11.6 — drop in-memory remote sink batch and clear OfflineQueue.
    if (remoteSink && typeof remoteSink.close === 'function') {
      try {
        const result = remoteSink.close();
        if (result && typeof (result as Promise<unknown>).catch === 'function') {
          (result as Promise<unknown>).catch(() => {
            /* never throw from setter */
          });
        }
      } catch {
        /* ignore */
      }
    }
    if (offlineQueue) {
      try {
        offlineQueue.clear().catch(() => {
          /* never throw from setter */
        });
      } catch {
        /* ignore */
      }
    }
  }
}

// ---------------------------------------------------------------------------
// User-id provider
// ---------------------------------------------------------------------------

export function setUserIdProvider(fn: () => string | null): void {
  if (typeof fn === 'function') {
    userIdProvider = fn;
  }
}

function readUserId(): string | null {
  try {
    const v = userIdProvider();
    return typeof v === 'string' && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Lazy init
// ---------------------------------------------------------------------------

function doInit(): void {
  // OfflineQueue first so the remote sink can be constructed with it.
  // The `onOverflow` callback emits a single `warn 'offline queue overflow'`
  // record per eviction event — this is safe to call from inside the
  // queue because by the time it fires we are already past init.
  offlineQueue = new OfflineQueue({
    onOverflow: () => {
      try {
        logger.warn('offline queue overflow');
      } catch {
        /* never throw from the queue callback */
      }
    },
  });

  // Remote sink wired with the queue, opt-out callback, and an
  // onError sink that surfaces `warn 'remote sink rejected record'`
  // through the logger itself (REQ 6.6).
  remoteSink = createRemoteSink({
    queue: offlineQueue,
    getPrivacyOptOut,
    onError: (message, fields) => {
      try {
        logger.warn(message, fields);
      } catch {
        /* never throw from sink callback */
      }
    },
  });

  installFlushListeners();
}

function installFlushListeners(): void {
  if (flushListenersInstalled) return;
  flushListenersInstalled = true;

  const flushAll = (): void => {
    for (const sink of allSinks()) {
      if (typeof sink.flushBeacon === 'function') {
        try {
          sink.flushBeacon();
        } catch {
          /* REQ 4.1 — sinks must never throw */
        }
      }
    }
  };

  try {
    if (typeof globalThis.addEventListener === 'function') {
      globalThis.addEventListener('pagehide', flushAll);
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', () => {
        try {
          if (document.visibilityState === 'hidden') flushAll();
        } catch {
          /* ignore */
        }
      });
    }
  } catch {
    /* ignore */
  }
}

// Snapshot of all sinks (regardless of level / opt-out). Used by the
// flush listeners — at end-of-life every sink gets a chance to drain.
function allSinks(): Sink[] {
  const sinks: Sink[] = [consoleSink];
  if (remoteSink) sinks.push(remoteSink);
  return sinks;
}

/**
 * Drain `window.__observabilityBoot` into the (now initialised) logger.
 * The boot stub itself replaces the global with a no-op shim and detaches
 * the `error` / `unhandledrejection` listeners. Safe in non-browser envs.
 */
function drainGlobalBootStub(): void {
  try {
    const w = (typeof window !== 'undefined' ? window : undefined) as
      | (Window & {
          __observabilityBoot?: {
            __drain__?: (l: unknown) => void;
          };
        })
      | undefined;
    const stub = w?.__observabilityBoot;
    if (stub && typeof stub.__drain__ === 'function') {
      stub.__drain__(logger);
    }
  } catch {
    /* drain must never throw */
  }
}

// ---------------------------------------------------------------------------
// Sink selection
// ---------------------------------------------------------------------------

const WARN_RANK = LEVEL_RANK.warn;

function activeSinks(level: LogLevel): Sink[] {
  const sinks: Sink[] = [];
  const prod = isProd();
  const rank = LEVEL_RANK[level];

  // Console sink:
  //   - dev: all levels (REQ 2.1)
  //   - prod: warn+ only (REQ 2.2). The console sink itself also gates
  //     internally; the duplicate gate here is defensive.
  if (!prod || rank >= WARN_RANK) {
    sinks.push(consoleSink);
  }

  // Remote sink:
  //   - dev: never (REQ 2.4)
  //   - prod: warn+ only (REQ 2.3) AND not opted out (REQ 2.5, 11.4).
  // `getPrivacyOptOut()` is rechecked on every emit (REQ 11.5).
  if (prod && rank >= WARN_RANK && remoteSink && !getPrivacyOptOut()) {
    sinks.push(remoteSink);
  }

  return sinks;
}

// ---------------------------------------------------------------------------
// Record building
// ---------------------------------------------------------------------------

function isRedactionEnvelope(v: unknown): boolean {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as Record<string, unknown>).redaction_error === true
  );
}

function buildAndFanOut(
  level: LogLevel,
  message: string,
  effectiveFields: Record<string, unknown>,
): void {
  // Step 1: redaction. Both the message and the merged fields are routed
  // through `safeRedact` so an email accidentally interpolated into a
  // message string is still scrubbed.
  const redactedMsgRaw = safeRedact(message);
  const redactedFieldsRaw = safeRedact(effectiveFields);

  let finalLevel: LogLevel = level;
  let finalMessage: string;
  let finalFields: Record<string, unknown>;

  // If either redaction produced the `{ redaction_error: true }` envelope
  // (meaning `safeRedact` caught a throw), surface a sanitized warn record
  // per REQ 4.3 instead of forwarding the original.
  const msgFailed = typeof redactedMsgRaw !== 'string';
  const fieldsFailed = isRedactionEnvelope(redactedFieldsRaw);

  if (msgFailed || fieldsFailed) {
    finalLevel = 'warn';
    finalMessage = 'redaction failed';
    finalFields = { redaction_error: true };
  } else {
    finalMessage = redactedMsgRaw as string;
    finalFields =
      redactedFieldsRaw && typeof redactedFieldsRaw === 'object'
        ? (redactedFieldsRaw as Record<string, unknown>)
        : {};
  }

  let record: LogRecord;
  try {
    record = {
      level: finalLevel,
      message: finalMessage,
      fields: finalFields,
      timestamp: new Date().toISOString(),
      build_sha: getBuildSha(),
      route: getRoute(),
      correlation_id: getCorrelationId(),
      user_id: readUserId(),
    };
  } catch {
    // Every helper above is wrapped in try/catch already; this is a
    // belt-and-braces guard so the emit can't throw on environment
    // peculiarities (e.g. a frozen Date).
    return;
  }

  // Step 2: fan out. Each sink is wrapped in try/catch, and any returned
  // Promise has `.catch(() => {})` attached so a rejection cannot escape
  // the Logger (REQ 4.1, 4.2).
  const sinks = activeSinks(finalLevel);
  for (const sink of sinks) {
    try {
      const result = sink.emit(record);
      if (
        result !== null &&
        typeof result === 'object' &&
        typeof (result as Promise<unknown>).catch === 'function'
      ) {
        (result as Promise<unknown>).catch(() => {
          /* swallow */
        });
      }
    } catch {
      /* REQ 4.1 — sinks must never throw to the caller */
    }
  }
}

// ---------------------------------------------------------------------------
// Emit dispatch (with lazy init)
// ---------------------------------------------------------------------------

function emitImpl(
  level: LogLevel,
  boundFields: Record<string, unknown>,
  message: string,
  perCallFields?: Record<string, unknown>,
): void {
  if (disabled) return;

  // Merge once: per-call wins on key collision.
  const effectiveFields: Record<string, unknown> = perCallFields
    ? { ...boundFields, ...perCallFields }
    : { ...boundFields };

  if (!initialized) {
    // Buffer the current emit into the in-memory ring so it is not lost
    // while init runs (or while we are inside a re-entrant emit during
    // boot stub drain).
    bootBuffer.push({ level, message, effectiveFields });

    if (initAttempted) return; // already trying / already failed
    initAttempted = true;

    try {
      doInit();
    } catch {
      // REQ 1.6 — first init throw flips the disabled flag permanently.
      disabled = true;
      bootBuffer = [];
      return;
    }
    initialized = true;

    // Replay in chronological order: pre-module-load events captured in
    // the global boot stub first (oldest), then the post-module-load
    // in-memory bootBuffer (newest, includes the emit that triggered init).
    drainGlobalBootStub();

    const drain = bootBuffer;
    bootBuffer = [];
    for (const entry of drain) {
      try {
        buildAndFanOut(entry.level, entry.message, entry.effectiveFields);
      } catch {
        /* never escape */
      }
    }
    return;
  }

  buildAndFanOut(level, message, effectiveFields);
}

// ---------------------------------------------------------------------------
// Logger class
// ---------------------------------------------------------------------------

/**
 * Six-level structured logger. Module-scoped state (sinks, init guard,
 * privacy cell) is shared across all instances; `boundFields` is the only
 * per-instance state, attached via `child(...)`.
 *
 * The exported `logger` singleton is the canonical entry point; tests and
 * call sites that need scoped context should call `logger.child({...})`.
 */
export class Logger {
  /** Per-instance bound fields. Merged into every emit before redaction. */
  readonly boundFields: Record<string, unknown>;

  constructor(boundFields: Record<string, unknown> = {}) {
    this.boundFields = boundFields;
  }

  /**
   * Returns a new Logger that inherits the parent's bound fields with
   * `fields` overlaid on top. The returned Logger shares all sinks and
   * init state with the parent.
   */
  child(fields: Record<string, unknown>): Logger {
    return new Logger({ ...this.boundFields, ...fields });
  }

  trace(message: string, fields?: Record<string, unknown>): void {
    emitImpl('trace', this.boundFields, message, fields);
  }

  debug(message: string, fields?: Record<string, unknown>): void {
    emitImpl('debug', this.boundFields, message, fields);
  }

  info(message: string, fields?: Record<string, unknown>): void {
    emitImpl('info', this.boundFields, message, fields);
  }

  warn(message: string, fields?: Record<string, unknown>): void {
    emitImpl('warn', this.boundFields, message, fields);
  }

  error(message: string, fields?: Record<string, unknown>): void {
    emitImpl('error', this.boundFields, message, fields);
  }

  fatal(message: string, fields?: Record<string, unknown>): void {
    emitImpl('fatal', this.boundFields, message, fields);
  }
}

/** Singleton Logger. Use `logger.child({...})` to attach scoped fields. */
export const logger: Logger = new Logger();
