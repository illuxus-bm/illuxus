import { useEffect } from "react";
import { useSiteContent } from "@/hooks/useSiteContent";

/**
 * Applies the configurable site identity (title, meta tags, favicon, theme color)
 * to the document head. Mounted once at the app root so updates from the admin
 * Site Editor flow through to every route.
 */
const upsertMeta = (selector: string, attrs: Record<string, string>) => {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    document.head.appendChild(el);
  }
  Object.entries(attrs).forEach(([k, v]) => el!.setAttribute(k, v));
};

const upsertLink = (rel: string, href: string, type?: string) => {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
  if (type) el.setAttribute("type", type);
};

const guessFaviconType = (href: string): string | undefined => {
  const lower = href.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".ico")) return "image/x-icon";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return undefined;
};

export const SiteHead = () => {
  const { content, hydrated } = useSiteContent();
  const id = content.identity;

  useEffect(() => {
    // Wait until we have either cached or fresh DB content before touching the
    // document head. Otherwise the stale defaults overwrite index.html's
    // configured title/favicon for a split second on first paint.
    if (!hydrated || !id) return;
    if (id.siteTitle) document.title = id.siteTitle;

    if (id.metaDescription) {
      upsertMeta('meta[name="description"]', { name: "description", content: id.metaDescription });
      upsertMeta('meta[property="og:description"]', { property: "og:description", content: id.metaDescription });
      upsertMeta('meta[name="twitter:description"]', { name: "twitter:description", content: id.metaDescription });
    }
    if (id.siteTitle) {
      upsertMeta('meta[property="og:title"]', { property: "og:title", content: id.siteTitle });
      upsertMeta('meta[name="twitter:title"]', { name: "twitter:title", content: id.siteTitle });
    }
    if (id.author) {
      upsertMeta('meta[name="author"]', { name: "author", content: id.author });
    }
    if (id.ogImageUrl) {
      upsertMeta('meta[property="og:image"]', { property: "og:image", content: id.ogImageUrl });
      upsertMeta('meta[name="twitter:image"]', { name: "twitter:image", content: id.ogImageUrl });
      upsertMeta('meta[name="twitter:card"]', { name: "twitter:card", content: "summary_large_image" });
    }
    if (id.themeColor) {
      upsertMeta('meta[name="theme-color"]', { name: "theme-color", content: id.themeColor });
    }
    if (id.siteUrl) {
      upsertLink("canonical", id.siteUrl);
      upsertMeta('meta[property="og:url"]', { property: "og:url", content: id.siteUrl });
    }
    if (id.faviconUrl) {
      const type = guessFaviconType(id.faviconUrl);
      upsertLink("icon", id.faviconUrl, type);
      upsertLink("shortcut icon", id.faviconUrl, type);
    }
  }, [
    hydrated,
    id?.siteTitle,
    id?.metaDescription,
    id?.author,
    id?.ogImageUrl,
    id?.faviconUrl,
    id?.siteUrl,
    id?.themeColor,
  ]);

  return null;
};

export default SiteHead;