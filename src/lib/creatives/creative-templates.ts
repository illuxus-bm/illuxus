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

/** Which kind of entity a Creative_Template / rendered Creative represents.
 *
 *  `"event"` is an event-level promo creative (no specific speaker or
 *  sponsor) — a Canva-style stats banner or invite card announcing the
 *  event itself (title, date, headline stats like attendee/speaker
 *  counts, a CTA button). Unlike `speaker`/`sponsor`/`combo`, an event
 *  creative has no `EntityPicker` step — the "entity" is the event row
 *  itself, whose data (`EventPromoLike`) the caller already has loaded. */
export type CreativeType = "speaker" | "sponsor" | "combo" | "event";

/** Named output specification matching a target social/email surface. */
/** The five preset `Platform_Format` ids shipped by the registry.
 *  A `PlatformFormat` value can also carry a synthesized string id like
 *  `"custom-1080x1350"` when the organizer picked a Custom_Size — the
 *  wider `PlatformFormat.id` type below reflects that. */
export type PlatformFormatId =
  | "linkedin-post"
  | "instagram-post"
  | "instagram-story"
  | "twitter-post"
  | "email-banner";

export interface PlatformFormat {
  /** Opaque id. Preset formats use one of `PlatformFormatId`'s literals;
   *  custom sizes get a synthesized string via `createCustomFormat`. The
   *  storage layer treats this as an arbitrary short string, so the type
   *  is deliberately widened to `string`. */
  id: string;
  label: string; // e.g. "LinkedIn Post" or "Custom 1080×1350"
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

/** Minimum permitted dimension (px) for a Custom_Size. Below this the
 *  rendered creative starts producing illegible text and layout guides
 *  become meaningless. */
export const CUSTOM_SIZE_MIN_PX = 200;
/** Maximum permitted dimension (px) for a Custom_Size. 4000 keeps memory
 *  and export time within reasonable bounds while still covering common
 *  cases (billboards, cover images, poster mockups). */
export const CUSTOM_SIZE_MAX_PX = 4000;

/**
 * `true` iff `width` and `height` are both finite integers inside
 * `[CUSTOM_SIZE_MIN_PX, CUSTOM_SIZE_MAX_PX]`. Used by the Custom_Size UI
 * to enable/disable the "Add" affordance and by `createCustomFormat` to
 * refuse to synthesize an out-of-range format.
 */
export function isValidCustomSize(width: number, height: number): boolean {
  return (
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    width >= CUSTOM_SIZE_MIN_PX &&
    width <= CUSTOM_SIZE_MAX_PX &&
    height >= CUSTOM_SIZE_MIN_PX &&
    height <= CUSTOM_SIZE_MAX_PX
  );
}

/**
 * Synthesizes a `PlatformFormat` for a Custom_Size. The synthesized id is
 * deterministic (`custom-<w>x<h>`) so the same dimensions always produce
 * the same id — useful when the id is persisted alongside a rendered
 * asset. Throws when the dimensions fall outside the
 * `[CUSTOM_SIZE_MIN_PX, CUSTOM_SIZE_MAX_PX]` range; callers should gate
 * on `isValidCustomSize` first.
 */
export function createCustomFormat(width: number, height: number): PlatformFormat {
  if (!isValidCustomSize(width, height)) {
    throw new RangeError(
      `Custom creative size ${width}x${height} out of range (${CUSTOM_SIZE_MIN_PX}-${CUSTOM_SIZE_MAX_PX})`
    );
  }
  return {
    id: `custom-${width}x${height}`,
    label: `Custom ${width}×${height}`,
    width,
    height,
  };
}

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

/** Text placement — mirrors ElementPlacement in badge-design.ts.
 *
 *  The `eventTitle`/`eventTagline`/`ctaLabel`/`statValueN`/`statLabelN`
 *  keys (N = 1..4) are Event_Promo-only, used by `EVENT_TEMPLATES`. */
export interface TextSlot {
  key:
    | "name"
    | "title"
    | "company"
    | "tierBadge"
    | "presentedBy"
    | "sponsorName"
    | "eventTitle"
    | "eventTagline"
    | "dateLabel"
    | "ctaLabel"
    | "statValue1"
    | "statLabel1"
    | "statValue2"
    | "statLabel2"
    | "statValue3"
    | "statLabel3"
    | "statValue4"
    | "statLabel4";
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

/**
 * A pill/badge/CTA-button-shaped element — a rounded capsule filled with
 * `fillColor` and centered text, used by Event_Promo templates for the
 * date chip and the CTA button (matching the reference "23rd July,
 * 2026" date pill and "Register for FREE" button). Geometry is %-based
 * against the template's authored canvas, resolved by `reflowTemplate`
 * the same way `ImageSlot`/`TextSlot` boxes are. `key` doubles as the
 * `PlanElement`'s stable identifier for logging/debugging, mirroring
 * `TextSlot.key`'s role.
 */
export interface PillSlot {
  key: "datePill" | "ctaButton";
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
  fillColor: string;
  textColor: string;
  fontFamily: string;
  fontWeight: number;
  baseSizePx: number;
  /** Corner radius as a fraction of the pill's height, 0..0.5. `0.5`
   *  (the default every Event_Promo template uses) produces a true
   *  capsule with semicircular ends. */
  cornerRadiusFactor: number;
}

/**
 * A decorative filled/stroked shape — a rounded card, a divider bar, a
 * background panel — used to add non-photographic structure to a
 * template (e.g. the rounded "stats card" behind an Event_Promo's stat
 * row, or a thin vertical divider between stat columns) without needing
 * a raster asset. Purely decorative: never carries entity data, so a
 * template's `shapeSlots` are drawn unconditionally whenever the
 * template defines them (same convention as `divider`). Geometry is
 * %-based against the template's authored canvas, resolved by
 * `reflowTemplate` exactly like `ImageSlot`/`TextSlot`/`PillSlot` boxes.
 */
export interface ShapeSlot {
  /** Stable label — used as the `PlanElement`'s key for logging/debugging
   *  and as the React key when multiple shapes are rendered. */
  key: string;
  shape: "rect" | "rounded-rect" | "circle" | "polygon";
  /**
   * Vertices for `shape: "polygon"`, in normalized box space — `[0,0]` is the
   * box's top-left, `[1,1]` its bottom-right. Ignored by every other shape.
   *
   * Normalized rather than absolute so one definition survives reflow to any
   * format: the points scale with the resolved box instead of needing to be
   * re-authored per aspect ratio.
   *
   * Polygons exist because the envelope in the reference invite is made of
   * triangles and trapezoids — an open flap and two diagonal fold panels.
   * Approximating those with rounded rectangles is what made the previous
   * attempt at this template read as three stacked beige bars rather than an
   * envelope.
   */
  points?: Array<[number, number]>;
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
  /** Any valid canvas `fillStyle` string (hex, rgba(), etc.), or
   *  `"transparent"` to skip the fill and draw only a stroke. */
  fillColor: string;
  strokeColor?: string;
  strokeWidthPx?: number;
  /** Corner radius as a fraction of the shape's shorter side, 0..0.5.
   *  Ignored for `"circle"`. Defaults to `0` (a plain rect) when
   *  `shape === "rounded-rect"` and this is omitted. */
  cornerRadiusFactor?: number;
  /** 0..1. Defaults to `1` (fully opaque) when omitted. */
  opacity?: number;
  /**
   * Promo data this shape accompanies. When set, the shape is drawn only if
   * that data is present; when omitted the shape is unconditional.
   *
   * Most shapes are structure (an envelope, a background motif) and belong on
   * every creative. A few are furniture for one piece of content: the accent
   * ticks either side of the script line, the panel behind the stats. Drawn
   * without their content they were stray marks and an empty box — which is
   * what an event with no tagline or no stats used to get.
   */
  requires?: PromoTextField | "stats";
}

/**
 * Where a slot's text comes from.
 *
 * The older slots bind to data implicitly, via a `key` drawn from a closed
 * union that the plan builder switches on. That works while every slot maps
 * 1:1 onto a promo field, but it can't express "this line is static chrome"
 * or "these two lines come from two different fields but lay out as one
 * block" — both of which the reference designs need. So the newer composite
 * slots declare their source explicitly instead.
 */
export type PromoTextSource =
  /** Fixed template chrome — "You're Invited", a section label. Renders
   *  identically for every event, so it isn't organizer data. */
  | { from: "literal"; text: string }
  /** Pulled from the `EventPromoLike` field of that name. The slot is omitted
   *  entirely when the field is absent or empty, matching every other slot's
   *  no-empty-placeholder convention. */
  | { from: "field"; field: PromoTextField }
  /**
   * Several fields joined into one line, skipping any that are absent.
   *
   * Needed because the same promo record has to drive layouts that disagree
   * about line breaks: the square invite sets "India's Largest" and "Virtual
   * HR Summit" as two differently-coloured runs, while the wide banner sets
   * the identical copy as one uniform white line. Without a joining source,
   * switching between those templates would silently drop half the headline —
   * the banner would show only whichever single field it happened to bind to.
   *
   * Skipping absent fields (rather than emitting the separator anyway) is what
   * keeps a promo with no `titleLead` from rendering with a leading space.
   */
  | { from: "fields"; fields: PromoTextField[]; join: string };

/** `EventPromoLike` fields a composite slot can bind to. */
export type PromoTextField =
  | "title"
  | "titleLead"
  | "tagline"
  | "dateLabel"
  | "ctaLabel"
  | "editionLabel";

/** One independently-styled line inside a `TextStackSlot`. */
export interface TextStackRunSpec {
  source: PromoTextSource;
  fontFamily: string;
  fontWeight: number;
  baseSizePx: number;
  color: string;
  /** Extra tracking, authored px. Used for small-caps eyebrow lines, where
   *  tracking is what separates the intended look from a cramped smudge. */
  letterSpacingPx?: number;
  transform?: "none" | "uppercase";
}

/**
 * Several styled lines laid out as ONE vertically-centered block.
 *
 * Exists because a `TextSlot` carries a single family/weight/size/color, so a
 * two-tone headline — the reference invite's charcoal "India's Largest" above
 * heavier purple "Virtual HR Summit" — couldn't be expressed. Two separate
 * text slots are not equivalent: each centers inside its own box, so the
 * optical gap between the lines drifts as copy length changes and neither
 * knows the other's height.
 *
 * When the block overflows, every run shrinks by one shared factor, so the
 * size ratio between runs (which is the design's typographic hierarchy) is
 * preserved rather than collapsing toward uniformity.
 */
export interface TextStackSlot {
  key: "headlineStack" | "lockupStack";
  xPct: number;
  yPct: number;
  maxWidthPct: number;
  maxHeightPct: number;
  runs: TextStackRunSpec[];
  /** Gap between runs, authored px. */
  lineGapPx: number;
  align: "left" | "center" | "right";
}

/**
 * What sits alongside an `AdornedTextSlot`'s line. All sizes are authored px.
 */
export type TextAdornmentSpec =
  /** A dot either side — the reference invite's "• 23rd July, 2026 •". */
  | { style: "dots"; color: string; radiusPx: number; gapPx: number }
  /** A vector glyph before the line — the hero banner's calendar. */
  | {
      style: "leading-icon";
      name: "calendar";
      color: string;
      sizePx: number;
      strokeWidthPx: number;
      gapPx: number;
    };

/**
 * A single line composed with an adornment and centred as one unit.
 *
 * Its own slot type rather than a text slot plus separately-positioned shapes
 * or a standalone icon, because the adornment is placed off the text's
 * *measured* width — which authored percentages cannot express. Positioning
 * them independently means the adornment drifts away from short copy and
 * collides with long copy; the first cut of the hero banner did precisely
 * that, overlapping its calendar glyph with the date.
 */
export interface AdornedTextSlot {
  key: "dateAdorned";
  source: PromoTextSource;
  xPct: number;
  yPct: number;
  maxWidthPct: number;
  maxHeightPct: number;
  fontFamily: string;
  fontWeight: number;
  baseSizePx: number;
  color: string;
  adornment: TextAdornmentSpec;
}

/**
 * A wax-seal CTA: an uneven blob of sealing wax with a stamped plaque and a
 * centered label. Distinct from `PillSlot` because the silhouette is not a
 * capsule, and it carries two tones (the wax and where it catches the light).
 */
export interface SealSlot {
  key: "ctaButton";
  source: PromoTextSource;
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
  fillColor: string;
  accentColor: string;
  textColor: string;
  fontFamily: string;
  fontWeight: number;
  baseSizePx: number;
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
   * `sponsorLogo` prefixes; speaker/sponsor templates use their own
   * subset; Event_Promo templates use `wordmark` for a small
   * organizer/event logo.
   */
  imageSlots: Partial<Record<"photo" | "logo" | "speakerPhoto" | "sponsorLogo" | "wordmark", ImageSlot>>;
  textSlots: TextSlot[];
  /** Pill/CTA-button elements — Event_Promo templates only (the date
   *  chip and the CTA button). Every other Creative type leaves this
   *  empty/omitted. */
  pillSlots?: PillSlot[];
  /** Decorative filled/stroked shapes (cards, divider bars) —
   *  Event_Promo templates only, drawn unconditionally right after the
   *  background. Every other Creative type leaves this empty/omitted. */
  shapeSlots?: ShapeSlot[];
  /** Multi-run headline blocks — see `TextStackSlot`. Event_Promo only. */
  textStackSlots?: TextStackSlot[];
  /** Adorned single lines — see `AdornedTextSlot`. Event_Promo only. */
  adornedTextSlots?: AdornedTextSlot[];
  /** Wax-seal CTA — see `SealSlot`. Mutually exclusive with a `ctaButton`
   *  pill; a template declares one or the other, never both. */
  sealSlots?: SealSlot[];
  /** Divider/"presented by" marker — combo templates only. */
  divider?: { xPct: number; yPct1: number; yPct2: number; color: string };
  /**
   * Formats this composition was actually designed for.
   *
   * Reflow guarantees every box lands inside the canvas at any aspect ratio,
   * but containment is not the same as looking right: a square envelope
   * invite reflowed to a 600×200 email banner is a legible, correctly-clamped
   * mess. Rather than pretend one composition serves every shape, a template
   * states its intent and the format picker surfaces the matching options
   * first. Omitted means "works anywhere".
   */
  preferredFormatIds?: string[];
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

/** Event_Promo presets: "Stats Banner", "Invite Card" (event-level, no
 *  speaker/sponsor entity). Authored to match reference promo creatives:
 *  a dark-gradient wide banner with a wordmark, big bold title, a row of
 *  up to 4 stat value/label pairs, a date pill, and a CTA button; and a
 *  light invite-card layout with a script-style "You're Invited"
 *  headline, bold event title, date, and CTA button. */
/**
 * The original square-authored Event_Promo presets.
 *
 * Kept because existing `event_creatives` rows reference these ids, and the
 * template picker should not lose options an organizer may already be using.
 * New work should prefer the reference-matched layouts that lead
 * `EVENT_TEMPLATES`.
 */
const LEGACY_EVENT_TEMPLATES: CreativeTemplate[] = [
  {
    id: "event-stats-banner",
    type: "event",
    name: "Stats Banner",
    description: "Dark gradient banner: wordmark, bold title, a row of headline stats, date pill, and a CTA button.",
    authoredWidth: AUTHORED_SIZE,
    authoredHeight: AUTHORED_SIZE,
    background: { type: "gradient", from: "#1a0730", to: "#2d1454", angle: 165 },
    imageSlots: {
      wordmark: { xPct: 50, yPct: 14, widthPct: 34, heightPct: 8, shape: "rect" },
    },
    textSlots: [
      {
        key: "eventTitle", xPct: 50, yPct: 30, maxWidthPct: 82, maxHeightPct: 12,
        fontFamily: "Poppins", fontWeight: 700, baseSizePx: 58, color: "#ffffff",
        align: "center", transform: "none",
      },
      {
        key: "statValue1", xPct: 18, yPct: 47, maxWidthPct: 18, maxHeightPct: 6,
        fontFamily: "Poppins", fontWeight: 700, baseSizePx: 34, color: "#a78bfa",
        align: "center", transform: "none",
      },
      {
        key: "statLabel1", xPct: 18, yPct: 52, maxWidthPct: 18, maxHeightPct: 4,
        fontFamily: "Poppins", fontWeight: 500, baseSizePx: 18, color: "#e0e7ff",
        align: "center", transform: "none",
      },
      {
        key: "statValue2", xPct: 39, yPct: 47, maxWidthPct: 18, maxHeightPct: 6,
        fontFamily: "Poppins", fontWeight: 700, baseSizePx: 34, color: "#a78bfa",
        align: "center", transform: "none",
      },
      {
        key: "statLabel2", xPct: 39, yPct: 52, maxWidthPct: 18, maxHeightPct: 4,
        fontFamily: "Poppins", fontWeight: 500, baseSizePx: 18, color: "#e0e7ff",
        align: "center", transform: "none",
      },
      {
        key: "statValue3", xPct: 61, yPct: 47, maxWidthPct: 18, maxHeightPct: 6,
        fontFamily: "Poppins", fontWeight: 700, baseSizePx: 34, color: "#a78bfa",
        align: "center", transform: "none",
      },
      {
        key: "statLabel3", xPct: 61, yPct: 52, maxWidthPct: 18, maxHeightPct: 4,
        fontFamily: "Poppins", fontWeight: 500, baseSizePx: 18, color: "#e0e7ff",
        align: "center", transform: "none",
      },
      {
        key: "statValue4", xPct: 82, yPct: 47, maxWidthPct: 18, maxHeightPct: 6,
        fontFamily: "Poppins", fontWeight: 700, baseSizePx: 34, color: "#a78bfa",
        align: "center", transform: "none",
      },
      {
        key: "statLabel4", xPct: 82, yPct: 52, maxWidthPct: 18, maxHeightPct: 4,
        fontFamily: "Poppins", fontWeight: 500, baseSizePx: 18, color: "#e0e7ff",
        align: "center", transform: "none",
      },
    ],
    pillSlots: [
      {
        key: "datePill", xPct: 50, yPct: 66, widthPct: 30, heightPct: 6,
        fillColor: "transparent", textColor: "#ffffff",
        fontFamily: "Poppins", fontWeight: 500, baseSizePx: 20,
        cornerRadiusFactor: 0.5,
      },
      {
        key: "ctaButton", xPct: 50, yPct: 80, widthPct: 32, heightPct: 8,
        fillColor: "#7c3aed", textColor: "#ffffff",
        fontFamily: "Poppins", fontWeight: 700, baseSizePx: 24,
        cornerRadiusFactor: 0.35,
      },
    ],
    themeOverridable: { background: true, accentTextKeys: ["statValue1", "statValue2", "statValue3", "statValue4"] },
  },
  {
    id: "event-invite-card",
    type: "event",
    name: "Invite Card",
    description: "Light invite layout: script \"You're Invited\" headline, bold event title, date, and a CTA button.",
    authoredWidth: AUTHORED_SIZE,
    authoredHeight: AUTHORED_SIZE,
    background: { type: "solid", color: "#2d1454" },
    imageSlots: {
      wordmark: { xPct: 50, yPct: 9, widthPct: 34, heightPct: 7, shape: "rect" },
    },
    textSlots: [
      {
        key: "eventTagline", xPct: 50, yPct: 34, maxWidthPct: 70, maxHeightPct: 8,
        fontFamily: "Playfair Display", fontWeight: 700, baseSizePx: 46, color: "#4c1d95",
        align: "center", transform: "none",
      },
      {
        key: "eventTitle", xPct: 50, yPct: 47, maxWidthPct: 76, maxHeightPct: 14,
        fontFamily: "Poppins", fontWeight: 700, baseSizePx: 38, color: "#111827",
        align: "center", transform: "none",
      },
      {
        key: "dateLabel", xPct: 50, yPct: 60, maxWidthPct: 60, maxHeightPct: 6,
        fontFamily: "Poppins", fontWeight: 600, baseSizePx: 22, color: "#374151",
        align: "center", transform: "none",
      },
    ],
    pillSlots: [
      {
        key: "ctaButton", xPct: 50, yPct: 72, widthPct: 36, heightPct: 8,
        fillColor: "#b91c1c", textColor: "#ffffff",
        fontFamily: "Poppins", fontWeight: 700, baseSizePx: 24,
        cornerRadiusFactor: 0.25,
      },
    ],
    themeOverridable: { background: false, accentTextKeys: ["eventTagline"] },
  },
  {
    id: "event-invitation-envelope",
    type: "event",
    name: "Invitation Envelope",
    description: "Cream invitation card peeking out of an open envelope on a deep purple background, with script tagline and a red wax-seal CTA button.",
    authoredWidth: AUTHORED_SIZE,
    authoredHeight: AUTHORED_SIZE,
    background: { type: "solid", color: "#2a1454" },
    imageSlots: {
      wordmark: { xPct: 50, yPct: 8, widthPct: 40, heightPct: 6, shape: "rect" },
    },
    // The envelope illustration is built entirely from shapes (no raster
    // asset) so it reflows cleanly to every Platform_Format: a triangular
    // flap (two crossed rect "flaps" simulated by a wide low triangle-ish
    // rounded-rect pair reads close enough at this scale) behind a cream
    // card, drawn back-to-front: envelope body -> flap -> card.
    shapeSlots: [
      // Envelope body (wide, sits behind the card).
      { key: "envelopeBody", shape: "rounded-rect", xPct: 50, yPct: 62, widthPct: 74, heightPct: 34,
        fillColor: "#e7ddc8", cornerRadiusFactor: 0.06 },
      // Envelope flap — a shorter, narrower rounded-rect anchored at the
      // top of the envelope body, standing in for the open triangular
      // flap silhouette.
      { key: "envelopeFlap", shape: "rounded-rect", xPct: 50, yPct: 48, widthPct: 56, heightPct: 14,
        fillColor: "#d8cbaa", cornerRadiusFactor: 0.15 },
      // Invitation card — the cream card peeking up out of the envelope,
      // narrower and taller than the envelope body so it visually
      // protrudes from the opening.
      { key: "invitationCard", shape: "rounded-rect", xPct: 50, yPct: 46, widthPct: 62, heightPct: 46,
        fillColor: "#f5f1e6", cornerRadiusFactor: 0.03,
        strokeColor: "#00000014", strokeWidthPx: 1 },
    ],
    textSlots: [
      {
        key: "eventTagline", xPct: 50, yPct: 33, maxWidthPct: 50, maxHeightPct: 9,
        fontFamily: "Playfair Display", fontWeight: 700, baseSizePx: 44, color: "#4c1d95",
        align: "center", transform: "none",
      },
      {
        key: "eventTitle", xPct: 50, yPct: 45, maxWidthPct: 50, maxHeightPct: 12,
        fontFamily: "Poppins", fontWeight: 700, baseSizePx: 30, color: "#111827",
        align: "center", transform: "none",
      },
      {
        key: "dateLabel", xPct: 50, yPct: 58, maxWidthPct: 44, maxHeightPct: 6,
        fontFamily: "Poppins", fontWeight: 600, baseSizePx: 20, color: "#374151",
        align: "center", transform: "none",
      },
    ],
    pillSlots: [
      {
        key: "ctaButton", xPct: 50, yPct: 78, widthPct: 34, heightPct: 8,
        fillColor: "#b91c1c", textColor: "#ffffff",
        fontFamily: "Poppins", fontWeight: 700, baseSizePx: 22,
        cornerRadiusFactor: 0.2,
      },
    ],
    themeOverridable: { background: false, accentTextKeys: ["eventTagline"] },
  },
  {
    id: "event-stats-hero",
    type: "event",
    name: "Stats Hero",
    description: "Purple-gradient hero with a bold title and a dark stat-row card underneath (4 headline metrics), date line, and a solid CTA button.",
    authoredWidth: AUTHORED_SIZE,
    authoredHeight: AUTHORED_SIZE,
    background: { type: "gradient", from: "#241154", to: "#120a2e", angle: 180 },
    imageSlots: {
      wordmark: { xPct: 50, yPct: 12, widthPct: 32, heightPct: 7, shape: "rect" },
    },
    // Rounded dark "stats card" panel that the 4 stat pairs sit inside,
    // giving the stat row a visually distinct band (matching the
    // reference's dark rounded-rect containing the metrics row) without
    // needing an image asset.
    shapeSlots: [
      { key: "statsCard", shape: "rounded-rect", xPct: 50, yPct: 50, widthPct: 82, heightPct: 20,
        fillColor: "#ffffff0f", cornerRadiusFactor: 0.18,
        strokeColor: "#ffffff26", strokeWidthPx: 1 },
      { key: "statDivider1", shape: "rect", xPct: 25, yPct: 50, widthPct: 0.15, heightPct: 12,
        fillColor: "#ffffff26" },
      { key: "statDivider2", shape: "rect", xPct: 50, yPct: 50, widthPct: 0.15, heightPct: 12,
        fillColor: "#ffffff26" },
      { key: "statDivider3", shape: "rect", xPct: 75, yPct: 50, widthPct: 0.15, heightPct: 12,
        fillColor: "#ffffff26" },
    ],
    textSlots: [
      {
        key: "eventTitle", xPct: 50, yPct: 27, maxWidthPct: 84, maxHeightPct: 13,
        fontFamily: "Poppins", fontWeight: 700, baseSizePx: 54, color: "#ffffff",
        align: "center", transform: "none",
      },
      {
        key: "statValue1", xPct: 12.5, yPct: 46, maxWidthPct: 20, maxHeightPct: 6,
        fontFamily: "Poppins", fontWeight: 700, baseSizePx: 30, color: "#c4b5fd",
        align: "center", transform: "none",
      },
      {
        key: "statLabel1", xPct: 12.5, yPct: 52, maxWidthPct: 20, maxHeightPct: 4,
        fontFamily: "Poppins", fontWeight: 500, baseSizePx: 16, color: "#e0e7ff",
        align: "center", transform: "none",
      },
      {
        key: "statValue2", xPct: 37.5, yPct: 46, maxWidthPct: 20, maxHeightPct: 6,
        fontFamily: "Poppins", fontWeight: 700, baseSizePx: 30, color: "#c4b5fd",
        align: "center", transform: "none",
      },
      {
        key: "statLabel2", xPct: 37.5, yPct: 52, maxWidthPct: 20, maxHeightPct: 4,
        fontFamily: "Poppins", fontWeight: 500, baseSizePx: 16, color: "#e0e7ff",
        align: "center", transform: "none",
      },
      {
        key: "statValue3", xPct: 62.5, yPct: 46, maxWidthPct: 20, maxHeightPct: 6,
        fontFamily: "Poppins", fontWeight: 700, baseSizePx: 30, color: "#c4b5fd",
        align: "center", transform: "none",
      },
      {
        key: "statLabel3", xPct: 62.5, yPct: 52, maxWidthPct: 20, maxHeightPct: 4,
        fontFamily: "Poppins", fontWeight: 500, baseSizePx: 16, color: "#e0e7ff",
        align: "center", transform: "none",
      },
      {
        key: "statValue4", xPct: 87.5, yPct: 46, maxWidthPct: 20, maxHeightPct: 6,
        fontFamily: "Poppins", fontWeight: 700, baseSizePx: 30, color: "#c4b5fd",
        align: "center", transform: "none",
      },
      {
        key: "statLabel4", xPct: 87.5, yPct: 52, maxWidthPct: 20, maxHeightPct: 4,
        fontFamily: "Poppins", fontWeight: 500, baseSizePx: 16, color: "#e0e7ff",
        align: "center", transform: "none",
      },
      {
        key: "dateLabel", xPct: 50, yPct: 68, maxWidthPct: 60, maxHeightPct: 6,
        fontFamily: "Poppins", fontWeight: 500, baseSizePx: 20, color: "#ffffff",
        align: "center", transform: "none",
      },
    ],
    pillSlots: [
      {
        key: "ctaButton", xPct: 50, yPct: 82, widthPct: 34, heightPct: 8,
        fillColor: "#7c3aed", textColor: "#ffffff",
        fontFamily: "Poppins", fontWeight: 700, baseSizePx: 24,
        cornerRadiusFactor: 0.5,
      },
    ],
    themeOverridable: { background: true, accentTextKeys: ["statValue1", "statValue2", "statValue3", "statValue4"] },
  },
];

// ─── Reference-matched Event_Promo templates ────────────────────────────────
//
// The two templates below are authored against the aspect ratios they were
// designed for rather than the shared 1200×1200 canvas the older presets use,
// and their `baseSizePx` values are the literal pixel sizes intended at that
// authored size. `scaleTextSize` divides by the authored short side, so a
// template authored at 1080×1080 renders 1:1 on a 1080×1080 Instagram Post,
// and one authored at 1200×628 renders ~1:1 on a 1200×627 LinkedIn Post. That
// is why each declares `preferredFormatIds`: the composition is designed for a
// shape, and reflowing a square envelope onto a 600×200 email banner produces
// something correctly clamped but visually wrong.

/** Authored canvas for the square invite. Matches Instagram Post exactly. */
const INVITE_SIZE = 1080;

/** Authored canvas for the wide hero banner. ~1.91:1, matching LinkedIn Post. */
const BANNER_W = 1200;
const BANNER_H = 628;

/** Deep violet ground of the invite, darker at the top. */
const REF_PURPLE_TOP = "#2A0C66";
const REF_PURPLE_BOTTOM = "#39178F";
/** The lighter violet of the invite's background motifs. */
const REF_MOTIF = "#4A23B4";
/** Cream family for the envelope, darkest (the open flap's inner face) to
 *  lightest (the card). The steps are small on purpose: it is one sheet of
 *  paper seen at different angles, not four colours. */
const CREAM_FLAP = "#D9CDAD";
const CREAM_BACK = "#DDD2B3";
const CREAM_SIDE = "#E9E0C8";
const CREAM_BOTTOM = "#E3D9BE";
const CREAM_CARD = "#F3EEDF";
/** Shadow tone for the envelope's folds. */
const FOLD_SHADE = "#5A4A1E";
/** Sealing-wax red, and the lighter tone where it catches the light. */
const WAX_RED = "#C4202B";
const WAX_RED_LIGHT = "#E0434C";
/** The red used for the accent ticks flanking the script headline and the
 *  dots flanking the date. */
const ACCENT_RED = "#E4515C";
/** Headline colours on the card. */
const INK_CHARCOAL = "#2A2A30";
const INK_VIOLET = "#4A1FA8";

type Pt = [number, number];

/**
 * A polygon shape authored in canvas percentages.
 *
 * `ShapeSlot` wants a centre, a size and vertices normalised to that box —
 * convenient for reflow, miserable to author, since moving one corner of an
 * envelope flap means recomputing all three. This takes the vertices where
 * they actually sit on the canvas and derives the rest.
 */
function polygon(
  key: string,
  points: Pt[],
  fillColor: string,
  extra: Partial<Pick<ShapeSlot, "opacity" | "strokeColor" | "strokeWidthPx" | "requires">> = {},
): ShapeSlot {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  // A degenerate (zero-area) axis would divide by zero below.
  const width = Math.max(0.01, Math.max(...xs) - minX);
  const height = Math.max(0.01, Math.max(...ys) - minY);
  return {
    key,
    shape: "polygon",
    xPct: minX + width / 2,
    yPct: minY + height / 2,
    widthPct: width,
    heightPct: height,
    fillColor,
    points: points.map(([px, py]) => [(px - minX) / width, (py - minY) / height]),
    ...extra,
  };
}

/**
 * A straight stroke from one point to another, as a thin quadrilateral.
 *
 * The shape model has no rotation and no line primitive, so an angled stroke —
 * an accent tick, the shadow along a fold — is expressed as the four corners
 * of the rectangle it would be.
 */
function stroke(
  key: string,
  from: Pt,
  to: Pt,
  thicknessPct: number,
  fillColor: string,
  extra: Partial<Pick<ShapeSlot, "opacity" | "requires">> = {},
): ShapeSlot {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy) || 1;
  // Unit normal, scaled to half the thickness.
  const nx = (-dy / length) * (thicknessPct / 2);
  const ny = (dx / length) * (thicknessPct / 2);
  return polygon(
    key,
    [
      [from[0] + nx, from[1] + ny],
      [to[0] + nx, to[1] + ny],
      [to[0] - nx, to[1] - ny],
      [from[0] - nx, from[1] - ny],
    ],
    fillColor,
    extra,
  );
}

/** A stroke given by its midpoint, length and angle — how an accent tick is
 *  naturally described. `angleDeg` is measured from horizontal, positive
 *  turning clockwise on screen. */
function tick(key: string, center: Pt, lengthPct: number, angleDeg: number): ShapeSlot {
  const a = (angleDeg * Math.PI) / 180;
  const hx = (Math.cos(a) * lengthPct) / 2;
  const hy = (Math.sin(a) * lengthPct) / 2;
  return stroke(key, [center[0] - hx, center[1] - hy], [center[0] + hx, center[1] + hy], 0.8, ACCENT_RED, {
    // Ticks are emphasis marks for the script line; without it they are
    // just stray red dashes on an empty card.
    requires: "tagline",
  });
}

/**
 * A leaf from `base` to `tip`: pointed at both ends, widest in the middle.
 *
 * Sampled along two opposing arcs rather than hand-placed, so the curve is
 * smooth — the shape model has no bezier support, so enough vertices is how a
 * curve gets expressed.
 */
function leaf(key: string, base: Pt, tip: Pt, widthPct: number, opacity: number): ShapeSlot {
  const dx = tip[0] - base[0];
  const dy = tip[1] - base[1];
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;
  const steps = 10;
  const right: Pt[] = [];
  const left: Pt[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const half = (widthPct / 2) * Math.sin(Math.PI * t);
    const cx = base[0] + dx * t;
    const cy = base[1] + dy * t;
    right.push([cx + nx * half, cy + ny * half]);
    left.push([cx - nx * half, cy - ny * half]);
  }
  return polygon(key, [...right, ...left.reverse()], REF_MOTIF, { opacity });
}

// Envelope geometry, in canvas percentages. Named because the pieces share
// edges: the card must be exactly as wide as the flap's shoulders, and the
// front flaps must start exactly at the mouth.
const ENV_LEFT = 6.5;
const ENV_RIGHT = 93.5;
/** Where the envelope's pocket opens. */
const ENV_MOUTH = 58;
const CARD_LEFT = 14;
const CARD_RIGHT = 86;
const CARD_TOP = 37;
const CARD_BOTTOM = 82.5;
/** Tip of the opened flap. */
const FLAP_APEX: Pt = [50, 17.5];
/** Where the two side flaps meet under the seal. */
const SIDE_FLAP_MEET_Y = 81.5;

/**
 * "Invitation Envelope" — matches the square reference invite.
 *
 * An opened envelope standing on a deep violet ground: the flap lifted to a
 * point above an invitation card that rises out of the pocket, the card
 * carrying a script "You're Invited" flanked by accent ticks, a two-tone
 * headline and a dot-flanked date, and a wax-seal CTA pressed where the
 * envelope's flaps meet.
 *
 * The envelope is drawn back to front — open flap → back of the pocket → card
 * → side flaps → bottom flap — and `shapeSlots` preserves array order. The
 * front flaps coming after the card is what makes it read as a card tucked
 * INTO an envelope rather than a panel pasted on one.
 */
const EVENT_TEMPLATE_INVITE_REFERENCE: CreativeTemplate = {
  id: "event-invite-envelope-ref",
  type: "event",
  name: "Invitation Envelope",
  description:
    "Opened cream envelope on deep violet: script \"You're Invited\", two-tone headline, dot-flanked date, and a red wax-seal CTA.",
  authoredWidth: INVITE_SIZE,
  authoredHeight: INVITE_SIZE,
  background: { type: "gradient", from: REF_PURPLE_TOP, to: REF_PURPLE_BOTTOM, angle: 180 },
  preferredFormatIds: ["instagram-post", "instagram-story"],
  imageSlots: {
    wordmark: { xPct: 50, yPct: 8.4, widthPct: 30, heightPct: 4.8, shape: "rect" },
  },
  shapeSlots: [
    // ── Background motifs, upper right ──
    // Four-point sparkle, its top cut by the edge of the canvas.
    polygon(
      "motifSparkle",
      [
        [88.5, 0.2],
        [89.7, 3.6],
        [93, 5],
        [89.7, 6.4],
        [88.5, 9.8],
        [87.3, 6.4],
        [84, 5],
        [87.3, 3.6],
      ],
      REF_MOTIF,
      { opacity: 0.9 },
    ),
    // Two leaves splaying from a shared base.
    leaf("motifLeafA", [87.5, 17.5], [76, 6], 9.5, 0.9),
    leaf("motifLeafB", [89.5, 17.5], [99.5, 6.5], 9.5, 0.9),
    // Two interlocking links: rounded squares stood on their corners, drawn
    // as thick outlines.
    polygon(
      "motifLinkA",
      [
        [80, 20.5],
        [89, 29.5],
        [80, 38.5],
        [71, 29.5],
      ],
      "transparent",
      { strokeColor: REF_MOTIF, strokeWidthPx: 36, opacity: 0.9 },
    ),
    polygon(
      "motifLinkB",
      [
        [90, 27],
        [99, 36],
        [90, 45],
        [81, 36],
      ],
      "transparent",
      { strokeColor: REF_MOTIF, strokeWidthPx: 36, opacity: 0.9 },
    ),
    { key: "motifDot", shape: "circle", xPct: 91, yPct: 51.5, widthPct: 8, heightPct: 8, fillColor: REF_MOTIF, opacity: 0.7 },

    // ── Envelope, drawn back to front ──
    // The opened flap: a peak over the card, with shoulders that drop behind
    // the card and flare out to the corners of the pocket's mouth.
    polygon(
      "envelopeFlap",
      [
        FLAP_APEX,
        [CARD_RIGHT, CARD_TOP],
        [CARD_RIGHT, 50],
        [ENV_RIGHT, ENV_MOUTH],
        [ENV_LEFT, ENV_MOUTH],
        [CARD_LEFT, 50],
        [CARD_LEFT, CARD_TOP],
      ],
      CREAM_FLAP,
    ),
    // Inside of the pocket. Mostly hidden; it is what shows in the sliver
    // between the card and the front flaps, instead of the violet ground.
    polygon(
      "envelopeBack",
      [
        [ENV_LEFT, ENV_MOUTH],
        [ENV_RIGHT, ENV_MOUTH],
        [ENV_RIGHT, 100],
        [ENV_LEFT, 100],
      ],
      CREAM_BACK,
    ),
    // The card, rising out of the pocket. Its bottom edge is below where the
    // front flaps meet, so it disappears into the envelope.
    {
      key: "invitationCard",
      shape: "rounded-rect",
      xPct: (CARD_LEFT + CARD_RIGHT) / 2,
      yPct: (CARD_TOP + CARD_BOTTOM) / 2,
      widthPct: CARD_RIGHT - CARD_LEFT,
      heightPct: CARD_BOTTOM - CARD_TOP,
      fillColor: CREAM_CARD,
      cornerRadiusFactor: 0.006,
      strokeColor: "#5A4A1E22",
      strokeWidthPx: 2,
    },
    // Accent ticks: three by the script line's upper left, three by its lower
    // right, fanning outward. Only drawn when there is a script line.
    tick("tickL1", [23.6, 40.8], 3.4, 62),
    tick("tickL2", [21.6, 43.6], 3.4, 30),
    tick("tickL3", [21.3, 46.5], 3.2, -6),
    tick("tickR1", [78.7, 44.3], 3.2, -6),
    tick("tickR2", [78.4, 47.2], 3.4, 30),
    tick("tickR3", [76.4, 50], 3.4, 62),
    // Side flaps: each runs from its corner of the mouth down to the centre,
    // so together they hide the card's lower corners behind a V.
    polygon(
      "envelopeSideL",
      [
        [ENV_LEFT, ENV_MOUTH],
        [50, SIDE_FLAP_MEET_Y + 2],
        [50, 100],
        [ENV_LEFT, 100],
      ],
      CREAM_SIDE,
    ),
    polygon(
      "envelopeSideR",
      [
        [ENV_RIGHT, ENV_MOUTH],
        [50, SIDE_FLAP_MEET_Y + 2],
        [50, 100],
        [ENV_RIGHT, 100],
      ],
      CREAM_SIDE,
    ),
    // Soft shadow along each side flap's upper edge, where it stands proud of
    // the card.
    stroke("foldShadeL", [ENV_LEFT, ENV_MOUTH + 0.3], [50, SIDE_FLAP_MEET_Y + 2.3], 0.5, FOLD_SHADE, { opacity: 0.16 }),
    stroke("foldShadeR", [ENV_RIGHT, ENV_MOUTH + 0.3], [50, SIDE_FLAP_MEET_Y + 2.3], 0.5, FOLD_SHADE, { opacity: 0.16 }),
    // Bottom flap, folded up over the side flaps to a point under the seal.
    polygon(
      "envelopeBottom",
      [
        [50, SIDE_FLAP_MEET_Y - 1.5],
        [88, 100],
        [12, 100],
      ],
      CREAM_BOTTOM,
    ),
    // Stopped just short of the canvas edge: a stroke has thickness, and one
    // ending exactly on the edge would have corners outside the canvas, which
    // reflow corrects by shifting the whole stroke off its fold.
    stroke("foldShadeBL", [50, SIDE_FLAP_MEET_Y - 1.5], [12.8, 99.5], 0.4, FOLD_SHADE, { opacity: 0.14 }),
    stroke("foldShadeBR", [50, SIDE_FLAP_MEET_Y - 1.5], [87.2, 99.5], 0.4, FOLD_SHADE, { opacity: 0.14 }),
  ],
  textSlots: [
    // Script headline. Its own slot rather than a stack run because it is a
    // standalone flourish, not part of the headline hierarchy.
    {
      key: "eventTagline",
      xPct: 50,
      yPct: 45.5,
      maxWidthPct: 50,
      maxHeightPct: 12,
      fontFamily: "Dancing Script",
      fontWeight: 700,
      baseSizePx: 112,
      color: INK_VIOLET,
      align: "center",
      transform: "none",
    },
  ],
  textStackSlots: [
    // Edition eyebrow under the wordmark: tracked small caps.
    {
      key: "lockupStack",
      xPct: 50,
      yPct: 12.2,
      maxWidthPct: 60,
      maxHeightPct: 4,
      lineGapPx: 0,
      align: "center",
      runs: [
        {
          source: { from: "field", field: "editionLabel" },
          fontFamily: "Inter",
          fontWeight: 500,
          baseSizePx: 23,
          color: "#A99BF2",
          letterSpacingPx: 6,
          transform: "uppercase",
        },
      ],
    },
    // The two-tone headline. Charcoal lead over heavier violet title, shrunk
    // together so the emphasis ratio survives long copy.
    {
      key: "headlineStack",
      xPct: 50,
      yPct: 61,
      maxWidthPct: 64,
      maxHeightPct: 16,
      lineGapPx: 4,
      align: "center",
      runs: [
        {
          source: { from: "field", field: "titleLead" },
          fontFamily: "Inter",
          fontWeight: 600,
          baseSizePx: 54,
          color: INK_CHARCOAL,
        },
        {
          source: { from: "field", field: "title" },
          fontFamily: "Inter",
          fontWeight: 700,
          baseSizePx: 64,
          color: INK_VIOLET,
        },
      ],
    },
  ],
  adornedTextSlots: [
    {
      key: "dateAdorned",
      source: { from: "field", field: "dateLabel" },
      xPct: 50,
      yPct: 73.4,
      maxWidthPct: 56,
      maxHeightPct: 6,
      fontFamily: "Inter",
      fontWeight: 600,
      baseSizePx: 34,
      color: INK_CHARCOAL,
      adornment: { style: "dots", color: ACCENT_RED, radiusPx: 8, gapPx: 22 },
    },
  ],
  sealSlots: [
    {
      key: "ctaButton",
      source: { from: "field", field: "ctaLabel" },
      xPct: 50,
      yPct: 86,
      widthPct: 33,
      heightPct: 10,
      fillColor: WAX_RED,
      accentColor: WAX_RED_LIGHT,
      textColor: "#FFFFFF",
      fontFamily: "Inter",
      fontWeight: 700,
      baseSizePx: 30,
    },
  ],
  // Background stays off-theme: the cream/violet/wax-red relationship is what
  // makes this layout work, and substituting an arbitrary event primary would
  // leave the envelope floating on a clashing ground.
  themeOverridable: { background: false, accentTextKeys: [] },
};

// Stats panel geometry for the banner, in canvas percentages.
const STATS_LEFT = 20.4;
const STATS_WIDTH = 59.2;
const STATS_COLUMN = STATS_WIDTH / 4;
/** Space between a column's left edge and its text. */
const STATS_INSET = 4.2;
const STAT_VALUE_Y = 49.4;
const STAT_LABEL_Y = 55.6;

/** Value + label slots for stat `n` (1-based), left-aligned in its column as
 *  in the reference, where the figures line up down their left edge. */
function statSlots(n: 1 | 2 | 3 | 4): TextSlot[] {
  const width = STATS_COLUMN - STATS_INSET - 0.8;
  const xPct = STATS_LEFT + (n - 1) * STATS_COLUMN + STATS_INSET + width / 2;
  return [
    {
      key: `statValue${n}` as TextSlot["key"],
      xPct,
      yPct: STAT_VALUE_Y,
      maxWidthPct: width,
      maxHeightPct: 8.5,
      fontFamily: "Inter",
      fontWeight: 600,
      baseSizePx: 43,
      color: "#A898FF",
      align: "left",
      transform: "none",
    },
    {
      key: `statLabel${n}` as TextSlot["key"],
      xPct,
      yPct: STAT_LABEL_Y,
      maxWidthPct: width,
      maxHeightPct: 5,
      fontFamily: "Inter",
      fontWeight: 400,
      baseSizePx: 21,
      color: "#F1EEFF",
      align: "left",
      transform: "none",
    },
  ];
}

/** Hairline rule at the boundary before stat column `n` (2..4). */
function statDivider(n: 2 | 3 | 4): ShapeSlot {
  return {
    key: `statDivider${n - 1}`,
    shape: "rect",
    xPct: STATS_LEFT + (n - 1) * STATS_COLUMN,
    yPct: 52.2,
    widthPct: 0.12,
    heightPct: 13,
    fillColor: "#FFFFFF33",
    requires: "stats",
  };
}

/**
 * "Stats Hero" — matches the wide reference banner.
 *
 * Deep indigo ground with soft lighter sweeps, centred lockup with a tracked
 * edition eyebrow, one large white headline, a darker inset stats panel split
 * into four columns by hairline rules, a calendar glyph beside the date, and
 * a violet CTA button.
 */
const EVENT_TEMPLATE_HERO_REFERENCE: CreativeTemplate = {
  id: "event-stats-hero-ref",
  type: "event",
  name: "Stats Hero Banner",
  description:
    "Wide deep-indigo banner: large headline, four-column stats panel with hairline dividers, calendar date line, and a violet CTA button.",
  authoredWidth: BANNER_W,
  authoredHeight: BANNER_H,
  background: { type: "gradient", from: "#190A42", to: "#25105C", angle: 180 },
  preferredFormatIds: ["linkedin-post", "twitter-post"],
  imageSlots: {
    wordmark: { xPct: 50, yPct: 12.8, widthPct: 22, heightPct: 8.5, shape: "rect" },
  },
  shapeSlots: [
    // Soft sweeps of lighter violet. Kept very faint and very wide: at higher
    // opacity the polygons stop reading as diffuse light and start reading as
    // flat triangles.
    polygon(
      "auroraA",
      [
        [0, 30],
        [45, 0],
        [100, 6],
        [100, 22],
        [40, 38],
        [0, 58],
      ],
      "#7C5CF0",
      { opacity: 0.07 },
    ),
    polygon(
      "auroraB",
      [
        [0, 100],
        [0, 78],
        [38, 70],
        [72, 62],
        [100, 44],
        [100, 100],
      ],
      "#6D3FE0",
      { opacity: 0.1 },
    ),
    polygon(
      "auroraC",
      [
        [18, 0],
        [60, 0],
        [100, 34],
        [100, 48],
      ],
      "#9A86FF",
      { opacity: 0.04 },
    ),
    // Stats panel: darker than the ground, so it reads as inset. Only drawn
    // when there are stats to put in it.
    {
      key: "statsCard",
      shape: "rounded-rect",
      xPct: STATS_LEFT + STATS_WIDTH / 2,
      yPct: 52.2,
      widthPct: STATS_WIDTH,
      heightPct: 22.4,
      fillColor: "#0E042C",
      cornerRadiusFactor: 0.14,
      opacity: 0.62,
      requires: "stats",
    },
    statDivider(2),
    statDivider(3),
    statDivider(4),
  ],
  textSlots: [
    ...statSlots(1),
    ...statSlots(2),
    ...statSlots(3),
    ...statSlots(4),
    // No plain `dateLabel` slot: the date is drawn by the `adornedTextSlots`
    // entry below so that it and its calendar glyph centre as one unit.
  ],
  textStackSlots: [
    {
      key: "lockupStack",
      xPct: 50,
      yPct: 18.6,
      maxWidthPct: 50,
      maxHeightPct: 4,
      lineGapPx: 0,
      align: "center",
      runs: [
        {
          source: { from: "field", field: "editionLabel" },
          fontFamily: "Inter",
          fontWeight: 500,
          baseSizePx: 18,
          color: "#A99BF2",
          letterSpacingPx: 5,
          transform: "uppercase",
        },
      ],
    },
    {
      // One uniform white line. The joining source recombines the lead and the
      // title that the square invite renders as two separate runs, so the same
      // promo record drives both layouts without losing half the headline.
      key: "headlineStack",
      xPct: 50,
      yPct: 30.2,
      maxWidthPct: 88,
      maxHeightPct: 14,
      lineGapPx: 0,
      align: "center",
      runs: [
        {
          source: { from: "fields", fields: ["titleLead", "title"], join: " " },
          fontFamily: "Inter",
          fontWeight: 600,
          baseSizePx: 58,
          color: "#FFFFFF",
        },
      ],
    },
  ],
  adornedTextSlots: [
    {
      key: "dateAdorned",
      source: { from: "field", field: "dateLabel" },
      xPct: 50,
      yPct: 71.6,
      maxWidthPct: 40,
      maxHeightPct: 6.5,
      fontFamily: "Inter",
      fontWeight: 400,
      baseSizePx: 23,
      color: "#FFFFFF",
      adornment: {
        style: "leading-icon",
        name: "calendar",
        color: "#FFFFFF",
        sizePx: 28,
        strokeWidthPx: 2.2,
        gapPx: 16,
      },
    },
  ],
  pillSlots: [
    {
      key: "ctaButton",
      xPct: 50,
      yPct: 86.3,
      widthPct: 24.6,
      heightPct: 11.4,
      fillColor: "#7A42F0",
      textColor: "#FFFFFF",
      fontFamily: "Inter",
      fontWeight: 600,
      baseSizePx: 23,
      // A button, not a capsule: the reference's corners are barely rounded.
      cornerRadiusFactor: 0.06,
    },
  ],
  themeOverridable: {
    background: true,
    accentTextKeys: ["statValue1", "statValue2", "statValue3", "statValue4"],
  },
};

/**
 * Event_Promo presets, reference-matched layouts first so the template picker
 * offers them ahead of the older square-authored ones.
 */
export const EVENT_TEMPLATES: CreativeTemplate[] = [
  EVENT_TEMPLATE_INVITE_REFERENCE,
  EVENT_TEMPLATE_HERO_REFERENCE,
  ...LEGACY_EVENT_TEMPLATES,
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
    case "event":
      return EVENT_TEMPLATES;
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
): {
  imageSlots: Record<string, ResolvedBox>;
  textSlots: Record<string, ResolvedBox>;
  pillSlots: Record<string, ResolvedBox>;
  shapeSlots: Record<string, ResolvedBox>;
  textStackSlots: Record<string, ResolvedBox>;
  adornedTextSlots: Record<string, ResolvedBox>;
  sealSlots: Record<string, ResolvedBox>;
} {
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

  const pillSlots: Record<string, ResolvedBox> = {};
  for (const slot of template.pillSlots ?? []) {
    pillSlots[slot.key] = reflowBox(
      slot.xPct,
      slot.yPct,
      slot.widthPct,
      slot.heightPct,
      format.width,
      format.height
    );
  }

  const shapeSlots: Record<string, ResolvedBox> = {};
  for (const slot of template.shapeSlots ?? []) {
    shapeSlots[slot.key] = reflowBox(
      slot.xPct,
      slot.yPct,
      slot.widthPct,
      slot.heightPct,
      format.width,
      format.height
    );
  }

  const textStackSlots: Record<string, ResolvedBox> = {};
  for (const slot of template.textStackSlots ?? []) {
    textStackSlots[slot.key] = reflowBox(
      slot.xPct,
      slot.yPct,
      slot.maxWidthPct,
      slot.maxHeightPct,
      format.width,
      format.height
    );
  }

  const adornedTextSlots: Record<string, ResolvedBox> = {};
  for (const slot of template.adornedTextSlots ?? []) {
    adornedTextSlots[slot.key] = reflowBox(
      slot.xPct,
      slot.yPct,
      slot.maxWidthPct,
      slot.maxHeightPct,
      format.width,
      format.height
    );
  }

  const sealSlots: Record<string, ResolvedBox> = {};
  for (const slot of template.sealSlots ?? []) {
    sealSlots[slot.key] = reflowBox(
      slot.xPct,
      slot.yPct,
      slot.widthPct,
      slot.heightPct,
      format.width,
      format.height
    );
  }

  return {
    imageSlots,
    textSlots,
    pillSlots,
    shapeSlots,
    textStackSlots,
    adornedTextSlots,
    sealSlots,
  };
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
