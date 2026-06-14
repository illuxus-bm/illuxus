import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/observability";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Save, ExternalLink, ChevronUp, ChevronDown, Plus, Trash2, Eye, GripVertical,
} from "lucide-react";
import {
  DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors,
  closestCenter, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, sortableKeyboardCoordinates,
  verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  EventPageConfig, EventSection, SECTION_CATALOG,
  buildDefaultConfig, normalizeConfig, genId, DEFAULT_THEME, ThemeConfig,
} from "./types";
import {
  RendererEvent, RendererSpeaker, RendererSession, RendererSponsor,
} from "./PublicEventRenderer";
import EventPagePreview from "./EventPagePreview";
import EventBannerPicker from "@/components/event/EventBannerPicker";
import { useAuth } from "@/contexts/AuthContext";
import { THEME_PRESETS, COLOR_SWATCHES, FONT_OPTIONS } from "./presets";
import { useOrg } from "@/contexts/OrgContext";
import { eventPublicPath, eventPublicUrl } from "@/lib/event-routes";

/**
 * Form-based event page editor.
 * Left column: section list with enable/reorder.
 * Right column: form fields for the selected section + live preview.
 */
export default function EventPageForm({ eventId }: { eventId: string }) {
  const { user } = useAuth();
  const [config, setConfig] = useState<EventPageConfig>(buildDefaultConfig);
  const [event, setEvent] = useState<RendererEvent | null>(null);
  const [speakers, setSpeakers] = useState<RendererSpeaker[]>([]);
  const [sessions, setSessions] = useState<RendererSession[]>([]);
  const [sponsors, setSponsors] = useState<RendererSponsor[]>([]);
  const [selectedId, setSelectedId] = useState<string>("hero");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [view, setView] = useState<"edit" | "preview">("edit");
  const { toast } = useToast();
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { org } = useOrg();
  const orgHandle =
    (org as { subdomain?: string | null } | null)?.subdomain || org?.slug || null;

  useEffect(() => {
    (async () => {
      const [evRes, spkRel, sesRes, spRel] = await Promise.all([
        supabase.from("events").select("*").eq("id", eventId).single(),
        supabase.from("event_speakers").select("speaker_id, display_order").eq("event_id", eventId).order("display_order"),
        supabase.from("sessions").select("*").eq("event_id", eventId).order("start_time"),
        supabase.from("event_sponsors").select("sponsor_id, display_order").eq("event_id", eventId).order("display_order"),
      ]);
      if (evRes.data) {
        setEvent(evRes.data as RendererEvent);
        setConfig(normalizeConfig(evRes.data.page_config));
      }
      setSessions((sesRes.data as RendererSession[]) || []);
      if (spkRel.data?.length) {
        const ids = spkRel.data.map((s: any) => s.speaker_id);
        const { data } = await supabase.from("speakers").select("*").in("id", ids);
        const orderMap = new Map(ids.map((id, i) => [id, i] as const));
        const sorted = ((data as RendererSpeaker[]) || []).slice().sort(
          (a, b) => (orderMap.get(a.id) ?? 9999) - (orderMap.get(b.id) ?? 9999)
        );
        setSpeakers(sorted);
      }
      if (spRel.data?.length) {
        const ids = spRel.data.map((s: any) => s.sponsor_id);
        const { data } = await supabase.from("sponsors").select("*").in("id", ids);
        const orderMap = new Map(ids.map((id, i) => [id, i] as const));
        const sorted = ((data as RendererSponsor[]) || []).slice().sort(
          (a, b) => (orderMap.get(a.id) ?? 9999) - (orderMap.get(b.id) ?? 9999)
        );
        setSponsors(sorted);
      }
    })();
  }, [eventId]);

  const update = useCallback((updater: (c: EventPageConfig) => EventPageConfig) => {
    setConfig(prev => updater(prev));
    setDirty(true);
  }, []);

  const handleSave = async () => {
    // Cancel any pending auto-save so we don't double-write the same payload.
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = null;
    }
    pendingConfigRef.current = null;
    setSaving(true);
    const { error } = await supabase
      .from("events")
      .update({ page_config: config as never })
      .eq("id", eventId);
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      setDirty(false);
      toast({ title: "Saved", description: "Landing page updated." });
    }
  };

  // Auto-persist structural changes (enable/disable + order) without toast spam.
  // Track the latest pending config so we can flush before navigation.
  const pendingConfigRef = useRef<EventPageConfig | null>(null);

  const persistConfig = useCallback(async (next: EventPageConfig) => {
    setSaving(true);
    const { error } = await supabase
      .from("events")
      .update({ page_config: next as never })
      .eq("id", eventId);
    setSaving(false);
    pendingConfigRef.current = null;
    if (error) {
      toast({ title: "Auto-save failed", description: error.message, variant: "destructive" });
    } else {
      setDirty(false);
    }
  }, [eventId, toast]);

  // Structural changes (toggle/reorder) save almost immediately (50ms) so
  // that opening the live page right after a toggle reflects the new state.
  const autoSaveStructure = useCallback((next: EventPageConfig) => {
    pendingConfigRef.current = next;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      const pending = pendingConfigRef.current;
      if (pending) void persistConfig(pending);
    }, 50);
  }, [persistConfig]);

  // Flush any pending structural save (used before opening the live page).
  const flushPendingSave = useCallback(async () => {
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = null;
    }
    const pending = pendingConfigRef.current;
    if (pending) await persistConfig(pending);
  }, [persistConfig]);

  useEffect(() => () => {
    // On unmount, fire any pending save synchronously so toggles aren't lost.
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = null;
    }
    const pending = pendingConfigRef.current;
    if (pending) {
      void supabase
        .from("events")
        .update({ page_config: pending as never })
        .eq("id", eventId)
        .then(({ error }) => {
          if (error) {
            logger.warn("event page-config unmount save failed", {
              event_id: eventId,
              error_message: error.message,
            });
          }
        });
      pendingConfigRef.current = null;
    }
  }, [eventId]);

  const sortedSections = useMemo(
    () => [...config.sections].sort((a, b) => a.order - b.order),
    [config.sections],
  );

  const flatSections = useMemo(() => {
    const out: { meta: typeof SECTION_CATALOG[number]; section: EventSection }[] = [];
    for (const s of sortedSections) {
      const meta = SECTION_CATALOG.find(m => m.id === s.id);
      if (!meta) continue;
      out.push({ meta, section: s });
    }
    return out;
  }, [sortedSections]);

  const selected = config.sections.find(s => s.id === selectedId) || config.sections[0];

  const move = (id: string, dir: -1 | 1) => {
    update(c => {
      const ordered = [...c.sections].sort((a, b) => a.order - b.order);
      const i = ordered.findIndex(s => s.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= ordered.length) return c;
      [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
      const next = { ...c, sections: ordered.map((s, idx) => ({ ...s, order: idx })) };
      autoSaveStructure(next);
      return next;
    });
  };

  const toggle = (id: string) => {
    update(c => {
      const next = { ...c, sections: c.sections.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s) };
      autoSaveStructure(next);
      return next;
    });
  };

  const reorder = (fromId: string, toId: string) => {
    update(c => {
      const ordered = [...c.sections].sort((a, b) => a.order - b.order);
      const from = ordered.findIndex(s => s.id === fromId);
      const to = ordered.findIndex(s => s.id === toId);
      if (from < 0 || to < 0 || from === to) return c;
      const moved = arrayMove(ordered, from, to);
      const next = { ...c, sections: moved.map((s, idx) => ({ ...s, order: idx })) };
      autoSaveStructure(next);
      return next;
    });
  };

  const updateSectionData = (id: string, patch: Record<string, unknown>) => {
    update(c => ({
      ...c,
      sections: c.sections.map(s => s.id === id
        ? ({ ...s, data: { ...(s.data as object), ...patch } } as EventSection)
        : s),
    }));
  };

  const updateSection = (id: string, patch: Partial<EventSection>) => {
    update(c => ({
      ...c,
      sections: c.sections.map(s => s.id === id
        ? ({ ...s, ...patch } as EventSection)
        : s),
    }));
  };

  if (!event) {
    return <div className="p-8 text-sm text-muted-foreground">Loading editor…</div>;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] -m-4 lg:-m-6 min-w-0 overflow-hidden">
      {/* Toolbar */}
      <div className="h-12 border-b border-border bg-card flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Landing page</h2>
          {dirty && <span className="text-[11px] text-muted-foreground">· Unsaved changes</span>}
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-border p-0.5 bg-secondary/40">
            <button
              onClick={() => setView("edit")}
              className={`px-2.5 h-7 text-[12px] rounded ${view === "edit" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}
            >Edit</button>
            <button
              onClick={() => setView("preview")}
              className={`px-2.5 h-7 text-[12px] rounded ${view === "preview" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}
            >Preview</button>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[12px] gap-1"
            onClick={async () => {
              const href = eventPublicUrl({ id: eventId, slug: event?.slug ?? null }, orgHandle);
              // Open a tab synchronously so popup blockers don't block it,
              // then flush any pending save and navigate the new tab.
              const win = window.open("", "_blank");
              await flushPendingSave();
              if (dirty) await handleSave();
              if (win) win.location.href = href; else window.open(href, "_blank");
            }}
          >
            <ExternalLink className="h-3 w-3" /> Open
          </Button>
          <Button size="sm" className="h-7 text-[12px] gap-1" onClick={handleSave} disabled={saving || !dirty}>
            <Save className="h-3 w-3" /> {saving ? "Saving…" : dirty ? "Save" : "Saved"}
          </Button>
        </div>
      </div>

      {view === "preview" ? (
        <div className="flex-1 overflow-auto bg-muted/30 min-w-0">
          <div className="w-full max-w-5xl mx-auto my-4 sm:my-6 px-3 sm:px-4 lg:px-6">
           <div className="rounded-xl overflow-hidden border border-border bg-background shadow-sm">
            <EventPagePreview
              config={config}
              event={event}
              speakers={speakers}
              sessions={sessions}
              sponsors={sponsors}
              previewMode
            />
           </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-1 md:grid-cols-[280px_1fr] overflow-hidden">
          <SectionListAside
            sections={flatSections} selectedId={selectedId} setSelectedId={setSelectedId}
            toggle={toggle} move={move} reorder={reorder} config={config} update={update}
          />
          <main className="overflow-y-auto bg-muted/20">
            <div className="max-w-2xl mx-auto p-6">
              {selectedId === "__banner" ? (
                <BannerCard
                  eventId={eventId}
                  userId={user?.id ?? ""}
                  bannerLandscapeUrl={(event as RendererEvent & { banner_landscape_url?: string | null }).banner_landscape_url ?? null}
                  bannerPortraitUrl={(event as RendererEvent & { banner_portrait_url?: string | null }).banner_portrait_url ?? null}
                  onBannerChange={async (variant, url) => {
                    const patch: Record<string, string | null> =
                      variant === "landscape"
                        ? { banner_landscape_url: url }
                        : { banner_portrait_url: url };
                    const { error } = await supabase
                      .from("events")
                      .update(patch as never)
                      .eq("id", eventId);
                    if (error) {
                      toast({ title: "Banner update failed", description: error.message, variant: "destructive" });
                      return;
                    }
                    setEvent((prev) => (prev ? { ...prev, ...(patch as object) } as RendererEvent : prev));
                    const label = variant === "landscape" ? "Landscape banner" : "Portrait banner";
                    toast({ title: url ? `${label} updated` : `${label} removed` });
                  }}
                />
              ) : (
                <SectionForm
                  section={selected}
                  onUpdate={(patch) => updateSectionData(selected.id, patch)}
                  eventId={eventId}
                />
              )}
            </div>
          </main>
        </div>
      )}
    </div>
  );
}

/* ─── Section list sidebar (shared by edit + live views) ─── */
function SectionListAside({
  sections, selectedId, setSelectedId, toggle, move, reorder, config, update,
}: {
  sections: { meta: typeof SECTION_CATALOG[number]; section: EventSection }[];
  selectedId: string;
  setSelectedId: (id: string) => void;
  toggle: (id: string) => void;
  move: (id: string, dir: -1 | 1) => void;
  reorder: (fromId: string, toId: string) => void;
  config: EventPageConfig;
  update: (u: (c: EventPageConfig) => EventPageConfig) => void;
}) {
  const theme = config.theme;
  const setTheme = (patch: Partial<typeof theme>) =>
    update(c => ({ ...c, theme: { ...c.theme, ...patch } }));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    reorder(String(active.id), String(over.id));
  };

  return (
    <aside className="border-r border-border bg-card overflow-y-auto">
      <div className="p-3 space-y-4">
        {/* Banner & Cover — dedicated tab (placed above Theme & SEO for prominence) */}
        <button
          type="button"
          onClick={() => setSelectedId("__banner")}
          className={`w-full flex items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors ${
            selectedId === "__banner"
              ? "border-primary bg-secondary"
              : "border-border bg-background hover:bg-secondary/60"
          }`}
        >
          <div>
            <p className="text-[12px] font-semibold">Banner &amp; Cover</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Landscape &amp; portrait images</p>
          </div>
        </button>

        {/* Theme & SEO (collapsed by default) */}
        <details className="rounded-lg border border-border bg-background">
          <summary className="cursor-pointer px-3 py-2 text-[12px] font-semibold select-none">Theme & SEO</summary>
          <div className="px-3 py-2 space-y-3">
            {/* Preset themes */}
            <div>
              <Label className="text-[11px] text-muted-foreground">Theme presets</Label>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5 max-h-[200px] overflow-y-auto pr-1">
                {THEME_PRESETS.map(p => {
                  const active = theme.primaryColor.toLowerCase() === p.theme.primaryColor.toLowerCase()
                    && theme.backgroundColor.toLowerCase() === p.theme.backgroundColor.toLowerCase();
                  return (
                    <button
                      key={p.id}
                      onClick={() => update(c => ({ ...c, theme: { ...p.theme } }))}
                      className={`rounded-md border p-1.5 text-left transition-colors ${active ? "border-primary ring-1 ring-primary" : "border-border hover:border-muted-foreground/40"}`}
                      title={p.name}
                    >
                      <div className="flex gap-1 mb-1" style={{ background: p.theme.backgroundColor, padding: 4, borderRadius: 4 }}>
                        <span className="h-3 w-3 rounded-full" style={{ background: p.theme.primaryColor }} />
                        <span className="h-3 w-3 rounded-full" style={{ background: p.theme.accentColor }} />
                        <span className="h-3 w-3 rounded-full border border-black/10" style={{ background: p.theme.textColor }} />
                      </div>
                      <p className="text-[10px] font-medium truncate">{p.name}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Per-swatch color control */}
            <ColorRow label="Primary" value={theme.primaryColor} onChange={v => setTheme({ primaryColor: v })} />
            <ColorRow label="Accent" value={theme.accentColor} onChange={v => setTheme({ accentColor: v })} />
            <ColorRow label="Background" value={theme.backgroundColor} onChange={v => setTheme({ backgroundColor: v })} />
            <ColorRow label="Text" value={theme.textColor} onChange={v => setTheme({ textColor: v })} />

            {/* Font family */}
            <div>
              <Label className="text-[11px] text-muted-foreground">Font family</Label>
              <select
                value={theme.fontFamily}
                onChange={e => setTheme({ fontFamily: e.target.value })}
                className="mt-1 w-full h-8 rounded-md border border-border bg-background text-[12px] px-2"
              >
                {FONT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>

            <button
              onClick={() => update(c => ({ ...c, theme: { ...DEFAULT_THEME } }))}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >Reset theme</button>
            <div className="pt-2 mt-2 border-t border-border space-y-2">
              <FieldText label="Meta title" value={config.seo.metaTitle || ""} onChange={v => update(c => ({ ...c, seo: { ...c.seo, metaTitle: v } }))} />
              <FieldTextarea label="Meta description" value={config.seo.metaDescription || ""} onChange={v => update(c => ({ ...c, seo: { ...c.seo, metaDescription: v } }))} maxLength={160} />
            </div>
          </div>
        </details>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-1.5 px-1">
            Sections
          </p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={sections.map(s => s.section.id)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-0.5">
                {sections.map(({ meta, section }, idx) => (
                  <SortableSectionRow
                    key={section.id}
                    id={section.id}
                    label={meta.label}
                    enabled={section.enabled}
                    active={section.id === selectedId}
                    isFirst={idx === 0}
                    isLast={idx === sections.length - 1}
                    onSelect={() => setSelectedId(section.id)}
                    onToggle={() => toggle(section.id)}
                    onMoveUp={() => move(section.id, -1)}
                    onMoveDown={() => move(section.id, 1)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        </div>
      </div>
    </aside>
  );
}

/* ─── Sortable row ─── */
function SortableSectionRow({
  id, label, enabled, active, isFirst, isLast,
  onSelect, onToggle, onMoveUp, onMoveDown,
}: {
  id: string;
  label: string;
  enabled: boolean;
  active: boolean;
  isFirst: boolean;
  isLast: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-1.5 rounded-lg px-1.5 py-1.5 transition-all duration-200 ${
        active ? "bg-secondary shadow-sm" : "hover:bg-secondary/60"
      } ${isDragging ? "ring-1 ring-primary" : ""}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="h-5 w-4 inline-flex items-center justify-center text-muted-foreground/50 hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <Switch
        checked={enabled}
        onCheckedChange={onToggle}
        aria-label={`Enable ${label}`}
        className="h-[18px] w-8 data-[state=checked]:bg-primary [&>span]:h-3.5 [&>span]:w-3.5 [&>span]:data-[state=checked]:translate-x-3.5 transition-all duration-200"
      />
      <button onClick={onSelect} className="flex-1 text-left min-w-0">
        <p className={`text-[12px] truncate transition-colors ${enabled ? "font-medium text-foreground" : "text-muted-foreground"}`}>{label}</p>
      </button>
      <button onClick={onMoveUp} disabled={isFirst} className="opacity-0 group-hover:opacity-100 disabled:opacity-20 h-5 w-5 inline-flex items-center justify-center rounded hover:bg-background transition-opacity" aria-label="Move up">
        <ChevronUp className="h-3 w-3" />
      </button>
      <button onClick={onMoveDown} disabled={isLast} className="opacity-0 group-hover:opacity-100 disabled:opacity-20 h-5 w-5 inline-flex items-center justify-center rounded hover:bg-background transition-opacity" aria-label="Move down">
        <ChevronDown className="h-3 w-3" />
      </button>
    </li>
  );
}

/* ─── Field primitives ─── */

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] text-muted-foreground">{label}</Label>
        <div className="flex items-center gap-1">
          <Input value={value} onChange={e => onChange(e.target.value)} className="h-7 w-[72px] text-[10px] font-mono" />
          <input type="color" value={value} onChange={e => onChange(e.target.value)} className="h-7 w-7 rounded border border-border cursor-pointer" />
        </div>
      </div>
      <div className="grid grid-cols-8 gap-1">
        {COLOR_SWATCHES.map(c => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={`h-4 w-4 rounded-sm border transition-transform hover:scale-110 ${value.toLowerCase() === c.toLowerCase() ? "ring-1 ring-offset-1 ring-primary border-primary" : "border-black/10"}`}
            style={{ backgroundColor: c }}
            aria-label={`Color ${c}`}
            title={c}
          />
        ))}
      </div>
    </div>
  );
}

function FieldText({ label, value, onChange, placeholder, maxLength }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; maxLength?: number }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px]">{label}</Label>
      <Input value={value} placeholder={placeholder} maxLength={maxLength} onChange={e => onChange(e.target.value)} className="h-8 text-[12px]" />
    </div>
  );
}

function FieldTextarea({ label, value, onChange, placeholder, maxLength, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; maxLength?: number; rows?: number }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px]">{label}</Label>
      <Textarea value={value} placeholder={placeholder} maxLength={maxLength} rows={rows} onChange={e => onChange(e.target.value)} className="text-[12px]" />
    </div>
  );
}

function FieldSwitch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-1">
      <Label className="text-[12px]">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/* ─── Section forms ─── */

function SectionForm({ section, onUpdate, eventId }: {
  section: EventSection;
  onUpdate: (patch: Record<string, unknown>) => void;
  eventId: string;
}) {
  const meta = SECTION_CATALOG.find(m => m.id === section.id);
  const d = section.data as Record<string, unknown>;

  const Header = (
    <div className="mb-5">
      <h3 className="text-base font-semibold">{meta?.label}</h3>
      <p className="text-xs text-muted-foreground mt-0.5">{meta?.description}</p>
      {!section.enabled && <p className="text-[11px] text-amber-600 mt-2">This section is hidden on the public page. Enable it from the left.</p>}
    </div>
  );

  const fields: React.ReactNode = (() => {
    switch (section.id) {
      case "hero": return <>
        <p className="text-[11px] text-muted-foreground -mt-2 mb-1">
          Tip: upload the desktop &amp; mobile banner images in the <span className="font-medium text-foreground">Banner &amp; Cover</span> card above.
        </p>
        <FieldText label="Badge" value={(d.badge as string) || ""} onChange={v => onUpdate({ badge: v })} placeholder="e.g. Conference 2026" />
        <FieldText label="Headline" value={(d.headline as string) || ""} onChange={v => onUpdate({ headline: v })} placeholder="Defaults to event title" />
        <FieldTextarea label="Subheadline" value={(d.subheadline as string) || ""} onChange={v => onUpdate({ subheadline: v })} />
        <FieldText label="Background image URL" value={(d.backgroundImage as string) || ""} onChange={v => onUpdate({ backgroundImage: v })} />
        <div className="grid grid-cols-2 gap-3">
          <FieldText label="Primary CTA text" value={(d.primaryCtaText as string) || ""} onChange={v => onUpdate({ primaryCtaText: v })} />
          <FieldText label="Primary CTA link" value={(d.primaryCtaUrl as string) || ""} onChange={v => onUpdate({ primaryCtaUrl: v })} placeholder="#tickets" />
          <FieldText label="Secondary CTA text" value={(d.secondaryCtaText as string) || ""} onChange={v => onUpdate({ secondaryCtaText: v })} />
          <FieldText label="Secondary CTA link" value={(d.secondaryCtaUrl as string) || ""} onChange={v => onUpdate({ secondaryCtaUrl: v })} />
        </div>
        <FieldSwitch label="Show date" checked={d.showDate !== false} onChange={v => onUpdate({ showDate: v })} />
        <FieldSwitch label="Show venue" checked={d.showVenue !== false} onChange={v => onUpdate({ showVenue: v })} />
      </>;
      case "about": return <>
        <FieldText label="Title" value={(d.title as string) || ""} onChange={v => onUpdate({ title: v })} />
        <FieldTextarea label="Body" value={(d.body as string) || ""} onChange={v => onUpdate({ body: v })} rows={6} />
        <ListEditor label="Highlights" items={(d.highlights as { label: string; value: string }[]) || []}
          onChange={items => onUpdate({ highlights: items })}
          newItem={() => ({ label: "", value: "" })}
          renderItem={(item, set) => (
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="500+" value={item.value} onChange={e => set({ ...item, value: e.target.value })} className="h-8 text-[12px]" />
              <Input placeholder="Attendees" value={item.label} onChange={e => set({ ...item, label: e.target.value })} className="h-8 text-[12px]" />
            </div>
          )} />
      </>;
      case "dateVenue": return <>
        <FieldText label="Title" value={(d.title as string) || ""} onChange={v => onUpdate({ title: v })} />
        <FieldTextarea label="Address" value={(d.address as string) || ""} onChange={v => onUpdate({ address: v })} />
        <FieldText label="Map embed URL" value={(d.mapEmbedUrl as string) || ""} onChange={v => onUpdate({ mapEmbedUrl: v })} placeholder="https://www.google.com/maps/embed?…" />
        <FieldTextarea label="Parking notes" value={(d.parkingNotes as string) || ""} onChange={v => onUpdate({ parkingNotes: v })} />
        <FieldTextarea label="Public transit notes" value={(d.transitNotes as string) || ""} onChange={v => onUpdate({ transitNotes: v })} />
      </>;
      case "tickets": return <>
        <FieldText label="Title" value={(d.title as string) || ""} onChange={v => onUpdate({ title: v })} />
        <FieldTextarea label="Intro" value={(d.intro as string) || ""} onChange={v => onUpdate({ intro: v })} />
        <ListEditor label="Ticket tiers" items={(d.tiers as { id: string; name: string; price: string; description?: string; earlyBird?: boolean; url?: string }[]) || []}
          onChange={items => onUpdate({ tiers: items })}
          newItem={() => ({ id: genId(), name: "General", price: "Free", description: "" })}
          renderItem={(t, set) => (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Tier name" value={t.name} onChange={e => set({ ...t, name: e.target.value })} className="h-8 text-[12px]" />
                <Input placeholder="₹999 / Free" value={t.price} onChange={e => set({ ...t, price: e.target.value })} className="h-8 text-[12px]" />
              </div>
              <Textarea placeholder="What's included" value={t.description || ""} onChange={e => set({ ...t, description: e.target.value })} rows={2} className="text-[12px]" />
              <Input placeholder="Buy URL" value={t.url || ""} onChange={e => set({ ...t, url: e.target.value })} className="h-8 text-[12px]" />
              <label className="inline-flex items-center gap-2 text-[12px]">
                <Switch checked={!!t.earlyBird} onCheckedChange={v => set({ ...t, earlyBird: v })} /> Early bird
              </label>
            </div>
          )} />
      </>;
      case "agenda": return <>
        <FieldText label="Title" value={(d.title as string) || ""} onChange={v => onUpdate({ title: v })} />
        <FieldTextarea label="Intro" value={(d.intro as string) || ""} onChange={v => onUpdate({ intro: v })} />
        <p className="text-[11px] text-muted-foreground">Sessions are pulled from the Sessions tab.</p>
      </>;
      case "speakers": return <>
        <FieldText label="Title" value={(d.title as string) || ""} onChange={v => onUpdate({ title: v })} />
        <FieldTextarea label="Intro" value={(d.intro as string) || ""} onChange={v => onUpdate({ intro: v })} />
        <FieldSwitch label="Show speaker bios" checked={d.showBio !== false} onChange={v => onUpdate({ showBio: v })} />
        <p className="text-[11px] text-muted-foreground">Speakers are pulled from the Speakers tab.</p>
      </>;
      case "sponsors": return <>
        <FieldText label="Title" value={(d.title as string) || ""} onChange={v => onUpdate({ title: v })} />
        <FieldTextarea label="Intro" value={(d.intro as string) || ""} onChange={v => onUpdate({ intro: v })} />
        <FieldSwitch label="Group by tier" checked={d.groupByTier !== false} onChange={v => onUpdate({ groupByTier: v })} />
        <p className="text-[11px] text-muted-foreground">Sponsors are pulled from the Sponsors tab.</p>
      </>;
      case "workshops": return <>
        <FieldText label="Title" value={(d.title as string) || ""} onChange={v => onUpdate({ title: v })} />
        <ListEditor label="Workshops"
          items={(d.workshops as { id: string; name: string; description?: string; facilitator?: string; duration?: string; price?: string; url?: string }[]) || []}
          onChange={items => onUpdate({ workshops: items })}
          newItem={() => ({ id: genId(), name: "" } as { id: string; name: string; description?: string; facilitator?: string; duration?: string; price?: string; url?: string })}
          renderItem={(w, set) => (
            <div className="space-y-2">
              <Input placeholder="Workshop name" value={w.name} onChange={e => set({ ...w, name: e.target.value })} className="h-8 text-[12px]" />
              <Textarea placeholder="Description" value={w.description || ""} onChange={e => set({ ...w, description: e.target.value })} rows={2} className="text-[12px]" />
              <div className="grid grid-cols-3 gap-2">
                <Input placeholder="Facilitator" value={w.facilitator || ""} onChange={e => set({ ...w, facilitator: e.target.value })} className="h-8 text-[12px]" />
                <Input placeholder="2h" value={w.duration || ""} onChange={e => set({ ...w, duration: e.target.value })} className="h-8 text-[12px]" />
                <Input placeholder="₹500" value={w.price || ""} onChange={e => set({ ...w, price: e.target.value })} className="h-8 text-[12px]" />
              </div>
              <Input placeholder="Sign-up URL" value={w.url || ""} onChange={e => set({ ...w, url: e.target.value })} className="h-8 text-[12px]" />
            </div>
          )} />
      </>;
      case "exhibitors": return <>
        <FieldText label="Title" value={(d.title as string) || ""} onChange={v => onUpdate({ title: v })} />
        <FieldText label="Floor map URL" value={(d.floorMapUrl as string) || ""} onChange={v => onUpdate({ floorMapUrl: v })} />
        <ListEditor label="Exhibitors"
          items={(d.exhibitors as { id: string; name: string; booth?: string; description?: string; logoUrl?: string; website?: string }[]) || []}
          onChange={items => onUpdate({ exhibitors: items })}
          newItem={() => ({ id: genId(), name: "" } as { id: string; name: string; booth?: string; description?: string; logoUrl?: string; website?: string })}
          renderItem={(e, set) => (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Name" value={e.name} onChange={ev => set({ ...e, name: ev.target.value })} className="h-8 text-[12px]" />
                <Input placeholder="Booth #" value={e.booth || ""} onChange={ev => set({ ...e, booth: ev.target.value })} className="h-8 text-[12px]" />
              </div>
              <Input placeholder="Logo URL" value={e.logoUrl || ""} onChange={ev => set({ ...e, logoUrl: ev.target.value })} className="h-8 text-[12px]" />
              <Input placeholder="Website" value={e.website || ""} onChange={ev => set({ ...e, website: ev.target.value })} className="h-8 text-[12px]" />
              <Textarea placeholder="Description" value={e.description || ""} onChange={ev => set({ ...e, description: ev.target.value })} rows={2} className="text-[12px]" />
            </div>
          )} />
      </>;
      case "travel": return <>
        <FieldText label="Title" value={(d.title as string) || ""} onChange={v => onUpdate({ title: v })} />
        <FieldTextarea label="Airport / getting here" value={(d.airportInfo as string) || ""} onChange={v => onUpdate({ airportInfo: v })} rows={4} />
        <ListEditor label="Recommended hotels"
          items={(d.hotels as { name: string; address?: string; discountCode?: string; url?: string }[]) || []}
          onChange={items => onUpdate({ hotels: items })}
          newItem={() => ({ name: "" } as { name: string; address?: string; discountCode?: string; url?: string })}
          renderItem={(h, set) => (
            <div className="space-y-2">
              <Input placeholder="Hotel name" value={h.name} onChange={e => set({ ...h, name: e.target.value })} className="h-8 text-[12px]" />
              <Input placeholder="Address" value={h.address || ""} onChange={e => set({ ...h, address: e.target.value })} className="h-8 text-[12px]" />
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Discount code" value={h.discountCode || ""} onChange={e => set({ ...h, discountCode: e.target.value })} className="h-8 text-[12px]" />
                <Input placeholder="Booking URL" value={h.url || ""} onChange={e => set({ ...h, url: e.target.value })} className="h-8 text-[12px]" />
              </div>
            </div>
          )} />
      </>;
      case "codeOfConduct": return <>
        <FieldText label="Title" value={(d.title as string) || ""} onChange={v => onUpdate({ title: v })} />
        <FieldTextarea label="Policy text" value={(d.body as string) || ""} onChange={v => onUpdate({ body: v })} rows={8} />
        <FieldText label="Reporting email" value={(d.reportingContact as string) || ""} onChange={v => onUpdate({ reportingContact: v })} />
      </>;
      case "gallery": return <>
        <FieldText label="Title" value={(d.title as string) || ""} onChange={v => onUpdate({ title: v })} />
        <ListEditor label="Images"
          items={(d.items as { id: string; url: string; caption?: string }[]) || []}
          onChange={items => onUpdate({ items })}
          newItem={() => ({ id: genId(), url: "" } as { id: string; url: string; caption?: string })}
          renderItem={(it, set) => (
            <div className="space-y-2">
              <Input placeholder="Image URL" value={it.url} onChange={e => set({ ...it, url: e.target.value })} className="h-8 text-[12px]" />
              <Input placeholder="Caption (optional)" value={it.caption || ""} onChange={e => set({ ...it, caption: e.target.value })} className="h-8 text-[12px]" />
            </div>
          )} />
      </>;
      case "testimonials": return <>
        <FieldText label="Title" value={(d.title as string) || ""} onChange={v => onUpdate({ title: v })} />
        <ListEditor label="Testimonials"
          items={(d.testimonials as { id: string; quote: string; author: string; role?: string }[]) || []}
          onChange={items => onUpdate({ testimonials: items })}
          newItem={() => ({ id: genId(), quote: "", author: "" } as { id: string; quote: string; author: string; role?: string })}
          renderItem={(t, set) => (
            <div className="space-y-2">
              <Textarea placeholder="Quote" value={t.quote} onChange={e => set({ ...t, quote: e.target.value })} rows={2} className="text-[12px]" />
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Author" value={t.author} onChange={e => set({ ...t, author: e.target.value })} className="h-8 text-[12px]" />
                <Input placeholder="Role / company" value={t.role || ""} onChange={e => set({ ...t, role: e.target.value })} className="h-8 text-[12px]" />
              </div>
            </div>
          )} />
      </>;
      case "newsletter": return <>
        <FieldText label="Title" value={(d.title as string) || ""} onChange={v => onUpdate({ title: v })} />
        <FieldTextarea label="Description" value={(d.description as string) || ""} onChange={v => onUpdate({ description: v })} />
        <FieldText label="Button text" value={(d.buttonText as string) || ""} onChange={v => onUpdate({ buttonText: v })} />
        <FieldText label="Success message" value={(d.successMessage as string) || ""} onChange={v => onUpdate({ successMessage: v })} />
      </>;
      case "press": return <>
        <FieldText label="Title" value={(d.title as string) || ""} onChange={v => onUpdate({ title: v })} />
        <FieldTextarea label="Body" value={(d.body as string) || ""} onChange={v => onUpdate({ body: v })} />
        <FieldText label="Press kit URL" value={(d.pressKitUrl as string) || ""} onChange={v => onUpdate({ pressKitUrl: v })} />
        <FieldText label="Press contact email" value={(d.contactEmail as string) || ""} onChange={v => onUpdate({ contactEmail: v })} />
      </>;
      case "partners": return <>
        <FieldText label="Title" value={(d.title as string) || ""} onChange={v => onUpdate({ title: v })} />
        <ListEditor label="Partners"
          items={(d.partners as { id: string; name: string; logoUrl?: string; website?: string }[]) || []}
          onChange={items => onUpdate({ partners: items })}
          newItem={() => ({ id: genId(), name: "" } as { id: string; name: string; logoUrl?: string; website?: string })}
          renderItem={(p, set) => (
            <div className="space-y-2">
              <Input placeholder="Name" value={p.name} onChange={e => set({ ...p, name: e.target.value })} className="h-8 text-[12px]" />
              <Input placeholder="Logo URL" value={p.logoUrl || ""} onChange={e => set({ ...p, logoUrl: e.target.value })} className="h-8 text-[12px]" />
              <Input placeholder="Website" value={p.website || ""} onChange={e => set({ ...p, website: e.target.value })} className="h-8 text-[12px]" />
            </div>
          )} />
      </>;
      case "liveStream": return <>
        <FieldText label="Title" value={(d.title as string) || ""} onChange={v => onUpdate({ title: v })} />
        <FieldText label="Embed URL (YouTube, Vimeo, Twitch)" value={(d.embedUrl as string) || ""} onChange={v => onUpdate({ embedUrl: v })} />
        <FieldTextarea label="Description" value={(d.description as string) || ""} onChange={v => onUpdate({ description: v })} />
      </>;
      case "networking": return <>
        <FieldText label="Title" value={(d.title as string) || ""} onChange={v => onUpdate({ title: v })} />
        <FieldTextarea label="Description" value={(d.description as string) || ""} onChange={v => onUpdate({ description: v })} />
        <FieldText label="Slack invite URL" value={(d.slackUrl as string) || ""} onChange={v => onUpdate({ slackUrl: v })} />
        <FieldText label="Discord invite URL" value={(d.discordUrl as string) || ""} onChange={v => onUpdate({ discordUrl: v })} />
        <FieldText label="Telegram invite URL" value={(d.telegramUrl as string) || ""} onChange={v => onUpdate({ telegramUrl: v })} />
      </>;
      case "cfp": return <>
        <FieldText label="Title" value={(d.title as string) || ""} onChange={v => onUpdate({ title: v })} />
        <FieldTextarea label="Description" value={(d.description as string) || ""} onChange={v => onUpdate({ description: v })} />
        <FieldText label="Deadline" value={(d.deadline as string) || ""} onChange={v => onUpdate({ deadline: v })} placeholder="June 1, 2026" />
        <FieldText label="Submission URL" value={(d.submitUrl as string) || ""} onChange={v => onUpdate({ submitUrl: v })} />
        <FieldTextarea label="Guidelines" value={(d.guidelines as string) || ""} onChange={v => onUpdate({ guidelines: v })} rows={5} />
      </>;
      case "countdown": return <>
        <FieldText label="Title" value={(d.title as string) || ""} onChange={v => onUpdate({ title: v })} />
        <FieldText label="Target date (ISO, optional)" value={(d.targetDate as string) || ""} onChange={v => onUpdate({ targetDate: v })} placeholder="Defaults to event start" />
      </>;
      case "faq": return <>
        <FieldText label="Title" value={(d.title as string) || ""} onChange={v => onUpdate({ title: v })} />
        <ListEditor label="Questions"
          items={(d.items as { id: string; question: string; answer: string }[]) || []}
          onChange={items => onUpdate({ items })}
          newItem={() => ({ id: genId(), question: "", answer: "" })}
          renderItem={(it, set) => (
            <div className="space-y-2">
              <Input placeholder="Question" value={it.question} onChange={e => set({ ...it, question: e.target.value })} className="h-8 text-[12px]" />
              <Textarea placeholder="Answer" value={it.answer} onChange={e => set({ ...it, answer: e.target.value })} rows={3} className="text-[12px]" />
            </div>
          )} />
      </>;
      case "contact": return <>
        <FieldText label="Title" value={(d.title as string) || ""} onChange={v => onUpdate({ title: v })} />
        <FieldText label="Organizer name" value={(d.organizerName as string) || ""} onChange={v => onUpdate({ organizerName: v })} />
        <div className="grid grid-cols-2 gap-3">
          <FieldText label="Email" value={(d.email as string) || ""} onChange={v => onUpdate({ email: v })} />
          <FieldText label="Phone" value={(d.phone as string) || ""} onChange={v => onUpdate({ phone: v })} />
          <FieldText label="Twitter" value={(d.twitter as string) || ""} onChange={v => onUpdate({ twitter: v })} placeholder="@handle" />
          <FieldText label="LinkedIn" value={(d.linkedin as string) || ""} onChange={v => onUpdate({ linkedin: v })} />
          <FieldText label="Website" value={(d.website as string) || ""} onChange={v => onUpdate({ website: v })} />
        </div>
      </>;
      case "customHtml": return <>
        <FieldTextarea label="Custom HTML (script/iframe stripped)" value={(d.html as string) || ""} onChange={v => onUpdate({ html: v })} rows={10} />
      </>;
      default: return null;
    }
  })();

  return (
    <div>
      {Header}
      <div className="space-y-3">{fields}</div>
    </div>
  );
}

/* ─── Generic list editor with add/remove ─── */

/**
 * Stable React key for each item.
 *  - If the item is an object with an `id` field (string/number), use it.
 *  - Otherwise fall back to a positional key derived from the row's content
 *    + index so React still gets a deterministic-per-render key, but typing
 *    in row N doesn't bleed into row N+1 after adding a row above it.
 */
function listItemKey<T>(item: T, index: number): string {
  if (item && typeof item === "object" && "id" in item) {
    const candidate = (item as { id?: unknown }).id;
    if (typeof candidate === "string" || typeof candidate === "number") {
      return String(candidate);
    }
  }
  return `idx-${index}`;
}

function ListEditor<T>({ label, items, onChange, newItem, renderItem }: {
  label: string;
  items: T[];
  onChange: (items: T[]) => void;
  newItem: () => T;
  renderItem: (item: T, set: (next: T) => void) => React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-[11px]">{label}</Label>
        <Button size="sm" variant="outline" className="h-6 text-[11px] gap-1" onClick={() => onChange([...items, newItem()])}>
          <Plus className="h-3 w-3" /> Add
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-[11px] text-muted-foreground italic">None added yet.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={listItemKey(item, i)} className="rounded-md border border-border bg-background p-3">
              <div className="flex justify-end mb-2">
                <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="h-5 w-5 inline-flex items-center justify-center rounded text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              {renderItem(item, (next) => onChange(items.map((it, j) => j === i ? next : it)))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
/* ─── Always-visible Banner card (top of editor) ─── */
function BannerCard({
  eventId, userId, bannerLandscapeUrl, bannerPortraitUrl, onBannerChange,
}: {
  eventId: string;
  userId: string;
  bannerLandscapeUrl: string | null;
  bannerPortraitUrl: string | null;
  onBannerChange: (variant: "landscape" | "portrait", url: string | null) => void | Promise<void>;
}) {
  return (
    <section className="mb-6 rounded-xl border border-border bg-card p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold">Banners</h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Landscape shows on desktop &amp; tablet. Portrait shows on phones — optional, landscape is used as fallback.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <EventBannerPicker
          eventId={eventId}
          userId={userId}
          label="Landscape banner (desktop)"
          aspect={16 / 9}
          aspectLabel="16:9 (landscape)"
          recommendedPx="1920×1080 px"
          outputLongSide={1920}
          variant="landscape"
          imageUrl={bannerLandscapeUrl ?? ""}
          onChange={(url) => onBannerChange("landscape", url || null)}
        />
        <EventBannerPicker
          eventId={eventId}
          userId={userId}
          label="Portrait banner (mobile)"
          aspect={4 / 5}
          aspectLabel="4:5 (portrait)"
          recommendedPx="1080×1350 px"
          outputLongSide={1350}
          variant="portrait"
          imageUrl={bannerPortraitUrl ?? ""}
          onChange={(url) => onBannerChange("portrait", url || null)}
        />
      </div>
    </section>
  );
}
