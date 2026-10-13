/**
 * The certificate design model: built-in templates, signatures, partner
 * logos, backgrounds, dynamic fields, long names and what is actually drawn.
 */
import { describe, expect, it } from "vitest";
import type { BrochureElement, ImageElement, TextElement } from "@/lib/brochure/editor/editor-document";
import { estimateTextWidthMm, wrapTextLines } from "@/lib/brochure/editor/editor-text-metrics";
import {
  BG_DECO_GROUP, BG_IMAGE_ID, MAX_SIGNATURES, ORG_LOGO_ID, PARTNER_GROUP, QR_ELEMENT_ID, SIGNATURE_IDS,
  applyBackground, backgroundResolutionWarning, checkDesign, cloneDesign, hasErrors, movePartner, parseDesign, parseSettings,
  reconcileDeletions, refreshPartners, renderCertificate, setBackgroundImage, setOrgLogo, setPartners, setQrEnabled, updateSignature,
  type CertificateDesign, type PartnerLogoRef,
} from "../certificate-design";
import { BACKGROUNDS, findBackground } from "../certificate-backgrounds";
import { TEMPLATES, TEMPLATE_CATEGORIES, buildTemplate, findTemplate } from "../certificate-templates";
import { CERTIFICATE_FIELDS, SAMPLE_PARTICIPANTS, formatEventDateRange, resolveTokens, unknownTokens } from "../certificate-fields";

const page = (d: CertificateDesign) => d.document.pages[0];
const el = (d: CertificateDesign, id: string) => page(d).elements.find((e) => e.id === id);
const drawn = (doc: ReturnType<typeof renderCertificate>) => doc.pages[0].elements;
const drawnText = (doc: ReturnType<typeof renderCertificate>) => drawn(doc).filter((e): e is TextElement => e.kind === "text").map((t) => t.content).join("\n");
const values = SAMPLE_PARTICIPANTS[0].values;
const SIG_IMG = "data:image/png;base64,iVBORw0KGgo=";

/** A template with every signature filled in properly. */
function signed(d: CertificateDesign, enabled: boolean[]): CertificateDesign {
  let out = d;
  enabled.forEach((on, i) => {
    out = updateSignature(out, i, { enabled: on, name: `Signatory ${i + 1}`, designation: `Role ${i + 1}`, imageSrc: SIG_IMG });
  });
  return out;
}

const PARTNERS: PartnerLogoRef[] = [
  { sponsorId: "s1", name: "Platinum Co", logoUrl: "https://cdn.example.com/p.png", tier: "platinum" },
  { sponsorId: "s2", name: "Gold Co", logoUrl: "https://cdn.example.com/g.png", tier: "gold" },
  { sponsorId: "s3", name: "Knowledge Partner", logoUrl: "", tier: "knowledge" },
];

describe("template library", () => {
  it("covers every category with several templates", () => {
    for (const category of TEMPLATE_CATEGORIES) {
      expect(TEMPLATES.filter((t) => t.category === category).length, category).toBeGreaterThanOrEqual(2);
    }
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
  });

  it("offers both orientations, landscape first and A4", () => {
    expect(TEMPLATES.some((t) => t.orientation === "portrait")).toBe(true);
    expect(TEMPLATES.filter((t) => t.orientation === "landscape").length).toBeGreaterThan(TEMPLATES.length / 2);
    const land = buildTemplate(findTemplate("corp-banner")!);
    expect([page(land).width, page(land).height]).toEqual([297, 210]);
    const port = buildTemplate(findTemplate("acad-portrait")!);
    expect([page(port).width, page(port).height]).toEqual([210, 297]);
  });

  it("templates within a category are different compositions, not recolours", () => {
    for (const category of TEMPLATE_CATEGORIES) {
      const specs = TEMPLATES.filter((t) => t.category === category);
      const layouts = specs.map((s) => `${s.layout}/${s.orientation}`);
      expect(new Set(layouts).size, category).toBe(specs.length);
    }
  });

  it("1. every template builds into an editable design with a name field, a QR code and no invented signatories", () => {
    for (const spec of TEMPLATES) {
      const d = buildTemplate(spec);
      const texts = page(d).elements.filter((e): e is TextElement => e.kind === "text");
      expect(texts.some((t) => t.content.includes("{{participant_name}}")), spec.id).toBe(true);
      expect(texts.flatMap((t) => unknownTokens(t.content)), spec.id).toEqual([]);
      expect(el(d, QR_ELEMENT_ID), spec.id).toBeTruthy();
      expect(d.settings.signatures.every((s) => s.name === "" && s.imageSrc === ""), spec.id).toBe(true);
      // Once signatories are filled in, the template is publishable.
      expect(hasErrors(checkDesign(signed(d, d.settings.signatures.map((s) => s.enabled)))), spec.id).toBe(false);
    }
  });

  it("1. places the Brand Kit logo when one is given", () => {
    const d = buildTemplate(findTemplate("corp-banner")!, { logoUrl: "https://cdn.example.com/logo.png" });
    expect((el(d, ORG_LOGO_ID) as ImageElement).src).toBe("https://cdn.example.com/logo.png");
    expect(el(buildTemplate(findTemplate("corp-banner")!), ORG_LOGO_ID)).toBeUndefined();
  });

  it("2. a design survives being saved and reopened", () => {
    const d = signed(buildTemplate(findTemplate("acad-classic")!), [true, true, false]);
    const stored = JSON.parse(JSON.stringify({ design: d.document, settings: d.settings }));
    const reopened = parseDesign(stored.design, stored.settings)!;
    expect(reopened.document).toEqual(d.document);
    expect(reopened.settings).toEqual(d.settings);
  });

  it("duplicating gives an independent copy", () => {
    const d = buildTemplate(findTemplate("min-mono")!);
    const copy = cloneDesign(d, "Copy");
    expect(copy.document.id).not.toBe(d.document.id);
    page(copy).elements[0].x = 999;
    expect(page(d).elements[0].x).not.toBe(999);
  });
});

describe("7–10. signatures", () => {
  const base = buildTemplate(findTemplate("acad-classic")!); // starts with three slots on

  it("8. never more than three slots, whatever is stored", () => {
    const parsed = parseSettings({ signatures: [{ enabled: true }, { enabled: true }, { enabled: true }, { enabled: true }, { enabled: true }] }, page(base));
    expect(parsed.signatures).toHaveLength(MAX_SIGNATURES);
    expect(updateSignature(base, 3, { enabled: true })).toBe(base);
    expect(page(base).elements.filter((e) => e.groupId?.startsWith("sig-")).map((e) => e.groupId).filter((g, i, a) => a.indexOf(g) === i)).toEqual([...SIGNATURE_IDS]);
  });

  it("7. each slot switches on and off on its own", () => {
    const all = signed(base, [true, true, true]);
    const off2 = updateSignature(all, 1, { enabled: false });
    expect(off2.settings.signatures.map((s) => s.enabled)).toEqual([true, false, true]);
    expect(off2.settings.signatures[0].name).toBe("Signatory 1");
    expect(off2.settings.signatures[2].name).toBe("Signatory 3");
    const back = updateSignature(off2, 1, { enabled: true });
    expect(back.settings.signatures[1].name).toBe("Signatory 2");
  });

  it("9/10. zero, one, two and three signatures render exactly the enabled ones, labels included", () => {
    for (const pattern of [[false, false, false], [true, false, false], [false, true, true], [true, true, true], [true, false, true]]) {
      const d = signed(base, pattern);
      const doc = renderCertificate(d, values, { qrDataUrl: SIG_IMG });
      const text = drawnText(doc);
      pattern.forEach((on, i) => {
        const ids = ["image", "line", "name", "title"].map((p) => `${SIGNATURE_IDS[i]}-${p}`);
        for (const id of ids) expect(drawn(doc).some((e) => e.id === id), `${pattern} ${id}`).toBe(on);
        expect(text.includes(`Signatory ${i + 1}`), `${pattern} name ${i}`).toBe(on);
        expect(text.includes(`Role ${i + 1}`), `${pattern} title ${i}`).toBe(on);
      });
    }
  });

  it("disabling a slot re-spreads the others so no gap is left", () => {
    const three = signed(base, [true, true, true]);
    const two = updateSignature(three, 1, { enabled: false });
    const line = (d: CertificateDesign, i: number) => el(d, `${SIGNATURE_IDS[i]}-line`)!;
    const band = two.settings.signatureBand;
    const left = line(two, 0).x - band.x;
    const right = band.x + band.width - (line(two, 2).x + line(two, 2).width);
    expect(Math.abs(left - right)).toBeLessThan(0.01);
    const middleGap = line(two, 2).x - (line(two, 0).x + line(two, 0).width);
    expect(Math.abs(middleGap - left)).toBeLessThan(0.01);
  });

  it("editing a slot keeps where the organiser moved it", () => {
    const d = signed(base, [true, true, false]);
    const moved: CertificateDesign = { ...d, document: { ...d.document, pages: [{ ...page(d), elements: page(d).elements.map((e) => (e.id === "sig-1-name" ? { ...e, x: 10, y: 10 } : e)) }] } };
    const renamed = updateSignature(moved, 0, { name: "Dr. A. Kumar" });
    expect(el(renamed, "sig-1-name")).toMatchObject({ x: 10, y: 10, content: "Dr. A. Kumar" });
  });

  it("optional parts disappear on their own; the organisation line only when asked for", () => {
    let d = updateSignature(base, 0, { enabled: true, name: "Priya Shah", designation: "", imageSrc: "" });
    let doc = renderCertificate(d, values);
    expect(drawn(doc).some((e) => e.id === "sig-1-image")).toBe(false);
    expect(drawn(doc).some((e) => e.id === "sig-1-title")).toBe(false);
    expect(drawn(doc).some((e) => e.id === "sig-1-org")).toBe(false);
    d = updateSignature(d, 0, { organization: "Acme Events", showOrganization: true });
    doc = renderCertificate(d, values);
    expect(drawnText(doc)).toContain("Acme Events");
  });

  it("warns about an enabled slot with no image and blocks one with no name", () => {
    const noImage = updateSignature(base, 0, { enabled: true, name: "Priya", designation: "CEO", imageSrc: "" });
    const issues = checkDesign(noImage);
    expect(issues.some((i) => i.level === "warning" && /no signature image/.test(i.message))).toBe(true);
    expect(issues.some((i) => i.level === "error" && /Signature 2/.test(i.message))).toBe(true); // slot 2 is on with no name
  });

  it("deleting a signature on the canvas switches that slot off and leaves the others", () => {
    const d = signed(base, [true, true, true]);
    const deleted: CertificateDesign = { ...d, document: { ...d.document, pages: [{ ...page(d), elements: page(d).elements.filter((e) => e.groupId !== "sig-2") }] } };
    const fixed = reconcileDeletions(deleted);
    expect(fixed.settings.signatures.map((s) => s.enabled)).toEqual([true, false, true]);
    expect(fixed.settings.signatures[1].name).toBe("Signatory 2");
    expect(drawnText(renderCertificate(fixed, values))).not.toContain("Signatory 2");
    expect(reconcileDeletions(d)).toBe(d);
  });

  it("rejects signature images that are not our own uploads or https", () => {
    const parsed = parseSettings({ signatures: [{ enabled: true, name: "x", imageSrc: "javascript:alert(1)" }, { imageSrc: "data:image/svg+xml;base64,PHN2Zz4=" }] }, page(base));
    expect(parsed.signatures[0].imageSrc).toBe("");
    expect(parsed.signatures[1].imageSrc).toBe("");
  });
});

describe("5. partner logos", () => {
  const base = buildTemplate(findTemplate("conf-gradient")!);

  it("only the event's own sponsors can be added, in the chosen order", () => {
    const d = setPartners(base, ["s2", "not-this-event", "s1"], PARTNERS);
    expect(d.settings.partners.map((p) => p.sponsorId)).toEqual(["s2", "s1"]);
    const logos = page(d).elements.filter((e) => e.groupId === PARTNER_GROUP && e.kind === "image") as ImageElement[];
    expect(logos.map((l) => l.src)).toEqual(["https://cdn.example.com/g.png", "https://cdn.example.com/p.png"]);
    expect(logos[0].x).toBeLessThan(logos[1].x);
    expect(logos.every((l) => l.fit === "contain")).toBe(true);
  });

  it("reorders, shows names on request, and stays inside the strip", () => {
    let d = setPartners(base, ["s1", "s2"], PARTNERS);
    d = movePartner(d, "s2", -1);
    expect(d.settings.partners.map((p) => p.sponsorId)).toEqual(["s2", "s1"]);
    d = { ...d, settings: { ...d.settings, showPartnerNames: true } };
    d = setPartners(d, ["s2", "s1"], PARTNERS);
    expect(drawnText(renderCertificate(d, values))).toContain("Gold Co");
    const strip = d.settings.partnerStrip;
    for (const e of page(d).elements.filter((x) => x.groupId === PARTNER_GROUP)) {
      expect(e.x).toBeGreaterThanOrEqual(strip.x - 0.01);
      expect(e.x + e.width).toBeLessThanOrEqual(strip.x + strip.width + 0.01);
    }
  });

  it("many sponsors become a strip of narrower logos, never wider than the strip", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ sponsorId: `m${i}`, name: `S${i}`, logoUrl: "https://cdn.example.com/x.png", tier: "gold" }));
    const d = setPartners(base, many.map((m) => m.sponsorId), many);
    const logos = page(d).elements.filter((e) => e.groupId === PARTNER_GROUP);
    expect(logos).toHaveLength(10);
    const right = Math.max(...logos.map((l) => l.x + l.width));
    expect(right).toBeLessThanOrEqual(d.settings.partnerStrip.x + d.settings.partnerStrip.width + 0.01);
  });

  it("a partner without a logo is flagged and left out of the print", () => {
    const d = setPartners(base, ["s3"], PARTNERS);
    expect(checkDesign(d).some((i) => /Knowledge Partner has no logo/.test(i.message))).toBe(true);
    expect(drawn(renderCertificate(d, values)).some((e) => e.groupId === PARTNER_GROUP)).toBe(false);
  });

  it("6. partners removed from the event drop out of a saved design", () => {
    const d = setPartners(base, ["s1", "s2"], PARTNERS);
    const refreshed = refreshPartners(d, PARTNERS.filter((p) => p.sponsorId !== "s1"));
    expect(refreshed.settings.partners.map((p) => p.sponsorId)).toEqual(["s2"]);
  });
});

describe("3. backgrounds", () => {
  const base = updateSignature(setPartners(buildTemplate(findTemplate("corp-banner")!, { logoUrl: "https://cdn.example.com/logo.png" }), ["s1"], PARTNERS), 0, { name: "Priya" });

  it("changing the background keeps every text, logo, partner and signature", () => {
    const nonBg = (d: CertificateDesign) => page(d).elements.filter((e) => e.groupId !== BG_DECO_GROUP && e.id !== BG_IMAGE_ID);
    for (const bg of BACKGROUNDS) {
      const next = applyBackground(base, bg);
      expect(nonBg(next), bg.id).toEqual(nonBg(base));
      expect(next.settings.signatures).toEqual(base.settings.signatures);
      expect(page(next).background).toEqual(bg.background);
      // Decoration sits behind everything and is locked.
      const deco = page(next).elements.filter((e) => e.groupId === BG_DECO_GROUP);
      const lowestOther = Math.min(...nonBg(next).map((e) => e.zIndex));
      expect(deco.every((e) => e.locked && e.zIndex < lowestOther), bg.id).toBe(true);
    }
  });

  it("an uploaded background goes behind everything, locked, and can be removed again", () => {
    const withImg = setBackgroundImage(base, "data:image/png;base64,AAAA");
    const img = el(withImg, BG_IMAGE_ID)!;
    expect(img).toMatchObject({ x: 0, y: 0, width: 297, height: 210, locked: true });
    expect(img.zIndex).toBeLessThan(Math.min(...page(withImg).elements.filter((e) => e.id !== BG_IMAGE_ID).map((e) => e.zIndex)));
    expect(el(withImg, ORG_LOGO_ID)).toBeTruthy();
    const replaced = setBackgroundImage(withImg, "data:image/png;base64,BBBB");
    expect(page(replaced).elements.filter((e) => e.id === BG_IMAGE_ID)).toHaveLength(1);
  });

  it("warns when an upload is too small for print", () => {
    expect(backgroundResolutionWarning(800, 566, { width: 297, height: 210 })).toMatch(/about 68 DPI/);
    expect(backgroundResolutionWarning(3508, 2480, { width: 297, height: 210 })).toBeNull();
  });

  it("every background is usable in both orientations", () => {
    for (const bg of BACKGROUNDS) {
      for (const [w, h] of [[297, 210], [210, 297]]) {
        for (const e of bg.decorate(w, h)) {
          expect(Number.isFinite(e.x) && Number.isFinite(e.width) && e.width > 0, `${bg.id} ${w}x${h}`).toBe(true);
        }
      }
    }
    expect(findBackground("nope")).toBeUndefined();
  });
});

describe("4. organisation logo", () => {
  it("replacing the logo keeps its position and size", () => {
    const d = buildTemplate(findTemplate("corp-sidebar")!, { logoUrl: "https://cdn.example.com/a.png" });
    const before = el(d, ORG_LOGO_ID)!;
    const after = el(setOrgLogo(d, "https://cdn.example.com/b.png"), ORG_LOGO_ID) as ImageElement;
    expect(after.src).toBe("https://cdn.example.com/b.png");
    expect([after.x, after.y, after.width, after.height]).toEqual([before.x, before.y, before.width, before.height]);
    expect(after.fit).toBe("contain");
  });
});

describe("11/12. dynamic fields and long names", () => {
  it("only allowlisted fields are filled; others print as nothing", () => {
    expect(resolveTokens("Hi {{participant_name}} {{password}}", { participant_name: "Asha" })).toBe("Hi Asha");
    expect(unknownTokens("{{participant_name}} {{secret}} {{ event_name }}")).toEqual(["secret"]);
    expect(resolveTokens("{{participant_designation}}, {{participant_company}}", { participant_company: "Acme" })).toBe("Acme");
    expect(resolveTokens("{{participant_designation}}, {{participant_company}}", {})).toBe("");
  });

  it("every field renders in a design that uses it", () => {
    const d = buildTemplate(findTemplate("min-mono")!);
    const all = CERTIFICATE_FIELDS.map((f) => `{{${f.key}}}`).join(" | ");
    const withAll: CertificateDesign = {
      ...d,
      document: { ...d.document, pages: [{ ...page(d), elements: [...page(d).elements, { ...(page(d).elements.find((e) => e.kind === "text") as TextElement), id: "all", content: all, y: 5 }] }] },
    };
    const text = drawnText(renderCertificate(withAll, values));
    for (const f of CERTIFICATE_FIELDS) expect(text, f.key).toContain(f.sample);
    expect(text).not.toMatch(/\{\{/);
  });

  it("a line made only of missing fields is left out instead of printing blanks", () => {
    const d = buildTemplate(findTemplate("corp-banner")!);
    const doc = renderCertificate(d, SAMPLE_PARTICIPANTS[2].values);
    expect(drawnText(doc)).not.toMatch(/^,|, $/m);
    expect(drawn(doc).some((e) => e.kind === "text" && e.content === "")).toBe(false);
  });

  it("12. a long name shrinks or wraps to stay inside its box in every template", () => {
    const long = SAMPLE_PARTICIPANTS[1].values;
    for (const spec of TEMPLATES) {
      const d = buildTemplate(spec);
      const nameBox = page(d).elements.find((e): e is TextElement => e.kind === "text" && e.content.includes("{{participant_name}}"))!;
      const doc = renderCertificate(d, long);
      const name = drawn(doc).find((e): e is TextElement => e.id === nameBox.id)!;
      expect(name.content).toBe(long.participant_name);
      expect(name.fontSize, spec.id).toBeLessThan(nameBox.fontSize);
      // Either it fits on one line, or its wrapped lines fit the box height.
      const bold = name.fontWeight === "bold";
      const oneLine = estimateTextWidthMm(name.content, name.fontSize, bold) <= name.width + 0.01;
      const lines = wrapTextLines(name.content, name.width / 1.06, name.fontSize, bold).length;
      const fitsHeight = lines * name.fontSize * 0.3528 * name.lineHeight <= Math.max(name.height, nameBox.fontSize * 0.3528 * nameBox.lineHeight) + 0.01;
      expect(oneLine || fitsHeight, spec.id).toBe(true);
      expect(name.x).toBe(nameBox.x);
      expect(name.width).toBe(nameBox.width);
    }
  });

  it("a short name keeps the designed size", () => {
    const d = buildTemplate(findTemplate("acad-classic")!);
    const nameBox = page(d).elements.find((e): e is TextElement => e.kind === "text" && e.content.includes("{{participant_name}}"))!;
    const name = drawn(renderCertificate(d, { participant_name: "Li Wei" })).find((e) => e.id === nameBox.id) as TextElement;
    expect(name.fontSize).toBe(nameBox.fontSize);
  });

  it("formats event dates", () => {
    expect(formatEventDateRange("2026-11-14T04:30:00Z", "2026-11-15T12:00:00Z", "Asia/Kolkata")).toBe("14–15 November 2026");
    expect(formatEventDateRange("2026-11-14T04:30:00Z", null)).toBe("14 November 2026");
    expect(formatEventDateRange("2026-11-30T04:30:00Z", "2026-12-01T04:30:00Z")).toBe("30 November – 1 December 2026");
  });
});

describe("13. what is drawn", () => {
  it("the QR code is drawn only when enabled and a code image is given", () => {
    const d = buildTemplate(findTemplate("tech-grid")!);
    expect(drawn(renderCertificate(d, values)).some((e) => e.id === QR_ELEMENT_ID)).toBe(false);
    const withQr = drawn(renderCertificate(d, values, { qrDataUrl: "data:image/png;base64,QR" })).find((e) => e.id === QR_ELEMENT_ID) as ImageElement;
    expect(withQr.src).toBe("data:image/png;base64,QR");
    const off = setQrEnabled(d, false);
    expect(drawn(renderCertificate(off, values, { qrDataUrl: "data:image/png;base64,QR" })).some((e) => e.id === QR_ELEMENT_ID)).toBe(false);
  });

  it("hidden elements are not drawn, and rendering never changes the design", () => {
    const d = buildTemplate(findTemplate("lux-black-gold")!);
    const snapshot = JSON.stringify(d);
    const hiddenId = page(d).elements.find((e) => e.kind === "text")!.id;
    const withHidden: CertificateDesign = { ...d, document: { ...d.document, pages: [{ ...page(d), elements: page(d).elements.map((e) => (e.id === hiddenId ? { ...e, hidden: true } : e)) }] } };
    expect(drawn(renderCertificate(withHidden, values)).some((e: BrochureElement) => e.id === hiddenId)).toBe(false);
    renderCertificate(d, SAMPLE_PARTICIPANTS[1].values);
    expect(JSON.stringify(d)).toBe(snapshot);
  });

  it("flags a name overlapping logos, signatures or the QR code", () => {
    const d = signed(buildTemplate(findTemplate("acad-classic")!), [true, true, true]);
    const nameId = page(d).elements.find((e) => e.kind === "text" && (e as TextElement).content.includes("{{participant_name}}"))!.id;
    const sig = el(d, "sig-2-line")!;
    const overlapped: CertificateDesign = { ...d, document: { ...d.document, pages: [{ ...page(d), elements: page(d).elements.map((e) => (e.id === nameId ? { ...e, y: sig.y - 5 } : e)) }] } };
    expect(checkDesign(overlapped).some((i) => /overlaps signature 2/.test(i.message))).toBe(true);
    expect(checkDesign(d).some((i) => /overlaps/.test(i.message))).toBe(false);
  });

  it("requires the participant name before publishing", () => {
    const d = buildTemplate(findTemplate("min-mono")!);
    const noName: CertificateDesign = { ...d, document: { ...d.document, pages: [{ ...page(d), elements: page(d).elements.filter((e) => !(e.kind === "text" && e.content.includes("participant_name"))) }] } };
    expect(checkDesign(noName).some((i) => i.level === "error" && /participant's name/.test(i.message))).toBe(true);
  });

  it("drops images from unsafe sources when a stored design is opened", () => {
    const d = buildTemplate(findTemplate("min-mono")!);
    const tampered = { ...d.document, pages: [{ ...page(d), elements: [...page(d).elements, { ...(el(d, QR_ELEMENT_ID) as ImageElement), id: "evil", src: "javascript:alert(1)" }] }] };
    const parsed = parseDesign(tampered, d.settings)!;
    expect(page(parsed).elements.some((e) => e.id === "evil")).toBe(false);
    expect(parseDesign({ pages: [] }, {})).toBeNull();
  });
});
