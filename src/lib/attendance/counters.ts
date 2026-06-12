// Feature: checkin-checkout-tabs
// Pure derivation of the four registration counters surfaced by
// `useEventCheckinCounters`. The hook does the live counts via Supabase
// `head: true` queries; this helper exists for tests and as a fallback
// derivation so the counter shape has a single source of truth.

import type { AttendanceState } from "./types";

/**
 * The four-way partition of a set of registrations by `attendance_state`.
 *
 * Mirrors the shape consumed by `RegistrationsSection` and produced by
 * `useEventCheckinCounters` (minus the legacy `checkedIn` field). The
 * three non-total fields are mutually exclusive and exhaustive over
 * `AttendanceState = 'never' | 'inside' | 'outside'`, so they always
 * sum to `total`.
 */
export interface PartitionCounters {
  readonly total: number;
  readonly currentlyInside: number;
  readonly checkedOut: number;
  readonly notArrived: number;
}

/**
 * Partition a sequence of `attendance_state` values into the four
 * counters surfaced by `useEventCheckinCounters` (REQ-11.2, REQ-11.5).
 *
 * - `total` — input length.
 * - `currentlyInside` — count of `'inside'`.
 * - `checkedOut` — count of `'outside'`.
 * - `notArrived` — count of `'never'`.
 *
 * Invariant (Property 10): `currentlyInside + checkedOut + notArrived === total`.
 */
export function partitionCounters(
  states: readonly AttendanceState[]
): PartitionCounters {
  let currentlyInside = 0;
  let checkedOut = 0;
  let notArrived = 0;

  for (const s of states) {
    switch (s) {
      case "inside":
        currentlyInside += 1;
        break;
      case "outside":
        checkedOut += 1;
        break;
      case "never":
        notArrived += 1;
        break;
    }
  }

  return {
    total: states.length,
    currentlyInside,
    checkedOut,
    notArrived,
  };
}
