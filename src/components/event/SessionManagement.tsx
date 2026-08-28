import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DateTimeInput } from "@/components/ui/datetime-input";
import { TimePicker } from "@/components/ui/time-picker";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Presentation, Coffee, Wrench, Clock, MapPin, Mic, Users, MessageSquare, Utensils, X } from "lucide-react";
import { ExternalLink } from "lucide-react";
import { computeEventDays, buildSessionPayload } from "./session-day-utils";
import { logger } from "@/lib/observability";

interface Session {
  id: string;
  title: string;
  description: string | null;
  session_type: string;
  start_time: string;
  end_time: string;
  location: string | null;
  speaker_ids: string[];
}

interface Speaker {
  id: string;
  name: string;
}

interface Props {
  eventId: string;
  eventDate: string;
  eventEndDate?: string | null;
  publicUrl?: string;
}

const SESSION_TYPE_PRESETS = [
  { value: "talk",         label: "Talk" },
  { value: "keynote",      label: "Keynote" },
  { value: "speaker",      label: "Speaker" },
  { value: "panel",        label: "Panel" },
  { value: "workshop",     label: "Workshop" },
  { value: "fireside",     label: "Fireside Chat" },
  { value: "networking",   label: "Networking" },
  { value: "qa",           label: "Q&A" },
  { value: "break",        label: "Break" },
  { value: "lunch",        label: "Lunch" },
];
const PRESET_VALUES = new Set(SESSION_TYPE_PRESETS.map((p) => p.value));
const CUSTOM_TYPE_SENTINEL = "__custom__";
const typeIcons: Record<string, typeof Presentation> = {
  talk: Presentation, keynote: Mic, speaker: Mic, panel: Users, workshop: Wrench,
  fireside: MessageSquare, networking: Users, qa: MessageSquare,
  break: Coffee, lunch: Utensils,
};
const typeColors: Record<string, string> = {
  talk: "bg-primary/10 text-primary",
  keynote: "bg-primary/10 text-primary",
  speaker: "bg-indigo-500/10 text-indigo-600",
  panel: "bg-blue-500/10 text-blue-600",
  workshop: "bg-amber-500/10 text-amber-600",
  fireside: "bg-purple-500/10 text-purple-600",
  networking: "bg-emerald-500/10 text-emerald-600",
  qa: "bg-sky-500/10 text-sky-600",
  break: "bg-muted text-muted-foreground",
  lunch: "bg-orange-500/10 text-orange-600",
};

const emptySession = { title: "", description: "", session_type: "talk", start_time: "", end_time: "", location: "", speaker_ids: [] as string[], date: "" };

export default function SessionManagement({ eventId, eventDate, eventEndDate, publicUrl }: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Session | null>(null);
  const [form, setForm] = useState(emptySession);
  const [customType, setCustomType] = useState(false);
  const [customTypeLabel, setCustomTypeLabel] = useState("");
  const [dayFilter, setDayFilter] = useState<string>("all");

  const eventDays = useMemo(() => computeEventDays(eventDate, eventEndDate), [eventDate, eventEndDate]);
  const isMultiDay = eventDays.length > 1;

  // Reset stale day filter when event dates change. The default is the first
  // event day (tabs-only view, no "all days").
  useEffect(() => {
    if (!eventDays.length) return;
    if (dayFilter === "all" || !eventDays.includes(dayFilter)) {
      const today = new Date().toISOString().slice(0, 10);
      setDayFilter(eventDays.includes(today) ? today : eventDays[0]);
    }
  }, [eventDays, dayFilter]);

  const fetchData = async () => {
    const [{ data: sess }, { data: spk }] = await Promise.all([
      supabase.from("sessions").select("*").eq("event_id", eventId).order("start_time"),
      supabase.from("event_speakers").select("speaker_id, speakers(id, name)").eq("event_id", eventId),
    ]);
    const list = (sess || []) as any[];
    // `const` — the Map is mutated via `.set()` but the binding is never
    // reassigned.
    const linkMap = new Map<string, string[]>();
    if (list.length) {
      const { data: ss } = await supabase
        .from("session_speakers")
        .select("session_id, speaker_id")
        .in("session_id", list.map((s) => s.id));
      (ss || []).forEach((r: any) => {
        const arr = linkMap.get(r.session_id) || [];
        arr.push(r.speaker_id);
        linkMap.set(r.session_id, arr);
      });
    }
    setSessions(list.map((s) => ({
      ...s,
      speaker_ids: linkMap.get(s.id) || (s.speaker_id ? [s.speaker_id] : []),
    })));
    setSpeakers((spk || []).map((s: any) => s.speakers).filter(Boolean));
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [eventId]);

  const defaultDate = eventDays[0] || (eventDate ? eventDate.split("T")[0] : new Date().toISOString().split("T")[0]);
  const maxDate = eventDays[eventDays.length - 1] || defaultDate;
  const currentDay = form.date || defaultDate;
  const dayOutOfRange = eventDays.length > 0 && !eventDays.includes(currentDay);
  const rangeLabel = eventDays.length > 0
    ? `${new Date(`${eventDays[0]}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date(`${eventDays[eventDays.length - 1]}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
    : "";

  const handleSave = async () => {
    const effectiveType = customType ? customTypeLabel.trim() : form.session_type;
    if (customType && !effectiveType) {
      toast.error("Enter a custom session type");
      return;
    }
    const result = buildSessionPayload({
      form: { ...form, session_type: effectiveType },
      eventId,
      eventDays,
    });
    if (!result.ok || !result.payload) {
      toast.error(
        result.error === "out_of_range"
          ? "Selected day is outside the event dates. Update the event dates in Settings first."
          : "Title, start time, and end time are required",
      );
      return;
    }
    const payload = result.payload;

    let sessionId = editing?.id;
    if (editing) {
      const { error } = await supabase.from("sessions").update(payload).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { data, error } = await supabase.from("sessions").insert(payload).select("id").single();
      if (error) { toast.error(error.message); return; }
      sessionId = data?.id;
    }

    if (sessionId) {
      const { error: deleteError } = await supabase.from("session_speakers").delete().eq("session_id", sessionId);
      if (deleteError) {
        // Surface this instead of failing silently — a blocked delete (e.g.
        // a Row-Level Security policy gap) previously left stale speaker
        // links in place with no indication anything went wrong, which is
        // exactly what made "can't attach multiple speakers" so hard to
        // notice: the session itself always saved fine.
        logger.error("session speakers delete failed", {
          session_id: sessionId,
          error_message: deleteError.message,
        });
        toast.error("Session saved, but updating its speakers failed", { description: deleteError.message });
        setOpen(false);
        setEditing(null);
        setForm(emptySession);
        setCustomType(false);
        setCustomTypeLabel("");
        fetchData();
        return;
      }
      if (form.speaker_ids.length) {
        const { error: insertError } = await supabase.from("session_speakers").insert(
          form.speaker_ids.map((sid, i) => ({ session_id: sessionId!, speaker_id: sid, position: i })),
        );
        if (insertError) {
          logger.error("session speakers insert failed", {
            session_id: sessionId,
            speaker_count: form.speaker_ids.length,
            error_message: insertError.message,
          });
          toast.error("Session saved, but updating its speakers failed", { description: insertError.message });
          setOpen(false);
          setEditing(null);
          setForm(emptySession);
          setCustomType(false);
          setCustomTypeLabel("");
          fetchData();
          return;
        }
      }
    }
    toast.success(editing ? "Session updated" : "Session added");
    setOpen(false);
    setEditing(null);
    setForm(emptySession);
    setCustomType(false);
    setCustomTypeLabel("");
    fetchData();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("sessions").delete().eq("id", id);
    toast.success("Session deleted");
    fetchData();
  };

  const openEdit = (s: Session) => {
    setEditing(s);
    // Split the stored ISO string directly to avoid UTC→local timezone shift.
    // Supabase timestamptz values come back as "2025-07-04T09:00:00+00" — parsing
    // through new Date() and then calling getHours()/getDate() would shift the
    // time in non-UTC timezones. Strip the timezone suffix first.
    const startLocal = s.start_time ? s.start_time.split("+")[0].split("Z")[0] : "";
    const endLocal   = s.end_time   ? s.end_time.split("+")[0].split("Z")[0]   : "";
    const [datePart, startTimePart = "00:00:00"] = startLocal.split("T");
    const [, endTimePart = "00:00:00"]            = endLocal.split("T");
    const d = datePart || "";
    const toHHmm = (t: string) => t.slice(0, 5); // "HH:mm:ss" → "HH:mm"
    const isCustom = !PRESET_VALUES.has(s.session_type);
    setForm({
      title: s.title,
      description: s.description || "",
      session_type: s.session_type,
      start_time: toHHmm(startTimePart),
      end_time: toHHmm(endTimePart),
      location: s.location || "",
      speaker_ids: s.speaker_ids || [],
      date: d,
    });
    setCustomType(isCustom);
    setCustomTypeLabel(isCustom ? s.session_type : "");
    setOpen(true);
  };

  const fmt = (iso: string) => {
    // Strip timezone suffix to avoid UTC→local shift in displayed times
    const local = iso ? iso.split("+")[0].split("Z")[0] : "";
    const timePart = local.split("T")[1] || "00:00";
    const [h, m] = timePart.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, "0")} ${period}`;
  };
  const speakerNames = (ids: string[]) => ids.map((id) => speakers.find((s) => s.id === id)?.name).filter(Boolean).join(", ");
  const toggleSpeaker = (id: string) => {
    setForm((f) => ({
      ...f,
      speaker_ids: f.speaker_ids.includes(id) ? f.speaker_ids.filter((x) => x !== id) : [...f.speaker_ids, id],
    }));
  };

  const fmtDayHeader = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`); // bare date — no timezone shift
    const idx = eventDays.indexOf(iso);
    const dayLabel = idx >= 0 ? `Day ${idx + 1} · ` : "";
    return `${dayLabel}${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`;
  };

  const sessionsByDay = useMemo(() => {
    const map = new Map<string, Session[]>();
    for (const s of sessions) {
      // Strip timezone suffix before parsing so "2025-07-04T20:00:00Z" is
      // keyed as 2025-07-04 regardless of local timezone (same logic as
      // computeEventDays / isoToDateStr in session-day-utils).
      const k = s.start_time ? s.start_time.split("T")[0] : "";
      if (!k) continue;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [sessions]);

  // Tabs: union of eventDays + any out-of-range days that already have sessions.
  const tabDays = useMemo(() => {
    const set = new Set<string>(eventDays);
    for (const [k] of sessionsByDay) set.add(k);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [eventDays, sessionsByDay]);
  const sessionsForDay = (d: string) => sessionsByDay.find(([k]) => k === d)?.[1] || [];

  // Quick range preview for the session form.
  const formRangePreview = useMemo(() => {
    if (!form.start_time || !form.end_time || !currentDay) return "";
    try {
      const fmt = (t: string) =>
        new Date(`${currentDay}T${t}:00`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      const dateLabel = new Date(`${currentDay}T00:00:00`).toLocaleDateString("en-US", {
        weekday: "short", month: "short", day: "numeric",
      });
      return `${dateLabel} · ${fmt(form.start_time)} – ${fmt(form.end_time)}`;
    } catch { return ""; }
  }, [currentDay, form.start_time, form.end_time]);

  if (loading) return <div className="text-muted-foreground p-8 text-center">Loading agenda...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Agenda</h2>
          <p className="text-sm text-muted-foreground">
            {sessions.length} {sessions.length === 1 ? "session" : "sessions"} scheduled · Appears in the Agenda block of your event landing page.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {publicUrl && (
            <Button size="sm" variant="outline" asChild className="text-xs">
              <a
                href={`${publicUrl}${publicUrl.includes("?") ? "&" : "?"}t=${Date.now()}#agenda`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1" /> View on landing page
              </a>
            </Button>
          )}
          <Dialog
            open={open}
            onOpenChange={(v) => {
              setOpen(v);
              if (!v) { setEditing(null); setForm(emptySession); setCustomType(false); setCustomTypeLabel(""); }
            }}
          >
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Session</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Session" : "Add Session"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div><Label>Title *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div>
                <Label>Type</Label>
                <div className={customType ? "grid grid-cols-[180px_1fr] gap-2" : ""}>
                  <Select
                    value={customType ? CUSTOM_TYPE_SENTINEL : form.session_type}
                    onValueChange={(v) => {
                      if (v === CUSTOM_TYPE_SENTINEL) {
                        setCustomType(true);
                        setForm({ ...form, session_type: "" });
                      } else {
                        setCustomType(false);
                        setCustomTypeLabel("");
                        setForm({ ...form, session_type: v });
                      }
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SESSION_TYPE_PRESETS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                      <SelectItem value={CUSTOM_TYPE_SENTINEL}>Custom…</SelectItem>
                    </SelectContent>
                  </Select>
                  {customType && (
                    <Input
                      autoFocus
                      placeholder="e.g. Hackathon, Demo, Awards…"
                      value={customTypeLabel}
                      onChange={(e) => setCustomTypeLabel(e.target.value)}
                    />
                  )}
                </div>
              </div>
              {isMultiDay && (
                <div>
                  <Label>Day</Label>
                  <Select
                    value={form.date || defaultDate}
                    onValueChange={(v) => setForm({ ...form, date: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {eventDays.map((d, i) => (
                        <SelectItem key={d} value={d}>
                          Day {i + 1} · {new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {!isMultiDay && (
                <div>
                  <Label>Date</Label>
                  <DateTimeInput
                    variant="date"
                    min={defaultDate}
                    max={maxDate}
                    value={form.date || defaultDate}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                  />
                </div>
              )}
              {dayOutOfRange && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-700 text-xs p-2 space-y-2">
                  <p>
                    This day is outside the event range ({rangeLabel}). Update the event dates in Settings, or pick a day below.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      className="px-2 py-0.5 rounded border border-amber-500/40 hover:bg-amber-500/20"
                      onClick={() => setForm({ ...form, date: eventDays[0] })}
                    >
                      Use Day 1
                    </button>
                    {isMultiDay && (
                      <button
                        type="button"
                        className="px-2 py-0.5 rounded border border-amber-500/40 hover:bg-amber-500/20"
                        onClick={() => setForm({ ...form, date: eventDays[eventDays.length - 1] })}
                      >
                        Use last day
                      </button>
                    )}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Start Time *</Label><TimePicker value={form.start_time} onChange={(v) => setForm({ ...form, start_time: v })} /></div>
                <div><Label>End Time *</Label><TimePicker value={form.end_time} onChange={(v) => setForm({ ...form, end_time: v })} /></div>
              </div>
              {formRangePreview && (
                <p className="text-[11px] text-muted-foreground -mt-1">{formRangePreview}</p>
              )}
              <div><Label>Location / Room</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
              {form.session_type !== "break" && speakers.length > 0 && (
                <div>
                  <Label>Speakers</Label>
                  {form.speaker_ids.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {form.speaker_ids.map((id) => {
                        const sp = speakers.find((s) => s.id === id);
                        if (!sp) return null;
                        return (
                          <Badge key={id} variant="secondary" className="gap-1">
                            {sp.name}
                            <button type="button" onClick={() => toggleSpeaker(id)} className="hover:text-destructive">
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                  <div className="border border-border rounded-lg max-h-40 overflow-y-auto p-2 space-y-1.5">
                    {speakers.map((s) => (
                      <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1.5 py-1">
                        <Checkbox
                          checked={form.speaker_ids.includes(s.id)}
                          onCheckedChange={() => toggleSpeaker(s.id)}
                        />
                        <span>{s.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} /></div>
              <Button onClick={handleSave} disabled={dayOutOfRange} className="w-full">{editing ? "Update" : "Add Session"}</Button>
            </div>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-xl">
          <Presentation className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p>No sessions yet. Add your first session to build the agenda.</p>
        </div>
      ) : tabDays.length <= 1 ? (
        <div className="space-y-2">
          {sessionsForDay(tabDays[0] || defaultDate).map((s) => (
            <SessionRow key={s.id} session={s} typeIcons={typeIcons} typeColors={typeColors} fmt={fmt} speakerNames={speakerNames} onEdit={openEdit} onDelete={handleDelete} />
          ))}
        </div>
      ) : (
        <Tabs value={tabDays.includes(dayFilter) ? dayFilter : tabDays[0]} onValueChange={setDayFilter}>
          <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/40 p-1">
            {tabDays.map((d, i) => {
              const inRange = eventDays.includes(d);
              const count = sessionsForDay(d).length;
              return (
                <TabsTrigger key={d} value={d} className="text-xs px-3 py-1.5 gap-1.5 data-[state=active]:bg-background">
                  <span>Day {inRange ? eventDays.indexOf(d) + 1 : i + 1}</span>
                  <span className="text-muted-foreground font-normal">
                    · {new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                  {count > 0 && (
                    <Badge variant="secondary" className="h-4 px-1 text-[10px] font-mono">{count}</Badge>
                  )}
                  {!inRange && (
                    <span className="text-[9px] font-medium px-1 rounded bg-amber-500/15 text-amber-700">!</span>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
          {tabDays.map((d) => (
            <TabsContent key={d} value={d} className="mt-4 space-y-2">
              {!eventDays.includes(d) && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-700 text-xs p-2">
                  This day is outside the event dates ({rangeLabel}). Update the event dates in Settings to include it.
                </div>
              )}
              {sessionsForDay(d).length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">No sessions scheduled for this day.</p>
              ) : sessionsForDay(d).map((s) => (
                <SessionRow key={s.id} session={s} typeIcons={typeIcons} typeColors={typeColors} fmt={fmt} speakerNames={speakerNames} onEdit={openEdit} onDelete={handleDelete} />
              ))}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}

function SessionRow({
  session: s, typeIcons, typeColors, fmt, speakerNames, onEdit, onDelete,
}: {
  session: Session;
  typeIcons: Record<string, typeof Presentation>;
  typeColors: Record<string, string>;
  fmt: (iso: string) => string;
  speakerNames: (ids: string[]) => string;
  onEdit: (s: Session) => void;
  onDelete: (id: string) => void;
}) {
  const Icon = typeIcons[s.session_type] || Presentation;
  const color = typeColors[s.session_type] || typeColors.talk;
  return (
    <div className="bg-card border border-border rounded-xl p-3 sm:p-4 flex items-start gap-3">
      <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
          <p className="font-semibold text-sm break-words min-w-0">{s.title}</p>
          <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground whitespace-nowrap shrink-0">{s.session_type}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1">
          <span className="flex items-center gap-1 whitespace-nowrap"><Clock className="h-3 w-3 shrink-0" />{fmt(s.start_time)} – {fmt(s.end_time)}</span>
          {s.location && <span className="flex items-center gap-1 min-w-0"><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{s.location}</span></span>}
          {s.speaker_ids.length > 0 && <span className="min-w-0 truncate">🎤 {speakerNames(s.speaker_ids)}</span>}
        </div>
        {s.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{s.description}</p>}
      </div>
      <div className="flex gap-1 shrink-0">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(s)}><Pencil className="h-3 w-3" /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(s.id)}><Trash2 className="h-3 w-3" /></Button>
      </div>
    </div>
  );
}
