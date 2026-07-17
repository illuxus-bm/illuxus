/**
 * Client-side module for the Creative_AI_Backgrounds feature.
 *
 * Owns the shared type surface between the browser and the
 * `generate-creative-background` Edge Function, the five Style_Preset
 * descriptors (Requirement 2.1), the pure prompt composition + normalization
 * helpers (Requirements 2.2–2.5), the deterministic cache-key helper
 * (Requirement 6.1), and the side-effectful `callGenerateBackground` wrapper
 * around `supabase.functions.invoke` (Requirements 3.1, 9.2, 9.4).
 *
 * The types + descriptors + pure helpers (top of file) are free of
 * `supabase.*` / `logger.*` / `console.*` / DOM access so both the
 * confirmation panel (Requirement 8.3) and the Edge Function's mirror
 * computation can consume them without side effects. The client wrapper at
 * the bottom of the file DOES depend on the Supabase singleton and the
 * observability layer, and is the single caller into the Edge Function
 * from the browser.
 *
 * The `computeCacheKey` output MUST match the Edge Function's
 * `computeCacheKey` in `supabase/functions/generate-creative-background/
 * index.ts` byte-for-byte — Property 20 (in
 * `__tests__/property-20-cache-key-deterministic.pbt.test.ts`, Task 3.2)
 * pins that invariant by transcribing a mirror of the server implementation.
 */

import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/observability";

// ─── Public types ────────────────────────────────────────────────────────────

/**
 * The five Style_Preset options a Creative_AI_Background generation can be
 * built from (Requirement 2.1). Each key maps to a `StylePresetDescriptor`
 * in `STYLE_PRESET_DESCRIPTORS` supplying the `descriptiveText` phrase, the
 * fallback primary color, and the fallback accent color used when the
 * event's `page_config.theme` colors are undefined (Requirement 2.4).
 */
export type StylePreset =
  | "abstract-gradient"
  | "minimal-geometric"
  | "elegant-floral"
  | "corporate"
  | "tech-mesh";

/**
 * The four Aspect_Ratio_Selection options a Creative_AI_Background can be
 * generated at (Requirement 5.1). Each value matches Gemini's Imagen API's
 * accepted `aspectRatio` parameter verbatim so no client→provider mapping
 * table is needed. One generation is reused across every selected
 * Platform_Format for a Creative export (design decision #6).
 */
export type AspectRatio = "1:1" | "16:9" | "9:16" | "4:3";

/**
 * Request body posted to the `generate-creative-background` Edge Function.
 * `promptText` is the fully-composed prompt from `buildResolvedPrompt`; the
 * server re-normalizes it (`.trim().toLowerCase()`) and hashes into a
 * cache key via `computeCacheKey` before optionally calling Gemini
 * (Requirements 2.5, 6.1, 6.2).
 */
export interface AiBackgroundRequest {
  eventId: string;
  promptText: string;
  stylePreset: StylePreset;
  aspectRatio: AspectRatio;
}

/**
 * Success response body from the Edge Function. `fromCache: true` indicates
 * the row was resolved from `event_creative_backgrounds` without invoking
 * Gemini (Requirement 6.2); `fromCache: false` indicates a fresh Gemini
 * call + PNG upload + row insert path (Requirement 6.3).
 */
export interface AiBackgroundResponse {
  assetUrl: string;
  storagePath: string;
  cacheKey: string;
  fromCache: boolean;
}

/**
 * The failure-category enum mirrored between the Edge Function's error
 * response body and the client-side `AiBackgroundError` thrown by
 * `callGenerateBackground` (Task 2.2). The Creative_Generator UI selects a
 * category-specific toast message from this value (Requirements 9.2, 10.2).
 *
 * The category-to-HTTP-status mapping is documented in
 * `.kiro/specs/creative-ai-backgrounds/design.md`'s "Failure category
 * mapping" table.
 */
export type AiBackgroundErrorCode =
  | "network"
  | "rate_limit"
  | "content_policy"
  | "service_outage"
  | "configuration"
  | "auth"
  | "bad_request";

/**
 * Thrown by `callGenerateBackground` (Task 2.2) on any non-2xx response
 * from the Edge Function, carrying the propagated `AiBackgroundErrorCode`
 * so the calling UI can pick the correct toast message. Defined here so
 * consumers of this pure module (property tests, the AI panel's error
 * handling type predicates) can reference the class without needing the
 * client wrapper's side-effectful imports.
 */
export class AiBackgroundError extends Error {
  readonly code: AiBackgroundErrorCode;

  constructor(message: string, code: AiBackgroundErrorCode) {
    super(message);
    this.name = "AiBackgroundError";
    this.code = code;
  }
}

// ─── Style_Preset descriptors (Requirements 2.1, 2.2, 2.4) ───────────────────

/**
 * The static descriptor for a single Style_Preset. `descriptiveText` is the
 * phrase spliced into every resolved prompt built from this preset
 * (Property 22 guarantee #1); the two color fields are substituted into the
 * resolved prompt when the event's `Event_Theme.primaryColor` /
 * `accentColor` are undefined so the Gemini call never receives an empty
 * color reference (Requirement 2.4).
 */
export interface StylePresetDescriptor {
  descriptiveText: string;
  defaultPrimaryColor: string;
  defaultAccentColor: string;
}

/**
 * Style_Preset → descriptor map. The keys are the full `StylePreset` union,
 * so TypeScript's `Record<StylePreset, ...>` catches any preset added to
 * the union without a matching descriptor at compile time. Re-exported as
 * `STYLE_PRESET_DESCRIPTORS_FOR_TEST` for property tests (Task 3.3) so
 * assertions can reference the exact strings without hardcoding.
 */
export const STYLE_PRESET_DESCRIPTORS: Record<StylePreset, StylePresetDescriptor> = {
  "abstract-gradient": {
    descriptiveText:
      "smooth abstract gradient background with soft light diffusion and no text",
    defaultPrimaryColor: "#4338ca",
    defaultAccentColor: "#7c3aed",
  },
  "minimal-geometric": {
    descriptiveText:
      "minimal geometric composition of clean shapes and thin lines, generous negative space, no text",
    defaultPrimaryColor: "#0f172a",
    defaultAccentColor: "#64748b",
  },
  "elegant-floral": {
    descriptiveText:
      "elegant hand-drawn floral background with delicate botanicals and soft watercolor washes, no text",
    defaultPrimaryColor: "#831843",
    defaultAccentColor: "#f9a8d4",
  },
  corporate: {
    descriptiveText:
      "clean corporate background with subtle depth and understated professional palette, no text",
    defaultPrimaryColor: "#1e3a8a",
    defaultAccentColor: "#64748b",
  },
  "tech-mesh": {
    descriptiveText:
      "tech-inspired mesh background with fine grid lines, glowing node points, and dark base tones, no text",
    defaultPrimaryColor: "#0ea5e9",
    defaultAccentColor: "#22d3ee",
  },
};

/**
 * Alias of `STYLE_PRESET_DESCRIPTORS` exported for use in property tests
 * (Task 3.3). The name is deliberately verbose so it reads clearly as a
 * test-facing symbol in imports and doesn't get pulled into UI code paths
 * by autocomplete. Property tests use this to assert the exact
 * `descriptiveText` / default-color substrings without duplicating the
 * literals.
 */
export const STYLE_PRESET_DESCRIPTORS_FOR_TEST = STYLE_PRESET_DESCRIPTORS;

/**
 * The five Style_Preset identifiers as a readonly tuple, for iteration
 * (e.g. building the preset selector's `<option>` list) and for property
 * tests that need to sample the union uniformly.
 */
export const STYLE_PRESETS: readonly StylePreset[] = [
  "abstract-gradient",
  "minimal-geometric",
  "elegant-floral",
  "corporate",
  "tech-mesh",
] as const;

/**
 * The four Aspect_Ratio_Selection values as a readonly tuple. Same rationale
 * as `STYLE_PRESETS` — iteration for the selector UI, sampling for tests.
 */
export const ASPECT_RATIOS: readonly AspectRatio[] = [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
] as const;

// ─── Pure helpers ────────────────────────────────────────────────────────────

/**
 * Composes the resolved Gemini prompt from the Style_Preset descriptor, the
 * event's theme colors (with Style_Preset-supplied defaults when undefined,
 * Requirement 2.4), the event's title, and an optional organizer-typed
 * custom-prompt override (appended, not replacing the preset-derived text —
 * Requirement 2.3). Pure — used both by the confirmation panel
 * (Requirement 8.3, to show exactly what will be generated) and by
 * `callGenerateBackground` (Task 2.2, to send).
 *
 * Content guarantees checked by Property 22
 * (`__tests__/property-22-resolved-prompt-composition.pbt.test.ts`,
 * Task 3.3):
 *  1. The Style_Preset's `descriptiveText` always appears in the result.
 *  2. At least one color reference appears — the theme value when defined,
 *     the preset's default color otherwise.
 *  3. When `eventTitle` (post-trim) is non-empty, it appears in the result.
 *  4. When `customPromptText` (post-trim) is non-empty, it appears in the
 *     result and never replaces the descriptive text from clause #1.
 */
export function buildResolvedPrompt(
  stylePreset: StylePreset,
  primaryColor: string | undefined,
  accentColor: string | undefined,
  eventTitle: string,
  customPromptText?: string,
): string {
  const descriptor = STYLE_PRESET_DESCRIPTORS[stylePreset];
  const resolvedPrimary = primaryColor ?? descriptor.defaultPrimaryColor;
  const resolvedAccent = accentColor ?? descriptor.defaultAccentColor;
  const trimmedTitle = eventTitle.trim();
  const trimmedCustom = customPromptText?.trim() ?? "";

  const parts: string[] = [
    descriptor.descriptiveText,
    `dominant color ${resolvedPrimary}`,
    `accent color ${resolvedAccent}`,
  ];
  if (trimmedTitle.length > 0) {
    parts.push(`themed around the event "${trimmedTitle}"`);
  }
  if (trimmedCustom.length > 0) {
    parts.push(trimmedCustom);
  }
  parts.push("high resolution, no text overlay, no watermark, no logo");

  return parts.join(", ");
}

/**
 * Normalizes a prompt for cache-key computation: trim leading/trailing
 * whitespace, then lowercase (Requirement 2.5). Pure. The Edge Function
 * applies the exact same transformation before its own `computeCacheKey`
 * call — see `supabase/functions/generate-creative-background/index.ts`,
 * step 5 ("Cache lookup") — so two requests differing only in casing or
 * surrounding whitespace resolve to the same `Background_Cache_Key`.
 */
export function normalizePrompt(text: string): string {
  return text.trim().toLowerCase();
}

/**
 * Deterministic Background_Cache_Key (Requirement 6.1). The client and the
 * Edge Function MUST produce byte-identical keys for identical inputs —
 * Property 20 (`__tests__/property-20-cache-key-deterministic.pbt.test.ts`,
 * Task 3.2) pins that invariant by transcribing a locally-mirrored copy of
 * the server implementation and asserting equality across arbitrary inputs.
 *
 * Uses `\x1f` (ASCII Unit Separator) as the field delimiter rather than a
 * cryptographic hash. Rationale:
 *   1. A stable concatenated string is easier to reason about and to debug
 *      from Postgres than an opaque hash.
 *   2. Total length stays well below Postgres text-column limits — even a
 *      400-char normalized prompt puts the key at ~500 chars, far under any
 *      practical limit for the `UNIQUE (event_id, cache_key)` index on
 *      `public.event_creative_backgrounds`.
 *   3. `\x1f` cannot appear in a `normalizePrompt` output (`.trim()` +
 *      `.toLowerCase()` on a typical prompt never produce it), and the
 *      other three components (a UUID `eventId`, a Style_Preset literal,
 *      an Aspect_Ratio literal) don't produce it either, so the field
 *      boundaries can't collide with any component's contents.
 *
 * NOTE: `normalizedPrompt` is passed as an already-normalized string — the
 * caller is expected to have invoked `normalizePrompt` first. This keeps
 * `computeCacheKey` symmetrical with the Edge Function's own
 * `computeCacheKey`, which also receives an already-normalized prompt from
 * its calling code (see the design's "Cache lookup" step in the Edge
 * Function pseudocode).
 */
export function computeCacheKey(
  eventId: string,
  normalizedPrompt: string,
  stylePreset: StylePreset,
  aspectRatio: AspectRatio,
): string {
  return [eventId, normalizedPrompt, stylePreset, aspectRatio].join("\x1f");
}

// ─── Client wrapper ──────────────────────────────────────────────────────────

/**
 * The `AiBackgroundErrorCode` values as a `ReadonlySet` — used to validate a
 * raw string from the Edge Function's error body before it's threaded into
 * an `AiBackgroundError`. Any string not present here is treated as an
 * unknown code and coerced to `"service_outage"` (the safe-default per the
 * design's "Failure category mapping" table — any infrastructure-side
 * non-2xx that we cannot further classify).
 */
const KNOWN_AI_BACKGROUND_ERROR_CODES: ReadonlySet<AiBackgroundErrorCode> =
  new Set<AiBackgroundErrorCode>([
    "network",
    "rate_limit",
    "content_policy",
    "service_outage",
    "configuration",
    "auth",
    "bad_request",
  ]);

/**
 * Coerces an arbitrary value (the `code` field from the Edge Function's
 * error body, which is `unknown` at deserialization time) into a valid
 * `AiBackgroundErrorCode`. Unknown / missing / non-string values fall back
 * to `"service_outage"` per the task's "unknown → service_outage" contract.
 */
function coerceAiBackgroundErrorCode(raw: unknown): AiBackgroundErrorCode {
  return typeof raw === "string" &&
    KNOWN_AI_BACKGROUND_ERROR_CODES.has(raw as AiBackgroundErrorCode)
    ? (raw as AiBackgroundErrorCode)
    : "service_outage";
}

/**
 * Best-effort correlation-id generator for a single AI background
 * invocation. The id is sent to the Edge Function as `x-correlation-id`
 * and stamped into the client-side failure log record so a support
 * engineer can join the two sides of the call by a single value —
 * mirrors the pattern in `src/lib/observability/rpc.ts` (`newCorrelationId`),
 * kept locally here so `creative-ai.ts` doesn't reach into the observability
 * layer's internals.
 *
 * Prefers `crypto.randomUUID()` and falls back to a `Math.random`-based
 * token so the wrapper still behaves in the (rare) legacy runtime that
 * omits `randomUUID`. Never throws — a failed lookup lands in the fallback.
 */
function newAiBackgroundCorrelationId(): string {
  try {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through to the Math.random fallback */
  }
  return `ai-bg-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

/**
 * Invokes the `generate-creative-background` Edge Function with a resolved
 * `AiBackgroundRequest` and returns the parsed `AiBackgroundResponse` on
 * success (Requirement 3.1).
 *
 * ## Failure handling (Requirement 9.2)
 *
 * On any non-success outcome, throws an `AiBackgroundError` whose `code`
 * matches the Edge Function's response body `code` field so the calling UI
 * can select the appropriate toast message. The failure taxonomy tracks
 * the design's "Failure category mapping" table:
 *
 *   - **`FunctionsFetchError`** (transport-level: DNS / TCP / TLS / offline)
 *     → `code = "network"` — there is no response body to parse.
 *   - **`FunctionsHttpError` / `FunctionsRelayError`** (non-2xx response
 *     from the Edge Function) → deserialize `error.context.json()`, take
 *     the `code` field verbatim when it's a known
 *     `AiBackgroundErrorCode`, and fall back to `"service_outage"` when
 *     the body is malformed, empty, or carries an unknown code.
 *   - **Structurally malformed 2xx** (empty `data` after `invoke`) →
 *     `code = "service_outage"`.
 *
 * ## Logging (Requirement 9.4)
 *
 * Every failure branch calls `logger.error("ai background generation
 * failed", ...)` from `@/lib/observability` with:
 *
 *   - `event_id`         — from `request.eventId`
 *   - `style_preset`     — from `request.stylePreset`
 *   - `aspect_ratio`     — from `request.aspectRatio`
 *   - `correlation_id`   — the same id sent as the request header
 *   - `code`             — the resolved `AiBackgroundErrorCode`
 *   - `error_message`    — the normalized human message
 *
 * The `logger.error` call is the ONLY logging site — no `console.*` calls
 * anywhere in this wrapper, per the project's hard `no-console: error`
 * ESLint rule (`.kiro/steering/project-overview.md`).
 *
 * ## Correlation id
 *
 * A fresh UUID is minted per invocation and sent as the `x-correlation-id`
 * request header. `supabase.functions.invoke` doesn't natively thread the
 * observability layer's `runWithCorrelationId` scope through its internal
 * `await` chain (its `FunctionsClient.invoke` is an `async` function which
 * routes through V8's `PerformPromiseThen` and bypasses the observability
 * layer's `Promise.then` patch — see the architectural note in
 * `src/lib/observability/rpc.ts`). Passing the id explicitly on the header
 * AND stamping it into the log record gives the operator the same
 * client↔server join key without needing the promise-patch machinery.
 */
export async function callGenerateBackground(
  request: AiBackgroundRequest,
): Promise<AiBackgroundResponse> {
  const correlationId = newAiBackgroundCorrelationId();

  const { data, error } = await supabase.functions.invoke<
    AiBackgroundResponse & { error?: string; code?: AiBackgroundErrorCode }
  >("generate-creative-background", {
    body: request,
    headers: { "x-correlation-id": correlationId },
  });

  if (error) {
    // Introspect the `FunctionsError` subclass returned by supabase-js.
    // `FunctionsFetchError` → transport failure, no body to parse.
    // `FunctionsHttpError` / `FunctionsRelayError` → `.context` is a
    // `Response` whose body is `{ error, code }` (the `corsJson(...)` shape
    // from `supabase/functions/generate-creative-background/index.ts`).
    const errorName = (error as { name?: unknown }).name;
    const rawMessage = (error as { message?: unknown }).message;
    const context = (error as { context?: unknown }).context;

    const baseMessage =
      typeof rawMessage === "string" && rawMessage.length > 0
        ? rawMessage
        : "AI background generation failed";

    let code: AiBackgroundErrorCode;
    let resolvedMessage = baseMessage;

    const looksLikeResponse =
      !!context &&
      typeof (context as { json?: unknown }).json === "function";

    if (errorName === "FunctionsFetchError" || !looksLikeResponse) {
      // Transport-layer failure — the SDK never received a Response.
      code = "network";
    } else {
      try {
        const parsed = (await (context as Response).json()) as {
          error?: unknown;
          code?: unknown;
        } | null;
        code = coerceAiBackgroundErrorCode(parsed?.code);
        if (
          parsed &&
          typeof parsed.error === "string" &&
          parsed.error.length > 0
        ) {
          resolvedMessage = parsed.error;
        }
      } catch {
        // Body wasn't valid JSON — treat as an infra-side failure that
        // we couldn't classify further. Per the "unknown → service_outage"
        // contract, this is the safe default.
        code = "service_outage";
      }
    }

    logger.error("ai background generation failed", {
      event_id: request.eventId,
      style_preset: request.stylePreset,
      aspect_ratio: request.aspectRatio,
      correlation_id: correlationId,
      code,
      error_message: resolvedMessage,
    });

    throw new AiBackgroundError(resolvedMessage, code);
  }

  if (!data) {
    // The Edge Function contract always returns a JSON body on 2xx
    // (see `corsJson(...)` in the function's `index.ts`), so an empty
    // `data` here means the response was structurally malformed —
    // classify as `service_outage` (infra-side) so the caller's toast
    // routes to the same "try again" path as other infra failures.
    const resolvedMessage = "Empty response from generate-creative-background";
    logger.error("ai background generation failed", {
      event_id: request.eventId,
      style_preset: request.stylePreset,
      aspect_ratio: request.aspectRatio,
      correlation_id: correlationId,
      code: "service_outage",
      error_message: resolvedMessage,
    });
    throw new AiBackgroundError(resolvedMessage, "service_outage");
  }

  return data;
}
