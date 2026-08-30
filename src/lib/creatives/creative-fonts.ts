/**
 * Font catalog for the creatives renderer.
 *
 * ## The bug this replaces
 *
 * The renderer used to prime fonts with two best-effort helpers that called
 * `document.fonts.load(...)` directly. That only shapes faces a stylesheet
 * has already declared, and `index.html` declares exactly five families
 * (Poppins, JetBrains Mono, Space Grotesk, DM Sans, Comfortaa). Every other
 * family in `FONT_OPTIONS` — including `Playfair Display`, which two shipped
 * Event_Promo templates specify for their headline — resolved to a
 * successfully-settled promise that had fetched nothing, and then rendered in
 * system sans.
 *
 * The failure was invisible in code review because the call sites look
 * correct: the family is named, the promise is awaited, the draw happens
 * after. Only the rendered pixels showed it, and only to someone who knew
 * what Playfair Display looks like.
 *
 * `ensureCreativeFonts` fixes it by injecting the stylesheet before shaping
 * the weights. See `src/lib/webfonts.ts` for that mechanism.
 *
 * ## Weight lists are load-bearing
 *
 * A family is fetched with exactly the weights declared here. A template
 * asking for a weight this catalog omits gets synthetic emboldening from the
 * browser rather than the real cut, which reads noticeably worse at display
 * sizes. When a template starts using a new weight, add it here.
 */

import { ensureWebFont } from "@/lib/webfonts";

export type CreativeFontCategory = "sans" | "serif" | "script" | "mono";

export interface CreativeFont {
  family: string;
  category: CreativeFontCategory;
  weights: number[];
}

/**
 * Every family the creatives renderer can load, with the weights it ships.
 *
 * Kept aligned with `FONT_OPTIONS` in `src/components/event/page-form/presets.ts`
 * — that array is what the organizer-facing font pickers offer, and Property 50
 * asserts the two stay consistent. A family in the picker but not here would
 * render in fallback; a family here but not in the picker is simply
 * unreachable from the UI.
 */
export const CREATIVE_FONTS: CreativeFont[] = [
  // ── Sans: headlines, stat numerals, labels, CTA text ──
  // Poppins carries the reference designs' headline and stat typography.
  // 800 is included for the hero banner's headline, which is noticeably
  // heavier than the 700 the older templates used.
  { family: "Poppins", category: "sans", weights: [300, 400, 500, 600, 700, 800] },
  { family: "Inter", category: "sans", weights: [400, 500, 600, 700, 800] },
  { family: "Montserrat", category: "sans", weights: [400, 500, 600, 700, 800] },
  { family: "Roboto", category: "sans", weights: [400, 500, 700] },
  { family: "Lato", category: "sans", weights: [400, 700, 900] },
  { family: "Open Sans", category: "sans", weights: [400, 600, 700] },
  { family: "Raleway", category: "sans", weights: [400, 600, 700] },
  { family: "DM Sans", category: "sans", weights: [400, 500, 600, 700] },
  { family: "Space Grotesk", category: "sans", weights: [400, 500, 600, 700] },

  // ── Serif ──
  // Playfair Display is referenced by the pre-existing `event-invite-card`
  // and `event-invitation-envelope` templates and has never actually
  // rendered. Declaring it here is what fixes those two.
  { family: "Playfair Display", category: "serif", weights: [400, 500, 600, 700, 800, 900] },
  { family: "Merriweather", category: "serif", weights: [400, 700] },

  // ── Script: the "You're Invited" headline ──
  // Dancing Script at 700 is the closest widely-available match to the
  // brush-calligraphy in the reference invite: connected strokes, a modest
  // rightward slant, and enough weight to hold up at display size against a
  // cream ground. Great Vibes is a more formal, higher-contrast copperplate
  // alternative; Pacifico is a heavier retro brush.
  { family: "Dancing Script", category: "script", weights: [400, 500, 600, 700] },
  { family: "Great Vibes", category: "script", weights: [400] },
  { family: "Pacifico", category: "script", weights: [400] },

  // ── Mono ──
  { family: "JetBrains Mono", category: "mono", weights: [400, 500, 700] },
];

const BY_FAMILY = new Map(CREATIVE_FONTS.map((f) => [f.family, f]));

/**
 * The family used when a template names one this catalog doesn't know.
 * Poppins is the safe pick: it's declared in `index.html`, so it is already
 * warm in every session.
 */
export const FALLBACK_FONT_FAMILY = "Poppins";

/** The script family the reference invite layout is designed around. */
export const SCRIPT_FONT_FAMILY = "Dancing Script";

/** `true` when this catalog can load `family`. */
export function isKnownCreativeFont(family: string): boolean {
  return BY_FAMILY.has(family);
}

/**
 * The weights this catalog ships for `family`, or `null` when unknown.
 * Pure — exposed for tests and for the font pickers.
 */
export function weightsFor(family: string): number[] | null {
  return BY_FAMILY.get(family)?.weights ?? null;
}

/**
 * The families in this catalog, in category order. Pure.
 */
export function creativeFontFamilies(): string[] {
  return CREATIVE_FONTS.map((f) => f.family);
}

/**
 * Pure planner for `ensureCreativeFonts`: maps requested
 * `(family, weight)` pairs onto the catalog entries that need loading,
 * collapsing duplicate families and dropping unknown ones.
 *
 * Split out from the loader so the interesting logic is testable without
 * touching `document.fonts` — the loader itself is then a `Promise.all` over
 * this function's output, which is trivially correct plumbing.
 *
 * Unknown families are dropped rather than passed through: `ensureWebFont`
 * would inject a stylesheet for a family Google doesn't serve, spending a
 * request to get a 400 back. The caller's CSS fallback covers it.
 */
export function planFontLoads(
  pairs: ReadonlyArray<{ family: string; weight: number }>,
): Array<{ family: string; weights: number[] }> {
  const wanted = new Map<string, Set<number>>();

  for (const { family, weight } of pairs) {
    const known = BY_FAMILY.get(family);
    if (!known) continue;
    const set = wanted.get(family) ?? new Set<number>();
    // Request the catalog's full weight list, not just the weight asked
    // for. One stylesheet carrying every weight the family ships costs a
    // single round-trip, whereas loading weights piecemeal as templates
    // reference them would mean a fresh request per weight — and the
    // customization panel lets an organizer switch a slot's weight at any
    // time, so the extra weights get used often enough to be worth
    // prefetching.
    for (const w of known.weights) set.add(w);
    // Keep an explicitly requested weight even if the catalog omits it, so
    // a template using an undeclared weight still gets the real cut when
    // Google happens to serve it.
    set.add(weight);
    wanted.set(family, set);
  }

  return [...wanted.entries()].map(([family, weights]) => ({
    family,
    weights: [...weights].sort((a, b) => a - b),
  }));
}

/**
 * Loads every font needed by the given `(family, weight)` pairs and resolves
 * once they are shaped and measurable.
 *
 * Must be awaited before the first `measureText` of a render: `fitText`
 * shrinks type to fit its box based on measured width, so measuring against
 * the fallback face produces wrap points and a font size that are wrong for
 * the face that actually paints. That mismatch is subtle and asymmetric —
 * text measured in a narrower fallback then painted in a wider real face
 * overflows its box.
 *
 * Never rejects; see `ensureWebFont`.
 */
export async function ensureCreativeFonts(
  pairs: ReadonlyArray<{ family: string; weight: number }>,
): Promise<void> {
  const loads = planFontLoads(pairs);
  await Promise.all(loads.map(({ family, weights }) => ensureWebFont(family, weights)));
}
