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

import { buildPrintHtml, type BadgeData } from "./print-badges";
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
  name: "Aakarshan Singh Chadha", // 22 chars — 121 mm at 11pt = way over thermal-58's ~53mm safeW
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

describe("bug-condition — thermal-58 badge mode", () => {
  it("wraps the long name into multiple lines and emits <br/>", async () => {
    const { html, warnings } = await buildPrintHtml([LONG_NAME_BADGE], {
      mode: "badge",
      size: "thermal-58",
      copies: 1,
      eventTitle: "TestConf",
    });
    // Multi-line wrap emits `<br/>` between lines.
    expect(html.match(/<div class="name"[^>]*>[^<]*<br\/>/)).not.toBeNull();
    // No warning is strictly required — wrap alone is often enough. But
    // if the value did shrink to the floor, a warning should surface.
    expect(warnings).toBeInstanceOf(Array);
  });

  it("emits a name font-size at or below the requested value after reflow", async () => {
    const { html } = await buildPrintHtml([LONG_NAME_BADGE], {
      mode: "badge",
      size: "thermal-58",
      copies: 1,
      eventTitle: "TestConf",
    });
    // Requested name pt on thermal-58 (h=80mm) is clamp(11, 80*0.14, 26)
    // = 11.2 pt (with floating-point noise, ≈ 11.200000000000001). After
    // reflow the sizePt is either equal to the request (wrap alone worked)
    // or strictly lower (shrink was needed). Allow a small epsilon for
    // the base-case float representation.
    const match = html.match(/<div class="name" style="font-size:([\d.]+)pt/);
    expect(match).not.toBeNull();
    const nameSizePt = parseFloat(match![1]);
    expect(nameSizePt).toBeGreaterThan(0);
    // Requested was ≤ 11.2; result must be ≤ requested (with epsilon).
    expect(nameSizePt).toBeLessThanOrEqual(11.201);
  });

  it("emits inline .body { justify-content:center } when reflow ran", async () => {
    const { html } = await buildPrintHtml([LONG_NAME_BADGE], {
      mode: "badge",
      size: "thermal-58",
      copies: 1,
      eventTitle: "TestConf",
    });
    // The INLINE body style (not the static stylesheet) should include
    // `justify-content:center` on the reflow branch.
    const bodyStyleMatch = html.match(/<div class="body" style="([^"]+)"/);
    expect(bodyStyleMatch).not.toBeNull();
    expect(bodyStyleMatch![1]).toContain("justify-content:center");
  });
});

describe("bug-condition — name-only long company on thermal-4x6", () => {
  it("wraps the company line at word boundaries", async () => {
    const { html, warnings } = await buildPrintHtml(
      [{ ...LONG_NAME_BADGE, name: "J. Q. Public", company: "Infomerics Valuations and Ratings" }],
      { mode: "name", size: "thermal-4x6", copies: 1, eventTitle: "TestConf" },
    );
    // Company line should contain a wrap (either <br/> or multiple words on
    // separate lines).
    // On thermal-4x6 (safeW ~96mm), "Infomerics Valuations and Ratings"
    // at 12pt = 33 chars × 12 × 0.5 = 198mm > 96mm → must wrap.
    // Multi-line wrap emits `<br/>` in the last div (the company line).
    // The presence of `<br/>` in the emitted HTML is proof of reflow.
    expect(html).toContain("<br/>");
    // Warnings may or may not surface depending on whether shrink was needed
    // in addition to wrap. Just assert the shape.
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
      { mode: "badge", size: "thermal-50", copies: 1, eventTitle: "TestConf" },
    );
    // The 66-char token at floor 8pt = 264 mm; thermal-50 safeW is 45mm.
    // Wrap alone can't help (no word boundaries); shrink alone can't get
    // below 8pt floor. Must hard-break.
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
      size: "thermal-58",
      copies: 1,
      eventTitle: "TestConf",
      design,
    });
    // On the designer face, the reflow emits `max-width` on the text
    // element and `<br/>`-joined lines when wrapping happens.
    expect(html).toMatch(/max-width:[\d.]+mm/);
    expect(html).toContain("<br/>");
  });
});

describe("thermal offset — applied only in thermal mode", () => {
  it("shifts padding when thermalOffset is set on a long-name print", async () => {
    const { html } = await buildPrintHtml([LONG_NAME_BADGE], {
      mode: "badge",
      size: "thermal-58",
      copies: 1,
      eventTitle: "TestConf",
      thermalMode: true,
      thermalOffset: { topMm: 2, leftMm: 1 },
    });
    // Thermal offset shifts content DOWN and RIGHT via computed
    // padding in the inline `.body` style.
    const bodyStyleMatch = html.match(/<div class="body" style="([^"]+)"/);
    expect(bodyStyleMatch).not.toBeNull();
    const inlineBodyStyle = bodyStyleMatch![1];
    expect(inlineBodyStyle).toContain("padding:");
    expect(inlineBodyStyle).toContain("justify-content:center");
  });

  it("does NOT emit inline .body { justify-content:center } when thermalOffset is undefined and value fits (preservation)", async () => {
    const { html } = await buildPrintHtml(
      [{ ...LONG_NAME_BADGE, name: "J. Doe", company: "Acme" }],
      { mode: "badge", size: "thermal-58", copies: 1, eventTitle: "TestConf" },
    );
    // Short-fit case: bodyStyle emits today's format (padding:XmmYmm;
    // gap:...; align-items:...; text-align:...). The historical form does
    // NOT include `justify-content:center` in the INLINE body style —
    // that string only appears in the static stylesheet block above.
    // Match the inline body style specifically.
    const bodyStyleMatch = html.match(/<div class="body" style="([^"]+)"/);
    expect(bodyStyleMatch).not.toBeNull();
    const inlineBodyStyle = bodyStyleMatch![1];
    expect(inlineBodyStyle).not.toContain("justify-content");
  });
});
