/**
 * Certificate designs.
 *
 * A design is a one-page `BrochureDocument` — the same model the brochure
 * editor edits, so the certificate editor reuses its canvas, properties panel,
 * layer list, undo history and renderer — plus `CertificateSettings` for the
 * parts that are more than free-form elements: up to three signature slots,
 * the event-partner logo strip, the verification QR code and the background.
 *
 * Those parts are ordinary elements on the page, recognised by fixed ids and
 * group tags, so the organiser can still drag, resize and restyle them. The
 * functions here keep them in step with the settings:
 *
 *   sig-1 … sig-3   a signature slot: image, line, name, designation, organisation
 *   partners        the partner logo strip
 *   cert-qr         the verification QR code
 *   bg-deco         decoration that belongs to the chosen background
 *   bg-image        an uploaded background picture
 *
 * `renderCertificate` turns a design plus one person's values into the exact
 * document that is drawn — by the editor preview and by the PDF alike.
 */
import {
  generateId,
  newImageElement,
  newShapeElement,
  newTextElement,
  type BrochureDocument,
  type BrochureElement,
  type BrochurePage,
  type ImageElement,
  type PageBackground,
  type TextElement,
} from "@/lib/brochure/editor/editor-document";
import { estimateTextWidthMm, wrapTextLines } from "@/lib/brochure/editor/editor-text-metrics";
import { ptToMm } from "@/lib/brochure/editor/editor-units";
import { findTokens, resolveTokens, unknownTokens, type CertificateValues } from "./certificate-fields";

// ─── Types ──────────────────────────────────────────────────────────────────

export const MAX_SIGNATURES = 3;
export const SIGNATURE_IDS = ["sig-1", "sig-2", "sig-3"] as const;
export const QR_ELEMENT_ID = "cert-qr";
/** Stored in place of the QR image until a real code is drawn in. */
export const QR_SRC_MARKER = "illuxus:verification-qr";
export const PARTNER_GROUP = "partners";
export const BG_DECO_GROUP = "bg-deco";
export const BG_IMAGE_ID = "bg-image";

export interface SignatureSlot {
  enabled: boolean;
  /** Data URL of an uploaded signature, or an https URL the org already holds. */
  imageSrc: string;
  name: string;
  designation: string;
  organization: string;
  showOrganization: boolean;
}

export interface PartnerLogoRef {
  /** `sponsors.id` — always one of the event's own sponsors. */
  sponsorId: string;
  name: string;
  logoUrl: string;
  tier: string;
}

export interface Box { x: number; y: number; width: number; height: number }

export interface CertificateSettings {
  signatures: [SignatureSlot, SignatureSlot, SignatureSlot];
  partners: PartnerLogoRef[];
  showPartnerNames: boolean;
  partnerStrip: Box;
  signatureBand: Box;
  signatureStyle: { fontFamily: string; color: string; lineColor: string };
  qr: { enabled: boolean };
  /** Default text for {{certificate_type}}. */
  certificateType: string;
  backgroundId: string | null;
}

export interface CertificateDesign {
  document: BrochureDocument;
  settings: CertificateSettings;
}

export type Orientation = "landscape" | "portrait";
export const A4_LANDSCAPE = { width: 297, height: 210 };
export const A4_PORTRAIT = { width: 210, height: 297 };

export const emptySignature = (): SignatureSlot => ({
  enabled: false, imageSrc: "", name: "", designation: "", organization: "", showOrganization: false,
});

export const orientationOf = (page: Pick<BrochurePage, "width" | "height">): Orientation =>
  page.width >= page.height ? "landscape" : "portrait";

export const pageOf = (design: CertificateDesign): BrochurePage => design.document.pages[0];

// ─── Parsing untrusted JSON ─────────────────────────────────────────────────

const str = (v: unknown, max = 300): string => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
/** Image sources a design may reference: our own data URLs, or https. */
export const isSafeImageSrc = (v: string): boolean =>
  v === "" || v === QR_SRC_MARKER || /^https:\/\//i.test(v) || /^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(v);

function parseBox(v: unknown, fallback: Box): Box {
  const b = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return { x: num(b.x, fallback.x), y: num(b.y, fallback.y), width: Math.max(1, num(b.width, fallback.width)), height: Math.max(1, num(b.height, fallback.height)) };
}

function parseSlot(v: unknown): SignatureSlot {
  const s = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const imageSrc = str(s.imageSrc, 8_000_000);
  return {
    enabled: s.enabled === true,
    imageSrc: isSafeImageSrc(imageSrc) ? imageSrc : "",
    name: str(s.name, 120),
    designation: str(s.designation, 160),
    organization: str(s.organization, 160),
    showOrganization: s.showOrganization === true,
  };
}

export function defaultSettings(page: Pick<BrochurePage, "width" | "height">): CertificateSettings {
  const landscape = orientationOf(page) === "landscape";
  return {
    signatures: [emptySignature(), emptySignature(), emptySignature()],
    partners: [],
    showPartnerNames: false,
    partnerStrip: landscape ? { x: 48, y: 178, width: 201, height: 14 } : { x: 25, y: 262, width: 160, height: 14 },
    signatureBand: landscape ? { x: 48, y: 142, width: 201, height: 30 } : { x: 25, y: 214, width: 160, height: 34 },
    signatureStyle: { fontFamily: "Lato", color: "#1f2937", lineColor: "#9ca3af" },
    qr: { enabled: true },
    certificateType: "Certificate of Participation",
    backgroundId: null,
  };
}

/** Settings from stored JSON. Never more than three signature slots. */
export function parseSettings(raw: unknown, page: Pick<BrochurePage, "width" | "height">): CertificateSettings {
  const d = defaultSettings(page);
  if (!raw || typeof raw !== "object") return d;
  const s = raw as Record<string, unknown>;
  const sigs = Array.isArray(s.signatures) ? s.signatures.slice(0, MAX_SIGNATURES) : [];
  const style = (s.signatureStyle && typeof s.signatureStyle === "object" ? s.signatureStyle : {}) as Record<string, unknown>;
  return {
    signatures: [parseSlot(sigs[0]), parseSlot(sigs[1]), parseSlot(sigs[2])],
    partners: (Array.isArray(s.partners) ? s.partners : []).slice(0, 24).flatMap((p) => {
      const r = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
      const logoUrl = str(r.logoUrl, 2000);
      const sponsorId = str(r.sponsorId, 64);
      return sponsorId ? [{ sponsorId, name: str(r.name, 160), logoUrl: /^https:\/\//i.test(logoUrl) ? logoUrl : "", tier: str(r.tier, 60) }] : [];
    }),
    showPartnerNames: s.showPartnerNames === true,
    partnerStrip: parseBox(s.partnerStrip, d.partnerStrip),
    signatureBand: parseBox(s.signatureBand, d.signatureBand),
    signatureStyle: {
      fontFamily: str(style.fontFamily, 80) || d.signatureStyle.fontFamily,
      color: /^#[0-9a-f]{6}$/i.test(str(style.color)) ? str(style.color) : d.signatureStyle.color,
      lineColor: /^#[0-9a-f]{6}$/i.test(str(style.lineColor)) ? str(style.lineColor) : d.signatureStyle.lineColor,
    },
    qr: { enabled: (s.qr as { enabled?: unknown } | undefined)?.enabled !== false },
    certificateType: str(s.certificateType, 120) || d.certificateType,
    backgroundId: str(s.backgroundId, 80) || null,
  };
}

/** A design from stored JSON, or null when it is not a usable one-page document. */
export function parseDesign(document: unknown, settings: unknown): CertificateDesign | null {
  if (!document || typeof document !== "object") return null;
  const doc = document as BrochureDocument;
  if (!Array.isArray(doc.pages) || doc.pages.length === 0) return null;
  const page = doc.pages[0];
  if (!page || typeof page.width !== "number" || typeof page.height !== "number" || !Array.isArray(page.elements)) return null;
  // Images from anywhere but our own uploads or https are dropped.
  const elements = page.elements.filter((el) => el.kind !== "image" || isSafeImageSrc((el as ImageElement).src));
  const background: PageBackground =
    page.background?.type === "image" && !isSafeImageSrc(page.background.src) ? { type: "solid", color: "#ffffff" } : page.background ?? { type: "solid", color: "#ffffff" };
  const clean: BrochureDocument = { ...doc, pages: [{ ...page, background, elements }] };
  return { document: clean, settings: parseSettings(settings, page) };
}

// ─── Small document helpers ─────────────────────────────────────────────────

function mapPage(design: CertificateDesign, fn: (page: BrochurePage) => BrochurePage): CertificateDesign {
  const [page, ...rest] = design.document.pages;
  return { ...design, document: { ...design.document, pages: [fn(page), ...rest], updatedAt: new Date().toISOString() } };
}

const maxZ = (els: BrochureElement[]) => els.reduce((m, el) => Math.max(m, el.zIndex), 0);
const minZ = (els: BrochureElement[]) => els.reduce((m, el) => Math.min(m, el.zIndex), 0);

function upsert(elements: BrochureElement[], el: BrochureElement): BrochureElement[] {
  const i = elements.findIndex((e) => e.id === el.id);
  if (i === -1) return [...elements, el];
  const next = elements.slice();
  next[i] = el;
  return next;
}

// ─── Signatures ─────────────────────────────────────────────────────────────

const sigPart = (slot: number, part: "image" | "line" | "name" | "title" | "org") => `${SIGNATURE_IDS[slot]}-${part}`;
const SIG_W = 62;

/** Where each enabled slot's block goes in the band: evenly spread, no gaps. */
export function signaturePositions(settings: CertificateSettings): { slot: number; x: number; width: number }[] {
  const enabled = settings.signatures.map((s, i) => (s.enabled ? i : -1)).filter((i) => i >= 0);
  const band = settings.signatureBand;
  const n = enabled.length;
  if (n === 0) return [];
  const width = Math.min(SIG_W, band.width / n - 4);
  const gap = (band.width - n * width) / (n + 1);
  return enabled.map((slot, k) => ({ slot, x: band.x + gap + k * (width + gap), width }));
}

function signatureBlock(slot: number, s: SignatureSlot, x: number, width: number, settings: CertificateSettings, z: number): BrochureElement[] {
  const band = settings.signatureBand;
  const style = settings.signatureStyle;
  const lineY = band.y + Math.min(17, band.height * 0.55);
  const group = SIGNATURE_IDS[slot];
  const common = { groupId: group, hidden: !s.enabled };
  const image: ImageElement = {
    ...newImageElement({ x: x + width * 0.15, y: band.y, width: width * 0.7, height: lineY - band.y - 1, fit: "contain", src: s.imageSrc, zIndex: z }),
    id: sigPart(slot, "image"), ...common, hidden: !s.enabled || !s.imageSrc,
  };
  const line = { ...newShapeElement({ x, y: lineY, width, height: 1.2, shape: "line", fill: "transparent", stroke: style.lineColor, strokeWidth: 0.3, zIndex: z + 1 }), id: sigPart(slot, "line"), ...common };
  const text = (part: "name" | "title" | "org", y: number, content: string, size: number, bold: boolean, hidden: boolean): TextElement => ({
    ...newTextElement({ x, y, width, height: ptToMm(size) * 1.25, content, fontFamily: style.fontFamily, fontSize: size, fontWeight: bold ? "bold" : "normal", color: style.color, align: "center", lineHeight: 1.15, zIndex: z + 2 }),
    id: sigPart(slot, part), ...common, hidden: !s.enabled || hidden,
  });
  return [
    image,
    line,
    text("name", lineY + 1.6, s.name, 10, true, !s.name.trim()),
    text("title", lineY + 6, s.designation, 8.5, false, !s.designation.trim()),
    text("org", lineY + 10, s.organization, 8, false, !s.showOrganization || !s.organization.trim()),
  ];
}

/**
 * Brings every signature element in line with the settings. With `arrange`,
 * the enabled slots are also laid out evenly across the signature band;
 * without it, positions the organiser chose are kept and only content and
 * visibility change.
 */
export function syncSignatures(design: CertificateDesign, arrange: boolean): CertificateDesign {
  const { settings } = design;
  return mapPage(design, (page) => {
    let elements = page.elements;
    const positions = new Map(signaturePositions(settings).map((p) => [p.slot, p]));
    const z = maxZ(elements) + 1;
    settings.signatures.forEach((slot, i) => {
      const existing = elements.find((e) => e.id === sigPart(i, "line"));
      const pos = positions.get(i);
      const x = arrange && pos ? pos.x : existing ? existing.x : pos?.x ?? settings.signatureBand.x;
      const width = arrange && pos ? pos.width : existing ? existing.width : pos?.width ?? SIG_W;
      const fresh = signatureBlock(i, slot, x, width, settings, z + i * 5);
      for (const el of fresh) {
        const old = elements.find((e) => e.id === el.id);
        if (old && !arrange) {
          // Keep where the organiser put it and how they styled it; update what it says and whether it shows.
          const patch: Partial<BrochureElement> = { hidden: el.hidden };
          if (el.kind === "text") (patch as Partial<TextElement>).content = el.content;
          if (el.kind === "image") (patch as Partial<ImageElement>).src = el.src;
          elements = upsert(elements, { ...old, ...patch } as BrochureElement);
        } else if (old && arrange) {
          // Re-laid out: new position, keep the organiser's styling and layer.
          const styled = { ...old, ...el, zIndex: old.zIndex } as BrochureElement;
          if (old.kind === "text" && el.kind === "text") Object.assign(styled, { fontFamily: old.fontFamily, color: old.color, fontSize: old.fontSize });
          elements = upsert(elements, styled);
        } else {
          elements = upsert(elements, el);
        }
      }
    });
    return { ...page, elements };
  });
}

export function updateSignature(design: CertificateDesign, slot: number, patch: Partial<SignatureSlot>): CertificateDesign {
  if (slot < 0 || slot >= MAX_SIGNATURES) return design;
  const signatures = design.settings.signatures.map((s, i) => (i === slot ? { ...s, ...patch } : s)) as CertificateSettings["signatures"];
  const toggled = patch.enabled !== undefined && patch.enabled !== design.settings.signatures[slot].enabled;
  // Turning a slot on or off re-spreads the others so no gap is left.
  return syncSignatures({ ...design, settings: { ...design.settings, signatures } }, toggled);
}

// ─── Partner logos ──────────────────────────────────────────────────────────

/** Logo cells for the strip, centred, never wider than 42 mm each. */
export function partnerCells(count: number, strip: Box): { x: number; width: number }[] {
  if (count === 0) return [];
  const gap = 5;
  const width = Math.min(42, (strip.width - gap * (count - 1)) / count);
  const total = count * width + (count - 1) * gap;
  const start = strip.x + (strip.width - total) / 2;
  return Array.from({ length: count }, (_, i) => ({ x: start + i * (width + gap), width }));
}

/** Rebuilds the partner strip from the settings (order, names on/off). */
export function syncPartners(design: CertificateDesign): CertificateDesign {
  const { settings } = design;
  return mapPage(design, (page) => {
    const kept = page.elements.filter((e) => e.groupId !== PARTNER_GROUP);
    const strip = settings.partnerStrip;
    const nameH = settings.showPartnerNames ? 4.5 : 0;
    const z = maxZ(kept) + 1;
    const cells = partnerCells(settings.partners.length, strip);
    const added: BrochureElement[] = settings.partners.flatMap((p, i) => {
      const cell = cells[i];
      const logo: ImageElement = {
        ...newImageElement({ x: cell.x, y: strip.y, width: cell.width, height: strip.height - nameH, fit: "contain", src: p.logoUrl, zIndex: z + i }),
        id: `partner-${p.sponsorId}`, groupId: PARTNER_GROUP, hidden: !p.logoUrl,
      };
      if (!settings.showPartnerNames) return [logo];
      const name: TextElement = {
        ...newTextElement({ x: cell.x, y: strip.y + strip.height - nameH + 0.6, width: cell.width, height: 4, content: p.name, fontFamily: settings.signatureStyle.fontFamily, fontSize: 7, color: "#6b7280", align: "center", zIndex: z + i }),
        id: `partner-name-${p.sponsorId}`, groupId: PARTNER_GROUP,
      };
      return [logo, name];
    });
    return { ...page, elements: [...kept, ...added] };
  });
}

/**
 * Sets which partners appear, in order. Only sponsors of the event (`available`)
 * can be chosen — anything else is dropped.
 */
export function setPartners(design: CertificateDesign, chosenIds: string[], available: PartnerLogoRef[]): CertificateDesign {
  const byId = new Map(available.map((p) => [p.sponsorId, p]));
  const partners = chosenIds.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  return syncPartners({ ...design, settings: { ...design.settings, partners } });
}

export function movePartner(design: CertificateDesign, sponsorId: string, delta: -1 | 1): CertificateDesign {
  const list = design.settings.partners.slice();
  const i = list.findIndex((p) => p.sponsorId === sponsorId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return design;
  [list[i], list[j]] = [list[j], list[i]];
  return syncPartners({ ...design, settings: { ...design.settings, partners: list } });
}

/** Keeps a design's partners to those still attached to the event, with fresh logos. */
export function refreshPartners(design: CertificateDesign, available: PartnerLogoRef[]): CertificateDesign {
  return setPartners(design, design.settings.partners.map((p) => p.sponsorId), available);
}

// ─── Background ─────────────────────────────────────────────────────────────

export interface BackgroundPreset {
  id: string;
  name: string;
  category: string;
  background: PageBackground;
  /** Decoration drawn behind everything, sized to the page. */
  decorate: (w: number, h: number) => BrochureElement[];
}

/**
 * Swaps the background: page colour/gradient and its decoration. Every other
 * element — text, logos, partners, signatures — is left exactly as it was.
 */
export function applyBackground(design: CertificateDesign, preset: BackgroundPreset): CertificateDesign {
  const next = mapPage(design, (page) => {
    const others = page.elements.filter((e) => e.groupId !== BG_DECO_GROUP && e.id !== BG_IMAGE_ID);
    const base = minZ(others) - 100;
    const deco = preset.decorate(page.width, page.height).map((el, i) => ({ ...el, id: el.id.startsWith("bgd-") ? el.id : generateId("bgd"), groupId: BG_DECO_GROUP, locked: true, zIndex: base + i }));
    return { ...page, background: preset.background, elements: [...deco, ...others] };
  });
  return { ...next, settings: { ...next.settings, backgroundId: preset.id } };
}

/** An uploaded picture as the background, behind everything, locked in place. */
export function setBackgroundImage(design: CertificateDesign, src: string, opts: { keepDecoration?: boolean } = {}): CertificateDesign {
  return mapPage({ ...design, settings: { ...design.settings, backgroundId: "custom" } }, (page) => {
    const others = page.elements.filter((e) => e.id !== BG_IMAGE_ID && (opts.keepDecoration || e.groupId !== BG_DECO_GROUP));
    const img: ImageElement = {
      ...newImageElement({ x: 0, y: 0, width: page.width, height: page.height, src, fit: "cover", zIndex: minZ(others) - 200 }),
      id: BG_IMAGE_ID, locked: true,
    };
    return { ...page, elements: [img, ...others] };
  });
}

export function removeBackgroundImage(design: CertificateDesign): CertificateDesign {
  return mapPage(design, (page) => ({ ...page, elements: page.elements.filter((e) => e.id !== BG_IMAGE_ID) }));
}

/**
 * Whether a background picture has enough pixels for the page: at least
 * `minDpi` across the page in both directions once it covers it.
 */
export function backgroundResolutionWarning(naturalW: number, naturalH: number, page: Pick<BrochurePage, "width" | "height">, minDpi = 150): string | null {
  if (!naturalW || !naturalH) return null;
  const needW = (page.width / 25.4) * minDpi;
  const needH = (page.height / 25.4) * minDpi;
  // With `cover`, the limiting side is the one scaled up most.
  const scale = Math.max(needW / naturalW, needH / naturalH);
  if (scale <= 1) return null;
  const dpi = Math.round(minDpi / scale);
  return `This image is ${naturalW}×${naturalH} px — about ${dpi} DPI on this page. Use at least ${Math.ceil(needW)}×${Math.ceil(needH)} px for a sharp print.`;
}

// ─── QR code ────────────────────────────────────────────────────────────────

export function setQrEnabled(design: CertificateDesign, enabled: boolean): CertificateDesign {
  const next = { ...design, settings: { ...design.settings, qr: { enabled } } };
  return mapPage(next, (page) => {
    const existing = page.elements.find((e) => e.id === QR_ELEMENT_ID);
    if (existing) return { ...page, elements: page.elements.map((e) => (e.id === QR_ELEMENT_ID ? { ...e, hidden: !enabled } : e)) };
    if (!enabled) return page;
    const size = 20;
    const qr: ImageElement = { ...newImageElement({ x: page.width - size - 14, y: page.height - size - 12, width: size, height: size, src: QR_SRC_MARKER, fit: "contain", zIndex: maxZ(page.elements) + 1 }), id: QR_ELEMENT_ID };
    return { ...page, elements: [...page.elements, qr] };
  });
}

// ─── Brand logo ─────────────────────────────────────────────────────────────

export const ORG_LOGO_ID = "org-logo";

/** Places (or replaces) the organisation logo, keeping its box if one is already there. */
export function setOrgLogo(design: CertificateDesign, src: string, naturalW = 0, naturalH = 0): CertificateDesign {
  return mapPage(design, (page) => {
    const existing = page.elements.find((e) => e.id === ORG_LOGO_ID) as ImageElement | undefined;
    if (existing) return { ...page, elements: page.elements.map((e) => (e.id === ORG_LOGO_ID ? { ...existing, src, hidden: false } : e)) };
    const ratio = naturalW > 0 && naturalH > 0 ? naturalW / naturalH : 3;
    const height = 14;
    const width = Math.min(60, height * ratio);
    const logo: ImageElement = { ...newImageElement({ x: (page.width - width) / 2, y: 14, width, height, src, fit: "contain", zIndex: maxZ(page.elements) + 1 }), id: ORG_LOGO_ID };
    return { ...page, elements: [...page.elements, logo] };
  });
}

/** Elements the studio manages through settings rather than as free elements. */
export const isManagedElement = (el: Pick<BrochureElement, "id" | "groupId">): boolean =>
  el.id === QR_ELEMENT_ID || el.id === BG_IMAGE_ID || el.groupId === PARTNER_GROUP || el.groupId === BG_DECO_GROUP || (SIGNATURE_IDS as readonly string[]).includes(el.groupId ?? "");

/**
 * After a free edit on the canvas (delete key, layers panel), brings the
 * settings in line with what is left: a deleted signature line switches its
 * slot off, a deleted QR code turns the QR off, a deleted partner logo
 * removes that partner.
 */
export function reconcileDeletions(design: CertificateDesign): CertificateDesign {
  const page = pageOf(design);
  const ids = new Set(page.elements.map((e) => e.id));
  let changed = false;
  const signatures = design.settings.signatures.map((s, i) => {
    if (s.enabled && !ids.has(sigPart(i, "line"))) { changed = true; return { ...s, enabled: false }; }
    return s;
  }) as CertificateSettings["signatures"];
  const qr = design.settings.qr.enabled && !ids.has(QR_ELEMENT_ID) ? { enabled: false } : design.settings.qr;
  if (qr !== design.settings.qr) changed = true;
  const partners = design.settings.partners.filter((p) => ids.has(`partner-${p.sponsorId}`) || !p.logoUrl);
  if (partners.length !== design.settings.partners.length) changed = true;
  if (!changed) return design;
  const next = { ...design, settings: { ...design.settings, signatures, qr, partners } };
  return syncPartners(syncSignatures(next, false));
}

// ─── Rendering ──────────────────────────────────────────────────────────────

/** Biggest size (pt) at which `text` fits `width` on one line; min `minPt`. */
function fitSingleLine(text: string, width: number, maxPt: number, minPt: number, bold: boolean): number {
  // 6% headroom: the estimate is close to, not exactly, the browser's metrics.
  const perPt = estimateTextWidthMm(text, 1, bold) * 1.06;
  if (perPt <= 0) return maxPt;
  return Math.max(minPt, Math.min(maxPt, width / perPt));
}

/**
 * Text that holds the participant's name (or any single-line field) must stay
 * inside its box however long the value is: shrink to fit on one line, and
 * if even the minimum size is too wide, wrap onto two lines at a size that
 * fits the box's height.
 */
export function fitTextToBox(el: TextElement, content: string): TextElement {
  const bold = el.fontWeight === "bold";
  const lineH = (pt: number) => ptToMm(pt) * el.lineHeight;
  const minPt = Math.max(9, el.fontSize * 0.45);
  const single = fitSingleLine(content, el.width, el.fontSize, minPt, bold);
  if (estimateTextWidthMm(content, single, bold) * 1.06 <= el.width + 0.01) {
    return { ...el, content, fontSize: single, verticalAlign: el.verticalAlign ?? "middle" };
  }
  // Two (or more) lines: largest size whose wrapped height fits the box.
  for (let pt = el.fontSize; pt >= 7; pt -= 0.5) {
    const lines = wrapTextLines(content, el.width / 1.06, pt, bold);
    if (lines.length * lineH(pt) <= Math.max(el.height, lineH(el.fontSize))) {
      return { ...el, content, fontSize: pt, verticalAlign: el.verticalAlign ?? "middle" };
    }
  }
  return { ...el, content, fontSize: 7, verticalAlign: el.verticalAlign ?? "middle" };
}

export interface RenderOptions {
  /** PNG data URL of the verification QR code. Without it the QR is left out. */
  qrDataUrl?: string | null;
}

/**
 * The document that is actually drawn for one person: fields filled in,
 * hidden and disabled parts removed, the QR code drawn in, and long values
 * fitted to their boxes. Used for the editor's participant preview and for
 * every PDF, so the two cannot differ.
 */
export function renderCertificate(design: CertificateDesign, values: CertificateValues, opts: RenderOptions = {}): BrochureDocument {
  const page = pageOf(design);
  const filled: CertificateValues = { certificate_type: design.settings.certificateType, ...values };
  const elements = page.elements.flatMap((el): BrochureElement[] => {
    if (el.hidden) return [];
    if (el.id === QR_ELEMENT_ID) {
      if (!design.settings.qr.enabled || !opts.qrDataUrl) return [];
      return [{ ...(el as ImageElement), src: opts.qrDataUrl }];
    }
    if (el.kind === "image" && (el.src === QR_SRC_MARKER || !el.src)) return [];
    if (el.kind === "text") {
      const tokens = findTokens(el.content);
      if (tokens.length === 0) return [el];
      const content = resolveTokens(el.content, filled);
      if (!content.trim()) return [];
      // Fields that make up a line on their own (a name, an event title) are fitted.
      const singleField = el.content.trim().replace(/\{\{\s*[a-z_]+\s*\}\}/gi, "").trim() === "";
      return [singleField ? fitTextToBox(el, content) : { ...el, content }];
    }
    if (el.kind === "pill" && findTokens(el.text).length) {
      return [{ ...el, text: resolveTokens(el.text, filled) }];
    }
    return [el];
  });
  return { ...design.document, pages: [{ ...page, elements }] };
}

// ─── Checks before publishing ───────────────────────────────────────────────

export interface DesignIssue {
  level: "error" | "warning";
  message: string;
  elementId?: string;
}

const intersects = (a: Box, b: Box, pad = 0.5) =>
  a.x + pad < b.x + b.width && b.x + pad < a.x + a.width && a.y + pad < b.y + b.height && b.y + pad < a.y + a.height;

/** Bounding box of every visible element in a group (or the element with that id). */
function visibleBox(page: BrochurePage, match: (el: BrochureElement) => boolean): Box | null {
  const els = page.elements.filter((e) => !e.hidden && match(e));
  if (els.length === 0) return null;
  const x = Math.min(...els.map((e) => e.x));
  const y = Math.min(...els.map((e) => e.y));
  return { x, y, width: Math.max(...els.map((e) => e.x + e.width)) - x, height: Math.max(...els.map((e) => e.y + e.height)) - y };
}

export function checkDesign(design: CertificateDesign): DesignIssue[] {
  const issues: DesignIssue[] = [];
  const page = pageOf(design);
  const texts = page.elements.filter((e): e is TextElement => e.kind === "text");

  const nameEl = texts.find((t) => !t.hidden && findTokens(t.content).includes("participant_name"));
  if (!nameEl) issues.push({ level: "error", message: "Add the participant's name — insert the “Participant name” field into a text box." });
  for (const t of texts) {
    for (const key of unknownTokens(t.content)) {
      issues.push({ level: "error", message: `“{{${key}}}” isn't a field Illuxus can fill in. Pick fields from the field list.`, elementId: t.id });
    }
  }

  design.settings.signatures.forEach((s, i) => {
    if (!s.enabled) return;
    if (!s.name.trim()) issues.push({ level: "error", message: `Signature ${i + 1} is on but has no signatory name.`, elementId: sigPart(i, "name") });
    if (!s.imageSrc) issues.push({ level: "warning", message: `Signature ${i + 1} has no signature image — only the name and line will print.`, elementId: sigPart(i, "image") });
    if (!s.designation.trim()) issues.push({ level: "warning", message: `Signature ${i + 1} has no designation.`, elementId: sigPart(i, "title") });
  });

  for (const p of design.settings.partners) {
    if (!p.logoUrl) issues.push({ level: "warning", message: `${p.name || "A partner"} has no logo on file, so nothing will show for it. Add a logo in Sponsors.` });
  }

  if (nameEl) {
    const others: { label: string; box: Box | null }[] = [
      { label: "the organisation logo", box: visibleBox(page, (e) => e.id === ORG_LOGO_ID) },
      { label: "the partner logos", box: visibleBox(page, (e) => e.groupId === PARTNER_GROUP) },
      { label: "the QR code", box: design.settings.qr.enabled ? visibleBox(page, (e) => e.id === QR_ELEMENT_ID) : null },
      ...SIGNATURE_IDS.map((g, i) => ({ label: `signature ${i + 1}`, box: visibleBox(page, (e) => e.groupId === g) })),
    ];
    for (const o of others) {
      if (o.box && intersects(nameEl, o.box)) issues.push({ level: "warning", message: `The participant's name overlaps ${o.label}.`, elementId: nameEl.id });
    }
  }
  const sigBoxes = SIGNATURE_IDS.map((g) => visibleBox(page, (e) => e.groupId === g));
  const qrBox = design.settings.qr.enabled ? visibleBox(page, (e) => e.id === QR_ELEMENT_ID) : null;
  const partnerBox = visibleBox(page, (e) => e.groupId === PARTNER_GROUP);
  sigBoxes.forEach((b, i) => {
    if (!b) return;
    sigBoxes.slice(i + 1).forEach((c, j) => { if (c && intersects(b, c)) issues.push({ level: "warning", message: `Signatures ${i + 1} and ${i + j + 2} overlap.` }); });
    if (qrBox && intersects(b, qrBox)) issues.push({ level: "warning", message: `Signature ${i + 1} overlaps the QR code.` });
    if (partnerBox && intersects(b, partnerBox)) issues.push({ level: "warning", message: `Signature ${i + 1} overlaps the partner logos.` });
  });

  const outside = page.elements.filter((e) => !e.hidden && e.groupId !== BG_DECO_GROUP && e.id !== BG_IMAGE_ID && (e.x < -1 || e.y < -1 || e.x + e.width > page.width + 1 || e.y + e.height > page.height + 1));
  if (outside.length) issues.push({ level: "warning", message: `${outside.length} element${outside.length === 1 ? " runs" : "s run"} off the page.`, elementId: outside[0].id });

  return issues;
}

export const hasErrors = (issues: DesignIssue[]) => issues.some((i) => i.level === "error");

/** A fresh, independent copy of a design (new document id). */
export function cloneDesign(design: CertificateDesign, title?: string): CertificateDesign {
  const copy = JSON.parse(JSON.stringify(design)) as CertificateDesign;
  const now = new Date().toISOString();
  copy.document = { ...copy.document, id: generateId("doc"), title: title ?? copy.document.title, createdAt: now, updatedAt: now };
  return copy;
}
