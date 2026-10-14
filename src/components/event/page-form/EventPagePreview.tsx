import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { format, isSameDay } from "date-fns";
import { Link } from "react-router-dom";
import { Calendar, MapPin, Share2 } from "lucide-react";
import PublicEventRenderer, {
  RendererEvent, RendererSpeaker, RendererSession, RendererSponsor,
} from "./PublicEventRenderer";
import type { CountdownData, EventPageConfig, HeroData } from "./types";
import { mapsUrlFor } from "@/lib/utils";
import { surfaceTokens } from "@/lib/theme-contrast";
import { renderRichText } from "@/lib/markdown";

/**
 * The public event page.
 *
 * Banner in a page column (portrait art on phones, landscape from tablet
 * up), then the title block. From desktop up a sticky sidebar holds
 * registration, date and venue, the countdown and the host; the main column
 * has a sticky section bar, About and the organiser's configured sections.
 * On tablet the sidebar sits between the title and the content as a
 * two-column block; on phones everything stacks. Colours and fonts come
 * from the organiser's theme.
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
const MONO = `"JetBrains Mono", ui-monospace, SFMono-Regular, monospace`;
/** The page column: 1200px wide at most, with the gutter for each width. */
const WRAP = "mx-auto w-full max-w-[1200px] px-4 md:px-8 lg:px-10";
/** Below the sticky site header, with room to breathe. */
const STICKY_TOP = "calc(var(--app-header-h, 4.5rem) + 1.5rem)";

export default function EventPagePreview({
  config, event, speakers, sessions, sponsors,
  org = null, going = { count: 0, sample: [] },
  previewMode = false, darkMode = false, registrationSlot,
}: Props) {
  const selectedFont = config.theme.fontFamily || "Poppins";

  // Load Google Font dynamically when the theme fontFamily changes
  useEffect(() => {
    if (!config.theme.fontFamily) return;
    const fontName = config.theme.fontFamily.trim();
    const systemFonts = ["sans-serif", "serif", "monospace", "Arial", "Helvetica", "Times New Roman", "Courier New", "Inter", "Poppins"];
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
  const line = `${text}1a`;
  const tint = `${accent}14`;

  const landscape = event.banner_landscape_url || null;
  const portrait = event.banner_portrait_url || landscape;
  const hasImage = !!(landscape || portrait);
  const surf = surfaceTokens(bg);

  // Honor section.enabled toggles for the parts this wrapper renders
  // directly (banner, title, sidebar, About). PublicEventRenderer handles
  // the rest.
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
  const countdownSection = config.sections.find((sec) => sec.id === "countdown" && sec.enabled);
  const hasRegistration = showTickets && (!!registrationSlot || previewMode);
  const bodyZoom = (() => { const s = config.theme.bodyScale; return s && s !== 1 ? s : undefined; })();

  const hero = (config.sections.find((sec) => sec.id === "hero")?.data ?? {}) as HeroData;
  // The About section's highlights render here, with the event description,
  // since PublicEventRenderer is told to skip About.
  const aboutSection = config.sections.find((sec) => sec.id === "about");
  const aboutHighlights = ((aboutSection?.data as { highlights?: { label: string; value: string }[] } | undefined)
    ?.highlights ?? []).filter((h) => (h.value || "").trim() || (h.label || "").trim());

  const orgHref = org && (org.subdomain || org.slug) ? `/org/${org.subdomain || org.slug}` : null;
  const multiDay = !!endDate && !isSameDay(startDate, endDate);
  const dateLine = multiDay
    ? `${format(startDate, "EEEE, d MMMM")} – ${format(endDate!, "EEEE, d MMMM yyyy")}`
    : format(startDate, "EEEE, d MMMM yyyy");
  const timeLine = `${format(startDate, "h:mm a")}${endDate ? ` – ${format(endDate, "h:mm a")}` : ""}${event.timezone ? ` · ${event.timezone}` : ""}`;
  const mapsHref = mapsUrlFor(event.venue, event.location);

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: event.title, url });
      else await navigator.clipboard.writeText(url);
    } catch { /* dismissed */ }
  };

  const OrgMark = ({ size }: { size: number }) =>
    org?.logo_url ? (
      <img src={org.logo_url} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
    ) : (
      <span
        className="flex shrink-0 items-center justify-center rounded-full font-semibold"
        style={{ width: size, height: size, backgroundColor: accent, color: "#fff", fontSize: size * 0.36 }}
      >
        {initial(org?.name)}
      </span>
    );

  return (
    <div
      className="min-h-full w-full max-w-full overflow-x-clip"
      style={{
        backgroundColor: bg,
        color: text,
        fontFamily: `"${selectedFont}", ui-sans-serif, system-ui, sans-serif`,
        ["--font-display" as never]: `"${selectedFont}", ui-sans-serif, system-ui, sans-serif`,
        ["--font-body" as never]: `"${selectedFont}", ui-sans-serif, system-ui, sans-serif`,
      }}
    >
      <div className={`${WRAP} pb-12`}>
        {/* ───────── Banner ───────── */}
        {hasImage && showHero && (
          <div className="mt-4 overflow-hidden rounded-[20px] md:mt-6 md:rounded-3xl lg:mt-8 lg:rounded-[28px]" style={{ backgroundColor: tint }}>
            <picture>
              {landscape && <source media="(min-width: 768px)" srcSet={landscape} />}
              <img src={portrait ?? landscape ?? undefined} alt={event.title} className="block h-auto w-full" loading="eager" />
            </picture>
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-6 lg:mt-10 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-x-12 lg:gap-y-0">
          {/* ───────── Title block ───────── */}
          {showHero && (
            <div className="min-w-0 lg:col-start-1">
              {hero.badge && (
                <span className="text-[11.5px] font-semibold uppercase tracking-[0.14em]" style={{ color: accent }}>
                  {hero.badge}
                </span>
              )}
              {config.theme.showEventTitle !== false && (
                <h1
                  className="mb-1.5 mt-2 text-[28px] font-bold leading-[1.18] tracking-[-0.02em] md:text-4xl lg:text-[44px] lg:tracking-[-0.025em]"
                  style={{
                    fontFamily: DISPLAY,
                    zoom: (() => { const s = config.theme.titleScale ?? config.theme.fontScale; return s && s !== 1 ? s : undefined; })(),
                  }}
                >
                  {event.title}
                </h1>
              )}
              {hero.subheadline && <p className="m-0 text-[15.5px] opacity-80 md:text-[17px] lg:text-[19px]">{hero.subheadline}</p>}
              <div className="mt-4 flex items-center gap-3">
                {org && (
                  <>
                    <OrgMark size={40} />
                    <div className="flex min-w-0 flex-1 flex-col leading-[1.35]">
                      <small className="text-[12px] opacity-60">Organised by</small>
                      {orgHref && !previewMode
                        ? <Link to={orgHref} className="truncate text-[15px] font-semibold hover:underline">{org.name}</Link>
                        : <b className="truncate text-[15px] font-semibold">{org.name}</b>}
                    </div>
                  </>
                )}
                <button
                  type="button"
                  onClick={share}
                  aria-label="Share event"
                  className={`${org ? "" : "ml-auto"} flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-colors hover:opacity-80`}
                  style={{ borderColor: line }}
                >
                  <Share2 className="h-[18px] w-[18px]" />
                </button>
              </div>
            </div>
          )}

          {/* ───────── Sidebar ─────────
              Phones: one column. Tablet: date/venue beside registration, the
              countdown full width below. Desktop: a sticky column on the right. */}
          <aside
            aria-label="Event details and registration"
            className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 md:items-start md:gap-4 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:flex lg:flex-col lg:items-stretch lg:self-start lg:gap-3.5 lg:[position:var(--side-pos)]"
            style={{ ["--side-pos" as never]: previewMode ? "static" : "sticky", top: STICKY_TOP }}
          >
            {hasRegistration && (
              <div id="register" className="min-w-0 md:col-start-2 md:row-start-1 lg:order-none">
                {registrationSlot ?? (
                  <div className="rounded-[20px] border p-5" style={{ borderColor: line }}>
                    <div className="text-[11.5px] font-semibold uppercase tracking-[0.14em] opacity-60" style={{ fontFamily: MONO }}>Registration</div>
                    <div className="mt-2 text-[14px] opacity-80">Live registration card appears here for visitors.</div>
                  </div>
                )}
              </div>
            )}

            {showDateVenue && (
              <div
                className={`min-w-0 overflow-hidden rounded-[20px] md:row-start-1 ${hasRegistration ? "md:col-start-1" : "md:col-span-2"}`}
                style={{ backgroundColor: surf.surface }}
              >
                <Fact icon={<Calendar className="h-5 w-5" />} tint={tint} accent={accent}>
                  <b className="text-[15px] font-semibold">{dateLine}</b>
                  <span className="text-[13px] opacity-60">{timeLine}</span>
                </Fact>
                <Fact icon={<MapPin className="h-5 w-5" />} tint={tint} accent={accent} divider={surf.divider}>
                  <b className="text-[15px] font-semibold">{event.venue || event.location || "Register to see address"}</b>
                  {event.venue && event.location
                    ? mapsHref
                      ? <a href={mapsHref} target="_blank" rel="noopener noreferrer" className="text-[13px] font-medium hover:underline" style={{ color: accent }}>{event.location} · Get directions</a>
                      : <span className="text-[13px] opacity-60">{event.location}</span>
                    : mapsHref
                      ? <a href={mapsHref} target="_blank" rel="noopener noreferrer" className="text-[13px] font-medium hover:underline" style={{ color: accent }}>Get directions</a>
                      : event.requires_approval ? <span className="text-[13px] opacity-60">Revealed after approval</span> : null}
                </Fact>
              </div>
            )}

            {countdownSection && (
              <SidebarCountdown
                data={countdownSection.data as CountdownData}
                fallbackDate={event.date}
                accent={accent}
                tint={tint}
                bg={bg}
              />
            )}

            {/* Host — desktop only; phones and tablets get it below the content. */}
            {org && (
              <div className="hidden items-center gap-3.5 rounded-[20px] border px-[18px] py-4 lg:flex" style={{ borderColor: line }}>
                <OrgMark size={40} />
                <div className="flex min-w-0 flex-1 flex-col leading-[1.35]">
                  <small className="text-[12px] opacity-60">Hosted by</small>
                  <b className="truncate text-[15.5px] font-semibold">{org.name}</b>
                </div>
                {orgHref && !previewMode && (
                  <Link to={orgHref} className="flex h-10 shrink-0 items-center rounded-xl px-4 text-[13.5px] font-semibold" style={{ backgroundColor: text, color: bg }}>
                    More events
                  </Link>
                )}
              </div>
            )}

            {going.count > 0 && <GoingCard going={going} accent={accent} text={text} bg={bg} line={line} />}
          </aside>

          {/* ───────── Main column ───────── */}
          <MainColumn
            showAbout={showAbout}
            description={event.description}
            highlights={aboutHighlights}
            accent={accent}
            tint={tint}
            text={text}
            bg={bg}
            line={line}
            sticky={!previewMode}
          >
            <div style={{ zoom: bodyZoom }}>
              <PublicEventRenderer
                config={config}
                event={event}
                speakers={speakers}
                sessions={sessions}
                sponsors={sponsors}
                darkMode={darkMode}
                flushSections
                excludeIds={["about", "countdown"]}
              />
            </div>

            {/* Host, below the content on phones and tablets. */}
            {org && (
              <div className="mt-9 flex flex-wrap items-center gap-4 rounded-[20px] p-5 md:flex-nowrap md:px-6 md:py-[22px] lg:hidden" style={{ backgroundColor: surf.surface }}>
                <OrgMark size={52} />
                <div className="flex min-w-0 flex-[1_1_160px] flex-col leading-[1.35]">
                  <small className="text-[12px] opacity-60">Hosted by</small>
                  <b className="truncate text-[17px] font-semibold">{org.name}</b>
                </div>
                {orgHref && !previewMode && (
                  <Link to={orgHref} className="flex h-11 flex-1 items-center justify-center rounded-xl px-5 text-[14.5px] font-semibold md:flex-none" style={{ backgroundColor: text, color: bg }}>
                    More events
                  </Link>
                )}
              </div>
            )}
          </MainColumn>
        </div>
      </div>
    </div>
  );
}

/* ───────── helpers ───────── */

function Fact({ icon, children, tint, accent, divider }: {
  icon: React.ReactNode; children: React.ReactNode; tint: string; accent: string; divider?: string;
}) {
  return (
    <div className="flex items-center gap-3.5 p-4" style={divider ? { borderTop: `1px solid ${divider}` } : undefined}>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]" style={{ backgroundColor: tint, color: accent }}>
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col leading-[1.4]">{children}</div>
    </div>
  );
}

/** "Starts in" days / hours / minutes / seconds; hidden once the start has passed. */
function SidebarCountdown({ data, fallbackDate, accent, tint, bg }: {
  data: CountdownData; fallbackDate: string; accent: string; tint: string; bg: string;
}) {
  const target = new Date(data.targetDate || fallbackDate).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (!Number.isFinite(target) || target <= now) return null;
  const diff = target - now;
  const pad = (n: number) => String(n).padStart(2, "0");
  const cells: [string, string][] = [
    [pad(Math.floor(diff / 86_400_000)), "Days"],
    [pad(Math.floor(diff / 3_600_000) % 24), "Hours"],
    [pad(Math.floor(diff / 60_000) % 60), "Min"],
    [pad(Math.floor(diff / 1000) % 60), "Sec"],
  ];
  return (
    <div
      className="min-w-0 rounded-[20px] border p-4 md:col-span-2 md:flex md:items-center md:justify-between md:gap-4 md:px-5 md:py-3.5 lg:block lg:px-[18px] lg:py-4"
      style={{ backgroundColor: tint, borderColor: `${accent}33` }}
    >
      <span className="text-[11.5px] font-semibold uppercase tracking-[0.14em]" style={{ color: accent }}>
        {data.title || "Starts in"}
      </span>
      <div role="timer" aria-live="off" className="mt-2.5 grid grid-cols-4 gap-2 md:mt-0 md:grid-cols-[repeat(4,96px)] lg:mt-2.5 lg:grid-cols-4">
        {cells.map(([value, label]) => (
          <div key={label} className="flex h-[72px] flex-col items-center justify-center rounded-[14px] md:h-16 lg:h-[72px]" style={{ backgroundColor: bg }}>
            <b className="text-2xl font-bold leading-[1.15] tabular-nums" style={{ color: accent }}>{value}</b>
            <span className="text-[10.5px] font-medium uppercase tracking-[0.1em] opacity-60">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GoingCard({ going, accent, text, bg, line }: {
  going: { count: number; sample: AttendeeSample[] }; accent: string; text: string; bg: string; line: string;
}) {
  return (
    <div className="min-w-0 rounded-[20px] border px-[18px] py-4 md:col-span-2 lg:col-span-1" style={{ borderColor: line }}>
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.14em] opacity-60">Attending</span>
        <span className="text-[22px] font-bold" style={{ fontFamily: DISPLAY, color: accent }}>{going.count}</span>
      </div>
      <div className="mb-3 flex -space-x-2">
        {going.sample.slice(0, 6).map((a, i) =>
          a.avatar_url ? (
            <img loading="lazy" decoding="async" key={i} src={a.avatar_url} alt={a.name ?? ""} className="size-8 rounded-full object-cover" style={{ boxShadow: `0 0 0 2px ${bg}` }} />
          ) : (
            <div key={i} className="flex size-8 items-center justify-center rounded-full text-[11px] font-semibold" style={{ backgroundColor: `${text}15`, boxShadow: `0 0 0 2px ${bg}` }}>
              {initial(a.name)}
            </div>
          ),
        )}
      </div>
      {going.sample.length > 0 && (
        <p className="text-[12.5px] leading-snug opacity-60">
          {going.sample.slice(0, 2).map((a) => a.name).filter(Boolean).join(", ")}
          {going.count > 2 && <> and {going.count - 2} other{going.count - 2 === 1 ? "" : "s"}</>}
        </p>
      )}
    </div>
  );
}

/**
 * The content column: a sticky bar of section links (built from the
 * sections actually on the page, and highlighting the one in view), About,
 * then the configured sections passed as children.
 */
function MainColumn({ showAbout, description, highlights, accent, tint, text, bg, line, sticky, children }: {
  showAbout: boolean;
  description: string | null;
  highlights: { label: string; value: string }[];
  accent: string; tint: string; text: string; bg: string; line: string;
  sticky: boolean;
  children: React.ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [links, setLinks] = useState<{ id: string; label: string }[]>([]);
  const [current, setCurrent] = useState<string | null>(null);

  // Collect the sections that rendered (each <section> with an id and a heading).
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const collect = () => {
      const found = Array.from(el.querySelectorAll<HTMLElement>("section[id]"))
        .map((s) => ({ id: s.id, label: s.querySelector("h2")?.textContent?.trim() || "" }))
        .filter((s) => s.label);
      setLinks((prev) => (prev.length === found.length && prev.every((p, i) => p.id === found[i].id && p.label === found[i].label) ? prev : found));
    };
    collect();
    const mo = new MutationObserver(collect);
    mo.observe(el, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);

  // Highlight the section under the bar.
  useEffect(() => {
    if (!links.length) return;
    const onScroll = () => {
      const y = 200;
      let hit = links[0].id;
      for (const l of links) {
        const top = document.getElementById(l.id)?.getBoundingClientRect().top ?? Infinity;
        if (top <= y) hit = l.id;
      }
      setCurrent(hit);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [links]);

  return (
    <div ref={root} className="min-w-0 lg:col-start-1">
      {links.length > 1 && (
        <nav
          aria-label="Page sections"
          className="z-20 -mx-4 flex gap-2 overflow-x-auto px-4 py-2.5 [scrollbar-width:none] md:-mx-8 md:px-8 lg:mx-0 lg:mt-7 lg:px-0 [&::-webkit-scrollbar]:hidden"
          style={{
            position: sticky ? "sticky" : "static",
            top: "var(--app-header-h, 4.5rem)",
            backgroundColor: `${bg}f5`,
            backdropFilter: "blur(12px)",
            borderBottom: `1px solid ${line}`,
          }}
        >
          {links.map((l) => {
            const on = l.id === current;
            return (
              <a
                key={l.id}
                href={`#${l.id}`}
                aria-current={on ? "true" : undefined}
                className="flex h-[38px] shrink-0 items-center rounded-full border px-4 text-[13.5px] transition-colors"
                style={on
                  ? { backgroundColor: text, borderColor: text, color: bg, fontWeight: 600 }
                  : { borderColor: line, fontWeight: 500 }}
              >
                {l.label}
              </a>
            );
          })}
        </nav>
      )}

      {showAbout && (
        <section id="about" className="scroll-mt-36 pt-9 md:pt-12">
          <h2 className="text-[23px] font-bold leading-[1.25] tracking-[-0.015em] md:text-[27px] lg:text-[29px]" style={{ fontFamily: DISPLAY }}>
            About this event
          </h2>
          <AboutBody description={description} accent={accent} />
          {highlights.length > 0 && (
            <div className="mt-[18px] grid grid-cols-1 gap-2.5 md:grid-cols-3">
              {highlights.map((h, i) => (
                <div key={i} className="flex gap-3.5 rounded-[18px] border p-4 md:flex-col md:gap-2.5" style={{ borderColor: line }}>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[13px] font-bold" style={{ backgroundColor: tint, color: accent }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    {h.value && <b className="mb-0.5 block text-[15px] font-semibold">{h.value}</b>}
                    {h.label && <span className="text-[13.5px] leading-[1.55] opacity-70">{h.label}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="[&_section]:scroll-mt-36">{children}</div>
    </div>
  );
}

/** The description, cut to a few lines with "Read more" when it runs long. */
function AboutBody({ description, accent }: { description: string | null; accent: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || open) return;
    setLong(el.scrollHeight > el.clientHeight + 4);
  }, [description, open]);

  if (!description) return <p className="mt-3.5 text-[15.5px] italic opacity-40">No description added yet.</p>;
  return (
    <>
      <div
        ref={ref}
        className={`prose prose-sm sm:prose-base dark:prose-invert mt-3.5 max-w-none leading-[1.7] opacity-90 ${open ? "" : "line-clamp-6"}`}
        style={{ color: "inherit" }}
        // renderRichText sanitises via DOMPurify before returning.
        dangerouslySetInnerHTML={{ __html: renderRichText(description) }}
      />
      {(long || open) && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="mt-1.5 inline-flex h-11 items-center text-[14px] font-semibold"
          style={{ color: accent }}
        >
          {open ? "Show less" : "Read more"}
        </button>
      )}
    </>
  );
}
