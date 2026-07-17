// deno-lint-ignore-file no-explicit-any
/**
 * Creative_AI_Backgrounds — `generate-creative-background` Edge Function.
 *
 * The only code path in the Illuxus codebase that calls the Google Gemini
 * (Imagen 4) image-generation API (Requirement 3.1). Runs on Deno; talks to
 * Gemini via a raw `fetch` (no `@google/genai` npm dependency — matches the
 * "minimal npm surface" convention of the other functions in this directory)
 * and uses the existing `@supabase/supabase-js` esm.sh import.
 *
 * Contract (mirrors the client in `src/lib/creatives/creative-ai.ts`):
 *
 *   POST /functions/v1/generate-creative-background
 *   Authorization: Bearer <supabase-jwt>
 *   Content-Type: application/json
 *   x-correlation-id: <optional client-supplied id — echoed into every log>
 *   {
 *     "eventId":     "<uuid>",
 *     "promptText":  "<already-composed resolved prompt from buildResolvedPrompt>",
 *     "stylePreset": "abstract-gradient" | "minimal-geometric" | ...,
 *     "aspectRatio": "1:1" | "16:9" | "9:16" | "4:3"
 *   }
 *
 * Success (200):
 *   { assetUrl, storagePath, cacheKey, fromCache: boolean }
 *
 * Failure (see design.md's "Failure category mapping" table):
 *   { error: "<human message>", code: AiBackgroundErrorCode }
 *
 * Every error branch calls `rlog.error(...)` (or `rlog.warn` for expected
 * organizer-facing failures like quota / content policy). No `console.*`
 * calls anywhere — the project's ESLint rule targets the browser bundle,
 * but the same discipline is applied here so the shared logger's redaction
 * pipeline is the single log surface (Requirement 9.4).
 *
 * The `computeCacheKey` here MUST byte-match the client's `computeCacheKey`
 * (Property 20). Both use `\x1f` (ASCII Unit Separator) as the field
 * delimiter over `[eventId, normalizedPrompt, stylePreset, aspectRatio]`.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildCorsHeaders,
  corsJson,
  handlePreflight,
} from "../_shared/cors.ts";
import { createEdgeLogger, toErrorFields } from "../_shared/edge-logger.ts";

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

/**
 * The five Style_Preset identifiers accepted by the request body. MUST
 * match the client's `STYLE_PRESETS` tuple exactly (any drift causes a
 * legitimate client request to be rejected with `code: "bad_request"`).
 */
const ALLOWED_PRESETS: ReadonlySet<StylePreset> = new Set<StylePreset>([
  "abstract-gradient",
  "minimal-geometric",
  "elegant-floral",
  "corporate",
  "tech-mesh",
]);

/**
 * The four Aspect_Ratio_Selection values accepted by the request body.
 * These match Gemini's Imagen API's `aspectRatio` parameter verbatim so
 * no client → provider mapping table is needed (Requirement 5.1).
 */
const ALLOWED_RATIOS: ReadonlySet<AspectRatio> = new Set<AspectRatio>([
  "1:1",
  "16:9",
  "9:16",
  "4:3",
]);

/**
 * Google's public Imagen 4 predict endpoint. The API key is passed as a
 * `?key=...` query parameter per Google's docs for API-key auth on this
 * endpoint. Documented in `docs/gemini-setup.md`.
 */
const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict";

/**
 * The Supabase Storage bucket AI_Background_Assets are materialized into.
 * Reuses the existing `site-assets` bucket under an `ai-backgrounds/{event_id}/`
 * prefix (Requirement 6.3) — no new bucket is provisioned by this feature.
 */
const STORAGE_BUCKET = "site-assets";

/**
 * The provider + model strings recorded on every persisted
 * `event_creative_backgrounds` row for provenance. Not part of the request
 * contract; the client doesn't need these values.
 */
const PROVIDER_NAME = "gemini";
const MODEL_NAME = "imagen-4.0-generate-001";

/**
 * The per-event daily cap on Gemini invocations, applied ONLY to cache
 * misses (cache hits don't call Gemini and don't count — Requirement 8.1).
 * Overridable via the `GEMINI_PER_EVENT_DAILY_QUOTA` Edge Function secret
 * (Requirement 8.4).
 */
const DEFAULT_DAILY_QUOTA = 20;

const log = createEdgeLogger("generate-creative-background");

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Deterministic Background_Cache_Key. MUST byte-match the client's
 * `computeCacheKey` in `src/lib/creatives/creative-ai.ts` for identical
 * inputs — Property 20 pins this by asserting equality of both
 * implementations against `fast-check`-generated inputs.
 *
 * Uses `\x1f` (ASCII Unit Separator) as the field delimiter rather than a
 * cryptographic hash so the resulting string is human-inspectable from
 * Postgres. See the design's "Data Models" section for the full rationale.
 */
function computeCacheKey(
  eventId: string,
  normalizedPrompt: string,
  stylePreset: StylePreset,
  aspectRatio: AspectRatio,
): string {
  return [eventId, normalizedPrompt, stylePreset, aspectRatio].join("\x1f");
}

/**
 * Derives a URL-/path-safe filename component from the Background_Cache_Key
 * for use as the Storage object path. The raw cache key contains `\x1f`
 * (unit separator) which is not a valid character in a Supabase Storage
 * object key — SHA-256 hashing gives a fixed-length, filesystem-safe
 * fingerprint while preserving determinism (same cache key → same path,
 * so `upsert: true` retries reuse the same object).
 *
 * The full raw cache key is still persisted on the `event_creative_backgrounds`
 * row for lookup; only the on-disk filename is hashed.
 */
async function cacheKeyToStorageSegment(cacheKey: string): Promise<string> {
  const bytes = new TextEncoder().encode(cacheKey);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Decodes a base64-encoded PNG (as returned by Imagen's
 * `predictions[0].bytesBase64Encoded`) into a `Uint8Array` suitable for
 * `supabase.storage.upload`. Uses Deno's global `atob` — matches the
 * pattern documented in the design's Edge Function skeleton.
 */
function base64ToBytes(b64: string): Uint8Array {
  const binaryString = atob(b64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Reads the caller-supplied `x-correlation-id` header (a fresh UUID minted
 * by the client wrapper — see `newAiBackgroundCorrelationId` in
 * `creative-ai.ts`) so both sides of the wire tag every log record with
 * the same id (Requirement 9.4). Falls back to a server-minted UUID when
 * the header is missing so no request goes uncorrelated.
 */
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
      // Fail closed on RPC error — an admin check that couldn't run
      // shouldn't grant access.
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
    // Treat a cache-read failure as a service outage rather than falling
    // through to a Gemini call the operator didn't consent to spending
    // quota on.
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

      // Gemini reports safety-filter blocks with a 400 status and a body
      // containing `safety` or `policy` markers. Distinct from generic
      // 4xx so the client can surface a distinct toast (Requirement 10.1).
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

      // Any other 4xx — malformed request from our side or an unknown
      // policy trigger we didn't match above.
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
      // Some Imagen safety blocks return an OK-status response with an
      // empty predictions array (or with a `raiFilteredReason` marker).
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
    // Postgres unique-violation on `UNIQUE (event_id, cache_key)`. This
    // happens when two identical requests race — the losing insert lands
    // here. The winning row is already visible; re-select it and return
    // its stored URL so the caller gets a coherent result rather than an
    // opaque 5xx.
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
    // The PNG is already uploaded with `upsert: true`, so a retry with
    // identical inputs will reuse it via the cache-hit path once the row
    // exists — no orphan proliferation.
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
