import {
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";

/**
 * `<BentoCard>` — the Attio-style mouse-tracking glow card.
 *
 * Records the cursor's position relative to the card on each `mousemove` and
 * exposes it as two CSS variables (`--mx`, `--my`) consumed by an inner
 * radial-gradient layer. The gradient only renders on hover (opacity 0→1 on
 * `group-hover`) so cards stay calm when the cursor is elsewhere on the page.
 *
 * The motion layer is skipped entirely for `prefers-reduced-motion` users.
 */
export interface BentoCardProps {
  children: ReactNode;
  className?: string;
  /** Override the default indigo glow tint with any rgba color. */
  glowColor?: string;
  /** Radius of the cursor-following gradient. Defaults to 520px. */
  glowRadius?: number;
  /** Optional handler when the card surface is clicked. */
  onClick?: () => void;
  /** Stretches the card to fill its grid track. */
  fullHeight?: boolean;
}

export function BentoCard({
  children,
  className = "",
  glowColor = "rgba(99, 102, 241, 0.18)",
  glowRadius = 520,
  onClick,
  fullHeight = true,
}: BentoCardProps) {
  // Start the gradient origin off-screen so it doesn't bloom in the corner
  // before the cursor ever touches the card.
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: -500, y: -500 });

  const handleMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleLeave = () => {
    setPos({ x: -500, y: -500 });
  };

  const cssVars: CSSProperties = {
    // Custom-property syntax requires casting since React's CSSProperties
    // type doesn't know about arbitrary --* vars.
    ["--mx" as never]: `${pos.x}px`,
    ["--my" as never]: `${pos.y}px`,
  };

  return (
    <div
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      onClick={onClick}
      className={[
        "group relative overflow-hidden rounded-3xl",
        "border border-gray-200 dark:border-white/[0.08] bg-gray-50/50 dark:bg-white/[0.02]",
        "backdrop-blur-xl",
        "transition-colors duration-300 hover:border-gray-300 dark:hover:border-white/[0.16]",
        fullHeight ? "h-full" : "",
        onClick ? "cursor-pointer" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={cssVars}
    >
      {/* Mouse-tracking glow — only visible on hover, hidden for reduced motion. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 motion-reduce:!hidden"
        style={{
          background: `radial-gradient(${glowRadius}px circle at var(--mx) var(--my), ${glowColor}, transparent 40%)`,
        }}
      />
      {/* Inner highlight stroke for the glassmorphism feel. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-px rounded-[calc(theme(borderRadius.3xl)-1px)] ring-1 ring-inset ring-gray-100 dark:ring-white/[0.04]"
      />
      <div className="relative">{children}</div>
    </div>
  );
}

export default BentoCard;
