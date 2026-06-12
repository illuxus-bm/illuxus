// Feature: checkin-checkout-tabs, Property 1: State-transition correctness
//
// Validates: Requirements 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 12.1, 12.2
//
// Property 1: For any registration `r` whose pre-scan `attendance_state` is
// `S ∈ {never, inside, outside}` and whose status / approval guards permit
// the transition, scanning its QR in the tab whose `target = T` results in:
//
//   - if `(S, T)` matches a permitted transition
//     (`(never|outside, inside)` or `(inside, outside)`), the post-scan
//     `attendance_state` equals `T` and exactly one new `attendance_events`
//     row exists with `kind = T==='inside' ? 'in' : 'out'`, `method = 'qr'`,
//     `actor_id = auth.uid()`;
//   - otherwise the post-scan `attendance_state` equals `S` and the count of
//     `attendance_events` rows for `r` is unchanged.

import { describe, it } from "vitest";
import fc from "fast-check";

import { applyAttendance } from "../applyAttendance";
import type {
  Actor,
  AttendanceEventRow,
  AttendanceState,
  EventFixture,
  RegistrationFixture,
  Tab,
  Target,
  World,
} from "../types";

// ─── Generators ────────────────────────────────────────────────────────────

const REG_ID = "11111111-1111-4111-8111-111111111111";
const EVENT_ID = "22222222-2222-4222-8222-222222222222";
const ACTOR_ID = "33333333-3333-4333-8333-333333333333";
const NOW = new Date("2025-06-15T12:00:00.000Z");
// end_date a day in the future → tracking window open.
const FUTURE_END = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);

const arbAttendanceState: fc.Arbitrary<AttendanceState> = fc.constantFrom(
  "never",
  "inside",
  "outside"
);

const arbTab: fc.Arbitrary<Tab> = fc.constantFrom("check-in", "check-out");

const tabToTarget = (tab: Tab): Target =>
  tab === "check-in" ? "inside" : "outside";

const arbActor: fc.Arbitrary<Actor> = fc.record({
  id: fc.constant(ACTOR_ID),
  role: fc.constantFrom<Actor["role"]>("admin", "owner"),
});

/**
 * A registration with permissive status/approval guards so that the only
 * variable the property exercises is the (S, T) state-machine transition.
 */
const arbPermissiveRegistration = (
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

const buildWorld = (state: AttendanceState): World => {
  const reg = arbPermissiveRegistration(state);
  const event: EventFixture = { id: EVENT_ID, end_date: FUTURE_END };
  return {
    registrations: new Map([[reg.id, reg]]),
    events: new Map([[event.id, event]]),
    attendanceEvents: [] as readonly AttendanceEventRow[],
    now: NOW,
  };
};

const isPermittedTransition = (s: AttendanceState, t: Target): boolean =>
  (t === "inside" && (s === "never" || s === "outside")) ||
  (t === "outside" && s === "inside");

// ─── Property ──────────────────────────────────────────────────────────────

describe("Property 1: State-transition correctness", () => {
  it("permitted transitions update state and append exactly one event; otherwise the world is unchanged", () => {
    fc.assert(
      fc.property(
        arbAttendanceState,
        arbTab,
        arbActor,
        (preState, tab, actor) => {
          const target = tabToTarget(tab);
          const expectedKind: "in" | "out" = target === "inside" ? "in" : "out";

          const world = buildWorld(preState);
          const eventsBefore = world.attendanceEvents.length;

          const { code, world: nextWorld } = applyAttendance(
            world,
            REG_ID,
            target,
            "qr",
            actor,
            NOW
          );

          const reg = nextWorld.registrations.get(REG_ID)!;
          const eventsAfter = nextWorld.attendanceEvents.length;

          if (isPermittedTransition(preState, target)) {
            // ── Permitted branch ───────────────────────────────────────────
            // Post-scan attendance_state equals T.
            if (reg.attendance_state !== target) {
              return false;
            }
            // Result code matches the target (applied_in / applied_out).
            const expectedCode =
              target === "inside" ? "applied_in" : "applied_out";
            if (code !== expectedCode) {
              return false;
            }
            // Exactly one new attendance_events row.
            if (eventsAfter !== eventsBefore + 1) {
              return false;
            }
            const newRow = nextWorld.attendanceEvents[eventsAfter - 1];
            if (
              newRow.registration_id !== REG_ID ||
              newRow.kind !== expectedKind ||
              newRow.method !== "qr" ||
              newRow.actor_id !== actor.id
            ) {
              return false;
            }
            return true;
          }

          // ── Otherwise branch: noop transitions ───────────────────────────
          // Post-scan state equals S.
          if (reg.attendance_state !== preState) {
            return false;
          }
          // attendance_events count for r is unchanged.
          if (eventsAfter !== eventsBefore) {
            return false;
          }
          // No row was appended for this registration in the new world.
          const rowsForReg = nextWorld.attendanceEvents.filter(
            (e) => e.registration_id === REG_ID
          );
          if (rowsForReg.length !== 0) {
            return false;
          }
          // The result code is the expected non-applying code.
          const expectedNoopCode =
            target === "inside"
              ? "already_inside" // (inside, inside)
              : preState === "never"
                ? "not_checked_in_yet" // (never, outside)
                : "already_outside"; // (outside, outside)
          return code === expectedNoopCode;
        }
      ),
      { numRuns: 100 }
    );
  });
});
