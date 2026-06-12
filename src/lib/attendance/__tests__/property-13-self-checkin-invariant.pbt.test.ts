// Feature: checkin-checkout-tabs, Property 13: Self-check-in invariant
//
// Validates: Requirements 14.1, 14.2, 14.3
//
// The patched `self_check_in` RPC (see
// `supabase/migrations/007_self_check_in_no_out.sql`) must satisfy two
// invariants for any registration `r` and any invocation that resolves
// to `r`:
//
//   (A) No `attendance_events` row with `kind = 'out'` is ever inserted
//       as a result of the call. (REQ-14.1, REQ-14.2 — the public
//       self-check-in flow is check-in only, by construction.)
//
//   (B) When `r.attendance_state = 'outside'` immediately before the
//       call, the post-call `attendance_state = 'inside'`. (REQ-14.3 —
//       re-entry is preserved.)
//
// This test drives the deterministic TypeScript port of the patched
// RPC, `selfCheckIn`, exported from `../applyAttendance.ts`.

import { describe, it } from "vitest";
import fc from "fast-check";

import { selfCheckIn } from "../applyAttendance";
import type {
  AttendanceEventRow,
  AttendanceState,
  EventFixture,
  RegistrationFixture,
  World,
} from "../types";

// ─── Fixed identifiers ─────────────────────────────────────────────────────

const REG_ID = "11111111-1111-4111-8111-111111111111";
const EVENT_ID = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2025-06-15T12:00:00.000Z");
// end_date a day in the future → tracking window open (no `'expired'`).
const FUTURE_END = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);

// ─── Generators ────────────────────────────────────────────────────────────

const arbAttendanceState: fc.Arbitrary<AttendanceState> = fc.constantFrom(
  "never",
  "inside",
  "outside"
);

const arbKind: fc.Arbitrary<RegistrationFixture["kind"]> = fc.constantFrom(
  "attendee",
  "speaker",
  "sponsor_contact"
);

/**
 * Which of the accepted token forms drives this scenario. The SQL
 * `self_check_in` accepts the same forms `resolveQr` does:
 *   - `id` / `qr_code` / `join_token` (the plain forms)
 *   - `speaker:<id>` (only when kind = 'speaker')
 *   - `sponsor_contact:<id>` (only when kind = 'sponsor_contact')
 */
const arbTokenForm: fc.Arbitrary<"id" | "qr" | "join" | "scoped"> =
  fc.constantFrom("id", "qr", "join", "scoped");

/**
 * Whether the dashboard passes its event id into the call. The SQL side
 * accepts NULL (`p_event_id DEFAULT NULL`); the TS port treats `null`
 * and `undefined` identically. Scoped tokens force `eventId` to be
 * present (the SQL returns `'wrong_event'` immediately when scoped +
 * NULL), so this flag is only consulted for plain tokens.
 */
const arbWithEventId = fc.boolean();

interface Scenario {
  readonly reg: RegistrationFixture;
  readonly world: World;
  readonly token: string;
  readonly eventIdInput: string | null;
}

/**
 * Build a happy-path scenario whose only variable is the pre-call
 * `attendance_state`. The registration is non-cancelled, the event is
 * inside the tracking window, the token is a valid form for the
 * registration, and `eventIdInput` (when provided) matches
 * `reg.event_id` so the cross-event guard never fires. Under these
 * conditions, the only branch that can suppress the insert is the
 * patched `'inside' → 'already'` branch the property is testing.
 */
const arbScenario: fc.Arbitrary<Scenario> = fc
  .record({
    state: arbAttendanceState,
    kind: arbKind,
    form: arbTokenForm,
    withEventId: arbWithEventId,
  })
  .map(({ state, kind, form, withEventId }): Scenario => {
    const reg: RegistrationFixture = {
      id: REG_ID,
      event_id: EVENT_ID,
      status: "confirmed",
      approval_status: "approved",
      attendance_state: state,
      qr_code: "qr-self-checkin",
      join_token: "token-self-checkin",
      kind,
      last_in_at:
        state === "inside" ? new Date(NOW.getTime() - 60_000) : null,
      last_out_at:
        state === "outside" ? new Date(NOW.getTime() - 60_000) : null,
    };

    let token: string;
    switch (form) {
      case "id":
        token = reg.id;
        break;
      case "qr":
        token = reg.qr_code;
        break;
      case "join":
        token = reg.join_token;
        break;
      case "scoped":
        // The scoped form is only valid for speaker / sponsor_contact
        // registrations. For attendees, fall back to the id form so the
        // scenario still resolves to `reg` (the property is over
        // resolutions; misses are exercised by Property 4).
        if (reg.kind === "speaker") {
          token = `speaker:${reg.id}`;
        } else if (reg.kind === "sponsor_contact") {
          token = `sponsor_contact:${reg.id}`;
        } else {
          token = reg.id;
        }
        break;
    }

    const isScoped =
      token.startsWith("speaker:") || token.startsWith("sponsor_contact:");
    // Scoped tokens require an event id; for plain tokens the dashboard
    // may pass either the matching id or `null`.
    const eventIdInput: string | null = isScoped
      ? EVENT_ID
      : withEventId
        ? EVENT_ID
        : null;

    const event: EventFixture = { id: EVENT_ID, end_date: FUTURE_END };
    const world: World = {
      registrations: new Map([[reg.id, reg]]),
      events: new Map([[event.id, event]]),
      attendanceEvents: [] as readonly AttendanceEventRow[],
      now: NOW,
    };

    return { reg, world, token, eventIdInput };
  });

// ─── Property ──────────────────────────────────────────────────────────────

describe("Property 13: Self-check-in invariant", () => {
  it("never inserts kind='out', and re-enters from 'outside' to 'inside'", () => {
    fc.assert(
      fc.property(arbScenario, ({ reg, world, token, eventIdInput }) => {
        const eventsBefore = world.attendanceEvents;

        const { status, world: nextWorld } = selfCheckIn(
          world,
          token,
          eventIdInput,
          NOW
        );

        // Rows appended by THIS call. Any prior rows (none, in these
        // scenarios) are subsumed; we only inspect the suffix.
        const addedRows = nextWorld.attendanceEvents.slice(
          eventsBefore.length
        );

        // ── Invariant (A): no `kind = 'out'` row was inserted ─────────
        // Holds for every status: 'ok' (kind='in'), 'already' (no row),
        // 'wrong_event' / 'not_found' / 'invalid' / 'cancelled' /
        // 'expired' (all reject before the state machine, no row).
        if (addedRows.some((r) => r.kind === "out")) {
          return false;
        }

        // ── Invariant (B): outside → inside re-entry ──────────────────
        // The scenario guarantees the call cannot be rejected by any of
        // the guards (status confirmed, event in-window, eventId either
        // absent or matching). Under those conditions, a pre-state of
        // 'outside' must yield post-state 'inside' AND the patched
        // function must return 'ok' AND must have inserted exactly one
        // row of `kind = 'in', method = 'self'`.
        if (reg.attendance_state === "outside") {
          const after = nextWorld.registrations.get(reg.id)!;
          if (after.attendance_state !== "inside") return false;
          if (status !== "ok") return false;
          if (addedRows.length !== 1) return false;
          const row = addedRows[0];
          if (
            row.registration_id !== reg.id ||
            row.kind !== "in" ||
            row.method !== "self"
          ) {
            return false;
          }
        }

        // ── Critical regression check (REQ-14.1, REQ-14.2) ────────────
        // The pre-patch SQL inserted kind='out' here. The patched SQL
        // (and this TS port) must return 'already' with no row.
        if (reg.attendance_state === "inside") {
          if (status !== "already") return false;
          if (addedRows.length !== 0) return false;
          const after = nextWorld.registrations.get(reg.id)!;
          if (after.attendance_state !== "inside") return false;
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });
});
