# Thermal Badge Centering Bugfix Design

## Overview

`buildPrintHtml` and its render helpers in `src/lib/print-badges.ts` size every text
value from label geometry alone. `renderDefaultBadge` computes each role's point size
with `clamp(lo, dims.h × factor, hi)`; `renderName` derives `namePt` from a design-preset
multiplier applied to a base 18 pt; `renderDesignedFace` calls `renderTextElement`, which
emits absolutely-positioned `<div>`s with no width constraint. In none of these paths
does the code look at the string itself. The rendered value's natural width at the
chosen point size is then written into an HTML document whose card element has
`overflow:hidden`, so any surplus is silently cut at the label edge. That is the
bug condition `isBugCondition` in **bugfix.md §Bug Analysis** captures — either
`naturalWidthMm(t.text, t.fontSpec) > safeW` or the laid-out block exceeds `safeH`.

The fix introduces a small, pure "fit engine" that runs synchronously inside
`buildPrintHtml`, in the parent document, after the design's Google Fonts have
resolved. For every text value the engine measures the string, wraps it at word
boundaries, and, if that is insufficient, progressively shrinks the point size
toward a per-role legibility floor. Height budget is allocated top-down; QR side
length is a hard floor. After the fit runs, the badge's vertical padding is
recomputed so the content block is centered within the safe area to within
`CENTER_TOLERANCE_MM`. Thermal hardware-margin compensation (**bugfix.md 2.11**)
is layered on top as a small per-printer offset persisted with the other
`lovable.print-badges.v2` preferences and applied only in thermal mode. Because
the fit decisions are baked into the returned HTML string, the preview iframe
in `PrintBadgesDialog` renders exactly what the printer will render
(**bugfix.md 2.9**).

## Glossary

- **Bug_Condition (C)** — as defined in **bugfix.md §Bug Analysis**: a print job in which any
  text's natural width exceeds `safeW = dims.w − 2×MIN_PAD_MM`, the laid-out content exceeds
  `safeH = dims.h − 2×MIN_PAD_MM`, or (secondary) a thermal label whose content block is not
  optically centered.
- **Property (P)** — the layout produced by the fixed function `F'` satisfies:
  `clippedGlyphs = 0`, every block is within the safe area, every text is at or above its
  role floor, `qr.sideMm ≥ QR_MIN_MM`, `|topGapMm − bottomGapMm| ≤ CENTER_TOLERANCE_MM`,
  and `F'` is deterministic.
- **Preservation** — for any `X` with `¬C(X)` the fixed function produces byte-identical
  HTML to today's function. **bugfix.md 3.1** makes this a hard clause: short names that
  already fit MUST NOT change point size, wrap point, gap, or block position.
- **Safe area** — the axis-aligned rectangle inset by `MIN_PAD_MM = 2.5 mm` from all four
  label edges. Text and QR are laid out inside this box (**bugfix.md 2.5**).
- **Fit engine** — the new pure-function module (`src/lib/fit-engine.ts`) that owns
  measurement, wrapping, shrinking, height budgeting, and centering math. It has no
  side effects and no I/O beyond the browser's `CanvasRenderingContext2D`.
- **FontSpec** — the tuple `{ family, weightCss, italic, sizePt }` used to seed
  `Canvas.measureText`. Two FontSpecs that differ in `sizePt` alone scale linearly, so
  measurement can be cached per family/weight/italic.
- **Role** — a labelled text slot in the badge template (`name`, `company`, `title`,
  `event`, `org`, `meta`, `ticket`, `customText`, plus the name-only `nameLabel` /
  `companyLabel`). Each role has a legibility floor (`FLOOR_PT_BY_ROLE`).
- **Line** — a run of text produced by the wrap step. `{ text: string, widthMm: number }`.
- **FitResult** — `{ sizePt, lines[], heightMm, atFloor, overflow }`. The last two flags
  drive the warning surface for **bugfix.md 2.4**.
- **thermalOffset** — a persisted per-browser `{ topMm, leftMm }` measured from a
  calibration print. Applied only when `thermalMode || isThermalSize`.

## Bug Details

### Bug Condition

Bug manifests whenever the natural rendered width of any text value at its resolved
point size exceeds the safe content width, or the laid-out content stack exceeds the
safe content height, or (secondary) a thermal label's content is not optically centered.
This is exactly the formal condition in **bugfix.md §Bug Analysis**; it is reproduced
here as executable pseudocode against the same input shape.

**Formal Specification:**
```
FUNCTION isBugCondition(X)
  INPUT:  X of type PrintJob = { size, dims, texts[], qrSpec, mode, design }
  OUTPUT: boolean

  safeW ← X.dims.w − 2 × MIN_PAD_MM
  safeH ← X.dims.h − 2 × MIN_PAD_MM

  // Primary — horizontal overflow of any rendered value
  FOR EACH t IN X.texts DO
    IF naturalWidthMm(t.text, t.fontSpec) > safeW THEN RETURN true
  END FOR

  // Primary — vertical overflow of the laid-out content block
  IF contentHeightMm(X) > safeH THEN RETURN true

  // Secondary — thermal label whose content block is not optically centered
  IF isThermal(X.size) AND NOT isOpticallyCentered(X) THEN RETURN true

  RETURN false
END FUNCTION
```

### Examples

- **Long name — thermal-58 (58×80mm)**: `"Aakarshan Singh Chadha"` rendered by
  `renderDefaultBadge`. `baseNamePt = clamp(11, 80 × 0.14, 26) = 11.2 pt`; effective
  `namePt = 11.2 × (22/22) = 11.2 pt`. Natural width of the string at 11.2 pt Poppins-800
  is ~62 mm; safe width is `58 − 2×2.9 = 52.2 mm`. Physical output: name is emitted on
  a single line and clipped at the label edge with no visible side margin.
- **Long company — same label**: `"Infomerics Valuations and Ratings"` at 12 pt
  (`renderName`, `companyPt = 12`) has natural width ~55 mm — the trailing `"s"` is
  cut off, matching the reported photo.
- **Custom designer face**: `renderTextElement` emits
  `<div class="el text" style="left:50%;top:42%;...">` with no width. Content extends
  symmetrically past both card edges under `translate(-50%, -50%)`, then
  `.card { overflow:hidden }` clips both sides mid-glyph.
- **Edge case — height overflow on thermal-50**: enabling `eventTitle`, `orgName`,
  `eventDate`, name and QR pushes the content stack taller than 80 − 5 = 75 mm.
  Because `.body` uses `justify-content:flex-start` and the divider grabs the
  slack via `margin:auto 0`, the surplus falls off the bottom — the QR is the
  first thing to leave the label.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Short names/values that already fit at their configured point size render byte-for-byte
  as today (**bugfix.md 3.1**). The fit engine detects the fast-path (`¬C(X)`) via a
  single width comparison per role and returns the original FontSpec unchanged.
- Non-thermal sheet behavior — page, grid, columns, gaps, page margins for `a6`,
  `a4-2up`, `avery-3x8` (**bugfix.md 3.2**) is not touched. The fit engine consumes
  `dims`, not `size`, and does not read `SHEET_CSS`.
- The calibration sheet (`buildCalibrationHtml`) is not routed through the fit engine
  (**bugfix.md 3.3**).
- QR pixel size derived from `qrPixelSizeForMm(mm, thermalDpi)` continues to match the
  head DPI (**bugfix.md 3.4**). The fit engine only ever changes the mm side length
  subject to the `QR_MIN_MM` floor; when it does, the pixel target is recomputed from
  the same formula.
- Thermal background strip and forced black-and-white CSS block at the end of the
  style sheet in `buildPrintHtml` is preserved verbatim (**bugfix.md 3.5**).
- Every `FontStyle` override from `PrintBadgesDialog` (family, weight, italic,
  underline, strikethrough, color, alignment, word spacing, horizontal scale) remains
  authoritative (**bugfix.md 3.6**). Auto-fit changes `sizePt` and wrap points only.
- Designer element anchors (`x`, `y` percentages) are preserved as-is
  (**bugfix.md 3.7**). Only element widths and their internal wrap/shrink change.
- Multi-copy expansion (`copies` loop in `buildPrintHtml`) and per-card page-break
  CSS (`.card:not(:last-child){page-break-after:always}`) are unchanged
  (**bugfix.md 3.8**).
- Name-only design presets (`NAME_DESIGNS` in `badge-design.ts`) — accent bands,
  monogram initial, ticket-stub divider, event-card header — keep their existing
  layout templates (**bugfix.md 3.9**). Only the point sizes and wrap points inside
  each template are subject to fit.

**Scope:**
Any print job where `isBugCondition` returns `false` MUST emit the same HTML the current
implementation emits. This is enforced by unit tests that snapshot `buildPrintHtml` for
the "Jane Doe / Acme Inc." baseline on every preset size and mode.

## Hypothesized Root Cause

The root cause is a specific interaction between two forces in the current
`buildPrintHtml` output; neither is a bug in isolation, but their composition is.

**1. Point size is chosen without measuring the string.**
`renderDefaultBadge` computes:

```ts
const baseNamePt = clamp(11, dims.h * 0.14, 26);
const namePt = fontOverride?.sizePt
  ? clamp(8, baseNamePt * (fontOverride.sizePt / 22), 48)
  : baseNamePt;
```

`renderName` computes:

```ts
const basePt = fontOverride?.sizePt ?? Math.round(18 * fontSizeMultiplier);
const namePt = basePt;
const companyPt = fontOverride?.companySizePt ?? Math.round(namePt * 0.55);
```

`renderTextElement` writes `el.size` (a designer-configured pt) straight into
`font-size:${el.size}pt`. In every path the point size is a function of geometry
and user preference, never of the text. This is defect clause **bugfix.md 1.1**.

**2. `word-break:break-word` on `.card.basic .name` cannot fire because the flex
column layout never gives the `.name` div a bounded width.**

The `.card.basic` CSS on **print-badges.ts:~207** declares:

```
.card.basic{display:flex;flex-direction:column;align-items:stretch;...}
.card.basic .body{flex:1;display:flex;flex-direction:column;align-items:center;
                  justify-content:flex-start;min-height:0}
.card.basic .name{font-weight:800;color:#0f172a;line-height:1.1;
                  word-break:break-word;letter-spacing:-0.01em}
```

`.body` sits inside `.card.basic` (which itself is `align-items:stretch`, so `.body`
gets the card's full width). But `.body` then sets `align-items:center` for its own
column children. In CSS flexbox, `align-items` controls cross-axis placement of each
flex item. When the item's cross-axis value is `auto` — which it is for every
`<div>` inside `.body` (no explicit width) — the resolved cross-axis size is the
item's **hypothetical content width**, not the flex line width. `align-items:center`
places that content-width box at the horizontal center of the flex line; it does
**not** stretch it.

So `.name` is a flex item whose width equals the natural width of the rendered
string. `word-break:break-word` only triggers when the content box is narrower than
the content, and here the content box is *defined by* the content. There is
nothing narrower than the line, so no line-break opportunity is ever taken.

The visible symptom: a long name renders as a single line whose width exceeds the
card. `.card { overflow:hidden }` (**print-badges.ts:~184**) then clips the surplus
at each edge symmetrically — because `align-items:center` centers the wider box on
the card's center — matching the reported "edge-to-edge, no side padding" photo.

The name-only path (`renderName`) has the same shape: `.card.name-only { display:flex;
flex-direction:column; align-items:center; padding:6mm; text-align:center }` — the
child `<div>`s wrapping the name and company lines are content-width flex items and
never encounter a wrap constraint.

The designer face (`renderDesignedFace` → `renderTextElement`) has an even more
direct instance of the same class of bug: `.card .el { position:absolute;
transform:translate(-50%,-50%) }` with no width means each `<div>` is an
absolutely-positioned box that auto-sizes to its content. A long name centered on
`left:50%` extends symmetrically past both card edges and is then clipped by
`.card { overflow:hidden }`. This is defect clause **bugfix.md 1.6**.

**3. Vertical stack has an elastic divider that swallows overflow silently.**
`.card.basic .divider { width:60%; height:1px; background:#e2e8f0; margin:auto 0 }`
uses `margin:auto` on the block axis to eat all slack space between the meta line
above and the name below. When wrapping (which does not happen today) or a long
event title (which does render across multiple lines because `.event` has
`word-break:break-word` and the pattern is different — `.event` is *not* subject
to the same flex-item-width issue when it wraps at a Unicode word boundary and
the resulting lines each fit within the card width because CSS ignores the flex
sizing rule once the browser can honor a wrap opportunity) increases content
height, the divider collapses toward zero and content packs against the bottom;
if content still exceeds `safeH`, the QR wrap is pushed past the bottom edge.
This is defect clauses **bugfix.md 1.4** and **1.5**.

**4. No CSS padding enforces `MIN_PAD_MM` on all four edges in the designer face.**
`renderDesignedFace` renders elements as `position:absolute` on top of a `.card`
that has no inner padding. If the user places an element at `y:2%`, the top of
its centered box is at `2% × dims.h − 0.5 × height`, which for a 14 pt line on a
80 mm card can literally sit on the top edge. This is defect clause **bugfix.md 1.3**.

**5. Thermal hardware margin is not compensated.**
Thermal printer heads have small unprintable strips (typically 1–2 mm on one or
two sides) that the browser has no visibility into. `buildPrintHtml`'s full-bleed
mode adds `display:flex; align-items:center; justify-content:center` on `body`
(to center within a printer-substituted page), but that centering does not know
which specific side has the unprintable strip, so on some printers content is
pushed off-center and backing-paper is visible at the label edge. This is
defect clauses **bugfix.md 1.9** and **1.10**.

## Correctness Properties

Property 1: Bug Condition — Auto-fit prevents clipping and centers correctly

_For any_ print job `X` where the bug condition holds (`isBugCondition(X)` returns
true), the fixed `buildPrintHtml` SHALL produce HTML whose rendered layout satisfies:
every glyph of every text value renders inside the safe area with no clipping, every
text is at or above its role legibility floor, the QR side length is at least
`QR_MIN_MM`, and — for thermal sizes and full-bleed custom sizes — the top and
bottom gaps between the safe area and the content stack are equal within
`CENTER_TOLERANCE_MM`. The layout is deterministic: the same `(badges, opts)` input
produces the identical HTML string byte-for-byte.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.10, 2.11**

Property 2: Preservation — Fitting values are untouched

_For any_ print job `X` where the bug condition does NOT hold
(`isBugCondition(X)` returns false), the fixed `buildPrintHtml` SHALL produce
HTML byte-identical to the current implementation. No point size, wrap point,
inter-block gap, block position, page CSS, sheet CSS, thermal mode CSS,
calibration HTML, QR pixel count, font-override handling, designer-element
anchor position, copies-expansion output, or name-only preset template shall
change on inputs that already fit.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9**

## Fix Implementation

### Architecture

A new pure module `src/lib/fit-engine.ts` owns all measurement and layout math.
`print-badges.ts` becomes the glue that (1) resolves FontSpecs from `PrintOptions`
and design defaults, (2) calls the fit engine for every rendered role, (3) serializes
the resulting `FitResult` into the same HTML shape the file emits today. The
existing render helpers keep their names and public shape:

- `buildPrintHtml(badges, opts)` — signature changes from
  `Promise<string>` to `Promise<{ html: string; warnings: FitWarning[] }>`.
  All existing call sites (`printBadges`, `PrintBadgesDialog.refreshPreview`) are
  updated to destructure `html`. Backward compatibility: `printBadges` continues
  to accept the same `(badges, opts)` and returns `void`.
- `renderDefaultBadge` — instead of clamp-only point sizes, it now:
  1. Computes `safeW`, `safeH`, and the height budget for each role via
     `allocateHeightBudget`.
  2. For each text role (`org`, `event`, `meta`, `name`), calls `fitText` with
     the resolved FontSpec, `safeW`, and the role's height slice.
  3. Composes lines with `<br/>` between them (never with un-measurable `<span>`s
     inside a wrapping `<div>`) so the rendered widths are exactly what the fit
     engine measured.
  4. After all roles fit, calls `computeCenteringPadding` and emits
     `padding-top` / `padding-bottom` on `.body` so the stack is centered.
- `renderName` — same treatment for the name line and the company line, guarded
  by the name-only preset template. Accent bands, monogram, ticket-stub layouts
  retain their existing shells; only the pt sizes inside each shell run through
  the fit engine.
- `renderDesignedFace` / `renderTextElement` — each element gets a computed
  `maxWidthMm` from the element's `x`, `align`, and the safe area; `renderTextElement`
  emits `max-width`, `white-space:normal`, `word-break:break-word`,
  `overflow-wrap:anywhere` inline, and the fit engine picks the point size and
  wrap points. Element `x`, `y` percentages are unchanged so relative positions
  are preserved (**bugfix.md 2.8**, **3.7**).
- `BadgeDesignerCanvas` — the on-screen designer currently declares
  `whiteSpace: "nowrap"` on every text element. That is removed and replaced
  with the same `maxWidth` derivation so the designer preview matches print output.

### Algorithm

**Fit engine top-level (per text role):**
```
FUNCTION fitText(text, spec, safeWmm, maxHeightMm, floorPt)
  INPUT:  text: string
          spec: FontSpec = { family, weightCss, italic, sizePt }
          safeWmm: number
          maxHeightMm: number
          floorPt: number
  OUTPUT: FitResult = { sizePt, lines, heightMm, atFloor, overflow }

  // Fast path: does the whole string fit on one line at the requested pt?
  singleLineW ← measureTextMm(text, spec)
  IF singleLineW ≤ safeWmm AND (spec.sizePt × LINE_HEIGHT_MM_PER_PT) ≤ maxHeightMm THEN
    RETURN { sizePt: spec.sizePt, lines: [{ text, widthMm: singleLineW }],
             heightMm: spec.sizePt × LINE_HEIGHT_MM_PER_PT,
             atFloor: false, overflow: false }
  END IF

  // Slow path: try progressively smaller sizes.
  pt ← spec.sizePt
  WHILE pt ≥ floorPt DO
    lines ← greedyWrap(text, { ...spec, sizePt: pt }, safeWmm)
    height ← lines.length × pt × LINE_HEIGHT_MM_PER_PT
    everyLineFits ← lines.every(l => l.widthMm ≤ safeWmm)
    IF everyLineFits AND height ≤ maxHeightMm THEN
      RETURN { sizePt: pt, lines, heightMm: height,
               atFloor: pt = floorPt, overflow: false }
    END IF
    pt ← pt − SHRINK_STEP_PT       // 0.5 pt increments
  END WHILE

  // At floor and still overflowing. Hard-break unbreakable tokens on grapheme
  // boundaries so we NEVER clip mid-glyph; mark the job as overflow so the
  // dialog can surface a warning (bugfix.md 2.4).
  lines ← greedyWrap(text, { ...spec, sizePt: floorPt }, safeWmm,
                    { hardBreak: true })
  RETURN { sizePt: floorPt, lines,
           heightMm: lines.length × floorPt × LINE_HEIGHT_MM_PER_PT,
           atFloor: true, overflow: true }
END FUNCTION
```

**Greedy wrap:**
```
FUNCTION greedyWrap(text, spec, safeWmm, opts)
  words ← text.split(/\s+/)                    // preserve original separator counts
  lines ← []
  current ← ""
  FOR EACH word IN words DO
    candidate ← current = "" ? word : current + " " + word
    IF measureTextMm(candidate, spec) ≤ safeWmm THEN
      current ← candidate
    ELSE
      IF current ≠ "" THEN lines.push({ text: current, widthMm: measureTextMm(current, spec) })
      // The single word itself may exceed safeWmm.
      IF measureTextMm(word, spec) > safeWmm THEN
        IF opts.hardBreak THEN
          // Grapheme-boundary split. Uses Intl.Segmenter when available so
          // combining marks and emoji sequences stay together.
          FOR EACH segment IN hardSplit(word, spec, safeWmm) DO
            lines.push(segment)
          END FOR
          current ← ""
        ELSE
          // Fit-at-floor caller will loop; today's iteration terminates as
          // an unbreakable overflow. Emit as its own line; caller shrinks pt.
          lines.push({ text: word, widthMm: measureTextMm(word, spec) })
          current ← ""
        END IF
      ELSE
        current ← word
      END IF
    END IF
  END FOR
  IF current ≠ "" THEN lines.push({ text: current, widthMm: measureTextMm(current, spec) })
  RETURN lines
END FUNCTION
```

**Height budget allocation (default badge):**
```
FUNCTION allocateHeightBudget(dims, roles, qrMm, bannerHeightMm, padMm)
  safeH   ← dims.h − 2 × MIN_PAD_MM
  reserved ← bannerHeightMm + qrMm + 2 × padMm × 1.1     // matches padding:padMm*1.2/padMm
  freeH    ← safeH − reserved

  // First-pass: fit every role at its requested pt; measure required height.
  // Second-pass shrinks in priority order until totalHeight ≤ freeH.
  SHRINK_ORDER ← ["eventTitle", "meta", "org", "name"]
  budgets ← empty map

  totalHeight ← sum(roleHeightAtRequestedPt(r) for r in roles)
  IF totalHeight ≤ freeH THEN
    // All roles fit at their requested pt; return unshrunken budgets.
    RETURN { role: roleHeightAtRequestedPt(role) for role in roles }
  END IF

  // Iteratively shrink the next role in priority order by SHRINK_STEP_PT
  // and re-measure; terminate when total ≤ freeH or every role is at floor.
  // QR is not in this loop — its side is a hard floor (bugfix.md 2.7).
  // If every role hits floor and we still overflow, banner shrinks in 2mm
  // steps down to 10mm, then banner is hidden. Only after all of that does
  // the job surface as `overflow:true`.
  ...

  RETURN budgets
END FUNCTION
```

**Optical centering:**
```
FUNCTION computeCenteringPadding(safeH, contentHeightMm, basePadMm, thermalOffset)
  slack ← safeH − contentHeightMm
  half  ← slack / 2                            // deterministic, always exact
  topMm ← basePadMm + half + thermalOffset.topMm
  botMm ← basePadMm + half − thermalOffset.topMm    // preserve sum for centering
  RETURN { topMm, botMm }
END FUNCTION
```

Because `slack` is split into halves that sum exactly to `safeH − contentHeightMm`
and both halves are placed as CSS `padding-top` / `padding-bottom` in millimeters,
`|topGapMm − bottomGapMm| = 0` mathematically. `CENTER_TOLERANCE_MM = 0.5 mm`
absorbs printer rounding at sub-millimeter precision.

**Measurement primitive:**
```
FUNCTION measureTextMm(text, spec)
  ctx ← sharedOffscreenCanvasContext()
  ctx.font = `${spec.italic ? "italic " : ""}${spec.weightCss} ${spec.sizePt}pt ${quote(spec.family)}, ${FALLBACK_STACK}`
  widthPx ← ctx.measureText(text).width
  RETURN widthPx × MM_PER_CSS_PX                  // 25.4/96
END FUNCTION
```

The canvas is created once per `buildPrintHtml` invocation and reused across
roles. Measurements are cached by `(family, weightCss, italic, sizePt, text)`.
Fonts must be resolved before the first measurement — see next section.

### Font Loading Prerequisite

`buildPrintHtml` currently emits a `<link>` to Google Fonts inside the returned
document. That link resolves in the popup/iframe, not in the parent document
where the fit engine runs, so `Canvas.measureText` in the parent would use
system fallback metrics — silently producing wrong answers for every font
override the user chose. Before the first measurement, `buildPrintHtml`:

1. Collects the set of `(family, weightCss, italic, sizePt)` tuples across the
   design (via `fontsUsedInDesign(design)` and the name-only preset's
   `fontFamily`/`fontWeight`, plus the `fontOverride`).
2. Injects a `<link>` into the parent document's `<head>` (idempotent, keyed
   by URL) using the existing `googleFontsUrl` helper.
3. `await Promise.all(tuples.map(t => document.fonts.load(...)))`.
4. `await document.fonts.ready`.

Only then does the fit engine run. If a font fails to load (network offline,
CSP rejection), the fit engine falls back to measuring against the fallback
stack (`system-ui, sans-serif`) and adds `MEASUREMENT_SAFETY_PAD_MM = 1 mm`
to every measured width, biasing toward earlier wrapping so nothing clips.

**Chosen strategy:**
- **Primary**: offscreen `CanvasRenderingContext2D.measureText` in the parent
  document, with fonts pre-loaded via `document.fonts.load` / `ready`.
- **Fallback**: hidden DOM span (`<span style="visibility:hidden;position:absolute;
  white-space:pre;font:...">text</span>` measured with `getBoundingClientRect()`).
  Used only if `HTMLCanvasElement` is missing or `measureText` returns a
  non-finite value.

Rejected: (c) pure CSS `svg textLength` — SVG can force text to a width, but it
cannot **decide** whether wrapping is needed, and it does not support wrapping
across multiple lines without external layout. Rejected: (d) two-pass measure
inside the print document — would break preview parity, since the iframe
preview cannot round-trip fit decisions back into the returned HTML string
before rendering (**bugfix.md 2.9**).

### Named Constants

Declared in a single module `src/lib/badge-fit-constants.ts` so tests can
import them directly.

- `MIN_PAD_MM = 2.5` — required by **bugfix.md 2.5**; matches the existing
  `padMm = clamp(2.5, ...)` floor in `renderDefaultBadge`.
- `QR_MIN_MM = 14` — required by **bugfix.md 2.7**; matches the existing
  `qrMm = clamp(14, ...)` floor.
- `CENTER_TOLERANCE_MM = 0.5` — required by **bugfix.md 2.6**. Half a millimeter
  is well below the 8 dots at 203 DPI (~1 mm) rendering precision of the target
  printer, so it is a printer-limited, not compute-limited, tolerance.
- `FLOOR_PT_BY_ROLE = { name: 8, nameLabel: 8, company: 6, companyLabel: 6,
  title: 6, event: 6, org: 6, meta: 6, ticket: 6, eventDate: 6, customText: 6 }` —
  matches **bugfix.md 2.3**: 8 pt for the name role, 6 pt for every secondary role.
- `SHRINK_STEP_PT = 0.5` — smallest step that still keeps iteration bounded
  (`(startPt − floorPt) / 0.5` iterations, ≤ 60 for the largest name at 28 pt).
  Coarser steps (e.g. 1 pt) produce visible size jumps between similar-length
  strings; finer (e.g. 0.25 pt) doubles iteration count without a visible
  benefit at 203 DPI.
- `MEASUREMENT_SAFETY_PAD_MM = 1.0` — added to measured widths only when font
  loading has failed and we are measuring against the fallback stack.
- `LINE_HEIGHT_MM_PER_PT = 1.1 × (25.4 / 72)` — matches the existing
  `line-height:1.1` in `.card.basic .name`.
- `MM_PER_CSS_PX = 25.4 / 96` — CSS spec, does not vary by device.

### Data Model / Type Changes

**`PrintOptions` (existing) — one addition:**
```ts
export type PrintOptions = {
  // ...unchanged...
  /** Per-printer hardware-margin compensation. Persisted with `lovable.print-badges.v2`.
   *  Applied only when `thermalMode || isThermalSize` is true. Populated from the
   *  calibration flow (the organizer measures the gap between the frame and the
   *  physical label edge and enters it once per printer). */
  thermalOffset?: { topMm: number; leftMm: number };
};
```

**New types (all live in `src/lib/fit-engine.ts`):**
```ts
export type FontSpec = {
  family: string;
  weightCss: number;       // 100..900
  italic: boolean;
  sizePt: number;
};

export type FitLine = {
  text: string;
  widthMm: number;
};

export type FitResult = {
  sizePt: number;
  lines: FitLine[];
  heightMm: number;
  /** true when the returned sizePt equals the role's floor. */
  atFloor: boolean;
  /** true when even at floor a token exceeded safeWmm and was hard-broken. */
  overflow: boolean;
};

export type FitWarning = {
  /** Role identifier — matches keys in FLOOR_PT_BY_ROLE. */
  role: string;
  /** The original text that could not fit cleanly. */
  text: string;
  reason: "atFloor" | "hardBreak";
};

export type Role =
  | "name" | "nameLabel" | "company" | "companyLabel"
  | "title" | "event" | "org" | "meta" | "ticket"
  | "eventDate" | "customText";
```

**`buildPrintHtml` return type change:**
```ts
export async function buildPrintHtml(
  badges: BadgeData[],
  opts: PrintOptions = {},
): Promise<{ html: string; warnings: FitWarning[] }>;
```

`printBadges` continues to be `Promise<void>` and swallows `warnings` (it's a
fire-and-forget popup print). `PrintBadgesDialog` uses `warnings` to render a
small in-preview banner when non-empty.

**`PrintBadgesDialog` prefs shape (backward-compatible):**
```ts
type Prefs = {
  // ...existing...
  thermalOffset?: { topMm: number; leftMm: number };
};
```
Existing persisted `Prefs` blobs without `thermalOffset` load as `undefined`
and behave exactly as today (**bugfix.md 3.1**).

### Files to Change

**`src/lib/fit-engine.ts` — new file.**
- Pure functions: `measureTextMm`, `greedyWrap`, `fitText`,
  `allocateHeightBudget`, `computeCenteringPadding`, `hardSplit`.
- Font-loading helpers: `ensureFontsLoaded(tuples)`, `resolvedFontKey(spec)`.
- Constants re-exported from `badge-fit-constants.ts`.
- No dependency on React, DOM (beyond `document`/`HTMLCanvasElement` behind
  feature-detection), or QRCode.

**`src/lib/badge-fit-constants.ts` — new file.**
- Numeric constants only, no side effects.

**`src/lib/print-badges.ts` — modify.**
- `buildPrintHtml`:
  - Return type becomes `{ html, warnings }`.
  - Before rendering cards, calls `ensureFontsLoaded(tuplesFromOpts(opts))`.
  - Collects `warnings` from every renderer.
  - Renders `.body { padding-top: ${topMm}mm; padding-bottom: ${botMm}mm; }`
    per card using the computed centering.
  - In full-bleed thermal mode, applies `thermalOffset` as an additional
    inline `padding-top` / `padding-left` on `.card > *` — this is a single
    mechanism co-located with the safe-area padding, so there is no double
    application.
- `renderDefaultBadge`:
  - `namePt` derivation removed; replaced by `fitText(name, nameSpec, safeW,
    heightBudget.name, FLOOR_PT_BY_ROLE.name)`.
  - Same for `eventPt` (`event` role), `orgPt`, `metaPt`.
  - Output HTML uses `<br/>` between lines from `FitResult.lines`, and the
    `<div class="name">` gets `width:${safeW}mm; max-width:${safeW}mm` so
    the flex-item-width bug from §Hypothesized Root Cause cannot recur.
  - `.body`'s `justify-content:flex-start` becomes `justify-content:center`
    with computed padding; the `.divider { margin:auto 0 }` elastic collapse
    is replaced with fixed `margin:${gapMm}mm 0`.
- `renderName`:
  - `namePt` and `companyPt` are computed by `fitText`. Preset shells
    (`monogram`, `ticket-stub`, `event-card`, default) are unchanged.
  - Each preset's text `<div>` also gets an explicit `max-width` derived from
    `dims.w − 2 × MIN_PAD_MM − 2 × preset.paddingMm`.
- `renderTextElement`:
  - Signature grows a `maxWidthMm: number` parameter.
  - Emits `max-width:${maxWidthMm}mm; white-space:normal;
    word-break:break-word; overflow-wrap:anywhere` alongside the existing
    inline styles.
  - Caller (`renderDesignedFace`) computes `maxWidthMm` per element from
    `el.x`, `el.align`, and the safe area.
- `renderDesignedFace`:
  - For each enabled text element, resolve FontSpec, compute `maxWidthMm`,
    call `fitText`, emit resolved `<div class="el text">` with `<br/>` line
    breaks and the new inline `max-width` styles.
  - QR mm side is post-clamped to `QR_MIN_MM` before pixel conversion.

**`src/components/event/registrations/PrintBadgesDialog.tsx` — modify.**
- Destructure `{ html }` from `buildPrintHtml` in both `runPrint` (via
  `printBadges` — no dialog change needed; `printBadges` stays
  `Promise<void>`) and `refreshPreview`.
- After `refreshPreview`, if `warnings` is non-empty, render a small
  "Some text was shrunk to fit" pill above the iframe listing each
  `{role, text}` (matches **bugfix.md 2.4**).
- Add a "Measured offsets" section (thermal-only) with two number inputs
  `topMm` / `leftMm`; persist as `thermalOffset` in the existing prefs blob
  under the same `PREF_KEY = "lovable.print-badges.v2"` key. Populated
  from what the organizer measures after printing the calibration sheet.
  If unset, `thermalOffset` is undefined and rendering is identical to today.

**`src/components/event/registrations/BadgeDesignerCanvas.tsx` — small modify.**
- Remove `whiteSpace: "nowrap"` from the text-element inline style.
- Add a computed `maxWidth` in px equal to `maxWidthMm × PX_PER_MM × scale`
  from the same formula the print path uses. This is a WYSIWYG-only change;
  it does not affect print output but keeps the designer preview honest so
  the user cannot accidentally place a value that will overflow.
- No fit engine call from the canvas — the designer is a positioning tool,
  not a print output. The user's stored `el.size` (pt) is honored as-is in
  the designer; fitting happens at print time.

## Testing Strategy

### Validation Approach

Two-phase per **bugfix.md §Bug Analysis**: surface counterexamples that
demonstrate the bug on unfixed code (exploratory), then verify the fix works
correctly (fix checking) and that behavior on non-buggy inputs is unchanged
(preservation checking).

The repo has `vitest run` wired up as `npm test` (see
`package.json → scripts.test`) plus Playwright (`playwright.config.ts`).
Pure functions in `fit-engine.ts` and `badge-fit-constants.ts` are unit-tested
with Vitest and no DOM (the offscreen canvas is created via a small
`getContext2D()` factory the test suite mocks with a synchronous
`text.length × spec.sizePt × 0.5 mm` ruler so tests are deterministic and
font-independent). Rendered-layout assertions — actual `getBoundingClientRect`
widths against the safe area — go in Playwright because they need a real
browser with real font metrics.

### Exploratory Bug Condition Checking

**Goal**: Confirm on unfixed code that (a) `renderDefaultBadge` clips long names
at the label edge, (b) `renderName` truncates long companies, (c) the designer
face extends past both card edges, and (d) thermal offsets shift the block
off-center.

**Test Plan**: Write Playwright tests that call `buildPrintHtml` against the
current implementation, load the returned HTML into a page, wait for
`document.fonts.ready`, and assert that the rendered `.name` /`.company` /
`.el` bounding boxes fit inside `dims.w − 2 × MIN_PAD_MM`. On unfixed code
these will fail — that is the point.

**Test Cases** (each fails on unfixed code):
1. **Long name — thermal-58**: name = `"Aakarshan Singh Chadha"`, size =
   `thermal-58`, `mode = "badge"` — assert `.name` bounding-box width ≤ 52.2 mm.
2. **Long company — name-only**: name = `"J. Q. Public"`, company =
   `"Infomerics Valuations and Ratings"`, size = `thermal-4x6`, `mode = "name"` —
   assert the company `<div>` width ≤ 96.6 mm.
3. **Long name — designer face**: `design` with `elements.name.enabled = true,
   x:50, y:42`, name = `"Aakarshan Singh Chadha"`, size = `thermal-58` —
   assert `.el.text` bounding-box `right − left` ≤ 52.2 mm.
4. **Height overflow — thermal-50**: enable `org`, `eventTitle`, `eventDate`,
   `name`, and `qr` on a 50×80 mm badge with typical values — assert
   `.qr-wrap` bottom edge ≤ card bottom − `MIN_PAD_MM`.

**Expected Counterexamples**:
- On unfixed code every one of the above assertions fails; on fixed code
  every one passes.
- Possible causes on unfixed code: (1) point size derived from geometry, not
  content; (2) flex-column `align-items:center` giving items content-width;
  (3) `.el` absolute positioning with no width constraint; (4) elastic
  `.divider` swallowing height overflow.

### Fix Checking

**Goal**: For all inputs where `isBugCondition` holds, the fixed function
produces a layout that satisfies Property 1.

**Pseudocode:**
```
FOR ALL X WHERE isBugCondition(X) DO
  { html } ← buildPrintHtml(X.badges, X.opts)
  render(html) in headless browser after document.fonts.ready
  ASSERT clippedGlyphs(rendered) = 0
  ASSERT everyTextBoxIsInside(rendered, safeRect(X.dims, MIN_PAD_MM))
  ASSERT everyTextPt(rendered) ≥ FLOOR_PT_BY_ROLE[role]
  ASSERT qrSideMm(rendered) ≥ QR_MIN_MM
  ASSERT |topGapMm(rendered) − bottomGapMm(rendered)| ≤ CENTER_TOLERANCE_MM
  ASSERT buildPrintHtml(X.badges, X.opts) = buildPrintHtml(X.badges, X.opts)
END FOR
```

### Preservation Checking

**Goal**: For all inputs where `¬isBugCondition(X)`, the fixed function
produces byte-identical HTML.

**Pseudocode:**
```
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT buildPrintHtml_original(X.badges, X.opts) =
         buildPrintHtml_fixed(X.badges, X.opts).html
END FOR
```

**Testing Approach**: Property-based testing (via `fast-check`) is a fit for
preservation because the input domain is large — every combination of
(size, mode, design preset, short-name-and-short-company). Each generated
input is a case where `naturalWidthMm(name) ≤ safeW` and every other role
also fits at requested pt; the fixed HTML must equal the original HTML
character-for-character.

**Test Plan** (Vitest): capture a snapshot from the current implementation
for a curated corpus of "already-fits" inputs, then run the fixed
implementation against that corpus and diff. `fast-check` extends the corpus
by generating short strings and preset combinations that pass the
`isBugCondition` fast path.

**Test Cases**:
1. **Short-name identity — every preset size**: `name = "Jane Doe"`,
   `company = "Acme Inc."` on `a6`, `a4-2up`, `avery-3x8`, all thermals,
   `custom 4×3 in`, `mode = "badge"` and `mode = "name"`. Assert
   `fixed(html) === original(html)`.
2. **Non-thermal sheet CSS**: any `size in {a6, a4-2up, avery-3x8}` and any
   payload — assert `SHEET_CSS` output is byte-identical.
3. **Calibration path**: `buildCalibrationHtml` output is byte-identical for
   every preset size and DPI combination (`3.3`).
4. **Font override preserved**: for `fontOverride = { family: "Merriweather",
   sizePt: 22, bold: true, italic: true, underline: true, color: "#123456",
   align: "left", wordSpacingPt: 2, scalePct: 90 }` and a short name —
   assert every one of those declarations appears verbatim in the fixed
   output at the same size (`3.6`).
5. **Designer element anchors**: for a design with `name.x = 30, name.y = 42`
   and a short name — assert the emitted `left:30%;top:42%` is unchanged
   (`3.7`).

### Unit Tests (Vitest — `src/lib/fit-engine.test.ts`)

Pure, deterministic, no DOM. A mock `measureTextMm` is injected that treats
every character as `spec.sizePt × 0.5 mm` wide (linear in text length and pt).

- `greedyWrap` — wraps at word boundaries; keeps unbreakable tokens whole
  when `opts.hardBreak = false`; splits on grapheme boundaries when
  `opts.hardBreak = true`.
- `fitText` — fast-path returns unchanged FontSpec when text fits at
  requested pt; slow-path returns `sizePt ≤ requested`, monotonically
  non-increasing; terminates in ≤ `(startPt − floorPt) / SHRINK_STEP_PT + 1`
  iterations; sets `atFloor` when `sizePt = floorPt`; sets `overflow` only
  when hard-break was invoked.
- `allocateHeightBudget` — sum of role budgets equals `freeH` when the input
  overflows; shrink priority order is honored (`eventTitle` shrinks before
  `name`); `qrMm` and `QR_MIN_MM` are never crossed.
- `computeCenteringPadding` — `topMm + botMm = safeH − contentHeightMm +
  2 × basePadMm`; when `thermalOffset.topMm = 0`, `topMm = botMm` exactly.
- Determinism — `fitText(text, spec, w, h, floor)` called twice with the
  same inputs returns deeply-equal FitResults.

### Property-Based Tests (Vitest — `fit-engine.pbt.test.ts`)

Using `fast-check`:

- `∀ (text, spec, safeWmm, maxHeightMm)` with `spec.sizePt ≥ floorPt`:
  the returned `FitResult` has `every line width ≤ safeWmm` OR `overflow = true`.
- `∀ (text, spec, safeWmm, maxHeightMm)`: `heightMm ≤ maxHeightMm` OR
  `overflow = true`.
- `∀ short-fits input X`: `buildPrintHtml(X).html === originalBuildPrintHtml(X)`.

### Browser Tests (Playwright — `tests/badge-fit.spec.ts`)

Real font metrics, real layout.

- **Long-name counterexamples from the photos**: `"Aakarshan Singh Chadha"`
  and `"Infomerics Valuations and Ratings"` on `thermal-58`, `thermal-4x6`,
  `mode = "badge"` and `mode = "name"`. Assert every text bounding-box
  `right − left ≤ safeW`.
- **Unbreakable token**: `name =
  "supercalifragilisticexpialidocious1234567890"` on `thermal-50`. Assert
  no glyph is clipped by `.card`'s overflow rule (compare
  `getComputedStyle` overflow-drawn area).
- **Boundary at every preset size**: for each preset in `SIZE_OPTIONS`, a
  name that is exactly one word longer than fits at requested pt. Assert
  the fix wraps (not shrinks) if wrapping alone is enough, per
  **bugfix.md 2.2** / **2.3** priority.
- **Optical centering**: for each thermal size, measure top and bottom gaps
  of the content stack; assert `|top − bottom| ≤ CENTER_TOLERANCE_MM`.
- **Preview parity**: render `buildPrintHtml` output in the dialog iframe
  and in a headless print page; assert both DOMs are equal after
  `document.fonts.ready`.

## Regression Risks and Mitigations

Each clause under **bugfix.md §Unchanged Behavior (3.x)** is a concrete
regression risk. Below, each risk is paired with the design element that
defends against it.

- **3.1 — Short-name identity**. Risk: adding a fit pass changes HTML for
  values that already fit. Mitigation: `fitText`'s fast path
  (single-line width ≤ safeW AND single-line height ≤ maxHeight) returns
  the input FontSpec unchanged; `renderDefaultBadge` uses the FitResult's
  `sizePt` directly, and when it equals the requested pt no `<br/>` is
  emitted. Preservation snapshot tests (§Preservation Checking) fail on
  the smallest diff.
- **3.2 — Non-thermal sheet behavior**. Risk: touching the CSS emitted for
  `SHEET_CSS[size]`. Mitigation: the fit engine consumes `dims` (mm), not
  `size`; `SHEET_CSS` is not read by any new code path. Preservation test
  #2 asserts the sheet CSS string is byte-identical.
- **3.3 — Calibration sheet**. Risk: routing the calibration path through
  the fit engine. Mitigation: `buildCalibrationHtml` is not modified and
  does not call any new function. Preservation test #3.
- **3.4 — DPI-matched QR pixels**. Risk: recomputing QR mm size drops the
  DPI-derived pixel count. Mitigation: after any mm-side change, the
  pixel count is derived from the same `qrPixelSizeForMm(mm, thermalDpi)`
  helper the current code uses; the helper itself is unchanged.
- **3.5 — Thermal B/W CSS**. Risk: overriding thermal color rules with the
  new centering padding. Mitigation: the centering padding is applied to
  `.body` (background: none in thermal mode) not to `.card` (which the
  thermal block already overrides). The thermal block is emitted last in
  the style sheet, so its `!important` declarations still win.
- **3.6 — Font override authority**. Risk: auto-fit reverts the user's
  chosen size. Mitigation: `fontOverride.sizePt` is the *requested* pt fed
  into `fitText`. The fit engine only reduces it if the string would
  otherwise not fit; if the string fits at the requested pt, the fast
  path returns it unchanged. Every other field (bold, italic, underline,
  strikethrough, color, alignment, word spacing, scale) is untouched by
  the fit engine — it operates on `sizePt` and `lines[]` only.
- **3.7 — Designer element relative positions**. Risk: computing
  `max-width` also nudges `x`/`y`. Mitigation: `renderTextElement`
  continues to emit `left:${el.x}%; top:${el.y}%`. `max-width` is a size
  constraint, not a position; the `translate(-50%, -50%)` transform stays
  the same, so wrapping expands the box symmetrically around the anchor
  and preserves the group's visual center.
- **3.8 — Copies expansion / page breaks**. Risk: adding centering padding
  breaks the `page-break-after:always` rule on `.card`. Mitigation:
  padding is added to `.body`, not `.card`. The `.card` selector and its
  `page-break-*` declarations are unchanged. Snapshot preservation
  captures a `copies = 3` case.
- **3.9 — Name-only preset templates**. Risk: rewriting `renderName` drops
  the accent bands, monogram, ticket-stub, event-card shells. Mitigation:
  `renderName`'s preset-selecting `if/else` and the surrounding
  template markup are unchanged; only the pt values inside each template
  are replaced by FitResults. Snapshot preservation captures each
  `NameDesignId` with a short name.

## Files Touched Summary

| File | Change | Why |
| ---- | ------ | --- |
| `src/lib/fit-engine.ts` | new | Pure fit engine — measurement, wrap, shrink, budget, centering. Unit-testable in isolation. |
| `src/lib/badge-fit-constants.ts` | new | Named constants shared between engine, renderers, and tests. |
| `src/lib/print-badges.ts` | modify | `buildPrintHtml` return shape, `renderDefaultBadge` / `renderName` / `renderTextElement` / `renderDesignedFace` all call the fit engine and thread widths through; centering padding replaces elastic divider. |
| `src/components/event/registrations/PrintBadgesDialog.tsx` | modify | Consume `{ html, warnings }`; render warning pill; persist `thermalOffset` under the existing `lovable.print-badges.v2` key. |
| `src/components/event/registrations/BadgeDesignerCanvas.tsx` | modify | Remove `whiteSpace:"nowrap"`; add `maxWidth` derived from the same safe-area math so the designer preview matches print. |
| `src/lib/fit-engine.test.ts` | new | Vitest unit tests for pure functions. |
| `src/lib/fit-engine.pbt.test.ts` | new | Vitest + fast-check properties (correctness + preservation). |
| `tests/badge-fit.spec.ts` | new | Playwright end-to-end: real font metrics, counterexamples from photos, preview parity. |

## Open Questions

- Should the calibration sheet auto-populate `thermalOffset` from a
  QR-encoded measurement (organizer scans the printed frame with their
  phone), or is a two-field numeric input in the dialog sufficient?
  The design assumes the latter for a minimal first landing; the QR
  auto-populate is a follow-up.
- The `overflow = true` state at floor could either (a) print the
  hard-broken result and surface a warning, or (b) refuse to print and
  require the organizer to change the label size. The design chooses (a)
  because **bugfix.md 2.4** explicitly says "fit as much as the safe area
  allows without clipping mid-glyph AND surface the condition" — the
  print still happens. This is worth confirming with the organizer.
