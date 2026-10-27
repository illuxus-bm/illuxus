/**
 * notify-venue-selection
 *
 * Fires when an organizer requests a venue from the marketplace. Emails
 * the venue admin (the vendor's owner / manager members) with everything
 * they need to decide: which venue is being requested (a vendor may
 * operate several), the event dates and times, expected attendees, the
 * organizer's brief, the add-on services they ticked, and how to reach
 * the organizer.
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
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

// ─── Email + CORS helpers ─────────────────────────────────────────────
// Inlined on purpose instead of importing ../_shared/smtp.ts and
// ../_shared/cors.ts: this function is deployed by pasting index.ts into
// the Supabase dashboard editor, which uploads only this one file, so any
// ../_shared import fails to bundle. Keep in step with _shared/smtp.ts
// and _shared/cors.ts when those change.
//
// Secrets: SMTP_HOST, SMTP_PORT (465 SSL / 587 STARTTLS), SMTP_USERNAME,
// SMTP_PASSWORD, optional SMTP_FROM; ALLOWED_ORIGINS for extra browser
// origins (localhost dev ports and *.vercel.app are always allowed).

function smtpConfigured(): boolean {
  return !!(Deno.env.get("SMTP_HOST") && Deno.env.get("SMTP_USERNAME") && Deno.env.get("SMTP_PASSWORD"));
}

function defaultFromAddress(displayName = "Illuxus"): string {
  const explicit =
    Deno.env.get("SMTP_FROM") ?? Deno.env.get("RESEND_FROM_EMAIL") ?? Deno.env.get("RESEND_FROM");
  const from = explicit || Deno.env.get("SMTP_USERNAME") || `${displayName} <noreply@example.com>`;
  return from.includes("<") ? from : `${displayName} <${from}>`;
}

async function sendViaSmtp(payload: {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  reply_to?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const port = Number(Deno.env.get("SMTP_PORT") || "465");
  const client = new SMTPClient({
    connection: {
      hostname: Deno.env.get("SMTP_HOST")!,
      port,
      // 465 → implicit TLS. 587 / 25 → STARTTLS after EHLO.
      tls: port === 465,
      auth: {
        username: Deno.env.get("SMTP_USERNAME")!,
        password: Deno.env.get("SMTP_PASSWORD")!,
      },
    },
  });
  try {
    await client.send({
      from: payload.from,
      to: payload.to,
      subject: payload.subject,
      content: stripTrailingWhitespace(payload.text),
      html: stripTrailingWhitespace(payload.html),
      ...(payload.reply_to ? { replyTo: payload.reply_to } : {}),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err instanceof Error ? err.message : String(err)).slice(0, 500) };
  } finally {
    try { await client.close(); } catch { /* noop */ }
  }
}

/** denomailer turns a line-final space into a literal "=20" in the
 *  delivered email, so strip trailing spaces (LF or CRLF lines). */
function stripTrailingWhitespace(body: string): string {
  return body.replace(/[ \t]+(?=\r?$)/gm, "");
}

const DEV_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:8080",
  "http://localhost:8081", // illuxus-venue dev server
  "http://127.0.0.1:5173",
  "http://127.0.0.1:8080",
];

function buildCorsHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-correlation-id",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
  const strip = (s: string) => s.trim().replace(/\/$/, "");
  const allowed = new Set(DEV_ORIGINS);
  for (const o of (Deno.env.get("ALLOWED_ORIGINS") || "").split(",")) {
    if (o.trim()) allowed.add(strip(o));
  }
  for (const host of [
    Deno.env.get("PUBLIC_DOMAIN") || Deno.env.get("VITE_PUBLIC_DOMAIN"),
    Deno.env.get("PUBLIC_PUBLISHED_HOST") || Deno.env.get("VITE_PUBLIC_PUBLISHED_HOST"),
  ]) {
    if (!host?.trim()) continue;
    const h = strip(host);
    allowed.add(/^https?:\/\//.test(h) ? h : `https://${h}`);
  }
  const origin = req.headers.get("Origin") ?? "";
  const ok =
    allowed.has(strip(origin)) ||
    /^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.vercel\.app$/i.test(origin);
  headers["Access-Control-Allow-Origin"] = origin && ok ? origin : "null";
  if (origin && ok) headers["Access-Control-Allow-Credentials"] = "true";
  return headers;
}

function handlePreflight(req: Request, cors: Record<string, string>): Response | null {
  return req.method === "OPTIONS" ? new Response(null, { status: 204, headers: cors }) : null;
}

function corsJson(body: unknown, init: { status?: number; cors: Record<string, string> }): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json", ...init.cors },
  });
}

const VENDOR_PORTAL_URL =
  Deno.env.get("VENDOR_PORTAL_URL") ?? "https://vendors.illuxus.com/vendor";

interface Selection {
  id: string;
  event_id: string;
  vendor_id: string;
  venue_id: string | null;
  notes: string | null;
  selected_service_ids: string[] | null;
  event_type: string | null;
  event_duration_hours: number | null;
  expected_attendees: number | null;
  seating_capacity: number | null;
  seating_arrangement: string | null;
  needs_pre_function_area: boolean | null;
  needs_vip_area: boolean | null;
  needs_additional_rooms: boolean | null;
  venue_link: string | null;
}

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

    // ─── Resolve the selection row (brief, services, ids) ───────────
    const selectionColumns =
      "id, event_id, vendor_id, venue_id, notes, selected_service_ids, event_type, event_duration_hours, expected_attendees, seating_capacity, seating_arrangement, needs_pre_function_area, needs_vip_area, needs_additional_rooms, venue_link";
    let selection: Selection | null = null;
    if (selection_id) {
      const { data } = await supabase
        .from("event_venue_selections")
        .select(selectionColumns)
        .eq("id", selection_id)
        .maybeSingle();
      selection = data as Selection | null;
    } else if (event_id && vendor_id) {
      const { data } = await supabase
        .from("event_venue_selections")
        .select(selectionColumns)
        .eq("event_id", event_id)
        .eq("vendor_id", vendor_id)
        .maybeSingle();
      selection = data as Selection | null;
    }
    if (selection) {
      selection_id = selection.id;
      event_id = event_id ?? selection.event_id;
      vendor_id = vendor_id ?? selection.vendor_id;
      venue_id = venue_id ?? selection.venue_id ?? undefined;
    }

    if (!event_id || !vendor_id) {
      return corsJson(
        { ok: false, error: "event_id and vendor_id are required (directly or via selection_id)" },
        { status: 400, cors },
      );
    }

    // ─── Event + org ────────────────────────────────────────────────
    const { data: event, error: eventErr } = await supabase
      .from("events")
      .select(
        "id, title, date, end_date, venue, location, capacity, timezone, event_format, user_id, org_id, banner_landscape_url, banner_portrait_url, description",
      )
      .eq("id", event_id)
      .maybeSingle();
    if (eventErr || !event) {
      return corsJson({ ok: false, error: "Event not found" }, { status: 404, cors });
    }

    // ─── Vendor + venue-admin emails ────────────────────────────────
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
      .map((m) => m.user_id as string);
    // Looked up one by one: listUsers() only returns the first page of
    // users, which silently missed the venue admin once the shared auth
    // table grew past it.
    const recipientEmails = (await Promise.all(ownerIds.map((id) => userEmail(supabase, id))))
      .filter((e): e is string => !!e);
    if (recipientEmails.length === 0) {
      return corsJson(
        { ok: false, error: "Could not resolve the venue admin's email" },
        { status: 404, cors },
      );
    }

    // ─── The specific venue being requested ─────────────────────────
    let venueName = vendor.business_name as string;
    let venueSpaceType: string | null = null;
    let venueCity: string | null = null;
    if (venue_id) {
      const { data: venue } = await supabase
        .from("venues")
        .select("name, space_type, city")
        .eq("id", venue_id)
        .maybeSingle();
      if (venue?.name) {
        venueName = venue.name;
        venueSpaceType = venue.space_type;
        venueCity = venue.city ?? null;
      }
    }

    // ─── Requested add-on services ──────────────────────────────────
    const serviceIds = selection?.selected_service_ids ?? [];
    let services: Array<{ title: string; category: string | null }> = [];
    if (serviceIds.length > 0) {
      const { data } = await supabase
        .from("vendor_services")
        .select("title, category")
        .in("id", serviceIds);
      services = (data ?? []) as typeof services;
    }

    // ─── Organizer identity + contact ───────────────────────────────
    const { data: organizerRes } = await supabase.auth.admin.getUserById(event.user_id);
    const organizerUser = organizerRes?.user ?? null;
    const organizerEmail = organizerUser?.email ?? null;
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, first_name, last_name, mobile_country_code, mobile_number")
      .eq("user_id", event.user_id)
      .maybeSingle();
    const organizerName =
      profile?.display_name ||
      [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
      (organizerUser?.user_metadata?.display_name as string | undefined) ||
      organizerEmail?.split("@")[0] ||
      "An Illuxus organizer";
    const organizerPhone = profile?.mobile_number
      ? [profile.mobile_country_code, profile.mobile_number].filter(Boolean).join(" ")
      : null;

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
    const when = formatWhen(event.date, event.end_date, event.timezone);
    const spaceLabel = venueSpaceType ? titleCase(venueSpaceType) : null;
    const attendees = selection?.expected_attendees ?? event.capacity ?? null;

    // Ordered [label, value] rows; empty values are dropped so a sparse
    // brief doesn't render blank lines.
    const eventRows: Array<[string, string | null]> = [
      ["Event", event.title],
      ["Organised by", orgName],
      ["Dates", when.dates],
      ["Time", when.time],
      ["Duration", selection?.event_duration_hours != null ? `${selection.event_duration_hours} hours` : null],
      ["Event type", selection?.event_type ?? null],
      ["Format", event.event_format ? titleCase(event.event_format) : null],
      ["Attendees", attendees != null ? `${attendees.toLocaleString("en-IN")} people` : null],
      ["Seats needed", selection?.seating_capacity != null ? selection.seating_capacity.toLocaleString("en-IN") : null],
      ["Seating layout", selection?.seating_arrangement ?? null],
      ["Location", event.location ?? null],
    ];
    const needs = [
      selection?.needs_pre_function_area ? "Pre-function area" : null,
      selection?.needs_vip_area ? "VIP area" : null,
      selection?.needs_additional_rooms ? "Additional rooms" : null,
    ].filter((n): n is string => !!n);
    const contactRows: Array<[string, string | null]> = [
      ["Name", organizerName],
      ["Email", organizerEmail],
      ["Phone", organizerPhone],
    ];

    const subject = `New venue request: ${venueName} for "${event.title}" (${when.dates})`;

    const text = [
      `Hi ${vendor.business_name} team,`,
      "",
      `${organizerName} from ${orgName} has requested ${venueName}${spaceLabel ? ` (${spaceLabel})` : ""} for an upcoming event.`,
      "",
      "── Event details ──",
      ...rowsToText(eventRows),
      needs.length ? `Also needs:   ${needs.join(", ")}` : "",
      "",
      services.length ? "── Requested services ──" : "",
      ...services.map((s) => `• ${s.title}`),
      selection?.notes ? `── Note from the organizer ──\n${selection.notes}` : "",
      "── Organizer contact ──",
      ...rowsToText(contactRows),
      "",
      "Accept or decline from your venue dashboard:",
      `    ${VENDOR_PORTAL_URL}`,
      "",
      "Reply directly to this email to reach the organizer.",
      "",
      "— Illuxus",
    ]
      .filter((line) => line !== "")
      .join("\n");

    const html = `
      <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 16px; color: #111827;">
        ${
          bannerUrl
            ? `<img src="${escapeHtml(bannerUrl)}" alt="${escapeHtml(event.title)}"
                 style="width: 100%; height: auto; border-radius: 12px; margin-bottom: 24px; display: block;" />`
            : ""
        }

        <div style="background: #eff6ff; color: #1e40af; padding: 6px 12px; border-radius: 999px; display: inline-block; font-size: 12px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;">
          New venue request
        </div>

        <h1 style="font-size: 22px; font-weight: 700; margin: 12px 0 4px;">
          ${escapeHtml(orgName)} wants to book ${escapeHtml(venueName)}
        </h1>
        <p style="color: #6b7280; font-size: 13px; margin: 0 0 24px;">
          ${escapeHtml(event.title)} · ${escapeHtml(when.dates)}
        </p>

        <div style="background: #ecfeff; border-left: 4px solid #06b6d4; border-radius: 8px; padding: 16px 20px; margin: 0 0 20px;">
          <p style="text-transform: uppercase; letter-spacing: 0.05em; font-size: 11px; color: #0e7490; margin: 0 0 6px;">Requested venue</p>
          <p style="margin: 0; font-size: 15px; font-weight: 600;">
            ${escapeHtml(venueName)}
            ${spaceLabel ? `<span style="color: #6b7280; font-weight: 400; font-size: 13px;"> · ${escapeHtml(spaceLabel)}</span>` : ""}
            ${venueCity ? `<span style="color: #6b7280; font-weight: 400; font-size: 13px;"> · ${escapeHtml(venueCity)}</span>` : ""}
          </p>
        </div>

        ${section("Event details", rowsToHtml(eventRows))}

        ${
          needs.length
            ? section("Also needs", `<p style="margin: 0; font-size: 14px;">${needs.map(escapeHtml).join(" · ")}</p>`)
            : ""
        }

        ${
          services.length
            ? section(
                "Requested services",
                `<ul style="margin: 0; padding-left: 18px; font-size: 14px; line-height: 1.7;">${services
                  .map((s) => `<li>${escapeHtml(s.title)}</li>`)
                  .join("")}</ul>`,
              )
            : ""
        }

        ${
          selection?.notes
            ? section(
                "Note from the organizer",
                `<p style="margin: 0; font-size: 14px; line-height: 1.6; white-space: pre-line;">${escapeHtml(selection.notes)}</p>`,
              )
            : ""
        }

        ${section("Organizer contact", rowsToHtml(contactRows))}

        <p style="margin: 8px 0 24px;">
          <a href="${escapeHtml(VENDOR_PORTAL_URL)}"
             style="display: inline-block; background: #111827; color: #fff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">
            Review and respond
          </a>
        </p>

        <p style="font-size: 13px; line-height: 1.6; color: #6b7280; margin: 0 0 8px;">
          Reply directly to this email to reach the organizer.
        </p>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="font-size: 12px; color: #9ca3af; margin: 0;">Illuxus · Request ID: ${escapeHtml(selection_id ?? "n/a")}</p>
      </div>
    `;

    const result = await sendViaSmtp({
      from: defaultFromAddress("Illuxus Venues"),
      to: recipientEmails,
      subject,
      text,
      html,
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

// ─── Helpers ──────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function userEmail(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase.auth.admin.getUserById(userId);
  return data?.user?.email ?? null;
}

/** Dates as "Friday, 20 November 2026" or "20 – 22 November 2026", and
 *  the start–end time, in the event's timezone (IST when unset). */
function formatWhen(
  start: string | null,
  end: string | null,
  timezone: string | null,
): { dates: string; time: string | null } {
  if (!start) return { dates: "Date to be confirmed", time: null };
  const tz = validTimezone(timezone) ?? "Asia/Kolkata";
  const s = new Date(start);
  const e = end ? new Date(end) : null;
  const day = (d: Date, opts: Intl.DateTimeFormatOptions) =>
    d.toLocaleDateString("en-IN", { timeZone: tz, ...opts });
  const clock = (d: Date) =>
    d.toLocaleTimeString("en-IN", { timeZone: tz, hour: "numeric", minute: "2-digit" });

  const full: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long", year: "numeric" };
  const sameDay = !e || day(s, full) === day(e, full);
  const dates = sameDay
    ? day(s, full)
    : `${day(s, { weekday: "short", day: "numeric", month: "short" })} – ${day(e!, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}`;
  const time = e ? `${clock(s)} – ${clock(e)} (${tz})` : `${clock(s)} (${tz})`;
  return { dates, time };
}

function validTimezone(tz: string | null): string | null {
  if (!tz) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function rowsToText(rows: Array<[string, string | null]>): string[] {
  return rows
    .filter(([, v]) => v)
    .map(([k, v]) => `${(k + ":").padEnd(15)}${v}`);
}

function rowsToHtml(rows: Array<[string, string | null]>): string {
  return `<table style="width: 100%; font-size: 14px; color: #111827; border-collapse: collapse;">${rows
    .filter(([, v]) => v)
    .map(
      ([k, v]) =>
        `<tr><td style="padding: 4px 0; color: #6b7280; width: 130px; vertical-align: top;">${escapeHtml(k)}</td><td style="padding: 4px 0;">${escapeHtml(v!)}</td></tr>`,
    )
    .join("")}</table>`;
}

function section(title: string, inner: string): string {
  return `
    <div style="background: #f9fafb; border-radius: 8px; padding: 16px 20px; margin: 0 0 16px;">
      <p style="text-transform: uppercase; letter-spacing: 0.05em; font-size: 11px; color: #6b7280; margin: 0 0 8px;">${escapeHtml(title)}</p>
      ${inner}
    </div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
