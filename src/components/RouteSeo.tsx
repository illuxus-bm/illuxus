import { useEffect } from "react";

/**
 * RouteSeo — declarative per-page SEO injection.
 *
 * Drop this anywhere inside a page component and it will upsert the page's
 * <title>, meta description, keywords, canonical URL, Open Graph + Twitter
 * cards, robots directive, and JSON-LD structured data into <head>.
 *
 * On unmount it restores the snapshot it captured when it mounted so back
 * navigation falls back to the global identity injected by `<SiteHead />`
 * and `index.html`. JSON-LD scripts inserted by RouteSeo are tagged with a
 * `data-route-seo` attribute so cleanup only removes its own scripts and
 * never touches the global `data-global-seo` graph.
 *
 * Pure DOM API — no react-helmet or other dependencies.
 */

export type RouteSeoProps = {
  /** Page <title>. Should be unique per route, ~50–60 chars, brand suffix. */
  title: string;
  /** Meta description. ~150–160 chars, keyword-rich, action-oriented. */
  description: string;
  /** Canonical absolute URL for this route, e.g. "https://illuxus.com/pricing". */
  canonical: string;
  /** Comma-separated long-tail keywords list. */
  keywords?: string;
  /** Absolute URL of the social-share image. Defaults to the global OG. */
  ogImage?: string;
  /**
   * Open Graph object type. Defaults to "website". Use "article" for
   * blog posts, "product" for pricing pages where appropriate, etc.
   */
  ogType?: string;
  /**
   * Schema.org JSON-LD object (or array of objects) describing this page.
   * Will be wrapped in a single <script type="application/ld+json"> tag
   * with a `data-route-seo` attribute for targeted cleanup.
   */
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
  /** If true, emits <meta name="robots" content="noindex, nofollow">. */
  noindex?: boolean;
};

const ROUTE_LD_SELECTOR = "script[type=\"application/ld+json\"][data-route-seo]";

// ---------------------------------------------------------------------------
// Helpers — exported for tests but primarily used internally.
// ---------------------------------------------------------------------------

/** Upserts a <meta name="..."> tag and sets its `content`. */
export const upsertMeta = (name: string, content: string): void => {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
};

/** Upserts a <meta property="..."> tag (Open Graph / Facebook style). */
export const upsertProperty = (property: string, content: string): void => {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
};

/** Upserts <link rel="canonical" href="..."> and returns it. */
const upsertCanonical = (href: string): void => {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
};

/** Replaces (or removes & inserts) the route-specific JSON-LD script. */
export const setLdJson = (data: RouteSeoProps["jsonLd"]): void => {
  removeLdJson();
  if (!data) return;
  const el = document.createElement("script");
  el.setAttribute("type", "application/ld+json");
  el.setAttribute("data-route-seo", "true");
  el.textContent = JSON.stringify(data);
  document.head.appendChild(el);
};

/** Removes any route-specific JSON-LD scripts previously inserted. */
export const removeLdJson = (): void => {
  document.head.querySelectorAll(ROUTE_LD_SELECTOR).forEach((n) => n.parentNode?.removeChild(n));
};

// Internal helpers used only by the effect below — read existing tag values
// so we can restore them on unmount.
const readMeta = (name: string): string | null => {
  const el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  return el?.getAttribute("content") ?? null;
};
const readProperty = (property: string): string | null => {
  const el = document.head.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  return el?.getAttribute("content") ?? null;
};
const readCanonical = (): string | null => {
  const el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  return el?.getAttribute("href") ?? null;
};

const restoreMeta = (name: string, snapshot: string | null): void => {
  if (snapshot === null) {
    document.head.querySelector(`meta[name="${name}"]`)?.remove();
  } else {
    upsertMeta(name, snapshot);
  }
};
const restoreProperty = (property: string, snapshot: string | null): void => {
  if (snapshot === null) {
    document.head.querySelector(`meta[property="${property}"]`)?.remove();
  } else {
    upsertProperty(property, snapshot);
  }
};

/**
 * Per-route SEO. Mount once per page; the effect handles upsert + cleanup.
 */
export const RouteSeo = (props: RouteSeoProps) => {
  const {
    title,
    description,
    canonical,
    keywords,
    ogImage,
    ogType = "website",
    jsonLd,
    noindex = false,
  } = props;

  useEffect(() => {
    // ---- Snapshot current head state so unmount can restore it. ----
    const prev = {
      title: document.title,
      description: readMeta("description"),
      keywords: readMeta("keywords"),
      robots: readMeta("robots"),
      canonical: readCanonical(),
      ogTitle: readProperty("og:title"),
      ogDescription: readProperty("og:description"),
      ogUrl: readProperty("og:url"),
      ogImage: readProperty("og:image"),
      ogType: readProperty("og:type"),
      twTitle: readMeta("twitter:title"),
      twDescription: readMeta("twitter:description"),
      twImage: readMeta("twitter:image"),
      twCard: readMeta("twitter:card"),
    };

    // ---- Apply route values. ----
    document.title = title;
    upsertMeta("description", description);
    if (keywords) upsertMeta("keywords", keywords);

    upsertMeta(
      "robots",
      noindex
        ? "noindex, nofollow"
        : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
    );

    upsertCanonical(canonical);

    // Open Graph — keep og:url aligned with the canonical so crawlers don't
    // see a mismatch (Google flags this in Search Console).
    upsertProperty("og:title", title);
    upsertProperty("og:description", description);
    upsertProperty("og:url", canonical);
    upsertProperty("og:type", ogType);
    if (ogImage) upsertProperty("og:image", ogImage);

    // Twitter — mirror title/description, default to summary_large_image card.
    upsertMeta("twitter:title", title);
    upsertMeta("twitter:description", description);
    upsertMeta("twitter:card", "summary_large_image");
    if (ogImage) upsertMeta("twitter:image", ogImage);

    setLdJson(jsonLd);

    return () => {
      // ---- Restore the snapshot so back-navigation reapplies globals. ----
      document.title = prev.title;
      restoreMeta("description", prev.description);
      restoreMeta("keywords", prev.keywords);
      restoreMeta("robots", prev.robots);
      if (prev.canonical === null) {
        document.head.querySelector('link[rel="canonical"]')?.remove();
      } else {
        upsertCanonical(prev.canonical);
      }
      restoreProperty("og:title", prev.ogTitle);
      restoreProperty("og:description", prev.ogDescription);
      restoreProperty("og:url", prev.ogUrl);
      restoreProperty("og:image", prev.ogImage);
      restoreProperty("og:type", prev.ogType);
      restoreMeta("twitter:title", prev.twTitle);
      restoreMeta("twitter:description", prev.twDescription);
      restoreMeta("twitter:image", prev.twImage);
      restoreMeta("twitter:card", prev.twCard);
      removeLdJson();
    };
    // We intentionally rerun the entire snapshot/apply cycle whenever any
    // of these change. The cleanup of the previous run restores its snapshot
    // before the new run captures its own, which keeps state coherent.
  }, [title, description, canonical, keywords, ogImage, ogType, noindex, jsonLd]);

  return null;
};

export default RouteSeo;
