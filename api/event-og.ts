/* eslint-disable no-console */
/**
 * api/event-og — server-side OG / Twitter meta tag injection for event pages.
 *
 * Why this exists
 * ───────────────
 * WhatsApp, Twitter / X, LinkedIn, iMessage, Slack, Discord, Telegram and
 * Facebook crawlers fetch event URLs and parse static `<meta property="og:*">`
 * tags out of the served HTML. They do NOT execute JavaScript.
 *
 * The SPA's `RouteSeo` component patches meta tags client-side after React
 * hydrates, so before this function existed, every crawler saw the same
 * default illuxus og:image baked into `index.html` — never the event-specific
 * banner. Share previews on chat platforms were always the generic card.
 *
 * What it does
 * ────────────
 * Vercel rewrites `/org/:orgSlug/events/:eventSlug` and `/events/:eventId`
 * to this function (see `vercel.json`). For each request it:
 *
 *   1. Looks up the event via Supabase REST (anon key, public rows only).
 *   2. Fetches the static `index.html` from the same deployment.
 *   3. Rewrites `<title>`, `<meta name="description">`, the full set of
 *      `og:*` and `twitter:*` tags, and `<link rel="canonical">` to
 *      event-specific values.
 *   4. Injects a schema.org `Event` JSON-LD before `</head>` tagged with
 *      `data-server-seo` so client-side code can detect server injection.
 *   5. Returns the rewritten HTML with a CDN-friendly Cache-Control header.
 *
 * Humans see no visible difference — the SPA hydrates on top of the rewritten
 * `<head>`. Crawlers get a fully populated share card before any JS runs.
 *
 * Failure model
 * ─────────────
 * Every failure path falls back to the unmodified `index.html`. Crawlers
 * must NEVER see a 5xx response — that would drop the share card entirely.
 *
 * Runtime
 * ───────
 * Vercel Edge (V8 isolate). Web Fetch API only — no Node.js APIs, no npm
 * packages. `process.env` is the documented way to read Vercel env vars
 * inside Edge functions.
 */

export const config = { runtime: 'edge' };

// Declare the minimal `process` surface so this file type-checks outside of
// a Node-types environment. Vercel populates `process.env` at runtime.
declare const process: { env: Record<string, string | undefined> };

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ||
  process.env.PUBLIC_SUPABASE_URL ||
  '';

const SUPABASE_ANON =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.PUBLIC_SUPABASE_ANON_KEY ||
  '';

// Canonical public origin. Used to build `og:url` and `<link rel="canonical">`.
// Hard-coded because the project standard is illuxus.com for production share
// links; preview-deploy crawlers are rare and the canonical pointing at prod
// is what Google / WhatsApp expect.
const PUBLIC_ORIGIN = 'https://illuxus.com';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EmbeddedOrg {
  name: string | null;
  slug: string | null;
  subdomain: string | null;
  logo_url: string | null;
}

interface EventRow {
  id: string;
  title: string | null;
  description: string | null;
  date: string | null;
  end_date: string | null;
  venue: string | null;
  location: string | null;
  banner_landscape_url: string | null;
  image_url: string | null;
  slug: string | null;
  timezone: string | null;
  event_format: string | null;
  status: string | null;
  price: number | null;
  currency: string | null;
  virtual_url: string | null;
  organizations?: EmbeddedOrg | EmbeddedOrg[] | null;
}

interface BuiltMeta {
  title: string;
  description: string;
  ogImage: string;
  ogUrl: string;
  canonical: string;
  ogType: string;
  jsonLd: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripMarkdown(input: string): string {
  return (input || '')
    .replace(/```[\s\S]*?```/g, '')   // fenced code
    .replace(/`([^`]+)`/g, '$1')      // inline code
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links / images keep label
    .replace(/[*_~]+/g, '')           // bold / italic / strike markers
    .replace(/^#+\s+/gm, '')          // headers
    .replace(/\s+/g, ' ')             // collapse whitespace
    .trim();
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trimEnd()}…`;
}

function replaceMetaTag(html: string, selector: RegExp, replacement: string): string {
  return selector.test(html) ? html.replace(selector, replacement) : html;
}

// ---------------------------------------------------------------------------
// Date / id helpers
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

function isValidTz(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function formatEventDate(iso: string | null, tz: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const zone = tz && isValidTz(tz) ? tz : 'UTC';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

// ---------------------------------------------------------------------------
// Supabase REST
// ---------------------------------------------------------------------------

const SELECT_COLUMNS =
  'id,title,description,date,end_date,venue,location,banner_landscape_url,image_url,slug,timezone,event_format,status,price,currency,virtual_url';

async function fetchOne(url: string): Promise<EventRow | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON) return null;
  try {
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${SUPABASE_ANON}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as EventRow[];
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  } catch (err) {
    console.warn('event-og: supabase fetch failed', err);
    return null;
  }
}

async function fetchEventByOrgAndSlug(
  orgSlug: string,
  eventSlug: string,
): Promise<EventRow | null> {
  const select = `${SELECT_COLUMNS},organizations!inner(name,slug,subdomain,logo_url)`;
  const url =
    `${SUPABASE_URL}/rest/v1/events` +
    `?slug=eq.${encodeURIComponent(eventSlug)}` +
    `&organizations.slug=eq.${encodeURIComponent(orgSlug)}` +
    `&select=${encodeURIComponent(select)}` +
    `&limit=1`;
  return fetchOne(url);
}

async function fetchEventById(id: string): Promise<EventRow | null> {
  const select = `${SELECT_COLUMNS},organizations(name,slug,subdomain,logo_url)`;
  const url =
    `${SUPABASE_URL}/rest/v1/events` +
    `?id=eq.${encodeURIComponent(id)}` +
    `&select=${encodeURIComponent(select)}` +
    `&limit=1`;
  return fetchOne(url);
}

async function fetchEventBySlug(slug: string): Promise<EventRow | null> {
  const select = `${SELECT_COLUMNS},organizations(name,slug,subdomain,logo_url)`;
  const url =
    `${SUPABASE_URL}/rest/v1/events` +
    `?slug=eq.${encodeURIComponent(slug)}` +
    `&select=${encodeURIComponent(select)}` +
    `&limit=1`;
  return fetchOne(url);
}

function extractOrg(event: EventRow): EmbeddedOrg | null {
  const o = event.organizations;
  if (!o) return null;
  return Array.isArray(o) ? (o[0] ?? null) : o;
}


// ---------------------------------------------------------------------------
// Meta building
// ---------------------------------------------------------------------------

function buildMeta(event: EventRow, pathname: string): BuiltMeta {
  const org = extractOrg(event);
  const orgName = org?.name ?? 'illuxus';
  const eventTitle = event.title ?? 'Event';
  const canonical = `${PUBLIC_ORIGIN}${pathname}`;

  // Title — "{title} — {orgName}" truncated to 60 chars.
  const title = truncate(`${eventTitle} — ${orgName}`, 60);

  // Description — strip markdown, take first 155 chars, fall back to a
  // templated string when the event has no usable body copy.
  const stripped = stripMarkdown(event.description ?? '');
  const dateLabel = formatEventDate(event.date, event.timezone);
  const venueLabel = event.venue || event.location || 'online';
  const templated = `Join ${orgName} for ${eventTitle}${dateLabel ? ` on ${dateLabel}` : ''} at ${venueLabel}.`;
  const baseDesc = stripped && stripped.length > 20 ? stripped : templated;
  const description = truncate(baseDesc, 155);

  // OG image — point at the existing supabase `og-event` watermarked PNG
  // function (commit 60aa037). Fall back to a stored banner or the global
  // illuxus card if Supabase isn't configured for some reason.
  const ogImage = SUPABASE_URL
    ? `${SUPABASE_URL}/functions/v1/og-event?id=${encodeURIComponent(event.id)}`
    : event.banner_landscape_url || event.image_url || `${PUBLIC_ORIGIN}/og-image.png`;

  // schema.org Event JSON-LD.
  const format = event.event_format;
  const attendanceMode =
    format === 'virtual'
      ? 'https://schema.org/OnlineEventAttendanceMode'
      : format === 'hybrid'
        ? 'https://schema.org/MixedEventAttendanceMode'
        : 'https://schema.org/OfflineEventAttendanceMode';

  const eventStatus =
    event.status === 'cancelled'
      ? 'https://schema.org/EventCancelled'
      : 'https://schema.org/EventScheduled';

  const virtualUrl = event.virtual_url || canonical;
  const placeLoc = {
    '@type': 'Place',
    name: event.venue || orgName,
    address: event.location || undefined,
  };
  const virtualLoc = { '@type': 'VirtualLocation', url: virtualUrl };
  const location =
    format === 'virtual'
      ? virtualLoc
      : format === 'hybrid'
        ? [placeLoc, virtualLoc]
        : placeLoc;

  const price = Number(event.price ?? 0);
  const currency = event.currency || 'INR';
  const orgHandle = org?.subdomain || org?.slug || null;
  const orgLanding = orgHandle ? `${PUBLIC_ORIGIN}/org/${orgHandle}` : PUBLIC_ORIGIN;

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: eventTitle,
    description: stripped || templated,
    startDate: event.date,
    endDate: event.end_date || event.date,
    eventStatus,
    eventAttendanceMode: attendanceMode,
    location,
    image: [ogImage],
    url: canonical,
    organizer: {
      '@type': 'Organization',
      name: orgName,
      url: orgLanding,
      logo: org?.logo_url || undefined,
    },
    offers: {
      '@type': 'Offers',
      url: canonical,
      price: price.toFixed(2),
      priceCurrency: currency,
      availability:
        event.status === 'cancelled'
          ? 'https://schema.org/SoldOut'
          : 'https://schema.org/InStock',
      validFrom: new Date().toISOString(),
    },
    inLanguage: 'en',
    isAccessibleForFree: price === 0,
  };

  return {
    title,
    description,
    ogImage,
    ogUrl: canonical,
    canonical,
    ogType: 'event',
    jsonLd,
  };
}

// ---------------------------------------------------------------------------
// HTML rewrite
// ---------------------------------------------------------------------------

function rewriteHtml(html: string, meta: BuiltMeta): string {
  const t = escapeHtml(meta.title);
  const d = escapeHtml(meta.description);
  const img = escapeHtml(meta.ogImage);
  const u = escapeHtml(meta.ogUrl);
  const c = escapeHtml(meta.canonical);
  const type = escapeHtml(meta.ogType);

  let out = html;

  // <title>
  out = replaceMetaTag(out, /<title>[\s\S]*?<\/title>/i, `<title>${t}</title>`);

  // <meta name="description">
  out = replaceMetaTag(
    out,
    /<meta\s+name=["']description["'][^>]*\/?>/i,
    `<meta name="description" content="${d}" />`,
  );

  // <link rel="canonical">
  out = replaceMetaTag(
    out,
    /<link\s+rel=["']canonical["'][^>]*\/?>/i,
    `<link rel="canonical" href="${c}" />`,
  );

  // Open Graph — og:type, og:url, og:title, og:description, og:image.
  // The og:image regex matches only `property="og:image"` exactly, not
  // og:image:secure_url / og:image:type / og:image:width / og:image:height /
  // og:image:alt — those keep their existing static values.
  out = replaceMetaTag(
    out,
    /<meta\s+property=["']og:type["'][^>]*\/?>/i,
    `<meta property="og:type" content="${type}" />`,
  );
  out = replaceMetaTag(
    out,
    /<meta\s+property=["']og:url["'][^>]*\/?>/i,
    `<meta property="og:url" content="${u}" />`,
  );
  out = replaceMetaTag(
    out,
    /<meta\s+property=["']og:title["'][^>]*\/?>/i,
    `<meta property="og:title" content="${t}" />`,
  );
  out = replaceMetaTag(
    out,
    /<meta\s+property=["']og:description["'][^>]*\/?>/i,
    `<meta property="og:description" content="${d}" />`,
  );
  out = replaceMetaTag(
    out,
    /<meta\s+property=["']og:image["'][^>]*\/?>/i,
    `<meta property="og:image" content="${img}" />`,
  );
  // Keep og:image:secure_url in sync — same URL, https-only by definition.
  out = replaceMetaTag(
    out,
    /<meta\s+property=["']og:image:secure_url["'][^>]*\/?>/i,
    `<meta property="og:image:secure_url" content="${img}" />`,
  );

  // Twitter — twitter:card, twitter:title, twitter:description, twitter:image.
  out = replaceMetaTag(
    out,
    /<meta\s+name=["']twitter:card["'][^>]*\/?>/i,
    `<meta name="twitter:card" content="summary_large_image" />`,
  );
  out = replaceMetaTag(
    out,
    /<meta\s+name=["']twitter:title["'][^>]*\/?>/i,
    `<meta name="twitter:title" content="${t}" />`,
  );
  out = replaceMetaTag(
    out,
    /<meta\s+name=["']twitter:description["'][^>]*\/?>/i,
    `<meta name="twitter:description" content="${d}" />`,
  );
  out = replaceMetaTag(
    out,
    /<meta\s+name=["']twitter:image["'][^>]*\/?>/i,
    `<meta name="twitter:image" content="${img}" />`,
  );

  // Inject Event JSON-LD right before </head>. Escape any literal `</script`
  // inside the payload so it can't terminate the script tag prematurely.
  const ldPayload = JSON.stringify(meta.jsonLd).replace(/<\/script/gi, '<\\/script');
  const ldScript = `<script type="application/ld+json" data-server-seo>${ldPayload}</script>`;
  out = out.replace(/<\/head>/i, `    ${ldScript}\n  </head>`);

  return out;
}

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------

const HTML_HEADERS: Record<string, string> = {
  'Content-Type': 'text/html; charset=utf-8',
  // 5 min CDN cache + 1 day stale-while-revalidate. Edge-cached per URL so
  // each event has its own entry.
  'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400',
  'X-Content-Type-Options': 'nosniff',
};

async function fetchIndexHtml(req: Request): Promise<string | null> {
  try {
    const res = await fetch(new URL('/index.html', req.url), {
      signal: AbortSignal.timeout(4000),
      headers: { Accept: 'text/html' },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch (err) {
    console.warn('event-og: index.html fetch failed', err);
    return null;
  }
}

export default async function handler(req: Request): Promise<Response> {
  try {
    return await renderForRequest(req);
  } catch (err) {
    // Last-resort backstop. The inner handler already catches every known
    // failure mode and serves a 200, but if something truly unexpected
    // escapes (e.g. malformed req.url), still return 200 with minimal HTML
    // so crawlers don't drop the share card entirely.
    console.error('event-og: fatal, returning minimal shell', err);
    return new Response('<!doctype html><meta charset="utf-8"><title>illuxus</title>', {
      status: 200,
      headers: HTML_HEADERS,
    });
  }
}

async function renderForRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const orgSlug = url.searchParams.get('orgSlug');
  const eventSlug = url.searchParams.get('eventSlug');
  const eventId = url.searchParams.get('eventId');

  // Reconstruct the user-facing pathname so canonical / og:url point at the
  // URL the crawler actually requested (not the internal /api/event-og path).
  let pathname = url.pathname;
  if (orgSlug && eventSlug) {
    pathname = `/org/${encodeURIComponent(orgSlug)}/events/${encodeURIComponent(eventSlug)}`;
  } else if (eventId) {
    pathname = `/events/${encodeURIComponent(eventId)}`;
  }

  // Always need the shell. If even THIS fails, return a minimal 200 — never
  // a 5xx to crawlers.
  const html = await fetchIndexHtml(req);
  if (!html) {
    return new Response('<!doctype html><meta charset="utf-8"><title>illuxus</title>', {
      status: 200,
      headers: HTML_HEADERS,
    });
  }

  // Look up the event. Any failure → serve the unmodified shell.
  let event: EventRow | null = null;
  try {
    if (orgSlug && eventSlug) {
      event = await fetchEventByOrgAndSlug(orgSlug, eventSlug);
    } else if (eventId) {
      // /events/:id accepts both UUIDs and slugs (see PublicEventPage).
      event = isUuid(eventId)
        ? await fetchEventById(eventId)
        : await fetchEventBySlug(eventId);
    }
  } catch (err) {
    console.warn('event-og: lookup threw', err);
    event = null;
  }

  if (!event || !event.id) {
    return new Response(html, { status: 200, headers: HTML_HEADERS });
  }

  let rewritten = html;
  try {
    rewritten = rewriteHtml(html, buildMeta(event, pathname));
  } catch (err) {
    console.warn('event-og: rewrite threw, serving unmodified shell', err);
    rewritten = html;
  }

  return new Response(rewritten, { status: 200, headers: HTML_HEADERS });
}
