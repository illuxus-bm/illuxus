// Feature: checkin-checkout-tabs, Property 12: Bulk equivalence
//
// Validates: Requirements 15.1, 15.2, 15.3
//
// Property 12: For any array of registration ids `[id_1, …, id_n]` and
// any `target ∈ {'inside','outside'}`, the result of
// `bulkSetAttendance(ids, target)` is the array `[(id_i, c_i)]` where
// each `c_i` equals the `code` that `setAttendance(id_i, target)` would
// return when called as the same actor at the same instant against the
// world threaded by the previous per-row calls.
//
// The bulk function threads the world through each call (mirroring the
// SQL `bulk_set_attendance` FOREACH loop) so duplicate ids see the
// effects of earlier ops in the sequence — e.g. two consecutive
// `target='inside'` calls on the same id produce `applied_in` then
// `already_inside`. The reference run mirrors that by threading the
// world through each `setAttendance` call.
//
// REQ-15.3 shape: the bulk result array length equals the input length,
// including ids that resolve to `not_found`, `unauthorized`, etc.

import { describe, it } from "vitest";
import fc from "fast-check";

import { bulkSetAttendance, setAttendance } from "../applyAttendance";
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

const EVENT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACTOR_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NOW = new Date("2025-06-15T12:00:00.000Z");
// Tracking window stays open: end_date 24h in the future.
const FUTURE_END = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);

/**
 * Fixed pool of registration ids the world is drawn from. Keeping the
 * pool small (5) makes duplicate ids in the input array more likely so
 * the "threaded world" aspect of the property is meaningfully exercised.
 */
const REG_IDS = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
  "55555555-5555-4555-8555-555555555555",
] as const;

/**
 * An id that is never present in the world, used to exercise the
 * `not_found` branch alongside seeded ids. REQ-15.3 says the bulk array
 * length matches the input length even for ids that don't resolve.
 */
const UNKNOWN_ID = "deadbeef-dead-4ead-8ead-deadbeefdead";

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
 * A registration drawn from the fixed id pool with arbitrary status,
 * approval, and pre-scan attendance state. The world is built by
 * collecting these into a Map keyed by id (last-write-wins) so duplicate
 * id draws don't break the world's id-uniqueness invariant.
 */
const arbRegistration: fc.Arbitrary<RegistrationFixture> = fc.record({
  id: fc.constantFrom(...REG_IDS),
  event_id: fc.constant(EVENT_ID),
  status: arbStatus,
  approval_status: arbApprovalStatus,
  attendance_state: arbAttendanceState,
  qr_code: fc.string({ minLength: 1, maxLength: 16 }),
  join_token: fc.string({ minLength: 1, maxLength: 16 }),
  kind: fc.constantFrom<RegistrationFixture["kind"]>(
    "attendee",
    "speaker",
    "sponsor_contact"
  ),
  last_in_at: fc.constant(null),
  last_out_at: fc.constant(null),
});

/**
 * An admin actor: fully authorized for any event so the property
 * exercises the full state machine downstream of the authorization
 * branch (rather than every row short-circuiting to `unauthorized`).
 * Bulk equivalence holds for any actor; admin is the most informative
 * choice because it lets the state-machine and status-guard branches
 * also fire.
 */
const arbActor: fc.Arbitrary<Actor> = fc.record({
  id: fc.constant(ACTOR_ID),
  role: fc.constant<Actor["role"]>("admin"),
});

/**
 * The id array passed to `bulkSetAttendance`. Sampled from the fixed
 * pool plus the always-unknown id so the property covers:
 *   - ids present in the world (state machine + status guards)
 *   - ids absent from the world (`not_found`)
 *   - duplicates (threaded-world effects: applied_in → already_inside, etc.)
 */
const arbIds: fc.Arbitrary<readonly string[]> = fc.array(
  fc.constantFrom<string>(...REG_IDS, UNKNOWN_ID),
  { minLength: 0, maxLength: 8 }
);

const buildWorld = (regs: readonly RegistrationFixture[]): World => {
  // Dedupe by id (last write wins) so the world has at most one row per id.
  const map = new Map<string, RegistrationFixture>();
  for (const r of regs) map.set(r.id, r);
  const event: EventFixture = { id: EVENT_ID, end_date: FUTURE_END };
  return {
    registrations: map,
    events: new Map([[event.id, event]]),
    attendanceEvents: [] as readonly AttendanceEventRow[],
    now: NOW,
  };
};

// ─── Property ──────────────────────────────────────────────────────────────

describe("Property 12: Bulk equivalence", () => {
  it("bulkSetAttendance equals the per-row threaded run of setAttendance, with length matching input", () => {
    fc.assert(
      fc.property(
        fc.array(arbRegistration, { minLength: 0, maxLength: 5 }),
        arbIds,
        arbTarget,
        arbMethod,
        arbActor,
        (regs, ids, target, method, actor) => {
          const world = buildWorld(regs);

          // ── Bulk run ───────────────────────────────────────────────────
          const bulkResults = bulkSetAttendance(
            world,
            ids,
            target,
            method,
            actor,
            NOW
          );

          // ── Reference run: thread the world through per-row setAttendance ─
          // The bulk function threads the world through each call, so
          // duplicate ids see the effect of earlier ops. We mirror that
          // here by threading `current` through each setAttendance call.
          const refResults: Array<{
            registration_id: string;
            code: string;
          }> = [];
          let current = world;
          for (const id of ids) {
            const { code, world: next } = setAttendance(
              current,
              id,
              target,
              method,
              actor,
              NOW
            );
            refResults.push({ registration_id: id, code });
            current = next;
          }

          // ── REQ-15.3: length matches input length ──────────────────────
          if (bulkResults.length !== ids.length) return false;
          if (refResults.length !== ids.length) return false;

          // ── Per-row equivalence ────────────────────────────────────────
          // Same registration_id at each index (order preserved, REQ-15.1)
          // and same result code (REQ-15.2).
          for (let i = 0; i < ids.length; i += 1) {
            if (bulkResults[i].registration_id !== ids[i]) return false;
            if (
              bulkResults[i].registration_id !==
              refResults[i].registration_id
            ) {
              return false;
            }
            if (bulkResults[i].code !== refResults[i].code) return false;
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
