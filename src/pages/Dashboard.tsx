import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { DashboardLayout } from "@/components/DashboardLayout";
import { motion } from "framer-motion";
import {
  Plus, Calendar, Edit, Trash2, X, Search, MapPin,
  Filter, ArrowUpDown, LayoutGrid, MoreHorizontal, Check
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Tables } from "@/integrations/supabase/types";
import EventCoverPicker from "@/components/event/EventCoverPicker";
import EventBannerPicker from "@/components/event/EventBannerPicker";

type Event = Tables<"events">;

const STATUS_TABS = [
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
  { key: "draft", label: "Drafts" },
];

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  published: "bg-accent/15 text-accent",
  cancelled: "bg-destructive/15 text-destructive",
  completed: "bg-chart-2/15 text-chart-2",
};

const Dashboard = () => {
  const { user } = useAuth();
  const { org } = useOrg();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [events, setEvents] = useState<Event[]>([]);
  const [ticketCounts, setTicketCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [activeTab, setActiveTab] = useState("upcoming");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"upcoming" | "date_desc" | "date_asc" | "updated" | "title">("date_asc");
  const [dateScope, setDateScope] = useState<"all" | "upcoming" | "past" | "this_month">("all");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
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

  const fetchEvents = async () => {
    if (!org?.id && !user?.id) {
      setLoading(false);
      return;
    }
    let query = supabase
      .from("events")
      .select("*")
      .order("date", { ascending: true });
    if (org?.id) {
      query = query.eq("org_id", org.id);
    } else if (user?.id) {
      query = query.eq("user_id", user.id);
    }
    const { data, error } = await query;
    if (!error && data) setEvents(data);
    if (!error && data && data.length) {
      const PAID = new Set(["confirmed", "approved", "registered", "paid", "checked_in"]);
      const { data: regs } = await supabase
        .from("registrations")
        .select("event_id,status")
        .in("event_id", data.map(e => e.id));
      const counts: Record<string, number> = {};
      (regs ?? []).forEach(r => {
        if (!PAID.has(r.status)) return;
        counts[r.event_id] = (counts[r.event_id] || 0) + 1;
      });
      setTicketCounts(counts);
    }
    setLoading(false);
  };

  useEffect(() => { fetchEvents(); }, [org?.id, user?.id]);

  const resetForm = () => {
    setTitle(""); setDescription(""); setDate(""); setEndDate("");
    setVenue(""); setLocation(""); setCapacity(""); setPrice("");
    setStatus("draft"); setImageUrl(""); setBannerLandscapeUrl(""); setBannerPortraitUrl(""); setEditingEvent(null); setShowForm(false);
  };

  const openEditForm = (event: Event) => {
    setEditingEvent(event);
    setTitle(event.title);
    setDescription(event.description || "");
    setDate(event.date ? new Date(event.date).toISOString().slice(0, 16) : "");
    setEndDate(event.end_date ? new Date(event.end_date).toISOString().slice(0, 16) : "");
    setVenue(event.venue || "");
    setLocation(event.location || "");
    setCapacity(String(event.capacity || ""));
    setPrice(String(event.price || ""));
    setStatus(event.status);
    setImageUrl(event.image_url || "");
    setBannerLandscapeUrl((event as { banner_landscape_url?: string | null }).banner_landscape_url || "");
    setBannerPortraitUrl((event as { banner_portrait_url?: string | null }).banner_portrait_url || "");
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !org?.id) return;
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
    };
    if (editingEvent) {
      const { error } = await supabase.from("events").update(eventData).eq("id", editingEvent.id);
      if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
      else toast({ title: "Event updated" });
    } else {
      // slug is auto-generated by DB trigger from title; pass empty string to satisfy types
      const { data: created, error } = await supabase
        .from("events")
        .insert({ ...eventData, slug: "" })
        .select("id, slug")
        .single();
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Event created" });
        resetForm();
        fetchEvents();
        // Navigate directly to the new event using its generated slug or id
        const target = created?.slug || created?.id;
        if (target) navigate(`/dashboard/events/${target}`);
        return;
      }
    }
    resetForm();
    fetchEvents();
  };

  const deleteEvent = async (id: string) => {
    const { error } = await supabase.from("events").delete().eq("id", id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Event deleted" }); fetchEvents(); }
  };

  const now = Date.now();
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const endOfMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).getTime();
  // An event counts as "still upcoming/live" until its end_date (or start date if no end).
  const effectiveEnd = (e: Event) =>
    new Date(e.end_date || e.date).getTime();
  const filteredEvents = events
    .filter((e) => {
      const tEndForTab = effectiveEnd(e);
      const matchesTab =
        (activeTab === "draft" && e.status === "draft") ||
        (activeTab === "upcoming" && (e.status === "published" || e.status === "draft") && tEndForTab >= now) ||
        (activeTab === "past" && e.status === "published" && tEndForTab < now);
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        e.title.toLowerCase().includes(q) ||
        (e.venue || "").toLowerCase().includes(q) ||
        (e.location || "").toLowerCase().includes(q) ||
        (e.description || "").toLowerCase().includes(q);
      const t = new Date(e.date).getTime();
      const tEnd = effectiveEnd(e);
      const matchesScope =
        dateScope === "all" ||
        (dateScope === "upcoming" && tEnd >= now) ||
        (dateScope === "past" && tEnd < now) ||
        (dateScope === "this_month" && t >= startOfMonth && t < endOfMonth);
      return matchesTab && matchesSearch && matchesScope;
    })
    .sort((a, b) => {
      const ta = new Date(a.date).getTime();
      const tb = new Date(b.date).getTime();
      switch (sortBy) {
        case "date_desc":
          return tb - ta;
        case "date_asc":
          return ta - tb;
        case "updated":
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        case "title":
          return a.title.localeCompare(b.title);
        case "upcoming":
        default: {
          // Upcoming/live (not yet ended) first, soonest first.
          // Past events after, oldest → newest so the timeline reads chronologically.
          const aUp = effectiveEnd(a) >= now;
          const bUp = effectiveEnd(b) >= now;
          if (aUp && !bUp) return -1;
          if (!aUp && bUp) return 1;
          return ta - tb;
        }
      }
    });

  const tabCounts: Record<string, number> = {
    upcoming: events.filter(e => (e.status === "published" || e.status === "draft") && effectiveEnd(e) >= now).length,
    past: events.filter(e => e.status === "published" && effectiveEnd(e) < now).length,
    draft: events.filter(e => e.status === "draft").length,
  };

  const formatEventDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
  };

  const timeSince = (dateStr: string) => {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 max-w-[1200px]">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Events</h1>
            <p className="text-[13px] text-muted-foreground">Manage and organize your events</p>
          </div>
          <Button asChild size="sm" className="h-8 text-[13px] font-medium gap-1">
            <Link to="/dashboard/events/new"><Plus className="h-3.5 w-3.5" /> New Event</Link>
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-border -mx-4 lg:-mx-6 px-4 lg:px-6">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-2 text-[13px] font-medium border-b-2 transition-colors -mb-px ${
                activeTab === tab.key
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
              {tabCounts[tab.key] > 0 && (
                <span className="ml-1.5 text-[11px] text-muted-foreground">
                  {tabCounts[tab.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search events..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-[13px] bg-secondary/50 border-0 focus-visible:ring-1"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" title="Filter by date">
                <Filter className={`h-3.5 w-3.5 ${dateScope !== "all" ? "text-foreground" : ""}`} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {([
                ["all", "All dates"],
                ["upcoming", "Upcoming"],
                ["past", "Past"],
                ["this_month", "This month"],
              ] as const).map(([key, label]) => (
                <DropdownMenuItem key={key} onClick={() => setDateScope(key)} className="text-[13px]">
                  <span className="flex-1">{label}</span>
                  {dateScope === key && <Check className="h-3.5 w-3.5" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" title="Sort">
                <ArrowUpDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {([
                ["upcoming", "Upcoming first"],
                ["date_desc", "Date (newest first)"],
                ["date_asc", "Date (oldest first)"],
                ["updated", "Recently updated"],
                ["title", "Title (A–Z)"],
              ] as const).map(([key, label]) => (
                <DropdownMenuItem key={key} onClick={() => setSortBy(key)} className="text-[13px]">
                  <span className="flex-1">{label}</span>
                  {sortBy === key && <Check className="h-3.5 w-3.5" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Form */}
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="bg-card border border-border rounded-lg p-5 overflow-hidden"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">{editingEvent ? "Edit Event" : "New Event"}</h3>
              <button onClick={resetForm} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <Label className="text-[13px] mb-1 block">Event images</Label>
                <p className="text-[11px] text-muted-foreground mb-3">
                  Cover (square) shows on listings. Landscape on desktop/tablet, portrait on phones (falls back to landscape).
                </p>
                <div className="space-y-4">
                  {/* Cover image — full width row, max width to keep it from being huge */}
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
              <div className="md:col-span-2">
                <Label className="text-[13px]">Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} required className="mt-1 h-8 text-sm" />
              </div>
              <div className="md:col-span-2">
                <Label className="text-[13px]">Description</Label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1 w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <Label className="text-[13px]">Start</Label>
                <Input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} required className="mt-1 h-8 text-sm" />
              </div>
              <div>
                <Label className="text-[13px]">End</Label>
                <Input type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1 h-8 text-sm" />
              </div>
              <div>
                <Label className="text-[13px]">Venue</Label>
                <Input value={venue} onChange={(e) => setVenue(e.target.value)} className="mt-1 h-8 text-sm" />
              </div>
              <div>
                <Label className="text-[13px]">Location</Label>
                <Input value={location} onChange={(e) => setLocation(e.target.value)} className="mt-1 h-8 text-sm" placeholder="City, Country" />
              </div>
              <div>
                <Label className="text-[13px]">Capacity</Label>
                <Input type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} className="mt-1 h-8 text-sm" />
              </div>
              <div>
                <Label className="text-[13px]">Price ($)</Label>
                <Input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="mt-1 h-8 text-sm" />
              </div>
              <div>
                <Label className="text-[13px]">Status</Label>
                <select value={status} onChange={(e) => setStatus(e.target.value)} className="mt-1 w-full h-8 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
              </div>
              <div className="md:col-span-2 flex gap-2 pt-1">
                <Button type="submit" size="sm" className="h-8 text-[13px]">
                  {editingEvent ? "Update" : "Create"}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={resetForm} className="h-8 text-[13px]">Cancel</Button>
              </div>
            </form>
          </motion.div>
        )}

        {/* Events list */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Loading...</div>
        ) : filteredEvents.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-border rounded-lg">
            <Calendar className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-medium mb-1">No events yet</p>
            <p className="text-[13px] text-muted-foreground mb-4">
              {searchQuery ? "Try adjusting your filters." : activeTab === "draft" ? "No drafts yet." : activeTab === "past" ? "No past events." : "Create your first event to get started."}
            </p>
            {activeTab === "upcoming" && !searchQuery && (
              <Button onClick={() => setShowForm(true)} size="sm" className="h-8 text-[13px]">
                <Plus className="h-3.5 w-3.5 mr-1" /> New Event
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            {filteredEvents.map((event, i) => (
              <motion.div
                key={event.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.02 }}
                className="flex items-center gap-4 px-3 py-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group"
                onClick={() => navigate(`/dashboard/events/${event.slug || event.id}`)}
              >
                {/* Color dot */}
                <div className={`h-2 w-2 rounded-full shrink-0 ${
                  event.status === "published" ? "bg-accent" :
                  event.status === "draft" ? "bg-muted-foreground/40" :
                  event.status === "cancelled" ? "bg-destructive" : "bg-chart-2"
                }`} />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-medium truncate min-w-0">{event.title}</h3>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${statusColors[event.status] || ""}`}>
                      {event.status}
                    </span>
                  </div>
                  <p className="text-[12px] text-muted-foreground flex items-center gap-x-3 gap-y-0.5 mt-0.5 flex-wrap">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatEventDate(event.date)}
                    </span>
                    {(event.location || event.venue) && (
                      <span className="inline-flex items-center gap-1 min-w-0">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{event.location || event.venue}</span>
                      </span>
                    )}
                  </p>
                </div>

                {/* Right */}
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right hidden sm:block">
                    <p className="text-[13px] font-medium mono">{ticketCounts[event.id] ?? 0}<span className="text-muted-foreground font-normal">/{event.capacity || "∞"}</span></p>
                    <p className="text-[11px] text-muted-foreground">{timeSince(event.updated_at)}</p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="h-8 w-8 flex items-center justify-center rounded-md sm:opacity-0 sm:group-hover:opacity-100 hover:bg-muted transition-all"
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Event actions"
                      >
                        <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-36">
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEditForm(event); }}>
                        <Edit className="h-3.5 w-3.5 mr-2" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => { e.stopPropagation(); deleteEvent(event.id); }}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;