import { useRef } from "react";
import { Quote } from "lucide-react";
import { useSiteContent } from "@/hooks/useSiteContent";
import { SiteContainer } from "@/components/layout/SiteContainer";
import { PosterTitle, Reveal, SectionChip } from "@/components/landing/primitives";
import { useTilt, useViewportProgress } from "@/components/landing/motion";
import type { TestimonialItem } from "@/lib/site-content";

/**
 * Social proof: two counter-moving rows of names that also slide with the
 * page scroll, followed by the testimonials from site content.
 */
const FALLBACK_LOGOS = [
  "TechCrunch",
  "Summit Global",
  "DevConf",
  "Forge Labs",
  "Northwind",
  "Helios",
  "Lumen",
  "Acme",
];

const EDGE_FADE = "linear-gradient(to right, transparent, #000 12%, #000 88%, transparent)";

function NameRow({ reverse = false, outlined = false }: { reverse?: boolean; outlined?: boolean }) {
  return (
    <div
      className="flex w-max items-center gap-10 pr-10 animate-marquee-seamless will-change-transform"
      style={reverse ? { animationDirection: "reverse" } : undefined}
    >
      {[...FALLBACK_LOGOS, ...FALLBACK_LOGOS].map((logo, i) => (
        <span key={`${logo}-${i}`} className="flex shrink-0 items-center gap-10">
          <span
            className="poster text-[clamp(40px,6vw,84px)] text-foreground/75"
            style={
              outlined
                ? { color: "transparent", WebkitTextStroke: "1px hsl(var(--foreground) / 0.45)" }
                : undefined
            }
          >
            {logo}
          </span>
          <span className="h-2 w-2 rotate-45 bg-accent" aria-hidden="true" />
        </span>
      ))}
    </div>
  );
}

function TestimonialCard({ item }: { item: TestimonialItem }) {
  const ref = useTilt<HTMLElement>(3);
  const initials = item.author
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
  return (
    <figure ref={ref} className="tilt flex h-full flex-col rounded-2xl border border-border bg-card p-7">
      <span className="grid h-9 w-9 place-items-center rounded-lg border border-accent/40 bg-accent/10 text-accent">
        <Quote className="h-4 w-4" />
      </span>
      <blockquote className="mt-5 flex-1 text-[17px] leading-relaxed text-foreground [text-wrap:pretty]">
        {item.quote}
      </blockquote>
      <figcaption className="mt-6 flex items-center gap-3 border-t border-border pt-5">
        {item.avatarUrl ? (
          <img src={item.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" loading="lazy" />
        ) : (
          <span className="grid h-10 w-10 place-items-center rounded-full bg-primary text-[13px] font-bold text-primary-foreground">
            {initials}
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-semibold text-foreground">{item.author}</span>
          {item.role && <span className="block truncate text-[13px] text-muted-foreground">{item.role}</span>}
        </span>
      </figcaption>
    </figure>
  );
}

export function TrustMarquee() {
  const { content } = useSiteContent();
  const t = content.testimonials;
  const section = useRef<HTMLElement>(null);
  const rowA = useRef<HTMLDivElement>(null);
  const rowB = useRef<HTMLDivElement>(null);

  useViewportProgress(section, (progress) => {
    const shift = (progress - 0.5) * 220;
    if (rowA.current) rowA.current.style.transform = `translate3d(${(-shift).toFixed(1)}px, 0, 0)`;
    if (rowB.current) rowB.current.style.transform = `translate3d(${shift.toFixed(1)}px, 0, 0)`;
  });

  return (
    <section
      ref={section}
      id="testimonials"
      aria-label="Trusted by event teams worldwide"
      className="relative scroll-mt-[var(--app-header-h)] border-y border-border bg-background py-20 sm:py-28"
    >
      <p className="eyebrow mb-8 text-center text-muted-foreground">Trusted by event teams worldwide</p>
      <div className="space-y-2 overflow-hidden" style={{ maskImage: EDGE_FADE, WebkitMaskImage: EDGE_FADE }}>
        <div ref={rowA}>
          <NameRow />
        </div>
        <div ref={rowB}>
          <NameRow reverse outlined />
        </div>
      </div>

      {t.items.length > 0 && (
        <SiteContainer className="mt-20 sm:mt-24">
          <Reveal>{t.eyebrow && <SectionChip icon={Quote} label={t.eyebrow} />}</Reveal>
          <PosterTitle text={t.title} className="mt-5 max-w-3xl text-[clamp(40px,6vw,84px)]" />
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {t.items.slice(0, 3).map((item, i) => (
              <Reveal key={`${item.author}-${i}`} index={i} className="h-full">
                <TestimonialCard item={item} />
              </Reveal>
            ))}
          </div>
        </SiteContainer>
      )}
    </section>
  );
}

export default TrustMarquee;
