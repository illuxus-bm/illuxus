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

import type {
  CreativeBgStyle,
  ImageSlot,
  PlatformFormat,
  ResolvedBox,
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
 * One resolved, drawable unit. Produced by the plan builders (pure);
 * consumed by `drawPlan` (canvas-only).
 */
export type PlanElement =
  | { kind: "background"; style: CreativeBgStyle }
  | {
      kind: "image";
      role: "photo" | "logo";
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
  | { kind: "divider"; x: number; y1: number; y2: number; color: string };

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
  role: "photo" | "logo",
  placeholderInitial: string | undefined
): void {
  if (role === "logo" || !placeholderInitial) {
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
 * Ensures the Poppins font used by the templates is actually loaded before
 * the canvas draws any text. `ctx.font` silently falls back to the system
 * sans-serif when the requested family isn't loaded — that's what caused
 * the earlier "text looks wrong on first render, then correct on reload"
 * behavior, since the browser hadn't fetched Poppins yet when the canvas
 * did its measurements and draws. `document.fonts.load` primes the font
 * and resolves once it's usable. Fails silently (returns void) so a font
 * that can't be fetched degrades gracefully to the system fallback rather
 * than crashing the render.
 *
 * The font weights loaded here (400 / 500 / 600 / 700) match every weight
 * used across `SPEAKER_TEMPLATES`, `SPONSOR_TEMPLATES`, and `COMBO_TEMPLATES`.
 */
async function ensureFontsLoaded(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  try {
    await Promise.all([
      document.fonts.load("400 16px Poppins"),
      document.fonts.load("500 16px Poppins"),
      document.fonts.load("600 16px Poppins"),
      document.fonts.load("700 16px Poppins"),
    ]);
  } catch {
    // Font loading is best-effort — a failed load falls back to
    // `sans-serif` via the CSS font stack in `drawTextElement`, which is
    // ugly but not broken.
  }
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
  await ensureFontsLoaded();

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
