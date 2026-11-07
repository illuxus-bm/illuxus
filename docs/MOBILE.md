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

1. In the SQL Editor, run only the final `CHECK_SCHEMA_DRIFT` section from
   `supabase/migrations/000_full_schema.sql`. If it lists `077_atomic_rate_limit.sql`, apply only
   section 077 from that bundle before deploying; the rate-limited functions refuse requests until
   the database has `take_rate_limit`.
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

## Releasing

### One-time setup

1. **Android upload key.** Create it once and keep the file and passwords in the team's password
   manager. With Play App Signing (the default), Google holds the real signing key, and a lost upload
   key can be reset through the Play Console.

   ```sh
   keytool -genkeypair -v -keystore illuxus-upload.jks -alias upload -keyalg RSA -keysize 4096 -validity 10000
   cp android/keystore.properties.example android/keystore.properties   # then fill it in
   ```

   `*.jks`, `*.keystore` and `android/keystore.properties` are git-ignored. In CI, set
   `ILLUXUS_UPLOAD_STORE_FILE`, `ILLUXUS_UPLOAD_STORE_PASSWORD`, `ILLUXUS_UPLOAD_KEY_ALIAS` and
   `ILLUXUS_UPLOAD_KEY_PASSWORD` instead.
2. **iOS signing.** In Xcode, set the team under Signing & Capabilities. The `com.illuxus.app` App ID
   needs the Associated Domains capability; automatic signing adds it.
3. **App Links and Universal Links.** These make illuxus.com links (password reset, ticket emails)
   open the app. Both projects are already set up for `illuxus.com` and `www.illuxus.com`. Generate
   the two files the site must serve, then commit and deploy them:

   ```sh
   bun run app:links --apple-team-id <TeamID> \
     --android-sha256 <app signing key SHA-256> --android-sha256 <upload key SHA-256>
   ```

   The Team ID is under Membership in the Apple Developer account. Both fingerprints are in the Play
   Console under App integrity → App signing. `vercel.json` already serves both files as JSON. Until
   they are live, the links open in the browser. The `illuxus://` scheme works without them.
4. **Supabase Auth.** Add `illuxus://**` to the allowed redirect URLs if any flow should return to the
   app by the custom scheme.
5. **Store listings.**
   - Both stores need a privacy policy URL (`/privacy`) and an account-deletion URL (`/data-deletion`),
     plus the data-safety and privacy-label forms. Declare what the app collects (name, email, mobile,
     company, photos people upload) and that GA4 and Clarity run only after consent.
   - The app asks for camera access (ticket scanning, webinar video) and microphone access (webinars).
     The purpose strings are in `ios/App/App/Info.plist`.
   - Account deletion is requested in the app (Settings → Request deletion of my data) and carried
     out by the privacy team. In App Review notes, say how long it takes. Apple prefers deletion that
     completes in the app, so if review pushes back, a self-serve deletion is the fix.
   - The iOS app runs on iPad (`TARGETED_DEVICE_FAMILY = 1,2`), so App Store Connect needs iPad
     screenshots too.
   - Give App Review a demo account with an organisation and an event. Most of the app is behind
     sign-in.

### Every release

1. Set the version. The build number must go up with every upload to either store:

   ```sh
   bun run app:version 1.1.0 2     # version 1.1.0, build 2, for both apps
   ```

2. Build and copy the bundle into both projects. `app:release` runs the pre-release check first:

   ```sh
   bun run app:release
   ```

   The check ([`scripts/check-app-release.mjs`](../scripts/check-app-release.mjs), also run by the test
   suite) refuses a build that loads a live-reload server, allows `http`, lets Android back up the
   signed-in session, has different versions on the two platforms, or would lock itself out (see
   below). It warns about anything still to finish: signing, app links, the App Store link.
3. **Android:** in Android Studio, Build → Generate Signed App Bundle → release, then upload the
   `.aab` to the Play Console. Run it on a device first: back button, a download (ticket PDF), a share,
   the camera (check-in scanner) and an illuxus.com link.
4. **iOS:** in Xcode, choose Any iOS Device, then Product → Archive → Distribute App → App Store
   Connect. Test it in TestFlight with the same list.

### Retiring an old version

An installed app keeps the web bundle it shipped with until the person updates it, so a broken
release can't be fixed in place. [`public/app-config.json`](../public/app-config.json) on illuxus.com
names the oldest version each platform may still run:

```json
{ "minimumVersion": { "ios": "1.0.0", "android": "1.0.0" },
  "storeUrl": { "ios": "https://apps.apple.com/app/id<App Store ID>", "android": "https://play.google.com/store/apps/details?id=com.illuxus.app" },
  "message": null }
```

An older app shows an "Update illuxus" screen instead of the app, with a button to the store
([`AppUpdateGate`](../src/components/native/AppUpdateGate.tsx)). It checks at launch and whenever the
app returns to the foreground, and lets the app run if the file can't be fetched. Changing the file
needs only a site deploy, not an app release.

- Raise the minimum only for a release that is broken, or that no longer works with the server. It
  locks everyone on an older version out until they update.
- Raise it only once the new version is live in that store; the check refuses a minimum above the
  app's own version.
- Add the iOS `storeUrl` once the app is listed. Until then the screen says to open the App Store.
- `message` replaces the default text.

### Crash reports

Errors reach the same Sentry project as the website's, with the same release (the commit). Their
`dist` is `ios`, `android` or `web`, so app problems can be filtered. Android native crashes and ANRs
appear in the Play Console (release builds upload native debug symbols). iOS crashes appear in Xcode's
Organizer.

## Known gaps

- **Push notifications** aren't set up. They need Firebase (Android) and APNs (iOS) credentials, plus
  `@capacitor/push-notifications`.
- **Printing badges** (`window.print`) doesn't work in iOS's web view. Badges can still be downloaded
  as a PDF and printed from the share sheet.
- **Web analytics** (GA4 and Clarity, behind the cookie banner) run in the app too, and report
  `localhost` page URLs.
