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
  // No fixed web-view colour: iOS then uses the system's light or dark
  // background, and the launch screen covers the page until it has painted.
  ios: {
    // The web view runs under the status bar and the home indicator; the
    // page pads itself with env(safe-area-inset-*) (index.css).
    contentInset: "never",
    scrollEnabled: true,
    // A long press on a link doesn't pop up Safari's web preview; it's an
    // app, not a browser.
    allowsLinkPreview: false,
  },
  plugins: {
    SplashScreen: {
      // The launch screen (LaunchScreen.storyboard on iOS, the launch theme
      // on Android: the wordmark centred on white or the brand violet) stays
      // up until index.html's splash, which looks the same, has painted under
      // it, then fades (src/lib/native/boot.ts): one screen, no flash. If the
      // page never runs, it gives way after launchShowDuration anyway.
      // No backgroundColor here: it would paint over the launch screen's own
      // light or dark colour.
      launchShowDuration: 4000,
      launchAutoHide: true,
      launchFadeOutDuration: 200,
      showSpinner: false,
      // Android before 12, if the splash-screen API is unavailable.
      androidSplashResourceName: "launch_splash",
      androidScaleType: "CENTER",
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
