/* eslint-disable no-console */
/**
 * api/org-og — server-side OG / Twitter meta tags for organisation pages.
 *
 * Same idea as `api/event-og`: chat apps and social crawlers (WhatsApp,
 * LinkedIn, X, Slack, iMessage…) read `<meta>` tags from the served HTML and
 * never run JavaScript, so without this every `/org/<slug>` link previewed as
 * the generic illuxus card.
 *
 * Vercel rewrites `/org/:orgSlug` here (see `vercel.json`). The share card of
 * an organisation is, by default:
 *
 *   • image        → the company logo
 *   • title        → the company name
 *   • description  → the company bio (from its public page)
 *
 * Only organisations with a published public page are looked up (the
 * `get_public_org_by_slug` function enforces that), so nothing private can
 * leak into a preview. Missing pieces fall back sensibly: no bio → a short
 * "Events by <name>" line; no logo → the global illuxus card.
 *
 * Every failure path serves the unmodified `index.html` with a 200 — a
 * crawler must never see a 5xx.
 *
 * Runtime: Vercel Edge. Web Fetch API only.
 */

export const config = { runtime: 'edge' };

declare const process: { env: Record<string, string | undefined> };

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.PUBLIC_SUPABASE_ANON_KEY ||
  '';

const PUBLIC_ORIGIN = 'https://illuxus.com';
const DEFAULT_IMAGE = `${PUBLIC_ORIGIN}/og-image.png`;

interface OrgRow {
  id: string;
  name: string | null;
  slug: string | null;
  subdomain: string | null;
  logo_url: string | null;
  landing_config: { bio?: unknown } | null;
}

export interface OrgMeta {
  title: string;
  description: string;
  image: string;
  /** False when the image is the global fallback card rather than the org's logo. */
  hasLogo: boolean;
  url: string;
  jsonLd: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Plain text from a bio that may contain HTML or simple markdown. */
export function plainText(input: string): string {
  return input
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>?/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_~`]+/g, '')
    .replace(/^#+\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

const isHttpUrl = (s: unknown): s is string => typeof s === 'string' && /^https?:\/\//i.test(s.trim());

/** The share card for an organisation: logo, name, bio. */
export function buildOrgMeta(org: OrgRow, pathname: string): OrgMeta {
  const name = (org.name ?? '').trim() || 'Organisation';
  const bio = typeof org.landing_config?.bio === 'string' ? plainText(org.landing_config.bio) : '';
  const description = truncate(bio || `Events by ${name} on illuxus. See what's coming up and register.`, 200);
  const hasLogo = isHttpUrl(org.logo_url);
  const image = hasLogo ? (org.logo_url as string).trim() : DEFAULT_IMAGE;
  const url = `${PUBLIC_ORIGIN}${pathname}`;
  return {
    title: truncate(name, 70),
    description,
    image,
    hasLogo,
    url,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name,
      url,
      ...(hasLogo ? { logo: image } : {}),
      ...(bio ? { description: bio } : {}),
    },
  };
}

function replaceTag(html: string, selector: RegExp, replacement: string): string {
  return selector.test(html) ? html.replace(selector, replacement) : html;
}

export function rewriteHtml(html: string, meta: OrgMeta): string {
  const t = escapeHtml(meta.title);
  const d = escapeHtml(meta.description);
  const img = escapeHtml(meta.image);
  const u = escapeHtml(meta.url);
  const prop = (p: string) => new RegExp(`<meta\\s+property=["']${p}["'][^>]*\\/?>`, 'i');
  const named = (n: string) => new RegExp(`<meta\\s+name=["']${n}["'][^>]*\\/?>`, 'i');

  let out = html;
  out = replaceTag(out, /<title>[\s\S]*?<\/title>/i, `<title>${t}</title>`);
  out = replaceTag(out, named('description'), `<meta name="description" content="${d}" />`);
  out = replaceTag(out, /<link\s+rel=["']canonical["'][^>]*\/?>/i, `<link rel="canonical" href="${u}" />`);

  out = replaceTag(out, prop('og:type'), `<meta property="og:type" content="website" />`);
  out = replaceTag(out, prop('og:site_name'), `<meta property="og:site_name" content="${t}" />`);
  out = replaceTag(out, prop('og:url'), `<meta property="og:url" content="${u}" />`);
  out = replaceTag(out, prop('og:title'), `<meta property="og:title" content="${t}" />`);
  out = replaceTag(out, prop('og:description'), `<meta property="og:description" content="${d}" />`);
  out = replaceTag(out, prop('og:image'), `<meta property="og:image" content="${img}" />`);
  out = replaceTag(out, prop('og:image:secure_url'), `<meta property="og:image:secure_url" content="${img}" />`);
  out = replaceTag(out, prop('og:image:alt'), `<meta property="og:image:alt" content="${t}" />`);
  if (meta.hasLogo) {
    // The static tags describe the 1200×630 PNG site card; a logo has its own
    // (unknown) type and size, and wrong hints make some apps drop the image.
    out = replaceTag(out, prop('og:image:type'), '');
    out = replaceTag(out, prop('og:image:width'), '');
    out = replaceTag(out, prop('og:image:height'), '');
  }

  // A logo is usually square — the compact card shows it uncropped.
  out = replaceTag(out, named('twitter:card'), `<meta name="twitter:card" content="${meta.hasLogo ? 'summary' : 'summary_large_image'}" />`);
  out = replaceTag(out, named('twitter:title'), `<meta name="twitter:title" content="${t}" />`);
  out = replaceTag(out, named('twitter:description'), `<meta name="twitter:description" content="${d}" />`);
  out = replaceTag(out, named('twitter:image'), `<meta name="twitter:image" content="${img}" />`);
  out = replaceTag(out, named('twitter:image:alt'), `<meta name="twitter:image:alt" content="${t}" />`);

  const ld = JSON.stringify(meta.jsonLd).replace(/<\/script/gi, '<\\/script');
  out = out.replace(/<\/head>/i, `    <script type="application/ld+json" data-server-seo>${ld}</script>\n  </head>`);
  return out;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

async function fetchOrg(slug: string): Promise<OrgRow | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_public_org_by_slug`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${SUPABASE_ANON}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ _slug: slug }),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      console.warn('org-og: rpc returned', res.status);
      return null;
    }
    const rows = (await res.json()) as OrgRow[] | OrgRow | null;
    const row = Array.isArray(rows) ? rows[0] : rows;
    return row && row.id ? row : null;
  } catch (err) {
    console.warn('org-og: rpc fetch failed', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------

const HTML_HEADERS: Record<string, string> = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400',
  'X-Content-Type-Options': 'nosniff',
};

const MINIMAL = '<!doctype html><meta charset="utf-8"><title>illuxus</title>';

export default async function handler(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const orgSlug = (url.searchParams.get('orgSlug') ?? '').trim();

    let html: string | null = null;
    try {
      const res = await fetch(new URL('/index.html', req.url), { signal: AbortSignal.timeout(4000), headers: { Accept: 'text/html' } });
      html = res.ok ? await res.text() : null;
    } catch (err) {
      console.warn('org-og: index.html fetch failed', err);
    }
    if (!html) return new Response(MINIMAL, { status: 200, headers: HTML_HEADERS });

    // Slugs are short url-safe handles; anything else isn't worth a lookup.
    if (!orgSlug || orgSlug.length > 100 || !/^[a-z0-9][a-z0-9._-]*$/i.test(orgSlug)) {
      return new Response(html, { status: 200, headers: HTML_HEADERS });
    }

    const org = await fetchOrg(orgSlug);
    if (!org) return new Response(html, { status: 200, headers: HTML_HEADERS });

    let out = html;
    try {
      out = rewriteHtml(html, buildOrgMeta(org, `/org/${encodeURIComponent(orgSlug)}`));
    } catch (err) {
      console.warn('org-og: rewrite threw, serving unmodified shell', err);
    }
    return new Response(out, { status: 200, headers: HTML_HEADERS });
  } catch (err) {
    console.error('org-og: fatal, returning minimal shell', err);
    return new Response(MINIMAL, { status: 200, headers: HTML_HEADERS });
  }
}
