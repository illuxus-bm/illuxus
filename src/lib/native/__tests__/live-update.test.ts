import { describe, expect, it } from "vitest";

import { bundleZipUrl, BUNDLE_MANIFEST_URL, decideLiveUpdate, parseBundleManifest, pickDownloaded, settleAttempt } from "../live-update";

const SHA = "a".repeat(64);
const manifest = (over: Record<string, unknown> = {}) =>
  parseBundleManifest({ version: "1.0.4", build: 5, minNativeBuild: 4, sha256: SHA, ...over });

describe("parseBundleManifest", () => {
  it("reads a release's description", () => {
    expect(manifest()).toEqual({ version: "1.0.4", build: 5, minNativeBuild: 4, sha256: SHA });
  });

  it("rejects anything malformed or inconsistent", () => {
    expect(parseBundleManifest(null)).toBeNull();
    expect(manifest({ version: "latest" })).toBeNull();
    expect(manifest({ sha256: "not-a-hash" })).toBeNull();
    expect(manifest({ build: 0 })).toBeNull();
    // Can't need a newer shell than its own build.
    expect(manifest({ minNativeBuild: 6 })).toBeNull();
  });
});

describe("decideLiveUpdate", () => {
  it("downloads a newer release the shell can run", () => {
    expect(decideLiveUpdate(manifest(), 4, "1.0.3")).toMatchObject({ action: "download" });
    expect(decideLiveUpdate(manifest(), 9, "1.0.3")).toMatchObject({ action: "download" });
  });

  it("asks for a new app when the release needs a newer shell", () => {
    expect(decideLiveUpdate(manifest(), 3, "1.0.2")).toMatchObject({ action: "native-update" });
  });

  it("does nothing when up to date, ahead, paused, or with no release", () => {
    expect(decideLiveUpdate(manifest(), 5, "1.0.4").action).toBe("none");
    expect(decideLiveUpdate(manifest(), 5, "1.1.0").action).toBe("none");
    expect(decideLiveUpdate(manifest(), 4, "1.0.3", false)).toEqual({ action: "none", reason: "paused" });
    expect(decideLiveUpdate(null, 4, "1.0.3").action).toBe("none");
  });

  it("compares versions by number, not text", () => {
    expect(decideLiveUpdate(manifest({ version: "1.0.10", build: 12 }), 4, "1.0.9").action).toBe("download");
  });
});

describe("pickDownloaded", () => {
  const b = (version: string, status: string) => ({ id: version, version, status });

  it("switches to the newest downloaded version above what's running", () => {
    expect(pickDownloaded([b("1.0.4", "pending"), b("1.0.5", "success")], "1.0.3")?.version).toBe("1.0.5");
  });

  it("never picks a version that failed to start, an older one, or a half-downloaded one", () => {
    expect(pickDownloaded([b("1.0.5", "error"), b("1.0.4", "pending")], "1.0.3")?.version).toBe("1.0.4");
    expect(pickDownloaded([b("1.0.2", "success"), b("1.0.3", "success")], "1.0.3")).toBeNull();
    expect(pickDownloaded([b("1.0.6", "downloading")], "1.0.3")).toBeNull();
  });
});

describe("versions that failed to start", () => {
  it("never downloads or switches to one again", () => {
    expect(decideLiveUpdate(manifest({ version: "1.0.5", build: 6 }), 4, "1.0.4", true, ["1.0.5"])).toEqual({ action: "none", reason: "failed before" });
    expect(pickDownloaded([{ id: "a", version: "1.0.5", status: "pending" }], "1.0.4", ["1.0.5"])).toBeNull();
  });

  it("still takes a later release with the fix", () => {
    expect(decideLiveUpdate(manifest({ version: "1.0.6", build: 7 }), 4, "1.0.4", true, ["1.0.5"]).action).toBe("download");
  });

  it("records a switch that was rolled back, and forgets one that worked", () => {
    expect(settleAttempt("1.0.5", "1.0.4", [])).toEqual({ failed: ["1.0.5"], changed: true });
    expect(settleAttempt("1.0.5", "1.0.5", [])).toEqual({ failed: [], changed: true });
    expect(settleAttempt(null, "1.0.4", ["1.0.2"])).toEqual({ failed: ["1.0.2"], changed: false });
  });
});

describe("release URLs", () => {
  it("reads the latest release and downloads a fixed version", () => {
    expect(BUNDLE_MANIFEST_URL).toBe("https://github.com/illuxus-bm/illuxus/releases/latest/download/illuxus-web.json");
    expect(bundleZipUrl("1.0.4")).toBe("https://github.com/illuxus-bm/illuxus/releases/download/v1.0.4/illuxus-web.zip");
  });
});
