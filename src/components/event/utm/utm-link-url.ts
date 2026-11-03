import { eventPublicUrl } from "@/lib/event-routes";
import { buildUtmUrl } from "@/lib/utm";

export interface UtmLinkDraft {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content?: string | null;
  utm_term?: string | null;
  label?: string | null;
}

/**
 * The tracked URL for an event + UTM values. A campaign equal to the event
 * slug is left out — the slug is already in the path, and the event page
 * restores it as the campaign when it records the visit.
 */
export function utmLinkUrl(
  event: { eventId: string; eventSlug?: string | null; orgSlug?: string | null },
  v: UtmLinkDraft,
): string {
  const base = eventPublicUrl({ id: event.eventId, slug: event.eventSlug ?? undefined }, event.orgSlug ?? undefined);
  const campaign = v.utm_campaign.trim();
  return buildUtmUrl(base, {
    utm_source: v.utm_source,
    utm_medium: v.utm_medium,
    utm_campaign: event.eventSlug && campaign === event.eventSlug ? "" : campaign,
    utm_content: v.utm_content || undefined,
    utm_term: v.utm_term || undefined,
  });
}
