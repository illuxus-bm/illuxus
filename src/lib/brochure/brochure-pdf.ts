/**
 * Imperative `jsPDF`/`jspdf-autotable`/`qrcode` assembly layer for the Event
 * Brochure Generator.
 *
 * This is the ONLY module in the brochure feature that imports `jspdf`,
 * `jspdf-autotable`, or `qrcode`, or calls `fetch` — every other module
 * under `src/lib/brochure/` is pure (see `brochure-templates.ts` and
 * `brochure-sections.ts`'s header comments). This module walks the resolved
 * `Section_Layout`, loads any images a section's content structure
 * references (as data URLs — `jsPDF.addImage` cannot safely consume a bare
 * remote URL, see `loadImageAsDataUrl` below), and draws each section onto
 * a shared `jsPDF` document instance. The exact same `buildBrochureDocument`
 * function backs both the live preview (`buildBrochurePreviewUrl`) and the
 * final export (`generateBrochurePdf`/`downloadBrochurePdf`), so the two can
 * never diverge by construction (reinforcing Property 39 at the assembly
 * layer, not just the pure `resolveSectionLayout` resolver).
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";

import { logger } from "@/lib/observability";

import {
  type BrochureTheme,
  type BrochureThemeOverride,
  type EventThemeInput,
  type ResolvedBrochureColors,
  type SectionLayout,
  fitImageBox,
  resolveBrochureTheme,
  resolveFontFamilyForPdf,
  resolveSectionLayout,
  buildBrochureFilename,
} from "./brochure-templates";
import {
  type AbstractSectionContent,
  type AbstractSectionInput,
  type AgendaSessionInput,
  type AgendaSectionContent,
  type CoverContent,
  type FocusOfSummitContent,
  type FocusOfSummitInput,
  type HighlightsContent,
  type HighlightsInput,
  type PricingSectionContent,
  type PricingSectionInput,
  type SolutionProvidersContent,
  type SolutionProvidersInput,
  type SpeakerInput,
  type SpeakerRow,
  type SponsorInput,
  type SponsorTierGroup,
  type VenueLogisticsContent,
  type VenueLogisticsInput,
  type WhoShouldAttendContent,
  type WhoShouldAttendInput,
  type WhySponsorSectionContent,
  type WhySponsorSectionInput,
  buildAbstractSectionContent,
  buildAgendaSectionContent,
  buildCoverContent,
  buildFocusOfSummitContent,
  buildHighlightsContent,
  buildPricingSectionContent,
  buildSolutionProvidersContent,
  buildSpeakerRows,
  buildVenueLogisticsContent,
  buildWhoShouldAttendContent,
  buildWhySponsorSectionContent,
  groupSponsorsByTierOrdered,
  shouldRenderSponsorsSection,
} from "./brochure-sections";

// ─── Image loading (Requirements 2.3, 4.2, 5.3) ─────────────────────────────

/**
 * Fetches `url` and resolves to a `data:` URL, or `null` on any failure
 * (network error, non-2xx, CORS block) — never throws, mirroring
 * `creative-renderer.ts`'s `loadImage`'s never-throw contract so callers can
 * uniformly fall back to a Missing_Data_Placeholder. `jsPDF.addImage`
 * cannot safely consume a bare remote URL string: internally it falls back
 * to a synchronous XHR via its `loadFile` plugin, which most browsers block
 * for cross-origin requests. Converting every image to a data URL
 * client-side up front (the same target `badge-design.ts`'s `fileToDataUrl`
 * converts a local `File` to, just applied to a fetched remote `Blob`
 * instead) avoids that path entirely. Logs
 * `logger.warn("brochure image load failed", { url, error_message })` on
 * failure.
 */
export async function loadImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error("FileReader error"));
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    logger.warn("brochure image load failed", {
      url,
      error_message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ─── Public input shape ──────────────────────────────────────────────────────

/** Full input for a single brochure build — the same shape drives both the
 *  live preview and the final export (see module header). */
export interface BrochureGenerationInput {
  event: {
    title: string;
    subtitle?: string | null;
    date: string;
    end_date?: string | null;
    venue?: string | null;
    location?: string | null;
    image_url?: string | null;
    banner_landscape_url?: string | null;
    /** Mobile / portrait banner. Preferred over image_url and
     *  banner_landscape_url for the cover hero since the brochure is
     *  A4 portrait. */
    banner_portrait_url?: string | null;
  };
  sessions: AgendaSessionInput[];
  speakers: SpeakerInput[];
  sponsors: SponsorInput[];
  venueLogistics: VenueLogisticsInput;
  theme: BrochureTheme;
  eventTheme: EventThemeInput;
  themeOverride?: BrochureThemeOverride;
  sectionLayout: SectionLayout;
  /** Optional Poster_Bold-only content (Abstract, Why Sponsor, Pricing
   *  sections + cover/footer logos + social links). Ignored by every
   *  other theme — the resolver below filters the section list to drop
   *  Poster_Bold-only ids when the active theme isn't `poster-bold`, and
   *  builds each Poster_Bold section's content with a null-return
   *  contract that also drops the id when the underlying content is
   *  empty. Callers that never populate Poster_Bold sections can leave
   *  this undefined and the pipeline stays byte-identical to before. */
  posterContent?: {
    logoUrl?: string | null;
    organizerLogoUrl?: string | null;
    socialLinks?: Array<{
      platform: "linkedin" | "instagram" | "facebook" | "twitter";
      url: string;
    }> | null;
    /** Optional secondary tagline surfaced as a large pill on the
     *  Corporate_Bold cover ("The Next Big Shift"). */
    coverTagline?: string | null;
    /** Optional short chip labels ("Autonomy | Governance | Capital"). */
    coverPills?: string[] | null;
    abstract?: AbstractSectionInput;
    whySponsor?: WhySponsorSectionInput;
    pricing?: PricingSectionInput;
    /** Corporate_Bold-only content shared with the four extra pages
     *  the reference Finance 6.0 brochure introduces. */
    focusOfSummit?: FocusOfSummitInput;
    whoShouldAttend?: WhoShouldAttendInput;
    solutionProviders?: SolutionProvidersInput;
    highlights?: HighlightsInput;
  };
  /** Fires once per included section as it finishes drawing, for the
   *  Brochure_Configurator's progress indicator (Requirement 9.3). */
  onProgress?: (completedSections: number, totalSections: number) => void;
}

// ─── Shared drawing constants ────────────────────────────────────────────────

/** Hex color used for text drawn over a dark/image cover background. */
const COVER_TITLE_LIGHT_COLOR = "#ffffff";
/** Hex color used for text drawn over a light `centered-card` cover. */
const COVER_TITLE_DARK_COLOR = "#0a0a0a";

/** Converts a `#rrggbb` hex string into an `[r, g, b]` tuple for jsPDF's
 *  `setFillColor`/`setTextColor`/`setDrawColor`, which don't accept hex
 *  strings directly. Falls back to black on a malformed input rather than
 *  throwing. */
function hexToRgb(hex: string): [number, number, number] {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match) {
    return [0, 0, 0];
  }
  const int = parseInt(match[1], 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

/** `true` when a hex color is perceptually dark enough that white text
 *  should be drawn over it (standard relative-luminance heuristic). */
function isDarkColor(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5;
}

// ─── Cover_Section (Requirement 2) ───────────────────────────────────────────

/**
 * Shrinks the title font size until the wrapped title fits in `maxLines`
 * or `minSizePt` is reached — whichever comes first. Prevents a long
 * event name from spilling across half the cover page.
 */
function autoShrinkTitleSize(
  doc: jsPDF,
  title: string,
  maxWidth: number,
  startSizePt: number,
  minSizePt: number,
  maxLines: number
): { fontSizePt: number; lines: string[] } {
  let size = startSizePt;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(title, maxWidth) as string[];
    if (lines.length <= maxLines || size <= minSizePt) {
      return { fontSizePt: size, lines };
    }
    size = Math.max(minSizePt, size - 1);
  }
}

/** Fills a rectangle top-to-bottom with a vertical alpha gradient from
 *  transparent to `hex` (approximated by drawing ~24 horizontal bands
 *  with progressively increasing opacity — jsPDF has no native gradient
 *  primitive). Used to darken the bottom half of a full-bleed cover
 *  image so light title text stays legible over any photo. */
function drawBottomGradient(doc: jsPDF, x: number, y: number, w: number, h: number, hex: string): void {
  const [r, g, b] = hexToRgb(hex);
  const bands = 24;
  const bandHeight = h / bands;
  for (let i = 0; i < bands; i += 1) {
    // Ease-in curve so the top of the gradient is very subtle and the
    // bottom is near-opaque; matches how most poster-style overlays feel.
    const alpha = Math.min(1, (i / (bands - 1)) ** 1.4);
    doc.setFillColor(r, g, b);
    // jsPDF's setFillColor accepts a 4th "alpha" arg on recent versions,
    // but for maximum compatibility we go through the GState route.
    const gState = new (jsPDF as unknown as { GState: new (o: { opacity: number }) => unknown }).GState({ opacity: alpha });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (doc as any).setGState(gState);
    doc.rect(x, y + i * bandHeight, w, bandHeight + 0.2, "F");
  }
  // Reset alpha for subsequent draws.
  const resetGState = new (jsPDF as unknown as { GState: new (o: { opacity: number }) => unknown }).GState({ opacity: 1 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (doc as any).setGState(resetGState);
}

/**
 * Draws the Cover_Section. The three theme cover styles produce
 * genuinely distinct compositions:
 *
 * - `banner-strip` (Classic Editorial): image at top ~45% of the page as
 *   a horizontal banner, solid theme background below, title/date/accent
 *   bar comfortably placed in the lower half.
 * - `centered-card` (Modern Minimal): light page, image centered as a
 *   card (~65% width × 38% height), title/date centered below, short
 *   centered accent bar.
 * - `full-bleed-image` (Bold Conference): image fills the whole page
 *   with a bottom-half gradient overlay; title/date/accent bar live in
 *   the overlay so they can never collide with the underlying photo.
 *
 * All three fall back gracefully to a solid theme-background composition
 * when no cover image is available (Requirement 2.4). Always draws onto
 * the CURRENT page — the caller `addPage`s beforehand when needed.
 */
async function drawCoverSection(
  doc: jsPDF,
  content: CoverContent,
  theme: BrochureTheme,
  colors: ResolvedBrochureColors,
  posterContent?: BrochureGenerationInput["posterContent"]
): Promise<void> {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = theme.margins.left;
  const fontFamily = resolveFontFamilyForPdf(colors.fontFamily);

  // Try to load the cover image ahead of the layout decisions — the
  // three styles below all need to know whether an image is available
  // before choosing where to place the title.
  let imageDataUrl: string | null = null;
  let imageProps: { width: number; height: number } | null = null;
  if (content.background.type === "image") {
    imageDataUrl = await loadImageAsDataUrl(content.background.url);
    if (imageDataUrl) {
      try {
        const props = doc.getImageProperties(imageDataUrl);
        imageProps = { width: props.width, height: props.height };
      } catch (err) {
        logger.warn("brochure image load failed", {
          url: content.background.url,
          error_message: err instanceof Error ? err.message : String(err),
        });
        imageDataUrl = null;
      }
    }
  }

  const [bgR, bgG, bgB] = hexToRgb(theme.cover.defaultBackgroundColor);
  const [accentR, accentG, accentB] = hexToRgb(colors.accentColor);

  // Fill the whole page with the theme's default background first —
  // every style layers on top of this.
  doc.setFillColor(bgR, bgG, bgB);
  doc.rect(0, 0, pageWidth, pageHeight, "F");

  // Compute the title/date placement zone based on cover style.
  let titleZoneY: number;
  let titleZoneHeight: number;
  let titleColor: string;
  let titleAlign: "left" | "center" = "left";

  if (theme.cover.style === "poster-bold") {
    // Poster_Bold cover has a dedicated renderer (pill chips + hero image
    // + organizer footer) — delegate and short-circuit the rest of this
    // function.
    return drawPosterBoldCover(doc, content, theme, colors, imageDataUrl, imageProps, posterContent);
  }

  if (theme.cover.style === "corporate-bold") {
    // Corporate_Bold uses a deep-purple gradient cover with a large
    // wordmark, giant title, tagline pill, chip row, and cityscape hero
    // image. Delegate and short-circuit.
    return drawCorporateBoldCover(doc, content, theme, colors, imageDataUrl, imageProps, posterContent);
  }

  if (theme.cover.style === "banner-strip") {
    // Banner image occupies the top 45% of the page.
    const bannerHeight = pageHeight * 0.45;
    if (imageDataUrl && imageProps) {
      const fitted = fitImageBox(
        { width: pageWidth, height: bannerHeight },
        imageProps.width,
        imageProps.height,
        { allowUpscale: true }
      );
      const imgX = (pageWidth - fitted.width) / 2;
      const imgY = (bannerHeight - fitted.height) / 2;
      doc.addImage(imageDataUrl, imgX, imgY, fitted.width, fitted.height);
    }
    // Title zone below the banner with generous padding.
    titleZoneY = bannerHeight + 24;
    titleZoneHeight = pageHeight - titleZoneY - margin;
    // Text lives on the solid theme background — use light-vs-dark contrast.
    titleColor = isDarkColor(theme.cover.defaultBackgroundColor)
      ? COVER_TITLE_LIGHT_COLOR
      : COVER_TITLE_DARK_COLOR;
  } else if (theme.cover.style === "centered-card") {
    // Centered image card, ~65% width × 38% page height, centered
    // horizontally with generous top margin.
    const cardWidth = pageWidth * 0.65;
    const cardHeight = pageHeight * 0.38;
    const cardX = (pageWidth - cardWidth) / 2;
    const cardY = pageHeight * 0.12;
    if (imageDataUrl && imageProps) {
      const fitted = fitImageBox(
        { width: cardWidth, height: cardHeight },
        imageProps.width,
        imageProps.height,
        { allowUpscale: true }
      );
      const imgX = cardX + (cardWidth - fitted.width) / 2;
      const imgY = cardY + (cardHeight - fitted.height) / 2;
      // Subtle card background so the image sits on a distinct surface
      // even when the letterbox fill matches the page.
      doc.setFillColor(230, 235, 245);
      doc.rect(cardX, cardY, cardWidth, cardHeight, "F");
      doc.addImage(imageDataUrl, imgX, imgY, fitted.width, fitted.height);
    } else {
      // No image: placeholder card so the layout still reads correctly.
      doc.setFillColor(230, 235, 245);
      doc.rect(cardX, cardY, cardWidth, cardHeight, "F");
    }
    titleZoneY = cardY + cardHeight + 18;
    titleZoneHeight = pageHeight - titleZoneY - margin;
    titleColor = COVER_TITLE_DARK_COLOR;
    titleAlign = "center";
  } else {
    // full-bleed-image: image (or theme bg) fills the page, dark bottom
    // gradient overlay hosts the title.
    if (imageDataUrl && imageProps) {
      const fitted = fitImageBox(
        { width: pageWidth, height: pageHeight },
        imageProps.width,
        imageProps.height,
        { allowUpscale: true }
      );
      const imgX = (pageWidth - fitted.width) / 2;
      const imgY = (pageHeight - fitted.height) / 2;
      doc.addImage(imageDataUrl, imgX, imgY, fitted.width, fitted.height);
    }
    // Bottom half gradient overlay.
    drawBottomGradient(doc, 0, pageHeight * 0.4, pageWidth, pageHeight * 0.6, "#000000");
    titleZoneY = pageHeight * 0.68;
    titleZoneHeight = pageHeight - titleZoneY - margin;
    titleColor = COVER_TITLE_LIGHT_COLOR;
  }

  // Draw title with auto-shrink so it always fits in at most 2 lines
  // within the title zone.
  const contentWidth = pageWidth - margin * 2;
  const cardContentWidth = titleAlign === "center" ? pageWidth * 0.7 : contentWidth;
  doc.setFont(fontFamily, "bold");
  const { fontSizePt: titleSize, lines: titleLines } = autoShrinkTitleSize(
    doc,
    content.title,
    cardContentWidth,
    theme.cover.titleFontSizePt,
    12,
    2
  );
  const [tr, tg, tb] = hexToRgb(titleColor);
  doc.setTextColor(tr, tg, tb);
  doc.setFontSize(titleSize);

  const lineHeightMm = titleSize * 0.42;
  const dateSize = Math.max(10, titleSize * 0.42);
  const gapAfterTitleMm = 6;
  const gapAfterDateMm = 6;
  const accentBar = theme.cover.accentBarHeightMm;
  const blockHeight = titleLines.length * lineHeightMm + gapAfterTitleMm + dateSize * 0.4 + gapAfterDateMm + accentBar;
  // Vertically center the title/date/accent block within the title zone
  // when the zone has room to spare.
  const blockStartY = titleZoneY + Math.max(0, (titleZoneHeight - blockHeight) / 2);

  const titleX = titleAlign === "center" ? pageWidth / 2 : margin;
  doc.text(titleLines, titleX, blockStartY + lineHeightMm, { align: titleAlign });

  // Date, one visual step below the title.
  const dateY = blockStartY + titleLines.length * lineHeightMm + gapAfterTitleMm;
  doc.setFont(fontFamily, "normal");
  doc.setFontSize(dateSize);
  doc.text(content.dateText, titleX, dateY, { align: titleAlign });

  // Short accent bar. Centered styles get a short centered bar; other
  // styles get a full-width bar spanning the margins.
  if (accentBar > 0) {
    doc.setFillColor(accentR, accentG, accentB);
    const barY = dateY + gapAfterDateMm;
    if (titleAlign === "center") {
      const barW = Math.min(48, pageWidth * 0.28);
      doc.rect((pageWidth - barW) / 2, barY, barW, accentBar, "F");
    } else {
      doc.rect(margin, barY, contentWidth, accentBar, "F");
    }
  }
}

// ─── Missing_Data_Placeholder (Requirement 4.3) ─────────────────────────────

/**
 * Draws a Missing_Data_Placeholder: a filled rectangle in `accentColorHex`
 * with the centered `initial` in white text, sized proportionally to the
 * box height. Used wherever a speaker photo is absent or fails to load.
 */
function drawPlaceholder(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  initial: string,
  accentColorHex: string
): void {
  const [r, g, b] = hexToRgb(accentColorHex);
  doc.setFillColor(r, g, b);
  doc.rect(x, y, w, h, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(Math.max(6, h * 0.5 * 2.83465)); // mm -> pt approximation for a proportional glyph size
  doc.text(initial, x + w / 2, y + h / 2, { align: "center", baseline: "middle" });
}

// ─── Agenda_Section (Requirement 3) ──────────────────────────────────────────

/** Renders a small accent-color underline under a section heading (when
 *  the theme opts into it) so the section boundary is visually obvious. */
function drawHeadingUnderline(
  doc: jsPDF,
  theme: BrochureTheme,
  colors: ResolvedBrochureColors,
  xStart: number,
  y: number,
  widthMm: number
): void {
  if (!theme.heading.showAccentUnderline) return;
  const [ar, ag, ab] = hexToRgb(colors.accentColor);
  doc.setFillColor(ar, ag, ab);
  doc.rect(xStart, y, widthMm, 1.4, "F");
}

/** Draws the Agenda_Section: a single `autoTable` call (or the
 *  empty-message fallback), returning the Y-cursor position it ended at.
 *  Column widths are set explicitly so the Time column stays narrow,
 *  Session takes the remainder, and Speakers gets a stable middle band —
 *  auto-distributed widths made speaker names get squished and wrap to
 *  many tiny lines. */
function drawAgendaSection(
  doc: jsPDF,
  content: AgendaSectionContent,
  theme: BrochureTheme,
  colors: ResolvedBrochureColors,
  startY: number
): number {
  const margin = theme.margins.left;
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - margin - theme.margins.right;

  doc.setFont(resolveFontFamilyForPdf(colors.fontFamily), "bold");
  doc.setFontSize(theme.heading.fontSizePt);
  doc.setTextColor(0, 0, 0);
  doc.text("Agenda", margin, startY);
  drawHeadingUnderline(doc, theme, colors, margin, startY + 2, 24);
  const y = startY + 10;

  if (content.emptyMessage) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(theme.table.fontSizePt);
    doc.setTextColor(120, 120, 120);
    doc.text(content.emptyMessage, margin, y);
    return y + 8;
  }

  const [ar, ag, ab] = hexToRgb(colors.accentColor);
  // Fixed proportions: time is narrow (5-6 chars), session takes about
  // half, speakers gets the rest. Prevents equal-width squishing.
  const timeColWidth = 28;
  const speakersColWidth = Math.max(38, contentWidth * 0.28);
  const sessionColWidth = contentWidth - timeColWidth - speakersColWidth;

  autoTable(doc, {
    startY: y,
    head: [["Time", "Session", "Speaker(s)"]],
    body: content.rows.map((row) => [row.timeRangeText, row.title, row.speakerLine ?? ""]),
    theme: theme.table.theme,
    styles: {
      fontSize: theme.table.fontSizePt,
      cellPadding: theme.table.cellPaddingMm,
      overflow: "linebreak",
      valign: "top",
    },
    headStyles: {
      fillColor: [ar, ag, ab],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: theme.table.fontSizePt,
    },
    columnStyles: {
      0: { cellWidth: timeColWidth, fontStyle: "bold" },
      1: { cellWidth: sessionColWidth },
      2: { cellWidth: speakersColWidth, textColor: [90, 90, 90] },
    },
    margin: { left: margin, right: theme.margins.right },
  });

  // autoTable updates `lastAutoTable` on the doc instance; this cast
  // mirrors `reports/pdf.ts`'s documented escape hatch exactly since
  // `jspdf-autotable` doesn't augment jsPDF's own type declarations.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((doc as any).lastAutoTable?.finalY ?? y) + 8;
}

// ─── Sponsors_Section (Requirement 5) ────────────────────────────────────────

/**
 * Draws the Sponsors_Section: one `autoTable` call per `SponsorTierGroup`,
 * each preceded by a tier heading colored via that group's `accentColor`.
 *
 * Implementation note: sponsor logos are drawn as simple text rows (the
 * sponsor's name) rather than embedding the logo image *inside* the
 * autoTable cell. `jspdf-autotable`'s `didDrawCell`/`willDrawCell` hooks
 * technically support drawing a `doc.addImage` call at a cell's computed
 * `cell.x`/`cell.y`/`cell.width`/`cell.height` position, but doing so
 * correctly requires the image to already be loaded (as a data URL) BEFORE
 * `autoTable` is invoked, since the hook runs synchronously during table
 * layout — meaning every sponsor's logo across every tier group would need
 * to be pre-fetched up front regardless of which approach is chosen. Given
 * that, this renderer pre-fetches each group's logos up front (in
 * parallel) and renders them as a manually positioned `doc.addImage`
 * drawn immediately after `autoTable` finishes laying out that group's
 * table, using the table's own row height to compute each logo's Y
 * position — this keeps the autoTable call itself simple (name + tier
 * text only) and avoids coupling image-loading timing to autoTable's
 * internal hook execution order, which is the more fragile of the two
 * approaches for a synchronous, single-pass document build like this one.
 */
async function drawSponsorsSection(
  doc: jsPDF,
  groups: SponsorTierGroup[],
  theme: BrochureTheme,
  colors: ResolvedBrochureColors,
  startY: number
): Promise<number> {
  const margin = theme.margins.left;
  const pageHeight = doc.internal.pageSize.getHeight();
  const bottomLimit = pageHeight - theme.margins.bottom;

  doc.setFont(resolveFontFamilyForPdf(colors.fontFamily), "bold");
  doc.setFontSize(theme.heading.fontSizePt);
  doc.setTextColor(0, 0, 0);
  doc.text("Sponsors", margin, startY);
  drawHeadingUnderline(doc, theme, colors, margin, startY + 2, 24);
  let y = startY + 10;

  const logoBoxMm = { width: 14, height: 10 };

  for (const group of groups) {
    if (y + 14 > bottomLimit) {
      doc.addPage();
      y = theme.margins.top;
    }

    const [ar, ag, ab] = hexToRgb(group.accentColor);
    doc.setFont(resolveFontFamilyForPdf(colors.fontFamily), "bold");
    doc.setFontSize(theme.heading.fontSizePt * 0.85);
    doc.setTextColor(ar, ag, ab);
    doc.text(group.label, margin, y);
    y += 6;

    // Pre-load every logo in this group's tier up front (parallel), so the
    // manual `addImage` calls below never need to await mid-row.
    const logoDataUrls = await Promise.all(
      group.sponsors.map((sponsor) =>
        sponsor.logo.type === "url" ? loadImageAsDataUrl(sponsor.logo.url) : Promise.resolve(null)
      )
    );

    const rowBody = group.sponsors.map((sponsor) => [sponsor.logo.type === "url" ? "" : sponsor.logo.text, sponsor.name]);

    autoTable(doc, {
      startY: y,
      head: [["Logo", "Sponsor"]],
      body: rowBody,
      theme: theme.table.theme,
      styles: { fontSize: theme.table.fontSizePt, cellPadding: theme.table.cellPaddingMm, overflow: "linebreak" },
      headStyles: { fillColor: [ar, ag, ab], textColor: [255, 255, 255], fontStyle: "bold" },
      columnStyles: { 0: { cellWidth: logoBoxMm.width + theme.table.cellPaddingMm * 2 } },
      margin: { left: margin, right: theme.margins.right },
      didDrawCell: (data) => {
        if (data.section !== "body" || data.column.index !== 0) return;
        const rowIndex = data.row.index;
        const dataUrl = logoDataUrls[rowIndex];
        if (!dataUrl) return;
        try {
          const props = doc.getImageProperties(dataUrl);
          const fitted = fitImageBox(logoBoxMm, props.width, props.height, { allowUpscale: false });
          const cellX = data.cell.x + (data.cell.width - fitted.width) / 2;
          const cellY = data.cell.y + (data.cell.height - fitted.height) / 2;
          doc.addImage(dataUrl, cellX, cellY, fitted.width, fitted.height);
        } catch (err) {
          logger.warn("brochure image load failed", {
            url: "sponsor-logo-draw",
            error_message: err instanceof Error ? err.message : String(err),
          });
        }
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = ((doc as any).lastAutoTable?.finalY ?? y) + 8;
  }

  return y;
}

// ─── Speakers_Section (Requirement 4) ────────────────────────────────────────

const SPEAKER_COLUMNS = 2;
const SPEAKER_PHOTO_HEIGHT_MM = 38;
const SPEAKER_CARD_GAP_MM = 8;
const SPEAKER_CARD_TEXT_HEIGHT_MM = 24;
const SPEAKER_CARD_INNER_PAD_MM = 3;

/**
 * Draws the Speakers_Section as a manual 2-column card grid (NOT
 * `autoTable` — this is a photo/name/title/company grid, not a data
 * table). Each card has a light background and a subtle 1-px border so
 * the card boundaries read cleanly. Tracks a running Y cursor across
 * rows, calling `doc.addPage()` when the next row would overflow the
 * page's printable height.
 *
 * 2 columns (down from 3) doubles the horizontal room each speaker's
 * name/title/company gets, cutting mid-word wrapping on realistic
 * inputs where titles like "VP of Engineering, Payments Platform"
 * previously wrapped to three tight lines.
 */
async function drawSpeakersSection(
  doc: jsPDF,
  rows: SpeakerRow[],
  theme: BrochureTheme,
  colors: ResolvedBrochureColors,
  startY: number
): Promise<number> {
  const margin = theme.margins.left;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - theme.margins.left - theme.margins.right;
  const cardWidth = (contentWidth - SPEAKER_CARD_GAP_MM * (SPEAKER_COLUMNS - 1)) / SPEAKER_COLUMNS;
  const cardHeight = SPEAKER_PHOTO_HEIGHT_MM + SPEAKER_CARD_TEXT_HEIGHT_MM;
  const photoWidth = cardWidth;
  const textWidth = cardWidth - SPEAKER_CARD_INNER_PAD_MM * 2;

  doc.setFont(resolveFontFamilyForPdf(colors.fontFamily), "bold");
  doc.setFontSize(theme.heading.fontSizePt);
  doc.setTextColor(0, 0, 0);
  doc.text("Speakers", margin, startY);
  drawHeadingUnderline(doc, theme, colors, margin, startY + 2, 24);
  let y = startY + 10;

  const bottomLimit = pageHeight - theme.margins.bottom;
  const fontFamily = resolveFontFamilyForPdf(colors.fontFamily);

  for (let i = 0; i < rows.length; i += 1) {
    const col = i % SPEAKER_COLUMNS;

    if (col === 0 && y + cardHeight > bottomLimit) {
      doc.addPage();
      y = theme.margins.top;
    }

    const row = rows[i];
    const cardX = margin + col * (cardWidth + SPEAKER_CARD_GAP_MM);

    // Card chrome: light background + subtle border for a defined
    // container feel that survives being placed on a light or dark page.
    doc.setFillColor(249, 250, 251);
    doc.rect(cardX, y, cardWidth, cardHeight, "F");
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.rect(cardX, y, cardWidth, cardHeight, "S");

    const photoBox = { width: photoWidth, height: SPEAKER_PHOTO_HEIGHT_MM };

    let drewPhoto = false;
    if (row.photo.type === "url") {
      const dataUrl = await loadImageAsDataUrl(row.photo.url);
      if (dataUrl) {
        try {
          const props = doc.getImageProperties(dataUrl);
          const fitted = fitImageBox(photoBox, props.width, props.height, { allowUpscale: false });
          const imgX = cardX + (cardWidth - fitted.width) / 2;
          const imgY = y + (SPEAKER_PHOTO_HEIGHT_MM - fitted.height) / 2;
          doc.addImage(dataUrl, imgX, imgY, fitted.width, fitted.height);
          drewPhoto = true;
        } catch (err) {
          logger.warn("brochure image load failed", {
            url: row.photo.url,
            error_message: err instanceof Error ? err.message : String(err),
          });
        }
      }
      if (!drewPhoto) {
        const trimmed = row.name.trim();
        drawPlaceholder(doc, cardX, y, cardWidth, SPEAKER_PHOTO_HEIGHT_MM, (trimmed[0] || "?").toUpperCase(), colors.accentColor);
      }
    } else {
      drawPlaceholder(doc, cardX, y, cardWidth, SPEAKER_PHOTO_HEIGHT_MM, row.photo.initial, colors.accentColor);
    }

    let textY = y + SPEAKER_PHOTO_HEIGHT_MM + 6;
    const textX = cardX + SPEAKER_CARD_INNER_PAD_MM;
    doc.setFont(fontFamily, "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(0, 0, 0);
    const nameLines = doc.splitTextToSize(row.name, textWidth);
    doc.text(nameLines, textX, textY);
    textY += nameLines.length * 4.2;

    if (row.subtitleLine) {
      doc.setFont(fontFamily, "normal");
      doc.setFontSize(9);
      doc.setTextColor(90, 90, 90);
      const lines = doc.splitTextToSize(row.subtitleLine, textWidth);
      doc.text(lines, textX, textY);
      textY += lines.length * 3.8;
    }

    if (row.companyLine) {
      doc.setFont(fontFamily, "italic");
      doc.setFontSize(8.5);
      doc.setTextColor(130, 130, 130);
      const lines = doc.splitTextToSize(row.companyLine, textWidth);
      doc.text(lines, textX, textY);
    }

    if (col === SPEAKER_COLUMNS - 1 || i === rows.length - 1) {
      y += cardHeight + SPEAKER_CARD_GAP_MM;
    }
  }

  return y;
}

// ─── Venue_Logistics_Section (Requirement 6) ─────────────────────────────────

/** Draws the Venue_Logistics_Section: venue/address/parking/transit text
 *  (wrapped via `doc.splitTextToSize`) and, when `qrCodeSourceUrl` is set, a
 *  QR code generated via the `qrcode` package. QR generation failures are
 *  caught and logged without blocking the rest of the page. */
async function drawVenueLogisticsSection(
  doc: jsPDF,
  content: VenueLogisticsContent,
  theme: BrochureTheme,
  colors: ResolvedBrochureColors,
  startY: number
): Promise<number> {
  const margin = theme.margins.left;
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - margin - theme.margins.right;
  const fontFamily = resolveFontFamilyForPdf(colors.fontFamily);

  doc.setFont(fontFamily, "bold");
  doc.setFontSize(theme.heading.fontSizePt);
  doc.setTextColor(0, 0, 0);
  doc.text("Venue & Logistics", margin, startY);
  drawHeadingUnderline(doc, theme, colors, margin, startY + 2, 40);
  let y = startY + 12;

  const textFields: Array<{ label: string; value?: string }> = [
    { label: "Venue", value: content.venueName },
    { label: "Address", value: content.address },
    { label: "Parking", value: content.parkingNotes },
    { label: "Transit", value: content.transitNotes },
  ];

  for (const field of textFields) {
    if (!field.value) continue;
    doc.setFont(fontFamily, "bold");
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text(`${field.label}:`, margin, y);
    y += 5;

    doc.setFont(fontFamily, "normal");
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);
    const lines = doc.splitTextToSize(field.value, contentWidth);
    doc.text(lines, margin, y);
    y += lines.length * 5 + 3;
  }

  if (content.qrCodeSourceUrl) {
    try {
      const qrDataUrl = await QRCode.toDataURL(content.qrCodeSourceUrl, { margin: 1, width: 320 });
      const qrSize = 40;
      doc.addImage(qrDataUrl, margin, y, qrSize, qrSize);
      y += qrSize + 6;
    } catch (err) {
      logger.warn("brochure qr code generation failed", {
        url: content.qrCodeSourceUrl,
        error_message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return y;
}

// ─── Section-loop assembly (Requirements 7.2, 7.3, 7.4, 9.1, 9.3, 9.4) ──────

/**
 * Builds the shared `jsPDF` document — the ONE function both the export
 * path and the live-preview path call, so they can never produce different
 * content for the same input. Not exported; `generateBrochurePdf` and
 * `buildBrochurePreviewUrl` are the public entry points below.
 */
async function buildBrochureDocument(input: BrochureGenerationInput): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const theme = input.theme;
  const colors = resolveBrochureTheme(theme, input.eventTheme, input.themeOverride);
  const margin = theme.margins.left;

  // Pre-compute every section's content once so an inclusion decision
  // (Requirement 6.5 — omit a section entirely when its fields are all
  // empty) can be applied to the resolved id list BEFORE the drawing
  // loop runs. Without this, a null-content section would still consume
  // a page via the unconditional `doc.addPage()` between sections
  // below, producing a blank page rather than truly omitting the section.
  const venueLogisticsContent = buildVenueLogisticsContent(input.venueLogistics);
  const abstractContent = buildAbstractSectionContent(input.posterContent?.abstract ?? {});
  const whySponsorContent = buildWhySponsorSectionContent(input.posterContent?.whySponsor ?? {});
  const pricingContent = buildPricingSectionContent(input.posterContent?.pricing ?? {});
  const focusOfSummitContent = buildFocusOfSummitContent(input.posterContent?.focusOfSummit ?? {});
  const whoShouldAttendContent = buildWhoShouldAttendContent(input.posterContent?.whoShouldAttend ?? {});
  const solutionProvidersContent = buildSolutionProvidersContent(input.posterContent?.solutionProviders ?? {});
  const highlightsContent = buildHighlightsContent(input.posterContent?.highlights ?? {});

  // Poster_Bold-only sections (`abstract`, `whySponsor`, `pricing`) render
  // only under the `poster-bold` theme; Corporate_Bold-only sections
  // (`focusOfSummit`, `whoShouldAttend`, `solutionProviders`, `highlights`)
  // render only under the `corporate-bold` theme. `abstract` is shared
  // between the two — both themes use it. Any section with null content
  // short-circuits out of the id list so the drawing loop never lands on
  // an empty page.
  const isPosterBold = theme.id === "poster-bold";
  const isCorporateBold = theme.id === "corporate-bold";
  const isPosterFamily = isPosterBold || isCorporateBold;

  const resolvedIds = resolveSectionLayout(input.sectionLayout).filter((id) => {
    if (id === "sponsors") return shouldRenderSponsorsSection(input.sponsors);
    if (id === "venueLogistics") return venueLogisticsContent !== null;
    // Shared Poster_Bold / Corporate_Bold section — either theme can render it.
    if (id === "abstract") return isPosterFamily && abstractContent !== null;
    // Poster_Bold-only sections.
    if (id === "whySponsor") return isPosterBold && whySponsorContent !== null;
    if (id === "pricing") return isPosterBold && pricingContent !== null;
    // Corporate_Bold-only sections.
    if (id === "focusOfSummit") return isCorporateBold && focusOfSummitContent !== null;
    if (id === "whoShouldAttend") return isCorporateBold && whoShouldAttendContent !== null;
    if (id === "solutionProviders") return isCorporateBold && solutionProvidersContent !== null;
    if (id === "highlights") return isCorporateBold && highlightsContent !== null;
    return true;
  });

  const totalSections = resolvedIds.length;
  let completedSections = 0;
  let hasDrawnAnyPage = false;

  for (const id of resolvedIds) {
    if (hasDrawnAnyPage) {
      doc.addPage();
    }
    hasDrawnAnyPage = true;

    const startY = margin;

    switch (id) {
      case "cover": {
        const content = buildCoverContent({
          title: input.event.title,
          date: input.event.date,
          end_date: input.event.end_date,
          image_url: input.event.image_url,
          banner_landscape_url: input.event.banner_landscape_url,
          banner_portrait_url: input.event.banner_portrait_url,
        });
        await drawCoverSection(doc, content, theme, colors, input.posterContent);
        break;
      }
      case "agenda": {
        const content = buildAgendaSectionContent(input.sessions);
        drawAgendaSection(doc, content, theme, colors, startY);
        break;
      }
      case "speakers": {
        const rows = buildSpeakerRows(input.speakers);
        await drawSpeakersSection(doc, rows, theme, colors, startY);
        break;
      }
      case "sponsors": {
        const groups = groupSponsorsByTierOrdered(input.sponsors);
        await drawSponsorsSection(doc, groups, theme, colors, startY);
        break;
      }
      case "venueLogistics": {
        // `venueLogisticsContent` is guaranteed non-null here — the
        // `resolvedIds` filter above already excluded this id when it
        // would have been null.
        if (venueLogisticsContent) {
          await drawVenueLogisticsSection(doc, venueLogisticsContent, theme, colors, startY);
        }
        break;
      }
      case "abstract": {
        if (abstractContent) {
          await drawAbstractSection(doc, abstractContent, theme, colors, input.posterContent?.logoUrl ?? null);
        }
        break;
      }
      case "whySponsor": {
        if (whySponsorContent) {
          await drawWhySponsorSection(doc, whySponsorContent, theme, colors, input.posterContent?.logoUrl ?? null);
        }
        break;
      }
      case "pricing": {
        if (pricingContent) {
          await drawPricingSection(doc, pricingContent, theme, colors, input.posterContent?.logoUrl ?? null);
        }
        break;
      }
      case "focusOfSummit": {
        if (focusOfSummitContent) {
          await drawFocusOfSummitSection(doc, focusOfSummitContent, theme, colors, input);
        }
        break;
      }
      case "whoShouldAttend": {
        if (whoShouldAttendContent) {
          await drawWhoShouldAttendSection(doc, whoShouldAttendContent, theme, colors, input);
        }
        break;
      }
      case "solutionProviders": {
        if (solutionProvidersContent) {
          await drawSolutionProvidersSection(doc, solutionProvidersContent, theme, colors, input);
        }
        break;
      }
      case "highlights": {
        if (highlightsContent) {
          await drawHighlightsSection(doc, highlightsContent, theme, colors, input);
        }
        break;
      }
      default:
        break;
    }

    completedSections += 1;
    input.onProgress?.(completedSections, totalSections);
  }

  // Final page-footer pass — done ONCE, after every section is drawn, so
  // every footer shows the correct final total page count regardless of
  // how many sections/pages preceded it (see design.md's rationale for why
  // this can't be a per-section `didDrawPage` callback).
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i += 1) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text(`${i} / ${totalPages}`, pageWidth - margin, pageHeight - 6, { align: "right" });
  }

  return doc;
}

// ─── Public entry points (Requirements 8.1, 8.2, 9.1, 9.2) ──────────────────

/** Export path: returns the final PDF as a `Blob`. */
export async function generateBrochurePdf(input: BrochureGenerationInput): Promise<Blob> {
  const doc = await buildBrochureDocument(input);
  return doc.output("blob");
}

/** Triggers a browser download, mirroring `downloadTicketPdf`'s object-URL
 *  pattern exactly. Filename via `buildBrochureFilename` (Requirement 9.2). */
export async function downloadBrochurePdf(input: BrochureGenerationInput, eventTitle: string): Promise<void> {
  const blob = await generateBrochurePdf(input);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = buildBrochureFilename(eventTitle);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Live-preview path: returns a `blob:` object URL (`doc.output("bloburl")`)
 * suitable for an `<iframe src>`. The CALLER is responsible for revoking
 * the PREVIOUS url via `URL.revokeObjectURL` before requesting a new one
 * (see `BrochurePreviewFrame`) — this function does not track or revoke any
 * previously issued URL itself.
 */
export async function buildBrochurePreviewUrl(input: BrochureGenerationInput): Promise<string> {
  const doc = await buildBrochureDocument(input);
  return doc.output("bloburl") as unknown as string;
}


// ─── Poster_Bold shared helpers ─────────────────────────────────────────────

/**
 * Draws a solid-color background covering the entire current page.
 * Used by every Poster_Bold content section that wants a full-bleed
 * color plate (Abstract on orange, Why-Sponsor on black, Pricing on
 * orange).
 */
function fillPageBackground(doc: jsPDF, hex: string): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const [r, g, b] = hexToRgb(hex);
  doc.setFillColor(r, g, b);
  doc.rect(0, 0, pageWidth, pageHeight, "F");
}

/**
 * Draws the small `DevOps Connect`-style wordmark logo centered near the
 * top of the current page. Only rendered when `logoUrl` resolves to a
 * loadable image; failures fall back to just the event title in bold
 * (kept close-cropped so a missing logo doesn't leave a gaping hole).
 */
async function drawPosterHeaderLogo(
  doc: jsPDF,
  logoUrl: string | null | undefined,
  fallbackTitle: string,
  theme: BrochureTheme,
  colors: ResolvedBrochureColors,
  textColor: string,
  yTop: number
): Promise<number> {
  const pageWidth = doc.internal.pageSize.getWidth();
  const centerX = pageWidth / 2;
  const logoTargetHeight = 18;
  const logoTargetWidth = pageWidth * 0.42;

  if (logoUrl) {
    const dataUrl = await loadImageAsDataUrl(logoUrl);
    if (dataUrl) {
      try {
        const props = doc.getImageProperties(dataUrl);
        const fitted = fitImageBox(
          { width: logoTargetWidth, height: logoTargetHeight },
          props.width,
          props.height,
          { allowUpscale: false }
        );
        doc.addImage(
          dataUrl,
          centerX - fitted.width / 2,
          yTop,
          fitted.width,
          fitted.height
        );
        return yTop + fitted.height + 6;
      } catch (err) {
        logger.warn("brochure image load failed", {
          url: logoUrl,
          error_message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // Fallback: render just the event title as the header wordmark.
  const [tr, tg, tb] = hexToRgb(textColor);
  doc.setTextColor(tr, tg, tb);
  doc.setFont(resolveFontFamilyForPdf(colors.fontFamily), "bold");
  doc.setFontSize(18);
  doc.text(fallbackTitle, centerX, yTop + 8, { align: "center" });
  return yTop + 18;
}

/** Rounded pill helper — draws a horizontal capsule with the specified
 *  fill color at (x, y) sized (w, h). `radius` defaults to `h / 2` so
 *  the ends are exact semicircles. */
function drawPill(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  fillHex: string,
  strokeHex?: string
): void {
  const [fr, fg, fb] = hexToRgb(fillHex);
  doc.setFillColor(fr, fg, fb);
  if (strokeHex) {
    const [sr, sg, sb] = hexToRgb(strokeHex);
    doc.setDrawColor(sr, sg, sb);
    doc.setLineWidth(0.4);
    doc.roundedRect(x, y, w, h, h / 2, h / 2, "FD");
  } else {
    doc.roundedRect(x, y, w, h, h / 2, h / 2, "F");
  }
}

/** Rounded rectangle with a soft radius, used for content cards on the
 *  Poster_Bold pages. */
function drawCard(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  fillHex: string,
  radius = 6
): void {
  const [fr, fg, fb] = hexToRgb(fillHex);
  doc.setFillColor(fr, fg, fb);
  doc.roundedRect(x, y, w, h, radius, radius, "F");
}

// ─── Poster_Bold Cover ──────────────────────────────────────────────────────

/**
 * Draws the Poster_Bold cover page: centered wordmark at the top, huge
 * bold two-line title, subtitle, two outlined pill-chips for date &
 * venue, a hero image with an orange color-treatment on the bottom
 * quarter, and a footer band with the "Conceptualized & Organized by"
 * logo on the left and social icons on the right.
 *
 * Called from `drawCoverSection` when `theme.cover.style` is
 * `poster-bold`. Never returns from the caller; the caller uses `return`
 * to short-circuit the other cover branches.
 */
async function drawPosterBoldCover(
  doc: jsPDF,
  content: CoverContent,
  theme: BrochureTheme,
  colors: ResolvedBrochureColors,
  heroDataUrl: string | null,
  heroProps: { width: number; height: number } | null,
  posterContent: BrochureGenerationInput["posterContent"] | undefined
): Promise<void> {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const centerX = pageWidth / 2;
  const fontFamily = resolveFontFamilyForPdf(colors.fontFamily);

  // Page background — light off-white so the black text pops.
  fillPageBackground(doc, "#ffffff");

  // ── PORTRAIT HERO BANNER (top, full width, no padding) ────────────────
  //
  // The cover image lives at the very top of the page: x=0, y=0, full
  // page width, no side / top gap. Sized to ~62% of the page height so
  // the portrait aspect of a mobile-view banner (typically ~9:16) has
  // room to render without heavy cropping. fit: cover so the image
  // fills the box and crops the vertical overflow rather than
  // letterboxing.
  const bannerHeight = pageHeight * 0.62;
  if (heroDataUrl && heroProps) {
    const scale = Math.max(
      pageWidth / heroProps.width,
      bannerHeight / heroProps.height
    );
    const drawW = heroProps.width * scale;
    const drawH = heroProps.height * scale;
    const bannerX = (pageWidth - drawW) / 2;
    const bannerY = (bannerHeight - drawH) / 2;
    // Clip to the banner box so the "cover" crop doesn't spill outside.
    // jsPDF doesn't have a clipRect that survives across `addImage`; we
    // emulate by only drawing the visible portion of the image via the
    // scaled offsets computed above. When the source aspect is close
    // to the banner aspect, the overflow is minimal and any leaking
    // is masked by the content stack below.
    doc.addImage(heroDataUrl, bannerX, bannerY, drawW, drawH);
  }

  // ── Content stack below the banner ────────────────────────────────
  let cursorY = bannerHeight + 8;

  // Optional wordmark logo above the title.
  const logoUrl = posterContent?.logoUrl;
  if (logoUrl) {
    const dataUrl = await loadImageAsDataUrl(logoUrl);
    if (dataUrl) {
      try {
        const props = doc.getImageProperties(dataUrl);
        const targetH = 16;
        const targetW = Math.min(pageWidth * 0.5, (props.width / props.height) * targetH);
        doc.addImage(dataUrl, centerX - targetW / 2, cursorY, targetW, targetH);
        cursorY += targetH + 4;
      } catch (err) {
        logger.warn("brochure image load failed", {
          url: logoUrl,
          error_message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // Title.
  const titleMaxWidth = pageWidth - theme.margins.left * 2;
  doc.setFont(fontFamily, "bold");
  const { fontSizePt: titleSize, lines: titleLines } = autoShrinkTitleSize(
    doc,
    content.title,
    titleMaxWidth,
    Math.min(28, theme.cover.titleFontSizePt),
    18,
    2
  );
  const titleLineHeightMm = titleSize * 0.42;
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(titleSize);
  for (const line of titleLines) {
    doc.text(line, centerX, cursorY + titleLineHeightMm, { align: "center" });
    cursorY += titleLineHeightMm;
  }
  cursorY += 4;

  // Outlined date-chip.
  const chipHeight = 10;
  const chipPaddingX = 6;
  doc.setFont(fontFamily, "normal");
  doc.setFontSize(10);
  const dateText = content.dateText;
  const dateWidth = doc.getTextWidth(dateText) + chipPaddingX * 2;
  const chipY = cursorY + 2;
  drawPill(doc, centerX - dateWidth / 2, chipY, dateWidth, chipHeight, "#ffffff", "#000000");
  doc.setTextColor(0, 0, 0);
  doc.text(dateText, centerX, chipY + chipHeight / 2 + 0.6, {
    align: "center",
    baseline: "middle",
  });
  cursorY = chipY + chipHeight + 4;

  // ── Footer band ───────────────────────────────────────────────────
  const footerBandHeight = 28;
  const footerTop = pageHeight - footerBandHeight;
  const producerLogoUrl = posterContent?.organizerLogoUrl;

  // Left: caption + producer logo
  doc.setFont(fontFamily, "bold");
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text("Conceptualized & Organized by", theme.margins.left, footerTop + 6);
  if (producerLogoUrl) {
    const dataUrl = await loadImageAsDataUrl(producerLogoUrl);
    if (dataUrl) {
      try {
        const props = doc.getImageProperties(dataUrl);
        const fitted = fitImageBox(
          { width: 44, height: 20 },
          props.width,
          props.height,
          { allowUpscale: false }
        );
        doc.addImage(
          dataUrl,
          theme.margins.left,
          footerTop + 10,
          fitted.width,
          fitted.height
        );
      } catch (err) {
        logger.warn("brochure image load failed", {
          url: producerLogoUrl,
          error_message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // Right: social icons row
  const socials = posterContent?.socialLinks ?? [];
  if (Array.isArray(socials) && socials.length > 0) {
    doc.setFont(fontFamily, "bold");
    doc.setFontSize(9);
    doc.text(
      "Follow us on social media",
      pageWidth - theme.margins.right,
      footerTop + 6,
      { align: "right" }
    );
    const iconSize = 7;
    const iconGap = 4;
    const totalRowWidth = socials.length * iconSize + (socials.length - 1) * iconGap;
    let iconX = pageWidth - theme.margins.right - totalRowWidth;
    const iconY = footerTop + 14;
    const brandColors: Record<string, string> = {
      linkedin: "#0a66c2",
      instagram: "#e1306c",
      facebook: "#1877f2",
      twitter: "#1da1f2",
    };
    const brandInitials: Record<string, string> = {
      linkedin: "in",
      instagram: "ig",
      facebook: "f",
      twitter: "x",
    };
    for (const s of socials) {
      const bg = brandColors[s.platform] ?? "#000000";
      const [br, bgc, bb] = hexToRgb(bg);
      doc.setFillColor(br, bgc, bb);
      doc.circle(iconX + iconSize / 2, iconY + iconSize / 2, iconSize / 2, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(5);
      doc.setFont(fontFamily, "bold");
      doc.text(brandInitials[s.platform] ?? "•", iconX + iconSize / 2, iconY + iconSize / 2 + 0.6, {
        align: "center",
        baseline: "middle",
      });
      iconX += iconSize + iconGap;
    }
  }
}

// ─── Abstract_Section (Poster_Bold, page 2) ─────────────────────────────────

async function drawAbstractSection(
  doc: jsPDF,
  content: AbstractSectionContent,
  theme: BrochureTheme,
  colors: ResolvedBrochureColors,
  logoUrl: string | null
): Promise<void> {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = theme.margins.left;
  const contentWidth = pageWidth - margin * 2;
  const fontFamily = resolveFontFamilyForPdf(colors.fontFamily);

  // Full-bleed orange background.
  fillPageBackground(doc, colors.accentColor);

  // Header wordmark centered at top (light text since bg is orange).
  const headerBottom = await drawPosterHeaderLogo(
    doc,
    logoUrl,
    "",
    theme,
    colors,
    "#ffffff",
    theme.margins.top
  );
  let y = headerBottom + 6;

  // Card render helper for both Abstract and Featured cards.
  const cardPad = 8;
  const bodyLineHeight = 5.2;
  const bodyFontSize = 11;
  const drawCardBlock = (heading: string, body: string, atY: number): number => {
    // Body wrap
    doc.setFont(fontFamily, "normal");
    doc.setFontSize(bodyFontSize);
    const lines = doc.splitTextToSize(body, contentWidth - cardPad * 2 - 12);
    const bodyHeight = lines.length * bodyLineHeight;

    // Heading pill (black bg, white text) — floats above the card, half
    // in and half out.
    const headingPillW = 42;
    const headingPillH = 10;
    const headingX = pageWidth / 2 - headingPillW / 2;
    const headingY = atY;
    drawPill(doc, headingX, headingY, headingPillW, headingPillH, "#000000");
    doc.setTextColor(255, 255, 255);
    doc.setFont(fontFamily, "bold");
    doc.setFontSize(10);
    doc.text(heading, pageWidth / 2, headingY + headingPillH / 2 + 0.5, {
      align: "center",
      baseline: "middle",
    });

    // Card body (white bg, dark text) — starts halfway through the pill
    // for the overlap effect.
    const cardY = headingY + headingPillH / 2;
    const cardH = bodyHeight + cardPad * 2 + headingPillH / 2;
    drawCard(doc, margin, cardY, contentWidth, cardH, "#ffffff", 8);
    doc.setTextColor(0, 0, 0);
    doc.setFont(fontFamily, "normal");
    doc.setFontSize(bodyFontSize);
    doc.text(lines, pageWidth / 2, cardY + headingPillH / 2 + cardPad + bodyLineHeight - 1, {
      align: "center",
    });

    return cardY + cardH + 8;
  };

  if (content.abstract) {
    y = drawCardBlock("ABSTRACT", content.abstract, y);
  }
  if (content.featured) {
    y = drawCardBlock("Featured", content.featured, y);
  }

  // Learning outcomes — two-column grid of dark rounded chips.
  if (content.learningOutcomes && content.learningOutcomes.length > 0) {
    y += 4;
    doc.setFont(fontFamily, "bold");
    doc.setFontSize(theme.heading.fontSizePt);
    doc.setTextColor(0, 0, 0);
    doc.text("LEARNING OUTCOMES", pageWidth / 2, y, { align: "center" });
    y += 8;

    const cols = 2;
    const gap = 4;
    const chipW = (contentWidth - gap * (cols - 1)) / cols;
    const chipH = 18;
    const rowGap = 4;
    for (let i = 0; i < content.learningOutcomes.length; i += 1) {
      if (y + chipH > pageHeight - theme.margins.bottom) break; // clip overflow
      const col = i % cols;
      const row = Math.floor(i / cols);
      const chipX = margin + col * (chipW + gap);
      const chipY = y + row * (chipH + rowGap);
      drawCard(doc, chipX, chipY, chipW, chipH, "#000000", 5);
      doc.setTextColor(255, 255, 255);
      doc.setFont(fontFamily, "bold");
      doc.setFontSize(10);
      const wrapped = doc.splitTextToSize(content.learningOutcomes[i], chipW - 8);
      const textStart = chipY + chipH / 2 - ((wrapped.length - 1) * 4.4) / 2 + 1;
      doc.text(wrapped, chipX + chipW / 2, textStart, {
        align: "center",
        baseline: "middle",
      });
    }
  }
}

// ─── WhySponsor_Section (Poster_Bold, page 3) ───────────────────────────────

async function drawWhySponsorSection(
  doc: jsPDF,
  content: WhySponsorSectionContent,
  theme: BrochureTheme,
  colors: ResolvedBrochureColors,
  logoUrl: string | null
): Promise<void> {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = theme.margins.left;
  const contentWidth = pageWidth - margin * 2;
  const fontFamily = resolveFontFamilyForPdf(colors.fontFamily);

  // Full-bleed black background.
  fillPageBackground(doc, "#000000");

  // Header wordmark (white text on black).
  const headerBottom = await drawPosterHeaderLogo(
    doc,
    logoUrl,
    "",
    theme,
    colors,
    "#ffffff",
    theme.margins.top
  );

  // Huge title.
  const titleY = headerBottom + 12;
  doc.setFont(fontFamily, "bold");
  doc.setFontSize(36);
  doc.setTextColor(255, 255, 255);
  doc.text("WHY SPONSOR?", pageWidth / 2, titleY, { align: "center" });

  // Numbered rows.
  let y = titleY + 14;
  const rowGap = 3;
  const badgeW = 18;
  const rowH = 20;
  const rowPad = 6;
  const bottomLimit = pageHeight - theme.margins.bottom;
  const [ar, ag, ab] = hexToRgb(colors.accentColor);

  for (let i = 0; i < content.items.length; i += 1) {
    if (y + rowH > bottomLimit) break; // clip overflow — Poster_Bold spec keeps this to one page
    const item = content.items[i];
    // Number badge — full-height orange rectangle on the left.
    doc.setFillColor(ar, ag, ab);
    doc.rect(margin, y, badgeW, rowH, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont(fontFamily, "bold");
    doc.setFontSize(16);
    doc.text(String(i + 1), margin + badgeW / 2, y + rowH / 2 + 0.5, {
      align: "center",
      baseline: "middle",
    });
    // Row body — white text on black, with a thin orange border on
    // the right edge to echo the reference design's grid feel.
    doc.setDrawColor(ar, ag, ab);
    doc.setLineWidth(0.3);
    doc.rect(margin, y, contentWidth, rowH, "S");
    doc.setTextColor(255, 255, 255);
    doc.setFont(fontFamily, "normal");
    doc.setFontSize(10);
    const bodyWrapWidth = contentWidth - badgeW - rowPad * 2;
    const wrapped = doc.splitTextToSize(item, bodyWrapWidth);
    const textStart = y + rowH / 2 - ((wrapped.length - 1) * 4.3) / 2 + 1;
    doc.text(wrapped, margin + badgeW + rowPad, textStart, { baseline: "middle" });
    y += rowH + rowGap;
  }
}

// ─── Pricing_Section (Poster_Bold, page 5) ─────────────────────────────────

async function drawPricingSection(
  doc: jsPDF,
  content: PricingSectionContent,
  theme: BrochureTheme,
  colors: ResolvedBrochureColors,
  logoUrl: string | null
): Promise<void> {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = theme.margins.left;
  const contentWidth = pageWidth - margin * 2;
  const fontFamily = resolveFontFamilyForPdf(colors.fontFamily);

  // Full-bleed orange background.
  fillPageBackground(doc, colors.accentColor);

  // Header wordmark.
  const headerBottom = await drawPosterHeaderLogo(
    doc,
    logoUrl,
    "",
    theme,
    colors,
    "#ffffff",
    theme.margins.top
  );

  let y = headerBottom + 8;

  // Pricing cards — one or two columns depending on card count.
  const cardCount = content.cards.length;
  if (cardCount > 0) {
    const cardH = 66;
    const gap = 6;
    const cardCols = Math.min(cardCount, 2);
    const cardW = (contentWidth - gap * (cardCols - 1)) / cardCols;
    for (let i = 0; i < content.cards.length; i += 1) {
      const card = content.cards[i];
      const col = i % cardCols;
      const row = Math.floor(i / cardCols);
      const cx = margin + col * (cardW + gap);
      const cy = y + row * (cardH + gap);
      // Card container — white bg, rounded.
      drawCard(doc, cx, cy, cardW, cardH, "#ffffff", 8);

      // Title row — small orange arrow chip + bold title.
      const [ar, ag, ab] = hexToRgb(colors.accentColor);
      doc.setFillColor(ar, ag, ab);
      doc.circle(cx + 10, cy + 12, 4, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont(fontFamily, "bold");
      doc.setFontSize(7);
      doc.text("→", cx + 10, cy + 12 + 1, { align: "center", baseline: "middle" });

      doc.setTextColor(0, 0, 0);
      doc.setFont(fontFamily, "bold");
      doc.setFontSize(12);
      doc.text(card.title.toUpperCase(), cx + 18, cy + 11);
      if (card.subtitle) {
        doc.setFont(fontFamily, "normal");
        doc.setFontSize(9);
        doc.setTextColor(80, 80, 80);
        doc.text(card.subtitle, cx + 18, cy + 17);
      }

      // Huge price line.
      doc.setTextColor(0, 0, 0);
      doc.setFont(fontFamily, "bold");
      doc.setFontSize(24);
      doc.text(card.price, cx + cardW / 2, cy + 33, { align: "center" });

      // Divider.
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.3);
      doc.line(cx + 8, cy + 38, cx + cardW - 8, cy + 38);

      // Discounts.
      if (card.discounts.length > 0) {
        doc.setTextColor(60, 60, 60);
        doc.setFont(fontFamily, "bold");
        doc.setFontSize(9);
        doc.text("Group Discounts", cx + 8, cy + 44);
        doc.setFont(fontFamily, "normal");
        doc.setFontSize(8.5);
        let dy = cy + 50;
        for (const d of card.discounts) {
          doc.setFillColor(34, 197, 94);
          doc.circle(cx + 10, dy - 1.2, 1.2, "F");
          doc.setTextColor(60, 60, 60);
          doc.text(d, cx + 14, dy);
          dy += 4.5;
        }
      }
    }
    const rowCount = Math.ceil(cardCount / cardCols);
    y += rowCount * (cardH + gap);
  }

  // Blank registration form — 3 rows × 2 columns of empty pill inputs
  // labelled Name / Designation / Mobile / Email / (repeat).
  if (content.showRegistrationForm) {
    const labels: Array<[string, string]> = [
      ["Name", "Designation"],
      ["Mobile", "Email"],
    ];
    const rowGap = 6;
    const cellGap = 6;
    const cellW = (contentWidth - cellGap) / 2;
    const inputH = 8;
    const labelH = 3;
    const rowCount = 3; // three attendee rows in the reference brochure
    const rowH = (labelH + inputH) * 2 + rowGap;
    y += 4;
    for (let r = 0; r < rowCount; r += 1) {
      if (y + rowH > pageHeight - theme.margins.bottom) break;
      for (let l = 0; l < labels.length; l += 1) {
        const [left, right] = labels[l];
        const rowY = y + l * (labelH + inputH + 2);
        // Left cell
        doc.setTextColor(255, 255, 255);
        doc.setFont(fontFamily, "normal");
        doc.setFontSize(7.5);
        doc.text(left, margin + cellW / 2, rowY, { align: "center" });
        drawPill(doc, margin, rowY + 1, cellW, inputH, "#ffffff");
        // Right cell
        doc.text(right, margin + cellW + cellGap + cellW / 2, rowY, { align: "center" });
        drawPill(doc, margin + cellW + cellGap, rowY + 1, cellW, inputH, "#ffffff");
      }
      y += rowH + 2;
    }
  }
}


// ─── Corporate_Bold shared helpers ──────────────────────────────────────────

/**
 * Draws the recurring Corporate_Bold page header: small event wordmark
 * on the top-left, date/venue line on the top-right, thin purple
 * divider bar underneath. Returns the Y-cursor position just below the
 * divider so the caller can start its content immediately after.
 *
 * Called at the top of every Corporate_Bold content page (page 2+) so
 * the reference brochure's consistent header stripe is preserved.
 */
async function drawCorporateBoldPageHeader(
  doc: jsPDF,
  input: BrochureGenerationInput,
  theme: BrochureTheme,
  colors: ResolvedBrochureColors
): Promise<number> {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = theme.margins.left;
  const fontFamily = resolveFontFamilyForPdf(colors.fontFamily);
  const topY = theme.margins.top - 6;

  // Left: wordmark (falls back to plain title text).
  let leftBottom = topY;
  const logoUrl = input.posterContent?.logoUrl ?? null;
  if (logoUrl) {
    const dataUrl = await loadImageAsDataUrl(logoUrl);
    if (dataUrl) {
      try {
        const props = doc.getImageProperties(dataUrl);
        const fitted = fitImageBox(
          { width: 42, height: 12 },
          props.width,
          props.height,
          { allowUpscale: false }
        );
        doc.addImage(dataUrl, margin, topY, fitted.width, fitted.height);
        leftBottom = topY + fitted.height;
      } catch (err) {
        logger.warn("brochure image load failed", {
          url: logoUrl,
          error_message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
  if (leftBottom === topY) {
    // No logo loaded — draw event title as a mini wordmark.
    doc.setFont(fontFamily, "bold");
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text(input.event.title || "Event", margin, topY + 6);
    leftBottom = topY + 8;
  }

  // Right: "DD MMM YYYY | HH:MM onwards | Venue" line.
  const dateText = (() => {
    try {
      const d = new Date(input.event.date);
      const dateStr = d.toLocaleDateString("en-US", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
      const timeStr = d.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
      const venue = input.event.venue || input.event.location || "";
      return venue ? `${dateStr}  |  ${timeStr} onwards  |  ${venue}` : `${dateStr}  |  ${timeStr} onwards`;
    } catch {
      return input.event.title;
    }
  })();
  doc.setFont(fontFamily, "bold");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text(dateText, pageWidth - theme.margins.right, topY + 6, { align: "right" });

  // Thin purple divider under both.
  const dividerY = Math.max(leftBottom, topY + 10) + 3;
  const [ar, ag, ab] = hexToRgb(colors.accentColor);
  doc.setFillColor(ar, ag, ab);
  doc.rect(margin, dividerY, pageWidth - margin * 2, 0.3, "F");

  return dividerY + 4;
}

/** Fills the whole page with a deep purple → magenta vertical gradient
 *  approximation. jsPDF has no native gradient primitive, so this
 *  draws N horizontal bands each interpolated between two hex colors. */
function drawVerticalGradient(doc: jsPDF, hexTop: string, hexBottom: string): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const [r1, g1, b1] = hexToRgb(hexTop);
  const [r2, g2, b2] = hexToRgb(hexBottom);
  const bands = 40;
  const bandHeight = pageHeight / bands;
  for (let i = 0; i < bands; i += 1) {
    const t = i / (bands - 1);
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    doc.setFillColor(r, g, b);
    doc.rect(0, i * bandHeight, pageWidth, bandHeight + 0.3, "F");
  }
}

// ─── Corporate_Bold Cover ───────────────────────────────────────────────────

async function drawCorporateBoldCover(
  doc: jsPDF,
  content: CoverContent,
  theme: BrochureTheme,
  colors: ResolvedBrochureColors,
  heroDataUrl: string | null,
  heroProps: { width: number; height: number } | null,
  posterContent: BrochureGenerationInput["posterContent"] | undefined
): Promise<void> {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const centerX = pageWidth / 2;
  const fontFamily = resolveFontFamilyForPdf(colors.fontFamily);

  // Deep purple gradient background.
  drawVerticalGradient(doc, "#1a0730", "#3a1152");

  // Top wordmark logo.
  const logoUrl = posterContent?.logoUrl;
  let cursorY = theme.margins.top + 12;
  if (logoUrl) {
    const dataUrl = await loadImageAsDataUrl(logoUrl);
    if (dataUrl) {
      try {
        const props = doc.getImageProperties(dataUrl);
        const fitted = fitImageBox(
          { width: pageWidth * 0.55, height: 22 },
          props.width,
          props.height,
          { allowUpscale: false }
        );
        doc.addImage(
          dataUrl,
          centerX - fitted.width / 2,
          cursorY,
          fitted.width,
          fitted.height
        );
        cursorY += fitted.height + 6;
      } catch (err) {
        logger.warn("brochure image load failed", {
          url: logoUrl,
          error_message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // Huge white title (auto-shrunk to two lines).
  const titleMaxW = pageWidth - theme.margins.left * 2;
  doc.setFont(fontFamily, "bold");
  const { fontSizePt: titleSize, lines: titleLines } = autoShrinkTitleSize(
    doc,
    content.title,
    titleMaxW,
    theme.cover.titleFontSizePt,
    28,
    2
  );
  const titleLh = titleSize * 0.42;
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(titleSize);
  cursorY += 4;
  for (const line of titleLines) {
    doc.text(line, centerX, cursorY, { align: "center" });
    cursorY += titleLh;
  }

  // Tagline pill (white bg, accent-colored text + arrow).
  const tagline = typeof posterContent?.coverTagline === "string" ? posterContent.coverTagline.trim() : "";
  if (tagline) {
    cursorY += 8;
    doc.setFont(fontFamily, "bold");
    doc.setFontSize(14);
    const w = doc.getTextWidth(tagline) + 30;
    const h = 14;
    drawPill(doc, centerX - w / 2, cursorY, w, h, "#ffffff");
    const [ar, ag, ab] = hexToRgb(colors.accentColor);
    doc.setTextColor(ar, ag, ab);
    doc.text(tagline, centerX - 8, cursorY + h / 2 + 0.6, {
      align: "center",
      baseline: "middle",
    });
    // Arrow in a small dark circle on the right end.
    const circleR = 4;
    const circleCx = centerX + w / 2 - circleR - 4;
    const circleCy = cursorY + h / 2;
    doc.setFillColor(ar, ag, ab);
    doc.setDrawColor(ar, ag, ab);
    doc.circle(circleCx, circleCy, circleR, "S");
    doc.setTextColor(ar, ag, ab);
    doc.setFontSize(8);
    doc.text("→", circleCx, circleCy + 1, { align: "center", baseline: "middle" });
    cursorY += h + 4;
  }

  // Outlined chip row (Autonomy | Governance | Capital).
  const pills = (posterContent?.coverPills ?? []).filter(
    (p) => typeof p === "string" && p.trim().length > 0
  );
  if (pills.length > 0) {
    cursorY += 6;
    doc.setFont(fontFamily, "normal");
    doc.setFontSize(10);
    const chipH = 9;
    const chipPadX = 10;
    const chipGap = 6;
    const widths = pills.map((p) => doc.getTextWidth(p) + chipPadX * 2);
    const total = widths.reduce((a, b) => a + b, 0) + chipGap * (pills.length - 1);
    let x = centerX - total / 2;
    for (let i = 0; i < pills.length; i += 1) {
      const w = widths[i];
      // Outline-only pill: white stroke on gradient bg.
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.3);
      doc.roundedRect(x, cursorY, w, chipH, chipH / 2, chipH / 2, "S");
      doc.setTextColor(255, 255, 255);
      doc.text(pills[i], x + w / 2, cursorY + chipH / 2 + 0.6, {
        align: "center",
        baseline: "middle",
      });
      x += w + chipGap;
    }
    cursorY += chipH + 6;
  }

  // Date | venue line.
  const dateLine = `${content.dateText}${
    (posterContent as unknown as { __venueOverride?: string } | undefined)?.__venueOverride
      ? "  |  " + (posterContent as unknown as { __venueOverride?: string } | undefined)!.__venueOverride
      : ""
  }`;
  doc.setFont(fontFamily, "bold");
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text(dateLine, centerX, cursorY + 4, { align: "center" });
  cursorY += 12;

  // Hero image (cityscape) in a rounded card centered below.
  const heroTop = cursorY + 6;
  const footerH = 40;
  const heroBottomLimit = pageHeight - footerH - 8;
  const heroSlotW = pageWidth - theme.margins.left * 2;
  const heroSlotH = heroBottomLimit - heroTop;
  if (heroDataUrl && heroProps) {
    const fitted = fitImageBox(
      { width: heroSlotW, height: heroSlotH },
      heroProps.width,
      heroProps.height,
      { allowUpscale: true }
    );
    const imgX = centerX - fitted.width / 2;
    const imgY = heroTop + (heroSlotH - fitted.height) / 2;
    doc.addImage(heroDataUrl, imgX, imgY, fitted.width, fitted.height);
  }

  // Footer band (white background carved out at the bottom).
  const footerY = pageHeight - footerH;
  doc.setFillColor(255, 255, 255);
  doc.rect(0, footerY, pageWidth, footerH, "F");

  // Left: "Conceptualized & Organized by" + logo.
  doc.setFont(fontFamily, "bold");
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text("Conceptualized & Organized by", theme.margins.left, footerY + 8);
  const producerLogoUrl = posterContent?.organizerLogoUrl;
  if (producerLogoUrl) {
    const dataUrl = await loadImageAsDataUrl(producerLogoUrl);
    if (dataUrl) {
      try {
        const props = doc.getImageProperties(dataUrl);
        const fitted = fitImageBox(
          { width: 44, height: 20 },
          props.width,
          props.height,
          { allowUpscale: false }
        );
        doc.addImage(
          dataUrl,
          theme.margins.left,
          footerY + 12,
          fitted.width,
          fitted.height
        );
      } catch (err) {
        logger.warn("brochure image load failed", {
          url: producerLogoUrl,
          error_message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // Right: "Follow us on social media" + icons.
  const socials = posterContent?.socialLinks ?? [];
  if (Array.isArray(socials) && socials.length > 0) {
    doc.setFont(fontFamily, "bold");
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text(
      "Follow us on social media",
      pageWidth - theme.margins.right,
      footerY + 8,
      { align: "right" }
    );
    const iconSize = 7;
    const iconGap = 4;
    const total = socials.length * iconSize + (socials.length - 1) * iconGap;
    let iconX = pageWidth - theme.margins.right - total;
    const iconY = footerY + 14;
    const brandColors: Record<string, string> = {
      linkedin: "#0a66c2",
      instagram: "#e1306c",
      facebook: "#1877f2",
      twitter: "#1da1f2",
    };
    const brandInitials: Record<string, string> = {
      linkedin: "in",
      instagram: "ig",
      facebook: "f",
      twitter: "x",
    };
    for (const s of socials) {
      const [br, bgc, bb] = hexToRgb(brandColors[s.platform] ?? "#000000");
      doc.setFillColor(br, bgc, bb);
      doc.circle(iconX + iconSize / 2, iconY + iconSize / 2, iconSize / 2, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(5);
      doc.setFont(fontFamily, "bold");
      doc.text(brandInitials[s.platform] ?? "•", iconX + iconSize / 2, iconY + iconSize / 2 + 0.6, {
        align: "center",
        baseline: "middle",
      });
      iconX += iconSize + iconGap;
    }
  }
}

// ─── Focus of the Summit page ───────────────────────────────────────────────

async function drawFocusOfSummitSection(
  doc: jsPDF,
  content: FocusOfSummitContent,
  theme: BrochureTheme,
  colors: ResolvedBrochureColors,
  input: BrochureGenerationInput
): Promise<void> {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = theme.margins.left;
  const contentW = pageWidth - margin * 2;
  const fontFamily = resolveFontFamilyForPdf(colors.fontFamily);

  // Solid black page background.
  fillPageBackground(doc, "#000000");
  const startY = await drawCorporateBoldPageHeader(doc, input, theme, colors);

  // Dark rounded card with the title + bulleted list. Card takes most
  // of the page's remaining height minus a small margin.
  const cardX = margin;
  const cardY = startY + 4;
  const cardH = pageHeight - cardY - theme.margins.bottom;
  const cardW = contentW;
  drawCard(doc, cardX, cardY, cardW, cardH, "#0f0a1a", 10);

  // Title on the card.
  doc.setFont(fontFamily, "bold");
  doc.setFontSize(theme.heading.fontSizePt);
  doc.setTextColor(255, 255, 255);
  doc.text("Focus of the Summit", cardX + 10, cardY + 18);

  // Bulleted items.
  const [ar, ag, ab] = hexToRgb(colors.accentColor);
  const listX = cardX + 14;
  const bulletX = cardX + 8;
  const listW = cardW - 20;
  let y = cardY + 28;
  doc.setFont(fontFamily, "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(230, 230, 230);
  for (const item of content.items) {
    if (y + 14 > cardY + cardH - 6) break;
    // Bullet.
    doc.setFillColor(ar, ag, ab);
    doc.circle(bulletX, y - 1.6, 1.1, "F");
    // Body wrap.
    const wrapped = doc.splitTextToSize(item, listW);
    doc.text(wrapped, listX, y);
    y += wrapped.length * 4.6 + 3;
  }

  // Small purple accent bar on the right edge of the card, echoing the
  // reference. Only decorative.
  doc.setFillColor(ar, ag, ab);
  doc.rect(cardX + cardW - 4, cardY + cardH * 0.4, 2, cardH * 0.4, "F");
}

// ─── Who Should Attend page ────────────────────────────────────────────────

async function drawWhoShouldAttendSection(
  doc: jsPDF,
  content: WhoShouldAttendContent,
  theme: BrochureTheme,
  colors: ResolvedBrochureColors,
  input: BrochureGenerationInput
): Promise<void> {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = theme.margins.left;
  const contentW = pageWidth - margin * 2;
  const fontFamily = resolveFontFamilyForPdf(colors.fontFamily);

  fillPageBackground(doc, "#000000");
  let y = await drawCorporateBoldPageHeader(doc, input, theme, colors);

  // "Who should attend?" pill title.
  y += 6;
  doc.setFont(fontFamily, "bold");
  doc.setFontSize(13);
  const titleText = "Who should attend?";
  const pillW = doc.getTextWidth(titleText) + 24;
  const pillH = 12;
  drawPill(doc, margin, y, pillW, pillH, "#111111");
  doc.setTextColor(255, 255, 255);
  doc.text(titleText, margin + pillW / 2, y + pillH / 2 + 0.6, {
    align: "center",
    baseline: "middle",
  });
  y += pillH + 6;

  // Description paragraph.
  if (content.description) {
    doc.setFont(fontFamily, "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(220, 220, 220);
    const wrapped = doc.splitTextToSize(content.description, contentW);
    doc.text(wrapped, margin, y + 4);
    y += wrapped.length * 5 + 6;
  }

  // Two-column bulleted list of attendee types.
  if (content.items.length > 0) {
    y += 2;
    const cols = 2;
    const colGap = 10;
    const colW = (contentW - colGap) / cols;
    doc.setFont(fontFamily, "normal");
    doc.setFontSize(11);
    const bullet = "•";
    doc.setTextColor(220, 220, 220);
    for (let i = 0; i < content.items.length; i += 1) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const xBase = margin + col * (colW + colGap);
      const yLine = y + row * 8;
      doc.text(`${bullet}  ${content.items[i]}`, xBase, yLine);
    }
  }
}

// ─── Solution Providers page ────────────────────────────────────────────────

async function drawSolutionProvidersSection(
  doc: jsPDF,
  content: SolutionProvidersContent,
  theme: BrochureTheme,
  colors: ResolvedBrochureColors,
  input: BrochureGenerationInput
): Promise<void> {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = theme.margins.left;
  const contentW = pageWidth - margin * 2;
  const fontFamily = resolveFontFamilyForPdf(colors.fontFamily);

  fillPageBackground(doc, "#000000");
  let y = await drawCorporateBoldPageHeader(doc, input, theme, colors);

  y += 8;
  // Full-width black card with the title + wide description.
  const bodyLines = doc.splitTextToSize(content.description, contentW - 20);
  const bodyHeight = bodyLines.length * 5.4;
  const cardH = 22 + bodyHeight + 14;
  drawCard(doc, margin, y, contentW, cardH, "#0d0912", 12);

  doc.setFont(fontFamily, "bold");
  doc.setFontSize(28);
  doc.setTextColor(255, 255, 255);
  doc.text("Solution Providers", margin + 12, y + 20);

  doc.setFont(fontFamily, "normal");
  doc.setFontSize(11);
  doc.setTextColor(220, 220, 220);
  doc.text(bodyLines, margin + 12, y + 30);
}

// ─── Highlights (Why Matters + What You Gain) page ─────────────────────────

async function drawHighlightsSection(
  doc: jsPDF,
  content: HighlightsContent,
  theme: BrochureTheme,
  colors: ResolvedBrochureColors,
  input: BrochureGenerationInput
): Promise<void> {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = theme.margins.left;
  const contentW = pageWidth - margin * 2;
  const fontFamily = resolveFontFamilyForPdf(colors.fontFamily);

  fillPageBackground(doc, "#000000");
  let y = await drawCorporateBoldPageHeader(doc, input, theme, colors);
  y += 6;

  // One or two side-by-side purple-gradient cards.
  const cardCount = content.cards.length;
  const cardGap = 6;
  const cardW = cardCount === 1 ? contentW : (contentW - cardGap) / 2;
  const cardH = Math.min(pageHeight - y - theme.margins.bottom - 4, 130);

  const drawCardAt = (card: HighlightsContent["cards"][number], x: number) => {
    // Purple gradient card.
    const bandCount = 20;
    const bandH = cardH / bandCount;
    const [r1, g1, b1] = hexToRgb("#4a1e6b");
    const [r2, g2, b2] = hexToRgb("#0f0a1a");
    for (let i = 0; i < bandCount; i += 1) {
      const t = i / (bandCount - 1);
      const r = Math.round(r1 + (r2 - r1) * t);
      const g = Math.round(g1 + (g2 - g1) * t);
      const b = Math.round(b1 + (b2 - b1) * t);
      doc.setFillColor(r, g, b);
      if (i === 0) {
        // Top rounded band.
        doc.roundedRect(x, y + i * bandH, cardW, bandH + 0.4, 6, 6, "F");
      } else if (i === bandCount - 1) {
        doc.roundedRect(x, y + i * bandH - 0.4, cardW, bandH + 0.4, 6, 6, "F");
      } else {
        doc.rect(x, y + i * bandH, cardW, bandH + 0.4, "F");
      }
    }
    // Content.
    doc.setFont(fontFamily, "bold");
    doc.setFontSize(15);
    doc.setTextColor(255, 255, 255);
    doc.text(card.title, x + 8, y + 12);
    doc.setFont(fontFamily, "normal");
    doc.setFontSize(10);
    doc.setTextColor(230, 230, 230);
    const [ar, ag, ab] = hexToRgb(colors.accentColor);
    let by = y + 24;
    for (const item of card.items) {
      if (by + 8 > y + cardH - 6) break;
      // Bullet.
      doc.setFillColor(ar, ag, ab);
      doc.circle(x + 12, by - 1.6, 1.1, "F");
      const wrapped = doc.splitTextToSize(item, cardW - 24);
      doc.setTextColor(230, 230, 230);
      doc.text(wrapped, x + 18, by);
      by += wrapped.length * 4.6 + 3;
    }
  };

  for (let i = 0; i < content.cards.length; i += 1) {
    const x = margin + i * (cardW + cardGap);
    drawCardAt(content.cards[i], x);
  }
}
