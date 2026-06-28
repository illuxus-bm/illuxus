import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { supabaseRpc } from "@/lib/observability";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CalendarDays,
  Clock,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List as ListIcon,
  Search,
} from "lucide-react";
import { format, isSameDay, startOfMonth, endOfMonth, addMonths, subMonths, isToday, isTomorrow } from "date-fns";
import type { ThemeConfig, PageBuilderState } from "@/components/event/page-builder/types";
import PreviewHostBanner from "@/components/PreviewHostBanner";
import { useAuth } from "@/contexts/AuthContext";
import EventCardLuma from "@/components/EventCardLuma";
import OrgSubscribeButton from "@/components/OrgSubscribeButton";
import SiteHeader from "@/components/SiteHeader";
import { useTheme } from "@/contexts/ThemeContext";

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  subdomain: string | null;
  custom_domain: string | null;
  logo_url: string | null;
  landing_config: any;
  landing_published: boolean;
}

interface EventRow {
  id: string;
  slug: string | null;
  title: string;
  description: string | null;
  date: string;
  end_date: string | null;
  venue: string | null;
  location: string | null;
  image_url: string | null;
  price: number | null;
}

const defaultTheme: ThemeConfig = {
  primaryColor: "#0f172a",
  secondaryColor: "#1e293b",
  backgroundColor: "#ffffff",
  textColor: "#0f172a",
  accentColor: "#6366f1",
  fontFamily: "Poppins",
};

interface ExtendedConfig extends PageBuilderState {
  cover?: string;
  bio?: string;
  accentLink?: { label?: string; url?: string };
}

/**
 * Renders an organization's branded landing page with upcoming + past events.
 * Lookup order:
 *  - hostSlug prop (when mounted by HostRouter via subdomain / custom domain)
 *  - URL :slug param (when reached via /org/:slug)
 */
const PublicOrgPage = ({ hostSlug }: { hostSlug?: string } = {}) => {
  const params = useParams<{ slug: string }>();
  const slug = hostSlug || params.slug;
  const { isAdmin } = useAuth();
  const { theme: appTheme } = useTheme();
  const [org, setOrg] = useState<OrgRow | null>(null);
  const [upcoming, setUpcoming] = useState<EventRow[]>([]);
  const [past, setPast] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [calMonth, setCalMonth] = useState<Date>(() => new Date());
  const [now, setNow] = useState<Date>(() => new Date());
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Live "current time" tick for the header — updates once a minute.
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Load Google Font dynamically when the organization config loads
  useEffect(() => {
    if (!org) return;
    const cfg = (org.landing_config || {}) as ExtendedConfig;
    const fontName = cfg?.theme?.fontFamily?.trim() || defaultTheme.fontFamily;
    const systemFonts = ["sans-serif", "serif", "monospace", "Arial", "Helvetica", "Times New Roman", "Courier New", "Inter", "Poppins"];
    if (systemFonts.includes(fontName)) return;

    const linkId = `google-font-${fontName.replace(/\s+/g, "-").toLowerCase()}`;
    if (document.getElementById(linkId)) return;

    const link = document.createElement("link");
    link.id = linkId;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@400;500;600;700;800&display=swap`;
    document.head.appendChild(link);
  }, [org]);

  useEffect(() => {
    if (!slug) return;
    let cancel = false;
    (async () => {
      // Use security-definer RPC so only safe (non-billing) columns are exposed publicly
      const { data: rows } = await supabaseRpc("get_public_org_by_slug", { _slug: slug });
      const data = (Array.isArray(rows) ? rows[0] : rows) as OrgRow | null;

      if (cancel) return;
      if (!data) { setNotFound(true); setLoading(false); return; }
      setOrg(data as OrgRow);

      const now = new Date().toISOString();
      const [up, pa] = await Promise.all([
        supabase.from("events").select("id,slug,title,description,date,end_date,venue,location,image_url,banner_landscape_url,price")
          .eq("org_id", data.id).eq("status", "published").gte("date", now).order("date", { ascending: true }).limit(24),
        supabase.from("events").select("id,slug,title,description,date,end_date,venue,location,image_url,banner_landscape_url,price")
          .eq("org_id", data.id).eq("status", "published").lt("date", now).order("date", { ascending: false }).limit(24),
      ]);
      if (cancel) return;
      setUpcoming((up.data || []) as EventRow[]);
      setPast((pa.data || []) as EventRow[]);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-8">
        <Skeleton className="h-72 rounded-xl mb-6" />
        <Skeleton className="h-8 w-1/3 mb-3" /><Skeleton className="h-4 w-2/3" />
      </div>
    );
  }
  if (notFound || !org) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center p-8">
        <h1 className="text-2xl font-bold mb-2">Page not found</h1>
        <p className="text-muted-foreground text-sm mb-4">This organization page doesn't exist or hasn't been published.</p>
        <Link to="/" className="text-sm underline">Back to home</Link>
      </div>
    );
  }

  const cfg = (org.landing_config || {}) as ExtendedConfig;
  const baseTheme: ThemeConfig = { ...defaultTheme, ...(cfg.theme || {}) };
  // Honor app-level dark mode: swap the page's light surfaces for dark equivalents
  // while preserving the org's branded accent color.
  const theme: ThemeConfig =
    appTheme === "dark"
      ? { ...baseTheme, backgroundColor: "#0b0d12", textColor: "#f5f5f7" }
      : baseTheme;
  const rawEvents = tab === "upcoming" ? upcoming : past;
  // Apply search filter if the user is searching
  const events = searchQuery.trim()
    ? rawEvents.filter((e) => {
        const q = searchQuery.toLowerCase();
        return (
          e.title.toLowerCase().includes(q) ||
          (e.venue || "").toLowerCase().includes(q) ||
          (e.location || "").toLowerCase().includes(q) ||
          (e.description || "").toLowerCase().includes(q)
        );
      })
    : rawEvents;
  const cover = cfg.cover || "";
  const bio = cfg.bio || "";
  const accentLink = cfg.accentLink || {};

  // Resolve viewer's timezone + formatted current time.
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const tzShort = (() => {
    const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: "short" }).formatToParts(now);
    return parts.find((p) => p.type === "timeZoneName")?.value || tz;
  })();
  const nowLabel = format(now, "h:mm a");

  // Group events by Today / Tomorrow / This Week / Later, in display order.
  const grouped = groupEventsByBucket(events);

  // Build dot map: which days in calMonth have events.
  const eventDays = new Set(events.map((e) => format(new Date(e.date), "yyyy-MM-dd")));

  return (
    <div
      style={{
        backgroundColor: theme.backgroundColor,
        color: theme.textColor,
        fontFamily: theme.fontFamily + ", sans-serif",
        minHeight: "100vh",
      }}
    >
      {!isAdmin && <PreviewHostBanner />}

      {/* Centralized site header — Illuxus logo only, no menu. */}
      <SiteHeader
        theme={{
          backgroundColor: theme.backgroundColor,
          textColor: theme.textColor,
          accentColor: theme.accentColor,
          fontFamily: theme.fontFamily,
        }}
      />

      {/* LinkedIn-style hero: full-bleed cover, then identity row with overlapping logo. */}
      <section className="relative">
        {/* Cover — full-bleed, displays full 1128:191 image with no cropping and no gap above. */}
        {cover ? (
          <img
            src={cover}
            alt={`${org.name} cover`}
            className="block w-full h-auto"
          />
        ) : (
          <div
            className="w-full"
            style={{
              aspectRatio: "1128 / 191",
              background: `linear-gradient(135deg, ${theme.accentColor}33, ${theme.accentColor}10)`,
            }}
            aria-hidden
          />
        )}

        {/* Identity row */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="pt-5 sm:pt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-8 pb-6 sm:pb-8 border-b" style={{ borderColor: `${theme.textColor}12` }}>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 min-w-0 flex-1">
              {org.logo_url ? (
                <img
                  src={org.logo_url}
                  alt={org.name}
                  className="-mt-10 sm:-mt-20 h-20 w-20 sm:h-32 sm:w-32 lg:h-36 lg:w-36 rounded-2xl object-cover shrink-0"
                  style={{
                    background: theme.backgroundColor,
                    boxShadow: `0 0 0 4px ${theme.backgroundColor}, 0 12px 28px -12px rgba(0,0,0,0.35)`,
                  }}
                />
              ) : (
                <div
                  className="-mt-10 sm:-mt-20 h-20 w-20 sm:h-32 sm:w-32 lg:h-36 lg:w-36 rounded-2xl flex items-center justify-center text-white text-4xl font-bold shrink-0"
                  style={{
                    backgroundColor: theme.accentColor,
                    boxShadow: `0 0 0 4px ${theme.backgroundColor}, 0 12px 28px -12px rgba(0,0,0,0.35)`,
                  }}
                >
                  {org.name.charAt(0)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h1 className="text-[28px] sm:text-4xl lg:text-[44px] font-bold tracking-tight leading-tight">
                  {org.name}
                </h1>
                <p className="mt-1.5 inline-flex items-center gap-1.5 text-[12.5px] opacity-60">
                  <Clock className="h-3.5 w-3.5" />
                  Times in {tzShort} <span className="opacity-50">·</span> {nowLabel}
                </p>
              </div>
            </div>
            <div className="shrink-0">
              <OrgSubscribeButton
                orgId={org.id}
                accentColor={theme.accentColor}
                textColor={theme.textColor}
              />
            </div>
          </div>

          {(bio || accentLink.url) && (
            <div className="mt-5 max-w-2xl">
              {bio && (
                <p className="text-[14px] leading-[1.65] opacity-80 whitespace-pre-line">{bio}</p>
              )}
              {accentLink.url && (
                <a
                  href={accentLink.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block mt-3 text-[13px] font-medium underline underline-offset-4"
                  style={{ color: theme.accentColor }}
                >
                  {accentLink.label || accentLink.url}
                </a>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Events section with two-column timeline + mini calendar. */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-20 pt-2">
        {/* Section header */}
        <div className="flex items-center justify-between gap-3 pt-6">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Events</h2>
          <div className="flex items-center gap-2">
            <div
              className="hidden sm:flex items-center rounded-lg border p-0.5"
              style={{ borderColor: `${theme.textColor}15` }}
            >
              <IconBtn active={view === "grid"} onClick={() => setView("grid")} title="Grid view" theme={theme}>
                <LayoutGrid className="h-3.5 w-3.5" />
              </IconBtn>
              <IconBtn active={view === "list"} onClick={() => setView("list")} title="List view" theme={theme}>
                <ListIcon className="h-3.5 w-3.5" />
              </IconBtn>
              <IconBtn title="Search" theme={theme} onClick={() => setSearchOpen((v) => !v)} active={searchOpen}>
                <Search className="h-3.5 w-3.5" />
              </IconBtn>
            </div>
          </div>
        </div>

        {/* Inline search bar — shown when search icon is clicked */}
        {searchOpen && (
          <div className="mt-3 relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: `${theme.textColor}50` }} />
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search events by title, venue or location…"
              className="w-full h-10 pl-10 pr-10 rounded-lg border text-[14px] outline-none transition-colors focus:ring-2"
              style={{
                borderColor: `${theme.textColor}20`,
                backgroundColor: `${theme.backgroundColor}`,
                color: theme.textColor,
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center rounded-full"
                style={{ color: `${theme.textColor}60` }}
              >
                ×
              </button>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b mt-4" style={{ borderColor: `${theme.textColor}15` }}>
          {(["upcoming", "past"] as const).map((t) => {
            const active = tab === t;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="relative px-4 py-3 text-[14px] font-medium transition-colors"
                style={{ color: active ? theme.textColor : `${theme.textColor}80` }}
              >
                {t === "upcoming" ? "Upcoming" : "Past"}
                {active && (
                  <span
                    className="absolute left-2 right-2 -bottom-px h-[2px] rounded-full"
                    style={{ backgroundColor: theme.accentColor }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Two-column body */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8 mt-6">
          <div className="min-w-0">
            {events.length === 0 ? (
              <div
                className="rounded-2xl border-2 border-dashed py-16 text-center text-sm opacity-60"
                style={{ borderColor: `${theme.textColor}20` }}
              >
                <CalendarDays className="h-8 w-8 mx-auto mb-3 opacity-40" />
                {tab === "upcoming"
                  ? "No upcoming events scheduled — check back soon."
                  : "No past events to show yet."}
              </div>
            ) : (
              <div className="space-y-8">
                {grouped.map((bucket) => (
                  <div key={bucket.key}>
                    <div className="flex items-baseline gap-2 mb-3">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: theme.accentColor }}
                      />
                      <span className="text-[14px] font-semibold">{bucket.label}</span>
                      {bucket.subLabel && (
                        <span className="text-[13px] opacity-60">{bucket.subLabel}</span>
                      )}
                    </div>
                    <div className="flex flex-col gap-3">
                      {bucket.events.map((e) => (
                        <EventCardLuma
                          key={e.id}
                          event={{
                            ...e,
                            organizations: {
                              name: org.name,
                              slug: org.slug,
                              subdomain: org.subdomain,
                              logo_url: org.logo_url,
                            },
                          }}
                          compact={view === "list"}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Mini calendar */}
          <aside className="hidden lg:block">
            <MiniCalendar
              month={calMonth}
              onPrev={() => setCalMonth((m) => subMonths(m, 1))}
              onNext={() => setCalMonth((m) => addMonths(m, 1))}
              eventDays={eventDays}
              theme={theme}
            />
          </aside>
        </div>
      </section>

      <footer className="border-t py-6" style={{ borderColor: `${theme.textColor}15` }}>
        <div className="max-w-6xl mx-auto px-6 text-[12px] opacity-50 text-center">
          © {new Date().getFullYear()} {org.name}
        </div>
      </footer>
    </div>
  );
};

export default PublicOrgPage;

/* ─── Helpers ──────────────────────────────────────────────────────── */

function IconBtn({
  children,
  active,
  onClick,
  title,
  theme,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  title?: string;
  theme: ThemeConfig;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="h-7 w-7 inline-flex items-center justify-center rounded-md transition-colors"
      style={{
        backgroundColor: active ? `${theme.textColor}10` : "transparent",
        color: active ? theme.textColor : `${theme.textColor}80`,
      }}
    >
      {children}
    </button>
  );
}

interface Bucket {
  key: string;
  label: string;
  subLabel?: string;
  events: EventRow[];
}

function groupEventsByBucket(events: EventRow[]): Bucket[] {
  if (!events.length) return [];
  const buckets: Record<string, Bucket> = {};
  const order: string[] = [];
  for (const e of events) {
    const d = new Date(e.date);
    let key: string;
    let label: string;
    let sub: string | undefined;
    if (isToday(d)) { key = "today"; label = "Today"; sub = format(d, "EEEE"); }
    else if (isTomorrow(d)) { key = "tomorrow"; label = "Tomorrow"; sub = format(d, "EEEE"); }
    else { key = format(d, "yyyy-MM"); label = format(d, "MMMM yyyy"); }
    if (!buckets[key]) {
      buckets[key] = { key, label, subLabel: sub, events: [] };
      order.push(key);
    }
    buckets[key].events.push(e);
  }
  return order.map((k) => buckets[k]);
}

function MiniCalendar({
  month,
  onPrev,
  onNext,
  eventDays,
  theme,
}: {
  month: Date;
  onPrev: () => void;
  onNext: () => void;
  eventDays: Set<string>;
  theme: ThemeConfig;
}) {
  const start = startOfMonth(month);
  const end = endOfMonth(month);
  const startWeekday = start.getDay(); // 0 = Sun
  const daysInMonth = end.getDate();

  // Build a 6×7 grid (42 cells) starting from the first Sunday on/before month start.
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() - (startWeekday - i));
    cells.push(d);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    cells.push(new Date(month.getFullYear(), month.getMonth(), i));
  }
  while (cells.length < 42) {
    const last = cells[cells.length - 1] as Date;
    const d = new Date(last);
    d.setDate(d.getDate() + 1);
    cells.push(d);
  }

  return (
    <div
      className="rounded-xl border p-3"
      style={{ borderColor: `${theme.textColor}12` }}
    >
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-[14px] font-semibold">{format(month, "MMMM")}</span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={onPrev}
            className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-foreground/5"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span
            className="h-1.5 w-1.5 rounded-full mx-0.5"
            style={{ backgroundColor: theme.accentColor }}
          />
          <button
            onClick={onNext}
            className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-foreground/5"
            aria-label="Next month"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="text-[11px] font-medium opacity-50 py-1">
            {d}
          </div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const inMonth = d.getMonth() === month.getMonth();
          const hasEvent = eventDays.has(format(d, "yyyy-MM-dd"));
          const today = isSameDay(d, new Date());
          return (
            <div key={i} className="relative py-1.5 text-[12px]">
              <span
                className="inline-flex items-center justify-center h-6 w-6 rounded-full"
                style={{
                  color: today
                    ? theme.accentColor
                    : inMonth
                      ? theme.textColor
                      : `${theme.textColor}40`,
                  fontWeight: today || hasEvent ? 600 : 400,
                }}
              >
                {d.getDate()}
              </span>
              {hasEvent && (
                <span
                  className="absolute left-1/2 -translate-x-1/2 bottom-0.5 h-1 w-1 rounded-full"
                  style={{ backgroundColor: theme.accentColor }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}