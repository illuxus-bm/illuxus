/**
 * Built-in certificate templates.
 *
 * Every template is built from configuration — a composition, a background,
 * a palette and fonts — into an ordinary editable design, so the gallery
 * thumbnails are drawn by the same renderer as the final PDF and nothing here
 * is a static picture.
 *
 * The compositions differ in structure, not just colour: a centred classic, a
 * header banner, a side panel, a split panel, a minimal left-aligned layout, a
 * seal between signatures, a data-grid "tech" layout, a creative display
 * layout, and two portrait layouts.
 *
 * Signature slots start switched on but blank — never with an invented name —
 * so the organiser fills in real signatories (or turns slots off) before
 * publishing.
 */
import {
  newDocument,
  newShapeElement,
  newTextElement,
  type BrochureElement,
  type ShapeElement,
  type TextElement,
} from "@/lib/brochure/editor/editor-document";
import { ptToMm } from "@/lib/brochure/editor/editor-units";
import { BACKGROUNDS, findBackground } from "./certificate-backgrounds";
import {
  A4_LANDSCAPE,
  A4_PORTRAIT,
  QR_ELEMENT_ID,
  applyBackground,
  defaultSettings,
  setOrgLogo,
  setQrEnabled,
  syncPartners,
  syncSignatures,
  type Box,
  type CertificateDesign,
  type Orientation,
} from "./certificate-design";

export const TEMPLATE_CATEGORIES = [
  "Corporate Professional",
  "Minimal & Modern",
  "Executive & Leadership",
  "Conference & Summit",
  "Workshop & Training",
  "Academic & Formal",
  "Premium & Luxury",
  "Technology & Innovation",
  "Creative & Contemporary",
  "Participation & Completion",
] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

type LayoutId = "classic" | "banner" | "sidebar" | "split" | "minimal" | "seal" | "tech" | "creative" | "portraitFormal" | "portraitModern";

interface Palette {
  ink: string;
  muted: string;
  accent: string;
  /** Fill of a panel, band or block. */
  panel: string;
  /** Optional second colour for a gradient panel. */
  panel2?: string;
  onPanel: string;
  line: string;
}

interface Fonts { title: string; name: string; body: string }

export interface TemplateSpec {
  id: string;
  name: string;
  category: TemplateCategory;
  orientation: Orientation;
  description: string;
  layout: LayoutId;
  background: string;
  palette: Palette;
  fonts: Fonts;
  certificateType: string;
  /** How many signature slots start switched on (blank). */
  signatures: 0 | 1 | 2 | 3;
}

interface LayoutResult {
  elements: BrochureElement[];
  logo: Box;
  signatureBand: Box;
  partnerStrip: Box;
  qr: Box;
  nameColor?: string;
}

// ─── Element shorthands ─────────────────────────────────────────────────────

interface TextOpts {
  font: string; size: number; color: string; bold?: boolean; italic?: boolean;
  align?: TextElement["align"]; ls?: number; upper?: boolean; lh?: number; va?: TextElement["verticalAlign"]; id?: string; h?: number;
}
function t(content: string, x: number, y: number, width: number, o: TextOpts): TextElement {
  const lh = o.lh ?? 1.2;
  const lines = content.split("\n").length;
  const el = newTextElement({
    x, y, width, height: o.h ?? ptToMm(o.size) * lh * lines + 0.5, content, fontFamily: o.font, fontSize: o.size, color: o.color,
    fontWeight: o.bold ? "bold" : "normal", fontStyle: o.italic ? "italic" : "normal", align: o.align ?? "center", lineHeight: lh,
    letterSpacing: o.ls, textTransform: o.upper ? "uppercase" : undefined, verticalAlign: o.va,
  });
  return o.id ? { ...el, id: o.id } : el;
}
type ShapeSeed = Parameters<typeof newShapeElement>[0];
const s = (seed: ShapeSeed): ShapeElement => newShapeElement({ stroke: "transparent", strokeWidth: 0, ...seed });
const hr = (x: number, y: number, width: number, color: string, weight = 0.4) => s({ shape: "line", x, y, width, height: 1, fill: "transparent", stroke: color, strokeWidth: weight });
const panelFill = (p: Palette) => (p.panel2 ? { fill: p.panel, fillGradient: { from: p.panel, to: p.panel2, direction: "diagonal" as const } } : { fill: p.panel });

const NAME = "{{participant_name}}";
const ROLE_LINE = "{{participant_designation}}, {{participant_company}}";
const FOOTER = "Certificate ID {{certificate_id}}  ·  Issued {{issue_date}}";

// ─── Compositions ───────────────────────────────────────────────────────────

function layout(id: LayoutId, w: number, h: number, p: Palette, f: Fonts): LayoutResult {
  switch (id) {
    case "classic": {
      const cx = w / 2;
      return {
        elements: [
          t("{{certificate_type}}", 30, 36, w - 60, { font: f.title, size: 24, color: p.ink, upper: true, ls: 3 }),
          hr(cx - 22, 49, 44, p.accent, 0.6),
          t("This certificate is proudly presented to", 40, 56, w - 80, { font: f.body, size: 11, color: p.muted, italic: true }),
          t(NAME, 40, 64, w - 80, { font: f.name, size: 40, color: p.accent, h: 21, va: "middle", id: "cert-name" }),
          hr(cx - 65, 86, 130, p.line, 0.35),
          t("for participating in {{event_name}}\nheld on {{event_date}}", 50, 91, w - 100, { font: f.body, size: 11.5, color: p.muted, lh: 1.4 }),
          t(FOOTER, 22, h - 23, 150, { font: f.body, size: 7.5, color: p.muted, align: "left" }),
        ],
        logo: { x: cx - 30, y: 15, width: 60, height: 15 },
        signatureBand: { x: 48, y: 116, width: w - 96, height: 30 },
        partnerStrip: { x: 60, y: 165, width: w - 120, height: 13 },
        qr: { x: w - 38, y: h - 40, width: 18, height: 18 },
      };
    }
    case "banner": {
      return {
        elements: [
          s({ x: 0, y: 0, width: w, height: 48, ...panelFill(p) }),
          t("{{certificate_type}}", 24, 17, 170, { font: f.title, size: 24, color: p.onPanel, bold: true, align: "left" }),
          t("{{event_name}}", 24, 31, 170, { font: f.body, size: 11, color: p.onPanel, align: "left" }),
          t("Awarded to", 24, 62, 120, { font: f.body, size: 9, color: p.accent, align: "left", upper: true, ls: 2, bold: true }),
          t(NAME, 24, 69, w - 90, { font: f.name, size: 34, color: p.ink, bold: true, align: "left", h: 18, va: "middle", id: "cert-name" }),
          t(ROLE_LINE, 24, 89, w - 90, { font: f.body, size: 11, color: p.muted, align: "left" }),
          t("In recognition of participation in {{event_name}} on {{event_date}}.", 24, 101, 190, { font: f.body, size: 11, color: p.muted, align: "left", lh: 1.4 }),
          t(FOOTER, 24, h - 17, 160, { font: f.body, size: 7.5, color: p.muted, align: "left" }),
        ],
        logo: { x: w - 82, y: 14, width: 58, height: 20 },
        signatureBand: { x: 24, y: 124, width: w - 48, height: 30 },
        partnerStrip: { x: 24, y: 168, width: w - 48, height: 12 },
        qr: { x: w - 50, y: 64, width: 26, height: 26 },
      };
    }
    case "sidebar": {
      const pw = 80;
      return {
        elements: [
          s({ x: 0, y: 0, width: pw, height: h, ...panelFill(p) }),
          t("Certificate", 12, 70, pw - 24, { font: f.title, size: 26, color: p.onPanel, bold: true, align: "left" }),
          t("{{certificate_type}}", 12, 83, pw - 24, { font: f.body, size: 10, color: p.onPanel, align: "left", lh: 1.3 }),
          t("{{certificate_id}}", 12, h - 20, pw - 24, { font: f.body, size: 7, color: p.onPanel, align: "left" }),
          t("Presented to", 98, 40, 160, { font: f.body, size: 10, color: p.muted, align: "left", upper: true, ls: 1.5 }),
          t(NAME, 98, 48, w - 118, { font: f.name, size: 34, color: p.ink, bold: true, align: "left", h: 19, va: "middle", id: "cert-name" }),
          s({ x: 98, y: 70, width: 28, height: 1.4, fill: p.accent }),
          t(ROLE_LINE, 98, 76, w - 118, { font: f.body, size: 10.5, color: p.muted, align: "left" }),
          t("for successfully participating in {{event_name}}, held on {{event_date}}.", 98, 90, w - 125, { font: f.body, size: 11.5, color: p.ink, align: "left", lh: 1.45 }),
          t("Issued {{issue_date}}", 98, h - 20, 80, { font: f.body, size: 7.5, color: p.muted, align: "left" }),
        ],
        logo: { x: 12, y: 16, width: pw - 24, height: 18 },
        signatureBand: { x: 92, y: 126, width: w - 108, height: 30 },
        partnerStrip: { x: 98, y: 170, width: w - 120, height: 12 },
        qr: { x: 12, y: h - 50, width: 24, height: 24 },
      };
    }
    case "split": {
      const pw = 92;
      const px = w - pw;
      return {
        elements: [
          s({ x: px, y: 0, width: pw, height: h, ...panelFill(p) }),
          t("Scan to verify", px + 10, 136, pw - 20, { font: f.body, size: 8, color: p.onPanel, upper: true, ls: 1.5 }),
          t("{{certificate_id}}", px + 10, 142, pw - 20, { font: f.body, size: 8, color: p.onPanel }),
          t("{{certificate_type}}", 22, 26, px - 44, { font: f.title, size: 26, color: p.ink, align: "left", lh: 1.1 }),
          s({ x: 22, y: 44, width: 18, height: 1.4, fill: p.accent }),
          t("Presented to", 22, 58, 120, { font: f.body, size: 9.5, color: p.muted, align: "left", upper: true, ls: 1.5 }),
          t(NAME, 22, 65, px - 40, { font: f.name, size: 32, color: p.accent, align: "left", h: 18, va: "middle", id: "cert-name" }),
          t(ROLE_LINE, 22, 85, px - 40, { font: f.body, size: 10.5, color: p.muted, align: "left" }),
          t("for participating in {{event_name}}, held on {{event_date}}.", 22, 98, px - 50, { font: f.body, size: 11.5, color: p.ink, align: "left", lh: 1.45 }),
          t("Issued {{issue_date}}", 22, h - 16, 100, { font: f.body, size: 7.5, color: p.muted, align: "left" }),
        ],
        logo: { x: px + 14, y: 22, width: pw - 28, height: 20 },
        signatureBand: { x: 14, y: 128, width: px - 28, height: 30 },
        partnerStrip: { x: 22, y: 172, width: px - 44, height: 12 },
        qr: { x: px + pw / 2 - 15, y: 100, width: 30, height: 30 },
      };
    }
    case "minimal": {
      return {
        elements: [
          t("{{certificate_type}}", 28, 26, 180, { font: f.body, size: 8.5, color: p.accent, align: "left", upper: true, ls: 2.5, bold: true }),
          hr(28, 33, 22, p.ink, 0.5),
          t(NAME, 28, 62, w - 56, { font: f.name, size: 44, color: p.ink, bold: true, align: "left", h: 23, va: "middle", id: "cert-name" }),
          t(ROLE_LINE, 28, 87, w - 56, { font: f.body, size: 11, color: p.muted, align: "left" }),
          t("has completed {{event_name}}\n{{event_date}}", 28, 100, 180, { font: f.body, size: 12, color: p.ink, align: "left", lh: 1.45 }),
          t(FOOTER, 28, h - 17, 170, { font: f.body, size: 7, color: p.muted, align: "left" }),
        ],
        logo: { x: w - 80, y: 20, width: 52, height: 13 },
        signatureBand: { x: 22, y: 134, width: 180, height: 30 },
        partnerStrip: { x: 28, y: 176, width: 170, height: 12 },
        qr: { x: w - 46, y: h - 46, width: 20, height: 20 },
      };
    }
    case "seal": {
      const cx = w / 2;
      return {
        elements: [
          t("Certificate", 30, 31, w - 60, { font: f.title, size: 30, color: p.accent, upper: true, ls: 6 }),
          t("{{certificate_type}}", 30, 46, w - 60, { font: f.body, size: 10, color: p.muted, upper: true, ls: 2 }),
          t("is hereby presented to", 40, 60, w - 80, { font: f.body, size: 10.5, color: p.muted, italic: true }),
          t(NAME, 30, 68, w - 60, { font: f.name, size: 38, color: p.ink, h: 21, va: "middle", id: "cert-name" }),
          t("in recognition of participation in {{event_name}} · {{event_date}}", 45, 94, w - 90, { font: f.body, size: 11, color: p.muted, lh: 1.4 }),
          s({ shape: "ellipse", x: cx - 17, y: 128, width: 34, height: 34, ...panelFill(p) }),
          s({ shape: "ellipse", x: cx - 13.5, y: 131.5, width: 27, height: 27, fill: "transparent", stroke: p.onPanel, strokeWidth: 0.4 }),
          s({ shape: "star", x: cx - 7, y: 138, width: 14, height: 14, fill: p.onPanel }),
          t(FOOTER, 30, h - 22, w - 60, { font: f.body, size: 7.5, color: p.muted }),
        ],
        logo: { x: cx - 25, y: 14, width: 50, height: 13 },
        signatureBand: { x: 30, y: 130, width: w - 60, height: 30 },
        partnerStrip: { x: 60, y: 168, width: w - 120, height: 12 },
        qr: { x: w - 38, y: h - 42, width: 18, height: 18 },
      };
    }
    case "tech": {
      const col = (label: string, value: string, x: number) => [
        t(label, x, 108, 70, { font: f.body, size: 7, color: p.accent, align: "left", upper: true, ls: 1.5 }),
        t(value, x, 113, 70, { font: f.title, size: 10, color: p.ink, align: "left", lh: 1.3 }),
      ];
      return {
        elements: [
          t("// certificate", 24, 22, 120, { font: f.body, size: 9, color: p.accent, align: "left" }),
          t("{{certificate_type}}", 24, 30, 180, { font: f.title, size: 22, color: p.ink, bold: true, align: "left" }),
          t(NAME, 24, 62, w - 90, { font: f.name, size: 36, color: p.ink, bold: true, align: "left", h: 20, va: "middle", id: "cert-name" }),
          t(ROLE_LINE, 24, 84, w - 90, { font: f.title, size: 11, color: p.muted, align: "left" }),
          s({ x: 24, y: 100, width: w - 48, height: 0.3, fill: p.line }),
          ...col("Event", "{{event_name}}", 24),
          ...col("Date", "{{event_date}}", 100),
          ...col("Certificate ID", "{{certificate_id}}", 176),
        ],
        logo: { x: w - 80, y: 20, width: 56, height: 14 },
        signatureBand: { x: 18, y: 136, width: 210, height: 30 },
        partnerStrip: { x: 24, y: 180, width: 200, height: 12 },
        qr: { x: w - 50, y: 136, width: 26, height: 26 },
      };
    }
    case "creative": {
      return {
        elements: [
          t("Certificate", 26, 24, 170, { font: f.title, size: 44, color: p.ink, align: "left", upper: true, h: 20 }),
          s({ x: 26, y: 47, width: 52, height: 7, ...panelFill(p), cornerRadius: 3.5 }),
          t("{{certificate_type}}", 28, 48.2, 170, { font: f.body, size: 9, color: p.onPanel, align: "left", bold: true, upper: true, ls: 1 }),
          t(NAME, 26, 76, 210, { font: f.name, size: 34, color: p.accent, bold: true, align: "left", h: 19, va: "middle", id: "cert-name" }),
          t(ROLE_LINE, 26, 96, 200, { font: f.body, size: 10.5, color: p.muted, align: "left" }),
          t("for bringing their energy to {{event_name}} on {{event_date}}.", 26, 108, 170, { font: f.body, size: 11.5, color: p.ink, align: "left", lh: 1.45 }),
          t(FOOTER, 26, h - 16, 170, { font: f.body, size: 7, color: p.muted, align: "left" }),
        ],
        logo: { x: w - 84, y: 22, width: 58, height: 15 },
        signatureBand: { x: 20, y: 138, width: 196, height: 30 },
        partnerStrip: { x: 26, y: 178, width: 186, height: 12 },
        qr: { x: w - 46, y: 46, width: 20, height: 20 },
      };
    }
    case "portraitFormal": {
      const cx = w / 2;
      return {
        elements: [
          t("Certificate", 20, 48, w - 40, { font: f.title, size: 30, color: p.ink, upper: true, ls: 4 }),
          t("{{certificate_type}}", 20, 63, w - 40, { font: f.body, size: 11, color: p.accent, upper: true, ls: 1.5 }),
          hr(cx - 20, 74, 40, p.accent, 0.6),
          t("This is to certify that", 20, 86, w - 40, { font: f.body, size: 11, color: p.muted, italic: true }),
          t(NAME, 20, 96, w - 40, { font: f.name, size: 34, color: p.accent, h: 24, va: "middle", id: "cert-name" }),
          hr(cx - 55, 122, 110, p.line, 0.35),
          t(ROLE_LINE, 25, 126, w - 50, { font: f.body, size: 10.5, color: p.muted }),
          t("has successfully participated in\n{{event_name}}\nheld on {{event_date}}.", 25, 140, w - 50, { font: f.body, size: 12, color: p.ink, lh: 1.5 }),
          t(FOOTER, 22, h - 30, 120, { font: f.body, size: 7, color: p.muted, align: "left" }),
        ],
        logo: { x: cx - 26, y: 24, width: 52, height: 16 },
        signatureBand: { x: 20, y: 194, width: w - 40, height: 34 },
        partnerStrip: { x: 25, y: 242, width: w - 50, height: 14 },
        qr: { x: w - 42, y: h - 44, width: 18, height: 18 },
      };
    }
    case "portraitModern": {
      return {
        elements: [
          s({ x: 0, y: 0, width: w, height: 96, ...panelFill(p) }),
          t("{{certificate_type}}", 18, 48, w - 36, { font: f.title, size: 24, color: p.onPanel, bold: true, lh: 1.15 }),
          t("{{event_name}}", 18, 66, w - 36, { font: f.body, size: 11.5, color: p.onPanel }),
          t("{{event_date}}", 18, 74, w - 36, { font: f.body, size: 10, color: p.onPanel }),
          t("Presented to", 18, 112, w - 36, { font: f.body, size: 9.5, color: p.muted, upper: true, ls: 2 }),
          t(NAME, 18, 120, w - 36, { font: f.name, size: 32, color: p.ink, bold: true, h: 20, va: "middle", id: "cert-name" }),
          s({ x: w / 2 - 14, y: 143, width: 28, height: 1.2, fill: p.accent }),
          t(ROLE_LINE, 22, 148, w - 44, { font: f.body, size: 10.5, color: p.muted }),
          t("for taking part in {{event_name}}.", 25, 162, w - 50, { font: f.body, size: 11.5, color: p.ink, lh: 1.45 }),
          t(FOOTER, 18, h - 18, 130, { font: f.body, size: 7, color: p.muted, align: "left" }),
        ],
        logo: { x: w / 2 - 28, y: 18, width: 56, height: 18 },
        signatureBand: { x: 20, y: 196, width: w - 40, height: 34 },
        partnerStrip: { x: 25, y: 246, width: w - 50, height: 14 },
        qr: { x: w - 40, y: h - 40, width: 18, height: 18 },
      };
    }
  }
}

// ─── Catalogue ──────────────────────────────────────────────────────────────

const PAL = {
  corporateBlue: { ink: "#0f172a", muted: "#475569", accent: "#1d4ed8", panel: "#1e3a8a", panel2: "#1d4ed8", onPanel: "#ffffff", line: "#cbd5e1" },
  navyPanel: { ink: "#111827", muted: "#4b5563", accent: "#1e3a8a", panel: "#132347", onPanel: "#f8fafc", line: "#d1d5db" },
  slate: { ink: "#111827", muted: "#4b5563", accent: "#334155", panel: "#1f2937", onPanel: "#f9fafb", line: "#d1d5db" },
  mono: { ink: "#0a0a0a", muted: "#525252", accent: "#0a0a0a", panel: "#0a0a0a", onPanel: "#ffffff", line: "#d4d4d4" },
  inkBlue: { ink: "#111827", muted: "#6b7280", accent: "#2563eb", panel: "#111827", onPanel: "#ffffff", line: "#e5e7eb" },
  navyGold: { ink: "#f5f1e6", muted: "#c8c2b2", accent: "#d9b75a", panel: "#c9a646", onPanel: "#0f1b33", line: "#c9a646" },
  midnight: { ink: "#f8fafc", muted: "#cbd5e1", accent: "#e2c46d", panel: "#c9a646", panel2: "#e6cf86", onPanel: "#0b1430", line: "#64748b" },
  indigo: { ink: "#1e1b4b", muted: "#4c4f69", accent: "#4f46e5", panel: "#4f46e5", panel2: "#9333ea", onPanel: "#ffffff", line: "#c7d2fe" },
  sunrise: { ink: "#1c1917", muted: "#57534e", accent: "#ea580c", panel: "#ea580c", panel2: "#e11d48", onPanel: "#ffffff", line: "#fed7aa" },
  emerald: { ink: "#0f172a", muted: "#475569", accent: "#059669", panel: "#047857", panel2: "#059669", onPanel: "#ecfdf5", line: "#a7f3d0" },
  teal: { ink: "#0f172a", muted: "#475569", accent: "#0d9488", panel: "#0d9488", onPanel: "#ffffff", line: "#99f6e4" },
  maroon: { ink: "#1c1917", muted: "#57534e", accent: "#7c2d12", panel: "#7c2d12", onPanel: "#fffdf7", line: "#d6b8a6" },
  navyFormal: { ink: "#0f1e36", muted: "#475569", accent: "#1e3a5f", panel: "#1e3a5f", onPanel: "#ffffff", line: "#94a3b8" },
  bronze: { ink: "#2b2a28", muted: "#6b5e4b", accent: "#8a6d3b", panel: "#8a6d3b", onPanel: "#fbf7ee", line: "#c9b28a" },
  blackGold: { ink: "#f3eadb", muted: "#bfb5a3", accent: "#d4af37", panel: "#d4af37", panel2: "#f0d77b", onPanel: "#0b0b0c", line: "#8c7a4a" },
  champagne: { ink: "#2d2417", muted: "#6b5d48", accent: "#a8853a", panel: "#a8853a", onPanel: "#fffaf0", line: "#d8c49a" },
  cyanDark: { ink: "#e2e8f0", muted: "#94a3b8", accent: "#22d3ee", panel: "#0e7490", onPanel: "#ecfeff", line: "#334155" },
  cyanLight: { ink: "#0f172a", muted: "#475569", accent: "#0284c7", panel: "#0f172a", onPanel: "#e0f2fe", line: "#bae6fd" },
  violetDark: { ink: "#0f172a", muted: "#475569", accent: "#7c3aed", panel: "#0f172a", panel2: "#312e81", onPanel: "#e0e7ff", line: "#ddd6fe" },
  creativeIndigo: { ink: "#111827", muted: "#4b5563", accent: "#4f46e5", panel: "#4f46e5", onPanel: "#ffffff", line: "#c7d2fe" },
  coral: { ink: "#1f1f1f", muted: "#525252", accent: "#f05a3d", panel: "#f05a3d", panel2: "#ffb547", onPanel: "#ffffff", line: "#fecaca" },
  sky: { ink: "#0f172a", muted: "#475569", accent: "#1d4ed8", panel: "#1d4ed8", onPanel: "#ffffff", line: "#bfdbfe" },
  green: { ink: "#14532d", muted: "#3f6212", accent: "#15803d", panel: "#15803d", panel2: "#22c55e", onPanel: "#ffffff", line: "#bbf7d0" },
} satisfies Record<string, Palette>;

const L = "landscape" as const;
const P = "portrait" as const;
const PART = "Certificate of Participation";

export const TEMPLATES: TemplateSpec[] = [
  // Corporate Professional
  { id: "corp-banner", name: "Boardroom Banner", category: "Corporate Professional", orientation: L, description: "Full-width brand band, left-aligned recipient, QR beside the name.", layout: "banner", background: "blue-band", palette: PAL.corporateBlue, fonts: { title: "Montserrat", name: "Montserrat", body: "Lato" }, certificateType: PART, signatures: 2 },
  { id: "corp-sidebar", name: "Navy Sidebar", category: "Corporate Professional", orientation: L, description: "A tall navy panel carries the logo, title and QR; content sits to the right.", layout: "sidebar", background: "white-plain", palette: PAL.navyPanel, fonts: { title: "Raleway", name: "Raleway", body: "Open Sans" }, certificateType: PART, signatures: 2 },
  { id: "corp-split", name: "Graphite Split", category: "Corporate Professional", orientation: L, description: "Two-column layout with a graphite verification panel.", layout: "split", background: "white-hairline", palette: PAL.slate, fonts: { title: "Lora", name: "Lora", body: "Inter" }, certificateType: PART, signatures: 2 },
  // Minimal & Modern
  { id: "min-mono", name: "Monochrome Minimal", category: "Minimal & Modern", orientation: L, description: "Large name, generous whitespace, nothing extra.", layout: "minimal", background: "white-plain", palette: PAL.mono, fonts: { title: "Inter", name: "Inter", body: "Inter" }, certificateType: PART, signatures: 1 },
  { id: "min-rule", name: "Edge Rule", category: "Minimal & Modern", orientation: L, description: "Centred and quiet, with a single black rule along the edge.", layout: "classic", background: "white-edge-rule", palette: PAL.inkBlue, fonts: { title: "DM Sans", name: "DM Sans", body: "DM Sans" }, certificateType: PART, signatures: 2 },
  { id: "min-portrait", name: "Ink Block Portrait", category: "Minimal & Modern", orientation: P, description: "Portrait with a solid header block and centred details.", layout: "portraitModern", background: "white-plain", palette: PAL.mono, fonts: { title: "Inter", name: "Inter", body: "Inter" }, certificateType: PART, signatures: 2 },
  // Executive & Leadership
  { id: "exec-navy", name: "Executive Navy", category: "Executive & Leadership", orientation: L, description: "Navy with fine gold framing and a script name.", layout: "classic", background: "navy-gold-frame", palette: PAL.navyGold, fonts: { title: "Cormorant Garamond", name: "Great Vibes", body: "Lato" }, certificateType: "Certificate of Leadership Participation", signatures: 2 },
  { id: "exec-midnight", name: "Midnight Seal", category: "Executive & Leadership", orientation: L, description: "Midnight gradient with a gold seal between two signatures.", layout: "seal", background: "navy-gradient", palette: PAL.midnight, fonts: { title: "Cormorant Garamond", name: "Playfair Display", body: "Lato" }, certificateType: "Executive Programme", signatures: 2 },
  // Conference & Summit
  { id: "conf-gradient", name: "Summit Gradient", category: "Conference & Summit", orientation: L, description: "Indigo-to-violet banner with soft gradient shapes.", layout: "banner", background: "grad-indigo", palette: PAL.indigo, fonts: { title: "Poppins", name: "Poppins", body: "Poppins" }, certificateType: "Certificate of Attendance", signatures: 2 },
  { id: "conf-split", name: "Keynote Split", category: "Conference & Summit", orientation: L, description: "Warm sunrise accent panel with the QR front and centre.", layout: "split", background: "grad-sunrise", palette: PAL.sunrise, fonts: { title: "Montserrat", name: "Montserrat", body: "Lato" }, certificateType: "Certificate of Attendance", signatures: 2 },
  { id: "conf-portrait", name: "Summit Portrait", category: "Conference & Summit", orientation: P, description: "Portrait with a gradient header block.", layout: "portraitModern", background: "white-plain", palette: PAL.indigo, fonts: { title: "Poppins", name: "Poppins", body: "Poppins" }, certificateType: "Certificate of Attendance", signatures: 2 },
  // Workshop & Training
  { id: "work-sidebar", name: "Training Track", category: "Workshop & Training", orientation: L, description: "Emerald side panel, practical and clear.", layout: "sidebar", background: "white-plain", palette: PAL.emerald, fonts: { title: "Nunito", name: "Nunito", body: "Nunito" }, certificateType: "Certificate of Training", signatures: 2 },
  { id: "work-minimal", name: "Skills Minimal", category: "Workshop & Training", orientation: L, description: "Left-aligned on a light blue wash.", layout: "minimal", background: "blue-wash", palette: PAL.teal, fonts: { title: "Work Sans", name: "Work Sans", body: "Work Sans" }, certificateType: "Workshop Completion", signatures: 1 },
  { id: "work-portrait", name: "Workshop Portrait", category: "Workshop & Training", orientation: P, description: "Portrait, centred, with a hairline frame.", layout: "portraitFormal", background: "white-hairline", palette: PAL.emerald, fonts: { title: "Lato", name: "Lato", body: "Lato" }, certificateType: "Certificate of Training", signatures: 2 },
  // Academic & Formal
  { id: "acad-classic", name: "Academic Classic", category: "Academic & Formal", orientation: L, description: "Ornamental maroon border, serif title and script name.", layout: "classic", background: "ornate-classic", palette: PAL.maroon, fonts: { title: "Playfair Display", name: "Great Vibes", body: "Lora" }, certificateType: PART, signatures: 3 },
  { id: "acad-portrait", name: "Guilloché Portrait", category: "Academic & Formal", orientation: P, description: "Portrait with a dotted guilloché frame.", layout: "portraitFormal", background: "ornate-guilloche", palette: PAL.navyFormal, fonts: { title: "Cormorant Garamond", name: "Cormorant Garamond", body: "Lora" }, certificateType: PART, signatures: 2 },
  { id: "acad-seal", name: "Ivory Seal", category: "Academic & Formal", orientation: L, description: "Ivory double frame with a bronze seal.", layout: "seal", background: "ivory-double", palette: PAL.bronze, fonts: { title: "Lora", name: "Dancing Script", body: "Lora" }, certificateType: "Certificate of Merit", signatures: 2 },
  // Premium & Luxury
  { id: "lux-black-gold", name: "Black & Gold", category: "Premium & Luxury", orientation: L, description: "Black with a double gold frame and a gold seal.", layout: "seal", background: "black-gold", palette: PAL.blackGold, fonts: { title: "Cormorant Garamond", name: "Great Vibes", body: "Lato" }, certificateType: "Certificate of Distinction", signatures: 2 },
  { id: "lux-champagne", name: "Champagne", category: "Premium & Luxury", orientation: L, description: "Cream with a soft border and champagne script.", layout: "classic", background: "cream-soft", palette: PAL.champagne, fonts: { title: "Playfair Display", name: "Dancing Script", body: "Lora" }, certificateType: "Certificate of Recognition", signatures: 2 },
  { id: "lux-deco", name: "Art Deco Portrait", category: "Premium & Luxury", orientation: P, description: "Portrait on black with art-deco gold corners.", layout: "portraitFormal", background: "black-gold-deco", palette: PAL.blackGold, fonts: { title: "Cormorant Garamond", name: "Great Vibes", body: "Lato" }, certificateType: "Certificate of Distinction", signatures: 2 },
  // Technology & Innovation
  { id: "tech-grid", name: "Blueprint", category: "Technology & Innovation", orientation: L, description: "Dark blueprint grid with a data row for event, date and ID.", layout: "tech", background: "tech-grid", palette: PAL.cyanDark, fonts: { title: "Space Grotesk", name: "Space Grotesk", body: "JetBrains Mono" }, certificateType: "Certificate of Participation", signatures: 2 },
  { id: "tech-circuit", name: "Circuit", category: "Technology & Innovation", orientation: L, description: "Dark side panel with circuit-trace accents.", layout: "sidebar", background: "tech-circuit", palette: PAL.cyanLight, fonts: { title: "Space Grotesk", name: "Space Grotesk", body: "Space Mono" }, certificateType: "Hackathon Participation", signatures: 2 },
  { id: "tech-split", name: "Deep Space Split", category: "Technology & Innovation", orientation: L, description: "Dark violet verification panel beside clean content.", layout: "split", background: "white-plain", palette: PAL.violetDark, fonts: { title: "Space Grotesk", name: "Space Grotesk", body: "Inter" }, certificateType: "Certificate of Participation", signatures: 2 },
  // Creative & Contemporary
  { id: "creative-triangles", name: "Bold Angles", category: "Creative & Contemporary", orientation: L, description: "Display type with geometric corner shapes.", layout: "creative", background: "geo-triangles", palette: PAL.creativeIndigo, fonts: { title: "Oswald", name: "Poppins", body: "Poppins" }, certificateType: PART, signatures: 2 },
  { id: "creative-hex", name: "Coral Hex", category: "Creative & Contemporary", orientation: L, description: "A coral-to-amber panel and a hexagon cluster.", layout: "split", background: "geo-hex", palette: PAL.coral, fonts: { title: "Archivo Black", name: "Raleway", body: "Raleway" }, certificateType: PART, signatures: 2 },
  // Participation & Completion
  { id: "part-classic", name: "Participation Classic", category: "Participation & Completion", orientation: L, description: "Centred, friendly blue, script name.", layout: "classic", background: "blue-wash", palette: PAL.sky, fonts: { title: "Montserrat", name: "Dancing Script", body: "Lato" }, certificateType: PART, signatures: 2 },
  { id: "part-completion", name: "Completion Banner", category: "Participation & Completion", orientation: L, description: "Green banner for courses and programmes.", layout: "banner", background: "white-hairline", palette: PAL.green, fonts: { title: "Poppins", name: "Poppins", body: "Lato" }, certificateType: "Certificate of Completion", signatures: 2 },
  { id: "part-portrait", name: "Participation Portrait", category: "Participation & Completion", orientation: P, description: "Portrait with a blue header block.", layout: "portraitModern", background: "white-plain", palette: PAL.sky, fonts: { title: "Lato", name: "Lato", body: "Lato" }, certificateType: PART, signatures: 2 },
];

export const findTemplate = (id: string | null | undefined): TemplateSpec | undefined => TEMPLATES.find((tpl) => tpl.id === id);

export interface BuildOptions {
  /** A Brand Kit logo to place in the template's logo spot. */
  logoUrl?: string | null;
}

/** Builds a fresh, editable design from a built-in template. */
export function buildTemplate(spec: TemplateSpec, opts: BuildOptions = {}): CertificateDesign {
  const size = spec.orientation === "landscape" ? A4_LANDSCAPE : A4_PORTRAIT;
  const doc = newDocument(spec.name);
  doc.pages[0] = { ...doc.pages[0], width: size.width, height: size.height };
  const out = layout(spec.layout, size.width, size.height, spec.palette, spec.fonts);
  doc.pages[0].elements = out.elements.map((el, i) => ({ ...el, zIndex: i + 1 }));

  const base = defaultSettings(size);
  let design: CertificateDesign = {
    document: doc,
    settings: {
      ...base,
      signatureBand: out.signatureBand,
      partnerStrip: out.partnerStrip,
      signatureStyle: { fontFamily: spec.fonts.body, color: spec.palette.ink, lineColor: spec.palette.line },
      certificateType: spec.certificateType,
      signatures: base.signatures.map((slot, i) => ({ ...slot, enabled: i < spec.signatures })) as CertificateDesign["settings"]["signatures"],
    },
  };

  const bg = findBackground(spec.background) ?? BACKGROUNDS[0];
  design = applyBackground(design, bg);
  design = syncSignatures(design, true);
  design = setQrEnabled(design, true);
  design = {
    ...design,
    document: {
      ...design.document,
      pages: [{ ...design.document.pages[0], elements: design.document.pages[0].elements.map((el) => (el.id === QR_ELEMENT_ID ? { ...el, ...out.qr } : el)) }],
    },
  };
  if (opts.logoUrl) {
    design = setOrgLogo(design, opts.logoUrl);
    design = {
      ...design,
      document: {
        ...design.document,
        pages: [{ ...design.document.pages[0], elements: design.document.pages[0].elements.map((el) => (el.id === "org-logo" ? { ...el, ...out.logo } : el)) }],
      },
    };
  }
  design = syncPartners(design);
  return design;
}
