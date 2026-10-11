import {
  BarChart3,
  Bot,
  CalendarDays,
  Crown,
  Globe,
  Mail,
  Mic2,
  Rocket,
  ScanLine,
  Shield,
  Sparkles,
  Ticket,
  UserCheck,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useSiteContent } from "@/hooks/useSiteContent";
import { SiteContainer } from "@/components/layout/SiteContainer";
import { PosterTitle, Reveal, SectionChip } from "@/components/landing/primitives";
import { useTilt } from "@/components/landing/motion";

/** Icons the site editor can assign to a feature (see FEATURE_ICON_OPTIONS). */
const FEATURE_ICONS: Record<string, LucideIcon> = {
  CalendarDays,
  Ticket,
  Mic2,
  Users,
  BarChart3,
  Globe,
  Shield,
  Sparkles,
  Mail,
  ScanLine,
  Zap,
  Crown,
  Rocket,
};

function FeatureCard({
  index,
  title,
  description,
  icon,
}: {
  index: number;
  title: string;
  description: string;
  icon: string;
}) {
  const ref = useTilt<HTMLDivElement>(4);
  const Icon = FEATURE_ICONS[icon] ?? Zap;
  return (
    <div
      ref={ref}
      className="tilt group relative h-full rounded-2xl border border-border bg-card p-6 transition-colors duration-300 hover:border-accent/60"
    >
      <span className="poster absolute right-5 top-4 text-[30px] text-foreground/15 transition-colors duration-300 group-hover:text-accent">
        {String(index + 1).padStart(2, "0")}
      </span>
      <span className="grid h-11 w-11 place-items-center rounded-xl border border-accent/45 bg-accent/10 text-accent">
        <Icon className="h-5 w-5" strokeWidth={1.9} />
      </span>
      <h3 className="mt-5 text-[17px] font-bold leading-snug tracking-normal text-foreground">{title}</h3>
      <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

/** RSVP → Check-in → Follow-up, joined by a line that keeps flowing. */
function WorkflowStrip() {
  const nodes = [
    { icon: Ticket, label: "RSVP" },
    { icon: UserCheck, label: "Check-in" },
    { icon: Mail, label: "Follow-up" },
  ];
  return (
    <div className="relative mx-auto flex w-full max-w-[420px] items-center justify-between">
      <svg aria-hidden="true" className="absolute inset-x-6 top-7 h-px w-[calc(100%-3rem)] overflow-visible">
        <line
          x1="0"
          y1="0"
          x2="100%"
          y2="0"
          stroke="hsl(var(--accent))"
          strokeWidth="2"
          strokeDasharray="6 8"
          className="animate-sync-flow"
        />
      </svg>
      {nodes.map(({ icon: Icon, label }) => (
        <div key={label} className="relative flex flex-col items-center gap-2.5">
          <span className="grid h-14 w-14 place-items-center rounded-2xl border border-border bg-background text-foreground">
            <Icon className="h-5 w-5" strokeWidth={2} />
          </span>
          <span className="eyebrow !text-[10px] text-muted-foreground">{label}</span>
        </div>
      ))}
    </div>
  );
}

const FeaturesSection = () => {
  const { content } = useSiteContent();
  const f = content.features;

  return (
    <section id="features" className="relative scroll-mt-[var(--app-header-h)] py-24 md:py-32">
      <SiteContainer>
        <div className="max-w-3xl">
          <Reveal>{f.eyebrow && <SectionChip icon={Zap} label={f.eyebrow} />}</Reveal>
          <PosterTitle text={f.title} className="mt-5 text-[clamp(44px,7vw,96px)]" />
          {f.subtitle && (
            <Reveal index={1}>
              <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-muted-foreground sm:text-[18px] [text-wrap:pretty]">
                {f.subtitle}
              </p>
            </Reveal>
          )}
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {f.items.map((item, i) => (
            <Reveal key={`${item.title}-${i}`} index={i % 4} className="h-full">
              <FeatureCard index={i} title={item.title} description={item.description} icon={item.icon} />
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-4">
          <div className="grid items-center gap-10 rounded-2xl border border-border bg-card p-7 sm:p-10 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-accent/45 bg-accent/10 px-3 py-1 text-[12px] font-semibold text-accent">
                <Bot className="h-3.5 w-3.5" />
                Always-on
              </span>
              <h3 className="poster mt-4 text-[clamp(32px,4.4vw,56px)] text-foreground">
                The intelligent system that never sleeps
              </h3>
              <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
                Workflows trigger themselves the moment an attendee RSVPs, checks in, or leaves. No scripts to
                babysit, no cron jobs to maintain.
              </p>
            </div>
            <WorkflowStrip />
          </div>
        </Reveal>
      </SiteContainer>
    </section>
  );
};

export default FeaturesSection;
