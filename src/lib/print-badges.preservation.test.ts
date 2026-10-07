/**
 * Preservation baseline for `buildPrintHtml` and `buildCalibrationHtml`.
 *
 * Snapshots the CURRENT unmodified renderer output for every "already-fits"
 * corpus case listed in `.kiro/specs/thermal-badge-centering/design.md`
 * (§Preservation Checking). Every downstream task in the bugfix — from
 * the fit engine wiring through the renderer changes and dialog updates —
 * MUST keep these snapshots byte-identical, which is how bugfix.md §3.x
 * (Unchanged Behavior) is enforced automatically.
 *
 * Corpus, per design.md §Preservation Checking:
 *   - Short-fit identity: name="Jane Doe", company="Acme Inc." on every
 *     preset size × mode ∈ {badge, name}.
 *   - Calibration path: `buildCalibrationHtml` for every preset size × DPI
 *     in {undefined, 203, 300}.
 *   - Font-override: representative FontStyle override applied to a short
 *     name.
 *   - Designer-anchor: BadgeDesign with elements.name.{x:30, y:42} and a
 *     short name.
 *   - Copies=3: locks in the `page-break-after` behavior.
 *
 * NOTE: This file uses `toMatchSnapshot` (inline snapshots would be too
 * noisy at ~50k characters). The first run creates
 * `__snapshots__/print-badges.preservation.test.ts.snap`, which is committed
 * as part of Task 3's deliverable. Subsequent tasks re-run
 * `npx vitest run src/lib/print-badges.preservation.test.ts` and MUST see
 * the snapshot pass unchanged.
 *
 * Task 3 of the thermal-badge-centering bugfix (.kiro/specs).
 */
import { beforeAll, describe, expect, it } from "vitest";

// Mock qrcode to a deterministic data-URL so snapshots don't churn on
// (essentially random) QR modules — real payload equality is verified
// elsewhere by the Playwright browser tests.
import { vi } from "vitest";
vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn(async (payload: string) => `data:image/png;base64,QR(${payload})`),
  },
}));

import {
  buildCalibrationHtml,
  buildPrintHtml,
  type BadgeData,
  type PrintOptions,
  type PrintSize,
} from "./print-badges";
import { defaultDesign, type BadgeDesign } from "./badge-design";

// ─── Shared fixtures ──────────────────────────────────────────────────────

/**
 * A short "already-fits" badge used across every preservation case. Every
 * text value here is short enough to fit within the safe area of the
 * smallest preset (thermal-50, 50×80 mm) at the default point sizes, so
 * `isBugCondition(X)` returns false for every corpus row.
 */
const SHORT_BADGE: BadgeData = {
  name: "Jane Doe",
  company: "Acme Inc.",
  email: "jane@acme.example",
  title: "PM",
  ticket_type: "VIP",
  qr_payload: "https://ev.example/j",
  event_title: "DemoConf",
  org_name: "Acme",
  event_date_text: "Jul 4",
  event_location_text: "Hall A",
  banner_url: null,
};

/**
 * Every non-custom preset size defined in `PrintSize`. `"custom"` is
 * exercised separately with a fixed 4×3-in payload.
 */
const PRESET_SIZES: readonly PrintSize[] = [
  "a6",
  "a4-2up",
  "avery-3x8",
  "thermal-50",
  "thermal-58",
  "thermal-80",
  "thermal-100",
  "thermal-4x6",
] as const;

/**
 * A representative FontStyle override that exercises every field
 * `renderDefaultBadge` reads from `opts.font`. Chosen so downstream
 * renderer edits cannot silently drop a field: any missing decoration or
 * transform is caught by the snapshot diff.
 */
const FULL_FONT_OVERRIDE: NonNullable<PrintOptions["font"]> = {
  family: "Merriweather",
  sizePt: 22,
  companySizePt: 14,
  bold: true,
  italic: true,
  underline: true,
  strikethrough: false,
  color: "#123456",
  align: "left",
  wordSpacingPt: 2,
  scalePct: 90,
};

/**
 * A BadgeDesign with the name element re-anchored to (30, 42). The rest of
 * the elements retain their defaults so the snapshot exercises the full
 * designer render path (`renderDesignedFace` + `renderTextElement`).
 */
function designerAnchoredDesign(): BadgeDesign {
  const d = defaultDesign();
  d.elements.name.x = 30;
  d.elements.name.y = 42;
  return d;
}

// ─── Corpus 1: short-fit identity across every preset size × mode ─────────

describe("preservation baseline — short-fit identity", () => {
  for (const size of PRESET_SIZES) {
    for (const mode of ["badge", "name"] as const) {
      it(`renders identically for size=${size} mode=${mode}`, async () => {
        const { html, warnings } = await buildPrintHtml([SHORT_BADGE], {
          mode,
          size,
          copies: 1,
          eventTitle: "DemoConf",
        });
        // Short-fit inputs never surface a fit warning (bugfix.md 3.1).
        expect(warnings).toEqual([]);
        expect(html).toMatchSnapshot();
      });
    }
  }

  it("renders identically for size=custom 4x3in mode=badge", async () => {
    const { html, warnings } = await buildPrintHtml([SHORT_BADGE], {
      mode: "badge",
      size: "custom",
      custom: { width: 4, height: 3, unit: "in" },
      copies: 1,
      eventTitle: "DemoConf",
    });
    expect(warnings).toEqual([]);
    expect(html).toMatchSnapshot();
  });

  it("renders identically for size=custom 4x3in mode=name", async () => {
    const { html, warnings } = await buildPrintHtml([SHORT_BADGE], {
      mode: "name",
      size: "custom",
      custom: { width: 4, height: 3, unit: "in" },
      copies: 1,
      eventTitle: "DemoConf",
    });
    expect(warnings).toEqual([]);
    expect(html).toMatchSnapshot();
  });
});

// ─── Corpus 2: calibration path (design.md §Regression Risks 3.3) ─────────

describe("preservation baseline — calibration path", () => {
  for (const size of PRESET_SIZES) {
    for (const dpi of [undefined, 203, 300] as const) {
      it(`renders identically for calibration size=${size} dpi=${dpi ?? "unset"}`, async () => {
        const html = await buildCalibrationHtml({ size, thermalDpi: dpi });
        expect(html).toMatchSnapshot();
      });
    }
  }
});

// ─── Corpus 3: font override (design.md §Regression Risks 3.6) ────────────

describe("preservation baseline — font override applied to short name", () => {
  it("renders identically for a full FontStyle override on thermal-4x6 badge mode", async () => {
    const { html, warnings } = await buildPrintHtml([SHORT_BADGE], {
      mode: "badge",
      size: "thermal-4x6",
      copies: 1,
      eventTitle: "DemoConf",
      font: FULL_FONT_OVERRIDE,
    });
    expect(warnings).toEqual([]);
    expect(html).toMatchSnapshot();
  });

  it("renders identically for a full FontStyle override on a4-2up name mode", async () => {
    const { html, warnings } = await buildPrintHtml([SHORT_BADGE], {
      mode: "name",
      size: "a4-2up",
      copies: 1,
      eventTitle: "DemoConf",
      font: FULL_FONT_OVERRIDE,
    });
    expect(warnings).toEqual([]);
    expect(html).toMatchSnapshot();
  });
});

// ─── Corpus 4: designer-anchor (design.md §Regression Risks 3.7) ──────────

describe("preservation baseline — designer element anchors", () => {
  it("renders identically for a design with elements.name anchored at (30,42) on thermal-4x6", async () => {
    const { html, warnings } = await buildPrintHtml([SHORT_BADGE], {
      mode: "badge",
      size: "thermal-4x6",
      copies: 1,
      eventTitle: "DemoConf",
      design: designerAnchoredDesign(),
    });
    expect(warnings).toEqual([]);
    expect(html).toMatchSnapshot();
  });
});

// ─── Corpus 5: copies=3 (design.md §Regression Risks 3.8) ─────────────────

describe("preservation baseline — copies=3 page-break behavior", () => {
  it("renders identically for copies=3 on thermal-4x6 badge mode", async () => {
    const { html, warnings } = await buildPrintHtml([SHORT_BADGE], {
      mode: "badge",
      size: "thermal-4x6",
      copies: 3,
      eventTitle: "DemoConf",
    });
    expect(warnings).toEqual([]);
    expect(html).toMatchSnapshot();
  });

  it("renders identically for copies=3 on a4-2up badge mode", async () => {
    const { html, warnings } = await buildPrintHtml([SHORT_BADGE], {
      mode: "badge",
      size: "a4-2up",
      copies: 3,
      eventTitle: "DemoConf",
    });
    expect(warnings).toEqual([]);
    expect(html).toMatchSnapshot();
  });
});

// ─── Sanity — the fixtures do not spuriously trigger the fit condition ────

describe("preservation baseline — fixture sanity", () => {
  it("short-badge name fits within thermal-50 safe width at default point size", () => {
    // Poppins 800 at 11.2pt (renderDefaultBadge's clamp for thermal-50 height
    // 80mm) renders "Jane Doe" at ~13mm — well within 45mm safeW.
    // This assertion is a smoke check: if a future refactor causes SHORT_BADGE
    // to accidentally exceed the safe width, all downstream snapshot cases
    // become bug-condition inputs and preservation loses meaning.
    expect(SHORT_BADGE.name.length).toBeLessThanOrEqual(12);
    expect((SHORT_BADGE.company ?? "").length).toBeLessThanOrEqual(12);
  });
});

// ─── Environment stubs for JSDOM ──────────────────────────────────────────

beforeAll(() => {
  // buildPrintHtml constructs URLs referencing Google Fonts. The current
  // implementation only serialises them into an HTML string (no network I/O
  // in the parent doc), so no stubbing is required at this baseline. This
  // hook is a placeholder for future tasks that add font-loading to the
  // parent document.
});
