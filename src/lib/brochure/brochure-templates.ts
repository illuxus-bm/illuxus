/**
 * Brochure_Theme registry + pure theme/layout/image-fit helpers for the
 * Event Brochure Generator.
 *
 * Mirrors the architectural pattern established by
 * `src/lib/creatives/creative-templates.ts`: a declarative, code-defined
 * template model (no database-backed template builder) plus pure
 * resolution helpers, kept entirely free of `jsPDF`, `fetch`, and DOM
 * access so it's directly testable with `fast-check` (see
 * `src/lib/brochure/__tests__/`). The imperative `jsPDF`/`autoTable`/
 * `qrcode` assembly pipeline lives in the separate `brochure-pdf.ts`
 * module (a later task) — this module only produces plain data.
 *
 * This module owns:
 *  - The `Brochure_Theme` registry (`BROCHURE_THEMES`) — 3 code-defined
 *    layout presets (Requirement 1.1).
 *  - Theme-color resolution against the event's `Event_Theme`
 *    (`resolveBrochureTheme`, Property 24) and PDF base-14 font-family
 *    bucketing (`resolveFontFamilyForPdf`).
 *  - The Sponsor_Tier rank table and a re-export of `tierAccentColor` so
 *    the brochure's tier colors are byte-identical to the
 *    Creative_Generator's (Property 36).
 *  - The image-fit-without-upscale helper shared by every image slot in
 *    the brochure (`fitImageBox`, Property 32).
 *  - `Section_Layout` resolution (`resolveSectionLayout`, Property 39),
 *    called identically by the live preview and the export pipeline.
 *  - The filesystem-safe filename builder (`buildBrochureFilename`,
 *    Property 40).
 *  - The pure owner-or-admin access gate (`isAuthorizedForBrochureGeneration`).
 *  - `EventPageConfig.brochurePrefs` read/write helpers
 *    (`saveBrochurePrefs`/`readBrochurePrefs`).
 */

import type { EventPageConfig } from "@/components/event/page-form/types";

export { tierAccentColor } from "@/lib/creatives/creative-templates";

// ─── Core types ───────────────────────────────────────────────────────────

/** One of the five fixed page types a brochure can include. */
export type BrochureSectionId = "cover" | "agenda" | "speakers" | "sponsors" | "venueLogistics";

/** Cover_Section layout style — three code-defined presets ship in v1. */
export type CoverStyle = "full-bleed-image" | "banner-strip" | "centered-card";

export interface BrochureTheme {
  id: string;
  name: string;
  description: string;
  /** Page margins in mm, applied uniformly across every section. */
  margins: { top: number; right: number; bottom: number; left: number };
  cover: {
    style: CoverStyle;
    /** Hex color used as the cover background when no image is available
     *  (Requirement 2.4) and as the letterbox fill behind a contain-fit
     *  cover image that doesn't cover its box exactly. */
    defaultBackgroundColor: string;
    titleFontSizePt: number;
    /** Height (mm) of the accent bar drawn under the title, filled with the
     *  resolved accent color. 0 disables it. */
    accentBarHeightMm: number;
  };
  heading: {
    fontSizePt: number;
    fontStyle: "bold" | "normal";
    showAccentUnderline: boolean;
  };
  /** jspdf-autotable styling shared by the Agenda_Section and
   *  Sponsors_Section tables. */
  table: {
    theme: "striped" | "grid" | "plain";
    fontSizePt: number;
    cellPaddingMm: number;
    /** Fallback header fill when no accent color is resolved. */
    headFillDefault: string;
  };
  /** Built-in defaults used by `resolveBrochureTheme` when the event's
   *  Event_Theme doesn't define a color (Requirement 1.3). */
  defaultColors: { primaryColor: string; accentColor: string; fontFamily: string };
}

// ─── Brochure_Theme registry (Requirement 1.1) ───────────────────────────────
//
// Three presets, each pairing a distinct cover style with a distinct
// autoTable theme so an organizer has a genuinely different visual result
// to choose between (see design.md's rationale).

export const BROCHURE_THEMES: BrochureTheme[] = [
  {
    id: "classic-editorial",
    name: "Classic Editorial",
    description: "Print-magazine layout: hero image banner up top, editorial title below on a solid page.",
    margins: { top: 22, right: 20, bottom: 22, left: 20 },
    cover: {
      // Image occupies the top ~45% of the page (banner), title/date/accent
      // bar sit below on the theme's solid background — genuinely distinct
      // from the other two cover styles.
      style: "banner-strip",
      defaultBackgroundColor: "#0a1429",
      titleFontSizePt: 22,
      accentBarHeightMm: 3,
    },
    heading: {
      fontSizePt: 15,
      fontStyle: "bold",
      showAccentUnderline: true,
    },
    table: {
      theme: "grid",
      fontSizePt: 10,
      cellPaddingMm: 3,
      headFillDefault: "#0a1429",
    },
    defaultColors: {
      primaryColor: "#1e3a8a", // navy
      accentColor: "#eab308", // gold
      fontFamily: "Playfair Display",
    },
  },
  {
    id: "modern-minimal",
    name: "Modern Minimal",
    description: "Clean, spacious layout: centered image card on a light page with striped tables.",
    margins: { top: 24, right: 22, bottom: 24, left: 22 },
    cover: {
      // Light page, centered image card, centered title/date + short accent
      // bar below.
      style: "centered-card",
      defaultBackgroundColor: "#f8fafc",
      titleFontSizePt: 20,
      accentBarHeightMm: 2,
    },
    heading: {
      fontSizePt: 14,
      fontStyle: "bold",
      showAccentUnderline: false,
    },
    table: {
      theme: "striped",
      fontSizePt: 9.5,
      cellPaddingMm: 2.5,
      headFillDefault: "#6366f1",
    },
    defaultColors: {
      primaryColor: "#6366f1", // indigo
      accentColor: "#f59e0b", // amber
      fontFamily: "Poppins",
    },
  },
  {
    id: "bold-conference",
    name: "Bold Conference",
    description: "High-contrast poster: full-bleed image with a bottom gradient overlay for the title.",
    margins: { top: 18, right: 18, bottom: 18, left: 18 },
    cover: {
      // Full-bleed image + bottom gradient overlay. Title sits in the
      // overlay area at the bottom so it never collides with the image.
      style: "full-bleed-image",
      defaultBackgroundColor: "#0a0a0a",
      titleFontSizePt: 26,
      accentBarHeightMm: 5,
    },
    heading: {
      fontSizePt: 16,
      fontStyle: "bold",
      showAccentUnderline: true,
    },
    table: {
      theme: "plain",
      fontSizePt: 10.5,
      cellPaddingMm: 3.5,
      headFillDefault: "#0a0a0a",
    },
    defaultColors: {
      primaryColor: "#0a0a0a", // near-black
      accentColor: "#22d3ee", // cyan
      fontFamily: "JetBrains Mono",
    },
  },
];

/** Returns the code-defined Brochure_Theme registry. Exposed as a function
 *  for symmetry with `templatesFor` in `creative-templates.ts`. */
export function brochureThemesList(): BrochureTheme[] {
  return BROCHURE_THEMES;
}

// ─── Theme resolution (Property 24) ──────────────────────────────────────────

/** Per-event branding values (`EventPageConfig.theme`) a Brochure_Theme's
 *  colors/font are resolved against. */
export interface EventThemeInput {
  primaryColor?: string;
  accentColor?: string;
  fontFamily?: string;
}

/** Organizer-supplied per-field override within the Brochure_Configurator,
 *  applied to the generated PDF WITHOUT writing back to the event's stored
 *  Event_Theme (Requirement 1.4). */
export interface BrochureThemeOverride {
  primaryColor?: string;
  accentColor?: string;
  fontFamily?: string;
}

export interface ResolvedBrochureColors {
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
}

/**
 * Resolves a Brochure_Theme's colors/font against the event's Event_Theme,
 * with an optional organizer override taking precedence over both. Pure —
 * returns a new object and never mutates `eventTheme` (Property 24).
 * Precedence per field: override ?? eventTheme value ?? theme's own default.
 */
export function resolveBrochureTheme(
  theme: BrochureTheme,
  eventTheme: EventThemeInput,
  override?: BrochureThemeOverride
): ResolvedBrochureColors {
  return {
    primaryColor: override?.primaryColor ?? eventTheme.primaryColor ?? theme.defaultColors.primaryColor,
    accentColor: override?.accentColor ?? eventTheme.accentColor ?? theme.defaultColors.accentColor,
    fontFamily: override?.fontFamily ?? eventTheme.fontFamily ?? theme.defaultColors.fontFamily,
  };
}

// ─── PDF base-14 font-family bucketing ──────────────────────────────────────

/** `FONT_OPTIONS` entries (`src/components/event/page-form/presets.ts`)
 *  that read visually as serif fonts — bucketed onto jsPDF's `"times"`
 *  base-14 family. */
const SERIF_FONT_FAMILIES = new Set(["Playfair Display", "Merriweather"]);

/** `FONT_OPTIONS` entries that read visually as monospace fonts — bucketed
 *  onto jsPDF's `"courier"` base-14 family. */
const MONOSPACE_FONT_FAMILIES = new Set(["JetBrains Mono", "Space Grotesk"]);

/**
 * Maps an arbitrary event `fontFamily` string (one of `FONT_OPTIONS` in
 * `src/components/event/page-form/presets.ts`, e.g. "Playfair Display",
 * "JetBrains Mono") onto one of jsPDF's three built-in base-14 font
 * families. jsPDF cannot render arbitrary Google Fonts without embedding a
 * TTF via `doc.addFont` (out of scope — see design.md's rationale); this
 * mapping keeps the organizer's font *choice* meaningfully reflected
 * (serif vs. sans vs. mono) without embedding font files. Pure,
 * deterministic — every serif-bucketed name always maps to `"times"`,
 * every monospace-bucketed name always maps to `"courier"`, and every
 * other value (including `undefined` or an unrecognized string) maps to
 * the `"helvetica"` default.
 */
export function resolveFontFamilyForPdf(fontFamily: string | undefined): "helvetica" | "times" | "courier" {
  if (fontFamily === undefined) return "helvetica";
  if (SERIF_FONT_FAMILIES.has(fontFamily)) return "times";
  if (MONOSPACE_FONT_FAMILIES.has(fontFamily)) return "courier";
  return "helvetica";
}

// ─── Sponsor tier rank (Requirement 5.2) ─────────────────────────────────────
//
// `tierAccentColor` is re-exported unchanged above (right after the imports)
// so the brochure's Sponsor_Tier heading colors are byte-identical to the
// Creative_Generator's (and, transitively, `SponsorManagement.tsx`'s `TIERS`
// mapping) by construction — Property 36 is satisfied by sharing the one
// function, not by re-deriving the same palette a third time.

export const TIER_RANK: Record<"platinum" | "gold" | "silver" | "bronze" | "custom", number> = {
  platinum: 0,
  gold: 1,
  silver: 2,
  bronze: 3,
  custom: 4,
};

// ─── Image fit-without-upscale (Property 32) ────────────────────────────────

export interface ImageBoxMm {
  width: number;
  height: number;
}

/**
 * Given a layout slot's box (mm) and an image's natural pixel dimensions,
 * returns a box uniformly scaled to fit within the slot: `width`/`height`
 * equal the natural dimensions' aspect-ratio-preserving fit, never
 * stretched non-uniformly.
 *
 * When `opts?.allowUpscale` is falsy (the default — used for speaker
 * photos and sponsor logos, Requirement 4.6/5.6), the scale factor is
 * capped at `1` so small source images are never enlarged beyond their
 * native size — this deliberately implements the brochure's OWN
 * "never upscale" contract exactly as originally specified for this
 * feature (Property 32: "never upscaled beyond native size"), independent
 * of `creative-renderer.ts`'s `nativeSizedLogoBox`, which was later
 * changed to allow upscaling for the Creative_Generator's logos. The two
 * modules deliberately diverge here.
 *
 * When `opts?.allowUpscale` is `true` (used only for the Cover_Section's
 * hero image, which has no such constraint in the requirements), the scale
 * factor is uncapped so a small cover image still fills its slot
 * attractively.
 *
 * Degenerate case: when `naturalWidth` or `naturalHeight` is `0`, returns a
 * zero-size box centered in the slot rather than dividing by zero or
 * producing `NaN`. Pure.
 */
export function fitImageBox(
  slot: ImageBoxMm,
  naturalWidth: number,
  naturalHeight: number,
  opts?: { allowUpscale?: boolean }
): ImageBoxMm {
  if (naturalWidth === 0 || naturalHeight === 0) {
    return { width: 0, height: 0 };
  }

  const rawScale = Math.min(slot.width / naturalWidth, slot.height / naturalHeight);
  const scale = opts?.allowUpscale ? rawScale : Math.min(1, rawScale);

  return {
    width: naturalWidth * scale,
    height: naturalHeight * scale,
  };
}

// ─── Section_Layout resolution (Property 39) ────────────────────────────────

export interface SectionLayoutEntry {
  id: BrochureSectionId;
  included: boolean;
}

export type SectionLayout = SectionLayoutEntry[];

export const DEFAULT_SECTION_LAYOUT: SectionLayout = [
  { id: "cover", included: true },
  { id: "agenda", included: true },
  { id: "speakers", included: true },
  { id: "sponsors", included: true },
  { id: "venueLogistics", included: true },
];

/**
 * Resolves a Section_Layout into the ordered list of *included*
 * Brochure_Section ids — array order IS the render order (Requirement 7.2),
 * excluded entries are dropped (Requirement 7.3). Pure, and called
 * identically by both `BrochurePreviewFrame` and `buildBrochureDocument`
 * (export), so the preview and the export can never diverge by
 * construction (Property 39).
 */
export function resolveSectionLayout(layout: SectionLayout): BrochureSectionId[] {
  return layout.filter((entry) => entry.included).map((entry) => entry.id);
}

// ─── Filename (Property 40) ─────────────────────────────────────────────────

/** Fallback filename used when an event title has no sanitizable
 *  characters left (e.g. it was entirely unicode, whitespace, or
 *  punctuation), so the final filename is never just `".pdf"`. */
const FALLBACK_FILENAME = "brochure.pdf";

/**
 * Converts arbitrary text into a filesystem-safe slug: lowercased,
 * whitespace collapsed to single hyphens, every character that isn't a
 * lowercase ASCII letter/digit/hyphen stripped outright, consecutive
 * hyphens collapsed, and leading/trailing hyphens trimmed. Mirrors
 * `creative-renderer.ts`'s `slugify` pattern closely. Returns an empty
 * string when nothing sanitizable remains (the caller decides the
 * fallback).
 */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Builds a filesystem-safe brochure download filename from the event
 * title, e.g. `buildBrochureFilename("Annual Tech Summit 2026")` returns
 * `"annual-tech-summit-2026.pdf"`. Falls back to `"brochure.pdf"` when the
 * title contains no alphanumeric characters (unicode-only, punctuation-only,
 * or empty). Pure. Property 40.
 */
export function buildBrochureFilename(eventTitle: string): string {
  const slug = slugify(eventTitle);
  return slug ? `${slug}.pdf` : FALLBACK_FILENAME;
}

// ─── Access control (Requirement 10) ────────────────────────────────────────

/**
 * Pure UI-layer gate for brochure configuration and generation: `true` iff
 * the requester owns the event (`requesterId === ownerId`) or is a
 * platform admin. Deliberately mirrors
 * `isAuthorizedForEventCreatives`'s (`src/lib/creatives/creative-storage.ts`)
 * exact owner-or-admin logic WITHOUT importing it — `src/lib/brochure` has
 * no dependency on `src/lib/creatives` (aside from the deliberate
 * `tierAccentColor` re-export above). This predicate is NOT the security
 * boundary — the RLS policies on `events`/`sessions`/`speakers`/`sponsors`
 * are the actual enforcement; this function only prevents the UI from
 * rendering/offering actions a user can't use, giving a clean early denial
 * message before a request would be rejected server-side anyway
 * (Requirement 10.1, 10.2).
 */
export function isAuthorizedForBrochureGeneration(
  ownerId: string,
  requesterId: string,
  isAdmin: boolean
): boolean {
  return requesterId === ownerId || isAdmin;
}

// ─── `EventPageConfig.brochurePrefs` persistence (Requirement 7.1) ─────────
//
// Mirrors `saveCreativeTemplatePref`/`readCreativeTemplatePref`'s exact
// pattern in `creative-templates.ts` — pure helpers; the caller persists the
// returned config via the existing
// `supabase.from("events").update({ page_config })` path already used by
// `EventPageForm.tsx`.

/**
 * Returns a NEW `EventPageConfig` with `brochurePrefs` replaced by `prefs`,
 * used by the "Save as event default" toggle. Pure — never mutates
 * `config`.
 */
export function saveBrochurePrefs(
  config: EventPageConfig,
  prefs: EventPageConfig["brochurePrefs"]
): EventPageConfig {
  return {
    ...config,
    brochurePrefs: prefs,
  };
}

/**
 * Reads the saved Brochure_Generator preferences for the event, or
 * `undefined` if none have been saved yet. Pure.
 */
export function readBrochurePrefs(config: EventPageConfig): EventPageConfig["brochurePrefs"] | undefined {
  return config.brochurePrefs;
}
