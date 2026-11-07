# iOS and Android apps

The apps are the same React SPA, wrapped with [Capacitor 8](https://capacitorjs.com). Every screen
is the web screen. What differs in the app is the chrome around it and a thin layer of native glue.

| | |
| --- | --- |
| App ID / bundle ID | `com.illuxus.app` |
| Config | [`capacitor.config.ts`](../capacitor.config.ts) |
| Native projects | [`android/`](../android) (Gradle), [`ios/`](../ios) (Xcode, Swift Package Manager; no CocoaPods) |
| Icon and splash sources | [`assets/`](../assets) |

## Building and running

You need Node 22+, plus Android Studio (with an SDK and JDK 21) for Android, and Xcode 16+ for iOS.

```sh
bun run cap:sync      # build the app bundle (vite --mode capacitor) and copy it into both projects
bun run cap:android   # open Android Studio, then Run
bun run cap:ios       # open Xcode, pick a team under Signing & Capabilities, then Run
```

Run `cap:sync` after every web change you want in the apps. To try the app chrome on a computer
without building, install the site as a PWA. The tab bar and the other app-mode changes below also
apply there, at phone and tablet widths.

`vite build --mode capacitor` differs from the web build in three ways:

- It has no service worker, because the bundle ships inside the app.
- It skips the per-page SEO HTML.
- It has no source maps unless `OBSERVABILITY_AUTH_TOKEN` is set, in which case they are uploaded to
  Sentry and removed.

### Icons and splash screens

`bun run cap:assets` regenerates every Android and iOS size from `assets/icon-*.png` and
`assets/splash*.png`. Replace those source images to change the artwork. The native splash is the
same violet as `index.html`'s splash (`#0f0a19`) and is hidden as soon as the page starts, so the two
read as one screen.

## What changes in the app

**Chrome: [`src/components/native/`](../src/components/native), [`useAppChrome`](../src/hooks/useAppChrome.ts).**
"App mode" means the native app, or the PWA launched from a home screen. Below the `lg` breakpoint,
app mode has:

- A bottom tab bar. Organisers get Events, Tickets, Community, Reports and a More sheet. Attendees
  get Discover, My events, Community and Profile. Signed-out visitors get Discover, Events and Sign in.
- No tab bar during sign-in, onboarding, live stages and check-in. The sponsor, speaker and partner
  portals and the super admin keep their own navigation.
- A one-row header. The header leaves out the destinations that moved into the tab bar.
- A floating "New event" button on the organiser's Events screen.
- Pull-to-refresh on Discover, My events and the ticket screen.
- An offline indicator.
- A welcome screen at `/` for signed-out visitors, instead of the marketing page. Signed-in users go
  straight to their first tab.
- A full-screen sign-in.

These screens were also redesigned for phones in the browser: Discover, My events, the ticket (now a
pass with an always dark-on-white QR code) and Profile.

**Native glue: [`src/lib/native/boot.ts`](../src/lib/native/boot.ts), [`NativeBridge`](../src/components/native/NativeBridge.tsx).**
These changes apply only in the native app:

| Area | Behaviour in the app |
| --- | --- |
| Downloads | `<a download>` exports (PDF tickets, CSVs, badges, `.ics`) open the share sheet. From there the user can save to Files or Drive, or open the file in Calendar. |
| Sharing | `navigator.share` uses the native share sheet. |
| Links to other sites | Open in the in-app browser (SFSafariViewController or Custom Tabs). |
| Links to illuxus.com | Stay in the app. |
| Android back button | Closes an open dialog or sheet, then goes back a page, then exits from the first page. |
| Status bar | Follows the light/dark theme. |
| Keyboard | Hides the tab bar while it is up. |
| Input zoom | iOS no longer zooms into small inputs. |
| Shared links | Shared links, QR codes and emails use `https://illuxus.com`, not the web view's local origin ([`publicUrl`](../src/lib/publicUrl.ts)). |

## Server side

The app's web view runs on `capacitor://localhost` (iOS) and `https://localhost` (Android). These
places allow both origins:

- The edge functions' shared CORS list ([`_shared/cors.ts`](../supabase/functions/_shared/cors.ts)).
- The eight functions with their own CORS list: `generate-creative-background`,
  `generate-creative-copy`, `guest-registration`, `notify-organizer-venue-response`,
  `notify-venue-selection`, `send-ticket-reply`, `submit-support-ticket` and `team-invitation`.
  `src/lib/__tests__/edge-cors-app-origins.test.ts` fails if a function's own list leaves the app
  origins out.
- [`/api/geo`](../api/geo.ts).

### Deploying the functions

Deploy from `main` with the Supabase CLI, signed in as a member of the organisation that owns the
illuxus project:

1. In the SQL Editor, run `supabase/CHECK_schema_drift.sql`. If it lists `077_atomic_rate_limit.sql`,
   run `supabase/RUN_ME_atomic_rate_limit.sql` first. The rate-limited functions refuse every request
   while the database has no `take_rate_limit`.
2. Deploy every function:

   ```sh
   supabase login
   supabase link --project-ref xhjdcimginceibzcwzlk
   supabase functions deploy
   ```

   For a function deployed by pasting into the dashboard instead, run `npm run functions:inline`
   and paste its `dashboard-inline.ts`.
3. Check every function from both app origins:

   ```sh
   node scripts/check-app-cors.mjs https://xhjdcimginceibzcwzlk.supabase.co
   ```

   It sends only CORS preflights, which change nothing, and exits non-zero if any function refuses
   either origin.

## Before the first store release

1. **Signing.**
   - Android: create an upload keystore and configure release signing in Android Studio.
   - iOS: set the team in Xcode. The `com.illuxus.app` App ID needs the Associated Domains capability.
     With automatic signing, Xcode adds it.
2. **App Links and Universal Links.** These make illuxus.com links (password reset, ticket emails) open
   the app. Both projects are already set up for `illuxus.com` and `www.illuxus.com`. The site still
   has to vouch for the apps by serving these two files:
   - `public/.well-known/assetlinks.json`, with the SHA-256 fingerprint of the release signing key
     (Play Console → App integrity).
   - `public/.well-known/apple-app-site-association`, with `<TeamID>.com.illuxus.app`. Serve it as
     `application/json`, which needs a header rule in `vercel.json`.

   Until those files are live, the links open in the browser, as they do today. The `illuxus://`
   scheme works without them.
3. **Supabase Auth.** Add `illuxus://**` to the allowed redirect URLs if any flow should return to the
   app by the custom scheme.
4. **Store listings.** Both stores need a privacy policy URL (`/privacy`) and an account-deletion URL
   (`/data-deletion`), plus the data-safety and privacy-label forms. The app asks for camera access
   (ticket scanning, webinar video) and microphone access (webinars). The purpose strings are in
   `ios/App/App/Info.plist`.

## Known gaps

- **Push notifications** aren't set up. They need Firebase (Android) and APNs (iOS) credentials, plus
  `@capacitor/push-notifications`.
- **Printing badges** (`window.print`) doesn't work in iOS's web view. Badges can still be downloaded
  as a PDF and printed from the share sheet.
- **Web analytics** (GA4 and Clarity, behind the cookie banner) run in the app too, and report
  `localhost` page URLs.
