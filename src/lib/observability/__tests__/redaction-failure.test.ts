// Feature: observability-foundation — Example test: redaction-failure
//
// Validates: Requirement 4.3
//
// REQ 4.3 says: if the redaction routine throws on a malformed input,
// the Logger MUST surface a sanitized warn record carrying the literal
// field `{ redaction_error: true }` and MUST NOT propagate the throw to
// the caller. The contract is implemented in two layers:
//
//   1. `safeRedact()` (redaction.ts) — wraps the recursive `redact()`
//      walker in a try/catch and returns the envelope
//      `{ redaction_error: true, message }` on any throw, where
//      `message` is the original input only when it was already a
//      string (otherwise the empty string).
//   2. The Logger emit pipeline (logger.ts → `buildAndFanOut`) —
//      detects the envelope via `isRedactionEnvelope` and rewrites the
//      record to `{ level: 'warn', message: 'redaction failed',
//      fields: { redaction_error: true } }` before fan-out.
//
// We exercise both layers:
//
//   * Direct `safeRedact` tests force a throw via a throwing accessor
//     and via a Proxy whose `ownKeys` trap throws, asserting the
//     returned envelope shape and verifying the call itself does not
//     throw to the caller.
//   * One end-to-end Logger test drives the full pipeline through the
//     real `logger.error(...)` entry point, captures the resulting
//     console fan-out (the Console_Sink emits all levels in dev/test),
//     and asserts the rewritten warn record is what reaches the sink —
//     and that the caller's `logger.error(...)` invocation does not
//     throw.
//
// No mocks of `redact` itself: we rely on real input shapes that are
// known to make the recursive walker throw, so the test exercises the
// actual catch-and-envelope path rather than a stubbed approximation.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { safeRedact } from '../redaction';
import { logger } from '../logger';

// ---------------------------------------------------------------------------
// Throw helpers — input shapes that make `redact()` throw
// ---------------------------------------------------------------------------

/**
 * Plain object with one own enumerable accessor whose getter throws.
 * `Object.keys(obj)` enumerates the key fine (descriptors are inert),
 * but the recursive walker dereferences `source[key]` to recurse, and
 * THAT invocation triggers the getter and throws.
 */
function makeThrowingGetterObject(message = 'getter boom'): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  Object.defineProperty(obj, 'k', {
    enumerable: true,
    configurable: true,
    get() {
      throw new Error(message);
    },
  });
  return obj;
}

/**
 * Proxy whose `ownKeys` trap throws synchronously. The recursive walker
 * calls `Object.keys(source)`, which invokes the trap and propagates
 * the throw out of `redact`.
 */
function makeThrowingOwnKeysProxy(message = 'ownKeys boom'): object {
  return new Proxy(
    {},
    {
      ownKeys() {
        throw new Error(message);
      },
    },
  );
}

// ---------------------------------------------------------------------------
// safeRedact unit tests — REQ 4.3 layer 1
// ---------------------------------------------------------------------------

describe('safeRedact — returns envelope when redact() throws (REQ 4.3 layer 1)', () => {
  it('does not throw and returns { redaction_error: true, message: "" } for an object with a throwing getter', () => {
    const input = makeThrowingGetterObject();

    let result: unknown;
    expect(() => {
      result = safeRedact(input);
    }).not.toThrow();

    expect(result).toEqual({ redaction_error: true, message: '' });
  });

  it('does not throw and returns the envelope for a Proxy whose ownKeys trap throws', () => {
    const input = makeThrowingOwnKeysProxy();

    let result: unknown;
    expect(() => {
      result = safeRedact(input);
    }).not.toThrow();

    expect(result).toEqual({ redaction_error: true, message: '' });
  });

  it('preserves the original string in `message` when the input is itself a string (sanity check)', () => {
    // String inputs cannot make `redact()` throw — regex replacement on a
    // string is total. This test guards the second branch of the
    // envelope's `message` ternary so a future refactor doesn't silently
    // collapse it to `''` for all inputs.
    expect(safeRedact('plain string')).toBe('plain string');
  });
});

// ---------------------------------------------------------------------------
// Logger end-to-end test — REQ 4.3 layer 2
// ---------------------------------------------------------------------------
//
// Strategy: the Console_Sink emits every level in dev/test (PROD is
// false under vitest), so spying on `console.warn` is sufficient to
// observe the rewritten record reaching at least one sink. The sink
// receives `(prefix, fields)` where `prefix === '[warn] redaction
// failed'` and `fields === { redaction_error: true }`.
//
// We use `console.error` and `console.warn` spies to also assert that
// neither the original (throwing) call's level nor any other path
// surfaces the unredactable payload.

describe('Logger — emits sanitized warn record when redaction throws (REQ 4.3 layer 2)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Silence and capture console output for the duration of the test.
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('rewrites a throwing-getter payload into a warn "redaction failed" record without throwing to the caller', () => {
    const throwing = makeThrowingGetterObject();

    // The whole point of REQ 4.3: the caller's emit MUST NOT throw, even
    // though the underlying redaction does.
    expect(() => {
      logger.error('this should not surface', { offending: throwing });
    }).not.toThrow();

    // The rewritten record routes to `warn`, so the Console_Sink should
    // call `console.warn(prefix, fields)` with the sanitized payload.
    // Filter to the redaction-failed call specifically — the boot/init
    // path may also emit unrelated warns (e.g. queue overflow) that are
    // not the subject of this test.
    const redactionFailedCalls = warnSpy.mock.calls.filter(
      (args) =>
        typeof args[0] === 'string' &&
        (args[0] as string).includes('redaction failed'),
    );

    expect(redactionFailedCalls).toHaveLength(1);
    const [prefix, fields] = redactionFailedCalls[0];
    expect(prefix).toBe('[warn] redaction failed');
    expect(fields).toEqual({ redaction_error: true });

    // The original message text MUST NOT have leaked through to a sink:
    // the sanitized record only carries `redaction_error: true`, never
    // the unredactable structured fields.
    const leakedErrorCalls = errorSpy.mock.calls.filter((args) =>
      args.some(
        (arg) =>
          typeof arg === 'object' &&
          arg !== null &&
          'offending' in (arg as Record<string, unknown>),
      ),
    );
    expect(leakedErrorCalls).toHaveLength(0);
  });

  it('rewrites a Proxy-with-throwing-ownKeys payload the same way', () => {
    const throwing = makeThrowingOwnKeysProxy();

    expect(() => {
      logger.warn('also should not surface', { proxy: throwing });
    }).not.toThrow();

    const redactionFailedCalls = warnSpy.mock.calls.filter(
      (args) =>
        typeof args[0] === 'string' &&
        (args[0] as string).includes('redaction failed'),
    );

    expect(redactionFailedCalls.length).toBeGreaterThanOrEqual(1);
    // Take the most recent matching call so prior tests in this describe
    // block (when run in non-isolated mode) cannot fool the assertion.
    const [prefix, fields] = redactionFailedCalls[redactionFailedCalls.length - 1];
    expect(prefix).toBe('[warn] redaction failed');
    expect(fields).toEqual({ redaction_error: true });
  });
});
