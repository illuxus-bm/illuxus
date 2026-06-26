import { useTheme } from "@/contexts/ThemeContext";
import SiteHeader from "@/components/SiteHeader";
import HeroSection from "@/components/HeroSection";
import FeaturesSection from "@/components/FeaturesSection";
import PricingSection from "@/components/PricingSection";
import TestimonialsSection from "@/components/TestimonialsSection";
import CTASection from "@/components/CTASection";

/**
 * Landing page — renders on either a light or dark canvas depending on the
 * user's active theme. The `dark` class is applied conditionally so the
 * ThemeToggle in the navbar actually switches the landing canvas.
 *
 * The radial gradient background is only shown in dark mode; in light mode
 * the page uses a plain white background so text stays readable.
 */
const Index = () => {
  const { theme } = useTheme();
  return (
    <div
      data-landing="true"
      className={`${theme === "dark" ? "dark" : ""} relative min-h-screen overflow-x-hidden bg-white dark:bg-[#09090B] text-gray-900 dark:text-white`}
      style={{
        backgroundImage:
          theme === "dark"
            ? "radial-gradient(80% 50% at 50% 0%, rgba(99, 102, 241, 0.10), transparent 70%)," +
              "radial-gradient(60% 60% at 50% 120%, rgba(168, 85, 247, 0.08), transparent 70%)"
            : undefined,
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
