import SiteHeader from "@/components/SiteHeader";
import HeroSection from "@/components/HeroSection";
import FeaturesSection from "@/components/FeaturesSection";
import PricingSection from "@/components/PricingSection";
import TestimonialsSection from "@/components/TestimonialsSection";
import CTASection from "@/components/CTASection";

/**
 * Landing page.
 *
 * Respects the app-wide light/dark theme — no forced `dark` class.
 * In dark mode the near-black canvas + glow gradients look great;
 * in light mode the gradient backdrop fades naturally on a white/cream
 * surface and the glass navbar reads correctly in both palettes.
 */
const Index = () => {
  return (
    <div
      data-landing="true"
      className="relative min-h-screen overflow-x-hidden"
    >
      {/* Ambient gradient layer — visible in dark mode, subtle in light */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 dark:opacity-100 opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(80% 50% at 50% 0%, rgba(99, 102, 241, 0.14), transparent 70%)," +
            "radial-gradient(60% 60% at 50% 120%, rgba(168, 85, 247, 0.10), transparent 70%)",
        }}
      />
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
