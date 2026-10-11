// Unit tests for src/lib/image-loader.ts — the fallbacks that keep an image
// on a brochure or creative when a plain CORS load fails.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetCanvasImageCacheForTests, cacheBustedUrl, isInlineImageUrl, loadCanvasImage } from "../image-loader";

interface Attempt {
  src: string;
  cors: boolean;
}

/** Replaces `window.Image` with one whose loads succeed or fail as `decide` says. */
function stubImages(decide: (attempt: Attempt) => boolean): Attempt[] {
  const attempts: Attempt[] = [];
  class FakeImage {
    crossOrigin: string | null = null;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(value: string) {
      const attempt = { src: value, cors: this.crossOrigin === "anonymous" };
      attempts.push(attempt);
      queueMicrotask(() => (decide(attempt) ? this.onload?.() : this.onerror?.()));
    }
  }
  vi.stubGlobal("Image", FakeImage);
  window.Image = FakeImage as unknown as typeof window.Image;
  return attempts;
}

const URL_A = "https://cdn.test/photo.jpg";

describe("loadCanvasImage", () => {
  const RealImage = window.Image;
  beforeEach(() => __resetCanvasImageCacheForTests());
  afterEach(() => {
    vi.unstubAllGlobals();
    window.Image = RealImage;
  });

  it("uses the plain CORS load when it works", async () => {
    const attempts = stubImages(() => true);
    const result = await loadCanvasImage(URL_A);
    expect(result?.exportable).toBe(true);
    expect(attempts).toEqual([{ src: URL_A, cors: true }]);
  });

  it("retries past the cache when the first CORS load fails", async () => {
    const attempts = stubImages(({ src }) => src !== URL_A);
    const result = await loadCanvasImage(URL_A);
    expect(result?.exportable).toBe(true);
    expect(attempts).toEqual([
      { src: URL_A, cors: true },
      { src: `${URL_A}?cors=1`, cors: true },
    ]);
  });

  it("still shows an image whose host sends no CORS headers, marked as not exportable", async () => {
    const attempts = stubImages(({ cors }) => !cors);
    const result = await loadCanvasImage(URL_A);
    expect(result).not.toBeNull();
    expect(result?.exportable).toBe(false);
    expect(attempts[attempts.length - 1]).toEqual({ src: URL_A, cors: false });
  });

  it("resolves null, never rejects, when the image cannot be loaded at all", async () => {
    stubImages(() => false);
    await expect(loadCanvasImage(URL_A)).resolves.toBeNull();
    await expect(loadCanvasImage("")).resolves.toBeNull();
  });

  it("loads inline images without CORS and treats them as exportable", async () => {
    const attempts = stubImages(() => true);
    const result = await loadCanvasImage("data:image/png;base64,AAAA");
    expect(result?.exportable).toBe(true);
    expect(attempts).toEqual([{ src: "data:image/png;base64,AAAA", cors: false }]);
  });

  it("shares one load between callers, but tries again after a failure", async () => {
    let working = false;
    const attempts = stubImages(() => working);
    expect(await loadCanvasImage(URL_A)).toBeNull();
    const failed = attempts.length;
    working = true;
    const [a, b] = await Promise.all([loadCanvasImage(URL_A), loadCanvasImage(URL_A)]);
    expect(a).not.toBeNull();
    expect(a).toBe(b);
    expect(attempts.length).toBe(failed + 1);
  });
});

describe("url helpers", () => {
  it("adds the cache-busting parameter without breaking the URL", () => {
    expect(cacheBustedUrl("https://a.test/x.png")).toBe("https://a.test/x.png?cors=1");
    expect(cacheBustedUrl("https://a.test/x.png?v=2")).toBe("https://a.test/x.png?v=2&cors=1");
    expect(cacheBustedUrl("https://a.test/x.png#frag")).toBe("https://a.test/x.png?cors=1#frag");
  });

  it("recognises inline images", () => {
    expect(isInlineImageUrl("data:image/svg+xml;utf8,<svg/>")).toBe(true);
    expect(isInlineImageUrl("blob:https://a.test/1")).toBe(true);
    expect(isInlineImageUrl("https://a.test/x.png")).toBe(false);
  });
});
