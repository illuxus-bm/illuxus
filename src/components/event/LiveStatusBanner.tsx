/**
 * LiveStatusBanner — intentionally disabled.
 * The live/join banner was removed because the redirect URL was not
 * resolving correctly for all event URL formats. The webinar is still
 * accessible via the Webinar tab on the event page or the organiser's
 * broadcast studio.
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function LiveStatusBanner(_props: {
  eventId: string;
  eventDate: string;
  eventFormat?: string | null;
  eventSlug?: string;
}) {
  return null;
}
