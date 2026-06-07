export type ElementKey = "name" | "company" | "qr";

export type ElementPlacement = {
  enabled: boolean;
  x: number;        // 0..100 (% of badge width, center anchor)
  y: number;        // 0..100 (% of badge height, center anchor)
  size: number;     // pt for text, mm for QR
  color: string;    // hex
};

export type BadgeDesign = {
  frontBg?: string;                          // data URL or ""
  elements: Record<ElementKey, ElementPlacement>;
  back: "none" | "same" | "static";
  backBg?: string;                           // data URL when back === "static"
  fullBleed?: boolean;                       // print one badge per page edge-to-edge
};

export type SavedSize = { name: string; w: number; h: number; unit: "in" | "cm" | "mm" };

const DESIGN_PREFIX = "lovable.badge-design.v1:";
const SIZES_KEY = "lovable.print-sizes.v1";

export const defaultDesign = (): BadgeDesign => ({
  frontBg: "",
  back: "none",
  backBg: "",
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
  size: "a6" | "a4-2up" | "avery-3x8" | "custom",
  custom?: { width: number; height: number; unit: "in" | "cm" | "mm" }
): { w: number; h: number } {
  if (size === "custom" && custom) {
    const f = custom.unit === "in" ? 25.4 : custom.unit === "cm" ? 10 : 1;
    return { w: custom.width * f, h: custom.height * f };
  }
  if (size === "a6") return { w: 148, h: 105 };
  if (size === "a4-2up") return { w: 186, h: 134 };
  return { w: 63, h: 34 }; // avery-3x8
}