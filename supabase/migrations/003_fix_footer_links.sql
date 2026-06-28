-- Fix footer links: replace placeholder "#" hrefs with real routes.
-- All pages (About, Contact, Features, Pricing, Privacy, Terms) already exist
-- in the app — this update simply points the footer CMS data to them.

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
        { "label": "Cookie Policy",    "href": "/privacy" },
        { "label": "GDPR",             "href": "/privacy" }
      ]
    }
  ],
  "copyright": "© 2026 Illuxus Technologies. All rights reserved."
}'::jsonb
WHERE section = 'footer';
