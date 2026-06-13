// Feature: observability-foundation, Property 5: Boot buffer replay preserves order
//
// Validates: Requirements 4.4, 12.3
//
// For any sequence of pre-init emit calls of length ≤ 64, after the boot
// stub drains, the sequence of records observed by the (mock) logger
// equals the input sequence in order. Length is bounded at 64 so the
// FIFO ring never overflows; that path is covered separately by
// `boot-overflow.test.ts`.
//
// Strategy:
//   1. For every fast-check iteration, wipe `window.__observabilityBoot`
//      and reset Vitest's module cache so re-importing `../boot` runs the
//      install side-effect and yields a fresh, isolated stub. This is the
//      same reset dance used in `boot-overflow.test.ts`; without it we'd
//      inherit a stub mutated by a previous iteration in the same jsdom
//      realm.
//   2. Push every generated `{ level, message }` tuple onto the stub via
//      its corresponding emit method (`stub.info(message)`, etc.).
//   3. Build a mock logger whose six emit methods append `{ level,
//      message }` tuples to a shared `calls` array — appending in call
//      order is the only thing we need to observe to test ordering.
//   4. Call `stub.__drain__(mockLogger)`.
//   5. Filter out any synthetic `warn 'boot buffer overflowed'` record (a
//      defensive guard — we never expect one given the maxLength: 64 cap)
//      and assert the remaining captured tuples deep-equal the input.

import { afterEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';

import type { ObservabilityBootStub } from '../boot';

type Level = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

interface EmitTuple {
  level: Level;
  message: string;
}

interface DrainCall {
  level: Level;
  message: string;
}

const LEVELS: ReadonlyArray<Level> = [
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
];

function makeMockLogger() {
  const calls: DrainCall[] = [];
  const make = (level: Level) =>
    vi.fn((message: string) => {
      calls.push({ level, message });
    });
  const logger = {
    trace: make('trace'),
    debug: make('debug'),
    info: make('info'),
    warn: make('warn'),
    error: make('error'),
    fatal: make('fatal'),
  };
  return { logger, calls };
}

async function freshBootStub(): Promise<ObservabilityBootStub> {
  delete (window as { __observabilityBoot?: unknown }).__observabilityBoot;
  vi.resetModules();
  await import('../boot');
  const installed = window.__observabilityBoot;
  if (!installed) {
    throw new Error(
      'expected boot.ts side-effect to install window.__observabilityBoot under jsdom',
    );
  }
  return installed;
}

const emitTuple: fc.Arbitrary<EmitTuple> = fc.record({
  level: fc.constantFrom(...LEVELS),
  // Strings are the level's `message`; bound length so failing shrinks
  // stay readable and avoid pathological generators.
  message: fc.string({ maxLength: 64 }),
});

describe('Property 5 — boot buffer replay preserves order (REQ 4.4, 12.3)', () => {
  afterEach(() => {
    delete (window as { __observabilityBoot?: unknown }).__observabilityBoot;
  });

  it('drained records equal the pre-init emit sequence in order', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Length 0..64: the FIFO ring's capacity, so no eviction occurs
        // and the synthetic overflow warn is never appended. This is the
        // exact scope of Property 5 in design.md.
        fc.array(emitTuple, { minLength: 0, maxLength: 64 }),
        async (sequence) => {
          const stub = await freshBootStub();

          for (const entry of sequence) {
            stub[entry.level](entry.message);
          }

          // Sanity: with length ≤ 64 the buffer never overflows.
          expect(stub.__overflowed__).toBe(false);
          expect(stub.__buffer__.length).toBe(sequence.length);

          const { logger, calls } = makeMockLogger();
          stub.__drain__(logger);

          // Defensive filter — Property 5 covers the no-overflow case but
          // we still strip any synthetic `'boot buffer overflowed'` warn
          // so the assertion is robust to future changes.
          const observed = calls.filter(
            (c) => !(c.level === 'warn' && c.message === 'boot buffer overflowed'),
          );

          expect(observed).toEqual(sequence);
        },
      ),
      { numRuns: 100 },
    );
  });
});
