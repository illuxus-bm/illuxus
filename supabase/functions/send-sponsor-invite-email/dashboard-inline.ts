// GENERATED from ./index.ts by scripts/build-dashboard-functions.mjs — do not edit.
// Paste this whole file into the Supabase Dashboard editor for `send-sponsor-invite-email` and Deploy.
// Re-generate after changing index.ts or ../_shared: npm run functions:inline

// supabase/functions/send-sponsor-invite-email/index.ts
import { createClient as createClient2 } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

// supabase/functions/_shared/cors.ts
var DEV_ORIGINS = /* @__PURE__ */ new Set([
  "http://localhost:5173",
  "http://localhost:8080",
  "http://localhost:8081",
  // illuxus-venue dev server
  "http://127.0.0.1:5173",
  "http://127.0.0.1:8080"
]);
var ALLOWED_HEADERS = "authorization, x-client-info, apikey, content-type, x-correlation-id";
var DEFAULT_METHODS = "POST, OPTIONS";
function envAllowedOrigins() {
  const set = new Set(DEV_ORIGINS);
  const fromSecret = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map((s) => s.trim()).filter(Boolean);
  for (const o of fromSecret) set.add(stripTrailingSlash(o));
  const publicDomain = Deno.env.get("PUBLIC_DOMAIN") || Deno.env.get("VITE_PUBLIC_DOMAIN");
  const publishedHost = Deno.env.get("PUBLIC_PUBLISHED_HOST") || Deno.env.get("VITE_PUBLIC_PUBLISHED_HOST");
  for (const host of [publicDomain, publishedHost]) {
    if (!host) continue;
    const trimmed = stripTrailingSlash(host).trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      set.add(trimmed);
    } else {
      set.add(`https://${trimmed}`);
    }
  }
  return set;
}
function stripTrailingSlash(s) {
  return s.endsWith("/") ? s.slice(0, -1) : s;
}
function buildCorsHeaders(req, opts = {}) {
  const headers = {
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": opts.methods ?? DEFAULT_METHODS,
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
  if (opts.allowAny) {
    headers["Access-Control-Allow-Origin"] = "*";
    return headers;
  }
  const origin = req.headers.get("Origin") ?? "";
  const allowed = envAllowedOrigins();
  for (const e of opts.extraOrigins ?? []) allowed.add(stripTrailingSlash(e));
  if (origin && allowed.has(stripTrailingSlash(origin))) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  } else if (origin && /^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.vercel\.app$/i.test(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  } else {
    headers["Access-Control-Allow-Origin"] = "null";
  }
  return headers;
}
function handlePreflight(req, cors) {
  if (req.method !== "OPTIONS") return null;
  return new Response(null, { status: 204, headers: cors });
}

// supabase/functions/_shared/edge-logger.ts
var DENY_LIST_KEYS = /* @__PURE__ */ new Set([
  "password",
  "passwd",
  "secret",
  "api_key",
  "apikey",
  "access_token",
  "refresh_token",
  "service_role_key",
  "service-role-key",
  "supabase_service_role_key",
  "token",
  "authorization",
  "cookie",
  "set-cookie",
  "session_id",
  "session",
  "otp",
  "otp_code",
  "code_hash",
  "private_key",
  "credit_card",
  "card_number",
  "cvv",
  "ssn"
]);
function redactValue(key, value) {
  if (DENY_LIST_KEYS.has(key.toLowerCase())) return "[redacted]";
  if (value === null || value === void 0) return value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v, i) => redactValue(`${key}[${i}]`, v));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = redactValue(k, v);
  }
  return out;
}
function emit(level, fnName, bound, msg, fields) {
  const record = {
    ts: (/* @__PURE__ */ new Date()).toISOString(),
    level,
    fn: fnName,
    msg,
    ...redactValue("__bound__", bound)
  };
  if (fields) {
    Object.assign(record, redactValue("__fields__", fields));
  }
  const line = JSON.stringify(record);
  switch (level) {
    case "error":
      console.error(line);
      break;
    case "warn":
      console.warn(line);
      break;
    case "info":
      console.info(line);
      break;
    case "debug":
    default:
      console.debug(line);
      break;
  }
}
function createEdgeLogger(fnName) {
  return makeLogger(fnName, {});
}
function makeLogger(fnName, bound) {
  return {
    debug(msg, fields) {
      emit("debug", fnName, bound, msg, fields);
    },
    info(msg, fields) {
      emit("info", fnName, bound, msg, fields);
    },
    warn(msg, fields) {
      emit("warn", fnName, bound, msg, fields);
    },
    error(msg, fields) {
      emit("error", fnName, bound, msg, fields);
    },
    child(extra) {
      return makeLogger(fnName, { ...bound, ...extra });
    }
  };
}
function toErrorFields(err) {
  if (err instanceof Error) {
    return {
      error_name: err.name,
      error_message: err.message,
      error_stack: err.stack
    };
  }
  return { error_message: String(err) };
}

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

// supabase/functions/send-sponsor-invite-email/index.ts
var log = createEdgeLogger("send-sponsor-invite-email");
function smtpConfigured() {
  return !!(Deno.env.get("SMTP_HOST") && Deno.env.get("SMTP_USERNAME") && Deno.env.get("SMTP_PASSWORD"));
}
function defaultFromAddress() {
  const explicit = Deno.env.get("SMTP_FROM") ?? Deno.env.get("RESEND_FROM_EMAIL") ?? Deno.env.get("RESEND_FROM");
  const username = Deno.env.get("SMTP_USERNAME") ?? "";
  const from = explicit || username || "Illuxus <noreply@example.com>";
  return from.includes("<") ? from : `Illuxus <${from}>`;
}
async function sendViaSmtp(opts) {
  let client = null;
  try {
    const host = Deno.env.get("SMTP_HOST");
    const port = Number(Deno.env.get("SMTP_PORT") || "465");
    const username = Deno.env.get("SMTP_USERNAME");
    const password = Deno.env.get("SMTP_PASSWORD");
    client = new SMTPClient({
      connection: { hostname: host, port, tls: port === 465, auth: { username, password } }
    });
    await client.send({
      from: opts.from,
      to: [opts.to],
      subject: opts.subject,
      content: opts.text,
      html: opts.html
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err instanceof Error ? err.message : String(err)).slice(0, 500) };
  } finally {
    if (client) {
      try {
        await client.close();
      } catch {
      }
    }
  }
}
function formatDateInTz(iso, tz) {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: tz || "UTC",
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function buildHtml(ctx) {
  const orgBlock = `
    <table cellpadding="0" cellspacing="0" style="margin:0 auto 16px;">
      <tr>
        ${ctx.orgLogoUrl ? `<td style="padding-right:8px;vertical-align:middle"><img src="${escapeHtml(ctx.orgLogoUrl)}" alt="" width="24" height="24" style="border-radius:4px;display:block;" /></td>` : ""}
        <td style="vertical-align:middle;font-size:13px;color:#6b7280;">Organised by <strong style="color:#374151">${escapeHtml(ctx.orgName)}</strong></td>
      </tr>
    </table>`;
  const bannerBlock = ctx.bannerUrl ? `<img src="${escapeHtml(ctx.bannerUrl)}" alt="${escapeHtml(ctx.eventTitle)}" width="560" style="width:100%;max-width:560px;display:block;border-radius:8px 8px 0 0;" />` : `<div style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);height:120px;border-radius:8px 8px 0 0;"></div>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>You're sponsoring ${escapeHtml(ctx.eventTitle)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">
        <tr><td>${bannerBlock}</td></tr>
        <tr><td style="padding:28px 32px 24px;">
          <div style="display:inline-block;background:#7c3aed1a;color:#7c3aed;font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px;margin-bottom:16px;text-transform:uppercase;letter-spacing:.06em;">Sponsor invitation</div>
          <p style="font-size:22px;font-weight:700;color:#111827;margin:0 0 4px;">You're on board!</p>
          <p style="font-size:15px;color:#4b5563;margin:0 0 20px;">
            Hi <strong>${escapeHtml(ctx.sponsorName.split(" ")[0] || ctx.sponsorName)}</strong>,
            ${escapeHtml(ctx.orgName)} has added <strong>${escapeHtml(ctx.sponsorName)}</strong> as a sponsor for the event below.
          </p>
          <p style="font-size:20px;font-weight:700;color:#111827;margin:0 0 4px;">${escapeHtml(ctx.eventTitle)}</p>
          ${orgBlock}
          <table cellpadding="0" cellspacing="0" width="100%" style="background:#f9fafb;border-radius:6px;padding:16px;margin-bottom:20px;">
            ${ctx.dateText ? `<tr><td style="padding:4px 0;font-size:13px;color:#6b7280;width:20px;vertical-align:top;">\u{1F4C5}</td><td style="padding:4px 0 4px 8px;font-size:13px;color:#374151;">${escapeHtml(ctx.dateText)}</td></tr>` : ""}
            ${ctx.venueText ? `<tr><td style="padding:4px 0;font-size:13px;color:#6b7280;vertical-align:top;">\u{1F4CD}</td><td style="padding:4px 0 4px 8px;font-size:13px;color:#374151;">${escapeHtml(ctx.venueText)}</td></tr>` : ""}
          </table>
          <div style="text-align:center;margin:8px 0 16px;">
            <a href="${escapeHtml(ctx.portalUrl)}" style="display:inline-block;background:#7c3aed;color:#ffffff;font-size:14px;font-weight:600;padding:12px 32px;border-radius:6px;text-decoration:none;">
              Open the sponsor portal \u2192
            </a>
          </div>
          <p style="font-size:13px;color:#4b5563;line-height:1.55;margin:0 0 12px;">
            Sign in to view event details, manage your booth, and access the lead list.
            If you don't have an Illuxus account yet, create one using this same email \u2014 your sponsor access will be linked automatically.
          </p>
          <p style="font-size:12px;color:#9ca3af;margin:16px 0 0;text-align:center;">
            Questions? Reply to this email and the organising team will reach you.
          </p>
        </td></tr>
        <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;text-align:center;">
          <p style="font-size:11px;color:#9ca3af;margin:0;">Powered by <strong style="color:#6b7280;">illuxus</strong></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflight = handlePreflight(req, cors);
  if (preflight) return preflight;
  const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
  try {
    const { sponsor_id, event_id } = await req.json();
    if (!sponsor_id || !event_id) return json({ error: "sponsor_id and event_id are required" }, 400);
    const supabase = createClient2(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    );
    const caller = await resolveCaller(req, supabase);
    if (!caller) return json({ error: "Sign in required" }, 401);
    if (caller.kind === "user" && !await getManagedEvent(supabase, caller.user.id, event_id)) {
      return json({ error: "You don't have access to this event" }, 403);
    }
    const { data: link } = await supabase.from("event_sponsors").select("event_id").eq("event_id", event_id).eq("sponsor_id", sponsor_id).maybeSingle();
    if (!link) return json({ error: "This sponsor isn't part of the event" }, 404);
    if (!await withinLimit(supabase, "sponsor_invite_email", `${event_id}:${sponsor_id}`, 5, 60 * 60 * 1e3)) {
      return json({ error: "This invitation was sent several times recently. Try again later." }, 429);
    }
    const [{ data: sponsor }, { data: event }] = await Promise.all([
      supabase.from("sponsors").select("id, name, email").eq("id", sponsor_id).maybeSingle(),
      supabase.from("events").select("id, title, slug, date, timezone, venue, location, image_url, banner_landscape_url, organizations:org_id(name, logo_url)").eq("id", event_id).maybeSingle()
    ]);
    if (!sponsor) {
      log.error("sponsor not found", { sponsor_id });
      return json({ error: "Sponsor not found" }, 404);
    }
    if (!event) {
      log.error("event not found", { event_id });
      return json({ error: "Event not found" }, 404);
    }
    const recipient = (sponsor.email || "").trim().toLowerCase();
    if (!recipient) return json({ ok: true, delivered: false, note: "Sponsor has no email" });
    const org = event.organizations;
    const orgName = org?.name || "The organising team";
    const orgLogo = org?.logo_url || null;
    const eventTitle = event.title || "the event";
    const bannerUrl = event.banner_landscape_url || event.image_url || null;
    const dateText = event.date ? formatDateInTz(event.date, event.timezone ?? null) : "";
    const venueText = [event.venue, event.location].filter(Boolean).join(" \xB7 ");
    const publicOrigin = Deno.env.get("PUBLIC_DOMAIN") || Deno.env.get("VITE_PUBLIC_DOMAIN") || Deno.env.get("VITE_PUBLIC_ORIGIN") || "https://illuxus.com";
    const base = publicOrigin.startsWith("http") ? publicOrigin.replace(/\/+$/, "") : `https://${publicOrigin}`;
    const portalUrl = `${base}/sponsor`;
    const html = buildHtml({
      sponsorName: sponsor.name || "Sponsor",
      eventTitle,
      orgName,
      orgLogoUrl: orgLogo,
      dateText,
      venueText,
      bannerUrl,
      portalUrl
    });
    const textBody = [
      `Hi ${sponsor.name?.trim().split(/\s+/)[0] || "there"},`,
      "",
      `${orgName} has added ${sponsor.name || "your company"} as a sponsor for "${eventTitle}".`,
      "",
      dateText ? `When:  ${dateText}` : "",
      venueText ? `Where: ${venueText}` : "",
      "",
      `Open the sponsor portal: ${portalUrl}`,
      "",
      "Sign in to view event details, manage your booth, and access the lead list.",
      "If you don't have an Illuxus account yet, create one using this same email \u2014 your sponsor access will be linked automatically.",
      "",
      `\u2014 ${orgName}`
    ].filter((l) => l !== void 0).join("\n").replace(/\n{3,}/g, "\n\n").trim();
    const subject = `You've been added as a sponsor for ${eventTitle}`;
    if (!smtpConfigured()) {
      log.info("sponsor invite skipped \u2014 SMTP not configured", { sponsor_id, event_id });
      return json({ ok: true, delivered: false, note: "SMTP not configured" });
    }
    const from = defaultFromAddress();
    const result = await sendViaSmtp({ from, to: recipient, subject, html, text: textBody });
    if (!result.ok) {
      log.error("sponsor invite send failed", { sponsor_id, event_id, error_message: result.error });
      return json({ ok: false, error: result.error }, 500);
    }
    log.info("sponsor invite sent", { sponsor_id, event_id, recipient });
    return json({ ok: true, delivered: true });
  } catch (err) {
    log.error("unexpected error", toErrorFields(err));
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
