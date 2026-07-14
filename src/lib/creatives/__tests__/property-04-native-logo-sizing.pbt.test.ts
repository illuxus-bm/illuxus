// Feature: social-creative-generator, Property 4: Sponsor logo is never upscaled or stretched
//
// Validates: Requirements 3.3
//
// Property 4: For any logo slot box and any natural image width/height,
// `nativeSizedLogoBox` returns a box whose width and height either equal the
// natural width/height exactly (when it fits within the slot) or are
// uniformly downscaled by the same factor on both axes (when it doesn't
// fit) — never upscaled beyond native size and never scaled by different
// factors on each axis. In both cases the resulting box is centered within
// the slot.

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { nativeSizedLogoBox } from "../creative-renderer";
import type { ResolvedBox } from "../creative-templates";

// ─── Generators ────────────────────────────────────────────────────────────

const arbSlot: fc.Arbitrary<ResolvedBox> = fc.record({
  x: fc.integer({ min: 0, max: 500 }),
  y: fc.integer({ min: 0, max: 500 }),
  width: fc.integer({ min: 1, max: 800 }),
  height: fc.integer({ min: 1, max: 800 }),
});

const arbNaturalDimension = fc.integer({ min: 1, max: 2000 });

// ─── Property ──────────────────────────────────────────────────────────────

describe("Property 4: Sponsor logo is never upscaled or stretched", () => {
  it("never upscales, always scales uniformly, and stays centered within the slot", () => {
    fc.assert(
      fc.property(
        arbSlot,
        arbNaturalDimension,
        arbNaturalDimension,
        (slot, naturalWidth, naturalHeight) => {
          const result = nativeSizedLogoBox(slot, naturalWidth, naturalHeight);

          // Floating point tolerance for scale-factor round-trip (division
          // then multiplication back doesn't always land on the exact same
          // representable double).
          const EPSILON = 1e-9;

          // 1. Never upscaled beyond native size.
          if (result.width > naturalWidth + EPSILON || result.height > naturalHeight + EPSILON) {
            return false;
          }

          const fitsNatively = naturalWidth <= slot.width && naturalHeight <= slot.height;

          if (fitsNatively) {
            // 2. Fits within slot at native size → exact match, no scaling.
            if (result.width !== naturalWidth || result.height !== naturalHeight) {
              return false;
            }
          } else {
            // 3. Doesn't fit → uniform scale factor on both axes.
            const scaleW = result.width / naturalWidth;
            const scaleH = result.height / naturalHeight;
            if (Math.abs(scaleW - scaleH) >= 1e-9) {
              return false;
            }
          }

          // 4. Centered within the slot on both axes.
          const resultCenterX = result.x + result.width / 2;
          const resultCenterY = result.y + result.height / 2;
          const slotCenterX = slot.x + slot.width / 2;
          const slotCenterY = slot.y + slot.height / 2;
          if (Math.abs(resultCenterX - slotCenterX) >= 1e-9) {
            return false;
          }
          if (Math.abs(resultCenterY - slotCenterY) >= 1e-9) {
            return false;
          }

          // 5. Never overflows the slot once scaled.
          if (result.width > slot.width + EPSILON || result.height > slot.height + EPSILON) {
            return false;
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it("handles the degenerate zero-dimension case without throwing or producing NaN", () => {
    const slot: ResolvedBox = { x: 10, y: 20, width: 100, height: 50 };
    const result = nativeSizedLogoBox(slot, 0, 0);

    expect(result.width).toBe(0);
    expect(result.height).toBe(0);
    expect(Number.isNaN(result.x)).toBe(false);
    expect(Number.isNaN(result.y)).toBe(false);
    expect(Number.isNaN(result.width)).toBe(false);
    expect(Number.isNaN(result.height)).toBe(false);
  });
});
