-- Point footer Legal column entries at their dedicated pages.
--
-- Previously Cookie Policy and GDPR both fell back to /privacy. We now have
-- /cookies (CookiePolicyPage) and /gdpr (GdprPage) — wire the CMS so the
-- footer renders the correct destinations across the site.
--
-- Everything else in the footer is unchanged from migration 003.

UPDATE public.site_content
SET content = '{
  "brandName": "Illuxus",
  "tagline": "The modern event platform.",
  "columns": [
    {
      "title": "Product",
      "links": [
        { "label": "Features",  "href": "/features"  },
        { "label": "Pricing",   "href": "/pricing"   },
        { "label": "Events",    "href": "/events"    },
        { "label": "Discover",  "href": "/discover"  }
      ]
    },
    {
      "title": "Company",
      "links": [
        { "label": "About",    "href": "/about"   },
        { "label": "Contact",  "href": "/contact" },
        { "label": "Blog",     "href": "/about"   },
        { "label": "Careers",  "href": "/contact" }
      ]
    },
    {
      "title": "Resources",
      "links": [
        { "label": "Help Center", "href": "/contact"   },
        { "label": "Community",   "href": "/community" },
        { "label": "Status",      "href": "/contact"   },
        { "label": "Changelog",   "href": "/about"     }
      ]
    },
    {
      "title": "Legal",
      "links": [
        { "label": "Privacy Policy",   "href": "/privacy" },
        { "label": "Terms of Service", "href": "/terms"   },
        { "label": "Cookie Policy",    "href": "/cookies" },
        { "label": "GDPR",             "href": "/gdpr"    }
      ]
    }
  ],
  "copyright": "© 2026 Illuxus Technologies. All rights reserved."
}'::jsonb
WHERE section = 'footer';
