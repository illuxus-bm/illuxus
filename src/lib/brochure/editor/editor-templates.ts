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
import {
  buildAgendaSectionContent,
  buildSpeakerRows,
  buildSponsorshipPackagesContent,
  buildVenueLogisticsContent,
  groupSponsorsByTierOrdered,
  type AgendaSessionInput,
  type SpeakerInput,
  type SponsorInput,
  type SponsorshipPackagesInput,
  type VenueLogisticsInput,
} from "../brochure-sections";

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

  // ── Content pages (Classic seed) ────────────────────────────────
  //
  // The Classic seed matches the jsPDF preview's section layout
  // (Cover + Agenda + Speakers + Sponsors + Venue) rather than the
  // legacy Poster_Bold seed's abstract/why-sponsor pages, so the
  // editor and the preview show the SAME set of pages. When any of
  // these arrays is absent or empty, the corresponding page is
  // skipped entirely (the organizer can still add it manually via
  // the "add page" control in the pages bar).
  sessions?: AgendaSessionInput[];
  speakers?: SpeakerInput[];
  sponsors?: SponsorInput[];
  venueLogistics?: VenueLogisticsInput;
  /** Benefits × tiers sponsorship comparison table — same source as the
   *  jsPDF preview's `sponsorshipPackages` section content. Omitted
   *  (undefined/null benefits or tiers) means the page is skipped. */
  sponsorshipPackages?: SponsorshipPackagesInput;
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
 *  Builds an editable Brochure_Document whose pages match the jsPDF
 *  preview's Section_Layout one-to-one: Cover → Agenda → Speakers →
 *  Sponsors → Venue & Logistics. Every page is composed of ordinary
 *  editable elements (text, shape, image), so the organizer can
 *  select, drag, resize, restyle, or delete any part of any page
 *  Canva-style — including the cover banner image and the speaker
 *  photos — with no hidden or read-only content.
 *
 *  When an event has no sessions / speakers / sponsors / venue data,
 *  the corresponding page is skipped entirely so the editor doesn't
 *  ship pages with only a heading. The organizer can add a fresh
 *  page at any time via the pages bar. */
export function seedClassicBrochure(input: TemplateSeedInput): BrochureDocument {
  // Classic editorial defaults: navy accent, black title text.
  const accent = input.accentColor ?? "#1e3a8a";
  const titleColor = input.titleColor ?? "#0a1429";

  const doc = newDocument(input.eventTitle || "Untitled Brochure");
  const pages: BrochurePage[] = [];

  // Page 1 — Cover. Full-page portrait banner when a cover image is
  // available; text-only editorial fallback otherwise. This reuses
  // the existing cover builder (with the recent full-page banner
  // fix) so cover behavior stays consistent across seeds.
  pages.push(buildPosterBoldCoverPage(input, accent, titleColor, "#ffffff", false));

  // Page 2 — Agenda.
  const agendaPage = buildAgendaPage(input.sessions ?? [], input.eventTitle, input.dateText, accent, titleColor);
  if (agendaPage) pages.push(agendaPage);

  // Page 3 — Speakers.
  const speakersPage = buildSpeakersPage(input.speakers ?? [], input.eventTitle, input.dateText, accent, titleColor);
  if (speakersPage) pages.push(speakersPage);

  // Page 4 — Sponsors.
  const sponsorsPage = buildSponsorsPage(input.sponsors ?? [], input.eventTitle, input.dateText, accent, titleColor);
  if (sponsorsPage) pages.push(sponsorsPage);

  // Page 5 — Venue & Logistics.
  const venuePage = buildVenuePage(input.venueLogistics, input.eventTitle, input.dateText, accent, titleColor);
  if (venuePage) pages.push(venuePage);

  // Page 6 — Sponsorship Packages (benefits × tiers comparison table).
  const sponsorshipPage = buildSponsorshipPackagesPage(
    input.sponsorshipPackages,
    input.eventTitle,
    input.dateText,
    accent,
    titleColor
  );
  if (sponsorshipPage) pages.push(sponsorshipPage);

  return { ...doc, pages };
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

  // ── Full-page portrait banner cover ──────────────────────────────
  //
  // When a portrait banner (event.banner_portrait_url or any other
  // cover image) is available, the entire cover IS that image. The
  // banner is expected to already carry all the event branding —
  // title, sponsors, date, imagery — so overlaying our own title /
  // date / venue text on top would duplicate content and often
  // collide with the banner's own layout.
  //
  // The image is placed at (0, 0) with full page dimensions and
  // fit="cover" so it fills the page edge-to-edge. The organizer
  // can still click the image in the editor to reposition, resize,
  // or replace it — the geometry is not locked.
  const hasCover = typeof input.coverImageUrl === "string" && input.coverImageUrl.trim().length > 0;
  if (hasCover) {
    push(
      newImageElement({
        x: 0,
        y: 0,
        width: pageW,
        height: pageH,
        src: input.coverImageUrl,
        fit: "cover",
        cornerRadius: 0,
      })
    );
    return {
      id: `page-cover-${Math.random().toString(36).slice(2, 8)}`,
      width: A4_WIDTH_MM,
      height: A4_HEIGHT_MM,
      background: { type: "solid", color: bgColor },
      elements,
    };
  }

  // ── Fallback layout: no banner uploaded yet ──────────────────────
  //
  // When the event has no banner_portrait_url / image_url /
  // banner_landscape_url configured, seed a text-only cover with the
  // wordmark, title, tagline pill, chip row, date/venue line, and
  // footer so the editor still shows something meaningful. The
  // organizer can add an image via the palette once they've uploaded
  // one.
  let cursorY = pageH * 0.15;

  // Optional wordmark logo above the title (centered).
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
      height: 40,
      content: input.eventTitle,
      fontFamily: "Poppins",
      fontSize: 40,
      fontWeight: "bold",
      color: titleColor,
      align: "center",
      lineHeight: 1.05,
    })
  );
  cursorY += 48;

  // Optional tagline pill.
  if (input.coverTagline?.trim()) {
    push(
      newPillElement({
        x: pageW / 2 - 45,
        y: cursorY,
        width: 90,
        height: 12,
        text: input.coverTagline.trim(),
        fontFamily: "Poppins",
        fontSize: 12,
        textColor: accent,
        fillColor: "#ffffff",
        strokeColor: accent,
        strokeWidth: 0.6,
      })
    );
    cursorY += 16;
  }

  // Optional pill chip row.
  const pills = (input.coverPills ?? []).filter((p) => p && p.trim().length > 0);
  if (pills.length > 0) {
    const pillH = 9;
    const pillGap = 4;
    const pillW = 32;
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
          fontSize: 9,
          textColor: titleColor,
          fillColor: "transparent",
          strokeColor: titleColor,
          strokeWidth: 0.4,
        })
      );
      x += pillW + pillGap;
    }
    cursorY += pillH + 6;
  }

  // Date + venue line.
  push(
    newTextElement({
      x: 12,
      y: cursorY,
      width: pageW - 24,
      height: 8,
      content: `${input.dateText}${input.venueText ? "  |  " + input.venueText : ""}`,
      fontFamily: "Poppins",
      fontSize: 12,
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

// ─── Classic seed content pages ────────────────────────────────────────────
//
// The four page builders below turn the same event data the jsPDF
// preview uses (sessions, speakers, sponsors, venue) into ordinary
// editable elements so the editor and the preview render matching
// content by construction. Layout numbers are in mm.

/** Shared page-header (small event title top-left, date/venue top-right,
 *  accent divider). Every content page starts with this so the editor
 *  and preview both carry the same identity across pages. */
function pushClassicPageHeader(
  elements: BrochureElement[],
  push: (el: BrochureElement) => void,
  eventTitle: string,
  dateText: string,
  accent: string,
  titleColor: string
): void {
  const pageW = A4_WIDTH_MM;
  push(
    newTextElement({
      x: 20,
      y: 18,
      width: 100,
      height: 6,
      content: eventTitle,
      fontFamily: "Playfair Display",
      fontSize: 12,
      fontWeight: "bold",
      color: titleColor,
      align: "left",
      lineHeight: 1,
    })
  );
  push(
    newTextElement({
      x: pageW - 120,
      y: 18,
      width: 100,
      height: 6,
      content: dateText,
      fontFamily: "Poppins",
      fontSize: 9,
      fontWeight: "normal",
      color: titleColor,
      align: "right",
      lineHeight: 1,
    })
  );
  push(
    newShapeElement({
      x: 20,
      y: 28,
      width: pageW - 40,
      height: 0.4,
      shape: "rect",
      fill: accent,
      stroke: "transparent",
      strokeWidth: 0,
      cornerRadius: 0,
    })
  );
  void elements; // just to signal the push closure is the intended sink
}

/** Shared section-heading (large bold title + short accent underline
 *  beneath). */
function pushClassicSectionHeading(
  push: (el: BrochureElement) => void,
  y: number,
  text: string,
  accent: string,
  titleColor: string
): void {
  push(
    newTextElement({
      x: 20,
      y,
      width: 150,
      height: 10,
      content: text,
      fontFamily: "Playfair Display",
      fontSize: 22,
      fontWeight: "bold",
      color: titleColor,
      align: "left",
      lineHeight: 1,
    })
  );
  push(
    newShapeElement({
      x: 20,
      y: y + 10,
      width: 24,
      height: 1.4,
      shape: "rect",
      fill: accent,
      stroke: "transparent",
      strokeWidth: 0,
      cornerRadius: 0,
    })
  );
}

/** Builds the Agenda page — one row per session (time • title • speakers)
 *  as separate editable text elements inside a bordered row container.
 *  Returns `null` when there are no sessions so the page isn't seeded
 *  with an empty heading. */
function buildAgendaPage(
  sessions: AgendaSessionInput[],
  eventTitle: string,
  dateText: string,
  accent: string,
  titleColor: string
): BrochurePage | null {
  const content = buildAgendaSectionContent(sessions);
  if (content.rows.length === 0) return null;

  const pageW = A4_WIDTH_MM;
  const elements: BrochureElement[] = [];
  const push = (el: BrochureElement) => {
    el.zIndex = elements.length;
    elements.push(el);
  };

  pushClassicPageHeader(elements, push, eventTitle, dateText, accent, titleColor);
  pushClassicSectionHeading(push, 40, "Agenda", accent, titleColor);

  // Column layout: time (28mm) | title (rest) | speakers (48mm).
  const timeColW = 28;
  const speakersColW = 48;
  const rowGap = 3;
  const rowH = 16;
  const startY = 62;
  const bodyLeft = 20;
  const bodyRight = pageW - 20;
  const titleColX = bodyLeft + timeColW + 4;
  const titleColW = bodyRight - titleColX - speakersColW - 4;
  const speakersColX = bodyRight - speakersColW;

  // Column header strip.
  push(
    newShapeElement({
      x: bodyLeft,
      y: startY - 8,
      width: pageW - 40,
      height: 6.5,
      shape: "rect",
      fill: accent,
      stroke: "transparent",
      strokeWidth: 0,
      cornerRadius: 0,
    })
  );
  const headerY = startY - 6.5;
  push(
    newTextElement({
      x: bodyLeft + 2,
      y: headerY,
      width: timeColW,
      height: 5,
      content: "Time",
      fontFamily: "Poppins",
      fontSize: 9,
      fontWeight: "bold",
      color: "#ffffff",
      align: "left",
      lineHeight: 1,
    })
  );
  push(
    newTextElement({
      x: titleColX,
      y: headerY,
      width: titleColW,
      height: 5,
      content: "Session",
      fontFamily: "Poppins",
      fontSize: 9,
      fontWeight: "bold",
      color: "#ffffff",
      align: "left",
      lineHeight: 1,
    })
  );
  push(
    newTextElement({
      x: speakersColX,
      y: headerY,
      width: speakersColW - 2,
      height: 5,
      content: "Speaker(s)",
      fontFamily: "Poppins",
      fontSize: 9,
      fontWeight: "bold",
      color: "#ffffff",
      align: "left",
      lineHeight: 1,
    })
  );

  const maxRows = 12;
  const rows = content.rows.slice(0, maxRows);
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const y = startY + i * (rowH + rowGap);

    // Row divider line.
    push(
      newShapeElement({
        x: bodyLeft,
        y: y + rowH,
        width: pageW - 40,
        height: 0.2,
        shape: "rect",
        fill: "#e5e7eb",
        stroke: "transparent",
        strokeWidth: 0,
        cornerRadius: 0,
      })
    );
    push(
      newTextElement({
        x: bodyLeft + 2,
        y: y + 1,
        width: timeColW,
        height: rowH - 2,
        content: row.timeRangeText,
        fontFamily: "Poppins",
        fontSize: 9,
        fontWeight: "bold",
        color: titleColor,
        align: "left",
        lineHeight: 1.15,
      })
    );
    push(
      newTextElement({
        x: titleColX,
        y: y + 1,
        width: titleColW,
        height: rowH - 2,
        content: row.title,
        fontFamily: "Poppins",
        fontSize: 10,
        fontWeight: "normal",
        color: titleColor,
        align: "left",
        lineHeight: 1.2,
      })
    );
    if (row.speakerLine) {
      push(
        newTextElement({
          x: speakersColX,
          y: y + 1,
          width: speakersColW - 2,
          height: rowH - 2,
          content: row.speakerLine,
          fontFamily: "Poppins",
          fontSize: 9,
          fontWeight: "normal",
          color: "#4b5563",
          align: "left",
          lineHeight: 1.2,
        })
      );
    }
  }

  return {
    id: `page-agenda-${Math.random().toString(36).slice(2, 8)}`,
    width: A4_WIDTH_MM,
    height: A4_HEIGHT_MM,
    background: { type: "solid", color: "#ffffff" },
    elements,
  };
}

/** Builds the Speakers page — 2-column grid of speaker cards
 *  (photo + name + subtitle + company). Each field is a separate
 *  element so the organizer can retitle or remove any of them.
 *  Returns `null` when there are no speakers. */
function buildSpeakersPage(
  speakers: SpeakerInput[],
  eventTitle: string,
  dateText: string,
  accent: string,
  titleColor: string
): BrochurePage | null {
  const rows = buildSpeakerRows(speakers);
  if (rows.length === 0) return null;

  const pageW = A4_WIDTH_MM;
  const elements: BrochureElement[] = [];
  const push = (el: BrochureElement) => {
    el.zIndex = elements.length;
    elements.push(el);
  };

  pushClassicPageHeader(elements, push, eventTitle, dateText, accent, titleColor);
  pushClassicSectionHeading(push, 40, "Speakers", accent, titleColor);

  const cols = 2;
  const gap = 8;
  const startY = 64;
  const bodyLeft = 20;
  const cardW = (pageW - 40 - gap * (cols - 1)) / cols;
  const photoH = 44;
  const textH = 22;
  const cardH = photoH + textH + 2;
  const maxCards = 8; // 4 rows × 2 cols
  const shown = rows.slice(0, maxCards);

  for (let i = 0; i < shown.length; i += 1) {
    const row = shown[i];
    const col = i % cols;
    const rowIdx = Math.floor(i / cols);
    const x = bodyLeft + col * (cardW + gap);
    const y = startY + rowIdx * (cardH + 6);

    // Card background.
    push(
      newShapeElement({
        x,
        y,
        width: cardW,
        height: cardH,
        shape: "rect",
        fill: "#f9fafb",
        stroke: "#e5e7eb",
        strokeWidth: 0.3,
        cornerRadius: 2,
      })
    );

    // Photo (URL image) or initial placeholder shape.
    if (row.photo.type === "url") {
      push(
        newImageElement({
          x,
          y,
          width: cardW,
          height: photoH,
          src: row.photo.url,
          fit: "cover",
          cornerRadius: 2,
        })
      );
    } else {
      push(
        newShapeElement({
          x,
          y,
          width: cardW,
          height: photoH,
          shape: "rect",
          fill: accent,
          stroke: "transparent",
          strokeWidth: 0,
          cornerRadius: 2,
        })
      );
      push(
        newTextElement({
          x,
          y: y + photoH / 2 - 8,
          width: cardW,
          height: 16,
          content: row.photo.initial,
          fontFamily: "Poppins",
          fontSize: 32,
          fontWeight: "bold",
          color: "#ffffff",
          align: "center",
          lineHeight: 1,
        })
      );
    }

    // Name.
    push(
      newTextElement({
        x: x + 2,
        y: y + photoH + 2,
        width: cardW - 4,
        height: 6,
        content: row.name,
        fontFamily: "Poppins",
        fontSize: 11,
        fontWeight: "bold",
        color: titleColor,
        align: "center",
        lineHeight: 1.1,
      })
    );
    // Subtitle.
    if (row.subtitleLine) {
      push(
        newTextElement({
          x: x + 2,
          y: y + photoH + 8,
          width: cardW - 4,
          height: 5,
          content: row.subtitleLine,
          fontFamily: "Poppins",
          fontSize: 8.5,
          fontWeight: "normal",
          color: "#4b5563",
          align: "center",
          lineHeight: 1.1,
        })
      );
    }
    // Company.
    if (row.companyLine) {
      push(
        newTextElement({
          x: x + 2,
          y: y + photoH + 14,
          width: cardW - 4,
          height: 5,
          content: row.companyLine,
          fontFamily: "Poppins",
          fontSize: 8.5,
          fontWeight: "normal",
          color: accent,
          align: "center",
          lineHeight: 1.1,
        })
      );
    }
  }

  return {
    id: `page-speakers-${Math.random().toString(36).slice(2, 8)}`,
    width: A4_WIDTH_MM,
    height: A4_HEIGHT_MM,
    background: { type: "solid", color: "#ffffff" },
    elements,
  };
}

/** Builds the Sponsors page — tier headings followed by sponsor
 *  logos (or name text when no logo URL). Returns `null` when there
 *  are no sponsors. */
function buildSponsorsPage(
  sponsors: SponsorInput[],
  eventTitle: string,
  dateText: string,
  accent: string,
  titleColor: string
): BrochurePage | null {
  if (sponsors.length === 0) return null;
  const groups = groupSponsorsByTierOrdered(sponsors);

  const pageW = A4_WIDTH_MM;
  const elements: BrochureElement[] = [];
  const push = (el: BrochureElement) => {
    el.zIndex = elements.length;
    elements.push(el);
  };

  pushClassicPageHeader(elements, push, eventTitle, dateText, accent, titleColor);
  pushClassicSectionHeading(push, 40, "Sponsors", accent, titleColor);

  const bodyLeft = 20;
  const bodyW = pageW - 40;
  const perRow = 3;
  const logoGap = 4;
  const logoW = (bodyW - logoGap * (perRow - 1)) / perRow;
  const logoH = 22;

  let cursorY = 62;

  for (const group of groups) {
    // Tier heading (colored by tier accent).
    push(
      newTextElement({
        x: bodyLeft,
        y: cursorY,
        width: bodyW,
        height: 7,
        content: group.label.toUpperCase(),
        fontFamily: "Poppins",
        fontSize: 12,
        fontWeight: "bold",
        color: group.accentColor,
        align: "left",
        lineHeight: 1,
      })
    );
    push(
      newShapeElement({
        x: bodyLeft,
        y: cursorY + 8,
        width: 16,
        height: 0.8,
        shape: "rect",
        fill: group.accentColor,
        stroke: "transparent",
        strokeWidth: 0,
        cornerRadius: 0,
      })
    );
    cursorY += 12;

    // Sponsor cards for this tier.
    const items = group.sponsors.slice(0, 12);
    for (let i = 0; i < items.length; i += 1) {
      const sponsor = items[i];
      const col = i % perRow;
      const rowIdx = Math.floor(i / perRow);
      const x = bodyLeft + col * (logoW + logoGap);
      const y = cursorY + rowIdx * (logoH + 4);

      // Card background so text logos have a distinct surface.
      push(
        newShapeElement({
          x,
          y,
          width: logoW,
          height: logoH,
          shape: "rect",
          fill: "#f9fafb",
          stroke: "#e5e7eb",
          strokeWidth: 0.3,
          cornerRadius: 2,
        })
      );
      if (sponsor.logo.type === "url") {
        push(
          newImageElement({
            x: x + 2,
            y: y + 2,
            width: logoW - 4,
            height: logoH - 4,
            src: sponsor.logo.url,
            fit: "contain",
            cornerRadius: 0,
          })
        );
      } else {
        push(
          newTextElement({
            x: x + 2,
            y: y + logoH / 2 - 3,
            width: logoW - 4,
            height: 6,
            content: sponsor.logo.text,
            fontFamily: "Poppins",
            fontSize: 10,
            fontWeight: "bold",
            color: titleColor,
            align: "center",
            lineHeight: 1.1,
          })
        );
      }
    }
    const rowsForGroup = Math.ceil(items.length / perRow);
    cursorY += rowsForGroup * (logoH + 4) + 4;
    if (cursorY > A4_HEIGHT_MM - 30) break; // stop before overflowing the page
  }

  return {
    id: `page-sponsors-${Math.random().toString(36).slice(2, 8)}`,
    width: A4_WIDTH_MM,
    height: A4_HEIGHT_MM,
    background: { type: "solid", color: "#ffffff" },
    elements,
  };
}

/** Builds the Venue & Logistics page — venue name, address, transit
 *  notes, parking notes. Returns `null` when there's no meaningful
 *  content to show. */
function buildVenuePage(
  input: VenueLogisticsInput | undefined,
  eventTitle: string,
  dateText: string,
  accent: string,
  titleColor: string
): BrochurePage | null {
  if (!input) return null;
  const content = buildVenueLogisticsContent(input);
  if (!content) return null;

  const pageW = A4_WIDTH_MM;
  const elements: BrochureElement[] = [];
  const push = (el: BrochureElement) => {
    el.zIndex = elements.length;
    elements.push(el);
  };

  pushClassicPageHeader(elements, push, eventTitle, dateText, accent, titleColor);
  pushClassicSectionHeading(push, 40, "Venue & Logistics", accent, titleColor);

  const bodyLeft = 20;
  const bodyW = pageW - 40;
  let cursorY = 62;

  const addSection = (label: string, body: string): void => {
    push(
      newTextElement({
        x: bodyLeft,
        y: cursorY,
        width: bodyW,
        height: 6,
        content: label.toUpperCase(),
        fontFamily: "Poppins",
        fontSize: 10,
        fontWeight: "bold",
        color: accent,
        align: "left",
        lineHeight: 1,
      })
    );
    cursorY += 8;
    push(
      newTextElement({
        x: bodyLeft,
        y: cursorY,
        width: bodyW,
        height: 24,
        content: body,
        fontFamily: "Poppins",
        fontSize: 11,
        fontWeight: "normal",
        color: titleColor,
        align: "left",
        lineHeight: 1.35,
      })
    );
    cursorY += 28;
  };

  if (content.venueName) addSection("Venue", content.venueName);
  if (content.address) addSection("Address", content.address);
  if (content.transitNotes) addSection("Getting there", content.transitNotes);
  if (content.parkingNotes) addSection("Parking", content.parkingNotes);

  return {
    id: `page-venue-${Math.random().toString(36).slice(2, 8)}`,
    width: A4_WIDTH_MM,
    height: A4_HEIGHT_MM,
    background: { type: "solid", color: "#ffffff" },
    elements,
  };
}

/** Builds the Sponsorship Packages page — a benefits × tiers comparison
 *  grid matching the reference "Premium Partnership Packages" deck
 *  brochures. Every header cell, benefit label, and value cell is an
 *  independent editable text/shape element (not a locked table widget),
 *  so the organizer can restyle, move, or delete any single cell exactly
 *  like every other element on the canvas. Returns `null` when there's
 *  no content to show (mirrors the jsPDF renderer's `buildSponsorship
 *  PackagesContent` null-return contract). */
function buildSponsorshipPackagesPage(
  input: SponsorshipPackagesInput | undefined,
  eventTitle: string,
  dateText: string,
  accent: string,
  titleColor: string
): BrochurePage | null {
  if (!input) return null;
  const content = buildSponsorshipPackagesContent(input);
  if (!content) return null;

  const pageW = A4_WIDTH_MM;
  const elements: BrochureElement[] = [];
  const push = (el: BrochureElement) => {
    el.zIndex = elements.length;
    elements.push(el);
  };

  pushClassicPageHeader(elements, push, eventTitle, dateText, accent, titleColor);
  pushClassicSectionHeading(push, 40, content.title, accent, titleColor);

  const bodyLeft = 20;
  const bodyRight = pageW - 20;
  const bodyW = bodyRight - bodyLeft;
  const benefitColW = 46;
  const tierCount = Math.max(1, content.tiers.length);
  const tierColW = (bodyW - benefitColW) / tierCount;
  const headerRowH = 10;
  const rowH = 8;
  const startY = 62;

  // Header row — benefit column left blank, one cell per tier name.
  push(
    newShapeElement({
      x: bodyLeft,
      y: startY,
      width: benefitColW,
      height: headerRowH,
      shape: "rect",
      fill: accent,
      stroke: "transparent",
      strokeWidth: 0,
      cornerRadius: 0,
    })
  );
  for (let c = 0; c < content.tiers.length; c += 1) {
    const x = bodyLeft + benefitColW + c * tierColW;
    push(
      newShapeElement({
        x,
        y: startY,
        width: tierColW,
        height: headerRowH,
        shape: "rect",
        fill: accent,
        stroke: "#ffffff",
        strokeWidth: 0.2,
        cornerRadius: 0,
      })
    );
    push(
      newTextElement({
        x: x + 1,
        y: startY + headerRowH / 2 - 4,
        width: tierColW - 2,
        height: 8,
        content: content.tiers[c].name,
        fontFamily: "Poppins",
        fontSize: 9,
        fontWeight: "bold",
        color: "#ffffff",
        align: "center",
        lineHeight: 1.05,
      })
    );
  }

  // Benefit rows — alternating row background for readability, one
  // label cell + one value cell per tier.
  const maxRows = 14; // keep the page from overflowing on very long lists
  const benefitRows = content.benefits.slice(0, maxRows);
  for (let r = 0; r < benefitRows.length; r += 1) {
    const y = startY + headerRowH + r * rowH;
    const rowBg = r % 2 === 0 ? "#f9fafb" : "#ffffff";

    push(
      newShapeElement({
        x: bodyLeft,
        y,
        width: bodyW,
        height: rowH,
        shape: "rect",
        fill: rowBg,
        stroke: "#e5e7eb",
        strokeWidth: 0.15,
        cornerRadius: 0,
      })
    );
    push(
      newTextElement({
        x: bodyLeft + 1.5,
        y: y + rowH / 2 - 3,
        width: benefitColW - 3,
        height: rowH - 1,
        content: benefitRows[r],
        fontFamily: "Poppins",
        fontSize: 7,
        fontWeight: "bold",
        color: titleColor,
        align: "left",
        lineHeight: 1.05,
      })
    );

    for (let c = 0; c < content.tiers.length; c += 1) {
      const x = bodyLeft + benefitColW + c * tierColW;
      const cell = content.tiers[c].cells[r];
      const label =
        cell?.kind === "check" ? "✓" : cell?.kind === "cross" ? "✗" : cell?.kind === "text" ? cell.value : "—";
      const cellColor = cell?.kind === "check" ? "#16a34a" : cell?.kind === "cross" ? "#dc2626" : titleColor;
      push(
        newTextElement({
          x: x + 1,
          y: y + rowH / 2 - 3,
          width: tierColW - 2,
          height: rowH - 1,
          content: label,
          fontFamily: "Poppins",
          fontSize: 7,
          fontWeight: cell?.kind === "check" || cell?.kind === "cross" ? "bold" : "normal",
          color: cellColor,
          align: "center",
          lineHeight: 1.05,
        })
      );
    }
  }

  // Cost row — bold, accent-colored, at the bottom of the table.
  const hasCost = content.tiers.some((t) => t.price);
  if (hasCost) {
    const y = startY + headerRowH + benefitRows.length * rowH;
    push(
      newShapeElement({
        x: bodyLeft,
        y,
        width: bodyW,
        height: rowH + 2,
        shape: "rect",
        fill: "#111111",
        stroke: "transparent",
        strokeWidth: 0,
        cornerRadius: 0,
      })
    );
    push(
      newTextElement({
        x: bodyLeft + 1.5,
        y: y + (rowH + 2) / 2 - 3,
        width: benefitColW - 3,
        height: rowH,
        content: "Cost",
        fontFamily: "Poppins",
        fontSize: 8,
        fontWeight: "bold",
        color: "#ffffff",
        align: "left",
        lineHeight: 1.05,
      })
    );
    for (let c = 0; c < content.tiers.length; c += 1) {
      const x = bodyLeft + benefitColW + c * tierColW;
      push(
        newTextElement({
          x: x + 1,
          y: y + (rowH + 2) / 2 - 3,
          width: tierColW - 2,
          height: rowH,
          content: content.tiers[c].price ?? "—",
          fontFamily: "Poppins",
          fontSize: 7.5,
          fontWeight: "bold",
          color: "#ffffff",
          align: "center",
          lineHeight: 1.05,
        })
      );
    }
  }

  return {
    id: `page-sponsorship-${Math.random().toString(36).slice(2, 8)}`,
    width: A4_WIDTH_MM,
    height: A4_HEIGHT_MM,
    background: { type: "solid", color: "#ffffff" },
    elements,
  };
}
