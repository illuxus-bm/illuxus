/**
 * Curated page-size presets for the brochure editor.
 *
 * All sizes stored in mm — the canonical unit for the document data
 * model. Screen / social sizes originally specified in pixels are
 * converted at the standard 96 DPI (72 pt/inch × 25.4 mm/inch = ~3.78
 * mm per 100 px). Rounded to 2 decimals so the numbers stay readable
 * in the property panel.
 *
 * Presets are grouped by intended surface: print (A4 / Letter), social
 * (Instagram / Twitter / Facebook / LinkedIn), and web (browser cover
 * / hero). "Custom" is not a preset itself — the properties panel
 * exposes width/height number inputs the organizer can drive freely.
 */

export interface PageSizePreset {
  /** Machine id — used as the Select's `value`. */
  id: string;
  /** Human label shown in the dropdown. */
  label: string;
  /** Group heading in the dropdown. */
  group: "Print" | "Social" | "Web" | "Presentation";
  widthMm: number;
  heightMm: number;
}

const PX_TO_MM = 25.4 / 96; // ~0.2646

const socialPresetsFromPx = (
  id: string,
  label: string,
  wPx: number,
  hPx: number
): PageSizePreset => ({
  id,
  label,
  group: "Social",
  widthMm: Math.round(wPx * PX_TO_MM * 100) / 100,
  heightMm: Math.round(hPx * PX_TO_MM * 100) / 100,
});

export const PAGE_SIZE_PRESETS: PageSizePreset[] = [
  // Print
  { id: "a4-portrait", label: "A4 · Portrait (210 × 297 mm)", group: "Print", widthMm: 210, heightMm: 297 },
  { id: "a4-landscape", label: "A4 · Landscape (297 × 210 mm)", group: "Print", widthMm: 297, heightMm: 210 },
  { id: "a5-portrait", label: "A5 · Portrait (148 × 210 mm)", group: "Print", widthMm: 148, heightMm: 210 },
  { id: "letter-portrait", label: "US Letter · Portrait", group: "Print", widthMm: 215.9, heightMm: 279.4 },
  { id: "letter-landscape", label: "US Letter · Landscape", group: "Print", widthMm: 279.4, heightMm: 215.9 },
  { id: "legal-portrait", label: "US Legal · Portrait", group: "Print", widthMm: 215.9, heightMm: 355.6 },

  // Presentation
  { id: "presentation-16-9", label: "Presentation · 16:9 (1920 × 1080)", group: "Presentation", widthMm: Math.round(1920 * PX_TO_MM * 100) / 100, heightMm: Math.round(1080 * PX_TO_MM * 100) / 100 },
  { id: "presentation-4-3", label: "Presentation · 4:3 (1024 × 768)", group: "Presentation", widthMm: Math.round(1024 * PX_TO_MM * 100) / 100, heightMm: Math.round(768 * PX_TO_MM * 100) / 100 },

  // Social
  socialPresetsFromPx("instagram-post", "Instagram Post (1080 × 1080)", 1080, 1080),
  socialPresetsFromPx("instagram-story", "Instagram Story (1080 × 1920)", 1080, 1920),
  socialPresetsFromPx("instagram-portrait", "Instagram Portrait (1080 × 1350)", 1080, 1350),
  socialPresetsFromPx("facebook-post", "Facebook Post (1200 × 630)", 1200, 630),
  socialPresetsFromPx("facebook-cover", "Facebook Cover (851 × 315)", 851, 315),
  socialPresetsFromPx("twitter-post", "Twitter/X Post (1600 × 900)", 1600, 900),
  socialPresetsFromPx("twitter-header", "Twitter/X Header (1500 × 500)", 1500, 500),
  socialPresetsFromPx("linkedin-post", "LinkedIn Post (1200 × 627)", 1200, 627),
  socialPresetsFromPx("linkedin-banner", "LinkedIn Banner (1584 × 396)", 1584, 396),
  socialPresetsFromPx("pinterest-pin", "Pinterest Pin (1000 × 1500)", 1000, 1500),
  socialPresetsFromPx("youtube-thumb", "YouTube Thumbnail (1280 × 720)", 1280, 720),
  socialPresetsFromPx("tiktok-video", "TikTok Video (1080 × 1920)", 1080, 1920),

  // Web
  socialPresetsFromPx("email-banner", "Email Banner (600 × 200)", 600, 200),
  socialPresetsFromPx("web-banner", "Web Banner (1200 × 400)", 1200, 400),
];

/**
 * Returns the preset id that matches the given dimensions to within
 * 0.5 mm on both axes, or `"custom"` when nothing matches. Used by
 * the properties panel to highlight the current preset in the
 * dropdown when the organizer's page dimensions still land on a
 * preset row after a manual edit.
 */
export function findPresetMatch(widthMm: number, heightMm: number): string {
  const tolerance = 0.5;
  for (const p of PAGE_SIZE_PRESETS) {
    if (
      Math.abs(p.widthMm - widthMm) <= tolerance &&
      Math.abs(p.heightMm - heightMm) <= tolerance
    ) {
      return p.id;
    }
  }
  return "custom";
}
