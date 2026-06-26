import { motion, type Variants } from "framer-motion";
import { type ReactNode } from "react";

/**
 * Variants used by `<AnimatedStack>` / `<AnimatedItem>` to produce the Attio-
 * style staggered fade-up effect. Items rise 20px and fade in with a slight
 * stagger between siblings — once per scroll-into-view to keep the page
 * lively without re-firing on every scroll back up.
 *
 * Honours `prefers-reduced-motion` because framer-motion's `MotionConfig`
 * reads the user setting at runtime. If you need to override per surface,
 * wrap the call site in `<MotionConfig reducedMotion="user">`.
 */
const STAGGER_CONTAINER: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.05,
    },
  },
};

const STAGGER_ITEM: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.55,
      ease: [0.21, 0.47, 0.32, 0.98],
    },
  },
};

export interface AnimatedStackProps {
  children: ReactNode;
  className?: string;
  /** Override the default amount that must be in-view before triggering. */
  amount?: number;
  /** Render-time trigger — by default the stack animates once. */
  once?: boolean;
}

/**
 * Wrap a section's intro copy (eyebrow + headline + subhead + CTAs) in this
 * component so its direct `<AnimatedItem>` children fade up in sequence on
 * scroll. Use `whileInView` semantics so animations only fire when visible.
 */
export function AnimatedStack({
  children,
  className,
  amount = 0.25,
  once = true,
}: AnimatedStackProps) {
  return (
    <motion.div
      variants={STAGGER_CONTAINER}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, amount }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export interface AnimatedItemProps {
  children: ReactNode;
  className?: string;
}

/**
 * Single staggered child. Must be rendered inside `<AnimatedStack>` for the
 * variants to propagate.
 */
export function AnimatedItem({ children, className }: AnimatedItemProps) {
  return (
    <motion.div variants={STAGGER_ITEM} className={className}>
      {children}
    </motion.div>
  );
}
