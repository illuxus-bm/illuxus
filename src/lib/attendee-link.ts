/**
 * attendee-link.ts — per-attendee tracked webinar join URLs.
 *
 * Every registration row already carries a unique 64-char hex
 * `join_token` (001_tables.sql:297). The live webinar route
 * `/e/:id/live?join=<token>` uses that token to identify the
 * attendee via the `claim_join_session` RPC and to enforce a
 * single active session per token.
 *
 * This module is the single source of truth for *composing* the
 * shareable URL — it adds UTM tags so organisers can measure
 * which channel (email / WhatsApp / SMS / etc.) drove sign-ins,
 * without changing the live route's contract.
 *
 * Public domain resolution mirrors the logic used by
 * `src/lib/event-routes.ts`: prefer `VITE_PUBLIC_DOMAIN` →
 * `VITE_PUBLIC_PUBLISHED_HOST` → `VITE_PUBLIC_ORIGIN` →
 * `window.location.origin` → `https://illuxus.com`. Never inline
 * a host here.
 *
 * NOTE: A near-identical URL builder exists in the
 * `send-event-email` edge function (Deno). When the shape of the
 * URL changes here, mirror the change in
 * `supabase/functions/send-event-email/_attendee-link.ts` so both
 * paths produce identical URLs.
 */

export interface AttendeeLinkUtm {
  /** utm_source — "email" | "whatsapp" | "sms" | "social" | "qr" | "manual" | string */
  source?: string;
  /** utm_medium — "transactional" | "broadcast" | "copy" | "csv" | string */
  medium?: string;
  /** utm_campaign — usually the event slug */
  campaign?: string;
  /** utm_content — identifies the email template / channel variant */
  content?: string;
  /** utm_term — optional keyword */
  term?: string;
}

export interface AttendeeLinkInput {
  /** Registration row — must include `join_token`. */
  registration: { join_token: string; event_id?: string; id?: string };
  /** Event used to compute the base public URL. Same shape `eventPublicUrl()` expects. */
  event: { id: string; slug?: string | null };
  /** Optional org handle. Reserved for future use; the `/e/:id/live` route is org-agnostic today. */
  orgHandle?: string | null;
  utm?: AttendeeLinkUtm;
}

/**
 * Build the per-attendee join URL for the live webinar page,
 * with optional UTM tags.
 *
 * We use the short `/e/<slugOrId>/live` form for cleaner sharing
 * (the route is registered in `App.tsx`). The `?join=<token>`
 * query param is always present and always the registration's
 * raw 64-char hex token — never URL-encoded twice.
 *
 * UTM params are appended only when their value is a non-empty
 * string, so a URL never carries empty utm_* keys.
 */
export function buildAttendeeJoinUrl(input: AttendeeLinkInput): string {
  const slugOrId = (input.event.slug && input.event.slug.length > 0)
    ? input.event.slug
    : input.event.id;
  const base = `${publicOrigin()}/e/${slugOrId}/live`;
  const params = new URLSearchParams();
  // `join` first so it's always the leading param in the resulting URL —
  // makes manual debugging / logs easier to scan.
  params.set("join", input.registration.join_token);
  const utm = input.utm ?? {};
  if (typeof utm.source === "string"   && utm.source.length   > 0) params.set("utm_source",   utm.source);
  if (typeof utm.medium === "string"   && utm.medium.length   > 0) params.set("utm_medium",   utm.medium);
  if (typeof utm.campaign === "string" && utm.campaign.length > 0) params.set("utm_campaign", utm.campaign);
  if (typeof utm.content === "string"  && utm.content.length  > 0) params.set("utm_content",  utm.content);
  if (typeof utm.term === "string"     && utm.term.length     > 0) params.set("utm_term",     utm.term);
  return `${base}?${params.toString()}`;
}

/**
 * Build CSV rows for bulk export of attendee join links.
 * Each row is `Name,Email,Join URL` with RFC-4180 quoting when a
 * field contains `"`, `,` or newlines.
 */
export function attendeeLinksToCsv(
  rows: ReadonlyArray<{ name: string; email: string; joinUrl: string }>,
): string {
  const header = "Name,Email,Join URL";
  const safe = (s: string): string => {
    const v = s ?? "";
    return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const lines = rows.map((r) => [safe(r.name), safe(r.email), safe(r.joinUrl)].join(","));
  return [header, ...lines].join("\n");
}

/**
 * Resolve the public origin for shareable URLs. Mirrors the
 * resolution strategy in `event-routes.ts` so a join URL and an
 * event page URL always share a host.
 */
function publicOrigin(): string {
  const env = (key: string): string => {
    // `import.meta.env` is a Vite construct; cast through `unknown`
    // so this file also compiles cleanly under stricter type checks.
    const m = import.meta as unknown as { env?: Record<string, string | undefined> };
    return (m.env?.[key] ?? "").toString().trim();
  };
  const custom = env("VITE_PUBLIC_DOMAIN")
    || env("VITE_PUBLIC_PUBLISHED_HOST")
    || env("VITE_PUBLIC_ORIGIN");
  if (custom) {
    return custom.startsWith("http") ? custom.replace(/\/+$/, "") : `https://${custom}`;
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, "");
  }
  return "https://illuxus.com";
}
