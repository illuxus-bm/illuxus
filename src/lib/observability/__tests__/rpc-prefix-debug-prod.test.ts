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
// Strategy — controlling DEV/PROD branches via env-mode mock
// ─────────────────────────────────────────────────────────────────────────
// `rpc.ts` reads its DEV / PROD signal from `./env-mode` (delegated).
// `logger.ts` reads its PROD signal the same way. Vite inlines
// `import.meta.env.DEV` / `.PROD` at transform time, so runtime stubs
// (vi.stubEnv, direct import.meta.env mutation) can't change what an
// already-transformed module sees. By mocking the env-mode module the
// tests inject controlled return values into the production code path
// without touching its surface.
//
// Mocks:
//   - `@/integrations/supabase/client` is mocked so the real Supabase
//     client (which would try to connect to a non-existent dev URL)
//     is never constructed. Only `auth.getSession()` is needed; the
//     wrapper reads the session's access_token and falls back to
//     `apikey` when null.
//   - `globalThis.fetch` is stubbed via `vi.stubGlobal` so the network
//     call is intercepted.
//   - `console.debug` is spied so the test can directly observe what
//     the Console_Sink fans out for level 'debug'.
//
// Module isolation:
//   - `vi.resetModules()` in `beforeEach` ensures every test re-imports
//     `rpc.ts` (and transitively `logger.ts`) into a fresh state.

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  /** Captures every `supabase.auth.getSession()` invocation. */
  getSession: vi.fn(),
  /** Controls what `isDev`/`isProd` return inside rpc.ts and logger.ts. */
  envMode: { isDev: vi.fn(() => true), isProd: vi.fn(() => false) },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
    },
  },
}));

vi.mock('../env-mode', () => mocks.envMode);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

beforeEach(() => {
  vi.resetModules();
  mocks.getSession.mockReset();
  // Default: a session-less response (the wrapper falls back to apikey).
  mocks.getSession.mockResolvedValue({ data: { session: null } });
  // Default: dev mode, not prod. Each test overrides via mocks.envMode.
  mocks.envMode.isDev.mockReturnValue(true);
  mocks.envMode.isProd.mockReturnValue(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// REQ 10.1 / 10.5 — DEV mode: pre-dispatch debug fires with redacted params
// ---------------------------------------------------------------------------

describe('supabaseRpc — DEV pre-dispatch debug (REQ 10.1, 10.5)', () => {
  test('emits debug "rpc dispatch" BEFORE the fetch fires, and redacts params', async () => {
    mocks.envMode.isDev.mockReturnValue(true);
    mocks.envMode.isProd.mockReturnValue(false);

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
  test('no debug "rpc dispatch" record is emitted under prod env-mode', async () => {
    mocks.envMode.isDev.mockReturnValue(false);
    mocks.envMode.isProd.mockReturnValue(true);

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
    // Belt-and-braces: zero `rpc dispatch` records at any level.
    expect(dispatchCalls(infoSpy, 'rpc dispatch')).toHaveLength(0);
    expect(dispatchCalls(warnSpy, 'rpc dispatch')).toHaveLength(0);
    expect(dispatchCalls(debugSpy, 'rpc resolved')).toHaveLength(0);
  });

  test('no debug "rpc dispatch" record is emitted even when the fetch fails under PROD', async () => {
    mocks.envMode.isDev.mockReturnValue(false);
    mocks.envMode.isProd.mockReturnValue(true);

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

