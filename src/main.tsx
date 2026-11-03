import "./lib/observability/boot";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { bootNativeApp } from "./lib/native/boot";

// The iOS / Android app's native glue (downloads, sharing, links, keyboard);
// a no-op in the browser beyond tagging an installed PWA as `app-mode`.
bootNativeApp();

/**
 * A tab opened before a deploy still runs the old bundle; when it lazy-loads
 * a route whose chunk the deploy replaced, the import fails. Reload once to
 * pick up the new build instead of showing the "couldn't load" screen. The
 * timestamp guard stops a reload loop if the chunk is genuinely broken.
 */
window.addEventListener("vite:preloadError", (event) => {
  const KEY = "illuxus:chunk-reload-at";
  let last = 0;
  try { last = Number(sessionStorage.getItem(KEY) || 0); } catch { /* storage blocked */ }
  if (Date.now() - last < 10_000) return;
  try { sessionStorage.setItem(KEY, String(Date.now())); } catch { /* storage blocked */ }
  event.preventDefault();
  window.location.reload();
});

const root = createRoot(document.getElementById("root")!);
root.render(<App />);

/**
 * Hide the static splash screen (rendered by index.html) once React has mounted
 * and the first frame has been committed. The splash is kept on screen for at
 * least 600ms so the brand reveal isn't a flicker on fast networks, then fades
 * out via the .is-leaving class transition and is removed from the DOM after
 * the transition completes.
 */
const SPLASH_FADE_MS = 200;
/** Never hold the splash longer than this waiting for the stylesheet. */
const APP_CSS_TIMEOUT_MS = 4000;

/**
 * Resolves once the app stylesheet has applied. In production it loads
 * without blocking first paint (see `nonBlockingAppCss` in vite.config.ts):
 * a `rel="preload"` link that switches itself to a stylesheet on load. In
 * dev there are no such links and this resolves at once.
 */
function appStylesApplied(): Promise<void> {
  const links = Array.from(document.querySelectorAll<HTMLLinkElement>("link[data-app-css]"));
  return Promise.all(
    links.map(
      (link) =>
        new Promise<void>((resolve) => {
          if (link.sheet) return resolve();
          // `load` fires once for the preload and again when the sheet applies.
          link.addEventListener("load", () => link.sheet && resolve());
          link.addEventListener("error", () => resolve());
          window.setTimeout(resolve, APP_CSS_TIMEOUT_MS);
        }),
    ),
  ).then(() => undefined);
}

const splashEl = document.getElementById("illuxus-splash");
if (splashEl) {
  const dismiss = () => {
    splashEl.classList.add("is-leaving");
    window.setTimeout(() => {
      splashEl.parentNode?.removeChild(splashEl);
    }, SPLASH_FADE_MS);
  };
  // Leave once the app is styled and React's first paint has landed (two
  // frames), so the page underneath is never seen half-built.
  void appStylesApplied().then(() => requestAnimationFrame(() => requestAnimationFrame(dismiss)));
}
