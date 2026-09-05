/**
 * Badge auto-fit engine — pure module.
 *
 * Owns text measurement, word-boundary wrapping, progressive font-size
 * shrinking, height-budget allocation, and optical centering math for the
 * badge printing pipeline. Consumed by `src/lib/print-badges.ts` and the
 * `PrintBadgesDialog` preview; not consumed by React components directly.
 *
 * Design contract: every exported function is deterministic — the same
 * inputs produce the same output (bugfix.md 2.10). No side effects beyond
 * the browser's shared `<canvas>` element used for `measureText` and the
 * font-loading state controlled by `ensureFontsLoaded`.
 *
 * Tasks 4–11 of the thermal-badge-centering bugfix (.kiro/specs).
 */

import {
  FLOOR_PT_BY_ROLE,
  LINE_HEIGHT_MM_PER_PT,
  MEASUREMENT_SAFETY_PAD_MM,
  MM_PER_CSS_PX,
  QR_MIN_MM,
  SHRINK_STEP_PT,
} from "./badge-fit-constants";

export {
  CENTER_TOLERANCE_MM,
  FLOOR_PT_BY_ROLE,
  LINE_HEIGHT_MM_PER_PT,
  MEASUREMENT_SAFETY_PAD_MM,
  MIN_PAD_MM,
  MM_PER_CSS_PX,
  QR_MIN_MM,
  SHRINK_STEP_PT,
} from "./badge-fit-constants";

// ─── Types ────────────────────────────────────────────────────────────────

/**
 * A resolved font specification suitable for `Canvas 2D measureText`.
 */
export type FontSpec = {
  family: string;
  /** CSS `font-weight` numeric value. 100–900. */
  weightCss: number;
  italic: boolean;
  /** Point size (72 pt = 1 inch). */
  sizePt: number;
};

/** One rendered line produced by `greedyWrap` / `fitText`. */
export type FitLine = {
  text: string;
  widthMm: number;
};

/** Outcome of a single call to `fitText`. */
export type FitResult = {
  sizePt: number;
  lines: FitLine[];
  heightMm: number;
  atFloor: boolean;
  overflow: boolean;
};

/** User-facing warning surfaced by `PrintBadgesDialog`. */
export type FitWarning = {
  role: string;
  text: string;
  reason: "atFloor" | "hardBreak";
};

/** Text roles the fit engine knows about (aligned with `FLOOR_PT_BY_ROLE`). */
export type Role =
  | "name"
  | "nameLabel"
  | "company"
  | "companyLabel"
  | "title"
  | "event"
  | "org"
  | "meta"
  | "ticket"
  | "eventDate"
  | "customText";

// ─── Canvas 2D factory (feature-detected) ─────────────────────────────────

/** Subset of `CanvasRenderingContext2D` the fit engine reads. */
export type Ctx2D = {
  font: string;
  measureText(text: string): { width: number };
};

let cachedCtx: Ctx2D | null | undefined; // undefined = not-yet-probed
let ctxOverride: Ctx2D | null | undefined;

/**
 * Return an offscreen 2D context reused across measurements.
 *
 * On first call the engine creates a single hidden `<canvas>` and holds a
 * reference to its 2D context. Subsequent calls return the cached context
 * so measurement is O(1) after the first invocation. In environments
 * without `document` (Node without JSDOM) or without `HTMLCanvasElement`,
 * returns `null` and the fallback DOM-span measurement path is used.
 *
 * Test seams: `__setContextForTesting(mock)` swaps in a synchronous ruler.
 */
export function getContext2D(): Ctx2D | null {
  if (ctxOverride !== undefined) return ctxOverride;
  if (cachedCtx !== undefined) return cachedCtx;
  if (
    typeof document === "undefined" ||
    typeof (globalThis as { HTMLCanvasElement?: unknown }).HTMLCanvasElement === "undefined"
  ) {
    cachedCtx = null;
    return cachedCtx;
  }
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    cachedCtx = (ctx as unknown as Ctx2D | null) ?? null;
    return cachedCtx;
  } catch {
    cachedCtx = null;
    return cachedCtx;
  }
}

/**
 * Test seam: replace the shared canvas context with a mock. Vitest suites
 * use this to inject a linear-ruler `measureText` (each character
 * `sizePt × 0.5 mm` wide) so unit tests are font-independent.
 */
export function __setContextForTesting(mock: Ctx2D | null): void {
  ctxOverride = mock;
}

/** Test seam: restore the real canvas context probe. Called from `afterEach`. */
export function __resetContextForTesting(): void {
  ctxOverride = undefined;
  cachedCtx = undefined;
  measurementCache.clear();
  fontLoadingFailed = false;
  loadedFontUrls.clear();
}

// ─── State ────────────────────────────────────────────────────────────────

/**
 * When true, `measureTextMm` adds `MEASUREMENT_SAFETY_PAD_MM` to every
 * measured width. Set by `ensureFontsLoaded` after a font-load rejection so
 * downstream fit decisions bias toward wrapping earlier and never clip a
 * glyph on the physical print (bugfix.md 2.1).
 */
let fontLoadingFailed = false;

/** Set of Google Fonts URLs already injected into the parent document. */
const loadedFontUrls = new Set<string>();

/**
 * Measurement cache keyed by `family|weightCss|italic|sizePt|text`. Widths
 * are pure functions of the tuple, so caching costs one map lookup per
 * measurement after the first.
 */
const measurementCache = new Map<string, number>();

function cacheKey(text: string, spec: FontSpec): string {
  return `${spec.family}|${spec.weightCss}|${spec.italic ? 1 : 0}|${spec.sizePt}|${text}`;
}

// ─── Task 5: measureTextMm ────────────────────────────────────────────────

const FALLBACK_STACK = "system-ui, sans-serif";

/**
 * Measure the natural rendered width of `text` at `spec` in millimeters.
 *
 * Uses the shared offscreen canvas context when available. Widths returned
 * by `measureText` are in CSS pixels; the engine converts to millimeters
 * using the CSS spec constant `MM_PER_CSS_PX = 25.4 / 96`. When font
 * loading has failed, adds `MEASUREMENT_SAFETY_PAD_MM` so the fit engine
 * biases toward earlier wrapping (bugfix.md 2.1).
 *
 * When neither the canvas nor a DOM span is available (Node without
 * JSDOM), falls back to a conservative approximation of `text.length ×
 * sizePt × 0.6 mm/char` — used only for build-time serialisation and never
 * for the actual print output.
 */
export function measureTextMm(text: string, spec: FontSpec): number {
  const key = cacheKey(text, spec);
  const cached = measurementCache.get(key);
  if (cached !== undefined) return cached;

  const width = doMeasure(text, spec);
  const padded = fontLoadingFailed ? width + MEASUREMENT_SAFETY_PAD_MM : width;
  measurementCache.set(key, padded);
  return padded;
}

function doMeasure(text: string, spec: FontSpec): number {
  const ctx = getContext2D();
  const fontCss = fontCssFor(spec);
  if (ctx) {
    ctx.font = fontCss;
    const w = ctx.measureText(text).width;
    if (Number.isFinite(w)) return w * MM_PER_CSS_PX;
  }
  const dom = measureViaDom(text, fontCss);
  if (dom !== null && Number.isFinite(dom)) return dom * MM_PER_CSS_PX;
  // Ultimate fallback: crude approximation. Used only when neither canvas
  // nor DOM is available (e.g. Node without JSDOM) — this is never the
  // path a browser print takes.
  return text.length * spec.sizePt * 0.5 * MM_PER_CSS_PX;
}

function fontCssFor(spec: FontSpec): string {
  const style = spec.italic ? "italic " : "";
  const familyList = /[\s"']/.test(spec.family)
    ? `"${spec.family.replace(/"/g, "'")}", ${FALLBACK_STACK}`
    : `${spec.family}, ${FALLBACK_STACK}`;
  return `${style}${spec.weightCss} ${spec.sizePt}pt ${familyList}`;
}

function measureViaDom(text: string, fontCss: string): number | null {
  if (typeof document === "undefined") return null;
  try {
    const span = document.createElement("span");
    span.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${fontCss};left:-9999px;top:-9999px`;
    span.textContent = text;
    document.body.appendChild(span);
    const w = span.getBoundingClientRect().width;
    document.body.removeChild(span);
    return w;
  } catch {
    return null;
  }
}

// ─── Task 6 & 10: greedyWrap + hardSplit ──────────────────────────────────

export type WrapOpts = {
  /**
   * When true, single words wider than `safeWmm` are split on grapheme
   * boundaries via `hardSplit` so no glyph is ever clipped. When false,
   * such tokens emit as their own line at their natural width — the
   * caller (typically `fitText`) then shrinks the point size and retries.
   */
  hardBreak?: boolean;
};

/**
 * Wrap `text` at word boundaries so every returned line's width ≤ `safeWmm`,
 * except when a single unbreakable token exceeds `safeWmm` — behaviour then
 * depends on `opts.hardBreak`.
 *
 * The wrap is greedy: successive words are appended to the current line
 * until the next word would exceed the limit, then the current line is
 * flushed and the next word starts a fresh line. Single spaces separate
 * words within a line.
 */
export function greedyWrap(
  text: string,
  spec: FontSpec,
  safeWmm: number,
  opts: WrapOpts = {},
): FitLine[] {
  if (text === "") return [{ text: "", widthMm: 0 }];

  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [{ text: "", widthMm: 0 }];

  const lines: FitLine[] = [];
  let current = "";
  let currentWidth = 0;

  for (const word of words) {
    const candidate = current === "" ? word : current + " " + word;
    const candidateWidth = measureTextMm(candidate, spec);

    if (candidateWidth <= safeWmm) {
      current = candidate;
      currentWidth = candidateWidth;
      continue;
    }

    // Flush current line before dealing with the over-wide word.
    if (current !== "") {
      lines.push({ text: current, widthMm: currentWidth });
      current = "";
      currentWidth = 0;
    }

    const wordWidth = measureTextMm(word, spec);
    if (wordWidth > safeWmm) {
      // Unbreakable token wider than the safe area.
      if (opts.hardBreak) {
        for (const seg of hardSplit(word, spec, safeWmm)) lines.push(seg);
      } else {
        lines.push({ text: word, widthMm: wordWidth });
      }
      current = "";
      currentWidth = 0;
    } else {
      current = word;
      currentWidth = wordWidth;
    }
  }

  if (current !== "") lines.push({ text: current, widthMm: currentWidth });
  return lines;
}

/**
 * Split `word` on grapheme-cluster boundaries so every returned segment's
 * width is ≤ `safeWmm`. Uses `Intl.Segmenter("und", { granularity:
 * "grapheme" })` when available so combining marks (`e\u0301`), emoji
 * sequences (`🇺🇸`), and ZWJ joiners stay whole; falls back to code-point
 * boundaries otherwise.
 *
 * Never emits a segment that ends inside a grapheme cluster — that is the
 * correctness property `Property 8` in tasks.md.
 */
export function hardSplit(word: string, spec: FontSpec, safeWmm: number): FitLine[] {
  const graphemes = graphemesOf(word);
  if (graphemes.length === 0) return [{ text: "", widthMm: 0 }];

  const lines: FitLine[] = [];
  let current = "";
  let currentWidth = 0;

  for (const g of graphemes) {
    const candidate = current + g;
    const candidateWidth = measureTextMm(candidate, spec);
    if (candidateWidth <= safeWmm) {
      current = candidate;
      currentWidth = candidateWidth;
      continue;
    }
    if (current !== "") {
      lines.push({ text: current, widthMm: currentWidth });
    }
    // Even one grapheme may exceed safeWmm (unlikely but possible on a
    // dense CJK character at a very small safeWmm). Emit it on its own
    // line so the caller can surface the overflow — never split inside a
    // grapheme.
    current = g;
    currentWidth = measureTextMm(g, spec);
  }

  if (current !== "") lines.push({ text: current, widthMm: currentWidth });
  return lines;
}

/**
 * Split a string into grapheme clusters. Uses `Intl.Segmenter` when
 * available so all cluster-preserving cases from bugfix.md 2.1 (combining
 * marks, ZWJ emoji, flag sequences) work correctly. Falls back to code-
 * point boundaries — which is imperfect for combining marks but
 * deterministic and safe as a last resort.
 */
function graphemesOf(s: string): string[] {
  const g = (globalThis as unknown as { Intl?: { Segmenter?: unknown } }).Intl;
  const Seg = g?.Segmenter as
    | (new (locale: string, opts: { granularity: string }) => {
        segment(s: string): Iterable<{ segment: string }>;
      })
    | undefined;
  if (typeof Seg === "function") {
    const it = new Seg("und", { granularity: "grapheme" }).segment(s);
    const out: string[] = [];
    for (const { segment } of it) out.push(segment);
    return out;
  }
  return Array.from(s);
}

// ─── Task 7: fitText ──────────────────────────────────────────────────────

/**
 * Fit `text` into a rectangle of `safeWmm × maxHeightMm` at font `spec`,
 * shrinking the point size progressively toward `floorPt` when needed.
 *
 * Algorithm:
 *   1. Fast path — if the whole string fits on one line at the requested
 *      point size AND the resulting height is within budget, return the
 *      FontSpec unchanged. This preserves requirement 3.1 (short-fit
 *      inputs render byte-identically).
 *   2. Slow path — starting at the requested point size, greedy-wrap;
 *      shrink by `SHRINK_STEP_PT` (0.5 pt) and retry until every line
 *      width ≤ `safeWmm` AND total height ≤ `maxHeightMm`, or the point
 *      size reaches `floorPt`.
 *   3. At floor — if wrap alone still overflows, invoke `greedyWrap` with
 *      `hardBreak = true` so unbreakable tokens are split on grapheme
 *      boundaries and set `overflow = true` on the result so the dialog
 *      can surface a warning (bugfix.md 2.4).
 */
export function fitText(
  text: string,
  spec: FontSpec,
  safeWmm: number,
  maxHeightMm: number,
  floorPt: number,
): FitResult {
  // Fast path.
  const singleLineW = measureTextMm(text, spec);
  const singleLineH = spec.sizePt * LINE_HEIGHT_MM_PER_PT;
  if (singleLineW <= safeWmm && singleLineH <= maxHeightMm) {
    return {
      sizePt: spec.sizePt,
      lines: [{ text, widthMm: singleLineW }],
      heightMm: singleLineH,
      atFloor: spec.sizePt === floorPt,
      overflow: false,
    };
  }

  // Slow path — shrink progressively toward the floor.
  let pt = spec.sizePt;
  while (pt >= floorPt) {
    const attemptSpec: FontSpec = { ...spec, sizePt: pt };
    const lines = greedyWrap(text, attemptSpec, safeWmm, { hardBreak: false });
    const height = lines.length * pt * LINE_HEIGHT_MM_PER_PT;
    const everyLineFits = lines.every((l) => l.widthMm <= safeWmm);
    if (everyLineFits && height <= maxHeightMm) {
      return {
        sizePt: pt,
        lines,
        heightMm: height,
        atFloor: pt === floorPt,
        overflow: false,
      };
    }
    if (pt === floorPt) break;
    pt = Math.max(floorPt, roundPt(pt - SHRINK_STEP_PT));
  }

  // At floor and still overflowing — hard-break to guarantee no clip.
  const floorSpec: FontSpec = { ...spec, sizePt: floorPt };
  const hardLines = greedyWrap(text, floorSpec, safeWmm, { hardBreak: true });
  const hardHeight = hardLines.length * floorPt * LINE_HEIGHT_MM_PER_PT;
  return {
    sizePt: floorPt,
    lines: hardLines,
    heightMm: hardHeight,
    atFloor: true,
    overflow: true,
  };
}

/**
 * Round a point size to the nearest `SHRINK_STEP_PT` grid multiple so the
 * shrink loop cannot drift between iterations due to floating-point error.
 */
function roundPt(pt: number): number {
  return Math.round(pt / SHRINK_STEP_PT) * SHRINK_STEP_PT;
}

// ─── Task 8: allocateHeightBudget ─────────────────────────────────────────

/** One role's contribution to the height budget. */
export type RoleRequest = {
  role: Role;
  /** Number of currently-planned rendered lines. Callers usually start with 1. */
  lines: number;
  /** Requested point size in pt. */
  requestedPt: number;
  /** Role-specific floor. Defaults to `FLOOR_PT_BY_ROLE[role]`. */
  floorPt?: number;
};

/** Resolved per-role budget returned by `allocateHeightBudget`. */
export type RoleBudget = {
  role: Role;
  /** Final point size after any priority-based shrink. */
  sizePt: number;
  /** Max height in mm allocated to this role's laid-out block. */
  maxHeightMm: number;
  /** True when the role was shrunk down to its floor. */
  atFloor: boolean;
};

export type HeightBudget = {
  roles: RoleBudget[];
  qrMm: number;
  bannerMm: number;
  /** True when the banner had to be hidden to make room for the text stack. */
  bannerHidden: boolean;
  /** Sum of role heights + qr + banner + padding, in mm. */
  contentHeightMm: number;
  /** True when even at every role's floor, the stack still exceeds safeH. */
  overflow: boolean;
};

/**
 * Priority order in which roles yield point size when the vertical budget
 * is tight, from first-to-shrink to last. `name` is the last text role to
 * shrink because it is the primary information on the badge.
 *
 * Requirement: bugfix.md 2.6.
 */
const SHRINK_ORDER: readonly Role[] = ["eventDate", "meta", "org", "event", "ticket", "title", "customText", "company", "name"];

/**
 * Allocate the vertical space of a badge among its roles + fixed elements.
 *
 * @param safeHMm - Total safe area height (label height minus 2×MIN_PAD_MM).
 * @param roles - Requested role budgets, in visual order top-to-bottom.
 * @param qrMm - Requested QR side length. Post-clamped to `≥ QR_MIN_MM`.
 * @param bannerMm - Requested banner height. May shrink to 10mm or hide.
 * @param verticalGapsMm - Sum of inter-block gaps (dividers, padding).
 */
export function allocateHeightBudget(
  safeHMm: number,
  roles: readonly RoleRequest[],
  qrMm: number,
  bannerMm: number,
  verticalGapsMm: number,
): HeightBudget {
  const clampedQr = Math.max(qrMm, QR_MIN_MM);
  const working: MutableRoleBudget[] = roles.map((r) => ({
    role: r.role,
    lines: Math.max(1, r.lines),
    sizePt: r.requestedPt,
    floorPt: r.floorPt ?? (FLOOR_PT_BY_ROLE[r.role] ?? 6),
    atFloor: (r.floorPt ?? FLOOR_PT_BY_ROLE[r.role] ?? 6) === r.requestedPt,
  }));

  let bannerCurrent = bannerMm;
  let bannerHidden = false;

  const totalRoleHeight = () =>
    working.reduce((acc, r) => acc + r.lines * r.sizePt * LINE_HEIGHT_MM_PER_PT, 0);

  // Step 1: try requested sizes as-is.
  let contentHeight = totalRoleHeight() + clampedQr + bannerCurrent + verticalGapsMm;
  if (contentHeight <= safeHMm) return finalise();

  // Step 2: shrink roles in priority order.
  const priorityIter = () => {
    for (const role of SHRINK_ORDER) {
      const r = working.find((w) => w.role === role);
      if (r && r.sizePt > r.floorPt) return r;
    }
    return undefined;
  };

  let guard = 2000; // hard cap on iterations to guarantee termination
  while (contentHeight > safeHMm && guard-- > 0) {
    const target = priorityIter();
    if (!target) break;
    target.sizePt = Math.max(target.floorPt, roundPt(target.sizePt - SHRINK_STEP_PT));
    if (target.sizePt === target.floorPt) target.atFloor = true;
    contentHeight = totalRoleHeight() + clampedQr + bannerCurrent + verticalGapsMm;
  }

  if (contentHeight <= safeHMm) return finalise();

  // Step 3: shrink the banner in 2mm steps down to 10mm.
  while (contentHeight > safeHMm && bannerCurrent > 10) {
    bannerCurrent = Math.max(10, bannerCurrent - 2);
    contentHeight = totalRoleHeight() + clampedQr + bannerCurrent + verticalGapsMm;
  }

  // Step 4: hide the banner entirely.
  if (contentHeight > safeHMm && bannerCurrent > 0) {
    bannerCurrent = 0;
    bannerHidden = true;
    contentHeight = totalRoleHeight() + clampedQr + bannerCurrent + verticalGapsMm;
  }

  return finalise();

  function finalise(): HeightBudget {
    return {
      roles: working.map((r) => ({
        role: r.role,
        sizePt: r.sizePt,
        maxHeightMm: r.lines * r.sizePt * LINE_HEIGHT_MM_PER_PT,
        atFloor: r.atFloor,
      })),
      qrMm: clampedQr,
      bannerMm: bannerCurrent,
      bannerHidden,
      contentHeightMm: contentHeight,
      overflow: contentHeight > safeHMm,
    };
  }
}

type MutableRoleBudget = {
  role: Role;
  lines: number;
  sizePt: number;
  floorPt: number;
  atFloor: boolean;
};

// ─── Task 9: computeCenteringPadding ──────────────────────────────────────

export type CenteringPadding = {
  topMm: number;
  botMm: number;
  leftMm: number;
  rightMm: number;
};

/**
 * Compute the top/bottom/left/right padding, in millimeters, that centers
 * a content block of height `contentHeightMm` within a safe area of height
 * `safeHMm`. Optional `thermalOffset` shifts the entire content down and
 * right to compensate for the printer's hardware unprintable margin
 * (bugfix.md 2.11).
 *
 * Correctness properties (verified by PBT — Property 7):
 *   - `topMm + botMm` is exact-invariant to the split when `thermalOffset`
 *     is zero.
 *   - `topMm - botMm === 2 × thermalOffset.topMm` — the offset shifts
 *     content by the printer's hardware margin without altering the sum.
 *   - Deterministic for any input.
 */
export function computeCenteringPadding(
  safeHMm: number,
  contentHeightMm: number,
  basePadMm: number,
  thermalOffset: { topMm: number; leftMm: number } = { topMm: 0, leftMm: 0 },
): CenteringPadding {
  const slack = Math.max(0, safeHMm - contentHeightMm);
  const half = slack / 2;
  const topMm = Math.max(0, basePadMm + half + thermalOffset.topMm);
  const botMm = Math.max(0, basePadMm + half - thermalOffset.topMm);
  const leftMm = Math.max(0, basePadMm + thermalOffset.leftMm);
  const rightMm = Math.max(0, basePadMm - thermalOffset.leftMm);
  return { topMm, botMm, leftMm, rightMm };
}

// ─── Task 11: ensureFontsLoaded ───────────────────────────────────────────

export type FontLoadTuple = {
  family: string;
  weightCss: number;
  italic: boolean;
  sizePt: number;
};

/**
 * Ensure the font families in `tuples` are loaded in the parent document
 * before `measureTextMm` is called. Idempotent — repeated invocations with
 * the same URL emit exactly one `<link>` in `document.head`. Waits for
 * every requested `(family, weightCss, italic, sizePt)` to resolve via
 * `document.fonts.load` and then for `document.fonts.ready`.
 *
 * On any font-load rejection, sets an internal flag that causes
 * `measureTextMm` to add `MEASUREMENT_SAFETY_PAD_MM` to every subsequent
 * result — biasing the fit engine toward earlier wrapping so a fallback-
 * font under-measurement can never lead to a clipped print (bugfix.md
 * 2.1). Returns `true` when every font loaded successfully; `false` when
 * any failed. Never throws.
 */
export async function ensureFontsLoaded(
  tuples: readonly FontLoadTuple[],
  googleFontsUrl?: string,
): Promise<boolean> {
  if (typeof document === "undefined") return false;

  // Idempotent <link> injection.
  if (googleFontsUrl && !loadedFontUrls.has(googleFontsUrl)) {
    try {
      const head = document.head;
      if (head) {
        const existing = head.querySelector(`link[href="${cssEscapeAttr(googleFontsUrl)}"]`);
        if (!existing) {
          const link = document.createElement("link");
          link.rel = "stylesheet";
          link.href = googleFontsUrl;
          head.appendChild(link);
        }
        loadedFontUrls.add(googleFontsUrl);
      }
    } catch {
      // Ignore link-injection errors — the tuples.load() calls below will
      // still resolve if the font is already present via another route.
    }
  }

  const fonts = (document as unknown as { fonts?: FontFaceSet }).fonts;
  if (!fonts) {
    fontLoadingFailed = true;
    return false;
  }

  try {
    // Clear the cache before measuring — sizes measured against a fallback
    // font before load must not stick around after load resolves.
    measurementCache.clear();
    await Promise.all(
      tuples.map((t) =>
        fonts.load(
          `${t.italic ? "italic " : ""}${t.weightCss} ${t.sizePt}pt "${t.family}"`,
        ),
      ),
    );
    await fonts.ready;
    fontLoadingFailed = false;
    return true;
  } catch {
    fontLoadingFailed = true;
    return false;
  }
}

interface FontFaceSet {
  load(spec: string): Promise<unknown>;
  ready: Promise<unknown>;
}

function cssEscapeAttr(s: string): string {
  return s.replace(/"/g, '\\"');
}

// ─── Internal utilities (exposed to tests only) ───────────────────────────

/** Test-only helper: force the font-loading flag. */
export function __setFontLoadingFailedForTesting(v: boolean): void {
  fontLoadingFailed = v;
  measurementCache.clear();
}

/** Test-only helper: check the font-loading flag. */
export function __getFontLoadingFailedForTesting(): boolean {
  return fontLoadingFailed;
}
