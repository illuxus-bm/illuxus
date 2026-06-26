import SiteHeader from "@/components/SiteHeader";
import HeroSection from "@/components/HeroSection";
import FeaturesSection from "@/components/FeaturesSection";
import PricingSection from "@/components/PricingSection";
import TestimonialsSection from "@/components/TestimonialsSection";
import CTASection from "@/components/CTASection";

/**
 * Landing page — always renders on the dark luminous canvas.
 *
 * The `dark` class is stamped on the wrapper so all descendant components
 * (Hero, Features, Pricing, CTA) that use `text-white`, `bg-[#09090B]`,
 * `border-white/10` etc. work correctly regardless of the user's OS or
 * app-level theme preference.
 *
 * The navbar is a glass surface (`bg-white/[0.06] backdrop-blur-xl`) rather
 * than solid black, which gives the "floating glass" look. The ThemeToggle
 * inside landingMode lets users switch the *rest* of the app (dashboard etc.)
 * without affecting the landing canvas.
 */
const Index = () => {
  return (
    <div
      data-landing="true"
      className="dark relative min-h-screen overflow-x-hidden bg-[#09090B] text-white"
      style={{
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
