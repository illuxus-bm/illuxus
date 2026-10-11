import { Check, Tag } from "lucide-react";
import { useSiteContent } from "@/hooks/useSiteContent";
import { SiteContainer } from "@/components/layout/SiteContainer";
import { PillLink, PosterTitle, Reveal, SectionChip } from "@/components/landing/primitives";
import { useTilt } from "@/components/landing/motion";
import type { PricingPlan } from "@/lib/site-content";

function PlanCard({ plan }: { plan: PricingPlan }) {
  const ref = useTilt<HTMLDivElement>(3);
  return (
    <div
      ref={ref}
      className={`tilt relative flex h-full flex-col rounded-2xl border bg-card p-7 ${
        plan.highlight ? "border-accent shadow-[0_30px_70px_-40px_hsl(var(--accent)/0.55)]" : "border-border"
      }`}
    >
      {plan.highlight && (
        <span className="absolute -top-3 left-7 rounded-full bg-accent px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-accent-foreground">
          Most popular
        </span>
      )}
      <h3 className="eyebrow text-foreground">{plan.name}</h3>
      <p className="mt-2 min-h-[40px] text-[13px] leading-relaxed text-muted-foreground">{plan.description}</p>

      <div className="mt-5 flex items-baseline gap-1.5 border-b border-border pb-6">
        <span className="poster text-[64px] text-foreground">{plan.price}</span>
        {plan.period && <span className="text-[14px] text-muted-foreground">{plan.period}</span>}
      </div>

      <ul className="mt-6 flex-1 space-y-3">
        {plan.features.map((feature, i) => (
          <li key={`${feature}-${i}`} className="flex items-start gap-3 text-[14px] text-foreground/85">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" strokeWidth={2.5} />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <PillLink
        href={plan.ctaHref}
        variant={plan.highlight ? "primary" : "outline"}
        size="md"
        arrow={plan.highlight}
        className="mt-8 w-full"
      >
        {plan.ctaLabel}
      </PillLink>
    </div>
  );
}

const PricingSection = () => {
  const { content } = useSiteContent();
  const p = content.pricing;

  return (
    <section id="pricing" className="relative scroll-mt-[var(--app-header-h)] border-t border-border py-24 md:py-32">
      <SiteContainer>
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>{p.eyebrow && <SectionChip icon={Tag} label={p.eyebrow} />}</Reveal>
          <PosterTitle text={p.title} className="mt-5 text-[clamp(44px,7vw,96px)]" />
          {p.subtitle && (
            <Reveal index={1}>
              <p className="mx-auto mt-5 max-w-xl text-[16px] leading-relaxed text-muted-foreground sm:text-[18px] [text-wrap:pretty]">
                {p.subtitle}
              </p>
            </Reveal>
          )}
        </div>

        <div className="mt-16 grid gap-5 md:grid-cols-3">
          {p.plans.slice(0, 3).map((plan, index) => (
            <Reveal key={`${plan.name}-${index}`} index={index} className="h-full">
              <PlanCard plan={plan} />
            </Reveal>
          ))}
        </div>
      </SiteContainer>
    </section>
  );
};

export default PricingSection;
