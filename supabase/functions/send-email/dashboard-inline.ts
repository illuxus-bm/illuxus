// GENERATED from ./index.ts by scripts/build-dashboard-functions.mjs — do not edit.
// Paste this whole file into the Supabase Dashboard editor for `send-email` and Deploy.
// Re-generate after changing index.ts or ../_shared: npm run functions:inline

// supabase/functions/send-email/index.ts
import { createClient as createClient2 } from "https://esm.sh/@supabase/supabase-js@2";

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
async function canSendCommunication(admin, userId, comm) {
  if (comm.org_id) {
    const [{ data: org }, { data: member }] = await Promise.all([
      admin.from("organizations").select("owner_id").eq("id", comm.org_id).maybeSingle(),
      admin.from("org_members").select("role").eq("org_id", comm.org_id).eq("user_id", userId).maybeSingle()
    ]);
    if (org?.owner_id === userId) return true;
    const role = member?.role;
    if (role && role !== "viewer") return true;
  }
  if (comm.community_id) {
    const { data } = await admin.rpc("can_moderate_community", { _user_id: userId, _community_id: comm.community_id });
    if (data === true) return true;
  }
  return isPlatformAdmin(admin, userId);
}
async function authorizeCommunication(req, admin, communicationId) {
  if (!isUuid(communicationId)) return { ok: false, status: 400, error: "communication_id is required" };
  const caller = await resolveCaller(req, admin);
  if (!caller) return { ok: false, status: 401, error: "Sign in required" };
  if (caller.kind === "service") return { ok: true };
  const { data } = await admin.from("communications").select("org_id, community_id").eq("id", communicationId).maybeSingle();
  const comm = data;
  if (!comm || !await canSendCommunication(admin, caller.user.id, comm)) {
    return { ok: false, status: 403, error: "You can't send this communication" };
  }
  return { ok: true };
}
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var isUuid = (v) => typeof v === "string" && UUID_RE.test(v);

// supabase/functions/send-email/index.ts
function needsProviderSend(row, commSentAt) {
  if (!row.email) return false;
  if (row.email_status === "pending") return true;
  if (row.email_status === "sending") return false;
  if (row.email_status === "failed") return false;
  if (row.email_status === "sent" && commSentAt && row.email_sent_at === commSentAt) return true;
  return false;
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
    if (!smtpConfigured()) {
      return json({
        error: "Email not configured: set SMTP_HOST, SMTP_USERNAME, and SMTP_PASSWORD in Supabase Edge Function secrets first."
      }, 500);
    }
    const { communication_id } = await req.json();
    if (!communication_id) return json({ error: "communication_id is required" }, 400);
    const supabase = createClient2(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    );
    const allowed = await authorizeCommunication(req, supabase, communication_id);
    if (!allowed.ok) return json({ error: allowed.error }, allowed.status);
    const { data: commRaw, error: commErr } = await supabase.from("communications").select("id, org_id, event_id, community_id, subject, body_text, body_html, sent_at, channels").eq("id", communication_id).maybeSingle();
    if (commErr || !commRaw) return json({ error: "Communication not found" }, 404);
    const comm = commRaw;
    if (!comm.channels.includes("email")) {
      return json({ error: "This communication does not include the email channel" }, 400);
    }
    const { data: org } = await supabase.from("organizations").select("name, billing_email").eq("id", comm.org_id).maybeSingle();
    let fromName = org?.name ?? "Illuxus";
    if (comm.event_id) {
      const { data: eventRow } = await supabase.from("events").select("title").eq("id", comm.event_id).maybeSingle();
      if (eventRow?.title) fromName = eventRow.title;
    }
    const from = defaultFromAddress(fromName);
    const replyTo = org?.billing_email ?? void 0;
    const { data: rowsRaw } = await supabase.from("communication_recipients").select("id, email, name, rendered_subject, rendered_body, email_status, email_sent_at").eq("communication_id", communication_id);
    const rows = (rowsRaw ?? []).filter(
      (r) => needsProviderSend(r, comm.sent_at)
    );
    let sent = 0;
    let failed = 0;
    const errors = [];
    const now = (/* @__PURE__ */ new Date()).toISOString();
    for (const row of rows) {
      const to = row.email.trim().toLowerCase();
      const subject = row.rendered_subject ?? comm.subject;
      const bodyText = withGreeting(row.rendered_body ?? comm.body_text, row.name, to);
      const bodyHtml = comm.body_html ?? textToHtml(bodyText);
      const { data: claimed } = await supabase.from("communication_recipients").update({ email_status: "sending" }).eq("id", row.id).eq("email_status", row.email_status ?? "pending").select("id");
      if (!claimed?.length) continue;
      const result = await sendViaSmtp({
        from,
        to: [to],
        subject,
        html: bodyHtml.includes("<") ? bodyHtml : textToHtml(bodyText),
        text: bodyText,
        ...replyTo ? { reply_to: replyTo } : {}
      });
      if (!result.ok) {
        await supabase.from("communication_recipients").update({
          email_status: "failed",
          error_message: result.error.slice(0, 500)
        }).eq("id", row.id);
        failed += 1;
        errors.push({ recipient_id: row.id, error: result.error.slice(0, 200) });
        continue;
      }
      await supabase.from("communication_recipients").update({
        email_status: "sent",
        email_sent_at: now,
        error_message: null
      }).eq("id", row.id);
      sent += 1;
    }
    if (sent + failed > 0) {
      await supabase.from("communications").update({
        sent_count: sent,
        failed_count: failed,
        updated_at: now
      }).eq("id", communication_id);
    }
    return json({ sent, failed, errors });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
