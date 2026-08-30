/**
 * Creative_Canvas_Renderer for the Social Creative Generator.
 *
 * Mirrors the architectural split described in `creative-templates.ts`'s
 * header: that module owns the declarative template model + pure layout
 * resolution, while this module owns turning a resolved template + entity
 * into pixels. It is split into two layers of its own:
 *
 *  - **Plan builders** (pure): `buildSpeakerPlan`, `buildSponsorPlan`,
 *    `buildComboPlan` resolve theme fallback, reflowed geometry, and text
 *    fitting into a flat `RenderPlan` — a list of drawable `PlanElement`s
 *    with fully resolved pixel boxes. No canvas or DOM involved, so these
 *    are directly testable with fast-check.
 *  - **Canvas drawing** (imperative): `drawPlan` walks a `RenderPlan` and
 *    issues the actual `CanvasRenderingContext2D` calls, and
 *    `renderSpeakerCreative`/`renderSponsorCreative`/`renderComboCreative`
 *    compose plan-building + an off-screen canvas + `drawPlan` +
 *    `canvas.toBlob()` into the exported PNG.
 *
 * Small pure helpers used by the drawing step but independently testable
 * (`nativeSizedLogoBox`, `fitText`) live here too, alongside
 * `assertComboEligible` (combo linkage validation) and `creativeFilename`
 * (download filename composition).
 *
 * Static template presets, the `Platform_Format` registry, and theme/tier
 * resolution live in `creative-templates.ts`; this module imports from it
 * rather than redefining any of that.
 */

import { logger } from "@/lib/observability";
import { ensureCreativeFonts } from "./creative-fonts";

import type {
  CreativeBgStyle,
  ImageSlot,
  PlatformFormat,
  ResolvedBox,
  ShapeSlot,
  TextSlot,
} from "./creative-templates";

/**
 * Minimal speaker shape the renderer depends on — matches the confirmed
 * `speakers` table columns used by the Creative_Generator (design.md's Data
 * Models section). Both `designation` and `title` exist as separate columns
 * on the real table; `title` is used preferentially with `designation` as
 * fallback, mirroring the badge system's `BadgeData.title` mapping
 * convention.
 */
export interface SpeakerLike {
  id: string;
  name: string;
  photo_url?: string | null;
  title?: string | null;
  designation?: string | null;
  company?: string | null;
}

/**
 * Minimal sponsor shape the renderer depends on — matches the confirmed
 * `sponsors` table columns used by the Creative_Generator (design.md's Data
 * Models section). `tier_label` is the display label used when
 * `tier === "custom"`.
 */
export interface SponsorLike {
  id: string;
  name: string;
  logo_url?: string | null;
  tier: string;
  tier_label?: string | null;
}

/**
 * Minimal event-level data an Event_Promo creative renders from — no
 * speaker/sponsor entity, since the "subject" of the creative is the
 * event itself. `stats` is an ordered list of up to 4 value/label pairs
 * (e.g. `{ value: "6000+", label: "Attendees" }`) rendered into the
 * template's `statValueN`/`statLabelN` text slots in array order; extra
 * entries beyond 4 are ignored, and a template with fewer stat slots
 * than the caller supplied simply doesn't render the excess (mirrors
 * every other builder's "extra input, unused slot" tolerance).
 */
export interface EventPromoLike {
  id: string;
  title: string;
  /**
   * Lead-in line set above `title` in a two-tone headline, e.g. "India's
   * Largest" above "Virtual HR Summit".
   *
   * Separate from `title` rather than parsed out of it: which words carry the
   * emphasis is an editorial decision, and inferring the split from a
   * delimiter or word count would silently re-emphasize a headline whenever
   * the copy changed. Templates without a `textStackSlots` headline ignore it.
   */
  titleLead?: string | null;
  /** Small tracked eyebrow above the headline, e.g. "SUMMER EDITION". */
  editionLabel?: string | null;
  /** Optional secondary line — script-style headline on Invite Card
   *  templates ("You're Invited"), omitted entirely when absent. */
  tagline?: string | null;
  /** Human-readable date/time line, e.g. "23rd July, 2026". Omitted
   *  entirely when absent/empty rather than rendering a blank pill. */
  dateLabel?: string | null;
  /** CTA button label, e.g. "Register for FREE". Falls back to
   *  "Register Now" when absent so the button never renders empty. */
  ctaLabel?: string | null;
  /** Small wordmark/organizer logo shown near the top. Omitted entirely
   *  (no image element) when absent, mirroring `photo_url`/`logo_url`'s
   *  optional-omission convention elsewhere in this module. */
  wordmarkUrl?: string | null;
  stats?: Array<{ value: string; label: string }>;
}

/**
 * One independently-styled line inside a `text-stack` element.
 *
 * `letterSpacingPx` is applied by drawing character-by-character rather than
 * via `ctx.letterSpacing`, which Safari only gained in 17.4 — an export that
 * silently loses its tracking on one browser is worse than a slightly slower
 * draw. Used for the reference designs' small-caps edition eyebrow
 * ("SUMMER EDITION"), where tracking is the difference between the intended
 * look and a cramped smudge.
 */
export interface TextStackRun {
  text: string;
  fontFamily: string;
  fontWeight: number;
  /** Size at the target format, already scaled by the plan builder. */
  baseSizePx: number;
  color: string;
  /** Extra tracking in px at the target format. Defaults to 0. */
  letterSpacingPx?: number;
}

/** Procedural vector glyphs the renderer can draw. */
export type IconName = "calendar";

/**
 * What sits alongside an `adorned-text` line. Sizes are px at the target
 * format, already scaled by the plan builder.
 */
export type TextAdornment =
  /** A dot either side of the line. */
  | { style: "dots"; color: string; radiusPx: number; gapPx: number }
  /**
   * A vector glyph immediately before the line.
   *
   * Drawn from paths rather than shipped as a raster so it inherits the
   * template's colour and stays crisp at any export size — a 24px PNG icon
   * upscaled into a 1600px banner is visibly soft.
   */
  | { style: "leading-icon"; name: IconName; color: string; sizePx: number; strokeWidthPx: number; gapPx: number };

/**
 * One resolved, drawable unit. Produced by the plan builders (pure);
 * consumed by `drawPlan` (canvas-only).
 */
export type PlanElement =
  | { kind: "background"; style: CreativeBgStyle }
  | {
      kind: "image";
      role: "photo" | "logo" | "wordmark";
      url: string | null;
      box: ResolvedBox;
      shape: ImageSlot["shape"];
      placeholderInitial?: string;
    }
  | {
      kind: "text";
      key: TextSlot["key"];
      text: string;
      box: ResolvedBox;
      fontFamily: string;
      fontWeight: number;
      /**
       * Target-format-adjusted font size in px, computed at plan-build time
       * by scaling the template's authored `baseSizePx` against the target
       * format's short side. `fitText` shrinks it further only if needed to
       * fit `box`. Fixed at plan-build time (rather than at draw time) so
       * the value is consistent whether the plan is drawn to an off-screen
       * export canvas or a scaled-down live preview.
       */
      baseSizePx: number;
      color: string;
      align: TextSlot["align"];
    }
  | { kind: "divider"; x: number; y1: number; y2: number; color: string }
  | {
      /** A decorative filled/stroked shape (card, divider bar) — drawn
       *  from an Event_Promo template's `shapeSlots`, right after the
       *  background and before any image/text element (Requirement:
       *  Event_Promo decorative shapes). Never carries entity data. */
      kind: "shape";
      key: string;
      shape: ShapeSlot["shape"];
      box: ResolvedBox;
      fillColor: string;
      strokeColor?: string;
      strokeWidthPx?: number;
      cornerRadiusFactor: number;
      opacity: number;
      /** Normalized vertices for `shape: "polygon"` — see `ShapeSlot.points`. */
      points?: Array<[number, number]>;
    }
  | {
      /** A rounded capsule filled with `fillColor` and centered text —
       *  used by Event_Promo templates for the date chip and the CTA
       *  button (Requirement: Event_Promo pill/CTA elements). Drawn
       *  after every image/text element in plan order (base plans push
       *  pills last), so a pill always sits on top of the background. */
      kind: "pill";
      key: "datePill" | "ctaButton";
      box: ResolvedBox;
      fillColor: string;
      text: string;
      textColor: string;
      fontFamily: string;
      fontWeight: number;
      baseSizePx: number;
      /** 0..1 fraction of `box.height`, mirrors `PillSlot.cornerRadiusFactor`. */
      cornerRadiusFactor: number;
    }
  | {
      /**
       * A vertical stack of independently-styled lines, laid out and centered
       * as ONE block.
       *
       * Exists because a `text` element carries a single family/weight/size/
       * color, so a headline like the reference invite's — "India's Largest"
       * in charcoal above "Virtual HR Summit" in heavier purple — was
       * impossible to express. Authoring it as two `text` slots is not
       * equivalent: each would center independently inside its own box, so
       * the optical gap between the lines would drift as the copy length
       * changed, and neither would know the other's height.
       *
       * Fitting is proportional: when the stack overflows `box`, every run
       * shrinks by one shared factor rather than each fitting itself. The
       * size *ratio* between runs is a typographic decision by the template
       * author, so preserving it while scaling is the point.
       */
      kind: "text-stack";
      key: TextSlot["key"];
      box: ResolvedBox;
      runs: TextStackRun[];
      /** Vertical gap between consecutive runs, in px at the target format. */
      lineGapPx: number;
      align: TextSlot["align"];
    }
  | {
      /**
       * A single text line with an adornment measured against it and centered
       * as one unit — the reference invite's "• 23rd July, 2026 •" and the
       * hero banner's calendar-glyph-plus-date.
       *
       * Needs its own element kind rather than a `text` element plus separate
       * `shape` circles or a separate icon, because the adornment sits relative
       * to the text's *measured* width, which isn't known until draw time.
       * Authored percentages can only say "at 45% across", not "just outside
       * whatever this string turns out to be" — so an independently-positioned
       * adornment drifts away from short copy and collides with long copy. The
       * first version of the hero banner did exactly that: its calendar glyph
       * overlapped the date.
       *
       * Both adornment styles live on one element because they are the same
       * layout problem. Splitting them produced two positioning schemes, only
       * one of which was correct.
       */
      kind: "adorned-text";
      key: TextSlot["key"];
      box: ResolvedBox;
      text: string;
      fontFamily: string;
      fontWeight: number;
      baseSizePx: number;
      color: string;
      adornment: TextAdornment;
    }
  | {
      /**
       * A wax-seal-styled CTA: a notched deep-red plaque with an inset
       * lighter rule and centered label, standing in for the reference
       * invite's stamped seal.
       *
       * Distinct from `pill` because the silhouette isn't a capsule — it has
       * scalloped edges and a double border, and its label is optically
       * centered against the plaque rather than the bounding box.
       */
      kind: "seal";
      key: "ctaButton";
      box: ResolvedBox;
      text: string;
      fillColor: string;
      /** Inset rule + scallop highlight color. */
      accentColor: string;
      textColor: string;
      fontFamily: string;
      fontWeight: number;
      baseSizePx: number;
    }
  // ─── Creative_Customization variants (Task 5) ──────────────────────────
  // Every base-spec variant above remains byte-identical; the variants
  // below are only emitted by `decoratePlanWithCustomization` in
  // `creative-customization.ts`, and only when the corresponding config
  // field is present. Base-spec plans never contain these elements, so
  // Property 45 (Additivity_Invariant) is a structural guarantee.
  | {
      /** Full-canvas dim overlay drawn on top of the background element,
       *  strictly before every base image/text element (Property 43). */
      kind: "overlay-dim";
      color: string;
      /** 0..1 — already converted from the config's 0..100 by the
       *  decorator. */
      opacity: number;
    }
  | {
      /** Full-canvas linear gradient overlay (Requirement 5.3). */
      kind: "overlay-gradient";
      from: string;
      to: string;
      /** Radians — the decorator converts the config's degrees using the
       *  same `(degrees - 90) * π / 180` conversion the base spec's
       *  `drawBackground` uses for its gradient angles, so
       *  `drawOverlayGradient` never re-converts. */
      direction: number;
      /** 0..1. */
      opacity: number;
    }
  | {
      /** Rectangular blur applied to pixels ALREADY drawn below the plan
       *  cursor — scoped to `box` so subsequent image/text elements are
       *  never blurred (Requirement 5.4). */
      kind: "overlay-blur-region";
      box: ResolvedBox;
      blurRadiusPx: number;
    }
  | {
      /** Organizer-uploaded (or org-fallback) watermark logo drawn AFTER
       *  every base image/text element and BEFORE any border (Property
       *  43). `box` is already resolved to a square via
       *  `resolveWatermarkBox`. */
      kind: "watermark";
      url: string;
      box: ResolvedBox;
      /** 0..1. */
      opacity: number;
    }
  | {
      /** Outer stroked rounded-rect, always drawn last so it sits on top
       *  of every other element (Property 43). Optional drop shadow
       *  applied via `ctx.shadow*` before the stroke. */
      kind: "border";
      color: string;
      thicknessPx: number;
      cornerRadiusPx: number;
      dropShadow?: { color: string; offsetX: number; offsetY: number; blur: number };
    };

/** A fully resolved, ready-to-draw creative: target format + its elements. */
export interface RenderPlan {
  format: PlatformFormat;
  elements: PlanElement[];
}

import {
  resolveBackground,
  resolveAccentColor,
  reflowTemplate,
  tierAccentColor,
  type CreativeTemplate,
  type EventTheme,
  type PromoTextField,
  type PromoTextSource,
} from "./creative-templates";

/**
 * Applies a text slot's `transform` (e.g. `"uppercase"`) to a resolved text
 * value. Shared by `buildSpeakerPlan`/`buildSponsorPlan` so every text
 * element respects the template's authored transform (Requirement 2.1, 2.3,
 * 3.1, 3.4).
 */
function applyTransform(value: string, transform: TextSlot["transform"]): string {
  return transform === "uppercase" ? value.toUpperCase() : value;
}

/**
 * Resolves a composite slot's `PromoTextSource` to its display string, or
 * `""` when the bound field is absent or blank.
 *
 * Returning `""` rather than throwing or substituting a placeholder is what
 * lets callers drop the slot entirely — the module-wide convention that an
 * absent optional field renders as absence, never as an empty box or a
 * literal "undefined". Pure.
 */
function resolvePromoSource(source: PromoTextSource, promo: EventPromoLike): string {
  if (source.from === "literal") return source.text;
  if (source.from === "fields") {
    return source.fields
      .map((field) => readPromoField(field, promo))
      .filter((v) => v.length > 0)
      .join(source.join);
  }
  return readPromoField(source.field, promo);
}

/** Reads one `EventPromoLike` field as a trimmed string, `""` when absent. */
function readPromoField(field: PromoTextField, promo: EventPromoLike): string {
  const raw =
    field === "title"
      ? promo.title
      : field === "titleLead"
        ? promo.titleLead
        : field === "tagline"
          ? promo.tagline
          : field === "dateLabel"
            ? promo.dateLabel
            : field === "ctaLabel"
              ? promo.ctaLabel
              : promo.editionLabel;
  return (raw ?? "").trim();
}

/**
 * Scales a template's authored `baseSizePx` to a target Platform_Format,
 * preserving the visual size ratio between text and canvas across aspect
 * ratios. The scale factor is the ratio of the target format's short side
 * to the authored canvas's short side, so a 64px name authored on a
 * 1200x1200 canvas renders at 64px on a 1080x1080 Instagram Post, ~33px on
 * a 600x200 Email Banner, and ~57px on a 1080x1920 Instagram Story — all
 * proportional to how much vertical/horizontal breathing room the format
 * actually provides. Pure.
 */
function scaleTextSize(
  authoredBaseSizePx: number,
  authoredWidth: number,
  authoredHeight: number,
  format: PlatformFormat,
): number {
  const authoredShort = Math.min(authoredWidth, authoredHeight);
  const targetShort = Math.min(format.width, format.height);
  return Math.max(10, authoredBaseSizePx * (targetShort / authoredShort));
}

/**
 * Scales a non-font authored measurement — a stroke width, a dot radius, a gap,
 * letter tracking — to the target format.
 *
 * Separate from `scaleTextSize` specifically because of that function's
 * `Math.max(10, …)` floor. Ten pixels is a sensible minimum for a *font size*,
 * where anything smaller is illegible, but applying it to other metrics is
 * actively wrong: a 2px icon stroke becomes 10px and the glyph fills in solid,
 * a 7px dot becomes 10px, and 5px of tracking becomes 10px. Reusing
 * `scaleTextSize` here produced exactly that — the hero banner's calendar
 * rendered as a white blob and its eyebrow was tracked twice as wide as
 * designed.
 *
 * The floor here is a fraction of a pixel: enough that a hairline never rounds
 * away to nothing, small enough to never inflate a thin detail.
 */
function scaleMetric(
  authoredPx: number,
  authoredWidth: number,
  authoredHeight: number,
  format: PlatformFormat,
): number {
  const authoredShort = Math.min(authoredWidth, authoredHeight);
  const targetShort = Math.min(format.width, format.height);
  return Math.max(0.25, authoredPx * (targetShort / authoredShort));
}

/**
 * Builds the photo `PlanElement` for a speaker: the real photo when
 * `speaker.photo_url` is present, otherwise the placeholder-initial fallback
 * (Requirement 2.2). Shared by `buildSpeakerPlan` and `buildComboPlan` so the
 * fallback logic has one implementation.
 */
function buildPhotoElement(speaker: SpeakerLike, shape: ImageSlot["shape"], box: ResolvedBox): PlanElement {
  if (speaker.photo_url) {
    return {
      kind: "image",
      role: "photo",
      url: speaker.photo_url,
      box,
      shape,
    };
  }

  const trimmedName = speaker.name.trim();
  return {
    kind: "image",
    role: "photo",
    url: null,
    box,
    shape,
    placeholderInitial: (trimmedName[0] || "?").toUpperCase(),
  };
}

/**
 * Builds a pure `RenderPlan` for a Speaker_Creative: resolves the template's
 * background against the event theme, reflows every slot to the target
 * `Platform_Format`'s pixel dimensions, and emits a photo element (or a
 * placeholder-initial fallback when `speaker.photo_url` is missing,
 * Requirement 2.2) plus name/title/company text elements — omitting
 * title/company entirely when absent rather than rendering empty text
 * (Requirement 2.3). Never throws on missing optional fields. Pure — no DOM,
 * no image loading, no side effects; the photo `url` is carried through
 * unmodified for `drawPlan` to draw later (Requirement 2.4).
 */
export function buildSpeakerPlan(
  speaker: SpeakerLike,
  template: CreativeTemplate,
  format: PlatformFormat,
  theme: EventTheme
): RenderPlan {
  const reflowed = reflowTemplate(template, format);
  const resolvedBackground = resolveBackground(template, theme);

  const elements: PlanElement[] = [{ kind: "background", style: resolvedBackground }];

  const photoSlot = template.imageSlots.photo;
  if (photoSlot) {
    const box = reflowed.imageSlots.photo;
    elements.push(buildPhotoElement(speaker, photoSlot.shape, box));
  }

  const textValues: Partial<Record<TextSlot["key"], string | null>> = {
    name: speaker.name,
    title: speaker.title || speaker.designation || null,
    company: speaker.company || null,
  };

  for (const key of ["name", "title", "company"] as const) {
    const slot = template.textSlots.find((s) => s.key === key);
    if (!slot) continue;

    const value = textValues[key];
    if (!value) continue;

    elements.push({
      kind: "text",
      key,
      text: applyTransform(value, slot.transform),
      box: reflowed.textSlots[key],
      fontFamily: slot.fontFamily,
      fontWeight: slot.fontWeight,
      baseSizePx: scaleTextSize(slot.baseSizePx, template.authoredWidth, template.authoredHeight, format),
      color: resolveAccentColor(template, key, theme),
      align: slot.align,
    });
  }

  if (template.divider) {
    const { xPct, yPct1, yPct2, color } = template.divider;
    elements.push({
      kind: "divider",
      x: (xPct / 100) * format.width,
      y1: (yPct1 / 100) * format.height,
      y2: (yPct2 / 100) * format.height,
      color,
    });
  }

  return { format, elements };
}

/**
 * Builds the logo `PlanElement` for a sponsor: the real logo when
 * `sponsor.logo_url` is present, otherwise a styled sponsor-name text
 * fallback rendered in the logo's box (Requirement 3.2). Shared by
 * `buildSponsorPlan` and `buildComboPlan` so the fallback logic has one
 * implementation.
 */
function buildLogoElement(
  sponsor: SponsorLike,
  template: CreativeTemplate,
  format: PlatformFormat,
  theme: EventTheme,
  shape: ImageSlot["shape"],
  box: ResolvedBox
): PlanElement {
  if (sponsor.logo_url) {
    return {
      kind: "image",
      role: "logo",
      url: sponsor.logo_url,
      box,
      shape,
    };
  }

  const sponsorNameSlot = template.textSlots.find((s) => s.key === "sponsorName");
  return {
    kind: "text",
    key: "sponsorName",
    text: sponsor.name,
    box,
    fontFamily: sponsorNameSlot?.fontFamily ?? "Poppins",
    fontWeight: 700,
    baseSizePx: scaleTextSize(
      sponsorNameSlot?.baseSizePx ?? 40,
      template.authoredWidth,
      template.authoredHeight,
      format,
    ),
    color: resolveAccentColor(template, "sponsorName", theme),
    align: "center",
  };
}

/**
 * Builds a pure `RenderPlan` for a Sponsor_Creative: resolves the template's
 * background against the event theme, reflows every slot to the target
 * `Platform_Format`'s pixel dimensions, and emits a logo element (or a
 * styled sponsor-name text fallback in the logo's box when
 * `sponsor.logo_url` is missing, Requirement 3.2) plus sponsorName/tierBadge
 * text elements, with the tier badge always colored via `tierAccentColor`
 * rather than the theme (Requirement 3.4). Never throws on missing optional
 * fields. Pure — no DOM, no image loading, no side effects.
 */
export function buildSponsorPlan(
  sponsor: SponsorLike,
  template: CreativeTemplate,
  format: PlatformFormat,
  theme: EventTheme
): RenderPlan {
  const reflowed = reflowTemplate(template, format);
  const resolvedBackground = resolveBackground(template, theme);

  const elements: PlanElement[] = [{ kind: "background", style: resolvedBackground }];

  const logoSlot = template.imageSlots.logo;
  if (logoSlot) {
    const box = reflowed.imageSlots.logo;
    elements.push(buildLogoElement(sponsor, template, format, theme, logoSlot.shape, box));
  }

  for (const key of ["sponsorName", "tierBadge"] as const) {
    const slot = template.textSlots.find((s) => s.key === key);
    if (!slot) continue;

    const value =
      key === "sponsorName"
        ? sponsor.name
        : sponsor.tier === "custom"
          ? sponsor.tier_label || "Sponsor"
          : sponsor.tier.toUpperCase();

    elements.push({
      kind: "text",
      key,
      text: applyTransform(value, slot.transform),
      box: reflowed.textSlots[key],
      fontFamily: slot.fontFamily,
      fontWeight: slot.fontWeight,
      baseSizePx: scaleTextSize(slot.baseSizePx, template.authoredWidth, template.authoredHeight, format),
      color: key === "tierBadge" ? tierAccentColor(sponsor.tier) : resolveAccentColor(template, key, theme),
      align: slot.align,
    });
  }

  return { format, elements };
}

/**
 * Thrown by `assertComboEligible` when a Combo_Creative request references a
 * speaker and/or sponsor that isn't linked to the event (Requirement 4.3).
 */
export class ComboEntityNotLinkedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ComboEntityNotLinkedError";
  }
}

/**
 * Validates a Combo_Creative request against the event's linked speaker/
 * sponsor id sets, throwing `ComboEntityNotLinkedError` with a descriptive
 * message when either the speaker or the sponsor (or both) is not linked to
 * the event (Requirement 4.3). Pure and synchronous — the caller is
 * responsible for fetching `eventSpeakerIds`/`eventSponsorIds` from Supabase
 * beforehand and passing them in as sets. No-op (returns void) when both
 * entities are linked.
 */
export function assertComboEligible(
  speakerId: string,
  sponsorId: string,
  eventSpeakerIds: ReadonlySet<string>,
  eventSponsorIds: ReadonlySet<string>
): void {
  const speakerLinked = eventSpeakerIds.has(speakerId);
  const sponsorLinked = eventSponsorIds.has(sponsorId);

  if (!speakerLinked && !sponsorLinked) {
    throw new ComboEntityNotLinkedError(
      "Neither the selected speaker nor the selected sponsor is assigned to this event."
    );
  }
  if (!speakerLinked) {
    throw new ComboEntityNotLinkedError("The selected speaker is not assigned to this event.");
  }
  if (!sponsorLinked) {
    throw new ComboEntityNotLinkedError("The selected sponsor is not assigned to this event.");
  }
}

/**
 * Builds a pure `RenderPlan` for a Combo_Creative: resolves the template's
 * background against the event theme, reflows every slot to the target
 * `Platform_Format`'s pixel dimensions, and composes the speaker's photo
 * (or placeholder-initial fallback) and name, the sponsor's logo (or
 * styled-name fallback) and name, a "presented by" label, and a divider
 * element visually separating the speaker and sponsor sections (Requirements
 * 4.1, 4.2). Never throws on missing optional fields. Pure — no DOM, no
 * image loading, no side effects.
 *
 * Eligibility (whether `speaker`/`sponsor` are actually linked to the event)
 * is NOT checked here — that is the caller's responsibility via
 * `assertComboEligible`, called separately before this function.
 */
export function buildComboPlan(
  speaker: SpeakerLike,
  sponsor: SponsorLike,
  template: CreativeTemplate,
  format: PlatformFormat,
  theme: EventTheme
): RenderPlan {
  const reflowed = reflowTemplate(template, format);
  const resolvedBackground = resolveBackground(template, theme);

  const elements: PlanElement[] = [{ kind: "background", style: resolvedBackground }];

  const speakerPhotoSlot = template.imageSlots.speakerPhoto;
  if (speakerPhotoSlot) {
    const box = reflowed.imageSlots.speakerPhoto;
    elements.push(buildPhotoElement(speaker, speakerPhotoSlot.shape, box));
  }

  const sponsorLogoSlot = template.imageSlots.sponsorLogo;
  if (sponsorLogoSlot) {
    const box = reflowed.imageSlots.sponsorLogo;
    elements.push(buildLogoElement(sponsor, template, format, theme, sponsorLogoSlot.shape, box));
  }

  const textValues: Record<"name" | "presentedBy" | "sponsorName", string> = {
    name: speaker.name,
    presentedBy: "presented by",
    sponsorName: sponsor.name,
  };

  for (const key of ["name", "presentedBy", "sponsorName"] as const) {
    const slot = template.textSlots.find((s) => s.key === key);
    if (!slot) continue;

    elements.push({
      kind: "text",
      key,
      text: applyTransform(textValues[key], slot.transform),
      box: reflowed.textSlots[key],
      fontFamily: slot.fontFamily,
      fontWeight: slot.fontWeight,
      baseSizePx: scaleTextSize(slot.baseSizePx, template.authoredWidth, template.authoredHeight, format),
      color: resolveAccentColor(template, key, theme),
      align: slot.align,
    });
  }

  if (template.divider) {
    const { xPct, yPct1, yPct2, color } = template.divider;
    elements.push({
      kind: "divider",
      x: (xPct / 100) * format.width,
      y1: (yPct1 / 100) * format.height,
      y2: (yPct2 / 100) * format.height,
      color,
    });
  }

  return { format, elements };
}

/**
 * Builds a pure `RenderPlan` for an Event_Promo creative: resolves the
 * template's background against the event theme, reflows every slot
 * (image/text/pill) to the target `Platform_Format`'s pixel dimensions,
 * and emits an optional wordmark image element, the event title / tagline
 * / date-label text elements (each omitted when the corresponding
 * `EventPromoLike` field is absent, matching every other builder's
 * omit-when-empty convention), up to 4 stat value/label text pairs (in
 * `promo.stats` array order, matched to the template's `statValueN`/
 * `statLabelN` slots), and pill elements for the date chip and CTA
 * button. Never throws on missing optional fields. Pure — no DOM, no
 * image loading, no side effects.
 */
export function buildEventPlan(
  promo: EventPromoLike,
  template: CreativeTemplate,
  format: PlatformFormat,
  theme: EventTheme
): RenderPlan {
  const reflowed = reflowTemplate(template, format);
  const resolvedBackground = resolveBackground(template, theme);

  const elements: PlanElement[] = [{ kind: "background", style: resolvedBackground }];

  // Decorative shapes (cards, divider bars) draw immediately after the
  // background and before any image/text element, so they read as part
  // of the backdrop rather than sitting on top of a photo/logo. Shapes
  // are unconditional — a template that defines shapeSlots always draws
  // them, since they carry no entity data to be "missing" (Requirement:
  // Event_Promo decorative shapes).
  for (const shapeSlot of template.shapeSlots ?? []) {
    elements.push({
      kind: "shape",
      key: shapeSlot.key,
      shape: shapeSlot.shape,
      box: reflowed.shapeSlots[shapeSlot.key],
      fillColor: shapeSlot.fillColor,
      strokeColor: shapeSlot.strokeColor,
      // Scaled rather than passed through: an authored stroke is a proportion
      // of the design, so an unscaled 14px motif ring outline would read as a
      // hairline on a 4000px export and as a heavy band on a 600px one.
      strokeWidthPx:
        shapeSlot.strokeWidthPx === undefined
          ? undefined
          : scaleMetric(
              shapeSlot.strokeWidthPx,
              template.authoredWidth,
              template.authoredHeight,
              format,
            ),
      cornerRadiusFactor: shapeSlot.cornerRadiusFactor ?? 0,
      opacity: shapeSlot.opacity ?? 1,
      points: shapeSlot.points,
    });
  }

  const wordmarkSlot = template.imageSlots.wordmark;
  if (wordmarkSlot && promo.wordmarkUrl) {
    elements.push({
      kind: "image",
      role: "wordmark",
      url: promo.wordmarkUrl,
      box: reflowed.imageSlots.wordmark,
      shape: wordmarkSlot.shape,
    });
  }

  const textValues: Partial<Record<TextSlot["key"], string | null | undefined>> = {
    eventTitle: promo.title,
    eventTagline: promo.tagline,
    dateLabel: promo.dateLabel,
  };
  const stats = promo.stats ?? [];
  for (let i = 0; i < Math.min(4, stats.length); i += 1) {
    const n = i + 1;
    textValues[`statValue${n}` as TextSlot["key"]] = stats[i].value;
    textValues[`statLabel${n}` as TextSlot["key"]] = stats[i].label;
  }

  const textKeys: TextSlot["key"][] = [
    "eventTitle",
    "eventTagline",
    "dateLabel",
    "statValue1",
    "statLabel1",
    "statValue2",
    "statLabel2",
    "statValue3",
    "statLabel3",
    "statValue4",
    "statLabel4",
  ];
  for (const key of textKeys) {
    const slot = template.textSlots.find((s) => s.key === key);
    if (!slot) continue;

    const value = textValues[key];
    if (!value) continue;

    elements.push({
      kind: "text",
      key,
      text: applyTransform(value, slot.transform),
      box: reflowed.textSlots[key],
      fontFamily: slot.fontFamily,
      fontWeight: slot.fontWeight,
      baseSizePx: scaleTextSize(slot.baseSizePx, template.authoredWidth, template.authoredHeight, format),
      color: resolveAccentColor(template, key, theme),
      align: slot.align,
    });
  }

  // Date pill — only when the template defines the slot AND the promo
  // has a date label; an empty pill would just be a floating colored
  // capsule with nothing in it.
  const datePillSlot = template.pillSlots?.find((p) => p.key === "datePill");
  if (datePillSlot && promo.dateLabel) {
    elements.push({
      kind: "pill",
      key: "datePill",
      box: reflowed.pillSlots.datePill,
      fillColor: datePillSlot.fillColor,
      text: promo.dateLabel,
      textColor: datePillSlot.textColor,
      fontFamily: datePillSlot.fontFamily,
      fontWeight: datePillSlot.fontWeight,
      baseSizePx: scaleTextSize(datePillSlot.baseSizePx, template.authoredWidth, template.authoredHeight, format),
      cornerRadiusFactor: datePillSlot.cornerRadiusFactor,
    });
  }

  // ── Composite slots ──────────────────────────────────────────────────
  // These bind to promo data explicitly via `PromoTextSource` rather than
  // implicitly through a key union, so a slot can mix static template chrome
  // with organizer fields. See `PromoTextSource` for why.

  for (const stackSlot of template.textStackSlots ?? []) {
    const runs: TextStackRun[] = [];
    for (const spec of stackSlot.runs) {
      const raw = resolvePromoSource(spec.source, promo);
      // An absent field drops just its run, leaving the rest of the block to
      // close up — so a promo with no `titleLead` renders a clean one-line
      // headline rather than a gap where the lead would have been.
      if (!raw) continue;
      runs.push({
        text: applyTransform(raw, spec.transform),
        fontFamily: spec.fontFamily,
        fontWeight: spec.fontWeight,
        baseSizePx: scaleTextSize(
          spec.baseSizePx,
          template.authoredWidth,
          template.authoredHeight,
          format,
        ),
        color: spec.color,
        letterSpacingPx:
          spec.letterSpacingPx === undefined
            ? undefined
            : scaleMetric(
                spec.letterSpacingPx,
                template.authoredWidth,
                template.authoredHeight,
                format,
              ),
      });
    }
    if (runs.length === 0) continue;
    elements.push({
      kind: "text-stack",
      key: "eventTitle",
      box: reflowed.textStackSlots[stackSlot.key],
      runs,
      lineGapPx: scaleMetric(
        stackSlot.lineGapPx,
        template.authoredWidth,
        template.authoredHeight,
        format,
      ),
      align: stackSlot.align,
    });
  }

  for (const adorned of template.adornedTextSlots ?? []) {
    const value = resolvePromoSource(adorned.source, promo);
    if (!value) continue;
    // Font size uses the legibility-floored scaler; every other metric uses
    // `scaleMetric`, whose floor is sub-pixel. Mixing them up is what turned
    // the calendar glyph into a solid blob.
    const metric = (authored: number) =>
      scaleMetric(authored, template.authoredWidth, template.authoredHeight, format);
    const spec = adorned.adornment;
    elements.push({
      kind: "adorned-text",
      key: "dateLabel",
      box: reflowed.adornedTextSlots[adorned.key],
      text: value,
      fontFamily: adorned.fontFamily,
      fontWeight: adorned.fontWeight,
      baseSizePx: scaleTextSize(
        adorned.baseSizePx,
        template.authoredWidth,
        template.authoredHeight,
        format,
      ),
      color: adorned.color,
      adornment:
        spec.style === "dots"
          ? {
              style: "dots",
              color: spec.color,
              radiusPx: metric(spec.radiusPx),
              gapPx: metric(spec.gapPx),
            }
          : {
              style: "leading-icon",
              name: spec.name,
              color: spec.color,
              sizePx: metric(spec.sizePx),
              strokeWidthPx: metric(spec.strokeWidthPx),
              gapPx: metric(spec.gapPx),
            },
    });
  }

  for (const seal of template.sealSlots ?? []) {
    elements.push({
      kind: "seal",
      key: "ctaButton",
      box: reflowed.sealSlots[seal.key],
      // Same never-empty fallback as the CTA pill below: a promo creative
      // exists to drive a registration, so its CTA always has a label.
      text: resolvePromoSource(seal.source, promo) || "Register Now",
      fillColor: seal.fillColor,
      accentColor: seal.accentColor,
      textColor: seal.textColor,
      fontFamily: seal.fontFamily,
      fontWeight: seal.fontWeight,
      baseSizePx: scaleTextSize(
        seal.baseSizePx,
        template.authoredWidth,
        template.authoredHeight,
        format,
      ),
    });
  }

  // CTA button — always rendered when the template defines the slot;
  // falls back to "Register Now" so the button is never empty (a promo
  // creative's whole point is to drive a registration action).
  const ctaSlot = template.pillSlots?.find((p) => p.key === "ctaButton");
  if (ctaSlot) {
    elements.push({
      kind: "pill",
      key: "ctaButton",
      box: reflowed.pillSlots.ctaButton,
      fillColor: ctaSlot.fillColor,
      text: promo.ctaLabel || "Register Now",
      textColor: ctaSlot.textColor,
      fontFamily: ctaSlot.fontFamily,
      fontWeight: ctaSlot.fontWeight,
      baseSizePx: scaleTextSize(ctaSlot.baseSizePx, template.authoredWidth, template.authoredHeight, format),
      cornerRadiusFactor: ctaSlot.cornerRadiusFactor,
    });
  }

  return { format, elements };
}

/**
 * Given a slot's anchor+max box and an image's native pixel size, computes
 * the final draw box: uniformly scaled to FIT within the slot while
 * preserving aspect ratio (upscaling small logos so they actually fill the
 * available space, downscaling large ones so they don't overflow), never
 * non-uniformly stretched (Requirement 3.3). The resulting box is centered
 * within `slot`. Pure. Property 4.
 *
 * Rationale for allowing upscale: the previous "never upscale" rule meant
 * a 200×100 sponsor logo dropped into a 600×360 slot rendered at 200×100
 * with 400+ px of empty slot around it. That's what the fallback text
 * element in `buildLogoElement` exists to avoid — but for actual images we
 * want to fill the designated space. Modern PNG/SVG logos scale up cleanly
 * to typical Platform_Format sizes; upscaling artifacts are visually
 * preferable to a tiny centered logo swimming in whitespace.
 *
 * Degenerate case: when `naturalWidth` or `naturalHeight` is `0`, returns a
 * zero-size box centered at the slot's center rather than dividing by zero
 * or producing `NaN`.
 */
export function nativeSizedLogoBox(slot: ResolvedBox, naturalWidth: number, naturalHeight: number): ResolvedBox {
  if (naturalWidth === 0 || naturalHeight === 0) {
    return {
      x: slot.x + slot.width / 2,
      y: slot.y + slot.height / 2,
      width: 0,
      height: 0,
    };
  }

  const scale = Math.min(slot.width / naturalWidth, slot.height / naturalHeight);
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;

  return {
    x: slot.x + (slot.width - width) / 2,
    y: slot.y + (slot.height - height) / 2,
    width,
    height,
  };
}

// ─── Text fitting (Property 10) ─────────────────────────────────────────────

/** Result of `fitText`: the wrapped lines and the font size they were fit at. */
export interface FitResult {
  lines: string[];
  fontSizePx: number;
}

/**
 * Line height as a multiple of font size — a reasonable default across most
 * fonts, used to convert a font size into a per-line height for the height
 * invariant check.
 */
const LINE_HEIGHT_FACTOR = 1.2;

/**
 * Never shrink text below this size — smaller text becomes illegible. Once
 * this floor is hit and the text still doesn't fit, `fitText` falls back to
 * ellipsis truncation instead of shrinking further (design.md's Error
 * Handling section).
 */
const MIN_FONT_SIZE_PX = 10;

/** Multiplicative step used to shrink the font size between fit attempts. */
const SHRINK_STEP = 0.9;

/**
 * Greedily word-wraps `text` into lines that each measure within
 * `box.width` at `fontSizePx`, using the injected `measure` function. Words
 * are split on whitespace; a single word wider than `box.width` on its own
 * is still placed alone on its own line (character-level splitting is out of
 * scope — see the width-invariant caveat on `fitText`).
 */
function wrapWords(
  text: string,
  maxWidth: number,
  fontSizePx: number,
  measure: (text: string, fontSizePx: number) => number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const candidate = `${currentLine} ${word}`;
    if (measure(candidate, fontSizePx) <= maxWidth) {
      currentLine = candidate;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  lines.push(currentLine);

  return lines;
}

/** Whether every line in `lines` measures within `maxWidth` at `fontSizePx`. */
function allLinesFitWidth(
  lines: string[],
  maxWidth: number,
  fontSizePx: number,
  measure: (text: string, fontSizePx: number) => number
): boolean {
  return lines.every((line) => measure(line, fontSizePx) <= maxWidth);
}

/** Whether `lineCount` lines at `fontSizePx` fit within `maxHeight`. */
function fitsHeight(lineCount: number, fontSizePx: number, maxHeight: number): boolean {
  return lineCount * fontSizePx * LINE_HEIGHT_FACTOR <= maxHeight;
}

/**
 * Truncates `text` with a trailing ellipsis so the result measures within
 * `maxWidth` at `fontSizePx`, using the injected `measure` function.
 * Iteratively shortens from the end. Returns an empty string if even a bare
 * "…" doesn't fit (degenerate zero/near-zero width box).
 */
function truncateWithEllipsis(
  text: string,
  maxWidth: number,
  fontSizePx: number,
  measure: (text: string, fontSizePx: number) => number
): string {
  if (measure(text, fontSizePx) <= maxWidth) return text;

  for (let length = text.length - 1; length >= 0; length--) {
    const candidate = `${text.slice(0, length)}…`;
    if (measure(candidate, fontSizePx) <= maxWidth) {
      return candidate;
    }
  }

  return measure("…", maxWidth) <= maxWidth ? "…" : "";
}

/**
 * Given text, a box (px), a starting font size, and a `measureText`-style
 * function, returns wrapped lines and a (possibly shrunk) font size such
 * that every line's measured width is within `box.width` and the total
 * wrapped height (`lines.length * fontSizePx * LINE_HEIGHT_FACTOR`) is
 * within `box.height`. Pure given `measure`, so it's testable without a real
 * canvas using a deterministic mock measurer (e.g.
 * `width = text.length * fontSizePx * 0.55`). Property 10.
 *
 * Algorithm: try wrapping at `baseSizePx`; if the wrapped lines don't fit
 * within `box.height` (or, degenerately, a line doesn't fit `box.width` —
 * see the caveat below), shrink the font size by `SHRINK_STEP` and re-wrap,
 * repeating until it fits or the size reaches `MIN_FONT_SIZE_PX`. If it
 * still doesn't fit at the floor size, falls back to truncating the text
 * with an ellipsis (design.md's Error Handling section) — capping the
 * result to however many lines fit within `box.height` at
 * `MIN_FONT_SIZE_PX` (at least 1). Terminates for all inputs: the shrink
 * loop is bounded by `MIN_FONT_SIZE_PX`, and the truncation loop is bounded
 * by `text.length`.
 *
 * Known limitation (documented per design.md): a single word wider than
 * `box.width` on its own is still placed alone on its own line rather than
 * being split at the character level, so the WIDTH invariant may not hold
 * exactly for that line even at `MIN_FONT_SIZE_PX` — this is an accepted
 * scope limitation (character-level splitting is out of scope for typical
 * short strings like names/titles). The HEIGHT invariant
 * (`lines.length * fontSizePx * LINE_HEIGHT_FACTOR <= box.height`) always
 * holds exactly, including in the ellipsis-truncation fallback, which is
 * the guarantee Requirement 10.2 actually depends on (text never extends
 * beyond the canvas vertically).
 */
export function fitText(
  text: string,
  box: ResolvedBox,
  baseSizePx: number,
  measure: (text: string, fontSizePx: number) => number
): FitResult {
  if (text.trim().length === 0) {
    return { lines: [], fontSizePx: baseSizePx };
  }

  if (box.width <= 0 || box.height <= 0) {
    return { lines: [], fontSizePx: MIN_FONT_SIZE_PX };
  }

  let fontSizePx = baseSizePx;

  while (true) {
    const lines = wrapWords(text, box.width, fontSizePx, measure);

    if (fitsHeight(lines.length, fontSizePx, box.height) && allLinesFitWidth(lines, box.width, fontSizePx, measure)) {
      return { lines, fontSizePx };
    }

    if (fontSizePx <= MIN_FONT_SIZE_PX) {
      break;
    }

    fontSizePx = Math.max(MIN_FONT_SIZE_PX, fontSizePx * SHRINK_STEP);
  }

  // Floor size reached and it still doesn't fit — fall back to truncating
  // with an ellipsis. The caller with `key` context (drawPlan) is
  // responsible for logging `logger.warn("creative text truncated", ...)`;
  // this function has no `key` parameter and stays side-effect free.
  const maxLines = Math.max(1, Math.floor(box.height / (MIN_FONT_SIZE_PX * LINE_HEIGHT_FACTOR)));
  const truncated = truncateWithEllipsis(text, box.width, MIN_FONT_SIZE_PX, measure);

  return { lines: [truncated].slice(0, maxLines), fontSizePx: MIN_FONT_SIZE_PX };
}

// ─── Text stack fitting ─────────────────────────────────────────────────────

/** One run's resolved lines and the size they were fit at. */
export interface FittedStackRun {
  lines: string[];
  fontSizePx: number;
  color: string;
  fontFamily: string;
  fontWeight: number;
  letterSpacingPx: number;
}

/** Result of `fitTextStack`: per-run lines plus the block's total height. */
export interface StackFitResult {
  runs: FittedStackRun[];
  /** Total block height in px, guaranteed `<= box.height`. */
  totalHeightPx: number;
  /** The shared factor every run's authored size was multiplied by. */
  scale: number;
}

/**
 * Lays out a `text-stack`'s runs into a single block that fits `box`.
 *
 * The runs shrink together by one shared `scale` rather than each fitting
 * itself independently. That is the whole reason this function exists instead
 * of calling `fitText` per run: the ratio between "India's Largest" at 44px
 * and "Virtual HR Summit" at 64px encodes the design's typographic hierarchy,
 * and per-run fitting would collapse the two toward each other whenever one
 * happened to be the longer string — producing a headline where the emphasis
 * silently moves depending on the copy.
 *
 * Guarantees, mirroring `fitText`'s contract:
 *  - `totalHeightPx <= box.height` always holds exactly, so a stack never
 *    bleeds vertically out of its box.
 *  - Each line's measured width is within `box.width`, modulo the same
 *    single-unbreakable-word caveat `fitText` documents.
 *
 * Pure given `measure`, so it is testable without a canvas.
 */
export function fitTextStack(
  runs: readonly TextStackRun[],
  box: ResolvedBox,
  lineGapPx: number,
  measure: (text: string, fontSizePx: number, run: TextStackRun) => number,
): StackFitResult {
  const usable = runs.filter((r) => r.text.trim().length > 0);
  if (usable.length === 0 || box.width <= 0 || box.height <= 0) {
    return { runs: [], totalHeightPx: 0, scale: 1 };
  }

  let scale = 1;

  for (;;) {
    const laid = usable.map((run) => {
      const fontSizePx = Math.max(MIN_FONT_SIZE_PX, run.baseSizePx * scale);
      const lines = wrapWords(run.text, box.width, fontSizePx, (t, size) =>
        measure(t, size, run),
      );
      return { run, fontSizePx, lines };
    });

    const gap = lineGapPx * scale;
    const totalHeightPx =
      laid.reduce((sum, l) => sum + l.lines.length * l.fontSizePx * LINE_HEIGHT_FACTOR, 0) +
      gap * Math.max(0, laid.length - 1);

    const everyLineFits = laid.every((l) =>
      allLinesFitWidth(l.lines, box.width, l.fontSizePx, (t, size) => measure(t, size, l.run)),
    );

    const atFloor = laid.every((l) => l.fontSizePx <= MIN_FONT_SIZE_PX);

    if ((totalHeightPx <= box.height && everyLineFits) || atFloor) {
      return {
        runs: laid.map((l) => ({
          lines: l.lines,
          fontSizePx: l.fontSizePx,
          color: l.run.color,
          fontFamily: l.run.fontFamily,
          fontWeight: l.run.fontWeight,
          letterSpacingPx: (l.run.letterSpacingPx ?? 0) * scale,
        })),
        // Clamp so the height guarantee holds even in the at-floor case,
        // where the block genuinely cannot be made to fit. Reporting the
        // clamped value keeps callers' vertical centering inside the box;
        // the overflow is absorbed by drawing fewer lines than requested.
        totalHeightPx: Math.min(totalHeightPx, box.height),
        scale,
      };
    }

    scale *= SHRINK_STEP;
  }
}

// ─── Filenames (Property 11) ─────────────────────────────────────────────────

/** Fallback slug used when an input has no sanitizable characters left
 *  (e.g. it was entirely unicode, whitespace, or punctuation), so the final
 *  filename is never just `"-linkedin-post.png"` or `".png"`. */
const UNTITLED_SLUG = "untitled";

/**
 * Converts arbitrary text into a filesystem-safe slug: lowercased,
 * whitespace collapsed to single hyphens, every character that isn't a
 * lowercase ASCII letter/digit/hyphen stripped outright (not
 * transliterated — this deliberately drops unicode letters like "é"/"日"
 * along with filesystem-unsafe characters `/ \ : * ? " < > |` and any other
 * punctuation), consecutive hyphens collapsed, and leading/trailing hyphens
 * trimmed. Falls back to `"untitled"` when nothing sanitizable remains.
 * Pure. Used by `creativeFilename` (Property 11).
 */
function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || UNTITLED_SLUG;
}

/**
 * Composes a download filename for a rendered creative from the entity's
 * display name and the target `Platform_Format`'s label, e.g.
 * `creativeFilename("Jane Doe", { label: "LinkedIn Post", ... })` returns
 * `"jane-doe-linkedin-post.png"`. Both parts are sanitized via `slugify` so
 * the result contains none of the filesystem-unsafe characters
 * (`/ \ : * ? " < > |`) regardless of input, including unicode, punctuation,
 * or empty/whitespace-only strings. Pure. Property 11.
 */
export function creativeFilename(entityName: string, format: PlatformFormat): string {
  const namePart = slugify(entityName) || UNTITLED_SLUG;
  const formatPart = slugify(format.label);

  return `${namePart}-${formatPart}.png`;
}

// ─── Canvas drawing (imperative) ────────────────────────────────────────────

/**
 * Loads an image from `url` for canvas drawing. Sets `crossOrigin =
 * "anonymous"` so `canvas.toBlob()` doesn't taint the canvas when the image
 * comes from a cross-origin host (e.g. Supabase Storage's `site-assets`
 * public URLs). Never rejects — resolves `null` on load failure (`onerror`)
 * so callers can fall back to a placeholder rather than having to wrap every
 * call in a try/catch (design's Error Handling section).
 */
function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Draws `img` into `box` using a "cover" crop (fills the box entirely,
 * cropping the image's longer dimension so aspect ratio is preserved), then
 * clips to `shape` first when it isn't a plain `"rect"`. Only geometric
 * transforms (crop/clip/position/scale) are applied here — never a
 * `ctx.filter` or pixel-value manipulation, per Requirement 2.4's
 * unmodified-composite guarantee.
 */
function drawImageCropped(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  box: ResolvedBox,
  shape: ImageSlot["shape"]
): void {
  const naturalWidth = img.naturalWidth || 1;
  const naturalHeight = img.naturalHeight || 1;

  const boxAspect = box.width / box.height;
  const imgAspect = naturalWidth / naturalHeight;

  let srcWidth = naturalWidth;
  let srcHeight = naturalHeight;
  let srcX = 0;
  let srcY = 0;

  if (imgAspect > boxAspect) {
    // Image is relatively wider than the box — crop the sides.
    srcWidth = naturalHeight * boxAspect;
    srcX = (naturalWidth - srcWidth) / 2;
  } else {
    // Image is relatively taller than the box — crop top/bottom.
    srcHeight = naturalWidth / boxAspect;
    srcY = (naturalHeight - srcHeight) / 2;
  }

  const needsClip = shape !== "rect";
  if (needsClip) {
    ctx.save();
    ctx.beginPath();
    if (shape === "circle") {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      const radius = Math.min(box.width, box.height) / 2;
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    } else {
      // "rounded-rect"
      const radius = Math.min(box.width, box.height) * 0.1;
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(box.x, box.y, box.width, box.height, radius);
      } else {
        // Manual rounded-rect path fallback for environments without
        // native `roundRect` support.
        const x = box.x;
        const y = box.y;
        const w = box.width;
        const h = box.height;
        ctx.moveTo(x + radius, y);
        ctx.arcTo(x + w, y, x + w, y + h, radius);
        ctx.arcTo(x + w, y + h, x, y + h, radius);
        ctx.arcTo(x, y + h, x, y, radius);
        ctx.arcTo(x, y, x + w, y, radius);
      }
    }
    ctx.clip();
  }

  ctx.drawImage(img, srcX, srcY, srcWidth, srcHeight, box.x, box.y, box.width, box.height);

  if (needsClip) {
    ctx.restore();
  }
}

/**
 * Draws a placeholder in place of a missing/failed image element: for
 * `role: "photo"` a muted-background circle/rect filled with the
 * `placeholderInitial` centered in the box; for `role: "logo"` a no-op
 * (logos without a `placeholderInitial` shouldn't normally reach `drawPlan`
 * as `image` elements — the plan builders substitute a `text` element
 * instead — this is a defensive fallback only).
 */
function drawImagePlaceholder(
  ctx: CanvasRenderingContext2D,
  box: ResolvedBox,
  role: "photo" | "logo" | "wordmark",
  placeholderInitial: string | undefined
): void {
  // Only "photo" elements ever carry a placeholderInitial (see
  // `buildPhotoElement`) — logos/wordmarks without a URL are represented
  // as text-fallback elements upstream, never reach this path with a
  // missing image, so this stays a no-op for both roles.
  if (role !== "photo" || !placeholderInitial) {
    return;
  }

  ctx.fillStyle = "#94a3b8";
  ctx.fillRect(box.x, box.y, box.width, box.height);

  const fontSizePx = box.height * 0.5;
  ctx.font = `700 ${fontSizePx}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(placeholderInitial, box.x + box.width / 2, box.y + box.height / 2);
}

/**
 * Draws the `background` element per its resolved `CreativeBgStyle`: solid
 * fill, linear gradient (angle converted to start/end coordinates across the
 * canvas), or a loaded image (`"cover"`/`"contain"` fit) — falling back to a
 * neutral fill + `logger.warn` when the background image fails to load.
 */
async function drawBackground(
  ctx: CanvasRenderingContext2D,
  style: CreativeBgStyle,
  width: number,
  height: number
): Promise<void> {
  if (style.type === "solid") {
    ctx.fillStyle = style.color;
    ctx.fillRect(0, 0, width, height);
    return;
  }

  if (style.type === "gradient") {
    const rad = ((style.angle - 90) * Math.PI) / 180;
    const x1 = width / 2 - (Math.cos(rad) * width) / 2;
    const y1 = height / 2 - (Math.sin(rad) * height) / 2;
    const x2 = width / 2 + (Math.cos(rad) * width) / 2;
    const y2 = height / 2 + (Math.sin(rad) * height) / 2;

    const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
    gradient.addColorStop(0, style.from);
    gradient.addColorStop(1, style.to);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    return;
  }

  // style.type === "image"
  const img = await loadImage(style.url);
  if (!img) {
    logger.warn("creative image load failed", { url: style.url, role: "background" });
    ctx.fillStyle = "#e2e8f0";
    ctx.fillRect(0, 0, width, height);
    return;
  }

  const naturalWidth = img.naturalWidth || 1;
  const naturalHeight = img.naturalHeight || 1;
  const canvasAspect = width / height;
  const imgAspect = naturalWidth / naturalHeight;

  if (style.fit === "cover") {
    let srcWidth = naturalWidth;
    let srcHeight = naturalHeight;
    let srcX = 0;
    let srcY = 0;

    if (imgAspect > canvasAspect) {
      srcWidth = naturalHeight * canvasAspect;
      srcX = (naturalWidth - srcWidth) / 2;
    } else {
      srcHeight = naturalWidth / canvasAspect;
      srcY = (naturalHeight - srcHeight) / 2;
    }

    ctx.drawImage(img, srcX, srcY, srcWidth, srcHeight, 0, 0, width, height);
  } else {
    // "contain" — fit within bounds preserving aspect ratio, letterboxed.
    ctx.fillStyle = "#e2e8f0";
    ctx.fillRect(0, 0, width, height);

    let drawWidth = width;
    let drawHeight = height;
    if (imgAspect > canvasAspect) {
      drawHeight = width / imgAspect;
    } else {
      drawWidth = height * imgAspect;
    }
    const drawX = (width - drawWidth) / 2;
    const drawY = (height - drawHeight) / 2;

    ctx.drawImage(img, 0, 0, naturalWidth, naturalHeight, drawX, drawY, drawWidth, drawHeight);
  }
}

/**
 * Draws an `image` element (photo or logo): loads `el.url` (when present),
 * falling back to the placeholder path on a `null` url or a load failure
 * (logging `logger.warn("creative image load failed", ...)` in the latter
 * case per the design's Error Handling section). Photos are drawn via
 * `drawImageCropped` (cover-crop + shape clip); logos are drawn at their
 * native size (never upscaled/stretched) via `nativeSizedLogoBox`. Only
 * geometric transforms are applied — no `ctx.filter`/color manipulation,
 * satisfying Requirements 2.4 and 3.3.
 */
async function drawImageElement(
  ctx: CanvasRenderingContext2D,
  el: Extract<PlanElement, { kind: "image" }>
): Promise<void> {
  const img = el.url ? await loadImage(el.url) : null;

  if (!img) {
    if (el.url) {
      logger.warn("creative image load failed", { url: el.url, role: el.role });
    }
    drawImagePlaceholder(ctx, el.box, el.role, el.placeholderInitial);
    return;
  }

  if (el.role === "photo") {
    drawImageCropped(ctx, img, el.box, el.shape);
    return;
  }

  // el.role === "logo" — native size, never upscaled/stretched.
  const drawBox = nativeSizedLogoBox(el.box, img.naturalWidth, img.naturalHeight);
  ctx.drawImage(img, drawBox.x, drawBox.y, drawBox.width, drawBox.height);
}

/**
 * Draws a `text` element: fits `el.text` within `el.box` via `fitText` (using
 * a real `ctx.measureText`-backed measurer), then draws each wrapped line
 * vertically centered within the box. Logs
 * `logger.warn("creative text truncated", ...)` when `fitText` fell back to
 * ellipsis truncation, since only `drawPlan` has the `el.key` context needed
 * for that log (design's Error Handling section).
 */
function drawTextElement(ctx: CanvasRenderingContext2D, el: Extract<PlanElement, { kind: "text" }>): void {
  // The plan builders already scaled the template's authored `baseSizePx`
  // to the target Platform_Format via `scaleTextSize`, so use it directly.
  // `fitText` will still shrink further via `SHRINK_STEP` if the text
  // doesn't fit `el.box` (e.g. very long names).
  const measure = (text: string, fontSizePx: number): number => {
    ctx.font = `${el.fontWeight} ${fontSizePx}px ${el.fontFamily}, sans-serif`;
    return ctx.measureText(text).width;
  };

  const fit = fitText(el.text, el.box, el.baseSizePx, measure);

  if (fit.lines.length === 0) {
    return;
  }

  if (fit.lines.some((line) => line.endsWith("…"))) {
    logger.warn("creative text truncated", {
      key: el.key,
      text_length: el.text.length,
      box_width: el.box.width,
      box_height: el.box.height,
    });
  }

  ctx.font = `${el.fontWeight} ${fit.fontSizePx}px ${el.fontFamily}, sans-serif`;
  ctx.fillStyle = el.color;
  ctx.textAlign = el.align;
  ctx.textBaseline = "middle";

  const lineHeight = fit.fontSizePx * LINE_HEIGHT_FACTOR;
  const totalHeight = fit.lines.length * lineHeight;
  const startY = el.box.y + el.box.height / 2 - totalHeight / 2 + lineHeight / 2;
  const x = el.align === "left" ? el.box.x : el.align === "right" ? el.box.x + el.box.width : el.box.x + el.box.width / 2;

  fit.lines.forEach((line, i) => {
    const y = startY + i * lineHeight;
    ctx.fillText(line, x, y);
  });
}

/** Draws a `divider` element: a vertical line at `el.x` spanning `el.y1..el.y2`. */
function drawDividerElement(ctx: CanvasRenderingContext2D, el: Extract<PlanElement, { kind: "divider" }>): void {
  ctx.strokeStyle = el.color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(el.x, el.y1);
  ctx.lineTo(el.x, el.y2);
  ctx.stroke();
}

/**
 * Draws a `shape` element: a filled and/or stroked rect/rounded-rect/
 * circle at `el.box`, per an Event_Promo template's `shapeSlots`
 * (decorative cards, divider bars). Reuses the same manual `arcTo`
 * rounded-rect fallback pattern as `drawImageCropped`/`drawBorder` for
 * engines without `ctx.roundRect`. A `fillColor` of `"transparent"`
 * skips the fill (stroke-only shapes, e.g. an outlined card).
 */
function drawShapeElement(ctx: CanvasRenderingContext2D, el: Extract<PlanElement, { kind: "shape" }>): void {
  const { x, y, width, height } = el.box;
  if (width <= 0 || height <= 0) return;

  ctx.save();
  ctx.globalAlpha = el.opacity;

  ctx.beginPath();
  if (el.shape === "polygon") {
    const points = el.points ?? [];
    // Fewer than 3 vertices can't enclose an area. Bail rather than draw a
    // degenerate sliver, so a malformed template shows a missing shape instead
    // of a stray hairline.
    if (points.length < 3) {
      ctx.restore();
      return;
    }
    points.forEach(([nx, ny], i) => {
      const px = x + nx * width;
      const py = y + ny * height;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
  } else if (el.shape === "circle") {
    const cx = x + width / 2;
    const cy = y + height / 2;
    const radius = Math.min(width, height) / 2;
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  } else if (el.shape === "rounded-rect") {
    const radius = Math.max(0, Math.min(0.5, el.cornerRadiusFactor)) * Math.min(width, height);
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, y, width, height, radius);
    } else {
      ctx.moveTo(x + radius, y);
      ctx.arcTo(x + width, y, x + width, y + height, radius);
      ctx.arcTo(x + width, y + height, x, y + height, radius);
      ctx.arcTo(x, y + height, x, y, radius);
      ctx.arcTo(x, y, x + width, y, radius);
    }
  } else {
    ctx.rect(x, y, width, height);
  }

  if (el.fillColor !== "transparent") {
    ctx.fillStyle = el.fillColor;
    ctx.fill();
  }
  if (el.strokeColor && el.strokeWidthPx && el.strokeWidthPx > 0) {
    ctx.strokeStyle = el.strokeColor;
    ctx.lineWidth = el.strokeWidthPx;
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Draws a `pill` element: a rounded capsule filled with `el.fillColor`
 * and centered text — the date chip / CTA button used by Event_Promo
 * templates. Reuses `drawImageCropped`'s manual arcTo rounded-rect
 * fallback shape (via a local path build, since a pill isn't an image)
 * for engines without `ctx.roundRect`. A `fillColor` of `"transparent"`
 * skips the capsule fill entirely — used by the Stats Banner's date
 * pill, which the reference design renders as an outlined/borderless
 * chip rather than a solid button.
 */
function drawPillElement(ctx: CanvasRenderingContext2D, el: Extract<PlanElement, { kind: "pill" }>): void {
  const { x, y, width, height } = el.box;
  const radius = Math.max(0, Math.min(0.5, el.cornerRadiusFactor)) * height;

  if (el.fillColor !== "transparent") {
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, y, width, height, radius);
    } else {
      ctx.moveTo(x + radius, y);
      ctx.arcTo(x + width, y, x + width, y + height, radius);
      ctx.arcTo(x + width, y + height, x, y + height, radius);
      ctx.arcTo(x, y + height, x, y, radius);
      ctx.arcTo(x, y, x + width, y, radius);
    }
    ctx.fillStyle = el.fillColor;
    ctx.fill();
  }

  if (!el.text) return;

  const measure = (text: string, fontSizePx: number): number => {
    ctx.font = `${el.fontWeight} ${fontSizePx}px ${el.fontFamily}, sans-serif`;
    return ctx.measureText(text).width;
  };
  // Pills are single-line by design — shrink-to-fit via `fitText`, but
  // only ever draw the first line even if wrapping somehow occurs
  // (extremely long CTA text), since a wrapped pill would look broken.
  const fit = fitText(el.text, { x, y, width: width * 0.92, height }, el.baseSizePx, measure);
  if (fit.lines.length === 0) return;

  ctx.font = `${el.fontWeight} ${fit.fontSizePx}px ${el.fontFamily}, sans-serif`;
  ctx.fillStyle = el.textColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(fit.lines[0], x + width / 2, y + height / 2);
}

/**
 * Measures a string including manual letter-spacing, matching exactly what
 * `fillTextTracked` will draw. Keeping measure and draw in one place is what
 * prevents tracked text from centering off by half its accumulated spacing.
 */
function measureTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  letterSpacingPx: number,
): number {
  if (letterSpacingPx === 0) return ctx.measureText(text).width;
  const chars = [...text];
  const glyphs = chars.reduce((sum, ch) => sum + ctx.measureText(ch).width, 0);
  // Trailing spacing after the final glyph is excluded — including it would
  // make a tracked string appear shifted left when centered.
  return glyphs + letterSpacingPx * Math.max(0, chars.length - 1);
}

/**
 * Draws `text` at `x`,`y` with manual per-character tracking.
 *
 * Done by hand rather than with `ctx.letterSpacing` because that property
 * only landed in Safari 17.4; on anything older it is ignored, so a creative
 * exported from an older Safari would silently lose its tracking while
 * looking correct everywhere else. `x` is interpreted per `align`, matching
 * `ctx.textAlign` semantics, but the context's own `textAlign` is forced to
 * `"left"` for the duration since each glyph is positioned explicitly.
 */
function fillTextTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  letterSpacingPx: number,
  align: TextSlot["align"],
): void {
  if (letterSpacingPx === 0) {
    ctx.textAlign = align;
    ctx.fillText(text, x, y);
    return;
  }

  const total = measureTracked(ctx, text, letterSpacingPx);
  let cursor = align === "left" ? x : align === "right" ? x - total : x - total / 2;

  const prevAlign = ctx.textAlign;
  ctx.textAlign = "left";
  for (const ch of [...text]) {
    ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + letterSpacingPx;
  }
  ctx.textAlign = prevAlign;
}

/**
 * Draws a `text-stack`: several independently-styled lines laid out as one
 * vertically-centered block inside `el.box`.
 */
function drawTextStackElement(
  ctx: CanvasRenderingContext2D,
  el: Extract<PlanElement, { kind: "text-stack" }>,
): void {
  const measure = (text: string, fontSizePx: number, run: TextStackRun): number => {
    ctx.font = `${run.fontWeight} ${fontSizePx}px ${run.fontFamily}, sans-serif`;
    return measureTracked(ctx, text, (run.letterSpacingPx ?? 0) * (fontSizePx / run.baseSizePx));
  };

  const fit = fitTextStack(el.runs, el.box, el.lineGapPx, measure);
  if (fit.runs.length === 0) return;

  const x =
    el.align === "left"
      ? el.box.x
      : el.align === "right"
        ? el.box.x + el.box.width
        : el.box.x + el.box.width / 2;

  let cursorY = el.box.y + el.box.height / 2 - fit.totalHeightPx / 2;

  ctx.textBaseline = "middle";
  for (let i = 0; i < fit.runs.length; i += 1) {
    const run = fit.runs[i];
    const lineHeight = run.fontSizePx * LINE_HEIGHT_FACTOR;

    ctx.font = `${run.fontWeight} ${run.fontSizePx}px ${run.fontFamily}, sans-serif`;
    ctx.fillStyle = run.color;

    run.lines.forEach((line, lineIndex) => {
      const y = cursorY + lineIndex * lineHeight + lineHeight / 2;
      fillTextTracked(ctx, line, x, y, run.letterSpacingPx, el.align);
    });

    cursorY += run.lines.length * lineHeight;
    if (i < fit.runs.length - 1) cursorY += el.lineGapPx * fit.scale;
  }
}

/** Total width an adornment adds to a line, including its gap. */
function adornmentReservedWidth(adornment: TextAdornment): number {
  return adornment.style === "dots"
    ? 2 * (adornment.radiusPx * 2 + adornment.gapPx)
    : adornment.sizePx + adornment.gapPx;
}

/**
 * Draws an `adorned-text`: one line plus its adornment, composed and centered
 * as a single unit inside `el.box`.
 *
 * Measuring the text first and laying the adornment out around the result is
 * the whole point — it keeps the pair optically centered and correctly spaced
 * whatever the copy length.
 */
function drawAdornedTextElement(
  ctx: CanvasRenderingContext2D,
  el: Extract<PlanElement, { kind: "adorned-text" }>,
): void {
  const measure = (text: string, fontSizePx: number): number => {
    ctx.font = `${el.fontWeight} ${fontSizePx}px ${el.fontFamily}, sans-serif`;
    return ctx.measureText(text).width;
  };

  // Shrink-to-fit against the space left after the adornment, so a long date
  // never pushes its glyph or dots outside the box.
  const textBox: ResolvedBox = {
    ...el.box,
    width: Math.max(1, el.box.width - adornmentReservedWidth(el.adornment)),
  };

  const fit = fitText(el.text, textBox, el.baseSizePx, measure);
  if (fit.lines.length === 0) return;

  // Single-line by design: a wrapped date with dots or a glyph would read as
  // broken, so only the first line is drawn.
  const line = fit.lines[0];
  ctx.font = `${el.fontWeight} ${fit.fontSizePx}px ${el.fontFamily}, sans-serif`;
  const textWidth = ctx.measureText(line).width;

  const centerY = el.box.y + el.box.height / 2;
  const boxCenterX = el.box.x + el.box.width / 2;

  ctx.textBaseline = "middle";

  if (el.adornment.style === "dots") {
    const { color, radiusPx, gapPx } = el.adornment;

    ctx.fillStyle = el.color;
    ctx.textAlign = "center";
    ctx.fillText(line, boxCenterX, centerY);

    const dotOffset = textWidth / 2 + gapPx + radiusPx;
    ctx.fillStyle = color;
    for (const dx of [-dotOffset, dotOffset]) {
      ctx.beginPath();
      ctx.arc(boxCenterX + dx, centerY, radiusPx, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  // Leading icon: centre [glyph][gap][text] as one run.
  const { name, color, sizePx, strokeWidthPx, gapPx } = el.adornment;
  const totalWidth = sizePx + gapPx + textWidth;
  const startX = boxCenterX - totalWidth / 2;

  drawIcon(ctx, name, { x: startX, y: centerY - sizePx / 2, width: sizePx, height: sizePx }, color, strokeWidthPx);

  ctx.fillStyle = el.color;
  ctx.textAlign = "left";
  ctx.fillText(line, startX + sizePx + gapPx, centerY);
}

/**
 * Draws a vector glyph into `box`. Paths are expressed as proportions of the
 * box so one definition serves every export size.
 *
 * Deliberately sparse: at the ~28px the reference designs use, extra interior
 * detail merges into a solid blob. Only the strokes that survive at that size
 * are drawn.
 */
function drawIcon(
  ctx: CanvasRenderingContext2D,
  name: IconName,
  box: ResolvedBox,
  color: string,
  strokeWidthPx: number,
): void {
  const { x, y, width, height } = box;
  if (width <= 0 || height <= 0) return;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = strokeWidthPx;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  const py = (n: number) => y + n * height;
  const px = (n: number) => x + n * width;

  if (name === "calendar") {
    // Body, inset at the top to leave room for the two hanging rings.
    const bodyTop = py(0.18);
    const bodyH = height * 0.82;
    const radius = Math.min(width, bodyH) * 0.18;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, bodyTop, width, bodyH, radius);
    } else {
      ctx.moveTo(x + radius, bodyTop);
      ctx.arcTo(x + width, bodyTop, x + width, bodyTop + bodyH, radius);
      ctx.arcTo(x + width, bodyTop + bodyH, x, bodyTop + bodyH, radius);
      ctx.arcTo(x, bodyTop + bodyH, x, bodyTop, radius);
      ctx.arcTo(x, bodyTop, x + width, bodyTop, radius);
    }
    ctx.stroke();

    // Header rule under the month band.
    ctx.beginPath();
    ctx.moveTo(x, py(0.42));
    ctx.lineTo(x + width, py(0.42));
    ctx.stroke();

    // Rings.
    for (const rx of [0.3, 0.7]) {
      ctx.beginPath();
      ctx.moveTo(px(rx), py(0));
      ctx.lineTo(px(rx), py(0.26));
      ctx.stroke();
    }
  }

  ctx.restore();
}

/** Number of scallop bumps along the seal's longer axis. */
const SEAL_SCALLOPS_LONG = 9;

/**
 * Draws a `seal`: a notched red wax plaque with an inset rule and a centered
 * label.
 *
 * The scalloped silhouette is built by walking the perimeter of a rounded
 * rect and adding outward semicircles at regular intervals, which reads as a
 * pressed wax stamp far better than a plain rounded rect does while staying
 * fully vector (so it stays sharp at any export size).
 */
function drawSealElement(
  ctx: CanvasRenderingContext2D,
  el: Extract<PlanElement, { kind: "seal" }>,
): void {
  const { x, y, width, height } = el.box;
  if (width <= 0 || height <= 0) return;

  const bump = Math.min(width, height) * 0.07;
  // Inset the plaque so the scallops occupy the space instead of overflowing
  // the element's box.
  const ix = x + bump;
  const iy = y + bump;
  const iw = Math.max(1, width - bump * 2);
  const ih = Math.max(1, height - bump * 2);

  ctx.save();

  // Scallops along the two long edges plus proportionally fewer along the
  // short edges, so bump spacing stays roughly even around the perimeter.
  const alongX = SEAL_SCALLOPS_LONG;
  const alongY = Math.max(2, Math.round((SEAL_SCALLOPS_LONG * ih) / iw));

  ctx.beginPath();
  ctx.rect(ix, iy, iw, ih);
  for (let i = 0; i < alongX; i += 1) {
    const cx = ix + ((i + 0.5) * iw) / alongX;
    ctx.moveTo(cx + bump, iy);
    ctx.arc(cx, iy, bump, 0, Math.PI, true);
    ctx.moveTo(cx + bump, iy + ih);
    ctx.arc(cx, iy + ih, bump, 0, Math.PI, false);
  }
  for (let i = 0; i < alongY; i += 1) {
    const cy = iy + ((i + 0.5) * ih) / alongY;
    ctx.moveTo(ix, cy - bump);
    ctx.arc(ix, cy, bump, -Math.PI / 2, Math.PI / 2, true);
    ctx.moveTo(ix + iw, cy - bump);
    ctx.arc(ix + iw, cy, bump, -Math.PI / 2, Math.PI / 2, false);
  }
  ctx.fillStyle = el.fillColor;
  ctx.fill();

  // Inset rule, the detail that makes it read as stamped rather than printed.
  const inset = Math.min(iw, ih) * 0.12;
  ctx.beginPath();
  ctx.rect(ix + inset, iy + inset, iw - inset * 2, ih - inset * 2);
  ctx.strokeStyle = el.accentColor;
  ctx.lineWidth = Math.max(1, Math.min(iw, ih) * 0.045);
  ctx.stroke();

  if (el.text) {
    const measure = (text: string, fontSizePx: number): number => {
      ctx.font = `${el.fontWeight} ${fontSizePx}px ${el.fontFamily}, sans-serif`;
      return ctx.measureText(text).width;
    };
    const fit = fitText(
      el.text,
      { x: ix, y: iy, width: (iw - inset * 2) * 0.9, height: ih },
      el.baseSizePx,
      measure,
    );
    if (fit.lines.length > 0) {
      ctx.font = `${el.fontWeight} ${fit.fontSizePx}px ${el.fontFamily}, sans-serif`;
      ctx.fillStyle = el.textColor;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(fit.lines[0], ix + iw / 2, iy + ih / 2);
    }
  }

  ctx.restore();
}

// ─── Creative_Customization drawing helpers (Task 5) ────────────────────────
//
// These functions are only invoked when the corresponding `PlanElement`
// variant is present in the plan (all five variants are only emitted by
// `decoratePlanWithCustomization`). Base-spec plans never trigger these
// branches, so Property 45 (Additivity_Invariant) is preserved.

/**
 * Draws a full-canvas dim overlay (Requirement 5.2): a solid-color rectangle
 * covering the entire canvas at the specified opacity. `ctx.save` /
 * `ctx.restore` bracket the draw so `globalAlpha` doesn't leak out to
 * subsequent elements.
 */
function drawOverlayDim(
  ctx: CanvasRenderingContext2D,
  el: Extract<PlanElement, { kind: "overlay-dim" }>,
  format: PlatformFormat,
): void {
  ctx.save();
  ctx.globalAlpha = el.opacity;
  ctx.fillStyle = el.color;
  ctx.fillRect(0, 0, format.width, format.height);
  ctx.restore();
}

/**
 * Draws a full-canvas linear gradient overlay (Requirement 5.3). `el.direction`
 * is already in radians — converted from degrees at plan-build time by
 * `decoratePlanWithCustomization`'s `buildOverlayElements` using the same
 * `(degrees - 90) * π / 180` convention as `drawBackground`'s gradient
 * branch — so this helper never re-converts. Endpoints span the full
 * canvas, matching the base spec's gradient-endpoint derivation.
 */
function drawOverlayGradient(
  ctx: CanvasRenderingContext2D,
  el: Extract<PlanElement, { kind: "overlay-gradient" }>,
  format: PlatformFormat,
): void {
  const { width, height } = format;
  const rad = el.direction;
  const x1 = width / 2 - (Math.cos(rad) * width) / 2;
  const y1 = height / 2 - (Math.sin(rad) * height) / 2;
  const x2 = width / 2 + (Math.cos(rad) * width) / 2;
  const y2 = height / 2 + (Math.sin(rad) * height) / 2;

  ctx.save();
  ctx.globalAlpha = el.opacity;
  const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
  gradient.addColorStop(0, el.from);
  gradient.addColorStop(1, el.to);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

/**
 * Blurs the pixels ALREADY drawn under `el.box`, scoped strictly to that
 * region so subsequent image/text/watermark elements draw over an
 * unblurred surface (Requirement 5.4).
 *
 * Implementation: (1) extract the region's pixels via `getImageData`, (2)
 * paint them onto a scratch `OffscreenCanvas` (falling back to a DOM
 * `<canvas>` when unavailable — Safari < 16.4 in particular), (3) apply
 * `filter = "blur(Npx)"` on the main context and draw the scratch canvas
 * back into the target box, (4) restore state.
 *
 * `blurRadiusPx <= 0` is a no-op — nothing to blur, and passing 0 to
 * `filter = "blur(0px)"` is a needless context state change.
 *
 * Degenerate boxes (zero width / height / off-canvas) are no-ops. The
 * plan builder already clamps `box` inside the format's bounds via
 * `buildOverlayElements`, but this helper defends against ill-formed
 * inputs anyway so a malformed plan never throws.
 */
function drawOverlayBlurRegion(
  ctx: CanvasRenderingContext2D,
  el: Extract<PlanElement, { kind: "overlay-blur-region" }>,
  format: PlatformFormat,
): void {
  if (el.blurRadiusPx <= 0) return;
  const bx = Math.round(el.box.x);
  const by = Math.round(el.box.y);
  const bw = Math.round(el.box.width);
  const bh = Math.round(el.box.height);
  if (bw <= 0 || bh <= 0) return;
  if (bx < 0 || by < 0 || bx + bw > format.width || by + bh > format.height) return;

  let imageData: ImageData;
  try {
    imageData = ctx.getImageData(bx, by, bw, bh);
  } catch (error) {
    logger.warn("creative overlay blur region getImageData failed", {
      x: bx,
      y: by,
      width: bw,
      height: bh,
      error_message: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  const scratch: OffscreenCanvas | HTMLCanvasElement =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(bw, bh)
      : document.createElement("canvas");
  if (scratch instanceof HTMLCanvasElement) {
    scratch.width = bw;
    scratch.height = bh;
  }

  const scratchCtx = scratch.getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!scratchCtx) return;

  scratchCtx.putImageData(imageData, 0, 0);

  ctx.save();
  ctx.filter = `blur(${el.blurRadiusPx}px)`;
  ctx.drawImage(scratch as CanvasImageSource, bx, by, bw, bh);
  ctx.restore();
}

/**
 * Draws the resolved watermark logo (Requirement 6.1). Uses the base spec's
 * `loadImage` helper for cross-origin safety; on load failure logs
 * `logger.warn("creative watermark load failed", { url })` and returns
 * without drawing (Requirement 6.3 — no placeholder). Applies
 * `ctx.globalAlpha = el.opacity` for the draw and restores after so
 * downstream elements keep the default alpha.
 */
async function drawWatermark(
  ctx: CanvasRenderingContext2D,
  el: Extract<PlanElement, { kind: "watermark" }>,
): Promise<void> {
  const img = await loadImage(el.url);
  if (!img) {
    logger.warn("creative watermark load failed", { url: el.url });
    return;
  }
  ctx.save();
  ctx.globalAlpha = el.opacity;
  ctx.drawImage(img, el.box.x, el.box.y, el.box.width, el.box.height);
  ctx.restore();
}

/**
 * Strokes an outer border (Requirement 7.1) inset by `thicknessPx / 2` so
 * the stroke sits fully inside the canvas bounds. Applies an optional
 * drop shadow via `ctx.shadow*` before the stroke; the `ctx.save` /
 * `ctx.restore` bracket resets shadow state afterwards. Uses
 * `ctx.roundRect` when available and falls back to the same manual
 * `arcTo` rounded-rect path used by `drawImageCropped` for older engines.
 *
 * A zero-thickness border is a no-op (matches the clamp guarantee in
 * `clampBorder` — a stroke of width 0 is undefined behavior on some
 * engines, so we skip the draw explicitly).
 */
function drawBorder(
  ctx: CanvasRenderingContext2D,
  el: Extract<PlanElement, { kind: "border" }>,
  format: PlatformFormat,
): void {
  if (el.thicknessPx <= 0) return;

  ctx.save();
  if (el.dropShadow) {
    const ds = el.dropShadow;
    ctx.shadowColor = ds.color;
    ctx.shadowOffsetX = ds.offsetX;
    ctx.shadowOffsetY = ds.offsetY;
    ctx.shadowBlur = ds.blur;
  }
  ctx.strokeStyle = el.color;
  ctx.lineWidth = el.thicknessPx;

  const inset = el.thicknessPx / 2;
  const x = inset;
  const y = inset;
  const w = format.width - el.thicknessPx;
  const h = format.height - el.thicknessPx;
  const r = Math.max(0, Math.min(el.cornerRadiusPx, Math.min(w, h) / 2));

  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, r);
  } else {
    // Manual arcTo fallback matching `drawImageCropped`'s pattern.
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
  }
  ctx.stroke();
  ctx.restore();
}

// Font loading lives in `./creative-fonts`, which injects the Google Fonts
// stylesheet before shaping weights. The previous implementation here called
// `document.fonts.load(...)` directly, which only shapes families a
// stylesheet has already declared — so every family outside the five in
// `index.html` resolved successfully having fetched nothing and then rendered
// in system sans. `Playfair Display`, named by two shipped Event_Promo
// templates, was silently affected. See `creative-fonts.ts` for the details.

/**
 * Pure helper: collects the unique `(fontFamily, fontWeight)` pairs used by
 * `text` `PlanElement`s in `plan`. Exposed for testing (Property 50) — a
 * pure predicate is easier to property-test than a helper that touches
 * `document.fonts`. Order in the returned array follows first-encounter
 * order across `plan.elements` so callers get a deterministic sequence,
 * but consumers of this helper (including `ensureFontsLoadedForPlan`) MUST
 * NOT depend on ordering because the underlying set semantics are
 * unordered.
 */
export function collectUniqueFontPairs(plan: RenderPlan): Array<{ family: string; weight: number }> {
  const seen = new Set<string>();
  const out: Array<{ family: string; weight: number }> = [];

  const add = (family: string, weight: number): void => {
    const key = `${weight}::${family}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ family, weight });
  };

  for (const el of plan.elements) {
    switch (el.kind) {
      case "text":
        add(el.fontFamily, el.fontWeight);
        break;
      // Pills carry their own family/weight for the label they render, and
      // used to be omitted here — so the CTA button's text was measured and
      // painted in whatever the fallback face happened to be, no matter what
      // the template asked for. Every Event_Promo template has a CTA, which
      // made this the most visible instance of the miss.
      case "pill":
        add(el.fontFamily, el.fontWeight);
        break;
      // A text-stack's runs each carry their own family and weight, so a
      // two-tone headline can mix a script accent with a bold sans.
      case "text-stack":
        for (const run of el.runs) add(run.fontFamily, run.fontWeight);
        break;
      default:
        break;
    }
  }
  return out;
}

/**
 * Loads every font `plan` needs and resolves once they are measurable.
 *
 * Delegates to `ensureCreativeFonts`, which injects the Google Fonts
 * stylesheet before shaping weights — the step the previous implementation
 * skipped. Best-effort: an unreachable font degrades to the CSS `sans-serif`
 * fallback baked into the draw helpers' font strings.
 */
async function ensureFontsLoadedForPlan(plan: RenderPlan): Promise<void> {
  await ensureCreativeFonts(collectUniqueFontPairs(plan));
}

/**
 * When the resolved background is an image (AI-generated or otherwise),
 * random imagery underneath white/dark template text can render the text
 * unreadable — a bright cloud in an AI background behind white "presented
 * by" copy is a common failure mode. Paint a soft dark scrim over the
 * background before any text/photo/logo elements draw so the template's
 * type stays legible regardless of what the image contains. The scrim is
 * a full-canvas semitransparent black rectangle — subtle enough not to
 * darken the imagery significantly, strong enough to guarantee text
 * contrast against typical mid-tone photography.
 *
 * Applied only when the background's `type === "image"` — solid and
 * gradient backgrounds are already color-controlled by the template
 * author, so they don't need it.
 */
function drawBackgroundScrim(
  ctx: CanvasRenderingContext2D,
  style: CreativeBgStyle,
  width: number,
  height: number,
): void {
  if (style.type !== "image") return;
  ctx.save();
  ctx.fillStyle = "rgba(15, 23, 42, 0.32)";
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

/**
 * Draws a `RenderPlan` onto `ctx`, walking `plan.elements` in order (later
 * elements draw on top of earlier ones — `background` is always first per
 * the plan builders). The only DOM/canvas-touching function in the renderer;
 * everything upstream (plan building, reflow, text fitting) is pure. Awaits
 * every image load AND font load before returning, so a `canvas.toBlob()`
 * call issued immediately after this resolves captures the fully-drawn
 * canvas with the correct typography.
 *
 * Draws the photo/logo composite unmodified — no `ctx.filter` or color/
 * transform manipulation is ever applied, only geometric crop/clip/position/
 * scale (Requirements 2.4, 3.3). Image load failures are logged via
 * `logger.warn` and fall back to the placeholder path (design's Error
 * Handling section).
 *
 * A soft dark scrim is painted over image backgrounds (and only image
 * backgrounds) after the background draws but before any foreground
 * elements, keeping template text legible over unpredictable AI-generated
 * imagery.
 */
export async function drawPlan(ctx: CanvasRenderingContext2D, plan: RenderPlan): Promise<void> {
  // Must complete before the first `measureText`: `fitText` picks wrap points
  // and a font size from measured widths, so measuring in the fallback face
  // and painting in the real one produces text that overflows its box.
  await ensureFontsLoadedForPlan(plan);

  for (const el of plan.elements) {
    switch (el.kind) {
      case "background":
        await drawBackground(ctx, el.style, plan.format.width, plan.format.height);
        drawBackgroundScrim(ctx, el.style, plan.format.width, plan.format.height);
        break;
      case "image":
        await drawImageElement(ctx, el);
        break;
      case "text":
        drawTextElement(ctx, el);
        break;
      case "divider":
        drawDividerElement(ctx, el);
        break;
      case "shape":
        drawShapeElement(ctx, el);
        break;
      case "pill":
        drawPillElement(ctx, el);
        break;
      case "text-stack":
        drawTextStackElement(ctx, el);
        break;
      case "adorned-text":
        drawAdornedTextElement(ctx, el);
        break;
      case "seal":
        drawSealElement(ctx, el);
        break;
      case "overlay-dim":
        drawOverlayDim(ctx, el, plan.format);
        break;
      case "overlay-gradient":
        drawOverlayGradient(ctx, el, plan.format);
        break;
      case "overlay-blur-region":
        drawOverlayBlurRegion(ctx, el, plan.format);
        break;
      case "watermark":
        await drawWatermark(ctx, el);
        break;
      case "border":
        drawBorder(ctx, el, plan.format);
        break;
    }
  }
}

// ─── PNG export (Requirement 5.2 / Property 8) ──────────────────────────────

/**
 * Shared boilerplate for `renderSpeakerCreative`/`renderSponsorCreative`/
 * `renderComboCreative`: creates an off-screen `<canvas>` sized exactly to
 * `plan.format`'s pixel dimensions (guaranteeing the exported PNG's pixel
 * dimensions exactly match the target `Platform_Format`, Requirement 5.2 /
 * Property 8), draws the plan onto it via `drawPlan`, then exports it as a
 * `"image/png"` blob. `canvas.toBlob` is callback-based, so it's wrapped in
 * a `Promise` here.
 */
async function renderPlanToPngBlob(plan: RenderPlan): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = plan.format.width;
  canvas.height = plan.format.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not get 2D canvas context");
  }

  await drawPlan(ctx, plan);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("canvas.toBlob returned null — PNG export failed"));
      }
    }, "image/png");
  });
}

/**
 * Renders a Speaker_Creative for `speaker` at `format`, resolving `template`
 * against `theme`, and returns the exported PNG blob. Composes
 * `buildSpeakerPlan` + an off-screen canvas + `drawPlan` + `canvas.toBlob()`
 * (Requirement 5.2).
 */
export async function renderSpeakerCreative(
  speaker: SpeakerLike,
  template: CreativeTemplate,
  format: PlatformFormat,
  theme: EventTheme
): Promise<Blob> {
  const plan = buildSpeakerPlan(speaker, template, format, theme);
  return renderPlanToPngBlob(plan);
}

/**
 * Renders a Sponsor_Creative for `sponsor` at `format`, resolving `template`
 * against `theme`, and returns the exported PNG blob. Composes
 * `buildSponsorPlan` + an off-screen canvas + `drawPlan` + `canvas.toBlob()`
 * (Requirement 5.2).
 */
export async function renderSponsorCreative(
  sponsor: SponsorLike,
  template: CreativeTemplate,
  format: PlatformFormat,
  theme: EventTheme
): Promise<Blob> {
  const plan = buildSponsorPlan(sponsor, template, format, theme);
  return renderPlanToPngBlob(plan);
}

/**
 * Renders a Combo_Creative for `speaker` + `sponsor` at `format`, resolving
 * `template` against `theme`, and returns the exported PNG blob. Composes
 * `buildComboPlan` + an off-screen canvas + `drawPlan` + `canvas.toBlob()`
 * (Requirement 5.2). Eligibility (whether `speaker`/`sponsor` are linked to
 * the event) is not checked here — see `assertComboEligible`.
 */
export async function renderComboCreative(
  speaker: SpeakerLike,
  sponsor: SponsorLike,
  template: CreativeTemplate,
  format: PlatformFormat,
  theme: EventTheme
): Promise<Blob> {
  const plan = buildComboPlan(speaker, sponsor, template, format, theme);
  return renderPlanToPngBlob(plan);
}

/**
 * Renders an Event_Promo creative for `promo` at `format`, resolving
 * `template` against `theme`, and returns the exported PNG blob.
 * Composes `buildEventPlan` + an off-screen canvas + `drawPlan` +
 * `canvas.toBlob()` (Requirement 5.2).
 */
export async function renderEventCreative(
  promo: EventPromoLike,
  template: CreativeTemplate,
  format: PlatformFormat,
  theme: EventTheme
): Promise<Blob> {
  const plan = buildEventPlan(promo, template, format, theme);
  return renderPlanToPngBlob(plan);
}
