// GENERATED from ./index.ts by scripts/build-dashboard-functions.mjs — do not edit.
// Paste this whole file into the Supabase Dashboard editor for `whatsapp-sync-templates` and Deploy.
// Re-generate after changing index.ts or ../_shared: npm run functions:inline

// supabase/functions/whatsapp-sync-templates/index.ts
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
function sessionMeetsTwoFactor(user, token) {
  const hasFactor = (user.factors ?? []).some((f) => f.status === "verified");
  return !hasFactor || tokenAal(token) === "aal2";
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

// supabase/functions/whatsapp-sync-templates/index.ts
var log = createEdgeLogger("whatsapp-sync-templates");
function deriveVariableCount(template) {
  const body = template.components.find((c) => (c.type ?? "").toUpperCase() === "BODY");
  const text = body?.text ?? "";
  const matches = text.match(/\{\{\d+\}\}/g);
  return matches ? matches.length : 0;
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
    const wabaId = Deno.env.get("WHATSAPP_BUSINESS_ACCOUNT_ID");
    const token = Deno.env.get("WHATSAPP_TOKEN");
    const version = Deno.env.get("WHATSAPP_API_VERSION") ?? "v20.0";
    if (!wabaId || !token) {
      log.error("missing secrets", { hasWabaId: !!wabaId, hasToken: !!token });
      return json({
        error: "WhatsApp not configured: set WHATSAPP_BUSINESS_ACCOUNT_ID and WHATSAPP_TOKEN secrets first.",
        step
      }, 500);
    }
    step = "parse-body";
    const body = await req.json();
    const org_id = body.org_id;
    if (!org_id) return json({ error: "org_id is required", step }, 400);
    step = "auth-check";
    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Missing Authorization header", step }, 401);
    }
    const userClient = createClient2(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_ANON_KEY"),
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: ud } = await userClient.auth.getUser();
    if (!ud.user) return json({ error: "Not signed in", step }, 401);
    if (!sessionMeetsTwoFactor(ud.user, authHeader.slice(7).trim())) return json({ error: "Two-factor verification required", step }, 401);
    const { data: membership, error: memErr } = await userClient.from("org_members").select("user_id").eq("org_id", org_id).eq("user_id", ud.user.id).maybeSingle();
    if (memErr) {
      log.error("membership check failed", { error_message: memErr.message, error_code: memErr.code });
      return json({ error: `Membership check failed: ${memErr.message}`, step }, 500);
    }
    if (!membership) return json({ error: "Not an org member", step }, 403);
    step = "create-service-client";
    const service = createClient2(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    );
    step = "fetch-meta";
    const url = new URL(`https://graph.facebook.com/${version}/${wabaId}/message_templates`);
    url.searchParams.set("limit", "100");
    url.searchParams.set("fields", "id,name,language,category,status,components");
    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` }
    });
    const respText = await resp.text();
    if (!resp.ok) {
      log.error("meta fetch failed", { status: resp.status, body_excerpt: respText.slice(0, 300) });
      return json({
        error: `Meta fetch failed: ${resp.status} ${respText.slice(0, 400)}`,
        step
      }, 502);
    }
    let parsed;
    try {
      parsed = JSON.parse(respText);
    } catch {
      return json({
        error: `Meta returned non-JSON: ${respText.slice(0, 200)}`,
        step
      }, 502);
    }
    const templates = parsed.data ?? [];
    log.info("received templates from meta", { count: templates.length });
    step = "upsert-cache";
    let upserted = 0;
    for (const t of templates) {
      const variableCount = deriveVariableCount(t);
      const { error: upErr } = await service.from("whatsapp_templates").upsert({
        org_id,
        name: t.name,
        language: t.language,
        category: t.category,
        status: t.status,
        components: t.components,
        variable_count: variableCount,
        synced_at: (/* @__PURE__ */ new Date()).toISOString()
      }, { onConflict: "org_id,name,language" });
      if (upErr) {
        log.error("upsert failed", {
          template_name: t.name,
          template_language: t.language,
          error_message: upErr.message,
          error_code: upErr.code
        });
      } else {
        upserted += 1;
      }
    }
    return json({ synced: upserted, total: templates.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : void 0;
    log.error("unhandled error", { step, error_message: msg, error_stack: stack });
    return json({ error: "Something went wrong. Please try again.", step }, 500);
  }
});
