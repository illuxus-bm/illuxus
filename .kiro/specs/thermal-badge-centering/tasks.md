# Implementation Plan

Every task cites the `bugfix.md` clauses it satisfies (1.x defect, 2.x expected, 3.x preservation) and the `design.md` heading it implements. Test-first ordering: the exploratory counterexamples land before scaffolding so failure is honest; the preservation baseline is captured against the **unmodified** renderer so it can protect every subsequent step.

Non-goals guarded by this plan: no task touches `buildCalibrationHtml` (design §Regression Risks — 3.3), no task modifies `SHEET_CSS` (design §Regression Risks — 3.2), and no task batches multiple renderers together.

---

- [ ] 1. **Property 1: Bug Condition** — Playwright exploratory counterexamples
  - **CRITICAL**: These tests MUST FAIL on unfixed code. Failure surfaces the counterexamples in the photos and confirms the bug exists.
  - **DO NOT** attempt to fix code when the tests fail here. Document counterexamples for the fix phase.
  - **Scoped PBT approach**: each case is a deterministic single-input probe (concrete failing case), not a generative property.
  - **File touched (new)**: `tests/badge-fit.spec.ts` — four `test(...)` blocks calling `buildPrintHtml` against the current implementation, loading returned HTML into a page, awaiting `document.fonts.ready`, then asserting rendered bounding boxes against the safe area.
    1. Long name on `thermal-58`, `mode="badge"`: `name = "Aakarshan Singh Chadha"`. Assert `.name` `getBoundingClientRect().width ≤ 52.2 mm` (safe width = 58 − 2×2.5 = 52.2 in test frame; design uses `MIN_PAD_MM = 2.5`, and the photo probe uses `2.9` as reproduced in design §Examples). Assert no glyph is clipped by `.card{overflow:hidden}`.
    2. Long company on `thermal-4x6`, `mode="name"`: `name = "J. Q. Public"`, `company = "Infomerics Valuations and Ratings"`. Assert the company `<div>` width ≤ `dims.w − 2 × MIN_PAD_MM` (96.6 mm on 101.6 mm width).
    3. Long name on designer face, `thermal-58`: design with `elements.name.enabled = true, x:50, y:42`, `name = "Aakarshan Singh Chadha"`. Assert `.el.text` `right − left ≤ 52.2 mm`.
    4. Height overflow on `thermal-50`: enable `org`, `eventTitle`, `eventDate`, `name`, `qr` on 50×80 mm. Assert `.qr-wrap` bottom edge ≤ card bottom − `MIN_PAD_MM`.
  - **EXPECTED OUTCOME**: Each test FAILS on unfixed code — assertion prints the measured overflow in mm and the offending glyph. Mark complete when all four failures are recorded with counterexample output attached.
  - **How to run**: `npx playwright test tests/badge-fit.spec.ts --project=chromium`
  - _Design: §Exploratory Bug Condition Checking, §Examples_
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_

- [ ] 2. Scaffold `badge-fit-constants.ts` (constants land before any renderer is modified)
  - **File touched (new)**: `src/lib/badge-fit-constants.ts` — export every constant from design §Named Constants with the documented value:
    - `MIN_PAD_MM = 2.5`
    - `QR_MIN_MM = 14`
    - `CENTER_TOLERANCE_MM = 0.5`
    - `SHRINK_STEP_PT = 0.5`
    - `MEASUREMENT_SAFETY_PAD_MM = 1.0`
    - `LINE_HEIGHT_MM_PER_PT = 1.1 * (25.4 / 72)`
    - `MM_PER_CSS_PX = 25.4 / 96`
    - `FLOOR_PT_BY_ROLE = { name: 8, nameLabel: 8, company: 6, companyLabel: 6, title: 6, event: 6, org: 6, meta: 6, ticket: 6, eventDate: 6, customText: 6 }`
  - **File touched (new)**: `src/lib/badge-fit-constants.test.ts` — one assertion per constant that its exported value equals its documented value verbatim (drift guard).
  - **Outcome**: Module compiles; `npx vitest run src/lib/badge-fit-constants.test.ts` reports every constant test passing. No renderer file is touched, so the preservation baseline captured next remains honest.
  - _Design: §Named Constants_
  - _Requirements: 2.3, 2.5, 2.6, 2.7_
  - _Prerequisite: Task 1_

- [ ] 3. **Property 2: Preservation** — Baseline snapshots of the **CURRENT** `buildPrintHtml`
  - **IMPORTANT**: This test MUST run against the **UNMODIFIED** renderer. It captures the ground truth that every subsequent task must not regress.
  - **Observation-first methodology**: invoke the current `buildPrintHtml(badges, opts)` (still returning `Promise<string>`) for the corpus below and snapshot the raw HTML string. Verify the snapshots PASS on unfixed code before proceeding.
  - **File touched (new)**: `src/lib/print-badges.preservation.test.ts`.
  - **Corpus** (from design §Preservation Checking):
    - Short-fit identity: `name = "Jane Doe"`, `company = "Acme Inc."` on every preset size (`a6`, `a4-2up`, `avery-3x8`, `thermal-50`, `thermal-58`, `thermal-80`, `thermal-100`, `thermal-4x6`, `custom 4×3in`) × `mode ∈ {badge, name}`.
    - Calibration path: `buildCalibrationHtml` output for every preset size × DPI in `{203, 300}` (task must snapshot — must NOT touch — the calibration path per design §Regression Risks 3.3).
    - Font-override: `fontOverride = { family: "Merriweather", sizePt: 22, bold: true, italic: true, underline: true, color: "#123456", align: "left", wordSpacingPt: 2, scalePct: 90 }` with a short name.
    - Designer-anchor: design with `name.x = 30, name.y = 42` and a short name.
    - Copies=3: any short-fit case with `opts.copies = 3` to lock in `page-break-after` behavior.
  - **Outcome**: `npx vitest run src/lib/print-badges.preservation.test.ts` passes against the current codebase. Snapshot file `src/lib/__snapshots__/print-badges.preservation.test.ts.snap` is committed and becomes the invariant every downstream task must keep green.
  - _Design: §Preservation Requirements, §Preservation Checking, §Regression Risks_
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_
  - _Prerequisite: Task 2_

- [ ] 4. Scaffold `src/lib/fit-engine.ts` module with types only (no implementations yet)
  - **File touched (new)**: `src/lib/fit-engine.ts` — export type aliases `FontSpec`, `FitLine`, `FitResult`, `FitWarning`, `Role` exactly as declared in design §Data Model / Type Changes. Re-export constants from `badge-fit-constants.ts`. Add a `getContext2D()` factory (single offscreen canvas per invocation, feature-detected) with a hidden-DOM-span fallback stub returning `null` for now.
  - **Outcome**: `tsc --noEmit` (via `npm run build` or `npx vitest run`) reports no type errors. No implementation code emitted yet — subsequent tasks fill in the functions.
  - Preservation snapshots (Task 3) remain green — this module is not imported by `print-badges.ts` yet.
  - _Design: §Architecture, §Data Model / Type Changes, §Files to Change_
  - _Requirements: 2.1, 2.10_
  - _Prerequisite: Task 3_

- [ ] 5. Implement `measureTextMm(text, spec)` + unit test
  - **File touched**: `src/lib/fit-engine.ts` — export `measureTextMm` per design §Algorithm (Measurement primitive). Uses `getContext2D()`, sets `ctx.font` from `spec`, converts `measureText().width` via `MM_PER_CSS_PX`. Caches by `(family, weightCss, italic, sizePt, text)`.
  - **File touched (new)**: `src/lib/fit-engine.test.ts` — unit tests: (a) same input returns same width; (b) width scales linearly with `sizePt` at fixed text; (c) cache hit returns identical instance; (d) unknown font falls back to fallback stack and adds `MEASUREMENT_SAFETY_PAD_MM` when font load failed.
  - Test uses the mock ruler from design §Testing Strategy: injected `getContext2D` whose `measureText` returns `{ width: text.length * spec.sizePt * 0.5 / MM_PER_CSS_PX }`.
  - **Outcome**: `npx vitest run src/lib/fit-engine.test.ts -t measureTextMm` passes. Preservation stays green (no renderer changes).
  - _Design: §Algorithm — Measurement primitive, §Font Loading Prerequisite_
  - _Requirements: 2.1, 2.10_
  - _Prerequisite: Task 4_

- [ ] 5.1 **Property 3: measureTextMm Determinism** — PBT
  - **File touched (new)**: `src/lib/fit-engine.pbt.test.ts` — `fast-check` property: `∀ (text: string, family: string, weight: 100..900, italic: boolean, sizePt: 6..48)`: `measureTextMm(text, spec) === measureTextMm(text, spec)` (deterministic) and result is finite, non-negative.
  - **Outcome**: `npx vitest run src/lib/fit-engine.pbt.test.ts -t "measureTextMm"` passes with 100+ generated cases.
  - _Design: §Property-Based Tests_
  - _Requirements: 2.10_
  - _Prerequisite: Task 5_

- [ ] 6. Implement `greedyWrap(text, spec, safeWmm, opts)` + unit test
  - **File touched**: `src/lib/fit-engine.ts` — implement `greedyWrap` per design §Algorithm (Greedy wrap). Word-boundary split on `/\s+/`; when a candidate line exceeds `safeWmm`, flush current and start new; unbreakable single-word overflow either emits as its own line (`opts.hardBreak = false`) or delegates to `hardSplit` (`opts.hardBreak = true`, called via a dep-injected stub for now — real implementation lands in Task 10).
  - **File touched**: `src/lib/fit-engine.test.ts` — unit tests:
    - Wraps `"the quick brown fox"` at `safeWmm` that fits 2 words per line.
    - Never breaks a word mid-glyph when `hardBreak = false`.
    - Preserves single-space between words in emitted lines.
    - Returns `[{ text, widthMm: 0 }]` for empty string input (defined behavior).
  - **Outcome**: `npx vitest run src/lib/fit-engine.test.ts -t greedyWrap` passes.
  - _Design: §Algorithm — Greedy wrap_
  - _Requirements: 2.2_
  - _Prerequisite: Task 5.1_

- [ ] 6.1 **Property 4: greedyWrap Width Invariant** — PBT
  - **File touched**: `src/lib/fit-engine.pbt.test.ts` — `∀ (text, spec, safeWmm ≥ 1 char at spec.sizePt)` with `hardBreak = false`: every returned line's `widthMm ≤ safeWmm` **OR** the line contains exactly one word wider than `safeWmm`. Also: concatenating all `line.text` (with single-space joiner between adjacent lines) yields the original word sequence.
  - **Outcome**: `npx vitest run src/lib/fit-engine.pbt.test.ts -t greedyWrap` passes.
  - _Design: §Property-Based Tests_
  - _Requirements: 2.2_
  - _Prerequisite: Task 6_

- [ ] 7. Implement `fitText(text, spec, safeWmm, maxHeightMm, floorPt)` + unit test
  - **File touched**: `src/lib/fit-engine.ts` — implement per design §Algorithm (Fit engine top-level). Fast-path returns unchanged FontSpec when single-line fits at requested pt AND height budget is respected. Slow-path decreases pt by `SHRINK_STEP_PT` down to `floorPt`; sets `atFloor` when equal, `overflow` only when hard-break was invoked at floor.
  - **File touched**: `src/lib/fit-engine.test.ts` — unit tests:
    - Fast path: short text at large `safeWmm` returns `sizePt === spec.sizePt`, `lines.length === 1`, `atFloor === false`, `overflow === false`.
    - Slow path: long text returns `sizePt < spec.sizePt` and `sizePt >= floorPt`.
    - Termination: total iterations ≤ `(spec.sizePt − floorPt) / SHRINK_STEP_PT + 1`.
    - `atFloor` iff `sizePt === floorPt`.
    - `overflow` only when even at floor the token exceeded `safeWmm` (hard-break invoked).
    - Determinism: two identical calls return deeply-equal FitResults.
  - **Outcome**: `npx vitest run src/lib/fit-engine.test.ts -t fitText` passes.
  - _Design: §Algorithm — Fit engine top-level, §Correctness Properties (Property 1)_
  - _Requirements: 2.1, 2.3, 2.4, 2.10_
  - _Prerequisite: Task 6.1_

- [ ] 7.1 **Property 5: fitText Termination & Monotonicity** — PBT
  - **File touched**: `src/lib/fit-engine.pbt.test.ts` — `∀ (text, spec.sizePt ∈ [floorPt, 48], safeWmm > 0, maxHeightMm > 0, floorPt ∈ [6, 12])`:
    - `result.sizePt ≤ spec.sizePt` and `result.sizePt ≥ floorPt`.
    - `every line.widthMm ≤ safeWmm` **OR** `result.overflow === true`.
    - `result.heightMm ≤ maxHeightMm` **OR** `result.overflow === true`.
    - `fitText(...) === fitText(...)` (deterministic).
  - **Outcome**: `npx vitest run src/lib/fit-engine.pbt.test.ts -t fitText` passes.
  - _Design: §Property-Based Tests, §Correctness Properties_
  - _Requirements: 2.1, 2.3, 2.4, 2.10_
  - _Prerequisite: Task 7_

- [ ] 8. Implement `allocateHeightBudget(dims, roles, qrMm, bannerHeightMm, padMm)` + unit test
  - **File touched**: `src/lib/fit-engine.ts` — implement per design §Algorithm (Height budget allocation). Two-pass: first assign each role its requested height; if `totalHeight ≤ freeH` return unchanged. Otherwise shrink in the order `["eventTitle", "meta", "org", "name"]` by `SHRINK_STEP_PT` until fits or every role hits its role floor from `FLOOR_PT_BY_ROLE`. Banner shrinks to 10 mm then hides only if every role at floor still overflows. `qrMm` and `QR_MIN_MM` are hard floors and never enter the shrink loop.
  - **File touched**: `src/lib/fit-engine.test.ts` — unit tests:
    - Unshrunken pass-through when total ≤ freeH.
    - Shrink order honored: `eventTitle` reduces before `name`.
    - `qrMm` returned equals `max(inputQrMm, QR_MIN_MM)` in every branch.
    - Sum of returned role budgets + `qrMm` + banner ≤ `safeH` when caller expects fit.
  - **Outcome**: `npx vitest run src/lib/fit-engine.test.ts -t allocateHeightBudget` passes.
  - _Design: §Algorithm — Height budget allocation_
  - _Requirements: 2.6, 2.7_
  - _Prerequisite: Task 7.1_

- [ ] 8.1 **Property 6: allocateHeightBudget QR Floor & Ordering** — PBT
  - **File touched**: `src/lib/fit-engine.pbt.test.ts` — `∀ (dims, roles with requested pts, qrMm, bannerHeightMm)`:
    - `budgets.qrMm ≥ QR_MIN_MM`.
    - Shrink priority monotonic: `eventTitle` reduction precedes `name` reduction across all runs with equal `freeH` deficits.
    - `sum(budgets.roles) + budgets.qrMm + budgets.banner ≤ safeH` **OR** every role reports `atFloor`.
  - **Outcome**: `npx vitest run src/lib/fit-engine.pbt.test.ts -t allocateHeightBudget` passes.
  - _Design: §Property-Based Tests_
  - _Requirements: 2.6, 2.7_
  - _Prerequisite: Task 8_

- [ ] 9. Implement `computeCenteringPadding(safeH, contentHeightMm, basePadMm, thermalOffset)` + unit test
  - **File touched**: `src/lib/fit-engine.ts` — implement per design §Algorithm (Optical centering). `slack = safeH − contentHeightMm`; `half = slack / 2`; `topMm = basePadMm + half + thermalOffset.topMm`; `botMm = basePadMm + half − thermalOffset.topMm`. Both values are millimeter values written into CSS `padding-top`/`padding-bottom`.
  - **File touched**: `src/lib/fit-engine.test.ts` — unit tests:
    - `thermalOffset = { topMm: 0, leftMm: 0 }` → `topMm === botMm`.
    - Symmetric-sum invariant: `topMm + botMm === safeH − contentHeightMm + 2 * basePadMm` for every input.
    - Non-negative outputs when `contentHeightMm ≤ safeH`.
    - Deterministic across identical inputs.
  - **Outcome**: `npx vitest run src/lib/fit-engine.test.ts -t computeCenteringPadding` passes.
  - _Design: §Algorithm — Optical centering_
  - _Requirements: 2.5, 2.6, 2.11_
  - _Prerequisite: Task 8.1_

- [ ] 9.1 **Property 7: computeCenteringPadding Symmetric-Sum Invariant** — PBT
  - **File touched**: `src/lib/fit-engine.pbt.test.ts` — `∀ (safeH ≥ 0, contentHeightMm ≤ safeH, basePadMm ≥ 0, offsetTopMm)`:
    - `|topMm − botMm − 2 × offsetTopMm| < 1e-9` (exactness).
    - `topMm + botMm === safeH − contentHeightMm + 2 × basePadMm` (within floating-point epsilon).
  - **Outcome**: `npx vitest run src/lib/fit-engine.pbt.test.ts -t computeCenteringPadding` passes.
  - _Design: §Property-Based Tests_
  - _Requirements: 2.6, 2.11_
  - _Prerequisite: Task 9_

- [ ] 10. Implement `hardSplit(word, spec, safeWmm)` + unit test
  - **File touched**: `src/lib/fit-engine.ts` — implement per design §Algorithm. Grapheme-cluster boundaries via `Intl.Segmenter("und", { granularity: "grapheme" })` when available; ASCII code-point split otherwise. Emit consecutive `FitLine[]` such that every returned segment's `widthMm ≤ safeWmm`. Combining marks and emoji sequences stay together. Wire this into `greedyWrap`'s previously-stubbed `hardBreak = true` path.
  - **File touched**: `src/lib/fit-engine.test.ts` — unit tests:
    - ASCII long token `"supercalifragilisticexpialidocious1234567890"` splits into ≥ 2 lines, each ≤ `safeWmm`.
    - Grapheme cluster preserved: `"e\u0301"` (e + combining acute) never split.
    - Emoji flag sequences (`"🇺🇸"`) never split.
    - Deterministic across identical inputs.
  - **Outcome**: `npx vitest run src/lib/fit-engine.test.ts -t hardSplit` passes. `greedyWrap` PBT (6.1) re-run with `hardBreak = true` also passes.
  - _Design: §Algorithm — Greedy wrap, §Correctness Properties_
  - _Requirements: 2.1, 2.4_
  - _Prerequisite: Task 9.1_

- [ ] 10.1 **Property 8: hardSplit Never Clips a Grapheme** — PBT
  - **File touched**: `src/lib/fit-engine.pbt.test.ts` — `∀ (word, spec, safeWmm ≥ measureTextMm("W", spec))`:
    - Every returned segment `widthMm ≤ safeWmm`.
    - Concatenating segments' text yields the original `word` (grapheme-preserving).
    - No segment ends inside a grapheme cluster (verified via `Intl.Segmenter` on each segment boundary).
  - **Outcome**: `npx vitest run src/lib/fit-engine.pbt.test.ts -t hardSplit` passes.
  - _Design: §Property-Based Tests_
  - _Requirements: 2.1, 2.4_
  - _Prerequisite: Task 10_

- [ ] 11. Implement `ensureFontsLoaded(tuples)` + unit test
  - **File touched**: `src/lib/fit-engine.ts` — implement per design §Font Loading Prerequisite: idempotent `<link rel="stylesheet">` injection into parent `document.head` keyed by URL; `await Promise.all(tuples.map(t => document.fonts.load(...)))`; `await document.fonts.ready`; on failure, mark `measureTextMm` cache to add `MEASUREMENT_SAFETY_PAD_MM` per width.
  - **File touched**: `src/lib/fit-engine.test.ts` — unit tests (jsdom-shimmed):
    - Idempotent link injection: calling twice with the same URL emits exactly one `<link>` node.
    - Resolves when `document.fonts.load` and `document.fonts.ready` both resolve.
    - On rejected `document.fonts.load`, `measureTextMm` subsequently adds `MEASUREMENT_SAFETY_PAD_MM` (assert via the injectable canvas mock).
  - **Outcome**: `npx vitest run src/lib/fit-engine.test.ts -t ensureFontsLoaded` passes.
  - _Design: §Font Loading Prerequisite_
  - _Requirements: 2.9, 2.10_
  - _Prerequisite: Task 10.1_

- [ ] 12. Migrate `buildPrintHtml` return shape to `Promise<{ html: string; warnings: FitWarning[] }>`
  - **File touched**: `src/lib/print-badges.ts` — change `buildPrintHtml` signature to `Promise<{ html; warnings }>`. Populate `warnings: []` for now (no fit engine wiring yet — that lands per-renderer). Import `FitWarning` type from `fit-engine.ts`.
  - **File touched**: `src/lib/print-badges.ts` (`printBadges`) — destructure `const { html } = await buildPrintHtml(...)`; ignore `warnings`. Return type of `printBadges` stays `Promise<void>`.
  - **File touched**: `src/components/event/registrations/PrintBadgesDialog.tsx` (`refreshPreview` only) — destructure `const { html } = await buildPrintHtml(...)`; do not surface warnings yet (Task 18 adds the pill).
  - **File touched**: `src/lib/print-badges.preservation.test.ts` — update snapshot invocation to `(await buildPrintHtml(...)).html`. **Snapshot content must NOT change** — HTML must be byte-identical to Task 3's baseline.
  - **Outcome**: `npx vitest run src/lib/print-badges.preservation.test.ts` passes with the baseline snapshot intact. Preservation invariant holds. `npm run build` type-checks the new signature at every call site.
  - _Design: §Architecture, §Data Model / Type Changes, §Files to Change (`buildPrintHtml`)_
  - _Requirements: 2.4, 2.9, 3.1_
  - _Prerequisite: Task 11_

- [ ] 13. Modify `renderDefaultBadge` — thread fit through name/event/org/meta, replace elastic divider, apply centering padding, thread QR floor
  - **File touched**: `src/lib/print-badges.ts` (`renderDefaultBadge` only). Do NOT touch `renderName`, `renderTextElement`, `renderDesignedFace`, `buildCalibrationHtml`, or `SHEET_CSS` in this task.
  - Steps (each maps to a design §Files to Change item under `renderDefaultBadge`):
    - Remove `namePt` / `eventPt` / `orgPt` / `metaPt` clamp-only derivations.
    - Compute `safeW = dims.w − 2 × MIN_PAD_MM`, `safeH = dims.h − 2 × MIN_PAD_MM`.
    - Call `allocateHeightBudget(dims, roles, qrMm, bannerHeightMm, padMm)` for the enabled roles.
    - For each role, call `fitText(text, spec, safeW, budget[role], FLOOR_PT_BY_ROLE[role])`.
    - Emit `<div class="name" style="width:${safeW}mm;max-width:${safeW}mm">` with lines joined by `<br/>` (design §Files to Change).
    - Replace `.card.basic .divider { margin:auto 0 }` with fixed `margin:${gapMm}mm 0` inside a locally scoped style block (no change to `SHEET_CSS`).
    - Change `.body { justify-content: flex-start }` → `justify-content: center`; add computed `padding-top:${topMm}mm; padding-bottom:${botMm}mm` from `computeCenteringPadding(safeH, contentHeightMm, basePadMm, opts.thermalOffset ?? {topMm:0,leftMm:0})`.
    - Clamp `qrMm` to `QR_MIN_MM` before pixel-count derivation via existing `qrPixelSizeForMm(mm, thermalDpi)`.
    - Push `FitWarning[]` from each role's `FitResult` (when `atFloor` or `overflow`) onto the top-level `warnings` array.
  - **Preservation gate**: `npx vitest run src/lib/print-badges.preservation.test.ts` MUST still pass. Short-fit inputs must produce byte-identical HTML (fast path returns unchanged FontSpec and skips wrap/padding recomputation when `¬isBugCondition`).
  - **Design regressions defended**: 3.2 (`SHEET_CSS` untouched), 3.3 (`buildCalibrationHtml` untouched), 3.4 (`qrPixelSizeForMm` reused), 3.5 (thermal B/W CSS block emitted last, unchanged), 3.8 (`.card:not(:last-child){page-break-after:always}` unchanged — padding on `.body` not `.card`).
  - _Design: §Files to Change — `renderDefaultBadge`, §Hypothesized Root Cause items 1–3, §Regression Risks 3.2, 3.3, 3.4, 3.5, 3.8_
  - _Requirements: 1.1, 1.2, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.10, 3.1, 3.4, 3.5, 3.8_
  - _Prerequisite: Task 12_

- [ ] 14. Modify `renderName` — thread fit through name + company inside each preset shell; preset templates untouched
  - **File touched**: `src/lib/print-badges.ts` (`renderName` only). Do NOT modify the `NAME_DESIGNS` preset selection logic, the accent-band markup, the monogram initial, the ticket-stub divider, or the event-card header shell (design §Regression Risks 3.9).
  - Steps:
    - Compute `safeW = dims.w − 2 × MIN_PAD_MM − 2 × preset.paddingMm`.
    - `nameFit = fitText(name, nameSpec, safeW, budget.name, FLOOR_PT_BY_ROLE.nameLabel)`.
    - `companyFit = fitText(company, companySpec, safeW, budget.company, FLOOR_PT_BY_ROLE.companyLabel)`.
    - Emit resolved point sizes and `<br/>`-joined lines inside the preset's existing `<div>` shell; add inline `max-width:${safeW}mm; word-break:break-word` on the name/company `<div>`s.
    - Push any `atFloor` / `overflow` FitWarnings.
  - **Preservation gate**: `npx vitest run src/lib/print-badges.preservation.test.ts` remains green. Every `NameDesignId` × short-name case snapshot must equal Task 3's baseline byte-for-byte.
  - _Design: §Files to Change — `renderName`, §Regression Risks 3.9_
  - _Requirements: 1.7, 2.1, 2.2, 2.3, 2.5, 3.1, 3.9_
  - _Prerequisite: Task 13_

- [ ] 15. Modify `renderTextElement` — new `maxWidthMm` parameter, emit width-constrained CSS
  - **File touched**: `src/lib/print-badges.ts` (`renderTextElement` only). Signature grows a required `maxWidthMm: number` parameter.
  - Emitted inline style adds: `max-width:${maxWidthMm}mm; white-space:normal; word-break:break-word; overflow-wrap:anywhere`. Existing declarations (`left`, `top`, `transform:translate(-50%,-50%)`, `font-family`, `font-weight`, `font-style`, `font-size`, `color`, `text-align`, `text-decoration`, `letter-spacing`, `transform: scaleX(...)`) preserved verbatim.
  - **Design regressions defended**: 3.6 (every FontStyle override still emitted), 3.7 (`left`/`top` percentages untouched — max-width is size-only, not position).
  - **Preservation gate**: The designer-anchor case in Task 3 snapshot MUST stay green. Because the caller (`renderDesignedFace`) isn't yet computing per-element `maxWidthMm`, this task passes a temporary `Infinity` (or `dims.w`) so the emitted `max-width` degenerates to the safe width, and short-fit strings produce the same visible box. Verify snapshot.
  - _Design: §Files to Change — `renderTextElement`, §Regression Risks 3.6, 3.7_
  - _Requirements: 1.6, 2.1, 2.5, 2.8, 3.6, 3.7_
  - _Prerequisite: Task 14_

- [ ] 16. Modify `renderDesignedFace` — compute per-element `maxWidthMm`, call `fitText`, emit
  - **File touched**: `src/lib/print-badges.ts` (`renderDesignedFace` only).
  - For each enabled text element in `design.elements`:
    - Resolve FontSpec from the element's stored size, family, weight, italic.
    - Compute `maxWidthMm` from `el.x`, `el.align`, and the safe area (design §Files to Change — `renderDesignedFace`): e.g. `align="center"` → `2 × min(el.x, 100 − el.x) × (safeW / 100)`; `align="left"` → `(100 − el.x) × (safeW / 100)`; `align="right"` → `el.x × (safeW / 100)`.
    - Call `fitText(el.text, spec, maxWidthMm, heightBudget, FLOOR_PT_BY_ROLE[roleForElement(el)])`.
    - Call `renderTextElement(el, fitResult, maxWidthMm)` (Task 15's new signature) — emit lines separated by `<br/>`.
    - Post-clamp designer QR side to `QR_MIN_MM` before pixel conversion.
    - Push FitWarnings.
  - **Preservation gate**: designer-anchor short-fit snapshot from Task 3 stays green (fast path returns unchanged FontSpec, single line, so emitted HTML is byte-identical modulo the new `max-width` declaration — which the snapshot MUST accept because it was captured under Task 15's degenerate `Infinity`/`dims.w` path. Coordinate: the Task 3 baseline snapshot needs to have been captured *after* Task 15's degenerate emit lands — since Task 3 ran on unmodified code, verify here that the byte-diff introduced by Task 15/16 is confined to non-buggy inputs only via a targeted comparison; if the safe-max-width string differs, update the snapshot with a documented one-line note tying the diff to design §Files to Change).
  - _Design: §Files to Change — `renderDesignedFace`, §Regression Risks 3.7_
  - _Requirements: 1.6, 2.1, 2.2, 2.3, 2.8, 3.7_
  - _Prerequisite: Task 15_

- [ ] 17. `PrintBadgesDialog` — thermal offset persistence (`PrintOptions.thermalOffset`)
  - **File touched**: `src/components/event/registrations/PrintBadgesDialog.tsx`.
  - Extend the local `Prefs` type with optional `thermalOffset?: { topMm: number; leftMm: number }`.
  - Add two number inputs `topMm` and `leftMm` gated behind `thermalMode || isThermalSize`. Labels: "Thermal offset — top (mm)" and "Thermal offset — left (mm)".
  - Wire input values into `PrintOptions.thermalOffset` passed to `buildPrintHtml` and `printBadges`.
  - Persist to `localStorage` under existing `PREF_KEY = "lovable.print-badges.v2"`; existing blobs without `thermalOffset` load as `undefined` and preserve current behavior (design §Data Model — backward-compatible).
  - **File touched**: `src/lib/print-badges.ts` — add optional `thermalOffset?: { topMm: number; leftMm: number }` to `PrintOptions` type (already referenced by Task 13).
  - **Preservation gate**: `npx vitest run src/lib/print-badges.preservation.test.ts` remains green — `thermalOffset === undefined` path emits identical HTML.
  - _Design: §Data Model / Type Changes, §Files to Change — `PrintBadgesDialog`_
  - _Requirements: 2.11, 3.1_
  - _Prerequisite: Task 16_

- [ ] 18. `PrintBadgesDialog` — warning pill surface
  - **File touched**: `src/components/event/registrations/PrintBadgesDialog.tsx`.
  - After `refreshPreview` (which now destructures `{ html, warnings }`), store `warnings` in state. When non-empty, render a small pill above the iframe listing `{role, text}` for each warning: "Some text was shrunk to fit: `<role>` — `<text>`". Pill disappears when `warnings.length === 0`.
  - Do NOT alter the iframe or the print flow itself.
  - **Preservation gate**: no HTML change to `buildPrintHtml` output. Preservation test still green.
  - _Design: §Files to Change — `PrintBadgesDialog`_
  - _Requirements: 2.4, 2.9_
  - _Prerequisite: Task 17_

- [ ] 19. Modify `BadgeDesignerCanvas` — WYSIWYG parity (last implementation task per constraint)
  - **File touched**: `src/components/event/registrations/BadgeDesignerCanvas.tsx`.
  - Remove `whiteSpace: "nowrap"` from every text-element inline style.
  - Add `maxWidth` in **pixels** equal to `maxWidthMm × PX_PER_MM × scale` from the same formula the print path uses in Task 16. `PX_PER_MM = 96 / 25.4`; `scale` is the current canvas zoom factor.
  - This is a WYSIWYG-only change: no fit engine call from the canvas. The user's stored `el.size` (pt) is honored as-is; wrap/shrink runs at print time only.
  - **Preservation gate**: no `print-badges.ts` change; Task 3 snapshot remains green.
  - _Design: §Files to Change — `BadgeDesignerCanvas`_
  - _Requirements: 2.9, 3.7_
  - _Prerequisite: Task 18_

- [ ] 20. Fix-validation browser tests — Playwright (optical centering + preview parity)
  - **File touched**: `tests/badge-fit.spec.ts` — extend with two new `test(...)` blocks. Existing Task 1 tests now revalidate as Property 1: Expected Behavior (see Task 21).

  - [ ] 20.1 Optical centering — every thermal size
    - **Property 9: Optical Centering** — `∀ size ∈ {thermal-50, thermal-58, thermal-80, thermal-100, thermal-4x6}` × `mode ∈ {badge, name}`:
      - Render `buildPrintHtml(...).html` into a page after `document.fonts.ready`.
      - Measure `topGapMm` = distance from `.card` inner top edge to first content element; `bottomGapMm` = distance from last content element to `.card` inner bottom edge.
      - Assert `|topGapMm − bottomGapMm| ≤ CENTER_TOLERANCE_MM` (0.5 mm).
    - **How to run**: `npx playwright test tests/badge-fit.spec.ts -g "Optical Centering"`
    - _Design: §Correctness Properties (Property 1), §Browser Tests_
    - _Requirements: 2.6, 2.11_

  - [ ] 20.2 Preview parity — iframe DOM equals headless print DOM
    - Render `buildPrintHtml(...).html` into the dialog iframe **and** into a headless print page. After `document.fonts.ready` on both, assert both DOMs are structurally equal (compare `outerHTML` after a normalization pass that strips reactive attributes).
    - **How to run**: `npx playwright test tests/badge-fit.spec.ts -g "Preview Parity"`
    - _Design: §Correctness Properties (Property 1), §Browser Tests, §Font Loading Prerequisite_
    - _Requirements: 2.9, 2.10_

  - _Prerequisite: Task 19_

- [ ] 21. Full verification checkpoint
  - **Property 1: Expected Behavior** — Re-run the four exploratory tests from Task 1. **DO NOT write new tests.** The same assertions from Task 1 must now PASS on the fixed code:
    - `npx playwright test tests/badge-fit.spec.ts --project=chromium`
    - Every counterexample from the photos now renders inside the safe area, at or above the role legibility floor, with `.qr-wrap` fully inside the label.
  - **Property 2: Preservation** — Re-run the snapshot baseline from Task 3. **DO NOT update snapshots.** Every "already-fits" case must remain byte-identical:
    - `npx vitest run src/lib/print-badges.preservation.test.ts`
  - Run the full test suites:
    - `npm test` (all Vitest — unit + PBT + preservation)
    - `npx playwright test` (all browser tests including optical centering and preview parity)
  - Verify each acceptance criterion below is satisfied by the passing suites:
    - No glyph of any text value is clipped on any preset size × mode (2.1).
    - Wrap-then-shrink priority honored (2.2, 2.3).
    - At-floor overflow surfaces a warning pill and still prints (2.4, 2.9).
    - `MIN_PAD_MM = 2.5 mm` maintained on all four edges every size (2.5).
    - `|topGapMm − bottomGapMm| ≤ 0.5 mm` on every thermal size (2.6, 2.11).
    - `qrSideMm ≥ QR_MIN_MM = 14 mm` (2.7).
    - Designer face elements constrained to safe area; relative positions preserved (2.8, 3.7).
    - Deterministic — two invocations of `buildPrintHtml` with identical input produce identical HTML string (2.10).
    - Non-buggy inputs produce byte-identical HTML to pre-fix baseline (3.1–3.9).
    - `buildCalibrationHtml` unchanged (3.3); `SHEET_CSS` unchanged (3.2); `qrPixelSizeForMm` DPI derivation unchanged (3.4); thermal B/W CSS block unchanged (3.5); `NAME_DESIGNS` preset shells unchanged (3.9); `.card:not(:last-child){page-break-after:always}` unchanged (3.8).
  - Ensure all tests pass; if any assertion fails, halt and report to the user rather than mutating snapshots or acceptance criteria.
  - _Design: §Correctness Properties, §Testing Strategy, §Regression Risks and Mitigations_
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_
  - _Prerequisite: Task 20_
