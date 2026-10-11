import { useSiteContent } from "@/hooks/useSiteContent";
import { SiteContainer } from "@/components/layout/SiteContainer";
import { PillLink, PosterTitle, Reveal } from "@/components/landing/primitives";

/**
 * Closing call to action: one framed panel standing on the same perspective
 * floor the page opened with, carrying the hero's button pair.
 */
const CTASection = () => {
  const { content } = useSiteContent();
  const c = content.cta;

  return (
    <section className="relative py-20 md:py-28">
      <SiteContainer>
        <div className="relative overflow-hidden rounded-[28px] border border-accent/40 bg-card px-6 py-20 text-center sm:px-12 md:py-28">
          <div aria-hidden="true" className="floor-plane opacity-70" />
          <div className="relative mx-auto max-w-3xl">
            <PosterTitle text={c.title} className="text-[clamp(46px,7.4vw,104px)]" />
            {c.subtitle && (
              <Reveal index={1}>
                <p className="mx-auto mt-6 max-w-xl text-[16px] leading-relaxed text-muted-foreground sm:text-[18px]">
                  {c.subtitle}
                </p>
              </Reveal>
            )}
            <Reveal index={2}>
              <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                {c.primaryCtaLabel && (
                  <PillLink href={c.primaryCtaHref} arrow>
                    {c.primaryCtaLabel}
                  </PillLink>
                )}
                {c.secondaryCtaLabel && (
                  <PillLink href={c.secondaryCtaHref} variant="outline">
                    {c.secondaryCtaLabel}
                  </PillLink>
                )}
              </div>
            </Reveal>
          </div>
        </div>
      </SiteContainer>
    </section>
  );
};

export default CTASection;
