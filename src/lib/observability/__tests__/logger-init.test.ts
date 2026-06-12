// Feature: observability-foundation — Example test: logger-init
//
// Validates: Requirements 1.1, 1.5, 1.6
//
// Three contracts under test:
//
//   REQ 1.1 — Import shape. The `logger` exported from
//     `src/lib/observability/logger` exposes exactly six emit methods
//     (`trace`, `debug`, `info`, `warn`, `error`, `fatal`) plus a
//     `child(fields)` factory, all of which are functions. `child()`
//     returns a Logger with the same shape.
//
//   REQ 1.5 — Lazy init / no I/O at module-load time. Importing the
//     module performs zero network or storage I/O. We assert two
//     observables here:
//       (a) the opt-out localStorage key is never read during the
//           import — there is no early `getPrivacyOptOut()` call;
//       (b) the lazy-init effects (registering `pagehide` and
//           `visibilitychange` flush listeners) have NOT happened
//           before the first emit, and HAVE happened after it. This
//           is a build-mode-independent signal that init is deferred.
//
//   REQ 1.6 — The Logger never throws to the caller. The full
//     "force first init throw" rig would require exposing internal
//     seams that aren't there today; we cover the broader resilience
//     property by emitting a mix of malformed values (cyclic objects,
//     deeply nested fields beyond the redaction depth cap, large
//     strings, Errors, undefined-fields edge calls, and child() with
//     malformed bound fields) and asserting no throw escapes. The
//     dedicated PBT (task 1.21, Property 2) carries the exhaustive
//     version of this property — including pathological cases like
//     throwing-getter property descriptors that interact with object
//     spread before any sink-level safeguard can engage.
//
// Test isolation:
//   - `vi.resetModules()` in `beforeEach` ensures each test sees a
//     fresh logger module with `initialized = false`, an empty boot
//     buffer, and a cleared `optOutCache`.
//   - The localStorage spy is installed BEFORE the dynamic import so
//     module-load-time I/O would be visible if it existed.
//   - The opt-out cache key (`'observability:opt-out'`) is the only
//     key whose reads we count; other modules sharing jsdom's
//     localStorage cannot pollute the assertion.

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const OPT_OUT_KEY = 'observability:opt-out';

/**
 * Counts only those `localStorage.getItem` calls that target the
 * privacy opt-out key. The Logger is the only module in this repo that
 * reads that key, so the count is a clean signal even under a shared
 * jsdom localStorage instance.
 */
function optOutReadCount(spy: ReturnType<typeof vi.spyOn>): number {
  return spy.mock.calls.filter(
    (args: unknown[]) => args[0] === OPT_OUT_KEY,
  ).length;
}

// ---------------------------------------------------------------------------
// REQ 1.1 — Import shape
// ---------------------------------------------------------------------------

describe('Logger — import shape (REQ 1.1)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test('exposes six emit methods plus child(), all functions', async () => {
    const { logger } = await import('../logger');

    expect(typeof logger.trace).toBe('function');
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.fatal).toBe('function');
    expect(typeof logger.child).toBe('function');
  });

  test('child() returns a Logger with the same six methods plus child()', async () => {
    const { logger } = await import('../logger');

    const scoped = logger.child({ scope: 'test' });
    expect(typeof scoped.trace).toBe('function');
    expect(typeof scoped.debug).toBe('function');
    expect(typeof scoped.info).toBe('function');
    expect(typeof scoped.warn).toBe('function');
    expect(typeof scoped.error).toBe('function');
    expect(typeof scoped.fatal).toBe('function');
    expect(typeof scoped.child).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// REQ 1.5 — Lazy init: no I/O at module-load time
// ---------------------------------------------------------------------------

describe('Logger — no I/O at module-load time (REQ 1.5)', () => {
  let getItemSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    // Spy installed BEFORE the dynamic import so any module-load-time
    // read would be observable. `getItem` lives on `Storage.prototype`,
    // not on the `localStorage` instance, so we spy on the prototype —
    // calls from any Storage instance flow through it.
    getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
  });

  afterEach(() => {
    getItemSpy.mockRestore();
  });

  test('importing the logger module never reads the opt-out key', async () => {
    await import('../logger');

    // Init is lazy; the opt-out cell is only consulted during emit.
    expect(optOutReadCount(getItemSpy)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// REQ 1.5 — First emit triggers init / lazy-init effects observable
// ---------------------------------------------------------------------------

describe('Logger — first emit triggers init (REQ 1.5)', () => {
  let windowAddSpy: ReturnType<typeof vi.spyOn>;
  let documentAddSpy: ReturnType<typeof vi.spyOn>;

  function flushListenerInstalls(
    spy: ReturnType<typeof vi.spyOn>,
    eventName: string,
  ): number {
    return spy.mock.calls.filter((args: unknown[]) => args[0] === eventName)
      .length;
  }

  beforeEach(() => {
    vi.resetModules();
    // Install the spies BEFORE the dynamic import so any listener
    // registered at module-load time would be visible.
    windowAddSpy = vi.spyOn(globalThis, 'addEventListener');
    documentAddSpy = vi.spyOn(document, 'addEventListener');
  });

  afterEach(() => {
    windowAddSpy.mockRestore();
    documentAddSpy.mockRestore();
  });

  test('importing the module installs no flush listeners; first emit installs them', async () => {
    const { logger } = await import('../logger');

    // Pre-emit: lazy init has not run, so neither `pagehide` nor
    // `visibilitychange` is registered.
    expect(flushListenerInstalls(windowAddSpy, 'pagehide')).toBe(0);
    expect(flushListenerInstalls(documentAddSpy, 'visibilitychange')).toBe(0);

    // First emit at any level triggers `doInit()` which calls
    // `installFlushListeners()`.
    logger.info('first emit');

    // Post-emit: both listeners are now present. We assert >= 1
    // rather than == 1 so the test isn't fragile against environments
    // where additional listeners get added by other init steps.
    expect(flushListenerInstalls(windowAddSpy, 'pagehide')).toBeGreaterThanOrEqual(1);
    expect(
      flushListenerInstalls(documentAddSpy, 'visibilitychange'),
    ).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// REQ 1.6 — Resilience: malformed inputs do not surface throws
// ---------------------------------------------------------------------------

describe('Logger — never throws under malformed inputs (REQ 1.6)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test('cyclic objects, oversized and deeply nested values are all swallowed', async () => {
    const { logger } = await import('../logger');

    // Cyclic graph — defeats naive JSON serialisers.
    const cyclic: Record<string, unknown> = { name: 'cyclic' };
    cyclic.self = cyclic;

    // Deeply nested object that exceeds the redaction depth cap.
    const deep: Record<string, unknown> = {};
    let cursor: Record<string, unknown> = deep;
    for (let i = 0; i < 16; i++) {
      const next: Record<string, unknown> = {};
      cursor.next = next;
      cursor = next;
    }
    cursor.leaf = 'bottom';

    // Oversized string field.
    const huge = 'x'.repeat(64_000);

    expect(() => {
      logger.trace('plain message', { ok: true });
      logger.debug('cyclic field', { ring: cyclic });
      logger.warn('error in fields', { error: new Error('boom') });
      logger.error('huge string', { big: huge });
      logger.fatal('deep nesting', { tree: deep });

      // Edge calls: empty message, undefined fields, no fields.
      logger.info('');
      logger.info('no fields');
      logger.warn('explicit undefined fields', undefined);

      // child() with malformed bound fields, then emit through it.
      const scoped = logger.child({ ring: cyclic });
      scoped.warn('child emit', { extra: cyclic });
      scoped.error('child error', { error: new Error('child boom') });

      // Per-call fields override bound fields on key collision —
      // exercise that path with malformed values on both sides.
      const scoped2 = logger.child({ ring: 'bound' });
      scoped2.info('override', { ring: cyclic });
    }).not.toThrow();
  });
});
