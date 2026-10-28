// GENERATED from ./index.ts by scripts/build-dashboard-functions.mjs — do not edit.
// Paste this whole file into the Supabase Dashboard editor for `notify-venue-selection` and Deploy.
// Re-generate after changing index.ts or ../_shared: npm run functions:inline

// supabase/functions/notify-venue-selection/index.ts
import { createClient as createClient2 } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

// supabase/functions/_shared/auth.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
function tokenClaims(token) {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(payload.padEnd(payload.length + (4 - payload.length % 4) % 4, "=")));
  } catch {
    return {};
  }
}
function tokenAal(token) {
  const aal = tokenClaims(token).aal;
  return typeof aal === "string" ? aal : null;
}
var bearer = (req) => (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
async function isServiceCall(req) {
  const token = bearer(req);
  if (!token) return false;
  const own = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (own && token === own) return true;
  const looksService = token.startsWith("sb_secret_") || tokenClaims(token).role === "service_role";
  if (!looksService) return false;
  try {
    const probe = createClient(Deno.env.get("SUPABASE_URL"), token, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await probe.auth.admin.listUsers({ page: 1, perPage: 1 });
    return !error;
  } catch {
    return false;
  }
}
async function resolveCaller(req, admin) {
  if (await isServiceCall(req)) return { kind: "service" };
  const user = await getCallerUser(req, admin);
  return user ? { kind: "user", user } : null;
}
function sessionMeetsTwoFactor(user, token) {
  const hasFactor = (user.factors ?? []).some((f) => f.status === "verified");
  return !hasFactor || tokenAal(token) === "aal2";
}
async function getCallerUser(req, admin) {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  try {
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user) return null;
    if (!sessionMeetsTwoFactor(data.user, token)) return null;
    return data.user;
  } catch {
    return null;
  }
}
async function isPlatformAdmin(admin, userId) {
  const { data } = await admin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  return !!data;
}
async function getManagedEvent(admin, userId, eventId) {
  const { data: ev } = await admin.from("events").select("id, user_id, org_id, title").eq("id", eventId).maybeSingle();
  const event = ev;
  if (!event) return null;
  if (event.user_id === userId) return event;
  if (event.org_id) {
    const [{ data: org }, { data: member }] = await Promise.all([
      admin.from("organizations").select("owner_id").eq("id", event.org_id).maybeSingle(),
      admin.from("org_members").select("role").eq("org_id", event.org_id).eq("user_id", userId).maybeSingle()
    ]);
    if (org?.owner_id === userId) return event;
    const role = member?.role;
    if (role && role !== "viewer") return event;
  }
  if (await isPlatformAdmin(admin, userId)) return event;
  return null;
}

// supabase/functions/_shared/rate-limit.ts
async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function withinLimit(admin, bucket, key, max, windowMs) {
  const keyHash = await sha256Hex(key);
  const since = new Date(Date.now() - windowMs).toISOString();
  const { count, error } = await admin.from("guest_rate_limits").select("id", { count: "exact", head: true }).eq("bucket", bucket).eq("key_hash", keyHash).gte("created_at", since);
  if (error || (count ?? 0) >= max) return false;
  const { error: insertError } = await admin.from("guest_rate_limits").insert({ bucket, key_hash: keyHash });
  return !insertError;
}

// supabase/functions/notify-venue-selection/index.ts
function smtpConfigured() {
  return !!(Deno.env.get("SMTP_HOST") && Deno.env.get("SMTP_USERNAME") && Deno.env.get("SMTP_PASSWORD"));
}
function defaultFromAddress(displayName = "Illuxus") {
  const explicit = Deno.env.get("SMTP_FROM") ?? Deno.env.get("RESEND_FROM_EMAIL") ?? Deno.env.get("RESEND_FROM");
  const from = explicit || Deno.env.get("SMTP_USERNAME") || `${displayName} <noreply@example.com>`;
  return from.includes("<") ? from : `${displayName} <${from}>`;
}
async function sendViaSmtp(payload) {
  const port = Number(Deno.env.get("SMTP_PORT") || "465");
  const client = new SMTPClient({
    connection: {
      hostname: Deno.env.get("SMTP_HOST"),
      port,
      // 465 → implicit TLS. 587 / 25 → STARTTLS after EHLO.
      tls: port === 465,
      auth: {
        username: Deno.env.get("SMTP_USERNAME"),
        password: Deno.env.get("SMTP_PASSWORD")
      }
    }
  });
  try {
    await client.send({
      from: payload.from,
      to: payload.to,
      subject: payload.subject,
      content: stripTrailingWhitespace(payload.text),
      html: stripTrailingWhitespace(payload.html),
      ...payload.reply_to ? { replyTo: payload.reply_to } : {}
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err instanceof Error ? err.message : String(err)).slice(0, 500) };
  } finally {
    try {
      await client.close();
    } catch {
    }
  }
}
function stripTrailingWhitespace(body) {
  return body.replace(/[ \t]+(?=\r?$)/gm, "");
}
var DEV_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:8080",
  "http://localhost:8081",
  // illuxus-venue dev server
  "http://127.0.0.1:5173",
  "http://127.0.0.1:8080"
];
function buildCorsHeaders(req) {
  const headers = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-correlation-id",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
  const strip = (s) => s.trim().replace(/\/$/, "");
  const allowed = new Set(DEV_ORIGINS);
  for (const o of (Deno.env.get("ALLOWED_ORIGINS") || "").split(",")) {
    if (o.trim()) allowed.add(strip(o));
  }
  for (const host of [
    Deno.env.get("PUBLIC_DOMAIN") || Deno.env.get("VITE_PUBLIC_DOMAIN"),
    Deno.env.get("PUBLIC_PUBLISHED_HOST") || Deno.env.get("VITE_PUBLIC_PUBLISHED_HOST")
  ]) {
    if (!host?.trim()) continue;
    const h = strip(host);
    allowed.add(/^https?:\/\//.test(h) ? h : `https://${h}`);
  }
  const origin = req.headers.get("Origin") ?? "";
  const ok = allowed.has(strip(origin)) || /^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.vercel\.app$/i.test(origin);
  headers["Access-Control-Allow-Origin"] = origin && ok ? origin : "null";
  if (origin && ok) headers["Access-Control-Allow-Credentials"] = "true";
  return headers;
}
function handlePreflight(req, cors) {
  return req.method === "OPTIONS" ? new Response(null, { status: 204, headers: cors }) : null;
}
function corsJson(body, init) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json", ...init.cors }
  });
}
var VENDOR_PORTAL_URL = Deno.env.get("VENDOR_PORTAL_URL") ?? "https://vendors.illuxus.com/vendor";
Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflight = handlePreflight(req, cors);
  if (preflight) return preflight;
  try {
    if (!smtpConfigured()) {
      return corsJson(
        {
          ok: false,
          error: "SMTP not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM in Supabase secrets."
        },
        { status: 500, cors }
      );
    }
    const body = await req.json().catch(() => ({}));
    let {
      event_id,
      vendor_id,
      venue_id,
      selection_id
    } = body ?? {};
    const supabase = createClient2(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    );
    const selectionColumns = "id, event_id, vendor_id, venue_id, notes, selected_service_ids, event_type, event_duration_hours, expected_attendees, seating_capacity, seating_arrangement, needs_pre_function_area, needs_vip_area, needs_additional_rooms, venue_link";
    let selection = null;
    if (selection_id) {
      const { data } = await supabase.from("event_venue_selections").select(selectionColumns).eq("id", selection_id).maybeSingle();
      selection = data;
    } else if (event_id && vendor_id) {
      const { data } = await supabase.from("event_venue_selections").select(selectionColumns).eq("event_id", event_id).eq("vendor_id", vendor_id).maybeSingle();
      selection = data;
    }
    if (!selection) {
      return corsJson({ ok: false, error: "No venue request found to notify about" }, { status: 404, cors });
    }
    selection_id = selection.id;
    event_id = selection.event_id;
    vendor_id = selection.vendor_id;
    venue_id = selection.venue_id ?? venue_id ?? void 0;
    const caller = await resolveCaller(req, supabase);
    if (!caller) return corsJson({ ok: false, error: "Sign in required" }, { status: 401, cors });
    if (caller.kind === "user" && !await getManagedEvent(supabase, caller.user.id, selection.event_id)) {
      return corsJson({ ok: false, error: "You don't have access to this event" }, { status: 403, cors });
    }
    if (!await withinLimit(supabase, "venue_selection_email", selection.id, 5, 60 * 60 * 1e3)) {
      return corsJson({ ok: false, error: "This venue was notified several times recently. Try again later." }, { status: 429, cors });
    }
    if (!event_id || !vendor_id) {
      return corsJson(
        { ok: false, error: "event_id and vendor_id are required (directly or via selection_id)" },
        { status: 400, cors }
      );
    }
    const { data: event, error: eventErr } = await supabase.from("events").select(
      "id, title, date, end_date, venue, location, capacity, timezone, event_format, user_id, org_id, banner_landscape_url, banner_portrait_url, description"
    ).eq("id", event_id).maybeSingle();
    if (eventErr || !event) {
      return corsJson({ ok: false, error: "Event not found" }, { status: 404, cors });
    }
    const { data: vendor, error: vendorErr } = await supabase.from("vendors").select("id, business_name, notify_email").eq("id", vendor_id).maybeSingle();
    if (vendorErr || !vendor) {
      return corsJson({ ok: false, error: "Vendor not found" }, { status: 404, cors });
    }
    if (!vendor.notify_email) {
      return corsJson(
        { ok: true, skipped: "Vendor has notifications disabled" },
        { cors }
      );
    }
    const { data: members } = await supabase.from("vendor_members").select("user_id, role").eq("vendor_id", vendor_id);
    const ownerIds = (members ?? []).filter((m) => m.role === "owner" || m.role === "manager").map((m) => m.user_id);
    const recipientEmails = (await Promise.all(ownerIds.map((id) => userEmail(supabase, id)))).filter((e) => !!e);
    if (recipientEmails.length === 0) {
      return corsJson(
        { ok: false, error: "Could not resolve the venue admin's email" },
        { status: 404, cors }
      );
    }
    let venueName = vendor.business_name;
    let venueSpaceType = null;
    let venueCity = null;
    if (venue_id) {
      const { data: venue } = await supabase.from("venues").select("name, space_type, city").eq("id", venue_id).maybeSingle();
      if (venue?.name) {
        venueName = venue.name;
        venueSpaceType = venue.space_type;
        venueCity = venue.city ?? null;
      }
    }
    const serviceIds = selection?.selected_service_ids ?? [];
    let services = [];
    if (serviceIds.length > 0) {
      const { data } = await supabase.from("vendor_services").select("title, category").in("id", serviceIds);
      services = data ?? [];
    }
    const { data: organizerRes } = await supabase.auth.admin.getUserById(event.user_id);
    const organizerUser = organizerRes?.user ?? null;
    const organizerEmail = organizerUser?.email ?? null;
    const { data: profile } = await supabase.from("profiles").select("display_name, first_name, last_name, mobile_country_code, mobile_number").eq("user_id", event.user_id).maybeSingle();
    const organizerName = profile?.display_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || organizerUser?.user_metadata?.display_name || organizerEmail?.split("@")[0] || "An Illuxus organizer";
    const organizerPhone = profile?.mobile_number ? [profile.mobile_country_code, profile.mobile_number].filter(Boolean).join(" ") : null;
    let orgName = "Illuxus";
    if (event.org_id) {
      const { data: org } = await supabase.from("organizations").select("name").eq("id", event.org_id).maybeSingle();
      if (org?.name) orgName = org.name;
    }
    const bannerUrl = event.banner_landscape_url ?? event.banner_portrait_url ?? null;
    const when = formatWhen(event.date, event.end_date, event.timezone);
    const spaceLabel = venueSpaceType ? titleCase(venueSpaceType) : null;
    const attendees = selection?.expected_attendees ?? event.capacity ?? null;
    const eventRows = [
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
      ["Location", event.location ?? null]
    ];
    const needs = [
      selection?.needs_pre_function_area ? "Pre-function area" : null,
      selection?.needs_vip_area ? "VIP area" : null,
      selection?.needs_additional_rooms ? "Additional rooms" : null
    ].filter((n) => !!n);
    const contactRows = [
      ["Name", organizerName],
      ["Email", organizerEmail],
      ["Phone", organizerPhone]
    ];
    const subject = `New venue request: ${venueName} for "${event.title}" (${when.dates})`;
    const text = [
      `Hi ${vendor.business_name} team,`,
      "",
      `${organizerName} from ${orgName} has requested ${venueName}${spaceLabel ? ` (${spaceLabel})` : ""} for an upcoming event.`,
      "",
      "\u2500\u2500 Event details \u2500\u2500",
      ...rowsToText(eventRows),
      needs.length ? `Also needs:   ${needs.join(", ")}` : "",
      "",
      services.length ? "\u2500\u2500 Requested services \u2500\u2500" : "",
      ...services.map((s) => `\u2022 ${s.title}`),
      selection?.notes ? `\u2500\u2500 Note from the organizer \u2500\u2500
${selection.notes}` : "",
      "\u2500\u2500 Organizer contact \u2500\u2500",
      ...rowsToText(contactRows),
      "",
      "Accept or decline from your venue dashboard:",
      `    ${VENDOR_PORTAL_URL}`,
      "",
      "Reply directly to this email to reach the organizer.",
      "",
      "\u2014 Illuxus"
    ].filter((line) => line !== "").join("\n");
    const html = `
      <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 16px; color: #111827;">
        ${bannerUrl ? `<img src="${escapeHtml(bannerUrl)}" alt="${escapeHtml(event.title)}"
                 style="width: 100%; height: auto; border-radius: 12px; margin-bottom: 24px; display: block;" />` : ""}

        <div style="background: #eff6ff; color: #1e40af; padding: 6px 12px; border-radius: 999px; display: inline-block; font-size: 12px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;">
          New venue request
        </div>

        <h1 style="font-size: 22px; font-weight: 700; margin: 12px 0 4px;">
          ${escapeHtml(orgName)} wants to book ${escapeHtml(venueName)}
        </h1>
        <p style="color: #6b7280; font-size: 13px; margin: 0 0 24px;">
          ${escapeHtml(event.title)} \xB7 ${escapeHtml(when.dates)}
        </p>

        <div style="background: #ecfeff; border-left: 4px solid #06b6d4; border-radius: 8px; padding: 16px 20px; margin: 0 0 20px;">
          <p style="text-transform: uppercase; letter-spacing: 0.05em; font-size: 11px; color: #0e7490; margin: 0 0 6px;">Requested venue</p>
          <p style="margin: 0; font-size: 15px; font-weight: 600;">
            ${escapeHtml(venueName)}
            ${spaceLabel ? `<span style="color: #6b7280; font-weight: 400; font-size: 13px;"> \xB7 ${escapeHtml(spaceLabel)}</span>` : ""}
            ${venueCity ? `<span style="color: #6b7280; font-weight: 400; font-size: 13px;"> \xB7 ${escapeHtml(venueCity)}</span>` : ""}
          </p>
        </div>

        ${section("Event details", rowsToHtml(eventRows))}

        ${needs.length ? section("Also needs", `<p style="margin: 0; font-size: 14px;">${needs.map(escapeHtml).join(" \xB7 ")}</p>`) : ""}

        ${services.length ? section(
      "Requested services",
      `<ul style="margin: 0; padding-left: 18px; font-size: 14px; line-height: 1.7;">${services.map((s) => `<li>${escapeHtml(s.title)}</li>`).join("")}</ul>`
    ) : ""}

        ${selection?.notes ? section(
      "Note from the organizer",
      `<p style="margin: 0; font-size: 14px; line-height: 1.6; white-space: pre-line;">${escapeHtml(selection.notes)}</p>`
    ) : ""}

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
        <p style="font-size: 12px; color: #9ca3af; margin: 0;">Illuxus \xB7 Request ID: ${escapeHtml(selection_id ?? "n/a")}</p>
      </div>
    `;
    const result = await sendViaSmtp({
      from: defaultFromAddress("Illuxus Venues"),
      to: recipientEmails,
      subject,
      text,
      html,
      ...organizerEmail ? { reply_to: organizerEmail } : {}
    });
    if (!result.ok) {
      return corsJson(
        { ok: false, error: `SMTP delivery failed: ${result.error}` },
        { status: 502, cors }
      );
    }
    if (selection_id) {
      await supabase.from("event_venue_selections").update({ notified_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", selection_id);
    }
    return corsJson({ ok: true, notified: recipientEmails.length }, { cors });
  } catch (err) {
    return corsJson(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500, cors }
    );
  }
});
async function userEmail(supabase, userId) {
  const { data } = await supabase.auth.admin.getUserById(userId);
  return data?.user?.email ?? null;
}
function formatWhen(start, end, timezone) {
  if (!start) return { dates: "Date to be confirmed", time: null };
  const tz = validTimezone(timezone) ?? "Asia/Kolkata";
  const s = new Date(start);
  const e = end ? new Date(end) : null;
  const day = (d, opts) => d.toLocaleDateString("en-IN", { timeZone: tz, ...opts });
  const clock = (d) => d.toLocaleTimeString("en-IN", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  const full = { weekday: "long", day: "numeric", month: "long", year: "numeric" };
  const sameDay = !e || day(s, full) === day(e, full);
  const dates = sameDay ? day(s, full) : `${day(s, { weekday: "short", day: "numeric", month: "short" })} \u2013 ${day(e, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}`;
  const time = e ? `${clock(s)} \u2013 ${clock(e)} (${tz})` : `${clock(s)} (${tz})`;
  return { dates, time };
}
function validTimezone(tz) {
  if (!tz) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}
function titleCase(s) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function rowsToText(rows) {
  return rows.filter(([, v]) => v).map(([k, v]) => `${(k + ":").padEnd(15)}${v}`);
}
function rowsToHtml(rows) {
  return `<table style="width: 100%; font-size: 14px; color: #111827; border-collapse: collapse;">${rows.filter(([, v]) => v).map(
    ([k, v]) => `<tr><td style="padding: 4px 0; color: #6b7280; width: 130px; vertical-align: top;">${escapeHtml(k)}</td><td style="padding: 4px 0;">${escapeHtml(v)}</td></tr>`
  ).join("")}</table>`;
}
function section(title, inner) {
  return `
    <div style="background: #f9fafb; border-radius: 8px; padding: 16px 20px; margin: 0 0 16px;">
      <p style="text-transform: uppercase; letter-spacing: 0.05em; font-size: 11px; color: #6b7280; margin: 0 0 8px;">${escapeHtml(title)}</p>
      ${inner}
    </div>`;
}
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
