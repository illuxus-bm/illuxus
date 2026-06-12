// Feature: checkin-checkout-tabs, Property 8: Authorization guard
//
// Validates: Requirements 13.2
//
// For any registration `r` and any actor `a` whose role is neither
// `admin` nor `owner of r.event_id`, calling `setAttendance(r, …, a)`
// returns `code='unauthorized'` and the count of `attendance_events`
// rows for `r` is unchanged.
//
// The same property applies to `bulkSetAttendance` containing `r.id`:
// every entry in the result array whose `registration_id === r.id`
// has `code='unauthorized'`, and `attendanceEvents` for `r` is unchanged.
//
// We model "non-authorized actor" as `role: 'other'` per types.ts:
//   - `admin` → platform admin (authorized for any event)
//   - `owner` → owner of the event being acted on (authorized)
//   - `other` → neither admin nor owner (rejected with `unauthorized`)

import { describe, it } from "vitest";
import fc from "fast-check";

import {
  applyAttendance,
  bulkSetAttendance,
  setAttendance,
} from "../applyAttendance";
import type {
  Actor,
  ApprovalStatus,
  AttendanceEventRow,
  AttendanceState,
  EventFixture,
  Method,
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

// ─── Generators ────────────────────────────────────────────────────────────

const arbAttendanceState: fc.Arbitrary<AttendanceState> = fc.constantFrom(
  "never",
  "inside",
  "outside"
);

const arbStatus: fc.Arbitrary<RegistrationStatus> = fc.constantFrom(
  "confirmed",
  "pending",
  "cancelled"
);

const arbApprovalStatus: fc.Arbitrary<ApprovalStatus> = fc.constantFrom(
  "pending",
  "approved",
  "waitlisted",
  "declined"
);

const arbTarget: fc.Arbitrary<Target> = fc.constantFrom("inside", "outside");

const arbMethod: fc.Arbitrary<Method> = fc.constantFrom(
  "qr",
  "bulk",
  "manual",
  "self"
);

/**
 * Event end date freely sampled across a wide window around NOW so the
 * tracking-window branch is covered both ways. The authorization branch
 * runs BEFORE the tracking-window branch in `_apply_attendance`, so an
 * unauthorized actor must short-circuit to `'unauthorized'` regardless of
 * whether the tracking window is open or closed.
 */
const arbEventEnd: fc.Arbitrary<Date | null> = fc.option(
  fc
    .integer({
      // ±7 days around NOW in milliseconds
      min: -7 * 24 * 60 * 60 * 1000,
      max: 7 * 24 * 60 * 60 * 1000,
    })
    .map((delta) => new Date(NOW.getTime() + delta)),
  { nil: null, freq: 4 }
);

/**
 * The unauthorized actor: role is neither `admin` nor `owner of r.event_id`.
 * In the TS port this is the `'other'` role per types.ts.
 */
const arbUnauthorizedActor: fc.Arbitrary<Actor> = fc.record({
  id: fc.constant(ACTOR_ID),
  role: fc.constant<Actor["role"]>("other"),
});

/**
 * A registration with arbitrary state, status, and approval. The
 * authorization branch runs before any of these are inspected, so the
 * property must hold no matter what the row looks like.
 */
const arbRegistration: fc.Arbitrary<RegistrationFixture> = fc.record({
  id: fc.constant(REG_ID),
  event_id: fc.constant(EVENT_ID),
  status: arbStatus,
  approval_status: arbApprovalStatus,
  attendance_state: arbAttendanceState,
  qr_code: fc.constant("qr-fixture"),
  join_token: fc.constant("token-fixture"),
  kind: fc.constantFrom<RegistrationFixture["kind"]>(
    "attendee",
    "speaker",
    "sponsor_contact"
  ),
  last_in_at: fc.constant(null),
  last_out_at: fc.constant(null),
});

const buildWorld = (
  reg: RegistrationFixture,
  eventEnd: Date | null
): World => {
  const event: EventFixture = { id: EVENT_ID, end_date: eventEnd };
  return {
    registrations: new Map([[reg.id, reg]]),
    events: new Map([[event.id, event]]),
    attendanceEvents: [] as readonly AttendanceEventRow[],
    now: NOW,
  };
};

const eventsForReg = (
  rows: readonly AttendanceEventRow[],
  regId: string
): readonly AttendanceEventRow[] => rows.filter((r) => r.registration_id === regId);

// ─── Property ──────────────────────────────────────────────────────────────

describe("Property 8: Authorization guard", () => {
  it("setAttendance with a non-admin non-owner actor returns 'unauthorized' and writes nothing", () => {
    fc.assert(
      fc.property(
        arbRegistration,
        arbEventEnd,
        arbTarget,
        arbMethod,
        arbUnauthorizedActor,
        (reg, eventEnd, target, method, actor) => {
          const world = buildWorld(reg, eventEnd);
          const eventsBefore = world.attendanceEvents.length;
          const eventsForRegBefore = eventsForReg(
            world.attendanceEvents,
            REG_ID
          ).length;

          const { code, world: nextWorld, result } = setAttendance(
            world,
            REG_ID,
            target,
            method,
            actor,
            NOW
          );

          // Result code is 'unauthorized'.
          if (code !== "unauthorized") return false;
          if (result.code !== "unauthorized") return false;

          // attendance_events count is unchanged globally and for r.
          if (nextWorld.attendanceEvents.length !== eventsBefore) return false;
          if (
            eventsForReg(nextWorld.attendanceEvents, REG_ID).length !==
            eventsForRegBefore
          ) {
            return false;
          }

          // The registration's attendance_state is untouched.
          const regAfter = nextWorld.registrations.get(REG_ID)!;
          if (regAfter.attendance_state !== reg.attendance_state) return false;
          if (regAfter.last_in_at !== reg.last_in_at) return false;
          if (regAfter.last_out_at !== reg.last_out_at) return false;

          // Cross-check the lower-level helper exposes the same code.
          const direct = applyAttendance(
            world,
            REG_ID,
            target,
            method,
            actor,
            NOW
          );
          if (direct.code !== "unauthorized") return false;
          if (direct.world.attendanceEvents.length !== eventsBefore) {
            return false;
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it("bulkSetAttendance with a non-admin non-owner actor returns 'unauthorized' for every entry of r.id and writes nothing", () => {
    fc.assert(
      fc.property(
        arbRegistration,
        arbEventEnd,
        arbTarget,
        arbMethod,
        arbUnauthorizedActor,
        // 1..5 copies of REG_ID in the input id array, mirroring what the
        // SQL `bulk_set_attendance` FOREACH loop sees when callers pass
        // duplicates. We restrict to REG_ID so every result row pertains
        // to the registration the property is about (other ids would yield
        // 'not_found', not 'unauthorized').
        fc.array(fc.constant(REG_ID), { minLength: 1, maxLength: 5 }),
        (reg, eventEnd, target, method, actor, ids) => {
          const world = buildWorld(reg, eventEnd);
          const eventsBefore = world.attendanceEvents.length;
          const eventsForRegBefore = eventsForReg(
            world.attendanceEvents,
            REG_ID
          ).length;

          const results = bulkSetAttendance(
            world,
            ids,
            target,
            method,
            actor,
            NOW
          );

          // Result array length matches input length (REQ-15.3 shape, also
          // a precondition for "every entry for r.id is unauthorized").
          if (results.length !== ids.length) return false;

          // Every entry whose registration_id is REG_ID has code='unauthorized'.
          for (const row of results) {
            if (row.registration_id !== REG_ID) {
              // Should not happen: we only seeded REG_ID into ids.
              return false;
            }
            if (row.code !== "unauthorized") return false;
          }

          // Re-run the bulk to confirm it's a pure function of the world
          // (no hidden state) and check the resulting world is unchanged.
          // Since `bulkSetAttendance` returns only the result array, we
          // verify the world by replaying via applyAttendance and
          // observing that attendance_events for r remains empty.
          let current = world;
          for (const id of ids) {
            const { world: next } = applyAttendance(
              current,
              id,
              target,
              method,
              actor,
              NOW
            );
            current = next;
          }
          if (current.attendanceEvents.length !== eventsBefore) return false;
          if (
            eventsForReg(current.attendanceEvents, REG_ID).length !==
            eventsForRegBefore
          ) {
            return false;
          }

          // Registration row state is preserved.
          const regAfter = current.registrations.get(REG_ID)!;
          if (regAfter.attendance_state !== reg.attendance_state) return false;

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
