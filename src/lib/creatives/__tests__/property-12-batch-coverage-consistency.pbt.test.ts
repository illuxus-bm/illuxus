// Feature: social-creative-generator, Property 12: Batch run covers every entity exactly once with consistent settings
//
// Validates: Requirements 6.1, 6.2, 6.3
//
// Property 12: For any non-empty list of entities and any non-empty list of
// selected Platform_Formats, `runBatch` produces exactly one outcome per
// (entity, format) pair, every outcome's `format` is one of the selected
// formats, and (when a single template id is passed through to the `render`
// callback for every call) every successful outcome was rendered with that
// same template id.

import { describe, it } from "vitest";
import fc from "fast-check";

import { runBatch } from "../creative-batch";
import { PLATFORM_FORMATS, type PlatformFormat } from "../creative-templates";

// ─── Generators ────────────────────────────────────────────────────────────

interface TestEntity {
  id: string;
  name: string;
}

const arbEntity: fc.Arbitrary<TestEntity> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
});

// Entity ids should be unique within the array (dedupe after generation).
const arbEntities: fc.Arbitrary<TestEntity[]> = fc
  .array(arbEntity, { minLength: 1, maxLength: 8 })
  .map((entities) => {
    const seen = new Set<string>();
    return entities.filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });
  })
  .filter((entities) => entities.length > 0);

const arbFormats: fc.Arbitrary<PlatformFormat[]> = fc.subarray(PLATFORM_FORMATS, {
  minLength: 1,
});

const arbTemplateId = fc.string({ minLength: 1, maxLength: 10 });

// ─── Property ──────────────────────────────────────────────────────────────

describe("Property 12: Batch run covers every entity exactly once with consistent settings", () => {
  it("produces exactly one outcome per (entity, format) pair, using only selected formats and a consistent template id", async () => {
    await fc.assert(
      fc.asyncProperty(arbEntities, arbFormats, arbTemplateId, async (entities, formats, templateId) => {
        const renderCalls: { entity: TestEntity; format: PlatformFormat; templateId: string }[] = [];

        const render = async (entity: TestEntity, format: PlatformFormat): Promise<Blob> => {
          renderCalls.push({ entity, format, templateId });
          return new Blob(["fake-png-bytes"], { type: "image/png" });
        };

        const outcomes = await runBatch(entities, formats, render);

        // 1. Exactly one outcome per (entity, format) pair.
        if (outcomes.length !== entities.length * formats.length) {
          return false;
        }

        // 2. Every entity appears exactly formats.length times across outcomes.
        const countByEntityId = new Map<string, number>();
        for (const outcome of outcomes) {
          countByEntityId.set(outcome.entity.id, (countByEntityId.get(outcome.entity.id) ?? 0) + 1);
        }
        for (const entity of entities) {
          if (countByEntityId.get(entity.id) !== formats.length) {
            return false;
          }
        }

        // 3. Every outcome's format is one of the selected formats.
        for (const outcome of outcomes) {
          if (!formats.some((f) => f.id === outcome.format.id)) {
            return false;
          }
        }

        // 4. The mock render always succeeds, so every outcome is a success.
        for (const outcome of outcomes) {
          if (outcome.status !== "success") {
            return false;
          }
        }

        // 5. Every render call used the same, consistent template id.
        if (renderCalls.length !== entities.length * formats.length) {
          return false;
        }
        for (const call of renderCalls) {
          if (call.templateId !== templateId) {
            return false;
          }
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });
});
