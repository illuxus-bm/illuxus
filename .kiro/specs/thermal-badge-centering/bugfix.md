# Bugfix Requirements Document

## Introduction

Badge and name-label printing emits text at a point size derived only from the label's dimensions. The rendered string is never measured, so any value wider than the label silently overflows and is clipped at the label edge. Nothing wraps, nothing shrinks, and no warning is shown — the organizer discovers the loss only on the physical label. Because the content block's height is likewise never recomputed after overflow, vertical balance also breaks: content sits high, whitespace pools at the bottom, and tall content can push the QR code off the label.

**Counterexample (physical thermal prints):**

- Name "Aakarshan Singh Chadha" printed on a single line at a fixed point size, running edge to edge with effectively no side padding.
- Company line "Infomerics Valuations and Ratings" clipped to "Infomerics Valuations and Rating" — the final "s" cut off at the label edge.
- Content block sitting high on the label with unbalanced whitespace below instead of being optically centered.

The required behavior is a self-adjusting layout: when a value does not fit, wrap the overflowing word to the next line, shrink the font if wrapping alone is not enough, and then rebalance line height, gaps, and block position so the result stays inside a safe margin and reads as centered. The previously-documented thermal hardware-margin centering concern is retained as a secondary, related condition subordinate to this auto-fit defect.

Scope: thermal sizes (thermal-50, thermal-58, thermal-80, thermal-100, thermal-4x6) and custom sizes are where overflow is most visible, but the defect is size-independent and also affects a6, a4-2up and avery-3x8 whenever a value exceeds the available width.

## Bug Analysis

### Bug Condition

The bug is triggered by any print job in which a rendered text value's natural width at its configured point size exceeds the available content width, or the laid-out content exceeds the available height, or (secondary) a thermal label's content block is not centered within the printable area.

```pascal
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

Where `MIN_PAD_MM = 2.5`, `QR_MIN_MM = 14`, and the legibility floor `FLOOR_PT` is 8 pt for the name role and 6 pt for all secondary roles (company, title, event title, org name, meta, custom text).

```pascal
// Property: Fix Checking — no clipping, always centered, always legible
FOR ALL X WHERE isBugCondition(X) DO
  layout ← F'(X)
  ASSERT layout.clippedGlyphs = 0
  ASSERT FOR ALL b IN layout.blocks : withinSafeArea(b, X.dims, MIN_PAD_MM)
  ASSERT FOR ALL t IN layout.texts  : t.sizePt ≥ FLOOR_PT(t.role)
  ASSERT layout.qr.sideMm ≥ QR_MIN_MM
  ASSERT |layout.topGapMm − layout.bottomGapMm| ≤ CENTER_TOLERANCE_MM
  ASSERT F'(X) = F'(X)                     // deterministic for identical input
END FOR
```

```pascal
// Property: Preservation Checking — values that already fit are untouched
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT F(X) = F'(X)
END FOR
```

### Current Behavior (Defect)

1.1 WHEN a badge is rendered THEN the system derives each text value's point size from the label dimensions alone (`clamp(lo, height × factor, hi)`) without measuring the actual string, so a value wider than the label is emitted at a size that cannot fit

1.2 WHEN a rendered text value is wider than the label's content width THEN the system clips the overflow at the label edge with no wrap, no font reduction, and no error or warning

1.3 WHEN any text value is rendered THEN the system does not enforce a minimum safe padding between the text and the label edge, so even a value that does not overflow can print touching the edge with no visible margin

1.4 WHEN a value wraps or the content is otherwise taller than expected THEN the system does not recompute the content block's height, so line height, inter-block gaps, and the block's vertical offset stay at their original values and the content prints high on the label with whitespace pooled below

1.5 WHEN total content height exceeds the label height THEN the QR code is pushed past the bottom edge and is partially or fully clipped, rendering it unscannable

1.6 WHEN a custom designer layout is printed THEN each text element is absolutely positioned with no width constraint at all, so a long value extends symmetrically past both label edges and is clipped mid-word by the card's overflow rule

1.7 WHEN a name-only label is printed THEN the name and company lines are emitted at fixed point sizes from the selected design preset with no fit check, producing the same clipping on long names and long company strings

1.8 WHEN the organizer views the on-screen preview before printing THEN the preview gives no indication that a value will be clipped on the physical label, so the defect is discovered only after printing

1.9 WHEN printing on a thermal printer THEN the printer's hardware margins (unprintable zones not exposed to CSS) shift the content, and the layout does not compensate, so the badge prints off-center even when no value overflows *(secondary condition)*

1.10 WHEN thermal content is shifted by uncompensated hardware margins THEN backing-paper instructional text may be visible at the label edge, confirming the content is not positioned against the true printable boundaries *(secondary condition)*

### Expected Behavior (Correct)

2.1 WHEN any text value is rendered THEN the system SHALL fit it entirely within the label's safe content area, and SHALL NOT clip any glyph of any value on any print size

2.2 WHEN a text value does not fit on one line at its configured point size THEN the system SHALL wrap it at a word boundary so the overflowing word moves to the next line

2.3 WHEN word-boundary wrapping alone is insufficient — a single unbreakable token wider than the safe width, or a wrap that would exceed the height budget — THEN the system SHALL progressively reduce that value's font size, in preference to any other measure, until it fits or reaches its legibility floor (8 pt for the name, 6 pt for secondary lines)

2.4 WHEN a value still does not fit at its legibility floor THEN the system SHALL fit as much as the safe area allows without clipping mid-glyph and SHALL surface the condition to the organizer rather than failing silently

2.5 WHEN any badge is rendered THEN the system SHALL maintain a minimum safe padding of 2.5 mm on all four label edges, on every size and in every mode

2.6 WHEN a value has been wrapped or shrunk THEN the system SHALL recompute line height, inter-block gaps, and the vertical position of the whole content block so the result remains optically centered within the safe area, with the top and bottom gaps equal within tolerance

2.7 WHEN a badge includes a QR code THEN the system SHALL keep it fully inside the safe area at no less than 14 mm per side, and text reflow SHALL NOT reduce it below that size or push it off the label

2.8 WHEN a custom designer layout is printed THEN the system SHALL constrain each text element to the safe area and apply the same wrap-then-shrink reflow, while preserving the elements' relative positions as a group

2.9 WHEN the organizer views the on-screen preview THEN the preview SHALL reflect exactly the same wrap, shrink, and rebalance decisions as the physical print, so any fit risk is visible before printing

2.10 WHEN the same badge data, size, design, and font settings are printed again THEN the system SHALL produce an identical layout — wrap points, resolved point sizes, gaps, and block position SHALL be deterministic

2.11 WHEN printing on a thermal printer THEN the system SHALL position the content block so it is centered within the printable area, compensating for common thermal hardware margins, and SHALL NOT leave backing-paper text visible at the label edge *(secondary condition)*

### Unchanged Behavior (Regression Prevention)

3.1 WHEN every text value already fits within the safe content area at its configured point size THEN the system SHALL CONTINUE TO render exactly as it does today, with no change to point sizes, wrap points, gaps, or block position

3.2 WHEN printing on non-thermal sizes (a6, a4-2up, avery-3x8) THEN the system SHALL CONTINUE TO use the existing page, sheet, and grid behavior including column count, gaps, and page margins

3.3 WHEN printing the calibration sheet THEN the system SHALL CONTINUE TO render edge-to-edge with corner marks, the 50 mm ruler, font samples, and the 25 mm reference QR exactly as currently implemented

3.4 WHEN printing to a thermal printer with a configured print-head DPI THEN the system SHALL CONTINUE TO generate QR codes at the DPI-matched pixel count so modules render dot-for-dot

3.5 WHEN thermal mode is active THEN the system SHALL CONTINUE TO strip backgrounds and force black-and-white colours for clean thermal output

3.6 WHEN the organizer has set font overrides (family, weight, italic, underline, strikethrough, colour, alignment, word spacing, horizontal scale) THEN the system SHALL CONTINUE TO honour every one of them; auto-fit SHALL adjust size within those choices rather than discarding them

3.7 WHEN a custom badge design specifies element positions THEN the system SHALL CONTINUE TO honour the relative positioning of elements as a group

3.8 WHEN copies-per-badge is greater than one, or full-bleed one-label-per-page mode is active THEN the system SHALL CONTINUE TO emit the same number of labels with the same page-break behavior

3.9 WHEN a name-only label uses a selected design preset THEN the system SHALL CONTINUE TO render that preset's layout, accent bands, and typography choices
