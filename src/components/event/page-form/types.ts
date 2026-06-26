/**
 * Form-based event landing page schema.
 *
 * Sections removed from the public catalog (no longer shown in sidebar):
 *   workshops, exhibitors, travel, codeOfConduct, newsletter, press, partners, liveStream
 */

export type SectionId =
  | "hero"
  | "about"
  | "dateVenue"
  | "tickets"
  | "agenda"
  | "speakers"
  | "sponsors"
  | "gallery"
  | "testimonials"
  | "networking"
  | "cfp"
  | "countdown"
  | "faq"
  | "contact"
  | "customHtml";

export interface ThemeConfig {
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  fontFamily: string;
  /** Scale factor for heading/title text. 1.0 = default (16px base). */
  titleScale?: number;
  /** Scale factor for body/section content text. 1.0 = default. */
  bodyScale?: number;
  /** @deprecated use titleScale instead — kept for backward compat with old saves */
  fontScale?: number;
}

export interface SeoConfig {
  metaTitle?: string;
  metaDescription?: string;
  ogImage?: string;
  analyticsId?: string;
}

/* ─── Section data shapes ─── */

export interface HeroData {
  headline?: string;
  subheadline?: string;
  badge?: string;
  primaryCtaText?: string;
  primaryCtaUrl?: string;
  secondaryCtaText?: string;
  secondaryCtaUrl?: string;
  showDate?: boolean;
  showVenue?: boolean;
  backgroundImage?: string;
}

export interface AboutData {
  title?: string;
  body?: string;
  highlights?: { label: string; value: string }[];
}

export interface DateVenueData {
  title?: string;
  address?: string;
  mapEmbedUrl?: string;
  parkingNotes?: string;
  transitNotes?: string;
}

export interface TicketTier {
  id: string;
  name: string;
  price: string;
  description?: string;
  earlyBird?: boolean;
  url?: string;
}
export interface TicketsData {
  title?: string;
  intro?: string;
  tiers: TicketTier[];
}

export interface AgendaData {
  title?: string;
  intro?: string;
  layout?: "list" | "tracks";
}

export interface SpeakersData {
  title?: string;
  intro?: string;
  layout?: "grid" | "list";
  showBio?: boolean;
}

export interface SponsorsData {
  title?: string;
  intro?: string;
  groupByTier?: boolean;
}

export interface GalleryItem {
  id: string;
  url: string;
  caption?: string;
}
export interface GalleryData {
  title?: string;
  items: GalleryItem[];
}

export interface Testimonial {
  id: string;
  quote: string;
  author: string;
  role?: string;
}
export interface TestimonialsData {
  title?: string;
  testimonials: Testimonial[];
}

export interface NetworkingData {
  title?: string;
  description?: string;
  slackUrl?: string;
  discordUrl?: string;
  telegramUrl?: string;
}

export interface CfpData {
  title?: string;
  description?: string;
  deadline?: string;
  submitUrl?: string;
  guidelines?: string;
}

export interface CountdownData {
  title?: string;
  /** ISO datetime; if blank, falls back to event.date */
  targetDate?: string;
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}
export interface FaqData {
  title?: string;
  items: FaqItem[];
}

export interface ContactData {
  title?: string;
  organizerName?: string;
  email?: string;
  phone?: string;
  twitter?: string;
  linkedin?: string;
  website?: string;
}

export interface CustomHtmlData {
  /** Raw HTML — sanitized before render */
  html?: string;
}

/* Discriminated union — gives the editor and renderer typed access */
export type SectionData =
  | { id: "hero";         data: HeroData }
  | { id: "about";        data: AboutData }
  | { id: "dateVenue";    data: DateVenueData }
  | { id: "tickets";      data: TicketsData }
  | { id: "agenda";       data: AgendaData }
  | { id: "speakers";     data: SpeakersData }
  | { id: "sponsors";     data: SponsorsData }
  | { id: "gallery";      data: GalleryData }
  | { id: "testimonials"; data: TestimonialsData }
  | { id: "networking";   data: NetworkingData }
  | { id: "cfp";          data: CfpData }
  | { id: "countdown";    data: CountdownData }
  | { id: "faq";          data: FaqData }
  | { id: "contact";      data: ContactData }
  | { id: "customHtml";   data: CustomHtmlData };

export type EventSection = SectionData & {
  enabled: boolean;
  order: number;
  themeOverride?: Partial<ThemeConfig>;
};

export interface EventPageConfig {
  v: 2;
  theme: ThemeConfig;
  seo: SeoConfig;
  sections: EventSection[];
}

/* ─── Section catalog (what appears in the Design sidebar) ─── */

export interface SectionMeta {
  id: SectionId;
  label: string;
  description: string;
  group: "core" | "common" | "engagement" | "advanced";
}

export const SECTION_CATALOG: SectionMeta[] = [
  // Essentials
  { id: "about",        label: "About",             description: "What the event is about",                group: "core" },
  { id: "tickets",      label: "Tickets",           description: "Ticket tiers, prices, early-bird",      group: "core" },
  { id: "countdown",    label: "Countdown",         description: "Timer to event start",                  group: "core" },
  // Common
  { id: "agenda",       label: "Agenda",            description: "Schedule of sessions",                  group: "common" },
  { id: "speakers",     label: "Speakers",          description: "Speaker line-up",                       group: "common" },
  { id: "sponsors",     label: "Sponsors",          description: "Sponsor tiers",                         group: "common" },
  { id: "gallery",      label: "Gallery",           description: "Photos / videos from past events",      group: "common" },
  { id: "testimonials", label: "Testimonials",      description: "Quotes from past attendees",            group: "common" },
  { id: "faq",          label: "FAQ",               description: "Questions & answers",                   group: "common" },
  // Engagement
  { id: "networking",   label: "Networking",        description: "Slack / Discord / Telegram links",      group: "engagement" },
  { id: "contact",      label: "Contact",           description: "Organizer name, email, social links",   group: "engagement" },
  // Advanced
  { id: "customHtml",   label: "Custom HTML",       description: "Raw HTML block (sanitized)",            group: "advanced" },
];

export const GROUP_LABEL: Record<SectionMeta["group"], string> = {
  core:       "Essentials",
  common:     "Common",
  engagement: "Engagement",
  advanced:   "Advanced",
};

/* ─── Defaults ─── */

export const DEFAULT_THEME: ThemeConfig = {
  primaryColor:    "#6366f1",
  accentColor:     "#f59e0b",
  backgroundColor: "#ffffff",
  textColor:       "#1a1a2e",
  // Project-wide default — matches the global body font set in src/index.css
  // and the Google Font preloaded in index.html. Per-event presets in
  // `presets.ts` may override this (Playfair, JetBrains Mono, etc.).
  fontFamily:      "Poppins",
  // Font scale defaults — 1.0 = 16px base. Always defined so sliders
  // render at the correct midpoint position rather than falling back to 0.
  titleScale: 1.0,
  bodyScale:  1.0,
};

function emptyDataFor(id: SectionId): SectionData["data"] {
  switch (id) {
    case "hero":         return { showDate: true, showVenue: true, primaryCtaText: "Register" };
    case "about":        return { title: "About this event", highlights: [] };
    case "dateVenue":    return { title: "Date & Venue" };
    case "tickets":      return { title: "Tickets", tiers: [] };
    case "agenda":       return { title: "Agenda", layout: "list" };
    case "speakers":     return { title: "Speakers", layout: "grid", showBio: true };
    case "sponsors":     return { title: "Sponsors", groupByTier: true };
    case "gallery":      return { title: "Gallery", items: [] };
    case "testimonials": return { title: "What attendees say", testimonials: [] };
    case "networking":   return { title: "Join the community" };
    case "cfp":          return { title: "Call for Speakers" };
    case "countdown":    return { title: "Starts in" };
    case "faq":          return { title: "Frequently asked questions", items: [] };
    case "contact":      return { title: "Contact" };
    case "customHtml":   return { html: "" };
  }
}

/** Default config: core sections + speakers, agenda, sponsors enabled. */
export function buildDefaultConfig(): EventPageConfig {
  const sections: EventSection[] = SECTION_CATALOG.map((meta, idx) => ({
    id:      meta.id,
    data:    emptyDataFor(meta.id) as never,
    enabled: meta.group === "core" || meta.id === "speakers" || meta.id === "agenda" || meta.id === "sponsors",
    order:   idx,
  })) as EventSection[];
  return { v: 2, theme: { ...DEFAULT_THEME }, seo: {}, sections };
}

/**
 * Coerce any stored config into a clean v2 EventPageConfig.
 * Removed section IDs (exhibitors, travel, codeOfConduct, etc.) are silently
 * dropped so existing saved configs stay valid.
 */
export function normalizeConfig(raw: unknown): EventPageConfig {
  const fresh = buildDefaultConfig();
  if (!raw || typeof raw !== "object") return fresh;
  const r = raw as {
    v?: number;
    theme?: Partial<ThemeConfig>;
    seo?: SeoConfig;
    sections?: EventSection[];
  };

  // Legacy or incompatible format → start fresh, preserve theme colours.
  if (r.v !== 2 || !Array.isArray(r.sections)) {
    return { ...fresh, theme: { ...fresh.theme, ...(r.theme || {}) } };
  }

  // Known valid IDs (used to filter out removed sections from old saves)
  const validIds = new Set<string>(SECTION_CATALOG.map((m) => m.id));
  validIds.add("dateVenue"); // still rendered in header, kept for legacy compat

  const byId = new Map<SectionId, EventSection>();
  for (const s of r.sections) {
    if (!validIds.has(s.id)) continue; // silently drop removed sections
    if (s.id === "dateVenue") continue;
    byId.set(s.id as SectionId, s);
  }

  const merged: EventSection[] = fresh.sections.map((def) => {
    const stored = byId.get(def.id);
    if (!stored) return def;
    return {
      ...def,
      ...stored,
      data: { ...(def.data as object), ...(stored.data as object) } as never,
    };
  });

  return {
    v: 2,
    theme: {
      ...fresh.theme,
      ...(r.theme || {}),
      // Always ensure scale values are within sane bounds — old saves may have
      // stored 0.75 (= 12px) as a result of a previous buggy slider default.
      titleScale: Math.min(2, Math.max(0.75, (r.theme?.titleScale ?? r.theme?.fontScale ?? fresh.theme.titleScale ?? 1))),
      bodyScale:  Math.min(1.375, Math.max(0.625, (r.theme?.bodyScale ?? fresh.theme.bodyScale ?? 1))),
    },
    seo:   r.seo || {},
    sections: merged,
  };
}

export function genId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
