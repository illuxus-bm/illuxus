// supabase/functions/_shared/cors.ts: which browser origins the edge
// functions trust. Any *.vercel.app used to be trusted with credentials,
// which anyone can deploy to.
import { afterEach, beforeAll, describe, expect, it } from "vitest";

const env = new Map<string, string>();
beforeAll(() => {
  (globalThis as { Deno?: unknown }).Deno = { env: { get: (k: string) => env.get(k) } };
});
afterEach(() => env.clear());

// A Deno module: loaded by path at runtime so the app's type-check (browser
// lib, no Deno globals) doesn't pull it in.
const CORS_MODULE = "../../../supabase/functions/_shared/cors.ts";
type CorsModule = { buildCorsHeaders: (req: Request) => Record<string, string> };
const load = () => import(/* @vite-ignore */ CORS_MODULE) as Promise<CorsModule>;
const allowOrigin = async (origin: string) => {
  const { buildCorsHeaders } = await load();
  return buildCorsHeaders(new Request("https://fn.example/x", { headers: { Origin: origin } }))["Access-Control-Allow-Origin"];
};

describe("edge function CORS origins", () => {
  it("no longer trusts arbitrary *.vercel.app deployments", async () => {
    expect(await allowOrigin("https://attacker.vercel.app")).toBe("null");
  });

  it("trusts the production domain from PUBLIC_DOMAIN", async () => {
    env.set("PUBLIC_DOMAIN", "illuxus.com");
    expect(await allowOrigin("https://illuxus.com")).toBe("https://illuxus.com");
    expect(await allowOrigin("https://evil.com")).toBe("null");
  });

  it("trusts preview hosts only when they match PREVIEW_ORIGIN_PATTERN", async () => {
    env.set("PREVIEW_ORIGIN_PATTERN", String.raw`https://illuxus-[a-z0-9-]+-acme\.vercel\.app`);
    expect(await allowOrigin("https://illuxus-git-main-acme.vercel.app")).toBe("https://illuxus-git-main-acme.vercel.app");
    expect(await allowOrigin("https://illuxus-git-main-other.vercel.app")).toBe("null");
    // Anchored: a suffix can't be tacked on.
    expect(await allowOrigin("https://illuxus-x-acme.vercel.app.evil.com")).toBe("null");
  });

  it("treats an invalid pattern as no preview hosts", async () => {
    env.set("PREVIEW_ORIGIN_PATTERN", "([");
    expect(await allowOrigin("https://anything.vercel.app")).toBe("null");
  });
});
