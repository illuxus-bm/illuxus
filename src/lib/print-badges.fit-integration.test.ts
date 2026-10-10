/**
 * Integration tests: `buildPrintHtml` end-to-end with the fit engine
 * exercised via a real (mock-ruler) canvas measurement.
 *
 * The preservation snapshot suite (`print-badges.preservation.test.ts`)
 * verifies short-fit inputs render byte-identical to the pre-fix baseline;
 * this suite verifies the OTHER side of the fix — that LONG values
 * (bug-condition inputs) actually trigger reflow, that warnings surface,
 * and that the emitted HTML contains the expected `<br/>` joins and
 * shrunk point sizes.
 *
 * Uses the fit-engine's `__setContextForTesting` seam to install a linear
 * ruler (each character `sizePt × 0.5 mm` wide). This is font-independent
 * and deterministic, so the tests are stable across environments.
 *
 * Task 21 supporting evidence.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn(async (payload: string) => `data:image/png;base64,QR(${payload})`),
  },
}));

import {
  buildPrintHtml,
  bandTextColor,
  DEFAULT_BAND_COLORS,
  participantLabel,
  sanitizeBandColors,
  type BadgeData,
} from "./print-badges";
import {
  __resetContextForTesting,
  __setContextForTesting,
  MM_PER_CSS_PX,
} from "./fit-engine";

// ─── Test setup ──────────────────────────────────────────────────────────

function installRuler() {
  __setContextForTesting({
    font: "",
    measureText(text: string) {
      const match = /(\d+(?:\.\d+)?)pt/.exec(this.font);
      const sizePt = match ? parseFloat(match[1]!) : 12;
      // 0.5 mm per character per pt — matches unit-test ruler.
      return { width: (text.length * sizePt * 0.5) / MM_PER_CSS_PX };
    },
  });
}

beforeEach(() => installRuler());
afterEach(() => __resetContextForTesting());

// ─── Long-name bug condition ──────────────────────────────────────────────

const LONG_NAME_BADGE: BadgeData = {
  name: "Aakarshan Singh Chadha", // 22 chars — far wider than a 50mm label at any legible size
  company: "Infomerics Valuations and Ratings",
  email: "aakarshan@example.com",
  ticket_type: "VIP",
  qr_payload: "https://ev.example/a",
  event_title: "TestConf",
  org_name: "Test Org",
  event_date_text: "Sep 5",
  event_location_text: "Hall A",
  banner_url: null,
};

/** A narrow custom label (50 × 80 mm) so long values are forced to reflow. */
const NARROW = { size: "custom" as const, custom: { width: 50, height: 80, unit: "mm" as const } };

describe("previewFit — on-screen fit-to-viewport scoping", () => {
  it("emits the @media screen fit block when previewFit is true", async () => {
    const { html } = await buildPrintHtml([LONG_NAME_BADGE], {
      mode: "badge",
      size: "a4-4up",
      copies: 1,
      eventTitle: "TestConf",
      previewFit: true,
    });
    expect(html).toContain("@media screen");
    // a4-4up badges are 105mm wide -> 105 * 96/25.4 = 396.85 CSS px.
    expect(html).toContain("396.85px");
    expect(html).toContain("transform-origin:center center");
  });

  it("does NOT emit the @media screen fit block on real print paths", async () => {
    // printBadges / printCalibration never set previewFit — the print
    // document must stay 1:1 mm-accurate and remain scrollable in the
    // popup when it contains many stacked cards.
    const { html } = await buildPrintHtml([LONG_NAME_BADGE], {
      mode: "badge",
      size: "a4-4up",
      copies: 1,
      eventTitle: "TestConf",
    });
    expect(html).not.toContain("@media screen");
  });

  it("scales to fit BOTH axes so a tall label is not cropped vertically", async () => {
    // thermal-4x6 is 101.6 x 152.4 mm -> 384.00 x 576.00 CSS px. The height
    // term must be present so a tall label fits the pane's height too.
    const { html } = await buildPrintHtml([LONG_NAME_BADGE], {
      mode: "badge",
      size: "thermal-4x6",
      copies: 1,
      eventTitle: "TestConf",
      previewFit: true,
    });
    expect(html).toContain("calc(100vw / 384.00px)");
    expect(html).toContain("calc(100vh / 576.00px)");
  });

  it("never upscales — the min() is capped at 1", async () => {
    const { html } = await buildPrintHtml([LONG_NAME_BADGE], {
      mode: "badge",
      ...NARROW,
      copies: 1,
      eventTitle: "TestConf",
      previewFit: true,
    });
    // The trailing `, 1)` in min(...) prevents scaling a small label above 1x.
    expect(html).toMatch(/min\(calc\(100vw \/ [\d.]+px\), calc\(100vh \/ [\d.]+px\), 1\)/);
  });

  it("keeps the QR image bounded by its wrapper in the designer path", async () => {
    const { defaultDesign } = await import("./badge-design");
    const design = defaultDesign();
    const { html } = await buildPrintHtml([LONG_NAME_BADGE], {
      mode: "badge",
      size: "thermal-4x6",
      copies: 1,
      eventTitle: "TestConf",
      design,
      previewFit: true,
    });
    // The wrapper carries the mm box and the img fills it at 100% — so a
    // large-DPI bitmap can never render at its natural pixel size.
    expect(html).toMatch(/class="el qr"[^>]*width:\d+(\.\d+)?mm;height:\d+(\.\d+)?mm/);
    expect(html).toContain('style="width:100%;height:100%;display:block"');
    expect(html).toContain("max-width:100%;max-height:100%;object-fit:contain");
  });
});

describe("default badge layout — banner, name, company, participant band", () => {
  it("renders the event banner as the edge-to-edge header", async () => {
    const { html } = await buildPrintHtml(
      [{ ...LONG_NAME_BADGE, banner_url: "https://cdn.example/banner.png" }],
      { mode: "badge", size: "thermal-4x5", copies: 1 },
    );
    expect(html).toMatch(/<img class="banner" src="https:\/\/cdn\.example\/banner\.png"/);
    // Banner first, then body, then the participant band.
    expect(html.indexOf('<img class="banner"')).toBeLessThan(html.indexOf('<div class="body"'));
    expect(html.indexOf('<div class="body"')).toBeLessThan(html.indexOf('<div class="ptype"'));
  });

  it("falls back to an event-title header when the event has no banner", async () => {
    const { html } = await buildPrintHtml([LONG_NAME_BADGE], { mode: "badge", size: "thermal-4x5", copies: 1 });
    expect(html).toMatch(/<div class="banner placeholder"[^>]*>TestConf<\/div>/);
  });

  it("prints the participant type in the band, defaulting to Attendee", async () => {
    const speaker = await buildPrintHtml(
      [{ ...LONG_NAME_BADGE, participant_type: "Speaker" }],
      { mode: "badge", size: "thermal-4x5", copies: 1 },
    );
    expect(speaker.html).toMatch(/<div class="ptype"[^>]*>SPEAKER<\/div>/);
    const unset = await buildPrintHtml([LONG_NAME_BADGE], { mode: "badge", size: "thermal-4x5", copies: 1 });
    expect(unset.html).toMatch(/<div class="ptype"[^>]*>ATTENDEE<\/div>/);
  });

  it("keeps the banner on label sizes and only greys it out in black & white mode", async () => {
    const badge = { ...LONG_NAME_BADGE, banner_url: "https://cdn.example/banner.png" };
    const colour = await buildPrintHtml([badge], { mode: "badge", size: "thermal-4x5", copies: 1 });
    expect(colour.html).not.toContain("grayscale");
    const bw = await buildPrintHtml([badge], { mode: "badge", size: "thermal-4x5", copies: 1, thermalMode: true });
    expect(bw.html).toContain(".card.basic .banner { filter: grayscale(1)");
    expect(bw.html).not.toMatch(/\.banner[^{]*\{[^}]*display:\s*none/);
  });

  it("only adds the QR code when asked", async () => {
    const without = await buildPrintHtml([LONG_NAME_BADGE], { mode: "badge", size: "thermal-4x5", copies: 1 });
    expect(without.html).not.toContain('class="qr-wrap"');
    const withQr = await buildPrintHtml([LONG_NAME_BADGE], { mode: "badge", size: "thermal-4x5", copies: 1, showQr: true });
    expect(withQr.html).toContain('class="qr-wrap"');
  });

  it("tiles four badges per A4 sheet and prints label sizes one per page", async () => {
    const sheet = await buildPrintHtml([LONG_NAME_BADGE], { mode: "badge", size: "a4-4up", copies: 4 });
    expect(sheet.html).toContain("@page { size: A4 portrait; margin: 0 }");
    expect(sheet.html).toContain("grid-template-columns:repeat(2,105mm)");
    const label = await buildPrintHtml([LONG_NAME_BADGE], { mode: "badge", size: "thermal-4x5", copies: 1 });
    expect(label.html).toContain("@page { size: 101.60mm 127.00mm; margin: 0 }");
  });
});

describe("participantLabel", () => {
  it("maps speakers and sponsors, and keeps named ticket types for attendees", () => {
    expect(participantLabel("speaker", "general")).toBe("Speaker");
    expect(participantLabel("sponsor", "sponsor")).toBe("Partner");
    expect(participantLabel("attendee", "general")).toBe("Attendee");
    expect(participantLabel("attendee", null)).toBe("Attendee");
    expect(participantLabel("attendee", "vip_delegate")).toBe("Vip Delegate");
  });
});

describe("bug-condition — long name on a narrow label", () => {
  it("wraps the long name into multiple lines and emits <br/>", async () => {
    const { html, warnings } = await buildPrintHtml([LONG_NAME_BADGE], {
      mode: "badge",
      ...NARROW,
      copies: 1,
      eventTitle: "TestConf",
    });
    // Multi-line wrap emits `<br/>` between lines.
    expect(html.match(/<div class="name"[^>]*>[^<]*<br\/>/)).not.toBeNull();
    expect(warnings).toBeInstanceOf(Array);
  });

  it("emits a name font-size at or below the requested value after reflow", async () => {
    const { html } = await buildPrintHtml([LONG_NAME_BADGE], {
      mode: "badge",
      ...NARROW,
      copies: 1,
      eventTitle: "TestConf",
    });
    // Requested name pt on a 50mm-wide label is clamp(14, 50 * 0.27, 40) = 14.
    const match = html.match(/<div class="name" style="font-size:([\d.]+)pt/);
    expect(match).not.toBeNull();
    const nameSizePt = parseFloat(match![1]);
    expect(nameSizePt).toBeGreaterThan(0);
    expect(nameSizePt).toBeLessThanOrEqual(14);
  });
});

describe("bug-condition — name-only long company on thermal-4x6", () => {
  it("wraps the company line at word boundaries", async () => {
    const { html, warnings } = await buildPrintHtml(
      [{ ...LONG_NAME_BADGE, name: "J. Q. Public", company: "Infomerics Valuations and Ratings" }],
      { mode: "name", size: "thermal-4x6", copies: 1, eventTitle: "TestConf" },
    );
    // On thermal-4x6 (safeW ~96mm), "Infomerics Valuations and Ratings"
    // at 12pt = 33 chars × 12 × 0.5 = 198mm > 96mm → must wrap.
    expect(html).toContain("<br/>");
    expect(Array.isArray(warnings)).toBe(true);
  });
});

describe("bug-condition — unbreakable token triggers hardBreak warning", () => {
  it("surfaces a hardBreak warning for a very long unbreakable token", async () => {
    const { warnings } = await buildPrintHtml(
      [
        {
          ...LONG_NAME_BADGE,
          name: "supercalifragilisticexpialidocioussupercalifragilisticexpialidocious",
        },
      ],
      { mode: "badge", ...NARROW, copies: 1, eventTitle: "TestConf" },
    );
    // No word boundaries and a legibility floor → must hard-break.
    const hardBreakWarnings = warnings.filter((w) => w.reason === "hardBreak");
    expect(hardBreakWarnings.length).toBeGreaterThan(0);
    expect(hardBreakWarnings[0].role).toBe("name");
  });
});

describe("bug-condition — designer face long name", () => {
  it("wraps long name element on designer face at safe width", async () => {
    const { defaultDesign } = await import("./badge-design");
    const design = defaultDesign();
    // Enable only name; disable everything else to isolate the wrap check.
    for (const key of Object.keys(design.elements)) {
      const k = key as keyof typeof design.elements;
      if (k !== "name") design.elements[k].enabled = false;
    }
    design.elements.name.enabled = true;
    design.elements.name.x = 50;
    design.elements.name.y = 42;

    const { html } = await buildPrintHtml([LONG_NAME_BADGE], {
      mode: "badge",
      ...NARROW,
      copies: 1,
      eventTitle: "TestConf",
      design,
    });
    expect(html).toMatch(/max-width:[\d.]+mm/);
    expect(html).toContain("<br/>");
  });
});

describe("thermal offset — shifts the whole badge", () => {
  it("translates the badge content by the measured offset", async () => {
    const { html } = await buildPrintHtml([LONG_NAME_BADGE], {
      mode: "badge",
      size: "thermal-4x5",
      copies: 1,
      eventTitle: "TestConf",
      thermalOffset: { topMm: 2, leftMm: 1 },
    });
    expect(html).toContain('<div class="inner" style="transform:translate(1mm,2mm)">');
  });

  it("leaves the badge untranslated when no offset is set", async () => {
    const { html } = await buildPrintHtml([LONG_NAME_BADGE], {
      mode: "badge",
      size: "thermal-4x5",
      copies: 1,
      eventTitle: "TestConf",
    });
    expect(html).toContain('<div class="inner">');
    expect(html).not.toContain("<div class=\"inner\" style=");
  });
});

describe("participant band colours", () => {
  it("uses the configured colour per participant group", async () => {
    const bandColors = { attendee: "#112233", speaker: "#445566", partner: "#778899" };
    const render = async (participant_type: string) =>
      (await buildPrintHtml([{ ...LONG_NAME_BADGE, participant_type }], { mode: "badge", size: "thermal-4x5", copies: 1, bandColors })).html;
    expect(await render("Speaker")).toContain("background:#445566");
    expect(await render("Partner")).toContain("background:#778899");
    expect(await render("Attendee")).toContain("background:#112233");
    // Named ticket types follow the attendee colour.
    expect(await render("Delegate")).toContain("background:#112233");
  });

  it("switches the band text to dark on light colours", async () => {
    const { html } = await buildPrintHtml([LONG_NAME_BADGE], {
      mode: "badge", size: "thermal-4x5", copies: 1,
      bandColors: { ...DEFAULT_BAND_COLORS, attendee: "#ffd60a" },
    });
    expect(html).toContain("background:#ffd60a;color:#111111");
    expect(bandTextColor("#00a5b1")).toBe("#ffffff");
  });

  it("ignores anything that is not a #rrggbb colour", () => {
    expect(sanitizeBandColors({ attendee: "red;background:url(x)", speaker: "#ABCDEF" })).toEqual({
      ...DEFAULT_BAND_COLORS,
      speaker: "#abcdef",
    });
    expect(sanitizeBandColors(null)).toEqual(DEFAULT_BAND_COLORS);
  });
});
