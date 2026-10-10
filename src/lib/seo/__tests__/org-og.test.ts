import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import handler, { buildOrgMeta, plainText, rewriteHtml } from "../../../../api/org-og";

const indexHtml = readFileSync(resolve(__dirname, "../../../../index.html"), "utf8");
const org = {
  id: "o1", name: "Biz Millennium", slug: "biz-millennium", subdomain: null,
  logo_url: "https://cdn.example.com/logos/bm.png",
  landing_config: { bio: "<p>India's leading <b>B2B events</b> company.</p>\nWe run CFO & HR summits." },
};
const content = (html: string, attr: "property" | "name", key: string) =>
  html.match(new RegExp(`<meta\\s+${attr}="${key}"\\s+content="([^"]*)"`))?.[1];

// The function runs on Vercel Edge, which has AbortSignal.timeout; jsdom doesn't.
if (typeof AbortSignal.timeout !== "function") {
  (AbortSignal as unknown as { timeout: (ms: number) => AbortSignal }).timeout = () => new AbortController().signal;
}

afterEach(() => vi.unstubAllGlobals());

describe("organisation share card", () => {
  it("uses the company logo, name and bio by default", () => {
    const meta = buildOrgMeta(org, "/org/biz-millennium");
    expect(meta.title).toBe("Biz Millennium");
    expect(meta.image).toBe("https://cdn.example.com/logos/bm.png");
    expect(meta.description).toBe("India's leading B2B events company. We run CFO & HR summits.");
    expect(meta.url).toBe("https://illuxus.com/org/biz-millennium");
  });

  it("falls back when there is no bio or logo", () => {
    const meta = buildOrgMeta({ ...org, logo_url: null, landing_config: {} }, "/org/biz-millennium");
    expect(meta.description).toContain("Events by Biz Millennium");
    expect(meta.image).toBe("https://illuxus.com/og-image.png");
    expect(meta.hasLogo).toBe(false);
  });

  it("ignores a logo that isn't a web address", () => {
    expect(buildOrgMeta({ ...org, logo_url: "javascript:alert(1)" }, "/org/x").hasLogo).toBe(false);
  });

  it("shortens a long bio", () => {
    const meta = buildOrgMeta({ ...org, landing_config: { bio: "word ".repeat(200) } }, "/org/x");
    expect(meta.description.length).toBeLessThanOrEqual(200);
    expect(meta.description.endsWith("…")).toBe(true);
  });

  it("strips HTML and markdown from the bio", () => {
    expect(plainText("## Hello **world** <a href='x'>link</a> [site](https://x.y)")).toBe("Hello world link site");
  });

  it("rewrites every tag a crawler reads in the real index.html", () => {
    const out = rewriteHtml(indexHtml, buildOrgMeta(org, "/org/biz-millennium"));
    expect(out).toContain("<title>Biz Millennium</title>");
    expect(content(out, "property", "og:title")).toBe("Biz Millennium");
    expect(content(out, "property", "og:site_name")).toBe("Biz Millennium");
    expect(content(out, "property", "og:image")).toBe("https://cdn.example.com/logos/bm.png");
    expect(content(out, "property", "og:image:secure_url")).toBe("https://cdn.example.com/logos/bm.png");
    expect(content(out, "property", "og:url")).toBe("https://illuxus.com/org/biz-millennium");
    expect(content(out, "property", "og:description")).toBe("India&#39;s leading B2B events company. We run CFO &amp; HR summits.");
    expect(content(out, "name", "description")).toBe(content(out, "property", "og:description"));
    expect(content(out, "name", "twitter:title")).toBe("Biz Millennium");
    expect(content(out, "name", "twitter:image")).toBe("https://cdn.example.com/logos/bm.png");
    expect(content(out, "name", "twitter:card")).toBe("summary");
    expect(out).toContain('<link rel="canonical" href="https://illuxus.com/org/biz-millennium" />');
    // Size hints of the generic 1200×630 card must not be applied to a logo.
    expect(out).not.toMatch(/og:image:width|og:image:height|og:image:type/);
    expect(out).not.toContain("https://illuxus.com/og-image.png\" />\n    <meta property=\"og:image:secure_url");
    expect(out).toContain('"@type":"Organization"');
  });

  it("escapes names so they can't break out of the tags", () => {
    const out = rewriteHtml(indexHtml, buildOrgMeta({ ...org, name: `Evil "/><script>alert(1)</script>` }, "/org/x"));
    expect(out).not.toContain("<script>alert(1)</script>");
    expect(content(out, "property", "og:title")).toContain("&lt;script&gt;");
  });
});

describe("org-og handler", () => {
  const stubFetch = (rpc: () => Response | Promise<Response>) => {
    const calls: { url: string; body?: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, body: init?.body as string | undefined });
      if (url.endsWith("/index.html")) return new Response(indexHtml, { status: 200 });
      return rpc();
    }));
    return calls;
  };
  const get = (slug: string) => handler(new Request(`https://illuxus.com/api/org-og?orgSlug=${encodeURIComponent(slug)}`));

  it("serves the org's card for a published organisation", async () => {
    vi.resetModules();
    process.env.VITE_SUPABASE_URL = "https://db.example.co";
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY = "anon";
    const mod = await import("../../../../api/org-og");
    const calls = stubFetch(() => new Response(JSON.stringify([org]), { status: 200 }));
    const res = await mod.default(new Request("https://illuxus.com/api/org-og?orgSlug=biz-millennium"));
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain("<title>Biz Millennium</title>");
    expect(calls.find((c) => c.url.includes("get_public_org_by_slug"))?.body).toBe(JSON.stringify({ _slug: "biz-millennium" }));
  });

  it("serves the normal page when the organisation isn't found or isn't public", async () => {
    vi.resetModules();
    const mod = await import("../../../../api/org-og");
    stubFetch(() => new Response("[]", { status: 200 }));
    const res = await mod.default(new Request("https://illuxus.com/api/org-og?orgSlug=nobody"));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<title>illuxus — events, communities, and webinars</title>");
  });

  it("never fails: database errors and odd slugs still return the page", async () => {
    stubFetch(() => { throw new Error("network down"); });
    const a = await get("biz-millennium");
    expect(a.status).toBe(200);
    expect(await a.text()).toContain("illuxus");
    const calls = stubFetch(() => new Response("[]", { status: 200 }));
    const b = await get("../../etc/passwd");
    expect(b.status).toBe(200);
    expect(calls.some((c) => c.url.includes("/rpc/"))).toBe(false);
  });
});
