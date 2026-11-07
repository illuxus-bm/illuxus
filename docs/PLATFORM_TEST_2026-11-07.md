# Platform test, 7 November 2026

**Commit:** `66c6f2b` on `main`.
**Scope:** the web platform end to end, and a detailed scan of the iOS and Android apps.

## Verdict

**The web platform works.**
- Every automated check that CI enforces passes.
- 136 of 138 route loads render correctly across four kinds of user, on phone and desktop. The two
  exceptions are the same test-data artifact.
- The interactive flows tried, mostly from the earlier audit, behave correctly.

**The apps are sound, but not ready to ship.**
- Their native glue passes every check on both platforms.
- Capacitor's own health check is clean.
- Three things stop them working in production or getting through review (below).
- Neither app could be compiled: this Mac has no JDK, Android SDK or full Xcode.

### Blockers

| # | Problem | Effect | Fix |
|---|---|---|---|
| B-1 | **The deployed edge functions don't accept the app's origin.** A preflight from `capacitor://localhost` to `send-ticket-email` and `guest-registration` on the live project returns `access-control-allow-origin: null`. | Inside the apps, every edge-function call fails: guest registration, ticket emails, team and sponsor invitations, support tickets, creative copy. | Redeploy the edge functions (the CORS change is already in the code). Run `npm run functions:inline` first for the dashboard-pasted ones. |
| B-2 | **The iOS app has no privacy manifest.** `@capacitor/filesystem` requires the app to declare `NSPrivacyAccessedAPICategoryFileTimestamp` with reason `C617.1` in `ios/App/PrivacyInfo.xcprivacy`. | App Store Connect refuses the upload. | Add `PrivacyInfo.xcprivacy` with that entry. |
| B-3 | **Migration 079 is committed without its app changes.** `RUN_ME_sponsor_share_consent.sql` (QA audit F-10) is in `1d18e9b`, but the registration forms don't ask for consent yet. | If it is run now, every new sponsor share loses all contact details, because no one can have agreed. | Don't run it until the F-10 form changes are in. |

### Resolution, 7 November 2026

| # | Status |
|---|---|
| B-1 | **Fixed in the code; the deploy is still to do.** The live functions refuse the apps because their deployed versions predate the change. Four more functions keep their own CORS list without the app origins, and redeploying alone wouldn't have fixed them: `send-ticket-reply`, `notify-venue-selection`, `notify-organizer-venue-response` and `generate-creative-background`. They now include both origins, and `edge-cors-app-origins.test.ts` fails if any function's own list leaves them out. The redeploy needs a Supabase account in the organisation that owns illuxus; the CLI on this Mac is signed in to a different one. Steps are in `docs/MOBILE.md` ("Deploying the functions"): run `CHECK_schema_drift.sql`, which now covers 077–079, then migration 077 if it's missing, then `supabase functions deploy`, then `node scripts/check-app-cors.mjs https://xhjdcimginceibzcwzlk.supabase.co` to confirm. |
| B-2 | **Fixed.** `ios/App/App/PrivacyInfo.xcprivacy` declares `NSPrivacyAccessedAPICategoryFileTimestamp` (C617.1), the only required-reason API any of the app's plugins uses. It declares no tracking, and it's registered in the App target's Resources phase. Both plists pass `plutil -lint`, and `cap update ios` and `cap doctor` leave it intact. Final confirmation is Xcode's privacy report or an App Store Connect upload. |
| B-3 | **Resolved.** The F-10 form changes are committed (`09455c6`), so people can now agree, and migration 079 records the wording server-side, so the app and the migration can ship in either order. Its header now says to run it once that app version is live, and to read its commented-out section 5 before running that. |

---

## 1. Automated checks

| Check | Result |
|---|---|
| Unit tests (Vitest) | **1,515 passed**, 142 files |
| Database tests (PGlite) | **154 passed**: 040 UTM partner access (99), 048 plans (44), 077/078 rate limit and reactions (11) |
| Production web build | **Passes**. 20 pages prerendered, sitemap written |
| App build (`--mode capacitor`) | **Passes**. No service worker, 13 MB |
| `cap sync` into both projects | **Passes** |
| `cap doctor` | **Clean** on iOS and Android, all at 8.6.0, 8 plugins registered on each |
| Typecheck | 109 errors: the known backlog, mostly the stale `supabase/types.ts`. Not blocking in CI |
| ESLint | 140 errors, 131 warnings: the known backlog. Not blocking in CI |
| Playwright e2e (`tests/e2e`) | **Not run.** It needs the live database and a published event (`/org/wybe/events/tech-summit-2026`) |
| Playwright visual and badge suites | **Can't run as committed** (see T-1). With a temporary shim: 14 passed, 13 failed. All 13 failures are test problems, not app bugs (T-2, T-3) |

## 2. Every route, as every kind of user

Each route was loaded with a stubbed backend in a phone viewport in app mode, then on desktop. The
check looked for crashes, error boundaries, console errors, horizontal overflow and blank pages.

| User | Routes | Phone (app mode) | Desktop |
|---|---|---|---|
| Visitor (signed out) | 31 public pages, legal pages, sign-in flows, 404, and the sponsor/speaker/partner portals' redirects | 31 / 31 | 31 / 31 |
| Attendee | Discover, profile, tickets, a ticket, applications, communities, settings | 9 / 9 | 9 / 9 |
| Organiser | Dashboard, events, create, event management, guests, broadcast, tickets, reports, marketing, organisation, settings, billing, help, community, live stage | 16 / 16 | 16 / 16 |
| Super admin | All 13 admin pages | 12 / 13 | 12 / 13 |

The admin miss is Revenue, on both viewports. It crashes because the stubbed registrations have no
`created_at`. Real rows always do (`NOT NULL DEFAULT now()`), so it's a harness artifact. Reading that
code did find a real bug, W-1.

Redirects behave as intended:
- Signed-out visitors to the portals go to sign-in.
- `/dashboard` goes to Events.
- `/onboarding` and `/complete-profile` skip for completed accounts.
- `/` in the app opens the welcome screen when signed out.

## 3. The apps' native glue

The web app ran as if inside each shell. A stand-in for the native side, using the plugin headers and
call channel a real shell injects, recorded every call the app made.

| Check | Android | iOS |
|---|---|---|
| Detected as the native app, app chrome on | ✓ | ✓ |
| No zoom into small inputs | ✓ | ✓ |
| Native splash handed to the page's splash at start | ✓ | ✓ |
| Keyboard listeners (tab bar hides while typing) | ✓ | ✓ |
| Keyboard accessory bar (iOS only) | n/a | ✓ |
| Back button and deep-link listeners | ✓ | ✓ |
| Status bar follows the theme | ✓ | ✓ |
| Bottom tab bar shown | ✓ | ✓ |
| External link opens the in-app browser, web view stays in the app | ✓ | ✓ |
| `illuxus.com` link stays in the app | ✓ | ✓ |
| `window.open` goes to the in-app browser | ✓ | ✓ |
| A download is saved to the cache, even when its blob URL is revoked at once | ✓ | ✓ |
| `navigator.share` opens the native share sheet | ✓ | ✓ |
| Opens on the welcome screen, not the marketing page | ✓ | ✓ |
| Shared links point at `https://illuxus.com` | ✓ | ✓ |
| No page errors | ✓ | ✓ |

This proves the app sends the right requests to native code. It doesn't prove the native plugins
behave on a device. That needs a device or simulator build.

## 4. App project scan

### Android (`android/`)

| Area | Finding |
|---|---|
| SDK levels | min 24, target and compile 36. Meets Google Play's current target requirement |
| Toolchain | AGP 8.13.0, Gradle 8.14.3 |
| Permissions | `INTERNET`, `ACCESS_NETWORK_STATE`, `CAMERA`, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`. Camera and microphone are marked not required, so devices without them can install |
| Deep links | `illuxus.com` App Links (`autoVerify`) and the `illuxus://` scheme are declared. **`/.well-known/assetlinks.json` returns 404 on the live site**, so links open the browser until it's published (A-1) |
| **A-2: backups** | `android:allowBackup="true"`. The web view's local storage holds the Supabase session (refresh token), and is included in device backups and transfers. Set it to `false`, or add `dataExtractionRules` that exclude the web view's storage |
| A-3: release build | No release signing config, `versionCode 1` / `versionName "1.0"`, code shrinking off (normal for Capacitor). Needed before uploading to Play |
| A-4: Android 12+ splash | The launch theme sets the old splash drawable but not `windowSplashScreenBackground`. Android 12+ draws its own splash with the default background before the page's violet one. **Unverified** without a device |
| Sharing files | The FileProvider includes `cache-path`, which downloads written to the cache need |
| Colours | `styles.xml` uses `colorPrimary` and similar from the Capacitor library: Material defaults, not the brand. Not visible in a no-action-bar app |

### iOS (`ios/`)

| Area | Finding |
|---|---|
| Deployment target | iOS 15.0, iPhone and iPad. Fine for WebRTC (14.3+) and camera access |
| Packages | Swift Package Manager (`CapApp-SPM`), so no CocoaPods. The package points into `node_modules`, so `bun install` and `cap sync` must run before an Xcode build, including on CI |
| Permissions | Camera, microphone and add-to-photos usage strings set |
| Deep links | The `illuxus://` scheme and Associated Domains (`applinks:illuxus.com`, `www`) are set. **`apple-app-site-association` returns 404 on the live site** (A-1). Associated Domains needs the capability on the App ID; automatic signing adds it once a team is chosen |
| **B-2: privacy manifest** | Missing (see Blockers). Capacitor core and Cordova ship their own manifests; the app's own declaration for the filesystem plugin is required |
| I-1: export compliance | No `ITSAppUsesNonExemptEncryption`. The app only uses HTTPS, so it can be `false`; without it, every build asks the export question in App Store Connect |
| I-2: device capability | `UIRequiredDeviceCapabilities` lists `armv7` (32-bit, template default). Should be `arm64` or removed |
| Signing | Automatic, no team set. Version 1.0 (1) |
| Background audio | No `UIBackgroundModes`, so webinar audio stops when the app goes to the background. That may be intended |
| Icons and splash | A 1024 px icon (single-size icon set) and light/dark splash images, generated from `assets/` |

### Both apps

| Area | Finding |
|---|---|
| Live server support | `/api/geo` on Vercel accepts the app origin. **Edge functions don't** (B-1) |
| Fonts | Onest and Poppins load from Google Fonts at runtime. A first launch offline shows system fonts. Consider bundling them in the app build |
| Analytics | The GA4 and Clarity consent banner works in the app. Page URLs report as `localhost` (known) |

## 5. Other findings

- **W-1: Revenue undercounts once the platform passes the row cap.** `RevenuePage` builds its 12-month
  chart and totals from one unpaged `registrations` query across the whole platform
  (`src/pages/dashboard/admin/RevenuePage.tsx:90-101`). Past the row cap (1,000 by default), revenue
  covers only the newest 1,000 registrations. Page through `fetchAllRows`, or better, aggregate in SQL.
- **T-1: The browser test suites can't run outside Lovable.** `playwright-fixture.ts` imports
  `lovable-agent-playwright-config`, which isn't a dependency. Re-export from `@playwright/test`
  instead.
- **T-2: The visual suite has no baselines.** `tests/visual/quick-views.spec.ts` has never had its
  screenshots committed, so every run reports 12 failures. Generate and commit the baselines.
- **T-3: One badge test is stale.** "thermal-50 height overflow does not clip QR" waits for a QR code
  that's no longer drawn: badge QR codes became opt-in (`showQr`, default `false`). Pass
  `showQr: true` in that test.

## Not covered

- Compiling and running the apps. Needs JDK 21 and the Android SDK, and Xcode 16+.
- Real devices: camera scanning, webinars, push (not set up), the share sheet's destinations, and
  deep links from email.
- Flows against the live backend: sign-in, registration, emails, sponsor shares. No credentials were
  used, and the e2e suite needs the live database.
- Production security and data exposure were not tested in this run. The current checkout's source review is recorded in [`PLATFORM_AUDIT_2026-11-07.md`](./PLATFORM_AUDIT_2026-11-07.md).
