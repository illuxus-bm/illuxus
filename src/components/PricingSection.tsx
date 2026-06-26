import { motion } from "framer-motion";
import { Check, Sparkles } from "lucide-react";
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
 * Dark luminous pricing. Cards lean on the same glassmorphism + 1px glowing
 * border vocabulary as the bento grid; the highlighted plan is lifted with a
 * soft halo and a brighter ring instead of the old solid border.
 */
const PricingSection = () => {
  const { content } = useSiteContent();
  const p = content.pricing;

  return (
    <section
      id="pricing"
      className="relative isolate overflow-hidden py-24 md:py-32"
    >
      <GlowOrb
        className="left-1/2 top-[-200px] -translate-x-1/2"
        size={780}
        color="rgba(99, 102, 241, 0.20)"
        blur={110}
      />

      <SiteContainer className="relative">
        <AnimatedStack className="mx-auto mb-14 max-w-2xl text-center md:mb-16">
          {p.eyebrow && (
            <AnimatedItem>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-purple-300 backdrop-blur-xl">
                <Sparkles className="h-3 w-3" />
                {p.eyebrow}
              </span>
            </AnimatedItem>
          )}
          <AnimatedItem>
            <h2
              className="mt-5 text-balance text-3xl font-semibold leading-[1.1] tracking-[-0.03em] text-white sm:text-4xl md:text-[52px]"
              style={{ fontFamily: "Poppins, system-ui, sans-serif" }}
            >
              {p.title}
            </h2>
          </AnimatedItem>
          {p.subtitle && (
            <AnimatedItem>
              <p className="mt-5 text-[15px] leading-relaxed text-white/55 md:text-base [text-wrap:pretty]">
                {p.subtitle}
              </p>
            </AnimatedItem>
          )}
        </AnimatedStack>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:gap-5">
          {p.plans.slice(0, 3).map((plan, index) => (
            <motion.div
              key={`${plan.name}-${index}`}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ delay: index * 0.08, duration: 0.5, ease: [0.21, 0.47, 0.32, 0.98] }}
              className="relative"
            >
              {plan.highlight && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -inset-0.5 rounded-[26px] opacity-90 blur-md"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(99, 102, 241, 0.6) 0%, rgba(168, 85, 247, 0.4) 50%, rgba(244, 114, 182, 0.4) 100%)",
                  }}
                />
              )}
              <div
                className={`relative flex h-full flex-col rounded-3xl border backdrop-blur-xl ${
                  plan.highlight
                    ? "border-white/15 bg-[#0E0E12]/90"
                    : "border-white/[0.08] bg-white/[0.02]"
                } p-7`}
              >
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white shadow-[0_8px_20px_-4px_rgba(99,102,241,0.5)]">
                    <Sparkles className="h-3 w-3" />
                    Most popular
                  </div>
                )}

                <h3 className="text-[13px] font-semibold uppercase tracking-[0.16em] text-white/80">
                  {plan.name}
                </h3>
                <p className="mt-1 text-[12px] text-white/45">{plan.description}</p>

                <div className="mt-5 flex items-baseline gap-1">
                  <span
                    className="text-[40px] font-semibold tracking-[-0.03em] text-white"
                    style={{ fontFamily: "Poppins, system-ui, sans-serif" }}
                  >
                    {plan.price}
                  </span>
                  <span className="text-[13px] text-white/45">{plan.period}</span>
                </div>

                {isInternal(plan.ctaHref) ? (
                  <Link
                    to={plan.ctaHref}
                    className={`mt-6 inline-flex h-10 w-full items-center justify-center rounded-xl text-[13px] font-semibold transition-all duration-150 active:scale-[0.98] ${
                      plan.highlight
                        ? "bg-white text-[#09090B] hover:bg-white/90 shadow-[0_8px_30px_-8px_rgba(255,255,255,0.4)]"
                        : "border border-white/15 bg-white/[0.03] text-white hover:border-white/30 hover:bg-white/[0.06]"
                    }`}
                  >
                    {plan.ctaLabel}
                  </Link>
                ) : (
                  <a
                    href={plan.ctaHref}
                    className={`mt-6 inline-flex h-10 w-full items-center justify-center rounded-xl text-[13px] font-semibold transition-all duration-150 active:scale-[0.98] ${
                      plan.highlight
                        ? "bg-white text-[#09090B] hover:bg-white/90 shadow-[0_8px_30px_-8px_rgba(255,255,255,0.4)]"
                        : "border border-white/15 bg-white/[0.03] text-white hover:border-white/30 hover:bg-white/[0.06]"
                    }`}
                  >
                    {plan.ctaLabel}
                  </a>
                )}

                <ul className="mt-6 space-y-2.5">
                  {plan.features.map((feature, i) => (
                    <li
                      key={`${feature}-${i}`}
                      className="flex items-start gap-2.5 text-[13px] text-white/75"
                    >
                      <Check
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-300"
                        strokeWidth={3}
                      />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          ))}
        </div>
      </SiteContainer>
    </section>
  );
};

export default PricingSection;
