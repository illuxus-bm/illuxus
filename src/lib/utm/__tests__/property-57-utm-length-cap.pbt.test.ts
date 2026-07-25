// Feature: utm-attribution-coverage, Property 57: UTM_Field character cap at 512 is enforced
//
// Validates: Requirements 12.4
//
// Property 57: For any string `v` of raw length > 512 whose `.trim()` is
// non-empty, calling
//
//     captureUtm(`?utm_source=${encodeURIComponent(v)}`)
//
// results in `loadStoredUtm().utm_source.length <= 512`.
//
// Rationale: the client caps each UTM_Field at 512 characters before
// persisting to sessionStorage (see `UTM_MAX_LENGTH` in `src/lib/utm.ts`).
// This defends downstream sinks (insert payloads, sign-up metadata, and
// the eventual database columns) against pathological / attacker-supplied
// query strings. The cap must hold universally — this property is the
// generative tripwire that would fire if a future refactor dropped it.
//
// jsdom (vitest's test environment) provides a real sessionStorage.
// `clearStoredUtm()` runs before every iteration to prevent first-touch
// state from leaking between fast-check samples.

import { describe, it, beforeEach, expect } from "vitest";
import fc from "fast-check";

import { captureUtm, clearStoredUtm, loadStoredUtm } from "@/lib/utm";

// Any printable-ASCII string whose raw `.length` exceeds 512. We also
// require `.trim()` to be non-empty so the value is actually stored
// (whitespace-only values are dropped by the capture pipeline — a
// separate contract exercised by Property 56).
const arbOverlongUtmValue = fc
  .string({ minLength: 513, maxLength: 2000 })
  .filter((s) => s.trim().length > 0);

describe("Property 57: UTM_Field character cap at 512 is enforced", () => {
  beforeEach(() => {
    clearStoredUtm();
  });

  it("captureUtm truncates any stored UTM_Field to at most 512 characters", () => {
    fc.assert(
      fc.property(arbOverlongUtmValue, (value) => {
        // First-touch semantics mean captureUtm ignores subsequent captures
        // when the session already has UTM. Clear inside the property so
        // every fast-check iteration starts from a clean slate.
        clearStoredUtm();

        captureUtm(`?utm_source=${encodeURIComponent(value)}`);
        const stored = loadStoredUtm();

        // The value must be stored (input has non-empty trim + `utm_source`
        // is a recognized key), and it must never exceed the 512-char cap.
        expect(typeof stored.utm_source).toBe("string");
        expect(stored.utm_source!.length).toBeLessThanOrEqual(512);
      }),
      { numRuns: 100 },
    );
  });
});
