// Feature: checkin-checkout-tabs, Property 10: Counter partition correctness
//
// Validates: Requirements 11.2, 11.5
//
// For any set of registrations belonging to a single event, the counters
// surfaced by `useEventCheckinCounters` partition the input set:
//
//   - total           = |R|
//   - currentlyInside = |{ r ∈ R : r.attendance_state = 'inside' }|
//   - checkedOut      = |{ r ∈ R : r.attendance_state = 'outside' }|
//   - notArrived      = |{ r ∈ R : r.attendance_state = 'never' }|
//   - currentlyInside + checkedOut + notArrived === total
//
// Drives the pure helper `partitionCounters` from `src/lib/attendance/counters.ts`,
// which the hook delegates to in tests / fallback derivation.

import { describe, it } from "vitest";
import fc from "fast-check";

import { partitionCounters } from "../counters";
import type { AttendanceState } from "../types";

// ─── Generators ────────────────────────────────────────────────────────────

const arbAttendanceState: fc.Arbitrary<AttendanceState> = fc.constantFrom(
  "never",
  "inside",
  "outside"
);

// ─── Property ──────────────────────────────────────────────────────────────

describe("Property 10: Counter partition correctness", () => {
  it("the four numbers partition the input set", () => {
    fc.assert(
      fc.property(fc.array(arbAttendanceState), (states) => {
        const counters = partitionCounters(states);

        // Total equals the input length.
        if (counters.total !== states.length) return false;

        // Each count equals the cardinality of the matching attendance_state value.
        const expectedInside = states.filter((s) => s === "inside").length;
        const expectedOutside = states.filter((s) => s === "outside").length;
        const expectedNever = states.filter((s) => s === "never").length;

        if (counters.currentlyInside !== expectedInside) return false;
        if (counters.checkedOut !== expectedOutside) return false;
        if (counters.notArrived !== expectedNever) return false;

        // Partition invariant: the three counts sum to total.
        if (
          counters.currentlyInside + counters.checkedOut + counters.notArrived !==
          counters.total
        ) {
          return false;
        }

        // Counts are non-negative.
        if (counters.currentlyInside < 0) return false;
        if (counters.checkedOut < 0) return false;
        if (counters.notArrived < 0) return false;

        return true;
      }),
      { numRuns: 100 }
    );
  });
});
