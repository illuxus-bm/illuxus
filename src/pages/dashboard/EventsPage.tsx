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
  MapPin, Clock, Link as LinkIcon, ArrowRight, ExternalLink, Settings2, Users2, MoreVertical,
  CalendarDays, Ticket, Megaphone, Building2, FileText, Users, PencilLine, Radio,
  type LucideIcon,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
  draft: "text-muted-foreground",
  published: "text-emerald-600 dark:text-emerald-400",
  cancelled: "text-red-600 dark:text-red-400",
  completed: "text-sky-600 dark:text-sky-400",
};

/** Headline number on the overview row. */
function StatTile({ icon: Icon, label, value, hint }: { icon: LucideIcon; label: string; value: string; hint: string }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-muted-foreground">{label}</span>
        <span className="h-8 w-8 shrink-0 rounded-xl bg-muted flex items-center justify-center text-muted-foreground">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 text-[28px] leading-none font-medium tracking-tight tabular-nums">{value}</p>
      <p className="mt-1.5 text-[12px] text-muted-foreground truncate">{hint}</p>
    </div>
  );
}

/** One job the organiser can start from the dashboard. */
function TaskTile({ icon: Icon, title, hint, to }: { icon: LucideIcon; title: string; hint: string; to: string }) {
  return (
    <Link
      to={to}
      className="group bg-card border border-border rounded-2xl p-4 flex items-start gap-3 hover:shadow-[0_18px_40px_-24px_rgb(0_0_0/0.28)] hover:-translate-y-0.5 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="h-9 w-9 shrink-0 rounded-xl bg-muted flex items-center justify-center text-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium tracking-tight">{title}</span>
        <span className="block text-[12px] text-muted-foreground mt-0.5">{hint}</span>
      </span>
      <ArrowRight className="h-3.5 w-3.5 mt-1 shrink-0 text-muted-foreground group-hover:translate-x-0.5 group-hover:text-foreground transition-all" />
    </Link>
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

  const filteredEvents = events
    .filter((e) => {
      const matchesSearch = e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (e.venue || "").toLowerCase().includes(searchQuery.toLowerCase());

      const now = new Date();
      // Treat an event as ongoing/upcoming until its END date passes (or its
      // START date if no end was set). That way a 3-day conference still shows
      // in Upcoming on day 2, and flips into Past on day 3 + 1.
      const endOrStart = new Date(e.end_date || e.date);
      let matchesTime = true;

      if (timeFilter === "upcoming") {
        matchesTime = endOrStart >= now || e.status === "draft";
      } else if (timeFilter === "past") {
        matchesTime = endOrStart < now && e.status !== "draft" && e.status !== "cancelled";
      } else if (timeFilter === "pending") {
        matchesTime = e.status === "draft" || e.status === "pending";
      }

      return matchesSearch && matchesTime;
    })
    .sort((a, b) => {
      const ta = new Date(a.date).getTime();
      const tb = new Date(b.date).getTime();
      // Past tab: most recent first (descending). All other tabs: soonest first (ascending).
      return timeFilter === "past" ? tb - ta : ta - tb;
    });

  // Overview, all derived from the events already loaded.
  const now = new Date();
  const notEnded = (e: Event) => new Date(e.end_date || e.date) >= now;
  const liveCount = events.filter((e) => e.status === "published" && notEnded(e)).length;
  const pendingCount = events.filter((e) => e.status === "draft" || e.status === "pending").length;
  const ticketsSold = events.reduce((sum, e) => sum + (e.tickets_sold ?? 0), 0);

  // The soonest event still to come; `events` is already date-ascending.
  const comingUp = events.filter((e) => e.status !== "cancelled" && notEnded(e));
  const nextEvent = comingUp.find((e) => e.status === "published") ?? comingUp[0];
  const daysToNext = nextEvent
    ? Math.max(0, Math.ceil((new Date(nextEvent.date).getTime() - now.getTime()) / 86_400_000))
    : 0;

  // Same scoping as the sidebar: viewers don't get Marketing.
  const tasks = [
    { icon: Plus, title: "Create an event", hint: "Name, date and venue", to: "/dashboard/events/new" },
    { icon: Ticket, title: "Sell tickets", hint: "Sales and who is coming", to: "/dashboard/tickets" },
    ...(myRole === "viewer" ? [] : [
      { icon: Megaphone, title: "Promote it", hint: "Campaigns and emails", to: "/dashboard/marketing" },
    ]),
    { icon: Building2, title: "Set up your brand", hint: "Details, brand kit, landing page", to: "/dashboard/organization" },
    { icon: Users, title: "Grow community", hint: "Keep attendees talking", to: "/community" },
    { icon: FileText, title: "Check reports", hint: "Numbers and exports", to: "/dashboard/reports" },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Events</h1>
            <p className="text-muted-foreground text-sm">Manage all your events in one place</p>
          </div>
          <Button onClick={() => navigate("/dashboard/events/new")} className="h-10 rounded-xl px-4 font-medium">
            <Plus className="h-4 w-4 mr-1.5" /> New Event
          </Button>
        </div>

        {/* Overview */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
          <StatTile icon={CalendarDays} label="Total events" value={String(events.length)} hint="In this workspace" />
          <StatTile icon={Radio} label="Live now" value={String(liveCount)} hint="Published, not yet ended" />
          <StatTile icon={PencilLine} label="Pending" value={String(pendingCount)} hint="Drafts waiting to publish" />
          <StatTile icon={Ticket} label="Tickets sold" value={ticketsSold.toLocaleString("en-US")} hint="Across all events" />
        </div>

        {/* Tasks, with the next event beside them */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <section aria-labelledby="tasks-heading" className="xl:col-span-2 min-w-0">
            <h2 id="tasks-heading" className="text-[13px] font-medium text-muted-foreground mb-3">What do you want to do?</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {tasks.map((task) => (
                <TaskTile key={task.title} {...task} />
              ))}
            </div>
          </section>

          <section aria-labelledby="next-heading" className="min-w-0 flex flex-col">
            <h2 id="next-heading" className="text-[13px] font-medium text-muted-foreground mb-3">Next up</h2>
            <div className="bg-card border border-border rounded-2xl p-5 flex-1 flex flex-col">
              {nextEvent ? (
                <>
                  <div className="flex items-start gap-3.5">
                    <div className="flex flex-col items-center rounded-xl bg-muted px-3.5 py-2 shrink-0">
                      <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        {new Date(nextEvent.date).toLocaleDateString("en-US", { month: "short" })}
                      </span>
                      <span className="text-[22px] leading-none font-medium tracking-tight mt-0.5">{new Date(nextEvent.date).getDate()}</span>
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-[16px] leading-snug font-medium tracking-tight line-clamp-2" title={nextEvent.title}>{nextEvent.title}</h3>
                      <p className="text-[13px] text-muted-foreground mt-0.5">
                        {daysToNext === 0 ? "Happening now or today" : `In ${daysToNext} day${daysToNext === 1 ? "" : "s"}`}
                      </p>
                    </div>
                  </div>
                  <p className="mt-4 text-[13px] text-muted-foreground">
                    <span className="text-foreground font-medium">{nextEvent.tickets_sold ?? 0}</span>
                    {Number(nextEvent.capacity) > 0 ? ` of ${nextEvent.capacity} tickets` : " tickets"}
                  </p>
                  <div className="mt-auto pt-4 grid grid-cols-2 gap-2">
                    <Button asChild className="col-span-2 h-10 rounded-xl font-medium">
                      <Link to={eventDashboardPath(nextEvent)}>Manage event <ArrowRight className="h-3.5 w-3.5 ml-1.5" /></Link>
                    </Button>
                    <Button asChild variant="outline" className="h-10 rounded-xl font-medium">
                      <Link to={`/dashboard/events/${nextEvent.id}/guests`}><Users2 className="h-3.5 w-3.5 mr-1.5" /> Guests</Link>
                    </Button>
                    <Button asChild variant="outline" className="h-10 rounded-xl font-medium">
                      <Link to={eventPublicPath(nextEvent, org?.slug)} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Public page
                      </Link>
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-[13px] text-muted-foreground">
                  Nothing scheduled yet. Create an event and it will show up here.
                </p>
              )}
            </div>
          </section>
        </div>

        {/* Filter and search on one row */}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex bg-muted p-1 rounded-xl w-full sm:w-fit" role="tablist" aria-label="Which events to show">
            {([["upcoming", "Upcoming"], ["pending", "Pending"], ["past", "Past"]] as const).map(([value, label]) => (
              <button
                key={value}
                role="tab"
                aria-selected={timeFilter === value}
                onClick={() => setTimeFilter(value)}
                className={`flex-1 sm:flex-none px-4 h-8 rounded-lg text-[13px] font-medium transition-colors ${timeFilter === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search events..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-10 rounded-xl bg-muted/60 border-transparent focus-visible:bg-background"
            />
          </div>
        </div>

        {/* Event Form */}
        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card border border-border rounded-xl p-6 card-shadow"
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
                <Button type="submit" disabled={submitting} className="font-medium">
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
          <div className="text-center py-12 text-muted-foreground">Loading events...</div>
        ) : filteredEvents.length === 0 ? (
          <div className="text-center py-16 bg-card border border-border rounded-2xl">
            <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No events found</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery || timeFilter !== "upcoming" ? "Try adjusting your filters." : "Create your first event to get started."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filteredEvents.map((event, i) => {
              const eventPath = `/dashboard/events/${event.slug ?? event.id}`;
              const start = new Date(event.date);
              const sold = event.tickets_sold ?? 0;
              const capacity = Number(event.capacity) || 0;
              const filled = capacity > 0 ? Math.min(100, Math.round((sold / capacity) * 100)) : 0;
              const cover = event.banner_landscape_url || event.image_url;
              return (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => navigate(eventPath)}
                  className="bg-card border border-border rounded-2xl p-3 hover:shadow-[0_18px_40px_-24px_rgb(0_0_0/0.28)] hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group flex flex-col"
                >
                  {/* Cover: the banner, shown whole at its own 16:9 shape with
                      nothing laid over it; or the date when there is no banner. */}
                  <div className="aspect-video rounded-xl bg-muted/70 overflow-hidden flex items-center justify-center">
                    {cover ? (
                      <img src={cover} alt="" loading="lazy" className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center rounded-2xl bg-card px-6 py-3.5 shadow-[0_10px_30px_-12px_rgb(0_0_0/0.25)] border border-border/70">
                        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                          {start.toLocaleDateString("en-US", { month: "short" })}
                        </span>
                        <span className="text-[34px] leading-none font-medium tracking-tight mt-1">{start.getDate()}</span>
                      </div>
                    )}
                  </div>

                  <div className="px-2 pt-4 pb-2 flex-1 flex flex-col">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <span className={`inline-flex items-center gap-1.5 text-[11.5px] font-medium capitalize ${statusColor[event.status] || ""}`}>
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                          {event.status}
                        </span>
                        <h3 className="mt-1.5 text-[17px] leading-snug font-medium tracking-tight line-clamp-1" title={event.title}>{event.title}</h3>
                      </div>
                      <div className="-mr-1 -mt-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button type="button" className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" aria-label={`Options for ${event.title}`}>
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem onClick={() => navigate(eventPath)}>
                              <ArrowRight className="h-3.5 w-3.5 mr-2" /> Manage
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEditForm(event)}>
                              <Edit className="h-3.5 w-3.5 mr-2" /> Quick edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => deleteEvent(event.id)} className="text-destructive focus:text-destructive">
                              <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    <div className="mt-2.5 space-y-1.5 text-[13px] text-muted-foreground">
                      <p className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5 shrink-0" />
                        {start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                      </p>
                      <p className="flex items-center gap-2 min-w-0">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{event.venue ? `${event.venue}${event.location ? `, ${event.location}` : ""}` : event.location || "Venue not set"}</span>
                      </p>
                    </div>

                    <div className="mt-auto pt-4">
                      <div className="border-t border-border pt-3.5 flex items-baseline justify-between gap-3 text-[13px]">
                        <span className="text-muted-foreground truncate">
                          <span className="text-foreground font-medium">{sold}</span>
                          {capacity > 0 ? ` of ${capacity} tickets` : " tickets"}
                          {Number(event.price || 0) > 0 && ` · ${formatMoney(Number(event.price), event.currency || undefined)}`}
                        </span>
                        {capacity > 0 && <span className="font-medium tabular-nums shrink-0">{filled}%</span>}
                      </div>
                      {capacity > 0 && (
                        <div className="meter meter-sm mt-2.5" role="img" aria-label={`${filled}% of tickets taken`}>
                          {filled > 0 && <div className="meter-fill" style={{ width: `${filled}%` }} />}
                          <div className="meter-mark" />
                          <div className="meter-rest" />
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default EventsPage;
