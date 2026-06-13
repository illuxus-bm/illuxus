// Feature: observability-foundation — Example test: sendBeacon-flush
//
// Validates: Requirements 5.3, 5.4, 5.5
//
// `Sink.flushBeacon()` is the synchronous hook the Logger calls during
// `pagehide` and `visibilitychange=hidden` to deliver the Remote_Sink's
// pending in-memory batch one last time before the page tears down.
// Per REQ 5.5 the sink MUST use `navigator.sendBeacon` exclusively —
// there is NO `fetch` fallback and NO synchronous dispatch. If the
// beacon is unavailable or the browser refuses it, the batch is dropped.
//
// Three checks here, all driving `flushBeacon` directly on the sink:
//
//   1. Happy path. With a non-empty DSN and an injected client, emit a
//      few records (< MAX_BATCH so the in-`emit` synchronous flush does
//      not pre-empt us). Calling `sink.flushBeacon()` invokes
//      `navigator.sendBeacon` exactly once with `(dsn, JSON.stringify(batch))`.
//
//   2. Beacon refusal. When `navigator.sendBeacon` returns `false`, the
//      pending batch is still cleared (no retry, no fetch fallback).
//      Subsequent emits start a fresh batch — proven by a follow-up
//      flush that beacons only the new records.
//
//   3. Beacon unavailable. With `navigator.sendBeacon` removed, the
//      batch is dropped silently and `fetch` is never invoked.
//
// Scope note: this file exercises `flushBeacon` on the sink directly.
// The Logger's `pagehide` / `visibilitychange` event listeners (which
// only register after `logger.ts` initialises and would dispatch to
// every active sink) are the Logger's concern and are covered by
// separate tests against `logger.ts`.

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// `@sentry/browser` is imported transitively by `sinks/remote.ts`. We
// stub it so importing the module under test does not pull in the real
// SDK; the tests below all inject `opts.client` so the `BrowserClient`
// constructor is never reached, but the module-load import resolves
// through this mock regardless.
vi.mock('@sentry/browser', () => {
  class FakeBrowserClient {
    constructor(_opts: unknown) {}
    captureException(): string {
      return 'event-id';
    }
    captureMessage(): string {
      return 'event-id';
    }
    flush(): Promise<boolean> {
      return Promise.resolve(true);
    }
  }
  return {
    BrowserClient: FakeBrowserClient,
    defaultStackParser: () => [],
    makeFetchTransport: () => () => ({
      send: () => Promise.resolve({ statusCode: 200 }),
      flush: () => Promise.resolve(true),
    }),
  };
});

// eslint-disable-next-line import/first
import { createRemoteSink, type SinkClient } from '../sinks/remote';
// eslint-disable-next-line import/first
import type { LogRecord } from '../sinks/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DSN = 'https://test@example.com/1';

function makeRecord(overrides: Partial<LogRecord> = {}): LogRecord {
  return {
    level: 'info',
    message: 'hello',
    fields: {},
    timestamp: '2025-01-01T00:00:00.000Z',
    build_sha: 'unknown',
    route: '/',
    correlation_id: null,
    user_id: null,
    ...overrides,
  };
}

/**
 * Minimal client stub so `createRemoteSink` skips lazy `BrowserClient`
 * construction and uses our injected client directly. Capture methods
 * never run during these tests because flushBeacon bypasses the SDK
 * entirely — the batch is JSON-serialised and shipped via `sendBeacon`.
 */
function makeStubClient(): SinkClient {
  return {
    captureException: () => 'event-id',
    captureMessage: () => 'event-id',
    flush: () => Promise.resolve(true),
  };
}

/**
 * Install `navigator.sendBeacon` for a single test. Returns the
 * underlying spy so the test can read its call arguments. The
 * `afterEach` block restores whatever value (or absence) was on
 * `navigator.sendBeacon` before the test ran.
 */
function installSendBeacon(impl: (url: string, body?: BodyInit) => boolean) {
  const spy = vi.fn(impl);
  Object.defineProperty(navigator, 'sendBeacon', {
    configurable: true,
    writable: true,
    value: spy,
  });
  return spy;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Remote_Sink — flushBeacon (REQ 5.3, 5.4, 5.5)', () => {
  let originalSendBeacon: typeof navigator.sendBeacon | undefined;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalSendBeacon = (
      navigator as { sendBeacon?: typeof navigator.sendBeacon }
    ).sendBeacon;

    // REQ 5.5 — flushBeacon MUST NOT fall back to fetch under any
    // circumstance. Stub the global so the assertion is unambiguous: any
    // call here is a regression.
    fetchMock = vi.fn(() =>
      Promise.resolve(new Response('', { status: 200 })),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    if (originalSendBeacon === undefined) {
      delete (navigator as { sendBeacon?: unknown }).sendBeacon;
    } else {
      Object.defineProperty(navigator, 'sendBeacon', {
        configurable: true,
        writable: true,
        value: originalSendBeacon,
      });
    }
    vi.unstubAllGlobals();
  });

  test('beacons (dsn, JSON.stringify(batch)) exactly once when a batch is pending', () => {
    const sendBeacon = installSendBeacon(() => true);

    const sink = createRemoteSink({
      dsn: DSN,
      client: makeStubClient(),
    });

    // < MAX_BATCH (20) so the in-`emit` synchronous flush does not
    // pre-empt us — the batch must remain pending until flushBeacon
    // drains it.
    const records = [
      makeRecord({ level: 'warn', message: 'one' }),
      makeRecord({ level: 'error', message: 'two' }),
      makeRecord({ level: 'fatal', message: 'three' }),
    ];
    for (const r of records) sink.emit(r);

    sink.flushBeacon?.();

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const [calledDsn, calledBody] = sendBeacon.mock.calls[0];
    expect(calledDsn).toBe(DSN);
    expect(calledBody).toBe(JSON.stringify(records));

    // REQ 5.5 — sendBeacon-only path; no fetch fallback ever.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('drops the batch when sendBeacon returns false; subsequent emits start fresh', () => {
    const sendBeacon = installSendBeacon(() => false);

    const sink = createRemoteSink({
      dsn: DSN,
      client: makeStubClient(),
    });

    const firstBatch = [
      makeRecord({ message: 'a' }),
      makeRecord({ message: 'b' }),
    ];
    for (const r of firstBatch) sink.emit(r);

    expect(() => sink.flushBeacon?.()).not.toThrow();

    // sendBeacon was attempted once. No retry. No fetch fallback.
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(sendBeacon.mock.calls[0][1]).toBe(JSON.stringify(firstBatch));
    expect(fetchMock).not.toHaveBeenCalled();

    // The original batch is gone. Now flip sendBeacon to success and
    // emit a new record — the next flush MUST contain only that new
    // record, never the dropped first batch.
    sendBeacon.mockReturnValue(true);

    const secondBatch = [makeRecord({ message: 'c' })];
    for (const r of secondBatch) sink.emit(r);

    sink.flushBeacon?.();

    expect(sendBeacon).toHaveBeenCalledTimes(2);
    expect(sendBeacon.mock.calls[1][0]).toBe(DSN);
    expect(sendBeacon.mock.calls[1][1]).toBe(JSON.stringify(secondBatch));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('is a no-op when navigator.sendBeacon is undefined (no fetch fallback)', () => {
    delete (navigator as { sendBeacon?: unknown }).sendBeacon;

    const sink = createRemoteSink({
      dsn: DSN,
      client: makeStubClient(),
    });

    for (let i = 0; i < 5; i++) {
      sink.emit(makeRecord({ message: `r${i}` }));
    }

    expect(() => sink.flushBeacon?.()).not.toThrow();

    // REQ 5.5 — end-of-life is sendBeacon-only. No beacon → drop.
    expect(fetchMock).not.toHaveBeenCalled();

    // The pending batch was dropped. Re-install sendBeacon and call
    // flushBeacon again with no new emits: it must short-circuit on the
    // empty batch and NOT beacon stale records.
    const sendBeacon = installSendBeacon(() => true);
    sink.flushBeacon?.();
    expect(sendBeacon).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
