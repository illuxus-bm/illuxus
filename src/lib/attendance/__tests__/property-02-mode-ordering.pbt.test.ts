// Feature: checkin-checkout-tabs, Property 2: Mode-and-ordering invariant
//
// Validates: Requirements 5.1, 5.2, 6.1, 6.2
//
// For any registration r and any finite sequence of scanner-initiated scans
// ((tab_1, qr_1), …, (tab_n, qr_n)) against r, the resulting `attendance_events`
// rows for r satisfy both:
//   (a) every inserted row's `kind` equals 'in' if its originating `tab_i`
//       was 'check-in' and 'out' if its originating `tab_i` was 'check-out';
//   (b) at every prefix of the sequence, count(kind='out') ≤ count(kind='in').

import { describe, it } from "vitest";
import fc from "fast-check";
import { applyAttendance } from "../applyAttendance";
import type {
  Actor,
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
 * registration in `attendance_state='never'` and an event with no end date
 * (tracking window permissive). The actor is a platform admin so the
 * authorization branch never fires.
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

describe("Property 2: Mode-and-ordering invariant", () => {
  it("inserted kind matches originating tab and count(out) ≤ count(in) at every prefix", () => {
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
          // Tag every inserted attendance event with the tab that produced
          // it so we can check kind matches the originating tab.
          const tabPerEventRow: Tab[] = [];
          const now = new Date("2025-01-01T12:00:00.000Z");

          for (const { tab, qr } of sequence) {
            const target = tabToTarget(tab);
            const before = world.attendanceEvents.length;
            const { world: next } = applyAttendance(
              world,
              qr,
              target,
              "qr",
              ACTOR,
              now
            );
            const after = next.attendanceEvents.length;

            // applyAttendance is allowed to insert at most one row per call.
            if (after !== before && after !== before + 1) {
              return false;
            }
            if (after === before + 1) {
              tabPerEventRow.push(tab);
            }
            world = next;

            // Property (a): every inserted row's kind matches its tab.
            for (let i = 0; i < world.attendanceEvents.length; i++) {
              const row = world.attendanceEvents[i];
              const expectedKind =
                tabPerEventRow[i] === "check-in" ? "in" : "out";
              if (row.kind !== expectedKind) {
                return false;
              }
            }

            // Property (b): at this prefix, count(out) ≤ count(in).
            let inCount = 0;
            let outCount = 0;
            for (const row of world.attendanceEvents) {
              if (row.kind === "in") inCount++;
              else if (row.kind === "out") outCount++;
            }
            if (outCount > inCount) {
              return false;
            }
          }
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
