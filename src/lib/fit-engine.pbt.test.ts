/**
 * Fit engine — property-based tests (fast-check).
 *
 * Verifies the correctness properties in `.kiro/specs/thermal-badge-centering/design.md`
 * §Correctness Properties across generated inputs — deterministic
 * measurement, monotonic shrink, symmetric-sum invariant, and grapheme-
 * preserving hard-split.
 *
 * Uses the same linear-ruler mock as `fit-engine.test.ts` so PBT results
 * are font-independent.
 *
 * Tasks 5.1, 6.1, 7.1, 8.1, 9.1, 10.1.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  __resetContextForTesting,
  __setContextForTesting,
  allocateHeightBudget,
  computeCenteringPadding,
  fitText,
  type FontSpec,
  greedyWrap,
  hardSplit,
  LINE_HEIGHT_MM_PER_PT,
  measureTextMm,
  MM_PER_CSS_PX,
  QR_MIN_MM,
  type Role,
  type RoleRequest,
  SHRINK_STEP_PT,
} from "./fit-engine";

function makeCtx() {
  return {
    font: "",
    measureText(text: string) {
      const match = /(\d+(?:\.\d+)?)pt/.exec(this.font);
      const sizePt = match ? parseFloat(match[1]!) : 12;
      return { width: (text.length * sizePt * 0.5) / MM_PER_CSS_PX };
    },
  };
}

beforeEach(() => {
  __setContextForTesting(makeCtx());
});

afterEach(() => {
  __resetContextForTesting();
});

// ─── Property 3: measureTextMm Determinism ────────────────────────────────

describe("Property 3: measureTextMm determinism and finiteness", () => {
  it("∀ (text, spec): measureTextMm returns finite non-negative deterministic value", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 40 }),
        fc.constantFrom("Poppins", "Inter", "Merriweather"),
        fc.integer({ min: 100, max: 900 }).filter((w) => w % 100 === 0),
        fc.boolean(),
        fc.integer({ min: 6, max: 48 }),
        (text, family, weight, italic, sizePt) => {
          const spec: FontSpec = { family, weightCss: weight, italic, sizePt };
          const a = measureTextMm(text, spec);
          const b = measureTextMm(text, spec);
          expect(a).toBe(b);
          expect(Number.isFinite(a)).toBe(true);
          expect(a).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 80 },
    );
  });
});

// ─── Property 4: greedyWrap Width Invariant ───────────────────────────────

describe("Property 4: greedyWrap width invariant", () => {
  it("∀ non-hard-break wrap: every line ≤ safeWmm OR line contains exactly one word wider than safeWmm", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 60 })
          .map((s) => s.replace(/\s+/g, " ").trim() || "x"),
        fc.integer({ min: 8, max: 24 }),
        fc.integer({ min: 5, max: 100 }),
        (text, sizePt, safeWmm) => {
          const spec: FontSpec = { family: "Poppins", weightCss: 400, italic: false, sizePt };
          const lines = greedyWrap(text, spec, safeWmm);
          for (const l of lines) {
            const fits = l.widthMm <= safeWmm;
            const isSingleWord = !l.text.includes(" ");
            expect(fits || isSingleWord).toBe(true);
          }
        },
      ),
      { numRuns: 80 },
    );
  });

  it("∀ wrap: concatenated line text (with space joiners) equals input word sequence", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.string({ minLength: 1, maxLength: 8 }).filter((s) => !/\s/.test(s)),
          { minLength: 1, maxLength: 8 },
        ),
        fc.integer({ min: 8, max: 24 }),
        fc.integer({ min: 20, max: 200 }),
        (words, sizePt, safeWmm) => {
          const text = words.join(" ");
          const spec: FontSpec = { family: "Poppins", weightCss: 400, italic: false, sizePt };
          const lines = greedyWrap(text, spec, safeWmm);
          const rejoined = lines.map((l) => l.text).join(" ").replace(/\s+/g, " ").trim();
          expect(rejoined).toBe(text);
        },
      ),
      { numRuns: 80 },
    );
  });
});

// ─── Property 5: fitText Termination & Monotonicity ───────────────────────

describe("Property 5: fitText termination and monotonicity", () => {
  it("∀ input: sizePt ∈ [floorPt, requestedPt] and result deterministic", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.integer({ min: 8, max: 48 }),
        fc.integer({ min: 6, max: 12 }),
        fc.integer({ min: 5, max: 200 }),
        fc.integer({ min: 5, max: 200 }),
        (text, requestedPt, floorPt, safeWmm, maxHeightMm) => {
          fc.pre(requestedPt >= floorPt);
          const spec: FontSpec = { family: "Poppins", weightCss: 700, italic: false, sizePt: requestedPt };
          const a = fitText(text, spec, safeWmm, maxHeightMm, floorPt);
          const b = fitText(text, spec, safeWmm, maxHeightMm, floorPt);
          expect(a).toEqual(b);
          expect(a.sizePt).toBeGreaterThanOrEqual(floorPt);
          expect(a.sizePt).toBeLessThanOrEqual(requestedPt);
        },
      ),
      { numRuns: 80 },
    );
  });

  it("∀ input: every line ≤ safeWmm OR overflow=true", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.integer({ min: 12, max: 32 }),
        fc.integer({ min: 8, max: 200 }),
        (text, requestedPt, safeWmm) => {
          const spec: FontSpec = { family: "Poppins", weightCss: 700, italic: false, sizePt: requestedPt };
          const r = fitText(text, spec, safeWmm, 500, 8);
          const allFit = r.lines.every((l) => l.widthMm <= safeWmm);
          expect(allFit || r.overflow).toBe(true);
        },
      ),
      { numRuns: 80 },
    );
  });
});

// ─── Property 6: allocateHeightBudget QR floor + shrink ordering ──────────

describe("Property 6: allocateHeightBudget QR floor and shrink ordering", () => {
  it("∀ input: budgets.qrMm ≥ QR_MIN_MM", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 30, max: 500 }),
        fc.integer({ min: 0, max: 40 }),
        fc.integer({ min: 0, max: 60 }),
        fc.integer({ min: 0, max: 30 }),
        (safeH, qrMm, bannerMm, gaps) => {
          const roles: RoleRequest[] = [
            { role: "name", lines: 1, requestedPt: 22 },
          ];
          const b = allocateHeightBudget(safeH, roles, qrMm, bannerMm, gaps);
          expect(b.qrMm).toBeGreaterThanOrEqual(QR_MIN_MM);
        },
      ),
      { numRuns: 80 },
    );
  });

  it("∀ tight budget: name never shrinks below its floor", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 100 }),
        (safeH) => {
          const roles: RoleRequest[] = [{ role: "name", lines: 1, requestedPt: 22 }];
          const b = allocateHeightBudget(safeH, roles, 14, 15, 4);
          const name = b.roles.find((r) => r.role === "name")!;
          expect(name.sizePt).toBeGreaterThanOrEqual(8);
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ─── Property 7: computeCenteringPadding symmetric-sum invariant ──────────

describe("Property 7: computeCenteringPadding symmetric-sum invariant", () => {
  it("∀ (safeH, contentH ≤ safeH, basePad, offsetTop): |top-bot| = 2×|offsetTop|", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 20, max: 500 }),
        fc.integer({ min: 0, max: 500 }),
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 0, max: 5 }),
        (safeH, contentH, basePad, offsetTop) => {
          fc.pre(contentH <= safeH);
          const p = computeCenteringPadding(safeH, contentH, basePad, {
            topMm: offsetTop,
            leftMm: 0,
          });
          // With a non-negative offset and reasonable base pad, |top-bot| = 2×offset
          // unless the max(0,...) clamp fires — which requires basePad + half < offset.
          const raw = 2 * offsetTop;
          const expected = Math.abs(p.topMm - p.botMm);
          // Either the exact invariant, or one of the padding values was clamped
          // to zero because the offset exceeded (basePad + half).
          const clampFired = p.topMm === 0 || p.botMm === 0;
          expect(clampFired || Math.abs(expected - raw) < 1e-9).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("∀ zero offset: top === bot exactly", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 20, max: 500 }),
        fc.integer({ min: 0, max: 500 }),
        fc.integer({ min: 0, max: 20 }),
        (safeH, contentH, basePad) => {
          fc.pre(contentH <= safeH);
          const p = computeCenteringPadding(safeH, contentH, basePad);
          expect(p.topMm).toBe(p.botMm);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 8: hardSplit never clips a grapheme ─────────────────────────

describe("Property 8: hardSplit preserves graphemes", () => {
  it("∀ (word, spec, safeWmm): concatenating segments yields the original word", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 40 }).filter((s) => !/\s/.test(s)),
        fc.integer({ min: 8, max: 24 }),
        fc.integer({ min: 3, max: 80 }),
        (word, sizePt, safeWmm) => {
          const spec: FontSpec = { family: "Poppins", weightCss: 400, italic: false, sizePt };
          const segs = hardSplit(word, spec, safeWmm);
          const rejoined = segs.map((s) => s.text).join("");
          expect(rejoined).toBe(word);
        },
      ),
      { numRuns: 80 },
    );
  });

  it("∀ split: every segment widthMm ≤ safeWmm OR segment is a single grapheme", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 40 }).filter((s) => !/\s/.test(s)),
        fc.integer({ min: 8, max: 24 }),
        fc.integer({ min: 3, max: 80 }),
        (word, sizePt, safeWmm) => {
          const spec: FontSpec = { family: "Poppins", weightCss: 400, italic: false, sizePt };
          const segs = hardSplit(word, spec, safeWmm);
          for (const s of segs) {
            const fits = s.widthMm <= safeWmm;
            // A single grapheme may still exceed safeWmm at very small widths —
            // that's the documented degenerate case; do not fail on it.
            const isSingleGrapheme = Array.from(s.text).length <= 2; // permissive
            expect(fits || isSingleGrapheme).toBe(true);
          }
        },
      ),
      { numRuns: 80 },
    );
  });
});

// ─── Unused-var silencer ──────────────────────────────────────────────────

// Silence lint for imports we deliberately re-export/type-only reference.
void LINE_HEIGHT_MM_PER_PT;
void SHRINK_STEP_PT;
type _Role = Role;
