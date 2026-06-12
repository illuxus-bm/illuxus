// Feature: checkin-checkout-tabs, Property 7: Tracking-window guard
//
// Validates: Requirements 8.1
//
// Property 7: For any registration `r` whose event `end_date` is more than
// 2 hours before `now`, calling `setAttendance` returns
// `code = 'tracking_closed'` and `attendanceEvents` is unchanged. For
// events still inside the tracking window, the property does not
// constrain the result code (other guards or the state machine may
// fire).
//
// The TS port mirrors the SQL helper's branch order EXACTLY:
//   existence → authorization → tracking window → status guards → state machine
// so an open window leaves the downstream branches free to produce any
// of the other result codes.

import { describe, it } from "vitest";
import fc from "fast-check";

import { setAttendance } from "../applyAttendance";
import type {
  Actor,
  AttendanceEventRow,
  AttendanceState,
  EventFixture,
  RegistrationFixture,
  Target,
  World,
} from "../types";

// ─── Constants ─────────────────────────────────────────────────────────────

const REG_ID = "11111111-1111-4111-8111-111111111111";
const EVENT_ID = "22222222-2222-4222-8222-222222222222";
const ACTOR_ID = "33333333-3333-4333-8333-333333333333";
const NOW = new Date("2025-06-15T12:00:00.000Z");

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
// Tracking is closed when `now - end_date > 2h`, i.e. when `end_date`
// falls strictly before `now - 2h`. The cutoff is `now - 2h`.
const CUTOFF = new Date(NOW.getTime() - TWO_HOURS_MS);
// Bound the generator 6 hours on each side of the cutoff so fast-check
// explores both the closed (left of cutoff) and open (right of cutoff)
// half-spaces with high frequency.
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const END_DATE_MIN = new Date(CUTOFF.getTime() - SIX_HOURS_MS);
const END_DATE_MAX = new Date(CUTOFF.getTime() + SIX_HOURS_MS);

// ─── Generators ────────────────────────────────────────────────────────────

const arbAttendanceState: fc.Arbitrary<AttendanceState> = fc.constantFrom(
  "never",
  "inside",
  "outside"
);

const arbTarget: fc.Arbitrary<Target> = fc.constantFrom("inside", "outside");

const arbActor: fc.Arbitrary<Actor> = fc.record({
  id: fc.constant(ACTOR_ID),
  role: fc.constantFrom<Actor["role"]>("admin", "owner"),
});

const arbEndDate: fc.Arbitrary<Date> = fc.date({
  min: END_DATE_MIN,
  max: END_DATE_MAX,
});

/**
 * A registration with permissive status / approval guards so that the
 * only variable the property exercises is the tracking-window branch.
 */
const buildPermissiveRegistration = (
  state: AttendanceState
): RegistrationFixture => ({
  id: REG_ID,
  event_id: EVENT_ID,
  status: "confirmed",
  approval_status: "approved",
  attendance_state: state,
  qr_code: "qr-permissive",
  join_token: "token-permissive",
  kind: "attendee",
  last_in_at: state === "inside" ? new Date(NOW.getTime() - 60_000) : null,
  last_out_at: state === "outside" ? new Date(NOW.getTime() - 60_000) : null,
});

const buildWorld = (state: AttendanceState, endDate: Date): World => {
  const reg = buildPermissiveRegistration(state);
  const event: EventFixture = { id: EVENT_ID, end_date: endDate };
  return {
    registrations: new Map([[reg.id, reg]]),
    events: new Map([[event.id, event]]),
    attendanceEvents: [] as readonly AttendanceEventRow[],
    now: NOW,
  };
};

/** Mirrors the private helper inside applyAttendance.ts. */
const isTrackingClosed = (endDate: Date, now: Date): boolean =>
  now.getTime() - endDate.getTime() > TWO_HOURS_MS;

// ─── Property ──────────────────────────────────────────────────────────────

describe("Property 7: Tracking-window guard", () => {
  it("rejects with 'tracking_closed' iff the event ended >2h before now; otherwise no constraint on the result code", () => {
    fc.assert(
      fc.property(
        arbAttendanceState,
        arbTarget,
        arbActor,
        arbEndDate,
        (preState, target, actor, endDate) => {
          const world = buildWorld(preState, endDate);
          const eventsBefore = world.attendanceEvents.length;

          const { code, world: nextWorld } = setAttendance(
            world,
            REG_ID,
            target,
            "qr",
            actor,
            NOW
          );

          if (isTrackingClosed(endDate, NOW)) {
            // ── Closed branch ────────────────────────────────────────────
            // Result code is exactly 'tracking_closed'.
            if (code !== "tracking_closed") {
              return false;
            }
            // attendanceEvents count is unchanged.
            if (nextWorld.attendanceEvents.length !== eventsBefore) {
              return false;
            }
            // No row exists for this registration in the new world.
            const rowsForReg = nextWorld.attendanceEvents.filter(
              (e) => e.registration_id === REG_ID
            );
            return rowsForReg.length === 0;
          }

          // ── Open branch ──────────────────────────────────────────────
          // The tracking guard does not fire; the property does not
          // constrain the result code (state-machine or status guards
          // may produce any of: applied_in, applied_out, already_inside,
          // already_outside, not_checked_in_yet, …). This branch is
          // covered by Properties 1, 3, and 6.
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
