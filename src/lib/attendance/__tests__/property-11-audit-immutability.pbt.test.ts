// Feature: checkin-checkout-tabs, Property 11: Audit-trail immutability
//
// Validates: Requirements 12.3
//
// For any sequence of scanner-initiated `setAttendance` calls against a
// registration `r`, the set of `attendance_events` rows existing BEFORE
// each call is a (multi-)subset of the set existing AFTER the call —
// i.e. no row is mutated or removed by a scanner-initiated transition.
//
// Comparison is by deep-equality of every prior row tuple:
//   (registration_id, kind, method, actor_id, occurred_at)

import { describe, it } from "vitest";
import fc from "fast-check";
import { setAttendance } from "../applyAttendance";
import type {
  Actor,
  AttendanceEventRow,
  EventFixture,
  RegistrationFixture,
  Tab,
  Target,
  World,
} from "../types";

const REG_ID = "11111111-1111-4111-8111-111111111111";
const EVENT_ID = "22222222-2222-4222-8222-222222222222";
const ACTOR_ID = "33333333-3333-4333-8333-333333333333";

/** Tab → target mapping per the design's "Tab → RPC Mapping" table. */
const tabToTarget = (tab: Tab): Target =>
  tab === "check-in" ? "inside" : "outside";

/**
 * Build a fresh world holding a single confirmed/approved fixture
 * registration in `attendance_state='never'` and an event with no end
 * date (tracking window permissive). The actor is a platform admin so
 * the authorization branch never fires; this keeps the property focused
 * on audit-trail behavior.
 */
function makeWorld(): World {
  const reg: RegistrationFixture = {
    id: REG_ID,
    event_id: EVENT_ID,
    status: "confirmed",
    approval_status: "approved",
    attendance_state: "never",
    qr_code: "qr-code-fixture",
    join_token: "join-token-fixture",
    kind: "attendee",
    last_in_at: null,
    last_out_at: null,
  };
  const event: EventFixture = {
    id: EVENT_ID,
    end_date: null,
  };
  return {
    registrations: new Map([[REG_ID, reg]]),
    events: new Map([[EVENT_ID, event]]),
    attendanceEvents: [],
    now: new Date("2025-01-01T12:00:00.000Z"),
  };
}

const ACTOR: Actor = { id: ACTOR_ID, role: "admin" };

/**
 * Stable serialization of an `attendance_events` row tuple. Two rows are
 * "the same" iff their tuple keys are equal.
 */
function tupleKey(r: AttendanceEventRow): string {
  return [
    r.registration_id,
    r.kind,
    r.method,
    r.actor_id,
    r.occurred_at.toISOString(),
  ].join("|");
}

/** Multiset-of-tuples representation of a row collection. */
function toMultiset(
  rows: readonly AttendanceEventRow[]
): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = tupleKey(r);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

/** True iff every (key, count) entry in `a` has count ≤ `b`'s count. */
function isSubsetMultiset(
  a: Map<string, number>,
  b: Map<string, number>
): boolean {
  for (const [k, v] of a) {
    if ((b.get(k) ?? 0) < v) return false;
  }
  return true;
}

describe("Property 11: Audit-trail immutability", () => {
  it("prior attendance_events rows are preserved (no mutation, no removal) across every scanner-initiated step", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            tab: fc.constantFrom<Tab>("check-in", "check-out"),
            qr: fc.constant(REG_ID),
          }),
          { maxLength: 20 }
        ),
        (sequence) => {
          let world = makeWorld();
          const now = new Date("2025-01-01T12:00:00.000Z");

          for (const { tab, qr } of sequence) {
            const target = tabToTarget(tab);

            // Snapshot the audit trail BEFORE the call.
            const prevRows = world.attendanceEvents;
            const prevMultiset = toMultiset(prevRows);

            const { world: next } = setAttendance(
              world,
              qr,
              target,
              "qr",
              ACTOR,
              now
            );

            // Audit-trail immutability: every prior tuple must still
            // appear in the post-call audit trail with at least the
            // same multiplicity.
            const nextMultiset = toMultiset(next.attendanceEvents);
            if (!isSubsetMultiset(prevMultiset, nextMultiset)) {
              return false;
            }

            // Belt-and-braces: also assert that for every index i in
            // prevRows, the i-th row of next deeply equals prevRows[i].
            // The implementation appends rather than reorders, so the
            // append-only invariant should hold by index, too.
            if (next.attendanceEvents.length < prevRows.length) {
              return false;
            }
            for (let i = 0; i < prevRows.length; i++) {
              const a = prevRows[i];
              const b = next.attendanceEvents[i];
              if (
                a.registration_id !== b.registration_id ||
                a.kind !== b.kind ||
                a.method !== b.method ||
                a.actor_id !== b.actor_id ||
                a.occurred_at.getTime() !== b.occurred_at.getTime()
              ) {
                return false;
              }
            }

            world = next;
          }
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
