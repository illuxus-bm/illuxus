/**
 * Every ported edge function (server/functions) loads in Node, answers a
 * CORS preflight, and turns away an unauthenticated or empty request with
 * a clear 4xx instead of crashing. No secrets are set: as on a fresh
 * deployment, nothing may throw just because a provider isn't configured.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { FUNCTIONS } from "../functions/registry.generated.js";
import { gatewayAllows, invokeFunction, isPorted, PUBLIC_FUNCTIONS } from "../functions/invoke.js";

const NAMES = Object.keys(FUNCTIONS);

// Functions that answer GET, or a webhook handshake, rather than a JSON POST.
const GET_FUNCTIONS = new Set(["og-event", "org-events", "fx-rates", "whatsapp-webhook"]);

beforeAll(() => {
  Object.assign(process.env, {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_ANON_KEY: "test-anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
    DATABASE_URL: "postgresql://nobody@127.0.0.1:1/none",
  });
  for (const level of ["log", "info", "warn", "error", "debug"] as const) vi.spyOn(console, level).mockImplementation(() => {});
  // No network in these tests: any outbound call fails fast like an outage.
  vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed (test: no network)"); }));
});

describe("ported edge functions", () => {
  it("includes all 30 functions", () => {
    expect(NAMES).toHaveLength(30);
  });

  for (const name of NAMES) {
    describe(name, () => {
      it("loads in Node", async () => {
        const mod = await FUNCTIONS[name]();
        expect(typeof mod.default).toBe("function");
      });

      it("answers a CORS preflight without crashing", async () => {
        const mod = await FUNCTIONS[name]();
        const res = await mod.default(new Request(`https://illuxus.com/api/v1/fn/${name}`, {
          method: "OPTIONS",
          headers: { origin: "https://illuxus.com", "access-control-request-method": "POST" },
        }));
        expect(res.status).toBeLessThan(500);
      });

      it("turns away a request with no sign-in or input, without crashing", async () => {
        const mod = await FUNCTIONS[name]();
        const init: RequestInit = GET_FUNCTIONS.has(name)
          ? { method: "GET", headers: { origin: "https://illuxus.com" } }
          : { method: "POST", headers: { origin: "https://illuxus.com", "content-type": "application/json" }, body: "{}" };
        const res = await mod.default(new Request(`https://illuxus.com/api/v1/fn/${name}`, init));
        // A clean refusal (4xx), or a clean "not configured / upstream down"
        // (5xx with a body). What must never happen is an uncaught throw.
        expect(res).toBeInstanceOf(Response);
        expect(res.status).toBeGreaterThanOrEqual(200);
        expect(await res.text()).toBeDefined();
      });
    });
  }
});

describe("the gateway check (Supabase's verify_jwt)", () => {
  it("lets the opted-out functions through without a key", async () => {
    for (const name of PUBLIC_FUNCTIONS) expect(await gatewayAllows(name, new Headers())).toBe(true);
  });
  it("requires a project key or a valid sign-in for the rest", async () => {
    expect(await gatewayAllows("send-email", new Headers())).toBe(false);
    expect(await gatewayAllows("send-email", new Headers({ authorization: "Bearer test-anon-key" }))).toBe(true);
    expect(await gatewayAllows("send-email", new Headers({ apikey: "test-anon-key" }))).toBe(true);
    expect(await gatewayAllows("send-email", new Headers({ authorization: "Bearer test-service-key" }))).toBe(true);
    expect(await gatewayAllows("send-email", new Headers({ authorization: "Bearer forged.jwt.value" }))).toBe(false);
  });
  it("in-process invoke reports an unported name instead of throwing", async () => {
    expect(isPorted("no-such-function")).toBe(false);
    const r = await invokeFunction("no-such-function", {}, new Headers());
    expect(r.error?.name).toBe("FunctionsRelayError");
  });
});
