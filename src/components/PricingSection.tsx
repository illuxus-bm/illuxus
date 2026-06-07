import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { Link } from "react-router-dom";
import { useSiteContent } from "@/hooks/useSiteContent";
import { SiteContainer } from "@/components/layout/SiteContainer";

const isInternal = (href: string) => href.startsWith("/");

const PricingSection = () => {
  const { content } = useSiteContent();
  const p = content.pricing;

  return (
    <section id="pricing" className="py-24 md:py-32 bg-background">
      <SiteContainer>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-14 max-w-2xl mx-auto"
        >
          {p.eyebrow && (
            <span className="inline-block text-[12px] font-semibold uppercase tracking-[0.22em]" style={{ color: "hsl(var(--brand-purple))" }}>{p.eyebrow}</span>
          )}
          <h2 className="h-section text-3xl md:text-5xl mt-4 mb-5">{p.title}</h2>
          {p.subtitle && (
            <p className="text-muted-foreground text-[15px] md:text-base leading-relaxed">{p.subtitle}</p>
          )}
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 max-w-6xl mx-auto">
          {p.plans.map((plan, index) => (
            <motion.div
              key={`${plan.name}-${index}`}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.08 }}
              className={`relative p-6 rounded-xl bg-card transition-all duration-200 ${
                plan.highlight
                  ? "border-2 shadow-lg"
                  : "border border-border hover:border-foreground/30 hover:shadow-md"
              }`}
              style={plan.highlight ? { borderColor: "hsl(var(--brand-blue))" } : undefined}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-white text-[11px] font-semibold tracking-wide shadow-md" style={{ backgroundColor: "hsl(var(--brand-blue))" }}>
                  Popular
                </div>
              )}

              <h3 className="h-card text-sm">{plan.name}</h3>
              <p className="text-[12px] text-muted-foreground mt-0.5">{plan.description}</p>

              <div className="mt-4 mb-5">
                <span className="h-display text-4xl">{plan.price}</span>
                <span className="text-muted-foreground text-sm">{plan.period}</span>
              </div>

              {isInternal(plan.ctaHref) ? (
                <Link
                  to={plan.ctaHref}
                  className={`w-full inline-flex items-center justify-center h-10 rounded-lg text-[13px] font-semibold transition-all duration-150 active:scale-[0.98] ${plan.highlight ? "text-white hover:opacity-90 shadow-sm hover:shadow-md" : "border border-border text-foreground hover:bg-secondary hover:border-foreground/30"}`}
                  style={plan.highlight ? { backgroundColor: "hsl(var(--brand-blue))" } : undefined}
                >
                  {plan.ctaLabel}
                </Link>
              ) : (
                <a
                  href={plan.ctaHref}
                  className={`w-full inline-flex items-center justify-center h-10 rounded-lg text-[13px] font-semibold transition-all duration-150 active:scale-[0.98] ${plan.highlight ? "text-white hover:opacity-90 shadow-sm hover:shadow-md" : "border border-border text-foreground hover:bg-secondary hover:border-foreground/30"}`}
                  style={plan.highlight ? { backgroundColor: "hsl(var(--brand-blue))" } : undefined}
                >
                  {plan.ctaLabel}
                </a>
              )}

              <ul className="mt-5 space-y-2">
                {plan.features.map((feature, i) => (
                  <li key={`${feature}-${i}`} className="flex items-start gap-2 text-[13px]">
                    <Check className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: "hsl(var(--brand-green))" }} strokeWidth={3} />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </SiteContainer>
    </section>
  );
};

export default PricingSection;