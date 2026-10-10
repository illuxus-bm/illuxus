import "./lib/observability/boot";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

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
const MIN_SPLASH_MS = 600;
const SPLASH_FADE_MS = 500;
const splashEl = document.getElementById("illuxus-splash");
if (splashEl) {
  const startedAt = performance.now();
  const dismiss = () => {
    const elapsed = performance.now() - startedAt;
    const wait = Math.max(0, MIN_SPLASH_MS - elapsed);
    window.setTimeout(() => {
      splashEl.classList.add("is-leaving");
      window.setTimeout(() => {
        splashEl.parentNode?.removeChild(splashEl);
      }, SPLASH_FADE_MS);
    }, wait);
  };
  // Wait two frames so React's first paint lands before we fade out
  requestAnimationFrame(() => requestAnimationFrame(dismiss));
}
