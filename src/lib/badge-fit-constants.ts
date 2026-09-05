/**
 * Named constants for the badge auto-fit engine.
 *
 * Every value here is referenced from `.kiro/specs/thermal-badge-centering/design.md`
 * (§Named Constants) and cited by the bugfix requirements (bugfix.md §Bug
 * Analysis). Values are chosen against the existing behaviour of
 * `src/lib/print-badges.ts` so short-fit inputs land in the fast path
 * unchanged, preserving requirement 3.1.
 *
 * All constants are exported individually so `badge-fit-constants.test.ts`
 * can pin each value with a drift-guard assertion.
 */

/**
 * Minimum safe padding, in millimeters, maintained on every edge of every
 * label. Matches the `padMm = clamp(2.5, dims.w * 0.05, 6)` floor in
 * `renderDefaultBadge`, so a badge that already fit within 2.5 mm of the
 * edge renders byte-identically after the fix.
 *
 * Requirement: bugfix.md 2.5.
 */
export const MIN_PAD_MM = 2.5;

/**
 * Minimum QR side length in millimeters. Below this a phone camera at
 * typical scan distance cannot reliably decode the modules — the historical
 * `qrMm = clamp(14, ...)` floor in `renderDefaultBadge` is preserved.
 *
 * Requirement: bugfix.md 2.7.
 */
export const QR_MIN_MM = 14;

/**
 * Tolerance for optical centering, in millimeters. Half a millimeter is
 * well below the 8-dot pitch of a 203-DPI print head (~0.125 mm per dot,
 * ~1 mm across the 8-dot alignment grid many labels use), so this tolerance
 * is printer-limited rather than compute-limited — the layout math itself
 * splits slack exactly in half.
 *
 * Requirement: bugfix.md 2.6.
 */
export const CENTER_TOLERANCE_MM = 0.5;

/**
 * Step by which `fitText` progressively reduces a role's point size when
 * word-boundary wrap alone cannot fit the value. 0.5 pt is small enough to
 * avoid visible size jumps between similar-length strings but coarse
 * enough to keep iteration bounded: the loop terminates in at most
 * `(startPt - floorPt) / SHRINK_STEP_PT + 1` steps.
 *
 * Requirement: bugfix.md 2.3, 2.10.
 */
export const SHRINK_STEP_PT = 0.5;

/**
 * Safety padding, in millimeters, added to every measured width when font
 * loading failed and measurement fell back to the system stack. Biases the
 * fit engine toward earlier wrapping so a fallback-font measurement that
 * under-estimates the real width cannot produce a clipped print.
 *
 * Requirement: bugfix.md 2.1 (never clip).
 */
export const MEASUREMENT_SAFETY_PAD_MM = 1.0;

/**
 * Line height in millimeters per point. Matches the existing
 * `line-height: 1.1` declared on `.card.basic .name` and the default
 * line height on every other text role in `print-badges.ts`.
 *
 * `1.1 * (25.4 / 72)` = 1.1 CSS line units, converted from pt to mm using
 * the printers-point (72 pt = 1 inch) definition browsers use for `font-size:Xpt`.
 */
export const LINE_HEIGHT_MM_PER_PT = 1.1 * (25.4 / 72);

/**
 * Conversion factor from CSS pixels to millimeters. CSS `1px` is defined as
 * `1/96` of an inch — a constant that does not vary by device or DPI —
 * so canvas `measureText().width` (returned in CSS pixels) multiplied by
 * this constant gives an exact millimeter value.
 */
export const MM_PER_CSS_PX = 25.4 / 96;

/**
 * Legibility floor, in points, per role.
 *
 * - `name`, `nameLabel` — 8 pt matches the "readable but small" label in
 *   `buildCalibrationHtml` and is the smallest size at which a badge name
 *   remains scannable from arm's length on a thermal print.
 * - All secondary roles — 6 pt is the industry minimum for machine-readable
 *   thermal print at 203 DPI (below this individual glyph strokes are
 *   narrower than one printer dot and can drop out).
 *
 * Requirement: bugfix.md 2.3.
 */
export const FLOOR_PT_BY_ROLE: Readonly<Record<string, number>> = Object.freeze({
  name: 8,
  nameLabel: 8,
  company: 6,
  companyLabel: 6,
  title: 6,
  event: 6,
  org: 6,
  meta: 6,
  ticket: 6,
  eventDate: 6,
  customText: 6,
});
