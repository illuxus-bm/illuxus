// Feature: observability-foundation — Example test: dsn-empty-noop
//
// Validates: Requirement 8.3
//
// When `VITE_OBSERVABILITY_DSN` is empty (the default in dev / test runs
// and any deployment that has not opted in), `createRemoteSink` MUST be a
// pure no-op:
//
//   1. `BrowserClient` is never constructed — Sentry's SDK is not booted
//      and no transport is wired up.
//   2. `Sink.emit(record)` returns without invoking any transport, throws
//      no exception, and never lazily constructs the SDK on first call.
//   3. `Sink.flushBeacon()` returns without invoking `navigator.sendBeacon`
//      and never throws.
//
// Strategy:
//   - `vi.mock('@sentry/browser', ...)` injects counter-stubs for
//     `BrowserClient` (a class whose constructor is a `vi.fn()`) and
//     `makeFetchTransport` (a function spy). Both must remain at zero
//     calls throughout the test for the no-op contract to hold.
//   - The `dsn` is passed explicitly as `''` to `createRemoteSink` so the
//     test does not depend on `import.meta.env.VITE_OBSERVABILITY_DSN`
//     being unset in the runtime environment.
//   - `vi.hoisted(...)` is used to define the spies because `vi.mock`
//     factories are hoisted above all `import` statements; ordinary
//     module-scope `const`s would not yet be initialised when the factory
//     runs.

import { beforeEach, describe, expect, test, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted spies — accessible from inside the `vi.mock` factory.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  /** Captures every `new BrowserClient(opts)` call. MUST stay at 0. */
  browserClientCtor: vi.fn(),
  /** Captures every `makeFetchTransport(opts)` call. MUST stay at 0. */
  makeFetchTransportFn: vi.fn(),
}));

vi.mock('@sentry/browser', () => {
  class BrowserClient {
    constructor(opts: unknown) {
      mocks.browserClientCtor(opts);
    }
    captureException(_exception: unknown, _hint?: unknown): string {
      return 'event-id';
    }
    captureMessage(
      _message: string,
      _level?: unknown,
      _hint?: unknown,
    ): string {
      return 'event-id';
    }
    flush(_timeout?: number): Promise<boolean> {
      return Promise.resolve(true);
    }
  }

  return {
    BrowserClient,
    // The real `defaultStackParser` is an array of stack-line parsers; the
    // sink only forwards it as an option so any value will do here.
    defaultStackParser: [],
    makeFetchTransport: (options: unknown) => {
      mocks.makeFetchTransportFn(options);
      return {
        send: () => Promise.resolve({ statusCode: 200 }),
        flush: () => Promise.resolve(true),
      };
    },
  };
});

// Imports must come after `vi.mock` registration. The hoist semantics make
// this safe — `vi.mock` is moved above all imports — but keeping the import
// order explicit here makes the test easier to read.
import { createRemoteSink } from '../sinks/remote';
import type { LogRecord } from '../sinks/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRecord(overrides: Partial<LogRecord> = {}): LogRecord {
  return {
    level: 'info',
    message: 'hello',
    fields: {},
    timestamp: '2024-01-01T00:00:00.000Z',
    build_sha: 'unknown',
    route: '/',
    correlation_id: null,
    user_id: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Remote_Sink — empty DSN no-op (REQ 8.3)', () => {
  beforeEach(() => {
    // The module-level `remoteSink` singleton in `sinks/remote.ts` runs
    // `createRemoteSink()` on import; it must not have constructed a
    // BrowserClient under an empty env DSN, but we clear here to scope
    // each assertion strictly to that test.
    mocks.browserClientCtor.mockClear();
    mocks.makeFetchTransportFn.mockClear();
  });

  test('factory does not construct BrowserClient when dsn is empty', () => {
    const sink = createRemoteSink({ dsn: '' });

    expect(sink.name).toBe('remote');
    expect(mocks.browserClientCtor).not.toHaveBeenCalled();
    expect(mocks.makeFetchTransportFn).not.toHaveBeenCalled();
  });

  test('emit() is a no-op: no client construction, no transport call, no throw', () => {
    const sink = createRemoteSink({ dsn: '' });

    expect(() => {
      sink.emit(makeRecord({ level: 'trace', message: 't' }));
      sink.emit(makeRecord({ level: 'debug', message: 'd' }));
      sink.emit(makeRecord({ level: 'info', message: 'i' }));
      sink.emit(makeRecord({ level: 'warn', message: 'w' }));
      sink.emit(makeRecord({ level: 'error', message: 'e' }));
      sink.emit(makeRecord({ level: 'fatal', message: 'f' }));
      // Even an emit carrying an Error in fields must not lazy-init the
      // client — REQ 8.3 is unconditional on payload shape.
      sink.emit(
        makeRecord({
          level: 'error',
          message: 'with-error',
          fields: { error: new Error('boom') },
        }),
      );
    }).not.toThrow();

    expect(mocks.browserClientCtor).not.toHaveBeenCalled();
    expect(mocks.makeFetchTransportFn).not.toHaveBeenCalled();
  });

  test('flushBeacon() is a no-op: never calls navigator.sendBeacon, never throws', () => {
    const sink = createRemoteSink({ dsn: '' });

    // Pre-populate via emits to verify that even if a caller "thinks"
    // there might be a pending batch, the no-op contract holds. The
    // emits themselves are no-ops (no batch is built), but this models
    // the realistic call sequence.
    sink.emit(makeRecord({ level: 'warn', message: 'queued?' }));
    sink.emit(makeRecord({ level: 'error', message: 'queued?' }));

    const sendBeacon = vi.fn(() => true);
    const originalSendBeacon = (
      navigator as { sendBeacon?: typeof navigator.sendBeacon }
    ).sendBeacon;
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true,
      writable: true,
      value: sendBeacon,
    });

    try {
      expect(() => sink.flushBeacon?.()).not.toThrow();
      expect(sendBeacon).not.toHaveBeenCalled();
    } finally {
      // Restore so we don't leak the spy into other tests sharing the
      // jsdom navigator instance.
      if (originalSendBeacon === undefined) {
        delete (navigator as { sendBeacon?: unknown }).sendBeacon;
      } else {
        Object.defineProperty(navigator, 'sendBeacon', {
          configurable: true,
          writable: true,
          value: originalSendBeacon,
        });
      }
    }

    expect(mocks.browserClientCtor).not.toHaveBeenCalled();
    expect(mocks.makeFetchTransportFn).not.toHaveBeenCalled();
  });
});
