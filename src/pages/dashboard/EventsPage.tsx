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
import { useNavigate } from "react-router-dom";
import {
  Plus, Calendar, Edit, Trash2, X, Search,
  MapPin, Clock, Link as LinkIcon, ArrowRight, ExternalLink, Settings2, Users2,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Tables } from "@/integrations/supabase/types";
import EventCoverPicker from "@/components/event/EventCoverPicker";
import EventBannerPicker from "@/components/event/EventBannerPicker";
import { eventPublicPath, eventDashboardPath } from "@/lib/event-routes";
import { formatMoney } from "@/lib/currency";

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

const EventsPage = () => {
  const { user } = useAuth();
  const { org } = useOrg();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
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
      .order("date", { ascending: false });
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

    if (editingEvent) {
      const { error } = await supabase.from("events").update(eventData as never).eq("id", editingEvent.id);
      if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
      else toast({ title: "Event updated successfully" });
      resetForm();
      fetchEvents();
    } else {
      // Try inserting with the chosen slug. If there's a slug collision (23505),
      // append a short random suffix and retry once.
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
  };

  const deleteEvent = async (id: string) => {
    const { error } = await supabase.from("events").delete().eq("id", id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Event deleted" }); fetchEvents(); }
  };

  const filteredEvents = events.filter((e) => {
    const matchesSearch = e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.venue || "").toLowerCase().includes(searchQuery.toLowerCase());
    
    const now = new Date();
    const eventDate = new Date(e.date);
    let matchesTime = true;
    
    if (timeFilter === "upcoming") {
      matchesTime = eventDate >= now || e.status === "draft";
    } else if (timeFilter === "past") {
      matchesTime = eventDate < now && e.status !== "draft" && e.status !== "cancelled";
    } else if (timeFilter === "pending") {
      matchesTime = e.status === "draft" || e.status === "pending";
    }

    return matchesSearch && matchesTime;
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Events</h1>
            <p className="text-muted-foreground text-sm">Manage all your events in one place</p>
          </div>
          <Button onClick={() => navigate("/dashboard/events/new")} className="hero-gradient text-primary-foreground font-semibold">
            <Plus className="h-4 w-4 mr-1" /> Create Event
          </Button>
        </div>

        {/* Search and Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search events..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Tabs Above Grid */}
        <div className="flex bg-muted/40 p-1 rounded-full w-full sm:w-fit max-w-full border border-border/50 shadow-sm">
          <button 
            onClick={() => setTimeFilter("upcoming")} 
            className={`flex-1 sm:flex-none px-3 sm:px-5 py-1.5 rounded-full text-[13px] font-medium transition-all duration-200 ${timeFilter === 'upcoming' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-background/50'}`}
          >
            Upcoming
          </button>
          <button 
            onClick={() => setTimeFilter("pending")} 
            className={`flex-1 sm:flex-none px-3 sm:px-5 py-1.5 rounded-full text-[13px] font-medium transition-all duration-200 ${timeFilter === 'pending' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-background/50'}`}
          >
            Pending
          </button>
          <button 
            onClick={() => setTimeFilter("past")} 
            className={`flex-1 sm:flex-none px-3 sm:px-5 py-1.5 rounded-full text-[13px] font-medium transition-all duration-200 ${timeFilter === 'past' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-background/50'}`}
          >
            Past
          </button>
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
                <Button type="submit" className="hero-gradient text-primary-foreground font-semibold">
                  {editingEvent ? "Update Event" : "Create Event"}
                </Button>
                <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button>
              </div>
            </form>
          </motion.div>
        )}

        {/* Events Grid */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading events...</div>
        ) : filteredEvents.length === 0 ? (
          <div className="text-center py-16 bg-card border border-border rounded-xl card-shadow">
            <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No events found</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery || timeFilter !== "upcoming" ? "Try adjusting your filters." : "Create your first event to get started."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredEvents.map((event, i) => {
              const eventPath = `/dashboard/events/${event.slug ?? event.id}`;
              return (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => navigate(eventPath)}
                  className="bg-card border border-border rounded-xl overflow-hidden card-shadow hover:shadow-lg hover:border-primary/30 transition-all cursor-pointer group"
                >
                  {/* Cover image */}
                  <div className="aspect-video bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center relative overflow-hidden">
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
                  </div>

                  <div className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold line-clamp-1 group-hover:text-primary transition-colors">{event.title}</h3>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${statusColor[event.status] || ""}`}>
                        {event.status}
                      </span>
                    </div>

                    {event.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{event.description}</p>
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

                    {/* Footer — ticket count + action buttons */}
                    <div
                      className="flex items-center justify-between pt-2 border-t border-border"
                      onClick={(e) => e.stopPropagation()} // prevent card navigation when clicking action row
                    >
                      <span className="text-[12px] text-muted-foreground">
                        {event.tickets_sold ?? 0}/{event.capacity || "∞"} tickets
                        {Number(event.price || 0) > 0 && ` · ${formatMoney(Number(event.price), event.currency || undefined)}`}
                      </span>

                      <div className="flex items-center gap-1">
                        {/* Manage button — primary action */}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px] px-2 gap-1"
                          onClick={() => navigate(eventPath)}
                        >
                          Manage <ArrowRight className="h-3 w-3" />
                        </Button>

                        {/* Edit icon */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Quick edit"
                          onClick={(e) => { e.stopPropagation(); openEditForm(event); }}
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>

                        {/* Delete icon */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
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
      </div>
    </DashboardLayout>
  );
};

export default EventsPage;
