// The iOS and Android apps call the edge functions from capacitor://localhost
// (iOS) and https://localhost (Android). A function that keeps its own CORS
// list and leaves them out fails inside the apps only, which no browser test
// notices (platform test B-1). Every function a browser can call must accept
// both: through _shared/cors.ts, or in its own list.
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

const FUNCTIONS = path.resolve(__dirname, "../../../supabase/functions");
const APP_ORIGINS = ["capacitor://localhost", "https://localhost"];

const functions = fs
  .readdirSync(FUNCTIONS, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== "_shared" && fs.existsSync(path.join(FUNCTIONS, d.name, "index.ts")))
  .map((d) => ({ name: d.name, source: fs.readFileSync(path.join(FUNCTIONS, d.name, "index.ts"), "utf8") }));

const importsSharedCors = (source: string) => /^import .*["']\.\.\/_shared\/cors\.ts["']/m.test(source);
const allowsAnyOrigin = (source: string) => /["']Access-Control-Allow-Origin["']\s*:\s*["']\*["']/.test(source);
const setsOrigin = (source: string) => source.includes("Access-Control-Allow-Origin");

describe("edge functions accept the apps' origins", () => {
  it("finds the functions", () => {
    expect(functions.length).toBeGreaterThan(20);
  });

  it.each(functions.filter((f) => setsOrigin(f.source) && !importsSharedCors(f.source) && !allowsAnyOrigin(f.source)))(
    "$name lists both app origins in its own CORS",
    ({ source }) => {
      for (const origin of APP_ORIGINS) expect(source).toContain(`"${origin}"`);
    },
  );
});

// _shared/cors.ts itself, for every function that imports it.
const env = new Map<string, string>();
beforeAll(() => {
  (globalThis as { Deno?: unknown }).Deno = { env: { get: (k: string) => env.get(k) } };
});
afterEach(() => env.clear());

const CORS_MODULE = "../../../supabase/functions/_shared/cors.ts";
type CorsModule = { buildCorsHeaders: (req: Request) => Record<string, string> };

describe("_shared/cors.ts", () => {
  it.each(APP_ORIGINS)("trusts %s with no configuration", async (origin) => {
    const { buildCorsHeaders } = (await import(/* @vite-ignore */ CORS_MODULE)) as CorsModule;
    const headers = buildCorsHeaders(new Request("https://fn.example/x", { headers: { Origin: origin } }));
    expect(headers["Access-Control-Allow-Origin"]).toBe(origin);
  });
});
