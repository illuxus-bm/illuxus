/**
 * notify-venue-selection
 *
 * Fired when an organizer picks a venue from the vendor marketplace during
 * event setup. Looks up the vendor's owner email through vendor_members →
 * auth.users, then sends a notification via the shared SMTP helper.
 *
 * Email includes:
 *   - Event title, date, expected attendee count
 *   - Organizer name + org name
 *   - Reply-to organizer email
 *   - Deep link back to vendor-connect-standalone Inbox
 *
 * Request body:
 *   { event_id: string, vendor_id: string, selection_id?: string }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { defaultFromAddress, sendViaSmtp, smtpConfigured, textToHtml } from "../_shared/smtp.ts";
import { buildCorsHeaders, corsJson, handlePreflight } from "../_shared/cors.ts";

const VENDOR_PORTAL_URL =
  Deno.env.get("VENDOR_PORTAL_URL") ?? "https://vendors.illuxus.com/vendor";

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflight = handlePreflight(req, cors);
  if (preflight) return preflight;

  try {
    if (!smtpConfigured()) {
      return corsJson(
        { ok: false, error: "SMTP not configured. Set SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD in Supabase secrets." },
        { status: 500, cors },
      );
    }

    const { event_id, vendor_id, selection_id } = await req.json().catch(() => ({}));
    if (!event_id || !vendor_id) {
      return corsJson(
        { ok: false, error: "event_id and vendor_id are required" },
        { status: 400, cors },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ─── Load event + org details ─────────────────────────────────────────
    const { data: event, error: eventErr } = await supabase
      .from("events")
      .select("id, title, date, end_date, venue, location, capacity, timezone, user_id, org_id")
      .eq("id", event_id)
      .maybeSingle();
    if (eventErr || !event) {
      return corsJson({ ok: false, error: "Event not found" }, { status: 404, cors });
    }

    // ─── Load vendor + owner email ────────────────────────────────────────
    const { data: vendor, error: vendorErr } = await supabase
      .from("vendors")
      .select("id, business_name, notify_email")
      .eq("id", vendor_id)
      .maybeSingle();
    if (vendorErr || !vendor) {
      return corsJson({ ok: false, error: "Vendor not found" }, { status: 404, cors });
    }
    if (!vendor.notify_email) {
      return corsJson(
        { ok: false, error: "Vendor has notifications disabled" },
        { status: 200, cors },
      );
    }

    const { data: members } = await supabase
      .from("vendor_members")
      .select("user_id, role")
      .eq("vendor_id", vendor_id);

    const ownerIds = (members ?? [])
      .filter((m) => m.role === "owner" || m.role === "manager")
      .map((m) => m.user_id);

    if (ownerIds.length === 0) {
      return corsJson(
        { ok: false, error: "Vendor has no owner/manager members to notify" },
        { status: 404, cors },
      );
    }

    // ─── Resolve emails via auth admin API ────────────────────────────────
    const { data: usersPage } = await supabase.auth.admin.listUsers();
    const users = usersPage?.users ?? [];
    const recipientEmails = ownerIds
      .map((uid) => users.find((u) => u.id === uid)?.email)
      .filter((e): e is string => typeof e === "string" && e.length > 0);

    if (recipientEmails.length === 0) {
      return corsJson(
        { ok: false, error: "Could not resolve vendor owner emails" },
        { status: 404, cors },
      );
    }

    // ─── Load organizer info for reply-to ─────────────────────────────────
    const organizerUser = users.find((u) => u.id === event.user_id);
    const organizerEmail = organizerUser?.email ?? null;
    const organizerName =
      (organizerUser?.user_metadata?.display_name as string | undefined) ??
      (organizerUser?.user_metadata?.first_name as string | undefined) ??
      organizerEmail?.split("@")[0] ??
      "An Illuxus organizer";

    let orgName = "Illuxus";
    if (event.org_id) {
      const { data: org } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", event.org_id)
        .maybeSingle();
      if (org?.name) orgName = org.name;
    }

    // ─── Build email ──────────────────────────────────────────────────────
    const eventDate = event.date ? new Date(event.date) : null;
    const dateStr = eventDate
      ? eventDate.toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "TBD";

    const subject = `${orgName} would like to book ${vendor.business_name} for "${event.title}"`;

    const text = [
      `Hi ${vendor.business_name} team,`,
      "",
      `${organizerName} from ${orgName} has selected your venue for an upcoming event on Illuxus.`,
      "",
      "── Event details ──",
      `Event:       ${event.title}`,
      `Date:        ${dateStr}`,
      event.capacity ? `Capacity:    ${event.capacity} attendees` : "",
      event.location ? `Location:    ${event.location}` : "",
      "",
      `Please log in to your vendor dashboard to review and respond:`,
      `    ${VENDOR_PORTAL_URL}`,
      "",
      "You can reply directly to this email to reach the organizer.",
      "",
      "— Illuxus",
    ]
      .filter(Boolean)
      .join("\n");

    const html = `
      <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 16px; color: #111827;">
        <h1 style="font-size: 20px; font-weight: 700; margin: 0 0 4px;">You've been selected as a venue!</h1>
        <p style="color: #6b7280; font-size: 13px; margin: 0 0 24px;">via Illuxus Vendor Connect</p>

        <p style="font-size: 14px; line-height: 1.6; color: #374151; margin: 0 0 20px;">
          Hi <strong>${vendor.business_name}</strong> team,
        </p>

        <p style="font-size: 14px; line-height: 1.6; color: #374151; margin: 0 0 20px;">
          <strong>${escapeHtml(organizerName)}</strong> from <strong>${escapeHtml(orgName)}</strong>
          has selected your venue for an upcoming event on Illuxus and would like to connect.
        </p>

        <div style="background: #f9fafb; border-radius: 8px; padding: 16px 20px; margin: 0 0 24px;">
          <table style="width: 100%; font-size: 14px; color: #111827;">
            <tr><td style="padding: 4px 0; color: #6b7280; width: 90px;">Event</td><td style="padding: 4px 0; font-weight: 600;">${escapeHtml(event.title)}</td></tr>
            <tr><td style="padding: 4px 0; color: #6b7280;">Date</td><td style="padding: 4px 0;">${escapeHtml(dateStr)}</td></tr>
            ${event.capacity ? `<tr><td style="padding: 4px 0; color: #6b7280;">Capacity</td><td style="padding: 4px 0;">${event.capacity} attendees</td></tr>` : ""}
            ${event.location ? `<tr><td style="padding: 4px 0; color: #6b7280;">Location</td><td style="padding: 4px 0;">${escapeHtml(event.location)}</td></tr>` : ""}
          </table>
        </div>

        <p style="margin: 0 0 24px;">
          <a href="${VENDOR_PORTAL_URL}"
             style="display: inline-block; background: #111827; color: #fff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">
            Open Vendor Dashboard
          </a>
        </p>

        <p style="font-size: 13px; line-height: 1.6; color: #6b7280; margin: 0 0 8px;">
          Reply directly to this email to reach the organizer.
        </p>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="font-size: 12px; color: #9ca3af; margin: 0;">Illuxus · Selection ID: ${selection_id ?? "n/a"}</p>
      </div>
    `;

    const from = defaultFromAddress(orgName);
    const result = await sendViaSmtp({
      from,
      to: recipientEmails,
      subject,
      text,
      html: html.includes("<") ? html : textToHtml(text),
      ...(organizerEmail ? { reply_to: organizerEmail } : {}),
    });

    if (!result.ok) {
      return corsJson(
        { ok: false, error: `SMTP delivery failed: ${result.error}` },
        { status: 502, cors },
      );
    }

    // Update notified_at if selection_id was passed
    if (selection_id) {
      await supabase
        .from("event_venue_selections")
        .update({ notified_at: new Date().toISOString() })
        .eq("id", selection_id);
    }

    return corsJson({ ok: true, notified: recipientEmails.length }, { cors });
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
