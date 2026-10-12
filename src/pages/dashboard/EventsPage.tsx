import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { DashboardLayout } from "@/components/DashboardLayout";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import {
  Plus, Calendar, Edit, Trash2, X, Search,
  MapPin, Clock, Link as LinkIcon, ArrowRight, ExternalLink, Settings2, Users2,
  CalendarDays, Ticket, Megaphone, Layout, FileText, Users, PencilLine, Radio,
  type LucideIcon,
} from "lucide-react";
import { PosterTitle, SectionChip } from "@/components/landing/primitives";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Tables } from "@/integrations/supabase/types";
import EventCoverPicker from "@/components/event/EventCoverPicker";
import EventBannerPicker from "@/components/event/EventBannerPicker";
import { stripRichText } from "@/lib/markdown";
import { formatMoney } from "@/lib/currency";
import { eventPublicPath, eventDashboardPath } from "@/lib/event-routes";

type Event = Tables<"events">;

// Columns added in later migrations that aren't in the generated types.ts yet.
type EventWithCommunity = Event & {
  create_community?: boolean | null;
  community_category?: string | null;
};

const statusColor: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  published: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  completed: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
};

const TIME_TABS = [
  { key: "upcoming", label: "Upcoming" },
  { key: "pending", label: "Pending" },
  { key: "past", label: "Past" },
] as const;

/**
 * Which tab an event belongs under. An event counts as ongoing/upcoming until
 * its END date passes (or its START date if no end was set), so a 3-day
 * conference still shows in Upcoming on day 2 and flips into Past after day 3.
 */
function matchesTimeTab(e: Event, tab: string, now: Date): boolean {
  const endOrStart = new Date(e.end_date || e.date);
  if (tab === "upcoming") return endOrStart >= now || e.status === "draft";
  if (tab === "past") return endOrStart < now && e.status !== "draft" && e.status !== "cancelled";
  if (tab === "pending") return e.status === "draft" || e.status === "pending";
  return true;
}

/** Headline number on the overview strip. */
function StatTile({ icon: Icon, label, value, hint }: { icon: LucideIcon; label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow !text-[10px] text-muted-foreground">{label}</span>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-accent/45 bg-accent/10 text-accent">
          <Icon className="h-4 w-4" strokeWidth={1.9} />
        </span>
      </div>
      <p className="poster mt-2 text-[40px] text-foreground">{value}</p>
      <p className="mt-1 truncate text-[12px] text-muted-foreground">{hint}</p>
    </div>
  );
}

/** One job the organiser can start from the dashboard. */
function TaskTile({ step, icon: Icon, title, hint, to }: { step: number; icon: LucideIcon; title: string; hint: string; to: string }) {
  return (
    <Link
      to={to}
      className="group relative flex h-full flex-col rounded-2xl border border-border bg-card p-4 transition-colors duration-300 hover:border-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="poster absolute right-4 top-3 text-[24px] text-foreground/15 transition-colors duration-300 group-hover:text-accent">
        {String(step).padStart(2, "0")}
      </span>
      <span className="grid h-10 w-10 place-items-center rounded-xl border border-accent/45 bg-accent/10 text-accent">
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} />
      </span>
      <h3 className="mt-4 text-[14px] font-bold leading-snug tracking-normal text-foreground">{title}</h3>
      <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{hint}</p>
      <span className="mt-auto inline-flex items-center gap-1 pt-3 text-[12px] font-semibold text-foreground">
        Open <ArrowRight className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

/** Stacked month / day block used wherever an event date leads a row. */
function DateBlock({ date, className = "" }: { date: string; className?: string }) {
  const d = new Date(date);
  return (
    <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-border bg-background text-center ${className}`}>
      <span>
        <span className="eyebrow block !text-[9px] leading-none text-accent">
          {d.toLocaleDateString("en-US", { month: "short" })}
        </span>
        <span className="poster block text-[22px] leading-none text-foreground">{d.getDate()}</span>
      </span>
    </span>
  );
}

const EventsPage = () => {
  const { user } = useAuth();
  const { org, myRole } = useOrg();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  /**
   * In-flight guard for the create/update submit.
   *
   * Without it, two clicks on Create fire two inserts, and BOTH commit: the
   * `events_set_slug` DB trigger silently uniquifies the slug (appending `-1`),
   * so the unique index on `(org_id, slug)` never rejects the second row. There
   * is no unique constraint on title, so the organizer ends up with two
   * published copies of the same event and no error to tell them. That is the
   * cause of duplicate events appearing on public listings.
   *
   * `EventQuickCreatePage` already guards its submit this way.
   */
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [timeFilter, setTimeFilter] = useState("upcoming");

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [date, setDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [venue, setVenue] = useState("");
  const [location, setLocation] = useState("");
  const [capacity, setCapacity] = useState("");
  const [price, setPrice] = useState("");
  const [status, setStatus] = useState("draft");
  const [imageUrl, setImageUrl] = useState("");
  const [bannerLandscapeUrl, setBannerLandscapeUrl] = useState("");
  const [bannerPortraitUrl, setBannerPortraitUrl] = useState("");
  const [createCommunity, setCreateCommunity] = useState(true);
  const [communityCategory, setCommunityCategory] = useState("other");

  const fetchEvents = useCallback(async () => {
    if (!org?.id && !user?.id) {
      setLoading(false);
      return;
    }
    let query = supabase
      .from("events")
      .select("*")
      .order("date", { ascending: true });
    // Org members see all org events; fallback to user_id for accounts without an org (e.g. super admin)
    if (org?.id) {
      query = query.eq("org_id", org.id);
    } else if (user?.id) {
      query = query.eq("user_id", user.id);
    }
    const { data, error } = await query;
    if (!error && data) setEvents(data);
    setLoading(false);
  }, [org?.id, user?.id]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const resetForm = () => {
    setTitle(""); setDescription(""); setSlug(""); setSlugTouched(false); setDate(""); setEndDate("");
    setVenue(""); setLocation(""); setCapacity(""); setPrice("");
    setStatus("draft"); setImageUrl(""); setBannerLandscapeUrl(""); setBannerPortraitUrl("");
    setCreateCommunity(true); setCommunityCategory("other");
    setEditingEvent(null); setShowForm(false);
  };

  const openEditForm = (event: Event) => {
    const ev = event as EventWithCommunity;
    setEditingEvent(event);
    setTitle(event.title);
    setDescription(event.description || "");
    setSlug(event.slug || "");
    setSlugTouched(true);
    setDate(event.date ? new Date(event.date).toISOString().slice(0, 16) : "");
    setEndDate(event.end_date ? new Date(event.end_date).toISOString().slice(0, 16) : "");
    setVenue(event.venue || "");
    setLocation(event.location || "");
    setCapacity(String(event.capacity || ""));
    setPrice(String(event.price || ""));
    setStatus(event.status);
    setImageUrl(event.image_url || "");
    setBannerLandscapeUrl(event.banner_landscape_url || "");
    setBannerPortraitUrl(event.banner_portrait_url || "");
    setCreateCommunity(ev.create_community ?? true);
    setCommunityCategory(ev.community_category ?? "other");
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !org?.id) return;
    // Second click while the first insert is still open would commit a second
    // row — see `submitting`'s declaration for why the DB won't stop it.
    if (submitting) return;
    setSubmitting(true);

    const eventData = {
      title,
      description: description || null,
      date: new Date(date).toISOString(),
      end_date: endDate ? new Date(endDate).toISOString() : null,
      venue: venue || null,
      location: location || null,
      capacity: capacity ? parseInt(capacity) : 0,
      price: price ? parseFloat(price) : 0,
      status,
      image_url: imageUrl || null,
      banner_landscape_url: bannerLandscapeUrl || null,
      banner_portrait_url: bannerPortraitUrl || null,
      user_id: user.id,
      org_id: org.id,
      slug: slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, ""),
      create_community: createCommunity,
      community_category: createCommunity ? communityCategory : null,
    };

    try {
      if (editingEvent) {
        const { error } = await supabase.from("events").update(eventData as never).eq("id", editingEvent.id);
        if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
        else toast({ title: "Event updated successfully" });
        resetForm();
        fetchEvents();
      } else {
        // Slug collisions are normally resolved server-side by the
        // `events_set_slug` trigger, which uniquifies before the unique index
        // is checked. A 23505 therefore only reaches us in a genuine race —
        // two concurrent inserts both passing the trigger's existence check,
        // with the index rejecting the loser. Retrying once is correct there
        // because that insert really did fail.
        let result = await supabase.from("events").insert(eventData as never).select("id, slug").single();
        if (result.error?.code === "23505") {
          const suffix = Math.random().toString(36).slice(2, 6);
          const retryData = { ...eventData, slug: `${eventData.slug}-${suffix}` };
          result = await supabase.from("events").insert(retryData as never).select("id, slug").single();
        }
        if (result.error) {
          toast({ title: "Error", description: result.error.message, variant: "destructive" });
          return;
        }
        toast({ title: "Event created successfully" });
        resetForm();
        fetchEvents();
        // Navigate directly to the new event detail page
        const target = result.data?.slug || result.data?.id;
        if (target) navigate(`/dashboard/events/${target}`);
      }
    } finally {
      // `finally` rather than a call per exit path: the early `return` on
      // insert error would otherwise leave the button disabled forever,
      // stranding the organizer on a form they can't resubmit.
      setSubmitting(false);
    }
  };

  const deleteEvent = async (id: string) => {
    const { error } = await supabase.from("events").delete().eq("id", id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Event deleted" }); fetchEvents(); }
  };

  const now = new Date();
  const filteredEvents = events
    .filter((e) => {
      const matchesSearch = e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (e.venue || "").toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSearch && matchesTimeTab(e, timeFilter, now);
    })
    .sort((a, b) => {
      const ta = new Date(a.date).getTime();
      const tb = new Date(b.date).getTime();
      // Past tab: most recent first (descending). All other tabs: soonest first (ascending).
      return timeFilter === "past" ? tb - ta : ta - tb;
    });

  const tabCounts: Record<string, number> = {};
  for (const tab of TIME_TABS) tabCounts[tab.key] = events.filter((e) => matchesTimeTab(e, tab.key, now)).length;

  // Overview numbers, all derived from the events already loaded.
  const liveCount = events.filter((e) => e.status === "published" && new Date(e.end_date || e.date) >= now).length;
  const ticketsSold = events.reduce((sum, e) => sum + (e.tickets_sold ?? 0), 0);

  // Schedule rail: what is coming, soonest first. `events` is already date-ascending.
  const schedule = events.filter((e) => e.status !== "cancelled" && new Date(e.end_date || e.date) >= now);
  const nextEvent = schedule.find((e) => e.status === "published") ?? schedule[0];
  const daysToNext = nextEvent
    ? Math.max(0, Math.ceil((new Date(nextEvent.date).getTime() - now.getTime()) / 86_400_000))
    : 0;

  // Same scoping as the sidebar: viewers don't get the write-heavy surfaces.
  const isViewer = myRole === "viewer";
  const tasks = [
    { icon: Plus, title: "Create an event", hint: "Name, date and venue. Live in minutes.", to: "/dashboard/events/new" },
    { icon: Ticket, title: "Sell tickets", hint: "See sales and who is coming.", to: "/dashboard/tickets" },
    ...(isViewer ? [] : [
      { icon: Megaphone, title: "Promote it", hint: "Send campaigns and emails.", to: "/dashboard/marketing" },
      { icon: Layout, title: "Design the page", hint: "Build your public landing page.", to: "/dashboard/landing-builder" },
    ]),
    { icon: Users, title: "Grow community", hint: "Keep attendees talking.", to: "/community" },
    { icon: FileText, title: "Check reports", hint: "Numbers, trends and exports.", to: "/dashboard/reports" },
  ];

  const capacityPct = (e: Event) =>
    e.capacity ? Math.min(100, Math.round(((e.tickets_sold ?? 0) / e.capacity) * 100)) : 0;

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-[1400px] space-y-8">
        {/* Overview */}
        <section className="grid gap-6 rounded-[28px] border border-border bg-card p-6 sm:p-8 xl:grid-cols-[1.1fr_1fr] xl:items-center">
          <div>
            <SectionChip icon={CalendarDays} label={org?.name || "Organiser dashboard"} />
            <PosterTitle as="h1" immediate text="Run every event from one place" className="mt-4 text-[clamp(40px,5vw,68px)]" />
            <p className="mt-3 max-w-md text-[14px] leading-relaxed text-muted-foreground sm:text-[15px]">
              Start a task below, or pick an event to manage it.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <StatTile icon={CalendarDays} label="Total events" value={String(events.length)} hint="Everything in this workspace" />
            <StatTile icon={Radio} label="Live now" value={String(liveCount)} hint="Published and not yet ended" />
            <StatTile icon={PencilLine} label="Pending" value={String(tabCounts.pending)} hint="Drafts waiting to publish" />
            <StatTile icon={Ticket} label="Tickets sold" value={ticketsSold.toLocaleString("en-US")} hint="Across all events" />
          </div>
        </section>

        {/* Tasks */}
        <section aria-labelledby="tasks-heading">
          <h2 id="tasks-heading" className="eyebrow text-muted-foreground">What do you want to do?</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
            {tasks.map((task, i) => (
              <TaskTile key={task.title} step={i + 1} {...task} />
            ))}
          </div>
        </section>

        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section aria-labelledby="events-heading" className="min-w-0 space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 id="events-heading" className="text-[20px] font-bold tracking-tight">Your events</h2>
              <p className="text-[13px] text-muted-foreground">Manage all your events in one place</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {/* Tabs */}
              <div className="flex w-full rounded-full border border-border bg-card p-1 sm:w-fit">
                {TIME_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setTimeFilter(tab.key)}
                    aria-pressed={timeFilter === tab.key}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors duration-200 sm:flex-none sm:px-4 ${
                      timeFilter === tab.key
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab.label}
                    <span className={`text-[11px] font-medium ${timeFilter === tab.key ? "opacity-70" : "text-muted-foreground"}`}>
                      {tabCounts[tab.key]}
                    </span>
                  </button>
                ))}
              </div>
              {/* Search */}
              <div className="relative sm:w-60">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search events..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rounded-full bg-card pl-10"
                />
              </div>
            </div>
          </div>

        {/* Event Form */}
        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card border border-border rounded-2xl p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{editingEvent ? "Edit Event" : "Create New Event"}</h3>
              <button onClick={resetForm} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Label>Title</Label>
                <Input
                  value={title}
                  onChange={(e) => {
                    const v = e.target.value;
                    setTitle(v);
                    if (!slugTouched) {
                      setSlug(v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60));
                    }
                  }}
                  required
                  className="mt-1"
                />
              </div>
              <div className="md:col-span-2">
                <Label className="flex items-center gap-1.5"><LinkIcon className="h-3.5 w-3.5" /> URL slug</Label>
                <div className="flex flex-col sm:flex-row sm:items-center mt-1">
                  <span className="px-3 h-10 inline-flex items-center text-[12px] text-muted-foreground bg-muted border border-input rounded-t-md sm:rounded-t-none sm:rounded-l-md sm:border-r-0 whitespace-nowrap overflow-hidden">
                    /org/{"<workspace>"}/events/
                  </span>
                  <Input
                    value={slug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-"));
                    }}
                    placeholder="my-event-name"
                    className="rounded-t-none sm:rounded-t-md sm:rounded-l-none border-t-0 sm:border-t"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Auto-generated from the title. Lowercase letters, numbers and hyphens only. A unique suffix is added automatically if this slug is already taken.
                </p>
              </div>
              <div className="md:col-span-2">
                <Label>Description</Label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1 w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Describe your event..."
                />
              </div>
              <div>
                <Label>Start Date & Time</Label>
                <Input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} required className="mt-1" />
              </div>
              <div>
                <Label>End Date & Time</Label>
                <Input type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Venue</Label>
                <Input value={venue} onChange={(e) => setVenue(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Location</Label>
                <Input value={location} onChange={(e) => setLocation(e.target.value)} className="mt-1" placeholder="City, Country" />
              </div>
              <div>
                <Label>Capacity</Label>
                <Input type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Price ($)</Label>
                <Input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="mt-1" />
              </div>
              <div className="md:col-span-2">
                <Label className="mb-1 block">Event images</Label>
                <p className="text-[11px] text-muted-foreground mb-3">
                  Cover (square) shows on listings. Landscape on desktop/tablet, portrait on phones (falls back to landscape).
                </p>
                <div className="space-y-4">
                  {/* Cover image — its own row, capped width */}
                  <div className="max-w-[280px]">
                    <EventCoverPicker
                      eventId={editingEvent?.id}
                      userId={user!.id}
                      imageUrl={imageUrl}
                      onChange={setImageUrl}
                    />
                  </div>
                  {/* Landscape + Portrait — side by side */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <EventBannerPicker
                      eventId={editingEvent?.id}
                      userId={user!.id}
                      label="Landscape banner (desktop)"
                      imageUrl={bannerLandscapeUrl}
                      aspect={16 / 9}
                      aspectLabel="16:9 (landscape)"
                      recommendedPx="1920×1080 px"
                      variant="landscape"
                      onChange={(url) => setBannerLandscapeUrl(url || "")}
                    />
                    <EventBannerPicker
                      eventId={editingEvent?.id}
                      userId={user!.id}
                      label="Portrait banner (mobile)"
                      imageUrl={bannerPortraitUrl}
                      aspect={4 / 5}
                      aspectLabel="4:5 (portrait)"
                      recommendedPx="1080×1350 px"
                      variant="portrait"
                      onChange={(url) => setBannerPortraitUrl(url || "")}
                    />
                  </div>
                </div>
              </div>
              <div>
                <Label>Status</Label>
                <select value={status} onChange={(e) => setStatus(e.target.value)} className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="completed">Completed</option>
                </select>
              </div>

              {/* Community Settings */}
              <div className="md:col-span-2">
                <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Users2 className="h-4 w-4 text-primary" />
                    <h4 className="text-[13px] font-semibold">Community Settings</h4>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[13px] font-medium">Create a community for this event</p>
                      <p className="text-[12px] text-muted-foreground">Automatically set up a discussion space for attendees, speakers and sponsors.</p>
                    </div>
                    <Switch
                      id="create-community-toggle"
                      checked={createCommunity}
                      onCheckedChange={setCreateCommunity}
                    />
                  </div>
                  {createCommunity && (
                    <div>
                      <p className="text-[11px] text-muted-foreground mt-1">A dedicated discussion space will be created for this event.</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="md:col-span-2 flex gap-3">
                <Button type="submit" disabled={submitting} className="hero-gradient text-primary-foreground font-semibold">
                  {submitting
                    ? (editingEvent ? "Updating…" : "Creating…")
                    : (editingEvent ? "Update Event" : "Create Event")}
                </Button>
                <Button type="button" variant="outline" disabled={submitting} onClick={resetForm}>Cancel</Button>
              </div>
            </form>
          </motion.div>
        )}

        {/* Events Grid */}
        {loading ? (
          <div className="rounded-2xl border border-border bg-card py-12 text-center text-muted-foreground">Loading events...</div>
        ) : filteredEvents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
            <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl border border-accent/45 bg-accent/10 text-accent">
              <Calendar className="h-5 w-5" />
            </span>
            <h3 className="text-lg font-semibold mb-2">No events found</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery || timeFilter !== "upcoming" ? "Try adjusting your filters." : "Create your first event to get started."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {filteredEvents.map((event, i) => {
              const eventPath = `/dashboard/events/${event.slug ?? event.id}`;
              return (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => navigate(eventPath)}
                  className="group flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-border bg-card transition-colors duration-300 hover:border-accent/60"
                >
                  {/* Cover image */}
                  <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-secondary">
                    {(event.banner_landscape_url || event.image_url) ? (
                      <img src={event.banner_landscape_url || event.image_url!} alt={event.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <Calendar className="h-10 w-10 text-muted-foreground/50" />
                    )}
                    {/* Manage overlay hint on hover */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <span className="bg-white/90 text-black text-[12px] font-semibold px-3 py-1 rounded-full flex items-center gap-1.5 shadow">
                        <ArrowRight className="h-3.5 w-3.5" /> Manage Event
                      </span>
                    </div>
                    <DateBlock date={event.date} className="absolute left-3 top-3" />
                    <span className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${statusColor[event.status] || "bg-muted text-muted-foreground"}`}>
                      {event.status}
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col gap-3 p-4">
                    <h3 className="line-clamp-1 text-[16px] font-bold tracking-normal">{event.title}</h3>

                    {event.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{stripRichText(event.description)}</p>
                    )}

                    <div className="space-y-1 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 shrink-0" />
                        {new Date(event.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </div>
                      {event.venue && (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{event.venue}{event.location ? `, ${event.location}` : ""}</span>
                        </div>
                      )}
                    </div>

                    {/* Ticket count */}
                    <div className="mt-auto">
                      <div className="flex items-center justify-between text-[12px] text-muted-foreground">
                        <span>
                          <span className="font-semibold text-foreground">{event.tickets_sold ?? 0}</span>/{event.capacity || "∞"} tickets
                        </span>
                        {Number(event.price || 0) > 0 && (
                          <span className="font-semibold text-foreground">{formatMoney(Number(event.price), event.currency || undefined)}</span>
                        )}
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${capacityPct(event)}%` }} />
                      </div>
                    </div>

                    {/* Footer — action buttons */}
                    <div
                      className="flex items-center justify-between gap-2 border-t border-border pt-3"
                      onClick={(e) => e.stopPropagation()} // prevent card navigation when clicking action row
                    >
                      {/* Manage button — primary action */}
                      <Button
                        size="sm"
                        className="h-8 gap-1 rounded-full px-4 text-[12px] font-semibold"
                        onClick={() => navigate(eventPath)}
                      >
                        Manage <ArrowRight className="h-3 w-3" />
                      </Button>

                      <div className="flex items-center gap-1">
                        {/* Edit icon */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-full"
                          title="Quick edit"
                          onClick={(e) => { e.stopPropagation(); openEditForm(event); }}
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>

                        {/* Delete icon */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-full"
                          title="Delete event"
                          onClick={(e) => { e.stopPropagation(); deleteEvent(event.id); }}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
        </section>

        {/* Schedule rail */}
        <aside className="space-y-4 xl:sticky xl:top-6">
          <div className="rounded-2xl border border-accent/40 bg-card p-5">
            <span className="eyebrow !text-[10px] text-accent">Next up</span>
            {nextEvent ? (
              <>
                <div className="mt-3 flex items-start gap-3">
                  <DateBlock date={nextEvent.date} />
                  <div className="min-w-0">
                    <h3 className="line-clamp-2 text-[15px] font-bold leading-snug tracking-normal">{nextEvent.title}</h3>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">
                      {daysToNext === 0 ? "Happening now or today" : `In ${daysToNext} day${daysToNext === 1 ? "" : "s"}`}
                    </p>
                  </div>
                </div>
                <div className="mt-4">
                  <div className="flex items-center justify-between text-[12px] text-muted-foreground">
                    <span>Tickets</span>
                    <span>
                      <span className="font-semibold text-foreground">{nextEvent.tickets_sold ?? 0}</span>/{nextEvent.capacity || "∞"}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${capacityPct(nextEvent)}%` }} />
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button asChild size="sm" className="col-span-2 h-9 rounded-full text-[13px] font-semibold">
                    <Link to={eventDashboardPath(nextEvent)}>Manage event <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
                  </Button>
                  <Button asChild size="sm" variant="outline" className="h-9 rounded-full text-[12px]">
                    <Link to={`/dashboard/events/${nextEvent.id}/guests`}><Users2 className="mr-1.5 h-3.5 w-3.5" /> Guests</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline" className="h-9 rounded-full text-[12px]">
                    <Link to={eventPublicPath(nextEvent, org?.slug)} target="_blank" rel="noreferrer">
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Public page
                    </Link>
                  </Button>
                </div>
              </>
            ) : (
              <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
                Nothing scheduled yet. Create an event and it will show up here.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-bold tracking-normal">Schedule</h3>
              <span className="text-[12px] text-muted-foreground">{schedule.length} coming up</span>
            </div>
            {schedule.length === 0 ? (
              <p className="mt-3 text-[13px] text-muted-foreground">No upcoming events.</p>
            ) : (
              <ul className="mt-3 space-y-1">
                {schedule.slice(0, 5).map((e) => (
                  <li key={e.id}>
                    <Link
                      to={eventDashboardPath(e)}
                      className="group flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-secondary"
                    >
                      <DateBlock date={e.date} className="!h-11 !w-11" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-foreground">{e.title}</p>
                        <p className="truncate text-[11px] capitalize text-muted-foreground">
                          {e.status}{e.venue ? ` · ${e.venue}` : ""}
                        </p>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default EventsPage;
