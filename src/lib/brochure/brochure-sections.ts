/**
 * Pure Brochure_Section content builders for the Event Brochure Generator.
 *
 * Mirrors the architectural split described in `brochure-templates.ts`'s
 * header and `creative-renderer.ts`'s plan-builder/canvas-drawer split: this
 * module owns turning entity data (sessions, speakers, sponsors, venue
 * fields) into plain, drawable content structures — one builder per
 * Brochure_Section (cover, agenda, speakers, sponsors, venue/logistics).
 * Nothing here touches `jsPDF`, `fetch`, or the DOM, which is what makes
 * Properties 25–31, 33–35, 38 directly testable with `fast-check` without a
 * real PDF document. The imperative `jsPDF`/`autoTable`/`qrcode` drawing
 * step that consumes these structures lives in the separate `brochure-pdf.ts`
 * module (a later task).
 *
 * `TIER_RANK` and `tierAccentColor` are imported unchanged from
 * `brochure-templates.ts` rather than redefined here, so the Sponsors_Section
 * grouping/coloring stays byte-identical to the rest of the brochure pipeline
 * (and, transitively, to the Creative_Generator's own tier palette).
 */

import { format as formatDate } from "date-fns";

import { TIER_RANK, tierAccentColor } from "./brochure-templates";

// ─── Cover_Section (Requirement 2) ───────────────────────────────────────────

/** Raw event fields the Cover_Section needs. */
export interface CoverInput {
  title: string;
  /** ISO date string. */
  date: string;
  /** ISO date string, or absent/null when the event has no distinct end date. */
  end_date?: string | null;
  /** Mobile / portrait banner. Preferred over the other two image
   *  sources so the A4 portrait cover fills correctly. Added later —
   *  older callers omitting it still get the original precedence via
   *  `image_url` / `banner_landscape_url`. */
  banner_portrait_url?: string | null;
  image_url?: string | null;
  banner_landscape_url?: string | null;
  /** Human-readable venue label surfaced as a separate outlined pill on
   *  the Poster_Bold cover (matches the reference DevOps Connect
   *  brochure's two-chip layout: date on one side, city/venue on the
   *  other). Optional so themes that don't display it (Classic Editorial,
   *  Corporate_Bold's original layout) keep compiling; the field is
   *  simply not read by their cover drawers. */
  venue?: string | null;
  /** City / region label — fallback for `venue` when the organizer only
   *  filled the location field. Same optional treatment as `venue`. */
  location?: string | null;
}

/** Fully resolved, drawable Cover_Section content. */
export interface CoverContent {
  title: string;
  dateText: string;
  /** Optional venue/city label rendered as a second pill on the
   *  Poster_Bold cover next to the date pill. Empty string is
   *  normalized to `undefined` by `buildCoverContent`. */
  venueText?: string;
  background: { type: "image"; url: string } | { type: "theme-default" };
}

/** Human-readable single-date format, matching `CreativeLibrarySection.tsx`'s
 *  existing `date-fns` usage convention in this codebase. */
const COVER_DATE_FORMAT = "MMM d, yyyy";

/**
 * Renders a single formatted date (`"MMM d, yyyy"`) when `endDate` is absent
 * or represents the exact same instant as `date`; renders a range
 * (`"<date> - <end date>"`, both formatted) otherwise. Pure. Property 25.
 */
export function formatCoverDateRange(date: string, endDate?: string | null): string {
  const start = formatDate(new Date(date), COVER_DATE_FORMAT);

  if (!endDate) {
    return start;
  }

  const startInstant = new Date(date).getTime();
  const endInstant = new Date(endDate).getTime();
  if (startInstant === endInstant) {
    return start;
  }

  const end = formatDate(new Date(endDate), COVER_DATE_FORMAT);
  return `${start} - ${end}`;
}

/**
 * Resolves the Cover_Section's background source. Precedence:
 * `bannerPortraitUrl` (highest) > `imageUrl` > `bannerLandscapeUrl` >
 * theme-default. The portrait banner is preferred because the brochure
 * cover is a portrait A4 page, so a portrait-oriented source fills
 * correctly without cropping/letterboxing.
 *
 * Always resolves to exactly one source. Pure. Property 26 was
 * originally written against the two-argument version (imageUrl,
 * bannerLandscapeUrl); calling with those two args still delivers the
 * documented behavior because the new `bannerPortraitUrl` defaults to
 * `undefined` and falls through to the existing precedence path.
 */
export function resolveCoverBackground(
  imageUrl?: string | null,
  bannerLandscapeUrl?: string | null,
  bannerPortraitUrl?: string | null
): { type: "image"; url: string } | { type: "theme-default" } {
  if (bannerPortraitUrl) {
    return { type: "image", url: bannerPortraitUrl };
  }
  if (imageUrl) {
    return { type: "image", url: imageUrl };
  }
  if (bannerLandscapeUrl) {
    return { type: "image", url: bannerLandscapeUrl };
  }
  return { type: "theme-default" };
}

/**
 * Composes `formatCoverDateRange` and `resolveCoverBackground` into the full
 * `CoverContent` structure. Pure.
 */
export function buildCoverContent(input: CoverInput): CoverContent {
  const venue = typeof input.venue === "string" ? input.venue.trim() : "";
  const location = typeof input.location === "string" ? input.location.trim() : "";
  const venueText = venue || location;
  return {
    title: input.title,
    dateText: formatCoverDateRange(input.date, input.end_date),
    ...(venueText ? { venueText } : {}),
    background: resolveCoverBackground(
      input.image_url,
      input.banner_landscape_url,
      input.banner_portrait_url
    ),
  };
}

// ─── Agenda_Section (Requirement 3) ──────────────────────────────────────────

/** A single session's raw data, with speaker names already resolved by the
 *  caller from `session_speakers`/`speakers` (this module does no joins). */
export interface AgendaSessionInput {
  id: string;
  title: string;
  /** ISO datetime string. */
  start_time: string;
  /** ISO datetime string. */
  end_time: string;
  speakerNames: string[];
  /** Session abstract/description (`sessions.description`), used only by
   *  the `"timetable-cards"` agenda layout's description block. Optional
   *  so older callers that don't fetch `sessions.description` keep
   *  working unchanged (the `"table"` layout never reads this field). */
  description?: string | null;
  /** Session category from `sessions.session_type` (e.g. "keynote",
   *  "panel", "break", "lunch", "networking", or an organizer-defined
   *  custom label). Consumed by the `"timetable-cards"` agenda layout
   *  to color-code the time/title chips (black for emphasized content
   *  sessions vs. accent for everything else), matching the reference
   *  DevOps Connect brochure's visual hierarchy on the agenda page.
   *  Optional so older callers/tests still compile unchanged; when
   *  absent, the row falls back to the accent color. */
  sessionType?: string | null;
}

/** One drawable agenda row. */
export interface AgendaRow {
  title: string;
  timeRangeText: string;
  /** Omitted (never an empty string) when the session has no speakers. */
  speakerLine?: string;
  /** Omitted (never an empty string) when the session has no description
   *  (post-trim). Only consumed by the `"timetable-cards"` agenda layout. */
  description?: string;
  /** Lowercased trimmed session category (see `AgendaSessionInput.
   *  sessionType`). Passed through verbatim rather than mapped to a
   *  color here — the color mapping lives in the renderer so a theme
   *  can override it. Omitted when the source was empty/null. */
  sessionType?: string;
}

/** Fully resolved, drawable Agenda_Section content. */
export interface AgendaSectionContent {
  rows: AgendaRow[];
  /** Set instead of `rows` being non-empty when there are zero sessions —
   *  Requirement 3.5's "explicit no-sessions message" choice. */
  emptyMessage?: string;
}

/** Human-readable time-of-day format shared by both ends of the range. */
const AGENDA_TIME_FORMAT = "h:mm a";

/** Builds one session's agenda row: title, formatted time range, and an
 *  omitted-when-absent speaker line. Never throws. */
function buildAgendaRow(session: AgendaSessionInput): AgendaRow {
  const startText = formatDate(new Date(session.start_time), AGENDA_TIME_FORMAT);
  const endText = formatDate(new Date(session.end_time), AGENDA_TIME_FORMAT);

  const row: AgendaRow = {
    title: session.title,
    timeRangeText: `${startText} - ${endText}`,
  };

  if (session.speakerNames.length > 0) {
    row.speakerLine = session.speakerNames.join(", ");
  }

  if (typeof session.description === "string" && session.description.trim().length > 0) {
    row.description = session.description.trim();
  }

  if (typeof session.sessionType === "string" && session.sessionType.trim().length > 0) {
    row.sessionType = session.sessionType.trim().toLowerCase();
  }

  return row;
}

/**
 * Builds agenda rows sorted by `start_time` ascending. Never throws. A
 * session with no assigned speakers (empty `speakerNames`) omits
 * `speakerLine` rather than rendering an empty or placeholder value. Pure.
 * Properties 27, 28.
 */
export function buildAgendaRows(sessions: AgendaSessionInput[]): AgendaRow[] {
  const sorted = [...sessions].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );
  return sorted.map(buildAgendaRow);
}

/** Fallback message rendered instead of a zero-row table when an event has
 *  no sessions (Requirement 3.5). */
const NO_SESSIONS_MESSAGE = "No sessions scheduled yet.";

/**
 * Wraps `buildAgendaRows` into the full `AgendaSectionContent` structure.
 * When `sessions` is empty, sets `emptyMessage` and `rows: []` instead of an
 * empty-but-present rows array being treated as a renderable data table.
 * Pure.
 */
export function buildAgendaSectionContent(sessions: AgendaSessionInput[]): AgendaSectionContent {
  if (sessions.length === 0) {
    return { rows: [], emptyMessage: NO_SESSIONS_MESSAGE };
  }
  return { rows: buildAgendaRows(sessions) };
}

// ─── Speakers_Section (Requirement 4) ────────────────────────────────────────

/** A single speaker's raw data, matching the confirmed `speakers` table
 *  columns used by the Speakers_Section. */
export interface SpeakerInput {
  id: string;
  name: string;
  photo_url?: string | null;
  title?: string | null;
  designation?: string | null;
  company?: string | null;
  display_order: number;
}

/** One drawable speaker row. */
export interface SpeakerRow {
  name: string;
  /** `title` preferred, falling back to `designation`; omitted (not an
   *  empty string) when neither is present. */
  subtitleLine?: string;
  /** Omitted (not an empty string) when `company` is absent. */
  companyLine?: string;
  photo: { type: "url"; url: string } | { type: "placeholder"; initial: string };
}

/** Builds the photo field for a speaker row: the real photo when
 *  `photo_url` is present, otherwise a placeholder keyed by the speaker's
 *  first initial (falling back to `"?"` when the name is empty/whitespace). */
function buildSpeakerPhoto(speaker: SpeakerInput): SpeakerRow["photo"] {
  if (speaker.photo_url) {
    return { type: "url", url: speaker.photo_url };
  }

  const trimmedName = speaker.name.trim();
  return { type: "placeholder", initial: (trimmedName[0] || "?").toUpperCase() };
}

/** Builds one speaker's row: name, title/designation-with-omission,
 *  independently-omitted company, and photo/placeholder. Never throws. */
function buildSpeakerRow(speaker: SpeakerInput): SpeakerRow {
  const row: SpeakerRow = {
    name: speaker.name,
    photo: buildSpeakerPhoto(speaker),
  };

  const subtitle = speaker.title || speaker.designation;
  if (subtitle) {
    row.subtitleLine = subtitle;
  }

  if (speaker.company) {
    row.companyLine = speaker.company;
  }

  return row;
}

/**
 * Builds speaker rows sorted by `display_order` ascending. Never throws.
 * `title` is preferred over `designation`, omitted entirely (not an empty
 * string) when neither is present; `company` is independently omitted when
 * absent. `photo_url` present resolves to `{ type: "url" }`; absent resolves
 * to a `{ type: "placeholder" }` keyed by the speaker's first initial. Pure.
 * Properties 29, 30, 31.
 */
export function buildSpeakerRows(speakers: SpeakerInput[]): SpeakerRow[] {
  const sorted = [...speakers].sort((a, b) => a.display_order - b.display_order);
  return sorted.map(buildSpeakerRow);
}

// ─── Sponsors_Section (Requirement 5) ────────────────────────────────────────

/** The five fixed Sponsor_Tier buckets a brochure groups sponsors into. */
export type SponsorTier = "platinum" | "gold" | "silver" | "bronze" | "custom";

/** A single sponsor's raw data. `tier` is an arbitrary string (matching the
 *  underlying `sponsors.tier` column's type); values not matching one of
 *  the five `SponsorTier` literals fall into the `"custom"` group, mirroring
 *  `tierAccentColor`'s own fallback. */
export interface SponsorInput {
  id: string;
  name: string;
  logo_url?: string | null;
  tier: string;
  display_order: number;
}

/** One drawable sponsor row. */
export interface SponsorRow {
  name: string;
  logo: { type: "url"; url: string } | { type: "text"; text: string };
}

/** One Sponsor_Tier group's drawable content. */
export interface SponsorTierGroup {
  tier: SponsorTier;
  /** Capitalized tier name, e.g. `"Platinum"`. */
  label: string;
  accentColor: string;
  sponsors: SponsorRow[];
}

/** The fixed set of recognized `SponsorTier` literals, used to narrow an
 *  arbitrary raw `tier` string. */
const KNOWN_TIERS: ReadonlySet<string> = new Set(["platinum", "gold", "silver", "bronze", "custom"]);

/** Narrows an arbitrary raw `tier` string to a `SponsorTier`, falling back
 *  to `"custom"` for any unrecognized value — mirroring `tierAccentColor`'s
 *  own fallback so the two never disagree. */
function normalizeSponsorTier(tier: string): SponsorTier {
  return KNOWN_TIERS.has(tier) ? (tier as SponsorTier) : "custom";
}

/**
 * Builds one sponsor's row: `logo_url` present resolves to an image
 * reference; absent resolves to the sponsor's name rendered as text. Never
 * throws. Pure. Property 35.
 */
export function buildSponsorRow(sponsor: SponsorInput): SponsorRow {
  if (sponsor.logo_url) {
    return { name: sponsor.name, logo: { type: "url", url: sponsor.logo_url } };
  }
  return { name: sponsor.name, logo: { type: "text", text: sponsor.name } };
}

/** Capitalizes a `SponsorTier` literal into its display label, e.g.
 *  `"platinum"` -> `"Platinum"`. */
function tierLabel(tier: SponsorTier): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

/**
 * Groups sponsors by their raw `tier` string value alone (no sub-splitting
 * by any label field — Requirement 5.2's rank list names exactly five
 * groups). Every input sponsor appears in exactly one group; no sponsor is
 * dropped or duplicated. Groups are ordered by the fixed `TIER_RANK`,
 * restricted to only the tiers actually present among the input. Pure.
 * Properties 33, 34.
 */
export function groupSponsorsByTierOrdered(sponsors: SponsorInput[]): SponsorTierGroup[] {
  const byTier = new Map<SponsorTier, SponsorRow[]>();

  for (const sponsor of sponsors) {
    const tier = normalizeSponsorTier(sponsor.tier);
    const rows = byTier.get(tier) ?? [];
    rows.push(buildSponsorRow(sponsor));
    byTier.set(tier, rows);
  }

  return [...byTier.keys()]
    .sort((a, b) => TIER_RANK[a] - TIER_RANK[b])
    .map((tier) => ({
      tier,
      label: tierLabel(tier),
      accentColor: tierAccentColor(tier),
      sponsors: byTier.get(tier) ?? [],
    }));
}

/**
 * `true` iff `sponsors.length > 0` — logo presence/absence never affects
 * this decision. Pure. Property 37.
 */
export function shouldRenderSponsorsSection(sponsors: SponsorInput[]): boolean {
  return sponsors.length > 0;
}

// ─── Venue_Logistics_Section (Requirement 6) ─────────────────────────────────

/** Raw venue/logistics fields the Venue_Logistics_Section needs. */
export interface VenueLogisticsInput {
  venue?: string | null;
  location?: string | null;
  mapEmbedUrl?: string | null;
  parkingNotes?: string | null;
  transitNotes?: string | null;
}

/** Fully resolved, drawable Venue_Logistics_Section content. */
export interface VenueLogisticsContent {
  venueName?: string;
  address?: string;
  /** Set iff `mapEmbedUrl` is a non-empty (post-trim) string. */
  qrCodeSourceUrl?: string;
  parkingNotes?: string;
  transitNotes?: string;
}

/** `true` iff `value` is a non-empty string after trimming. */
function isNonEmpty(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Includes exactly the subset of fields that are non-empty (post-`.trim()`)
 * strings; `qrCodeSourceUrl` is set iff `mapEmbedUrl` is non-empty. Returns
 * `null` when `venue`, `location`, `parkingNotes`, AND `transitNotes` are
 * ALL empty — a map URL alone does NOT force the section to render
 * (Requirement 6.5). Pure. Property 38.
 */
export function buildVenueLogisticsContent(input: VenueLogisticsInput): VenueLogisticsContent | null {
  const hasVenue = isNonEmpty(input.venue);
  const hasLocation = isNonEmpty(input.location);
  const hasParking = isNonEmpty(input.parkingNotes);
  const hasTransit = isNonEmpty(input.transitNotes);

  if (!hasVenue && !hasLocation && !hasParking && !hasTransit) {
    return null;
  }

  const content: VenueLogisticsContent = {};

  if (hasVenue) content.venueName = (input.venue as string).trim();
  if (hasLocation) content.address = (input.location as string).trim();
  if (isNonEmpty(input.mapEmbedUrl)) content.qrCodeSourceUrl = (input.mapEmbedUrl as string).trim();
  if (hasParking) content.parkingNotes = (input.parkingNotes as string).trim();
  if (hasTransit) content.transitNotes = (input.transitNotes as string).trim();

  return content;
}


// ─── Abstract_Section (Poster_Bold, page 2) ─────────────────────────────────

/** Raw content for the Poster_Bold Abstract page — sourced verbatim from
 *  `brochurePrefs.posterContent` on the event's page config. */
export interface AbstractSectionInput {
  abstract?: string | null;
  featured?: string | null;
  learningOutcomes?: string[] | null;
}

/** Fully resolved, drawable Abstract_Section content. */
export interface AbstractSectionContent {
  /** First card body text — omitted from the render when null. */
  abstract?: string;
  /** Second card body text — omitted from the render when null. */
  featured?: string;
  /** Grid of dark-chip outcomes. Guaranteed non-empty when this array
   *  key is set; when the input has no outcomes, this key is omitted
   *  entirely rather than being an empty array so the caller can
   *  short-circuit rendering the grid heading. */
  learningOutcomes?: string[];
}

/**
 * Builds the Abstract_Section content structure. Returns `null` when
 * every input field is empty (post-`.trim()`) so the caller can omit
 * the section entirely — mirrors `buildVenueLogisticsContent`'s
 * null-return contract. Pure.
 */
export function buildAbstractSectionContent(
  input: AbstractSectionInput
): AbstractSectionContent | null {
  const abstract = typeof input.abstract === "string" && input.abstract.trim().length > 0
    ? input.abstract.trim()
    : undefined;
  const featured = typeof input.featured === "string" && input.featured.trim().length > 0
    ? input.featured.trim()
    : undefined;
  const outcomes = (input.learningOutcomes ?? [])
    .map((o) => (typeof o === "string" ? o.trim() : ""))
    .filter((o) => o.length > 0);

  if (!abstract && !featured && outcomes.length === 0) {
    return null;
  }

  const content: AbstractSectionContent = {};
  if (abstract) content.abstract = abstract;
  if (featured) content.featured = featured;
  if (outcomes.length > 0) content.learningOutcomes = outcomes;
  return content;
}

// ─── WhySponsor_Section (Poster_Bold, page 3) ───────────────────────────────

/** Raw content for the Poster_Bold Why-Sponsor page. */
export interface WhySponsorSectionInput {
  items?: string[] | null;
}

/** Fully resolved, drawable Why-Sponsor content. */
export interface WhySponsorSectionContent {
  /** Ordered value-prop lines. Every item is a non-empty (post-trim)
   *  string; the caller assigns a sequential 1-indexed badge number to
   *  each one. */
  items: string[];
}

/**
 * Builds the Why-Sponsor content structure. Returns `null` when there
 * are zero non-empty items so the caller can omit the section entirely.
 * Pure.
 */
export function buildWhySponsorSectionContent(
  input: WhySponsorSectionInput
): WhySponsorSectionContent | null {
  const items = (input.items ?? [])
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s.length > 0);
  if (items.length === 0) return null;
  return { items };
}

// ─── Pricing_Section (Poster_Bold, page 5) ─────────────────────────────────

/** Raw content for one pricing card (one column on the Poster_Bold
 *  pricing page). */
export interface PricingCardInput {
  title: string;
  subtitle?: string | null;
  price: string;
  discounts?: string[] | null;
}

/** Raw content for the Poster_Bold Pricing page. */
export interface PricingSectionInput {
  cards?: PricingCardInput[] | null;
  showRegistrationForm?: boolean;
}

/** Fully resolved, drawable Pricing card. */
export interface PricingCard {
  title: string;
  subtitle?: string;
  price: string;
  discounts: string[];
}

/** Fully resolved, drawable Pricing_Section content. */
export interface PricingSectionContent {
  cards: PricingCard[];
  /** Whether to render a 3-row blank registration form below the cards
   *  (mirrors page 5 of the reference brochure). */
  showRegistrationForm: boolean;
}

/**
 * Builds the Pricing_Section content structure. Returns `null` when
 * there are zero pricing cards AND the registration form is disabled —
 * either condition alone (cards OR form) is enough for the section to
 * render. A card with an empty `title` OR `price` is dropped; a card
 * missing its `subtitle` or `discounts` still renders but the missing
 * fields are omitted. Pure.
 */
export function buildPricingSectionContent(
  input: PricingSectionInput
): PricingSectionContent | null {
  const cards: PricingCard[] = [];
  for (const raw of input.cards ?? []) {
    if (!raw) continue;
    const title = typeof raw.title === "string" ? raw.title.trim() : "";
    const price = typeof raw.price === "string" ? raw.price.trim() : "";
    if (title.length === 0 || price.length === 0) continue;

    const card: PricingCard = {
      title,
      price,
      discounts: (raw.discounts ?? [])
        .map((d) => (typeof d === "string" ? d.trim() : ""))
        .filter((d) => d.length > 0),
    };
    if (typeof raw.subtitle === "string" && raw.subtitle.trim().length > 0) {
      card.subtitle = raw.subtitle.trim();
    }
    cards.push(card);
  }

  const showRegistrationForm = input.showRegistrationForm === true;
  if (cards.length === 0 && !showRegistrationForm) return null;

  return { cards, showRegistrationForm };
}


// ─── SponsorshipPackages_Section (Classic + Poster_Bold + Corporate_Bold) ───
//
// Renders a tiered comparison table matching reference sponsorship-deck
// brochures: one row per benefit, one column per package tier, with a
// bottom "Cost" row. Any cell can be a checkmark/cross, plain text, or
// absent (renders as an em-dash). Fully dynamic — organizers can add or
// remove tiers and benefit rows freely; nothing here is hard-coded to a
// fixed tier count or benefit list, unlike the previous Poster_Bold
// "Why Sponsor" numbered list which only supported free-text bullets.

/** One package tier (a column in the comparison table), e.g. "Presenting
 *  Partner" or "Gold Partner". */
export interface SponsorshipTierInput {
  /** Column header, e.g. "Presenting Partner". */
  name: string;
  /** Headline price shown in the bottom row, e.g. "INR 8,00,000 + GST". */
  price?: string | null;
  /** One cell value per benefit row, in the same order as
   *  `SponsorshipPackagesInput.benefits`. A `true`/`false` boolean
   *  renders as a checkmark/cross glyph; a string renders verbatim
   *  (e.g. "10 meetings", "Top Position"); `null`/omitted renders as
   *  an em-dash so every column has a value for every row without the
   *  organizer needing to type a placeholder. */
  cells?: Array<string | boolean | null>;
}

/** Raw content for the SponsorshipPackages_Section. */
export interface SponsorshipPackagesInput {
  /** Optional heading shown above the table, e.g. "Premium Partnership
   *  Packages". Falls back to "Sponsorship Packages" when omitted. */
  title?: string | null;
  /** Row labels, e.g. ["Chairperson's Opening Remark", "Exhibit Table
   *  Space", ...] — the left-most column of the table. */
  benefits?: string[] | null;
  tiers?: SponsorshipTierInput[] | null;
}

/** One resolved comparison-table cell. `"check"`/`"cross"` render as
 *  glyphs; `"text"` renders the given string; `"empty"` renders an
 *  em-dash. */
export type SponsorshipCell =
  | { kind: "check" }
  | { kind: "cross" }
  | { kind: "text"; value: string }
  | { kind: "empty" };

/** Fully resolved, drawable sponsorship tier column. */
export interface SponsorshipTier {
  name: string;
  price?: string;
  /** Exactly `benefits.length` entries, one per row, in row order. */
  cells: SponsorshipCell[];
}

/** Fully resolved, drawable SponsorshipPackages_Section content. */
export interface SponsorshipPackagesContent {
  title: string;
  benefits: string[];
  tiers: SponsorshipTier[];
}

const DEFAULT_SPONSORSHIP_TITLE = "Sponsorship Packages";

/** Resolves one raw cell value to a drawable `SponsorshipCell`. Pure. */
function resolveSponsorshipCell(raw: string | boolean | null | undefined): SponsorshipCell {
  if (raw === true) return { kind: "check" };
  if (raw === false) return { kind: "cross" };
  if (typeof raw === "string" && raw.trim().length > 0) {
    return { kind: "text", value: raw.trim() };
  }
  return { kind: "empty" };
}

/**
 * Builds the SponsorshipPackages_Section content structure: a benefits ×
 * tiers comparison table. Returns `null` when there are zero benefit rows
 * OR zero tiers with a non-empty name — a table needs both an axis of rows
 * and an axis of columns to mean anything. Every tier's `cells` array is
 * padded/truncated to exactly `benefits.length` entries (missing cells
 * resolve to `{ kind: "empty" }`, extra cells are dropped) so the pure
 * renderer downstream never needs to guard against a jagged table. Pure.
 */
export function buildSponsorshipPackagesContent(
  input: SponsorshipPackagesInput
): SponsorshipPackagesContent | null {
  const benefits = (input.benefits ?? [])
    .map((b) => (typeof b === "string" ? b.trim() : ""))
    .filter((b) => b.length > 0);

  const tiers: SponsorshipTier[] = [];
  for (const raw of input.tiers ?? []) {
    if (!raw) continue;
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (name.length === 0) continue;

    const cells = benefits.map((_, i) => resolveSponsorshipCell(raw.cells?.[i]));
    const tier: SponsorshipTier = { name, cells };
    if (typeof raw.price === "string" && raw.price.trim().length > 0) {
      tier.price = raw.price.trim();
    }
    tiers.push(tier);
  }

  if (benefits.length === 0 || tiers.length === 0) return null;

  const title =
    typeof input.title === "string" && input.title.trim().length > 0
      ? input.title.trim()
      : DEFAULT_SPONSORSHIP_TITLE;

  return { title, benefits, tiers };
}

// ─── FocusOfSummit_Section (Corporate_Bold) ────────────────────────────────

export interface FocusOfSummitInput {
  items?: string[] | null;
}
export interface FocusOfSummitContent {
  items: string[];
}
export function buildFocusOfSummitContent(
  input: FocusOfSummitInput
): FocusOfSummitContent | null {
  const items = (input.items ?? [])
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s.length > 0);
  return items.length > 0 ? { items } : null;
}

// ─── WhoShouldAttend_Section (Corporate_Bold) ──────────────────────────────

export interface WhoShouldAttendInput {
  description?: string | null;
  items?: string[] | null;
}
export interface WhoShouldAttendContent {
  description?: string;
  items: string[];
}
export function buildWhoShouldAttendContent(
  input: WhoShouldAttendInput
): WhoShouldAttendContent | null {
  const description =
    typeof input.description === "string" && input.description.trim().length > 0
      ? input.description.trim()
      : undefined;
  const items = (input.items ?? [])
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s.length > 0);
  if (!description && items.length === 0) return null;
  const content: WhoShouldAttendContent = { items };
  if (description) content.description = description;
  return content;
}

// ─── SolutionProviders_Section (Corporate_Bold) ────────────────────────────

export interface SolutionProvidersInput {
  description?: string | null;
}
export interface SolutionProvidersContent {
  description: string;
}
export function buildSolutionProvidersContent(
  input: SolutionProvidersInput
): SolutionProvidersContent | null {
  const description =
    typeof input.description === "string" && input.description.trim().length > 0
      ? input.description.trim()
      : undefined;
  return description ? { description } : null;
}

// ─── Highlights_Section (Corporate_Bold) ───────────────────────────────────

/** Content for the two side-by-side gradient cards on the Highlights page
 *  ("Why Finance 6.0 Matters" + "What You Will Gain" in the reference). */
export interface HighlightsInput {
  leftTitle?: string | null;
  leftItems?: string[] | null;
  rightTitle?: string | null;
  rightItems?: string[] | null;
}
export interface HighlightCard {
  title: string;
  items: string[];
}
export interface HighlightsContent {
  cards: HighlightCard[];
}
export function buildHighlightsContent(input: HighlightsInput): HighlightsContent | null {
  const buildCard = (title: string | null | undefined, items: string[] | null | undefined): HighlightCard | null => {
    const t = typeof title === "string" && title.trim().length > 0 ? title.trim() : undefined;
    const list = (items ?? [])
      .map((s) => (typeof s === "string" ? s.trim() : ""))
      .filter((s) => s.length > 0);
    if (!t && list.length === 0) return null;
    return { title: t ?? "", items: list };
  };

  const cards: HighlightCard[] = [];
  const left = buildCard(input.leftTitle, input.leftItems);
  const right = buildCard(input.rightTitle, input.rightItems);
  if (left) cards.push(left);
  if (right) cards.push(right);
  return cards.length > 0 ? { cards } : null;
}
