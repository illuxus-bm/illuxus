// Feature: checkin-checkout-tabs, Property 6: Registration-status guard
//
// Validates: Requirements 7.1, 7.2, 7.3
//
// Property 6: For any registration `r` whose `(status, approval_status)`
// pair falls into the rejecting set and any `target ∈ {'inside','outside'}`,
// `setAttendance` returns the expected rejection code and the
// `attendanceEvents` log is unchanged.
//
// Rejecting pairs (precedence order, mirroring `applyAttendance`'s guard
// chain so that `cancelled` shadows the approval-status checks):
//
//   - `status = 'cancelled'`                          → 'cancelled'
//   - `approval_status = 'declined'`                  → 'declined'
//   - `approval_status ∈ {'pending','waitlisted'}`    → 'pending_approval'
//
// The property is deliberately oblivious to the pre-scan
// `attendance_state` and the requested `target`: the status / approval
// guard fires before the state machine in the SQL helper, so neither
// input can rescue a rejecting registration.

import { describe, it } from "vitest";
import fc from "fast-check";

import { setAttendance } from "../applyAttendance";
import type {
  Actor,
  ApprovalStatus,
  AttendanceEventRow,
  AttendanceState,
  EventFixture,
  RegistrationFixture,
  RegistrationStatus,
  Target,
  World,
} from "../types";

// ─── Constants ─────────────────────────────────────────────────────────────

const REG_ID = "11111111-1111-4111-8111-111111111111";
const EVENT_ID = "22222222-2222-4222-8222-222222222222";
const ACTOR_ID = "33333333-3333-4333-8333-333333333333";
const NOW = new Date("2025-06-15T12:00:00.000Z");
// end_date a day in the future → tracking window open so the status guard
// is the first rejecting branch the helper reaches.
const FUTURE_END = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);

// ─── Generators ────────────────────────────────────────────────────────────

const arbAttendanceState: fc.Arbitrary<AttendanceState> = fc.constantFrom(
  "never",
  "inside",
  "outside"
);

const arbTarget: fc.Arbitrary<Target> = fc.constantFrom("inside", "outside");

// Authorized actor (admin or owner) so the authorization branch never fires.
const arbActor: fc.Arbitrary<Actor> = fc.record({
  id: fc.constant(ACTOR_ID),
  role: fc.constantFrom<Actor["role"]>("admin", "owner"),
});

type RejectingCase = {
  readonly status: RegistrationStatus;
  readonly approval_status: ApprovalStatus;
  readonly expectedCode: "cancelled" | "declined" | "pending_approval";
};

// Case A: status = 'cancelled' (any approval_status) → 'cancelled'.
// `cancelled` shadows the approval checks, so the approval_status is
// unconstrained here; any of the four legal values produces 'cancelled'.
const arbCancelledCase: fc.Arbitrary<RejectingCase> = fc.record({
  status: fc.constant<RegistrationStatus>("cancelled"),
  approval_status: fc.constantFrom<ApprovalStatus>(
    "pending",
    "approved",
    "waitlisted",
    "declined"
  ),
  expectedCode: fc.constant<"cancelled">("cancelled"),
});

// Case B: status ≠ 'cancelled', approval_status = 'declined' → 'declined'.
const arbDeclinedCase: fc.Arbitrary<RejectingCase> = fc.record({
  status: fc.constantFrom<RegistrationStatus>("confirmed", "pending"),
  approval_status: fc.constant<ApprovalStatus>("declined"),
  expectedCode: fc.constant<"declined">("declined"),
});

// Case C: status ≠ 'cancelled',
//   approval_status ∈ {'pending','waitlisted'} → 'pending_approval'.
const arbPendingApprovalCase: fc.Arbitrary<RejectingCase> = fc.record({
  status: fc.constantFrom<RegistrationStatus>("confirmed", "pending"),
  approval_status: fc.constantFrom<ApprovalStatus>("pending", "waitlisted"),
  expectedCode: fc.constant<"pending_approval">("pending_approval"),
});

const arbRejectingCase: fc.Arbitrary<RejectingCase> = fc.oneof(
  arbCancelledCase,
  arbDeclinedCase,
  arbPendingApprovalCase
);

// ─── Fixture builder ───────────────────────────────────────────────────────

const buildWorld = (
  status: RegistrationStatus,
  approval_status: ApprovalStatus,
  attendance_state: AttendanceState
): World => {
  const reg: RegistrationFixture = {
    id: REG_ID,
    event_id: EVENT_ID,
    status,
    approval_status,
    attendance_state,
    qr_code: "qr-rejecting",
    join_token: "token-rejecting",
    kind: "attendee",
    last_in_at:
      attendance_state === "inside" ? new Date(NOW.getTime() - 60_000) : null,
    last_out_at:
      attendance_state === "outside" ? new Date(NOW.getTime() - 60_000) : null,
  };
  const event: EventFixture = { id: EVENT_ID, end_date: FUTURE_END };
  return {
    registrations: new Map([[reg.id, reg]]),
    events: new Map([[event.id, event]]),
    attendanceEvents: [] as readonly AttendanceEventRow[],
    now: NOW,
  };
};

// ─── Property ──────────────────────────────────────────────────────────────

describe("Property 6: Registration-status guard", () => {
  it("rejecting (status, approval_status) pairs return the expected code and leave attendanceEvents unchanged", () => {
    fc.assert(
      fc.property(
        arbRejectingCase,
        arbAttendanceState,
        arbTarget,
        arbActor,
        (rejecting, preState, target, actor) => {
          const world = buildWorld(
            rejecting.status,
            rejecting.approval_status,
            preState
          );
          const eventsBefore = world.attendanceEvents.length;

          const { code, world: nextWorld, result } = setAttendance(
            world,
            REG_ID,
            target,
            "qr",
            actor,
            NOW
          );

          // (1) The result code matches the expected rejection code.
          if (code !== rejecting.expectedCode) {
            return false;
          }
          // The projected result row carries the same code.
          if (result.code !== rejecting.expectedCode) {
            return false;
          }
          // (2) attendance_events count is unchanged: no row was appended.
          if (nextWorld.attendanceEvents.length !== eventsBefore) {
            return false;
          }
          // No row exists for this registration in the post-call world.
          const rowsForReg = nextWorld.attendanceEvents.filter(
            (e) => e.registration_id === REG_ID
          );
          if (rowsForReg.length !== 0) {
            return false;
          }
          // (3) The registration's attendance_state is unchanged: rejection
          // branches must never mutate the state machine.
          const reg = nextWorld.registrations.get(REG_ID)!;
          if (reg.attendance_state !== preState) {
            return false;
          }
          // last_in_at / last_out_at must not be bumped to NOW by a
          // rejected scan (they may still hold their pre-scan sentinel
          // values from `buildWorld`).
          if (reg.last_in_at !== null && reg.last_in_at.getTime() === NOW.getTime()) {
            return false;
          }
          if (
            reg.last_out_at !== null &&
            reg.last_out_at.getTime() === NOW.getTime()
          ) {
            return false;
          }
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
