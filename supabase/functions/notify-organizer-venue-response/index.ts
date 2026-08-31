/**
 * notify-organizer-venue-response
 *
 * Fired by the `trg_event_venue_selections_notify` Postgres trigger whenever
 * a vendor accepts or declines a venue request. Emails the organizer with
 * the outcome and a link back into the dashboard.
 *
 * Also invocable directly from clients (Illuxus dashboard, vendor-connect
 * standalone) as a fallback — the function is idempotent for a given
 * (selection_id, status) pair thanks to the `responded_at` timestamp.
 *
 * Request body:
 *   {
 *     selection_id: string,   // event_venue_selections.id
 *     event_id?: string,      // reserved for future filtering / auditing
 *     vendor_id?: string,
 *     status: "accepted" | "declined",
 *     previous_status?: string,
 *     notes?: string | null,  // vendor-supplied note (optional)
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
            "SMTP not configured. Set SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD in Supabase secrets.",
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

    // ─── Load selection + event + vendor ─────────────────────────────────
    // Deliberately a single round-trip via an embedded select. Keeps the
    // trigger fast enough that a burst of accepts/declines from a busy
    // vendor doesn't back up the connection pool.
    const { data: selection, error: selErr } = await supabase
      .from("event_venue_selections")
      .select(
        `
          id, event_id, vendor_id, status, notes, selected_by, responded_at,
          event:events (
            id, title, date, end_date, venue, location, capacity, user_id, org_id, slug
          ),
          vendor:vendors (
            id, business_name, city, country, logo_url
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

    // Defensive: don't spam if the current row status doesn't match what the
    // caller told us. Prevents late trigger retries from firing after the
    // vendor already changed their mind again.
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
    } | null;

    const vendor = selection.vendor as {
      id: string;
      business_name: string;
      city: string | null;
      country: string | null;
      logo_url: string | null;
    } | null;

    if (!event || !vendor) {
      return corsJson(
        { ok: false, error: "Event or vendor row missing" },
        { status: 404, cors },
      );
    }

    // ─── Resolve organizer email + name ──────────────────────────────────
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

    // ─── Load org name (for the From line) ───────────────────────────────
    let orgName = "Illuxus";
    if (event.org_id) {
      const { data: org } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", event.org_id)
        .maybeSingle();
      if (org?.name) orgName = org.name;
    }

    // ─── Build the email ─────────────────────────────────────────────────
    const eventDate = event.date ? new Date(event.date) : null;
    const dateStr = eventDate
      ? eventDate.toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "TBD";

    const dashboardUrl = `${ORGANIZER_DASHBOARD_URL.replace(/\/$/, "")}/dashboard/events/${
      event.slug || event.id
    }?tab=venue`;

    const accepted = status === "accepted";
    const heading = accepted
      ? `${vendor.business_name} accepted your venue request`
      : `${vendor.business_name} declined your venue request`;
    const subject = accepted
      ? `${vendor.business_name} confirmed for "${event.title}"`
      : `${vendor.business_name} declined for "${event.title}"`;

    const bodyText = [
      `Hi ${organizerName},`,
      "",
      accepted
        ? `Good news — ${vendor.business_name} has accepted your request to host "${event.title}".`
        : `${vendor.business_name} won't be able to host "${event.title}" on the date you selected.`,
      "",
      "── Event details ──",
      `Event: ${event.title}`,
      `Date:  ${dateStr}`,
      event.location ? `Location: ${event.location}` : "",
      event.capacity ? `Capacity: ${event.capacity} attendees` : "",
      "",
      notes ? `Vendor note: ${notes}` : "",
      "",
      accepted
        ? `Head over to your dashboard to finalise the booking:`
        : `You can pick another venue from your event dashboard:`,
      `  ${dashboardUrl}`,
      "",
      "— Illuxus",
    ]
      .filter(Boolean)
      .join("\n");

    const accentBg = accepted ? "#ecfdf5" : "#fef2f2";
    const accentText = accepted ? "#065f46" : "#991b1b";
    const btnBg = accepted ? "#059669" : "#111827";

    const html = `
      <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 16px; color: #111827;">
        <div style="background:${accentBg}; color:${accentText}; padding: 6px 12px; border-radius: 999px; display:inline-block; font-size: 12px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;">
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
              ? `Good news — <strong>${escapeHtml(vendor.business_name)}</strong> has accepted your request to host <strong>${escapeHtml(event.title)}</strong>.`
              : `<strong>${escapeHtml(vendor.business_name)}</strong> won't be able to host <strong>${escapeHtml(event.title)}</strong> on the date you selected.`
          }
        </p>

        <div style="background: #f9fafb; border-radius: 8px; padding: 16px 20px; margin: 0 0 24px;">
          <table style="width: 100%; font-size: 14px; color: #111827;">
            <tr><td style="padding: 4px 0; color: #6b7280; width: 90px;">Event</td><td style="padding: 4px 0; font-weight: 600;">${escapeHtml(event.title)}</td></tr>
            <tr><td style="padding: 4px 0; color: #6b7280;">Date</td><td style="padding: 4px 0;">${escapeHtml(dateStr)}</td></tr>
            ${event.capacity ? `<tr><td style="padding: 4px 0; color: #6b7280;">Capacity</td><td style="padding: 4px 0;">${event.capacity} attendees</td></tr>` : ""}
            ${event.location ? `<tr><td style="padding: 4px 0; color: #6b7280;">Location</td><td style="padding: 4px 0;">${escapeHtml(event.location)}</td></tr>` : ""}
            <tr><td style="padding: 4px 0; color: #6b7280;">Venue</td><td style="padding: 4px 0;">${escapeHtml(vendor.business_name)}${vendor.city ? " · " + escapeHtml(vendor.city) : ""}</td></tr>
          </table>
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
          <a href="${dashboardUrl}"
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
    // inside the dashboard even if their email is delayed / filtered.
    try {
      await supabase.from("app_notifications").insert({
        user_id: event.user_id,
        type: accepted ? "venue_accepted" : "venue_declined",
        title: heading,
        body: notes
          ? `${vendor.business_name} added a note: ${notes}`
          : accepted
            ? `${vendor.business_name} confirmed for "${event.title}".`
            : `${vendor.business_name} won't be able to host "${event.title}".`,
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
