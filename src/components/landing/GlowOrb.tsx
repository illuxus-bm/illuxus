import { type CSSProperties } from "react";

/**
 * Decorative gradient orb used as the luminous background accent behind hero
 * + section copy. Renders an absolutely-positioned soft-blurred radial gradient
 * — pure DOM, no SVG, no images — so it's effectively free at runtime.
 *
 * Tune `size`, `color`, and `opacity` per surface. Reduced-motion users still
 * see the orb (it's static) but no animations are tied to it.
 */
export interface GlowOrbProps {
  /** Tailwind class string for positioning (e.g. `top-0 left-1/2 -translate-x-1/2`). */
  className?: string;
  /** Diameter in pixels. Defaults to 600. */
  size?: number;
  /** Center color of the radial gradient. Use rgba so it can fade out. */
  color?: string;
  /** Layer opacity multiplier (defaults to 1). */
  opacity?: number;
  /** Override blur radius. Defaults to 80px. */
  blur?: number;
  style?: CSSProperties;
}

export function GlowOrb({
  className = "",
  size = 600,
  color = "rgba(99, 102, 241, 0.35)",
  opacity = 1,
  blur = 80,
  style,
}: GlowOrbProps) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute rounded-full ${className}`}
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
        filter: `blur(${blur}px)`,
        opacity,
        ...style,
      }}
    />
  );
}

export default GlowOrb;
