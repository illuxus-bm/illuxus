// Feature: checkin-checkout-tabs, Property 3: Per-tab idempotence
//
// Validates: Requirements 5.3, 5.4
//
// For any registration `r` and any tab `T ∈ {check-in, check-out}`, applying
// two scans of the same QR in tab `T` back-to-back produces the same final
// `attendance_state` and the same set of `attendance_events` rows as
// applying that scan once. Equivalent:
//
//   - if the first scan was a permitted transition (`applied_in` /
//     `applied_out`), the second returns the matching `already_inside` /
//     `already_outside` and writes no new event row;
//   - if the first scan was a rejection (`already_inside`,
//     `already_outside`, `not_checked_in_yet`, etc.), the second returns
//     the same code and writes no new event row.

import { describe, it } from "vitest";
import fc from "fast-check";

import { applyAttendance } from "../applyAttendance";
import type {
  Actor,
  AttendanceEventRow,
  AttendanceState,
  EventFixture,
  RegistrationFixture,
  ScanResultCode,
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
 * Permissive registration so the only knob the property turns is the
 * (S, T) pair. With status=confirmed, approval=approved, tracking
 * window open, and an authorized actor, the only branches reachable are
 * the state-machine branches (applied_in / applied_out / already_inside /
 * already_outside / not_checked_in_yet).
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

const buildWorld = (state: AttendanceState): World => {
  const reg = buildPermissiveRegistration(state);
  const event: EventFixture = { id: EVENT_ID, end_date: FUTURE_END };
  return {
    registrations: new Map([[reg.id, reg]]),
    events: new Map([[event.id, event]]),
    attendanceEvents: [] as readonly AttendanceEventRow[],
    now: NOW,
  };
};

/**
 * After a first scan returning `code1`, predict the code the second scan
 * should return. The state machine collapses every "applied" code to its
 * matching "already" code, and every other code is stable under a repeat
 * scan because none of those rejection branches mutate `attendance_state`.
 */
const expectedSecondCode = (code1: ScanResultCode): ScanResultCode => {
  if (code1 === "applied_in") return "already_inside";
  if (code1 === "applied_out") return "already_outside";
  return code1;
};

const eventsEqual = (
  a: readonly AttendanceEventRow[],
  b: readonly AttendanceEventRow[]
): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.registration_id !== y.registration_id ||
      x.kind !== y.kind ||
      x.method !== y.method ||
      x.actor_id !== y.actor_id ||
      x.occurred_at.getTime() !== y.occurred_at.getTime()
    ) {
      return false;
    }
  }
  return true;
};

// ─── Property ──────────────────────────────────────────────────────────────

describe("Property 3: Per-tab idempotence", () => {
  it("applying the same scan twice equals applying it once (same state, same events)", () => {
    fc.assert(
      fc.property(
        arbAttendanceState,
        arbTab,
        arbActor,
        (preState, tab, actor) => {
          const target = tabToTarget(tab);
          const world0 = buildWorld(preState);

          // First scan.
          const { code: code1, world: world1 } = applyAttendance(
            world0,
            REG_ID,
            target,
            "qr",
            actor,
            NOW
          );

          // Second scan against the world produced by the first.
          const { code: code2, world: world2 } = applyAttendance(
            world1,
            REG_ID,
            target,
            "qr",
            actor,
            NOW
          );

          // (1) attendance_state is unchanged between the first and second
          // post-scan worlds.
          const reg1 = world1.registrations.get(REG_ID)!;
          const reg2 = world2.registrations.get(REG_ID)!;
          if (reg1.attendance_state !== reg2.attendance_state) {
            return false;
          }

          // (2) The attendance_events row set is unchanged between the
          // first and second post-scan worlds (the second scan writes
          // nothing).
          if (!eventsEqual(world1.attendanceEvents, world2.attendanceEvents)) {
            return false;
          }

          // (3) The second result code matches the prediction:
          //   applied_in   → already_inside
          //   applied_out  → already_outside
          //   any other    → unchanged
          const expected = expectedSecondCode(code1);
          if (code2 !== expected) {
            return false;
          }

          // Sanity check the prediction itself against the design's
          // result-code surface for this (S, T) pair.
          if (target === "inside") {
            // Permitted from never/outside → applied_in then already_inside.
            if (preState === "never" || preState === "outside") {
              if (code1 !== "applied_in" || code2 !== "already_inside") {
                return false;
              }
            } else {
              // (inside, inside) → already_inside is fixed point.
              if (code1 !== "already_inside" || code2 !== "already_inside") {
                return false;
              }
            }
          } else {
            // target === 'outside'
            if (preState === "inside") {
              if (code1 !== "applied_out" || code2 !== "already_outside") {
                return false;
              }
            } else if (preState === "outside") {
              if (code1 !== "already_outside" || code2 !== "already_outside") {
                return false;
              }
            } else {
              // preState === 'never'
              if (
                code1 !== "not_checked_in_yet" ||
                code2 !== "not_checked_in_yet"
              ) {
                return false;
              }
            }
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
