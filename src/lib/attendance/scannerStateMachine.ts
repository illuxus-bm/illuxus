// Feature: checkin-checkout-tabs
// Pure-TS scanner dedup state machine for the per-tab dialog state
// described in design.md "Internal state (per-tab)". Models the two
// fields the dialog cares about for rapid-scan dedup:
//
//   - `recentDecodes: Map<token, lastDecodeMs>` — REQ-9.1, 2000ms window
//   - `inFlight: boolean`                       — REQ-9.3, blocks new dispatches
//
// The reducer takes the current state plus a decode / RPC / tab-switch
// event and returns the next state along with whether the event would
// have produced an actual RPC dispatch (`'rpc'`) or was suppressed
// (`'ignored'`). The dispatch flag is what property tests count.
//
// Pulled out into its own module so the property tests under
// `src/lib/attendance/__tests__/*.pbt.test.ts` can drive it directly
// without React, mirroring the same pattern used for the SQL helper port
// in `applyAttendance.ts`.

/**
 * Same-token dedup window in milliseconds. Per REQ-9.1, two decodes of
 * the same token whose `Δt < DEDUP_WINDOW_MS` collapse into a single
 * RPC dispatch.
 */
export const DEDUP_WINDOW_MS = 2000;

/**
 * The two pieces of dialog state that govern dedup. `recentDecodes` is
 * treated as immutable: every reducer step that touches it returns a
 * fresh `Map`.
 */
export interface ScannerState {
  readonly inFlight: boolean;
  readonly recentDecodes: ReadonlyMap<string, number>;
}

/**
 * Events that the dialog feeds the reducer.
 *
 * - `decode`     — the camera handed us a fresh decode for `token` at
 *                  wall-clock `timestamp` (ms).
 * - `rpc-start`  — caller is about to dispatch the RPC (idempotent;
 *                  `decode` already flips `inFlight` itself, but this
 *                  exists so external dispatchers can drive the flag
 *                  without going through `decode`).
 * - `rpc-end`    — the RPC has resolved (success or error); clears
 *                  `inFlight` so the next decode is eligible.
 * - `tab-switch` — REQ-1.4: switching tabs clears both `inFlight` and
 *                  `recentDecodes`.
 */
export type ScannerEvent =
  | { type: "decode"; token: string; timestamp: number }
  | { type: "rpc-start" }
  | { type: "rpc-end" }
  | { type: "tab-switch" };

/**
 * Whether a step would have caused a real RPC dispatch.
 */
export type ScannerDispatch = "rpc" | "ignored";

export interface ScannerStep {
  readonly state: ScannerState;
  readonly dispatch: ScannerDispatch;
}

/**
 * Fresh-mount state. The dialog uses this on open and after each
 * `tab-switch`.
 */
export const initialScannerState: ScannerState = {
  inFlight: false,
  recentDecodes: new Map<string, number>(),
};

/**
 * Apply one event. Pure: no `state` argument is mutated, no globals
 * touched. Returns the next state plus whether the event was an actual
 * dispatch (`'rpc'`) or a suppressed one (`'ignored'`).
 */
export function scannerReducer(
  state: ScannerState,
  event: ScannerEvent
): ScannerStep {
  switch (event.type) {
    case "decode": {
      // REQ-9.3 — in-flight blocks new dispatches.
      if (state.inFlight) {
        return { state, dispatch: "ignored" };
      }
      // REQ-9.1 — same-token dedup within DEDUP_WINDOW_MS.
      const last = state.recentDecodes.get(event.token);
      if (last !== undefined && event.timestamp - last < DEDUP_WINDOW_MS) {
        return { state, dispatch: "ignored" };
      }
      // Accept: stamp the decode, flip in-flight, dispatch RPC.
      const next = new Map(state.recentDecodes);
      next.set(event.token, event.timestamp);
      return {
        state: { inFlight: true, recentDecodes: next },
        dispatch: "rpc",
      };
    }

    case "rpc-start": {
      // Idempotent — `decode` normally flips this itself.
      if (state.inFlight) {
        return { state, dispatch: "ignored" };
      }
      return {
        state: { inFlight: true, recentDecodes: state.recentDecodes },
        dispatch: "ignored",
      };
    }

    case "rpc-end": {
      return {
        state: { inFlight: false, recentDecodes: state.recentDecodes },
        dispatch: "ignored",
      };
    }

    case "tab-switch": {
      // REQ-1.4 — switching tabs resets the per-tab dedup buffer and
      // clears any in-flight flag (the camera mount is shared, but the
      // dialog treats each tab as its own dispatch context).
      return {
        state: {
          inFlight: false,
          recentDecodes: new Map<string, number>(),
        },
        dispatch: "ignored",
      };
    }
  }
}
