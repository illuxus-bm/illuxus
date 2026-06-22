import { useEffect, useState, Suspense, lazy } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { supabaseRpc } from "@/lib/observability";
import type { Tables } from "@/integrations/supabase/types";
import {
  LayoutDashboard, ClipboardList, Users, FileText, Palette,
  Mail, BarChart3, CalendarCheck, Search, Ticket, Presentation,
  UserCheck, UsersRound, Award, Megaphone, Globe, ArrowLeft, ExternalLink,
  Link2, Check, X, Pencil, Copy, Settings, Radio, ChevronDown, RefreshCw, Users2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar
} from "@/components/ui/sidebar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from "recharts";
import SpeakerManagement from "@/components/event/SpeakerManagement";
import SessionManagement from "@/components/event/SessionManagement";
import SponsorManagement from "@/components/event/SponsorManagement";
import EventPageForm from "@/components/event/page-form/EventPageForm";
import RegistrationsSection from "@/components/event/RegistrationsSection";
import EventCommunicate from "@/components/event/EventCommunicate";
import ReportsSection from "@/components/event/ReportsSection";
import EventSettingsSection from "@/components/event/EventSettingsSection";
import { checkRouteParam, eventPublicPath, eventPublicUrl } from "@/lib/event-routes";
import { useOrg } from "@/contexts/OrgContext";
import { formatMoney, DEFAULT_EVENT_CURRENCY } from "@/lib/currency";
import { useFxRates, formatConverted } from "@/lib/fx";
import { CurrencySwitcher, getStoredDisplayCurrency } from "@/components/CurrencySwitcher";
import { FullPageLoader } from "@/components/FullPageLoader";
import { DashboardTopBar } from "@/components/DashboardTopBar";

const BroadcastPageLazy = lazy(() => import("./event/BroadcastPage"));
const ApplicationsSectionLazy = lazy(() => import("@/components/event/ApplicationsSection").then((m) => ({ default: m.ApplicationsSection })));

type Event = Tables<"events">;

const sidebarNav = [
  { label: "Overview", icon: LayoutDashboard, key: "dashboard" },
  { label: "Settings", icon: Settings, key: "settings" },
  { label: "Webinar", icon: Radio, key: "broadcast" },
  { label: "Speakers", icon: ClipboardList, key: "manage" },
  { label: "Registrations", icon: Users, key: "registrations" },
  { label: "Sponsors", icon: Award, key: "exhibitors" },
  { label: "Agenda", icon: CalendarCheck, key: "agenda" },
  { label: "Design", icon: Palette, key: "design" },
  { label: "Communicate", icon: Mail, key: "communicate" },
  { label: "Community", icon: Users2, key: "community" },
  { label: "Reports", icon: BarChart3, key: "reports" },
];


const CHART_COLORS = {
  registered: "hsl(142 72% 45%)",
  cancelled: "hsl(0 72% 51%)",
  available: "hsl(240 5% 85%)",
};

function EventSidebar({ active, onSelect, eventTitle, eventFormat }: { active: string; onSelect: (k: string) => void; eventTitle: string; eventFormat?: string | null }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const nav = sidebarNav.filter((i) => !(i.key === "broadcast" && eventFormat === "physical"));

  return (
    <Sidebar collapsible="icon" className="border-r border-border bg-card">
      <SidebarContent className="pt-1">
        {!collapsed && (
          <div className="px-3 py-2 mb-1">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-medium">Event</p>
            <p className="text-sm font-medium truncate mt-0.5">{eventTitle}</p>
          </div>
        )}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {nav.map((item) => (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton
                    isActive={active === item.key}
                    tooltip={item.label}
                    onClick={() => onSelect(item.key)}
                    className="cursor-pointer h-8 text-[13px]"
                  >
                    <item.icon className="h-4 w-4" />
                    {!collapsed && <span>{item.label}</span>}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

type Registration = Tables<"registrations">;

const EventDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { org } = useOrg();
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState(() => searchParams.get("tab") || "dashboard");
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [speakerCount, setSpeakerCount] = useState(0);
  const [sessionCount, setSessionCount] = useState(0);
  const [sponsorCount, setSponsorCount] = useState(0);
  const [editingSlug, setEditingSlug] = useState(false);
  const [slugDraft, setSlugDraft] = useState("");
  const [savingSlug, setSavingSlug] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [slugChecking, setSlugChecking] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const { rates: fxRates } = useFxRates();
  const [displayCcy, setDisplayCcy] = useState<string>(() => getStoredDisplayCurrency(DEFAULT_EVENT_CURRENCY));
  const { toast } = useToast();

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      // Dashboard route is allowed to receive either form, but we still log
      // when something unexpected slips through so we can clean it up.
      checkRouteParam("/dashboard/events/:id", "id", id, "slug");
      // Support both UUID and slug in the route param
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      const lookup = isUuid
        ? await supabase.from("events").select("*").eq("id", id).single()
        : await supabase.from("events").select("*").eq("slug", id).single();
      const ev = lookup.data;
      if (!ev) {
        setLoading(false);
        return;
      }
      const eventId = ev.id;
      const [regRes, speakerRes, sessionRes, sponsorRes] = await Promise.all([
        supabase.from("registrations").select("*").eq("event_id", eventId),
        supabase.from("event_speakers").select("id", { count: "exact", head: true }).eq("event_id", eventId),
        supabase.from("sessions").select("id", { count: "exact", head: true }).eq("event_id", eventId),
        supabase.from("event_sponsors").select("id", { count: "exact", head: true }).eq("event_id", eventId),
      ]);
      setEvent(ev);
      setRegistrations(regRes.data || []);
      setSpeakerCount(speakerRes.count || 0);
      setSessionCount(sessionRes.count || 0);
      setSponsorCount(sponsorRes.count || 0);
      setLoading(false);
    };
    load();
  }, [id]);

  // Live updates: keep registrations state in sync via realtime so KPI counters refresh
  useEffect(() => {
    if (!event?.id) return;
    const channel = supabase
      .channel(`event-detail-regs-${event.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "registrations", filter: `event_id=eq.${event.id}` },
        (payload) => {
          setRegistrations((prev) => {
            if (payload.eventType === "INSERT") {
              const row = payload.new as Registration;
              return prev.some((r) => r.id === row.id) ? prev : [row, ...prev];
            }
            if (payload.eventType === "UPDATE") {
              const row = payload.new as Registration;
              return prev.map((r) => (r.id === row.id ? row : r));
            }
            if (payload.eventType === "DELETE") {
              const row = payload.old as Registration;
              return prev.filter((r) => r.id !== row.id);
            }
            return prev;
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [event?.id]);

  // Deep-link support: keep `activeSection` in sync with `?tab=` so external
  // links (community sidebar, etc.) can land on a specific manage-event tab.
  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && tab !== activeSection) {
      setActiveSection(tab);
      // Drop the param so internal nav doesn't fight with the URL.
      const next = new URLSearchParams(searchParams);
      next.delete("tab");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, activeSection, setSearchParams]);

  // Live validation + uniqueness check while typing (debounced)
  useEffect(() => {
    const slugify = (s: string) =>
      s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
    if (!editingSlug || !event) return;
    const cleaned = slugify(slugDraft);
    if (!slugDraft.trim()) {
      setSlugError(null);
      return;
    }
    if (!cleaned) {
      setSlugError("Use letters, numbers, or hyphens.");
      return;
    }
    if (cleaned === event.slug) {
      setSlugError(null);
      return;
    }
    setSlugChecking(true);
    const handle = setTimeout(async () => {
      const { data } = await supabase
        .from("events")
        .select("id")
        .eq("slug", cleaned)
        .neq("id", event.id)
        .maybeSingle();
      setSlugChecking(false);
      setSlugError(data ? `"${cleaned}" is already taken.` : null);
    }, 350);
    return () => clearTimeout(handle);
  }, [slugDraft, editingSlug, event]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading...</div>;
  if (!event) return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Event not found</div>;

  const slugify = (s: string) =>
    s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

  const startEditSlug = () => {
    setSlugDraft(event.slug);
    setSlugError(null);
    setEditingSlug(true);
  };

  const saveSlug = async () => {
    const cleaned = slugify(slugDraft);
    if (!cleaned) {
      setSlugError("Use letters, numbers, or hyphens.");
      return;
    }
    if (cleaned === event.slug) {
      setEditingSlug(false);
      return;
    }
    // Pre-flight uniqueness check (DB trigger would otherwise auto-suffix silently)
    const { data: clash } = await supabase
      .from("events")
      .select("id")
      .eq("slug", cleaned)
      .neq("id", event.id)
      .maybeSingle();
    if (clash) {
      setSlugError(`"${cleaned}" is already taken.`);
      return;
    }
    setSavingSlug(true);
    const { data, error } = await supabase
      .from("events")
      .update({ slug: cleaned })
      .eq("id", event.id)
      .select("slug")
      .single();
    setSavingSlug(false);
    if (error) {
      setSlugError(error.message);
      return;
    }
    const newSlug = data?.slug ?? cleaned;
    if (newSlug !== cleaned) {
      // Trigger had to change it — surface that
      setSlugError(`Saved as "${newSlug}" (your slug was adjusted).`);
    } else {
      setSlugError(null);
    }
    const updatedEvent = { ...event, slug: data?.slug ?? cleaned };
    setEvent(updatedEvent);
    setEditingSlug(false);
    const orgHandle = (org as { subdomain?: string | null } | null)?.subdomain || org?.slug || null;
    toast({ title: "URL updated", description: `Event is now at ${eventPublicPath(updatedEvent, orgHandle)}` });
    // Keep dashboard URL in sync with the public slug
    navigate(`/dashboard/events/${newSlug}`, { replace: true });
  };

  const copyPublicUrl = async () => {
    const orgHandle = (org as { subdomain?: string | null } | null)?.subdomain || org?.slug || null;
    const url = eventPublicUrl(event, orgHandle);
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied", description: url });
    } catch {
      toast({ title: "Could not copy", variant: "destructive" });
    }
  };

  const togglePublish = async () => {
    if (!event || publishing) return;
    const isLive = event.status === "published";
    const nextStatus = isLive ? "draft" : "published";
    setPublishing(true);
    const { data, error } = await supabase
      .from("events")
      .update({ status: nextStatus })
      .eq("id", event.id)
      .select()
      .single();
    setPublishing(false);
    if (error || !data) {
      toast({
        title: isLive ? "Failed to unpublish" : "Failed to publish",
        description: error?.message,
        variant: "destructive",
      });
      return;
    }
    setEvent(data);
    const orgHandle = (org as { subdomain?: string | null } | null)?.subdomain || org?.slug || null;
    toast({
      title: nextStatus === "published" ? "Event published" : "Event unpublished",
      description:
        nextStatus === "published"
          ? `Live at ${eventPublicPath(data, orgHandle)}`
          : "This event is no longer publicly visible.",
    });
  };

  const republishLive = async () => {
    if (!event || publishing) return;
    setPublishing(true);
    const { data, error } = await supabase
      .from("events")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", event.id)
      .select()
      .single();
    setPublishing(false);
    if (error || !data) {
      toast({ title: "Failed to update", description: error?.message, variant: "destructive" });
      return;
    }
    setEvent(data);
    toast({ title: "Live page updated" });
  };

  const totalRegs = registrations.length;
  const checkedInCount = registrations.filter(r => (r as any).checked_in === true).length;
  const confirmedRegs = registrations.filter(r => r.status === "confirmed").length;
  const cancelledRegs = registrations.filter(r => r.status === "cancelled").length;
  const totalRevenue = registrations
    .filter(r => r.status !== "cancelled")
    .reduce((s, r) => s + Number(r.amount_paid || 0), 0);
  const eventCurrency = ((event as any).currency || DEFAULT_EVENT_CURRENCY).toUpperCase();
  const capacity = event.capacity || 100;
  const yetToSell = Math.max(0, capacity - confirmedRegs);

  const donutData = [
    { name: "Registered", value: confirmedRegs },
    { name: "Cancelled", value: cancelledRegs },
    { name: "Available", value: yetToSell },
  ].filter(d => d.value > 0);

  // Build trend from non-cancelled registrations, sorted chronologically
  const dailyMap = registrations
    .filter(r => r.status !== "cancelled")
    .reduce((acc, r) => {
      const d = new Date(r.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  const trendData = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([iso, registrations]) => ({
      date: new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { day: "2-digit", month: "short" }),
      registrations,
    }));
  // Fallback: if no registrations, show last 7 days with 0
  const finalTrendData = trendData.length > 0 ? trendData : Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return {
      date: d.toLocaleDateString("en-US", { day: "2-digit", month: "short" }),
      registrations: 0,
    };
  });

  const statusStyle: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    published: "bg-accent/15 text-accent",
    cancelled: "bg-destructive/15 text-destructive",
    completed: "bg-chart-2/15 text-chart-2",
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex flex-col w-full bg-background">
        <DashboardTopBar showSidebarTrigger={false} />
        <div className="flex flex-1 w-full min-w-0">
          <EventSidebar active={activeSection} onSelect={async (k) => {
          if (k === "broadcast") { setActiveSection("broadcast"); return; }
          if (k === "community") {
            // Resolve this event's community and jump to its feed.
            const { data: cid } = await supabaseRpc("community_resolve_event" as never, { _event_id: event.id } as never);
            if (cid) {
              const { data: comm } = await supabase.from("communities" as never).select("slug").eq("id", cid as string).maybeSingle();
              const slug = (comm as { slug?: string } | null)?.slug;
              if (slug) { navigate(`/community/${slug}/feed`); return; }
            }
            // If the community hasn't been created yet, stay on the dashboard and show the fallback UI
            setActiveSection("community");
            return;
          }
          setActiveSection(k);
        }} eventTitle={event.title} eventFormat={(event as any).event_format} />

        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <header className="border-b border-border bg-card/80 glass px-3 sm:px-4 py-2.5 flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
              <SidebarTrigger className="h-7 w-7" aria-label="Toggle event sidebar" />
              <button
                onClick={() => navigate("/dashboard")}
                className="h-7 w-7 shrink-0 flex items-center justify-center rounded-md hover:bg-muted transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-sm font-semibold truncate">{event.title}</h1>
                  <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${statusStyle[event.status] || ""}`}>
                    {event.status}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground min-w-0">
                  <span className="truncate">
                    {new Date(event.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "2-digit", year: "numeric" })}
                    {event.location && ` · ${event.location}`}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* Link/share popover — slug edit, copy URL, and internal ID */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-[12px] text-muted-foreground hover:text-foreground" title="Public URL">
                    <Link2 className="h-3.5 w-3.5" />
                    <span className="hidden md:inline font-mono truncate max-w-[160px]">/{event.slug}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 p-3 space-y-3">
                  <div>
                    <label className="text-[11px] uppercase tracking-wider text-muted-foreground/70">Public URL</label>
                    <div className={`mt-1 flex items-center gap-1 px-2 py-1 rounded-md border bg-background/50 ${slugError ? "border-destructive/60" : "border-border"}`}>
                      <span className="text-[11px] font-mono text-muted-foreground shrink-0">/events/</span>
                      {editingSlug ? (
                        <>
                          <Input
                            autoFocus
                            value={slugDraft}
                            onChange={(e) => setSlugDraft(e.target.value)}
                            aria-invalid={!!slugError}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveSlug();
                              if (e.key === "Escape") setEditingSlug(false);
                            }}
                            className="h-6 flex-1 text-[11px] font-mono px-1.5"
                            placeholder="event-slug"
                          />
                          <button
                            onClick={saveSlug}
                            disabled={savingSlug || !!slugError || slugChecking}
                            className="h-6 w-6 inline-flex items-center justify-center rounded text-accent hover:bg-accent/10 disabled:opacity-50"
                            aria-label="Save"
                            title="Save"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingSlug(false)}
                            className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-muted"
                            aria-label="Cancel"
                            title="Cancel"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="text-[11px] font-mono text-foreground flex-1 truncate">{event.slug}</span>
                          <button
                            onClick={startEditSlug}
                            className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                            aria-label="Edit slug"
                            title="Edit"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            onClick={copyPublicUrl}
                            className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                            aria-label="Copy URL"
                            title="Copy"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        </>
                      )}
                    </div>
                    {slugError ? (
                      <p className="mt-1 text-[11px] text-destructive">{slugError}</p>
                    ) : slugChecking ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">Checking…</p>
                    ) : null}
                  </div>
                  <div className="pt-2 border-t border-border flex items-center gap-1 text-[10px] text-muted-foreground/70">
                    <span className="uppercase tracking-wider">ID</span>
                    <span className="font-mono select-all ml-1" title={event.id}>{event.id}</span>
                  </div>
                </PopoverContent>
              </Popover>
              <Button variant="ghost" size="sm" className="h-7 text-[12px] gap-1 px-2 sm:px-3" asChild>
                <a
                  href={eventPublicUrl(
                    event,
                    (org as { subdomain?: string | null } | null)?.subdomain || org?.slug || null,
                  )}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="h-3 w-3" /> <span className="hidden sm:inline">Preview</span>
                </a>
              </Button>
              {event.status === "published" ? (
                <div className="inline-flex items-stretch">
                  <Button
                    size="sm"
                    className="h-7 text-[12px] px-2 sm:px-3 gap-1 rounded-r-none"
                    onClick={republishLive}
                    disabled={publishing}
                    title="Re-publish the latest changes"
                  >
                    {publishing ? (
                      <>
                        <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                        Updating…
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-3 w-3" />
                        Update
                      </>
                    )}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        className="h-7 px-1.5 rounded-l-none border-l border-primary-foreground/20"
                        disabled={publishing}
                        aria-label="More publish options"
                      >
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem onClick={togglePublish} className="text-[13px] text-destructive focus:text-destructive">
                        Unpublish
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ) : (
                <Button
                  size="sm"
                  className="h-7 text-[12px] px-2 sm:px-3 gap-1"
                  onClick={togglePublish}
                  disabled={publishing}
                >
                  {publishing ? (
                    <>
                      <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                      Publishing…
                    </>
                  ) : (
                    "Publish"
                  )}
                </Button>
              )}
            </div>
          </header>

          {/* Content */}
          <main className="flex-1 p-4 lg:p-6 overflow-y-auto">
            {activeSection === "dashboard" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[12px] text-muted-foreground">
                    Event currency: <span className="font-mono font-medium text-foreground">{eventCurrency}</span>
                  </div>
                  <CurrencySwitcher value={displayCcy} onChange={setDisplayCcy} extra={[eventCurrency]} />
                </div>
                {/* Metric cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <MetricCard
                    label="Revenue"
                    value={
                      displayCcy !== eventCurrency
                        ? (formatConverted(totalRevenue, eventCurrency, displayCcy, fxRates) ?? formatMoney(totalRevenue, eventCurrency))
                        : formatMoney(totalRevenue, eventCurrency)
                    }
                    sub={
                      displayCcy !== eventCurrency
                        ? `${formatMoney(totalRevenue, eventCurrency)} native · ticket sales`
                        : "Total ticket sales"
                    }
                    color="text-accent"
                  />
                  <MetricCard
                    label="Registrations"
                    value={String(confirmedRegs)}
                    sub={cancelledRegs > 0 ? `of ${capacity} capacity · ${cancelledRegs} cancelled` : `of ${capacity} capacity`}
                    color="text-chart-2"
                  />
                  <MetricCard label="Checked In" value={String(checkedInCount)} sub={`of ${confirmedRegs} registered`} color="text-chart-3" />
                </div>

                {/* Charts row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 select-none recharts-focus-safe">
                  {/* Trend */}
                  <div className="bg-card border border-border rounded-lg p-4">
                    <h3 className="text-[13px] font-medium mb-3">Registration Trend</h3>
                    <ResponsiveContainer width="100%" height={180}>
                      <AreaChart data={finalTrendData}>
                        <defs>
                          <linearGradient id="regGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--brand-green))" stopOpacity={0.18} />
                            <stop offset="95%" stopColor="hsl(var(--brand-green))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))" }} />
                        <Area type="monotone" dataKey="registrations" stroke="hsl(var(--brand-green))" fill="url(#regGrad)" strokeWidth={1.5} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Donut */}
                  <div className="bg-card border border-border rounded-lg p-4">
                    <h3 className="text-[13px] font-medium mb-3">Ticket Distribution</h3>
                    <div className="flex items-center gap-6">
                      <ResponsiveContainer width={130} height={130}>
                        <PieChart>
                          <Pie
                            data={donutData}
                            cx="50%"
                            cy="50%"
                            innerRadius={38}
                            outerRadius={56}
                            paddingAngle={2}
                            dataKey="value"
                            strokeWidth={0}
                            isAnimationActive={false}
                            style={{ outline: "none" }}
                          >
                            {donutData.map((d) => {
                              const key = d.name.toLowerCase() as keyof typeof CHART_COLORS;
                              return <Cell key={d.name} fill={CHART_COLORS[key] ?? CHART_COLORS.available} style={{ outline: "none" }} />;
                            })}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-2.5 text-[13px]">
                        {donutData.map((d) => {
                          const key = d.name.toLowerCase() as keyof typeof CHART_COLORS;
                          return (
                            <div key={d.name} className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[key] ?? CHART_COLORS.available }} />
                              <span className="text-muted-foreground">{d.name}</span>
                              <span className="font-medium ml-auto mono">{d.value}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Quick actions */}
                <div className="bg-card border border-border rounded-lg p-4">
                  <h3 className="text-[13px] font-medium mb-1">Quick Actions</h3>
                  <p className="text-[12px] text-muted-foreground mb-3">Navigate to core event sections</p>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                    {[
                      { label: "Agenda", icon: Presentation, key: "agenda" },
                      { label: "Speakers", icon: UserCheck, key: "manage" },
                      { label: "Sponsors", icon: Award, key: "exhibitors" },
                      { label: "Attendees", icon: Users, key: "registrations" },
                      { label: "Website", icon: Globe, key: "design" },
                    ].map((a) => (
                      <button
                        key={a.label}
                        onClick={() => setActiveSection(a.key)}
                        className="flex items-center gap-2 px-3 py-2.5 rounded-md text-[13px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <a.icon className="h-3.5 w-3.5" />
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-3">
                  <NumberCard icon={<Presentation className="h-4 w-4 text-muted-foreground" />} label="Sessions" value={String(sessionCount)} />
                  <NumberCard icon={<UserCheck className="h-4 w-4 text-muted-foreground" />} label="Speakers" value={String(speakerCount)} />
                  <NumberCard icon={<UsersRound className="h-4 w-4 text-muted-foreground" />} label="Sponsors" value={String(sponsorCount)} />
                </div>
              </div>
            )}

            {activeSection === "manage" && <SpeakerManagement eventId={event.id} />}
            {activeSection === "agenda" && <SessionManagement eventId={event.id} eventDate={event.date} eventEndDate={event.end_date} publicUrl={eventPublicUrl(event, org?.slug)} />}
            {activeSection === "exhibitors" && <SponsorManagement eventId={event.id} />}
            {activeSection === "design" && <EventPageForm eventId={event.id} />}
            {activeSection === "settings" && (
              <EventSettingsSection
                eventId={event.id}
                onSaved={async () => {
                  const { data } = await supabase.from("events").select("*").eq("id", event.id).single();
                  if (data) setEvent(data);
                }}
              />
            )}

            {activeSection === "registrations" && <RegistrationsSection eventId={event.id} />}
            {activeSection === "communicate" && <EventCommunicate eventId={event.id} />}
            {activeSection === "reports" && <ReportsSection eventId={event.id} />}
            {activeSection === "search" && <EventSearch eventId={event.id} registrations={registrations} />}
            {activeSection === "community" && (
              <div className="flex flex-col items-center justify-center h-[50vh] text-center space-y-4">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Users2 className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold tracking-tight">No Community Setup</h3>
                  <p className="text-[13px] text-muted-foreground mt-1 max-w-sm">This event does not have an active community yet. You can enable it in the event settings.</p>
                </div>
                <Button onClick={() => setActiveSection("settings")} className="mt-2" variant="outline">
                   Go to Settings
                </Button>
              </div>
            )}

            {activeSection === "broadcast" && (
              <Suspense fallback={<FullPageLoader label="Loading webinar studio…" />}>
                <BroadcastPageLazy />
              </Suspense>
            )}

            {activeSection === "applications" && (
              <Suspense fallback={<FullPageLoader label="Loading applications…" />}>
                <ApplicationsSectionLazy eventId={event.id} />
              </Suspense>
            )}

            {!["dashboard", "settings", "manage", "agenda", "exhibitors", "design", "registrations", "communicate", "reports", "broadcast", "search", "applications", "community"].includes(activeSection) && (
              <div className="flex items-center justify-center h-64 text-muted-foreground">
                <p className="text-sm">{sidebarNav.find(n => n.key === activeSection)?.label} — Coming soon</p>
              </div>
            )}
          </main>
        </div>
        </div>
      </div>
    </SidebarProvider>
  );
};

function MetricCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <p className="text-[12px] text-muted-foreground">{label}</p>
      <p className={`text-2xl font-semibold tracking-tight mt-1 ${color}`}>{value}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
    </div>
  );
}

function NumberCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4 flex items-center gap-3">
      {icon}
      <div>
        <p className="text-lg font-semibold mono">{value}</p>
        <p className="text-[11px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

// ─── EventSearch ──────────────────────────────────────────────────────────────
// Full-text search across registrations for a single event.

type Registration = Tables<"registrations">;

function EventSearch({
  eventId,
  registrations,
}: {
  eventId: string;
  registrations: Registration[];
}) {
  const [query, setQuery] = useState("");

  const filtered = registrations.filter((r) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      r.name.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q) ||
      (r.company ?? "").toLowerCase().includes(q) ||
      (r.ticket_type ?? "").toLowerCase().includes(q) ||
      (r.status ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Search Registrations</h2>
        <p className="text-[12px] text-muted-foreground mt-0.5">
          Search by name, email, company, ticket type or status
        </p>
      </div>

      {/* Search input */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search registrations…"
          className="pl-9 h-9"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Results count */}
      {query.trim() && (
        <p className="text-[12px] text-muted-foreground">
          {filtered.length} result{filtered.length !== 1 ? "s" : ""} for{" "}
          <span className="font-medium text-foreground">"{query}"</span>
        </p>
      )}

      {/* Results table */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-lg">
          <Search className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-medium mb-1">No results found</p>
          <p className="text-[13px] text-muted-foreground">
            Try a different name, email, or ticket type.
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card z-10 border-b border-border">
                <tr className="text-[11px] uppercase tracking-wide text-muted-foreground text-left">
                  <th className="py-2.5 px-4 font-medium">Name</th>
                  <th className="py-2.5 px-4 font-medium">Email</th>
                  <th className="py-2.5 px-4 font-medium">Company</th>
                  <th className="py-2.5 px-4 font-medium">Ticket</th>
                  <th className="py-2.5 px-4 font-medium">Status</th>
                  <th className="py-2.5 px-4 font-medium">Checked In</th>
                  <th className="py-2.5 px-4 font-medium">Registered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                    <td className="py-2.5 px-4 font-medium whitespace-nowrap">{r.name}</td>
                    <td className="py-2.5 px-4 text-[12px] text-muted-foreground whitespace-nowrap">{r.email}</td>
                    <td className="py-2.5 px-4 text-[12px] text-muted-foreground">{r.company || "—"}</td>
                    <td className="py-2.5 px-4">
                      <span className="text-[11px] capitalize bg-muted px-1.5 py-0.5 rounded">
                        {r.ticket_type}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      <span
                        className={`text-[11px] font-medium capitalize px-1.5 py-0.5 rounded ${
                          r.approval_status === "approved"
                            ? "bg-green-500/10 text-green-600"
                            : r.approval_status === "pending"
                            ? "bg-amber-500/10 text-amber-600"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {r.approval_status}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-[12px]">
                      {r.checked_in ? (
                        <span className="text-green-600 font-medium flex items-center gap-1">
                          <Check className="h-3 w-3" /> Yes
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-[12px] text-muted-foreground whitespace-nowrap">
                      {new Date(r.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-border bg-muted/20">
            <p className="text-[11px] text-muted-foreground">
              {query.trim()
                ? `${filtered.length} of ${registrations.length} registrants match`
                : `${registrations.length} total registrant${registrations.length !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default EventDetailPage;