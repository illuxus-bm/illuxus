import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A stand-in for supabase-js's builder: records calls, resolves to "supabase".
const supabaseCalls: { table: string; ops: string[] }[] = [];
function fakeBuilder(table: string) {
  const entry = { table, ops: [] as string[] };
  supabaseCalls.push(entry);
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "insert", "update", "delete", "upsert", "eq", "in", "order", "limit", "single", "maybeSingle", "contains", "csv"]) {
    builder[m] = (...args: unknown[]) => { entry.ops.push(`${m}(${JSON.stringify(args)})`); return builder; };
  }
  builder.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: "supabase", error: null, count: null, status: 200, statusText: "OK" }).then(ok);
  return builder;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (t: string) => fakeBuilder(t),
    auth: { getSession: async () => ({ data: { session: { access_token: "tok" } } }) },
  },
}));
vi.mock("@/lib/native/platform", () => ({ SITE_ORIGIN: "https://illuxus.com", isNativeApp: () => false }));

import { db as typedDb } from "../db";

// The tests use made-up rows, so they skip the generated table types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = typedDb as any;

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let apiBodies: unknown[] = [];
function api(fn: () => Response | Promise<Response>) {
  apiBodies = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    apiBodies.push(JSON.parse(String(init.body)));
    return fn();
  }));
}

beforeEach(() => { supabaseCalls.length = 0; });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("db.from", () => {
  it("is plain supabase.from while the API is off", async () => {
    const r = await db.from("events").select("id").eq("status", "published");
    expect(r.data).toBe("supabase");
    expect(supabaseCalls).toEqual([{ table: "events", ops: ['select(["id"])', 'eq(["status","published"])'] }]);
  });

  describe("with the API on", () => {
    beforeEach(() => vi.stubEnv("VITE_DATA_BACKEND", "api"));

    it("sends the recorded chain and returns supabase-js's result shape", async () => {
      api(() => reply(200, { data: [{ id: 1 }], count: 3, status: 200 }));
      const r = await db.from("events").select("id", { count: "exact" }).eq("status", "published").order("date").limit(1);
      expect(r).toMatchObject({ data: [{ id: 1 }], error: null, count: 3, status: 200 });
      expect(apiBodies).toEqual([{ table: "events", ops: [
        { m: "select", a: ["id", { count: "exact" }] }, { m: "eq", a: ["status", "published"] },
        { m: "order", a: ["date"] }, { m: "limit", a: [1] },
      ] }]);
      expect(supabaseCalls).toEqual([]);
    });

    it("returns the query's own database error without retrying", async () => {
      api(() => reply(406, { error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" } }));
      const r = await db.from("events").select("id").eq("id", "x").single();
      expect(r.error).toMatchObject({ code: "PGRST116" });
      expect(supabaseCalls).toEqual([]);
    });

    it("reads fall back to Supabase when the API is down or can't take the query", async () => {
      for (const res of [() => reply(503, { error: { code: "unavailable" } }), () => reply(422, { error: { code: "unsupported_query" } }), () => { throw new TypeError("Failed to fetch"); }]) {
        supabaseCalls.length = 0;
        api(res);
        const r = await db.from("events").select("id").eq("id", "x");
        expect(r.data).toBe("supabase");
        expect(supabaseCalls[0].ops).toEqual(['select(["id"])', 'eq(["id","x"])']);
      }
    });

    it("methods the API doesn't know go straight to Supabase", async () => {
      api(() => reply(200, { data: [] }));
      const r = await db.from("events").select("tags").contains("tags", ["a"]);
      expect(r.data).toBe("supabase");
      expect(apiBodies).toEqual([]);
    });

    it("writes fall back only when nothing ran", async () => {
      api(() => reply(422, { error: { code: "unsupported_query" } }));
      expect((await db.from("events").update({ title: "x" }).eq("id", "1")).data).toBe("supabase");
      supabaseCalls.length = 0;
      api(() => reply(503, { error: { code: "unavailable" } }));
      expect((await db.from("events").insert({ title: "x" })).data).toBe("supabase");
    });

    it("a write with an unknown outcome is reported, never sent twice", async () => {
      supabaseCalls.length = 0;
      api(() => { throw new TypeError("Failed to fetch"); });
      const r = await db.from("events").insert({ title: "x" });
      expect(r.error).toMatchObject({ code: "network" });
      supabaseCalls.length = 0;
      api(() => reply(500, { error: { code: "internal", message: "Something went wrong" } }));
      const r2 = await db.from("events").delete().eq("id", "1");
      expect(r2.error).toMatchObject({ code: "internal" });
      expect(supabaseCalls).toEqual([]);
    });

    it("throwOnError throws the error, as supabase-js does", async () => {
      api(() => reply(409, { error: { code: "23505", message: "duplicate key" } }));
      await expect(db.from("events").insert({ id: 1 }).throwOnError()).rejects.toMatchObject({ code: "23505" });
    });

    it("runs each chain once however many times it's awaited", async () => {
      api(() => reply(200, { data: [] }));
      const q = db.from("events").select("id");
      await q; await q;
      expect(apiBodies).toHaveLength(1);
    });
  });
});
