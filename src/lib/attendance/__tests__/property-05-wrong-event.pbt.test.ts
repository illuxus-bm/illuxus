// Feature: checkin-checkout-tabs, Property 5: Cross-event QR rejection
//
// Validates: Requirements 2.4
//
// For any registration `r` and any `eventId E ≠ r.event_id`, calling
// `setAttendance` while the dashboard is scoped to `E` returns
// `code = 'wrong_event'` and the count of `attendance_events` rows for
// `r` is unchanged.
//
// The SQL `set_attendance` helper takes only a registration id and so
// cannot itself enforce this — the guard lives at the client-resolution
// layer in `QRScannerDialog`. We encode that layer as the small
// `resolveAndDispatch(world, token, dashboardEventId, …)` helper inside
// `applyAttendance.ts` so the property is testable without React.

import { describe, it } from "vitest";
import fc from "fast-check";

import { resolveAndDispatch } from "../applyAttendance";
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

// ─── Fixed identifiers ─────────────────────────────────────────────────────

const REG_ID = "11111111-1111-4111-8111-111111111111";
const REG_EVENT_ID = "22222222-2222-4222-8222-222222222222";
const ACTOR_ID = "33333333-3333-4333-8333-333333333333";
const NOW = new Date("2025-06-15T12:00:00.000Z");
const FUTURE_END = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);

// ─── Generators ────────────────────────────────────────────────────────────

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

const arbKind: fc.Arbitrary<RegistrationFixture["kind"]> = fc.constantFrom(
  "attendee",
  "speaker",
  "sponsor_contact"
);

/**
 * Any other event id distinct from the registration's event id. The
 * property is over the universal class of `E ≠ r.event_id`, so we
 * generate a UUID and reject (filter) the collision case.
 */
const arbOtherEventId: fc.Arbitrary<string> = fc
  .uuid()
  .filter((id) => id !== REG_EVENT_ID);

/**
 * Pick which accepted QR form to use as the decoded token. For
 * non-speaker / non-sponsor_contact registrations, only the id /
 * qr_code / join_token forms are valid (the scoped forms would not
 * resolve and would short-circuit on `'not_found'`/`'invalid'`, which is
 * a different property — see Property 4).
 */
const arbTokenForm: fc.Arbitrary<"id" | "qr" | "join" | "scoped"> =
  fc.constantFrom("id", "qr", "join", "scoped");

const arbPermissiveRegistration = (
  state: AttendanceState,
  kind: RegistrationFixture["kind"]
): RegistrationFixture => ({
  id: REG_ID,
  event_id: REG_EVENT_ID,
  status: "confirmed",
  approval_status: "approved",
  attendance_state: state,
  qr_code: "qr-permissive",
  join_token: "token-permissive",
  kind,
  last_in_at: state === "inside" ? new Date(NOW.getTime() - 60_000) : null,
  last_out_at: state === "outside" ? new Date(NOW.getTime() - 60_000) : null,
});

const buildWorld = (reg: RegistrationFixture): World => {
  // The dashboard event itself need not contain the registration; the
  // wrong_event guard fires before any event-side check. We still seed
  // the registration's home event so the tracking-window check would
  // have something to look up if the guard were ever bypassed.
  const homeEvent: EventFixture = { id: REG_EVENT_ID, end_date: FUTURE_END };
  return {
    registrations: new Map([[reg.id, reg]]),
    events: new Map([[homeEvent.id, homeEvent]]),
    attendanceEvents: [] as readonly AttendanceEventRow[],
    now: NOW,
  };
};

const tokenFor = (
  reg: RegistrationFixture,
  form: "id" | "qr" | "join" | "scoped"
): string => {
  switch (form) {
    case "id":
      return reg.id;
    case "qr":
      return reg.qr_code;
    case "join":
      return reg.join_token;
    case "scoped":
      // Only valid for speaker / sponsor_contact rows; for attendees we
      // fall back to the id form since the scoped form wouldn't resolve.
      if (reg.kind === "speaker") return `speaker:${reg.id}`;
      if (reg.kind === "sponsor_contact") return `sponsor_contact:${reg.id}`;
      return reg.id;
  }
};

// ─── Property ──────────────────────────────────────────────────────────────

describe("Property 5: Cross-event QR rejection", () => {
  it("scanning a QR while scoped to a different event returns 'wrong_event' and writes nothing", () => {
    fc.assert(
      fc.property(
        arbAttendanceState,
        arbKind,
        arbTab,
        arbActor,
        arbOtherEventId,
        arbTokenForm,
        (preState, kind, tab, actor, dashboardEventId, form) => {
          const reg = arbPermissiveRegistration(preState, kind);
          const world = buildWorld(reg);
          const eventsBefore = world.attendanceEvents.length;
          const target = tabToTarget(tab);
          const token = tokenFor(reg, form);

          const { code, world: nextWorld } = resolveAndDispatch(
            world,
            token,
            dashboardEventId,
            target,
            "qr",
            actor,
            NOW
          );

          // (1) Result code must be 'wrong_event'.
          if (code !== "wrong_event") {
            return false;
          }

          // (2) Total attendance_events count is unchanged.
          if (nextWorld.attendanceEvents.length !== eventsBefore) {
            return false;
          }

          // (3) No row was appended for this registration.
          const rowsForReg = nextWorld.attendanceEvents.filter(
            (e) => e.registration_id === reg.id
          );
          if (rowsForReg.length !== 0) {
            return false;
          }

          // (4) The registration row itself is byte-equal to the original
          // (state, last_in_at, last_out_at all unchanged).
          const after = nextWorld.registrations.get(reg.id)!;
          return (
            after.attendance_state === reg.attendance_state &&
            after.last_in_at === reg.last_in_at &&
            after.last_out_at === reg.last_out_at
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});
