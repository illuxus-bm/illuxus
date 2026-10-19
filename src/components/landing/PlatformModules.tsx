import {
  Award,
  BookOpen,
  Building2,
  Code2,
  LayoutTemplate,
  Link2,
  Smartphone,
  Users,
  type LucideIcon,
} from "lucide-react";
import { SiteContainer } from "@/components/layout/SiteContainer";
import { PillLink, PosterTitle, Reveal, SectionChip } from "@/components/landing/primitives";

/**
 * Modules beyond the core event workflow. Kept in code rather than the site
 * editor so a shipped module always shows up; only list what exists in the app.
 */
export const PLATFORM_MODULES: Array<{ icon: LucideIcon; title: string; description: string }> = [
  {
    icon: LayoutTemplate,
    title: "Creative studio",
    description:
      "Canva-style editor for speaker, sponsor and promo posts in every social size, with AI-drafted copy and backgrounds.",
  },
  {
    icon: BookOpen,
    title: "Brochure builder",
    description: "Multi-page event brochures in several layouts, edited directly on the page and exported as PDF.",
  },
  {
    icon: Award,
    title: "Certificates",
    description: "Design certificates, issue them to attendees in bulk, and let anyone verify one from its public link.",
  },
  {
    icon: Users,
    title: "Communities",
    description: "Keep attendees together after the event: feed, chat, calendar, resources, leaderboard and moderation.",
  },
  {
    icon: Building2,
    title: "Venue sourcing",
    description: "Shortlist venues, request the services you need, and track each venue's reply from the event workspace.",
  },
  {
    icon: Link2,
    title: "Partner & UTM links",
    description: "Tracked links for every partner and channel, with dashboards partners can open without an account.",
  },
  {
    icon: Code2,
    title: "Website widget",
    description: "Show your upcoming events on your own site with one script tag — it updates as you publish.",
  },
  {
    icon: Smartphone,
    title: "Installable app",
    description: "Add illuxus to a phone or desktop home screen and run check-in from it like a native app.",
  },
];

export function PlatformModules() {
  return (
    <section id="platform" className="relative scroll-mt-[var(--app-header-h)] border-t border-border py-24 md:py-32">
      <SiteContainer>
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl">
            <Reveal>
              <SectionChip icon={LayoutTemplate} label="Beyond the basics" />
            </Reveal>
            <PosterTitle text="One workspace for the whole event" className="mt-5 text-[clamp(40px,6vw,84px)]" />
            <Reveal index={1}>
              <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-muted-foreground sm:text-[18px]">
                The marketing assets, documents and follow-up that usually live in five other tools are built in.
              </p>
            </Reveal>
          </div>
          <Reveal index={2}>
            <PillLink href="/features" variant="outline" size="md" arrow>
              See every feature
            </PillLink>
          </Reveal>
        </div>

        <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLATFORM_MODULES.map(({ icon: Icon, title, description }, i) => (
            <Reveal as="li" key={title} index={i % 4} className="h-full">
              <div className="h-full rounded-2xl border border-border bg-card p-6 transition-colors duration-300 hover:border-accent/60">
                <span className="grid h-11 w-11 place-items-center rounded-xl border border-accent/45 bg-accent/10 text-accent">
                  <Icon className="h-5 w-5" strokeWidth={1.9} aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-[17px] font-bold leading-snug text-foreground">{title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{description}</p>
              </div>
            </Reveal>
          ))}
        </ul>
      </SiteContainer>
    </section>
  );
}

export default PlatformModules;
