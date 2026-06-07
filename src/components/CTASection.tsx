import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useSiteContent } from "@/hooks/useSiteContent";
import { SiteContainer } from "@/components/layout/SiteContainer";

const isInternal = (href: string) => href.startsWith("/");

/**
 * Full-bleed dark CTA strip styled after a premium event platform footer banner.
 */
const CTASection = () => {
  const { content } = useSiteContent();
  const c = content.cta;

  return (
    <section className="bg-background border-t border-border">
      <SiteContainer className="py-20 md:py-24">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-3xl mx-auto text-center"
        >
          <h2 className="h-section text-3xl md:text-5xl text-foreground mb-5">
            {c.title}
          </h2>
          {c.subtitle && (
            <p className="text-muted-foreground text-[15px] md:text-base mb-9 max-w-xl mx-auto leading-relaxed">
              {c.subtitle}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-center gap-3">
            {c.primaryCtaLabel && (
              isInternal(c.primaryCtaHref) ? (
                <Link
                  to={c.primaryCtaHref}
                  className="group inline-flex items-center justify-center h-12 px-6 rounded-xl text-[15px] font-semibold bg-foreground text-background hover:bg-foreground/90 shadow-md hover:shadow-lg active:scale-[0.98] transition-all duration-150"
                >
                  {c.primaryCtaLabel}
                  <ArrowRight className="h-4 w-4 ml-2 transition-transform group-hover:translate-x-0.5" />
                </Link>
              ) : (
                <a
                  href={c.primaryCtaHref}
                  className="group inline-flex items-center justify-center h-12 px-6 rounded-xl text-[15px] font-semibold bg-foreground text-background hover:bg-foreground/90 shadow-md hover:shadow-lg active:scale-[0.98] transition-all duration-150"
                >
                  {c.primaryCtaLabel}
                  <ArrowRight className="h-4 w-4 ml-2 transition-transform group-hover:translate-x-0.5" />
                </a>
              )
            )}
            {c.secondaryCtaLabel && (
              isInternal(c.secondaryCtaHref) ? (
                <Link
                  to={c.secondaryCtaHref}
                  className="inline-flex items-center justify-center h-12 px-6 rounded-xl border border-border text-foreground text-[15px] font-semibold hover:bg-secondary hover:border-foreground/30 active:scale-[0.98] transition-all duration-150"
                >
                  {c.secondaryCtaLabel}
                </Link>
              ) : (
                <a
                  href={c.secondaryCtaHref}
                  className="inline-flex items-center justify-center h-12 px-6 rounded-xl border border-border text-foreground text-[15px] font-semibold hover:bg-secondary hover:border-foreground/30 active:scale-[0.98] transition-all duration-150"
                >
                  {c.secondaryCtaLabel}
                </a>
              )
            )}
          </div>
        </motion.div>
      </SiteContainer>
    </section>
  );
};

export default CTASection;