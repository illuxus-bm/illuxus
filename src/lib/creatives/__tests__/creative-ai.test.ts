// Feature: creative-ai-backgrounds — Unit tests for `creative-ai.ts` (task 3.1)
//
// Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 6.1, 9.2, 9.4, 10.1
//
// Covers `buildResolvedPrompt`, `normalizePrompt`, `computeCacheKey` (pure
// helpers) and `callGenerateBackground` (the `supabase.functions.invoke`
// wrapper, mocked here since there is no live Supabase project in this
// environment — same hoisted-mock pattern as
// `creative-storage.integration.test.ts`).

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: mocks.invoke,
    },
  },
}));

vi.mock("@/lib/observability", () => ({
  logger: {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  },
}));

import {
  AiBackgroundError,
  type AiBackgroundErrorCode,
  type AiBackgroundRequest,
  buildResolvedPrompt,
  callGenerateBackground,
  computeCacheKey,
  normalizePrompt,
  STYLE_PRESET_DESCRIPTORS_FOR_TEST,
} from "../creative-ai";
import { logger } from "@/lib/observability";

// ---------------------------------------------------------------------------
// buildResolvedPrompt
// ---------------------------------------------------------------------------

describe("buildResolvedPrompt", () => {
  it("happy path — includes descriptive text, both theme colors, title, and custom prompt", () => {
    const result = buildResolvedPrompt(
      "abstract-gradient",
      "#111111",
      "#222222",
      "My Great Event",
      "add some sparkles"
    );

    expect(result).toContain(
      STYLE_PRESET_DESCRIPTORS_FOR_TEST["abstract-gradient"].descriptiveText
    );
    expect(result).toContain("dominant color #111111");
    expect(result).toContain("accent color #222222");
    expect(result).toContain('themed around the event "My Great Event"');
    expect(result).toContain("add some sparkles");
  });

  it("falls back to preset defaults when both theme colors are undefined", () => {
    const descriptor = STYLE_PRESET_DESCRIPTORS_FOR_TEST["minimal-geometric"];
    const result = buildResolvedPrompt(
      "minimal-geometric",
      undefined,
      undefined,
      "Some Event"
    );

    expect(result).toContain(`dominant color ${descriptor.defaultPrimaryColor}`);
    expect(result).toContain(`accent color ${descriptor.defaultAccentColor}`);
  });

  it("falls back only the accent color when only accent is undefined", () => {
    const descriptor = STYLE_PRESET_DESCRIPTORS_FOR_TEST["corporate"];
    const result = buildResolvedPrompt(
      "corporate",
      "#abcabc",
      undefined,
      "Some Event"
    );

    expect(result).toContain("dominant color #abcabc");
    expect(result).toContain(`accent color ${descriptor.defaultAccentColor}`);
  });

  it("omits the title clause when eventTitle is empty", () => {
    const withTitle = buildResolvedPrompt(
      "tech-mesh",
      "#000000",
      "#ffffff",
      "Non Empty Title"
    );
    const withoutTitle = buildResolvedPrompt(
      "tech-mesh",
      "#000000",
      "#ffffff",
      ""
    );

    expect(withTitle).toContain("themed around the event");
    expect(withoutTitle).not.toContain("themed around the event");
  });

  it("appends the custom prompt without replacing the descriptive text", () => {
    const descriptor = STYLE_PRESET_DESCRIPTORS_FOR_TEST["elegant-floral"];
    const result = buildResolvedPrompt(
      "elegant-floral",
      "#831843",
      "#f9a8d4",
      "Garden Party",
      "make it extra whimsical"
    );

    // Original descriptive text is still present (not replaced).
    expect(result).toContain(descriptor.descriptiveText);
    // Custom text is appended alongside it.
    expect(result).toContain("make it extra whimsical");
  });

  it("is a no-op for an empty or whitespace-only custom prompt", () => {
    const withEmptyCustom = buildResolvedPrompt(
      "corporate",
      "#1e3a8a",
      "#64748b",
      "Quarterly Summit",
      "   "
    );
    const withUndefinedCustom = buildResolvedPrompt(
      "corporate",
      "#1e3a8a",
      "#64748b",
      "Quarterly Summit",
      undefined
    );
    const withNoCustomArg = buildResolvedPrompt(
      "corporate",
      "#1e3a8a",
      "#64748b",
      "Quarterly Summit"
    );

    expect(withEmptyCustom).toBe(withUndefinedCustom);
    expect(withEmptyCustom).toBe(withNoCustomArg);
  });
});

// ---------------------------------------------------------------------------
// normalizePrompt
// ---------------------------------------------------------------------------

describe("normalizePrompt", () => {
  it("trims and lowercases", () => {
    expect(normalizePrompt("  Hello WORLD  ")).toBe("hello world");
  });

  it("returns an empty string for an empty input", () => {
    expect(normalizePrompt("")).toBe("");
  });

  it("returns an empty string for a whitespace-only input", () => {
    expect(normalizePrompt("   \t\n  ")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// computeCacheKey
// ---------------------------------------------------------------------------

describe("computeCacheKey", () => {
  const base = {
    eventId: "11111111-1111-4111-8111-111111111111",
    normalizedPrompt: "a normalized prompt",
    stylePreset: "abstract-gradient" as const,
    aspectRatio: "1:1" as const,
  };

  it("produces the same key for the same inputs", () => {
    const key1 = computeCacheKey(
      base.eventId,
      base.normalizedPrompt,
      base.stylePreset,
      base.aspectRatio
    );
    const key2 = computeCacheKey(
      base.eventId,
      base.normalizedPrompt,
      base.stylePreset,
      base.aspectRatio
    );
    expect(key1).toBe(key2);
  });

  it("changes when eventId changes, holding the rest constant", () => {
    const key1 = computeCacheKey(
      base.eventId,
      base.normalizedPrompt,
      base.stylePreset,
      base.aspectRatio
    );
    const key2 = computeCacheKey(
      "22222222-2222-4222-8222-222222222222",
      base.normalizedPrompt,
      base.stylePreset,
      base.aspectRatio
    );
    expect(key1).not.toBe(key2);
  });

  it("changes when normalizedPrompt changes, holding the rest constant", () => {
    const key1 = computeCacheKey(
      base.eventId,
      base.normalizedPrompt,
      base.stylePreset,
      base.aspectRatio
    );
    const key2 = computeCacheKey(
      base.eventId,
      "a different prompt",
      base.stylePreset,
      base.aspectRatio
    );
    expect(key1).not.toBe(key2);
  });

  it("changes when stylePreset changes, holding the rest constant", () => {
    const key1 = computeCacheKey(
      base.eventId,
      base.normalizedPrompt,
      base.stylePreset,
      base.aspectRatio
    );
    const key2 = computeCacheKey(
      base.eventId,
      base.normalizedPrompt,
      "corporate",
      base.aspectRatio
    );
    expect(key1).not.toBe(key2);
  });

  it("changes when aspectRatio changes, holding the rest constant", () => {
    const key1 = computeCacheKey(
      base.eventId,
      base.normalizedPrompt,
      base.stylePreset,
      base.aspectRatio
    );
    const key2 = computeCacheKey(
      base.eventId,
      base.normalizedPrompt,
      base.stylePreset,
      "16:9"
    );
    expect(key1).not.toBe(key2);
  });
});

// ---------------------------------------------------------------------------
// callGenerateBackground
// ---------------------------------------------------------------------------

describe("callGenerateBackground", () => {
  const request: AiBackgroundRequest = {
    eventId: "11111111-1111-4111-8111-111111111111",
    promptText: "a resolved prompt",
    stylePreset: "abstract-gradient",
    aspectRatio: "1:1",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeHttpError(code: AiBackgroundErrorCode, message = "failed") {
    return {
      name: "FunctionsHttpError",
      message,
      context: {
        json: async () => ({ error: message, code }),
      },
    };
  }

  function makeFetchError(message = "network unreachable") {
    return {
      name: "FunctionsFetchError",
      message,
      context: undefined,
    };
  }

  it("returns the parsed response on success (cache miss)", async () => {
    const response = {
      assetUrl: "https://example.com/bg.png",
      storagePath: "ai-backgrounds/event-1/key.png",
      cacheKey: "cache-key",
      fromCache: false,
    };
    mocks.invoke.mockResolvedValue({ data: response, error: null });

    const result = await callGenerateBackground(request);

    expect(result).toEqual(response);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    const [fnName, options] = mocks.invoke.mock.calls[0];
    expect(fnName).toBe("generate-creative-background");
    expect(options.body).toEqual(request);
  });

  it("returns the parsed response on success (cache hit)", async () => {
    const response = {
      assetUrl: "https://example.com/bg.png",
      storagePath: "ai-backgrounds/event-1/key.png",
      cacheKey: "cache-key",
      fromCache: true,
    };
    mocks.invoke.mockResolvedValue({ data: response, error: null });

    const result = await callGenerateBackground(request);

    expect(result).toEqual(response);
  });

  const failureCategories: AiBackgroundErrorCode[] = [
    "rate_limit",
    "content_policy",
    "service_outage",
    "configuration",
    "auth",
  ];

  it.each(failureCategories)(
    "throws AiBackgroundError with code=%s and logs via logger.error",
    async (code) => {
      mocks.invoke.mockResolvedValue({
        data: null,
        error: makeHttpError(code, `${code} happened`),
      });

      let caught: unknown;
      try {
        await callGenerateBackground(request);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(AiBackgroundError);
      expect((caught as AiBackgroundError).code).toBe(code);
      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith(
        "ai background generation failed",
        expect.objectContaining({
          event_id: request.eventId,
          style_preset: request.stylePreset,
          aspect_ratio: request.aspectRatio,
          code,
        })
      );
    }
  );

  it("throws AiBackgroundError with code=network for a transport-level failure", async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: makeFetchError(),
    });

    let caught: unknown;
    try {
      await callGenerateBackground(request);
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(AiBackgroundError);
    expect((caught as AiBackgroundError).code).toBe("network");
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      "ai background generation failed",
      expect.objectContaining({ code: "network" })
    );
  });
});
