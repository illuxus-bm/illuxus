/**
 * Event data for the creative studio.
 *
 * `loadStudioData` gathers everything a creative can show — the event, its
 * page content, the organisation, and the linked speakers, sponsors and
 * sessions — and `deriveContent` turns it into the starting copy. Nothing on
 * a creative is typed in from scratch: the organiser only edits what the
 * event already says.
 */
import { supabase } from "@/integrations/supabase/client";
import { normalizeConfig, type EventPageConfig } from "@/components/event/page-form/types";
import { logger } from "@/lib/observability";

import type { StudioContent, StudioSpeaker, StudioSponsor } from "./templates";

export interface StudioEventSource {
  title: string;
  description: string | null;
  date: string;
  endDate: string | null;
  timezone: string | null;
  venue: string | null;
  location: string | null;
  eventFormat: string | null;
  organizerName: string | null;
  sessionTitles: string[];
  publicUrl: string;
}

export interface StudioData {
  content: StudioContent;
  speakers: StudioSpeaker[];
  sponsors: StudioSponsor[];
  organizerLogoUrl: string | null;
  coverImageUrl: string | null;
  year: string;
  /** The event page's own colours, offered as a palette choice. */
  theme: { primary: string; accent: string; background: string };
}

function sectionData<T>(config: EventPageConfig, id: string): Partial<T> {
  const section = config.sections.find((s) => s.id === id);
  return (section?.data ?? {}) as Partial<T>;
}

function zoned(date: Date, timeZone: string | null, options: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: timeZone ?? undefined }).format(date);
  } catch {
    // An unrecognised zone name must not take the whole creative down.
    return new Intl.DateTimeFormat("en-GB", options).format(date);
  }
}

/** "27 March 2026", or "27–28 March 2026" / "30 March – 2 April 2026" for a run. */
export function formatDateLine(startIso: string, endIso: string | null, timeZone: string | null): string {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return "";
  const full = (d: Date): string => zoned(d, timeZone, { day: "numeric", month: "long", year: "numeric" });
  const end = endIso ? new Date(endIso) : null;
  if (!end || Number.isNaN(end.getTime()) || full(end) === full(start)) return full(start);
  const part = (d: Date, options: Intl.DateTimeFormatOptions): string => zoned(d, timeZone, options);
  const sameYear = part(start, { year: "numeric" }) === part(end, { year: "numeric" });
  const sameMonth = sameYear && part(start, { month: "long" }) === part(end, { month: "long" });
  if (sameMonth) return `${part(start, { day: "numeric" })}–${full(end)}`;
  if (sameYear) return `${part(start, { day: "numeric", month: "long" })} – ${full(end)}`;
  return `${full(start)} – ${full(end)}`;
}

/** "7:00 PM onwards", or "10:00 AM – 5:00 PM" when the event ends the same day. */
export function formatTimeLine(startIso: string, endIso: string | null, timeZone: string | null): string {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return "";
  const time = (d: Date): string =>
    zoned(d, timeZone, { hour: "numeric", minute: "2-digit", hour12: true }).replace(/\s?(am|pm)/i, (m) => ` ${m.trim().toUpperCase()}`);
  const day = (d: Date): string => zoned(d, timeZone, { day: "numeric", month: "numeric", year: "numeric" });
  const end = endIso ? new Date(endIso) : null;
  if (end && !Number.isNaN(end.getTime()) && day(end) === day(start) && end > start) return `${time(start)} – ${time(end)}`;
  return `${time(start)} onwards`;
}

function formatLabelFor(eventFormat: string | null): string {
  const value = (eventFormat ?? "").toLowerCase();
  if (value.includes("virtual") || value.includes("online") || value.includes("webinar")) return "Webinar";
  if (value.includes("hybrid")) return "Hybrid event";
  return "In-person event";
}

function firstSentences(text: string, maxLength: number): string {
  const plain = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (plain.length <= maxLength) return plain;
  const cut = plain.slice(0, maxLength);
  const sentenceEnd = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (sentenceEnd > maxLength * 0.4) return cut.slice(0, sentenceEnd + 1);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

const displayUrl = (url: string): string => url.replace(/^https?:\/\//i, "").replace(/\/$/, "");

/**
 * The copy a creative starts with, taken from the event and its page
 * content. Pure.
 */
export function deriveContent(event: StudioEventSource, config: EventPageConfig): StudioContent {
  const hero = sectionData<{ headline: string; subheadline: string; badge: string; primaryCtaText: string }>(config, "hero");
  const about = sectionData<{ body: string; highlights: Array<{ label: string; value: string }> }>(config, "about");
  const where = sectionData<{ address: string }>(config, "dateVenue");
  const contact = sectionData<{ organizerName: string; phone: string; website: string }>(config, "contact");

  const description = firstSentences(event.description || about.body || "", 150);
  const highlights = (about.highlights ?? []).map((h) => `${h.value ?? ""} ${h.label ?? ""}`.trim()).filter(Boolean);
  const bullets = (event.sessionTitles.length > 0 ? event.sessionTitles : highlights).slice(0, 4);
  const venueName = event.venue || event.location || "";
  const venueAddress = where.address || (event.venue && event.location && event.location !== event.venue ? event.location : "");
  const isVirtual = formatLabelFor(event.eventFormat) === "Webinar";

  return {
    organizerName: contact.organizerName || event.organizerName || "",
    organizerTagline: "",
    kicker: "announces the upcoming session with",
    eventTitle: event.title,
    subtitle: hero.subheadline || hero.badge || "",
    dateLine: formatDateLine(event.date, event.endDate, event.timezone),
    timeLine: formatTimeLine(event.date, event.endDate, event.timezone),
    venueName: venueName || (isVirtual ? "Online" : ""),
    venueAddress,
    infoLabel: "For tickets and information:",
    website: displayUrl(contact.website || event.publicUrl),
    phone: contact.phone || "",
    ctaLabel: hero.primaryCtaText || "Register now",
    description,
    bullets: bullets.join("\n"),
    badge: "Live",
    formatLabel: formatLabelFor(event.eventFormat),
    speakersLabel: "Guest speakers",
    sponsorLabel: "Sponsor",
    linkLabel: "Register online",
  };
}

/** Rows keyed by id, returned in the order `ids` lists them. */
function inOrder<T extends { id: string }>(ids: string[], rows: T[] | null): T[] {
  const byId = new Map((rows ?? []).map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id)).filter((row): row is T => Boolean(row));
}

export async function loadStudioData(eventId: string): Promise<StudioData> {
  const [eventRes, speakerLinks, sponsorLinks, sessionsRes] = await Promise.all([
    supabase
      .from("events")
      .select("title, description, date, end_date, timezone, venue, location, event_format, image_url, banner_landscape_url, banner_portrait_url, org_id, page_config")
      .eq("id", eventId)
      .single(),
    supabase.from("event_speakers").select("speaker_id, display_order").eq("event_id", eventId).order("display_order"),
    supabase.from("event_sponsors").select("sponsor_id, display_order").eq("event_id", eventId).order("display_order"),
    supabase.from("sessions").select("title, start_time").eq("event_id", eventId).order("start_time"),
  ]);
  if (eventRes.error || !eventRes.data) {
    logger.error("creative studio event fetch failed", { event_id: eventId, error_message: eventRes.error?.message });
    throw eventRes.error ?? new Error("Event not found");
  }
  const event = eventRes.data;
  const speakerIds = (speakerLinks.data ?? []).map((row) => row.speaker_id);
  const sponsorIds = (sponsorLinks.data ?? []).map((row) => row.sponsor_id);

  const [speakersRes, sponsorsRes, orgRes] = await Promise.all([
    speakerIds.length > 0
      ? supabase.from("speakers").select("id, name, title, designation, company, photo_url").in("id", speakerIds)
      : Promise.resolve({ data: [] }),
    sponsorIds.length > 0
      ? supabase.from("sponsors").select("id, name, logo_url").in("id", sponsorIds)
      : Promise.resolve({ data: [] }),
    event.org_id
      ? supabase.from("organizations").select("name, logo_url").eq("id", event.org_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const config = normalizeConfig(event.page_config);
  const speakers: StudioSpeaker[] = inOrder(speakerIds, speakersRes.data).map((row) => ({
    id: row.id,
    name: row.name,
    role: [row.designation || row.title, row.company].filter(Boolean).join(", "),
    photoUrl: row.photo_url || null,
  }));
  const sponsors: StudioSponsor[] = inOrder(sponsorIds, sponsorsRes.data).map((row) => ({
    id: row.id,
    name: row.name,
    logoUrl: row.logo_url || null,
  }));

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const content = deriveContent(
    {
      title: event.title,
      description: event.description,
      date: event.date,
      endDate: event.end_date,
      timezone: event.timezone,
      venue: event.venue,
      location: event.location,
      eventFormat: event.event_format,
      organizerName: orgRes.data?.name ?? null,
      sessionTitles: (sessionsRes.data ?? []).map((row) => row.title).filter(Boolean),
      publicUrl: `${origin}/events/${eventId}`,
    },
    config,
  );

  const start = new Date(event.date);
  return {
    content,
    speakers,
    sponsors,
    organizerLogoUrl: orgRes.data?.logo_url || null,
    coverImageUrl: event.image_url || event.banner_portrait_url || event.banner_landscape_url || null,
    year: Number.isNaN(start.getTime()) ? "" : String(start.getFullYear()),
    theme: {
      primary: config.theme.primaryColor,
      accent: config.theme.accentColor,
      background: config.theme.backgroundColor,
    },
  };
}
