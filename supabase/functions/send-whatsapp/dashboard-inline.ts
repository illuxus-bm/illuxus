// GENERATED from ./index.ts by scripts/build-dashboard-functions.mjs — do not edit.
// Paste this whole file into the Supabase Dashboard editor for `send-whatsapp` and Deploy.
// Re-generate after changing index.ts or ../_shared: npm run functions:inline

// supabase/functions/send-whatsapp/index.ts
import { createClient as createClient2 } from "https://esm.sh/@supabase/supabase-js@2";

// supabase/functions/_shared/cors.ts
function previewOriginAllowed(origin) {
  const pattern = Deno.env.get("PREVIEW_ORIGIN_PATTERN")?.trim();
  if (!pattern || !origin) return false;
  try {
    return new RegExp(`^(?:${pattern})$`, "i").test(origin);
  } catch {
    return false;
  }
}
var DEV_ORIGINS = /* @__PURE__ */ new Set([
  "http://localhost:5173",
  "http://localhost:8080",
  "http://localhost:8081",
  // illuxus-venue dev server
  "http://127.0.0.1:5173",
  "http://127.0.0.1:8080"
]);
var NATIVE_APP_ORIGINS = /* @__PURE__ */ new Set([
  "capacitor://localhost",
  // iOS
  "https://localhost"
  // Android
]);
var ALLOWED_HEADERS = "authorization, x-client-info, apikey, content-type, x-correlation-id";
var DEFAULT_METHODS = "POST, OPTIONS";
function envAllowedOrigins() {
  const set = /* @__PURE__ */ new Set([...DEV_ORIGINS, ...NATIVE_APP_ORIGINS]);
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
  } else if (origin && previewOriginAllowed(origin)) {
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

// supabase/functions/send-whatsapp/index.ts
var log = createEdgeLogger("send-whatsapp");
function normalisePhone(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D+/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}
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
    const phoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
    const token = Deno.env.get("WHATSAPP_TOKEN");
    const version = Deno.env.get("WHATSAPP_API_VERSION") ?? "v20.0";
    if (!phoneId || !token) {
      log.error("missing secrets", { hasPhoneId: !!phoneId, hasToken: !!token });
      return json({
        error: "WhatsApp not configured: set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_TOKEN secrets first.",
        step
      }, 500);
    }
    step = "parse-body";
    const body = await req.json();
    const communication_id = body.communication_id;
    if (!communication_id) {
      return json({ error: "communication_id is required", step }, 400);
    }
    step = "create-client";
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      return json({ error: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing", step }, 500);
    }
    const supabase = createClient2(supabaseUrl, serviceKey);
    step = "authorize";
    const allowed = await authorizeCommunication(req, supabase, communication_id);
    if (!allowed.ok) return json({ error: allowed.error, step }, allowed.status);
    step = "read-comm";
    const { data: commRaw, error: commErr } = await supabase.from("communications").select("id, org_id, whatsapp_template_name, whatsapp_template_language, whatsapp_template_variables").eq("id", communication_id).maybeSingle();
    if (commErr) {
      log.error("read-comm failed", { error_message: commErr.message, error_code: commErr.code });
      return json({ error: `Read comm failed: ${commErr.message}`, step }, 500);
    }
    if (!commRaw) return json({ error: "Communication not found", step }, 404);
    const comm = commRaw;
    if (!await orgHasFeature(supabase, comm.org_id, "whatsapp")) {
      return json({ ...featureNotIncluded("whatsapp", "WhatsApp messaging"), step }, 403);
    }
    if (!comm.whatsapp_template_name) {
      return json({ error: "This communication has no WhatsApp template configured", step }, 400);
    }
    step = "read-pending-rows";
    const { data: rowsRaw, error: rowsErr } = await supabase.from("communication_recipients").select("id, phone, name").eq("communication_id", communication_id).eq("whatsapp_status", "pending");
    if (rowsErr) {
      log.error("read-pending-rows failed", { error_message: rowsErr.message, error_code: rowsErr.code });
      return json({ error: `Read recipients failed: ${rowsErr.message}`, step }, 500);
    }
    const rows = rowsRaw ?? [];
    log.info("read-pending-rows", { count: rows.length, communication_id });
    if (rows.length === 0) {
      return json({ sent: 0, failed: 0, errors: [] });
    }
    step = "build-components";
    const vars = comm.whatsapp_template_variables ?? {};
    const buildComponents = () => {
      const components = [];
      const headerVars = Array.isArray(vars.header) ? vars.header : [];
      if (headerVars.length > 0) {
        components.push({
          type: "header",
          parameters: headerVars.map((v) => ({ type: "text", text: String(v) }))
        });
      }
      const bodyVars = Array.isArray(vars.body) ? vars.body : [];
      if (bodyVars.length > 0) {
        components.push({
          type: "body",
          parameters: bodyVars.map((v) => ({ type: "text", text: String(v) }))
        });
      }
      return components;
    };
    step = "send-loop";
    let sent = 0;
    let failed = 0;
    let skippedAlreadyClaimed = 0;
    const errors = [];
    const META_FETCH_TIMEOUT_MS = 15e3;
    for (const row of rows) {
      const to = normalisePhone(row.phone);
      if (!to) {
        await supabase.rpc("_whatsapp_recipient_update", {
          _recipient_id: row.id,
          _status: "failed",
          _error: "Invalid phone number"
        });
        failed += 1;
        errors.push({ recipient_id: row.id, error: "Invalid phone number" });
        continue;
      }
      const { data: claimed, error: claimErr } = await supabase.from("communication_recipients").update({ whatsapp_status: "sending" }).eq("id", row.id).eq("whatsapp_status", "pending").select("id");
      if (claimErr) {
        log.error("claim failed", { recipient_id: row.id, error_message: claimErr.message });
        failed += 1;
        errors.push({ recipient_id: row.id, error: `Claim: ${claimErr.message}` });
        continue;
      }
      if (!claimed || claimed.length === 0) {
        log.debug("recipient already claimed by another worker", { recipient_id: row.id });
        skippedAlreadyClaimed += 1;
        continue;
      }
      const payload = {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: comm.whatsapp_template_name,
          language: { code: comm.whatsapp_template_language || "en" },
          components: buildComponents()
        }
      };
      try {
        const resp = await fetch(
          `https://graph.facebook.com/${version}/${phoneId}/messages`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(META_FETCH_TIMEOUT_MS)
          }
        );
        const respText = await resp.text();
        if (!resp.ok) {
          log.error("meta send failed", {
            recipient_id: row.id,
            status: resp.status,
            body_excerpt: respText.slice(0, 300)
          });
          await supabase.rpc("_whatsapp_recipient_update", {
            _recipient_id: row.id,
            _status: "failed",
            _error: `Meta ${resp.status}: ${respText.slice(0, 400)}`
          });
          failed += 1;
          errors.push({ recipient_id: row.id, error: `${resp.status} ${respText.slice(0, 200)}` });
          continue;
        }
        await supabase.rpc("_whatsapp_recipient_update", {
          _recipient_id: row.id,
          _status: "sent"
        });
        sent += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isTimeout = err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError");
        const label = isTimeout ? `Meta call timed out after ${META_FETCH_TIMEOUT_MS}ms` : msg;
        log.error("meta send threw", {
          recipient_id: row.id,
          error_message: msg,
          is_timeout: isTimeout
        });
        await supabase.rpc("_whatsapp_recipient_update", {
          _recipient_id: row.id,
          _status: "failed",
          _error: label.slice(0, 500)
        });
        failed += 1;
        errors.push({ recipient_id: row.id, error: label });
      }
    }
    log.info("send-loop complete", {
      communication_id,
      sent,
      failed,
      skipped_already_claimed: skippedAlreadyClaimed
    });
    return json({ sent, failed, skipped: skippedAlreadyClaimed, errors });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : void 0;
    log.error("unhandled error", { step, error_message: msg, error_stack: stack });
    return json({ error: "Something went wrong. Please try again.", step }, 500);
  }
});
