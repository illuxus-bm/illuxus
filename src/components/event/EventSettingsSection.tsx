import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { SUPPORTED_CURRENCIES, formatMoney, formatPriceOrFree } from "@/lib/currency";
import { COMMON_TIMEZONES, detectBrowserTimezone, isValidTimezone } from "@/lib/timezones";
import { formatEventDateTime, formatEventRange } from "@/lib/datetime";
import { DateTimePicker } from "@/components/ui/datetime-picker";

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
  org_id: string | null;
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
        org_id: (data as { org_id?: string | null }).org_id ?? null,
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [eventId, toast]);

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
    const { error } = await supabase
      .from("events")
      .update({
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
      } as never)
      .eq("id", eventId);
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
    <div className="max-w-3xl space-y-6">
      <div>
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
            <Textarea
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              rows={4}
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