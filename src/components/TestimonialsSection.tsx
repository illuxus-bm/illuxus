import { motion } from "framer-motion";
import { useSiteContent } from "@/hooks/useSiteContent";
import { SiteContainer } from "@/components/layout/SiteContainer";

const TestimonialsSection = () => {
  const { content } = useSiteContent();
  const t = content.testimonials;

  return (
    <section id="testimonials" className="py-24 md:py-32 bg-secondary/50 border-y border-border">
      <SiteContainer>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-14 max-w-2xl mx-auto"
        >
          {t.eyebrow && (
            <span className="inline-block text-[12px] font-semibold uppercase tracking-[0.22em]" style={{ color: "hsl(var(--brand-pink))" }}>{t.eyebrow}</span>
          )}
          <h2 className="h-section text-3xl md:text-5xl mt-4">{t.title}</h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {t.items.map((item, index) => {
            const palette = ["var(--brand-blue)", "var(--brand-green)", "var(--brand-amber)"];
            const tint = palette[index % palette.length];
            return (
            <motion.div
              key={`${item.author}-${index}`}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.08 }}
              className="p-7 rounded-xl bg-card border border-border hover:border-foreground/20 hover:shadow-md transition-all duration-200"
            >
              <span className="block text-5xl leading-none mb-3" style={{ color: `hsl(${tint})` }}>"</span>
              <p className="text-[14px] text-foreground leading-relaxed mb-5">{item.quote}</p>
              <div className="flex items-center gap-3 pt-4 border-t border-border/60">
                {item.avatarUrl ? (
                  <img
                    src={item.avatarUrl}
                    alt={item.author}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-full flex items-center justify-center text-[11px] font-bold text-white" style={{ backgroundColor: `hsl(${tint})` }}>
                    {item.author.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="text-[13px] font-semibold">{item.author}</div>
                  <div className="text-[12px] text-muted-foreground">{item.role}</div>
                </div>
              </div>
            </motion.div>
            );
          })}
        </div>
      </SiteContainer>
    </section>
  );
};

export default TestimonialsSection;