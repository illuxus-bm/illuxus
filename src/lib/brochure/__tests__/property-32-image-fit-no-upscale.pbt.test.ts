// Feature: event-brochure-generator, Property 32: Image slot fitting never upscales or non-uniformly stretches
//
// Validates: Requirements 4.6, 5.6
//
// For any image slot box and any natural image width/height (for a speaker
// photo or a sponsor logo), the image-fit function returns a box whose
// width and height either equal the natural width/height exactly (when it
// fits within the slot) or are uniformly downscaled by the same factor on
// both axes (when it doesn't fit) — never upscaled beyond native size and
// never scaled by different factors per axis.

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { fitImageBox, type ImageBoxMm } from "../brochure-templates";

const arbSlot: fc.Arbitrary<ImageBoxMm> = fc.record({
  width: fc.float({ min: 1, max: 500, noNaN: true }),
  height: fc.float({ min: 1, max: 500, noNaN: true }),
});

const arbDimension = fc.float({ min: 0, max: 2000, noNaN: true });

describe("Property 32: Image slot fitting never upscales or non-uniformly stretches", () => {
  it("never upscales beyond native size, and scales uniformly on both axes when allowUpscale is not set", () => {
    fc.assert(
      fc.property(arbSlot, arbDimension, arbDimension, (slot, naturalWidth, naturalHeight) => {
        const box = fitImageBox(slot, naturalWidth, naturalHeight);

        // No NaN in the degenerate zero-dimension case.
        expect(Number.isNaN(box.width)).toBe(false);
        expect(Number.isNaN(box.height)).toBe(false);

        if (naturalWidth === 0 || naturalHeight === 0) {
          expect(box.width).toBe(0);
          expect(box.height).toBe(0);
          return;
        }

        // Never upscaled beyond native size.
        expect(box.width).toBeLessThanOrEqual(naturalWidth + 1e-9);
        expect(box.height).toBeLessThanOrEqual(naturalHeight + 1e-9);

        // Uniform scale factor per axis (aspect ratio preserved).
        const scaleX = box.width / naturalWidth;
        const scaleY = box.height / naturalHeight;
        expect(scaleX).toBeCloseTo(scaleY, 6);

        // Scale factor itself is capped at 1 (never upscaled).
        expect(scaleX).toBeLessThanOrEqual(1 + 1e-9);
      }),
      { numRuns: 100 }
    );
  });

  it("uncaps the scale factor (allows upscale) when allowUpscale is true", () => {
    fc.assert(
      fc.property(arbSlot, arbDimension, arbDimension, (slot, naturalWidth, naturalHeight) => {
        const box = fitImageBox(slot, naturalWidth, naturalHeight, { allowUpscale: true });

        expect(Number.isNaN(box.width)).toBe(false);
        expect(Number.isNaN(box.height)).toBe(false);

        if (naturalWidth === 0 || naturalHeight === 0) {
          expect(box.width).toBe(0);
          expect(box.height).toBe(0);
          return;
        }

        const scaleX = box.width / naturalWidth;
        const scaleY = box.height / naturalHeight;
        // Relative comparison — `toBeCloseTo`'s absolute-decimal-places
        // tolerance breaks down for the extreme-magnitude values fast-check
        // generates here; a relative diff is the correct invariant check.
        const relativeDiff = Math.abs(scaleX - scaleY) / Math.max(Math.abs(scaleX), Math.abs(scaleY), 1e-300);
        expect(relativeDiff).toBeLessThan(1e-9);
      }),
      { numRuns: 100 }
    );
  });
});
