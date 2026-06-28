import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useSiteContent } from "@/hooks/useSiteContent";
import { SiteContainer } from "@/components/layout/SiteContainer";
import { GlowOrb } from "@/components/landing/GlowOrb";
import {
  AnimatedStack,
  AnimatedItem,
} from "@/components/landing/AnimatedHeading";

const isInternal = (href: string) => href.startsWith("/");

/**
 * Closing CTA — a high-contrast band with a wide gradient halo, balanced
 * headline, and the same primary/secondary button pair as the hero so the
 * cta language stays consistent end to end.
 */
const CTASection = () => {
  const { content } = useSiteContent();
  const c = content.cta;

  return (
    <section className="relative isolate overflow-hidden border-t border-gray-100 dark:border-white/[0.06]">
      {/* Halo */}
      <GlowOrb
        className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        size={1100}
        color="rgba(99, 102, 241, 0.22)"
        blur={140}
      />
      <GlowOrb
        className="left-[15%] top-[20%]"
        size={420}
        color="rgba(244, 114, 182, 0.18)"
        blur={100}
      />
      <GlowOrb
        className="right-[15%] bottom-[20%]"
        size={420}
        color="rgba(34, 211, 238, 0.18)"
        blur={100}
      />

      <SiteContainer className="relative py-24 md:py-32">
        <AnimatedStack className="mx-auto max-w-3xl text-center">
          <AnimatedItem>
            <h2
              className="text-balance text-3xl font-semibold leading-tight tracking-[-0.035em] text-gray-900 dark:text-white sm:text-5xl md:text-[64px] md:leading-[1.1] pb-2"
              style={{ fontFamily: "Poppins, system-ui, sans-serif" }}
            >
              {c.title}
            </h2>
          </AnimatedItem>
          {c.subtitle && (
            <AnimatedItem>
              <p className="mx-auto mt-6 max-w-xl text-[15px] leading-relaxed text-gray-500 dark:text-white/60 md:text-base">
                {c.subtitle}
              </p>
            </AnimatedItem>
          )}
          <AnimatedItem>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              {c.primaryCtaLabel &&
                (isInternal(c.primaryCtaHref) ? (
                  <Link
                    to={c.primaryCtaHref}
                    className="group inline-flex h-12 items-center justify-center rounded-xl bg-gray-900 dark:bg-white px-6 text-[14px] font-semibold text-white dark:text-[#09090B] shadow-[0_10px_40px_-10px_rgba(0,0,0,0.3)] dark:shadow-[0_10px_40px_-10px_rgba(255,255,255,0.4)] transition-all duration-150 hover:bg-gray-800 dark:hover:bg-white/90 hover:shadow-[0_14px_50px_-10px_rgba(0,0,0,0.4)] dark:hover:shadow-[0_14px_50px_-10px_rgba(255,255,255,0.55)] active:scale-[0.98]"
                  >
                    {c.primaryCtaLabel}
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                ) : (
                  <a
                    href={c.primaryCtaHref}
                    className="group inline-flex h-12 items-center justify-center rounded-xl bg-gray-900 dark:bg-white px-6 text-[14px] font-semibold text-white dark:text-[#09090B] shadow-[0_10px_40px_-10px_rgba(0,0,0,0.3)] dark:shadow-[0_10px_40px_-10px_rgba(255,255,255,0.4)] transition-all duration-150 hover:bg-gray-800 dark:hover:bg-white/90 hover:shadow-[0_14px_50px_-10px_rgba(0,0,0,0.4)] dark:hover:shadow-[0_14px_50px_-10px_rgba(255,255,255,0.55)] active:scale-[0.98]"
                  >
                    {c.primaryCtaLabel}
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </a>
                ))}
              {c.secondaryCtaLabel &&
                (isInternal(c.secondaryCtaHref) ? (
                  <Link
                    to={c.secondaryCtaHref}
                    className="inline-flex h-12 items-center justify-center rounded-xl border border-gray-300 dark:border-white/15 bg-transparent dark:bg-white/[0.03] px-6 text-[14px] font-semibold text-gray-700 dark:text-white/90 transition-all duration-150 hover:border-gray-400 dark:hover:border-white/30 hover:bg-gray-100 dark:hover:bg-white/[0.06] active:scale-[0.98]"
                  >
                    {c.secondaryCtaLabel}
                  </Link>
                ) : (
                  <a
                    href={c.secondaryCtaHref}
                    className="inline-flex h-12 items-center justify-center rounded-xl border border-gray-300 dark:border-white/15 bg-transparent dark:bg-white/[0.03] px-6 text-[14px] font-semibold text-gray-700 dark:text-white/90 transition-all duration-150 hover:border-gray-400 dark:hover:border-white/30 hover:bg-gray-100 dark:hover:bg-white/[0.06] active:scale-[0.98]"
                  >
                    {c.secondaryCtaLabel}
                  </a>
                ))}
            </div>
          </AnimatedItem>
        </AnimatedStack>
      </SiteContainer>
    </section>
  );
};

export default CTASection;
