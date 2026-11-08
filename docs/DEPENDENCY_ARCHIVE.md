# Dependency archive

The app depends on code and files published by other people: npm packages, the libraries the edge functions import, and web fonts. Any of them can be unpublished, change, or go offline. This archive keeps a copy of each, so installs, builds and deploys keep working without them.

| What | Where the copy lives | Kept current by |
| --- | --- | --- |
| Edge function libraries (supabase-js, LiveKit, Agora, denomailer, zip.js, imagescript) | `supabase/functions/_vendor/`, in the repo | `bun run deps:edge` |
| Site fonts (Poppins, DM Sans, Space Grotesk, Comfortaa, JetBrains Mono) | `public/fonts/google/`, in the repo | `bun run deps:fonts` |
| Every npm package in `bun.lock` (about 1,200 packages, about 530 MB) | The [`npm-archive`](https://github.com/illuxus-bm/illuxus/releases/tag/npm-archive) GitHub release, one file per `bun.lock` | CI, whenever `bun.lock` changes on `main` |
| Android build libraries (Google Maven, Maven Central, Gradle plugins) and the Gradle distribution; iOS Swift packages (`capacitor-swift-pm` with its prebuilt frameworks, `ion-ios-filesystem`) | The [`native-archive`](https://github.com/illuxus-bm/illuxus/releases/tag/native-archive) GitHub release, one file per set of native build files | CI, whenever those files change on `main` |

## Edge functions

Functions import their libraries from `../_vendor/…`, never from a URL. A deploy (`supabase functions deploy`, or a pasted `dashboard-inline.ts`) carries the code with it and downloads nothing.

- **Pinned versions.** Each library is pinned to one exact version. `@supabase/supabase-js@2` used to float to whatever 2.x was newest at each deploy; it is now 2.108.1, the version the web app uses. `seed-cities` keeps the 2.45.0 it asked for.
- **imagescript's WebAssembly** (used by `og-event`) used to download from deno.land on every cold start. It is now embedded as modules inside `_vendor/`.
- **Tamper and drift checks.** `_vendor/manifest.json` records the source URL and SHA-256 of every file. The test suite fails if a function imports from the internet again, or if a vendored file was edited or lost (`node scripts/vendor-edge-deps.mjs --check`).

**To add or upgrade a library:**
1. Edit `LIBRARIES` in `scripts/vendor-edge-deps.mjs`.
2. Run `bun run deps:edge`, then `bun run functions:inline`.
3. Commit the changes.

## Fonts

`index.html` links `/fonts/google/fonts.css`, which loads the fonts from this site. The iOS and Android app shows them offline too.

Fonts that organisers pick for their own event pages, badges and brochures still load from Google when chosen, because that is the whole Google Fonts catalogue rather than a fixed set. If Google can't be reached, those pages fall back to system fonts.

To change the families or weights, edit `FAMILIES` in `scripts/vendor-fonts.mjs` and run `bun run deps:fonts`.

## npm packages

**How CI archives them.** When `bun.lock` changes on `main`, the `npm archive` workflow does the following:
1. Downloads every package `bun.lock` names, and checks each one against the lockfile's SHA-512.
2. Writes them to `illuxus-npm-<lock hash>.tar`.
3. Proves the file is complete by installing from it alone.
4. Attaches it to the `npm-archive` release.

The workflow keeps the newest 10 archives. The release is marked pre-release and is never "Latest", so the app download links are unaffected.

**If npm, or a package, is unavailable,** run this from the repository:

```sh
bun run deps:restore                       # fetches this bun.lock's archive from the release
node scripts/npm-archive.mjs restore illuxus-npm-<hash>.tar   # or from a saved copy
```

This serves the archive as a registry on localhost and runs `bun install --frozen-lockfile` against it with an empty cache, so every package comes from the archive. Each archive also contains the `bun.lock` and `package.json` it was made from. To build an older commit, check out that commit and restore its archive.

**Lockfile rule.** `bun.lock` must fetch everything from the public npm registry; a test enforces it. 71 packages used to come from Lovable's private package cache (`*-npm.pkg.dev/lovable-core-prod/…`). The copies on npm are byte-identical, and the lockfile now points there.

**For a copy off GitHub:** download the archive for the current `bun.lock` (`node scripts/npm-archive.mjs name` prints its file name) and keep it with your backups.

## Android and iOS

When a native build file changes on `main` (`bun.lock`, the Gradle files, the wrapper version, or `ios/App/CapApp-SPM/Package.swift`), the `native archive` workflow does the following:
1. Builds Android with an empty Gradle cache.
2. Keeps every library Gradle downloaded, as a Maven repository. It includes `aapt2` for macOS, Linux and Windows, so any machine can build.
3. Keeps the Gradle distribution.
4. Downloads the iOS Swift packages and their prebuilt `Capacitor`/`Cordova` frameworks, checked against the checksums in their `Package.swift`. It stores them as git repositories that need nothing from GitHub.
5. Proves the archive is complete. Android: it builds with `--offline` and an empty Gradle cache, with all network access blocked. iOS: each Swift package checks out from its archived copy at the pinned version, nothing in it downloads from the internet, and its frameworks match the published checksums. Resolving the whole iOS app needs Xcode, so that last step is confirmed when the app is built on a Mac.
6. Attaches it to the `native-archive` release.

The workflow keeps the newest 5 archives. Like the npm archive, the release is a pre-release and never "Latest".

**To build from it:**

```sh
node scripts/native-archive.mjs restore illuxus-native-<hash>.tar     # or its release URL
# Android (from android/):
ILLUXUS_MAVEN_ARCHIVE=~/.illuxus-offline/<hash>/android/maven \
  ./gradlew --offline --init-script ../scripts/gradle-archive.init.gradle assembleRelease
# iOS: open the project in Xcode as usual; restore pointed its Swift packages at the local copies.
```

`restore` prints the exact paths. To send Xcode back to GitHub, delete `ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/configuration/mirrors.json` and `ios/App/CapApp-SPM/.swiftpm/configuration/mirrors.json`.

## Not covered

- **The services themselves:** Supabase, Vercel, GitHub, Agora, LiveKit, Stripe. The archive keeps code, not hosting.
- **The Android SDK and Xcode:** the SDK platforms, build tools and Xcode come from Google and Apple installers, not from the build.
- **Packages used without being declared:** every package the code imports must be in `package.json`. `@electric-sql/pglite` (used by the database tests), `esbuild`, `es-module-lexer`, `playwright` and `@sentry/core` were used but only arrived as other packages' dependencies; they're declared now.
- **The Vercel API routes (`api/`):** Vercel installs their packages with npm at deploy time. The same packages are in the npm archive.
