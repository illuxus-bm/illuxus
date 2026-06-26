import { type CSSProperties } from "react";

/**
 * `<SyncLines>` — animated dashed SVG lines that suggest "data sync" between
 * UI nodes. Used inside bento cards (workflow graph) and behind hero mockups.
 *
 * Renders a small ID-namespaced linear gradient + a few stroked paths that
 * tick forward via the `sync-flow` keyframe defined in `index.css`. Pure SVG,
 * no images, no JS work after first paint.
 */
export interface SyncLinesProps {
  className?: string;
  /** Override the default indigo tint. */
  color?: string;
  /** Strength of the line stroke. Defaults to 1.5. */
  strokeWidth?: number;
  /** Optional unique id suffix so multiple instances on a page don't collide. */
  idSuffix?: string;
  style?: CSSProperties;
}

export function SyncLines({
  className = "",
  color = "rgba(129, 140, 248, 0.85)",
  strokeWidth = 1.25,
  idSuffix = "default",
  style,
}: SyncLinesProps) {
  const gradId = `sync-stroke-${idSuffix}`;
  const dotId = `sync-dot-${idSuffix}`;

  return (
    <svg
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
      viewBox="0 0 800 400"
      preserveAspectRatio="none"
      fill="none"
      style={style}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={color} stopOpacity="0" />
          <stop offset="35%" stopColor={color} stopOpacity="0.85" />
          <stop offset="65%" stopColor={color} stopOpacity="0.85" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
        <radialGradient id={dotId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={color} stopOpacity="1" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Each path is given a slightly different dash pattern + offset so the
          flow doesn't look mechanically uniform. */}
      <path
        d="M 0 80 C 200 80, 220 200, 400 200 S 600 320, 800 320"
        stroke={`url(#${gradId})`}
        strokeWidth={strokeWidth}
        strokeDasharray="6 8"
        className="animate-sync-flow"
      />
      <path
        d="M 0 200 C 220 200, 220 100, 400 100 S 600 200, 800 200"
        stroke={`url(#${gradId})`}
        strokeWidth={strokeWidth}
        strokeDasharray="4 6"
        className="animate-sync-flow"
        style={{ animationDelay: "-1.5s" }}
      />
      <path
        d="M 0 320 C 220 320, 220 220, 400 220 S 600 80, 800 80"
        stroke={`url(#${gradId})`}
        strokeWidth={strokeWidth}
        strokeDasharray="2 10"
        className="animate-sync-flow"
        style={{ animationDelay: "-3s" }}
      />
    </svg>
  );
}

export default SyncLines;
