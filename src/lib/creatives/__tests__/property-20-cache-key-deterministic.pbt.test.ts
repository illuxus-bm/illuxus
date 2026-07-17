// Feature: creative-ai-backgrounds, Property 20: Cache key is deterministic and normalization-invariant
//
// Validates: Requirements 6.1, 2.5
//
// Property 20: For any tuple (eventId, promptText, stylePreset,
// aspectRatio), the client's `computeCacheKey` applied to
// `normalizePrompt(promptText)` produces a string equal to the Edge
// Function's key computation applied to the server-side normalized
// prompt. Additionally, for any two `promptText` values that differ only
// in leading/trailing whitespace or letter case, the two resulting cache
// keys are equal.

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  ASPECT_RATIOS,
  type AspectRatio,
  computeCacheKey,
  normalizePrompt,
  STYLE_PRESETS,
  type StylePreset,
} from "../creative-ai";

// ─── Locally-transcribed mirror of the Edge Function's computeCacheKey ────
//
// This is a SECOND, INDEPENDENT implementation of the server-side
// `computeCacheKey` from
// `supabase/functions/generate-creative-background/index.ts`. It is
// transcribed line-for-line rather than imported (the Edge Function is a
// Deno file with no local Deno test harness in this project) so that any
// future drift between the client and server implementations — a changed
// delimiter, a changed field order, an added field — breaks this test.
function mockServerComputeCacheKey(
  eventId: string,
  promptNormalized: string,
  stylePreset: string,
  aspectRatio: string
): string {
  // Deterministic concatenation joined by \x1f (unit separator) — no hash;
  // matches the client's `computeCacheKey` exactly (Property 20).
  return [eventId, promptNormalized, stylePreset, aspectRatio].join("\x1f");
}

// ─── Generators ────────────────────────────────────────────────────────────

const arbStylePreset: fc.Arbitrary<StylePreset> = fc.constantFrom(
  ...(STYLE_PRESETS as StylePreset[])
);
const arbAspectRatio: fc.Arbitrary<AspectRatio> = fc.constantFrom(
  ...(ASPECT_RATIOS as AspectRatio[])
);
const arbWhitespace = fc
  .string({ minLength: 0, maxLength: 5 })
  .filter((s) => /^\s*$/.test(s));

// ─── Property ──────────────────────────────────────────────────────────────

describe("Property 20: Cache key is deterministic and normalization-invariant", () => {
  it("client and server produce identical keys, and normalization makes case/whitespace irrelevant", () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.string(),
        arbStylePreset,
        arbAspectRatio,
        arbWhitespace,
        arbWhitespace,
        (eventId, prompt, preset, ratio, leadingWs, trailingWs) => {
          const normalized = normalizePrompt(prompt);

          // (a) Client key equals the locally-mirrored server implementation
          // for the same inputs.
          const clientKey = computeCacheKey(eventId, normalized, preset, ratio);
          const serverKey = mockServerComputeCacheKey(
            eventId,
            prompt.trim().toLowerCase(),
            preset,
            ratio
          );
          expect(clientKey).toBe(serverKey);

          // (b) Calling computeCacheKey twice with the same normalized
          // inputs yields the same key.
          const clientKeyAgain = computeCacheKey(eventId, normalized, preset, ratio);
          expect(clientKeyAgain).toBe(clientKey);

          // (c) Normalization-invariance: a prompt differing only in case
          // and surrounding whitespace normalizes to the same value, hence
          // produces the same cache key.
          const variedPrompt = `${leadingWs}${prompt.toUpperCase()}${trailingWs}`;
          const variedNormalized = normalizePrompt(variedPrompt);
          expect(variedNormalized).toBe(normalized);
          const variedKey = computeCacheKey(eventId, variedNormalized, preset, ratio);
          expect(variedKey).toBe(clientKey);
        }
      ),
      { numRuns: 100 }
    );
  });
});
