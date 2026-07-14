// Feature: social-creative-generator, Property 15: Batch archive contains exactly the successful creatives
//
// Validates: Requirements 6.6
//
// Property 15: For any list of `BatchOutcome`s, `buildBatchArchive` produces
// a ZIP blob whose entries — when read back — have exactly the filenames and
// byte contents of the `status: "success"` outcomes (and no entries for
// `status: "failed"` outcomes).

import { describe, it } from "vitest";
import fc from "fast-check";
import { unzipSync } from "fflate";

import { buildBatchArchive, type BatchOutcome } from "../creative-batch";
import { PLATFORM_FORMATS } from "../creative-templates";

// jsdom's `Blob` polyfill (this project's Vitest `environment`) doesn't
// implement `.arrayBuffer()` (only `real` browsers and Node's native `Blob`
// do) — `buildBatchArchive` itself relies on it, as does this test's
// byte-for-byte comparison. Polyfill it via `FileReader.readAsArrayBuffer`,
// which jsdom DOES implement, so the property exercises the real
// `buildBatchArchive` code path unmodified under jsdom.
if (typeof Blob.prototype.arrayBuffer !== "function") {
  Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}

// ─── Generators ────────────────────────────────────────────────────────────

interface Entity {
  id: string;
  name: string;
}

/**
 * Builds a list of synthetic `BatchOutcome<Entity>`s directly, without going
 * through `runBatch` — this property tests `buildBatchArchive` in isolation.
 * Filenames are made GUARANTEED-UNIQUE (`entity-${i}.png`) to avoid
 * triggering the separately-implemented collision-disambiguation logic,
 * keeping this property focused on "success outcomes -> archive entries,
 * failed outcomes -> no archive entries".
 */
const arbOutcomes: fc.Arbitrary<BatchOutcome<Entity>[]> = fc
  .array(
    fc.record({
      status: fc.constantFrom("success" as const, "failed" as const),
      name: fc
        .string({ minLength: 1, maxLength: 20 })
        .filter((s) => /^[a-z0-9]+$/i.test(s)),
      content: fc.string({ minLength: 1, maxLength: 50 }),
    }),
    { minLength: 0, maxLength: 10 }
  )
  .map((rows) =>
    rows.map((r, i) => {
      const format = PLATFORM_FORMATS[i % PLATFORM_FORMATS.length];
      const entity: Entity = { id: String(i), name: r.name };
      if (r.status === "success") {
        return {
          entity,
          status: "success" as const,
          blob: new Blob([r.content]),
          format,
          filename: `entity-${i}.png`,
        };
      }
      return {
        entity,
        status: "failed" as const,
        format,
        error: "x",
      };
    })
  );

// ─── Property ──────────────────────────────────────────────────────────────

describe("Property 15: Batch archive contains exactly the successful creatives", () => {
  it("archive entries match exactly the success outcomes' filenames and byte contents", async () => {
    await fc.assert(
      fc.asyncProperty(arbOutcomes, async (outcomes) => {
        const archiveBlob = await buildBatchArchive(outcomes);
        const arrayBuffer = await archiveBlob.arrayBuffer();
        const unzipped = unzipSync(new Uint8Array(arrayBuffer));

        const successOutcomes = outcomes.filter(
          (o): o is BatchOutcome<Entity> & { status: "success" } => o.status === "success"
        );

        // Exactly as many entries as successful outcomes (excludes failed
        // outcomes, which have no `.filename` at all).
        if (Object.keys(unzipped).length !== successOutcomes.length) {
          return false;
        }

        // Every success outcome has a corresponding entry with matching
        // byte-for-byte content.
        for (const outcome of successOutcomes) {
          const entryBytes = unzipped[outcome.filename];
          if (!entryBytes) {
            return false;
          }

          const originalBytes = new Uint8Array(await outcome.blob.arrayBuffer());
          if (
            Array.from(entryBytes).join(",") !== Array.from(originalBytes).join(",")
          ) {
            return false;
          }
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });
});
