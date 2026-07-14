// Feature: social-creative-generator, Property 7: Combo creative rejects entities not linked to the event
//
// Validates: Requirements 4.3
//
// Property 7: For any speaker id, sponsor id, and any two sets representing
// the event's linked speaker ids and sponsor ids, `assertComboEligible`
// throws `ComboEntityNotLinkedError` if and only if the speaker id is absent
// from the linked speaker set or the sponsor id is absent from the linked
// sponsor set; it does not throw when both are present.

import { describe, it } from "vitest";
import fc from "fast-check";

import { assertComboEligible, ComboEntityNotLinkedError } from "../creative-renderer";

// ─── Generators ────────────────────────────────────────────────────────────

/**
 * Draws an id that is sometimes taken from `pool` (so the "present in set"
 * branch is well exercised) and sometimes a fresh random uuid (so the
 * "absent from set" branch is well exercised too).
 */
const arbIdMaybeFromPool = (pool: string[]) =>
  pool.length > 0 ? fc.oneof(fc.constantFrom(...pool), fc.uuid()) : fc.uuid();

const arbCase = fc
  .tuple(
    fc.array(fc.uuid(), { minLength: 0, maxLength: 5 }),
    fc.array(fc.uuid(), { minLength: 0, maxLength: 5 })
  )
  .chain(([speakerPool, sponsorPool]) =>
    fc.record({
      speakerPool: fc.constant(speakerPool),
      sponsorPool: fc.constant(sponsorPool),
      speakerId: arbIdMaybeFromPool(speakerPool),
      sponsorId: arbIdMaybeFromPool(sponsorPool),
    })
  );

// ─── Property ──────────────────────────────────────────────────────────────

describe("Property 7: Combo creative rejects entities not linked to the event", () => {
  it("throws ComboEntityNotLinkedError iff either id is missing from its linked set", () => {
    fc.assert(
      fc.property(arbCase, ({ speakerPool, sponsorPool, speakerId, sponsorId }) => {
        const speakerLinked = speakerPool.includes(speakerId);
        const sponsorLinked = sponsorPool.includes(sponsorId);

        const eventSpeakerIds = new Set(speakerPool);
        const eventSponsorIds = new Set(sponsorPool);

        let thrown: unknown = null;
        try {
          assertComboEligible(speakerId, sponsorId, eventSpeakerIds, eventSponsorIds);
        } catch (err) {
          thrown = err;
        }

        if (speakerLinked && sponsorLinked) {
          return thrown === null;
        }

        return thrown instanceof ComboEntityNotLinkedError;
      }),
      { numRuns: 100 }
    );
  });
});
