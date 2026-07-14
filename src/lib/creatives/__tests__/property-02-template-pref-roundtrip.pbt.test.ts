// Feature: social-creative-generator, Property 2: Template selection persistence round-trip
//
// Validates: Requirements 1.4
//
// Property 2: For any `EventPageConfig`, `CreativeType`, and `template_id`
// string, calling
// `readCreativeTemplatePref(saveCreativeTemplatePref(config, type, templateId), type)`
// returns exactly `templateId`, and preferences for other Creative types
// already present in `config` are left unchanged.

import { describe, it } from "vitest";
import fc from "fast-check";

import {
  saveCreativeTemplatePref,
  readCreativeTemplatePref,
  type CreativeType,
} from "../creative-templates";
import { buildDefaultConfig, type EventPageConfig } from "@/components/event/page-form/types";

// ─── Generators ────────────────────────────────────────────────────────────

const ALL_TYPES: CreativeType[] = ["speaker", "sponsor", "combo"];

const arbCreativeType: fc.Arbitrary<CreativeType> = fc.constantFrom(...ALL_TYPES);

const arbTemplateId: fc.Arbitrary<string> = fc.string({ minLength: 1 });

/** Up to 3 independent (type, templateId) seed pairs used to pre-populate
 * `creativeTemplatePrefs` before the save-under-test happens. */
const arbSeedPrefs = fc.array(
  fc.record({ type: arbCreativeType, templateId: arbTemplateId }),
  { maxLength: 3 }
);

// ─── Property ──────────────────────────────────────────────────────────────

describe("Property 2: Template selection persistence round-trip", () => {
  it("round-trips the saved template id and leaves other types' prefs unchanged", () => {
    fc.assert(
      fc.property(
        arbSeedPrefs,
        arbCreativeType,
        arbTemplateId,
        (seedPrefs, type, templateId) => {
          // Build a base config and seed it with pre-existing prefs.
          let before: EventPageConfig = buildDefaultConfig();
          for (const seed of seedPrefs) {
            before = saveCreativeTemplatePref(before, seed.type, seed.templateId);
          }

          const after = saveCreativeTemplatePref(before, type, templateId);

          // The saved type reads back exactly what was written.
          if (readCreativeTemplatePref(after, type) !== templateId) {
            return false;
          }

          // Every other type's pref present before the save is unchanged.
          for (const otherType of ALL_TYPES) {
            if (otherType === type) continue;
            if (
              readCreativeTemplatePref(before, otherType) !==
              readCreativeTemplatePref(after, otherType)
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
