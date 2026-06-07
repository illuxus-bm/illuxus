/**
 * Form-based event landing page schema.
 *
 * One record per section. Each section has:
 *  - `id`     stable string key (also matches the renderer's `case`)
 *  - `enabled` whether to show on the public page
 *  - `order`  display order (lower = earlier)
 *  - `data`   typed per-section content
 *
 * `EventPageConfig` is the shape we persist into `events.page_config`.
 * Speakers, sponsors and sessions are NOT duplicated here — they are
 * pulled live from their respective tables. The section data only stores
 * presentation choices (title, intro, layout).
 */

export type SectionId =
  | "hero"
  | "about"
  | "dateVenue"
  | "tickets"
  | "agenda"
  | "speakers"
  | "sponsors"
  | "workshops"
  | "exhibitors"
  | "travel"
  | "codeOfConduct"
  | "gallery"
  | "testimonials"
  | "newsletter"
  | "press"
  | "partners"
  | "liveStream"
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

export interface Workshop {
  id: string;
  name: string;
  description?: string;
  facilitator?: string;
  duration?: string;
  price?: string;
  url?: string;
}
export interface WorkshopsData {
  title?: string;
  intro?: string;
  workshops: Workshop[];
}

export interface Exhibitor {
  id: string;
  name: string;
  booth?: string;
  description?: string;
  logoUrl?: string;
  website?: string;
}
export interface ExhibitorsData {
  title?: string;
  intro?: string;
  floorMapUrl?: string;
  exhibitors: Exhibitor[];
}

export interface TravelData {
  title?: string;
  airportInfo?: string;
  hotels?: { name: string; address?: string; discountCode?: string; url?: string }[];
}

export interface CodeOfConductData {
  title?: string;
  body?: string;
  reportingContact?: string;
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

export interface NewsletterData {
  title?: string;
  description?: string;
  buttonText?: string;
  successMessage?: string;
}

export interface PressData {
  title?: string;
  pressKitUrl?: string;
  contactEmail?: string;
  body?: string;
}

export interface Partner {
  id: string;
  name: string;
  logoUrl?: string;
  website?: string;
}
export interface PartnersData {
  title?: string;
  intro?: string;
  partners: Partner[];
}

export interface LiveStreamData {
  title?: string;
  embedUrl?: string;
  description?: string;
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
  | { id: "hero"; data: HeroData }
  | { id: "about"; data: AboutData }
  | { id: "dateVenue"; data: DateVenueData }
  | { id: "tickets"; data: TicketsData }
  | { id: "agenda"; data: AgendaData }
  | { id: "speakers"; data: SpeakersData }
  | { id: "sponsors"; data: SponsorsData }
  | { id: "workshops"; data: WorkshopsData }
  | { id: "exhibitors"; data: ExhibitorsData }
  | { id: "travel"; data: TravelData }
  | { id: "codeOfConduct"; data: CodeOfConductData }
  | { id: "gallery"; data: GalleryData }
  | { id: "testimonials"; data: TestimonialsData }
  | { id: "newsletter"; data: NewsletterData }
  | { id: "press"; data: PressData }
  | { id: "partners"; data: PartnersData }
  | { id: "liveStream"; data: LiveStreamData }
  | { id: "networking"; data: NetworkingData }
  | { id: "cfp"; data: CfpData }
  | { id: "countdown"; data: CountdownData }
  | { id: "faq"; data: FaqData }
  | { id: "contact"; data: ContactData }
  | { id: "customHtml"; data: CustomHtmlData };

export type EventSection = SectionData & {
  enabled: boolean;
  order: number;
  /**
   * Optional per-section theme override. Any field set here wins over the
   * page-level theme for that section only. Leave undefined to inherit.
   */
  themeOverride?: Partial<ThemeConfig>;
};

export interface EventPageConfig {
  /** Schema version — bump if shape changes */
  v: 2;
  theme: ThemeConfig;
  seo: SeoConfig;
  sections: EventSection[];
}

/* ─── Section catalog (display metadata used by the editor) ─── */

export interface SectionMeta {
  id: SectionId;
  label: string;
  description: string;
  group: "core" | "common" | "conference" | "engagement" | "advanced";
}

export const SECTION_CATALOG: SectionMeta[] = [
  { id: "about",         label: "About",           description: "What the event is about", group: "core" },
  { id: "countdown",     label: "Countdown",       description: "Timer to event start", group: "engagement" },
  { id: "agenda",        label: "Agenda",          description: "Schedule of sessions (auto from Sessions)", group: "common" },
  { id: "speakers",      label: "Speakers",        description: "Speaker line-up (auto from Speakers)", group: "common" },
  { id: "tickets",       label: "Tickets",         description: "Ticket tiers, prices, early-bird", group: "core" },
  { id: "workshops",     label: "Workshops",       description: "Standalone workshop sessions", group: "conference" },
  { id: "sponsors",      label: "Sponsors",        description: "Sponsor tiers (auto from Sponsors)", group: "common" },
  { id: "exhibitors",    label: "Exhibitors",      description: "Booths / floor map", group: "conference" },
  { id: "partners",      label: "Partners",        description: "Community partners", group: "conference" },
  { id: "gallery",       label: "Gallery",         description: "Photos / videos from past events", group: "common" },
  { id: "testimonials",  label: "Testimonials",    description: "Quotes from past attendees", group: "common" },
  { id: "faq",           label: "FAQ",             description: "Questions & answers", group: "common" },
  { id: "travel",        label: "Travel & Stay",   description: "Hotels, airport, codes", group: "conference" },
  { id: "liveStream",    label: "Live Stream",     description: "Embed for virtual / hybrid attendees", group: "engagement" },
  { id: "networking",    label: "Networking",      description: "Slack / Discord / Telegram links", group: "engagement" },
  { id: "cfp",           label: "Call for Speakers", description: "Submit a talk / abstract", group: "engagement" },
  { id: "press",         label: "Press / Media",   description: "Press kit, media contact", group: "conference" },
  { id: "codeOfConduct", label: "Code of Conduct", description: "Policy + reporting contact", group: "conference" },
  { id: "newsletter",    label: "Newsletter",      description: "Email capture", group: "engagement" },
  { id: "contact",       label: "Contact",         description: "Organizer name, email, social links", group: "engagement" },
  { id: "customHtml",    label: "Custom HTML",     description: "Raw HTML block (sanitized)", group: "advanced" },
];

export const GROUP_LABEL: Record<SectionMeta["group"], string> = {
  core: "Essentials",
  common: "Common",
  conference: "Conference",
  engagement: "Engagement",
  advanced: "Advanced",
};

/* ─── Defaults ─── */

export const DEFAULT_THEME: ThemeConfig = {
  primaryColor: "#6366f1",
  accentColor: "#f59e0b",
  backgroundColor: "#ffffff",
  textColor: "#1a1a2e",
  fontFamily: "Inter",
};

function emptyDataFor(id: SectionId): SectionData["data"] {
  switch (id) {
    case "hero":          return { showDate: true, showVenue: true, primaryCtaText: "Register" };
    case "about":         return { title: "About this event", highlights: [] };
    case "dateVenue":     return { title: "Date & Venue" };
    case "tickets":       return { title: "Tickets", tiers: [] };
    case "agenda":        return { title: "Agenda", layout: "list" };
    case "speakers":      return { title: "Speakers", layout: "grid", showBio: true };
    case "sponsors":      return { title: "Sponsors", groupByTier: true };
    case "workshops":     return { title: "Workshops", workshops: [] };
    case "exhibitors":    return { title: "Exhibitors", exhibitors: [] };
    case "travel":        return { title: "Travel & Accommodation", hotels: [] };
    case "codeOfConduct": return { title: "Code of Conduct" };
    case "gallery":       return { title: "Gallery", items: [] };
    case "testimonials":  return { title: "What attendees say", testimonials: [] };
    case "newsletter":    return { title: "Stay in the loop", buttonText: "Subscribe", successMessage: "Thanks! You're in." };
    case "press":         return { title: "Press & Media" };
    case "partners":      return { title: "Our Partners", partners: [] };
    case "liveStream":    return { title: "Watch live" };
    case "networking":    return { title: "Join the community" };
    case "cfp":           return { title: "Call for Speakers" };
    case "countdown":     return { title: "Starts in" };
    case "faq":           return { title: "Frequently asked questions", items: [] };
    case "contact":       return { title: "Contact" };
    case "customHtml":    return { html: "" };
  }
}

/** A reasonable starting page: the 5 essentials on, everything else off. */
export function buildDefaultConfig(): EventPageConfig {
  const sections: EventSection[] = SECTION_CATALOG.map((meta, idx) => ({
    id: meta.id,
    data: emptyDataFor(meta.id) as never,
    enabled: meta.group === "core" || meta.id === "speakers" || meta.id === "agenda" || meta.id === "sponsors",
    order: idx,
  })) as EventSection[];
  return {
    v: 2,
    theme: { ...DEFAULT_THEME },
    seo: {},
    sections,
  };
}

/**
 * Coerce arbitrary stored config (legacy block format, partial v2, null) into
 * a complete v2 EventPageConfig. Missing sections are filled from defaults so
 * the form always has a row for every section type.
 */
export function normalizeConfig(raw: unknown): EventPageConfig {
  const fresh = buildDefaultConfig();
  if (!raw || typeof raw !== "object") return fresh;
  const r = raw as { v?: number; theme?: Partial<ThemeConfig>; seo?: SeoConfig; sections?: EventSection[] };

  // Legacy block-based format → return defaults; user starts clean.
  if (r.v !== 2 || !Array.isArray(r.sections)) {
    return {
      ...fresh,
      theme: { ...fresh.theme, ...(r.theme || {}) },
    };
  }

  // Merge: take the stored row when it exists, otherwise the default row.
  const byId = new Map<SectionId, EventSection>();
  for (const s of r.sections) {
    // Drop deprecated sections (e.g. Date & Venue is shown via the side nav header now).
    if (s.id === "dateVenue") continue;
    byId.set(s.id, s);
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
  // Preserve any unknown sections by appending at end.
  for (const s of r.sections) {
    if (s.id === "dateVenue") continue;
    if (!fresh.sections.find((d) => d.id === s.id)) merged.push({ ...s, order: merged.length });
  }
  return {
    v: 2,
    theme: { ...fresh.theme, ...(r.theme || {}) },
    seo: r.seo || {},
    sections: merged,
  };
}

export function genId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}