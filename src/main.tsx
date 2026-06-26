import "./lib/observability/boot";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

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
