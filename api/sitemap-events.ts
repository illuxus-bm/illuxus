/* eslint-disable no-console */
/**
 * api/sitemap-events — a live sitemap of published events and public
 * organisation pages, served at `/sitemap-events.xml` (see `vercel.json`).
 *
 * The static pages are listed in `sitemap.xml`, written at build time. Events
 * and organisation pages are created by organisers at any moment, so they
 * are listed from the database on request instead and cached at the CDN.
 *
 * Reads through the public (anon) key, so only rows the public can already
 * see are listed. Any failure yields a valid, empty sitemap rather than an
 * error — a 5xx here makes search engines distrust the whole sitemap index.
 *
 * Runtime: Vercel Edge (Web Fetch API only), like the other functions here.
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
/** A sitemap file may list at most 50,000 URLs; stay well inside it. */
const MAX_ROWS = 20000;

interface OrgRef {
  slug: string | null;
}

export interface SitemapEventRow {
  id: string;
  slug: string | null;
  updated_at: string | null;
  organizations?: OrgRef | OrgRef[] | null;
}

export interface SitemapOrgRow {
  slug: string | null;
  updated_at: string | null;
}

const escapeXml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** `2026-08-12T03:30:00Z` → `2026-08-12`, or nothing for a missing or bad date. */
function day(value: string | null): string | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString().slice(0, 10);
}

/** The address an event is canonically served at. Pure. */
export function eventUrl(event: SitemapEventRow): string {
  const org = Array.isArray(event.organizations) ? event.organizations[0] : event.organizations;
  if (org?.slug && event.slug) {
    return `${PUBLIC_ORIGIN}/org/${encodeURIComponent(org.slug)}/events/${encodeURIComponent(event.slug)}`;
  }
  return `${PUBLIC_ORIGIN}/events/${encodeURIComponent(event.id)}`;
}

/** The sitemap XML for the given rows. Pure. */
export function buildEventsSitemap(events: SitemapEventRow[], orgs: SitemapOrgRow[]): string {
  const seen = new Set<string>();
  const entries: string[] = [];
  const add = (loc: string, lastmod: string | null): void => {
    if (seen.has(loc)) return;
    seen.add(loc);
    entries.push(`  <url>\n    <loc>${escapeXml(loc)}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}\n  </url>`);
  };
  for (const org of orgs) {
    if (org.slug) add(`${PUBLIC_ORIGIN}/org/${encodeURIComponent(org.slug)}`, day(org.updated_at));
  }
  for (const event of events) {
    if (event.id) add(eventUrl(event), day(event.updated_at));
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}${entries.length ? '\n' : ''}</urlset>\n`;
}

async function fetchRows<T>(query: string): Promise<T[]> {
  if (!SUPABASE_URL || !SUPABASE_ANON) return [];
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      console.warn('sitemap-events: query failed', res.status, query.split('?')[0]);
      return [];
    }
    const rows = (await res.json()) as unknown;
    return Array.isArray(rows) ? (rows as T[]) : [];
  } catch (err) {
    console.warn('sitemap-events: query threw', (err as Error)?.message);
    return [];
  }
}

export default async function handler(): Promise<Response> {
  const [events, orgs] = await Promise.all([
    fetchRows<SitemapEventRow>(
      `events?select=id,slug,updated_at,organizations(slug)&status=eq.published&order=date.desc&limit=${MAX_ROWS}`,
    ),
    fetchRows<SitemapOrgRow>(`organizations?select=slug,updated_at&landing_published=eq.true&limit=${MAX_ROWS}`),
  ]);
  return new Response(buildEventsSitemap(events, orgs), {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      // Fresh enough for new events to appear within the hour; served stale
      // while revalidating so a slow database never slows a crawler.
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
