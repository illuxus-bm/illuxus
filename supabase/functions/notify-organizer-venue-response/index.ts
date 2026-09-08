/**
 * notify-organizer-venue-response
 *
 * Fired by the `trg_event_venue_selections_notify` Postgres trigger
 * whenever a vendor accepts or declines a venue request. Emails the
 * organizer (the person who created the event) with the outcome. Also
 * safe to invoke directly from clients as a retry-friendly fallback —
 * the function is idempotent for a given (selection_id, status) pair.
 *
 * Enriched in v2 (migrations 032 / 036) to include the event banner
 * and the specific venue name the organizer requested, so a vendor
 * with multiple venues sends confirmations that read "Grand Ballroom
 * confirmed for …" instead of just "Bizmillennium confirmed for …".
 *
 * Request body:
 *   {
 *     selection_id: string,   // event_venue_selections.id (required)
 *     event_id?: string,      // for audit; resolved from selection too
 *     vendor_id?: string,
 *     status: "accepted" | "declined",
 *     previous_status?: string,
 *     notes?: string | null,
 *   }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  defaultFromAddress,
  sendViaSmtp,
  smtpConfigured,
  textToHtml,
} from "../_shared/smtp.ts";
import { buildCorsHeaders, corsJson, handlePreflight } from "../_shared/cors.ts";

const ORGANIZER_DASHBOARD_URL =
  Deno.env.get("ORGANIZER_DASHBOARD_URL") ??
  Deno.env.get("VITE_PUBLIC_DOMAIN") ??
  "https://illuxus.com";

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflight = handlePreflight(req, cors);
  if (preflight) return preflight;

  try {
    if (!smtpConfigured()) {
      return corsJson(
        {
          ok: false,
          error:
            "SMTP not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM in Supabase secrets.",
        },
        { status: 500, cors },
      );
    }

    const body = await req.json().catch(() => ({}));
    const {
      selection_id,
      status,
      notes,
    }: {
      selection_id?: string;
      status?: "accepted" | "declined";
      notes?: string | null;
    } = body ?? {};

    if (!selection_id || !status) {
      return corsJson(
        { ok: false, error: "selection_id and status are required" },
        { status: 400, cors },
      );
    }
    if (status !== "accepted" && status !== "declined") {
      return corsJson(
        { ok: false, error: `unsupported status "${status}"` },
        { status: 400, cors },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ─── Selection + event + vendor + venue in one round-trip ───────
    // `venue` (post-migration 036) is optional — old selections had no
    // venue_id and will render with just the vendor's business name.
    const { data: selection, error: selErr } = await supabase
      .from("event_venue_selections")
      .select(
        `
          id, event_id, vendor_id, venue_id, status, notes, selected_by, responded_at,
          event:events (
            id, title, date, end_date, venue, location, capacity, user_id, org_id, slug,
            banner_landscape_url, banner_portrait_url
          ),
          vendor:vendors (
            id, business_name, city, country, logo_url
          ),
          venue:venues (
            id, name, space_type
          )
        `,
      )
      .eq("id", selection_id)
      .maybeSingle();

    if (selErr || !selection) {
      return corsJson(
        { ok: false, error: "Selection not found" },
        { status: 404, cors },
      );
    }

    // Guard against out-of-order trigger retries: skip if the row moved
    // on to a different status already.
    if (selection.status !== status) {
      return corsJson(
        { ok: true, skipped: `current status is ${selection.status}` },
        { cors },
      );
    }

    const event = selection.event as {
      id: string;
      title: string;
      date: string | null;
      end_date: string | null;
      venue: string | null;
      location: string | null;
      capacity: number | null;
      user_id: string;
      org_id: string | null;
      slug: string;
      banner_landscape_url: string | null;
      banner_portrait_url: string | null;
    } | null;

    const vendor = selection.vendor as {
      id: string;
      business_name: string;
      city: string | null;
      country: string | null;
      logo_url: string | null;
    } | null;

    const venue = selection.venue as {
      id: string;
      name: string;
      space_type: string | null;
    } | null;

    if (!event || !vendor) {
      return corsJson(
        { ok: false, error: "Event or vendor row missing" },
        { status: 404, cors },
      );
    }

    // ─── Organizer (recipient) email + display name ─────────────────
    const { data: usersPage } = await supabase.auth.admin.listUsers();
    const users = usersPage?.users ?? [];
    const organizer = users.find((u) => u.id === event.user_id);
    const organizerEmail = organizer?.email;
    if (!organizerEmail) {
      return corsJson(
        { ok: false, error: "Organizer email could not be resolved" },
        { status: 404, cors },
      );
    }
    const organizerName =
      (organizer?.user_metadata?.display_name as string | undefined) ??
      (organizer?.user_metadata?.first_name as string | undefined) ??
      organizerEmail.split("@")[0];

    let orgName = "Illuxus";
    if (event.org_id) {
      const { data: org } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", event.org_id)
        .maybeSingle();
      if (org?.name) orgName = org.name;
    }

    // ─── Presentational bits ────────────────────────────────────────
    const eventDate = event.date ? new Date(event.date) : null;
    const dateStr = eventDate
      ? eventDate.toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "TBD";
    const bannerUrl = event.banner_landscape_url ?? event.banner_portrait_url ?? null;
    const venueName = venue?.name ?? vendor.business_name;
    const spaceLabel = venue?.space_type
      ? venue.space_type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      : null;
    const dashboardUrl = `${ORGANIZER_DASHBOARD_URL.replace(/\/$/, "")}/dashboard/events/${
      event.slug || event.id
    }?tab=venue`;

    const accepted = status === "accepted";
    const heading = accepted
      ? `${venueName} accepted your venue request`
      : `${venueName} declined your venue request`;
    const subject = accepted
      ? `${venueName} confirmed for "${event.title}"`
      : `${venueName} declined for "${event.title}"`;

    const bodyText = [
      `Hi ${organizerName},`,
      "",
      accepted
        ? `Good news — ${venueName} (operated by ${vendor.business_name}) has accepted your request to host "${event.title}".`
        : `${venueName} (operated by ${vendor.business_name}) won't be able to host "${event.title}" on the date you selected.`,
      "",
      "── Event details ──",
      `Event:        ${event.title}`,
      `Organised by: ${orgName}`,
      `Date:         ${dateStr}`,
      event.location ? `Location:     ${event.location}` : "",
      event.capacity ? `Capacity:     ${event.capacity} attendees` : "",
      "",
      "── Venue ──",
      `${venueName}${spaceLabel ? ` (${spaceLabel})` : ""} · ${vendor.business_name}`,
      "",
      notes ? `Vendor note: ${notes}` : "",
      "",
      accepted
        ? "Head over to your dashboard to finalise the booking:"
        : "You can pick another venue from your event dashboard:",
      `  ${dashboardUrl}`,
      "",
      "— Illuxus",
    ]
      .filter(Boolean)
      .join("\n");

    const accentBg   = accepted ? "#ecfdf5" : "#fef2f2";
    const accentText = accepted ? "#065f46" : "#991b1b";
    const btnBg      = accepted ? "#059669" : "#111827";

    const html = `
      <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 16px; color: #111827;">
        ${
          bannerUrl
            ? `<img
                 src="${escapeAttr(bannerUrl)}"
                 alt="${escapeAttr(event.title)}"
                 style="width: 100%; height: auto; border-radius: 12px; margin-bottom: 24px; display: block;"
               />`
            : ""
        }

        <div style="background:${accentBg}; color:${accentText}; padding: 6px 12px; border-radius: 999px; display: inline-block; font-size: 12px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;">
          ${accepted ? "Venue confirmed" : "Venue declined"}
        </div>

        <h1 style="font-size: 22px; font-weight: 700; margin: 12px 0 4px;">
          ${escapeHtml(heading)}
        </h1>
        <p style="color: #6b7280; font-size: 13px; margin: 0 0 24px;">via Illuxus Vendor Connect</p>

        <p style="font-size: 14px; line-height: 1.6; color: #374151; margin: 0 0 20px;">
          Hi <strong>${escapeHtml(organizerName)}</strong>,
        </p>

        <p style="font-size: 14px; line-height: 1.6; color: #374151; margin: 0 0 20px;">
          ${
            accepted
              ? `Good news — <strong>${escapeHtml(venueName)}</strong>${spaceLabel ? ` <span style="color:#6b7280;">(${escapeHtml(spaceLabel)})</span>` : ""}, operated by <strong>${escapeHtml(vendor.business_name)}</strong>, has accepted your request to host <strong>${escapeHtml(event.title)}</strong>.`
              : `<strong>${escapeHtml(venueName)}</strong>, operated by <strong>${escapeHtml(vendor.business_name)}</strong>, won't be able to host <strong>${escapeHtml(event.title)}</strong> on the date you selected.`
          }
        </p>

        <div style="background: #f9fafb; border-radius: 8px; padding: 16px 20px; margin: 0 0 20px;">
          <p style="text-transform: uppercase; letter-spacing: 0.05em; font-size: 11px; color: #6b7280; margin: 0 0 8px;">Event</p>
          <table style="width: 100%; font-size: 14px; color: #111827;">
            <tr><td style="padding: 4px 0; color: #6b7280; width: 110px;">Name</td><td style="padding: 4px 0; font-weight: 600;">${escapeHtml(event.title)}</td></tr>
            <tr><td style="padding: 4px 0; color: #6b7280;">Organised by</td><td style="padding: 4px 0; font-weight: 600;">${escapeHtml(orgName)}</td></tr>
            <tr><td style="padding: 4px 0; color: #6b7280;">Date</td><td style="padding: 4px 0;">${escapeHtml(dateStr)}</td></tr>
            ${event.capacity ? `<tr><td style="padding: 4px 0; color: #6b7280;">Capacity</td><td style="padding: 4px 0;">${event.capacity} attendees</td></tr>` : ""}
            ${event.location ? `<tr><td style="padding: 4px 0; color: #6b7280;">Location</td><td style="padding: 4px 0;">${escapeHtml(event.location)}</td></tr>` : ""}
          </table>
        </div>

        <div style="background: ${accepted ? "#ecfdf5" : "#f9fafb"}; border-left: 4px solid ${accepted ? "#059669" : "#9ca3af"}; border-radius: 8px; padding: 16px 20px; margin: 0 0 24px;">
          <p style="text-transform: uppercase; letter-spacing: 0.05em; font-size: 11px; color: ${accepted ? "#047857" : "#6b7280"}; margin: 0 0 6px;">Venue</p>
          <p style="margin: 0; font-size: 15px; font-weight: 600; color: #111827;">
            ${escapeHtml(venueName)}
            ${spaceLabel ? `<span style="color: #6b7280; font-weight: 400; font-size: 13px;"> · ${escapeHtml(spaceLabel)}</span>` : ""}
          </p>
          <p style="margin: 4px 0 0; font-size: 12px; color: #6b7280;">
            Operated by ${escapeHtml(vendor.business_name)}${vendor.city ? " · " + escapeHtml(vendor.city) : ""}
          </p>
        </div>

        ${
          notes
            ? `<div style="border-left: 3px solid #e5e7eb; padding: 4px 0 4px 12px; margin: 0 0 24px; color: #4b5563; font-size: 13px; line-height: 1.6;">
                <p style="font-weight: 600; color: #111827; margin: 0 0 4px;">Note from ${escapeHtml(vendor.business_name)}</p>
                ${escapeHtml(notes)}
              </div>`
            : ""
        }

        <p style="margin: 0 0 24px;">
          <a href="${escapeAttr(dashboardUrl)}"
             style="display: inline-block; background: ${btnBg}; color: #fff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">
            ${accepted ? "Open event dashboard" : "Pick another venue"}
          </a>
        </p>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="font-size: 12px; color: #9ca3af; margin: 0;">Illuxus · Selection ID: ${escapeHtml(selection.id)}</p>
      </div>
    `;

    const from = defaultFromAddress(orgName);
    const result = await sendViaSmtp({
      from,
      to: [organizerEmail],
      subject,
      text: bodyText,
      html: html.includes("<") ? html : textToHtml(bodyText),
    });

    if (!result.ok) {
      return corsJson(
        { ok: false, error: `SMTP delivery failed: ${result.error}` },
        { status: 502, cors },
      );
    }

    // Best-effort in-app notification so the organizer sees the decision
    // inside the dashboard even when their email is delayed / filtered.
    try {
      await supabase.from("app_notifications").insert({
        user_id: event.user_id,
        type: accepted ? "venue_accepted" : "venue_declined",
        title: heading,
        body: notes
          ? `${venueName} added a note: ${notes}`
          : accepted
            ? `${venueName} confirmed for "${event.title}".`
            : `${venueName} won't be able to host "${event.title}".`,
        link: `/dashboard/events/${event.slug || event.id}?tab=venue`,
      });
    } catch {
      /* best effort */
    }

    return corsJson({ ok: true, notified: organizerEmail }, { cors });
  } catch (err) {
    return corsJson(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500, cors },
    );
  }
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
