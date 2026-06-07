import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { useSiteContent } from "@/hooks/useSiteContent";
import { SiteContainer } from "@/components/layout/SiteContainer";

const isInternal = (href: string) => href.startsWith("/");

const HeroSection = () => {
  const { content } = useSiteContent();
  const h = content.hero;

  return (
    <section
      className="relative overflow-hidden pt-24 pb-20 sm:pt-28 sm:pb-24 md:pt-36 md:pb-28 lg:pt-40 lg:pb-32 border-b border-border bg-background"
    >
      <SiteContainer className="relative !max-w-4xl text-center">
        {h.badge && (
          <motion.span
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[12px] font-medium tracking-wide mb-6 sm:mb-7 border border-border bg-card text-foreground/80 shadow-sm"
          >
            <Sparkles className="h-3.5 w-3.5" style={{ color: "hsl(var(--brand-blue))" }} />
            {h.badge}
          </motion.span>
        )}

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.05 }}
          className="h-display text-[40px] sm:text-[56px] md:text-[72px] lg:text-[84px] text-foreground"
        >
          {h.title}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="text-[15px] sm:text-base md:text-lg max-w-2xl mt-5 sm:mt-6 leading-[1.55] mx-auto text-muted-foreground [text-wrap:pretty]"
        >
          {h.subtitle}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.25 }}
          className="mt-8 sm:mt-9 flex flex-wrap items-center justify-center gap-3"
        >
          {h.primaryCtaLabel && (
            isInternal(h.primaryCtaHref) ? (
              <Link to={h.primaryCtaHref} className="group inline-flex items-center justify-center h-12 px-6 rounded-xl text-[15px] font-semibold bg-foreground text-background hover:bg-foreground/90 shadow-md hover:shadow-lg active:scale-[0.98] transition-all duration-150">
                {h.primaryCtaLabel}
                <ArrowRight className="h-4 w-4 ml-2 transition-transform group-hover:translate-x-0.5" />
              </Link>
            ) : (
              <a href={h.primaryCtaHref} className="group inline-flex items-center justify-center h-12 px-6 rounded-xl text-[15px] font-semibold bg-foreground text-background hover:bg-foreground/90 shadow-md hover:shadow-lg active:scale-[0.98] transition-all duration-150">
                {h.primaryCtaLabel}
                <ArrowRight className="h-4 w-4 ml-2 transition-transform group-hover:translate-x-0.5" />
              </a>
            )
          )}
          {h.secondaryCtaLabel && (
            isInternal(h.secondaryCtaHref) ? (
              <Link to={h.secondaryCtaHref} className="inline-flex items-center justify-center h-12 px-6 rounded-xl text-[15px] font-semibold border border-border text-foreground hover:bg-secondary hover:border-foreground/30 active:scale-[0.98] transition-all duration-150">
                {h.secondaryCtaLabel}
              </Link>
            ) : (
              <a href={h.secondaryCtaHref} className="inline-flex items-center justify-center h-12 px-6 rounded-xl text-[15px] font-semibold border border-border text-foreground hover:bg-secondary hover:border-foreground/30 active:scale-[0.98] transition-all duration-150">
                {h.secondaryCtaLabel}
              </a>
            )
          )}
        </motion.div>

        {/* Recognition strip */}
        <div className="mt-20 sm:mt-24 md:mt-28 lg:mt-32 pt-8 md:pt-10 border-t border-border/70">
          <div className="text-[11px] uppercase tracking-[0.24em] font-semibold text-muted-foreground mb-6">
            Trusted by event teams worldwide
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
            {["TechCrunch", "Summit Global", "DevConf", "Forge Labs", "Northwind"].map((logo) => (
              <span
                key={logo}
                className="text-[15px] font-semibold tracking-tight text-muted-foreground hover:text-foreground transition-colors"
              >
                {logo}
              </span>
            ))}
          </div>
        </div>
      </SiteContainer>
    </section>
  );
};

export default HeroSection;