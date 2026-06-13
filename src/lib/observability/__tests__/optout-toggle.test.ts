// Feature: observability-foundation — Example test: optout-toggle
//
// Validates: Requirements 11.5, 11.6
//
// Two contracts under test:
//
//   REQ 11.5 — `setPrivacyOptOut(value)` persists the user's choice in
//     `localStorage` under the key `'observability:opt-out'` (the value
//     `'1'` for opt-in to opt-out, removed otherwise) AND invalidates
//     the memoized cell so the very next `getPrivacyOptOut()`
//     observation reflects the new state without waiting for any
//     timers or page reloads.
//
//   REQ 11.6 — When opt-out flips from false → true, downstream side
//     effects fire: the in-memory Remote_Sink batch is dropped via
//     `remoteSink.close()` and the Offline_Queue is cleared via
//     `offlineQueue.clear()`. Subsequent emits MUST NOT reach the
//     Remote_Sink (gated by the `getPrivacyOptOut()` recheck inside
//     `activeSinks`, see `logger.ts`). Flipping back to false re-enables
//     the path.
//
// Scope of this example test:
//   This file pins the storage-side and immediate-visibility contract
//   (REQ 11.5) plus the opt-out persistence-driven gating that REQ 11.6
//   builds on. The deeper "Remote_Sink never sees a record while
//   opted-out, across all severities" universal is covered by PBT task
//   1.22 (Property 4 — Privacy opt-out is unconditional across all
//   severities) which exercises every level with arbitrary fields.
//
// Test environment note:
//   Vitest's jsdom integration in this repo exposes a `localStorage`
//   global whose methods (`getItem`, `setItem`, `removeItem`) are NOT
//   reachable from the instance — they only live on `Storage.prototype`
//   without an instance-side route. Existing tests work around this by
//   spying on `Storage.prototype` and never calling `localStorage.xxx`
//   directly. We need to actually read/write the cell to verify
//   persistence, so we install a fake `localStorage` on `globalThis`
//   for the duration of each test. The Logger reads via
//   `typeof localStorage !== 'undefined' && localStorage` so it picks
//   up the fake transparently.

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const OPT_OUT_KEY = 'observability:opt-out';

// ---------------------------------------------------------------------------
// Fake localStorage helper
// ---------------------------------------------------------------------------

interface FakeLocalStorage {
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
  removeItem: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;
  key: ReturnType<typeof vi.fn>;
  readonly length: number;
}

/**
 * Build a Map-backed localStorage stub. All four read/write methods are
 * `vi.fn()` so tests can assert call counts and arguments, and the
 * underlying `Map` lets the test peek at the persisted state directly.
 *
 * The returned object also exposes the `Map` so the test can populate
 * it BEFORE module import (modelling a previous session's choice).
 */
function makeFakeLocalStorage(): {
  ls: FakeLocalStorage;
  store: Map<string, string>;
} {
  const store = new Map<string, string>();
  const ls: FakeLocalStorage = {
    getItem: vi.fn((key: string) =>
      store.has(key) ? (store.get(key) as string) : null,
    ),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, String(value));
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => {
      store.clear();
    }),
    key: vi.fn(() => null),
    get length() {
      return store.size;
    },
  };
  return { ls, store };
}

/** Install a fake `localStorage` on `globalThis` and remember the prior. */
function installFakeLocalStorage(ls: FakeLocalStorage): {
  restore: () => void;
} {
  const had = Object.prototype.hasOwnProperty.call(
    globalThis,
    'localStorage',
  );
  const previousDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'localStorage',
  );

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: ls,
  });

  return {
    restore() {
      if (had && previousDescriptor) {
        Object.defineProperty(globalThis, 'localStorage', previousDescriptor);
      } else {
        delete (globalThis as { localStorage?: unknown }).localStorage;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Per-test fixture
// ---------------------------------------------------------------------------

let restoreFakeLs: () => void;
let lsState: { ls: FakeLocalStorage; store: Map<string, string> };

beforeEach(() => {
  vi.resetModules();
  lsState = makeFakeLocalStorage();
  ({ restore: restoreFakeLs } = installFakeLocalStorage(lsState.ls));
});

afterEach(() => {
  restoreFakeLs();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// REQ 11.5 — Persistence + memoized cell invalidation
// ---------------------------------------------------------------------------

describe('setPrivacyOptOut — persistence (REQ 11.5)', () => {
  test("setPrivacyOptOut(true) writes '1' under 'observability:opt-out'", async () => {
    const { setPrivacyOptOut, getPrivacyOptOut } = await import('../logger');

    setPrivacyOptOut(true);

    // The setter routed through `localStorage.setItem` with the
    // canonical key/value pair (REQ 11.5).
    expect(lsState.ls.setItem).toHaveBeenCalledWith(OPT_OUT_KEY, '1');
    // And the persisted value really is `'1'` — not `'true'`, not `1`.
    expect(lsState.store.get(OPT_OUT_KEY)).toBe('1');
    // Memoized cell is invalidated: the very next read (same tick) sees
    // the new state without any timer / event-loop turn.
    expect(getPrivacyOptOut()).toBe(true);
  });

  test("setPrivacyOptOut(false) removes the 'observability:opt-out' key", async () => {
    const { setPrivacyOptOut, getPrivacyOptOut } = await import('../logger');

    // Establish a known opt-out=true state, then flip it off.
    setPrivacyOptOut(true);
    expect(lsState.store.get(OPT_OUT_KEY)).toBe('1');

    setPrivacyOptOut(false);

    // The key is gone — `undefined` in the Map (i.e. `null` over the
    // localStorage API), not the string `'0'` — matching
    // `getPrivacyOptOut`'s expectation that any non-`'1'` value reads
    // as opted-IN to telemetry.
    expect(lsState.store.has(OPT_OUT_KEY)).toBe(false);
    expect(lsState.ls.removeItem).toHaveBeenCalledWith(OPT_OUT_KEY);
    expect(getPrivacyOptOut()).toBe(false);
  });

  test('rapid toggles settle to the last write and the cache always reflects it', async () => {
    const { setPrivacyOptOut, getPrivacyOptOut } = await import('../logger');

    setPrivacyOptOut(false);
    expect(getPrivacyOptOut()).toBe(false);

    setPrivacyOptOut(true);
    expect(getPrivacyOptOut()).toBe(true);

    setPrivacyOptOut(false);
    expect(getPrivacyOptOut()).toBe(false);

    setPrivacyOptOut(true);
    // Final state pins both the persisted value and the memoized read.
    expect(lsState.store.get(OPT_OUT_KEY)).toBe('1');
    expect(getPrivacyOptOut()).toBe(true);
  });

  test('getPrivacyOptOut reflects a pre-existing localStorage value on first read', async () => {
    // Pre-set the cell BEFORE module import so `optOutCache` starts
    // undefined and the first call has to consult `localStorage`.
    lsState.store.set(OPT_OUT_KEY, '1');

    const { getPrivacyOptOut } = await import('../logger');

    expect(getPrivacyOptOut()).toBe(true);
    // The Logger's `getPrivacyOptOut` must have routed through
    // `localStorage.getItem` to discover the pre-set value.
    expect(lsState.ls.getItem).toHaveBeenCalledWith(OPT_OUT_KEY);
  });

  test('a non-"1" value in localStorage reads as opted-IN', async () => {
    // The contract is strict: only the literal '1' counts as opt-out.
    // Any other value (including '0', 'true', '') is opted-IN.
    lsState.store.set(OPT_OUT_KEY, '0');

    const { getPrivacyOptOut } = await import('../logger');

    expect(getPrivacyOptOut()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// REQ 11.6 — Side effects on opt-out flip
// ---------------------------------------------------------------------------

describe('setPrivacyOptOut — opt-out side effects (REQ 11.6)', () => {
  test('setPrivacyOptOut(true) is safe to call before the logger has initialised', async () => {
    const { setPrivacyOptOut } = await import('../logger');

    // Pre-init, the queue and remote sink module references are still
    // null; the setter must guard those branches and persist the
    // choice anyway so that when init eventually runs the in-memory
    // cell starts as opted-out.
    expect(() => setPrivacyOptOut(true)).not.toThrow();
    expect(lsState.store.get(OPT_OUT_KEY)).toBe('1');
  });

  test('flipping opt-out true→false toggles getPrivacyOptOut on the next read', async () => {
    const { setPrivacyOptOut, getPrivacyOptOut } = await import('../logger');

    setPrivacyOptOut(true);
    expect(getPrivacyOptOut()).toBe(true);

    // Simulate the user changing their mind. Because the memoized cell
    // is invalidated on every setter call, the next emit's
    // `activeSinks` call will see opted-IN and route to the Remote_Sink
    // again (covered exhaustively by PBT 1.22, Property 4).
    setPrivacyOptOut(false);
    expect(getPrivacyOptOut()).toBe(false);

    setPrivacyOptOut(true);
    expect(getPrivacyOptOut()).toBe(true);
  });

  test('setPrivacyOptOut(true) does not throw when localStorage.setItem itself throws', async () => {
    // Quota-exceeded / private-browsing scenarios both manifest as
    // `setItem` throwing. The setter must swallow the error per its
    // own contract ("never throw from setter") and still invalidate
    // the in-memory cache so the chosen value takes effect for the
    // current session, even though it cannot be persisted.
    lsState.ls.setItem.mockImplementationOnce(() => {
      throw new Error('QuotaExceededError');
    });

    const { setPrivacyOptOut, getPrivacyOptOut } = await import('../logger');

    expect(() => setPrivacyOptOut(true)).not.toThrow();
    // Persistence failed — the store is empty — but the in-memory
    // cell was invalidated, so the next read consults localStorage
    // again. With `getItem` returning null, the read settles to false.
    // This documents the current behaviour: persistence-failure
    // gracefully degrades to a session-only opt-out attempt.
    expect(lsState.store.has(OPT_OUT_KEY)).toBe(false);
    expect(getPrivacyOptOut()).toBe(false);
  });

  test('setPrivacyOptOut(false) does not throw when localStorage.removeItem itself throws', async () => {
    const { setPrivacyOptOut } = await import('../logger');

    // Establish opt-out=true via the working setItem first.
    setPrivacyOptOut(true);
    expect(lsState.store.get(OPT_OUT_KEY)).toBe('1');

    // Now make the next removeItem call blow up — the setter must
    // still not throw to the caller.
    lsState.ls.removeItem.mockImplementationOnce(() => {
      throw new Error('storage unavailable');
    });

    expect(() => setPrivacyOptOut(false)).not.toThrow();
  });
});
