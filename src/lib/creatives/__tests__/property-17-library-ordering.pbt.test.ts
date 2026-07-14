// Feature: social-creative-generator, Property 17: Creative library lists most-recent-first
//
// Validates: Requirements 8.2
//
// Property 17: For any list of `event_creatives`-shaped records with
// arbitrary `created_at` timestamps (including duplicate timestamps), the
// library's sort function returns them ordered such that no record's
// `created_at` is later than the `created_at` of any record before it in
// the result.

import { describe, it, vi } from "vitest";
import fc from "fast-check";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { sortByCreatedAtDesc } from "../creative-storage";

// ─── Generators ────────────────────────────────────────────────────────────

interface CreativeLike {
  id: string;
  created_at: string;
}

const arbCreative: fc.Arbitrary<CreativeLike> = fc.record({
  id: fc.uuid(),
  created_at: fc
    .date({ min: new Date("2020-01-01"), max: new Date("2030-01-01") })
    .map((d) => d.toISOString()),
});

// Deliberately allow duplicate timestamps (no uniqueness filter) — the
// property statement explicitly says "including duplicate timestamps".
const arbCreatives = fc.array(arbCreative, { minLength: 0, maxLength: 20 });

// ─── Property ──────────────────────────────────────────────────────────────

describe("Property 17: Creative library lists most-recent-first", () => {
  it("sorts records most-recent-first without mutating the input", () => {
    fc.assert(
      fc.property(arbCreatives, (records) => {
        const beforeCall = [...records];

        const sorted = sortByCreatedAtDesc(records);

        // 1. Same number of elements — a sort is a permutation, not a filter.
        if (sorted.length !== records.length) {
          return false;
        }

        // 2. Non-increasing by created_at (most-recent-first, ties allowed).
        for (let i = 0; i < sorted.length - 1; i++) {
          const current = new Date(sorted[i].created_at).getTime();
          const next = new Date(sorted[i + 1].created_at).getTime();
          if (current < next) {
            return false;
          }
        }

        // 3. `sorted` is a permutation of `records` by id — every id in
        // `records` appears exactly once in `sorted` (count maps, since
        // duplicate timestamps can shuffle object identity ordering).
        const countIds = (rows: CreativeLike[]): Map<string, number> => {
          const counts = new Map<string, number>();
          for (const row of rows) {
            counts.set(row.id, (counts.get(row.id) ?? 0) + 1);
          }
          return counts;
        };
        const recordCounts = countIds(records);
        const sortedCounts = countIds(sorted);
        if (recordCounts.size !== sortedCounts.size) {
          return false;
        }
        for (const [id, count] of recordCounts) {
          if (sortedCounts.get(id) !== count) {
            return false;
          }
        }

        // 4. The original input array is not mutated (order and references
        // unchanged).
        if (records.length !== beforeCall.length) {
          return false;
        }
        for (let i = 0; i < records.length; i++) {
          if (records[i] !== beforeCall[i]) {
            return false;
          }
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });
});
