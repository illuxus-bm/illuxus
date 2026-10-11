import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { prefersReducedMotion } from "@/components/landing/motion";

function headerOffset() {
  const header = document.querySelector("header");
  return header ? header.getBoundingClientRect().height : 0;
}

/**
 * Inertial wheel scrolling for the landing page, so the scroll-driven scenes
 * move continuously instead of in mouse-wheel steps. Lives only while the
 * page is mounted; the rest of the app keeps native scrolling. Touch devices
 * are left on their own momentum scrolling.
 */
export function useSmoothScroll() {
  const { hash } = useLocation();

  useEffect(() => {
    if (prefersReducedMotion()) return;
    let cancelled = false;
    let teardown = () => {};

    import("lenis").then(({ default: Lenis }) => {
      if (cancelled) return;
      const lenis = new Lenis({ autoRaf: true, lerp: 0.1, anchors: { offset: -headerOffset() } });

      // Dialogs and menus lock the page while open; stand down until they close.
      const syncLock = () => {
        if (document.body.hasAttribute("data-scroll-locked")) lenis.stop();
        else lenis.start();
      };
      const observer = new MutationObserver(syncLock);
      observer.observe(document.body, { attributes: true, attributeFilter: ["data-scroll-locked"] });

      teardown = () => {
        observer.disconnect();
        lenis.destroy();
      };
    });

    return () => {
      cancelled = true;
      teardown();
    };
  }, []);

  // Arriving on /#pricing from another page: jump to the section once laid out.
  useEffect(() => {
    if (!hash) return;
    const id = window.setTimeout(() => {
      const target = document.getElementById(decodeURIComponent(hash.slice(1)));
      target?.scrollIntoView();
    }, 120);
    return () => window.clearTimeout(id);
  }, [hash]);
}
