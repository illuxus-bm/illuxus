import { afterEach, describe, expect, it, vi } from "vitest";

import handler, { buildEventsSitemap, eventUrl } from "../../../../api/sitemap-events";

// The function runs on Vercel Edge, which has AbortSignal.timeout; jsdom doesn't.
if (typeof AbortSignal.timeout !== "function") {
  (AbortSignal as unknown as { timeout: (ms: number) => AbortSignal }).timeout = () => new AbortController().signal;
}

afterEach(() => vi.unstubAllGlobals());

describe("eventUrl", () => {
  it("uses the organisation address when the event has one", () => {
    expect(eventUrl({ id: "e1", slug: "devops-connect", updated_at: null, organizations: { slug: "biz-millennium" } })).toBe(
      "https://illuxus.com/org/biz-millennium/events/devops-connect",
    );
    // PostgREST may embed the organisation as a one-element list.
    expect(eventUrl({ id: "e1", slug: "devops-connect", updated_at: null, organizations: [{ slug: "biz-millennium" }] })).toBe(
      "https://illuxus.com/org/biz-millennium/events/devops-connect",
    );
  });

  it("falls back to the id address without an organisation or a slug", () => {
    expect(eventUrl({ id: "e1", slug: "devops-connect", updated_at: null, organizations: null })).toBe("https://illuxus.com/events/e1");
    expect(eventUrl({ id: "e1", slug: null, updated_at: null, organizations: { slug: "biz" } })).toBe("https://illuxus.com/events/e1");
  });
});

describe("buildEventsSitemap", () => {
  it("lists organisation pages and events with their last change", () => {
    const xml = buildEventsSitemap(
      [{ id: "e1", slug: "devops-connect", updated_at: "2026-08-01T10:00:00Z", organizations: { slug: "biz" } }],
      [{ slug: "biz", updated_at: "2026-07-01T00:00:00Z" }],
    );
    expect(xml).toContain("<loc>https://illuxus.com/org/biz</loc>\n    <lastmod>2026-07-01</lastmod>");
    expect(xml).toContain("<loc>https://illuxus.com/org/biz/events/devops-connect</loc>\n    <lastmod>2026-08-01</lastmod>");
    expect(xml.match(/<url>/g)).toHaveLength(2);
  });

  it("lists each address once and leaves out a date it cannot read", () => {
    const row = { id: "e1", slug: null, updated_at: "not a date", organizations: null };
    const xml = buildEventsSitemap([row, row], [{ slug: null, updated_at: null }]);
    expect(xml.match(/<url>/g)).toHaveLength(1);
    expect(xml).not.toContain("<lastmod>");
  });

  it("escapes characters that are special in XML and in URLs", () => {
    const xml = buildEventsSitemap([{ id: "e1", slug: "q&a <live>", updated_at: null, organizations: { slug: "a b" } }], []);
    expect(xml).toContain("<loc>https://illuxus.com/org/a%20b/events/q%26a%20%3Clive%3E</loc>");
  });

  it("is a valid, empty sitemap when there is nothing to list", () => {
    expect(buildEventsSitemap([], [])).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>\n',
    );
  });
});

describe("handler", () => {
  it("answers with XML, not an error, when the database cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    const res = await handler();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/xml");
    expect(await res.text()).toContain("<urlset");
  });
});
