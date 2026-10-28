// GENERATED from ./index.ts by scripts/build-dashboard-functions.mjs — do not edit.
// Paste this whole file into the Supabase Dashboard editor for `send-communication-email` and Deploy.
// Re-generate after changing index.ts or ../_shared: npm run functions:inline

// supabase/functions/send-communication-email/index.ts
import { createClient as createClient2 } from "https://esm.sh/@supabase/supabase-js@2";

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

// supabase/functions/_shared/smtp.ts
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
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

// supabase/functions/_shared/entitlements.ts
async function orgHasFeature(admin, orgId, feature) {
  if (!orgId) return true;
  const { data, error } = await admin.rpc("org_has_feature", { _org_id: orgId, _feature: feature });
  if (error) return true;
  return data !== false;
}
function featureNotIncluded(feature, label) {
  return {
    error: `This organiser's plan doesn't include ${label}.`,
    code: "plan_feature_not_included",
    feature
  };
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

// supabase/functions/send-communication-email/index.ts
var log = createEdgeLogger("send-communication-email");
var SMTP_CHUNK_LIMIT = 50;
Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handlePreflight(req, corsHeaders);
  if (preflight) return preflight;
  const json = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
  let step = "init";
  try {
    step = "read-secrets";
    if (!smtpConfigured()) {
      log.error("missing secrets", {
        hasHost: !!Deno.env.get("SMTP_HOST"),
        hasUser: !!Deno.env.get("SMTP_USERNAME"),
        hasPass: !!Deno.env.get("SMTP_PASSWORD")
      });
      return json({
        error: "SMTP not configured: set SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD secrets first.",
        step
      }, 500);
    }
    const from = defaultFromAddress();
    step = "parse-body";
    const body = await req.json();
    const communication_id = body.communication_id;
    if (!communication_id) {
      return json({ error: "communication_id is required", step }, 400);
    }
    const limit = Math.min(Math.max(1, body.batch_size ?? SMTP_CHUNK_LIMIT), SMTP_CHUNK_LIMIT);
    step = "create-client";
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      log.error("missing supabase env", { hasUrl: !!supabaseUrl, hasKey: !!serviceKey });
      return json({ error: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing", step }, 500);
    }
    const supabase = createClient2(supabaseUrl, serviceKey);
    step = "authorize";
    const allowed = await authorizeCommunication(req, supabase, communication_id);
    if (!allowed.ok) return json({ error: allowed.error, step }, allowed.status);
    step = "check-plan";
    const { data: comm } = await supabase.from("communications").select("org_id").eq("id", communication_id).maybeSingle();
    if (!await orgHasFeature(supabase, comm?.org_id, "communications")) {
      return json({ ...featureNotIncluded("communications", "email broadcasts"), step }, 403);
    }
    step = "read-pending-rows";
    const { data: rowsRaw, error: rowsErr } = await supabase.from("communication_recipients").select("id, email, name, rendered_subject, rendered_body").eq("communication_id", communication_id).eq("email_status", "pending").not("email", "is", null).limit(limit);
    if (rowsErr) {
      log.error("read-pending-rows failed", { error_message: rowsErr.message, error_code: rowsErr.code });
      return json({ error: `Read recipients failed: ${rowsErr.message}`, step }, 500);
    }
    const rows = rowsRaw ?? [];
    log.info("read-pending-rows", { count: rows.length, communication_id });
    if (rows.length === 0) {
      await supabase.rpc(
        "communications_recompute_email_counts",
        { _communication_id: communication_id }
      );
      return json({ sent: 0, failed: 0, remaining: 0, errors: [] });
    }
    step = "mark-sending";
    const { data: claimedRows, error: markErr } = await supabase.from("communication_recipients").update({ email_status: "sending" }).in("id", rows.map((r) => r.id)).eq("email_status", "pending").select("id");
    if (markErr) {
      log.error("mark-sending failed", { error_message: markErr.message, error_code: markErr.code });
      return json({ error: `Mark sending failed: ${markErr.message}`, step }, 500);
    }
    const claimed = new Set((claimedRows ?? []).map((r) => r.id));
    step = "smtp-send-loop";
    let sent = 0;
    let failed = 0;
    const errors = [];
    const now = (/* @__PURE__ */ new Date()).toISOString();
    for (const row of rows) {
      if (!claimed.has(row.id)) continue;
      const to = (row.email || "").trim().toLowerCase();
      if (!to) {
        await supabase.from("communication_recipients").update({ email_status: "failed", error_message: "Recipient has no email" }).eq("id", row.id);
        failed += 1;
        errors.push({ recipient_id: row.id, error: "Recipient has no email" });
        continue;
      }
      const subject = row.rendered_subject ?? "";
      const bodyText = withGreeting(row.rendered_body ?? "", row.name, to);
      const result = await sendViaSmtp({
        from,
        to: [to],
        subject,
        html: textToHtml2(bodyText),
        text: bodyText
      });
      if (result.ok) {
        await supabase.from("communication_recipients").update({ email_status: "sent", email_sent_at: now }).eq("id", row.id);
        sent += 1;
      } else {
        log.error("smtp send failed", { recipient_id: row.id, error_message: result.error });
        await supabase.from("communication_recipients").update({ email_status: "failed", error_message: result.error.slice(0, 500) }).eq("id", row.id);
        failed += 1;
        errors.push({ recipient_id: row.id, error: result.error });
      }
    }
    step = "recompute-counts";
    await supabase.rpc(
      "communications_recompute_email_counts",
      { _communication_id: communication_id }
    );
    step = "count-remaining";
    const { count: remaining } = await supabase.from("communication_recipients").select("id", { count: "exact", head: true }).eq("communication_id", communication_id).eq("email_status", "pending");
    return json({ sent, failed, remaining: remaining ?? 0, errors });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : void 0;
    log.error("unhandled error", { step, error_message: msg, error_stack: stack });
    return json({ error: msg, step }, 500);
  }
});
function textToHtml2(text) {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = escaped.split(/\n{2,}/).map(
    (para) => `<p>${para.replace(/\n/g, "<br>")}</p>`
  ).join("\n");
  return `<!doctype html><html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; line-height: 1.6;">${html}</body></html>`;
}
