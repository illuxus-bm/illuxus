// GENERATED from ./index.ts by scripts/build-dashboard-functions.mjs — do not edit.
// Paste this whole file into the Supabase Dashboard editor for `livekit-token` and Deploy.
// Re-generate after changing index.ts or ../_shared: npm run functions:inline

// supabase/functions/livekit-token/index.ts
import { createClient as createClient2 } from "https://esm.sh/@supabase/supabase-js@2";
import { AccessToken } from "https://esm.sh/livekit-server-sdk@2.9.7";

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

// supabase/functions/_shared/entitlements.ts
async function orgHasFeature(admin, orgId, feature) {
  if (!orgId) return true;
  const { data, error } = await admin.rpc("org_has_feature", { _org_id: orgId, _feature: feature });
  if (error) return true;
  return data !== false;
}
async function eventHasFeature(admin, eventId, feature) {
  if (!eventId) return true;
  const { data, error } = await admin.from("events").select("org_id").eq("id", eventId).maybeSingle();
  if (error || !data) return true;
  return orgHasFeature(admin, data.org_id, feature);
}
function featureNotIncluded(feature, label) {
  return {
    error: `This organiser's plan doesn't include ${label}.`,
    code: "plan_feature_not_included",
    feature
  };
}

// supabase/functions/livekit-token/index.ts
var log = createEdgeLogger("livekit-token");
var MAX_PUBLISHERS = 10;
function cleanName(raw) {
  if (!raw) return "Guest";
  const s = String(raw).trim();
  if (!s) return "Guest";
  if (/@/.test(s)) {
    const local = s.split("@")[0];
    return local.replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase()) || "Guest";
  }
  return s;
}
Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handlePreflight(req, corsHeaders);
  if (preflight) return preflight;
  try {
    const { session_id, speaker_token, join_token, browser_session_id, fingerprint } = await req.json();
    if (!session_id) {
      return json({ error: "session_id required" }, 400);
    }
    const auth = req.headers.get("Authorization") || "";
    const jwt = auth.replace("Bearer ", "");
    const supabase = createClient2(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    );
    let userId = null;
    let userEmail = null;
    let displayName = null;
    if (jwt) {
      const { data: { user } } = await supabase.auth.getUser(jwt);
      if (user && sessionMeetsTwoFactor(user, jwt)) {
        userId = user.id;
        userEmail = user.email ?? null;
        const { data: profile } = await supabase.from("profiles").select("display_name, first_name, last_name, username").eq("user_id", user.id).maybeSingle();
        const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
        displayName = (fullName || null) ?? profile?.display_name ?? profile?.username ?? cleanName(userEmail);
      }
    }
    let registrationId = null;
    let guestIdentity = null;
    let speakerRow = null;
    if (speaker_token && session_id) {
      const { data: sp } = await supabase.from("webinar_speakers").select("id, role, display_name, email, user_id").eq("session_id", session_id).eq("invite_token", speaker_token).maybeSingle();
      if (sp) {
        speakerRow = sp;
        if (!userId) {
          guestIdentity = `speaker-${sp.id}`;
          const spName = sp.display_name?.trim();
          displayName = spName || cleanName(sp.email);
          userEmail = sp.email ?? null;
        }
      }
    }
    if (join_token) {
      const { data: reg } = await supabase.from("registrations").select("id, event_id, user_id, active_session_id, name, email").eq("join_token", join_token).maybeSingle();
      if (!reg) return json({ error: "Invalid join link" }, 403);
      let resolvedBsid = browser_session_id || crypto.randomUUID();
      if (browser_session_id) {
        const { data: r } = await supabase.rpc("resolve_browser_session", {
          _join_token: join_token,
          _candidate_session_id: browser_session_id,
          _fingerprint: fingerprint || null
        });
        if (typeof r === "string") resolvedBsid = r;
      }
      if (reg.active_session_id && reg.active_session_id !== resolvedBsid) {
        return json({ error: "Link in use on another device" }, 409);
      }
      registrationId = reg.id;
      await supabase.from("registrations").update({ active_session_id: resolvedBsid, active_session_started_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", reg.id);
      if (!userId) {
        guestIdentity = `guest-${reg.id}`;
        displayName = reg.name?.trim() || cleanName(reg.email);
        userEmail = reg.email ?? null;
      }
    }
    if (!userId && !guestIdentity) return json({ error: "Unauthenticated" }, 401);
    const { data: session } = await supabase.from("webinar_sessions").select("id, livekit_room, event_id, status, created_by").eq("id", session_id).maybeSingle();
    if (!session) return json({ error: "Session not found" }, 404);
    if (!await eventHasFeature(supabase, session.event_id, "webinar")) {
      return json(featureNotIncluded("webinar", "the webinar studio"), 403);
    }
    const { data: ev } = await supabase.from("events").select("user_id").eq("id", session.event_id).maybeSingle();
    const isOwner = ev?.user_id === userId;
    let role = "viewer";
    let canPublish = false;
    if (userId && (isOwner || session.created_by === userId)) {
      role = "host";
      canPublish = true;
    } else if (speakerRow) {
      role = speakerRow.role;
      canPublish = true;
      const spName = speakerRow.display_name?.trim();
      if (spName) displayName = spName;
      else if (!displayName || displayName === "Guest") displayName = cleanName(speakerRow.email);
      await supabase.from("webinar_speakers").update({ accepted_at: (/* @__PURE__ */ new Date()).toISOString(), user_id: userId ?? speakerRow.user_id ?? null }).eq("id", speakerRow.id);
    } else if (userId) {
      const { data: sp } = await supabase.from("webinar_speakers").select("id, role").eq("session_id", session_id).eq("user_id", userId).maybeSingle();
      if (sp) {
        role = sp.role;
        canPublish = true;
      }
    }
    if (canPublish) {
      const count = await getPublisherCount(session.livekit_room);
      if (count >= MAX_PUBLISHERS) {
        canPublish = false;
        role = "viewer";
      }
    } else if (!registrationId) {
      if (!userId) return json({ error: "Join link required" }, 403);
      const { data: reg } = await supabase.from("registrations").select("id").eq("event_id", session.event_id).eq("user_id", userId).eq("approval_status", "approved").maybeSingle();
      if (!reg && !isOwner) return json({ error: "Not registered or not approved" }, 403);
    }
    displayName = cleanName(displayName ?? userEmail);
    const at = new AccessToken(
      Deno.env.get("LIVEKIT_API_KEY"),
      Deno.env.get("LIVEKIT_API_SECRET"),
      {
        identity: userId ?? guestIdentity,
        name: displayName,
        metadata: JSON.stringify({ role, user_id: userId, registration_id: registrationId })
      }
    );
    at.addGrant({
      room: session.livekit_room,
      roomJoin: true,
      canPublish,
      canSubscribe: true,
      canPublishData: true,
      roomAdmin: role === "host"
    });
    const token = await at.toJwt();
    return json({
      token,
      ws_url: Deno.env.get("LIVEKIT_WS_URL"),
      role,
      can_publish: canPublish,
      room: session.livekit_room,
      registration_id: registrationId
    });
  } catch (e) {
    log.error("unhandled error", toErrorFields(e));
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
  function json(body, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
async function getPublisherCount(room) {
  try {
    const url = Deno.env.get("LIVEKIT_WS_URL").replace(/^wss?:\/\//, "https://");
    const at = new AccessToken(
      Deno.env.get("LIVEKIT_API_KEY"),
      Deno.env.get("LIVEKIT_API_SECRET"),
      { identity: "server" }
    );
    at.addGrant({ roomAdmin: true, room });
    const jwt = await at.toJwt();
    const res = await fetch(`${url}/twirp/livekit.RoomService/ListParticipants`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${jwt}` },
      body: JSON.stringify({ room })
    });
    if (!res.ok) return 0;
    const data = await res.json();
    const participants = data.participants || [];
    return participants.filter((p) => p.permission?.canPublish).length;
  } catch {
    return 0;
  }
}
