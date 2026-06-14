import { useTheme } from "@/contexts/ThemeContext";

/**
 * `<IlluxusWordmark />` — renders the brand wordmark as a real image asset.
 *
 * Two static SVG files live in `/public`:
 *   - `illuxus-wordmark-light.svg` — dark navy mark, used on light backgrounds
 *   - `illuxus-wordmark-dark.svg`  — off-white mark, used on dark backgrounds
 *
 * Both files are hand-traced (no webfont dependency) so the mark renders
 * identically across browsers and is independent of font loading state.
 *
 * The component reads the active theme from `ThemeContext` and swaps between
 * the two assets automatically. Pass `variant` to force a specific variant
 * (useful inside themed event/org canvases that don't follow the app theme).
 */
export interface IlluxusWordmarkProps {
  /** Render height in CSS pixels. Width auto-scales to preserve the wordmark aspect ratio. */
  height?: number;
  /** Extra classes (forwarded onto the `<img>` element). */
  className?: string;
  /**
   * Force a specific variant. Defaults to `"auto"` — picks light vs dark based on the
   * current app theme via `useTheme()`.
   */
  variant?: "auto" | "light" | "dark";
  /**
   * Accessible label. Defaults to "illuxus". Pass `""` to mark the image as decorative
   * when the surrounding link/button already provides a label.
   */
  ariaLabel?: string;
}

const SRC_LIGHT = "/illuxus-wordmark-light.svg";
const SRC_DARK = "/illuxus-wordmark-dark.svg";

export function IlluxusWordmark({
  height = 22,
  className,
  variant = "auto",
  ariaLabel = "illuxus",
}: IlluxusWordmarkProps) {
  const { theme } = useTheme();

  // `auto` follows the app theme; `light`/`dark` are explicit overrides.
  const resolvedVariant: "light" | "dark" =
    variant === "auto" ? (theme === "dark" ? "dark" : "light") : variant;
  const src = resolvedVariant === "dark" ? SRC_DARK : SRC_LIGHT;

  // The wordmark's intrinsic ratio is 660 / 160 ≈ 4.125. We let height drive
  // the layout and CSS auto-scales width via `width: auto`.
  return (
    <img
      src={src}
      alt={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      height={height}
      style={{ height, width: "auto" }}
      className={className}
      draggable={false}
    />
  );
}

export default IlluxusWordmark;
