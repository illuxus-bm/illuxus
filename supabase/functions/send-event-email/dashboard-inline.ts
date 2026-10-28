// GENERATED from ./index.ts by scripts/build-dashboard-functions.mjs — do not edit.
// Paste this whole file into the Supabase Dashboard editor for `send-event-email` and Deploy.
// Re-generate after changing index.ts or ../_shared: npm run functions:inline

// supabase/functions/_shared/smtp.ts
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

// supabase/functions/_shared/resend.ts
function textToHtml(text, footer) {
  const footerHtml = footer ?? "You received this email because you are registered for an event on Illuxus.";
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           font-size: 15px; line-height: 1.6; color: #1a1a1a; margin: 0; padding: 0; }
    .wrap { max-width: 600px; margin: 40px auto; padding: 0 24px; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb;
              font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="wrap">
    <p>${escapeHtml(text).replace(/\n/g, "<br />")}</p>
    <div class="footer">${escapeHtml(footerHtml)}</div>
  </div>
</body>
</html>`;
}
function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// supabase/functions/_shared/smtp.ts
function buildClient() {
  const host = Deno.env.get("SMTP_HOST");
  const port = Number(Deno.env.get("SMTP_PORT") || "465");
  const username = Deno.env.get("SMTP_USERNAME");
  const password = Deno.env.get("SMTP_PASSWORD");
  if (!host || !username || !password) {
    throw new Error("SMTP not configured: set SMTP_HOST, SMTP_USERNAME, and SMTP_PASSWORD in Supabase secrets.");
  }
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`SMTP_PORT must be a positive number (got ${Deno.env.get("SMTP_PORT")}).`);
  }
  return new SMTPClient({
    connection: {
      hostname: host,
      port,
      // 465 → implicit TLS (SMTPS). 587 / 25 → opportunistic STARTTLS.
      // denomailer reads `tls` to decide; for STARTTLS we leave it off so
      // the client upgrades cleanly after EHLO.
      tls: port === 465,
      auth: { username, password }
    }
  });
}
function defaultFromAddress(displayName = "Illuxus") {
  const explicit = Deno.env.get("SMTP_FROM") ?? Deno.env.get("RESEND_FROM_EMAIL") ?? Deno.env.get("RESEND_FROM");
  const username = Deno.env.get("SMTP_USERNAME") ?? "";
  const from = explicit || username || `${displayName} <noreply@example.com>`;
  if (from.includes("<")) return from;
  return `${displayName} <${from}>`;
}
async function sendViaSmtp(payload) {
  let client = null;
  try {
    client = buildClient();
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
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg.slice(0, 500) };
  } finally {
    if (client) {
      try {
        await client.close();
      } catch {
      }
    }
  }
}
function stripTrailingWhitespace(body) {
  return body.replace(/[ \t]+(?=\r?$)/gm, "");
}
function smtpConfigured() {
  return !!(Deno.env.get("SMTP_HOST") && Deno.env.get("SMTP_USERNAME") && Deno.env.get("SMTP_PASSWORD"));
}

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

// supabase/functions/_shared/greeting.ts
var HONORIFIC = /^(mr|mrs|ms|miss|mx|dr|prof|sir|shri|smt)\.?$/i;
var GREETING_LINE = /^(\s*)(hi|hello|hey|dear|greetings|namaste|good (?:morning|afternoon|evening))\b(.*)$/i;
var NAMELESS_REST = /^[\s,.!:;-]*(?:there|all|everyone|everybody|folks|team)?[\s,.!:;-]*$/i;
function greetingName(name, email) {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  while (words.length > 1 && HONORIFIC.test(words[0])) words.shift();
  const first = words[0];
  if (!first || first.includes("@")) return null;
  const local = email?.split("@")[0]?.trim().toLowerCase();
  if (local && (name ?? "").trim().toLowerCase() === local) return null;
  return first === first.toLowerCase() ? first.charAt(0).toUpperCase() + first.slice(1) : first;
}
function withGreeting(body, name, email) {
  const first = greetingName(name, email);
  const lines = body.split("\n");
  const at = lines.findIndex((l) => l.trim().length > 0);
  if (at === -1) return body;
  const match = GREETING_LINE.exec(lines[at]);
  if (match) {
    const [, indent, word, rest] = match;
    if (!first || !NAMELESS_REST.test(rest)) return body;
    lines[at] = `${indent}${word} ${first},`;
    return lines.join("\n");
  }
  return `Hi ${first ?? "there"},

${body.replace(/^\s*\n/, "")}`;
}

// supabase/functions/_shared/auth.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL"),
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
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
async function managedOrgIds(admin, userId) {
  const [owned, memberOf] = await Promise.all([
    admin.from("organizations").select("id").eq("owner_id", userId),
    admin.from("org_members").select("org_id").eq("user_id", userId).in("role", ["owner", "admin"])
  ]);
  const ids = /* @__PURE__ */ new Set();
  for (const o of owned.data ?? []) ids.add(o.id);
  for (const m of memberOf.data ?? []) ids.add(m.org_id);
  return [...ids];
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
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var isUuid = (v) => typeof v === "string" && UUID_RE.test(v);
function normalizeEmails(input) {
  if (!Array.isArray(input)) return [];
  const out = /* @__PURE__ */ new Set();
  for (const v of input) {
    if (typeof v !== "string") continue;
    const e = v.trim().toLowerCase();
    if (/^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/.test(e) && e.length <= 254) out.add(e);
  }
  return [...out];
}

// supabase/functions/send-event-email/index.ts
var log = createEdgeLogger("send-event-email");
var MAX_SUBJECT = 300;
var MAX_BODY = 5e4;
var MAX_INVITE_RECIPIENTS = 5;
var fullName = (first, last, name) => [first, last].filter((p) => p?.trim()).join(" ").trim() || name?.trim() || "";
async function resolveEvent(admin, userId, eventId, emailId, requested) {
  const event = await getManagedEvent(admin, userId, eventId);
  if (!event) return { ok: false, status: 403, error: "You don't have access to this event" };
  const { data: emailRecord } = await admin.from("event_emails").select("id").eq("id", emailId).eq("event_id", eventId).maybeSingle();
  if (!emailRecord) return { ok: false, status: 403, error: "Email record not found or access denied" };
  const allowed = /* @__PURE__ */ new Set();
  const names = /* @__PURE__ */ new Map();
  const { data: regs } = await admin.from("registrations").select("email, first_name, last_name, name").eq("event_id", eventId);
  for (const r of regs ?? []) {
    const e = r.email?.trim().toLowerCase();
    if (!e) continue;
    allowed.add(e);
    const n = fullName(r.first_name, r.last_name, r.name);
    if (n && !names.has(e)) names.set(e, n);
  }
  const { data: rels } = await admin.from("event_speakers").select("speaker_id").eq("event_id", eventId);
  const speakerIds = (rels ?? []).map((r) => r.speaker_id);
  if (speakerIds.length) {
    const { data: speakers } = await admin.from("speakers").select("email, name").in("id", speakerIds);
    for (const s of speakers ?? []) {
      const e = s.email?.trim().toLowerCase();
      if (!e) continue;
      allowed.add(e);
      const n = s.name?.trim();
      if (n && !names.has(e)) names.set(e, n);
    }
  }
  const recipients = requested.filter((e) => allowed.has(e));
  let fromName = event.title ?? "Illuxus";
  let replyTo;
  if (event.org_id) {
    const { data: org } = await admin.from("organizations").select("name, billing_email").eq("id", event.org_id).maybeSingle();
    const o = org;
    if (o?.name) fromName = o.name;
    if (o?.billing_email) replyTo = o.billing_email;
  }
  return { ok: true, recipients, skipped: requested.length - recipients.length, fromName, replyTo, eventEmailId: emailId, names };
}
async function resolveInvite(admin, userId, requested) {
  if (requested.length > MAX_INVITE_RECIPIENTS) {
    return { ok: false, status: 400, error: `At most ${MAX_INVITE_RECIPIENTS} recipients per invitation email` };
  }
  const orgIds = await managedOrgIds(admin, userId);
  if (orgIds.length === 0) return { ok: false, status: 403, error: "Only workspace owners and admins can send invitations" };
  const { data: invites } = await admin.from("org_invitations").select("email").in("org_id", orgIds).in("email", requested);
  const invited = new Set((invites ?? []).map((i) => i.email.trim().toLowerCase()));
  const recipients = requested.filter((e) => invited.has(e));
  if (recipients.length === 0) {
    return { ok: false, status: 403, error: "Recipient has no invitation in a workspace you manage" };
  }
  return { ok: true, recipients, skipped: requested.length - recipients.length, fromName: "Illuxus", names: /* @__PURE__ */ new Map() };
}
async function resolvePartnerInvite(admin, userId, targetEventId, requested) {
  if (!isUuid(targetEventId)) return { ok: false, status: 400, error: "target_event_id is required" };
  if (requested.length > MAX_INVITE_RECIPIENTS) {
    return { ok: false, status: 400, error: `At most ${MAX_INVITE_RECIPIENTS} recipients per invitation email` };
  }
  const event = await getManagedEvent(admin, userId, targetEventId);
  if (!event) return { ok: false, status: 403, error: "You don't have access to this event" };
  const { data: shares } = await admin.from("utm_partner_access").select("invited_email").eq("event_id", targetEventId).neq("status", "revoked").in("invited_email", requested);
  const invited = new Set((shares ?? []).map((s) => s.invited_email.trim().toLowerCase()));
  const recipients = requested.filter((e) => invited.has(e));
  if (recipients.length === 0) {
    return { ok: false, status: 403, error: "Recipient has no shared link for this event" };
  }
  return { ok: true, recipients, skipped: requested.length - recipients.length, fromName: "Illuxus", names: /* @__PURE__ */ new Map() };
}
async function resolveApplication(admin, userId, targetEventId) {
  if (!isUuid(targetEventId)) return { ok: false, status: 400, error: "target_event_id is required" };
  const [{ data: speakerApp }, { data: sponsorApp }] = await Promise.all([
    admin.from("speaker_applications").select("id").eq("event_id", targetEventId).eq("user_id", userId).limit(1),
    admin.from("sponsor_applications").select("id").eq("event_id", targetEventId).eq("user_id", userId).limit(1)
  ]);
  if (!(speakerApp?.length || sponsorApp?.length)) {
    return { ok: false, status: 403, error: "No application found for this event" };
  }
  const { data: ev } = await admin.from("events").select("user_id, org_id").eq("id", targetEventId).maybeSingle();
  const event = ev;
  if (!event) return { ok: false, status: 404, error: "Event not found" };
  const organiserIds = /* @__PURE__ */ new Set();
  if (event.user_id) organiserIds.add(event.user_id);
  if (event.org_id) {
    const [{ data: org }, { data: managers }] = await Promise.all([
      admin.from("organizations").select("owner_id").eq("id", event.org_id).maybeSingle(),
      admin.from("org_members").select("user_id").eq("org_id", event.org_id).in("role", ["owner", "admin"])
    ]);
    const ownerId = org?.owner_id;
    if (ownerId) organiserIds.add(ownerId);
    for (const m of managers ?? []) organiserIds.add(m.user_id);
  }
  const ids = [...organiserIds];
  const { data: profiles } = ids.length ? await admin.from("profiles").select("user_id, first_name, last_name, display_name").in("user_id", ids) : { data: [] };
  const profileName = new Map(
    (profiles ?? []).map((p) => [p.user_id, fullName(p.first_name, p.last_name, p.display_name)])
  );
  const emails = [];
  const names = /* @__PURE__ */ new Map();
  for (const id of ids) {
    const { data } = await admin.auth.admin.getUserById(id);
    const email = data?.user?.email;
    if (!email) continue;
    emails.push(email);
    const n = profileName.get(id);
    if (n) names.set(email.trim().toLowerCase(), n);
  }
  const recipients = normalizeEmails(emails);
  if (recipients.length === 0) return { ok: false, status: 404, error: "No organiser emails on file" };
  return { ok: true, recipients, skipped: 0, fromName: "Illuxus", names };
}
Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handlePreflight(req, corsHeaders);
  if (preflight) return preflight;
  const json = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
  try {
    const payload = await req.json().catch(() => null);
    const eventId = typeof payload?.event_id === "string" ? payload.event_id : "";
    const emailId = typeof payload?.email_id === "string" ? payload.email_id : "";
    const subject = typeof payload?.subject === "string" ? payload.subject.trim() : "";
    const emailBody = typeof payload?.body === "string" ? payload.body : "";
    if (!eventId || !emailId || !subject || !emailBody.trim()) {
      return json({ error: "Missing required fields: event_id, email_id, subject, body" }, 400);
    }
    if (subject.length > MAX_SUBJECT || emailBody.length > MAX_BODY) {
      return json({ error: "Subject or body is too long" }, 400);
    }
    const admin = serviceClient();
    const caller = await getCallerUser(req, admin);
    if (!caller) return json({ error: "Sign in required" }, 401);
    const requested = normalizeEmails(payload?.recipient_emails);
    let resolved;
    if (eventId === "support") {
      const support = normalizeEmails([Deno.env.get("SUPPORT_EMAIL") || "support@illuxus.com"]);
      resolved = { ok: true, recipients: support, skipped: 0, fromName: "Illuxus Support", replyTo: caller.email ?? void 0 };
    } else if (eventId === "invite") {
      if (requested.length === 0) return json({ error: "recipient_emails must be a non-empty array" }, 400);
      resolved = await resolveInvite(admin, caller.id, requested);
    } else if (eventId === "partner-invite") {
      if (requested.length === 0) return json({ error: "recipient_emails must be a non-empty array" }, 400);
      resolved = await resolvePartnerInvite(admin, caller.id, payload?.target_event_id, requested);
    } else if (eventId === "application") {
      resolved = await resolveApplication(admin, caller.id, payload?.target_event_id);
    } else if (isUuid(eventId)) {
      if (requested.length === 0) return json({ error: "recipient_emails must be a non-empty array" }, 400);
      if (!isUuid(emailId)) return json({ error: "email_id must be the event_emails row id" }, 400);
      resolved = await resolveEvent(admin, caller.id, eventId, emailId, requested);
    } else {
      return json({ error: "Unknown event_id" }, 400);
    }
    if (!resolved.ok) {
      log.warn("send refused", { kind: isUuid(eventId) ? "event" : eventId, status: resolved.status, reason: resolved.error });
      return json({ error: resolved.error }, resolved.status);
    }
    const { recipients, skipped, fromName, replyTo, eventEmailId, names } = resolved;
    if (recipients.length === 0) {
      return json({ error: "None of the recipients belong to this event's registrants or speakers.", skipped }, 400);
    }
    const from = defaultFromAddress(fromName);
    const bodyFor = (to) => names ? withGreeting(emailBody, names.get(to), to) : emailBody;
    if (!smtpConfigured()) {
      log.info("not delivered \u2014 SMTP not configured", { subject, recipient_count: recipients.length });
      if (eventEmailId) {
        await admin.from("event_emails").update({ status: "sent", sent_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", eventEmailId);
      }
      return json({
        success: true,
        sent: recipients.length,
        failed: 0,
        skipped,
        provider: "console",
        note: "SMTP not configured \u2014 email logged only. Set SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD in Supabase secrets."
      });
    }
    const failures = [];
    let firstSmtpError;
    for (const to of recipients) {
      const text = bodyFor(to);
      const result = await sendViaSmtp({
        from,
        to: [to],
        subject,
        html: textToHtml(text),
        text,
        ...replyTo ? { reply_to: replyTo } : {}
      });
      if (!result.ok) {
        log.error("smtp send failed", { to, error_message: result.error });
        failures.push(to);
        firstSmtpError ??= result.error;
      }
    }
    if (failures.length === recipients.length) {
      if (eventEmailId) {
        await admin.from("event_emails").update({ status: "draft", sent_at: null }).eq("id", eventEmailId);
      }
      return json({
        error: `All email sends failed (${firstSmtpError?.slice(0, 200) ?? "unknown SMTP error"}). Check SMTP credentials and that the From address matches your verified sender.`,
        failed_count: failures.length
      }, 500);
    }
    if (eventEmailId) {
      await admin.from("event_emails").update({ status: "sent", sent_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", eventEmailId);
    }
    return json({
      success: true,
      sent: recipients.length - failures.length,
      failed: failures.length,
      skipped,
      provider: "smtp"
    });
  } catch (err) {
    log.error("unexpected error", toErrorFields(err));
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
