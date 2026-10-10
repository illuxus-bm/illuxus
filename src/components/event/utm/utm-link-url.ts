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

/** The tracked URL for an event + UTM values. */
export function utmLinkUrl(
  event: { eventId: string; eventSlug?: string | null; orgSlug?: string | null },
  v: UtmLinkDraft,
): string {
  const base = eventPublicUrl({ id: event.eventId, slug: event.eventSlug ?? undefined }, event.orgSlug ?? undefined);
  return buildUtmUrl(base, {
    utm_source: v.utm_source,
    utm_medium: v.utm_medium,
    utm_campaign: v.utm_campaign,
    utm_content: v.utm_content || undefined,
    utm_term: v.utm_term || undefined,
  });
}
