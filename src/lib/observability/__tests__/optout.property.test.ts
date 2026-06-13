// Feature: observability-foundation, Property 4: Privacy opt-out is unconditional across all severities
//
// Validates: Requirements 2.5, 11.4
//
// For any sequence of emit calls at any severity, while
// `getPrivacyOptOut()` returns `true`, the Remote_Sink's `emit` method
// is invoked zero times — operationally, no record reaches the
// underlying Sentry-compatible SDK or its transport.
//
// Why two properties?
//
//   The Logger singleton in `logger.ts` selects active sinks via
//   `activeSinks(level)`, which suppresses the Remote_Sink in non-prod
//   builds (REQ 2.4). The vitest runtime is non-prod, so a test that
//   emits via `logger.warn(...)` and watches the Remote_Sink would
//   observe the sink omitted for a different reason than opt-out, and
//   so cannot pin Property 4. There is also no public seam to inject a
//   stub sink into the Logger singleton.
//
//   We therefore split the verification:
//
//   Primary (Property 4 proper) — exercise the Remote_Sink directly
//     via `createRemoteSink({ client: stub, getPrivacyOptOut: () =>
//     true, ... })`. This is the same factory the Logger uses
//     internally, and it is where the per-emit `getPrivacyOptOut()`
//     recheck (REQ 11.4) lives. We assert the injected stub client's
//     capture methods, the mocked `BrowserClient` constructor, the
//     mocked `makeFetchTransport`, and `navigator.sendBeacon` all
//     remain at zero invocations regardless of severity, message, or
//     fields shape. This is the strongest test of the property and is
//     equivalent to "Remote_Sink emit invoked zero times" at the sink
//     boundary.
//
//   Secondary (pragmatic singleton surface) — through the Logger
//     singleton, after `setPrivacyOptOut(true)`, emit at every severity
//     with arbitrary fields and assert (a) `getPrivacyOptOut()`
//     continues to return `true` regardless of how many emits happen
//     and (b) no emit throws to the caller. This pins the cell-level
//     guarantee that the opt-out predicate is stable across the
//     emission lifecycle, which is the precondition Property 4 builds
//     on.
//
// Strategy details:
//   - `vi.mock('@sentry/browser', ...)` injects counter-stubs so any
//     unintended SDK construction is observable.
//   - The primary property uses `vi.hoisted(...)` mocks to ensure the
//     `vi.mock` factory has access to the spies at hoist time.
//   - The secondary property uses `vi.resetModules()` + a fake
//     `localStorage` (mirroring `optout-toggle.test.ts`) so each
//     iteration starts from a clean Logger singleton.
//   - Both properties run with `fc.assert(prop, { numRuns: 100 })` per
//     the design's testing-strategy budget for Property 4.

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import fc from 'fast-check';

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

// Imports must come after `vi.mock` registration. The hoist semantics
// make this safe — `vi.mock` is moved above all imports — but keeping
// the ordering explicit makes the test easier to read.
import { createRemoteSink, type SinkClient } from '../sinks/remote';
import type { LogLevel, LogRecord } from '../sinks/types';

// ---------------------------------------------------------------------------
// Shared generators
// ---------------------------------------------------------------------------

const LEVELS: ReadonlyArray<LogLevel> = [
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
];

interface EmitTuple {
  level: LogLevel;
  message: string;
  fields: Record<string, unknown>;
  /** Whether to call `flushBeacon()` after this emit (primary property only). */
  flushAfter: boolean;
}

// Bounded field shapes — Property 4 doesn't care about content, only
// about the opt-out gate. Bounding keeps fast-check shrinks readable
// and avoids pathological allocations during the 100-run sweep.
const fieldsArb: fc.Arbitrary<Record<string, unknown>> = fc.dictionary(
  fc.string({ maxLength: 16 }),
  fc.oneof(
    fc.string({ maxLength: 32 }),
    fc.integer(),
    fc.boolean(),
    fc.constant(null),
  ),
  { maxKeys: 4 },
);

const emitTuple: fc.Arbitrary<EmitTuple> = fc.record({
  level: fc.constantFrom(...LEVELS),
  message: fc.string({ maxLength: 64 }),
  fields: fieldsArb,
  flushAfter: fc.boolean(),
});

function makeRecord(t: EmitTuple): LogRecord {
  return {
    level: t.level,
    message: t.message,
    fields: t.fields,
    timestamp: '1970-01-01T00:00:00.000Z',
    build_sha: 'unknown',
    route: '/',
    correlation_id: null,
    user_id: null,
  };
}

// ---------------------------------------------------------------------------
// Primary property — direct sink boundary
// ---------------------------------------------------------------------------

interface StubClientFixture {
  client: SinkClient;
  captureMessage: ReturnType<typeof vi.fn>;
  captureException: ReturnType<typeof vi.fn>;
}

function makeStubClient(): StubClientFixture {
  const captureMessage = vi.fn(() => 'event-id');
  const captureException = vi.fn(() => 'event-id');
  const client: SinkClient = {
    // Cast through `unknown` because vi.fn's inferred type doesn't line
    // up with the SDK's overload signature, and the stub only needs to
    // record invocations — its return value is ignored by the sink in
    // the opt-out path because that path is never taken.
    captureMessage: captureMessage as unknown as SinkClient['captureMessage'],
    captureException: captureException as unknown as SinkClient['captureException'],
  };
  return { client, captureMessage, captureException };
}

describe('Property 4 — privacy opt-out is unconditional across all severities (REQ 2.5, 11.4)', () => {
  test('with getPrivacyOptOut() === true, no emit at any severity reaches the Remote_Sink SDK', () => {
    fc.assert(
      fc.property(
        fc.array(emitTuple, { minLength: 0, maxLength: 32 }),
        (sequence) => {
          // Reset the hoisted SDK spies per iteration so a leak from a
          // previous run is observable as a non-zero count below.
          mocks.browserClientCtor.mockClear();
          mocks.makeFetchTransportFn.mockClear();

          const { client, captureMessage, captureException } =
            makeStubClient();

          // Spy on `navigator.sendBeacon` so we can also assert the
          // end-of-life flush path is a no-op when opt-out is true.
          // The opt-out branch in `emit()` drops the in-memory batch
          // on every call, so by the time `flushBeacon()` runs there
          // is nothing to send and `sendBeacon` MUST stay unused.
          const sendBeaconSpy = vi.fn(() => true);
          const previousDescriptor = Object.getOwnPropertyDescriptor(
            navigator,
            'sendBeacon',
          );
          Object.defineProperty(navigator, 'sendBeacon', {
            configurable: true,
            writable: true,
            value: sendBeaconSpy,
          });

          try {
            const sink = createRemoteSink({
              client,
              // Non-empty DSN so the sink is NOT in the
              // empty-DSN noop branch. The opt-out gate is the only
              // thing keeping the SDK silent, which is exactly what
              // Property 4 asserts.
              dsn: 'https://public@example.com/12345',
              // The predicate under test — constantly true throughout
              // the iteration's emit sequence.
              getPrivacyOptOut: () => true,
            });

            for (const t of sequence) {
              sink.emit(makeRecord(t));
              if (t.flushAfter && typeof sink.flushBeacon === 'function') {
                sink.flushBeacon();
              }
            }

            // Property 4 — the injected SDK client never received a
            // capture call regardless of severity, message, or fields.
            expect(captureMessage).not.toHaveBeenCalled();
            expect(captureException).not.toHaveBeenCalled();
            // Defence in depth — the mocked Sentry SDK was never
            // constructed (we passed an injected client, so noop=false
            // but lazy init is still gated by emit reaching past the
            // opt-out check), and the wrapped fetch transport was
            // never wired up.
            expect(mocks.browserClientCtor).not.toHaveBeenCalled();
            expect(mocks.makeFetchTransportFn).not.toHaveBeenCalled();
            // sendBeacon never fired — the batch was dropped on every
            // emit, so the flush hook saw an empty batch and bailed.
            expect(sendBeaconSpy).not.toHaveBeenCalled();
          } finally {
            // Restore navigator.sendBeacon so we don't leak the spy
            // between iterations sharing the jsdom navigator.
            if (previousDescriptor) {
              Object.defineProperty(
                navigator,
                'sendBeacon',
                previousDescriptor,
              );
            } else {
              delete (navigator as { sendBeacon?: unknown }).sendBeacon;
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Secondary property — singleton logger surface (pragmatic check)
// ---------------------------------------------------------------------------
//
// Through the public Logger singleton, after `setPrivacyOptOut(true)`,
// arbitrary emit sequences at every severity:
//   (a) leave `getPrivacyOptOut()` returning `true`, and
//   (b) never throw to the caller.
//
// This pins the cell-level invariant Property 4 relies on: the opt-out
// predicate is stable across the emission lifecycle, so the per-emit
// recheck inside `Remote_Sink.emit` (verified directly by the primary
// property above) reliably observes `true` for every record.
// ---------------------------------------------------------------------------

const OPT_OUT_KEY = 'observability:opt-out';

interface FakeLocalStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
  key: (index: number) => string | null;
  readonly length: number;
}

function makeFakeLocalStorage(): FakeLocalStorage {
  const store = new Map<string, string>();
  return {
    getItem: (key) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key, value) => {
      store.set(key, String(value));
    },
    removeItem: (key) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: () => null,
    get length() {
      return store.size;
    },
  };
}

let restoreLs: () => void;

beforeEach(() => {
  // Each iteration of the singleton-logger property re-imports
  // `../logger`; reset module cache and install a fresh fake
  // localStorage so the Logger picks it up on first call.
  vi.resetModules();
  const ls = makeFakeLocalStorage();
  const previousDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'localStorage',
  );
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: ls,
  });
  restoreLs = () => {
    if (previousDescriptor) {
      Object.defineProperty(
        globalThis,
        'localStorage',
        previousDescriptor,
      );
    } else {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  };
});

afterEach(() => {
  restoreLs();
});

describe('Property 4 (singleton surface) — opt-out cell stays true across arbitrary emit sequences', () => {
  test('after setPrivacyOptOut(true), emits at every level keep getPrivacyOptOut() true and never throw', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(emitTuple, { minLength: 0, maxLength: 32 }),
        async (sequence) => {
          // Re-import the Logger module per iteration so module-scoped
          // state (init guard, opt-out cache, sinks) starts fresh.
          // The dynamic import returns the same shape as the static
          // import; we only need the public surface here.
          vi.resetModules();
          const mod: typeof import('../logger') = await import('../logger');
          const { logger, getPrivacyOptOut, setPrivacyOptOut } = mod;

          // Flip the cell BEFORE any emit so the entire sequence runs
          // under the opted-out predicate.
          setPrivacyOptOut(true);
          expect(getPrivacyOptOut()).toBe(true);

          // Drive the singleton through the generated sequence.
          // Wrapping in a try/catch lets fast-check shrink to the
          // smallest input that breaks the no-throw invariant; the
          // expectation below is what fc reports as the failure
          // message when shrinking finds a counterexample.
          let threw: unknown = null;
          try {
            for (const t of sequence) {
              logger[t.level](t.message, t.fields);
            }
          } catch (e) {
            threw = e;
          }
          expect(threw).toBeNull();

          // The cell remains `true` after every emit — the per-emit
          // recheck inside `getPrivacyOptOut()` cannot have observed a
          // false transition because nothing in the emit path writes
          // to the cell.
          expect(getPrivacyOptOut()).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
