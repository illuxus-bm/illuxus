/**
 * Starting content for the brochure, taken from the event.
 *
 * The poster pages (abstract, learning outcomes, why sponsor, pricing) only
 * appear when they have something to say, and all of that copy used to start
 * empty — so a new brochure came out as a cover and an agenda until the
 * organiser had typed every field in by hand. `defaultPosterContent` fills
 * those fields from what the event already knows; `fillPosterDefaults` layers
 * it under whatever the organiser has saved, so nothing they wrote is ever
 * replaced.
 *
 * Pure — no Supabase, no DOM.
 */
import type { EventPageConfig } from "@/components/event/page-form/types";

export type PosterContent = NonNullable<NonNullable<EventPageConfig["brochurePrefs"]>["posterContent"]>;

export interface PosterDefaultsSource {
  title: string;
  description: string | null;
  organizerLogoUrl: string | null;
  /** Titles of the event's sessions, in running order. */
  sessionTitles: string[];
  config: EventPageConfig;
}

const ABSTRACT_MAX = 520;
const OUTCOME_MAX = 46;
const MAX_OUTCOMES = 6;

function sectionData<T>(config: EventPageConfig, id: string): Partial<T> {
  const section = config.sections.find((s) => s.id === id);
  return (section?.data ?? {}) as Partial<T>;
}

function plainText(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/<\s*(br|\/p|\/div|\/li|\/h\d)\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/ +([.,;:!?])/g, "$1")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

/** Cuts `text` to `max` characters at a sentence end where one is in reach. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const sentence = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (sentence > max * 0.5) return cut.slice(0, sentence + 1);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

/**
 * Splits a description into the two blocks the abstract page shows. A
 * description written as paragraphs keeps its own break; a single long one
 * is divided at a sentence boundary near the middle.
 */
export function splitAbstract(description: string): { abstract: string; featured: string } {
  const text = plainText(description);
  if (!text) return { abstract: "", featured: "" };
  const paragraphs = text.split("\n").filter(Boolean);
  if (paragraphs.length > 1) {
    return { abstract: clip(paragraphs[0], ABSTRACT_MAX), featured: clip(paragraphs.slice(1).join(" "), ABSTRACT_MAX) };
  }
  if (text.length <= ABSTRACT_MAX) return { abstract: text, featured: "" };
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [text];
  let abstract = "";
  let index = 0;
  while (index < sentences.length && (abstract + sentences[index]).length <= Math.max(ABSTRACT_MAX / 2, text.length / 2)) {
    abstract += sentences[index];
    index += 1;
  }
  if (!abstract) return { abstract: clip(text, ABSTRACT_MAX), featured: "" };
  return { abstract: abstract.trim(), featured: clip(sentences.slice(index).join("").trim(), ABSTRACT_MAX) };
}

/** Sessions that are logistics rather than something an attendee learns. */
const HOUSEKEEPING = /\b(registration|breakfast|lunch|tea|coffee|break|networking|welcome|closing|awards?)\b/i;

function outcomeFromSession(title: string): string {
  // "Panel Discussion 2: Platform Engineering at Scale" → the part after the label.
  const topic = title.includes(":") ? title.slice(title.indexOf(":") + 1) : title;
  const trimmed = topic.trim();
  return trimmed.length > OUTCOME_MAX ? `${trimmed.slice(0, trimmed.lastIndexOf(" ", OUTCOME_MAX))}…` : trimmed;
}

/** What a sponsor gets, phrased so it is true of any event. */
function whySponsorItems(title: string): string[] {
  const event = title.trim() || "the event";
  return [
    `Connect with the leaders and decision-makers attending ${event}.`,
    "Showcase your products and solutions to a focused, relevant audience.",
    "Position your brand through speaking sessions, panels and demonstrations.",
    "Generate qualified leads from organisations actively investing in this space.",
    "Meet prospects face to face through curated networking.",
    "Build strategic partnerships and open new business opportunities.",
  ];
}

/** The brochure copy this event can supply by itself. Pure. */
export function defaultPosterContent(source: PosterDefaultsSource): PosterContent {
  const { config } = source;
  const hero = sectionData<{ subheadline: string }>(config, "hero");
  const about = sectionData<{ body: string; highlights: Array<{ label: string; value: string }> }>(config, "about");
  const tickets = sectionData<{ tiers: Array<{ name: string; price: string; description?: string }> }>(config, "tickets");
  const contact = sectionData<{ linkedin: string; twitter: string }>(config, "contact");

  const { abstract, featured } = splitAbstract(source.description || about.body || "");
  const aboutBody = plainText(about.body);
  const defaults: PosterContent = {};

  if (hero.subheadline?.trim()) defaults.coverTagline = hero.subheadline.trim();
  if (source.organizerLogoUrl) defaults.organizerLogoUrl = source.organizerLogoUrl;
  if (abstract) defaults.abstract = abstract;
  const second = featured || (aboutBody && aboutBody !== plainText(source.description) ? clip(aboutBody, ABSTRACT_MAX) : "");
  if (second && second !== abstract) defaults.featured = second;

  const highlights = (about.highlights ?? []).map((h) => `${h.value ?? ""} ${h.label ?? ""}`.trim()).filter(Boolean);
  const fromSessions = source.sessionTitles.filter((t) => t.trim() && !HOUSEKEEPING.test(t)).map(outcomeFromSession);
  const outcomes = [...new Set(highlights.length > 0 ? highlights : fromSessions)].slice(0, MAX_OUTCOMES);
  if (outcomes.length > 0) defaults.learningOutcomes = outcomes;

  defaults.whySponsor = whySponsorItems(source.title);

  const cards = (tickets.tiers ?? [])
    .filter((tier) => tier.name?.trim() && tier.price?.trim())
    .slice(0, 2)
    .map((tier) => ({ title: tier.name.trim().toUpperCase(), subtitle: tier.description?.trim() || undefined, price: tier.price.trim() }));
  if (cards.length > 0) {
    defaults.pricingCards = cards;
    defaults.registrationForm = true;
  }

  defaults.socialLinks = [
    { platform: "linkedin", url: contact.linkedin?.trim() ?? "" },
    { platform: "instagram", url: "" },
    { platform: "facebook", url: "" },
    { platform: "twitter", url: contact.twitter?.trim() ?? "" },
  ];
  return defaults;
}

/**
 * `saved` with every field it leaves unset taken from `defaults`. A field the
 * organiser has set — including to an empty list — is theirs and is kept.
 * Pure.
 */
export function fillPosterDefaults(saved: PosterContent | undefined, defaults: PosterContent): PosterContent {
  const result: Record<string, unknown> = { ...defaults };
  for (const [key, value] of Object.entries(saved ?? {})) {
    if (value !== undefined && value !== null) result[key] = value;
  }
  return result as PosterContent;
}
