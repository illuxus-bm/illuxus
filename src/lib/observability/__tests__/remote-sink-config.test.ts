// Feature: observability-foundation — Remote_Sink BrowserClient configuration
//
// Validates: Requirements 8.5, 8.6, 8.10
//
// Two checks against `createRemoteSink` (sinks/remote.ts):
//
//   1. Constructor options. When the sink is built with a non-empty DSN
//      and the underlying SDK is allowed to materialise, the `BrowserClient`
//      MUST be constructed with:
//        - dsn matching the supplied value
//        - sendDefaultPii: false                            (REQ 8.5)
//        - defaultIntegrations: false (and integrations: []) (REQ 8.6)
//        - release matching `import.meta.env.VITE_BUILD_SHA`
//          (or the literal `'unknown'` when the env var is absent)
//        - beforeSend is a function (the redaction hook)
//        - beforeSendTransaction returns null (perf transactions disabled)
//
//   2. User scope. When a record with `user_id: 'abc'` is emitted, the
//      payload routed to the SDK MUST contain `user: { id: 'abc' }` and
//      nothing else — never email, never name (REQ 8.10).
//
// Strategy:
//   - The constructor-options check needs to observe the actual
//     `BrowserClient` constructor invocation, so we `vi.mock(...)` the
//     `@sentry/browser` package and substitute a fake class that records
//     every constructor argument into a hoisted array.
//   - `createRemoteSink` lazily constructs the client on the first batch
//     flush; we trigger that flush by emitting MAX_BATCH (20) records,
//     which is the synchronous flush trigger inside `emit()`.
//   - The user-scope check uses the cleaner seam exposed by the factory:
//     `createRemoteSink({ client })` injects a stub directly, bypassing
//     the SDK mock entirely, and lets us read the exact arguments
//     `dispatchRecord` would hand to Sentry.

import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { LogRecord } from '../sinks/types';

// ---------------------------------------------------------------------------
// Hoisted shared state — `vi.mock` factories cannot close over file-scope
// `let`/`const` declarations because the mock is hoisted above them. The
// `vi.hoisted` helper hoists this initializer alongside the mock so the
// factory and the tests reference the same array.
// ---------------------------------------------------------------------------

const { browserClientCalls } = vi.hoisted(() => ({
  browserClientCalls: [] as Array<Record<string, unknown>>,
}));

vi.mock('@sentry/browser', () => {
  class FakeBrowserClient {
    public readonly options: Record<string, unknown>;
    constructor(options: Record<string, unknown>) {
      this.options = options;
      browserClientCalls.push(options);
    }
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
    // The Remote_Sink wraps `makeFetchTransport` to capture HTTP statuses.
    // FakeBrowserClient never invokes the wrapped transport, so these
    // stubs only need to be importable — they are never called in this
    // test file.
    defaultStackParser: () => [],
    makeFetchTransport: () => () => ({
      send: () => Promise.resolve({ statusCode: 200 }),
      flush: () => Promise.resolve(true),
    }),
  };
});

// `remote.ts` imports `@sentry/browser` at module load time; the import
// below resolves through the mock above (`vi.mock` is hoisted by vitest
// regardless of the textual position of the static import).
// eslint-disable-next-line import/first
import { createRemoteSink } from '../sinks/remote';

// Mirror the constant in `sinks/remote.ts`. Synchronous flush only fires
// once the in-memory batch reaches this size, so each test emits exactly
// this many records to materialise the client / dispatch.
const MAX_BATCH = 20;

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

describe('Remote_Sink — BrowserClient construction options', () => {
  beforeEach(() => {
    browserClientCalls.length = 0;
  });

  test('lazily constructs BrowserClient with privacy / release options on first flush', async () => {
    const sink = createRemoteSink({ dsn: 'https://test@example.com/1' });

    // Lazy construction: nothing should hit the SDK before the first flush.
    expect(browserClientCalls).toHaveLength(0);

    // MAX_BATCH emits trigger an immediate synchronous batch flush, which
    // is the only call site that materialises the underlying client.
    for (let i = 0; i < MAX_BATCH; i++) sink.emit(makeRecord());

    expect(browserClientCalls).toHaveLength(1);
    const opts = browserClientCalls[0];

    // DSN is forwarded as-is.
    expect(opts.dsn).toBe('https://test@example.com/1');

    // REQ 8.5 — never opt into Sentry's default-PII collection.
    expect(opts.sendDefaultPii).toBe(false);

    // REQ 8.6 — zero default integrations (no auto-breadcrumbs of inputs)
    // and an empty explicit `integrations` list.
    expect(opts.defaultIntegrations).toBe(false);
    expect(opts.integrations).toEqual([]);

    // Release is `VITE_BUILD_SHA` when defined, else the literal 'unknown'.
    const expectedRelease =
      ((import.meta as { env?: Record<string, unknown> }).env
        ?.VITE_BUILD_SHA as string | undefined) ?? 'unknown';
    expect(opts.release).toBe(expectedRelease);

    // `beforeSend` is the redaction hook; we don't probe its behaviour
    // here (covered by Property 1) — only that it is wired as a function.
    expect(typeof opts.beforeSend).toBe('function');

    // `beforeSendTransaction` always returns null — perf transactions
    // are disabled per the design.
    expect(typeof opts.beforeSendTransaction).toBe('function');
    expect((opts.beforeSendTransaction as () => unknown)()).toBeNull();

    await sink.close?.();
  });
});

describe('Remote_Sink — user scope contains only { id }', () => {
  test('routes only `{ id }` to Sentry — never email or name (REQ 8.10)', async () => {
    const captureMessageCalls: Array<{
      message: string;
      level: unknown;
      hint: { captureContext?: Record<string, unknown> };
    }> = [];
    const captureExceptionCalls: Array<{
      err: unknown;
      hint: { captureContext?: Record<string, unknown> };
    }> = [];

    const stubClient = {
      captureException(
        err: unknown,
        hint: { captureContext?: Record<string, unknown> },
      ): string {
        captureExceptionCalls.push({ err, hint });
        return 'event-id';
      },
      captureMessage(
        message: string,
        level: unknown,
        hint: { captureContext?: Record<string, unknown> },
      ): string {
        captureMessageCalls.push({ message, level, hint });
        return 'event-id';
      },
      flush(): Promise<boolean> {
        return Promise.resolve(true);
      },
    };

    // Inject the stub directly via `opts.client` — the cleanest seam for
    // verifying dispatch behaviour without going through the SDK mock.
    const sink = createRemoteSink({
      dsn: 'https://test@example.com/1',
      client: stubClient,
    });

    // Even when the developer carelessly drops PII-shaped fields onto the
    // record, the user scope handed to Sentry must still contain only
    // `{ id }`. The Logger is what redacts string PII; the sink contract
    // here is purely about *which* fields it lifts onto `user`.
    for (let i = 0; i < MAX_BATCH; i++) {
      sink.emit(
        makeRecord({
          user_id: 'abc',
          fields: {
            user_id: 'abc',
            email: 'leak@example.com',
            name: 'Leak Name',
          },
        }),
      );
    }

    // All MAX_BATCH records routed through `captureMessage` (no Errors).
    expect(captureMessageCalls).toHaveLength(MAX_BATCH);
    expect(captureExceptionCalls).toHaveLength(0);

    for (const call of captureMessageCalls) {
      const user = call.hint.captureContext?.user as
        | Record<string, unknown>
        | undefined;
      // Exactly `{ id: 'abc' }` — no extra keys, no email, no name.
      expect(user).toEqual({ id: 'abc' });
      expect(Object.keys(user ?? {})).toEqual(['id']);
    }

    await sink.close?.();
  });

  test('omits user entirely when record.user_id is null', async () => {
    const captureMessageCalls: Array<{
      hint: { captureContext?: Record<string, unknown> };
    }> = [];

    const stubClient = {
      captureException(): string {
        return 'event-id';
      },
      captureMessage(
        _message: string,
        _level: unknown,
        hint: { captureContext?: Record<string, unknown> },
      ): string {
        captureMessageCalls.push({ hint });
        return 'event-id';
      },
      flush(): Promise<boolean> {
        return Promise.resolve(true);
      },
    };

    const sink = createRemoteSink({
      dsn: 'https://test@example.com/1',
      client: stubClient,
    });

    for (let i = 0; i < MAX_BATCH; i++) sink.emit(makeRecord({ user_id: null }));

    expect(captureMessageCalls).toHaveLength(MAX_BATCH);
    for (const call of captureMessageCalls) {
      // No user-id ⇒ no `user` payload at all (not `{}`, not `{ id: null }`).
      expect(call.hint.captureContext?.user).toBeUndefined();
    }

    await sink.close?.();
  });
});
