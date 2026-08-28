/**
 * Creative_AI_Copy — `generate-creative-copy` Edge Function.
 *
 * Sibling of `generate-creative-background`. Where that function calls
 * Imagen 4 for a background PNG, this one calls Gemini 1.5 Flash for
 * short-form marketing copy: a tagline, a CTA button label, and (for
 * event-level promos) 3 punchy stat labels. Returned copy is text-only
 * — no images — so it costs about 1/500th of a background generation.
 *
 * Contract (mirrors the client in `src/lib/creatives/creative-ai.ts`):
 *
 *   POST /functions/v1/generate-creative-copy
 *   Authorization: Bearer <supabase-jwt>
 *   Content-Type: application/json
 *   x-correlation-id: <optional client-supplied id — echoed into every log>
 *   {
 *     "eventId":  "<uuid>",
 *     "kind":     "event" | "speaker" | "sponsor" | "combo",
 *     "context": {
 *       "eventTitle":       "...",           // required
 *       "eventDescription": "...",           // optional
 *       "dateText":         "12 Aug 2026",   // optional
 *       "venueText":        "Bangalore",     // optional
 *       "speakerName":      "...",           // required when kind=speaker/combo
 *       "speakerTitle":     "...",           // optional
 *       "speakerCompany":   "...",           // optional
 *       "sponsorName":      "...",           // required when kind=sponsor/combo
 *       "sponsorTier":      "gold",          // optional
 *     },
 *     "alternatives": 3                       // 1..5, default 3
 *   }
 *
 * Success (200):
 *   { suggestions: Array<{ tagline, subtitle?, ctaLabel, stats? }> }
 *
 * Failure:
 *   { error: "<human message>", code: AiCopyErrorCode }
 *
 * ── Why the CORS + logger helpers are inlined instead of imported ────────
 * Same reason as `generate-creative-background`: the Supabase Dashboard
 * editor's deploy bundler ships one file at a time and can't resolve
 * `../_shared/*`. Inlined helpers keep this deployable via the Dashboard
 * or the CLI without change. See `docs/gemini-setup.md`'s discussion.
 *
 * ── Required Supabase secrets ────────────────────────────────────────────
 *   GEMINI_API_KEY                    Google AI Studio API key (server-side only)
 *   SUPABASE_URL                      provided by the runtime
 *   SUPABASE_SERVICE_ROLE_KEY         provided by the runtime
 *
 * Optional:
 *   GEMINI_COPY_MODEL                 default 'gemini-1.5-flash-latest'
 *   GEMINI_COPY_DAILY_QUOTA           default 50 — max calls/event/24h
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ────────────────────────────────────────────────────────────────────────────
// CORS helpers (inlined — see module doc header for why)
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
  init: { status?: number; cors: Record<string, string> },
): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...init.cors,
  };
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers });
}

// ────────────────────────────────────────────────────────────────────────────
// Structured logger (inlined, PII redaction) — see bg function for pattern
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
  level: EdgeLogLevel, fnName: string, bound: Record<string, unknown>,
  msg: string, fields: Record<string, unknown> | undefined,
): void {
  const record: Record<string, unknown> = {
    ts: new Date().toISOString(), level, fn: fnName, msg,
    ...(redactValue("__bound__", bound) as Record<string, unknown>),
  };
  if (fields) Object.assign(record, redactValue("__fields__", fields) as Record<string, unknown>);
  const line = JSON.stringify(record);
  // `console` is the only log sink an edge function has: it runs in Deno,
  // cannot import `@/lib/observability`, and the Supabase dashboard's
  // function-log panel surfaces nothing else. `no-console` is switched off for
  // `supabase/functions/**` in eslint.config.js for exactly this reason, so no
  // per-call-site suppression is needed here.
  switch (level) {
    case "error": console.error(line); break;
    case "warn":  console.warn(line);  break;
    case "info":  console.info(line);  break;
    default:      console.debug(line); break;
  }
}
function makeLogger(fnName: string, bound: Record<string, unknown>): EdgeLogger {
  return {
    debug(msg, fields) { emit("debug", fnName, bound, msg, fields); },
    info(msg, fields)  { emit("info",  fnName, bound, msg, fields); },
    warn(msg, fields)  { emit("warn",  fnName, bound, msg, fields); },
    error(msg, fields) { emit("error", fnName, bound, msg, fields); },
    child(extra) { return makeLogger(fnName, { ...bound, ...extra }); },
  };
}
function createEdgeLogger(fnName: string): EdgeLogger { return makeLogger(fnName, {}); }
function toErrorFields(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return { error_name: err.name, error_message: err.message, error_stack: err.stack };
  }
  return { error_message: String(err) };
}

// ─── Types ───────────────────────────────────────────────────────────────────

type CopyKind = "event" | "speaker" | "sponsor" | "combo";

type AiCopyErrorCode =
  | "network"
  | "rate_limit"
  | "content_policy"
  | "service_outage"
  | "configuration"
  | "auth"
  | "bad_request";

interface CopyContext {
  eventTitle: string;
  eventDescription?: string | null;
  dateText?: string | null;
  venueText?: string | null;
  speakerName?: string | null;
  speakerTitle?: string | null;
  speakerCompany?: string | null;
  sponsorName?: string | null;
  sponsorTier?: string | null;
}

interface RequestBody {
  eventId: string;
  kind: CopyKind;
  context: CopyContext;
  alternatives?: number;
  /** `speakers.id` / `sponsors.id` this generation is for. Persisted on
   *  the resulting draft row(s) so the review UI can group by entity
   *  and pre-select the same one when applying. Null for
   *  `kind='event'`. */
  entityId?: string | null;
  /** Distinguishes "user clicked AI Suggest in the composer" from
   *  "event went from draft to published — auto-generated a seed set".
   *  Only `auto_publish` drafts surface in the review banner; on-demand
   *  ones stay hidden but still count toward the daily quota so a
   *  refresh-happy user can't burn through Gemini budget. */
  source?: "on_demand" | "auto_publish";
}

interface CopySuggestion {
  tagline: string;
  subtitle?: string;
  ctaLabel: string;
  stats?: Array<{ value: string; label: string }>;
}

interface PersistedSuggestion extends CopySuggestion {
  /** The `event_creative_ai_drafts.id` this suggestion was persisted
   *  as. Callers apply/dismiss the suggestion by writing to this row. */
  draftId: string;
}

interface SuccessResponse {
  suggestions: PersistedSuggestion[];
}

interface ErrorResponseBody {
  error: string;
  code: AiCopyErrorCode;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ALLOWED_KINDS: ReadonlySet<CopyKind> = new Set<CopyKind>([
  "event", "speaker", "sponsor", "combo",
]);

const DEFAULT_COPY_MODEL = "gemini-1.5-flash-latest";
const DEFAULT_DAILY_QUOTA = 50;
const DEFAULT_ALTERNATIVES = 3;
const MAX_ALTERNATIVES = 5;
const GEMINI_TIMEOUT_MS = 20_000;

const log = createEdgeLogger("generate-creative-copy");

// ─── Prompt composition (pure) ──────────────────────────────────────────────

/**
 * Builds the LLM prompt for a specific copy `kind`. Each kind requests a
 * strict JSON shape so the parser downstream is trivial. Keeping the
 * prompt structure fixed here (rather than in the client) means every
 * caller gets the same output shape and Gemini's structured-output
 * settings can enforce it if we ever migrate to `response_schema`.
 */
function buildPrompt(kind: CopyKind, ctx: CopyContext, alternatives: number): string {
  const eventBits = [
    `Event title: ${ctx.eventTitle}`,
    ctx.eventDescription ? `Description: ${ctx.eventDescription}` : null,
    ctx.dateText ? `Date: ${ctx.dateText}` : null,
    ctx.venueText ? `Venue: ${ctx.venueText}` : null,
  ].filter(Boolean).join("\n");

  const entityBits = kind === "speaker" || kind === "combo"
    ? [
        ctx.speakerName ? `Speaker name: ${ctx.speakerName}` : null,
        ctx.speakerTitle ? `Speaker role: ${ctx.speakerTitle}` : null,
        ctx.speakerCompany ? `Speaker company: ${ctx.speakerCompany}` : null,
      ].filter(Boolean).join("\n")
    : "";

  const sponsorBits = kind === "sponsor" || kind === "combo"
    ? [
        ctx.sponsorName ? `Sponsor: ${ctx.sponsorName}` : null,
        ctx.sponsorTier ? `Sponsor tier: ${ctx.sponsorTier}` : null,
      ].filter(Boolean).join("\n")
    : "";

  // Match the JSON shape to `CopySuggestion` above so the parser is dumb.
  // Constraints on length are enforced via the natural-language prompt AND
  // sanity-checked in `parseSuggestions` below (over-length outputs are
  // truncated rather than rejected — better a shortened version than a
  // failed generation).
  const jsonShape = kind === "event"
    ? `{"tagline": "≤80 chars, punchy, no emoji", "subtitle": "≤120 chars, one sentence", "ctaLabel": "≤22 chars, action verb", "stats": [{"value": "e.g. 30+", "label": "e.g. Expert Speakers"}]}`
    : kind === "speaker"
    ? `{"tagline": "≤80 chars, e.g. 'Meet our keynote'", "subtitle": "≤120 chars, one sentence teasing the speaker's talk", "ctaLabel": "≤22 chars, e.g. 'Book Your Seat'"}`
    : kind === "sponsor"
    ? `{"tagline": "≤80 chars, e.g. 'Powered by <sponsor>'", "subtitle": "≤120 chars, appreciation-toned one-liner", "ctaLabel": "≤22 chars"}`
    : `{"tagline": "≤80 chars", "subtitle": "≤120 chars, ties the speaker + sponsor to the event", "ctaLabel": "≤22 chars"}`;

  const guidance = kind === "event"
    ? "Include exactly 3 stats — plausible attendee/speaker/session counts derived from context, formatted as ('30+', 'Expert Speakers') style pairs. Never invent numbers larger than reasonable for the event size implied."
    : "";

  return [
    "You are a marketing copywriter for a professional events platform.",
    `Generate ${alternatives} distinct English copy suggestions for a ${kind} social-media creative.`,
    "",
    eventBits,
    entityBits,
    sponsorBits,
    "",
    guidance,
    "",
    "Rules:",
    "- Return ONLY a JSON array of suggestions. No prose, no code fences.",
    "- Each suggestion must match exactly this shape (extra keys are ignored):",
    `  ${jsonShape}`,
    "- Every string must be human-natural — no template placeholders, no {{brackets}}, no emoji.",
    "- Vary the tone across the alternatives (crisp / warm / bold), not the facts.",
  ].filter(Boolean).join("\n");
}

/**
 * Extracts and parses the JSON array of suggestions from Gemini's raw
 * text response. Handles the common "wrapped in ```json fence" case and
 * clamps every string to its documented max length so a single verbose
 * output can't overflow the downstream renderers.
 *
 * Returns an empty array when the response can't be parsed at all — the
 * caller treats that as a `service_outage` failure since we've paid for
 * the Gemini call but got nothing usable.
 */
function parseSuggestions(raw: string): CopySuggestion[] {
  const stripped = raw
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  let arr: unknown;
  try {
    arr = JSON.parse(stripped);
  } catch {
    // Try to find the first `[` and the last `]` — Gemini sometimes
    // wraps the JSON in explanatory prose despite instructions.
    const first = stripped.indexOf("[");
    const last = stripped.lastIndexOf("]");
    if (first >= 0 && last > first) {
      try {
        arr = JSON.parse(stripped.slice(first, last + 1));
      } catch {
        return [];
      }
    } else {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];

  const clamp = (s: unknown, max: number): string =>
    typeof s === "string" ? s.trim().slice(0, max) : "";

  const parsed: CopySuggestion[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const it = item as Record<string, unknown>;
    const tagline = clamp(it.tagline, 80);
    const ctaLabel = clamp(it.ctaLabel, 22);
    if (!tagline || !ctaLabel) continue;
    const subtitle = clamp(it.subtitle, 120) || undefined;
    let stats: CopySuggestion["stats"];
    if (Array.isArray(it.stats)) {
      stats = [];
      for (const s of it.stats.slice(0, 4)) {
        if (!s || typeof s !== "object") continue;
        const rs = s as Record<string, unknown>;
        const value = clamp(rs.value, 12);
        const label = clamp(rs.label, 24);
        if (value && label) stats.push({ value, label });
      }
      if (stats.length === 0) stats = undefined;
    }
    parsed.push({ tagline, ctaLabel, ...(subtitle ? { subtitle } : {}), ...(stats ? { stats } : {}) });
  }
  return parsed;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

  const errorResponse = (status: number, body: ErrorResponseBody): Response =>
    corsJson(body, { status, cors });

  if (req.method !== "POST") {
    return errorResponse(405, { error: "Method not allowed", code: "bad_request" });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch (err) {
    rlog.warn("invalid json body", toErrorFields(err));
    return errorResponse(400, { error: "Invalid JSON body", code: "bad_request" });
  }

  if (
    !body ||
    typeof body.eventId !== "string" ||
    body.eventId.trim().length === 0 ||
    typeof body.kind !== "string" ||
    !ALLOWED_KINDS.has(body.kind as CopyKind) ||
    !body.context ||
    typeof body.context !== "object" ||
    typeof body.context.eventTitle !== "string" ||
    body.context.eventTitle.trim().length === 0
  ) {
    rlog.warn("bad request: missing/invalid required fields");
    return errorResponse(400, {
      error: "eventId, kind, and context.eventTitle are required",
      code: "bad_request",
    });
  }
  if ((body.kind === "speaker" || body.kind === "combo") && !body.context.speakerName?.trim()) {
    return errorResponse(400, {
      error: `context.speakerName is required for kind='${body.kind}'`,
      code: "bad_request",
    });
  }
  if ((body.kind === "sponsor" || body.kind === "combo") && !body.context.sponsorName?.trim()) {
    return errorResponse(400, {
      error: `context.sponsorName is required for kind='${body.kind}'`,
      code: "bad_request",
    });
  }

  const alternatives = Math.max(
    1,
    Math.min(
      MAX_ALTERNATIVES,
      Number.isFinite(body.alternatives) ? Number(body.alternatives) : DEFAULT_ALTERNATIVES,
    ),
  );

  rlog.info("request accepted", {
    event_id: body.eventId,
    kind: body.kind,
    alternatives,
  });

  // ── Configuration ────────────────────────────────────────────────────────
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  const model = Deno.env.get("GEMINI_COPY_MODEL") ?? DEFAULT_COPY_MODEL;
  const quotaRaw = Deno.env.get("GEMINI_COPY_DAILY_QUOTA");
  const quotaParsed = quotaRaw ? Number(quotaRaw) : DEFAULT_DAILY_QUOTA;
  const quota = Number.isFinite(quotaParsed) && quotaParsed > 0 ? quotaParsed : DEFAULT_DAILY_QUOTA;
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!geminiKey || !supabaseUrl || !serviceKey) {
    rlog.error("missing configuration", {
      has_gemini_key: !!geminiKey,
      has_supabase_url: !!supabaseUrl,
      has_service_key: !!serviceKey,
    });
    return errorResponse(500, {
      error: "AI copy generation is not configured",
      code: "configuration",
    });
  }

  // ── Auth ─────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  if (!jwt) {
    return errorResponse(403, { error: "Missing Authorization header", code: "auth" });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    rlog.warn("auth: getUser failed", { error_message: userErr?.message });
    return errorResponse(403, { error: "Not signed in", code: "auth" });
  }
  const userId = userData.user.id;

  const { data: event, error: eventErr } = await supabase
    .from("events")
    .select("user_id")
    .eq("id", body.eventId)
    .maybeSingle();
  if (eventErr || !event) {
    rlog.warn("auth: event not found", { event_id: body.eventId });
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
      return errorResponse(403, { error: "Forbidden", code: "auth" });
    }
    isAdmin = !!hasAdminRole;
  }
  if (!isOwner && !isAdmin) {
    return errorResponse(403, { error: "Forbidden", code: "auth" });
  }

  // ── Quota (per-event daily rolling window) ──────────────────────────────
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: countErr } = await supabase
    .from("event_creative_ai_drafts")
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
    rlog.warn("quota exceeded", { event_id: body.eventId, quota, count: count ?? 0 });
    return errorResponse(429, {
      error: `Per-event daily AI copy quota reached (${quota}/day)`,
      code: "rate_limit",
    });
  }

  // ── Call Gemini text model ───────────────────────────────────────────────
  const prompt = buildPrompt(body.kind, body.context, alternatives);
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  let raw: string;
  try {
    rlog.info("gemini call start", {
      event_id: body.eventId,
      kind: body.kind,
      model,
      prompt_bytes: prompt.length,
    });
    const response = await fetch(
      `${endpoint}?key=${encodeURIComponent(geminiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.85,
            maxOutputTokens: 800,
            responseMimeType: "application/json",
          },
        }),
        signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      },
    );

    if (!response.ok) {
      const errBody = await response.text();
      const excerpt = errBody.slice(0, 500);
      if (response.status === 429) {
        rlog.warn("gemini rate limit", { status: response.status, body_excerpt: excerpt });
        return errorResponse(429, {
          error: "Gemini rate limit reached, try again in a moment",
          code: "rate_limit",
        });
      }
      if (
        response.status === 400 &&
        /safety|polic(y|ies)|blocked|prohibited/i.test(errBody)
      ) {
        return errorResponse(422, {
          error: "Copy request rejected by content policy",
          code: "content_policy",
        });
      }
      if (response.status >= 500) {
        rlog.error("gemini service error", { status: response.status, body_excerpt: excerpt });
        return errorResponse(503, {
          error: "Gemini is temporarily unavailable",
          code: "service_outage",
        });
      }
      rlog.error("gemini bad request", { status: response.status, body_excerpt: excerpt });
      return errorResponse(400, {
        error: "Gemini rejected the request",
        code: "bad_request",
      });
    }

    const json = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      promptFeedback?: { blockReason?: string };
    };
    if (json.promptFeedback?.blockReason) {
      rlog.warn("gemini blockReason", { reason: json.promptFeedback.blockReason });
      return errorResponse(422, {
        error: "Copy request rejected by content policy",
        code: "content_policy",
      });
    }
    const text = json.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("") ?? "";
    if (!text.trim()) {
      rlog.error("gemini empty response");
      return errorResponse(503, {
        error: "Gemini returned no copy",
        code: "service_outage",
      });
    }
    raw = text;
    rlog.info("gemini call ok", { response_bytes: text.length });
  } catch (err) {
    const isTimeout = err instanceof DOMException &&
      (err.name === "TimeoutError" || err.name === "AbortError");
    if (isTimeout) {
      rlog.error("gemini timed out", { timeout_ms: GEMINI_TIMEOUT_MS });
      return errorResponse(503, {
        error: `Gemini didn't respond within ${GEMINI_TIMEOUT_MS}ms`,
        code: "service_outage",
      });
    }
    rlog.error("gemini network error", toErrorFields(err));
    return errorResponse(503, { error: "Couldn't reach Gemini", code: "service_outage" });
  }

  const suggestions = parseSuggestions(raw);
  if (suggestions.length === 0) {
    rlog.error("failed to parse gemini response", { raw_excerpt: raw.slice(0, 400) });
    return errorResponse(503, {
      error: "Couldn't parse the AI response",
      code: "service_outage",
    });
  }

  rlog.info("suggestions parsed", {
    event_id: body.eventId,
    kind: body.kind,
    suggestion_count: suggestions.length,
  });

  // ── Persist drafts ───────────────────────────────────────────────────────
  //
  // One row per suggestion. `source='auto_publish'` rows show up in the
  // review UI immediately; `source='on_demand'` rows stay hidden from
  // the review UI (only surface inline in the composer that fetched
  // them) but still count against the quota so a refresh-happy user
  // can't burn through the Gemini budget by hammering the button.
  const source = body.source === "auto_publish" ? "auto_publish" : "on_demand";
  const insertRows = suggestions.map((s) => ({
    event_id: body.eventId,
    entity_type: body.kind,
    entity_id: body.entityId ?? null,
    copy: s,
    source,
    status: "pending" as const,
    created_by: userId,
  }));

  const { data: inserted, error: insertErr } = await supabase
    .from("event_creative_ai_drafts")
    .insert(insertRows)
    .select("id");
  if (insertErr) {
    rlog.error("insert drafts failed", {
      event_id: body.eventId,
      error_message: insertErr.message,
      error_code: (insertErr as { code?: string }).code,
    });
    // Return the suggestions anyway (fresh Gemini output, don't waste
    // the call) — the caller can still show them in the composer even
    // if we couldn't persist. The draftId field will be missing, which
    // the review-flow UI treats as "on-demand only, no apply button."
    return corsJson(
      { suggestions: suggestions.map((s) => ({ ...s, draftId: "" })) } satisfies SuccessResponse,
      { status: 200, cors },
    );
  }

  const persisted: PersistedSuggestion[] = suggestions.map((s, i) => ({
    ...s,
    draftId: inserted?.[i]?.id ?? "",
  }));

  return corsJson({ suggestions: persisted } satisfies SuccessResponse, { status: 200, cors });
});
