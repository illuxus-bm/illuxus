// Feature: creative-customization, Property 46: Entity_Template_Override precedence in batch runs
//
// Validates: Requirements 10.3, 10.6
//
// Property 46: For any `EventPageConfig`, any `CreativeType`, any
// per-entity override map `perEntity: Record<entityId, templateId>`, and
// any list of entity ids to probe:
//
//   - `readEffectiveTemplateId(config, entityId, type)` returns
//     `perEntity[entityId]` when the entity has an override
//     (Requirement 10.3).
//   - Otherwise it returns `creativeTemplatePrefs[type]` when the
//     event-level default is set for that type.
//   - Otherwise it returns `undefined` so the caller can fall back to the
//     built-in registry's first preset.
//
//   Round-trip through `saveEntityTemplateOverride` and
//   `clearEntityTemplateOverride`:
//
//   - After `saveEntityTemplateOverride(config, entityId, templateId)`,
//     `readEffectiveTemplateId` returns exactly `templateId` for that
//     entity (Requirement 10.2 / 10.3).
//   - After a save-then-clear, `readEffectiveTemplateId` returns the
//     event-level default for the type (or `undefined` if none is set),
//     because `clearEntityTemplateOverride` deletes the key rather than
//     storing `null` (Requirement 10.5 / 10.6).
//   - Overrides for OTHER entities are never disturbed by a save or
//     clear targeting a different entity (Requirement 10.6, batch
//     isolation).

import { describe, it } from "vitest";
import fc from "fast-check";

import {
  readEffectiveTemplateId,
  saveEntityTemplateOverride,
  clearEntityTemplateOverride,
  saveCreativeTemplatePref,
  type CreativeType,
} from "../creative-templates";
import { buildDefaultConfig, type EventPageConfig } from "@/components/event/page-form/types";

// ─── Generators ────────────────────────────────────────────────────────────

const ALL_TYPES: CreativeType[] = ["speaker", "sponsor", "combo"];

const arbCreativeType: fc.Arbitrary<CreativeType> = fc.constantFrom(...ALL_TYPES);

/** Any non-empty template id string. */
const arbTemplateId: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((s) => s.trim().length > 0);

/** Any non-empty entity id string. Uses uuid() so ids stay unique enough
 *  across a run that generator collisions don't collapse the map to a
 *  single key. */
const arbEntityId: fc.Arbitrary<string> = fc.uuid();

/** Up to 3 seed (type, templateId) pairs used to pre-populate
 *  `creativeTemplatePrefs` before the property runs. */
const arbSeedTypePrefs = fc.array(
  fc.record({ type: arbCreativeType, templateId: arbTemplateId }),
  { maxLength: 3 }
);

/** Up to 4 seed per-entity overrides. */
const arbSeedEntityOverrides = fc.array(
  fc.record({ entityId: arbEntityId, templateId: arbTemplateId }),
  { maxLength: 4 }
);

/**
 * Builds an `EventPageConfig` pre-populated with the given per-type
 * defaults and per-entity overrides. Applies the pure `save*` helpers in
 * order, mirroring how the UI would layer the writes over time.
 */
function buildSeededConfig(
  typeSeeds: readonly { type: CreativeType; templateId: string }[],
  entitySeeds: readonly { entityId: string; templateId: string }[]
): EventPageConfig {
  let config = buildDefaultConfig();
  for (const seed of typeSeeds) {
    config = saveCreativeTemplatePref(config, seed.type, seed.templateId);
  }
  for (const seed of entitySeeds) {
    config = saveEntityTemplateOverride(config, seed.entityId, seed.templateId);
  }
  return config;
}

// ─── Property 46 ───────────────────────────────────────────────────────────

describe("Property 46: Entity_Template_Override precedence in batch runs", () => {
  it("resolves per-entity override first, then per-type default, else undefined", () => {
    fc.assert(
      fc.property(
        arbSeedTypePrefs,
        arbSeedEntityOverrides,
        arbEntityId,
        arbCreativeType,
        (typeSeeds, entitySeeds, probeEntityId, probeType) => {
          const config = buildSeededConfig(typeSeeds, entitySeeds);

          // Compute the expected result via the same precedence a reader
          // must follow: last-write-wins for entity seeds (later save
          // overrides earlier), then last-write-wins for type seeds.
          const perEntityLastWrite = new Map<string, string>();
          for (const seed of entitySeeds) {
            perEntityLastWrite.set(seed.entityId, seed.templateId);
          }
          const perTypeLastWrite = new Map<CreativeType, string>();
          for (const seed of typeSeeds) {
            perTypeLastWrite.set(seed.type, seed.templateId);
          }

          const expected =
            perEntityLastWrite.get(probeEntityId) ??
            perTypeLastWrite.get(probeType) ??
            undefined;

          const actual = readEffectiveTemplateId(config, probeEntityId, probeType);
          return actual === expected;
        }
      ),
      { numRuns: 100 }
    );
  });

  it("round-trips a save: readEffectiveTemplateId returns the saved templateId for that entity", () => {
    fc.assert(
      fc.property(
        arbSeedTypePrefs,
        arbSeedEntityOverrides,
        arbEntityId,
        arbTemplateId,
        arbCreativeType,
        (typeSeeds, entitySeeds, entityId, templateId, type) => {
          const before = buildSeededConfig(typeSeeds, entitySeeds);
          const after = saveEntityTemplateOverride(before, entityId, templateId);

          // The saved entity reads back exactly the saved templateId
          // regardless of the probe type or any pre-existing per-type
          // default (Requirement 10.3).
          if (readEffectiveTemplateId(after, entityId, type) !== templateId) {
            return false;
          }

          // Every OTHER entity id present in `before` reads back the
          // same effective template it did before the save (batch
          // isolation, Requirement 10.6).
          for (const seed of entitySeeds) {
            if (seed.entityId === entityId) continue;
            if (
              readEffectiveTemplateId(before, seed.entityId, type) !==
              readEffectiveTemplateId(after, seed.entityId, type)
            ) {
              return false;
            }
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it("save+clear returns to the per-type default (or undefined) for the cleared entity", () => {
    fc.assert(
      fc.property(
        arbSeedTypePrefs,
        arbSeedEntityOverrides,
        arbEntityId,
        arbTemplateId,
        arbCreativeType,
        (typeSeeds, entitySeeds, entityId, templateId, type) => {
          const before = buildSeededConfig(typeSeeds, entitySeeds);
          const afterSave = saveEntityTemplateOverride(before, entityId, templateId);
          const afterClear = clearEntityTemplateOverride(afterSave, entityId);

          // Post-clear, the effective template for the cleared entity
          // falls through to the per-type default (or undefined) —
          // `clearEntityTemplateOverride` deletes the key rather than
          // storing `null` (Requirement 10.5).
          const perTypeLastWrite = new Map<CreativeType, string>();
          for (const seed of typeSeeds) {
            perTypeLastWrite.set(seed.type, seed.templateId);
          }
          const expected = perTypeLastWrite.get(type) ?? undefined;

          if (readEffectiveTemplateId(afterClear, entityId, type) !== expected) {
            return false;
          }

          // The cleared entity must NOT appear in the per-entity map
          // (minimality invariant — Requirement 10.5).
          if (Object.prototype.hasOwnProperty.call(
            afterClear.creativeTemplatePrefs?.perEntity ?? {},
            entityId
          )) {
            return false;
          }

          // Other entities' overrides are undisturbed by the clear
          // (batch isolation, Requirement 10.6).
          for (const seed of entitySeeds) {
            if (seed.entityId === entityId) continue;
            if (
              readEffectiveTemplateId(afterSave, seed.entityId, type) !==
              readEffectiveTemplateId(afterClear, seed.entityId, type)
            ) {
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
