/**
 * Build-time HTML for the static public pages.
 *
 * The app is a single-page app: every URL is answered with the same
 * `index.html`, and each page sets its own title, description and canonical
 * link from JavaScript (`RouteSeo`). A crawler or link-preview bot that does
 * not run JavaScript therefore sees the home page's tags on every URL.
 *
 * At build time this module produces a separate HTML file per static route —
 * `dist/pricing/index.html` and so on — whose `<head>` already carries that
 * page's title, description, canonical, Open Graph and breadcrumb data, and
 * whose `<noscript>` block carries its heading, summary and links to the rest
 * of the site. The host serves the file for the matching URL; browsers then
 * load the app on top exactly as before.
 *
 * Each page's tags are read from its own `<RouteSeo …>` declaration, so there
 * is no second list to keep in step.
 *
 * Pure — strings in, strings out. The file reading and writing lives in the
 * Vite plugin (`vite.config.ts`).
 */

export const SITE_ORIGIN = "https://illuxus.com";

export interface RouteMeta {
  /** Path with a leading slash and no trailing one; "/" for home. */
  path: string;
  title: string;
  description: string;
  canonical: string;
}

/** The value of a JSX prop written as a plain string, or `null`. */
function literalProp(block: string, name: string): string | null {
  const match = new RegExp(`\\b${name}=(?:"([^"]*)"|\\{"([^"]*)"\\}|\\{\`([^\`$]*)\`\\})`).exec(block);
  if (!match) return null;
  return match[1] ?? match[2] ?? match[3] ?? null;
}

/**
 * The route a page source declares through `<RouteSeo>`, or `null` when it
 * declares none that can be prerendered: no `RouteSeo`, values computed at
 * run time (an event or organisation page), a canonical on another origin, or
 * a page marked `noindex`.
 */
export function extractRouteMeta(source: string, origin: string = SITE_ORIGIN): RouteMeta | null {
  const block = /<RouteSeo\b([\s\S]*?)\/>/.exec(source)?.[1];
  if (!block || /\bnoindex\b/.test(block)) return null;
  const title = literalProp(block, "title");
  const description = literalProp(block, "description");
  const canonical = literalProp(block, "canonical");
  if (!title || !description || !canonical || !canonical.startsWith(origin)) return null;
  const rest = canonical.slice(origin.length).replace(/[?#].*$/, "").replace(/\/+$/, "");
  return { path: rest === "" ? "/" : rest, title, description, canonical };
}

const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The page name without the brand and tagline: "Pricing — Transparent… | illuxus" → "Pricing". */
export function shortName(route: RouteMeta): string {
  if (route.path === "/") return "Home";
  const lead = route.title.split(/\s[—|–-]\s/)[0].trim();
  return lead || route.path.slice(1);
}

/** Home → this page, as schema.org `BreadcrumbList` items. */
export function breadcrumbItems(route: RouteMeta, origin: string = SITE_ORIGIN): Array<{ name: string; item: string }> {
  const home = { name: "Home", item: `${origin}/` };
  return route.path === "/" ? [home] : [home, { name: shortName(route), item: route.canonical }];
}

function replaceTag(html: string, pattern: RegExp, replacement: string): string {
  return pattern.test(html) ? html.replace(pattern, replacement) : html;
}

export interface RenderOptions {
  /** Search Console "HTML tag" verification token. */
  googleVerification?: string;
  /** Bing Webmaster Tools verification token. */
  bingVerification?: string;
}

/**
 * `baseHtml` (the built `index.html`) rewritten for `route`. `siblings` are
 * all prerendered routes, used for the crawlable link list.
 */
export function renderRouteHtml(baseHtml: string, route: RouteMeta, siblings: RouteMeta[], options: RenderOptions = {}): string {
  const title = escapeHtml(route.title);
  const description = escapeHtml(route.description);
  const url = escapeHtml(route.canonical);
  let html = baseHtml;

  html = replaceTag(html, /<title>[\s\S]*?<\/title>/, `<title>${title}</title>`);
  html = replaceTag(html, /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/, `<meta name="description" content="${description}" />`);
  html = replaceTag(html, /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${url}" />`);
  html = html.replace(/(<link\s+rel="alternate"\s+hreflang="[^"]*"\s+href=")[^"]*(")/g, `$1${url}$2`);
  for (const [property, value] of [["og:title", title], ["og:description", description], ["og:url", url]] as const) {
    html = replaceTag(html, new RegExp(`<meta\\s+property="${property}"\\s+content="[^"]*"\\s*/?>`), `<meta property="${property}" content="${value}" />`);
  }
  for (const [name, value] of [["twitter:title", title], ["twitter:description", description], ["twitter:url", url]] as const) {
    html = replaceTag(html, new RegExp(`<meta\\s+name="${name}"\\s+content="[^"]*"\\s*/?>`), `<meta name="${name}" content="${value}" />`);
  }

  const crumbs = breadcrumbItems(route);
  const head: string[] = [];
  if (options.googleVerification) head.push(`<meta name="google-site-verification" content="${escapeHtml(options.googleVerification)}" />`);
  if (options.bingVerification) head.push(`<meta name="msvalidate.01" content="${escapeHtml(options.bingVerification)}" />`);
  if (crumbs.length > 1) {
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: crumbs.map((crumb, index) => ({ "@type": "ListItem", position: index + 1, name: crumb.name, item: crumb.item })),
    };
    // `<` is escaped so a title can never close the script element early.
    head.push(`<script type="application/ld+json" data-prerender-seo>${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>`);
  }
  if (head.length > 0) html = html.replace("</head>", `    ${head.join("\n    ")}\n  </head>`);

  // What a reader without JavaScript gets: the page's heading and summary,
  // its place in the site, and a way to every other public page.
  const links = siblings
    .filter((other) => other.path !== route.path)
    .map((other) => `<li><a href="${escapeHtml(other.path)}">${escapeHtml(shortName(other))}</a></li>`)
    .join("");
  const trail = crumbs.map((crumb) => `<a href="${escapeHtml(crumb.item)}">${escapeHtml(crumb.name)}</a>`).join(" › ");
  const fallback =
    `<noscript><main><nav aria-label="Breadcrumb">${trail}</nav>` +
    `<h1>${escapeHtml(route.path === "/" ? route.title : shortName(route))}</h1><p>${description}</p>` +
    `<p>This page needs JavaScript to show in full.</p><nav aria-label="Site"><ul>${links}</ul></nav></main></noscript>`;
  return replaceTag(html, /<noscript>[\s\S]*?<\/noscript>/, fallback);
}

/** Where a route's HTML file goes inside the build output. */
export function outputFile(route: RouteMeta): string {
  return route.path === "/" ? "index.html" : `${route.path.slice(1)}/index.html`;
}

/** Earlier is more important: home, then product pages, then policies. */
function priority(route: RouteMeta): string {
  if (route.path === "/") return "1.0";
  if (/^\/(privacy|terms|cookies|refunds|gdpr|data-deletion)$/.test(route.path)) return "0.3";
  return "0.8";
}

/** A sitemap of the given routes plus any extra absolute URLs. */
export function buildSitemap(routes: RouteMeta[], lastmod: string, extraUrls: string[] = []): string {
  const entries = [
    ...routes.map((route) => ({ loc: route.canonical, priority: priority(route) })),
    ...extraUrls.map((loc) => ({ loc, priority: "0.6" })),
  ];
  const body = entries
    .map((entry) => `  <url>\n    <loc>${escapeHtml(entry.loc)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <priority>${entry.priority}</priority>\n  </url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

/** The index pointing at the static sitemap and the live events sitemap. */
export function buildSitemapIndex(lastmod: string, origin: string = SITE_ORIGIN): string {
  const entry = (name: string): string => `  <sitemap>\n    <loc>${origin}/${name}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </sitemap>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entry("sitemap.xml")}\n${entry("sitemap-events.xml")}\n</sitemapindex>\n`;
}
