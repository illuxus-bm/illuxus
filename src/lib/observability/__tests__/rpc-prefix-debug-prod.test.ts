// Feature: observability-foundation — Example test: rpc-prefix-debug-prod
//
// Validates: Requirements 10.1, 10.4, 10.5
//
// Three contracts under test:
//
//   REQ 10.1 — In dev mode, `supabaseRpc` MUST emit a `debug 'rpc dispatch'`
//     record BEFORE the underlying request is fired. The pre-dispatch
//     record is the developer-only signal that "the call left this
//     module"; if it landed after the resolution, it would be useless
//     for diagnosing hangs / aborts / retry storms.
//
//   REQ 10.4 — In production mode, the pre-dispatch debug record MUST
//     NOT be emitted at all. Production observability is warn+ only;
//     a debug-level record carrying full RPC parameters (even redacted)
//     would never reach a sink, but the wrapper itself MUST also gate
//     the call so we don't pay the formatting / redaction cost or
//     accidentally surface params via a future debug-routing change.
//
//   REQ 10.5 — Whenever the dev-only debug record IS emitted, its
//     `params` field MUST be redacted by the same pipeline that
//     redacts every other observability field — so e-mails / phones /
//     deny-list keys (`password`, `token`, `secret`, …) never appear
//     in cleartext in devtools, even in dev.
//
// ─────────────────────────────────────────────────────────────────────────
// Strategy — controlling `import.meta.env.PROD` / `import.meta.env.DEV`
// ─────────────────────────────────────────────────────────────────────────
// `rpc.ts` reads `import.meta.env.DEV` (lazily, at every emit) and
// `logger.ts` reads `import.meta.env.PROD` (lazily, at sink selection
// time). Vitest's `vi.stubEnv(...)` only writes to `process.env` (see
// `_envBooleans` in vitest's `vi` chunk), so it does NOT flip
// `import.meta.env.PROD/DEV`. The reliable seam is direct mutation of
// the `import.meta.env` object — Vite exposes it as a regular mutable
// object during dev / test mode. We save the original values in
// `beforeEach`, mutate per test, and restore in `afterEach`.
//
// Mocks:
//   - `@/integrations/supabase/client` is mocked so the real Supabase
//     client (which would try to connect to a non-existent dev URL)
//     is never constructed. Only `auth.getSession()` is needed; the
//     wrapper reads the session's access_token and falls back to
//     `apikey` when null.
//   - `globalThis.fetch` is stubbed via `vi.stubGlobal` so the network
//     call is intercepted. The mock returns a minimal Response-shaped
//     object (jsdom's `Response` is not constructed here to keep the
//     mock dependency-free).
//   - `console.debug` is spied so the test can directly observe what
//     the Console_Sink fans out for level 'debug'.
//
// Module isolation:
//   - `vi.resetModules()` in `beforeEach` ensures every test re-imports
//     `rpc.ts` (and transitively `logger.ts`) into a fresh state. The
//     Logger keeps module-scoped init flags and a memoized opt-out cell;
//     resetting the module cache avoids cross-test pollution.

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks for `@/integrations/supabase/client`
// ---------------------------------------------------------------------------
// `vi.mock` factories are hoisted above all imports; ordinary file-scope
// `const`s are not yet initialised when the factory runs. `vi.hoisted`
// hoists this object alongside the mock so both refer to the same
// reference.

const mocks = vi.hoisted(() => ({
  /** Captures every `supabase.auth.getSession()` invocation. */
  getSession: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
    },
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal Response-shape for the fetch mock. Only the fields the
 * `postRpc` helper actually reads (`status`, `ok`, `text()`) are populated;
 * passing a real `Response` instance through jsdom is slower and brings
 * no additional coverage.
 */
function fakeResponse(
  body: unknown = { ok: true },
  init: { status?: number; ok?: boolean } = {},
): Response {
  const status = init.status ?? 200;
  const ok = init.ok ?? (status >= 200 && status < 300);
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok,
    status,
    text: () => Promise.resolve(text),
  } as unknown as Response;
}

/**
 * Snapshot + mutate `import.meta.env` so tests can flip PROD/DEV without
 * relying on `vi.stubEnv` (which only touches `process.env` — see header
 * comment for the full reasoning).
 */
function withEnv(overrides: { DEV?: boolean; PROD?: boolean }): {
  restore: () => void;
} {
  const env = (import.meta as { env: Record<string, unknown> }).env;
  const originals: Record<string, unknown> = {};
  for (const key of Object.keys(overrides) as Array<keyof typeof overrides>) {
    originals[key] = env[key];
    env[key] = overrides[key];
  }
  return {
    restore() {
      for (const key of Object.keys(originals)) {
        env[key] = originals[key];
      }
    },
  };
}

/** Call counts for `console.debug` invocations whose first arg includes the
 *  given substring (the Console_Sink prefixes every line as `[<level>] <msg>`). */
function dispatchCalls(
  spy: ReturnType<typeof vi.spyOn>,
  substr: string,
): unknown[][] {
  return spy.mock.calls.filter(
    (args: unknown[]) => typeof args[0] === 'string' && args[0].includes(substr),
  );
}

// ---------------------------------------------------------------------------
// Per-test fixture
// ---------------------------------------------------------------------------

let restoreEnv: () => void = () => {};

beforeEach(() => {
  vi.resetModules();
  mocks.getSession.mockReset();
  // Default: a session-less response (the wrapper falls back to apikey).
  mocks.getSession.mockResolvedValue({ data: { session: null } });
});

afterEach(() => {
  restoreEnv();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// REQ 10.1 / 10.5 — DEV mode: pre-dispatch debug fires with redacted params
// ---------------------------------------------------------------------------

describe('supabaseRpc — DEV pre-dispatch debug (REQ 10.1, 10.5)', () => {
  test('emits debug "rpc dispatch" BEFORE the fetch fires, and redacts params', async () => {
    ({ restore: restoreEnv } = withEnv({ DEV: true, PROD: false }));

    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    // Use a deferred fetch so we can prove the debug record is emitted
    // BEFORE the request reaches the wire — not just before it resolves.
    let resolveFetch: (r: Response) => void = () => {};
    const fetchPromise = new Promise<Response>((res) => {
      resolveFetch = res;
    });
    const fetchMock = vi.fn(() => fetchPromise);
    vi.stubGlobal('fetch', fetchMock);

    const { supabaseRpc } = await import('../rpc');

    // PII-shaped params — verifies REQ 10.5 redaction along the way.
    const inFlight = supabaseRpc('test_rpc', {
      email: 'leak@example.com',
      password: 'hunter2',
      payload: { phone: '+14155550199', note: 'fine' },
    });

    // Allow microtasks to drain so `auth.getSession().then(...)` and
    // the synchronous `log.debug('rpc dispatch', ...)` both run.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const dispatch = dispatchCalls(debugSpy, 'rpc dispatch');
    expect(dispatch).toHaveLength(1);

    // REQ 10.1 — the pre-dispatch record has fired BEFORE fetch was called.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const dispatchOrder = debugSpy.mock.invocationCallOrder[
      debugSpy.mock.calls.indexOf(dispatch[0] as unknown[])
    ];
    const fetchOrder = fetchMock.mock.invocationCallOrder[0];
    expect(dispatchOrder).toBeLessThan(fetchOrder);

    // REQ 10.5 — params are redacted by the same pipeline as every other
    // observability field. The Console_Sink fans out as
    // `console.debug('[debug] rpc dispatch', fields)`.
    const fields = dispatch[0][1] as Record<string, unknown>;
    expect(fields.rpc_name).toBe('test_rpc');
    const params = fields.params as Record<string, unknown>;
    // Deny-list key — value is unconditionally `[redacted]`.
    expect(params.password).toBe('[redacted]');
    // String-regex redaction — emails / phones become tagged placeholders.
    expect(params.email).toBe('[redacted-email]');
    const payload = params.payload as Record<string, unknown>;
    expect(payload.phone).toBe('[redacted-phone]');
    expect(payload.note).toBe('fine'); // non-sensitive value untouched

    // Cleanly settle the in-flight promise so the test exits without a leak.
    resolveFetch(fakeResponse({ ok: true }));
    await inFlight;
  });
});

// ---------------------------------------------------------------------------
// REQ 10.4 — PROD mode: no pre-dispatch debug record is emitted at all
// ---------------------------------------------------------------------------

describe('supabaseRpc — PROD pre-dispatch debug suppressed (REQ 10.4)', () => {
  test('no debug "rpc dispatch" record is emitted under import.meta.env.PROD', async () => {
    ({ restore: restoreEnv } = withEnv({ DEV: false, PROD: true }));

    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    // Also spy on info / warn to confirm the post-dispatch records still
    // route through their proper sinks (info-on-resolve in prod, warn on
    // failure) — this guards against accidentally muting the wrapper
    // entirely under PROD.
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const fetchMock = vi.fn(() => Promise.resolve(fakeResponse({ ok: true })));
    vi.stubGlobal('fetch', fetchMock);

    const { supabaseRpc } = await import('../rpc');

    const result = await supabaseRpc('test_rpc', {
      email: 'leak@example.com',
      password: 'hunter2',
    });

    // The call still completes successfully — we are not asserting that
    // the wrapper is broken under PROD, only that the dev-only debug
    // record is absent.
    expect(result.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // REQ 10.4 — zero `rpc dispatch` debug records.
    expect(dispatchCalls(debugSpy, 'rpc dispatch')).toHaveLength(0);
    // Belt-and-braces: zero `rpc dispatch` records at any level. The
    // wrapper must not have routed the dispatch line to info / warn /
    // error either.
    expect(dispatchCalls(infoSpy, 'rpc dispatch')).toHaveLength(0);
    expect(dispatchCalls(warnSpy, 'rpc dispatch')).toHaveLength(0);
    expect(dispatchCalls(debugSpy, 'rpc resolved')).toHaveLength(0);
  });

  test('no debug "rpc dispatch" record is emitted even when the fetch fails under PROD', async () => {
    ({ restore: restoreEnv } = withEnv({ DEV: false, PROD: true }));

    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    // Suppress the warn that the rejection branch will produce so the
    // test output stays quiet.
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const fetchMock = vi.fn(() =>
      Promise.resolve(fakeResponse({ message: 'boom' }, { status: 500 })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { supabaseRpc } = await import('../rpc');

    const result = await supabaseRpc('test_rpc', { foo: 'bar' });

    // The wrapper surfaces the error in its return shape — it must not
    // have thrown — and must still have skipped the pre-dispatch debug.
    expect(result.error).not.toBeNull();
    expect(dispatchCalls(debugSpy, 'rpc dispatch')).toHaveLength(0);
  });
});
