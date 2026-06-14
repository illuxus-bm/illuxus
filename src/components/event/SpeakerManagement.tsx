import { useState, useEffect, useMemo, lazy, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, UserCheck, Building, Link2, Copy, GripVertical, Search, Users, Megaphone } from "lucide-react";
import { publicUrl } from "@/lib/publicUrl";
import { logger } from "@/lib/observability";
import PersonFieldsForm, { emptyPersonFields, validatePersonFields, displayName, type PersonFields } from "@/components/people/PersonFieldsForm";
import SpeakerPhotoUploader from "./SpeakerPhotoUploader";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, arrayMove,
  useSortable, rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const SpeakerApplicationsPanelLazy = lazy(() =>
  import("./ApplicationsSection").then((m) => ({ default: m.SpeakerApplicationsPanel })),
);

interface Speaker {
  id: string;
  name: string;
  email: string | null;
  bio: string | null;
  photo_url: string | null;
  company: string | null;
  title: string | null;        // honorific (Mr/Ms/Mrs/PNTS)
  designation: string | null;  // job title
  first_name: string | null;
  last_name: string | null;
  mobile_country_code: string | null;
  mobile_number: string | null;
  linkedin_url: string | null;
  company_website: string | null;
  company_employee_count: string | null;
  industry: string | null;
}

interface Props {
  eventId: string;
}

const emptyForm = () => ({ ...emptyPersonFields(), bio: "", photo_url: "" });

export default function SpeakerManagement({ eventId }: Props) {
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [allSpeakers, setAllSpeakers] = useState<Speaker[]>([]);
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Speaker | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [tokensByEmail, setTokensByEmail] = useState<Record<string, string>>({});
  const [applicationsEnabled, setApplicationsEnabled] = useState(true);
  const [togglingApplications, setTogglingApplications] = useState(false);

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Step 1: get the IDs of speakers linked to this event
    const { data: links, error: linksErr } = await supabase
      .from("event_speakers")
      .select("speaker_id, display_order")
      .eq("event_id", eventId)
      .order("display_order");

    if (linksErr) logger.error("speaker management failure", { kind: "event_speakers error", error_message: linksErr instanceof Error ? linksErr.message : String(linksErr) });

    const orderedIds = (links ?? []).map((a: { speaker_id: string }) => a.speaker_id);
    const ids = new Set(orderedIds);

    // Step 2: fetch the linked speakers by ID. This relies on the RLS policy
    // "Event owner view linked speakers" letting organizers read speakers attached
    // to their events even when speakers.user_id was set incorrectly by old code.
    let linkedSpeakers: Speaker[] = [];
    if (orderedIds.length > 0) {
      const { data: rows, error: spkErr } = await supabase
        .from("speakers")
        .select("*")
        .in("id", orderedIds);
      if (spkErr) logger.error("speaker management failure", { kind: "linked speakers error", error_message: spkErr instanceof Error ? spkErr.message : String(spkErr) });
      const byId = new Map((rows ?? []).map((s: Speaker) => [s.id, s] as const));
      linkedSpeakers = orderedIds.map((id) => byId.get(id)).filter(Boolean) as Speaker[];
      // Diagnostic: log if any IDs are missing (RLS blocked)
      const missing = orderedIds.filter((id) => !byId.has(id));
      if (missing.length) {
        logger.warn("speaker management failure", {
          kind: "event_speakers rows exist but speakers rows blocked by RLS",
          missing_ids: missing,
          hint: "Run the 'Event owner view linked speakers' policy from migration 001_tables.sql",
        });
      }
    }

    // Step 3: fetch ALL speakers visible to the organizer (for the picker)
    const { data: allSpk } = await supabase.from("speakers").select("*").order("name");

    const byIdAll = new Map<string, Speaker>();
    for (const s of (allSpk ?? []) as Speaker[]) byIdAll.set(s.id, s);
    for (const s of linkedSpeakers) byIdAll.set(s.id, s);

    // Step 4: webinar session lookup (unchanged)
    const { data: sess } = await supabase.from("webinar_sessions").select("id").eq("event_id", eventId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();

    // Step 5: per-event Call-for-Speakers toggle
    const { data: ev } = await supabase
      .from("events")
      .select("speaker_applications_enabled")
      .eq("id", eventId)
      .maybeSingle();
    setApplicationsEnabled(
      (ev as { speaker_applications_enabled?: boolean | null } | null)?.speaker_applications_enabled ?? true,
    );

    setAllSpeakers(Array.from(byIdAll.values()).sort((a, b) => a.name.localeCompare(b.name)));
    setSpeakers(linkedSpeakers);
    setAssignedIds(ids);
    setSessionId(sess?.id ?? null);
    if (sess?.id) {
      const { data: ws } = await supabase.from("webinar_speakers")
        .select("email, invite_token").eq("session_id", sess.id);
      const map: Record<string, string> = {};
      (ws || []).forEach((w: any) => { if (w.email) map[w.email.toLowerCase()] = w.invite_token; });
      setTokensByEmail(map);
    } else {
      setTokensByEmail({});
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [eventId]);

  const handleApplicationsToggle = async (enabled: boolean) => {
    setTogglingApplications(true);
    // Optimistic update
    setApplicationsEnabled(enabled);
    const { error } = await supabase
      .from("events")
      .update({ speaker_applications_enabled: enabled } as never)
      .eq("id", eventId);
    setTogglingApplications(false);
    if (error) {
      // Roll back on failure
      setApplicationsEnabled(!enabled);
      toast.error(error.message);
      logger.error("speaker applications toggle failed", {
        event_id: eventId,
        error_message: error.message,
      });
      return;
    }
    toast.success(enabled ? "Call for Speakers is now open" : "Call for Speakers is now closed");
  };

  const syncWebinarSpeaker = async (speaker: Pick<Speaker, "name" | "email">) => {
    if (!sessionId || !speaker.email) return;
    // Avoid duplicates (no unique constraint exists, so check first).
    const { data: existing } = await supabase.from("webinar_speakers")
      .select("id").eq("session_id", sessionId).eq("email", speaker.email).maybeSingle();
    if (existing?.id) return;
    await supabase.from("webinar_speakers").insert({
      session_id: sessionId, email: speaker.email, display_name: speaker.name, role: "speaker",
    });
  };

  const removeWebinarSpeaker = async (email: string | null) => {
    if (!sessionId || !email) return;
    await supabase.from("webinar_speakers").delete()
      .eq("session_id", sessionId).eq("email", email);
  };

  const handleSave = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const v = validatePersonFields(form as unknown as PersonFields);
    if (!v.ok) { toast.error(v.error); return; }
    const name = displayName(form as unknown as PersonFields);
    const payload = {
      name,
      email: form.email || null,
      bio: form.bio || null,
      photo_url: form.photo_url || null,
      company: form.company || null,
      title: form.title || null,
      designation: form.designation || null,
      first_name: form.first_name || null,
      last_name: form.last_name || null,
      mobile_country_code: form.mobile_country_code || null,
      mobile_number: form.mobile_number || null,
      linkedin_url: form.linkedin_url || null,
      company_website: form.company_website || null,
      company_employee_count: form.company_employee_count || null,
      industry: form.industry || null,
    };

    if (editing) {
      const { error } = await supabase.from("speakers").update(payload).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Speaker updated");
    } else {
      const { data, error } = await supabase.from("speakers").insert({ ...payload, user_id: user.id }).select().single();
      if (error) { toast.error(error.message); return; }
      // Auto-assign to this event
      await supabase.from("event_speakers").insert({ event_id: eventId, speaker_id: data.id });
      await syncWebinarSpeaker({ name: data.name, email: data.email });
      toast.success("Speaker added & assigned");
    }
    setOpen(false);
    setEditing(null);
    setForm(emptyForm());
    fetchData();
  };

  const handleAssign = async (speakerId: string) => {
    if (assignedIds.has(speakerId)) {
      const spk = allSpeakers.find((s) => s.id === speakerId);
      await supabase.from("event_speakers").delete().eq("event_id", eventId).eq("speaker_id", speakerId);
      await removeWebinarSpeaker(spk?.email ?? null);
      toast.success("Speaker removed from event");
    } else {
      const nextOrder = speakers.length;
      const { error } = await supabase.from("event_speakers").insert({
        event_id: eventId, speaker_id: speakerId, display_order: nextOrder,
      });
      if (error) { toast.error(error.message); return; }
      const spk = allSpeakers.find((s) => s.id === speakerId);
      if (spk) await syncWebinarSpeaker({ name: spk.name, email: spk.email });
      toast.success("Speaker assigned to event");
    }
    fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this speaker permanently? This cannot be undone.")) return;
    await supabase.from("speakers").delete().eq("id", id);
    toast.success("Speaker deleted");
    fetchData();
  };

  const openEdit = (s: Speaker) => {
    setEditing(s);
    const parts = (s.name || "").split(" ");
    setForm({
      ...emptyForm(),
      title: s.title || "",
      first_name: s.first_name || parts[0] || "",
      last_name: s.last_name || parts.slice(1).join(" ") || "",
      designation: s.designation || "",
      company: s.company || "",
      email: s.email || "",
      mobile_country_code: s.mobile_country_code || emptyPersonFields().mobile_country_code,
      mobile_number: s.mobile_number || "",
      linkedin_url: s.linkedin_url || "",
      company_website: s.company_website || "",
      company_employee_count: s.company_employee_count || "",
      industry: s.industry || "",
      bio: s.bio || "",
      photo_url: s.photo_url || "",
    });
    setOpen(true);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = speakers.findIndex((s) => s.id === active.id);
    const newIndex = speakers.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(speakers, oldIndex, newIndex);
    setSpeakers(next);
    const updates = next.map((s, i) =>
      supabase.from("event_speakers")
        .update({ display_order: i })
        .eq("event_id", eventId)
        .eq("speaker_id", s.id)
    );
    const results = await Promise.all(updates);
    if (results.some((r) => r.error)) {
      toast.error("Failed to save order");
      fetchData();
    }
  };

  if (loading) return <div className="text-muted-foreground p-8 text-center">Loading speakers...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Speakers</h2>
          <p className="text-sm text-muted-foreground">{speakers.length} speakers assigned to this event</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditing(null); setForm(emptyForm()); } }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Speaker</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Speaker" : "Add New Speaker"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="flex flex-col items-center gap-2 pb-3 border-b border-border/60">
                <SpeakerPhotoUploader
                  value={form.photo_url}
                  onChange={(url) => setForm({ ...form, photo_url: url || "" })}
                />
                <span className="text-[11px] text-muted-foreground">Speaker photo</span>
              </div>
              <PersonFieldsForm
                value={form as unknown as PersonFields}
                onChange={(next) => setForm({ ...form, ...next })}
              />
              <div><Label>Bio</Label><Textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} rows={3} /></div>
              <Button onClick={handleSave} className="w-full">{editing ? "Update" : "Create & Assign"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Call for Speakers gate (per-event). Defaults ON via migration 009. */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Megaphone className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-[13px] font-semibold">Call for Speakers</p>
            <p className="text-[12px] text-muted-foreground">
              Show the “Apply as Speaker” button on the public event page.
            </p>
          </div>
        </div>
        <Switch
          checked={applicationsEnabled}
          onCheckedChange={handleApplicationsToggle}
          disabled={togglingApplications}
          aria-label="Toggle call for speakers"
        />
      </div>

      {/* Assigned Speakers */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={speakers.map((s) => s.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {speakers.map((s) => {
              const token = s.email ? tokensByEmail[s.email.toLowerCase()] : undefined;
              const link = token ? publicUrl(`/e/${eventId}/live?speaker=${token}`) : null;
              return (
                <SortableSpeakerCard
                  key={s.id} speaker={s} link={link}
                  onEdit={() => openEdit(s)} onDelete={() => handleDelete(s.id)}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {/* Add existing speaker — searchable popover instead of a flat cluster */}
      <AssignSpeakerPopover
        speakers={allSpeakers.filter((s) => !assignedIds.has(s.id))}
        onAssign={handleAssign}
      />

      {/* Speaker applications — review and approve people who applied via
          the public event page. Lives here (instead of a top-level "Applications"
          tab) so organisers manage the full speaker pipeline in one place. */}
      <div className="border-t border-border pt-6">
        <Suspense
          fallback={
            <div className="text-[12px] text-muted-foreground">Loading applications…</div>
          }
        >
          <SpeakerApplicationsPanelLazy eventId={eventId} />
        </Suspense>
      </div>
    </div>
  );
}

function AssignSpeakerPopover({
  speakers, onAssign,
}: {
  speakers: Speaker[];
  onAssign: (speakerId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return speakers.slice(0, 50);
    return speakers
      .filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.company || "").toLowerCase().includes(q) ||
          (s.email || "").toLowerCase().includes(q)
      )
      .slice(0, 50);
  }, [speakers, query]);

  if (speakers.length === 0) return null;

  return (
    <div className="border-t border-border pt-4">
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Add existing speaker
            <span className="text-[11px] text-muted-foreground ml-1">({speakers.length})</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-0">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, company, email…"
                className="pl-8 h-8 text-[13px]"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-[12px] text-muted-foreground text-center py-6">
                No speakers match.
              </p>
            ) : (
              <div className="py-1">
                {filtered.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => { onAssign(s.id); setOpen(false); setQuery(""); }}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors text-left"
                  >
                    {s.photo_url ? (
                      <img src={s.photo_url} alt={s.name} className="h-6 w-6 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold text-muted-foreground shrink-0">
                        {s.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium truncate">{s.name}</p>
                      {(s.company || s.email) && (
                        <p className="text-[11px] text-muted-foreground truncate">
                          {s.company || s.email}
                        </p>
                      )}
                    </div>
                    <Plus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>
            )}
            {speakers.length > filtered.length && !query.trim() && (
              <p className="text-[10px] text-muted-foreground text-center py-2 border-t border-border">
                Showing first 50 — type to search
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function SortableSpeakerCard({
  speaker: s, link, onEdit, onDelete,
}: {
  speaker: Speaker; link: string | null;
  onEdit: () => void; onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: s.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-start gap-3">
        <button
          type="button"
          {...attributes} {...listeners}
          aria-label="Drag to reorder"
          className="h-7 w-5 -ml-1 mt-1 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <UserCheck className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">{s.name}</p>
          {(s.designation || s.company) && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              {s.designation}{s.designation && s.company && " · "}{s.company && <><Building className="h-3 w-3" />{s.company}</>}
            </p>
          )}
          {s.bio && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{s.bio}</p>}
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}><Pencil className="h-3 w-3" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onDelete}><Trash2 className="h-3 w-3" /></Button>
        </div>
      </div>
      {link ? (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2 py-1.5">
          <Link2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <code className="text-[11px] text-muted-foreground truncate flex-1 font-mono">{link}</code>
          <Button
            variant="ghost" size="icon" className="h-6 w-6 shrink-0"
            onClick={() => { navigator.clipboard.writeText(link); toast.success("Speaker link copied"); }}
          >
            <Copy className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground italic">
          {s.email
            ? "Speaker link will appear after the broadcast room is created."
            : "Add an email to generate a unique webinar join link."}
        </p>
      )}
    </div>
  );
}
