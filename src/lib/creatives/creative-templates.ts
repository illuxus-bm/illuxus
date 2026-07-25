/**
 * Creative_Template model + Platform_Format registry for the Social Creative
 * Generator.
 *
 * Mirrors the architectural pattern established by `src/lib/badge-design.ts`:
 * a declarative, code-defined template model (no database-backed template
 * builder) populated with entity data and resolved into layout geometry by
 * pure functions. The key difference from badges is the rendering target —
 * creatives render to an off-screen `<canvas>` and export fixed-pixel PNGs
 * (via `creative-renderer.ts`) instead of print HTML, because social/email
 * platforms require exact pixel dimensions.
 *
 * This module owns:
 *  - `Platform_Format` registry (`PLATFORM_FORMATS`) — the named
 *    social/email output sizes organizers can export to (Requirement 5.1).
 *  - `Creative_Template` type + its slot sub-types (`ImageSlot`, `TextSlot`,
 *    `CreativeBgStyle`) describing a template's authored layout.
 *
 * Static template preset registries (`SPEAKER_TEMPLATES`, `SPONSOR_TEMPLATES`,
 * `COMBO_TEMPLATES`) and the pure layout-resolution helpers (theme fallback,
 * tier color lookup, aspect-ratio reflow, preference persistence) are added in
 * later tasks per the design document.
 */

/** Which kind of entity a Creative_Template / rendered Creative represents. */
export type CreativeType = "speaker" | "sponsor" | "combo";

/** Named output specification matching a target social/email surface. */
export type PlatformFormatId =
  | "linkedin-post"
  | "instagram-post"
  | "instagram-story"
  | "twitter-post"
  | "email-banner";

export interface PlatformFormat {
  id: PlatformFormatId;
  label: string; // e.g. "LinkedIn Post"
  width: number; // px
  height: number; // px
}

/** The five Platform_Formats organizers can export a Creative to (Requirement 5.1). */
export const PLATFORM_FORMATS: PlatformFormat[] = [
  { id: "linkedin-post", label: "LinkedIn Post", width: 1200, height: 627 },
  { id: "instagram-post", label: "Instagram Post", width: 1080, height: 1080 },
  { id: "instagram-story", label: "Instagram Story", width: 1080, height: 1920 },
  { id: "twitter-post", label: "Twitter/X Post", width: 1600, height: 900 },
  { id: "email-banner", label: "Email Banner", width: 600, height: 200 },
];

/** Background fill — mirrors FrontBgStyle in badge-design.ts, image type added. */
export type CreativeBgStyle =
  | { type: "solid"; color: string }
  | { type: "gradient"; from: string; to: string; angle: number }
  | { type: "image"; url: string; fit: "cover" | "contain" };

/**
 * Anchor + size for an image element (photo/logo), in % of the template's
 * AUTHORED canvas (see `authoredWidth`/`authoredHeight` on CreativeTemplate)
 * — reflowed to px at render time by `reflowTemplate`.
 */
export interface ImageSlot {
  xPct: number;
  yPct: number; // center anchor, 0..100
  widthPct: number;
  heightPct: number; // box size, 0..100 of authored canvas
  shape: "circle" | "rounded-rect" | "rect";
}

/** Text placement — mirrors ElementPlacement in badge-design.ts. */
export interface TextSlot {
  key: "name" | "title" | "company" | "tierBadge" | "presentedBy" | "sponsorName";
  xPct: number;
  yPct: number;
  maxWidthPct: number;
  maxHeightPct: number; // box the text must fit inside
  fontFamily: string;
  fontWeight: number;
  baseSizePx: number; // authored size at the template's authored dimensions
  color: string;
  align: "left" | "center" | "right";
  transform?: "none" | "uppercase";
}

export interface CreativeTemplate {
  id: string;
  type: CreativeType;
  name: string;
  description: string;
  /** Authored canvas dimensions this template's slot %s were designed against. */
  authoredWidth: number;
  authoredHeight: number;
  background: CreativeBgStyle;
  /**
   * Element slots, keyed by role. Combo templates use `speakerPhoto`/
   * `sponsorLogo` prefixes; speaker/sponsor templates use their own subset.
   */
  imageSlots: Partial<Record<"photo" | "logo" | "speakerPhoto" | "sponsorLogo", ImageSlot>>;
  textSlots: TextSlot[];
  /** Divider/"presented by" marker — combo templates only. */
  divider?: { xPct: number; yPct1: number; yPct2: number; color: string };
  /**
   * Theme-overridable fields: which colors/logo this template pulls from
   * Event_Theme when defined, falling back to the values above otherwise.
   */
  themeOverridable: { background?: boolean; accentTextKeys?: TextSlot["key"][] };
}

// ─── Static template presets ─────────────────────────────────────────────────
//
// All presets below are authored against a canonical 1200×1200 canvas: square,
// centers cleanly for reflow to any Platform_Format aspect ratio (Requirement
// 5.3 / `reflowTemplate`, added in a later task). Every slot leaves margin from
// the canvas edges (no slot is authored edge-to-edge) so the safe-area clamp in
// `reflowTemplate` has room to work when reflowing to very different aspect
// ratios (e.g. a 1:1 authored canvas → a 1080×1920 Instagram Story).

const AUTHORED_SIZE = 1200;

/** Speaker_Creative presets: "Spotlight", "Minimal", "Bold Card" (Requirement 1.1). */
export const SPEAKER_TEMPLATES: CreativeTemplate[] = [
  {
    id: "speaker-spotlight",
    type: "speaker",
    name: "Spotlight",
    description: "Large circular photo front and center on a dark background, name in bold below.",
    authoredWidth: AUTHORED_SIZE,
    authoredHeight: AUTHORED_SIZE,
    background: { type: "solid", color: "#1e293b" },
    imageSlots: {
      photo: { xPct: 50, yPct: 28, widthPct: 40, heightPct: 40, shape: "circle" },
    },
    textSlots: [
      {
        key: "name", xPct: 50, yPct: 56, maxWidthPct: 80, maxHeightPct: 10,
        fontFamily: "Poppins", fontWeight: 700, baseSizePx: 64, color: "#ffffff",
        align: "center", transform: "none",
      },
      {
        key: "title", xPct: 50, yPct: 65, maxWidthPct: 70, maxHeightPct: 7,
        fontFamily: "Poppins", fontWeight: 500, baseSizePx: 30, color: "#cbd5e1",
        align: "center", transform: "none",
      },
      {
        key: "company", xPct: 50, yPct: 72, maxWidthPct: 70, maxHeightPct: 7,
        fontFamily: "Poppins", fontWeight: 600, baseSizePx: 28, color: "#94a3b8",
        align: "center", transform: "none",
      },
    ],
    themeOverridable: { background: true, accentTextKeys: ["name"] },
  },
  {
    id: "speaker-minimal",
    type: "speaker",
    name: "Minimal",
    description: "Smaller circular photo left-aligned with name/title/company stacked to the right, light background.",
    authoredWidth: AUTHORED_SIZE,
    authoredHeight: AUTHORED_SIZE,
    background: { type: "solid", color: "#ffffff" },
    imageSlots: {
      photo: { xPct: 22, yPct: 50, widthPct: 26, heightPct: 26, shape: "circle" },
    },
    textSlots: [
      {
        key: "name", xPct: 60, yPct: 40, maxWidthPct: 55, maxHeightPct: 10,
        fontFamily: "Poppins", fontWeight: 700, baseSizePx: 54, color: "#0f172a",
        align: "left", transform: "none",
      },
      {
        key: "title", xPct: 60, yPct: 50, maxWidthPct: 55, maxHeightPct: 7,
        fontFamily: "Poppins", fontWeight: 500, baseSizePx: 28, color: "#475569",
        align: "left", transform: "none",
      },
      {
        key: "company", xPct: 60, yPct: 58, maxWidthPct: 55, maxHeightPct: 7,
        fontFamily: "Poppins", fontWeight: 600, baseSizePx: 26, color: "#0f172a",
        align: "left", transform: "none",
      },
    ],
    themeOverridable: { background: true, accentTextKeys: ["name"] },
  },
  {
    id: "speaker-bold-card",
    type: "speaker",
    name: "Bold Card",
    description: "Rounded-rect photo filling the upper 60% of the canvas, name/title/company in a band at the bottom, gradient background.",
    authoredWidth: AUTHORED_SIZE,
    authoredHeight: AUTHORED_SIZE,
    background: { type: "gradient", from: "#4338ca", to: "#7c3aed", angle: 135 },
    imageSlots: {
      photo: { xPct: 50, yPct: 33, widthPct: 84, heightPct: 60, shape: "rounded-rect" },
    },
    textSlots: [
      {
        key: "name", xPct: 50, yPct: 77, maxWidthPct: 84, maxHeightPct: 8,
        fontFamily: "Poppins", fontWeight: 700, baseSizePx: 56, color: "#ffffff",
        align: "center", transform: "none",
      },
      {
        key: "title", xPct: 50, yPct: 85, maxWidthPct: 84, maxHeightPct: 5,
        fontFamily: "Poppins", fontWeight: 500, baseSizePx: 26, color: "#e0e7ff",
        align: "center", transform: "none",
      },
      {
        key: "company", xPct: 50, yPct: 92, maxWidthPct: 84, maxHeightPct: 5,
        fontFamily: "Poppins", fontWeight: 600, baseSizePx: 24, color: "#c7d2fe",
        align: "center", transform: "none",
      },
    ],
    themeOverridable: { background: true, accentTextKeys: ["name"] },
  },
];

/** Sponsor_Creative presets: "Tier Badge", "Logo Feature" (Requirement 1.1). */
export const SPONSOR_TEMPLATES: CreativeTemplate[] = [
  {
    id: "sponsor-tier-badge",
    type: "sponsor",
    name: "Tier Badge",
    description: "Centered logo, sponsor name below, and a small tier badge pill beneath that, on a light background.",
    authoredWidth: AUTHORED_SIZE,
    authoredHeight: AUTHORED_SIZE,
    background: { type: "solid", color: "#f8fafc" },
    imageSlots: {
      logo: { xPct: 50, yPct: 35, widthPct: 50, heightPct: 30, shape: "rect" },
    },
    textSlots: [
      {
        key: "sponsorName", xPct: 50, yPct: 60, maxWidthPct: 70, maxHeightPct: 9,
        fontFamily: "Poppins", fontWeight: 700, baseSizePx: 40, color: "#0f172a",
        align: "center", transform: "none",
      },
      {
        key: "tierBadge", xPct: 50, yPct: 75, maxWidthPct: 40, maxHeightPct: 7,
        fontFamily: "Poppins", fontWeight: 700, baseSizePx: 26, color: "#f59e0b",
        align: "center", transform: "uppercase",
      },
    ],
    themeOverridable: { background: true, accentTextKeys: ["tierBadge"] },
  },
  {
    id: "sponsor-logo-feature",
    type: "sponsor",
    name: "Logo Feature",
    description: "Large centered logo taking most of the canvas, sponsor name small at the bottom, tier badge in a corner, white background.",
    authoredWidth: AUTHORED_SIZE,
    authoredHeight: AUTHORED_SIZE,
    background: { type: "solid", color: "#ffffff" },
    imageSlots: {
      logo: { xPct: 50, yPct: 45, widthPct: 70, heightPct: 55, shape: "rect" },
    },
    textSlots: [
      {
        key: "sponsorName", xPct: 50, yPct: 85, maxWidthPct: 60, maxHeightPct: 7,
        fontFamily: "Poppins", fontWeight: 500, baseSizePx: 26, color: "#64748b",
        align: "center", transform: "none",
      },
      {
        key: "tierBadge", xPct: 82, yPct: 12, maxWidthPct: 26, maxHeightPct: 7,
        fontFamily: "Poppins", fontWeight: 700, baseSizePx: 22, color: "#f59e0b",
        align: "center", transform: "uppercase",
      },
    ],
    themeOverridable: { background: true, accentTextKeys: ["tierBadge"] },
  },
];

/** Combo_Creative presets: "Presented By", "Split Panel" (Requirement 1.1). */
export const COMBO_TEMPLATES: CreativeTemplate[] = [
  {
    id: "combo-presented-by",
    type: "combo",
    name: "Presented By",
    description: "Speaker photo + name on the left, a \"presented by\" label in the middle, sponsor logo + name on the right, divided by a vertical line.",
    authoredWidth: AUTHORED_SIZE,
    authoredHeight: AUTHORED_SIZE,
    background: { type: "solid", color: "#ffffff" },
    imageSlots: {
      speakerPhoto: { xPct: 25, yPct: 40, widthPct: 30, heightPct: 30, shape: "circle" },
      sponsorLogo: { xPct: 75, yPct: 40, widthPct: 34, heightPct: 22, shape: "rect" },
    },
    textSlots: [
      {
        key: "name", xPct: 25, yPct: 62, maxWidthPct: 40, maxHeightPct: 8,
        fontFamily: "Poppins", fontWeight: 700, baseSizePx: 36, color: "#0f172a",
        align: "center", transform: "none",
      },
      {
        key: "presentedBy", xPct: 50, yPct: 50, maxWidthPct: 30, maxHeightPct: 7,
        fontFamily: "Poppins", fontWeight: 700, baseSizePx: 22, color: "#6366f1",
        align: "center", transform: "uppercase",
      },
      {
        key: "sponsorName", xPct: 75, yPct: 58, maxWidthPct: 40, maxHeightPct: 8,
        fontFamily: "Poppins", fontWeight: 700, baseSizePx: 32, color: "#0f172a",
        align: "center", transform: "none",
      },
    ],
    divider: { xPct: 50, yPct1: 10, yPct2: 90, color: "#e2e8f0" },
    themeOverridable: { background: true, accentTextKeys: ["presentedBy"] },
  },
  {
    id: "combo-split-panel",
    type: "combo",
    name: "Split Panel",
    description: "50/50 vertical split — speaker side and sponsor side each with their own background tint, divider exactly at the 50% line.",
    authoredWidth: AUTHORED_SIZE,
    authoredHeight: AUTHORED_SIZE,
    background: { type: "gradient", from: "#eef2ff", to: "#fff7ed", angle: 90 },
    imageSlots: {
      speakerPhoto: { xPct: 25, yPct: 40, widthPct: 30, heightPct: 30, shape: "circle" },
      sponsorLogo: { xPct: 75, yPct: 40, widthPct: 34, heightPct: 26, shape: "rect" },
    },
    textSlots: [
      {
        key: "name", xPct: 25, yPct: 62, maxWidthPct: 40, maxHeightPct: 8,
        fontFamily: "Poppins", fontWeight: 700, baseSizePx: 34, color: "#0f172a",
        align: "center", transform: "none",
      },
      {
        key: "sponsorName", xPct: 75, yPct: 62, maxWidthPct: 40, maxHeightPct: 8,
        fontFamily: "Poppins", fontWeight: 700, baseSizePx: 32, color: "#0f172a",
        align: "center", transform: "none",
      },
      {
        key: "presentedBy", xPct: 50, yPct: 90, maxWidthPct: 30, maxHeightPct: 6,
        fontFamily: "Poppins", fontWeight: 700, baseSizePx: 20, color: "#6366f1",
        align: "center", transform: "uppercase",
      },
    ],
    divider: { xPct: 50, yPct1: 5, yPct2: 95, color: "#94a3b8" },
    themeOverridable: { background: true, accentTextKeys: ["presentedBy"] },
  },
];

/** Returns the static preset registry matching the given Creative type (Requirement 1.1). */
export function templatesFor(type: CreativeType): CreativeTemplate[] {
  switch (type) {
    case "speaker":
      return SPEAKER_TEMPLATES;
    case "sponsor":
      return SPONSOR_TEMPLATES;
    case "combo":
      return COMBO_TEMPLATES;
  }
}

// ─── Theme resolution (Requirements 1.2, 1.3) ────────────────────────────────

/** Per-event branding values that Creative_Templates can be resolved against. */
export interface EventTheme {
  primaryColor?: string;
  accentColor?: string;
  orgLogoUrl?: string;
}

/**
 * Resolve a template's background against the event's theme, falling back to
 * the template's own default when the theme value is undefined (Requirement
 * 1.3). Pure — never mutates `template`.
 *
 * Note: omitting the logo element when `theme.orgLogoUrl` is undefined (the
 * other half of Requirement 1.3) is handled by the render-plan builders in
 * `creative-renderer.ts` (a future task), not here — this module only
 * resolves colors and doesn't touch image slots.
 */
export function resolveBackground(template: CreativeTemplate, theme: EventTheme): CreativeBgStyle {
  if (!template.themeOverridable.background || theme.primaryColor === undefined) {
    return template.background;
  }

  const background = template.background;
  switch (background.type) {
    case "solid":
      return { type: "solid", color: theme.primaryColor };
    case "gradient":
      return {
        type: "gradient",
        from: theme.primaryColor,
        to: theme.accentColor ?? theme.primaryColor,
        angle: background.angle,
      };
    case "image":
      return background;
  }
}

/**
 * Resolve a text slot's accent color against the theme, if that slot key is
 * listed in `template.themeOverridable.accentTextKeys` (Requirement 1.2),
 * falling back to the slot's own built-in color otherwise (Requirement 1.3).
 * Pure — never mutates `template`.
 */
export function resolveAccentColor(
  template: CreativeTemplate,
  slotKey: TextSlot["key"],
  theme: EventTheme
): string {
  const slot = template.textSlots.find((s) => s.key === slotKey);
  if (!slot) {
    return "#000000";
  }

  const isOverridable = template.themeOverridable.accentTextKeys?.includes(slotKey) ?? false;
  if (isOverridable && theme.accentColor !== undefined) {
    return theme.accentColor;
  }

  return slot.color;
}

// ─── Sponsor tier accent color (Requirement 3.4) ─────────────────────────────

/**
 * Platinum/gold/silver/bronze/custom → accent color mapping, sharing the same
 * palette as SponsorManagement.tsx's `TIERS` constant. That component uses
 * Tailwind classes referencing CSS custom properties (theme-reactive, for
 * screen UI); this function returns literal color strings usable directly as
 * a canvas `fillStyle`, since canvas rendering can't consume CSS variables or
 * Tailwind classes. Requirement 3.4.
 *
 * Falls back to the bronze color for unrecognized tier values, mirroring
 * SponsorManagement.tsx's `tierColor()` fallback behavior (TIERS[3] = bronze).
 */
export function tierAccentColor(tier: string): string {
  switch (tier) {
    case "platinum":
      // --brand-purple (:root, src/index.css)
      return "hsl(265, 85%, 60%)";
    case "gold":
      // --brand-amber (:root, src/index.css)
      return "hsl(38, 96%, 52%)";
    case "silver":
      // SponsorManagement.tsx uses `bg-muted text-muted-foreground` for silver,
      // which has no brand HSL var of its own — `--muted-foreground` is
      // theme-dependent, so a fixed neutral gray literal (slate-500) stands in
      // for canvas rendering.
      return "#64748b";
    case "custom":
      // SponsorManagement.tsx uses `bg-primary/10 text-primary` for custom,
      // and `--primary` is theme-dependent — use the :root default literal.
      return "hsl(222, 25%, 10%)";
    case "bronze":
    default:
      // --brand-orange (:root, src/index.css); also the fallback for any
      // unrecognized tier value.
      return "hsl(22, 95%, 56%)";
  }
}

// ─── Aspect-ratio reflow (Requirement 5.3) ───────────────────────────────────

/** A slot's resolved pixel geometry (top-left anchored), guaranteed to be
 * fully contained within its target Platform_Format's [0,width] x
 * [0,height] bounds by `reflowTemplate`'s safe-area clamp. */
export interface ResolvedBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Converts a single %-based box (center-anchored `xPct`/`yPct` +
 * `widthPct`/`heightPct` sized slot) into an absolute-pixel, top-left
 * anchored `ResolvedBox` against `targetWidth`/`targetHeight`, then clamps it
 * into the safe area so it never extends past the canvas edges.
 *
 * When `preserveAspect` is true (used for image slots authored as circles or
 * rounded-rects, and for the templates' image slots in general), the box is
 * sized against `min(targetWidth, targetHeight)` for both dimensions so the
 * shape stays visually consistent across aspect ratios — otherwise a
 * 40%×40% circle authored on a square canvas becomes a stretched oval on
 * LinkedIn (1200×627) or Instagram Story (1080×1920). Text slots and
 * non-shape-sensitive rectangles keep the straight percent→pixel multiply
 * so their max-widths still fill the horizontal space.
 *
 * The clamp handles two cases: (1) the box fits but is offset past an edge
 * — slide it back in; (2) the box is wider/taller than the entire target
 * canvas — shrink it down to the canvas size first, then anchor it at 0,
 * so the invariant `x, y >= 0 && x + width <= targetWidth && y + height <=
 * targetHeight` holds unconditionally.
 */
function reflowBox(
  xPct: number,
  yPct: number,
  widthPct: number,
  heightPct: number,
  targetWidth: number,
  targetHeight: number,
  preserveAspect: boolean = false
): ResolvedBox {
  const shortSide = Math.min(targetWidth, targetHeight);
  let width = preserveAspect
    ? (widthPct / 100) * shortSide
    : (widthPct / 100) * targetWidth;
  let height = preserveAspect
    ? (heightPct / 100) * shortSide
    : (heightPct / 100) * targetHeight;

  // Shrink the box itself if it's larger than the entire target canvas —
  // otherwise no x/y clamp could keep `x + width <= targetWidth`.
  if (width > targetWidth) {
    width = targetWidth;
  }
  if (height > targetHeight) {
    height = targetHeight;
  }

  let x = (xPct / 100) * targetWidth - width / 2;
  let y = (yPct / 100) * targetHeight - height / 2;

  x = Math.max(0, Math.min(x, targetWidth - width));
  y = Math.max(0, Math.min(y, targetHeight - height));

  return { x, y, width, height };
}

/**
 * Reflow every slot's %-based geometry from the template's authored aspect
 * ratio onto a target Platform_Format's pixel dimensions, guaranteeing every
 * resulting box is fully contained within [0,width] x [0,height] (Requirement
 * 5.3). Pure — never mutates `template` or `format`.
 *
 * Percentages are already resolution-independent, so reflowing is a straight
 * percent→pixel multiply against `format.width`/`format.height` (not the
 * template's `authoredWidth`/`authoredHeight`, which only exist to document
 * the canvas the percentages were originally designed against). The
 * safe-area clamp in `reflowBox` handles very different aspect ratios (e.g.
 * a 1:1 authored template reflowed onto the narrow 600x200 Email Banner
 * format).
 */
export function reflowTemplate(
  template: CreativeTemplate,
  format: PlatformFormat
): { imageSlots: Record<string, ResolvedBox>; textSlots: Record<string, ResolvedBox> } {
  const imageSlots: Record<string, ResolvedBox> = {};
  for (const [role, slot] of Object.entries(template.imageSlots)) {
    if (!slot) continue;
    // Preserve aspect for circle/rounded-rect image slots so a 40% square
    // photo stays visually round on non-square formats. Plain "rect" slots
    // (logos) already fit any aspect ratio and don't need preservation.
    const preserveAspect = slot.shape === "circle" || slot.shape === "rounded-rect";
    imageSlots[role] = reflowBox(
      slot.xPct,
      slot.yPct,
      slot.widthPct,
      slot.heightPct,
      format.width,
      format.height,
      preserveAspect
    );
  }

  const textSlots: Record<string, ResolvedBox> = {};
  for (const slot of template.textSlots) {
    textSlots[slot.key] = reflowBox(
      slot.xPct,
      slot.yPct,
      slot.maxWidthPct,
      slot.maxHeightPct,
      format.width,
      format.height
    );
  }

  return { imageSlots, textSlots };
}

// ─── Template selection persistence (Requirement 1.4) ───────────────────────
//
// Selection is persisted per-event on `EventPageConfig.creativeTemplatePrefs`
// (see design's Data Models section) rather than a new database-backed
// table — these helpers are pure; the caller persists the returned config via
// the existing `supabase.from("events").update({ page_config })` path already
// used by `EventPageForm.tsx`.
//
// `EventPageConfig.creativeTemplatePrefs` is deliberately typed with the
// literal union `"speaker" | "sponsor" | "combo"` in
// `src/components/event/page-form/types.ts` (rather than importing
// `CreativeType` from here) to avoid a dependency from that low-level
// page-form schema module onto this creatives feature module. The two
// literal unions are structurally identical, so `CreativeType` can be used
// as the `type` parameter here without an import cycle.

import type { EventPageConfig } from "@/components/event/page-form/types";

/**
 * Returns a NEW `EventPageConfig` with `creativeTemplatePrefs[type]` set to
 * `templateId`, preserving every other existing preference already present
 * in `config.creativeTemplatePrefs`. Pure — never mutates `config`.
 */
export function saveCreativeTemplatePref(
  config: EventPageConfig,
  type: CreativeType,
  templateId: string
): EventPageConfig {
  return {
    ...config,
    creativeTemplatePrefs: {
      ...config.creativeTemplatePrefs,
      [type]: templateId,
    },
  };
}

/**
 * Reads the saved template preference for the given Creative type, or
 * `undefined` if none has been saved yet. Pure.
 */
export function readCreativeTemplatePref(
  config: EventPageConfig,
  type: CreativeType
): string | undefined {
  return config.creativeTemplatePrefs?.[type];
}

// ─── Per-entity template override helpers (Requirement 10.2, 10.3, 10.5) ────
//
// `creativeTemplatePrefs.perEntity[entityId]` (added by the
// Creative_Customization spec) carries per-speaker / per-sponsor template
// overrides. The batch render loop resolves each entity's effective
// template via `readEffectiveTemplateId` before calling the base spec's
// `buildXPlan`, so an entity with an override renders with a different
// template than the event-level default (Property 46).
//
// Purity note: every helper below returns a NEW `EventPageConfig` and
// never mutates `config` or any nested field, matching the pattern
// established by `saveCreativeTemplatePref` above.
//
// The import below pulls in ONLY the `CustomCreativeTemplate` type from
// `./creative-customization` — a mutual import that TypeScript handles
// fine because `creative-customization.ts` only imports types from this
// file (never values), so there is no runtime cycle. The `import type`
// form makes the type-only nature explicit for the reader.

import type { CustomCreativeTemplate } from "./creative-customization";

/**
 * Reads the effective template id for an entity — checks
 * `creativeTemplatePrefs.perEntity[entityId]` first (Requirement 10.3),
 * then falls back to `creativeTemplatePrefs[creativeType]`, then returns
 * `undefined` so the caller can resolve to the built-in registry's first
 * preset. Pure — property 46.
 */
export function readEffectiveTemplateId(
  config: EventPageConfig,
  entityId: string,
  creativeType: CreativeType
): string | undefined {
  const perEntity = config.creativeTemplatePrefs?.perEntity?.[entityId];
  if (perEntity) return perEntity;
  return config.creativeTemplatePrefs?.[creativeType];
}

/**
 * Returns a NEW `EventPageConfig` with `creativeTemplatePrefs.perEntity`
 * updated to point `entityId` → `templateId`, preserving every other
 * per-entity override and every per-type default (Requirement 10.2).
 * Pure — never mutates `config`.
 */
export function saveEntityTemplateOverride(
  config: EventPageConfig,
  entityId: string,
  templateId: string
): EventPageConfig {
  return {
    ...config,
    creativeTemplatePrefs: {
      ...config.creativeTemplatePrefs,
      perEntity: {
        ...config.creativeTemplatePrefs?.perEntity,
        [entityId]: templateId,
      },
    },
  };
}

/**
 * Returns a NEW `EventPageConfig` with `entityId` removed from
 * `creativeTemplatePrefs.perEntity`. Deletes the key (rather than storing
 * `null`) so the map stays minimal (Requirement 10.5). Pure — never
 * mutates `config`.
 */
export function clearEntityTemplateOverride(
  config: EventPageConfig,
  entityId: string
): EventPageConfig {
  const nextPerEntity = { ...(config.creativeTemplatePrefs?.perEntity ?? {}) };
  delete nextPerEntity[entityId];
  return {
    ...config,
    creativeTemplatePrefs: {
      ...config.creativeTemplatePrefs,
      perEntity: nextPerEntity,
    },
  };
}

// ─── Custom_Template persistence helpers (Requirement 8.8, 8.10) ────────────
//
// Custom_Templates are organizer-forked `CreativeTemplate`s stored on
// `page_config.customCreativeTemplates`. Adding a new template or editing
// an existing one both go through `saveCustomTemplate` (upsert-by-id).
// Deleting only removes the template from this list — any `event_creatives`
// rows referencing the template's id continue to render via their embedded
// `Customization_Config.snapshotTemplate` (Requirement 8.10), so this
// function deliberately doesn't need to touch those rows.

/**
 * Returns a NEW `EventPageConfig` with `template` upserted into
 * `customCreativeTemplates` by `template.id`. Preserves every other
 * template already in the list (Requirement 8.8). Pure — never mutates
 * `config`.
 */
export function saveCustomTemplate(
  config: EventPageConfig,
  template: CustomCreativeTemplate
): EventPageConfig {
  const existing = config.customCreativeTemplates ?? [];
  const idx = existing.findIndex((t) => t.id === template.id);
  const nextList = idx === -1
    ? [...existing, template]
    : existing.map((t, i) => (i === idx ? template : t));
  return { ...config, customCreativeTemplates: nextList };
}

/**
 * Returns a NEW `EventPageConfig` with the `templateId` filtered out of
 * `customCreativeTemplates` (Requirement 8.10). Any `event_creatives`
 * rows that reference this id keep rendering via their embedded
 * `Customization_Config.snapshotTemplate` — that JSONB snapshot is the
 * server-side round-trip guarantee, so this function doesn't need to
 * touch those rows. Pure — never mutates `config`.
 */
export function deleteCustomTemplate(
  config: EventPageConfig,
  templateId: string
): EventPageConfig {
  return {
    ...config,
    customCreativeTemplates: (config.customCreativeTemplates ?? []).filter(
      (t) => t.id !== templateId
    ),
  };
}
