import { useEffect } from "react";
import { format, isSameDay } from "date-fns";
import { Link } from "react-router-dom";
import { MapPin, Calendar, Clock } from "lucide-react";
import PublicEventRenderer, {
  RendererEvent, RendererSpeaker, RendererSession, RendererSponsor,
} from "./PublicEventRenderer";
import type { EventPageConfig } from "./types";
import { mapsUrlFor } from "@/lib/utils";
import { surfaceTokens } from "@/lib/theme-contrast";

/**
 * Editorial magazine-style public event page.
 * Replaces the previous Lu.ma-inspired split layout with a full-bleed
 * cinematic banner, oversized display headline, and an asymmetric
 * content + sticky meta rail beneath. Respects the user's theme colors
 * and applies their selected typography.
 */

interface AttendeeSample { name: string | null; avatar_url: string | null }

interface Props {
  config: EventPageConfig;
  event: RendererEvent & { timezone?: string | null; requires_approval?: boolean | null };
  speakers: RendererSpeaker[];
  sessions: RendererSession[];
  sponsors: RendererSponsor[];
  org?: { name: string; logo_url: string | null; slug: string; subdomain?: string | null } | null;
  going?: { count: number; sample: AttendeeSample[] };
  previewMode?: boolean;
  darkMode?: boolean;
  registrationSlot?: React.ReactNode;
}

const initial = (n?: string | null) => (n || "?").trim().charAt(0).toUpperCase();

const DISPLAY = `var(--font-display, inherit)`;
const BODY = `var(--font-body, inherit)`;
const MONO = `"JetBrains Mono", ui-monospace, SFMono-Regular, monospace`;

export default function EventPagePreview({
  config, event, speakers, sessions, sponsors,
  org = null, going = { count: 0, sample: [] },
  previewMode = false, darkMode = false, registrationSlot,
}: Props) {
  const selectedFont = config.theme.fontFamily || "Inter";

  // Load Google Font dynamically when the theme fontFamily changes
  useEffect(() => {
    if (!config.theme.fontFamily) return;
    const fontName = config.theme.fontFamily.trim();
    const systemFonts = ["sans-serif", "serif", "monospace", "Arial", "Helvetica", "Times New Roman", "Courier New", "Inter"];
    if (systemFonts.includes(fontName)) return;

    const linkId = `google-font-${fontName.replace(/\s+/g, "-").toLowerCase()}`;
    if (document.getElementById(linkId)) return;

    const link = document.createElement("link");
    link.id = linkId;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@400;500;600;700;800&display=swap`;
    document.head.appendChild(link);
  }, [config.theme.fontFamily]);

  const startDate = new Date(event.date);
  const endDate = event.end_date ? new Date(event.end_date) : null;
  const accent = config.theme.primaryColor;
  const text = config.theme.textColor;
  const bg = config.theme.backgroundColor;

  const landscape = event.banner_landscape_url || null;
  const portrait = event.banner_portrait_url || landscape;
  const hasImage = !!(landscape || portrait);
  const surf = surfaceTokens(bg);

  // Honor section.enabled toggles for the parts of the page that this wrapper
  // renders directly (the cinematic banner, the meta rail, and the registration
  // card). PublicEventRenderer already handles the rest.
  const sectionEnabled = (id: string) => {
    const s = config.sections.find((sec) => sec.id === id);
    // Default to enabled when the section isn't present in the config at all
    // so legacy event pages without a full section list keep rendering.
    return s ? s.enabled !== false : true;
  };
  const showHero = sectionEnabled("hero");
  const showDateVenue = sectionEnabled("dateVenue");
  const showTickets = sectionEnabled("tickets");
  const showAbout = sectionEnabled("about");

  return (
    <div
      className="min-h-full w-full max-w-full overflow-x-hidden"
      style={{
        backgroundColor: bg,
        color: text,
        fontFamily: `"${selectedFont}", ui-sans-serif, system-ui, sans-serif`,
        ["--font-display" as any]: `"${selectedFont}", ui-sans-serif, system-ui, sans-serif`,
        ["--font-body" as any]: `"${selectedFont}", ui-sans-serif, system-ui, sans-serif`,
      }}
    >
      {/* ───────── Cinematic banner (only when an image is uploaded AND hero is enabled) ───────── */}
      {hasImage && showHero && (
        <header className="relative mx-auto w-full max-w-[1400px] px-5 sm:px-8 lg:px-20 pt-4 sm:pt-6 lg:pt-8">
          <div className="relative aspect-[4/5] md:aspect-[16/9] w-full overflow-hidden rounded-2xl sm:rounded-3xl">
            <picture>
              {portrait && <source media="(max-width: 767px)" srcSet={portrait} />}
              <img
                src={landscape ?? portrait ?? undefined}
                alt={event.title}
                className="absolute inset-0 w-full h-full object-cover"
                loading="eager"
              />
            </picture>

          </div>
        </header>
      )}

      {/* ───────── Title block (below banner, on page bg) ───────── */}
      {showHero && (
      <section className={`mx-auto w-full max-w-[1400px] px-5 sm:px-8 lg:px-20 ${hasImage ? "pt-8 sm:pt-12 lg:pt-16" : "pt-6 sm:pt-8 lg:pt-10"}`}>
        <h1
          className="font-bold tracking-[-0.02em] leading-[1.05] pb-1 break-words text-[clamp(2.5rem,8vw,7rem)]"
          style={{
            fontFamily: DISPLAY,
            color: text,
            zoom: (() => { const s = config.theme.titleScale ?? config.theme.fontScale; return s && s !== 1 ? s : undefined; })(),
          }}
        >
          {event.title}
        </h1>
      </section>
      )}

      {/* ───────── Body ───────── */}
      <div className="mx-auto w-full max-w-[1400px] px-5 sm:px-8 lg:px-20 pt-10 sm:pt-14 lg:pt-20 pb-10 sm:pb-14 lg:pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-x-20 lg:gap-y-16">
          {/* MAIN COLUMN */}
          <main className="min-w-0 lg:col-span-8 space-y-10 order-2 lg:order-1">
            {showAbout && (
            <section>
              <h2
                className="text-3xl sm:text-4xl lg:text-[44px] font-semibold tracking-[-0.02em] leading-[1.08] mb-7 lg:mb-9"
                style={{ fontFamily: DISPLAY, color: text }}
              >
                About this event
              </h2>
              {event.description ? (
                <p
                  className="mt-4 text-[16px] leading-[1.65] opacity-70 max-w-2xl whitespace-pre-line"
                  style={{ color: text }}
                >
                  {event.description}
                </p>
              ) : (
                <p className="mt-4 text-[16px] leading-[1.65] opacity-40 italic">No description added yet.</p>
              )}
            </section>
            )}

            {/* All other configured sections render inside the same left column,
                keeping the right rail truly aligned next to them. */}
            <div style={{ zoom: (() => { const s = config.theme.bodyScale; return s && s !== 1 ? s : undefined; })() }}>
              <PublicEventRenderer
                config={config}
                event={event}
                speakers={speakers}
                sessions={sessions}
                sponsors={sponsors}
                darkMode={darkMode}
                flushSections
                excludeIds={["about"]}
              />
            </div>
          </main>

          {/* RIGHT RAIL */}
          <aside className={`${previewMode ? "" : "lg:sticky lg:top-24"} lg:col-span-4 lg:self-start space-y-6 order-1 lg:order-2`}>
            {/* Registration — gated by the `tickets` section toggle */}
            {showTickets && (registrationSlot ?? (
              previewMode ? (
                <div
                  className="rounded-3xl p-6 border"
                  style={{ borderColor: `${text}1f`, backgroundColor: `${text}06` }}
                >
                  <div className="text-[11px] uppercase tracking-[0.2em] opacity-50 mb-2" style={{ fontFamily: MONO }}>
                    Registration
                  </div>
                  <div className="text-[14px] opacity-80">
                    Live registration card appears here for visitors.
                  </div>
                </div>
              ) : null
            ))}

            {/* Key meta — date + location, gated by the `dateVenue` section toggle */}
            {showDateVenue && (
            <div
              className="rounded-3xl border overflow-hidden"
              style={{ borderColor: surf.border, backgroundColor: surf.surface }}
            >
              <MetaRow
                icon={<Calendar className="h-4 w-4" />}
                label="Date"
                accent={accent} text={text} divider={surf.divider}
                value={endDate && !isSameDay(startDate, endDate) ? `${format(startDate, "MMM d, yyyy")} – ${format(endDate, "MMM d, yyyy")}` : format(startDate, "MMM d, yyyy")}
                sub={format(startDate, "EEEE")}
              />
              <MetaRow
                icon={<Clock className="h-4 w-4" />}
                label="Time"
                accent={accent} text={text} divider={surf.divider}
                value={`${format(startDate, "h:mm a")}${endDate ? ` – ${format(endDate, "h:mm a")}` : ""}`}
                sub={event.timezone ?? undefined}
              />
              <MetaRow
                icon={<MapPin className="h-4 w-4" />}
                label="Location"
                accent={accent} text={text} divider={surf.divider}
                value={event.venue || event.location || "Register to see address"}
                sub={event.venue && event.location ? event.location : event.requires_approval ? "Revealed after approval" : undefined}
                href={mapsUrlFor(event.venue, event.location) || undefined}
                last
              />
            </div>
            )}

            {/* Hosted by */}
            {org && (
              <div
                className="rounded-3xl border p-6"
                style={{ borderColor: surf.border, backgroundColor: surf.surface }}
              >
                <div className="text-[11px] uppercase tracking-[0.2em] opacity-50 mb-3" style={{ fontFamily: MONO }}>
                  Hosted by
                </div>
                {previewMode ? (
                  <div className="flex items-center gap-3">
                    <OrgAvatar org={org} />
                    <span className="text-[15px] font-semibold" style={{ fontFamily: DISPLAY }}>{org.name}</span>
                  </div>
                ) : (
                  <Link to={`/org/${org.subdomain || org.slug}`} className="flex items-center gap-3 group">
                    <OrgAvatar org={org} />
                    <span className="text-[15px] font-semibold group-hover:underline" style={{ fontFamily: DISPLAY }}>{org.name}</span>
                  </Link>
                )}
              </div>
            )}

            {/* Going */}
            {going.count > 0 && (
              <div
                className="rounded-3xl border p-6"
                style={{ borderColor: surf.border, backgroundColor: surf.surface }}
              >
                <div className="flex items-baseline justify-between mb-3">
                  <div className="text-[11px] uppercase tracking-[0.2em] opacity-50" style={{ fontFamily: MONO }}>
                    Attending
                  </div>
                  <div className="text-[22px] font-bold" style={{ fontFamily: DISPLAY, color: accent }}>
                    {going.count}
                  </div>
                </div>
                <div className="flex -space-x-2 mb-3">
                  {going.sample.slice(0, 6).map((a, i) =>
                    a.avatar_url ? (
                      <img
                        key={i}
                        src={a.avatar_url}
                        alt={a.name ?? ""}
                        className="size-8 rounded-full object-cover ring-2"
                        style={{ borderColor: bg, boxShadow: `0 0 0 2px ${bg}` }}
                      />
                    ) : (
                      <div
                        key={i}
                        className="size-8 rounded-full flex items-center justify-center text-[11px] font-semibold ring-2"
                        style={{ backgroundColor: `${text}15`, color: text, boxShadow: `0 0 0 2px ${bg}` }}
                      >
                        {initial(a.name)}
                      </div>
                    ),
                  )}
                </div>
                {going.sample.length > 0 && (
                  <p className="text-[12.5px] opacity-60 leading-snug">
                    {going.sample.slice(0, 2).map((a) => a.name).filter(Boolean).join(", ")}
                    {going.count > 2 && <> and {going.count - 2} other{going.count - 2 === 1 ? "" : "s"}</>}
                  </p>
                )}
              </div>
            )}

          </aside>
        </div>
      </div>
    </div>
  );
}

/* ───────── helpers ───────── */

function MetaRow({
  icon, label, value, sub, accent, text, last, href, divider,
}: {
  icon: React.ReactNode; label: string; value: string; sub?: string;
  accent: string; text: string; last?: boolean; href?: string; divider?: string;
}) {
  const inner = (
    <div
      className="flex items-start gap-4 px-5 py-4"
      style={last ? undefined : { borderBottom: `1px solid ${divider || `${text}14`}` }}
    >
      <div
        className="shrink-0 size-9 rounded-lg flex items-center justify-center"
        style={{ backgroundColor: `${accent}1a`, color: accent }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-[0.22em] opacity-50" style={{ fontFamily: MONO }}>
          {label}
        </div>
        <div className="text-[14px] font-semibold leading-tight mt-1 truncate" style={{ fontFamily: DISPLAY }}>
          {value}
          {href && <span className="ml-1.5 text-[11px] opacity-60 font-normal">↗</span>}
        </div>
        {sub && <div className="text-[12px] opacity-60 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title="Open in Maps"
        className="block hover:bg-foreground/5 transition-colors"
      >
        {inner}
      </a>
    );
  }
  return inner;
}

function HostChip({ org, interactive = false }: { org: { name: string; logo_url: string | null }; interactive?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[12.5px] font-medium backdrop-blur-md border ${interactive ? "hover:bg-white/10" : ""}`}
      style={{ borderColor: "rgba(255,255,255,0.18)", backgroundColor: "rgba(0,0,0,0.35)", color: "#fff" }}
    >
      {org.logo_url ? (
        <img src={org.logo_url} alt="" className="size-4 rounded-full object-cover" />
      ) : (
        <span className="size-4 rounded-full bg-white/20 flex items-center justify-center text-[9px] font-bold">
          {initial(org.name)}
        </span>
      )}
      <span className="opacity-70">Presented by</span>
      <span className="font-semibold">{org.name}</span>
    </span>
  );
}

function OrgAvatar({ org }: { org: { name: string; logo_url: string | null } }) {
  if (org.logo_url) {
    return <img src={org.logo_url} alt={org.name} className="size-9 rounded-full object-cover" />;
  }
  return (
    <div className="size-9 rounded-full bg-secondary flex items-center justify-center text-[13px] font-semibold">
      {initial(org.name)}
    </div>
  );
}