import { useEffect } from "react";
import { useSiteContent } from "@/hooks/useSiteContent";
import { useCookieConsent } from "@/hooks/useCookieConsent";

/**
 * Applies the configurable site identity (title, meta tags, favicon, theme color)
 * to the document head and injects platform-wide structured data, hreflang
 * alternates, and (gated on cookie consent) analytics scripts.
 *
 * Mounted once at the app root so updates from the admin Site Editor flow
 * through to every route. Per-route overrides are handled by `<RouteSeo />`.
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

// ---------------------------------------------------------------------------
// Global structured data
//
// Injected once on first mount and tagged with `data-global-seo` so the
// per-route `<RouteSeo />` component (which uses `data-route-seo`) never
// collides with it. We keep the @graph small enough that Google's structured
// data tester can parse it in one bite — extra entities are dropped into the
// per-route scripts via RouteSeo.
// ---------------------------------------------------------------------------
const GLOBAL_LD_SELECTOR = 'script[type="application/ld+json"][data-global-seo]';

const buildGlobalGraph = (canonicalUrl: string, ogImage: string) => ({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": ["Organization", "LocalBusiness"],
      "@id": "https://illuxus.com/#organization",
      name: "Illuxus Technologies Private Limited",
      alternateName: "illuxus",
      url: canonicalUrl,
      logo: {
        "@type": "ImageObject",
        url: "https://illuxus.com/favicon-512.png",
        width: 512,
        height: 512,
      },
      image: ogImage,
      description:
        "All-in-one event management platform: branded event pages, ticketing, QR check-in, live webinars, communities, and analytics.",
      foundingDate: "2023",
      address: {
        "@type": "PostalAddress",
        streetAddress: "4th Floor, Lighthouse Tower, Bandra Kurla Complex",
        addressLocality: "Mumbai",
        addressRegion: "Maharashtra",
        postalCode: "400051",
        addressCountry: "IN",
      },
      geo: {
        "@type": "GeoCoordinates",
        latitude: 19.067,
        longitude: 72.8688,
      },
      openingHoursSpecification: [
        {
          "@type": "OpeningHoursSpecification",
          dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
          opens: "09:30",
          closes: "18:30",
        },
      ],
      sameAs: [
        "https://www.linkedin.com/company/illuxus",
        "https://x.com/illuxus",
        "https://www.instagram.com/illuxus",
        "https://www.youtube.com/@illuxus",
      ],
      contactPoint: [
        {
          "@type": "ContactPoint",
          contactType: "sales",
          email: "sales@illuxus.com",
          areaServed: ["IN", "SG", "AE", "GB", "US"],
          availableLanguage: ["English", "Hindi"],
        },
        {
          "@type": "ContactPoint",
          contactType: "customer support",
          email: "support@illuxus.com",
          areaServed: "Worldwide",
          availableLanguage: ["English", "Hindi"],
        },
        {
          "@type": "ContactPoint",
          contactType: "technical support",
          email: "tech@illuxus.com",
          areaServed: "Worldwide",
          availableLanguage: ["English"],
        },
        {
          "@type": "ContactPoint",
          contactType: "customer service",
          email: "grievance@illuxus.com",
          areaServed: "IN",
          availableLanguage: ["English", "Hindi"],
        },
      ],
    },
    {
      "@type": "WebSite",
      "@id": "https://illuxus.com/#website",
      url: "https://illuxus.com/",
      name: "illuxus",
      publisher: { "@id": "https://illuxus.com/#organization" },
      inLanguage: "en-US",
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: "https://illuxus.com/events?q={search_term_string}",
        },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "BreadcrumbList",
      "@id": "https://illuxus.com/#breadcrumb",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://illuxus.com/" },
      ],
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://illuxus.com/#software",
      name: "illuxus",
      operatingSystem: "Web, iOS, Android",
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "EventManagement",
      url: "https://illuxus.com/",
      offers: {
        "@type": "AggregateOffer",
        priceCurrency: "INR",
        lowPrice: "0",
        highPrice: "16999",
        offerCount: "3",
      },
    },
  ],
});

const injectGlobalLd = (canonicalUrl: string, ogImage: string) => {
  document.head.querySelectorAll(GLOBAL_LD_SELECTOR).forEach((n) => n.remove());
  const el = document.createElement("script");
  el.setAttribute("type", "application/ld+json");
  el.setAttribute("data-global-seo", "true");
  el.textContent = JSON.stringify(buildGlobalGraph(canonicalUrl, ogImage));
  document.head.appendChild(el);
};

// ---------------------------------------------------------------------------
// hreflang alternates — point both en-US and en-IN at the same canonical
// host. When localised content ships later, swap the targets here.
// ---------------------------------------------------------------------------
const upsertHreflang = (lang: string, href: string) => {
  const existing = Array.from(
    document.head.querySelectorAll<HTMLLinkElement>(`link[rel="alternate"][hreflang="${lang}"]`),
  );
  let el = existing[0];
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "alternate");
    el.setAttribute("hreflang", lang);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
};

// ---------------------------------------------------------------------------
// Analytics injection — GA4 and Microsoft Clarity. Only inserted when the
// build provides the env-var keys AND the user has opted into analytics
// cookies via the cookie-consent banner. The wrapper functions are
// idempotent so a re-render does not duplicate scripts.
// ---------------------------------------------------------------------------
const GA_FLAG = "data-illuxus-ga4";
const CLARITY_FLAG = "data-illuxus-clarity";

const injectGa4 = (id: string) => {
  if (document.querySelector(`script[${GA_FLAG}="${id}"]`)) return;
  // Loader stub — async tag, gtag init, page-view event.
  const loader = document.createElement("script");
  loader.async = true;
  loader.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
  loader.setAttribute(GA_FLAG, id);
  document.head.appendChild(loader);

  const init = document.createElement("script");
  init.setAttribute(GA_FLAG, `${id}-init`);
  init.text = [
    "window.dataLayer = window.dataLayer || [];",
    "function gtag(){dataLayer.push(arguments);}",
    "gtag('js', new Date());",
    `gtag('config', '${id}', { anonymize_ip: true });`,
  ].join("\n");
  document.head.appendChild(init);
};

const injectClarity = (id: string) => {
  if (document.querySelector(`script[${CLARITY_FLAG}="${id}"]`)) return;
  const init = document.createElement("script");
  init.setAttribute(CLARITY_FLAG, id);
  init.text = `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${id}");`;
  document.head.appendChild(init);
};

const removeAnalytics = () => {
  document
    .querySelectorAll(`script[${GA_FLAG}], script[${CLARITY_FLAG}]`)
    .forEach((n) => n.remove());
};

// ---------------------------------------------------------------------------
// Search Console + Bing Webmaster verification meta scaffolding. These
// values are placeholders — the operator pastes their real token before
// publishing. Empty content tags do not claim ownership, so it is safe to
// leave them in until the operator fills them in.
// ---------------------------------------------------------------------------
const ensureVerificationStubs = () => {
  // Google Search Console — replace content with the token from GSC's HTML
  // tag method (Search Console → Settings → Verification Methods).
  if (!document.head.querySelector('meta[name="google-site-verification"]')) {
    upsertMeta('meta[name="google-site-verification"]', {
      name: "google-site-verification",
      // REPLACE_WITH_GSC_TOKEN — paste the token from Google Search Console.
      content: "REPLACE_WITH_GSC_TOKEN",
    });
  }
  // Bing Webmaster Tools — replace content with the token from Bing.
  if (!document.head.querySelector('meta[name="msvalidate.01"]')) {
    upsertMeta('meta[name="msvalidate.01"]', {
      name: "msvalidate.01",
      // REPLACE_WITH_BING_TOKEN — paste the token from Bing Webmaster Tools.
      content: "REPLACE_WITH_BING_TOKEN",
    });
  }
};

export const SiteHead = () => {
  const { content, hydrated } = useSiteContent();
  const id = content.identity;
  const consent = useCookieConsent();

  // ---- Identity sync (existing behaviour). ----
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

  // ---- Global structured data + hreflang + verification stubs. ----
  useEffect(() => {
    const canonical = id?.siteUrl || "https://illuxus.com/";
    const ogImage = id?.ogImageUrl || "https://illuxus.com/og-image.png";
    injectGlobalLd(canonical, ogImage);
    upsertHreflang("en-US", "https://illuxus.com/");
    upsertHreflang("en-IN", "https://illuxus.com/");
    upsertHreflang("x-default", "https://illuxus.com/");
    ensureVerificationStubs();
  }, [id?.siteUrl, id?.ogImageUrl]);

  // ---- GA4 + Microsoft Clarity, gated on analytics consent + env vars. ----
  useEffect(() => {
    const ga4Id = import.meta.env.VITE_GA4_ID as string | undefined;
    const clarityId = import.meta.env.VITE_CLARITY_ID as string | undefined;
    if (consent.analytics) {
      if (ga4Id) injectGa4(ga4Id);
      if (clarityId) injectClarity(clarityId);
    } else {
      // If the user revokes consent (or declines from the start), pull
      // anything we previously injected so the bundle stops talking to GA /
      // Clarity for the rest of the session.
      removeAnalytics();
    }
  }, [consent.analytics]);

  return null;
};

export default SiteHead;
