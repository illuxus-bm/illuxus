import { useEffect, useMemo, useState } from "react";
import { format, isSameDay } from "date-fns";
import {
  CalendarDays, MapPin, Mail, Phone, Twitter, Linkedin, Globe, Mic2,
  Building2, Ticket, Users, ExternalLink, ChevronRight,
} from "lucide-react";
import SponsorQuickViewDialog from "./sections/SponsorQuickViewDialog";
import SpeakerQuickViewDialog from "./sections/SpeakerQuickViewDialog";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatPriceOrFree } from "@/lib/currency";
import { sanitizeHtml } from "@/lib/sanitize-html";
import type {
  EventPageConfig, EventSection, ThemeConfig,
  HeroData, AboutData, DateVenueData, TicketsData, AgendaData, SpeakersData,
  SponsorsData, GalleryData, TestimonialsData, NetworkingData, CfpData, CountdownData, FaqData, ContactData,
  CustomHtmlData,
} from "./types";

// Removed catalog sections mapped to placeholder types
type WorkshopsData = any;
type ExhibitorsData = any;
type TravelData = any;
type CodeOfConductData = any;
type NewsletterData = any;
type PressData = any;
type PartnersData = any;
type LiveStreamData = any;

/**
 * Renders a saved EventPageConfig as a public-facing landing page.
 * The renderer is pure: it never reads from Supabase. The caller passes
 * `event`, `speakers`, `sessions`, `sponsors` from existing tables.
 *
 * Used both by the live public page (`PublicEventPage`) and by the in-app
 * preview pane in the form editor.
 */

/**
 * Pick a readable foreground color (near-black or near-white) for a given
 * background hex. Used so section headings stay visible regardless of which
 * theme preset the organizer chose.
 */
function readableOn(bg: string | undefined): string {
  if (!bg) return "#0a0a0a";
  const hex = bg.trim().replace("#", "");
  const full = hex.length === 3 ? hex.split("").map(c => c + c).join("") : hex;
  if (full.length !== 6) return "#0a0a0a";
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  // Relative luminance (sRGB approximation)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.55 ? "#0a0a0a" : "#fafafa";
}

export interface RendererEvent {
  id: string;
  slug?: string | null;
  title: string;
  description: string | null;
  date: string;
  end_date: string | null;
  venue: string | null;
  location: string | null;
  capacity: number | null;
  tickets_sold: number | null;
  price: number | null;
  currency?: string | null;
  image_url: string | null;
  banner_landscape_url?: string | null;
  banner_portrait_url?: string | null;
}
export interface RendererSpeaker {
  id: string;
  name: string;
  title: string | null;
  designation: string | null;
  company: string | null;
  bio: string | null;
  photo_url: string | null;
}
export interface RendererSession {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  session_type: string;
  location: string | null;
  speaker_id: string | null;
  speaker_ids?: string[];
}

export interface RendererSponsor {
  id: string;
  name: string;
  tier: string;
  tier_label: string | null;
  logo_url: string | null;
  website: string | null;
  description: string | null;
}

interface Props {
  config: EventPageConfig;
  event: RendererEvent;
  speakers: RendererSpeaker[];
  sessions: RendererSession[];
  sponsors: RendererSponsor[];
  darkMode?: boolean;
  /** Remove section side padding when rendering inside an already padded column. */
  flushSections?: boolean;
  /** Restrict rendering to specific section ids (e.g. ["about"]). */
  includeIds?: string[];
  /** Hide specific section ids from rendering. */
  excludeIds?: string[];
}

export default function PublicEventRenderer({
  config, event, speakers, sessions, sponsors, darkMode = false, flushSections = false, includeIds, excludeIds,
}: Props) {
  const theme = config.theme;

  // Load Google Font dynamically when the theme fontFamily changes
  useEffect(() => {
    if (!theme.fontFamily) return;
    const fontName = theme.fontFamily.trim();
    const systemFonts = ["sans-serif", "serif", "monospace", "Arial", "Helvetica", "Times New Roman", "Courier New", "Inter"];
    if (systemFonts.includes(fontName)) return;

    const linkId = `google-font-${fontName.replace(/\s+/g, "-").toLowerCase()}`;
    if (document.getElementById(linkId)) return;

    const link = document.createElement("link");
    link.id = linkId;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@400;500;600;700;800&display=swap`;
    document.head.appendChild(link);
  }, [theme.fontFamily]);
  const ordered = useMemo(
    () =>
      [...config.sections]
        // Hero is rendered by the page's editorial header; never duplicate it here.
        // Date & Venue + Tickets are rendered by the page's right rail; skip them too.
        .filter((s) => s.enabled && s.id !== "hero" && s.id !== "dateVenue" && s.id !== "tickets")
        .filter((s) => (includeIds ? includeIds.includes(s.id) : true))
        .filter((s) => (excludeIds ? !excludeIds.includes(s.id) : true))
        .sort((a, b) => a.order - b.order),
    [config.sections, includeIds, excludeIds],
  );

  return (
    <div
      style={{
        backgroundColor: theme.backgroundColor,
        color: theme.textColor,
        fontFamily: `${theme.fontFamily}, sans-serif`,
      }}
      className={`w-full ${flushSections ? "[&_section]:!px-0 [&_section]:!py-10 [&_section]:!border-t-0" : ""}`}
    >
      {ordered.map((section) => {
        const sectionTheme: ThemeConfig = section.themeOverride
          ? {
              ...theme,
              ...section.themeOverride,
              ...(darkMode ? { backgroundColor: theme.backgroundColor, textColor: theme.textColor } : {}),
            }
          : theme;
        const overridden = !!section.themeOverride && Object.keys(section.themeOverride).length > 0;
        // Wrap so font + bg/text overrides actually take effect at the section root.
        return (
          <div
            key={section.id}
            style={overridden ? {
              backgroundColor: sectionTheme.backgroundColor,
              color: sectionTheme.textColor,
              fontFamily: `${sectionTheme.fontFamily}, sans-serif`,
            } : undefined}
          >
            <SectionRenderer
              section={section}
              theme={sectionTheme}
              event={event}
              speakers={speakers}
              sessions={sessions}
              sponsors={sponsors}
              flushSections={flushSections}
            />
          </div>
        );
      })}
    </div>
  );
}

function SectionRenderer({
  section, theme, event, speakers, sessions, sponsors, flushSections,
}: {
  section: EventSection;
  theme: ThemeConfig;
  event: RendererEvent;
  speakers: RendererSpeaker[];
  sessions: RendererSession[];
  sponsors: RendererSponsor[];
  flushSections: boolean;
}) {
  switch (section.id as string) {
    case "hero":          return <HeroSec data={section.data as HeroData} theme={theme} event={event} />;
    case "about":         return <AboutSec data={section.data as AboutData} theme={theme} event={event} flush={flushSections} />;
    case "dateVenue":     return <DateVenueSec data={section.data as DateVenueData} theme={theme} event={event} />;
    case "tickets":       return <TicketsSec data={section.data as TicketsData} theme={theme} event={event} />;
    case "agenda":        return <AgendaSec data={section.data as AgendaData} theme={theme} sessions={sessions} speakers={speakers} />;
    case "schedule":      return <AgendaSec data={section.data as AgendaData} theme={theme} sessions={sessions} speakers={speakers} />;
    case "speakers":      return <SpeakersSec data={section.data as SpeakersData} theme={theme} speakers={speakers} />;
    case "sponsors":      return <SponsorsSec data={section.data as SponsorsData} theme={theme} sponsors={sponsors} />;
    case "workshops":     return <WorkshopsSec data={section.data as WorkshopsData} theme={theme} />;
    case "exhibitors":    return <ExhibitorsSec data={section.data as ExhibitorsData} theme={theme} />;
    case "travel":        return <TravelSec data={section.data as TravelData} theme={theme} />;
    case "codeOfConduct": return <CodeSec data={section.data as CodeOfConductData} theme={theme} />;
    case "gallery":       return <GallerySec data={section.data as GalleryData} theme={theme} />;
    case "testimonials":  return <TestimonialsSec data={section.data as TestimonialsData} theme={theme} />;
    case "newsletter":    return <NewsletterSec data={section.data as NewsletterData} theme={theme} />;
    case "press":         return <PressSec data={section.data as PressData} theme={theme} />;
    case "partners":      return <PartnersSec data={section.data as PartnersData} theme={theme} />;
    case "liveStream":    return <LiveStreamSec data={section.data as LiveStreamData} theme={theme} />;
    case "networking":    return <NetworkingSec data={section.data as NetworkingData} theme={theme} />;
    case "cfp":           return <CfpSec data={section.data as CfpData} theme={theme} />;
    case "countdown":     return <CountdownSec data={section.data as CountdownData} theme={theme} event={event} />;
    case "faq":           return <FaqSec data={section.data as FaqData} theme={theme} />;
    case "contact":       return null;
    case "customHtml":    return <CustomHtmlSec data={section.data as CustomHtmlData} />;
    default: return null;
  }
}

/* ─── Layout helpers ─── */

function Section({
  children, theme, tone = "default", id, flush = false,
}: {
  children: React.ReactNode;
  theme: ThemeConfig;
  tone?: "default" | "tinted" | "primary";
  id?: string;
  flush?: boolean;
}) {
  const bg =
    tone === "primary" ? theme.primaryColor :
    "transparent";
  // Clean centered editorial: comfortable measure, header above content,
  // subtle hairline between default sections, no sticky/overlap trickery.
  return (
    <section
      id={id}
      style={{ backgroundColor: bg, borderColor: `${theme.textColor}10` }}
      className={`w-full ${flush ? "px-0" : "px-5 sm:px-8 lg:px-20"} py-12 lg:py-16 ${tone === "default" ? "border-t" : ""}`}
    >
      <div className={flush ? "w-full" : "max-w-[1400px] mx-auto"}>{children}</div>
    </section>
  );
}

function SectionHeader({ eyebrow, title, intro, theme, align = "left" }: {
  eyebrow?: string;
  title?: string;
  intro?: string;
  theme: ThemeConfig;
  align?: "left" | "center";
}) {
  if (!title && !eyebrow && !intro) return null;
  const fg = readableOn(theme.backgroundColor);
  return (
    <header className={`mb-7 lg:mb-9 ${align === "center" ? "text-center" : ""}`}>
      {eyebrow && (
        <p
          className="text-[11px] font-semibold tracking-[0.22em] uppercase mb-3"
          style={{ color: theme.primaryColor }}
        >
          {eyebrow}
        </p>
      )}
      {title && (
        <h2
          className="text-3xl sm:text-4xl lg:text-[44px] font-semibold tracking-[-0.02em] leading-[1.08]"
          style={{ color: fg }}
        >
          {title}
        </h2>
      )}
      {intro && (
        <p
          className={`mt-4 text-[16px] leading-[1.65] opacity-80 max-w-2xl ${align === "center" ? "mx-auto" : ""}`}
          style={{ color: fg }}
        >
          {intro}
        </p>
      )}
    </header>
  );
}

/* ─── Sections ─── */

function HeroSec({ data, theme, event }: { data: HeroData; theme: ThemeConfig; event: RendererEvent }) {
  const venue = [event.venue, event.location].filter(Boolean).join(" · ");
  const bgImg = data.backgroundImage;
  return (
    <section
      className="relative px-4 sm:px-6 py-20 sm:py-28 overflow-hidden"
      style={{
        background: bgImg
          ? `linear-gradient(135deg, ${theme.primaryColor}cc, ${theme.primaryColor}99), url(${bgImg}) center/cover`
          : `linear-gradient(135deg, ${theme.primaryColor}, ${theme.accentColor})`,
        color: "#fff",
      }}
    >
      <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full opacity-15" style={{ backgroundColor: theme.accentColor }} />
      <div className="absolute -bottom-24 -left-16 h-56 w-56 rounded-full opacity-15" style={{ backgroundColor: "#fff" }} />
      <div className="relative max-w-3xl mx-auto text-center">
        {data.badge && (
          <span className="inline-block px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-widest mb-5"
                style={{ backgroundColor: "rgba(255,255,255,0.18)" }}>
            {data.badge}
          </span>
        )}
        <h1 className="text-4xl sm:text-6xl font-extrabold leading-[1.05] mb-4">
          {data.headline || event.title}
        </h1>
        {data.subheadline && (
          <p className="text-lg sm:text-xl opacity-90 max-w-2xl mx-auto">{data.subheadline}</p>
        )}
        <div className="flex flex-wrap justify-center gap-4 text-sm opacity-90 mt-6">
          {data.showDate !== false && (
            <span className="flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4" />
              {(() => {
                const s = new Date(event.date);
                const e = event.end_date ? new Date(event.end_date) : null;
                if (e && !isSameDay(s, e)) {
                  return `${format(s, "MMMM d, yyyy")} — ${format(e, "MMM d, yyyy")}`;
                }
                return format(s, "MMMM d, yyyy");
              })()}
            </span>
          )}
          {data.showVenue !== false && venue && (
            <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" />{venue}</span>
          )}
        </div>
        <div className="flex flex-wrap justify-center gap-3 mt-8">
          <a
            href={data.primaryCtaUrl || "#tickets"}
            className="px-7 py-3 rounded-xl font-semibold text-sm shadow-lg hover:scale-[1.02] transition-transform"
            style={{ backgroundColor: theme.accentColor, color: "#fff" }}
          >
            {data.primaryCtaText || "Register"}
          </a>
          {data.secondaryCtaText && (
            <a
              href={data.secondaryCtaUrl || "#about"}
              className="px-7 py-3 rounded-xl font-medium text-sm border border-white/30 hover:bg-white/10 transition-colors"
            >
              {data.secondaryCtaText}
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

function AboutSec({ data, theme, event, flush = false }: { data: AboutData; theme: ThemeConfig; event: RendererEvent; flush?: boolean }) {
  const body = data.body || event.description || "";
  return (
    <Section theme={theme} id="about" flush={flush}>
      <SectionHeader title={data.title} theme={theme} />
      {body && <p className="text-lg leading-relaxed opacity-80 whitespace-pre-line max-w-3xl">{body}</p>}
      {data.highlights && data.highlights.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8">
          {data.highlights.map((h, i) => (
            <div key={i} className="p-4 rounded-xl border" style={{ borderColor: `${theme.primaryColor}20` }}>
              <p className="text-2xl font-bold" style={{ color: theme.primaryColor }}>{h.value}</p>
              <p className="text-xs opacity-60 mt-1">{h.label}</p>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function DateVenueSec({ data, theme, event }: { data: DateVenueData; theme: ThemeConfig; event: RendererEvent }) {
  const fullVenue = [event.venue, event.location].filter(Boolean).join(", ");
  return (
    <Section theme={theme} tone="tinted" id="venue">
      <SectionHeader title={data.title} theme={theme} />
      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <Row icon={<CalendarDays className="h-4 w-4" />} theme={theme}
               label="When"
               value={(() => {
                 const s = new Date(event.date);
                 const e = event.end_date ? new Date(event.end_date) : null;
                 const base = format(s, "EEEE, MMMM d, yyyy 'at' h:mm a");
                 if (e && !isSameDay(s, e)) {
                   return `${base} — ${format(e, "MMM d, yyyy")}`;
                 }
                 return base;
               })()} />
          <Row icon={<MapPin className="h-4 w-4" />} theme={theme} label="Where" value={data.address || fullVenue || "TBA"} />
          {data.parkingNotes && <Row icon={<Building2 className="h-4 w-4" />} theme={theme} label="Parking" value={data.parkingNotes} />}
          {data.transitNotes && <Row icon={<Globe className="h-4 w-4" />} theme={theme} label="Transit" value={data.transitNotes} />}
        </div>
        {data.mapEmbedUrl && (
          <div className="rounded-xl overflow-hidden border aspect-[4/3]" style={{ borderColor: `${theme.primaryColor}20` }}>
            <iframe src={data.mapEmbedUrl} className="w-full h-full" title="Map" loading="lazy" />
          </div>
        )}
      </div>
    </Section>
  );
}

function Row({ icon, label, value, theme }: { icon: React.ReactNode; label: string; value: string; theme: ThemeConfig }) {
  return (
    <div className="flex gap-3">
      <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${theme.primaryColor}15`, color: theme.primaryColor }}>
        {icon}
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider opacity-50">{label}</p>
        <p className="text-sm">{value}</p>
      </div>
    </div>
  );
}

function TicketsSec({ data, theme, event }: { data: TicketsData; theme: ThemeConfig; event: RendererEvent }) {
  const tiers = data.tiers && data.tiers.length > 0
    ? data.tiers
    : [{ id: "default", name: "General Admission", price: formatPriceOrFree(event.price, event.currency || undefined), description: "" }];
  return (
    <Section theme={theme} id="tickets">
      <SectionHeader title={data.title} intro={data.intro} theme={theme} />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tiers.map((t) => (
          <div key={t.id} className="rounded-2xl border p-6 flex flex-col" style={{ borderColor: `${theme.primaryColor}25` }}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold">{t.name}</h3>
              {t.earlyBird && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded" style={{ backgroundColor: theme.accentColor, color: "#fff" }}>Early bird</span>
              )}
            </div>
            <p className="text-3xl font-extrabold" style={{ color: theme.primaryColor }}>{t.price}</p>
            {t.description && <p className="text-sm opacity-70 mt-2 flex-1">{t.description}</p>}
            <a
              href={t.url || "#"}
              className="mt-4 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold"
              style={{ backgroundColor: theme.primaryColor, color: "#fff" }}
            >
              Get ticket <ChevronRight className="h-3.5 w-3.5" />
            </a>
          </div>
        ))}
      </div>
    </Section>
  );
}

function AgendaSec({ data, theme, sessions, speakers }: {
  data: AgendaData; theme: ThemeConfig; sessions: RendererSession[]; speakers: RendererSpeaker[];
}) {
  const speakerById = useMemo(() => Object.fromEntries(speakers.map(s => [s.id, s])), [speakers]);
  const [selectedDay, setSelectedDay] = useState<string>("");
  // Group by day
  const byDay = useMemo(() => {
    const map = new Map<string, RendererSession[]>();
    for (const s of sessions) {
      const k = format(new Date(s.start_time), "yyyy-MM-dd");
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [sessions]);

  // Default selection = first day; update when sessions change.
  useEffect(() => {
    if (!byDay.length) { setSelectedDay(""); return; }
    setSelectedDay((cur) => (cur && byDay.some(([k]) => k === cur) ? cur : byDay[0][0]));
  }, [byDay]);

  // Deep-link: hash drives the active tab on mount + on hashchange.
  useEffect(() => {
    if (typeof window === "undefined" || !byDay.length) return;
    const apply = () => {
      const m = window.location.hash.match(/^#agenda-day-(.+)$/);
      if (!m) return;
      const day = m[1];
      if (byDay.some(([k]) => k === day)) {
        setSelectedDay(day);
        requestAnimationFrame(() => {
          const el = document.getElementById("agenda");
          el?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, [byDay]);

  const selectDay = (day: string) => {
    setSelectedDay(day);
    if (typeof window !== "undefined" && window.history?.pushState) {
      window.history.pushState(null, "", `#agenda-day-${day}`);
    }
  };

  const activeDay = byDay.find(([k]) => k === selectedDay) ?? byDay[0];

  return (
    <Section theme={theme} id="agenda">
      <SectionHeader title={data.title} intro={data.intro} theme={theme} />
      {sessions.length === 0 ? (
        <p className="text-sm opacity-50">Agenda coming soon.</p>
      ) : (
        <>
          {byDay.length > 1 && (
            <div role="tablist" className="flex flex-wrap gap-2 mb-6">
              {byDay.map(([day], i) => {
                const active = (activeDay?.[0]) === day;
                return (
                  <a
                    key={day}
                    role="tab"
                    aria-selected={active}
                    href={`#agenda-day-${day}`}
                    onClick={(e) => { e.preventDefault(); selectDay(day); }}
                    className="text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors"
                    style={{
                      borderColor: `${theme.primaryColor}40`,
                      backgroundColor: active ? theme.primaryColor : "transparent",
                      color: active ? "#fff" : theme.textColor,
                    }}
                  >
                    Day {i + 1} · {format(new Date(`${day}T00:00:00`), "MMM d")}
                  </a>
                );
              })}
            </div>
          )}
          {activeDay && (
            <div id={`agenda-day-${activeDay[0]}`} className="scroll-mt-24">
              <p className="text-sm font-semibold mb-3" style={{ color: theme.primaryColor }}>
                {format(new Date(activeDay[0]), "EEEE, MMMM d")}
              </p>
              <ol className="space-y-2">
                {activeDay[1].map((s) => {
                  const ids = (s.speaker_ids && s.speaker_ids.length ? s.speaker_ids : (s.speaker_id ? [s.speaker_id] : []));
                  const sps = ids.map((id) => speakerById[id]).filter(Boolean);
                  return (
                     <li key={s.id} className="flex flex-col sm:flex-row gap-1 sm:gap-4 p-4 rounded-xl border" style={{ borderColor: `${theme.primaryColor}15` }}>
                       <div className="text-sm font-semibold sm:whitespace-nowrap sm:w-24" style={{ color: theme.primaryColor }}>
                         {format(new Date(s.start_time), "h:mm a")}
                       </div>
                       <div className="flex-1 min-w-0">
                         <p className="font-semibold">{s.title}</p>
                         {s.description && <p className="text-sm opacity-70 mt-1 line-clamp-2">{s.description}</p>}
                         <div className="flex flex-wrap gap-2 mt-2 text-xs opacity-60">
                           <span className="capitalize">{s.session_type}</span>
                          {s.location && <><span>·</span><span>{s.location}</span></>}
                        </div>
                         {sps.length > 0 && (
                           <TooltipProvider delayDuration={150}>
                             <div className="flex items-center gap-1.5 mt-2.5">
                               {sps.map((sp) => (
                                 <UITooltip key={sp.id}>
                                   <TooltipTrigger asChild>
                                     <span
                                       title={sp.name}
                                       aria-label={sp.name}
                                       className="h-7 w-7 rounded-full overflow-hidden flex items-center justify-center text-[10px] font-bold ring-1 aspect-square shrink-0"
                                       style={{ backgroundColor: theme.primaryColor, color: "#fff", boxShadow: `0 0 0 1px ${theme.textColor}22 inset` }}
                                     >
                                       {sp.photo_url
                                         ? <img src={sp.photo_url} alt={sp.name} className="h-full w-full object-cover" />
                                         : sp.name.charAt(0).toUpperCase()}
                                     </span>
                                   </TooltipTrigger>
                                   <TooltipContent side="top" className="text-xs">{sp.name}</TooltipContent>
                                 </UITooltip>
                               ))}
                             </div>
                           </TooltipProvider>
                         )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </>
      )}
    </Section>
  );
}

function SpeakersSec({ data, theme, speakers }: { data: SpeakersData; theme: ThemeConfig; speakers: RendererSpeaker[] }) {
  // Cards are transparent — only a thin border separates them from the page
  // so the section blends with the surrounding background.
  const cardBorder = `${theme.textColor}1f`;
  const [selected, setSelected] = useState<RendererSpeaker | null>(null);
  return (
    <Section theme={theme} id="speakers">
      <SectionHeader title={data.title} intro={data.intro} theme={theme} />
      {speakers.length === 0 ? (
        <p className="text-sm opacity-50">Speakers will be announced soon.</p>
      ) : (
        <div className={data.layout === "list" ? "space-y-4" : "grid gap-5 sm:grid-cols-2"}>
          {speakers.map((sp) => (
            <button
              key={sp.id}
              type="button"
              onClick={() => setSelected(sp)}
              className="rounded-2xl p-5 border text-left w-full transition-transform hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              style={{ borderColor: cardBorder, backgroundColor: "transparent", color: theme.textColor }}
            >
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-full overflow-hidden flex items-center justify-center text-white font-bold shrink-0 aspect-square"
                     style={{ backgroundColor: theme.primaryColor }}>
                  {sp.photo_url ? <img src={sp.photo_url} alt={sp.name} className="h-full w-full object-cover" /> : sp.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold truncate">{sp.name}</p>
                  <p className="text-xs opacity-60 truncate">{[sp.designation, sp.company].filter(Boolean).join(" · ")}</p>
                </div>
              </div>
              {data.showBio !== false && sp.bio && (
                <p className="text-sm opacity-70 mt-3 line-clamp-3">{sp.bio}</p>
              )}
            </button>
          ))}
        </div>
      )}
      <SpeakerQuickViewDialog
        speaker={selected}
        open={!!selected}
        onOpenChange={(v) => { if (!v) setSelected(null); }}
      />
    </Section>
  );
}


function SponsorsSec({ data, theme, sponsors }: { data: SponsorsData; theme: ThemeConfig; sponsors: RendererSponsor[] }) {
  const [selected, setSelected] = useState<RendererSponsor | null>(null);
  const grouped = useMemo(() => {
    if (!data.groupByTier) return [["All", sponsors] as const];
    const map = new Map<string, RendererSponsor[]>();
    for (const s of sponsors) {
      const k = s.tier === "custom"
        ? `custom:${(s.tier_label || "Custom").toLowerCase()}`
        : (s.tier || "bronze").toLowerCase();
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    }
    // Preserve insertion order so the organizer's tier ordering (set via drag-and-drop) is respected.
    return Array.from(map.entries());
  }, [sponsors, data.groupByTier]);

  return (
    <Section theme={theme} id="sponsors">
      <SectionHeader title={data.title} intro={data.intro} theme={theme} />
      {sponsors.length === 0 ? (
        <p className="text-sm opacity-50">Sponsors will be announced soon.</p>
      ) : (
        <div className="space-y-8">
          {grouped.map(([tier, items]) => {
            const heading = tier.startsWith("custom:")
              ? (items[0]?.tier_label || "Custom")
              : tier;
            return (
            <div key={tier}>
              {data.groupByTier && (
                <div className="flex items-center gap-3 mb-4">
                  <span
                    className="text-sm font-bold uppercase tracking-[0.2em]"
                    style={{ color: theme.textColor }}
                  >
                    {heading}
                  </span>
                  <span
                    className="h-px flex-1"
                    style={{ backgroundColor: `${theme.textColor}26` }}
                  />
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                {items.map(sp => (
                  <button key={sp.id} type="button" onClick={() => setSelected(sp)}
                     className="aspect-[2/1] rounded-xl border flex items-center justify-center p-4 hover:scale-[1.02] transition-transform text-left"
                     style={{ borderColor: `${theme.textColor}1f`, backgroundColor: "transparent" }}>
                    {sp.logo_url
                      ? <img src={sp.logo_url} alt={sp.name} className="max-h-full max-w-full object-contain" />
                      : <span className="text-sm font-semibold text-center">{sp.name}</span>}
                  </button>
                ))}
              </div>
            </div>
          );})}
        </div>
      )}
      <SponsorQuickViewDialog sponsor={selected} open={!!selected} onOpenChange={(o) => !o && setSelected(null)} />
    </Section>
  );
}

function WorkshopsSec({ data, theme }: { data: WorkshopsData; theme: ThemeConfig }) {
  if (!data.workshops?.length) return null;
  return (
    <Section theme={theme} id="workshops">
      <SectionHeader title={data.title} intro={data.intro} theme={theme} />
      <div className="grid md:grid-cols-2 gap-4">
        {data.workshops.map(w => (
          <div key={w.id} className="rounded-xl border p-5" style={{ borderColor: `${theme.primaryColor}20` }}>
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold">{w.name}</h3>
              {w.price && <span className="text-sm font-bold" style={{ color: theme.primaryColor }}>{w.price}</span>}
            </div>
            {w.description && <p className="text-sm opacity-70 mt-2">{w.description}</p>}
            <div className="flex gap-3 text-xs opacity-60 mt-3">
              {w.facilitator && <span>By {w.facilitator}</span>}
              {w.duration && <span>· {w.duration}</span>}
            </div>
            {w.url && (
              <a href={w.url} className="inline-flex items-center gap-1 text-sm font-semibold mt-3" style={{ color: theme.primaryColor }}>
                Sign up <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

function ExhibitorsSec({ data, theme }: { data: ExhibitorsData; theme: ThemeConfig }) {
  if (!data.exhibitors?.length && !data.floorMapUrl) return null;
  return (
    <Section theme={theme} tone="tinted" id="exhibitors">
      <SectionHeader title={data.title} intro={data.intro} theme={theme} />
      {data.floorMapUrl && (
        <a href={data.floorMapUrl} target="_blank" rel="noreferrer"
           className="inline-flex items-center gap-1.5 text-sm font-semibold mb-6"
           style={{ color: theme.primaryColor }}>
          View floor map <ExternalLink className="h-3 w-3" />
        </a>
      )}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.exhibitors.map(e => (
          <div key={e.id} className="rounded-xl border p-4" style={{ borderColor: `${theme.primaryColor}15`, backgroundColor: "transparent" }}>
            <div className="flex items-center gap-3">
              {e.logoUrl
                ? <img src={e.logoUrl} alt={e.name} className="h-10 w-10 object-contain" />
                : <div className="h-10 w-10 rounded-lg flex items-center justify-center font-bold text-white" style={{ backgroundColor: theme.primaryColor }}>{e.name.charAt(0)}</div>}
              <div>
                <p className="font-semibold text-sm">{e.name}</p>
                {e.booth && <p className="text-xs opacity-60">Booth {e.booth}</p>}
              </div>
            </div>
            {e.description && <p className="text-xs opacity-70 mt-2">{e.description}</p>}
          </div>
        ))}
      </div>
    </Section>
  );
}

function TravelSec({ data, theme }: { data: TravelData; theme: ThemeConfig }) {
  return (
    <Section theme={theme} id="travel">
      <SectionHeader title={data.title} theme={theme} />
      {data.airportInfo && (
        <div className="mb-6">
          <p className="text-sm font-semibold mb-1">Getting here</p>
          <p className="text-sm opacity-70 whitespace-pre-line">{data.airportInfo}</p>
        </div>
      )}
      {data.hotels && data.hotels.length > 0 && (
        <div>
          <p className="text-sm font-semibold mb-2">Recommended hotels</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {data.hotels.map((h, i) => (
              <div key={i} className="rounded-xl border p-4" style={{ borderColor: `${theme.primaryColor}20` }}>
                <p className="font-semibold text-sm">{h.name}</p>
                {h.address && <p className="text-xs opacity-60 mt-1">{h.address}</p>}
                {h.discountCode && <p className="text-xs mt-2">Code: <span className="font-mono font-bold" style={{ color: theme.primaryColor }}>{h.discountCode}</span></p>}
                {h.url && <a href={h.url} className="text-xs font-semibold mt-2 inline-block" style={{ color: theme.primaryColor }}>Book →</a>}
              </div>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

function CodeSec({ data, theme }: { data: CodeOfConductData; theme: ThemeConfig }) {
  return (
    <Section theme={theme} tone="tinted" id="code-of-conduct">
      <SectionHeader title={data.title} theme={theme} />
      {data.body && <p className="text-sm opacity-80 whitespace-pre-line max-w-3xl">{data.body}</p>}
    </Section>
  );
}

function GallerySec({ data, theme }: { data: GalleryData; theme: ThemeConfig }) {
  if (!data.items?.length) return null;
  return (
    <Section theme={theme} id="gallery">
      <SectionHeader title={data.title} theme={theme} />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {data.items.map(it => (
          <figure key={it.id} className="aspect-square rounded-lg overflow-hidden">
            <img src={it.url} alt={it.caption || ""} className="w-full h-full object-cover" loading="lazy" />
          </figure>
        ))}
      </div>
    </Section>
  );
}

function TestimonialsSec({ data, theme }: { data: TestimonialsData; theme: ThemeConfig }) {
  if (!data.testimonials?.length) return null;
  return (
    <Section theme={theme} tone="tinted" id="testimonials">
      <SectionHeader title={data.title} theme={theme} />
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.testimonials.map(t => (
          <blockquote key={t.id} className="p-6 rounded-2xl border" style={{ borderColor: `${theme.primaryColor}15`, backgroundColor: "transparent" }}>
            <p className="text-base italic">"{t.quote}"</p>
            <footer className="mt-3 text-sm">
              <span className="font-semibold">{t.author}</span>
              {t.role && <span className="opacity-60"> — {t.role}</span>}
            </footer>
          </blockquote>
        ))}
      </div>
    </Section>
  );
}

function NewsletterSec({ data, theme }: { data: NewsletterData; theme: ThemeConfig }) {
  return (
    <Section theme={theme} id="newsletter">
      <div className="max-w-xl mx-auto text-center">
        <SectionHeader title={data.title} intro={data.description} theme={theme} align="center" />
        <form className="flex gap-2 max-w-md mx-auto" onSubmit={(e) => { e.preventDefault(); alert(data.successMessage || "Thanks!"); }}>
          <input type="email" required placeholder="you@example.com"
                 className="flex-1 px-4 py-2.5 rounded-lg border text-sm bg-transparent"
                 style={{ borderColor: `${theme.primaryColor}30`, color: theme.textColor }} />
          <button type="submit" className="px-5 py-2.5 rounded-lg font-semibold text-sm"
                  style={{ backgroundColor: theme.primaryColor, color: "#fff" }}>
            {data.buttonText || "Subscribe"}
          </button>
        </form>
      </div>
    </Section>
  );
}

function PressSec({ data, theme }: { data: PressData; theme: ThemeConfig }) {
  return (
    <Section theme={theme} id="press">
      <SectionHeader title={data.title} theme={theme} />
      {data.body && <p className="text-sm opacity-80 whitespace-pre-line max-w-3xl">{data.body}</p>}
      <div className="flex flex-wrap gap-3 mt-5">
        {data.pressKitUrl && (
          <a href={data.pressKitUrl} target="_blank" rel="noreferrer"
             className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg font-semibold text-sm border"
             style={{ borderColor: theme.primaryColor, color: theme.primaryColor }}>
            Download press kit <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {data.contactEmail && (
          <a href={`mailto:${data.contactEmail}`}
             className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg font-semibold text-sm"
             style={{ backgroundColor: theme.primaryColor, color: "#fff" }}>
            <Mail className="h-3.5 w-3.5" /> Press contact
          </a>
        )}
      </div>
    </Section>
  );
}

function PartnersSec({ data, theme }: { data: PartnersData; theme: ThemeConfig }) {
  if (!data.partners?.length) return null;
  return (
    <Section theme={theme} tone="tinted" id="partners">
      <SectionHeader title={data.title} intro={data.intro} theme={theme} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {data.partners.map(p => (
          <a key={p.id} href={p.website || "#"} target="_blank" rel="noreferrer"
             className="aspect-[3/2] rounded-xl border flex items-center justify-center p-4"
             style={{ borderColor: `${theme.textColor}1f`, backgroundColor: "transparent" }}>
            {p.logoUrl
              ? <img src={p.logoUrl} alt={p.name} className="max-h-full max-w-full object-contain" />
              : <span className="text-sm font-semibold text-center">{p.name}</span>}
          </a>
        ))}
      </div>
    </Section>
  );
}

function LiveStreamSec({ data, theme }: { data: LiveStreamData; theme: ThemeConfig }) {
  if (!data.embedUrl) return null;
  return (
    <Section theme={theme} id="live">
      <SectionHeader title={data.title} intro={data.description} theme={theme} />
      <div className="aspect-video rounded-xl overflow-hidden border" style={{ borderColor: `${theme.primaryColor}20` }}>
        <iframe src={data.embedUrl} className="w-full h-full" allowFullScreen title="Live stream" />
      </div>
    </Section>
  );
}

function NetworkingSec({ data, theme }: { data: NetworkingData; theme: ThemeConfig }) {
  const links = [
    { label: "Slack", url: data.slackUrl },
    { label: "Discord", url: data.discordUrl },
    { label: "Telegram", url: data.telegramUrl },
  ].filter(l => l.url);
  if (!data.description && links.length === 0) return null;
  return (
    <Section theme={theme} tone="tinted" id="networking">
      <SectionHeader title={data.title} intro={data.description} theme={theme} />
      <div className="flex flex-wrap gap-3">
        {links.map(l => (
          <a key={l.label} href={l.url} target="_blank" rel="noreferrer"
             className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg font-semibold text-sm"
             style={{ backgroundColor: theme.primaryColor, color: "#fff" }}>
            <Users className="h-3.5 w-3.5" /> Join {l.label}
          </a>
        ))}
      </div>
    </Section>
  );
}

function CfpSec({ data, theme }: { data: CfpData; theme: ThemeConfig }) {
  return (
    <Section theme={theme} id="cfp">
      <SectionHeader title={data.title} intro={data.description} theme={theme} />
      {data.deadline && <p className="text-sm opacity-70">Submission deadline: <span className="font-semibold">{data.deadline}</span></p>}
      {data.guidelines && <p className="text-sm opacity-80 whitespace-pre-line mt-3 max-w-3xl">{data.guidelines}</p>}
      {data.submitUrl && (
        <a href={data.submitUrl} target="_blank" rel="noreferrer"
           className="mt-5 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg font-semibold text-sm"
           style={{ backgroundColor: theme.accentColor, color: "#fff" }}>
          <Mic2 className="h-3.5 w-3.5" /> Submit a talk
        </a>
      )}
    </Section>
  );
}

function CountdownSec({ data, theme, event }: { data: CountdownData; theme: ThemeConfig; event: RendererEvent }) {
  // Resolve target & end timestamps once per data change.
  const targetMs = useMemo(() => {
    const raw = data.targetDate || event.date;
    if (!raw) return NaN;
    const t = new Date(raw).getTime();
    return Number.isFinite(t) ? t : NaN;
  }, [data.targetDate, event.date]);

  const endMs = useMemo(() => {
    const raw = (event as RendererEvent & { end_date?: string | null }).end_date ?? null;
    if (!raw) return null;
    const t = new Date(raw).getTime();
    return Number.isFinite(t) ? t : null;
  }, [event]);

  // Tick every second while the countdown is in the future. We stop the
  // interval once the target has passed so we don't keep re-rendering for
  // events that are live or already finished.
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!Number.isFinite(targetMs)) return;
    if (now >= targetMs) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [now, targetMs]);

  // Don't render the section at all when the target is unknown.
  if (!Number.isFinite(targetMs)) return null;

  const remainingMs = Math.max(0, targetMs - now);
  const hasStarted = now >= targetMs;
  const hasEnded = endMs !== null && now >= endMs;

  const title = data.title || "Starts in";
  const stateMessage = (label: string, body: string) => (
    <Section theme={theme} tone="tinted" id="countdown">
      <div className="text-center">
        {data.title && (
          <p
            className="text-[11px] font-semibold tracking-[0.22em] uppercase mb-3"
            style={{ color: theme.primaryColor }}
          >
            {data.title}
          </p>
        )}
        <p
          className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight"
          style={{ color: theme.textColor }}
        >
          {label}
        </p>
        <p className="text-sm sm:text-base opacity-70 mt-2" style={{ color: theme.textColor }}>
          {body}
        </p>
      </div>
    </Section>
  );

  if (hasEnded) return stateMessage("This event has ended", "Thanks for joining us — see you next time.");
  if (hasStarted) return stateMessage("Live now", `${event.title} is happening right now.`);

  // Decompose remaining ms into days / hours / minutes / seconds.
  const totalSec = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSec / 86_400);
  const hours = Math.floor((totalSec % 86_400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  // Static label for screen readers.
  const srLabel = `${days} days, ${hours} hours, ${minutes} minutes, ${seconds} seconds until ${event.title}`;

  const cells: { value: number; label: string }[] = [
    { value: days,    label: days === 1 ? "Day" : "Days" },
    { value: hours,   label: "Hours" },
    { value: minutes, label: "Minutes" },
    { value: seconds, label: "Seconds" },
  ];

  return (
    <Section theme={theme} tone="tinted" id="countdown">
      <div className="max-w-3xl mx-auto text-left">
        <p
          className="text-xs sm:text-sm font-semibold tracking-[0.2em] uppercase mb-4"
          style={{ color: theme.primaryColor }}
        >
          {title}
        </p>
        <div
          role="timer"
          aria-live="off"
          aria-label={srLabel}
          // 4 cells in a single row across all breakpoints; uses fluid
          // gap + clamp()-style font sizing to stay readable from 320px
          // viewports up to 1400px+ without horizontal scroll.
          className="grid grid-cols-4 gap-2 sm:gap-3 md:gap-4 max-w-3xl mb-4"
        >
          {cells.map((cell) => (
            <div
              key={cell.label}
              className="rounded-xl sm:rounded-2xl py-3 px-1 sm:py-4 sm:px-2 md:py-6 border min-w-0"
              style={{
                backgroundColor: `${theme.primaryColor}0D`,
                borderColor: `${theme.primaryColor}26`,
              }}
            >
              <p
                className="font-extrabold font-mono tabular-nums leading-none"
                style={{
                  color: theme.primaryColor,
                  fontSize: "clamp(1.5rem, 7vw, 3.25rem)",
                }}
              >
                {String(cell.value).padStart(2, "0")}
              </p>
              <p
                className="text-[9px] sm:text-[10px] md:text-[11px] uppercase tracking-widest mt-1.5 sm:mt-2 truncate"
                style={{ color: theme.textColor, opacity: 0.6 }}
              >
                {cell.label}
              </p>
            </div>
          ))}
        </div>
        <p
          className="text-lg sm:text-xl opacity-80 mt-4 animate-fade-in"
          style={{ color: theme.textColor }}
        >
          until <span className="font-semibold text-xl sm:text-2xl" style={{ color: theme.textColor }}>{event.title}</span>
        </p>
      </div>
    </Section>
  );
}

function FaqSec({ data, theme }: { data: FaqData; theme: ThemeConfig }) {
  if (!data.items?.length) return null;
  return (
    <Section theme={theme} id="faq">
      <SectionHeader title={data.title} theme={theme} />
      <div className="space-y-2 max-w-3xl">
        {data.items.map(item => (
          <details key={item.id} className="rounded-xl border p-4" style={{ borderColor: `${theme.primaryColor}20` }}>
            <summary className="cursor-pointer font-semibold text-sm">{item.question}</summary>
            <p className="text-sm opacity-70 mt-2 whitespace-pre-line">{item.answer}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}

function ContactSec({ data, theme }: { data: ContactData; theme: ThemeConfig }) {
  const items = [
    data.email && { icon: <Mail className="h-4 w-4" />, label: data.email, url: `mailto:${data.email}` },
    data.phone && { icon: <Phone className="h-4 w-4" />, label: data.phone, url: `tel:${data.phone}` },
    data.twitter && { icon: <Twitter className="h-4 w-4" />, label: data.twitter, url: data.twitter.startsWith("http") ? data.twitter : `https://twitter.com/${data.twitter.replace(/^@/, "")}` },
    data.linkedin && { icon: <Linkedin className="h-4 w-4" />, label: "LinkedIn", url: data.linkedin },
    data.website && { icon: <Globe className="h-4 w-4" />, label: data.website, url: data.website },
  ].filter(Boolean) as { icon: React.ReactNode; label: string; url: string }[];
  return (
    <Section theme={theme} tone="tinted" id="contact">
      <SectionHeader title={data.title} theme={theme} />
      {data.organizerName && <p className="text-base font-semibold mb-3">{data.organizerName}</p>}
      <div className="flex flex-wrap gap-3">
        {items.map((it, i) => (
          <a key={i} href={it.url} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm hover:bg-black/[0.02]"
             style={{ borderColor: `${theme.primaryColor}20` }}>
            <span style={{ color: theme.primaryColor }}>{it.icon}</span>
            {it.label}
          </a>
        ))}
      </div>
    </Section>
  );
}

/**
 * Custom HTML — rendered with DOMPurify-backed sanitization. See
 * src/lib/sanitize-html.ts for the policy: a strict tag + attribute
 * allow-list, http(s)/mailto/tel/anchor URLs only, target="_blank"
 * links auto-get rel="noopener noreferrer".
 */
function CustomHtmlSec({ data }: { data: CustomHtmlData }) {
  if (!data.html) return null;
  return (
    <section className="px-4 sm:px-6 py-10">
      <div className="max-w-5xl mx-auto" dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.html) }} />
    </section>
  );
}