import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: "tok" } } })) } },
}));
vi.mock("@/lib/native/platform", () => ({ SITE_ORIGIN: "https://illuxus.com", isNativeApp: () => false }));

import { ApiError, apiFetch, viaApi } from "../api-client";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const respond = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

describe("apiFetch", () => {
  it("sends the session token and returns the body", async () => {
    const fetchMock = respond(200, { data: [1] });
    vi.stubGlobal("fetch", fetchMock);
    expect(await apiFetch("/events")).toEqual({ data: [1] });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/events");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer tok");
  });
  it("turns error responses into ApiError with the server's code", async () => {
    vi.stubGlobal("fetch", respond(403, { error: { code: "forbidden", message: "Not allowed", requestId: "r1" } }));
    await expect(apiFetch("/x")).rejects.toMatchObject({ status: 403, code: "forbidden", requestId: "r1" });
  });
  it("turns network failures into ApiError status 0", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    await expect(apiFetch("/x")).rejects.toMatchObject({ status: 0, code: "network" });
  });
});

describe("viaApi", () => {
  const api = vi.fn(async () => "api");
  const legacy = vi.fn(async () => "legacy");

  it("uses the legacy query while the API is switched off", async () => {
    expect(await viaApi(api, legacy)).toBe("legacy");
  });
  it("uses the API when switched on", async () => {
    vi.stubEnv("VITE_DATA_BACKEND", "api");
    expect(await viaApi(api, legacy)).toBe("api");
  });
  it("falls back to the legacy query when the API is down", async () => {
    vi.stubEnv("VITE_DATA_BACKEND", "api");
    for (const status of [0, 500, 503]) {
      expect(await viaApi(async () => { throw new ApiError(status, "x", "x"); }, legacy)).toBe("legacy");
    }
  });
  it("reports the caller's own bad input instead of hiding it", async () => {
    vi.stubEnv("VITE_DATA_BACKEND", "api");
    await expect(viaApi(async () => { throw new ApiError(400, "invalid_input", "bad"); }, legacy)).rejects.toMatchObject({ status: 400 });
  });
});
