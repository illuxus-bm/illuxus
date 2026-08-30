// Unit tests for `computeImageDrawBox` in src/lib/brochure/editor/editor-units.ts
//
// This function exists specifically to stop the canvas renderer and the PDF
// exporter from drifting. They each used to carry their own copy of this math,
// and both copies had silently degraded `fit: "fill"` into `contain` — choosing
// "Fill" in the properties panel did nothing at all, in both renderers, with no
// type error and no failing test.
//
// So the `fill` cases below are the point of this file, not an afterthought:
// they are the regression that had already shipped.
import { describe, expect, it } from "vitest";
import { computeImageDrawBox } from "../editor-units";

/** A landscape 200x100 source drawn into a portrait 100x200 box: every fit mode
 *  produces a visibly different result, so it's a good default fixture. */
const LANDSCAPE = { naturalWidth: 200, naturalHeight: 100 };
const PORTRAIT_BOX = { boxWidth: 100, boxHeight: 200 };

describe("computeImageDrawBox — fill", () => {
  it("stretches to exactly the box on both axes, breaking aspect ratio", () => {
    const box = computeImageDrawBox({ ...PORTRAIT_BOX, ...LANDSCAPE, fit: "fill" });
    expect(box).toEqual({ dx: 0, dy: 0, width: 100, height: 200 });
  });

  it("is provably different from contain for a mismatched aspect ratio", () => {
    // The original bug: `fill` fell through to `contain`, making the two
    // indistinguishable. Pin them apart so a regression fails loudly.
    const fill = computeImageDrawBox({ ...PORTRAIT_BOX, ...LANDSCAPE, fit: "fill" });
    const contain = computeImageDrawBox({ ...PORTRAIT_BOX, ...LANDSCAPE, fit: "contain" });
    expect(fill).not.toEqual(contain);
  });

  it("is also different from cover for a mismatched aspect ratio", () => {
    const fill = computeImageDrawBox({ ...PORTRAIT_BOX, ...LANDSCAPE, fit: "fill" });
    const cover = computeImageDrawBox({ ...PORTRAIT_BOX, ...LANDSCAPE, fit: "cover" });
    expect(fill).not.toEqual(cover);
  });

  it("ignores the focal point, since there is nothing to crop", () => {
    const centred = computeImageDrawBox({ ...PORTRAIT_BOX, ...LANDSCAPE, fit: "fill" });
    const shifted = computeImageDrawBox({
      ...PORTRAIT_BOX,
      ...LANDSCAPE,
      fit: "fill",
      focalX: 0,
      focalY: 1,
    });
    expect(shifted).toEqual(centred);
  });
});

describe("computeImageDrawBox — cover", () => {
  it("scales up until the box is covered and centres the overflow by default", () => {
    // 200x100 into 100x200: scale = max(100/200, 200/100) = 2 → 400x200.
    const box = computeImageDrawBox({ ...PORTRAIT_BOX, ...LANDSCAPE, fit: "cover" });
    expect(box.width).toBe(400);
    expect(box.height).toBe(200);
    expect(box.dx).toBe(-150); // (100 - 400) / 2
    expect(box.dy).toBe(0);
  });

  it("never leaves a gap — the drawn box always covers the element box", () => {
    const box = computeImageDrawBox({ ...PORTRAIT_BOX, ...LANDSCAPE, fit: "cover" });
    expect(box.width).toBeGreaterThanOrEqual(PORTRAIT_BOX.boxWidth);
    expect(box.height).toBeGreaterThanOrEqual(PORTRAIT_BOX.boxHeight);
    expect(box.dx).toBeLessThanOrEqual(0);
    expect(box.dy).toBeLessThanOrEqual(0);
  });

  it("preserves aspect ratio", () => {
    const box = computeImageDrawBox({ ...PORTRAIT_BOX, ...LANDSCAPE, fit: "cover" });
    expect(box.width / box.height).toBeCloseTo(200 / 100, 10);
  });
});

describe("computeImageDrawBox — contain", () => {
  it("scales down until the whole image fits and letterboxes the remainder", () => {
    // scale = min(100/200, 200/100) = 0.5 → 100x50.
    const box = computeImageDrawBox({ ...PORTRAIT_BOX, ...LANDSCAPE, fit: "contain" });
    expect(box.width).toBe(100);
    expect(box.height).toBe(50);
    expect(box.dx).toBe(0);
    expect(box.dy).toBe(75); // (200 - 50) / 2
  });

  it("never crops — the drawn box always fits inside the element box", () => {
    const box = computeImageDrawBox({ ...PORTRAIT_BOX, ...LANDSCAPE, fit: "contain" });
    expect(box.width).toBeLessThanOrEqual(PORTRAIT_BOX.boxWidth);
    expect(box.height).toBeLessThanOrEqual(PORTRAIT_BOX.boxHeight);
  });

  it("preserves aspect ratio", () => {
    const box = computeImageDrawBox({ ...PORTRAIT_BOX, ...LANDSCAPE, fit: "contain" });
    expect(box.width / box.height).toBeCloseTo(200 / 100, 10);
  });
});

describe("computeImageDrawBox — focal point", () => {
  it("defaults to centre, matching the behaviour before cropping existed", () => {
    // Every document saved before `focalX`/`focalY` were added omits them, so
    // the default has to reproduce the old hardcoded centring exactly.
    const withoutFocal = computeImageDrawBox({ ...PORTRAIT_BOX, ...LANDSCAPE, fit: "cover" });
    const explicitCentre = computeImageDrawBox({
      ...PORTRAIT_BOX,
      ...LANDSCAPE,
      fit: "cover",
      focalX: 0.5,
      focalY: 0.5,
    });
    expect(withoutFocal).toEqual(explicitCentre);
  });

  it("focalX 0 keeps the left edge of a cropped image", () => {
    const box = computeImageDrawBox({
      ...PORTRAIT_BOX,
      ...LANDSCAPE,
      fit: "cover",
      focalX: 0,
    });
    expect(box.dx).toBe(0);
  });

  it("focalX 1 keeps the right edge of a cropped image", () => {
    const box = computeImageDrawBox({
      ...PORTRAIT_BOX,
      ...LANDSCAPE,
      fit: "cover",
      focalX: 1,
    });
    // Right edge of the drawn image lands on the right edge of the box.
    expect(box.dx + box.width).toBe(PORTRAIT_BOX.boxWidth);
  });

  it("focalY 0 and 1 pin the top and bottom edges", () => {
    const tall = { boxWidth: 200, boxHeight: 100 };
    const source = { naturalWidth: 100, naturalHeight: 200 };
    const top = computeImageDrawBox({ ...tall, ...source, fit: "cover", focalY: 0 });
    const bottom = computeImageDrawBox({ ...tall, ...source, fit: "cover", focalY: 1 });
    expect(top.dy).toBe(0);
    expect(bottom.dy + bottom.height).toBe(tall.boxHeight);
  });

  it("moves the crop window monotonically as the focal point slides", () => {
    const at = (focalX: number) =>
      computeImageDrawBox({ ...PORTRAIT_BOX, ...LANDSCAPE, fit: "cover", focalX }).dx;
    expect(at(0)).toBeGreaterThan(at(0.25));
    expect(at(0.25)).toBeGreaterThan(at(0.5));
    expect(at(0.5)).toBeGreaterThan(at(0.75));
    expect(at(0.75)).toBeGreaterThan(at(1));
  });

  it("does not change the drawn size, only the offset", () => {
    const a = computeImageDrawBox({ ...PORTRAIT_BOX, ...LANDSCAPE, fit: "cover", focalX: 0 });
    const b = computeImageDrawBox({ ...PORTRAIT_BOX, ...LANDSCAPE, fit: "cover", focalX: 1 });
    expect(a.width).toBe(b.width);
    expect(a.height).toBe(b.height);
  });

  it("positions a letterboxed contain image too, not just a cropped one", () => {
    const flush = computeImageDrawBox({
      ...PORTRAIT_BOX,
      ...LANDSCAPE,
      fit: "contain",
      focalY: 0,
    });
    expect(flush.dy).toBe(0);
    const bottom = computeImageDrawBox({
      ...PORTRAIT_BOX,
      ...LANDSCAPE,
      fit: "contain",
      focalY: 1,
    });
    expect(bottom.dy + bottom.height).toBe(PORTRAIT_BOX.boxHeight);
  });

  it("clamps out-of-range focal values instead of drawing off into space", () => {
    const low = computeImageDrawBox({ ...PORTRAIT_BOX, ...LANDSCAPE, fit: "cover", focalX: -5 });
    const zero = computeImageDrawBox({ ...PORTRAIT_BOX, ...LANDSCAPE, fit: "cover", focalX: 0 });
    expect(low).toEqual(zero);

    const high = computeImageDrawBox({ ...PORTRAIT_BOX, ...LANDSCAPE, fit: "cover", focalX: 9 });
    const one = computeImageDrawBox({ ...PORTRAIT_BOX, ...LANDSCAPE, fit: "cover", focalX: 1 });
    expect(high).toEqual(one);
  });

  it("falls back to centre for a NaN focal value", () => {
    const nan = computeImageDrawBox({
      ...PORTRAIT_BOX,
      ...LANDSCAPE,
      fit: "cover",
      focalX: Number.NaN,
    });
    const centre = computeImageDrawBox({ ...PORTRAIT_BOX, ...LANDSCAPE, fit: "cover" });
    expect(nan).toEqual(centre);
  });
});

describe("computeImageDrawBox — zoom", () => {
  it("defaults to 1, leaving the fit scale untouched", () => {
    const implicit = computeImageDrawBox({ ...PORTRAIT_BOX, ...LANDSCAPE, fit: "cover" });
    const explicit = computeImageDrawBox({ ...PORTRAIT_BOX, ...LANDSCAPE, fit: "cover", zoom: 1 });
    expect(implicit).toEqual(explicit);
  });

  it("multiplies the fit scale", () => {
    const base = computeImageDrawBox({ ...PORTRAIT_BOX, ...LANDSCAPE, fit: "cover" });
    const zoomed = computeImageDrawBox({ ...PORTRAIT_BOX, ...LANDSCAPE, fit: "cover", zoom: 2 });
    expect(zoomed.width).toBe(base.width * 2);
    expect(zoomed.height).toBe(base.height * 2);
  });

  it("pushes a contain image into crop territory", () => {
    // Enough zoom turns letterboxing into overflow, which is the point: it lets
    // the organizer fill the box without switching fit modes.
    const zoomed = computeImageDrawBox({
      ...PORTRAIT_BOX,
      ...LANDSCAPE,
      fit: "contain",
      zoom: 3,
    });
    expect(zoomed.width).toBeGreaterThan(PORTRAIT_BOX.boxWidth);
  });

  it("clamps below 1 so an image is never shrunk out of its own fit mode", () => {
    // A `cover` image shrunk below its fit scale would letterbox, which reads as
    // a rendering bug rather than an intentional setting.
    const shrunk = computeImageDrawBox({
      ...PORTRAIT_BOX,
      ...LANDSCAPE,
      fit: "cover",
      zoom: 0.25,
    });
    const base = computeImageDrawBox({ ...PORTRAIT_BOX, ...LANDSCAPE, fit: "cover" });
    expect(shrunk).toEqual(base);
  });

  it("keeps the focal point meaningful when zoomed", () => {
    const left = computeImageDrawBox({
      ...PORTRAIT_BOX,
      ...LANDSCAPE,
      fit: "cover",
      zoom: 2,
      focalX: 0,
    });
    expect(left.dx).toBe(0);
  });
});

describe("computeImageDrawBox — degenerate input", () => {
  it("falls back to filling the box when the source has zero dimensions", () => {
    // A zero-width natural size would divide by zero and produce NaN geometry,
    // which Konva silently declines to draw — an invisible element with no
    // error is the worst possible outcome.
    const box = computeImageDrawBox({
      ...PORTRAIT_BOX,
      naturalWidth: 0,
      naturalHeight: 0,
      fit: "cover",
    });
    expect(box).toEqual({ dx: 0, dy: 0, width: 100, height: 200 });
  });

  it("returns finite numbers for every fit mode with a zero-size source", () => {
    for (const fit of ["cover", "contain", "fill"] as const) {
      const box = computeImageDrawBox({
        ...PORTRAIT_BOX,
        naturalWidth: 0,
        naturalHeight: 50,
        fit,
      });
      expect(Number.isFinite(box.dx)).toBe(true);
      expect(Number.isFinite(box.dy)).toBe(true);
      expect(Number.isFinite(box.width)).toBe(true);
      expect(Number.isFinite(box.height)).toBe(true);
    }
  });

  it("handles a zero-size element box without producing NaN", () => {
    const box = computeImageDrawBox({
      boxWidth: 0,
      boxHeight: 0,
      ...LANDSCAPE,
      fit: "cover",
    });
    expect(Number.isFinite(box.width)).toBe(true);
    expect(Number.isFinite(box.height)).toBe(true);
  });

  it("matches the source exactly when box and source already agree", () => {
    for (const fit of ["cover", "contain", "fill"] as const) {
      const box = computeImageDrawBox({
        boxWidth: 200,
        boxHeight: 100,
        ...LANDSCAPE,
        fit,
      });
      expect(box).toEqual({ dx: 0, dy: 0, width: 200, height: 100 });
    }
  });
});
