export type ElementKey =
  | "name"
  | "company"
  | "qr"
  | "email"
  | "title"        // job title / designation
  | "ticket"       // ticket_type label (e.g. "VIP", "Speaker", "Attendee")
  | "eventTitle"   // event name
  | "eventDate"    // pre-formatted date string
  | "orgName"      // organising organisation name
  | "customText";  // free-text caption set by the organiser

/** Common Google + system font choices for badge text. */
export const BADGE_FONT_OPTIONS = [
  "Inter",
  "DM Sans",
  "Space Grotesk",
  "Sora",
  "Plus Jakarta Sans",
  "Manrope",
  "Outfit",
  "Urbanist",
  "Roboto",
  "Open Sans",
  "Lato",
  "Montserrat",
  "Poppins",
  "Playfair Display",
  "Merriweather",
  "Source Sans Pro",
] as const;
export type BadgeFont = typeof BADGE_FONT_OPTIONS[number];

export type ElementPlacement = {
  enabled: boolean;
  x: number;        // 0..100 (% of badge width, center anchor)
  y: number;        // 0..100 (% of badge height, center anchor)
  size: number;     // pt for text, mm for QR
  color: string;    // hex
  /** Font family. Ignored for QR elements. */
  fontFamily?: BadgeFont;
  /** CSS font-weight (100–900). Ignored for QR. */
  fontWeight?: number;
  /** Italic. Ignored for QR. */
  italic?: boolean;
  /** Horizontal alignment of multi-character text. Center by default. */
  align?: "left" | "center" | "right";
  /** Text transform applied at render time. */
  transform?: "none" | "uppercase" | "capitalize" | "lowercase";
  /** Letter spacing in em units (e.g. 0.05). */
  letterSpacing?: number;
  /** Line height multiplier. 1.1 by default. */
  lineHeight?: number;
  /** Static text content (only for `customText`); overrides the dynamic source. */
  staticText?: string;
};

/** How an uploaded background image is fitted into the badge area. */
export type BgFit = "cover" | "contain" | "stretch" | "custom";

/** Per-image sizing / positioning controls. */
export type BgTransform = {
  fit: BgFit;
  /** When fit === "custom": background-size as a % of badge width (10–400). */
  scale: number;
  /** When fit !== "stretch": horizontal offset in % (-50..+50, 0 = center). */
  offsetX: number;
  /** When fit !== "stretch": vertical offset in % (-50..+50, 0 = center). */
  offsetY: number;
  /** Fill color shown around a "contain"-fit image (CSS color). */
  fillColor: string;
};

export const defaultBgTransform = (): BgTransform => ({
  fit: "cover",
  scale: 100,
  offsetX: 0,
  offsetY: 0,
  fillColor: "#ffffff",
});

export type BadgeDesign = {
  frontBg?: string;                          // data URL or ""
  frontBgTransform?: BgTransform;            // sizing/position for front bg
  elements: Record<ElementKey, ElementPlacement>;
  back: "none" | "same" | "static";
  backBg?: string;                           // data URL when back === "static"
  backBgTransform?: BgTransform;             // sizing/position for back bg
  fullBleed?: boolean;                       // print one badge per page edge-to-edge
};

export type SavedSize = { name: string; w: number; h: number; unit: "in" | "cm" | "mm" };

const DESIGN_PREFIX = "lovable.badge-design.v1:";
const SIZES_KEY = "lovable.print-sizes.v1";

export const defaultDesign = (): BadgeDesign => ({
  frontBg: "",
  frontBgTransform: defaultBgTransform(),
  back: "none",
  backBg: "",
  backBgTransform: defaultBgTransform(),
  fullBleed: true,
  elements: {
    name:        { enabled: true,  x: 50, y: 42, size: 22, color: "#111111", fontFamily: "Inter",        fontWeight: 700, align: "center", transform: "none",      letterSpacing: -0.01, lineHeight: 1.1 },
    company:     { enabled: true,  x: 50, y: 56, size: 12, color: "#555555", fontFamily: "Inter",        fontWeight: 400, align: "center", transform: "none",      letterSpacing: 0,     lineHeight: 1.2 },
    qr:          { enabled: true,  x: 50, y: 80, size: 26, color: "#000000" },
    email:       { enabled: false, x: 50, y: 64, size: 9,  color: "#777777", fontFamily: "Inter",        fontWeight: 400, align: "center", transform: "lowercase", letterSpacing: 0,     lineHeight: 1.2 },
    title:       { enabled: false, x: 50, y: 50, size: 11, color: "#666666", fontFamily: "Inter",        fontWeight: 500, align: "center", transform: "none",      letterSpacing: 0,     lineHeight: 1.2 },
    ticket:      { enabled: false, x: 50, y: 18, size: 9,  color: "#ffffff", fontFamily: "Inter",        fontWeight: 700, align: "center", transform: "uppercase", letterSpacing: 0.12,  lineHeight: 1.2 },
    eventTitle:  { enabled: false, x: 50, y: 14, size: 10, color: "#111111", fontFamily: "Inter",        fontWeight: 600, align: "center", transform: "uppercase", letterSpacing: 0.14,  lineHeight: 1.2 },
    eventDate:   { enabled: false, x: 50, y: 26, size: 8,  color: "#666666", fontFamily: "Inter",        fontWeight: 400, align: "center", transform: "none",      letterSpacing: 0,     lineHeight: 1.2 },
    orgName:     { enabled: false, x: 50, y: 8,  size: 8,  color: "#64748b", fontFamily: "Inter",        fontWeight: 600, align: "center", transform: "uppercase", letterSpacing: 0.18,  lineHeight: 1.2 },
    customText:  { enabled: false, x: 50, y: 70, size: 10, color: "#666666", fontFamily: "Inter",        fontWeight: 400, align: "center", transform: "none",      letterSpacing: 0,     lineHeight: 1.3, staticText: "" },
  },
});

export function loadDesign(eventId: string): BadgeDesign {
  try {
    const raw = localStorage.getItem(DESIGN_PREFIX + eventId);
    if (!raw) return defaultDesign();
    const parsed = JSON.parse(raw);
    const def = defaultDesign();
    // Forward-merge element keys so saved designs from older schema versions
    // (which only had name/company/qr) pick up the new keys with their
    // disabled defaults instead of crashing.
    const mergedElements = { ...def.elements };
    if (parsed.elements && typeof parsed.elements === "object") {
      for (const k of Object.keys(def.elements) as ElementKey[]) {
        if (parsed.elements[k]) {
          mergedElements[k] = { ...def.elements[k], ...parsed.elements[k] };
        }
      }
    }
    return {
      ...def,
      ...parsed,
      elements: mergedElements,
      frontBgTransform: { ...def.frontBgTransform!, ...(parsed.frontBgTransform || {}) },
      backBgTransform:  { ...def.backBgTransform!,  ...(parsed.backBgTransform  || {}) },
    };
  } catch { return defaultDesign(); }
}

export function saveDesign(eventId: string, d: BadgeDesign) {
  try { localStorage.setItem(DESIGN_PREFIX + eventId, JSON.stringify(d)); } catch { /* noop */ }
}

export function loadSizes(): SavedSize[] {
  try { return JSON.parse(localStorage.getItem(SIZES_KEY) || "[]"); } catch { return []; }
}

export function saveSizes(list: SavedSize[]) {
  try { localStorage.setItem(SIZES_KEY, JSON.stringify(list)); } catch { /* noop */ }
}

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// ─── Layout presets ──────────────────────────────────────────────────────────
//
// Each preset is a partial override of the default design. The user picks one
// and we merge it into the current design (preserving backgrounds + back).

export type LayoutPresetId =
  | "classic"
  | "minimal"
  | "speaker"
  | "conference"
  | "corporate"
  | "compact"
  | "vip"
  | "lanyard";

export interface LayoutPreset {
  id: LayoutPresetId;
  name: string;
  description: string;
  elements: Partial<Record<ElementKey, Partial<ElementPlacement>>>;
}

export const LAYOUT_PRESETS: LayoutPreset[] = [
  {
    id: "classic",
    name: "Classic",
    description: "Name big, company under, QR at bottom",
    elements: {
      name:    { enabled: true,  x: 50, y: 42, size: 22, fontFamily: "Inter",       fontWeight: 700, color: "#111111", align: "center", transform: "none" },
      company: { enabled: true,  x: 50, y: 56, size: 12, fontFamily: "Inter",       fontWeight: 400, color: "#555555", align: "center", transform: "none" },
      qr:      { enabled: true,  x: 50, y: 80, size: 26 },
      email:   { enabled: false }, title: { enabled: false }, ticket: { enabled: false },
      eventTitle: { enabled: false }, eventDate: { enabled: false }, orgName: { enabled: false }, customText: { enabled: false },
    },
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Just the name and a big QR",
    elements: {
      name:    { enabled: true,  x: 50, y: 32, size: 28, fontFamily: "Inter",       fontWeight: 800, color: "#000000", align: "center", transform: "none", letterSpacing: -0.02 },
      company: { enabled: false },
      qr:      { enabled: true,  x: 50, y: 72, size: 34 },
      email:   { enabled: false }, title: { enabled: false }, ticket: { enabled: false },
      eventTitle: { enabled: false }, eventDate: { enabled: false }, orgName: { enabled: false }, customText: { enabled: false },
    },
  },
  {
    id: "speaker",
    name: "Speaker",
    description: "Name + title + company + QR",
    elements: {
      ticket:  { enabled: true,  x: 50, y: 14, size: 9,  fontFamily: "Inter",       fontWeight: 800, color: "#ffffff", align: "center", transform: "uppercase", letterSpacing: 0.16, staticText: "SPEAKER" },
      name:    { enabled: true,  x: 50, y: 35, size: 24, fontFamily: "Plus Jakarta Sans", fontWeight: 700, color: "#111111", align: "center" },
      title:   { enabled: true,  x: 50, y: 46, size: 11, fontFamily: "Inter",       fontWeight: 500, color: "#666666", align: "center" },
      company: { enabled: true,  x: 50, y: 54, size: 13, fontFamily: "Inter",       fontWeight: 600, color: "#111111", align: "center" },
      qr:      { enabled: true,  x: 50, y: 78, size: 24 },
      email:   { enabled: false }, eventTitle: { enabled: false }, eventDate: { enabled: false }, orgName: { enabled: false }, customText: { enabled: false },
    },
  },
  {
    id: "conference",
    name: "Conference",
    description: "Event header, org tag, attendee info, QR",
    elements: {
      orgName:    { enabled: true,  x: 50, y: 6,  size: 7,  fontFamily: "Inter", fontWeight: 600, color: "#64748b", align: "center", transform: "uppercase", letterSpacing: 0.2 },
      eventTitle: { enabled: true,  x: 50, y: 14, size: 11, fontFamily: "Inter", fontWeight: 700, color: "#1e3a8a", align: "center", transform: "uppercase", letterSpacing: 0.14 },
      eventDate:  { enabled: true,  x: 50, y: 22, size: 8,  fontFamily: "Inter", fontWeight: 400, color: "#666666", align: "center" },
      name:       { enabled: true,  x: 50, y: 42, size: 22, fontFamily: "Inter", fontWeight: 700, color: "#111111", align: "center" },
      company:    { enabled: true,  x: 50, y: 54, size: 12, fontFamily: "Inter", fontWeight: 400, color: "#555555", align: "center" },
      ticket:     { enabled: true,  x: 50, y: 64, size: 8,  fontFamily: "Inter", fontWeight: 700, color: "#1e3a8a", align: "center", transform: "uppercase", letterSpacing: 0.12 },
      qr:         { enabled: true,  x: 50, y: 84, size: 22 },
      title:      { enabled: false }, email: { enabled: false }, customText: { enabled: false },
    },
  },
  {
    id: "corporate",
    name: "Corporate",
    description: "Serif name + title + company, no QR",
    elements: {
      orgName:    { enabled: true,  x: 50, y: 10, size: 8,  fontFamily: "Inter",            fontWeight: 600, color: "#333333", align: "center", transform: "uppercase", letterSpacing: 0.2 },
      name:       { enabled: true,  x: 50, y: 38, size: 24, fontFamily: "Playfair Display", fontWeight: 700, color: "#111111", align: "center" },
      title:      { enabled: true,  x: 50, y: 52, size: 11, fontFamily: "Merriweather",     fontWeight: 400, color: "#555555", align: "center", italic: true },
      company:    { enabled: true,  x: 50, y: 62, size: 12, fontFamily: "Merriweather",     fontWeight: 700, color: "#222222", align: "center" },
      eventTitle: { enabled: false }, eventDate: { enabled: false }, qr: { enabled: false },
      ticket:     { enabled: false }, email: { enabled: false }, customText: { enabled: false },
    },
  },
  {
    id: "compact",
    name: "Compact",
    description: "Tiny label · name + QR side-by-side",
    elements: {
      // Two-column layout: name + company on the left, QR on the right.
      name:    { enabled: true,  x: 32, y: 38, size: 14, fontFamily: "Inter", fontWeight: 700, color: "#111111", align: "center" },
      company: { enabled: true,  x: 32, y: 60, size: 9,  fontFamily: "Inter", fontWeight: 400, color: "#555555", align: "center" },
      qr:      { enabled: true,  x: 80, y: 50, size: 20 },
      title: { enabled: false }, email: { enabled: false }, ticket: { enabled: false },
      eventTitle: { enabled: false }, eventDate: { enabled: false }, orgName: { enabled: false }, customText: { enabled: false },
    },
  },
  {
    id: "vip",
    name: "VIP",
    description: "Big accent stripe, elegant serif name",
    elements: {
      ticket:  { enabled: true,  x: 50, y: 16, size: 11, fontFamily: "Playfair Display", fontWeight: 700, color: "#d4af37", align: "center", transform: "uppercase", letterSpacing: 0.22, staticText: "VIP" },
      name:    { enabled: true,  x: 50, y: 44, size: 26, fontFamily: "Playfair Display", fontWeight: 700, color: "#111111", align: "center" },
      title:   { enabled: true,  x: 50, y: 56, size: 11, fontFamily: "Inter",            fontWeight: 400, color: "#888888", align: "center", italic: true },
      company: { enabled: true,  x: 50, y: 64, size: 11, fontFamily: "Inter",            fontWeight: 600, color: "#333333", align: "center" },
      qr:      { enabled: true,  x: 50, y: 84, size: 22 },
      email:   { enabled: false }, eventTitle: { enabled: false }, eventDate: { enabled: false }, orgName: { enabled: false }, customText: { enabled: false },
    },
  },
  {
    id: "lanyard",
    name: "Lanyard",
    description: "Vertical thermal layout, large name + QR",
    elements: {
      eventTitle: { enabled: true,  x: 50, y: 8,  size: 8,  fontFamily: "Inter", fontWeight: 600, color: "#333333", align: "center", transform: "uppercase", letterSpacing: 0.14 },
      name:       { enabled: true,  x: 50, y: 28, size: 20, fontFamily: "Inter", fontWeight: 800, color: "#000000", align: "center" },
      company:    { enabled: true,  x: 50, y: 40, size: 10, fontFamily: "Inter", fontWeight: 400, color: "#555555", align: "center" },
      qr:         { enabled: true,  x: 50, y: 70, size: 32 },
      ticket:     { enabled: true,  x: 50, y: 92, size: 8,  fontFamily: "Inter", fontWeight: 700, color: "#000000", align: "center", transform: "uppercase", letterSpacing: 0.12 },
      title:      { enabled: false }, email: { enabled: false }, eventDate: { enabled: false }, orgName: { enabled: false }, customText: { enabled: false },
    },
  },
];

/** Apply a preset's element overrides on top of the current design, preserving backgrounds + back side. */
export function applyPreset(design: BadgeDesign, presetId: LayoutPresetId): BadgeDesign {
  const preset = LAYOUT_PRESETS.find((p) => p.id === presetId);
  if (!preset) return design;
  const def = defaultDesign();
  const nextElements = { ...def.elements };
  // Start from defaults, then apply preset overrides
  (Object.keys(preset.elements) as ElementKey[]).forEach((k) => {
    nextElements[k] = { ...def.elements[k], ...nextElements[k], ...preset.elements[k] };
  });
  return { ...design, elements: nextElements };
}

/** Map font family → weight axis to request when fetching from Google Fonts. */
const FONT_WEIGHT_AXIS: Record<string, string> = {
  "Inter":              "400;500;600;700;800",
  "DM Sans":            "400;500;600;700",
  "Space Grotesk":      "400;500;600;700",
  "Sora":               "400;500;600;700",
  "Plus Jakarta Sans":  "400;500;600;700;800",
  "Manrope":            "400;500;600;700",
  "Outfit":             "400;500;600;700",
  "Urbanist":           "400;500;600;700",
  "Roboto":             "400;500;700",
  "Open Sans":          "400;500;600;700",
  "Lato":               "400;700",
  "Montserrat":         "400;500;600;700",
  "Poppins":            "400;500;600;700",
  "Playfair Display":   "400;500;700;800",
  "Merriweather":       "400;700",
  "Source Sans Pro":    "400;600;700",
};

/** Return the set of font families actually referenced by enabled text elements. */
export function fontsUsedInDesign(d: BadgeDesign): string[] {
  const used = new Set<string>();
  for (const el of Object.values(d.elements)) {
    if (!el?.enabled) continue;
    if (!("fontFamily" in el) || !el.fontFamily) continue;
    if (FONT_WEIGHT_AXIS[el.fontFamily]) used.add(el.fontFamily);
  }
  return Array.from(used);
}

/**
 * Build a single Google Fonts CSS2 URL that loads exactly the families given
 * (with the weights this app uses). Returns an empty string when no Google
 * fonts are referenced, so the caller can skip emitting a `<link>` tag.
 */
export function googleFontsUrl(families: string[]): string {
  const parts = families
    .filter((f) => FONT_WEIGHT_AXIS[f])
    .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@${FONT_WEIGHT_AXIS[f]}`);
  if (parts.length === 0) return "";
  return `https://fonts.googleapis.com/css2?${parts.join("&")}&display=swap`;
}


export function badgeSizeMm(
  size:
    | "a6"
    | "a4-2up"
    | "avery-3x8"
    | "thermal-50"
    | "thermal-58"
    | "thermal-80"
    | "thermal-100"
    | "custom",
  custom?: { width: number; height: number; unit: "in" | "cm" | "mm" }
): { w: number; h: number } {
  if (size === "custom" && custom) {
    const f = custom.unit === "in" ? 25.4 : custom.unit === "cm" ? 10 : 1;
    return { w: custom.width * f, h: custom.height * f };
  }
  if (size === "a6") return { w: 148, h: 105 };
  if (size === "a4-2up") return { w: 186, h: 134 };
  // Thermal printer roll widths — common portable / handheld sizes.
  // Width = paper roll width minus a small margin; height set to a
  // reasonable badge proportion for the visible content.
  if (size === "thermal-50")  return { w: 50,  h: 80 };
  if (size === "thermal-58")  return { w: 58,  h: 80 };
  if (size === "thermal-80")  return { w: 80,  h: 100 };
  if (size === "thermal-100") return { w: 100, h: 150 };
  return { w: 63, h: 34 }; // avery-3x8
}

/**
 * Convert a `BgTransform` into the CSS background declarations that produce
 * the matching layout in both the live editor canvas and the print sheet.
 * Returns an empty object when the transform is missing (e.g. no image).
 */
export function bgTransformToCss(t: BgTransform | undefined): {
  backgroundSize: string;
  backgroundPosition: string;
  backgroundRepeat: string;
  backgroundColor: string | undefined;
} {
  const fit = t?.fit ?? "cover";
  const scale = Math.max(10, Math.min(400, t?.scale ?? 100));
  const ox = Math.max(-50, Math.min(50, t?.offsetX ?? 0));
  const oy = Math.max(-50, Math.min(50, t?.offsetY ?? 0));
  const fill = t?.fillColor || "#ffffff";

  let size: string;
  switch (fit) {
    case "stretch": size = "100% 100%";        break;
    case "contain": size = "contain";          break;
    case "custom":  size = `${scale}% auto`;   break;
    case "cover":
    default:        size = "cover";            break;
  }
  return {
    backgroundSize: size,
    backgroundPosition: fit === "stretch" ? "center" : `${50 + ox}% ${50 + oy}%`,
    backgroundRepeat: "no-repeat",
    backgroundColor: fit === "contain" ? fill : undefined,
  };
}
