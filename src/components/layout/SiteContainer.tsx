import { forwardRef, type ElementType, type HTMLAttributes, type ReactNode } from "react";

/**
 * Single source of truth for the public site's horizontal gutters.
 *
 * Header, footer, landing sections, marketing banners — anything that should
 * line up edge-to-edge with the chrome — must render its content inside a
 * `<SiteContainer>` (or apply the same `max-w-6xl mx-auto px-4 sm:px-6` token
 * combo via the CSS variables exposed in `index.css`).
 *
 * Drift is enforced by `gutters.test.tsx`.
 */
export const SITE_CONTAINER_CLASS = "mx-auto w-full max-w-6xl px-4 sm:px-6";

interface SiteContainerProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  className?: string;
  children?: ReactNode;
}

export const SiteContainer = forwardRef<HTMLElement, SiteContainerProps>(
  ({ as: Tag = "div", className = "", children, ...rest }, ref) => {
    const Component = Tag as ElementType;
    return (
      <Component
        ref={ref}
        data-site-container=""
        className={`${SITE_CONTAINER_CLASS} ${className}`.trim()}
        {...rest}
      >
        {children}
      </Component>
    );
  },
);
SiteContainer.displayName = "SiteContainer";

export default SiteContainer;