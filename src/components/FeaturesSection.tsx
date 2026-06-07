import { motion } from "framer-motion";
import {
  CalendarDays, Ticket, Users, BarChart3, Mic2, Globe, Shield, Sparkles,
  Mail, ScanLine, Zap, Crown, Rocket, LucideIcon,
} from "lucide-react";
import { useSiteContent } from "@/hooks/useSiteContent";
import { SiteContainer } from "@/components/layout/SiteContainer";

const ICONS: Record<string, LucideIcon> = {
  CalendarDays, Ticket, Users, BarChart3, Mic2, Globe, Shield, Sparkles,
  Mail, ScanLine, Zap, Crown, Rocket,
};

const FeaturesSection = () => {
  const { content } = useSiteContent();
  const f = content.features;

  return (
    <section id="features" className="py-24 md:py-32 bg-secondary/50 border-y border-border">
      <SiteContainer>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16 max-w-3xl mx-auto"
        >
          {f.eyebrow && (
            <span className="inline-block text-[12px] font-semibold uppercase tracking-[0.22em]" style={{ color: "hsl(var(--brand-blue))" }}>
              {f.eyebrow}
            </span>
          )}
          <h2 className="h-section text-3xl md:text-5xl mt-4 mb-5">{f.title}</h2>
          {f.subtitle && (
            <p className="text-muted-foreground text-[15px] md:text-base leading-relaxed">{f.subtitle}</p>
          )}
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {f.items.map((feature, index) => {
            const Icon = ICONS[feature.icon] || Sparkles;
            const accents = [
              "var(--brand-blue)",
              "var(--brand-green)",
              "var(--brand-amber)",
              "var(--brand-purple)",
              "var(--brand-cyan)",
              "var(--brand-orange)",
              "var(--brand-pink)",
              "var(--brand-blue)",
            ];
            const tint = accents[index % accents.length];
            return (
              <motion.div
                key={`${feature.title}-${index}`}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.04 }}
                className="group p-7 rounded-xl bg-card border border-border hover:border-foreground/30 hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200"
              >
                <div
                  className="h-11 w-11 rounded-xl flex items-center justify-center mb-5"
                  style={{ backgroundColor: `hsl(${tint})` }}
                >
                  <Icon className="h-5 w-5 text-white" strokeWidth={2.25} />
                </div>
                <h3 className="h-card text-[16px] mb-2">{feature.title}</h3>
                <p className="text-[14px] text-muted-foreground leading-relaxed">{feature.description}</p>
              </motion.div>
            );
          })}
        </div>
      </SiteContainer>
    </section>
  );
};

export default FeaturesSection;