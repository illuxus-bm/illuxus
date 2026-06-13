// Feature: observability-foundation, Property 3: Correlation context is causal and concurrency-isolated
//
// Validates: Requirements 9.4, 9.5, 9.7
//
// ARCHITECTURAL CONSTRAINT
// ────────────────────────
// The `Promise.prototype.then` patch in `correlation.ts` captures the
// active correlation id at the point a `.then` callback is REGISTERED
// and re-installs that captured id for the duration of the callback's
// execution. This is the only seam the patch can intercept. Native
// `async`/`await` boundaries desugar onto a microtask machinery that
// does not always go through the patched `then` (engine- and bundler-
// dependent), so this property test deliberately restricts itself to
// EXPLICIT `.then()` chains and `Promise.all` fan-in. We do NOT test
// correlation isolation across `await` boundaries here — that path is
// outside the patch's scope.
//
// PROPERTY (consolidated form of design.md Property 3 restricted to the
// patch's scope of validity):
//
//   For any set of N concurrent invocations of
//   `runWithCorrelationId(c_i, fn_i)` where each `fn_i` is built from
//   explicit `.then()` registrations:
//     • every value captured inside `fn_i`'s chain observes
//       `getCorrelationId() === c_i`;
//     • no captured value observes `c_j` for j ≠ i.
//
// STRATEGY
// ────────
//   1. Generate an array of 2..8 invocations. Each invocation has a
//      distinct correlation id (guaranteed-unique UUID v4 shape — we
//      embed the array index into the node section so two invocations
//      can never collide regardless of fast-check shrinking) and a
//      chain length 1..5.
//   2. Inside `runWithCorrelationId(c_i, fn_i)`, build the chain
//      synchronously as `Promise.resolve().then(...).then(...)...`. Each
//      `.then(...)` registration runs while `currentCorrelationId === c_i`,
//      so the patch captures `c_i` for every callback.
//   3. Each callback records the live `getCorrelationId()` into a
//      per-chain array.
//   4. Drive all invocations concurrently via `Promise.all`. The chains
//      interleave in the microtask queue — exactly the concurrency that
//      Property 3 is about.
//   5. After `Promise.all` settles, assert each chain's captured ids
//      are homogeneous and equal its own `c_i` (the per-chain
//      homogeneity assertion subsumes the cross-chain non-leakage
//      assertion: if every record from chain i equals c_i and the c_i
//      are pairwise distinct, then no record carries c_j for j ≠ i).

import { describe, it, expect, beforeAll } from 'vitest';
import fc from 'fast-check';

import {
  getCorrelationId,
  runWithCorrelationId,
  installPromisePatch,
} from '../correlation';

interface Invocation {
  /** Distinct UUID v4-shaped correlation id for this invocation. */
  id: string;
  /** Number of `.then` registrations in this invocation's chain (1..5). */
  chainLength: number;
}

/**
 * Build a deterministic, guaranteed-unique UUID v4-shaped id from a
 * non-negative integer index. We embed the index into the node section
 * (last 12 hex chars) so distinct indices yield distinct ids, regardless
 * of fast-check shrinking choices, and the version/variant nibbles match
 * the v4 layout (`xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`, y ∈ {8,9,a,b}).
 */
function uuidFromIndex(index: number): string {
  const node = index.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${node}`;
}

describe('Property 3 — correlation context is causal and concurrency-isolated (REQ 9.4, 9.5, 9.7)', () => {
  beforeAll(() => {
    // Install the patch eagerly so the property does not depend on
    // whichever invocation happens to be the first to call
    // `runWithCorrelationId` in this test process. The patch is
    // idempotent (REQ 9.4 phrasing), so this is safe even if other
    // tests in the suite have already triggered it.
    installPromisePatch();
  });

  it('every value captured inside chain i carries c_i across explicit .then chains and Promise.all', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate the chain lengths first; the index in the resulting
        // array becomes the source of the unique correlation id. This
        // construction guarantees N distinct ids without a post-hoc
        // filter (and therefore preserves fast-check's shrinking).
        fc
          .array(fc.integer({ min: 1, max: 5 }), { minLength: 2, maxLength: 8 })
          .map<Invocation[]>((chainLengths) =>
            chainLengths.map((chainLength, index) => ({
              id: uuidFromIndex(index),
              chainLength,
            })),
          ),
        async (invocations) => {
          // Sanity: ids are pairwise distinct by construction. If this
          // ever flips, the cross-chain non-leakage corollary below is
          // unsound, so we fail loudly rather than silently.
          const distinctIds = new Set(invocations.map((inv) => inv.id));
          expect(distinctIds.size).toBe(invocations.length);

          // Drive every invocation concurrently. We synchronously call
          // `runWithCorrelationId` once per invocation, in order. Each
          // call returns a Promise; we collect them into `chainPromises`
          // and then await them with `Promise.all` so the chains'
          // microtasks interleave.
          const chainPromises: Array<Promise<Array<string | null>>> =
            invocations.map(({ id, chainLength }) => {
              // The lambda passed to runWithCorrelationId returns a
              // Promise built from EXPLICIT `.then` registrations. No
              // async/await — that's the architectural constraint.
              const chainResult = runWithCorrelationId(id, () => {
                // First link of the chain: capture the id at the start.
                let chain: Promise<Array<string | null>> = Promise.resolve()
                  .then(() => [getCorrelationId()]);

                // Append (chainLength - 1) more captures. Every `.then`
                // here is registered synchronously inside the
                // runWithCorrelationId scope, so each one captures
                // `c_i` via the patch.
                for (let step = 1; step < chainLength; step++) {
                  chain = chain.then((records) => {
                    records.push(getCorrelationId());
                    return records;
                  });
                }

                return chain;
              });

              // `runWithCorrelationId` returns `T | Promise<T>`; we
              // know fn_i returned a Promise, so the result is a
              // Promise. The cast is safe and keeps TS happy.
              return chainResult as Promise<Array<string | null>>;
            });

          const results = await Promise.all(chainPromises);

          // Per-chain homogeneity: every record from chain i equals c_i.
          // This is the primary statement of Property 3 within the
          // patch's scope.
          for (let i = 0; i < invocations.length; i++) {
            const expected = invocations[i].id;
            const captured = results[i];

            expect(captured).toHaveLength(invocations[i].chainLength);
            for (const observed of captured) {
              expect(observed).toBe(expected);
            }
          }

          // Cross-chain non-leakage corollary: because the c_i are
          // pairwise distinct (verified above) and every record from
          // chain i equals c_i (verified above), no record from chain
          // i can equal c_j for j ≠ i. We re-state the check directly
          // for clarity and so a future regression that violates this
          // weaker form fails with an explicit message.
          for (let i = 0; i < invocations.length; i++) {
            const ownId = invocations[i].id;
            for (let j = 0; j < invocations.length; j++) {
              if (i === j) continue;
              const otherId = invocations[j].id;
              for (const observed of results[i]) {
                expect(
                  observed,
                  `chain ${i} (own id ${ownId}) leaked id ${otherId} from chain ${j}`,
                ).not.toBe(otherId);
              }
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
