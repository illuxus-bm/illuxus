/**
 * CreativeStudio — pick a design, pick who it features, adjust the copy,
 * download.
 *
 * Everything shown comes from the event's own data (`loadStudioData`): the
 * speakers and their photos, the sponsors' logos, the date, venue and
 * organiser details. The organiser's edits are kept per event in the browser
 * so a half-finished creative survives a reload; they are overrides on top of
 * the event data, so a line that hasn't been edited keeps following the
 * event when it changes.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { zipSync } from "fflate";
import {
  Check,
  Circle,
  Download,
  FolderDown,
  ImagePlus,
  Loader2,
  Minus,
  Redo2,
  RotateCcw,
  Save,
  Square,
  Type,
  Undo2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { ElementPanel, LayersList } from "@/components/event/creatives/ElementPanel";
import SceneCanvas from "@/components/event/creatives/SceneCanvas";
import SceneEditor from "@/components/event/creatives/SceneEditor";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { buildCreativeAssetRecord, insertCreativeAssetRecord, uploadCreativeAsset } from "@/lib/creatives/creative-storage";
import { loadStudioData, type StudioData } from "@/lib/creatives/studio/data";
import {
  addNode,
  applyEdits,
  duplicateNode,
  EMPTY_EDITS,
  hasEdits,
  patchNode,
  removeNode,
  reorderNode,
  type LayerMove,
  type NodePatch,
  type SceneEdits,
} from "@/lib/creatives/studio/edits";
import { loadImage, measureTextHeight, renderSceneToBlob } from "@/lib/creatives/studio/render";
import { isHexColor, readableOn, type SceneNode, type TextNode } from "@/lib/creatives/studio/scene";
import {
  findStudioFormat,
  findStudioTemplate,
  initialsOf,
  STUDIO_FORMATS,
  STUDIO_TEMPLATES,
  studioFilename,
  type BuildInput,
  type StudioContent,
  type StudioPalette,
  type StudioSpeaker,
  type StudioTemplate,
} from "@/lib/creatives/studio/templates";
import { logger } from "@/lib/observability";
import { cn } from "@/lib/utils";

interface StudioPrefs {
  templateId: string;
  formatId: string;
  overrides: Partial<StudioContent>;
  palettes: Record<string, Partial<StudioPalette>>;
  /** Free-form canvas edits, per `template:format`. */
  edits: Record<string, SceneEdits>;
}

/** Uploaded images are embedded in the creative, so they are kept modest. */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
/** Typing in a field is one undo step, not one per keystroke. */
const UNDO_COALESCE_MS = 700;
/** Text properties that change how tall the text is. */
const TEXT_LAYOUT_KEYS = ["text", "size", "family", "weight", "lineHeight", "letterSpacing"];

const DEFAULT_PREFS: StudioPrefs = {
  templateId: STUDIO_TEMPLATES[0].id,
  formatId: STUDIO_FORMATS[0].id,
  overrides: {},
  palettes: {},
  edits: {},
};

/** Design thumbnails are always square so the picker stays an even grid. */
const THUMBNAIL_FORMAT = findStudioFormat("instagram-post");

const prefsKey = (eventId: string): string => `creative-studio:${eventId}`;

function readPrefs(eventId: string): StudioPrefs {
  try {
    const raw = window.localStorage.getItem(prefsKey(eventId));
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<StudioPrefs>;
    return {
      templateId: typeof parsed.templateId === "string" ? parsed.templateId : DEFAULT_PREFS.templateId,
      formatId: typeof parsed.formatId === "string" ? parsed.formatId : DEFAULT_PREFS.formatId,
      overrides: parsed.overrides && typeof parsed.overrides === "object" ? parsed.overrides : {},
      palettes: parsed.palettes && typeof parsed.palettes === "object" ? parsed.palettes : {},
      edits: parsed.edits && typeof parsed.edits === "object" ? parsed.edits : {},
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function SectionHeading({ step, title, hint }: { step: number; title: string; hint?: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-2">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[11px] font-semibold text-background">
        {step}
      </span>
      <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
      {hint && <span className="text-[12px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

function SpeakerAvatar({ speaker }: { speaker: StudioSpeaker }) {
  const [failed, setFailed] = useState(false);
  if (speaker.photoUrl && !failed) {
    return <img src={speaker.photoUrl} alt="" onError={() => setFailed(true)} className="h-9 w-9 shrink-0 rounded-full object-cover" />;
  }
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
      {initialsOf(speaker.name) || <UserRound className="h-4 w-4" />}
    </span>
  );
}

export default function CreativeStudio({ eventId, onSaved }: { eventId: string; onSaved: () => void }) {
  const { user } = useAuth();
  const [data, setData] = useState<StudioData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<StudioPrefs>(() => readPrefs(eventId));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState<"download" | "save" | "batch" | null>(null);
  const [panel, setPanel] = useState("design");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<{ past: SceneEdits[]; future: SceneEdits[] }>({ past: [], future: [] });
  const lastChangeRef = useRef<{ key: string; at: number }>({ key: "", at: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** The image node an upload should replace; `null` adds a new image. */
  const uploadTargetRef = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setData(null);
    setLoadError(null);
    loadStudioData(eventId)
      .then((loaded) => {
        if (!mounted) return;
        setData(loaded);
        setSelectedIds(loaded.speakers.map((s) => s.id));
      })
      .catch((err: unknown) => {
        if (mounted) setLoadError(err instanceof Error ? err.message : "Could not load the event");
      });
    return () => {
      mounted = false;
    };
  }, [eventId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(prefsKey(eventId), JSON.stringify(prefs));
    } catch {
      // Storage unavailable (private window) — the studio still works, it
      // just won't remember edits.
    }
  }, [eventId, prefs]);

  const template = findStudioTemplate(prefs.templateId);
  // A design that isn't laid out for the chosen size falls back to its first.
  const format = findStudioFormat(
    !template.formats || template.formats.includes(prefs.formatId) ? prefs.formatId : template.formats[0],
  );
  const editsKey = `${template.id}:${format.id}`;
  const edits = prefs.edits[editsKey] ?? EMPTY_EDITS;

  useEffect(() => {
    setSelectedId(null);
    setHistory({ past: [], future: [] });
  }, [editsKey]);
  const palette = useMemo<StudioPalette>(
    () => ({ ...template.palette, ...prefs.palettes[template.id] }),
    [template, prefs.palettes],
  );
  const content = useMemo<StudioContent | null>(
    () => (data ? { ...data.content, ...prefs.overrides } : null),
    [data, prefs.overrides],
  );
  /** The speakers `target` would feature given the current selection. */
  const featuredFor = useMemo(
    () =>
      (target: StudioTemplate): StudioSpeaker[] => {
        if (!data) return [];
        if (target.maxSpeakers === 1) {
          // Single-speaker designs feature the most recently picked speaker,
          // which `toggleSpeaker` keeps at the front of the selection.
          const picked = selectedIds.map((id) => data.speakers.find((s) => s.id === id)).find(Boolean);
          return picked ? [picked] : [];
        }
        return data.speakers.filter((s) => selectedIds.includes(s.id)).slice(0, target.maxSpeakers);
      },
    [data, selectedIds],
  );
  const featured = useMemo(() => featuredFor(template), [featuredFor, template]);

  const inputFor = useMemo(
    () =>
      (target: StudioTemplate, speakers: StudioSpeaker[], targetPalette: StudioPalette): BuildInput | null =>
        data && content
          ? {
              format,
              content,
              speakers,
              sponsors: data.sponsors,
              organizerLogoUrl: data.organizerLogoUrl,
              coverImageUrl: data.coverImageUrl,
              year: data.year,
              palette: targetPalette,
            }
          : null,
    [data, content, format],
  );

  const baseScene = useMemo(() => {
    const input = inputFor(template, featured, palette);
    return input ? template.build(input) : null;
  }, [inputFor, template, featured, palette]);
  const scene = useMemo(() => (baseScene ? applyEdits(baseScene, edits) : null), [baseScene, edits]);

  const thumbnails = useMemo(
    () =>
      STUDIO_TEMPLATES.map((option) => {
        const input = inputFor(option, featuredFor(option), { ...option.palette, ...prefs.palettes[option.id] });
        return input ? option.build({ ...input, format: THUMBNAIL_FORMAT }) : null;
      }),
    [inputFor, featuredFor, prefs.palettes],
  );

  if (loadError) {
    return <p className="py-16 text-center text-[13px] text-destructive">Could not load this event's data: {loadError}</p>;
  }
  if (!data || !content || !scene || !baseScene) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading event data…
      </div>
    );
  }

  const single = template.maxSpeakers === 1;
  const subject = single && featured[0] ? featured[0].name : content.eventTitle;
  const editedKeys = Object.keys(prefs.overrides) as Array<keyof StudioContent>;
  const paletteEdited = Object.keys(prefs.palettes[template.id] ?? {}).length > 0;

  const toggleSpeaker = (id: string): void => {
    if (single) {
      // One featured speaker: move the pick to the front of the selection so
      // switching back to a multi-speaker design keeps everyone else.
      setSelectedIds((ids) => [id, ...ids.filter((other) => other !== id)]);
      return;
    }
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id]));
  };

  const setField = (key: keyof StudioContent, value: string): void =>
    setPrefs((p) => {
      const overrides = { ...p.overrides };
      if (value === data.content[key]) delete overrides[key];
      else overrides[key] = value;
      return { ...p, overrides };
    });

  const setColor = (key: keyof StudioPalette, value: string): void => {
    if (!isHexColor(value)) return;
    setPrefs((p) => ({ ...p, palettes: { ...p.palettes, [template.id]: { ...p.palettes[template.id], [key]: value } } }));
  };

  // ─── Canvas editing ────────────────────────────────────────────────────────

  const setEdits = (next: SceneEdits): void => setPrefs((p) => ({ ...p, edits: { ...p.edits, [editsKey]: next } }));

  /** Records the current state as an undo step. Rapid changes to the same thing share one. */
  const beginChange = (key = ""): void => {
    const now = Date.now();
    const last = lastChangeRef.current;
    lastChangeRef.current = { key, at: now };
    if (key && key === last.key && now - last.at < UNDO_COALESCE_MS) return;
    setHistory((h) => ({ past: [...h.past.slice(-49), edits], future: [] }));
  };
  const undo = (): void => {
    const previous = history.past[history.past.length - 1];
    if (!previous) return;
    setHistory({ past: history.past.slice(0, -1), future: [edits, ...history.future] });
    setEdits(previous);
    lastChangeRef.current = { key: "", at: 0 };
  };
  const redo = (): void => {
    const next = history.future[0];
    if (!next) return;
    setHistory({ past: [...history.past, edits], future: history.future.slice(1) });
    setEdits(next);
    lastChangeRef.current = { key: "", at: 0 };
  };

  const selectedNode = scene.nodes.find((n) => n.id === selectedId) ?? null;

  const applyPatch = (id: string, patch: NodePatch): void => {
    const node = scene.nodes.find((n) => n.id === id);
    let next = patch;
    if (node?.kind === "text" && TEXT_LAYOUT_KEYS.some((key) => key in patch) && !("w" in patch)) {
      // Template text shrinks to fit its box. Once the organiser sets the
      // copy or the size themselves, honour it: keep their size and grow the
      // box instead.
      const merged = { ...node, ...patch } as TextNode;
      const needed = measureTextHeight(merged);
      next = { ...patch, minSize: merged.size, maxLines: undefined, ...(needed > merged.h ? { h: needed } : {}) };
    }
    setEdits(patchNode(edits, id, next));
  };
  const patchSelected = (patch: NodePatch): void => {
    if (!selectedId) return;
    beginChange(`${selectedId}:${Object.keys(patch).sort().join(",")}`);
    applyPatch(selectedId, patch);
  };
  const deleteNode = (id: string): void => {
    beginChange();
    setEdits(removeNode(edits, id));
    setSelectedId(null);
  };
  const duplicate = (id: string): void => {
    const result = duplicateNode(scene, edits, id);
    if (!result) return;
    beginChange();
    setEdits(result.edits);
    setSelectedId(result.id);
  };
  const reorder = (move: LayerMove): void => {
    if (!selectedId) return;
    beginChange();
    setEdits(reorderNode(scene, edits, selectedId, move));
  };
  const insert = (node: SceneNode): void => {
    const result = addNode(edits, node);
    beginChange();
    setEdits(result.edits);
    setSelectedId(result.id);
    setPanel("element");
  };

  const W = scene.width;
  const H = scene.height;
  const inkOnCanvas = readableOn(scene.background);
  const addText = (): void =>
    insert({
      kind: "text", text: "Add your text", x: W * 0.2, y: H * 0.46, w: W * 0.6, h: W * 0.08,
      family: "Poppins", weight: 700, size: W * 0.055, minSize: W * 0.055, color: inkOnCanvas, align: "center", valign: "middle", lineHeight: 1.15,
    });
  const addRect = (): void => insert({ kind: "rect", x: W * 0.35, y: H * 0.4, w: W * 0.3, h: W * 0.2, fill: palette.accent === scene.background ? palette.primary : palette.accent, radius: 0 });
  const addCircle = (): void => insert({ kind: "ellipse", cx: W / 2, cy: H / 2, rx: W * 0.12, ry: W * 0.12, fill: palette.primary });
  const addLine = (): void => insert({ kind: "line", x1: W * 0.3, y1: H / 2, x2: W * 0.7, y2: H / 2, color: inkOnCanvas, width: Math.max(3, W * 0.004) });
  const addImage = async (src: string): Promise<void> => {
    const image = await loadImage(src);
    const ratio = image && image.naturalHeight > 0 ? image.naturalWidth / image.naturalHeight : 1;
    const w = W * 0.4;
    const h = Math.min(H * 0.6, w / ratio);
    insert({ kind: "image", src, fit: "cover", x: (W - w) / 2, y: (H - h) / 2, w, h });
  };

  const eventImages = [
    ...data.speakers.filter((s) => s.photoUrl).map((s) => ({ label: `Photo · ${s.name}`, url: s.photoUrl as string })),
    ...data.sponsors.filter((s) => s.logoUrl).map((s) => ({ label: `Logo · ${s.name}`, url: s.logoUrl as string })),
    ...(data.organizerLogoUrl ? [{ label: "Organiser logo", url: data.organizerLogoUrl }] : []),
    ...(data.coverImageUrl ? [{ label: "Event cover", url: data.coverImageUrl }] : []),
  ];

  const openUpload = (targetId: string | null): void => {
    uploadTargetRef.current = targetId;
    fileInputRef.current?.click();
  };
  const handleFile = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("That file isn't an image");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("That image is too large", { description: "Use one under 4 MB." });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result);
      const target = uploadTargetRef.current;
      if (target) {
        beginChange();
        applyPatch(target, { src });
      } else {
        void addImage(src);
      }
    };
    reader.onerror = () => toast.error("Could not read that image");
    reader.readAsDataURL(file);
  };

  const run = async (kind: "download" | "save" | "batch", task: () => Promise<void>): Promise<void> => {
    setBusy(kind);
    try {
      await task();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("creative studio action failed", { event_id: eventId, action: kind, error_message: message });
      toast.error(kind === "save" ? "Could not save the creative" : "Could not export the creative", {
        description: message.includes("Tainted") || message.includes("insecure")
          ? "One of the images is hosted somewhere that blocks downloads. Re-upload it to the speaker or sponsor and try again."
          : message,
      });
    } finally {
      setBusy(null);
    }
  };

  const handleDownload = (): Promise<void> =>
    run("download", async () => {
      downloadBlob(await renderSceneToBlob(scene), studioFilename(subject, template, format));
    });

  const handleSave = (): Promise<void> =>
    run("save", async () => {
      if (!user) throw new Error("You need to be signed in to save creatives.");
      const speaker = single ? featured[0] : undefined;
      const blob = await renderSceneToBlob(scene);
      const filename = `${Date.now()}-${studioFilename(subject, template, format)}`;
      const { assetUrl, storagePath } = await uploadCreativeAsset(eventId, filename, blob);
      await insertCreativeAssetRecord(
        buildCreativeAssetRecord({
          eventId,
          creativeType: speaker ? "speaker" : "event",
          speakerId: speaker?.id ?? null,
          templateId: template.id,
          platformFormat: format.id,
          assetUrl,
          storagePath,
          createdBy: user.id,
          metadata: { studio: true, speakerIds: featured.map((s) => s.id) },
        }),
      );
      toast.success("Saved to the library");
      onSaved();
    });

  const handleBatch = (): Promise<void> =>
    run("batch", async () => {
      const files: Record<string, Uint8Array> = {};
      for (const speaker of data.speakers) {
        const input = inputFor(template, [speaker], palette) as BuildInput;
        // The organiser's layout changes carry over to every speaker; text
        // and photos they replaced by hand stay with the speaker they were
        // made for.
        const blob = await renderSceneToBlob(applyEdits(template.build(input), edits, baseScene));
        files[studioFilename(speaker.name, template, format)] = new Uint8Array(await blob.arrayBuffer());
      }
      const zipped = zipSync(files, { level: 0 });
      downloadBlob(new Blob([zipped], { type: "application/zip" }), `${template.name.toLowerCase().replace(/\s+/g, "-")}-speakers.zip`);
      toast.success(`Exported ${data.speakers.length} speaker creatives`);
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <Tabs value={panel} onValueChange={setPanel}>
        <TabsList className="mb-4 grid w-full grid-cols-3">
          <TabsTrigger value="design">Design</TabsTrigger>
          <TabsTrigger value="element">Element</TabsTrigger>
          <TabsTrigger value="layers">Layers</TabsTrigger>
        </TabsList>
        <TabsContent value="element">
          <ElementPanel
            scene={scene}
            node={selectedNode}
            eventImages={eventImages}
            onPatch={patchSelected}
            onReorder={reorder}
            onDuplicate={() => selectedId && duplicate(selectedId)}
            onDelete={() => selectedId && deleteNode(selectedId)}
            onUploadImage={() => openUpload(selectedId)}
          />
        </TabsContent>
        <TabsContent value="layers">
          <LayersList
            scene={scene}
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              setPanel("element");
            }}
          />
        </TabsContent>
        <TabsContent value="design" className="space-y-7">
        <section>
          <SectionHeading step={1} title="Design" />
          <div className="grid grid-cols-3 gap-2">
            {STUDIO_TEMPLATES.map((option, index) => {
              const thumbnail = thumbnails[index];
              const active = option.id === template.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  title={option.description}
                  aria-pressed={active}
                  onClick={() => setPrefs((p) => ({ ...p, templateId: option.id }))}
                  className={cn(
                    "overflow-hidden rounded-lg border bg-card text-left transition",
                    active ? "border-foreground ring-1 ring-foreground" : "border-border hover:border-foreground/40",
                  )}
                >
                  {thumbnail && <SceneCanvas scene={thumbnail} pixelWidth={120} />}
                  <span className="block px-2 py-1.5 text-[12px] font-medium text-foreground">{option.name}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[12px] text-muted-foreground">{template.description}</p>
        </section>

        <section>
          <SectionHeading step={2} title="Size" />
          <div className="grid grid-cols-2 gap-2">
            {STUDIO_FORMATS.map((option) => (
              <button
                key={option.id}
                type="button"
                disabled={Boolean(template.formats && !template.formats.includes(option.id))}
                title={template.formats && !template.formats.includes(option.id) ? `${template.name} isn't available in this size` : undefined}
                aria-pressed={option.id === format.id}
                onClick={() => setPrefs((p) => ({ ...p, formatId: option.id }))}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-40",
                  option.id === format.id ? "border-foreground bg-muted" : "border-border hover:border-foreground/40",
                )}
              >
                <span className="block text-[13px] font-medium text-foreground">{option.label}</span>
                <span className="block text-[11px] text-muted-foreground">{option.hint}</span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <SectionHeading
            step={3}
            title={single ? "Speaker" : "Speakers"}
            hint={single ? "Pick who this creative features" : `Up to ${template.maxSpeakers}, in event order`}
          />
          {data.speakers.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-4 text-[12px] text-muted-foreground">
              This event has no speakers yet. Add them under Speakers and they will appear here with their photos; until then the
              creative uses the event's cover image.
            </p>
          ) : (
            <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
              {data.speakers.map((speaker) => {
                const active = featured.some((s) => s.id === speaker.id);
                const full = !single && !active && featured.length >= template.maxSpeakers;
                return (
                  <button
                    key={speaker.id}
                    type="button"
                    disabled={full}
                    aria-pressed={active}
                    onClick={() => toggleSpeaker(speaker.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg border px-2.5 py-1.5 text-left transition disabled:opacity-40",
                      active ? "border-foreground bg-muted" : "border-transparent hover:bg-muted/60",
                    )}
                  >
                    <SpeakerAvatar speaker={speaker} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-foreground">{speaker.name}</span>
                      {speaker.role && <span className="block truncate text-[11px] text-muted-foreground">{speaker.role}</span>}
                    </span>
                    {!speaker.photoUrl && <span className="shrink-0 text-[10px] text-muted-foreground">No photo</span>}
                    {active && <Check className="h-4 w-4 shrink-0 text-foreground" />}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <div className="flex items-start justify-between">
            <SectionHeading step={4} title="Text" hint="Filled in from your event" />
            {editedKeys.length > 0 && (
              <button
                type="button"
                onClick={() => setPrefs((p) => ({ ...p, overrides: {} }))}
                className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="h-3 w-3" /> Reset all
              </button>
            )}
          </div>
          <div className="space-y-3">
            {template.fields.map((field) => {
              const id = `studio-field-${field.key}`;
              const edited = field.key in prefs.overrides;
              return (
                <div key={field.key}>
                  <div className="mb-1 flex items-center justify-between">
                    <Label htmlFor={id} className="text-[12px] text-muted-foreground">
                      {field.label}
                    </Label>
                    {edited && (
                      <button
                        type="button"
                        onClick={() => setField(field.key, data.content[field.key])}
                        className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                      >
                        Use event value
                      </button>
                    )}
                  </div>
                  {field.multiline ? (
                    <Textarea id={id} rows={field.key === "bullets" ? 4 : 2} value={content[field.key]} onChange={(e) => setField(field.key, e.target.value)} className="text-[13px]" />
                  ) : (
                    <Input id={id} value={content[field.key]} onChange={(e) => setField(field.key, e.target.value)} className="h-9 text-[13px]" />
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <div className="flex items-start justify-between">
            <SectionHeading step={5} title="Colours" />
            {paletteEdited && (
              <button
                type="button"
                onClick={() => setPrefs((p) => ({ ...p, palettes: { ...p.palettes, [template.id]: {} } }))}
                className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="h-3 w-3" /> Reset
              </button>
            )}
          </div>
          <div className="space-y-2">
            {(Object.keys(template.paletteLabels) as Array<keyof StudioPalette>).map((key) => (
              <label key={key} className="flex items-center gap-3 text-[13px] text-foreground">
                <input
                  type="color"
                  value={palette[key]}
                  onChange={(e) => setColor(key, e.target.value)}
                  className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent p-0.5"
                />
                <span className="flex-1">{template.paletteLabels[key]}</span>
                <span className="font-mono text-[11px] uppercase text-muted-foreground">{palette[key]}</span>
              </label>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-1 h-8 text-[12px]"
              onClick={() =>
                setPrefs((p) => ({
                  ...p,
                  palettes: { ...p.palettes, [template.id]: { ...p.palettes[template.id], primary: data.theme.primary, accent: data.theme.accent } },
                }))
              }
            >
              <span className="mr-2 flex gap-0.5">
                <span className="h-3 w-3 rounded-full border border-border" style={{ background: data.theme.primary }} />
                <span className="h-3 w-3 rounded-full border border-border" style={{ background: data.theme.accent }} />
              </span>
              Use event page colours
            </Button>
          </div>
        </section>
        </TabsContent>
      </Tabs>

      <div className="lg:sticky lg:top-4 lg:self-start">
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-[12px]" onClick={addText}>
            <Type className="h-3.5 w-3.5" /> Text
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-[12px]">
                <Square className="h-3.5 w-3.5" /> Shape
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={addRect}>
                <Square className="mr-2 h-3.5 w-3.5" /> Rectangle
              </DropdownMenuItem>
              <DropdownMenuItem onClick={addCircle}>
                <Circle className="mr-2 h-3.5 w-3.5" /> Circle
              </DropdownMenuItem>
              <DropdownMenuItem onClick={addLine}>
                <Minus className="mr-2 h-3.5 w-3.5" /> Line
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-[12px]">
                <ImagePlus className="h-3.5 w-3.5" /> Image
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
              <DropdownMenuItem onClick={() => openUpload(null)}>Upload from your computer…</DropdownMenuItem>
              {eventImages.length > 0 && <DropdownMenuSeparator />}
              {eventImages.map((image) => (
                <DropdownMenuItem key={image.url} onClick={() => void addImage(image.url)}>
                  {image.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="mx-1 h-5 w-px bg-border" />
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Undo (Ctrl+Z)" disabled={history.past.length === 0} onClick={undo}>
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Redo (Ctrl+Shift+Z)" disabled={history.future.length === 0} onClick={redo}>
            <Redo2 className="h-4 w-4" />
          </Button>
          {hasEdits(edits) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto h-8 gap-1.5 text-[12px] text-muted-foreground"
              title="Discard every change made on the canvas for this design and size"
              onClick={() => {
                beginChange();
                setEdits(EMPTY_EDITS);
                setSelectedId(null);
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset canvas edits
            </Button>
          )}
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        <div className="rounded-xl border border-border bg-muted/40 p-4 sm:p-6">
          <div className="mx-auto" style={{ maxWidth: `min(100%, calc(66vh * ${format.width / format.height}))` }}>
            <SceneEditor
              scene={scene}
              selectedId={selectedId}
              onSelect={(id) => {
                setSelectedId(id);
                if (id) setPanel("element");
              }}
              onBeginChange={() => beginChange()}
              onPatch={applyPatch}
              onDelete={deleteNode}
              onDuplicate={duplicate}
              onUndo={undo}
              onRedo={redo}
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button type="button" onClick={handleDownload} disabled={busy !== null}>
            {busy === "download" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Download PNG
          </Button>
          <Button type="button" variant="outline" onClick={handleSave} disabled={busy !== null}>
            {busy === "save" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save to library
          </Button>
          {single && data.speakers.length > 1 && (
            <Button type="button" variant="outline" onClick={handleBatch} disabled={busy !== null}>
              {busy === "batch" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FolderDown className="mr-2 h-4 w-4" />}
              All {data.speakers.length} speakers (ZIP)
            </Button>
          )}
          <span className="ml-auto text-[12px] text-muted-foreground">
            {format.width} × {format.height} px
          </span>
        </div>
      </div>
    </div>
  );
}
