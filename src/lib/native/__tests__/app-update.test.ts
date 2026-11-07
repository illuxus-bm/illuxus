import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { compareVersions, fetchAppConfig, parseAppConfig, updateRequired } from "../app-update";

describe("compareVersions", () => {
  it("compares each number, not the text", () => {
    expect(compareVersions("1.10.0", "1.9.2")).toBe(1);
    expect(compareVersions("1.2.0", "1.2.1")).toBe(-1);
    expect(compareVersions("2.0.0", "2.0.0")).toBe(0);
  });

  it("treats missing parts as zero", () => {
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
    expect(compareVersions("1", "1.0.1")).toBe(-1);
  });
});

describe("parseAppConfig", () => {
  it("keeps well-formed values and drops the rest", () => {
    expect(
      parseAppConfig({
        minimumVersion: { ios: "1.2.0", android: "not a version" },
        storeUrl: { ios: "https://apps.apple.com/app/id1", android: "javascript:alert(1)" },
        message: "  Please update  ",
      }),
    ).toEqual({
      minimumVersion: { ios: "1.2.0" },
      storeUrl: { ios: "https://apps.apple.com/app/id1" },
      message: "Please update",
    });
  });

  it("rejects anything that isn't an object", () => {
    expect(parseAppConfig(null)).toBeNull();
    expect(parseAppConfig([])).toBeNull();
    expect(parseAppConfig("1.0.0")).toBeNull();
  });

  it("reads the published config", () => {
    const raw = JSON.parse(readFileSync(resolve(__dirname, "../../../../public/app-config.json"), "utf8"));
    const config = parseAppConfig(raw);
    expect(config?.minimumVersion.ios).toMatch(/^\d+\.\d+\.\d+$/);
    expect(config?.minimumVersion.android).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe("updateRequired", () => {
  const config = parseAppConfig({ minimumVersion: { ios: "1.3.0" } })!;

  it("blocks only versions below the platform's minimum", () => {
    expect(updateRequired(config, "ios", "1.2.9")).toBe(true);
    expect(updateRequired(config, "ios", "1.3.0")).toBe(false);
    expect(updateRequired(config, "ios", "1.10.0")).toBe(false);
  });

  it("lets through a platform with no minimum, and versions it can't read", () => {
    expect(updateRequired(config, "android", "0.1.0")).toBe(false);
    expect(updateRequired(config, "ios", "")).toBe(false);
    expect(updateRequired(config, "ios", "beta")).toBe(false);
  });
});

describe("fetchAppConfig", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fails open when the file can't be fetched or read", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    expect(await fetchAppConfig()).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404 })));
    expect(await fetchAppConfig()).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 200 })));
    expect(await fetchAppConfig()).toBeNull();
  });

  it("reads a served config", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ minimumVersion: { android: "1.1.0" } })));
    expect((await fetchAppConfig())?.minimumVersion).toEqual({ android: "1.1.0" });
  });
});
