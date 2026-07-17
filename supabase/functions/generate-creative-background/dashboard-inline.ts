/**
 * generate-creative-background — self-contained Dashboard build.
 *
 * The repo version (`index.ts`) splits CORS / structured-logging into
 * `../_shared/*` modules, but the Supabase Dashboard editor (and the
 * "deploy from dashboard" bundler that produced the
 * `Module not found "file:///tmp/.../_shared/cors.ts"` error) only
 * bundles the single file you paste — it never resolves `../_shared/*`
 * relative imports. Paste THIS file's contents into the Dashboard
 * "Edit function" view for `generate-creative-background` and click
 * Deploy. Same pattern as `send-event-email/dashboard-inline.ts`.
 *
 * Contract (mirrors the client in `src/lib/creatives/creative-ai.ts`) and
 * all behavior are IDENTICAL to `index.ts` — only the CORS + logger
 * helpers are inlined instead of imported. Keep this file in sync with
 * `index.ts` whenever the handler logic changes.
 *
 * ── Required Supabase secrets ────────────────────────────────────────────
 *   GEMINI_API_KEY               Google AI Studio API key (server-side only)
 *   SUPABASE_URL                 provided automatically by the runtime
 *   SUPABASE_SERVICE_ROLE_KEY    provided automatically by the runtime
 *
 * Optional:
 *   GEMINI_PER_EVENT_DAILY_QUOTA default 20 — max Gemini calls/event/24h
 *   ALLOWED_ORIGINS              comma-separated extra CORS origins
 *   PUBLIC_DOMAIN / VITE_PUBLIC_DOMAIN
 *   PUBLIC_PUBLISHED_HOST / VITE_PUBLIC_PUBLISHED_HOST
 *
 * See `docs/gemini-setup.md` for the full setup + troubleshooting guide.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ────────────────────────────────────────────────────────────────────────────
// CORS helpers (inlined from ../_shared/cors.ts)
// ────────────────────────────────────────────────────────────────────────────

const DEV_ORIGINS = new Set<string>([
  "http://localhost:5173",
  "http://localhost:8080",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:8080",
]);

const ALLOWED_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-correlation-id";

function stripTrailingSlash(s: string): string {
  return s.endsWith("/") ? s.slice(0, -1) : s;
}

function envAllowedOrigins(): Set<string> {
  const set = new Set<string>(DEV_ORIGINS);
  const fromSecret = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const o of fromSecret) set.add(stripTrailingSlash(o));
  const publicDomain = Deno.env.get("PUBLIC_DOMAIN") || Deno.env.get("VITE_PUBLIC_DOMAIN");
  const publishedHost = Deno.env.get("PUBLIC_PUBLISHED_HOST") || Deno.env.get("VITE_PUBLIC_PUBLISHED_HOST");
  for (const host of [publicDomain, publishedHost]) {
    if (!host) continue;
    const trimmed = stripTrailingSlash(host).trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) set.add(trimmed);
    else set.add(`https://${trimmed}`);
  }
  return set;
}

function buildCorsHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  const origin = req.headers.get("Origin") ?? "";
  const allowed = envAllowedOrigins();

  const isVercel = /^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.vercel\.app$/i.test(origin);

  if (origin && (allowed.has(stripTrailingSlash(origin)) || isVercel)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  } else {
    headers["Access-Control-Allow-Origin"] = "null";
  }
  return headers;
}

function handlePreflight(req: Request, cors: Record<string, string>): Response | null {
  if (req.method !== "OPTIONS") return null;
  return new Response(null, { status: 204, headers: cors });
}

function corsJson(
  body: unknown,
  init: { status?: number; cors: Record<string, string>; extraHeaders?: Record<string, string> },
): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...init.cors,
    ...(init.extraHeaders ?? {}),
  };
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers });
}

// ────────────────────────────────────────────────────────────────────────────
// Structured logger (inlined from ../_shared/edge-logger.ts)
// ────────────────────────────────────────────────────────────────────────────

type EdgeLogLevel = "debug" | "info" | "warn" | "error";

const DENY_LIST_KEYS = new Set([
  "password", "passwd", "secret", "api_key", "apikey", "access_token",
  "refresh_token", "service_role_key", "service-role-key",
  "supabase_service_role_key", "token", "authorization", "cookie",
  "set-cookie", "session_id", "session", "otp", "otp_code", "code_hash",
  "private_key", "credit_card", "card_number", "cvv", "ssn",
]);

function redactValue(key: string, value: unknown): unknown {
  if (DENY_LIST_KEYS.has(key.toLowerCase())) return "[redacted]";
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v, i) => redactValue(`${key}[${i}]`, v));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = redactValue(k, v);
  }
  return out;
}

interface EdgeLogger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(extra: Record<string, unknown>): EdgeLogger;
}

function emit(
  level: EdgeLogLevel,
  fnName: string,
  bound: Record<string, unknown>,
  msg: string,
  fields: Record<string, unknown> | undefined,
): void {
  const record: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    fn: fnName,
    msg,
    ...(redactValue("__bound__", bound) as Record<string, unknown>),
  };
  if (fields) {
    Object.assign(record, redactValue("__fields__", fields) as Record<string, unknown>);
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
    default:
      console.debug(line);
      break;
  }
}

function makeLogger(fnName: string, bound: Record<string, unknown>): EdgeLogger {
  return {
    debug(msg, fields) { emit("debug", fnName, bound, msg, fields); },
    info(msg, fields) { emit("info", fnName, bound, msg, fields); },
    warn(msg, fields) { emit("warn", fnName, bound, msg, fields); },
    error(msg, fields) { emit("error", fnName, bound, msg, fields); },
    child(extra) { return makeLogger(fnName, { ...bound, ...extra }); },
  };
}

function createEdgeLogger(fnName: string): EdgeLogger {
  return makeLogger(fnName, {});
}

function toErrorFields(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return { error_name: err.name, error_message: err.message, error_stack: err.stack };
  }
  return { error_message: String(err) };
}

// ─── Types (mirrored from src/lib/creatives/creative-ai.ts) ──────────────────

type StylePreset =
  | "abstract-gradient"
  | "minimal-geometric"
  | "elegant-floral"
  | "corporate"
  | "tech-mesh";

type AspectRatio = "1:1" | "16:9" | "9:16" | "4:3";

type AiBackgroundErrorCode =
  | "network"
  | "rate_limit"
  | "content_policy"
  | "service_outage"
  | "configuration"
  | "auth"
  | "bad_request";

interface RequestBody {
  eventId: string;
  promptText: string;
  stylePreset: StylePreset;
  aspectRatio: AspectRatio;
}

interface SuccessResponse {
  assetUrl: string;
  storagePath: string;
  cacheKey: string;
  fromCache: boolean;
}

interface ErrorResponseBody {
  error: string;
  code: AiBackgroundErrorCode;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ALLOWED_PRESETS: ReadonlySet<StylePreset> = new Set<StylePreset>([
  "abstract-gradient",
  "minimal-geometric",
  "elegant-floral",
  "corporate",
  "tech-mesh",
]);

const ALLOWED_RATIOS: ReadonlySet<AspectRatio> = new Set<AspectRatio>([
  "1:1",
  "16:9",
  "9:16",
  "4:3",
]);

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict";

const STORAGE_BUCKET = "site-assets";
const PROVIDER_NAME = "gemini";
const MODEL_NAME = "imagen-4.0-generate-001";
const DEFAULT_DAILY_QUOTA = 20;

const log = createEdgeLogger("generate-creative-background");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeCacheKey(
  eventId: string,
  normalizedPrompt: string,
  stylePreset: StylePreset,
  aspectRatio: AspectRatio,
): string {
  return [eventId, normalizedPrompt, stylePreset, aspectRatio].join("\x1f");
}

async function cacheKeyToStorageSegment(cacheKey: string): Promise<string> {
  const bytes = new TextEncoder().encode(cacheKey);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function base64ToBytes(b64: string): Uint8Array {
  const binaryString = atob(b64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function readCorrelationId(req: Request): string {
  const raw = req.headers.get("x-correlation-id");
  if (raw && raw.trim().length > 0) return raw.trim();
  return crypto.randomUUID();
}

// ─── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const cors = buildCorsHeaders(req);
  const preflight = handlePreflight(req, cors);
  if (preflight) return preflight;

  const correlationId = readCorrelationId(req);
  const rlog = log.child({ correlation_id: correlationId });

  const errorResponse = (
    status: number,
    body: ErrorResponseBody,
  ): Response => corsJson(body, { status, cors });

  // ── 1. Method + parse ─────────────────────────────────────────────────────
  if (req.method !== "POST") {
    return errorResponse(405, {
      error: "Method not allowed",
      code: "bad_request",
    });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch (err) {
    rlog.warn("invalid json body", toErrorFields(err));
    return errorResponse(400, {
      error: "Invalid JSON body",
      code: "bad_request",
    });
  }

  // ── 2. Validate request body ─────────────────────────────────────────────
  if (
    !body ||
    typeof body.eventId !== "string" ||
    body.eventId.trim().length === 0 ||
    typeof body.promptText !== "string" ||
    body.promptText.trim().length === 0 ||
    typeof body.stylePreset !== "string" ||
    typeof body.aspectRatio !== "string"
  ) {
    rlog.warn("bad request: missing required fields", {
      has_event_id: typeof body?.eventId === "string" &&
        body.eventId.trim().length > 0,
      has_prompt: typeof body?.promptText === "string" &&
        body.promptText.trim().length > 0,
      has_style: typeof body?.stylePreset === "string",
      has_ratio: typeof body?.aspectRatio === "string",
    });
    return errorResponse(400, {
      error: "eventId, promptText, stylePreset, aspectRatio are required",
      code: "bad_request",
    });
  }
  if (!ALLOWED_PRESETS.has(body.stylePreset)) {
    rlog.warn("bad request: unknown stylePreset", {
      style_preset: body.stylePreset,
    });
    return errorResponse(400, {
      error: "Unknown stylePreset",
      code: "bad_request",
    });
  }
  if (!ALLOWED_RATIOS.has(body.aspectRatio)) {
    rlog.warn("bad request: unsupported aspectRatio", {
      aspect_ratio: body.aspectRatio,
    });
    return errorResponse(400, {
      error: "Unsupported aspectRatio",
      code: "bad_request",
    });
  }

  rlog.info("request accepted", {
    event_id: body.eventId,
    style_preset: body.stylePreset,
    aspect_ratio: body.aspectRatio,
  });

  // ── 3. Configuration ──────────────────────────────────────────────────────
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  const quotaRaw = Deno.env.get("GEMINI_PER_EVENT_DAILY_QUOTA");
  const quotaParsed = quotaRaw ? Number(quotaRaw) : DEFAULT_DAILY_QUOTA;
  const quota = Number.isFinite(quotaParsed) && quotaParsed > 0
    ? quotaParsed
    : DEFAULT_DAILY_QUOTA;
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!geminiKey) {
    rlog.error("missing configuration", {
      has_gemini_key: false,
      has_supabase_url: !!supabaseUrl,
      has_service_key: !!serviceKey,
    });
    return errorResponse(500, {
      error: "AI background generation is not configured",
      code: "configuration",
    });
  }
  if (!supabaseUrl || !serviceKey) {
    rlog.error("missing configuration", {
      has_gemini_key: true,
      has_supabase_url: !!supabaseUrl,
      has_service_key: !!serviceKey,
    });
    return errorResponse(500, {
      error: "AI background generation is not configured",
      code: "configuration",
    });
  }

  // ── 4. Authenticate + authorize (Requirements 3.6, 12.1, 12.2) ────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  if (!jwt) {
    rlog.warn("missing authorization header");
    return errorResponse(403, {
      error: "Missing Authorization header",
      code: "auth",
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    rlog.warn("auth: getUser failed", {
      error_message: userErr?.message,
    });
    return errorResponse(403, { error: "Not signed in", code: "auth" });
  }
  const userId = userData.user.id;

  const { data: event, error: eventErr } = await supabase
    .from("events")
    .select("user_id")
    .eq("id", body.eventId)
    .maybeSingle();
  if (eventErr) {
    rlog.error("auth: events lookup failed", {
      event_id: body.eventId,
      error_message: eventErr.message,
    });
    return errorResponse(403, { error: "Event not found", code: "auth" });
  }
  if (!event) {
    rlog.warn("auth: event not found", {
      event_id: body.eventId,
      user_id: userId,
    });
    return errorResponse(403, { error: "Event not found", code: "auth" });
  }

  const isOwner = event.user_id === userId;
  let isAdmin = false;
  if (!isOwner) {
    const { data: hasAdminRole, error: rpcErr } = await supabase.rpc(
      "has_role",
      { _user_id: userId, _role: "admin" },
    );
    if (rpcErr) {
      rlog.error("auth: has_role rpc failed", {
        user_id: userId,
        error_message: rpcErr.message,
      });
      return errorResponse(403, { error: "Forbidden", code: "auth" });
    }
    isAdmin = !!hasAdminRole;
  }
  if (!isOwner && !isAdmin) {
    rlog.warn("forbidden", {
      user_id: userId,
      event_id: body.eventId,
    });
    return errorResponse(403, { error: "Forbidden", code: "auth" });
  }

  // ── 5. Cache lookup (Requirements 2.5, 6.1, 6.2) ──────────────────────────
  const promptNormalized = body.promptText.trim().toLowerCase();
  const cacheKey = computeCacheKey(
    body.eventId,
    promptNormalized,
    body.stylePreset,
    body.aspectRatio,
  );

  const { data: cached, error: cacheErr } = await supabase
    .from("event_creative_backgrounds")
    .select("asset_url, storage_path")
    .eq("event_id", body.eventId)
    .eq("cache_key", cacheKey)
    .maybeSingle();
  if (cacheErr) {
    rlog.error("cache lookup failed", {
      event_id: body.eventId,
      error_message: cacheErr.message,
    });
    return errorResponse(500, {
      error: "Failed to look up cached background",
      code: "service_outage",
    });
  }
  if (cached) {
    rlog.info("cache hit", {
      event_id: body.eventId,
      cache_key: cacheKey,
    });
    return corsJson(
      {
        assetUrl: cached.asset_url,
        storagePath: cached.storage_path,
        cacheKey,
        fromCache: true,
      } satisfies SuccessResponse,
      { status: 200, cors },
    );
  }

  // ── 6. Quota (Requirements 8.1, 8.2) ──────────────────────────────────────
  const twentyFourHoursAgo = new Date(
    Date.now() - 24 * 60 * 60 * 1000,
  ).toISOString();
  const { count, error: countErr } = await supabase
    .from("event_creative_backgrounds")
    .select("id", { count: "exact", head: true })
    .eq("event_id", body.eventId)
    .gte("created_at", twentyFourHoursAgo);
  if (countErr) {
    rlog.error("quota lookup failed", {
      event_id: body.eventId,
      error_message: countErr.message,
    });
    return errorResponse(500, {
      error: "Failed to verify daily quota",
      code: "service_outage",
    });
  }
  if ((count ?? 0) >= quota) {
    rlog.warn("quota exceeded", {
      event_id: body.eventId,
      quota,
      count: count ?? 0,
    });
    return errorResponse(429, {
      error: `Per-event daily AI background quota reached (${quota}/day)`,
      code: "rate_limit",
    });
  }

  rlog.info("cache miss under quota", {
    event_id: body.eventId,
    cache_key: cacheKey,
    quota_count: count ?? 0,
    quota,
  });

  // ── 7. Call Gemini (Requirements 3.1, 5.2, 9.2, 10.1) ─────────────────────
  interface GeminiPredictResponse {
    predictions?: Array<{
      bytesBase64Encoded?: string;
      raiFilteredReason?: string;
      width?: number;
      height?: number;
    }>;
    raiFilteredReason?: string;
  }

  let base64Png: string;
  let geminiResponseJson: GeminiPredictResponse | null = null;
  try {
    rlog.info("gemini call start", {
      event_id: body.eventId,
      aspect_ratio: body.aspectRatio,
    });
    const response = await fetch(
      `${GEMINI_ENDPOINT}?key=${encodeURIComponent(geminiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instances: [{ prompt: body.promptText }],
          parameters: {
            sampleCount: 1,
            aspectRatio: body.aspectRatio,
          },
        }),
      },
    );

    if (!response.ok) {
      const errBody = await response.text();
      const excerpt = errBody.slice(0, 500);

      if (response.status === 429) {
        rlog.warn("gemini rate limit", {
          event_id: body.eventId,
          status: response.status,
          body_excerpt: excerpt,
        });
        return errorResponse(429, {
          error: "Gemini rate limit reached, try again in a moment",
          code: "rate_limit",
        });
      }

      if (
        response.status === 400 &&
        /safety|polic(y|ies)|blocked|prohibited/i.test(errBody)
      ) {
        rlog.warn("gemini content policy rejection", {
          event_id: body.eventId,
          status: response.status,
          body_excerpt: excerpt,
        });
        return errorResponse(422, {
          error: "Prompt rejected by content policy",
          code: "content_policy",
        });
      }

      if (response.status >= 500) {
        rlog.error("gemini service error", {
          event_id: body.eventId,
          status: response.status,
          body_excerpt: excerpt,
        });
        return errorResponse(503, {
          error: "Gemini is temporarily unavailable",
          code: "service_outage",
        });
      }

      rlog.error("gemini bad request", {
        event_id: body.eventId,
        status: response.status,
        body_excerpt: excerpt,
      });
      return errorResponse(400, {
        error: "Gemini rejected the request",
        code: "bad_request",
      });
    }

    geminiResponseJson = await response.json();
    const prediction = geminiResponseJson?.predictions?.[0];
    const encoded = prediction?.bytesBase64Encoded;
    if (typeof encoded !== "string" || encoded.length === 0) {
      const raiReason =
        prediction?.raiFilteredReason ??
        geminiResponseJson?.raiFilteredReason;
      if (raiReason) {
        rlog.warn("gemini content policy rejection (empty predictions)", {
          event_id: body.eventId,
          rai_reason: String(raiReason).slice(0, 200),
        });
        return errorResponse(422, {
          error: "Prompt rejected by content policy",
          code: "content_policy",
        });
      }
      rlog.error("gemini empty response", {
        event_id: body.eventId,
      });
      return errorResponse(503, {
        error: "Gemini returned no image",
        code: "service_outage",
      });
    }
    base64Png = encoded;
    rlog.info("gemini call ok", {
      event_id: body.eventId,
    });
  } catch (err) {
    rlog.error("gemini network error", {
      event_id: body.eventId,
      ...toErrorFields(err),
    });
    return errorResponse(503, {
      error: "Couldn't reach Gemini",
      code: "service_outage",
    });
  }

  // ── 8. Decode + upload (Requirement 6.3) ─────────────────────────────────
  let pngBytes: Uint8Array;
  try {
    pngBytes = base64ToBytes(base64Png);
  } catch (err) {
    rlog.error("failed to decode gemini payload", {
      event_id: body.eventId,
      ...toErrorFields(err),
    });
    return errorResponse(503, {
      error: "Failed to decode generated image",
      code: "service_outage",
    });
  }
  const sizeBytes = pngBytes.byteLength;
  const width = geminiResponseJson?.predictions?.[0]?.width ?? null;
  const height = geminiResponseJson?.predictions?.[0]?.height ?? null;

  const cacheKeySegment = await cacheKeyToStorageSegment(cacheKey);
  const storagePath =
    `ai-backgrounds/${body.eventId}/${cacheKeySegment}.png`;

  const { error: uploadErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, pngBytes, {
      contentType: "image/png",
      upsert: true,
      cacheControl: "3600",
    });
  if (uploadErr) {
    rlog.error("storage upload failed", {
      event_id: body.eventId,
      storage_path: storagePath,
      error_message: uploadErr.message,
    });
    return errorResponse(503, {
      error: "Failed to store generated image",
      code: "service_outage",
    });
  }

  const { data: publicUrlData } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(storagePath);
  const assetUrl = publicUrlData?.publicUrl;
  if (!assetUrl) {
    rlog.error("getPublicUrl returned no url", {
      event_id: body.eventId,
      storage_path: storagePath,
    });
    return errorResponse(503, {
      error: "Failed to resolve generated image URL",
      code: "service_outage",
    });
  }

  rlog.info("storage upload ok", {
    event_id: body.eventId,
    storage_path: storagePath,
    size_bytes: sizeBytes,
  });

  // ── 9. Persist row (Requirement 6.3) ─────────────────────────────────────
  const insertPayload = {
    event_id: body.eventId,
    cache_key: cacheKey,
    prompt: body.promptText,
    prompt_normalized: promptNormalized,
    style_preset: body.stylePreset,
    aspect_ratio: body.aspectRatio,
    asset_url: assetUrl,
    storage_path: storagePath,
    storage_bucket: STORAGE_BUCKET,
    media_type: "image/png",
    width,
    height,
    size_bytes: sizeBytes,
    provider: PROVIDER_NAME,
    model: MODEL_NAME,
    created_by: userId,
  };

  const { error: insertErr } = await supabase
    .from("event_creative_backgrounds")
    .insert(insertPayload);
  if (insertErr) {
    const isUniqueViolation =
      (insertErr as { code?: string }).code === "23505";
    if (isUniqueViolation) {
      rlog.info("insert lost race — re-reading winning row", {
        event_id: body.eventId,
        cache_key: cacheKey,
      });
      const { data: winner, error: reselectErr } = await supabase
        .from("event_creative_backgrounds")
        .select("asset_url, storage_path")
        .eq("event_id", body.eventId)
        .eq("cache_key", cacheKey)
        .maybeSingle();
      if (!reselectErr && winner) {
        return corsJson(
          {
            assetUrl: winner.asset_url,
            storagePath: winner.storage_path,
            cacheKey,
            fromCache: true,
          } satisfies SuccessResponse,
          { status: 200, cors },
        );
      }
      rlog.error("re-select after unique violation failed", {
        event_id: body.eventId,
        cache_key: cacheKey,
        error_message: reselectErr?.message,
      });
    } else {
      rlog.error("event_creative_backgrounds insert failed", {
        event_id: body.eventId,
        cache_key: cacheKey,
        error_message: insertErr.message,
      });
    }
    return errorResponse(503, {
      error: "Failed to persist background record",
      code: "service_outage",
    });
  }

  rlog.info("generation persisted", {
    event_id: body.eventId,
    cache_key: cacheKey,
    storage_path: storagePath,
  });

  return corsJson(
    {
      assetUrl,
      storagePath,
      cacheKey,
      fromCache: false,
    } satisfies SuccessResponse,
    { status: 200, cors },
  );
});
