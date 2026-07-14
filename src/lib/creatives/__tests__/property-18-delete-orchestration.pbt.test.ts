// Feature: social-creative-generator, Property 18: Delete orchestration always attempts both steps and reports partial failure
//
// Validates: Requirements 8.3
//
// Property 18: For any combination of mocked storage-delete success/failure
// and mocked database-delete success/failure, the delete orchestration
// invokes both the storage delete and the database delete exactly once
// each, and its reported outcome is "success" only when both succeeded,
// otherwise identifies which step(s) failed.

import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";

const mocks = vi.hoisted(() => ({
  storageRemove: vi.fn(),
  dbDeleteEq: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({ remove: mocks.storageRemove }),
    },
    from: () => ({ delete: () => ({ eq: mocks.dbDeleteEq }) }),
  },
}));

vi.mock("@/lib/observability", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { deleteCreativeAsset } from "../creative-storage";

// ─── Property ──────────────────────────────────────────────────────────────

describe("Property 18: Delete orchestration always attempts both steps and reports partial failure", () => {
  it("always invokes both delete steps exactly once and reports success only when both succeed", () => {
    return fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        fc.boolean(),
        async (storageShouldSucceed, recordShouldSucceed) => {
          mocks.storageRemove.mockClear();
          mocks.dbDeleteEq.mockClear();

          mocks.storageRemove.mockReset().mockResolvedValue(
            storageShouldSucceed
              ? { error: null }
              : { error: { message: "simulated storage failure" } }
          );
          mocks.dbDeleteEq.mockReset().mockResolvedValue(
            recordShouldSucceed
              ? { error: null }
              : { error: { message: "simulated db failure" } }
          );

          try {
            const result = await deleteCreativeAsset("asset-1", "some/path.png");

            // Both steps are always attempted exactly once, regardless of
            // whether either was configured to fail.
            if (mocks.storageRemove.mock.calls.length !== 1) {
              return false;
            }
            if (mocks.dbDeleteEq.mock.calls.length !== 1) {
              return false;
            }

            // The reported outcome per step matches the configured
            // success/failure of that step.
            if (result.storageDeleted !== storageShouldSucceed) {
              return false;
            }
            if (result.recordDeleted !== recordShouldSucceed) {
              return false;
            }

            return true;
          } catch {
            // The orchestration must never throw — a thrown error is a
            // property failure, not a crash of the whole test run.
            return false;
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
