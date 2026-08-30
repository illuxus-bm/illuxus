/**
 * Creative_Brief — turns one free-text prompt into a complete, ready-to-render
 * creative.
 *
 * ## What this adds
 *
 * Before this module, "AI" in the creatives feature meant two narrow things:
 * `generate-creative-background` produced a background raster, and
 * `generate-creative-copy` produced a tagline and a CTA label. The *layout* was
 * always a preset the organizer picked by hand, and the copy came back in
 * fields (`tagline`, `subtitle`) that the reference templates don't use for
 * their headline. So an organizer could not describe what they wanted and get
 * it — they had to pick a template, then fill six form fields, then optionally
 * ask for copy help on two of them.
 *
 * This module closes that gap. It maps a model response onto everything a
 * render needs: the promo fields (including the two-tone headline's
 * `titleLead`/`title` split and the `editionLabel` eyebrow), a template
 * choice, and a palette.
 *
 * ## Why the model returns a layout *category*, not a template id
 *
 * The model picks from a small closed vocabulary (`"invite" | "banner"`) which
 * this module maps to a concrete template id. Letting it emit an id directly
 * would make it capable of naming a template that doesn't exist, and would
 * couple prompt output to the template registry — renaming a preset would
 * start silently breaking generations. A two-value enum is something a model
 * gets right essentially always, and an unrecognized value falls back rather
 * than failing.
 *
 * Everything here is pure: no network, no DOM. The network call lives in
 * `creative-ai.ts`; this module only interprets its result.
 */

import type { EventPromoLike } from "./creative-renderer";
import type { EventTheme } from "./creative-templates";

/**
 * Layout categories a prompt can resolve to.
 *
 * Deliberately coarse. These describe the *shape of the composition*, which is
 * what a prompt can meaningfully express ("a square invite", "a wide banner
 * with our numbers"), rather than a specific visual treatment.
 */
export type BriefLayout = "invite" | "banner";

/** Template id backing each layout category. */
const TEMPLATE_FOR_LAYOUT: Record<BriefLayout, string> = {
  invite: "event-invite-envelope-ref",
  banner: "event-stats-hero-ref",
};

/**
 * The layout used when the model returns something unrecognized.
 *
 * `banner` rather than `invite`: it degrades better. A banner with no stats
 * still reads as a clean title card, whereas an invite is built around a
 * script tagline and a wax seal that look odd carrying generic copy.
 */
const FALLBACK_LAYOUT: BriefLayout = "banner";

/** Maximum stats any shipped template renders. */
const MAX_STATS = 4;

/**
 * One creative the model proposed, already length-clamped server-side.
 *
 * Mirrors the extended `generate-creative-copy` response. Every field beyond
 * `title` is optional because a sparse prompt legitimately produces sparse
 * copy, and the plan builders drop absent fields rather than rendering holes.
 */
export interface CreativeBriefSuggestion {
  draftId: string;
  /** Main headline. On a two-tone layout this is the emphasised second line. */
  title: string;
  /** Lead-in line above `title`, e.g. "India's Largest". */
  titleLead?: string;
  /** Tracked eyebrow above the lockup, e.g. "Summer Edition". */
  editionLabel?: string;
  /** Script flourish on invite layouts, e.g. "You're Invited". */
  tagline?: string;
  dateLabel?: string;
  ctaLabel?: string;
  stats?: Array<{ value: string; label: string }>;
  /** Which composition the model judged appropriate. */
  layout?: string;
  /** Suggested palette. Hex strings, validated here before use. */
  palette?: { primary?: string; accent?: string };
}

/** Values used to fill anything the model left out. */
export interface BriefFallbacks {
  /** Always present — the event's own title, used when the model omits one. */
  eventTitle: string;
  dateLabel?: string | null;
  wordmarkUrl?: string | null;
}

/** A fully resolved creative, ready to hand to `buildEventPlan`. */
export interface ResolvedBrief {
  promo: EventPromoLike;
  templateId: string;
  layout: BriefLayout;
  theme: EventTheme;
}

/** Matches `#rgb` and `#rrggbb`, case-insensitively. */
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * `true` when `value` is a hex colour the canvas will accept.
 *
 * Validated rather than trusted because an invalid `fillStyle` is silently
 * ignored by canvas — the element keeps whatever colour was set previously,
 * which surfaces as one mysteriously mis-coloured element rather than an
 * error. Rejecting here means a bad palette falls back to the template's own
 * colours instead.
 */
export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOR.test(value.trim());
}

/** Normalizes a model-supplied string, returning `undefined` when blank. */
function clean(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Maps a layout string onto a known category, falling back when unrecognized.
 * Pure.
 */
export function resolveLayout(raw: unknown): BriefLayout {
  const value = clean(raw)?.toLowerCase();
  if (value === "invite" || value === "banner") return value;
  return FALLBACK_LAYOUT;
}

/** The template id backing a layout category. Pure. */
export function templateIdForLayout(layout: BriefLayout): string {
  return TEMPLATE_FOR_LAYOUT[layout];
}

/**
 * Builds an `EventTheme` from a model-suggested palette, dropping any
 * component that isn't a valid hex colour.
 *
 * An accent without a primary is discarded: `resolveBackground` only consults
 * `accentColor` when building a gradient whose `from` is `primaryColor`, so an
 * accent alone would have no effect and reporting it as applied would be
 * misleading. Pure.
 */
export function briefToTheme(
  palette: CreativeBriefSuggestion["palette"],
  orgLogoUrl?: string | null,
): EventTheme {
  const theme: EventTheme = {};
  if (palette && isHexColor(palette.primary)) {
    theme.primaryColor = palette.primary.trim();
    if (isHexColor(palette.accent)) theme.accentColor = palette.accent.trim();
  }
  if (orgLogoUrl) theme.orgLogoUrl = orgLogoUrl;
  return theme;
}

/**
 * Splits a single headline into a lead-in and an emphasised remainder, for
 * two-tone layouts when the model returned only a combined `title`.
 *
 * The split point is chosen so the *second* line carries the subject. It looks
 * for a possessive ("India's Largest | Virtual HR Summit") and otherwise
 * breaks so the emphasised line holds the last two or three words.
 *
 * Returns `null` rather than guessing when the headline is too short to split
 * meaningfully — a two-word title split in half reads worse than one clean
 * line, and the template renders a single-run stack correctly. Pure.
 */
export function splitHeadline(title: string): { lead: string; rest: string } | null {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length < 4) return null;

  // Prefer breaking straight after a possessive or a superlative, which is
  // where this style of headline naturally hinges.
  const hingeIndex = words.findIndex(
    (w, i) => i < words.length - 2 && (/[’']s$/i.test(w) || /^(largest|biggest|premier|leading)$/i.test(w)),
  );
  if (hingeIndex >= 0) {
    // Include the hinge word itself, and the superlative following a
    // possessive, in the lead.
    let cut = hingeIndex + 1;
    if (/[’']s$/i.test(words[hingeIndex]) && /^(largest|biggest|premier|leading)$/i.test(words[cut] ?? "")) {
      cut += 1;
    }
    if (cut < words.length) {
      return { lead: words.slice(0, cut).join(" "), rest: words.slice(cut).join(" ") };
    }
  }

  // Otherwise give the emphasised line the last three words (two when short),
  // so the lead stays the qualifier.
  const tailLength = words.length >= 6 ? 3 : 2;
  return {
    lead: words.slice(0, words.length - tailLength).join(" "),
    rest: words.slice(words.length - tailLength).join(" "),
  };
}

/**
 * Resolves a model suggestion into a renderable creative.
 *
 * Fills gaps from `fallbacks` and, on invite layouts, derives the two-tone
 * headline split when the model returned a single combined title — otherwise
 * the invite's charcoal lead-in line would simply be absent, collapsing the
 * design's headline hierarchy to one line.
 *
 * Pure. Never throws: every field is either a validated value or omitted.
 */
export function resolveBrief(
  suggestion: CreativeBriefSuggestion,
  fallbacks: BriefFallbacks,
  orgLogoUrl?: string | null,
): ResolvedBrief {
  const layout = resolveLayout(suggestion.layout);

  const title = clean(suggestion.title) ?? fallbacks.eventTitle;
  let titleLead = clean(suggestion.titleLead);
  let headline = title;

  // The invite sets its headline as two differently-coloured runs. If the
  // model gave one string, split it so the layout keeps its hierarchy.
  if (layout === "invite" && !titleLead) {
    const split = splitHeadline(title);
    if (split) {
      titleLead = split.lead;
      headline = split.rest;
    }
  }

  const stats = (suggestion.stats ?? [])
    .filter((s) => clean(s?.value) && clean(s?.label))
    .slice(0, MAX_STATS)
    .map((s) => ({ value: s.value.trim(), label: s.label.trim() }));

  const promo: EventPromoLike = {
    id: suggestion.draftId || "brief",
    title: headline,
    titleLead,
    editionLabel: clean(suggestion.editionLabel),
    tagline: clean(suggestion.tagline),
    dateLabel: clean(suggestion.dateLabel) ?? clean(fallbacks.dateLabel) ?? undefined,
    ctaLabel: clean(suggestion.ctaLabel),
    wordmarkUrl: fallbacks.wordmarkUrl ?? null,
    ...(stats.length > 0 ? { stats } : {}),
  };

  return {
    promo,
    templateId: templateIdForLayout(layout),
    layout,
    theme: briefToTheme(suggestion.palette, orgLogoUrl),
  };
}
