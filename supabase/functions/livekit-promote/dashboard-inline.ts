// GENERATED from ./index.ts by scripts/build-dashboard-functions.mjs — do not edit.
// Paste this whole file into the Supabase Dashboard editor for `livekit-promote` and Deploy.
// Re-generate after changing index.ts or ../_shared: npm run functions:inline

// supabase/functions/livekit-promote/index.ts
import { createClient as createClient2 } from "https://esm.sh/@supabase/supabase-js@2";
import { AccessToken } from "https://esm.sh/livekit-server-sdk@2.9.7";

// supabase/functions/_shared/cors.ts
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

// supabase/functions/livekit-promote/index.ts
var MAX = 10;
Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handlePreflight(req, corsHeaders);
  if (preflight) return preflight;
  try {
    const { session_id, target_user_id: targetIn, action, self } = await req.json();
    const auth = req.headers.get("Authorization") || "";
    const supabase = createClient2(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    const { data: { user } } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (!user) return j({ error: "Unauthenticated" }, 401);
    if (!sessionMeetsTwoFactor(user, auth.replace("Bearer ", ""))) return j({ error: "Two-factor verification required" }, 401);
    const { data: session } = await supabase.from("webinar_sessions").select("id, event_id, livekit_room").eq("id", session_id).maybeSingle();
    if (!session) return j({ error: "Not found" }, 404);
    const { data: ev } = await supabase.from("events").select("user_id").eq("id", session.event_id).maybeSingle();
    const isHost = ev?.user_id === user.id;
    let isPlatformAdmin = false;
    if (!isHost) {
      const { data: r } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
      isPlatformAdmin = !!r;
    }
    const target_user_id = self ? user.id : targetIn;
    if (!target_user_id) return j({ error: "target_user_id required" }, 400);
    if (self) {
      if (!isHost && !isPlatformAdmin) {
        const { data: sp } = await supabase.from("webinar_speakers").select("id").eq("session_id", session_id).eq("user_id", user.id).maybeSingle();
        if (!sp) return j({ error: "Not a speaker on this session" }, 403);
      }
    } else if (!isHost && !isPlatformAdmin) {
      return j({ error: "Forbidden" }, 403);
    }
    const url = Deno.env.get("LIVEKIT_WS_URL").replace(/^wss?:\/\//, "https://");
    const at = new AccessToken(Deno.env.get("LIVEKIT_API_KEY"), Deno.env.get("LIVEKIT_API_SECRET"), { identity: "server" });
    at.addGrant({ roomAdmin: true, room: session.livekit_room });
    const jwt = await at.toJwt();
    if (action === "promote") {
      const list = await fetch(`${url}/twirp/livekit.RoomService/ListParticipants`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${jwt}` },
        body: JSON.stringify({ room: session.livekit_room })
      }).then((r) => r.json()).catch(() => ({ participants: [] }));
      const pubCount = (list.participants || []).filter((p) => p.permission?.canPublish).length;
      if (pubCount >= MAX) return j({ error: "Stage is full (10/10)" }, 409);
      if (!self) {
        await supabase.from("webinar_stage_requests").update({ status: "accepted" }).eq("session_id", session_id).eq("user_id", target_user_id);
      }
    } else {
      if (!self) {
        await supabase.from("webinar_stage_requests").update({ status: "cancelled" }).eq("session_id", session_id).eq("user_id", target_user_id);
      }
    }
    const can = action === "promote";
    await fetch(`${url}/twirp/livekit.RoomService/UpdateParticipant`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${jwt}` },
      body: JSON.stringify({
        room: session.livekit_room,
        identity: target_user_id,
        permission: { can_publish: can, can_subscribe: true, can_publish_data: true }
      })
    });
    return j({ ok: true });
  } catch (e) {
    console.error(JSON.stringify({ level: "error", fn: "livekit-promote", msg: "unhandled error", error_message: e instanceof Error ? e.message : String(e) }));
    return j({ error: "Something went wrong. Please try again." }, 500);
  }
  function j(b, s = 200) {
    return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
