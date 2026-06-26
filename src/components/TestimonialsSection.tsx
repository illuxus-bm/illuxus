import { TrustMarquee } from "@/components/landing/TrustMarquee";

/**
 * Landing-page testimonials slot. The Attio redesign replaces the old card
 * grid with a centered hero quote + infinite scrolling logo strip — the role
 * of social proof is the same, the surface is different.
 *
 * Kept as a thin re-export so the `pages/Index.tsx` import surface stays
 * stable for downstream tooling and the CMS-edited `testimonials.items[0]`
 * still feeds the lead quote in `<TrustMarquee>`.
 */
const TestimonialsSection = () => <TrustMarquee />;

export default TestimonialsSection;
