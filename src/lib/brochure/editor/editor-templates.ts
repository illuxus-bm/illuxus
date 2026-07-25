/**
 * Template presets for the brochure editor. Each preset takes a small
 * set of event-provided values (title, date, venue, cover image URL,
 * organizer branding) and returns a fully-populated
 * `Brochure_Document` — every text block, image, and shape from the
 * corresponding jsPDF theme is expressed as a separate element the
 * organizer can select and modify.
 *
 * This is the seed layer for "New from template" in the editor. Every
 * document is a static starting point; once loaded, edits diverge
 * freely from the template.
 *
 * Phase 1 ships the Poster_Bold cover only, as a proof-of-concept
 * template. Later phases add the rest of the Poster_Bold pages,
 * Corporate_Bold, and the Classic Editorial / Modern Minimal / Bold
 * Conference themes.
 */
import {
  A4_HEIGHT_MM,
  A4_WIDTH_MM,
  newDocument,
  newImageElement,
  newPillElement,
  newTextElement,
  type BrochureDocument,
  type BrochurePage,
  type PageBackground,
} from "./editor-document";

/** Input for template pre-loading. Mirrors the essential fields the
 *  jsPDF renderer already receives via `BrochureGenerationInput`. */
export interface TemplateSeedInput {
  eventTitle: string;
  /** Human-readable date range, e.g. "12 Aug 2026 | 09:00 AM onwards". */
  dateText: string;
  /** Human-readable venue name / city. */
  venueText: string;
  /** Cover hero image URL. Empty string is allowed; the canvas shows a
   *  placeholder gray box until the organizer picks one. */
  coverImageUrl: string;
  /** Small logo shown near the top of the cover (branded event name /
   *  wordmark). */
  logoUrl?: string;
  /** Producer/organizer logo shown at the cover bottom-left. */
  organizerLogoUrl?: string;
  /** Optional tagline pill (e.g. "The Next Big Shift"). */
  coverTagline?: string;
  /** Optional short chip labels (e.g. ["Autonomy", "Governance", "Capital"]). */
  coverPills?: string[];
  /** Accent color hex — drives pill fills, accent bars. Defaults to
   *  Poster Bold orange. */
  accentColor?: string;
  /** Primary text color for cover title (contrasting the background). */
  titleColor?: string;
}

/** Poster Bold cover template — 1 A4 page with the canonical Poster
 *  Bold cover elements: header wordmark, big title, date/venue chips,
 *  hero image, footer with organizer logo. Every element is directly
 *  editable in the canvas. */
export function seedPosterBoldCover(input: TemplateSeedInput): BrochureDocument {
  const accent = input.accentColor ?? "#ff5722";
  const titleColor = input.titleColor ?? "#000000";
  const pageBg: PageBackground = { type: "solid", color: "#ffffff" };
  const doc = newDocument(input.eventTitle);

  const page: BrochurePage = {
    id: doc.pages[0].id,
    width: A4_WIDTH_MM,
    height: A4_HEIGHT_MM,
    background: pageBg,
    elements: [],
  };

  const pageW = A4_WIDTH_MM;

  // Header wordmark logo (optional).
  if (input.logoUrl) {
    page.elements.push(
      newImageElement({
        x: pageW / 2 - 40,
        y: 22,
        width: 80,
        height: 20,
        src: input.logoUrl,
        fit: "contain",
      })
    );
  }

  // Huge title.
  page.elements.push(
    newTextElement({
      x: 20,
      y: 52,
      width: pageW - 40,
      height: 48,
      content: input.eventTitle,
      fontFamily: "Poppins",
      fontSize: 44,
      fontWeight: "bold",
      color: titleColor,
      align: "center",
      lineHeight: 1.05,
    })
  );

  // Tagline pill (optional).
  if (input.coverTagline && input.coverTagline.trim().length > 0) {
    page.elements.push(
      newPillElement({
        x: pageW / 2 - 45,
        y: 110,
        width: 90,
        height: 14,
        text: input.coverTagline.trim(),
        fontFamily: "Poppins",
        fontSize: 12,
        textColor: accent,
        fillColor: "#ffffff",
        strokeColor: accent,
        strokeWidth: 0.8,
      })
    );
  }

  // Cover pills row (optional).
  const pills = (input.coverPills ?? []).filter((p) => p && p.trim().length > 0);
  if (pills.length > 0) {
    const pillH = 10;
    const pillGap = 4;
    const pillW = 34;
    const totalW = pills.length * pillW + (pills.length - 1) * pillGap;
    let x = pageW / 2 - totalW / 2;
    const y = 130;
    for (const label of pills) {
      page.elements.push(
        newPillElement({
          x,
          y,
          width: pillW,
          height: pillH,
          text: label,
          fontFamily: "Poppins",
          fontSize: 9,
          textColor: "#111111",
          fillColor: "#ffffff",
          strokeColor: "#111111",
          strokeWidth: 0.4,
        })
      );
      x += pillW + pillGap;
    }
  }

  // Date + venue line.
  page.elements.push(
    newTextElement({
      x: 20,
      y: 148,
      width: pageW - 40,
      height: 8,
      content: `${input.dateText}${input.venueText ? "  |  " + input.venueText : ""}`,
      fontFamily: "Poppins",
      fontSize: 12,
      fontWeight: "normal",
      color: "#111111",
      align: "center",
      lineHeight: 1.1,
    })
  );

  // Hero image.
  page.elements.push(
    newImageElement({
      x: 20,
      y: 168,
      width: pageW - 40,
      height: 88,
      src: input.coverImageUrl,
      fit: "cover",
      cornerRadius: 4,
    })
  );

  // Footer "Conceptualized & Organized by" text + logo.
  page.elements.push(
    newTextElement({
      x: 20,
      y: 262,
      width: 90,
      height: 6,
      content: "Conceptualized & Organized by",
      fontFamily: "Poppins",
      fontSize: 9,
      fontWeight: "bold",
      color: "#111111",
      align: "left",
      lineHeight: 1,
    })
  );

  if (input.organizerLogoUrl) {
    page.elements.push(
      newImageElement({
        x: 20,
        y: 270,
        width: 44,
        height: 18,
        src: input.organizerLogoUrl,
        fit: "contain",
      })
    );
  }

  page.elements.push(
    newTextElement({
      x: pageW - 20 - 60,
      y: 262,
      width: 60,
      height: 6,
      content: "Follow us on social media",
      fontFamily: "Poppins",
      fontSize: 9,
      fontWeight: "bold",
      color: "#111111",
      align: "right",
      lineHeight: 1,
    })
  );

  // Assign z-index by insertion order so later elements draw on top.
  page.elements.forEach((el, idx) => {
    el.zIndex = idx;
  });

  return {
    ...doc,
    pages: [page],
  };
}

/** Corporate Bold cover template — same shape as Poster Bold but on a
 *  deep-purple background with white text. Uses `seedPosterBoldCover`
 *  as the base and then patches page background + text colors. */
export function seedCorporateBoldCover(input: TemplateSeedInput): BrochureDocument {
  const base = seedPosterBoldCover({
    ...input,
    accentColor: input.accentColor ?? "#a259e6",
    titleColor: input.titleColor ?? "#ffffff",
  });
  const [page] = base.pages;
  return {
    ...base,
    pages: [
      {
        ...page,
        background: { type: "gradient", top: "#1a0730", bottom: "#3a1152" },
        elements: page.elements.map((el) => {
          if (el.kind === "text" && el.color === "#111111") {
            return { ...el, color: "#ffffff" };
          }
          return el;
        }),
      },
    ],
  };
}
