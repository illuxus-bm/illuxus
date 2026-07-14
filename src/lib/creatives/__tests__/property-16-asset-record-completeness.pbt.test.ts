// Feature: social-creative-generator, Property 16: Creative asset records are fully populated from their inputs
//
// Validates: Requirements 8.1
//
// Property 16: For any render result (entity, `CreativeType`,
// `Platform_Format`, uploaded asset URL/path), the constructed
// `event_creatives` insert payload has non-empty `event_id`,
// `creative_type`, `template_id`, `platform_format`, `asset_url`, and
// `storage_path` fields whose values match the inputs, and has
// `speaker_id`/`sponsor_id` populated consistently with `creative_type` per
// the table's check constraint.

import { describe, expect, it, vi } from "vitest";
import fc from "fast-check";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { buildCreativeAssetRecord, type CreativeAssetInput } from "../creative-storage";

// ─── Generators ────────────────────────────────────────────────────────────

const arbBaseFields = fc.record({
  eventId: fc.uuid(),
  templateId: fc.string({ minLength: 1, maxLength: 20 }),
  platformFormat: fc.constantFrom(
    "linkedin-post" as const,
    "instagram-post" as const,
    "instagram-story" as const,
    "twitter-post" as const,
    "email-banner" as const
  ),
  assetUrl: fc.webUrl(),
  storagePath: fc
    .string({ minLength: 1, maxLength: 50 })
    .map((s) => `event-creatives/x/${s}.png`),
  createdBy: fc.uuid(),
});

/**
 * Builds a valid `CreativeAssetInput` whose `speakerId`/`sponsorId` satisfy
 * whatever `creativeType` requires, so `buildCreativeAssetRecord` never
 * throws for these generated inputs.
 */
const arbValidInput: fc.Arbitrary<CreativeAssetInput> = arbBaseFields.chain((base) =>
  fc.oneof(
    fc.record({
      ...toConstants(base),
      creativeType: fc.constant("speaker" as const),
      speakerId: fc.uuid(),
      sponsorId: fc.constant(null),
    }),
    fc.record({
      ...toConstants(base),
      creativeType: fc.constant("sponsor" as const),
      speakerId: fc.constant(null),
      sponsorId: fc.uuid(),
    }),
    fc.record({
      ...toConstants(base),
      creativeType: fc.constant("combo" as const),
      speakerId: fc.uuid(),
      sponsorId: fc.uuid(),
    })
  )
);

/** Wraps each field of a plain record in `fc.constant` so it can be spread
 * into an `fc.record({...})` call alongside other arbitraries. */
function toConstants<T extends object>(obj: T): { [K in keyof T]: fc.Arbitrary<T[K]> } {
  const result: Record<string, fc.Arbitrary<unknown>> = {};
  for (const key of Object.keys(obj) as Array<keyof T>) {
    result[key as string] = fc.constant(obj[key]);
  }
  return result as { [K in keyof T]: fc.Arbitrary<T[K]> };
}

// ─── Property ──────────────────────────────────────────────────────────────

describe("Property 16: Creative asset records are fully populated from their inputs", () => {
  it("builds a record whose fields match the input and whose speaker_id/sponsor_id are consistent with creative_type", () => {
    fc.assert(
      fc.property(arbValidInput, (input) => {
        const record = buildCreativeAssetRecord(input);

        // Core fields non-empty and matching the input exactly.
        if (record.event_id !== input.eventId || record.event_id.length === 0) return false;
        if (record.creative_type !== input.creativeType || record.creative_type.length === 0) return false;
        if (record.template_id !== input.templateId || record.template_id.length === 0) return false;
        if (record.platform_format !== input.platformFormat || record.platform_format.length === 0) return false;
        if (record.asset_url !== input.assetUrl || record.asset_url.length === 0) return false;
        if (record.storage_path !== input.storagePath || record.storage_path.length === 0) return false;
        if (record.created_by !== input.createdBy) return false;

        // speaker_id/sponsor_id consistency with creative_type, per the
        // table's check constraint.
        if (input.creativeType === "speaker") {
          return record.speaker_id !== null && record.sponsor_id === null;
        }
        if (input.creativeType === "sponsor") {
          return record.sponsor_id !== null && record.speaker_id === null;
        }
        // combo
        return record.speaker_id !== null && record.sponsor_id !== null;
      }),
      { numRuns: 100 }
    );
  });

  it("throws when speaker_id/sponsor_id don't match what creative_type requires (negative case)", () => {
    const mismatched: CreativeAssetInput = {
      eventId: "11111111-1111-4111-8111-111111111111",
      creativeType: "speaker",
      speakerId: null,
      sponsorId: "22222222-2222-4222-8222-222222222222",
      templateId: "speaker-spotlight",
      platformFormat: "linkedin-post",
      assetUrl: "https://example.com/a.png",
      storagePath: "event-creatives/x/a.png",
      createdBy: "33333333-3333-4333-8333-333333333333",
    };

    expect(() => buildCreativeAssetRecord(mismatched)).toThrow(Error);
  });
});
