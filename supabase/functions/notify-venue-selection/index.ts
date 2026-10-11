/**
 * notify-venue-selection
 *
 * Fires when an organizer picks a venue from the marketplace during
 * event setup. Emails the vendor's owner(s) with everything they need
 * to decide: which venue is being requested (a vendor may operate
 * several), what the event is, who's organising, and the event banner
 * so the pitch feels first-class.
 *
 * Request body (any subset works — anything not passed is fetched via
 * the selection lookup):
 *   {
 *     selection_id?: string,   // recommended — single source of truth
 *     event_id?:     string,
 *     vendor_id?:    string,
 *     venue_id?:     string,   // migration 036 column
 *   }
 *
 * At minimum, either `selection_id` OR (`event_id` + `vendor_id`) must
 * be provided.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  defaultFromAddress,
  sendViaSmtp,
  smtpConfigured,
  textToHtml,
} from "../_shared/smtp.ts";
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
        {
          ok: false,
          error:
            "SMTP not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM in Supabase secrets.",
        },
        { status: 500, cors },
      );
    }

    const body = await req.json().catch(() => ({}));
    let {
      event_id,
      vendor_id,
      venue_id,
      selection_id,
    }: {
      event_id?: string;
      vendor_id?: string;
      venue_id?: string;
      selection_id?: string;
    } = body ?? {};

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ─── Resolve the selection row so every downstream fetch can key
    // off the same source of truth, even when the caller only passed a
    // subset of ids. ────────────────────────────────────────────────
    if (selection_id) {
      const { data: sel } = await supabase
        .from("event_venue_selections")
        .select("event_id, vendor_id, venue_id")
        .eq("id", selection_id)
        .maybeSingle();
      if (sel) {
        event_id  = event_id  ?? sel.event_id;
        vendor_id = vendor_id ?? sel.vendor_id;
        venue_id  = venue_id  ?? sel.venue_id ?? undefined;
      }
    }

    if (!event_id || !vendor_id) {
      return corsJson(
        { ok: false, error: "event_id and vendor_id are required (directly or via selection_id)" },
        { status: 400, cors },
      );
    }

    // ─── Event + banner + org ───────────────────────────────────────
    const { data: event, error: eventErr } = await supabase
      .from("events")
      .select(
        "id, title, date, end_date, venue, location, capacity, timezone, user_id, org_id, banner_landscape_url, banner_portrait_url, slug, description",
      )
      .eq("id", event_id)
      .maybeSingle();
    if (eventErr || !event) {
      return corsJson({ ok: false, error: "Event not found" }, { status: 404, cors });
    }

    // ─── Vendor + owner emails ──────────────────────────────────────
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
        { ok: true, skipped: "Vendor has notifications disabled" },
        { cors },
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

    // ─── The specific venue being requested (multi-venue vendors) ──
    // Falls back to the vendor's business name when the pre-migration-
    // 036 client didn't send a venue_id.
    let venueName = vendor.business_name;
    let venueSpaceType: string | null = null;
    if (venue_id) {
      const { data: venue } = await supabase
        .from("venues")
        .select("name, space_type")
        .eq("id", venue_id)
        .maybeSingle();
      if (venue?.name) {
        venueName = venue.name;
        venueSpaceType = venue.space_type;
      }
    }

    // ─── Organizer identity for the "requested by" line + reply-to ─
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

    // ─── Build the email ────────────────────────────────────────────
    const bannerUrl = event.banner_landscape_url ?? event.banner_portrait_url ?? null;
    const eventDate = event.date ? new Date(event.date) : null;
    const dateStr = eventDate
      ? eventDate.toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "TBD";
    const spaceLabel = venueSpaceType
      ? venueSpaceType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      : null;

    const subject = `${orgName} wants to book ${venueName} for "${event.title}"`;

    const text = [
      `Hi ${vendor.business_name} team,`,
      "",
      `${organizerName} from ${orgName} has selected ${venueName} for an upcoming event on Illuxus.`,
      "",
      "── Event details ──",
      `Event:       ${event.title}`,
      `Organised by: ${orgName}`,
      `Date:        ${dateStr}`,
      event.capacity ? `Capacity:    ${event.capacity} attendees` : "",
      event.location ? `Location:    ${event.location}` : "",
      "",
      "── Requested venue ──",
      `${venueName}${spaceLabel ? ` (${spaceLabel})` : ""}`,
      "",
      "Log in to your vendor dashboard to review and respond:",
      `    ${VENDOR_PORTAL_URL}`,
      "",
      "Reply directly to this email to reach the organizer.",
      "",
      "— Illuxus",
    ]
      .filter(Boolean)
      .join("\n");

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

        <div style="background: #eff6ff; color: #1e40af; padding: 6px 12px; border-radius: 999px; display: inline-block; font-size: 12px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;">
          New venue request
        </div>

        <h1 style="font-size: 22px; font-weight: 700; margin: 12px 0 4px;">
          ${escapeHtml(orgName)} wants to book ${escapeHtml(venueName)}
        </h1>
        <p style="color: #6b7280; font-size: 13px; margin: 0 0 24px;">for ${escapeHtml(event.title)}</p>

        <p style="font-size: 14px; line-height: 1.6; color: #374151; margin: 0 0 20px;">
          Hi <strong>${escapeHtml(vendor.business_name)}</strong> team,
        </p>
        <p style="font-size: 14px; line-height: 1.6; color: #374151; margin: 0 0 20px;">
          <strong>${escapeHtml(organizerName)}</strong> from
          <strong>${escapeHtml(orgName)}</strong> has selected
          <strong>${escapeHtml(venueName)}</strong>${spaceLabel ? ` <span style="color:#6b7280;">(${escapeHtml(spaceLabel)})</span>` : ""}
          for an upcoming event and would like to connect.
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

        <div style="background: #ecfeff; border-left: 4px solid #06b6d4; border-radius: 8px; padding: 16px 20px; margin: 0 0 24px;">
          <p style="text-transform: uppercase; letter-spacing: 0.05em; font-size: 11px; color: #0e7490; margin: 0 0 6px;">Requested venue</p>
          <p style="margin: 0; font-size: 15px; font-weight: 600; color: #111827;">
            ${escapeHtml(venueName)}
            ${spaceLabel ? `<span style="color: #6b7280; font-weight: 400; font-size: 13px;"> · ${escapeHtml(spaceLabel)}</span>` : ""}
          </p>
          <p style="margin: 4px 0 0; font-size: 12px; color: #0e7490;">
            One of your listed venues. Open your dashboard to see the exact space they want.
          </p>
        </div>

        <p style="margin: 0 0 24px;">
          <a href="${escapeAttr(VENDOR_PORTAL_URL)}"
             style="display: inline-block; background: #111827; color: #fff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">
            Open Vendor Dashboard
          </a>
        </p>

        <p style="font-size: 13px; line-height: 1.6; color: #6b7280; margin: 0 0 8px;">
          Reply directly to this email to reach the organizer.
        </p>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="font-size: 12px; color: #9ca3af; margin: 0;">Illuxus · Selection ID: ${escapeHtml(selection_id ?? "n/a")}</p>
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

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
