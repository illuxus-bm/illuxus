// The Content-Security-Policy in vercel.json allows inline script only by
// hash. If an inline <script> or on*="" handler in index.html (or the one the
// nonBlockingAppCss plugin in vite.config.ts writes) changes without its hash
// being updated, browsers silently block it — the theme, splash or the app
// stylesheet would stop working. This test fails first instead.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
const sha = (s: string) => `'sha256-${createHash("sha256").update(s, "utf8").digest("base64")}'`;

const vercel = JSON.parse(read("vercel.json")) as {
  headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
};
const csp = vercel.headers
  .flatMap((r) => r.headers)
  .find((h) => h.key === "Content-Security-Policy")?.value ?? "";
const scriptSrc = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("script-src")) ?? "";

describe("Content-Security-Policy", () => {
  it("is enforced, not report-only, and allows no inline script wholesale", () => {
    expect(csp).toBeTruthy();
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("lists the hash of every inline script in index.html", () => {
    const html = read("index.html");
    const inline = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
      .filter((m) => !/\bsrc=|application\/ld\+json/.test(m[1]))
      .map((m) => m[2]);
    expect(inline.length).toBeGreaterThan(0);
    for (const body of inline) expect(scriptSrc).toContain(sha(body));
  });

  it("lists the hash of every inline event handler (index.html and vite.config.ts)", () => {
    const handlers = [
      ...[...read("index.html").matchAll(/\son[a-z]+="([^"]*)"/g)].map((m) => m[1]),
      ...[...read("vite.config.ts").matchAll(/\son[a-z]+="([^"]*)"/g)].map((m) => m[1]),
    ];
    expect(handlers.length).toBeGreaterThan(0);
    expect(scriptSrc).toContain("'unsafe-hashes'");
    for (const h of handlers) expect(scriptSrc).toContain(sha(h));
  });
});
