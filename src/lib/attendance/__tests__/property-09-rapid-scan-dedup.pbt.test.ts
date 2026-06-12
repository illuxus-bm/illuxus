// Feature: checkin-checkout-tabs, Property 9: Rapid-scan dedup
//
// Validates: Requirements 9.1, 9.3
//
// Property 9: For any token `t` and any pair of decode events for `t`
// that arrive at the dialog within 2000 ms of each other while the
// active tab is unchanged, exactly one RPC dispatch occurs.
//
// The property is checked against the pure-TS scanner dedup reducer
// `src/lib/attendance/scannerStateMachine.ts`, which models the two
// pieces of dialog state described in design.md "Internal state
// (per-tab)": `recentDecodes: Map<token, ms>` (REQ-9.1) and
// `inFlight: boolean` (REQ-9.3).
//
// We optionally fire an `rpc-end` between the two decodes so the
// property exercises both rejection paths:
//   - rpc-end NOT fired → second decode blocked by `inFlight`  (REQ-9.3)
//   - rpc-end IS  fired → second decode blocked by dedup window (REQ-9.1)
// In both cases exactly one dispatch is recorded.

import { describe, it } from "vitest";
import fc from "fast-check";

import {
  DEDUP_WINDOW_MS,
  initialScannerState,
  scannerReducer,
  type ScannerState,
} from "../scannerStateMachine";

describe("Property 9: Rapid-scan dedup", () => {
  it("two decodes of the same token within 2000ms produce exactly one RPC dispatch", () => {
    fc.assert(
      fc.property(
        // Token. Treated as an opaque key by the reducer; any non-empty
        // string is in scope.
        fc.string({ minLength: 1, maxLength: 32 }),
        // First decode timestamp. Bounded so `t1 + dt` cannot overflow.
        fc.integer({ min: 0, max: 1_000_000_000 }),
        // Δt strictly less than the dedup window — the property's
        // pre-condition is "within 2000ms".
        fc.integer({ min: 0, max: DEDUP_WINDOW_MS - 1 }),
        // Whether the dialog received an rpc-end between the two
        // decodes. Either way the second decode must be ignored.
        fc.boolean(),
        (token, t1, dt, fireRpcEndBetween) => {
          const t2 = t1 + dt;

          let state: ScannerState = initialScannerState;
          let dispatches = 0;

          // Decode #1 — fresh state, must be accepted.
          const step1 = scannerReducer(state, {
            type: "decode",
            token,
            timestamp: t1,
          });
          state = step1.state;
          if (step1.dispatch === "rpc") dispatches += 1;

          // Optionally clear `inFlight` to force the dedup-window guard
          // (REQ-9.1) to be the one that blocks decode #2.
          if (fireRpcEndBetween) {
            state = scannerReducer(state, { type: "rpc-end" }).state;
          }

          // Decode #2 — same token, Δt < 2000ms, tab unchanged.
          const step2 = scannerReducer(state, {
            type: "decode",
            token,
            timestamp: t2,
          });
          if (step2.dispatch === "rpc") dispatches += 1;

          return dispatches === 1;
        }
      ),
      { numRuns: 100 }
    );
  });
});
