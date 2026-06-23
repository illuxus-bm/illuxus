export type ElementKey = "name" | "company" | "qr";

export type ElementPlacement = {
  enabled: boolean;
  x: number;        // 0..100 (% of badge width, center anchor)
  y: number;        // 0..100 (% of badge height, center anchor)
  size: number;     // pt for text, mm for QR
  color: string;    // hex
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
    name:    { enabled: true,  x: 50, y: 42, size: 22, color: "#111111" },
    company: { enabled: true,  x: 50, y: 56, size: 12, color: "#555555" },
    qr:      { enabled: true,  x: 50, y: 80, size: 26, color: "#000000" },
  },
});

export function loadDesign(eventId: string): BadgeDesign {
  try {
    const raw = localStorage.getItem(DESIGN_PREFIX + eventId);
    if (!raw) return defaultDesign();
    const parsed = JSON.parse(raw);
    const def = defaultDesign();
    return {
      ...def,
      ...parsed,
      elements: { ...def.elements, ...(parsed.elements || {}) },
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

/** Return badge physical size in millimeters for the given PrintSize. */
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
