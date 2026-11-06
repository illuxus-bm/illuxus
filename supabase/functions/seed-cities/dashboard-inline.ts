// GENERATED from ./index.ts by scripts/build-dashboard-functions.mjs — do not edit.
// Paste this whole file into the Supabase Dashboard editor for `seed-cities` and Deploy.
// Re-generate after changing index.ts or ../_shared: npm run functions:inline

// supabase/functions/seed-cities/index.ts
import { createClient as createClient2 } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { BlobReader, ZipReader, TextWriter } from "https://deno.land/x/zipjs@v2.7.45/index.js";

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

// supabase/functions/_shared/rate-limit.ts
async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function withinLimit(admin, bucket, key, max, windowMs) {
  const { data, error } = await admin.rpc("take_rate_limit", {
    _bucket: bucket,
    _key_hash: await sha256Hex(key),
    _max: max,
    _window_seconds: Math.max(1, Math.ceil(windowMs / 1e3))
  });
  return !error && data === true;
}

// supabase/functions/seed-cities/index.ts
var log = createEdgeLogger("seed-cities");
var GEONAMES_URL = "https://download.geonames.org/export/dump/cities5000.zip";
var COUNTRIES_URL = "https://download.geonames.org/export/dump/countryInfo.txt";
var ADMIN1_URL = "https://download.geonames.org/export/dump/admin1CodesASCII.txt";
async function fetchCountries() {
  const res = await fetch(COUNTRIES_URL);
  const text = await res.text();
  const out = {};
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const cols = line.split("	");
    if (cols.length > 4) out[cols[0]] = cols[4];
  }
  return out;
}
async function fetchAdmin1() {
  const res = await fetch(ADMIN1_URL);
  const text = await res.text();
  const out = {};
  for (const line of text.split("\n")) {
    if (!line) continue;
    const cols = line.split("	");
    if (cols.length >= 2) out[cols[0]] = cols[1];
  }
  return out;
}
async function fetchCitiesText() {
  const res = await fetch(GEONAMES_URL);
  const blob = await res.blob();
  const reader = new ZipReader(new BlobReader(blob));
  const entries = await reader.getEntries();
  const txt = entries.find((e) => e.filename.endsWith(".txt"));
  if (!txt || !txt.getData) {
    await reader.close();
    throw new Error("cities5000.txt not found in zip");
  }
  const text = await txt.getData(new TextWriter());
  await reader.close();
  return text;
}
Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handlePreflight(req, corsHeaders);
  if (preflight) return preflight;
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const admin = createClient2(supabaseUrl, serviceKey);
    const caller = await resolveCaller(req, admin);
    const allowed = caller?.kind === "service" || caller?.kind === "user" && await isPlatformAdmin(admin, caller.user.id);
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Platform admins only" }), {
        status: caller ? 403 : 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    if (!await withinLimit(admin, "seed_cities", "global", 1, 30 * 60 * 1e3)) {
      return new Response(JSON.stringify({ error: "A city import ran in the last 30 minutes. Try again later." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    log.info("invoked");
    log.info("fetching reference data");
    const [countries, admin1] = await Promise.all([
      fetchCountries(),
      fetchAdmin1()
    ]);
    log.info("downloading cities zip");
    const text = await fetchCitiesText();
    const lines = text.split("\n");
    log.info("downloaded", { line_count: lines.length });
    const rows = [];
    for (const line of lines) {
      if (!line) continue;
      const c = line.split("	");
      if (c.length < 19) continue;
      const cc = c[8];
      const admin1Code = c[10];
      const region = admin1[`${cc}.${admin1Code}`] ?? null;
      const country = countries[cc] ?? cc;
      rows.push({
        geoname_id: parseInt(c[0], 10),
        name: c[1],
        ascii_name: c[2],
        region,
        region_code: admin1Code || null,
        country,
        country_code: cc,
        latitude: parseFloat(c[4]) || null,
        longitude: parseFloat(c[5]) || null,
        population: parseInt(c[14] || "0", 10) || 0,
        timezone: c[17] || null
      });
    }
    log.info("upserting cities", { row_count: rows.length });
    const batchSize = 1e3;
    let inserted = 0;
    for (let b = 0; b < rows.length; b += batchSize) {
      const batch = rows.slice(b, b + batchSize);
      const { error } = await admin.from("cities").upsert(batch, { onConflict: "geoname_id" });
      if (error) {
        log.error("batch upsert failed", { error_message: error.message, offset: b });
        return new Response(
          JSON.stringify({ error: "Saving cities failed. Details are in the function logs.", inserted }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          }
        );
      }
      inserted += batch.length;
    }
    return new Response(
      JSON.stringify({ success: true, count: inserted }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  } catch (e) {
    log.error("unhandled error", toErrorFields(e));
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});
