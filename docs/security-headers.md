# Security headers

All response headers are configured in `vercel.json` under `headers`. This file
explains the reasoning, and in particular how to promote the Content Security
Policy from report-only to enforcing.

## Current headers

Applied to every route (`/(.*)`):

| Header | Value | Purpose |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | Stops the browser MIME-sniffing a response into a script. |
| `X-Frame-Options` | `DENY` | Legacy clickjacking defence. Superseded by CSP `frame-ancestors`, kept for old browsers. |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Forces HTTPS for 2 years including subdomains. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Sends only the origin cross-site, so event slugs and query strings don't leak. |
| `Permissions-Policy` | `camera=(self), microphone=(self), geolocation=()` | Camera/mic for the webinar studio only; geolocation off entirely. |
| `Content-Security-Policy-Report-Only` | see below | **Report-only.** Reports violations, blocks nothing. |

Route-specific:

- `/assets/(.*)` — immutable 1-year cache (content-hashed filenames).
- `/index.html` — `s-maxage=60` with `stale-while-revalidate`.
- `/embed.js` — 5-minute cache, `Access-Control-Allow-Origin: *` (third-party sites embed it).
- `/(.*)\.map` — `no-store` + `X-Robots-Tag: noindex`.
- `/api/health` — `no-store` + `noindex`. A cached health check is worse than none.

## Why CSP is report-only

This app loads or connects to a lot of third-party surface:

- Agora RTC/RTM SDK (`*.agora.io`, `*.sd-rtn.com`) — many endpoints, some region-dependent
- LiveKit (`*.livekit.cloud`, plus `wss://`)
- Supabase REST / Realtime / Storage (`*.supabase.co`, plus `wss://`)
- Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`)
- GA4 (`googletagmanager.com`, `google-analytics.com`) and Clarity (`clarity.ms`)
- Organizer-supplied image URLs on arbitrary hosts (logos, banners, wordmarks)
- A service worker and Web Workers, both from `blob:`

A blocking policy written without observing real traffic will break live video —
the highest-stakes feature in the product — in a way that is hard to attribute,
because a CSP violation surfaces as an opaque SDK connection error. Report-only
gives the same visibility with zero risk.

### Notable directive choices

- **`script-src` includes `'unsafe-inline'`.** GA4 and Clarity are injected as
  inline `<script>` in `src/components/SiteHead.tsx`. Removing this requires
  moving to nonces or hashes, which needs server-side HTML rendering. Until
  then `'unsafe-inline'` on `script-src` means the policy provides limited XSS
  protection — it is mainly acting as a data-exfiltration and framing control.
  This is the single biggest weakness in the policy and the main reason to
  treat enforcement as a follow-up rather than a formality.
- **`style-src` includes `'unsafe-inline'`.** Tailwind and Radix set inline
  styles at runtime. Not practically avoidable.
- **`img-src` includes `https:`** (any HTTPS host). Organizers paste arbitrary
  logo/banner URLs; restricting this would break existing events. Images are a
  low-risk sink.
- **`connect-src` includes `blob:`** for worker and media plumbing.
- **`wasm-unsafe-eval`** because the Agora SDK ships WebAssembly.
- **`frame-ancestors 'none'`** mirrors `X-Frame-Options: DENY`.
- **`object-src 'none'`, `base-uri 'self'`, `form-action 'self'`** — cheap, no
  legitimate use in this app.

### Deliberately excluded

- The FX rate provider (`open.er-api.com`) is contacted **server-side** by the
  `fx-rates` edge function. `src/lib/fx.ts` calls the edge function, not the
  provider, so the browser never connects to it and CSP does not apply.
- `@mediapipe/tasks-vision` is a declared dependency but is not imported
  anywhere in `src/`, so it loads no WASM/CDN assets at runtime.

## Promoting to enforcing

1. Deploy with `Content-Security-Policy-Report-Only` (current state).
2. Exercise every third-party surface on the deployed site with DevTools open,
   watching for `[Report Only]` console violations:
   - host a webinar (Agora **and** LiveKit paths)
   - join as a signed-in attendee, and again via a `?join=` guest link
   - screen share; toggle camera and mic
   - load a public event page carrying an external banner image
   - generate an AI creative background
   - export a brochure / badge PDF
3. Add any legitimately-missing origin to the matching directive.
4. Only once a full pass produces no violations, rename the header to
   `Content-Security-Policy`.
5. Consider adding `report-to` with a collector endpoint for aggregation. A
   collector must be rate-limited — it is an unauthenticated write path, the
   same class of exposure as `submit-support-ticket` (see SEC-09).

Do not skip step 2. The policy above is derived from a static read of the
codebase, not from observed traffic, so treat it as a hypothesis.
