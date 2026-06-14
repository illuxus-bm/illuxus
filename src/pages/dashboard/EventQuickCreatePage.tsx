import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { CalendarDays, MapPin, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import EventBannerPicker from "@/components/event/EventBannerPicker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Radio, Globe2, MapPinned, Sparkles } from "lucide-react";
import { SUPPORTED_CURRENCIES, formatMoney, formatPriceOrFree } from "@/lib/currency";
import { COMMON_TIMEZONES, detectBrowserTimezone, isValidTimezone } from "@/lib/timezones";
import { formatEventDateTime } from "@/lib/datetime";

/** Lu.ma-style one-screen event create. Saves a draft, then opens manage hub. */
export default function EventQuickCreatePage() {
  const { user } = useAuth();
  const { org, hasAddon } = useOrg();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [venue, setVenue] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [bannerLandscapeUrl, setBannerLandscapeUrl] = useState("");
  const [bannerPortraitUrl, setBannerPortraitUrl] = useState("");
  const [capacity, setCapacity] = useState("");
  const [price, setPrice] = useState("");
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currency, setCurrency] = useState("INR");
  const [timezone, setTimezone] = useState<string>(detectBrowserTimezone());
  const [eventFormat, setEventFormat] = useState<"physical" | "virtual" | "hybrid">("physical");
  const [virtualProvider, setVirtualProvider] = useState<"builtin" | "zoom" | "meet" | "youtube" | "external">("builtin");
  const [virtualUrl, setVirtualUrl] = useState("");
  const [previousEventId, setPreviousEventId] = useState<string>("none");
  const [pastEvents, setPastEvents] = useState<Array<{ id: string; title: string; date: string }>>([]);

  // Load this org's previous events so the user can mark this one as a follow-up.
  useEffect(() => {
    if (!org?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("events")
        .select("id, title, date")
        .eq("org_id", org.id)
        .order("date", { ascending: false })
        .limit(50);
      if (cancelled) return;
      setPastEvents((data ?? []) as Array<{ id: string; title: string; date: string }>);
    })();
    return () => { cancelled = true; };
  }, [org?.id]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!isValidTimezone(timezone)) {
      toast({
        title: "Invalid timezone",
        description: `"${timezone}" isn't a recognized IANA timezone. Pick one from the list.`,
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    const payload = {
      title,
      slug: "",
      description: description || null,
      date: new Date(date).toISOString(),
      end_date: endDate ? new Date(endDate).toISOString() : null,
      venue: eventFormat === "virtual" ? null : venue || null,
      location: location || null,
      capacity: capacity ? parseInt(capacity) : 0,
      price: price ? parseFloat(price) : 0,
      currency,
      timezone: timezone || null,
      image_url: null,
      banner_landscape_url: bannerLandscapeUrl || null,
      banner_portrait_url: bannerPortraitUrl || null,
      status: "draft",
      user_id: user.id,
      org_id: org?.id ?? null,
      requires_approval: requiresApproval,
      event_format: eventFormat,
      virtual_provider: eventFormat === "physical" ? null : virtualProvider,
      virtual_url: eventFormat !== "physical" && virtualProvider !== "builtin" ? (virtualUrl || null) : null,
      previous_event_id: previousEventId === "none" ? null : previousEventId,
    };
    const { data, error } = await supabase.from("events").insert(payload as never).select("id, slug").single();
    setSaving(false);
    if (error) {
      toast({ title: "Could not create event", description: error.message, variant: "destructive" });
      return;
    }
    if (eventFormat !== "physical" && virtualProvider === "builtin" && hasAddon("webinar")) {
      await supabase.functions.invoke("livekit-room-create", {
        body: { event_id: data.id, record_enabled: false },
      }).catch(() => {});
    }
    toast({ title: "Draft created", description: "Add details, then publish." });
    navigate(`/dashboard/events/${data.slug || data.id}`);
  };

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto">
        <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeft className="h-3.5 w-3.5" /> All events
        </Link>
        <h1 className="text-xl font-semibold tracking-tight mb-1">Create event</h1>
        <p className="text-[13px] text-muted-foreground mb-6">Add the basics. You can refine the page, sessions and tickets after.</p>

        <form onSubmit={create} className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
          <div className="p-5 sm:p-6 space-y-3">
            <div>
              <h3 className="text-[13px] font-semibold tracking-tight">Event banner</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Desktop uses the landscape image. Mobile uses the portrait — falls back to landscape if empty.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <EventBannerPicker
                userId={user?.id ?? ""}
                label="Desktop banner"
                aspect={16 / 9}
                aspectLabel="16:9 (landscape)"
                recommendedPx="1920×1080 px"
                outputLongSide={1920}
                variant="landscape"
                imageUrl={bannerLandscapeUrl}
                onChange={setBannerLandscapeUrl}
              />
              <EventBannerPicker
                userId={user?.id ?? ""}
                label="Mobile banner"
                aspect={4 / 5}
                aspectLabel="4:5 (portrait)"
                recommendedPx="1080×1350 px"
                outputLongSide={1350}
                variant="portrait"
                imageUrl={bannerPortraitUrl}
                onChange={setBannerPortraitUrl}
              />
            </div>
          </div>

          <div className="p-5 sm:p-6 space-y-5">

          <div>
            <Label className="text-[12px]">Event name</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Founders dinner" className="h-9 mt-1 text-sm" />
          </div>

          <div>
            <Label className="text-[12px]">Event format</Label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {([
                { v: "physical", icon: MapPinned, label: "In person" },
                { v: "virtual", icon: Globe2, label: "Virtual" },
                { v: "hybrid", icon: Radio, label: "Hybrid" },
              ] as const).map(({ v, icon: Icon, label }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setEventFormat(v)}
                  className={`flex flex-col items-center gap-1 rounded-md border px-3 py-2.5 text-[12px] transition ${
                    eventFormat === v
                      ? "border-foreground bg-foreground text-background shadow-sm"
                      : "border-border bg-background hover:bg-muted/50 text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {eventFormat !== "physical" && (
            <div className="space-y-3 rounded-md border border-border p-3 bg-background">
              <div>
                <Label className="text-[12px]">Streaming platform</Label>
                <Select value={virtualProvider} onValueChange={(v) => setVirtualProvider(v as typeof virtualProvider)}>
                  <SelectTrigger className="h-9 mt-1 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="builtin">Built-in webinar studio</SelectItem>
                    <SelectItem value="zoom">Zoom</SelectItem>
                    <SelectItem value="meet">Google Meet</SelectItem>
                    <SelectItem value="youtube">YouTube Live</SelectItem>
                    <SelectItem value="external">Other URL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {virtualProvider === "builtin" && !hasAddon("webinar") && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] flex items-start gap-2">
                  <Sparkles className="h-4 w-4 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium">Webinar add-on required</p>
                    <p className="text-muted-foreground">Built-in streaming, recording, Q&amp;A and networking lounge are part of the Webinar add-on.</p>
                  </div>
                  <Button asChild type="button" size="sm" variant="outline" className="h-7 text-[12px]">
                    <Link to="/dashboard/billing">Enable</Link>
                  </Button>
                </div>
              )}
              {virtualProvider !== "builtin" && (
                <div>
                  <Label className="text-[12px]">Stream URL</Label>
                  <Input value={virtualUrl} onChange={(e) => setVirtualUrl(e.target.value)} placeholder="https://…" className="h-9 mt-1 text-sm" />
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px] inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" /> Starts</Label>
              <Input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} required className="h-9 mt-1 text-sm" />
            </div>
            <div>
              <Label className="text-[12px]">Ends</Label>
              <Input type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9 mt-1 text-sm" />
            </div>
          </div>

          <div>
            <Label className="text-[12px]">Timezone</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger className="h-9 mt-1 text-sm"><SelectValue placeholder="Select timezone" /></SelectTrigger>
              <SelectContent>
                {COMMON_TIMEZONES.some((t) => t.id === timezone) ? null : (
                  <SelectItem value={timezone}>{timezone} (browser)</SelectItem>
                )}
                {COMMON_TIMEZONES.map((tz) => (
                  <SelectItem key={tz.id} value={tz.id}>{tz.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {date && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Preview: <span className="font-medium text-foreground">{formatEventDateTime(new Date(date).toISOString(), timezone)}</span>
              </p>
            )}
          </div>

          {eventFormat !== "virtual" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-[12px] inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> Venue</Label>
                <Input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Studio 23" className="h-9 mt-1 text-sm" />
              </div>
              <div>
                <Label className="text-[12px]">Location</Label>
                <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Bengaluru, India" className="h-9 mt-1 text-sm" />
              </div>
            </div>
          )}

          <div>
            <Label className="text-[12px]">Description</Label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="A short, exciting description for the event page."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-[12px]">Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="h-9 mt-1 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>{c.symbol} {c.code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[12px]">Capacity</Label>
              <Input type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="100" className="h-9 mt-1 text-sm" />
            </div>
            <div>
              <Label className="text-[12px]">Price</Label>
              <Input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0 = free" className="h-9 mt-1 text-sm" />
              <p className="text-[11px] text-muted-foreground mt-1">
                Shown as <span className="font-medium text-foreground">{formatPriceOrFree(price ? Number(price) : 0, currency)}</span>
              </p>
            </div>
          </div>

          {/* Live ticket total preview */}
          {(() => {
            const priceNum = price ? Number(price) : 0;
            const capacityNum = capacity ? Number(capacity) : 0;
            const isPaid = priceNum > 0;
            return (
              <div className="rounded-md border border-border bg-background p-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Live preview</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
                      isPaid ? "bg-foreground text-background" : "bg-secondary text-foreground"
                    }`}
                  >
                    {isPaid ? "Paid event" : "Free event"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] text-muted-foreground">Per ticket</p>
                    <p className="text-[14px] font-semibold tabular-nums">{formatPriceOrFree(priceNum, currency)}</p>
                  </div>
                  {isPaid && (
                    <div>
                      <p className="text-[11px] text-muted-foreground">Projected gross at sell-out</p>
                      <p className="text-[14px] font-semibold tabular-nums">
                        {capacityNum > 0 ? formatMoney(priceNum * capacityNum, currency) : "Set capacity"}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {pastEvents.length > 0 && (
            <div className="rounded-xl border border-border bg-background p-3 space-y-2">
              <div>
                <p className="text-[13px] font-medium">Follow-up event (optional)</p>
                <p className="text-[12px] text-muted-foreground">
                  Carry every member of the previous event's community over to this one.
                </p>
              </div>
              <Select value={previousEventId} onValueChange={setPreviousEventId}>
                <SelectTrigger className="h-9 text-[13px]">
                  <SelectValue placeholder="None — fresh community" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None — fresh community</SelectItem>
                  {pastEvents.map((e) => (
                    <SelectItem key={e.id} value={e.id} className="text-[13px]">
                      {e.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center justify-between rounded-xl border border-border bg-background p-3">
            <div className="min-w-0">
              <p className="text-[13px] font-medium">Require approval</p>
              <p className="text-[12px] text-muted-foreground">Guests request to join and you approve them.</p>
            </div>
            <Switch checked={requiresApproval} onCheckedChange={setRequiresApproval} />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button asChild type="button" variant="ghost" size="sm" className="h-9 text-[13px]"><Link to="/dashboard">Cancel</Link></Button>
            <Button type="submit" size="sm" className="h-9 text-[13px]" disabled={saving}>{saving ? "Creating…" : "Create draft"}</Button>
          </div>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}