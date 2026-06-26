import { motion } from "framer-motion";
import { useSiteContent } from "@/hooks/useSiteContent";
import { SiteContainer } from "@/components/layout/SiteContainer";

/**
 * `<TrustMarquee>` — infinite-scrolling, grayscale logo strip topped with a
 * bold centered testimonial. The Attio analogue lives right under the hero
 * to anchor the page in social proof before any product detail lands.
 *
 * The strip is duplicated in markup so the CSS keyframe (`marquee-seamless`)
 * can translate by exactly -50% and wrap without a visible cut. Edge fades
 * mask the loop seam on both sides.
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

export function TrustMarquee() {
  const { content } = useSiteContent();
  // Use the first testimonial from site content (CMS-editable) as the hero
  // quote. If empty, fall back to a neutral string.
  const lead = content.testimonials.items[0] ?? {
    quote:
      "Illuxus replaced three tools for us and made our events feel ten times more polished.",
    author: "Sarah Chen",
    role: "Head of Events, TechCrunch",
  };

  return (
    <section
      aria-label="Trusted by event teams worldwide"
      className="relative border-y border-white/[0.06] py-20 sm:py-24"
    >
      <SiteContainer className="relative">
        {/* Centered testimonial */}
        <motion.figure
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.6 }}
          className="mx-auto mb-16 max-w-3xl text-center"
        >
          <blockquote className="text-2xl font-medium leading-snug text-white/95 sm:text-[28px] sm:leading-[1.25] [text-wrap:balance]">
            &ldquo;{lead.quote}&rdquo;
          </blockquote>
          <figcaption className="mt-6 flex items-center justify-center gap-3 text-[13px] text-white/55">
            <span className="h-px w-8 bg-white/20" aria-hidden="true" />
            <span>
              <span className="font-semibold text-white/80">{lead.author}</span>
              {lead.role ? ` — ${lead.role}` : ""}
            </span>
            <span className="h-px w-8 bg-white/20" aria-hidden="true" />
          </figcaption>
        </motion.figure>

        {/* Eyebrow */}
        <p className="mb-8 text-center text-[11px] font-semibold uppercase tracking-[0.32em] text-white/40">
          Trusted by event teams worldwide
        </p>
      </SiteContainer>

      {/* Marquee strip — full-bleed so the gradient fades can bite the page edges. */}
      <div className="relative overflow-hidden">
        <div className="flex w-max gap-12 px-6 animate-marquee-seamless will-change-transform">
          {[...FALLBACK_LOGOS, ...FALLBACK_LOGOS].map((logo, i) => (
            <span
              key={`${logo}-${i}`}
              className="shrink-0 text-2xl font-semibold tracking-tight text-white/35 grayscale transition-colors hover:text-white/70 sm:text-[26px]"
            >
              {logo}
            </span>
          ))}
        </div>
        {/* Edge fades to mask the loop seam */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[#09090B] to-transparent sm:w-40" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-[#09090B] to-transparent sm:w-40" />
      </div>
    </section>
  );
}

export default TrustMarquee;
