/**
 * Template presets for the brochure editor. Each preset takes event-
 * provided values (title, date, venue, cover image URL, organizer
 * branding, abstract text, learning outcomes, etc.) and returns a
 * fully-populated `Brochure_Document` — every text block, image, and
 * shape from the corresponding jsPDF theme is expressed as a separate
 * editable element the organizer can select and modify.
 *
 * Two themes ship today:
 *  - Poster_Bold (DevOps Connect look): white cover + orange accents +
 *    editorial content pages.
 *  - Corporate_Bold (Finance 6.0 look): deep-purple gradient cover +
 *    black content pages with purple accents.
 *
 * Both seeds emit the full multi-page brochure: cover, abstract (with
 * learning outcomes grid), why-sponsor / focus-of-summit numbered
 * list, and a pricing / speakers-summary closing page. Adding /
 * removing pages once loaded is a no-op on this file — the editor
 * mutates its own document tree.
 */
import {
  A4_HEIGHT_MM,
  A4_WIDTH_MM,
  newDocument,
  newImageElement,
  newPillElement,
  newShapeElement,
  newTextElement,
  type BrochureDocument,
  type BrochureElement,
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
  /** Small logo shown near the top of the cover. */
  logoUrl?: string;
  /** Producer/organizer logo shown at the cover bottom-left. */
  organizerLogoUrl?: string;
  /** Optional tagline pill (e.g. "The Next Big Shift"). */
  coverTagline?: string;
  /** Optional short chip labels (e.g. ["Autonomy", "Governance", "Capital"]). */
  coverPills?: string[];
  /** Optional abstract body copy for the abstract page. */
  abstract?: string;
  /** Optional featured body copy for the abstract page. */
  featured?: string;
  /** Optional learning-outcomes chips (up to 6). */
  learningOutcomes?: string[];
  /** Optional numbered value-prop items for the "Why Sponsor?" or
   *  "Focus of the Summit" page. */
  numberedItems?: string[];
  /** Accent color hex — drives pill fills, accent bars. Defaults to
   *  Poster Bold orange. */
  accentColor?: string;
  /** Primary text color for cover title (contrasting the background). */
  titleColor?: string;
}

// ─── Poster Bold seed (white bg, orange accent) ─────────────────────────────

export function seedPosterBoldFullBrochure(input: TemplateSeedInput): BrochureDocument {
  const accent = input.accentColor ?? "#ff5722";
  const titleColor = input.titleColor ?? "#000000";
  const doc = newDocument(input.eventTitle);

  const cover = buildPosterBoldCoverPage(input, accent, titleColor, "#ffffff", true);
  const abstract = buildAbstractPage(input, accent, "#ffffff", "#000000");
  const whySponsor = buildNumberedListPage(
    input.numberedItems ?? [],
    "Why Sponsor?",
    accent,
    "#000000",
    "#ffffff",
    "#111111"
  );

  return {
    ...doc,
    pages: [cover, abstract, whySponsor].filter(Boolean) as BrochurePage[],
  };
}

// ─── Corporate Bold seed (purple gradient, black pages) ─────────────────────

export function seedCorporateBoldFullBrochure(input: TemplateSeedInput): BrochureDocument {
  const accent = input.accentColor ?? "#a259e6";
  const titleColor = input.titleColor ?? "#ffffff";
  const doc = newDocument(input.eventTitle);

  const cover = buildCorporateBoldCoverPage(input, accent, titleColor);
  const abstract = buildAbstractPage(input, accent, "#000000", "#ffffff");
  const focus = buildNumberedListPage(
    input.numberedItems ?? [],
    "Focus of the Summit",
    accent,
    "#000000",
    "#ffffff",
    "#dddddd"
  );

  return {
    ...doc,
    pages: [cover, abstract, focus].filter(Boolean) as BrochurePage[],
  };
}

// Backwards-compatible aliases — earlier commits referenced these
// single-page seed names.
export const seedPosterBoldCover = seedPosterBoldFullBrochure;
export const seedCorporateBoldCover = seedCorporateBoldFullBrochure;

/** Classic seed — the only theme shipped after the mass theme trim.
 *  Reuses the Poster_Bold full-brochure builder (portrait banner top,
 *  abstract page, numbered list page) but with the Classic editorial
 *  navy/gold palette. The organizer edits from here freely; Canva-
 *  style presets and page sizes are available through the editor's
 *  page properties panel. */
export function seedClassicBrochure(input: TemplateSeedInput): BrochureDocument {
  return seedPosterBoldFullBrochure({
    ...input,
    // Classic editorial defaults: navy accent, black title text on a
    // white cover, gold as the secondary accent.
    accentColor: input.accentColor ?? "#1e3a8a",
    titleColor: input.titleColor ?? "#0a1429",
  });
}

// ─── Cover page builders ───────────────────────────────────────────────────

function buildPosterBoldCoverPage(
  input: TemplateSeedInput,
  accent: string,
  titleColor: string,
  bgColor: string,
  showFooter: boolean
): BrochurePage {
  const pageW = A4_WIDTH_MM;
  const pageH = A4_HEIGHT_MM;
  const elements: BrochureElement[] = [];
  const push = (el: BrochureElement) => {
    el.zIndex = elements.length;
    elements.push(el);
  };

  // ── Portrait hero banner at top ────────────────────────────────────────
  //
  // The cover image (event.banner_portrait_url when available) is drawn
  // FLUSH TO THE PAGE: x=0, y=0, full page width, no side or top
  // padding, no corner radius. Sized to occupy roughly two-thirds of
  // the A4 page height so the portrait aspect ratio isn't compressed.
  // fit: "cover" so the image fills the box and crops overflow rather
  // than letterboxing.
  const bannerHeight = pageH * 0.62; // 62% of 297mm ≈ 184mm
  push(
    newImageElement({
      x: 0,
      y: 0,
      width: pageW,
      height: bannerHeight,
      src: input.coverImageUrl,
      fit: "cover",
      cornerRadius: 0,
    })
  );

  // Everything else stacks below the banner in the remaining ~113mm.
  const belowBannerY = bannerHeight + 6; // 6mm breathing room under the image

  // Optional wordmark logo above the title (centered).
  let cursorY = belowBannerY;
  if (input.logoUrl) {
    push(
      newImageElement({
        x: pageW / 2 - 30,
        y: cursorY,
        width: 60,
        height: 16,
        src: input.logoUrl,
        fit: "contain",
      })
    );
    cursorY += 20;
  }

  // Title.
  push(
    newTextElement({
      x: 12,
      y: cursorY,
      width: pageW - 24,
      height: 22,
      content: input.eventTitle,
      fontFamily: "Poppins",
      fontSize: 26,
      fontWeight: "bold",
      color: titleColor,
      align: "center",
      lineHeight: 1.05,
    })
  );
  cursorY += 26;

  // Optional tagline pill.
  if (input.coverTagline?.trim()) {
    push(
      newPillElement({
        x: pageW / 2 - 45,
        y: cursorY,
        width: 90,
        height: 11,
        text: input.coverTagline.trim(),
        fontFamily: "Poppins",
        fontSize: 11,
        textColor: accent,
        fillColor: "#ffffff",
        strokeColor: accent,
        strokeWidth: 0.6,
      })
    );
    cursorY += 15;
  }

  // Optional pill chip row.
  const pills = (input.coverPills ?? []).filter((p) => p && p.trim().length > 0);
  if (pills.length > 0) {
    const pillH = 8;
    const pillGap = 3;
    const pillW = 28;
    const totalW = pills.length * pillW + (pills.length - 1) * pillGap;
    let x = pageW / 2 - totalW / 2;
    for (const label of pills) {
      push(
        newPillElement({
          x,
          y: cursorY,
          width: pillW,
          height: pillH,
          text: label,
          fontFamily: "Poppins",
          fontSize: 8,
          textColor: titleColor,
          fillColor: "transparent",
          strokeColor: titleColor,
          strokeWidth: 0.4,
        })
      );
      x += pillW + pillGap;
    }
    cursorY += pillH + 4;
  }

  // Date + venue line.
  push(
    newTextElement({
      x: 12,
      y: cursorY,
      width: pageW - 24,
      height: 6,
      content: `${input.dateText}${input.venueText ? "  |  " + input.venueText : ""}`,
      fontFamily: "Poppins",
      fontSize: 10,
      fontWeight: "normal",
      color: titleColor,
      align: "center",
      lineHeight: 1.1,
    })
  );

  // Footer.
  if (showFooter) {
    push(
      newTextElement({
        x: 12,
        y: pageH - 22,
        width: 90,
        height: 5,
        content: "Conceptualized & Organized by",
        fontFamily: "Poppins",
        fontSize: 8,
        fontWeight: "bold",
        color: "#111111",
        align: "left",
        lineHeight: 1,
      })
    );
    if (input.organizerLogoUrl) {
      push(
        newImageElement({
          x: 12,
          y: pageH - 16,
          width: 40,
          height: 14,
          src: input.organizerLogoUrl,
          fit: "contain",
        })
      );
    }
    push(
      newTextElement({
        x: pageW - 12 - 60,
        y: pageH - 22,
        width: 60,
        height: 5,
        content: "Follow us on social media",
        fontFamily: "Poppins",
        fontSize: 8,
        fontWeight: "bold",
        color: "#111111",
        align: "right",
        lineHeight: 1,
      })
    );
  }

  return {
    id: `page-cover-${Math.random().toString(36).slice(2, 8)}`,
    width: A4_WIDTH_MM,
    height: A4_HEIGHT_MM,
    background: { type: "solid", color: bgColor },
    elements,
  };
}

function buildCorporateBoldCoverPage(
  input: TemplateSeedInput,
  accent: string,
  titleColor: string
): BrochurePage {
  // Reuse the Poster Bold cover geometry but with a gradient bg + white text.
  const page = buildPosterBoldCoverPage(input, accent, titleColor, "#1a0730", false);
  page.background = { type: "gradient", top: "#1a0730", bottom: "#3a1152" };
  return page;
}

// ─── Abstract page (used by both themes) ───────────────────────────────────

function buildAbstractPage(
  input: TemplateSeedInput,
  accent: string,
  bgColor: string,
  textColor: string
): BrochurePage {
  const pageW = A4_WIDTH_MM;
  const elements: BrochureElement[] = [];
  const push = (el: BrochureElement) => {
    el.zIndex = elements.length;
    elements.push(el);
  };

  // Small event-title wordmark top-left, date top-right, thin accent divider.
  push(
    newTextElement({
      x: 20,
      y: 20,
      width: 100,
      height: 8,
      content: input.eventTitle,
      fontFamily: "Poppins",
      fontSize: 14,
      fontWeight: "bold",
      color: textColor,
      align: "left",
      lineHeight: 1,
    })
  );
  push(
    newTextElement({
      x: pageW - 120,
      y: 20,
      width: 100,
      height: 8,
      content: `${input.dateText}${input.venueText ? "  |  " + input.venueText : ""}`,
      fontFamily: "Poppins",
      fontSize: 9,
      fontWeight: "bold",
      color: textColor,
      align: "right",
      lineHeight: 1,
    })
  );
  push(
    newShapeElement({
      x: 20,
      y: 32,
      width: pageW - 40,
      height: 0.4,
      shape: "rect",
      fill: accent,
      stroke: "transparent",
      strokeWidth: 0,
      cornerRadius: 0,
    })
  );

  // Big "ABSTRACT" heading.
  push(
    newTextElement({
      x: 20,
      y: 44,
      width: 90,
      height: 20,
      content: "ABSTRACT",
      fontFamily: "Poppins",
      fontSize: 30,
      fontWeight: "bold",
      color: accent,
      align: "left",
      lineHeight: 1,
    })
  );

  // Body copy.
  if (input.abstract?.trim()) {
    push(
      newTextElement({
        x: 20,
        y: 68,
        width: pageW - 40,
        height: 90,
        content: input.abstract,
        fontFamily: "Poppins",
        fontSize: 11,
        fontWeight: "normal",
        color: textColor,
        align: "left",
        lineHeight: 1.5,
      })
    );
  }

  // Learning outcomes grid.
  const outcomes = (input.learningOutcomes ?? []).filter((s) => s && s.trim());
  if (outcomes.length > 0) {
    push(
      newTextElement({
        x: 20,
        y: 175,
        width: pageW - 40,
        height: 10,
        content: "LEARNING OUTCOMES",
        fontFamily: "Poppins",
        fontSize: 16,
        fontWeight: "bold",
        color: textColor,
        align: "center",
        lineHeight: 1,
      })
    );
    const cols = 2;
    const gap = 4;
    const chipW = (pageW - 40 - gap * (cols - 1)) / cols;
    const chipH = 18;
    for (let i = 0; i < Math.min(outcomes.length, 6); i += 1) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = 20 + col * (chipW + gap);
      const y = 190 + row * (chipH + gap);
      push(
        newShapeElement({
          x,
          y,
          width: chipW,
          height: chipH,
          shape: "rect",
          fill: "#0a0a0a",
          stroke: "transparent",
          strokeWidth: 0,
          cornerRadius: 4,
        })
      );
      push(
        newTextElement({
          x: x,
          y: y + chipH / 2 - 3,
          width: chipW,
          height: chipH,
          content: outcomes[i],
          fontFamily: "Poppins",
          fontSize: 10,
          fontWeight: "bold",
          color: "#ffffff",
          align: "center",
          lineHeight: 1.2,
        })
      );
    }
  }

  return {
    id: `page-abstract-${Math.random().toString(36).slice(2, 8)}`,
    width: A4_WIDTH_MM,
    height: A4_HEIGHT_MM,
    background: { type: "solid", color: bgColor },
    elements,
  };
}

// ─── Numbered list page (Why Sponsor / Focus of Summit) ────────────────────

function buildNumberedListPage(
  items: string[],
  title: string,
  accent: string,
  bgColor: string,
  titleColor: string,
  bodyColor: string
): BrochurePage {
  const pageW = A4_WIDTH_MM;
  const elements: BrochureElement[] = [];
  const push = (el: BrochureElement) => {
    el.zIndex = elements.length;
    elements.push(el);
  };

  push(
    newTextElement({
      x: 20,
      y: 30,
      width: pageW - 40,
      height: 20,
      content: title.toUpperCase(),
      fontFamily: "Poppins",
      fontSize: 32,
      fontWeight: "bold",
      color: titleColor,
      align: "center",
      lineHeight: 1,
    })
  );

  const clean = items.filter((s) => s && s.trim().length > 0);
  const rowH = 24;
  const rowGap = 4;
  const badgeW = 18;
  const startY = 68;

  for (let i = 0; i < Math.min(clean.length, 8); i += 1) {
    const y = startY + i * (rowH + rowGap);
    // Number badge.
    push(
      newShapeElement({
        x: 20,
        y,
        width: badgeW,
        height: rowH,
        shape: "rect",
        fill: accent,
        stroke: "transparent",
        strokeWidth: 0,
        cornerRadius: 0,
      })
    );
    push(
      newTextElement({
        x: 20,
        y: y + rowH / 2 - 4,
        width: badgeW,
        height: rowH,
        content: String(i + 1),
        fontFamily: "Poppins",
        fontSize: 16,
        fontWeight: "bold",
        color: "#ffffff",
        align: "center",
        lineHeight: 1,
      })
    );
    // Item body — outline row.
    push(
      newShapeElement({
        x: 20,
        y,
        width: pageW - 40,
        height: rowH,
        shape: "rect",
        fill: "transparent",
        stroke: accent,
        strokeWidth: 0.4,
        cornerRadius: 0,
      })
    );
    push(
      newTextElement({
        x: 20 + badgeW + 6,
        y: y + 3,
        width: pageW - 40 - badgeW - 8,
        height: rowH - 6,
        content: clean[i],
        fontFamily: "Poppins",
        fontSize: 10,
        fontWeight: "normal",
        color: bodyColor,
        align: "left",
        lineHeight: 1.35,
      })
    );
  }

  return {
    id: `page-list-${Math.random().toString(36).slice(2, 8)}`,
    width: A4_WIDTH_MM,
    height: A4_HEIGHT_MM,
    background: { type: "solid", color: bgColor },
    elements,
  };
}
