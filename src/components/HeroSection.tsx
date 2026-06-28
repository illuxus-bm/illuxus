import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { useSiteContent } from "@/hooks/useSiteContent";
import { SiteContainer } from "@/components/layout/SiteContainer";
import { GlowOrb } from "@/components/landing/GlowOrb";
import { DashboardMockup } from "@/components/landing/DashboardMockup";
import { AnimatedStack, AnimatedItem } from "@/components/landing/AnimatedHeading";

const isInternal = (href: string) => href.startsWith("/");

/**
 * Hero section. Uses dual Tailwind tokens so it renders correctly in both
 * light and dark mode. The `dark:` variants activate because `Index.tsx`
 * stamps the `dark` class on the wrapper whenever the user's theme is dark.
 */
const HeroSection = () => {
  const { content } = useSiteContent();
  const h = content.hero;

  return (
    <section className="relative isolate overflow-hidden pt-16 pb-28 sm:pt-20 sm:pb-32 md:pt-24 md:pb-40">
      {/* Layered glow orbs — give the section depth without an image. */}
      <GlowOrb
        className="left-1/2 top-[-220px] -translate-x-1/2"
        size={900}
        color="rgba(99, 102, 241, 0.32)"
        blur={120}
      />
      <GlowOrb
        className="left-[-120px] top-[200px]"
        size={520}
        color="rgba(168, 85, 247, 0.22)"
        blur={100}
      />
      <GlowOrb
        className="right-[-120px] top-[300px]"
        size={520}
        color="rgba(249, 115, 22, 0.18)"
        blur={100}
      />

      <SiteContainer className="relative">
        <AnimatedStack className="mx-auto max-w-4xl text-center">
          {h.badge && (
            <AnimatedItem className="flex justify-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 dark:border-white/10 bg-gray-100/60 dark:bg-white/[0.04] px-3.5 py-1.5 text-[12px] font-medium tracking-wide text-gray-600 dark:text-white/75 backdrop-blur-xl">
                <Sparkles className="h-3.5 w-3.5 text-indigo-400 dark:text-indigo-300" />
                {h.badge}
              </span>
            </AnimatedItem>
          )}

          <AnimatedItem>
            <h1
              className="mt-6 text-balance text-[44px] font-semibold leading-[1.1] tracking-[-0.04em] text-gray-900 dark:text-white sm:text-[60px] md:text-[76px] md:leading-[1.08] lg:text-[88px] lg:leading-[1.05] pb-2"
              style={{ fontFamily: "Poppins, system-ui, sans-serif" }}
            >
              {h.title}
            </h1>
          </AnimatedItem>

          <AnimatedItem>
            <p className="mx-auto mt-6 max-w-2xl text-[15px] leading-relaxed text-gray-500 dark:text-white/60 sm:text-base md:text-lg [text-wrap:pretty]">
              {h.subtitle}
            </p>
          </AnimatedItem>

          <AnimatedItem>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              {h.primaryCtaLabel &&
                (isInternal(h.primaryCtaHref) ? (
                  <Link
                    to={h.primaryCtaHref}
                    className="group inline-flex h-12 items-center justify-center rounded-xl bg-gray-900 dark:bg-white px-6 text-[14px] font-semibold text-white dark:text-[#09090B] shadow-[0_10px_40px_-10px_rgba(0,0,0,0.3)] dark:shadow-[0_10px_40px_-10px_rgba(255,255,255,0.4)] transition-all duration-150 hover:bg-gray-800 dark:hover:bg-white/90 hover:shadow-[0_14px_50px_-10px_rgba(0,0,0,0.4)] dark:hover:shadow-[0_14px_50px_-10px_rgba(255,255,255,0.55)] active:scale-[0.98]"
                  >
                    {h.primaryCtaLabel}
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                ) : (
                  <a
                    href={h.primaryCtaHref}
                    className="group inline-flex h-12 items-center justify-center rounded-xl bg-gray-900 dark:bg-white px-6 text-[14px] font-semibold text-white dark:text-[#09090B] shadow-[0_10px_40px_-10px_rgba(0,0,0,0.3)] dark:shadow-[0_10px_40px_-10px_rgba(255,255,255,0.4)] transition-all duration-150 hover:bg-gray-800 dark:hover:bg-white/90 hover:shadow-[0_14px_50px_-10px_rgba(0,0,0,0.4)] dark:hover:shadow-[0_14px_50px_-10px_rgba(255,255,255,0.55)] active:scale-[0.98]"
                  >
                    {h.primaryCtaLabel}
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </a>
                ))}
              {h.secondaryCtaLabel &&
                (isInternal(h.secondaryCtaHref) ? (
                  <Link
                    to={h.secondaryCtaHref}
                    className="inline-flex h-12 items-center justify-center rounded-xl border border-gray-300 dark:border-white/15 bg-transparent dark:bg-white/[0.03] px-6 text-[14px] font-semibold text-gray-700 dark:text-white/90 transition-all duration-150 hover:border-gray-400 dark:hover:border-white/30 hover:bg-gray-100 dark:hover:bg-white/[0.06] active:scale-[0.98]"
                  >
                    {h.secondaryCtaLabel}
                  </Link>
                ) : (
                  <a
                    href={h.secondaryCtaHref}
                    className="inline-flex h-12 items-center justify-center rounded-xl border border-gray-300 dark:border-white/15 bg-transparent dark:bg-white/[0.03] px-6 text-[14px] font-semibold text-gray-700 dark:text-white/90 transition-all duration-150 hover:border-gray-400 dark:hover:border-white/30 hover:bg-gray-100 dark:hover:bg-white/[0.06] active:scale-[0.98]"
                  >
                    {h.secondaryCtaLabel}
                  </a>
                ))}
            </div>
          </AnimatedItem>
        </AnimatedStack>

        {/* Dashboard mockup */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.4, ease: [0.21, 0.47, 0.32, 0.98] }}
          className="relative mt-16 sm:mt-20"
        >
          {/* Soft halo behind the mockup */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 -top-10 mx-auto h-[420px] max-w-[820px] rounded-full opacity-70"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(99, 102, 241, 0.25) 0%, rgba(168, 85, 247, 0.12) 40%, transparent 70%)",
              filter: "blur(60px)",
            }}
          />
          <DashboardMockup />
        </motion.div>
      </SiteContainer>
    </section>
  );
};

export default HeroSection;
