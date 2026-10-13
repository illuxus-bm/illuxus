// Unit tests for src/lib/seo/prerender.ts — the per-route HTML and sitemap
// produced at build time — including a check against the real pages.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  breadcrumbItems,
  buildSitemap,
  buildSitemapIndex,
  extractRouteMeta,
  outputFile,
  renderRouteHtml,
  shortName,
  type RouteMeta,
} from "../prerender";

const BASE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <title>illuxus — events, communities, and webinars</title>
    <meta name="description" content="Home description." />
    <link rel="canonical" href="https://illuxus.com/" />
    <link rel="alternate" hreflang="en-IN" href="https://illuxus.com/" />
    <meta property="og:title" content="Home" />
    <meta property="og:description" content="Home description." />
    <meta property="og:url" content="https://illuxus.com/" />
    <meta property="og:image" content="https://illuxus.com/og-image.png" />
    <meta name="twitter:title" content="Home" />
    <meta name="twitter:description" content="Home description." />
  </head>
  <body>
    <div id="root"></div>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <script type="module" src="/assets/index.js"></script>
  </body>
</html>`;

const pricing: RouteMeta = {
  path: "/pricing",
  title: "Pricing — Transparent event pricing | illuxus",
  description: 'Plans for "every" event & budget.',
  canonical: "https://illuxus.com/pricing",
};
const home: RouteMeta = { path: "/", title: "illuxus — All-in-one event platform", description: "Home.", canonical: "https://illuxus.com/" };
const terms: RouteMeta = { path: "/terms", title: "Terms of Service — illuxus", description: "Terms.", canonical: "https://illuxus.com/terms" };

describe("extractRouteMeta", () => {
  const page = (props: string): string => `export default function P() { return <Shell><RouteSeo ${props} /></Shell>; }`;

  it("reads a page's title, description and canonical", () => {
    expect(
      extractRouteMeta(page(`title="Pricing — illuxus" description="Plans." canonical="https://illuxus.com/pricing"`)),
    ).toEqual({ path: "/pricing", title: "Pricing — illuxus", description: "Plans.", canonical: "https://illuxus.com/pricing" });
  });

  it("treats the bare origin, with or without a slash, as the home page", () => {
    for (const canonical of ["https://illuxus.com/", "https://illuxus.com"]) {
      expect(extractRouteMeta(page(`title="T" description="D" canonical="${canonical}"`))?.path).toBe("/");
    }
  });

  it("accepts braces around a plain string", () => {
    expect(extractRouteMeta(page(`title={"T"} description={\`D\`} canonical="https://illuxus.com/a"`))?.title).toBe("T");
  });

  it("skips pages it cannot prerender", () => {
    expect(extractRouteMeta("export default function P() { return <div />; }")).toBeNull();
    // Values only known at run time — an event or organisation page.
    expect(extractRouteMeta(page(`title={org.name} description={seoDescription} canonical={seoUrl}`))).toBeNull();
    expect(extractRouteMeta(page(`title="T" description="D" canonical="https://illuxus.com/x" noindex`))).toBeNull();
    expect(extractRouteMeta(page(`title="T" description="D" canonical="https://elsewhere.test/x"`))).toBeNull();
    expect(extractRouteMeta(page(`title="T" canonical="https://illuxus.com/x"`))).toBeNull();
  });
});

describe("renderRouteHtml", () => {
  const html = renderRouteHtml(BASE_HTML, pricing, [home, pricing, terms], { googleVerification: "gsc-token" });

  it("gives the page its own title, description and canonical", () => {
    expect(html).toContain("<title>Pricing — Transparent event pricing | illuxus</title>");
    expect(html).toContain('<link rel="canonical" href="https://illuxus.com/pricing" />');
    expect(html).toContain('hreflang="en-IN" href="https://illuxus.com/pricing"');
    expect(html).not.toContain("Home description.");
  });

  it("escapes text placed in attributes", () => {
    expect(html).toContain('content="Plans for &quot;every&quot; event &amp; budget."');
  });

  it("rewrites the Open Graph and Twitter tags but keeps the share image", () => {
    expect(html).toContain('<meta property="og:url" content="https://illuxus.com/pricing" />');
    expect(html).toContain('<meta property="og:title" content="Pricing — Transparent event pricing | illuxus" />');
    expect(html).toContain('<meta name="twitter:title" content="Pricing — Transparent event pricing | illuxus" />');
    expect(html).toContain('<meta property="og:image" content="https://illuxus.com/og-image.png" />');
  });

  it("adds breadcrumb structured data that parses", () => {
    const json = /<script type="application\/ld\+json" data-prerender-seo>([\s\S]*?)<\/script>/.exec(html)?.[1];
    const data = JSON.parse(json ?? "{}");
    expect(data["@type"]).toBe("BreadcrumbList");
    expect(data.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Home", item: "https://illuxus.com/" },
      { "@type": "ListItem", position: 2, name: "Pricing", item: "https://illuxus.com/pricing" },
    ]);
  });

  it("adds the verification tag only when a token is given", () => {
    expect(html).toContain('<meta name="google-site-verification" content="gsc-token" />');
    expect(html).not.toContain("msvalidate.01");
    expect(renderRouteHtml(BASE_HTML, pricing, [pricing])).not.toContain("google-site-verification");
  });

  it("replaces the no-JavaScript notice with the page's heading, summary and links to the other pages", () => {
    const fallback = /<noscript>([\s\S]*?)<\/noscript>/.exec(html)?.[1] ?? "";
    expect(fallback).toContain("<h1>Pricing</h1>");
    expect(fallback).toContain('<a href="/terms">Terms of Service</a>');
    expect(fallback).toContain('<a href="/">Home</a>');
    expect(fallback).not.toContain('<a href="/pricing">');
    expect(html.match(/<noscript>/g)).toHaveLength(1);
  });

  it("leaves the app's own markup alone", () => {
    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain('<script type="module" src="/assets/index.js"></script>');
  });

  it("cannot be broken out of by a title containing markup", () => {
    const hostile = renderRouteHtml(BASE_HTML, { ...pricing, title: "</script><script>alert(1)</script> — x" }, [pricing]);
    expect(hostile).not.toContain("<script>alert(1)</script>");
  });
});

describe("names, files and breadcrumbs", () => {
  it("shortens a title to the page's name", () => {
    expect(shortName(pricing)).toBe("Pricing");
    expect(shortName(home)).toBe("Home");
    expect(shortName({ ...terms, title: "GDPR Notice | illuxus" })).toBe("GDPR Notice");
  });

  it("puts each route in its own directory, and home at the root", () => {
    expect(outputFile(home)).toBe("index.html");
    expect(outputFile(pricing)).toBe("pricing/index.html");
  });

  it("home has no breadcrumb trail of its own", () => {
    expect(breadcrumbItems(home)).toHaveLength(1);
    expect(breadcrumbItems(pricing).map((c) => c.name)).toEqual(["Home", "Pricing"]);
  });
});

describe("sitemaps", () => {
  it("lists every route once, with policies ranked below product pages", () => {
    const xml = buildSitemap([home, pricing, terms], "2026-10-13", ["https://illuxus.com/events"]);
    expect(xml.match(/<url>/g)).toHaveLength(4);
    expect(xml).toContain("<loc>https://illuxus.com/pricing</loc>");
    expect(xml).toMatch(/<loc>https:\/\/illuxus\.com\/<\/loc>\s*<lastmod>2026-10-13<\/lastmod>\s*<priority>1\.0<\/priority>/);
    expect(xml).toMatch(/<loc>https:\/\/illuxus\.com\/terms<\/loc>\s*<lastmod>2026-10-13<\/lastmod>\s*<priority>0\.3<\/priority>/);
  });

  it("indexes the static and the events sitemap", () => {
    const xml = buildSitemapIndex("2026-10-13");
    expect(xml).toContain("<loc>https://illuxus.com/sitemap.xml</loc>");
    expect(xml).toContain("<loc>https://illuxus.com/sitemap-events.xml</loc>");
  });
});

describe("the real pages", () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      return statSync(full).isDirectory() ? walk(full) : full.endsWith(".tsx") ? [full] : [];
    });
  const routes = walk(resolve(process.cwd(), "src/pages"))
    .map((file) => extractRouteMeta(readFileSync(file, "utf8")))
    .filter((route): route is RouteMeta => route !== null);

  it("finds the public marketing and legal pages", () => {
    const paths = routes.map((r) => r.path);
    for (const expected of ["/", "/pricing", "/features", "/about", "/contact", "/faqs", "/privacy", "/terms", "/cookies", "/refunds"]) {
      expect(paths).toContain(expected);
    }
  });

  it("gives every page a unique path, title and description", () => {
    for (const key of ["path", "title", "description"] as const) {
      const values = routes.map((r) => r[key]);
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it("keeps descriptions long enough to be useful", () => {
    for (const route of routes) expect(route.description.length, route.path).toBeGreaterThanOrEqual(50);
  });
});
