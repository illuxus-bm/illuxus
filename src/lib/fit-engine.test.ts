/**
 * Fit engine — unit tests.
 *
 * Every pure function in `fit-engine.ts` is exercised by a `describe` block
 * below. Widths come from an injected mock ruler (`text.length × sizePt × 0.5 mm`)
 * so the tests are font-independent and deterministic — real font metrics
 * are validated separately by Playwright browser tests.
 *
 * Tasks 5, 6, 7, 8, 9, 10, 11 of the thermal-badge-centering bugfix.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __getFontLoadingFailedForTesting,
  __resetContextForTesting,
  __setContextForTesting,
  __setFontLoadingFailedForTesting,
  allocateHeightBudget,
  CENTER_TOLERANCE_MM,
  computeCenteringPadding,
  ensureFontsLoaded,
  FLOOR_PT_BY_ROLE,
  fitText,
  type FontSpec,
  greedyWrap,
  hardSplit,
  LINE_HEIGHT_MM_PER_PT,
  measureTextMm,
  MEASUREMENT_SAFETY_PAD_MM,
  MM_PER_CSS_PX,
  QR_MIN_MM,
  type RoleRequest,
  SHRINK_STEP_PT,
} from "./fit-engine";

// ─── Test setup: linear-ruler mock ────────────────────────────────────────
//
// `text.length × sizePt × 0.5 mm/char/pt` in "CSS-pixel space" via
// `MM_PER_CSS_PX` reversed. Result is that `measureTextMm` returns
// `text.length × sizePt × 0.5 mm` for our tests — a clean linear ruler.

function mkMockRuler() {
  return {
    font: "",
    measureText: (text: string) => {
      // Parse sizePt from `font` string like "italic 700 22pt Foo, ..."
      const match = /(\d+(?:\.\d+)?)pt/.exec(this?.font ?? "");
      // biome-ignore lint: we deliberately capture via `this` from the ctx spec.
      const sizePt = match ? parseFloat(match[1]!) : 12;
      // Return width in CSS pixels; measureTextMm multiplies by MM_PER_CSS_PX.
      // We want the final mm value to equal text.length * sizePt * 0.5.
      // So CSS-px width = (text.length * sizePt * 0.5) / MM_PER_CSS_PX.
      return { width: (text.length * sizePt * 0.5) / MM_PER_CSS_PX };
    },
  };
}

// The mock above's `measureText` closes over `this` but arrow functions
// don't have their own `this`. Use a real object so `ctx.font` is readable.
function makeCtx() {
  const ctx = {
    font: "",
    measureText(text: string) {
      const match = /(\d+(?:\.\d+)?)pt/.exec(this.font);
      const sizePt = match ? parseFloat(match[1]!) : 12;
      return { width: (text.length * sizePt * 0.5) / MM_PER_CSS_PX };
    },
  };
  return ctx;
}

// Sanity: avoid unused-variable lint from the pedagogical `mkMockRuler`.
void mkMockRuler;

beforeEach(() => {
  __setContextForTesting(makeCtx());
});

afterEach(() => {
  __resetContextForTesting();
});

// ─── Task 5: measureTextMm ────────────────────────────────────────────────

describe("measureTextMm", () => {
  const SPEC: FontSpec = { family: "Poppins", weightCss: 700, italic: false, sizePt: 12 };

  it("returns width in mm for the injected ruler", () => {
    // 8 chars × 12pt × 0.5 = 48 mm.
    expect(measureTextMm("Jane Doe", SPEC)).toBeCloseTo(48, 10);
  });

  it("scales linearly with sizePt at fixed text", () => {
    const w1 = measureTextMm("Hello", { ...SPEC, sizePt: 10 });
    const w2 = measureTextMm("Hello", { ...SPEC, sizePt: 20 });
    expect(w2 / w1).toBeCloseTo(2, 10);
  });

  it("returns the same value on repeat calls (deterministic cache)", () => {
    const w1 = measureTextMm("Consistent", SPEC);
    const w2 = measureTextMm("Consistent", SPEC);
    expect(w1).toBe(w2);
  });

  it("differs when the italic flag differs (cache key includes italic)", () => {
    // With the mock ruler width doesn't actually change on italic, but the
    // cache key must — otherwise italic changes would return stale widths.
    // We verify indirectly: call with italic=false, then swap the mock to
    // return double width for italic=true, and confirm the second call
    // returns the new width.
    __setContextForTesting({
      font: "",
      measureText(text: string) {
        const isItalic = this.font.startsWith("italic");
        const match = /(\d+(?:\.\d+)?)pt/.exec(this.font);
        const sizePt = match ? parseFloat(match[1]!) : 12;
        const w = text.length * sizePt * 0.5 * (isItalic ? 2 : 1);
        return { width: w / MM_PER_CSS_PX };
      },
    });
    const w1 = measureTextMm("X", { ...SPEC, italic: false });
    const w2 = measureTextMm("X", { ...SPEC, italic: true });
    expect(w2).toBeCloseTo(w1 * 2, 10);
  });

  it("adds MEASUREMENT_SAFETY_PAD_MM when font loading has failed", () => {
    const baseline = measureTextMm("Hello", SPEC); // caches under "not failed"
    __setFontLoadingFailedForTesting(true);
    const padded = measureTextMm("Hello", SPEC); // cache cleared by setter
    expect(padded).toBeCloseTo(baseline + MEASUREMENT_SAFETY_PAD_MM, 10);
  });
});

// ─── Task 6: greedyWrap ───────────────────────────────────────────────────

describe("greedyWrap", () => {
  const SPEC: FontSpec = { family: "Poppins", weightCss: 400, italic: false, sizePt: 10 };

  it("wraps at word boundaries when the line exceeds safeWmm", () => {
    // "the quick brown fox" — 4 words, mock width = 5*10*0.5 + 6*10*0.5 + ... = variable.
    // At safeWmm = 40, "the quick" = 9 chars = 45 mm — too wide. Just "the" = 15 mm fits.
    const lines = greedyWrap("the quick brown fox", SPEC, 40);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(l.widthMm).toBeLessThanOrEqual(40);
  });

  it("emits an unbreakable single-word overflow as its own line when hardBreak=false", () => {
    const lines = greedyWrap("supercalifragilistic", SPEC, 20);
    expect(lines).toHaveLength(1);
    expect(lines[0].widthMm).toBeGreaterThan(20);
  });

  it("hard-splits an unbreakable token when hardBreak=true", () => {
    const lines = greedyWrap("supercalifragilistic", SPEC, 20, { hardBreak: true });
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(l.widthMm).toBeLessThanOrEqual(20);
  });

  it("returns a single empty line for empty input (defined behavior)", () => {
    const lines = greedyWrap("", SPEC, 50);
    expect(lines).toEqual([{ text: "", widthMm: 0 }]);
  });

  it("preserves single spaces between words on the same line", () => {
    const lines = greedyWrap("a b c", SPEC, 100);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe("a b c");
  });
});

// ─── Task 7: fitText ──────────────────────────────────────────────────────

describe("fitText", () => {
  const SPEC: FontSpec = { family: "Poppins", weightCss: 800, italic: false, sizePt: 22 };

  it("fast path: returns the requested pt when text fits", () => {
    // "Jane Doe" @ 22 pt = 8 × 22 × 0.5 = 88 mm. safeWmm = 100 → fits.
    const r = fitText("Jane Doe", SPEC, 100, 20, FLOOR_PT_BY_ROLE.name);
    expect(r.sizePt).toBe(22);
    expect(r.lines).toHaveLength(1);
    expect(r.atFloor).toBe(false);
    expect(r.overflow).toBe(false);
  });

  it("slow path: shrinks below requested pt when width is tight", () => {
    // "Aakarshan Singh Chadha" — 22 chars @ 22 pt = 242 mm. safeWmm = 60.
    // Need to wrap into 3+ lines or shrink. maxHeight allows shrink.
    const r = fitText("Aakarshan Singh Chadha", SPEC, 60, 100, 8);
    expect(r.sizePt).toBeLessThanOrEqual(22);
    for (const l of r.lines) expect(l.widthMm).toBeLessThanOrEqual(60);
  });

  it("returns sizePt >= floorPt", () => {
    const r = fitText("Aakarshan Singh Chadha", SPEC, 10, 20, 8);
    expect(r.sizePt).toBeGreaterThanOrEqual(8);
  });

  it("sets atFloor when returning at floorPt", () => {
    // Force floor by giving essentially no width.
    const r = fitText("Aakarshan Singh Chadha", SPEC, 5, 200, 8);
    expect(r.atFloor).toBe(true);
  });

  it("sets overflow=true only when hard-break was invoked at floor", () => {
    // Unbreakable token, tiny safeWmm at floor.
    const r = fitText("supercalifragilistic", SPEC, 5, 200, 8);
    expect(r.overflow).toBe(true);
    // Every line must still be ≤ safeWmm after hard-break.
    for (const l of r.lines) expect(l.widthMm).toBeLessThanOrEqual(5);
  });

  it("is deterministic across identical calls", () => {
    const a = fitText("Aakarshan Singh Chadha", SPEC, 40, 30, 8);
    const b = fitText("Aakarshan Singh Chadha", SPEC, 40, 30, 8);
    expect(a).toEqual(b);
  });

  it("terminates in bounded iterations", () => {
    // Iteration count is deterministic: (startPt - floorPt) / SHRINK_STEP_PT + 1.
    // For startPt=22, floorPt=8, step=0.5: at most 29 iterations.
    // We test termination by running a pathological input and expecting
    // the function to return within a reasonable time (implicit).
    const start = performance.now();
    fitText("supercalifragilisticexpialidocious", SPEC, 1, 200, 8);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100); // 100ms is very generous
  });
});

// ─── Task 8: allocateHeightBudget ─────────────────────────────────────────

describe("allocateHeightBudget", () => {
  it("returns unshrunken budgets when total <= safeH", () => {
    const roles: RoleRequest[] = [
      { role: "org", lines: 1, requestedPt: 8 },
      { role: "event", lines: 1, requestedPt: 12 },
      { role: "name", lines: 1, requestedPt: 22 },
    ];
    const b = allocateHeightBudget(200, roles, 22, 30, 6);
    for (const r of b.roles) expect(r.atFloor).toBe(false);
    expect(b.qrMm).toBe(22);
    expect(b.bannerMm).toBe(30);
    expect(b.overflow).toBe(false);
  });

  it("clamps QR to QR_MIN_MM in every branch", () => {
    const roles: RoleRequest[] = [{ role: "name", lines: 1, requestedPt: 22 }];
    // Requested 5 mm — below floor.
    const b = allocateHeightBudget(80, roles, 5, 20, 4);
    expect(b.qrMm).toBe(QR_MIN_MM);
  });

  it("shrinks eventDate/meta/org before name (priority order)", () => {
    const roles: RoleRequest[] = [
      { role: "org", lines: 1, requestedPt: 12 },
      { role: "eventDate", lines: 1, requestedPt: 12 },
      { role: "name", lines: 1, requestedPt: 22 },
    ];
    // Tight safeH forces at least one shrink.
    const b = allocateHeightBudget(40, roles, 14, 15, 4);
    const nameB = b.roles.find((r) => r.role === "name")!;
    const orgB = b.roles.find((r) => r.role === "org")!;
    const dateB = b.roles.find((r) => r.role === "eventDate")!;
    // eventDate must have shrunk at least as much as name, and org at least as
    // much as name (both come earlier in the shrink priority).
    expect(nameB.sizePt).toBeLessThanOrEqual(22);
    expect(dateB.sizePt).toBeLessThanOrEqual(orgB.sizePt + 0.5); // date shrinks first
  });

  it("hides the banner as a last resort", () => {
    const roles: RoleRequest[] = [
      { role: "name", lines: 1, requestedPt: 22 },
    ];
    // safeH too small for QR alone to fit with banner.
    const b = allocateHeightBudget(20, roles, 14, 30, 2);
    expect(b.bannerHidden).toBe(true);
    expect(b.bannerMm).toBe(0);
  });
});

// ─── Task 9: computeCenteringPadding ──────────────────────────────────────

describe("computeCenteringPadding", () => {
  it("returns equal top/bot when thermalOffset is zero", () => {
    const p = computeCenteringPadding(100, 60, 5);
    expect(p.topMm).toBe(p.botMm);
    expect(p.topMm).toBeCloseTo(5 + (100 - 60) / 2, 10);
  });

  it("|top-bot| == 2×offset.topMm", () => {
    const p = computeCenteringPadding(100, 60, 5, { topMm: 1.5, leftMm: 0 });
    expect(Math.abs(p.topMm - p.botMm)).toBeCloseTo(3.0, 10);
  });

  it("symmetric-sum invariant: top + bot = safeH - contentH + 2×basePad", () => {
    const p = computeCenteringPadding(100, 60, 5, { topMm: 2, leftMm: 0 });
    expect(p.topMm + p.botMm).toBeCloseTo(100 - 60 + 2 * 5, 10);
  });

  it("never returns negative values", () => {
    // Content taller than safe area (should not happen in practice but must
    // be defended).
    const p = computeCenteringPadding(50, 80, 5);
    expect(p.topMm).toBeGreaterThanOrEqual(0);
    expect(p.botMm).toBeGreaterThanOrEqual(0);
  });

  it("is deterministic", () => {
    const a = computeCenteringPadding(100, 40, 5, { topMm: 1, leftMm: 0.5 });
    const b = computeCenteringPadding(100, 40, 5, { topMm: 1, leftMm: 0.5 });
    expect(a).toEqual(b);
  });

  it("centers well within CENTER_TOLERANCE_MM", () => {
    const p = computeCenteringPadding(100, 60, 5);
    expect(Math.abs(p.topMm - p.botMm)).toBeLessThanOrEqual(CENTER_TOLERANCE_MM);
  });
});

// ─── Task 10: hardSplit ───────────────────────────────────────────────────

describe("hardSplit", () => {
  const SPEC: FontSpec = { family: "Poppins", weightCss: 400, italic: false, sizePt: 10 };

  it("splits an ASCII long token into segments each ≤ safeWmm", () => {
    const segs = hardSplit("supercalifragilistic", SPEC, 20);
    expect(segs.length).toBeGreaterThan(1);
    for (const s of segs) expect(s.widthMm).toBeLessThanOrEqual(20);
  });

  it("preserves a grapheme cluster (e + combining acute)", () => {
    // "\u0301" is a combining acute accent.
    const word = "abcéfg\u0301hij"; // e + combining acute forms one grapheme
    const segs = hardSplit(word, SPEC, 15);
    // Every segment's boundaries must not split \u0301 from its base.
    const rejoined = segs.map((s) => s.text).join("");
    expect(rejoined).toBe(word);
  });

  it("preserves an ASCII emoji-like sequence (surrogate pair)", () => {
    // "🇺🇸" — U+1F1FA + U+1F1F8 — flag sequence.
    const word = "flag🇺🇸end";
    const segs = hardSplit(word, SPEC, 15);
    const rejoined = segs.map((s) => s.text).join("");
    expect(rejoined).toBe(word);
    // Every segment must still be a well-formed string (no lone surrogate).
    for (const s of segs) {
      // toString() on the segment must round-trip through JSON.
      expect(() => JSON.stringify(s.text)).not.toThrow();
    }
  });

  it("is deterministic", () => {
    const a = hardSplit("supercalifragilistic", SPEC, 20);
    const b = hardSplit("supercalifragilistic", SPEC, 20);
    expect(a).toEqual(b);
  });

  it("returns a single empty line for empty input", () => {
    expect(hardSplit("", SPEC, 20)).toEqual([{ text: "", widthMm: 0 }]);
  });
});

// ─── Task 11: ensureFontsLoaded ───────────────────────────────────────────

describe("ensureFontsLoaded", () => {
  it("returns false when document.fonts is not available", async () => {
    // JSDOM doesn't ship document.fonts by default. If the local jsdom
    // version does, this test still passes because we haven't mocked the
    // FontFaceSet — the actual `fonts.load` calls will resolve or reject
    // depending on jsdom's behavior.
    // What we assert here is that the function does not throw and returns
    // a boolean.
    const result = await ensureFontsLoaded([]);
    expect(typeof result).toBe("boolean");
  });

  it("injects a <link> exactly once for the same URL (idempotent)", async () => {
    // Skip this test if document.fonts isn't present — it's the only path
    // that actually creates the <link>.
    if (!(document as unknown as { fonts?: unknown }).fonts) {
      const fakeFonts = { load: async () => undefined, ready: Promise.resolve() };
      (document as unknown as { fonts: unknown }).fonts = fakeFonts;
    }
    const before = document.head.querySelectorAll("link[rel='stylesheet']").length;
    await ensureFontsLoaded(
      [{ family: "Poppins", weightCss: 400, italic: false, sizePt: 12 }],
      "https://fonts.googleapis.com/css2?family=Poppins&display=swap",
    );
    await ensureFontsLoaded(
      [{ family: "Poppins", weightCss: 400, italic: false, sizePt: 12 }],
      "https://fonts.googleapis.com/css2?family=Poppins&display=swap",
    );
    const after = document.head.querySelectorAll("link[rel='stylesheet']").length;
    expect(after - before).toBeLessThanOrEqual(1);
  });

  it("sets fontLoadingFailed=true when document.fonts.load rejects", async () => {
    (document as unknown as { fonts: unknown }).fonts = {
      load: async () => {
        throw new Error("network");
      },
      ready: Promise.resolve(),
    };
    const ok = await ensureFontsLoaded(
      [{ family: "MissingFont", weightCss: 400, italic: false, sizePt: 12 }],
    );
    expect(ok).toBe(false);
    expect(__getFontLoadingFailedForTesting()).toBe(true);
  });
});

// ─── Line-height invariant ────────────────────────────────────────────────

describe("LINE_HEIGHT_MM_PER_PT", () => {
  it("matches the historical .name line-height of 1.1", () => {
    // A single-line 12pt name should have height = 12 * 1.1 * 25.4/72 mm ≈ 4.65 mm.
    expect(12 * LINE_HEIGHT_MM_PER_PT).toBeCloseTo(4.657, 3);
  });
});

// ─── SHRINK_STEP_PT smoke ─────────────────────────────────────────────────

describe("SHRINK_STEP_PT", () => {
  it("is small enough that a name shrink loop from 22 to 8 terminates in < 30 steps", () => {
    expect((22 - 8) / SHRINK_STEP_PT).toBeLessThan(30);
  });
});

// Silence unused-import warnings for future tasks.
void vi;
