// Feature: checkin-checkout-tabs, Property 4: QR resolution is total and unique
//
// Validates: Requirements 2.1, 2.2, 2.3, 2.5
//
// For any registration `r`, every accepted QR form resolves back to `r` and
// to no other registration:
//   - `r.id`
//   - `r.qr_code`
//   - `r.join_token`
//   - `speaker:<r.id>`         iff `r.kind === 'speaker'`
//   - `sponsor_contact:<r.id>` iff `r.kind === 'sponsor_contact'`
//
// For any token that does not match any of the accepted forms, `resolveQr`
// returns `null`.

import { describe, it } from "vitest";
import fc from "fast-check";

import { resolveQr } from "../applyAttendance";
import type {
  AttendanceEventRow,
  EventFixture,
  RegistrationFixture,
  World,
} from "../types";

// ─── Generators ────────────────────────────────────────────────────────────

const EVENT_ID = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2025-06-15T12:00:00.000Z");
// end_date a day in the future → tracking window irrelevant for resolution.
const FUTURE_END = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);

const arbKind: fc.Arbitrary<RegistrationFixture["kind"]> = fc.constantFrom(
  "attendee",
  "speaker",
  "sponsor_contact"
);

/**
 * Up to five registrations sharing one event with globally unique `id`,
 * `qr_code`, and `join_token` values.
 *
 * `fc.uuid()` provides UUIDs whose hex form cannot start with `qr_` or
 * `jt_`, so the prefixed `qr_code` / `join_token` strings cannot collide
 * with any UUID. The index baked into each prefix guarantees `qr_code`
 * values are unique across the array, same for `join_token`. The
 * `qr_` / `jt_` prefixes also cannot collide with the literal
 * `speaker:` / `sponsor_contact:` accepted forms.
 */
const arbRegistrations: fc.Arbitrary<readonly RegistrationFixture[]> = fc
  .uniqueArray(
    fc.record({
      id: fc.uuid(),
      qrSeed: fc.string({ minLength: 3, maxLength: 15 }),
      jtSeed: fc.string({ minLength: 3, maxLength: 15 }),
      kind: arbKind,
    }),
    {
      minLength: 1,
      maxLength: 5,
      selector: (r) => r.id,
    }
  )
  .map((seeds) =>
    seeds.map<RegistrationFixture>((s, i) => ({
      id: s.id,
      event_id: EVENT_ID,
      status: "confirmed",
      approval_status: "approved",
      attendance_state: "never",
      qr_code: `qr_${i}_${s.qrSeed}`,
      join_token: `jt_${i}_${s.jtSeed}`,
      kind: s.kind,
      last_in_at: null,
      last_out_at: null,
    }))
  );

const buildWorld = (regs: readonly RegistrationFixture[]): World => {
  const registrations = new Map<string, RegistrationFixture>();
  for (const r of regs) registrations.set(r.id, r);
  const event: EventFixture = { id: EVENT_ID, end_date: FUTURE_END };
  return {
    registrations,
    events: new Map([[event.id, event]]),
    attendanceEvents: [] as readonly AttendanceEventRow[],
    now: NOW,
  };
};

/**
 * The set of tokens that DO match an accepted QR form for the given
 * registrations. Used to filter `fc.string()` so the bogus token under
 * test cannot accidentally match an accepted form.
 */
const acceptedTokens = (
  regs: readonly RegistrationFixture[]
): ReadonlySet<string> => {
  const tokens = new Set<string>();
  for (const r of regs) {
    tokens.add(r.id);
    tokens.add(r.qr_code);
    tokens.add(r.join_token);
    if (r.kind === "speaker") tokens.add(`speaker:${r.id}`);
    if (r.kind === "sponsor_contact") tokens.add(`sponsor_contact:${r.id}`);
  }
  return tokens;
};

/**
 * A scenario pairs a fresh world with a bogus token guaranteed not to
 * match any accepted form for that world.
 *
 * `arbBogusToken = fc.string()` filtered to exclude the accepted set —
 * including tokens of the form `speaker:<id>` / `sponsor_contact:<id>`
 * that target a registration of the matching `kind`. Any other random
 * string (including malformed `speaker:<garbage>` literals or strings
 * targeting a registration of the wrong kind) is bogus by construction
 * because `resolveQr` returns `null` for them.
 */
const arbScenario = arbRegistrations.chain((regs) => {
  const accepted = acceptedTokens(regs);
  const arbBogusToken = fc.string().filter((t) => !accepted.has(t));
  return fc.tuple(fc.constant(regs), arbBogusToken);
});

// ─── Property ──────────────────────────────────────────────────────────────

describe("Property 4: QR resolution is total and unique", () => {
  it("accepted QR forms resolve to their registration and no other; bogus tokens resolve to null", () => {
    fc.assert(
      fc.property(arbScenario, ([regs, bogus]) => {
        const world = buildWorld(regs);

        // (1) Every accepted form resolves back to its own registration
        // and to no other registration.
        for (const reg of regs) {
          // Plain forms — id / qr_code / join_token are always accepted.
          for (const token of [reg.id, reg.qr_code, reg.join_token]) {
            const resolved = resolveQr(world, token);
            if (resolved === null) return false;
            if (resolved.id !== reg.id) return false;
          }

          // speaker:<id> form — accepted iff kind === 'speaker'.
          const speakerToken = `speaker:${reg.id}`;
          const speakerResolved = resolveQr(world, speakerToken);
          if (reg.kind === "speaker") {
            if (speakerResolved === null) return false;
            if (speakerResolved.id !== reg.id) return false;
          } else if (speakerResolved !== null) {
            // Non-speaker registration must not resolve via the speaker form.
            return false;
          }

          // sponsor_contact:<id> form — accepted iff kind === 'sponsor_contact'.
          const sponsorToken = `sponsor_contact:${reg.id}`;
          const sponsorResolved = resolveQr(world, sponsorToken);
          if (reg.kind === "sponsor_contact") {
            if (sponsorResolved === null) return false;
            if (sponsorResolved.id !== reg.id) return false;
          } else if (sponsorResolved !== null) {
            return false;
          }
        }

        // (2) A token that does not match any accepted form resolves to null.
        if (resolveQr(world, bogus) !== null) {
          return false;
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });
});
