// Feature: social-creative-generator, Property 4: Sponsor logo fits within the slot with a uniform scale
//
// Validates: Requirements 3.3
//
// Property 4: For any logo slot box and any natural image width/height,
// `nativeSizedLogoBox` returns a box whose width and height are the natural
// dimensions scaled by a single uniform factor `s = min(slot.width /
// naturalWidth, slot.height / naturalHeight)` on both axes — never stretched
// non-uniformly, and always fully contained within the slot. The result is
// centered within the slot on both axes.
//
// (Original spec said "never upscaled" but a 200×100 logo in a 600×360
// slot rendered at 200×100 with 400+px of empty space around it, which
// looked worse than an upscaled fill. The new contract preserves aspect
// ratio but allows the scale factor to exceed 1 when the image is smaller
// than the slot.)

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

describe("Property 4: Sponsor logo fits within the slot with a uniform scale", () => {
  it("scales uniformly on both axes, stays centered, and never overflows the slot", () => {
    fc.assert(
      fc.property(
        arbSlot,
        arbNaturalDimension,
        arbNaturalDimension,
        (slot, naturalWidth, naturalHeight) => {
          const result = nativeSizedLogoBox(slot, naturalWidth, naturalHeight);

          const EPSILON = 1e-6;

          // 1. Uniform scale on both axes (aspect ratio preserved).
          const scaleW = result.width / naturalWidth;
          const scaleH = result.height / naturalHeight;
          if (Math.abs(scaleW - scaleH) >= 1e-6) {
            return false;
          }

          // 2. Matches the "fit within slot" contract: scale factor equals
          // `min(slot.width / naturalWidth, slot.height / naturalHeight)`,
          // so at least one axis is exactly filling the slot.
          const expectedScale = Math.min(slot.width / naturalWidth, slot.height / naturalHeight);
          if (Math.abs(scaleW - expectedScale) >= 1e-6) {
            return false;
          }

          // 3. Centered within the slot on both axes.
          const resultCenterX = result.x + result.width / 2;
          const resultCenterY = result.y + result.height / 2;
          const slotCenterX = slot.x + slot.width / 2;
          const slotCenterY = slot.y + slot.height / 2;
          if (Math.abs(resultCenterX - slotCenterX) >= 1e-6) {
            return false;
          }
          if (Math.abs(resultCenterY - slotCenterY) >= 1e-6) {
            return false;
          }

          // 4. Never overflows the slot.
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
