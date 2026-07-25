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
  type AgendaSessionInput,
  type AgendaSectionContent,
  type CoverContent,
  type SpeakerInput,
  type SpeakerRow,
  type SponsorInput,
  type SponsorTierGroup,
  type VenueLogisticsContent,
  type VenueLogisticsInput,
  buildAgendaSectionContent,
  buildCoverContent,
  buildSpeakerRows,
  buildVenueLogisticsContent,
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
  colors: ResolvedBrochureColors
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

  // Pre-compute the venue/logistics content once so its inclusion decision
  // (Requirement 6.5 — omit the section entirely when all fields are
  // empty) can be applied to the resolved id list BEFORE the drawing loop
  // runs. Without this, a null-content venueLogistics slot would still
  // consume a page via the unconditional `doc.addPage()` between sections
  // below, producing a blank page rather than truly omitting the section.
  const venueLogisticsContent = buildVenueLogisticsContent(input.venueLogistics);

  const resolvedIds = resolveSectionLayout(input.sectionLayout).filter((id) => {
    if (id === "sponsors") return shouldRenderSponsorsSection(input.sponsors);
    if (id === "venueLogistics") return venueLogisticsContent !== null;
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
        });
        await drawCoverSection(doc, content, theme, colors);
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
