import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The iOS and Android apps. Both wrap the same SPA, built with
 * `bun run build:app` (vite `--mode capacitor`) into `dist/`, and bundled
 * into the app by `bunx cap sync`. See docs/MOBILE.md.
 *
 * The web view serves the bundle from `https://localhost` (Android) and
 * `capacitor://localhost` (iOS). Those two origins are allowed by the edge
 * functions' CORS list (supabase/functions/_shared/cors.ts) and `/api/geo`.
 */
const config: CapacitorConfig = {
  appId: "com.illuxus.app",
  appName: "illuxus",
  webDir: "dist",
  // The app's own screens are the app; links to anywhere else open in the
  // in-app browser (src/lib/native/boot.ts), never in the web view.
  server: {
    androidScheme: "https",
  },
  backgroundColor: "#0f0a19",
  ios: {
    // The web view runs under the status bar and the home indicator; the
    // page pads itself with env(safe-area-inset-*) (index.css).
    contentInset: "never",
    scrollEnabled: true,
    backgroundColor: "#0f0a19",
    // A long press on a link doesn't pop up Safari's web preview; it's an
    // app, not a browser.
    allowsLinkPreview: false,
  },
  plugins: {
    SplashScreen: {
      // Hidden (src/lib/native/boot.ts) as soon as the page runs, handing
      // over to index.html's own splash, which is the same colour.
      launchAutoHide: false,
      launchShowDuration: 0,
      backgroundColor: "#0f0a19",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
      splashFullScreen: false,
      splashImmersive: false,
    },
    Keyboard: {
      // The page resizes above the keyboard, so the focused field stays
      // visible. The tab bar hides while the keyboard is up (index.css).
      // (No `resizeOnFullScreen`: SystemBars handles the keyboard inset on
      // Android and warns that the two conflict.)
      resize: "native",
    },
    SystemBars: {
      // Edge to edge on Android, with the insets as env() values like iOS.
      insetsHandling: "css",
      initialViewportFitValueHint: "cover",
    },
  },
};

export default config;
