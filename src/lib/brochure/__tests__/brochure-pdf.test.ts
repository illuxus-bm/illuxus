/**
 * Unit tests for `loadImageAsDataUrl`'s never-throw, resolve-`null`-on-any-
 * failure contract. Mocks `fetch` via `vi.stubGlobal("fetch", ...)`,
 * following the same global-`fetch`-stub convention used by
 * `src/lib/observability/__tests__/sendBeacon-flush.test.ts` and
 * `rpc-prefix-debug-prod.test.ts`.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { loadImageAsDataUrl } from "../brochure-pdf";

describe("loadImageAsDataUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves a data URL on a successful fetch", async () => {
    const blob = new Blob(["fake-image-bytes"], { type: "image/png" });
    const fetchMock = vi.fn(async () => new Response(blob, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadImageAsDataUrl("https://example.com/photo.png");

    expect(result).not.toBeNull();
    expect(result).toMatch(/^data:/);
    expect(fetchMock).toHaveBeenCalledWith("https://example.com/photo.png");
  });

  it("resolves null on a non-2xx response, never throws", async () => {
    const fetchMock = vi.fn(async () => new Response("not found", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadImageAsDataUrl("https://example.com/missing.png");

    expect(result).toBeNull();
  });

  it("resolves null when fetch throws a network error, never throws", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network error");
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadImageAsDataUrl("https://example.com/cors-blocked.png")).resolves.toBeNull();
  });

  it("resolves null on a 500 server error", async () => {
    const fetchMock = vi.fn(async () => new Response("boom", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadImageAsDataUrl("https://example.com/error.png");

    expect(result).toBeNull();
  });
});
