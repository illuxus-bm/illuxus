import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: "tok" } } })) } },
}));
vi.mock("@/lib/native/platform", () => ({ SITE_ORIGIN: "https://illuxus.com", isNativeApp: () => false }));

import { supabaseRpc } from "../rpc";

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function routeFetch(api: () => Response | Promise<Response>, rest: () => Response = () => reply(200, "from-supabase")) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    calls.push(String(url));
    if (String(url).includes("/api/v1/rpc/")) return api();
    return rest();
  }));
  return calls;
}

describe("supabaseRpc routing", () => {
  it("goes to Supabase while the API is switched off", async () => {
    const calls = routeFetch(() => reply(200, { data: "from-api" }));
    expect((await supabaseRpc("has_role", { _role: "admin" })).data).toBe("from-supabase");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/\/rest\/v1\/rpc\/has_role$/);
  });

  it("goes to the API when switched on", async () => {
    vi.stubEnv("VITE_DATA_BACKEND", "api");
    const calls = routeFetch(() => reply(200, { data: true }));
    const r = await supabaseRpc("has_role", { _role: "admin" });
    expect([r.data, r.error]).toEqual([true, null]);
    expect(calls).toEqual(["/api/v1/rpc/has_role"]);
  });

  it("falls back to Supabase when the API is down", async () => {
    vi.stubEnv("VITE_DATA_BACKEND", "api");
    for (const api of [() => reply(503, { error: { code: "unavailable" } }), () => { throw new TypeError("Failed to fetch"); }]) {
      const calls = routeFetch(api);
      expect((await supabaseRpc("has_role", {})).data).toBe("from-supabase");
      expect(calls[0]).toBe("/api/v1/rpc/has_role");
      expect(calls[1]).toMatch(/\/rest\/v1\/rpc\/has_role$/);
    }
  });

  it("passes a database error through with its code, as Supabase would", async () => {
    vi.stubEnv("VITE_DATA_BACKEND", "api");
    const calls = routeFetch(() => reply(409, { error: { code: "23505", message: "duplicate key value" } }));
    const r = await supabaseRpc("community_join", {});
    expect(r.error).toEqual({ code: "23505", message: "duplicate key value" });
    expect(calls).toHaveLength(1);
  });
});
