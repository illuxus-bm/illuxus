// Feature: utm-attribution-coverage, Property 56: UTM round-trip through URL → storage
//
// Validates: Requirements 12.1, 12.2, 12.3
//
// Property 56: For any string `v` whose `.trim()` is non-empty and at most
// 512 characters long, calling
//
//     captureUtm(`?utm_source=${encodeURIComponent(v)}`)
//
// followed by `loadStoredUtm().utm_source` returns `v.trim()` byte-for-byte.
//
// Rationale: the capture pipeline is
//
//   URL → URLSearchParams.get (URL-decode) → String.prototype.trim →
//     (length cap at 512) → JSON.stringify into sessionStorage → JSON.parse
//     on read.
//
// For any input whose trimmed length is already ≤ 512, the length cap is a
// no-op, so the round-trip must be identity on `v.trim()`. This exercises
// every stage of the read/write path in a single generative check.
//
// jsdom (vitest's test environment) provides a real sessionStorage, so no
// manual mock is needed — `clearStoredUtm()` runs before every iteration
// to prevent first-touch state from leaking between fast-check samples.

import { describe, it, beforeEach } from "vitest";
import fc from "fast-check";

import { captureUtm, clearStoredUtm, loadStoredUtm } from "@/lib/utm";

// `fc.string()` in fast-check v3 draws characters from printable ASCII
// (0x20–0x7e), so every emitted string is safe for `encodeURIComponent`
// and round-trips cleanly through `URLSearchParams.get`. We further
// constrain to inputs whose `.trim()` is non-empty and ≤ 512 chars —
// the domain where the cap does not fire and the round-trip is identity.
const arbUtmValue = fc
  .string({ minLength: 1, maxLength: 512 })
  .filter((s) => {
    const t = s.trim();
    return t.length > 0 && t.length <= 512;
  });

describe("Property 56: UTM round-trip through URL → storage", () => {
  beforeEach(() => {
    clearStoredUtm();
  });

  it("captureUtm(?utm_source=<encodeURIComponent(v)>) → loadStoredUtm().utm_source === v.trim()", () => {
    fc.assert(
      fc.property(arbUtmValue, (value) => {
        // First-touch semantics mean captureUtm ignores subsequent captures
        // when the session already has UTM. Clear inside the property so
        // every fast-check iteration starts from a clean slate.
        clearStoredUtm();

        captureUtm(`?utm_source=${encodeURIComponent(value)}`);
        const stored = loadStoredUtm();

        return stored.utm_source === value.trim();
      }),
      { numRuns: 100 },
    );
  });
});
