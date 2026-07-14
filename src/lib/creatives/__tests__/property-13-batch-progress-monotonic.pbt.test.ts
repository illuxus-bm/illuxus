// Feature: social-creative-generator, Property 13: Batch progress is monotonic and bounded
//
// Validates: Requirements 6.4
//
// Property 13: For any total count `N` and any sequence of `"completed"`
// events fed into `progressReducer`, the resulting `completed` value is
// non-decreasing across the sequence and never exceeds `N`.

import { describe, it } from "vitest";
import fc from "fast-check";

import { progressReducer, type BatchProgress } from "../creative-batch";

// ─── Generators ────────────────────────────────────────────────────────────

const arbTotal = fc.integer({ min: 0, max: 50 });

// Deliberately can exceed `total` to test the bound.
const arbEventCount = fc.integer({ min: 0, max: 100 });

// ─── Property ──────────────────────────────────────────────────────────────

describe("Property 13: Batch progress is monotonic and bounded", () => {
  it("completed is non-decreasing and never exceeds total across a sequence of completed events", () => {
    fc.assert(
      fc.property(arbTotal, arbEventCount, (total, eventCount) => {
        let state: BatchProgress = { completed: 0, total };
        let previousCompleted = state.completed;

        for (let i = 0; i < eventCount; i++) {
          state = progressReducer(state, "completed");

          // Bounded: completed never exceeds total.
          if (state.completed > total) {
            return false;
          }
          // Non-decreasing: completed never regresses.
          if (state.completed < previousCompleted) {
            return false;
          }
          // total itself never changes.
          if (state.total !== total) {
            return false;
          }

          previousCompleted = state.completed;
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });
});
