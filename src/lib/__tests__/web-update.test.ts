import { afterEach, describe, expect, it, vi } from "vitest";

import { canReloadAt, fetchLatestBuild, isNewerBuild, isSafeToReload, parseBuildInfo } from "../web-update";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("parseBuildInfo", () => {
  it("reads the build a deploy names", () => {
    expect(parseBuildInfo({ build: "b5a0583.mh2k9x1" })).toBe("b5a0583.mh2k9x1");
  });

  it("rejects anything else", () => {
    expect(parseBuildInfo(null)).toBeNull();
    expect(parseBuildInfo("b5a0583")).toBeNull();
    expect(parseBuildInfo({ build: 3 })).toBeNull();
    expect(parseBuildInfo({ build: "<script>" })).toBeNull();
  });
});

describe("fetchLatestBuild", () => {
  it("asks past every cache", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ build: "abc.1" }));
    expect(await fetchLatestBuild(fetchImpl as unknown as typeof fetch)).toBe("abc.1");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/^\/version\.json\?t=\d+$/);
    expect(init.cache).toBe("no-store");
  });

  it("gives up quietly offline, on errors, and on an HTML fallback", async () => {
    const offline = vi.fn(async () => { throw new TypeError("offline"); });
    expect(await fetchLatestBuild(offline as unknown as typeof fetch)).toBeNull();
    const missing = vi.fn(async () => new Response("nope", { status: 404 }));
    expect(await fetchLatestBuild(missing as unknown as typeof fetch)).toBeNull();
    const html = vi.fn(async () => new Response("<!doctype html>", { status: 200 }));
    expect(await fetchLatestBuild(html as unknown as typeof fetch)).toBeNull();
  });
});

describe("isNewerBuild", () => {
  it("is true only for a different, known build", () => {
    expect(isNewerBuild("b.2", "a.1")).toBe(true);
    expect(isNewerBuild("a.1", "a.1")).toBe(false);
    expect(isNewerBuild(null, "a.1")).toBe(false);
    // A dev server never reloads itself.
    expect(isNewerBuild("b.2", "dev")).toBe(false);
  });
});

describe("when a reload is harmless", () => {
  it("is safe on an idle page", () => {
    document.body.innerHTML = `<main><h1>Events</h1><input type="search" value="design"></main>`;
    expect(isSafeToReload()).toBe(true);
  });

  it("waits while someone is typing or has unsent text", () => {
    document.body.innerHTML = `<textarea></textarea>`;
    document.querySelector("textarea")!.focus();
    expect(isSafeToReload()).toBe(false);

    document.body.innerHTML = `<textarea>half a post</textarea>`;
    expect(isSafeToReload()).toBe(false);

    document.body.innerHTML = `<input type="email" value="me@example.com">`;
    expect(isSafeToReload()).toBe(false);
  });

  it("waits while a dialog is open", () => {
    document.body.innerHTML = `<div role="dialog">Edit ticket</div>`;
    expect(isSafeToReload()).toBe(false);
  });

  it("isn't held back by a non-modal banner", () => {
    document.body.innerHTML = `<div role="dialog" aria-modal="false" aria-labelledby="cookie-banner-title">We use cookies</div>`;
    expect(isSafeToReload()).toBe(true);
  });

  it("never interrupts a playing video or call, even on a page change", () => {
    document.body.innerHTML = `<video></video>`;
    const video = document.querySelector("video")!;
    Object.defineProperty(video, "paused", { value: false });
    expect(isSafeToReload()).toBe(false);
    expect(canReloadAt("navigation")).toBe(false);
  });

  it("on a page change, ignores the form left behind", () => {
    document.body.innerHTML = `<textarea>old page's text</textarea>`;
    expect(canReloadAt("navigation")).toBe(true);
    expect(canReloadAt("fresh")).toBe(false);
  });
});
