# Design Document: Event Brochure Generator

## Overview

The Brochure_Generator lets an organizer produce a printable, multi-page branded
PDF brochure (cover, agenda, speakers, sponsors, venue/logistics) for an event,
auto-populated from data already in the platform. It extends the PDF pipeline
already proven three times in this codebase — `src/lib/ticket-pdf.ts`,
`src/lib/print-badges.ts`, `src/lib/reports/pdf.ts` — using **`jsPDF` +
`jspdf-autotable`** (both already dependencies). No new PDF, HTML-to-PDF, or
headless-browser dependency is introduced, and generation is synchronous,
client-side, matching every other PDF feature in this codebase.

Architecturally this spec follows the same *pure content-builder vs. imperative
renderer* split established by `.kiro/specs/social-creative-generator/`'s
`creative-renderer.ts` (plan builders vs. canvas-drawer), adapted for jsPDF's
paginated-document model instead of a fixed-size canvas:

- **`src/lib/brochure/brochure-templates.ts`** — `Brochure_Theme` registry (3
  code-defined presets), theme-color resolution against `EventPageConfig.theme`
  (Property 24), Section_Layout resolution (Property 39), and generic pure
  layout helpers (image-fit-without-upscale, PDF font-family mapping) shared
  across sections.
- **`src/lib/brochure/brochure-sections.ts`** — pure section **content**
  builders: one per Brochure_Section (cover, agenda, speakers, sponsors,
  venue/logistics). Each takes entity data + resolved theme and returns a
  plain data structure describing *what* to render — never touches `jsPDF`,
  `fetch`, or the DOM. This is what makes Properties 27–31, 33–35, 38
  testable with `fast-check` without a real PDF document.
- **`src/lib/brochure/brochure-pdf.ts`** — the imperative assembly pipeline:
  loads remote images as data URLs (required by `jsPDF.addImage`, see
  Components below), draws each section's content structure onto a shared
  `jsPDF` document using `doc.addPage()` / `autoTable`'s automatic
  page-break-and-repeat-header behavior, adds page-number footers, and
  produces the final `Blob` (export) or `bloburl` (live preview) — the *same*
  document-building function backs both, so the preview is never a
  second, drift-prone rendering path.

No new database table and no new Storage bucket are introduced. The feature
is read-only against `events`, `sessions`, `speakers`/`event_speakers`, and
`sponsors`/`event_sponsors`; the only new persisted state is a small
`brochurePrefs` JSON preference block added to the *existing*
`events.page_config` column (additive, optional field — no migration
required, following the exact precedent of `creativeTemplatePrefs` in the
social-creative-generator spec).

New UI lives under `src/components/event/brochure/`, following the
settings-panel + live-preview layout already established by
`PrintBadgesDialog.tsx` and `CreativeGeneratorDialog.tsx`.

## Architecture

```mermaid
flowchart TD
    subgraph UI["src/components/event/brochure/"]
        BCD[BrochureConfiguratorDialog<br/>theme + color/font override + section list]
        BSL[BrochureSectionList<br/>dnd-kit reorder + include/exclude toggles]
        BPF[BrochurePreviewFrame<br/>&lt;iframe&gt; bound to a jsPDF bloburl]
    end

    subgraph Lib["src/lib/brochure/"]
        BT[brochure-templates.ts<br/>Brochure_Theme registry<br/>theme resolution + Section_Layout resolution<br/>image-fit + font-family mapping]
        BS[brochure-sections.ts<br/>pure per-section content builders]
        BP[brochure-pdf.ts<br/>image loading + jsPDF/autoTable assembly<br/>buildBrochureDocument (shared by preview + export)]
    end

    subgraph Data["Supabase (read-only)"]
        EV[(events<br/>title, date, end_date, venue, location,<br/>image_url, banner_landscape_url, page_config)]
        SE[(sessions)]
        SP[(speakers / event_speakers)]
        SN[(sponsors / event_sponsors)]
    end

    BCD --> BT
    BCD --> BSL
    BCD --> BPF
    BPF -- debounced 400ms --> BP
    BCD -- "Download PDF" --> BP
    BP --> BS
    BS --> BT
    BCD -- read/write brochurePrefs --> EV
    BP -- fetch (read-only) --> EV
    BP -- fetch (read-only) --> SE
    BP -- fetch (read-only) --> SP
    BP -- fetch (read-only) --> SN
```

**Pipeline (single build, two outputs):**

1. `BrochureConfiguratorDialog` fetches the event's own data (title, dates,
   venue, image URLs, `page_config`), its `sessions`, linked `speakers`, and
   linked `sponsors` once when it opens.
2. The organizer picks a `Brochure_Theme`, optionally overrides a color/font,
   and reorders/toggles the five Brochure_Sections via `BrochureSectionList`.
3. `resolveSectionLayout` (pure, Property 39) turns the current
   `Section_Layout` into an ordered list of *included* section ids — the
   **same** call is made by the live preview and by the final export, so
   they can never diverge.
4. For each included section, the matching pure builder in
   `brochure-sections.ts` turns entity data + resolved theme into a content
   structure (`CoverContent`, `AgendaSectionContent`, etc.).
5. `buildBrochureDocument` (imperative, `brochure-pdf.ts`) walks the resolved
   section list, loads any images that content structure references (as data
   URLs — see below), and draws each section onto a shared `jsPDF` instance
   using `doc.addPage()` between sections and `autoTable` for the
   tabular agenda/sponsor listings. After all sections are drawn, a final
   pass adds the page-number footer to every page (Requirement 9.4).
6. The **same** `jsPDF` instance then either becomes the exported file
   (`doc.output("blob")`, downloaded via the `URL.createObjectURL` pattern
   already used by `downloadTicketPdf`) or the live preview
   (`doc.output("bloburl")`, set as an `<iframe src>` — see Components below).

Separating step 4 (pure, testable) from step 5 (imperative, jsPDF-only) is
what makes Properties 27, 28, 29, 30, 31, 33, 34, 35, 38 practical to test
with `fast-check` — the content-assembly logic never touches `jsPDF`,
`fetch`, or `qrcode`.

## Components and Interfaces

### `src/lib/brochure/brochure-templates.ts`

```typescript
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

export const BROCHURE_THEMES: BrochureTheme[] = [
  /* "Classic Editorial"  — banner-strip cover, grid tables, serif mapping   */
  /* "Modern Minimal"     — centered-card cover, striped tables, sans mapping */
  /* "Bold Conference"    — full-bleed-image cover, plain tables, larger accent bar */
];

export function brochureThemesList(): BrochureTheme[]; // BROCHURE_THEMES, exposed as a function for symmetry with `templatesFor`

// ─── Theme resolution (Property 24) ──────────────────────────────────────────

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
): ResolvedBrochureColors;

/**
 * Maps an arbitrary event `fontFamily` string (one of `FONT_OPTIONS` in
 * `src/components/event/page-form/presets.ts`, e.g. "Playfair Display",
 * "JetBrains Mono") onto one of jsPDF's three built-in base-14 font
 * families. jsPDF cannot render arbitrary Google Fonts without embedding a
 * TTF via `doc.addFont` (a much larger scope this spec doesn't take on —
 * see Data Models / design decisions); this mapping keeps the organizer's
 * font *choice* meaningfully reflected (serif vs. sans vs. mono) without
 * embedding font files. Pure, deterministic, defaults to `"helvetica"`.
 */
export function resolveFontFamilyForPdf(fontFamily: string | undefined): "helvetica" | "times" | "courier";

// ─── Sponsor tier accent color — reused, not reimplemented (Property 36) ────

/** Re-exported directly from `@/lib/creatives/creative-templates` so the
 *  brochure's Sponsor_Tier heading colors are byte-identical to the
 *  Creative_Generator's (and, transitively, `SponsorManagement.tsx`'s
 *  `TIERS` mapping) by construction — Property 36 is satisfied by sharing
 *  the one function, not by re-deriving the same palette a third time. */
export { tierAccentColor } from "@/lib/creatives/creative-templates";

export const TIER_RANK: Record<"platinum" | "gold" | "silver" | "bronze" | "custom", number> = {
  platinum: 0, gold: 1, silver: 2, bronze: 3, custom: 4,
};

// ─── Image fit-without-upscale (Property 32) ────────────────────────────────

export interface ImageBoxMm { width: number; height: number; }

/**
 * Given a layout slot's box (mm) and an image's natural pixel dimensions,
 * returns a box uniformly scaled to fit within the slot: `width`/`height`
 * equal the natural dimensions' aspect-ratio-preserving fit, never
 * stretched non-uniformly. When `allowUpscale` is `false` (the default —
 * used for speaker photos and sponsor logos, Requirement 4.6/5.6), the
 * scale factor is capped at `1` so small source images are never enlarged
 * beyond their native size. When `allowUpscale` is `true` (used only for
 * the Cover_Section's hero image, which has no such constraint in the
 * requirements), the scale factor is uncapped so small cover images still
 * fill their slot attractively. Pure. Property 32 covers the
 * `allowUpscale: false` mode exactly.
 */
export function fitImageBox(
  slot: ImageBoxMm,
  naturalWidth: number,
  naturalHeight: number,
  opts?: { allowUpscale?: boolean }
): ImageBoxMm;

// ─── Section_Layout resolution (Property 39) ────────────────────────────────

export interface SectionLayoutEntry { id: BrochureSectionId; included: boolean; }
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
 * excluded entries are dropped (Requirement 7.3). Pure, and called by BOTH
 * `BrochurePreviewFrame` and `buildBrochureDocument` (export), so the
 * preview and the export can never diverge by construction (Property 39).
 */
export function resolveSectionLayout(layout: SectionLayout): BrochureSectionId[];

// ─── Filename (Property 40) ─────────────────────────────────────────────────

/** e.g. "annual-tech-summit-2026.pdf". Sanitizes the event title to a
 *  filesystem-safe slug; falls back to "brochure" when the title contains
 *  no alphanumeric characters. Pure. */
export function buildBrochureFilename(eventTitle: string): string;

// ─── Access control (Requirement 10) ────────────────────────────────────────

/**
 * Pure UI-layer gate, deliberately mirroring (not importing —
 * `src/lib/brochure` has no dependency on `src/lib/creatives`)
 * `isAuthorizedForEventCreatives`'s owner-or-admin predicate: `true` iff
 * the requester owns the event or is a platform admin. This is a UI-level
 * convenience only — see Error Handling for the actual RLS enforcement
 * discussion.
 */
export function isAuthorizedForBrochureGeneration(
  ownerId: string,
  requesterId: string,
  isAdmin: boolean
): boolean;
```

**Why three code-defined `Brochure_Theme` presets, not a builder.** Mirrors
the social-creative-generator spec's `CreativeTemplate` registry exactly —
Brochure_Themes are static, code-defined layout presets (cover style, table
styling, margins), not a database-backed template builder. The three presets
cover the three cover styles (`full-bleed-image`, `banner-strip`,
`centered-card`) and the three `autoTable` themes (`grid`, `striped`,
`plain`) so an organizer has a genuinely different visual result to choose
between, matching Requirement 1.1.

**Why `resolveFontFamilyForPdf` instead of embedding the organizer's actual
Google Font.** `jsPDF` ships only the PDF base-14 fonts
(`helvetica`/`times`/`courier`/`symbol`/`zapfdingbats`) unless a TTF is
embedded via `doc.addFont(...)`, which every existing PDF feature in this
codebase (`ticket-pdf.ts`, `print-badges.ts`'s non-print paths aren't
relevant here, `reports/pdf.ts`) avoids by hardcoding `"helvetica"`. Font
embedding would mean fetching every `FONT_OPTIONS` Google Font's TTF file at
generation time (network cost, license/subsetting complexity) for a
cosmetic win. This design instead buckets the event's `fontFamily` into the
serif/sans/mono family it most resembles — Requirement 1.2 is satisfied in
spirit (the organizer's font *choice* changes the PDF's typography) without
introducing a font-fetching/embedding subsystem. Flagging this as a
deliberate scope decision; full font embedding could be a later enhancement
mirroring how AI backgrounds were later layered onto the social creative
generator.

### `src/lib/brochure/brochure-sections.ts`

Pure content builders — no `jsPDF`, no `fetch`, no DOM. Each returns a plain
data structure the imperative renderer in `brochure-pdf.ts` consumes.

```typescript
// ─── Cover_Section (Requirement 2) ───────────────────────────────────────────

export interface CoverInput {
  title: string;
  date: string;        // ISO
  end_date?: string | null;
  image_url?: string | null;
  banner_landscape_url?: string | null;
}
export interface CoverContent {
  title: string;
  dateText: string;
  background: { type: "image"; url: string } | { type: "theme-default" };
}

/** Renders a single formatted date when `end_date` is absent or the exact
 *  same instant as `date`; renders "<date> – <end_date>" otherwise. Pure.
 *  Property 25. */
export function formatCoverDateRange(date: string, endDate?: string | null): string;

/** `image_url` when defined, else `banner_landscape_url` when defined, else
 *  the theme's default background — always exactly one source. Pure.
 *  Property 26. */
export function resolveCoverBackground(
  imageUrl?: string | null,
  bannerLandscapeUrl?: string | null
): { type: "image"; url: string } | { type: "theme-default" };

export function buildCoverContent(input: CoverInput): CoverContent;

// ─── Agenda_Section (Requirement 3) ──────────────────────────────────────────

export interface AgendaSessionInput {
  id: string;
  title: string;
  start_time: string; // ISO
  end_time: string;   // ISO
  speakerNames: string[]; // already resolved by the caller from session_speakers/speakers
}
export interface AgendaRow {
  title: string;
  timeRangeText: string;
  speakerLine?: string; // omitted, never an empty string, when no speakers
}
export interface AgendaSectionContent {
  rows: AgendaRow[];
  /** Set instead of `rows` being non-empty when there are zero sessions —
   *  Requirement 3.5's "explicit no-sessions message" choice (see Error
   *  Handling for why "render a message" was chosen over "omit"). */
  emptyMessage?: string;
}

/** Sorted by `start_time` ascending. Never throws. A session with no
 *  assigned speaker omits `speakerLine` rather than rendering an empty or
 *  placeholder value. Pure. Properties 27, 28. */
export function buildAgendaRows(sessions: AgendaSessionInput[]): AgendaRow[];

export function buildAgendaSectionContent(sessions: AgendaSessionInput[]): AgendaSectionContent;

// ─── Speakers_Section (Requirement 4) ────────────────────────────────────────

export interface SpeakerInput {
  id: string;
  name: string;
  photo_url?: string | null;
  title?: string | null;
  designation?: string | null;
  company?: string | null;
  display_order: number;
}
export interface SpeakerRow {
  name: string;
  /** `title` preferred, falling back to `designation`; omitted (not an
   *  empty string) when neither is present. */
  subtitleLine?: string;
  companyLine?: string; // omitted when absent
  photo: { type: "url"; url: string } | { type: "placeholder"; initial: string };
}

/** Sorted by `display_order` ascending. Never throws. Pure. Properties 29,
 *  30, 31. */
export function buildSpeakerRows(speakers: SpeakerInput[]): SpeakerRow[];

// ─── Sponsors_Section (Requirement 5) ────────────────────────────────────────

export type SponsorTier = "platinum" | "gold" | "silver" | "bronze" | "custom";
export interface SponsorInput {
  id: string;
  name: string;
  logo_url?: string | null;
  tier: string; // narrowed to SponsorTier at the group boundary; unrecognized
                // values fall into "custom" per `tierAccentColor`'s own fallback
  display_order: number;
}
export interface SponsorRow {
  name: string;
  logo: { type: "url"; url: string } | { type: "text"; text: string };
}
export interface SponsorTierGroup {
  tier: SponsorTier;
  label: string;         // "Platinum" | "Gold" | "Silver" | "Bronze" | "Custom"
  accentColor: string;   // tierAccentColor(tier)
  sponsors: SponsorRow[];
}

/** Groups sponsors by their `Sponsor_Tier` value alone (the brochure does
 *  NOT further split "custom" by `tier_label` the way
 *  `SponsorManagement.tsx`'s drag-and-drop grouping does — Requirement 5.2's
 *  rank list names exactly 5 groups, so this design keeps one "Custom"
 *  group in the brochure regardless of each sponsor's individual
 *  `tier_label`; see Data Models for the full rationale). Groups are
 *  ordered by the fixed `TIER_RANK`, restricted to tiers actually present.
 *  Every input sponsor appears in exactly one group; no sponsor is dropped
 *  or duplicated. Pure. Properties 33, 34. */
export function groupSponsorsByTierOrdered(sponsors: SponsorInput[]): SponsorTierGroup[];

/** `logo_url` present → image reference; absent → the sponsor's name as a
 *  text fallback (never both, never neither). Pure. Property 35. */
export function buildSponsorRow(sponsor: SponsorInput): SponsorRow;

/** `true` iff `sponsors.length > 0` — logo presence/absence never affects
 *  this decision. Pure. Property 37. */
export function shouldRenderSponsorsSection(sponsors: SponsorInput[]): boolean;

// ─── Venue_Logistics_Section (Requirement 6) ─────────────────────────────────

export interface VenueLogisticsInput {
  venue?: string | null;
  location?: string | null;
  mapEmbedUrl?: string | null;
  parkingNotes?: string | null;
  transitNotes?: string | null;
}
export interface VenueLogisticsContent {
  venueName?: string;
  address?: string;
  qrCodeSourceUrl?: string; // set iff mapEmbedUrl is a non-empty string
  parkingNotes?: string;
  transitNotes?: string;
}

/** Includes exactly the subset of fields that are non-empty (post-trim)
 *  strings; `qrCodeSourceUrl` is set iff `mapEmbedUrl` is non-empty. Returns
 *  `null` when `venue`, `location`, `parkingNotes`, and `transitNotes` are
 *  ALL empty — matching Requirement 6.5's inclusion rule exactly (a map URL
 *  alone does not force the section to render). Pure. Property 38. */
export function buildVenueLogisticsContent(input: VenueLogisticsInput): VenueLogisticsContent | null;
```

### `src/lib/brochure/brochure-pdf.ts`

The only module in this feature that imports `jspdf`, `jspdf-autotable`, or
`qrcode`, or calls `fetch`.

```typescript
export interface BrochureGenerationInput {
  event: {
    title: string;
    date: string;
    end_date?: string | null;
    venue?: string | null;
    location?: string | null;
    image_url?: string | null;
    banner_landscape_url?: string | null;
  };
  sessions: AgendaSessionInput[];
  speakers: SpeakerInput[];
  sponsors: SponsorInput[];
  venueLogistics: VenueLogisticsInput;
  theme: BrochureTheme;
  eventTheme: EventThemeInput;
  themeOverride?: BrochureThemeOverride;
  sectionLayout: SectionLayout;
  /** Fires once per included section as it finishes drawing, for the
   *  Brochure_Configurator's progress indicator (Requirement 9.3). */
  onProgress?: (completedSections: number, totalSections: number) => void;
}

/** Builds the shared `jsPDF` document — the ONE function both the export
 *  path and the live-preview path call, so they can never produce
 *  different content for the same input (reinforces Property 39 at the
 *  assembly layer, not just the pure resolver layer). Not exported;
 *  `generateBrochurePdf` and `buildBrochurePreviewUrl` are the public
 *  entry points below. */
async function buildBrochureDocument(input: BrochureGenerationInput): Promise<jsPDF>;

/** Export path: returns the final PDF as a `Blob`. */
export async function generateBrochurePdf(input: BrochureGenerationInput): Promise<Blob>;

/** Triggers a browser download, mirroring `downloadTicketPdf`'s
 *  object-URL pattern exactly. Filename via `buildBrochureFilename`
 *  (Requirement 9.2). */
export async function downloadBrochurePdf(input: BrochureGenerationInput, eventTitle: string): Promise<void>;

/** Live-preview path: returns a `blob:` object URL
 *  (`doc.output("bloburl")`) suitable for an `<iframe src>`. Caller is
 *  responsible for revoking the PREVIOUS url via `URL.revokeObjectURL`
 *  before requesting a new one (see `BrochurePreviewFrame`). */
export async function buildBrochurePreviewUrl(input: BrochureGenerationInput): Promise<string>;
```

**Image loading — why `fetch` + `FileReader`, not `Image.crossOrigin` like
the canvas renderer.** `jsPDF.addImage(imageData, ...)` accepts a
`string | HTMLImageElement | HTMLCanvasElement | Uint8Array`, but per its
actual implementation (`getImageProperties`, which `addImage` calls
internally), a plain remote URL string is **not** usable directly: jsPDF
first checks whether the string is already a base64/data URI; if not, it
falls back to its `loadFile` plugin, which performs a **synchronous** XHR —
blocked by most browsers for cross-origin requests and undesirable in a UI
thread regardless. Every image handed to `addImage` in this pipeline is
therefore pre-converted to a data URL client-side:

```typescript
/** Fetches `url` and resolves to a `data:` URL, or `null` on any failure
 *  (network error, non-2xx, CORS block) — never throws, mirroring
 *  `creative-renderer.ts`'s `loadImage`'s never-throw contract so callers
 *  can uniformly fall back to a Missing_Data_Placeholder. Logs
 *  `logger.warn("brochure image load failed", { url })` on failure. */
async function loadImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    logger.warn("brochure image load failed", { url, error_message: (err as Error).message });
    return null;
  }
}
```

This is the same conversion target as `badge-design.ts`'s `fileToDataUrl`
(there converting a local `File`; here converting a fetched remote `Blob`) —
no new pattern is introduced, just applied to a `fetch` response instead of
a file input.

**Natural image dimensions for `fitImageBox` — via `doc.getImageProperties`,
not an `Image` element.** Once an image is a data URL, `jsPDF` can report
its natural pixel dimensions directly via `doc.getImageProperties(dataUrl)`
(`{ width, height, ... }`) — no separate `new Image()` load-and-wait step is
needed (unlike the canvas renderer, which needs a real `HTMLImageElement` to
draw with `ctx.drawImage`). `fitImageBox(slot, props.width, props.height)`
then produces the exact destination `w`/`h` passed to `addImage(dataUrl, x,
y, w, h)` — since that destination box preserves the source's aspect ratio
by construction, `addImage`'s native "stretch source into w×h" behavior
produces zero distortion despite `jsPDF.addImage` having no source-region
crop parameter (unlike canvas's 9-argument `drawImage`). This single
mechanism is used for the Cover_Section's hero image (with
`allowUpscale: true`), speaker photos, and sponsor logos — one image-loading
path, one fitting helper, for every image in the pipeline. (A cropped
"cover-fill" hero treatment was considered and rejected: `jsPDF.addImage`
has no source-rect crop, so a true edge-to-edge crop would require a second,
canvas-based cropping step purely for the cover image; contain-fit keeps the
pipeline to one mechanism and nothing in Requirement 2 mandates a
full-bleed-cropped cover.)

**Missing_Data_Placeholder rendering.** When `loadImageAsDataUrl` resolves
`null` for a speaker's `photo_url` (or the field was absent to begin with —
`buildSpeakerRows` already encodes this as `{ type: "placeholder", initial
}`), `brochure-pdf.ts` draws a filled rectangle (theme's accent color) sized
to the photo slot with the speaker's initial centered in white text
(`doc.setFillColor` + `doc.rect(..., "F")` + `doc.text(..., { align:
"center" })`) — the same visual fallback concept as
`creative-renderer.ts`'s `drawImagePlaceholder`, reimplemented with jsPDF's
own drawing primitives (no canvas). A sponsor with no `logo_url` never
reaches an image-drawing code path at all — `buildSponsorRow` already
produced a `{ type: "text" }` row (Requirement 5.4), so the renderer just
calls `doc.text(...)`.

**Agenda_Section / Sponsors_Section tables — `jspdf-autotable`.** Both are
rendered via `autoTable(doc, { head, body, startY, theme: resolvedTheme.table.theme,
didDrawPage })`, exactly matching `reports/pdf.ts`'s pattern including the
`y = (doc as any).lastAutoTable?.finalY` cursor convention. `autoTable`'s
built-in pagination (repeating the `head` row automatically when a table's
`body` overflows onto a new page) is precisely what satisfies Requirement
3.4's "repeat column headers on each new page" — no custom pagination logic
is written for these two sections. The Sponsors_Section renders one
`autoTable` call per `SponsorTierGroup` (so each tier's heading — colored via
`tierAccentColor`, Requirement 5.5 — sits directly above its own table),
continuing the Y-cursor across groups and checking remaining page height
before each group's heading the same way `reports/pdf.ts` does before each
named table.

**Speakers_Section — manual grid pagination, not `autoTable`.** Speaker
cards are a photo+name+title grid, not a data table, so `autoTable` doesn't
apply. `brochure-pdf.ts` lays out a fixed-column grid (columns computed from
`theme.margins` and a fixed card width), tracking a running Y cursor; when
the next card's bottom would exceed the page's printable height, it calls
`doc.addPage()` and resets Y to the top margin — the same
"track cursor, `addPage()` when it would overflow" idea `reports/pdf.ts`
uses before drawing each named table, just applied per-card instead of
per-table.

**Page-number footer — a final pass over every page, not a per-page
`didDrawPage` callback.** `reports/pdf.ts`'s `didDrawPage` callback prints
`${currentPage} / ${pageCount}` *while a table is being drawn*, which is
only correct if no further pages are appended afterward — not safe here,
since a brochure interleaves multiple sections (tables and non-table grids)
across many pages, so an early section's `didDrawPage` callback would see an
incomplete `pageCount`. Instead, `buildBrochureDocument` draws every
section first, then does one final loop:

```typescript
const totalPages = doc.getNumberOfPages();
for (let i = 1; i <= totalPages; i++) {
  doc.setPage(i);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`${i} / ${totalPages}`, pageWidth - margin, pageHeight - 6, { align: "right" });
}
```

This guarantees every footer shows the correct, final total page count
(Requirement 9.4) regardless of how many sections/pages preceded it.

### UI: `src/components/event/brochure/`

```
src/components/event/brochure/
├── BrochureConfiguratorDialog.tsx   // theme picker, color/font override, section list, generate action
├── BrochureSectionList.tsx          // dnd-kit sortable list: 5 fixed rows, drag to reorder, switch to include/exclude
└── BrochurePreviewFrame.tsx         // <iframe> bound to a debounced-regenerated jsPDF bloburl
```

**`BrochureConfiguratorDialog`** fetches the event's row (title, dates,
venue/location, image URLs, `page_config`), `sessions`, `event_speakers` →
`speakers`, and `event_sponsors` → `sponsors` once on open (mirroring
`CreativesSection.tsx`'s single-fetch-on-mount pattern), then renders a
two-pane layout identical in spirit to `CreativeGeneratorDialog`: left pane
has the `Brochure_Theme` picker (3 thumbnails), color swatches
(`COLOR_SWATCHES`) and font select (`FONT_OPTIONS`, both from
`src/components/event/page-form/presets.ts`) as *overrides* over the event's
own `theme.primaryColor`/`accentColor`/`fontFamily`, and `BrochureSectionList`;
right pane hosts `BrochurePreviewFrame`. The footer's primary action calls
`downloadBrochurePdf`, shows a progress bar (Radix `Progress`, already a
dependency) driven by `onProgress`, and a "Save as event default" toggle
persisting the current theme id + Section_Layout into
`page_config.brochurePrefs` (see Data Models) via the same
`supabase.from("events").update({ page_config })` call `EventPageForm.tsx`
already uses.

**`BrochureSectionList`** renders the five Brochure_Sections as a
`@dnd-kit/sortable` vertical list (using `DndContext` / `SortableContext` /
`useSortable` exactly as `SponsorManagement.tsx`'s existing sponsor-tier
drag-and-drop does — `@dnd-kit/core`, `@dnd-kit/sortable`, and
`@dnd-kit/utilities` are already dependencies, no new library needed), each
row with a drag handle and an include/exclude `Switch`. Per Requirement 7.5,
there is deliberately no control here (or anywhere in this feature) to
reorder speakers/sponsors/sessions within a section — only the five
section-type rows are draggable.

**`BrochurePreviewFrame`** mirrors `CreativePreviewCanvas.tsx`'s /
`PrintBadgesDialog.tsx`'s exact debounce pattern: a `useMemo`-wrapped async
`refreshPreview` (deps = theme id, override colors/font, Section_Layout, and
the fetched entity data) paired with a `useEffect` that debounces
re-invoking it by 400ms whenever those deps change. `refreshPreview` calls
`buildBrochurePreviewUrl`, revokes the previous `blob:` URL via
`URL.revokeObjectURL`, and sets the new URL as an `<iframe src>`.

*Investigated: does `jsPDF` support a live-preview-friendly output?* Yes —
`doc.output("bloburl")` returns a `blob:` object URL string that, set as an
`<iframe src>` (or `<embed src>`), renders using the browser's own built-in
PDF viewer. This is the reason the preview and the export share
`buildBrochureDocument`: there is no second rendering path to keep in sync
(unlike, say, a canvas-based fake preview would require). The one caveat:
browsers/webviews without a built-in inline PDF viewer (notably some mobile
in-app browsers) won't render the iframe's content. `BrochurePreviewFrame`
detects this heuristically via `navigator.pdfViewerEnabled` (supported in
current Chrome/Firefox/Edge) and, when it's `false`/unavailable, replaces
the iframe with a message ("Live preview isn't available on this
browser — download to view") plus an "Open in new tab"
(`window.open(blobUrl)`) fallback button, which works in substantially more
environments than an inline iframe does. This is a pragmatic, documented
scope decision rather than building a second, canvas-based preview renderer
that would need to be kept pixel-for-pixel consistent with the real jsPDF
output.

**Entry point.** A new sidebar item in `EventDetailPage.tsx`
(`{ label: "Brochure", icon: BookOpenText, key: "brochure" }`, lazy-loaded
like `CreativesSectionLazy`), gated exactly like the existing `"creatives"`
tab: `!(i.key === "brochure" && !canAccessBrochure)`, where
`canAccessBrochure = isAuthorizedForBrochureGeneration(event.user_id,
authUser?.id ?? "", isAdmin)`, rendered as
`activeSection === "brochure" && canAccessBrochure && <BrochureSectionPageLazy eventId={event.id} />`.

## Data Models

### `Section_Layout` and theme-selection persistence — `events.page_config`, no migration

**Decision: persist the organizer's Brochure_Theme selection and
Section_Layout inside `events.page_config.brochurePrefs`, not a new table.**

This mirrors the social-creative-generator spec's identical decision for
`creativeTemplatePrefs` verbatim, for the same reasons:

- `page_config` is the established place for per-event JSON preferences
  that don't need relational structure or independent RLS —
  `creativeTemplatePrefs`, `ThemeConfig`, section ordering, etc. are all
  read/written wholesale via `normalizeConfig(event.page_config)` and
  `.update({ page_config: config })`.
- The Brochure_Theme id, per-field color/font overrides, and Section_Layout
  are exactly that shape: a small, event-scoped preference blob with no
  need for its own primary key, timestamps, or RLS finer than the `events`
  row already has.
- Brochure_Themes themselves are static code, not database rows — a
  dedicated table would only ever store a foreign-key-shaped preference
  pointing at code, which is the same "no benefit" argument the
  social-creative-generator design already made for
  `creativeTemplatePrefs`.
- No `Brochure_Library` (a persisted history of generated PDFs) is
  introduced in this phase (per requirements decision #6) — there is
  therefore no candidate table need beyond this small preference blob.

```typescript
// Added to EventPageConfig (src/components/event/page-form/types.ts) —
// additive, optional field; existing saved configs remain valid via
// normalizeConfig's forward-merge pattern (same mechanism already used for
// `creativeTemplatePrefs`).
export interface EventPageConfig {
  // ...existing fields (v, theme, sections, seo, creativeTemplatePrefs, etc.)
  brochurePrefs?: {
    themeId?: string;
    colorOverride?: { primaryColor?: string; accentColor?: string; fontFamily?: string };
    sectionLayout?: SectionLayout; // from brochure-templates.ts
  };
}
```

```typescript
// src/lib/brochure/brochure-templates.ts
export function saveBrochurePrefs(
  config: EventPageConfig,
  prefs: EventPageConfig["brochurePrefs"]
): EventPageConfig; // pure — returns a new config; caller persists via the
                     // existing events.update({ page_config }) path

export function readBrochurePrefs(
  config: EventPageConfig
): EventPageConfig["brochurePrefs"] | undefined;
```

`BrochureConfiguratorDialog` reads `readBrochurePrefs(normalizeConfig(event.page_config))`
on open (falling back to `BROCHURE_THEMES[0]` + `DEFAULT_SECTION_LAYOUT` when
absent — satisfying Requirement 7.1's "current order" for an event that has
never had a brochure configured), and on "Save as event default" writes back
through the same `supabase.from("events").update({ page_config })` call
already used by `EventPageForm.tsx` — no new persistence code path, and (per
the requirements decision) no separate "download history" is recorded.

### Why the brochure's sponsor grouping does NOT sub-split "custom" by `tier_label`

`SponsorManagement.tsx`'s own drag-and-drop grouping (`groupSponsorsByTier`
in `sponsor-dnd.ts`) keys custom-tier groups by `custom:${tier_label}`, so
two custom sponsors with different labels ("Community Partner" vs. "Media
Partner") land in separate groups on the management screen. The brochure's
`groupSponsorsByTierOrdered` deliberately groups by the raw `tier` column
alone (`platinum`/`gold`/`silver`/`bronze`/`custom`), producing **at most one**
"Custom" group. This follows the requirements' own framing exactly:
Requirement 5.2 and the Glossary's `Sponsor_Tier` definition, and Property
34, all enumerate exactly five fixed groups
(`platinum > gold > silver > bronze > custom`) — introducing per-label
sub-groups in the brochure would produce a variable number of groups with no
requirement or property describing how they should be ranked against each
other. Individual custom sponsors' distinct `tier_label` values are still
preserved and available (`SponsorInput` doesn't drop the field), just not
used as a brochure-level grouping key — a future enhancement could revisit
this if organizers want per-label brochure grouping.

### Confirmed existing columns (read from `000_full_schema.sql`)

**`events`**: `title, date, end_date, venue, location, image_url,
banner_landscape_url, page_config` — all read-only inputs to the
Cover_Section and Venue_Logistics_Section. No new column is added to
`events` beyond the additive `page_config.brochurePrefs` JSON field (no
migration, since `page_config` is already `jsonb`).

**`sessions`**: `id, event_id, title, start_time, end_time, speaker_id` —
the Agenda_Section's primary source. Per-session speaker *names* are
resolved via the `session_speakers` join table (`session_id, speaker_id,
position`, confirmed in the schema and already used by
`SessionManagement.tsx`'s `fetchData`), falling back to the session's own
legacy `speaker_id` column when no `session_speakers` rows exist for it —
mirroring `SessionManagement.tsx`'s exact fallback:
`linkMap.get(s.id) || (s.speaker_id ? [s.speaker_id] : [])`. The brochure
data-fetching layer (inside `BrochureConfiguratorDialog`) performs this same
two-query-plus-fallback resolution before calling `buildAgendaRows`.

**`speakers`**: `name, photo_url, company, designation, title,
display_order` (the latter via `event_speakers`) — the Speakers_Section's
source, matching `AgendaSessionInput.speakerNames`' resolution and
`SpeakerInput` above field-for-field.

**`sponsors`** / **`event_sponsors`**: `name, logo_url, tier, tier_label`
(sponsors) + `display_order` (event_sponsors) — the Sponsors_Section's
source, matching `SponsorInput` above field-for-field.

No fields are invented beyond these, and no write access to any of these
five tables is needed — the Brochure_Generator only ever performs `SELECT`
queries against `events`, `sessions`, `session_speakers`, `speakers`,
`event_speakers`, `sponsors`, and `event_sponsors`, and the single `UPDATE`
against `events.page_config` for the optional "save as default" preference.
No new migration is required.

## Error Handling

Every failure mode below is scoped to keep the generator resilient: a single
missing photo, a single failed image fetch, or a single empty section never
aborts the whole brochure — the organizer always gets a usable PDF, with the
affected element degrading to its documented fallback.

| Failure | Where it's caught | Fallback |
| --- | --- | --- |
| Speaker `photo_url` missing | `buildSpeakerRows` (pure) | `{ type: "placeholder", initial }` row — Requirement 4.3 |
| Speaker photo `fetch`/CORS failure | `loadImageAsDataUrl` in `brochure-pdf.ts` | Resolves `null`; renderer draws the same initial-placeholder box as the missing-URL case. Logged via `logger.warn("brochure image load failed", { url, role: "photo" })` |
| Sponsor `logo_url` missing | `buildSponsorRow` (pure) | `{ type: "text", text: sponsor.name }` row — Requirement 5.4 |
| Sponsor logo fetch/CORS failure | `loadImageAsDataUrl` | Resolves `null`; renderer falls back to the sponsor-name text row, identical to the missing-URL case |
| Cover `image_url`/`banner_landscape_url` fetch failure | `loadImageAsDataUrl` | Renderer falls back to the theme's `defaultBackgroundColor` fill — the same visual result as `resolveCoverBackground` returning `{ type: "theme-default" }`, so a network failure and an absent URL are indistinguishable to the reader |
| Zero `sessions` for the event | `buildAgendaSectionContent` (pure) | Renders `emptyMessage: "No sessions scheduled yet."` as a single centered line instead of an autoTable with a `head` and zero `body` rows — Requirement 3.5 explicitly forbids a zero-row table, and an explicit message is more informative to a reader than a silently-omitted section for content the organizer likely expects to see |
| Zero `event_sponsors` for the event | `shouldRenderSponsorsSection` (pure) | Section is omitted entirely — Requirement 5.7. (Different from the empty-agenda case because an event legitimately may have no sponsors at all, whereas an agenda-less conference is unusual enough to warrant an explicit message) |
| Venue/location/logistics all empty | `buildVenueLogisticsContent` (pure) | Returns `null`; the section is omitted — Requirement 6.5 |
| `mapEmbedUrl` present but unreachable/invalid at QR-generation time | `qrcode` package call in `brochure-pdf.ts` | `qrcode.toDataURL` failures are caught and logged (`logger.warn("brochure qr code generation failed", { url })`); the section still renders its text fields, just without the QR image — never blocks the rest of the venue page |
| A session's assigned speaker was deleted/unlinked (dangling `speaker_id` join with no matching row) | Data-fetching layer inside `BrochureConfiguratorDialog`, before calling `buildAgendaRows` | The dangling id is filtered out of `speakerNames` before it reaches the pure builder — `buildAgendaRows` therefore only ever sees names that resolved successfully, so this never surfaces as a builder-level edge case, only a fetch-layer one |
| Organizer is not the event owner and is not an admin | `isAuthorizedForBrochureGeneration` (pure UI gate) + the existing `events`/`sessions`/`speakers`/`sponsors` RLS policies (actual enforcement) | The Brochure entry point/tab is hidden client-side (Requirement 10.2's "deny the request" is satisfied first by not showing the surface, and second — as the real security boundary — by every underlying Supabase query already being RLS-scoped to the event's owner or an admin, identical in spirit to `isAuthorizedForEventCreatives`'s own documented "not the security boundary" caveat) |
| `buildBrochureDocument` throws for any other reason (e.g. `jsPDF` internal error, unexpected `autoTable` input) | `generateBrochurePdf` / `buildBrochurePreviewUrl` callers in `BrochureConfiguratorDialog` | Caught at the UI layer, logged via `logger.error("brochure generation failed", { event_id, error_message })`, surfaced as a `toast.error("Failed to generate brochure", { description })` — mirroring `CreativeGeneratorDialog`'s per-format catch block. The dialog stays open so the organizer can retry without re-entering their theme/section choices |
| `canvas.toBlob`-equivalent failure (`doc.output` returning an unexpected type) | `generateBrochurePdf` | Treated as the same catch-all above; not expected in practice since `jsPDF.output` is synchronous and doesn't have the callback-based failure mode `canvas.toBlob` does, but guarded defensively with a thrown `Error` if the returned value isn't a `Blob`/string as expected |

**Why photo/logo fetch failures and missing URLs share one fallback path.**
Distinguishing "no `photo_url` was ever set" from "a `photo_url` was set but
couldn't be fetched" would require two different placeholder renderings for
what is, from the reader's perspective, the same outcome (no photo shown).
`loadImageAsDataUrl`'s never-throw, resolve-`null`-on-any-failure contract
(mirroring `creative-renderer.ts`'s `loadImage`) means both cases collapse
into the same `null` value by the time the renderer sees them, so
`buildSpeakerRows`'s `{ type: "placeholder" }` variant is reused rather than
introducing a third row-content variant just for "URL present, fetch
failed."

## Testing Strategy

Every pure function in `brochure-templates.ts` and `brochure-sections.ts` is
directly testable without a `jsPDF` instance, a DOM, or a network mock —
this is the entire point of the plan-builder/renderer split (see
Architecture). `brochure-pdf.ts`'s imperative assembly layer is covered by
targeted unit tests with `jspdf`/`jspdf-autotable`/`qrcode` mocked (or, for
the image-loading helper, `fetch` mocked), following the same
mocked-integration-test convention already used by
`creative-storage.integration.test.ts` and
`creative-storage-ai-backgrounds.integration.test.ts`.

Property test files live in `src/lib/brochure/__tests__/`, named
`property-N-*.pbt.test.ts` per the existing convention (e.g.
`src/lib/creatives/__tests__/property-16-*.pbt.test.ts`), each with a header
comment `// Feature: event-brochure-generator, Property N: <title>` and a
`// Validates: Requirements X.Y, ...` line, run via
`fc.assert(fc.property(...), { numRuns: 100 })`.

| Property | File | Function(s) under test |
| --- | --- | --- |
| 24 — Theme resolution with fallback, non-mutating | `property-24-theme-resolution-fallback.pbt.test.ts` | `resolveBrochureTheme` |
| 25 — Cover date-range formatting | `property-25-cover-date-range.pbt.test.ts` | `formatCoverDateRange` |
| 26 — Cover background source precedence | `property-26-cover-background-precedence.pbt.test.ts` | `resolveCoverBackground` |
| 27 — Agenda rows sorted, never empty-table | `property-27-agenda-sort-and-empty.pbt.test.ts` | `buildAgendaRows`, `buildAgendaSectionContent` |
| 28 — Agenda row omits missing speaker | `property-28-agenda-missing-speaker.pbt.test.ts` | `buildAgendaRows` |
| 29 — Speakers sorted by display order | `property-29-speaker-sort-order.pbt.test.ts` | `buildSpeakerRows` |
| 30 — Speaker title precedence + omission | `property-30-speaker-title-precedence.pbt.test.ts` | `buildSpeakerRows` |
| 31 — Missing speaker photo → placeholder | `property-31-speaker-photo-placeholder.pbt.test.ts` | `buildSpeakerRows` |
| 32 — Image fit never upscales/stretches | `property-32-image-fit-no-upscale.pbt.test.ts` | `fitImageBox` (with `allowUpscale: false`) |
| 33 — Sponsors partitioned by tier exactly once | `property-33-sponsor-tier-partition.pbt.test.ts` | `groupSponsorsByTierOrdered` |
| 34 — Sponsor tier groups ordered by fixed rank | `property-34-sponsor-tier-order.pbt.test.ts` | `groupSponsorsByTierOrdered` |
| 35 — Sponsor row logo-missing fallback | `property-35-sponsor-logo-fallback.pbt.test.ts` | `buildSponsorRow` |
| 36 — Sponsor tier accent color matches existing mapping | `property-36-sponsor-tier-color-match.pbt.test.ts` | `tierAccentColor` (re-exported), asserted equal to `creative-templates.ts`'s own `tierAccentColor` for all five tiers — a literal equality check since both call the same function, guaranteeing they can never drift |
| 37 — Sponsors section renders iff non-empty | `property-37-sponsors-section-inclusion.pbt.test.ts` | `shouldRenderSponsorsSection` |
| 38 — Venue content assembly + inclusion | `property-38-venue-content-assembly.pbt.test.ts` | `buildVenueLogisticsContent` |
| 39 — Section layout resolution preserves order/inclusion | `property-39-section-layout-resolution.pbt.test.ts` | `resolveSectionLayout` — asserted against arbitrary permutations and inclusion subsets of the 5 fixed section ids, plus an explicit check that calling it twice with the same input (simulating the preview call and the export call) returns deep-equal results |
| 40 — Brochure filename is filesystem-safe | `property-40-brochure-filename-safety.pbt.test.ts` | `buildBrochureFilename` |

**Non-property unit/integration coverage** (mirroring
`creative-ai.test.ts`'s and `creative-storage.integration.test.ts`'s split
between property tests and example-based unit tests):

- `brochure-templates.test.ts` — `resolveFontFamilyForPdf`'s bucket mapping
  for every `FONT_OPTIONS` entry (serif/sans/mono classification is a fixed
  lookup table, not a property — exhaustive example coverage is the right
  tool), `isAuthorizedForBrochureGeneration`'s owner/admin/neither cases,
  `saveBrochurePrefs`/`readBrochurePrefs` round-trip.
- `brochure-sections.test.ts` — example-based coverage for each builder's
  documented edge cases beyond what the properties above already cover
  (e.g. a session whose `speakerNames` array is empty vs. `undefined`,
  a sponsor whose `tier` value doesn't match any known `SponsorTier`
  literal, falling into `"custom"` per `tierAccentColor`'s own fallback).
- `brochure-pdf.test.ts` — `loadImageAsDataUrl` with `fetch` mocked
  (success, non-2xx, network-throw, all resolving without throwing per its
  never-throw contract), and a smoke test that `generateBrochurePdf` with a
  minimal fixture (one session, one speaker, one sponsor, all fields
  present) produces a non-empty `Blob` whose type is `"application/pdf"`
  without mocking `jsPDF` itself (an actual jsPDF run, since jsPDF has no
  DOM/network dependency and runs fine under Vitest's `jsdom` environment —
  matching how `ticket-pdf.test.ts`, if one exists, or `reports/pdf.ts`'s
  own tests already exercise real `jsPDF` instances rather than mocking the
  library).
- `BrochureConfiguratorDialog` / `BrochureSectionList` — component tests
  (optional, `*` per project convention) covering the dnd-kit reorder
  interaction and the include/exclude toggle wiring, following whatever
  existing component-test pattern this codebase uses for
  `CreativeLibrarySection`/similar (React Testing Library, if configured).

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all
valid executions of a system — essentially, a formal statement about what
the system should do.* All seventeen properties below are restated from
`requirements.md` for design-time traceability, each annotated with the
design-level function(s) that implement it. Every one is implemented as a
pure function in `brochure-templates.ts` or `brochure-sections.ts` — none
require a `jsPDF` instance, `fetch`, or the DOM to test, which is the direct
payoff of the plan-builder/renderer architectural split described in
Architecture and Components and Interfaces above.

### Property 24: Brochure theme resolution with fallback, non-mutating

*For any* Brochure_Theme and any Event_Theme (with any subset of
`primaryColor` / `accentColor` / `fontFamily` defined or undefined, and with
any optional per-field override supplied by the organizer), the
theme-resolution function returns the override when supplied, else the
Event_Theme's value when defined, else the Brochure_Theme's own built-in
default — and the input Event_Theme object passed in is never mutated by
this resolution (deep-equal to itself before and after the call).

**Implemented by**: `resolveBrochureTheme` (`brochure-templates.ts`).
**Validates: Requirements 1.2, 1.3, 1.4**

### Property 25: Cover date-range formatting

*For any* `date` and any (possibly absent) `end_date`, the cover
date-formatting function renders a single formatted date when `end_date` is
absent or equal to `date`, and renders a range containing both formatted
dates when `end_date` is defined and differs from `date`.

**Implemented by**: `formatCoverDateRange` (`brochure-sections.ts`).
**Validates: Requirements 2.2**

### Property 26: Cover background source precedence

*For any* combination of a defined/undefined `image_url`, a
defined/undefined `banner_landscape_url`, and a Brochure_Theme's default
background, the cover background-selection function deterministically
chooses `image_url` when defined, else `banner_landscape_url` when defined,
else the Brochure_Theme's default background — and always resolves to
exactly one source.

**Implemented by**: `resolveCoverBackground` (`brochure-sections.ts`).
**Validates: Requirements 2.3, 2.4**

### Property 27: Agenda rows are sorted by start time and never empty-table

*For any* list of sessions with arbitrary `start_time` values (including an
empty list), the agenda row-builder produces rows ordered by `start_time`
ascending, and for an empty input list produces either no Agenda_Section or
an explicit "no sessions scheduled" row — never a section marked as a data
table with zero rows.

**Implemented by**: `buildAgendaRows`, `buildAgendaSectionContent`
(`brochure-sections.ts`).
**Validates: Requirements 3.1, 3.4, 3.5**

### Property 28: Agenda row omits missing speaker rather than rendering a broken value

*For any* session with or without an assigned speaker, building that
session's agenda row never throws, always includes the session's title and
formatted time range, and either includes the assigned speaker's name (when
present) or omits the speaker field entirely (when absent) — never
rendering an empty or placeholder speaker string.

**Implemented by**: `buildAgendaRows` (`brochure-sections.ts`).
**Validates: Requirements 3.2, 3.3**

### Property 29: Speakers are sorted by display order

*For any* list of speakers linked to an event with arbitrary
`display_order` values, the speaker row-builder produces rows ordered by
`display_order` ascending.

**Implemented by**: `buildSpeakerRows` (`brochure-sections.ts`).
**Validates: Requirements 4.1**

### Property 30: Speaker row title precedence and missing-field omission

*For any* speaker with any subset of `title`, `designation`, and `company`
defined or undefined, building that speaker's row never throws, displays
`title` when defined, else `designation` when `title` is absent and
`designation` is defined, else omits the title/designation line entirely,
and independently omits the company line when `company` is absent — with no
line rendering empty text.

**Implemented by**: `buildSpeakerRows` (`brochure-sections.ts`).
**Validates: Requirements 4.2, 4.4**

### Property 31: Missing speaker photo produces a placeholder, never a broken reference

*For any* speaker with `photo_url` present or absent, building that
speaker's row never throws and either includes an image reference to
`photo_url` (when present) or includes a Missing_Data_Placeholder marker
(when absent) — never an image element with a null/undefined URL.

**Implemented by**: `buildSpeakerRows` (`brochure-sections.ts`).
**Validates: Requirements 4.3**

### Property 32: Image slot fitting never upscales or non-uniformly stretches

*For any* image slot box and any natural image width/height (for a speaker
photo or a sponsor logo), the image-fit function returns a box whose width
and height either equal the natural width/height exactly (when it fits
within the slot) or are uniformly downscaled by the same factor on both axes
(when it doesn't fit) — never upscaled beyond native size and never scaled
by different factors per axis.

**Implemented by**: `fitImageBox` with `allowUpscale: false`
(`brochure-templates.ts`).
**Validates: Requirements 4.6, 5.6**

### Property 33: Sponsors are partitioned by tier exactly once

*For any* list of sponsors with arbitrary Sponsor_Tier values, grouping
those sponsors by tier produces groups such that every input sponsor
appears in exactly one group matching its own tier, and the union of all
groups' sponsors equals the input list exactly (no sponsor duplicated or
dropped).

**Implemented by**: `groupSponsorsByTierOrdered` (`brochure-sections.ts`).
**Validates: Requirements 5.1**

### Property 34: Sponsor tier groups are ordered by fixed tier rank

*For any* subset of Sponsor_Tier values present among an event's sponsors,
the rendered tier-group order follows the fixed rank
`platinum > gold > silver > bronze > custom`, restricted to only the tiers
actually present, regardless of the input sponsors' original list order.

**Implemented by**: `groupSponsorsByTierOrdered` using `TIER_RANK`
(`brochure-sections.ts`, `brochure-templates.ts`).
**Validates: Requirements 5.2**

### Property 35: Sponsor row logo-missing fallback

*For any* sponsor with `logo_url` present or absent, building that
sponsor's row never throws and either includes an image reference to
`logo_url` (when present) or includes the sponsor's name rendered as styled
text in place of the logo (when absent).

**Implemented by**: `buildSponsorRow` (`brochure-sections.ts`).
**Validates: Requirements 5.3, 5.4**

### Property 36: Sponsor tier accent color matches the existing tier color mapping

*For all* Sponsor_Tier values (`platinum`, `gold`, `silver`, `bronze`,
`custom`), the brochure's tier-heading accent-color function returns the
same color as the existing `TIERS` mapping in `SponsorManagement.tsx` for
that tier.

**Implemented by**: `tierAccentColor`, re-exported unchanged from
`@/lib/creatives/creative-templates` (`brochure-templates.ts`) — this
property is satisfied by construction (both call sites share one function),
not by re-deriving the same palette a second time.
**Validates: Requirements 5.5**

### Property 37: Sponsors section renders whenever at least one sponsor exists

*For any* list of sponsors (including sponsors with and without a
`logo_url`), the Sponsors_Section inclusion decision returns "render" if and
only if the list is non-empty — logo presence/absence never affects the
inclusion decision.

**Implemented by**: `shouldRenderSponsorsSection` (`brochure-sections.ts`).
**Validates: Requirements 5.7, 5.8**

### Property 38: Venue section content assembly and inclusion

*For any* combination of (possibly absent) `venue`, `location`,
`mapEmbedUrl`, `parkingNotes`, and `transitNotes` values, the venue-section
content-assembly function includes exactly the subset of these fields that
are non-empty strings (a QR-code element only when `mapEmbedUrl` is
non-empty), and the Venue_Logistics_Section inclusion decision returns
"render" if and only if at least one of `venue`, `location`,
`parkingNotes`, or `transitNotes` is a non-empty string.

**Implemented by**: `buildVenueLogisticsContent` (`brochure-sections.ts`).
**Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**

### Property 39: Section layout resolution preserves order and inclusion exactly

*For any* permutation and any subset (inclusion/exclusion combination) of
the five Brochure_Sections, the layout-resolution function used by both the
preview and the export pipeline produces a resolved section list whose
order exactly matches the configured Section_Layout order and whose
membership exactly matches the set of included sections — no section is
added, dropped, or reordered relative to the configuration, and the
preview's resolved list and the export pipeline's resolved list are
identical for the same Section_Layout input.

**Implemented by**: `resolveSectionLayout` (`brochure-templates.ts`),
called identically by `BrochurePreviewFrame` and `buildBrochureDocument`.
**Validates: Requirements 7.2, 7.3, 8.2**

### Property 40: Brochure filename is filesystem-safe and derived from the event title

*For any* event title string (including empty strings, unicode characters,
and filesystem-unsafe characters such as `/`, `\`, `:`, `*`, `?`), the
filename-building function returns a string containing no filesystem-unsafe
characters, ending in `.pdf`, and containing a non-empty slugified form of
the title as a substring when the title contains at least one alphanumeric
character.

**Implemented by**: `buildBrochureFilename` (`brochure-templates.ts`).
**Validates: Requirements 9.2**
