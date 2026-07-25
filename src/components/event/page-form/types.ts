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
  /**
   * Per-event default Creative_Template selection for the Creative_Generator
   * feature (social/promo graphics for speakers & sponsors), keyed by
   * Creative type. Optional so existing saved configs (pre-dating this
   * field) remain valid — `normalizeConfig` forward-merges it from `fresh`
   * when a stored config doesn't have it yet.
   *
   * Deliberately typed with the literal union here (rather than importing
   * `CreativeType` from `@/lib/creatives/creative-templates`) to avoid a
   * dependency from this low-level page-form schema module onto the
   * creatives feature module — keep the two literal unions in sync if
   * `CreativeType` ever changes.
   *
   * `perEntity` (added by the Creative_Customization spec, Requirement 10.2)
   * carries per-speaker / per-sponsor template overrides keyed by the
   * entity's stable id. Reads go through
   * `readEffectiveTemplateId(config, entityId, creativeType)` which falls
   * back to `creativeTemplatePrefs[creativeType]` when no per-entity
   * override is set (Requirement 10.3). Writes go through
   * `saveEntityTemplateOverride` / `clearEntityTemplateOverride` in
   * `@/lib/creatives/creative-templates`; the clear path deletes the key
   * (rather than storing null) so the map stays minimal (Requirement 10.5).
   */
  creativeTemplatePrefs?: Partial<Record<"speaker" | "sponsor" | "combo", string>> & {
    perEntity?: Record<string, string>;
  };
  /**
   * Organizer-forked `CreativeTemplate` presets stored on the event's
   * `page_config` (Creative_Customization spec, Requirement 8.8). Reads and
   * writes go through `saveCustomTemplate` / `deleteCustomTemplate` in
   * `@/lib/creatives/creative-templates`. `event_creatives` rows that
   * reference a Custom_Template's id continue to render via their
   * embedded `Customization_Config.snapshotTemplate`
   * even after the template is deleted from this list (Requirement 8.10).
   *
   * The element shape is inlined with an `unknown` index signature (rather
   * than importing `CustomCreativeTemplate` from
   * `@/lib/creatives/creative-customization`) to avoid a dependency from
   * this low-level page-form schema module onto the creatives feature
   * module — the same pattern used for `creativeTemplatePrefs` and
   * `brochurePrefs`. `parseCustomization` in the creatives module
   * validates the fuller shape at runtime.
   */
  customCreativeTemplates?: Array<{
    id: string;
    name: string;
    basedOn: string | null;
    type: "speaker" | "sponsor" | "combo";
    [key: string]: unknown;
  }>;
  /**
   * Per-event saved defaults for the Brochure_Generator feature (auto-generated
   * multi-page PDF brochure: cover, agenda, speakers, sponsors, venue/logistics).
   * Optional so existing saved configs (pre-dating this field) remain valid —
   * `normalizeConfig` forward-merges it from `fresh` when a stored config
   * doesn't have it yet, mirroring `creativeTemplatePrefs`'s exact pattern.
   *
   * `sectionLayout`'s `id` union is deliberately re-declared here (rather than
   * importing `BrochureSectionId` from `@/lib/brochure/brochure-templates`) for
   * the same reason `creativeTemplatePrefs` re-declares its own type literal —
   * to avoid a dependency from this low-level page-form schema module onto the
   * brochure feature module. Keep the two literal unions in sync if
   * `BrochureSectionId` ever changes.
   */
  brochurePrefs?: {
    themeId?: string;
    colorOverride?: { primaryColor?: string; accentColor?: string; fontFamily?: string };
    sectionLayout?: {
      id:
        | "cover"
        | "agenda"
        | "speakers"
        | "sponsors"
        | "venueLogistics"
        | "abstract"
        | "whySponsor"
        | "pricing";
      included: boolean;
    }[];
    /**
     * Organizer-authored content used exclusively by the Poster_Bold theme's
     * extra sections (Abstract, Why Sponsor, Pricing). Every field is
     * optional — when a field is absent or empty, the corresponding section
     * silently omits that block rather than rendering an empty placeholder,
     * matching the Missing_Data_Placeholder contract used elsewhere in the
     * brochure pipeline.
     *
     * Kept co-located with `brochurePrefs` (rather than a separate top-level
     * `posterBoldContent` field) so the "save as event default" toggle in
     * `BrochureConfiguratorDialog` continues to persist the whole shape
     * through the existing `saveBrochurePrefs`/`readBrochurePrefs` path
     * without introducing a second persistence key.
     */
    posterContent?: {
      /** Brand logo shown at the top of every content page (page 2+). Not
       *  the same as the cover image — the cover image renders as the
       *  hero, this logo is a small wordmark. */
      logoUrl?: string;
      /** Organizer / production company logo shown in the cover footer
       *  ("Conceptualized & Organized by"). */
      organizerLogoUrl?: string;
      /** Social media links rendered as icon chips at the bottom-right of
       *  the cover. Empty array or omitted → the "Follow us" line is
       *  omitted entirely. */
      socialLinks?: Array<{
        platform: "linkedin" | "instagram" | "facebook" | "twitter";
        url: string;
      }>;
      /** Page 2 top card body copy — describes the event at a high level. */
      abstract?: string;
      /** Page 2 middle card body copy — what's featured / included. */
      featured?: string;
      /** Page 2 bottom grid — 4–6 short chips describing attendee outcomes.
       *  Rendered in a two-column grid of dark rounded rectangles. */
      learningOutcomes?: string[];
      /** Page 3 numbered value-prop items ("Why Sponsor?"). Rendered as a
       *  vertical stack with an orange circular number badge on the left. */
      whySponsor?: string[];
      /** Page 5 pricing cards. Rendered as a two-column grid (or single
       *  column when only one card is provided). */
      pricingCards?: Array<{
        /** Card headline, e.g. "Individual" or "Award Nominations". */
        title: string;
        /** Small line under the title, e.g. "Early Bird: ₹12,500/-". */
        subtitle?: string;
        /** Headline price, e.g. "₹15,000/-". */
        price: string;
        /** Bulleted discount lines, e.g. "10% on 2 or more participants". */
        discounts?: string[];
      }>;
      /** When true, a blank registration form (3 rows × 2 columns of empty
       *  input pill fields) is drawn below the pricing cards on page 5. */
      registrationForm?: boolean;
    };
  };
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
  return { v: 2, theme: { ...DEFAULT_THEME }, seo: {}, sections, creativeTemplatePrefs: {}, brochurePrefs: {}, customCreativeTemplates: [] };
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
    creativeTemplatePrefs?: EventPageConfig["creativeTemplatePrefs"];
    brochurePrefs?: EventPageConfig["brochurePrefs"];
    customCreativeTemplates?: EventPageConfig["customCreativeTemplates"];
  };

  // Legacy or incompatible format → start fresh, preserve theme colours.
  if (r.v !== 2 || !Array.isArray(r.sections)) {
    return {
      ...fresh,
      theme: { ...fresh.theme, ...(r.theme || {}) },
      creativeTemplatePrefs: { ...fresh.creativeTemplatePrefs, ...(r.creativeTemplatePrefs || {}) },
      brochurePrefs: { ...fresh.brochurePrefs, ...(r.brochurePrefs || {}) },
      customCreativeTemplates: r.customCreativeTemplates ?? fresh.customCreativeTemplates,
    };
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
    creativeTemplatePrefs: { ...fresh.creativeTemplatePrefs, ...(r.creativeTemplatePrefs || {}) },
    brochurePrefs: { ...fresh.brochurePrefs, ...(r.brochurePrefs || {}) },
    // Custom_Templates are a full-replacement list (a fresh save carries the
    // organizer's current library) — mirror the pattern used by `sections`
    // rather than by the merged-object prefs. Fall back to the fresh
    // default's empty list when the stored config predates this field.
    customCreativeTemplates: r.customCreativeTemplates ?? fresh.customCreativeTemplates,
  };
}

export function genId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
