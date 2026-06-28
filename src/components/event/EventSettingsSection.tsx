import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { supabaseRpc } from "@/lib/observability";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Trash2, Users2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { SUPPORTED_CURRENCIES, formatMoney, formatPriceOrFree } from "@/lib/currency";
import { COMMON_TIMEZONES, detectBrowserTimezone, isValidTimezone } from "@/lib/timezones";
import { formatEventDateTime, formatEventRange } from "@/lib/datetime";
import { DateTimePicker } from "@/components/ui/datetime-picker";
import MarkdownEditor from "@/components/MarkdownEditor";

interface EventForm {
  title: string;
  description: string;
  date: string; // datetime-local
  end_date: string;
  venue: string;
  location: string;
  capacity: number;
  price: number;
  currency: string;
  requires_approval: boolean;
  status: string;
  image_url: string;
  timezone: string;
  attendance_target_pct: number | null;
  previous_event_id: string | null;
  org_id: string | null;
  create_community: boolean;
  community_category: string;
  video_provider: "default" | "livekit" | "agora";
}

function toLocalInput(v: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
}

export default function EventSettingsSection({ eventId, onSaved }: { eventId: string; onSaved?: () => void }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EventForm | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("id", eventId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        toast({ title: "Could not load event", description: error?.message, variant: "destructive" });
        setLoading(false);
        return;
      }
      setForm({
        title: data.title ?? "",
        description: data.description ?? "",
        date: toLocalInput(data.date),
        end_date: toLocalInput(data.end_date),
        venue: data.venue ?? "",
        location: data.location ?? "",
        capacity: Number(data.capacity ?? 0),
        price: Number(data.price ?? 0),
        currency: (data as { currency?: string }).currency || "INR",
        requires_approval: !!data.requires_approval,
        status: data.status ?? "draft",
        image_url: data.image_url ?? "",
        timezone: data.timezone ?? detectBrowserTimezone(),
        attendance_target_pct:
          (data as { attendance_target_pct?: number | null }).attendance_target_pct ?? null,
        previous_event_id: (data as { previous_event_id?: string | null }).previous_event_id ?? null,
        org_id: (data as { org_id?: string | null }).org_id ?? null,
        create_community: (data as { create_community?: boolean | null }).create_community ?? true,
        community_category: (data as { community_category?: string | null }).community_category ?? "other",
        video_provider:
          ((data as { video_provider?: "livekit" | "agora" | null }).video_provider ?? null) === null
            ? "default"
            : ((data as { video_provider: "livekit" | "agora" }).video_provider),
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [eventId, toast]);

  // Past-events list for the "Follow-up to" select. Re-fetches when org_id is known.
  const [pastEvents, setPastEvents] = useState<Array<{ id: string; title: string }>>([]);
  useEffect(() => {
    const orgId = form?.org_id;
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("events")
        .select("id, title, date")
        .eq("org_id", orgId)
        .neq("id", eventId)
        .order("date", { ascending: false })
        .limit(50);
      if (cancelled) return;
      setPastEvents((data ?? []).map((e) => ({ id: e.id, title: e.title })));
    })();
    return () => { cancelled = true; };
  }, [form?.org_id, eventId]);

  const [resyncing, setResyncing] = useState(false);
  const resyncMembers = async () => {
    setResyncing(true);
    const { data, error } = await supabaseRpc("community_resync_from_previous" as never, {
      _event_id: eventId,
    } as never);
    setResyncing(false);
    if (error) {
      toast({ title: "Re-sync failed", description: error.message, variant: "destructive" });
      return;
    }
    const copied = Number(data) || 0;
    toast({
      title: copied > 0 ? `Carried over ${copied} member${copied === 1 ? "" : "s"}` : "Already in sync",
      description: copied > 0 ? "They were added to this event's community." : "No new members to add.",
    });
  };

  const update = <K extends keyof EventForm>(k: K, v: EventForm[K]) => {
    setForm((prev) => (prev ? { ...prev, [k]: v } : prev));
  };

  const save = async () => {
    if (!form) return;
    if (
      form.attendance_target_pct !== null &&
      (Number.isNaN(form.attendance_target_pct) ||
        form.attendance_target_pct < 0 ||
        form.attendance_target_pct > 100)
    ) {
      toast({
        title: "Invalid attendance target",
        description: "Enter a percentage between 0 and 100, or leave blank.",
        variant: "destructive",
      });
      return;
    }
    if (!isValidTimezone(form.timezone)) {
      toast({
        title: "Invalid timezone",
        description: `"${form.timezone}" isn't a recognized IANA timezone. Pick one from the list or use a valid id like Africa/Nairobi.`,
        variant: "destructive",
      });
      return;
    }
    setSaving(true);

    // Full payload — includes columns added in migrations 008 + 009.
    const fullPayload = {
      title: form.title.trim(),
      description: form.description || null,
      date: form.date ? new Date(form.date).toISOString() : null,
      end_date: form.end_date ? new Date(form.end_date).toISOString() : null,
      venue: form.venue || null,
      location: form.location || null,
      capacity: Number(form.capacity) || 0,
      price: Number(form.price) || 0,
      currency: form.currency || "INR",
      requires_approval: form.requires_approval,
      status: form.status,
      image_url: form.image_url || null,
      timezone: form.timezone || null,
      attendance_target_pct: form.attendance_target_pct,
      previous_event_id: form.previous_event_id,
      create_community: form.create_community,
      community_category: form.create_community ? form.community_category : null,
      video_provider: form.video_provider === "default" ? null : form.video_provider,
    };

    // Core-only payload — safe for schemas that haven't had migrations 008/009 applied yet.
    const corePayload = {
      title: form.title.trim(),
      description: form.description || null,
      date: form.date ? new Date(form.date).toISOString() : null,
      end_date: form.end_date ? new Date(form.end_date).toISOString() : null,
      venue: form.venue || null,
      location: form.location || null,
      capacity: Number(form.capacity) || 0,
      price: Number(form.price) || 0,
      currency: form.currency || "INR",
      requires_approval: form.requires_approval,
      status: form.status,
      image_url: form.image_url || null,
      timezone: form.timezone || null,
    };

    let { error } = await supabase
      .from("events")
      .update(fullPayload as never)
      .eq("id", eventId);

    // If the full save fails due to a missing column (migrations not yet applied),
    // fall back to the core-only save so the user isn't completely blocked.
    if (error && error.message?.includes("column")) {
      const fallback = await supabase
        .from("events")
        .update(corePayload as never)
        .eq("id", eventId);
      error = fallback.error;
      if (!fallback.error) {
        toast({
          title: "Event updated (partial)",
          description: "Core details saved. Community / series options need a DB migration — apply migrations 008 and 009 in your Supabase dashboard to enable them.",
        });
        setSaving(false);
        onSaved?.();
        return;
      }
    }

    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Event updated", description: "Your changes are live." });
      onSaved?.();
    }
  };

  const deleteEvent = async () => {
    if (!confirm("Delete this event permanently? This cannot be undone.")) return;
    const { error } = await supabase.from("events").delete().eq("id", eventId);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Event deleted" });
      navigate("/dashboard/events");
    }
  };

  if (loading || !form) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
      </div>
    );
  }

  const tzIsKnown = COMMON_TIMEZONES.some((t) => t.id === form.timezone);
  const tzCustomInvalid = !tzIsKnown && !isValidTimezone(form.timezone);
  const priceNum = Number(form.price) || 0;
  const capacityNum = Number(form.capacity) || 0;
  const isPaid = priceNum > 0;

  return (
    <div className="max-w-3xl space-y-6 mx-auto">
      <div className="text-center">
        <h2 className="text-base font-semibold">Event Settings</h2>
        <p className="text-[12px] text-muted-foreground">Edit details, schedule, capacity, pricing and registration rules.</p>
      </div>

      {/* Basics */}
      <section className="bg-card border border-border rounded-lg p-4 space-y-4">
        <h3 className="text-[13px] font-semibold">Basics</h3>
        <div className="space-y-3">
          <div>
            <Label className="text-[12px]">Title</Label>
            <Input value={form.title} onChange={(e) => update("title", e.target.value)} />
          </div>
          <div>
            <Label className="text-[12px]">Description</Label>
            <MarkdownEditor
              value={form.description}
              onChange={(v) => update("description", v)}
              rows={6}
              placeholder="Describe what attendees can expect…"
            />
          </div>
          <div>
            <Label className="text-[12px]">Status</Label>
            <Select value={form.status} onValueChange={(v) => update("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* Schedule */}
      <section className="bg-card border border-border rounded-lg p-4 space-y-4">
        <h3 className="text-[13px] font-semibold">Schedule</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-[12px]">Starts</Label>
            <DateTimePicker value={form.date} onChange={(v) => update("date", v)} />
          </div>
          <div>
            <Label className="text-[12px]">Ends</Label>
            <DateTimePicker value={form.end_date} onChange={(v) => update("end_date", v)} min={form.date || undefined} />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-[12px]">Timezone</Label>
            <Select
              value={COMMON_TIMEZONES.some((t) => t.id === form.timezone) ? form.timezone : "__custom"}
              onValueChange={(v) => update("timezone", v === "__custom" ? form.timezone || "" : v)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {COMMON_TIMEZONES.map((tz) => (
                  <SelectItem key={tz.id} value={tz.id}>{tz.label}</SelectItem>
                ))}
                <SelectItem value="__custom">Other (enter IANA id)</SelectItem>
              </SelectContent>
            </Select>
            {!COMMON_TIMEZONES.some((t) => t.id === form.timezone) && (
              <>
                <Input
                  className={`mt-2 ${tzCustomInvalid ? "border-destructive focus-visible:ring-destructive" : ""}`}
                  value={form.timezone}
                  onChange={(e) => update("timezone", e.target.value)}
                  placeholder="e.g. Africa/Nairobi"
                  aria-invalid={tzCustomInvalid || undefined}
                />
                {tzCustomInvalid && (
                  <p className="text-[11px] text-destructive mt-1">
                    <span className="font-mono">{form.timezone || "(empty)"}</span> isn't a recognized IANA timezone. Try one like <span className="font-mono">Africa/Nairobi</span> or pick from the list.
                  </p>
                )}
              </>
            )}
            {form.date && (
              <p className="text-[11px] text-muted-foreground mt-2">
                Preview: <span className="font-medium text-foreground">
                  {form.end_date
                    ? formatEventRange(new Date(form.date).toISOString(), new Date(form.end_date).toISOString(), form.timezone)
                    : formatEventDateTime(new Date(form.date).toISOString(), form.timezone)}
                </span>
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Location */}
      <section className="bg-card border border-border rounded-lg p-4 space-y-4">
        <h3 className="text-[13px] font-semibold">Location</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-[12px]">Venue</Label>
            <Input value={form.venue} onChange={(e) => update("venue", e.target.value)} />
          </div>
          <div>
            <Label className="text-[12px]">City / Address</Label>
            <Input value={form.location} onChange={(e) => update("location", e.target.value)} />
          </div>
        </div>
      </section>

      {/* Tickets & registration */}
      <section className="bg-card border border-border rounded-lg p-4 space-y-4">
        <h3 className="text-[13px] font-semibold">Tickets & Registration</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-[12px]">Currency</Label>
            <Select value={form.currency} onValueChange={(v) => update("currency", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SUPPORTED_CURRENCIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.symbol} {c.code} — {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[12px]">Price — 0 for free</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.price}
              onChange={(e) => update("price", Number(e.target.value))}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Shown as <span className="font-medium text-foreground">{formatPriceOrFree(form.price, form.currency)}</span>
              {Number(form.price) > 0 && (
                <> · per ticket: <span className="font-medium text-foreground">{formatMoney(form.price, form.currency)}</span></>
              )}
            </p>
          </div>
          <div>
            <Label className="text-[12px]">Capacity</Label>
            <Input
              type="number"
              min={0}
              value={form.capacity}
              onChange={(e) => update("capacity", Number(e.target.value))}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-[12px]">Attendance target (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              step={1}
              placeholder="e.g. 70"
              value={form.attendance_target_pct ?? ""}
              onChange={(e) => {
                const raw = e.target.value;
                update("attendance_target_pct", raw === "" ? null : Number(raw));
              }}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Expected turnout from registrations. Used in Reports to compare actual check-ins vs goal.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between rounded-md border border-border p-3">
          <div>
            <p className="text-[13px] font-medium">Require approval</p>
            <p className="text-[12px] text-muted-foreground">
              Free events only. Registrations stay pending until you approve.
            </p>
          </div>
          <Switch
            checked={form.requires_approval}
            onCheckedChange={(v) => update("requires_approval", v)}
            disabled={Number(form.price) > 0}
          />
        </div>

        {pastEvents.length > 0 && (
          <div className="rounded-md border border-border p-3 space-y-2">
            <div>
              <p className="text-[13px] font-medium">Follow-up to (optional)</p>
              <p className="text-[12px] text-muted-foreground">
                Members of the previous event's community are added to this one. Only events from your organization show up here.
              </p>
            </div>
            <Select
              value={form.previous_event_id ?? "none"}
              onValueChange={(v) => update("previous_event_id", v === "none" ? null : v)}
            >
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
            {form.previous_event_id && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-[12px]"
                onClick={resyncMembers}
                disabled={resyncing}
                type="button"
              >
                {resyncing ? "Syncing…" : "Re-sync members from previous"}
              </Button>
            )}
          </div>
        )}

        {/* Live video provider — per-event override. NULL means "use the
            platform default" (VITE_WEBINAR_PROVIDER, falling back to
            'livekit'). Defaults to "default" so existing events keep
            using LiveKit until the organizer explicitly flips them. */}
        <div className="rounded-md border border-border p-3 space-y-2">
          <div>
            <p className="text-[13px] font-medium">Live video provider</p>
            <p className="text-[12px] text-muted-foreground">
              Pick the streaming backend used by this event's webinar
              studio. Use “Platform default” unless you're testing the
              Agora migration on a single event.
            </p>
          </div>
          <Select
            value={form.video_provider}
            onValueChange={(v) =>
              update("video_provider", v as EventForm["video_provider"])
            }
          >
            <SelectTrigger className="h-9 text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Platform default</SelectItem>
              <SelectItem value="livekit">LiveKit</SelectItem>
              <SelectItem value="agora">Agora</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Live ticket total preview — recomputes on every keystroke. */}
        <div className="rounded-md border border-border bg-muted/40 p-3 space-y-2">
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
              <p className="text-[15px] font-semibold tabular-nums">{formatPriceOrFree(priceNum, form.currency)}</p>
            </div>
            {isPaid && (
              <div>
                <p className="text-[11px] text-muted-foreground">Projected gross at sell-out</p>
                <p className="text-[15px] font-semibold tabular-nums">
                  {capacityNum > 0 ? formatMoney(priceNum * capacityNum, form.currency) : "Set capacity"}
                </p>
              </div>
            )}
          </div>
          {isPaid && form.requires_approval && (
            <p className="text-[11px] text-muted-foreground">
              Note: approval is automatically disabled for paid events.
            </p>
          )}
        </div>
      </section>

      {/* Community */}
      <section className="bg-card border border-border rounded-lg p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Users2 className="h-4 w-4 text-primary" />
          <h3 className="text-[13px] font-semibold">Community</h3>
        </div>
        <div className="flex items-center justify-between rounded-md border border-border p-3">
          <div>
            <p className="text-[13px] font-medium">Enable community</p>
            <p className="text-[12px] text-muted-foreground">
              {form.create_community
                ? "Community is active for this event."
                : "Community is disabled. Members won't have a discussion space."}
            </p>
          </div>
          <Switch
            id="settings-create-community-toggle"
            checked={form.create_community}
            onCheckedChange={(v) => update("create_community", v)}
          />
        </div>
        {form.create_community && (
          <div>
            <p className="text-[11px] text-muted-foreground mt-1">
              A dedicated discussion space is active for this event.
            </p>
          </div>
        )}
      </section>

      {/* Actions */}
      <div className="flex items-center justify-between gap-3 pb-4">
        <Button variant="outline" onClick={deleteEvent} className="text-destructive hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete event
        </Button>
        <Button onClick={save} disabled={saving || tzCustomInvalid}>
          {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
          Save changes
        </Button>
      </div>
    </div>
  );
}