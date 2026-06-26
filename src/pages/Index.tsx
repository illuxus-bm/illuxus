import SiteHeader from "@/components/SiteHeader";
import HeroSection from "@/components/HeroSection";
import FeaturesSection from "@/components/FeaturesSection";
import PricingSection from "@/components/PricingSection";
import TestimonialsSection from "@/components/TestimonialsSection";
import CTASection from "@/components/CTASection";

/**
 * Landing page — Attio-inspired dark luminous canvas.
 *
 * Forces the dark palette regardless of the app-wide theme by stamping
 * `dark` and `data-landing` on the root wrapper. CSS variables cascade from
 * the `.dark` selector so SiteHeader, shadcn primitives, and any nested
 * components automatically pick up dark tokens within this subtree, while
 * leaving the rest of the app (dashboard, themed event pages) untouched.
 */
const Index = () => {
  return (
    <div
      data-landing="true"
      className="dark relative min-h-screen overflow-x-hidden bg-[#09090B] text-white"
      style={{
        // Subtle base-layer gradient so the canvas never reads as flat black.
        backgroundImage:
          "radial-gradient(80% 50% at 50% 0%, rgba(99, 102, 241, 0.10), transparent 70%)," +
          "radial-gradient(60% 60% at 50% 120%, rgba(168, 85, 247, 0.08), transparent 70%)",
      }}
    >
      <SiteHeader landingMode />
      <main>
        <HeroSection />
        <TestimonialsSection />
        <FeaturesSection />
        <PricingSection />
        <CTASection />
      </main>
    </div>
  );
};

export default Index;
