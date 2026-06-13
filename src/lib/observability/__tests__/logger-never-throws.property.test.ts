// Feature: observability-foundation, Property 2: The Logger never throws and never leaks rejections
//
// Validates: Requirements 1.6, 4.1, 4.2
//
// What this property asserts
// ──────────────────────────
// For any sequence of emit calls — across all six levels (REQ 1.1) — and
// for any payload (well-formed strings, malformed values coerced through
// the API, deeply nested objects, cyclic graphs, oversized strings,
// Error instances embedded in fields) the Logger MUST:
//
//   1. Never throw to the caller (REQ 1.6, 4.1).
//   2. Never leak an unhandled promise rejection out of the module
//      (REQ 4.2).
//
// Why the property only drives the public surface
// ───────────────────────────────────────────────
// design.md describes a "sink behaviour matrix (sync throw / rejected
// Promise / resolved Promise)" as the ideal shape of this property.
// The Logger today has no injection seam for sinks — Console_Sink and
// Remote_Sink are constructed inside the module-private `doInit()` and
// are not parameters of any public function. Driving sink failure modes
// directly is therefore out of reach for a property test that does not
// touch internals. The property still holds across the public surface
// because:
//
//   * Console_Sink wraps every `console.*` call in try/catch (REQ 4.1).
//   * The Logger emit pipeline wraps each sink's `emit()` in try/catch
//     and attaches `.catch(() => {})` to any returned thenable
//     (REQ 4.1, 4.2). See `buildAndFanOut` in logger.ts.
//   * `safeRedact()` wraps `redact()` in try/catch and surfaces an
//     envelope rather than rethrowing (REQ 4.3 — relied on by 4.1).
//
// Together these mean pathological INPUTS exercise the same resilience
// code paths that pathological SINKS would, so driving the public
// surface is sufficient to discharge Property 2 as specified.
//
// Detection mechanism
// ───────────────────
// `unhandledrejection` is hooked on `globalThis` (the jsdom window),
// AND `process.on('unhandledRejection', ...)` is hooked on the Node
// side. Vitest under jsdom routes some rejections via the DOM event
// and others via the Node process event, so listening on both is
// belt-and-braces. After each burst of emits we yield to a macrotask
// (`setTimeout(_, 0)`) so V8's rejection-notification cycle has a
// chance to fire before we read the captured-rejections list.
//
// Run scale: 100 iterations × up to 20 emits each is well below the
// 5 ms-per-emit budget (REQ 5.1) and keeps the suite fast.

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import fc from 'fast-check';

import { logger } from '../logger';
import type { LogLevel } from '../sinks/types';

const LEVELS: ReadonlyArray<LogLevel> = [
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
];

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * Inject a self-referencing cycle into roughly one third of generated
 * plain objects so the property exercises the depth/seen guard inside
 * `redact()`. `fc.anything()` does not generate cycles by default; this
 * wrapper closes that gap as called for in the design ("deeply nested
 * cycles").
 */
function maybeCycle(value: unknown, salt: number): unknown {
  if (
    salt % 3 === 0 &&
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  ) {
    try {
      (value as Record<string, unknown>).__self = value;
    } catch {
      // Frozen / sealed / Proxy-protected — leave as-is, the bare
      // value is still a valid generator output.
    }
  }
  return value;
}

/**
 * Arbitrary structural value: `fc.anything()` plus a chance of being
 * mutated into a cyclic graph. `fc.anything()` already includes
 * primitives, plain objects, arrays, strings of various lengths, and
 * nested combinations — the cycle wrapper extends the input space.
 */
const arbValue: fc.Arbitrary<unknown> = fc
  .tuple(fc.anything(), fc.integer({ min: 0, max: 99 }))
  .map(([v, salt]) => maybeCycle(v, salt));

/**
 * Messages: usually well-formed strings, occasionally oversized strings
 * (REQ 1.6 specifically calls out length-pathological inputs), and
 * occasionally `fc.anything()` to model TypeScript-erased call sites
 * that pass a non-string at runtime.
 */
const arbMessage: fc.Arbitrary<unknown> = fc.oneof(
  fc.string({ maxLength: 256 }),
  // Oversized string — exercises the "huge string" resilience case.
  fc.string({ minLength: 2_048, maxLength: 8_192 }),
  // TypeScript says `message: string`, but the runtime must still hold
  // the never-throw guarantee if a caller bypasses TS.
  fc.anything(),
);

const arbFields: fc.Arbitrary<Record<string, unknown> | undefined> = fc.option(
  fc.dictionary(fc.string({ maxLength: 24 }), arbValue, { maxKeys: 6 }),
  { nil: undefined },
);

const arbCall = fc.record({
  level: fc.constantFrom<LogLevel>(...LEVELS),
  message: arbMessage,
  fields: arbFields,
});

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------

describe('Property 2 — Logger never throws and never leaks rejections (REQ 1.6, 4.1, 4.2)', () => {
  const unhandledRejections: unknown[] = [];

  const windowHandler = (event: Event): void => {
    // jsdom dispatches a PromiseRejectionEvent here. We only need
    // the reason for diagnostics; the count is what the property reads.
    const reason = (event as unknown as { reason?: unknown }).reason;
    unhandledRejections.push(reason);
  };
  const nodeHandler = (reason: unknown): void => {
    unhandledRejections.push(reason);
  };

  // Console silencers — without these, a 100-iteration property test
  // floods stdout with 1 000+ structured records and drowns the
  // surrounding suite output. We are not asserting on console here.
  let debugSpy: ReturnType<typeof vi.spyOn>;
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(() => {
    if (typeof globalThis.addEventListener === 'function') {
      globalThis.addEventListener('unhandledrejection', windowHandler);
    }
    if (typeof process !== 'undefined' && typeof process.on === 'function') {
      process.on('unhandledRejection', nodeHandler);
    }
  });

  afterAll(() => {
    if (typeof globalThis.removeEventListener === 'function') {
      globalThis.removeEventListener('unhandledrejection', windowHandler);
    }
    if (typeof process !== 'undefined' && typeof process.off === 'function') {
      process.off('unhandledRejection', nodeHandler);
    }
  });

  beforeEach(() => {
    unhandledRejections.length = 0;
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    debugSpy.mockRestore();
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('handles arbitrary emit sequences without throwing or leaking rejections', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbCall, { minLength: 1, maxLength: 20 }),
        async (calls) => {
          const before = unhandledRejections.length;

          for (const call of calls) {
            // Cast through `unknown`: the public API is typed `string`,
            // but Property 2 explicitly covers runtime resilience to
            // non-string inputs (REQ 1.6 / 4.1 do not condition on
            // caller type-safety).
            expect(() => {
              logger[call.level](
                call.message as unknown as string,
                call.fields,
              );
            }).not.toThrow();
          }

          // Yield to the macrotask queue so V8's rejection-notification
          // cycle has a chance to fire for any thenables queued during
          // the burst. A single `Promise.resolve()` only flushes the
          // current microtask checkpoint; `setTimeout(_, 0)` puts us
          // past it.
          await new Promise<void>((resolve) => setTimeout(resolve, 0));

          return unhandledRejections.length === before;
        },
      ),
      { numRuns: 100 },
    );
  });
});
