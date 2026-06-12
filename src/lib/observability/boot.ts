// Boot_Buffer + `window.__observabilityBoot` global stub install + drainer.
//
// Hoisted to line 1 of `src/main.tsx` (task 1.26) so any pre-init emits —
// including unhandled errors and rejections from the boot bundle itself —
// are captured before the real Logger module is ready.
//
// Source of truth: design.md "Boot stub (boot.ts)" and requirements 4.4,
// 4.5, 12.1, 12.2, 12.3, 12.4, 12.5.

import type { LogLevel } from './sinks/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * One pre-init emit captured by the Boot_Buffer.
 *
 * `capturedAt` is `performance.now()` at push time and is replayed onto the
 * record fields as `_capturedAt` so the eventual sinks can recover the
 * original ordering relative to the navigation start.
 */
export interface BootBufferEntry {
  level: LogLevel;
  message: string;
  fields: Record<string, unknown>;
  capturedAt: number;
}

/**
 * Minimal Logger surface needed by `__drain__`. Defined locally so this module
 * has no runtime dependency on `logger.ts` (which imports nothing from here).
 */
interface DrainLogger {
  trace(message: string, fields?: Record<string, unknown>): void;
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
  fatal(message: string, fields?: Record<string, unknown>): void;
}

/**
 * Shape of the global `window.__observabilityBoot` stub.
 *
 * The six emit methods match the public Logger surface so a developer can
 * call `window.__observabilityBoot.info('hello')` from anywhere — including
 * inline boot scripts — without knowing whether the real Logger is loaded.
 */
export interface ObservabilityBootStub {
  trace(message: string, fields?: Record<string, unknown>): void;
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
  fatal(message: string, fields?: Record<string, unknown>): void;
  /**
   * Replay the captured records via `logger` in FIFO order, then replace
   * `window.__observabilityBoot` with a no-op shim and remove the global
   * `error` / `unhandledrejection` listeners installed at module load.
   *
   * If the buffer overflowed during boot, a synthetic
   * `warn 'boot buffer overflowed'` record is emitted as the FIRST replay
   * record (REQ 4.5).
   */
  __drain__(logger: DrainLogger): void;
  /** Internal: snapshot of pending entries. Exposed for tests only. */
  readonly __buffer__: ReadonlyArray<BootBufferEntry>;
  /** Internal: overflow flag. Exposed for tests only. */
  readonly __overflowed__: boolean;
}

declare global {
  interface Window {
    __observabilityBoot?: ObservabilityBootStub;
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BOOT_BUFFER_CAPACITY = 64;

const LEVELS: ReadonlyArray<LogLevel> = [
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
];

// ---------------------------------------------------------------------------
// Stub factory
// ---------------------------------------------------------------------------

function nowMs(): number {
  // performance.now() is monotonic and the canonical clock for this module.
  // Fall back to Date.now() in environments where performance is shimmed away.
  try {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
  } catch {
    /* ignore — fall through */
  }
  return Date.now();
}

function createBootStub(): ObservabilityBootStub {
  const buffer: BootBufferEntry[] = [];
  let overflowed = false;
  let drained = false;

  const push = (entry: BootBufferEntry): void => {
    if (drained) return;
    if (buffer.length >= BOOT_BUFFER_CAPACITY) {
      // FIFO eviction — drop oldest, set the single-shot overflow flag.
      buffer.shift();
      overflowed = true;
    }
    buffer.push(entry);
  };

  const makeEmit = (level: LogLevel) =>
    function bootEmit(message: string, fields: Record<string, unknown> = {}): void {
      push({
        level,
        message,
        fields: fields ?? {},
        capturedAt: nowMs(),
      });
    };

  // Listener references kept so `__drain__` can detach them.
  const onErrorEvent = (event: ErrorEvent): void => {
    const err = event.error;
    push({
      level: 'error',
      message: 'window error',
      fields: {
        error_message: typeof event.message === 'string' ? event.message : undefined,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error_name: err && typeof err === 'object' ? (err as Error).name : undefined,
        stack: err && typeof err === 'object' ? (err as Error).stack : undefined,
      },
      capturedAt: nowMs(),
    });
  };

  const onUnhandledRejection = (event: PromiseRejectionEvent): void => {
    const reason = event.reason as unknown;
    let error_name: string | undefined;
    let error_message: string;
    let stack: string | undefined;
    if (reason instanceof Error) {
      error_name = reason.name;
      error_message = reason.message;
      stack = reason.stack;
    } else if (typeof reason === 'string') {
      error_message = reason;
    } else {
      try {
        error_message = JSON.stringify(reason);
      } catch {
        error_message = String(reason);
      }
    }
    push({
      level: 'error',
      message: 'unhandled rejection',
      fields: { error_name, error_message, stack },
      capturedAt: nowMs(),
    });
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('error', onErrorEvent);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
  }

  const stub: ObservabilityBootStub = {
    trace: makeEmit('trace'),
    debug: makeEmit('debug'),
    info: makeEmit('info'),
    warn: makeEmit('warn'),
    error: makeEmit('error'),
    fatal: makeEmit('fatal'),

    __drain__(logger: DrainLogger): void {
      if (drained) return;
      drained = true;

      // Detach listeners first so anything that throws during replay does not
      // get re-captured into the now-being-drained buffer.
      if (typeof window !== 'undefined') {
        window.removeEventListener('error', onErrorEvent);
        window.removeEventListener('unhandledrejection', onUnhandledRejection);
      }

      // REQ 4.5 — synthetic overflow warn is the FIRST replay record.
      if (overflowed) {
        try {
          logger.warn('boot buffer overflowed', {});
        } catch {
          /* swallow — drain must never throw */
        }
      }

      // Replay in FIFO order with the original capture timestamp threaded as
      // a structured field so downstream sinks can preserve relative ordering.
      for (const entry of buffer) {
        try {
          const fields: Record<string, unknown> = {
            ...entry.fields,
            _capturedAt: entry.capturedAt,
          };
          logger[entry.level](entry.message, fields);
        } catch {
          /* swallow — drain must never throw */
        }
      }

      buffer.length = 0;

      // Replace the global with a silent shim so any post-init calls — e.g.
      // a stale reference held by an inline script — are no-ops.
      if (typeof window !== 'undefined') {
        window.__observabilityBoot = createNoopShim();
      }
    },

    get __buffer__(): ReadonlyArray<BootBufferEntry> {
      return buffer;
    },
    get __overflowed__(): boolean {
      return overflowed;
    },
  };

  return stub;
}

function createNoopShim(): ObservabilityBootStub {
  const noop = (): void => undefined;
  const shim: ObservabilityBootStub = {
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
    __drain__: noop,
    __buffer__: [],
    __overflowed__: false,
  };
  // Defensive: make sure every level method really is a function on the shim.
  for (const level of LEVELS) {
    if (typeof shim[level] !== 'function') {
      shim[level] = noop;
    }
  }
  return shim;
}

// ---------------------------------------------------------------------------
// Module side effect — install stub at import time in browser environments
// ---------------------------------------------------------------------------

if (typeof window !== 'undefined' && !window.__observabilityBoot) {
  window.__observabilityBoot = createBootStub();
}

export {};
