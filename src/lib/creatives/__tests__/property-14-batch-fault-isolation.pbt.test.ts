// Feature: social-creative-generator, Property 14: Batch failures are isolated and completely reported
//
// Validates: Requirements 6.5
//
// Property 14: For any list of entities and any subset of them chosen to fail
// (via a mocked `render` callback), `runBatch`'s returned outcomes partition
// the entity set exactly — every entity appears in exactly one outcome,
// entities in the failing subset have `status: "failed"`, and all others have
// `status: "success"`, regardless of the order in which entities are
// processed.

import { describe, it } from "vitest";
import fc from "fast-check";

import { runBatch } from "../creative-batch";
import { PLATFORM_FORMATS } from "../creative-templates";

// ─── Generators ────────────────────────────────────────────────────────────

const arbEntity = fc.record({
  id: fc.uuid(),
  name: fc
    .string({ minLength: 1, maxLength: 30 })
    .filter((s) => s.trim().length > 0),
});

/**
 * Entities paired with a same-length array of booleans indicating, per
 * index, whether that entity's render should fail.
 */
const arbEntitiesWithFailures = fc
  .array(arbEntity, { minLength: 1, maxLength: 10 })
  .chain((entities) =>
    fc.tuple(
      fc.constant(entities),
      fc.array(fc.boolean(), {
        minLength: entities.length,
        maxLength: entities.length,
      })
    )
  );

const arbFormat = fc.constantFrom(...PLATFORM_FORMATS);

// ─── Property ──────────────────────────────────────────────────────────────

describe("Property 14: Batch failures are isolated and completely reported", () => {
  it("partitions every entity into exactly one success/failed outcome matching the failing subset", () => {
    fc.assert(
      fc.asyncProperty(
        arbEntitiesWithFailures,
        arbFormat,
        async ([entities, shouldFail], format) => {
          const render = async (entity: { id: string; name: string }) => {
            const idx = entities.findIndex((e) => e.id === entity.id);
            if (shouldFail[idx]) {
              throw new Error("simulated render failure");
            }
            return new Blob(["fake"], { type: "image/png" });
          };

          const outcomes = await runBatch(entities, [format], render);

          // Exactly one outcome per entity (single format).
          if (outcomes.length !== entities.length) {
            return false;
          }

          // No duplicates and no missing entities — an exact partition.
          const outcomeIds = new Set(outcomes.map((o) => o.entity.id));
          if (outcomeIds.size !== entities.length) {
            return false;
          }

          for (let idx = 0; idx < entities.length; idx++) {
            const entity = entities[idx];
            const outcome = outcomes.find((o) => o.entity.id === entity.id);
            if (!outcome) {
              return false;
            }
            const expectedStatus = shouldFail[idx] ? "failed" : "success";
            if (outcome.status !== expectedStatus) {
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
