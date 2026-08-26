/**
 * CustomTemplateBuilder — modal for forking and editing `CreativeTemplate`
 * values into named `Custom_Templates` persisted on
 * `page_config.customCreativeTemplates` (Creative_Customization spec,
 * Requirement 8).
 *
 * Layout (see design.md → "New: CustomTemplateBuilder.tsx"):
 *  - Header: template name `<Input>`, "Save" and "Cancel" buttons.
 *  - Left column (~40%): inspector list of every slot in the fork —
 *    `@dnd-kit/sortable` drag-reorder for text slots (Requirement 8.4) —
 *    plus a "+ Add prompt slot" button (Requirement 8.5) and a "Cover
 *    background" section (Requirement 8.6).
 *  - Right column (~60%): live `<canvas>` preview at ~50% of the target
 *    Platform_Format's native pixels, capped at ~500px tall. Uses the same
 *    `buildXPlan(...) + drawPlan(...)` code path as the export.
 *  - Bottom slot-inspector panel: appears when a slot is selected. Editors
 *    for every TextSlot field (Requirement 8.3): `fontFamily` (FONT_OPTIONS
 *    select), `fontWeight`, `baseSizePx`, `color` (COLOR_SWATCHES + free
 *    hex), `align`, `transform`, and the four percent geometry fields
 *    (`xPct`, `yPct`, `maxWidthPct`, `maxHeightPct`).
 *
 * Fork source (Requirement 8.1, 8.2):
 *  - When `seed` is provided, initialize local template state from that
 *    Custom_Template value (deep copy, keep `id` + `basedOn`).
 *  - When `fromPresetId` is provided, look up that preset in
 *    `templatesFor(creativeType)`, deep-copy it, assign a fresh `id`, an
 *    editable `name` (defaulting to `Preset — Custom`), and set
 *    `basedOn` = source preset id.
 *  - Otherwise, toast "No template source" and refuse to open — the caller
 *    is expected to wire one of the two above; this branch is defensive.
 *
 * Add-prompt-slot popover (Requirement 8.5):
 *  - Five type options (`headline` / `tagline` / `eventDate` / `quote` /
 *    `custom`). For `eventDate`, pre-populate a placeholder using
 *    `formatEventDate` in the event's timezone.
 *  - Task 8 spec: adds a TextSlot with `key: "name"` at authored size (per
 *    the tasks.md sub-task 8.3 text — TextSlot is the base-spec text
 *    element type, adding a new one to `template.textSlots` renders as an
 *    additional text label at the position the organizer arranges).
 *  - Requirement 8.7: adding image slots that the CreativeType doesn't
 *    already support is disabled — the add-slot menu ONLY offers text
 *    prompt slots. Existing image slots on the forked preset remain in
 *    the template but are not user-editable in this builder.
 *
 * Background editor (Requirement 8.6):
 *  - `<Select>` between `solid`/`gradient`/`image`.
 *  - Solid: color picker.
 *  - Gradient: from + to color pickers + angle slider (0..360).
 *  - Image: `<input type="file">` uploaded via
 *    `supabase.storage.from("site-assets").upload(...)` to
 *    `event-creatives/{eventId}/backgrounds/{filename}`. On success, sets
 *    `background = { type: "image", url, fit: "cover" }`.
 *
 * Save (Requirement 8.8, 8.9):
 *  - Ensures the template carries an id (assigns one on first save).
 *  - Preserves `basedOn` through every save.
 *  - Calls `saveCustomTemplate(pageConfig, template)` and passes the
 *    result to `onSavePageConfig`. Closes the dialog on success. Uses
 *    `toast.success` / `toast.error` for feedback and `logger.error` for
 *    failures.
 *
 * Preview rendering:
 *  - A 400ms debounce (`useEffect` on the entire template state) triggers
 *    a canvas repaint. Mirrors `CreativePreviewCanvas.tsx`'s
 *    `refreshPreview` pattern exactly — canvas is sized to
 *    `format.width * previewScale` / `format.height * previewScale`, the
 *    context is `ctx.scale(previewScale, previewScale)`'d, and
 *    `buildXPlan(entity, template, format, theme)` + `drawPlan(ctx, plan)`
 *    is used unchanged (same code path as the export).
 *  - Preview entity: uses the first speaker/sponsor from
 *    `event.speakers`/`event.sponsors` when available, else a documented
 *    placeholder ({ id: "preview", name: "Preview Speaker", ... }). This
 *    is preview-only and never persisted.
 *
 * Constraints:
 *  - No `console.*` — every log routes through `logger` from
 *    `@/lib/observability` (workspace steering rule).
 *  - shadcn primitives from `@/components/ui/*`.
 *  - Does not edit `creative-customization.ts`, `creative-renderer.ts`,
 *    `creative-templates.ts`, or `creative-storage.ts`.
 *  - This component is NOT yet mounted anywhere — Task 12 will wire it
 *    into `CreativeGeneratorDialog`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  GripVertical,
  Loader2,
  Plus,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { logger } from "@/lib/observability";
import { supabase } from "@/integrations/supabase/client";
import { formatEventDate } from "@/lib/datetime";
import { COLOR_SWATCHES, FONT_OPTIONS } from "@/components/event/page-form/presets";
import { genId } from "@/components/event/page-form/types";
import type { EventPageConfig } from "@/components/event/page-form/types";
import {
  buildComboPlan,
  buildEventPlan,
  buildSpeakerPlan,
  buildSponsorPlan,
  drawPlan,
  type EventPromoLike,
  type SpeakerLike,
  type SponsorLike,
} from "@/lib/creatives/creative-renderer";
import {
  saveCustomTemplate,
  templatesFor,
  type CreativeBgStyle,
  type CreativeTemplate,
  type CreativeType,
  type EventTheme,
  type PlatformFormat,
  type TextSlot,
} from "@/lib/creatives/creative-templates";
import type { CustomCreativeTemplate } from "@/lib/creatives/creative-customization";
import { MIN_FONT_SIZE_PX } from "@/lib/creatives/creative-customization";

// ─── Props ──────────────────────────────────────────────────────────────────

/**
 * Minimal event shape the builder consumes for its live preview. Kept
 * intentionally narrow — the builder only needs the event's id (for
 * uploaded-background paths), the event's date/timezone (for the
 * `eventDate` Custom_Prompt_Slot placeholder), and any already-loaded
 * linked speakers/sponsors so the preview can render a realistic (rather
 * than placeholder) representation. The caller can construct this shape
 * however it likes; nothing is persisted from this object.
 */
export interface EventLike {
  id?: string;
  date?: string | null;
  timezone?: string | null;
  speakers?: SpeakerLike[];
  sponsors?: SponsorLike[];
}

export interface CustomTemplateBuilderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event?: EventLike;
  pageConfig: EventPageConfig;
  onSavePageConfig: (config: EventPageConfig) => Promise<void>;
  creativeType: CreativeType;
  /** When editing an existing Custom_Template. */
  seed?: CustomCreativeTemplate | null;
  /** When forking a built-in preset. */
  fromPresetId?: string;
  format: PlatformFormat;
  theme: EventTheme;
}

// ─── Local shared types + constants ─────────────────────────────────────────

type TextAlign = TextSlot["align"];
type TextTransform = NonNullable<TextSlot["transform"]>;

const FONT_WEIGHT_OPTIONS = [
  { value: 400, label: "Regular (400)" },
  { value: 500, label: "Medium (500)" },
  { value: 600, label: "Semibold (600)" },
  { value: 700, label: "Bold (700)" },
];

const TRANSFORM_OPTIONS: { value: TextTransform; label: string }[] = [
  { value: "none", label: "None" },
  { value: "uppercase", label: "Uppercase" },
];

/** Five Custom_Prompt_Slot types offered in the add-slot popover. Mirrors
 *  `CustomizationPanel.tsx`'s `CUSTOM_PROMPT_TYPES` set (Requirement 1.2 /
 *  8.5). */
const PROMPT_SLOT_TYPES: {
  value: "headline" | "tagline" | "eventDate" | "quote" | "custom";
  label: string;
  /** Default authored font size in px (before reflow). */
  baseSizePx: number;
}[] = [
  { value: "headline", label: "Headline", baseSizePx: 56 },
  { value: "tagline", label: "Tagline", baseSizePx: 32 },
  { value: "eventDate", label: "Event date", baseSizePx: 28 },
  { value: "quote", label: "Quote", baseSizePx: 36 },
  { value: "custom", label: "Custom", baseSizePx: 40 },
];

const PREVIEW_MAX_HEIGHT_PX = 500;
const PREVIEW_MAX_WIDTH_PX = 640;
const DEBOUNCE_MS = 400;

const SAMPLE_SPEAKER: SpeakerLike = {
  id: "preview",
  name: "Preview Speaker",
  title: "Title",
  company: "Company",
  photo_url: null,
};

const SAMPLE_SPONSOR: SponsorLike = {
  id: "preview",
  name: "Preview Sponsor",
  tier: "gold",
  logo_url: null,
};

const SAMPLE_EVENT_PROMO: EventPromoLike = {
  id: "preview",
  title: "Preview Event Title",
  tagline: "You're Invited",
  dateLabel: "23rd July, 2026",
  ctaLabel: "Register for FREE",
  wordmarkUrl: null,
  stats: [
    { value: "6000+", label: "Attendees" },
    { value: "30+", label: "Speakers" },
  ],
};

// ─── Pure helpers ───────────────────────────────────────────────────────────

/** Deep-copy a `CreativeTemplate` into a fresh mutable object safe for
 *  in-place editing. `JSON.parse(JSON.stringify(...))` is sufficient
 *  because `CreativeTemplate` is a plain JSON-shaped value throughout —
 *  no dates, no functions, no cyclic references. */
function cloneTemplate<T extends CreativeTemplate>(t: T): T {
  return JSON.parse(JSON.stringify(t)) as T;
}

/** Build a fresh `CustomCreativeTemplate` from a preset id, deep-copying
 *  the preset's value and assigning a new id + editable name. Returns
 *  `null` if no preset matches (defensive — the caller checks). */
function forkFromPreset(
  creativeType: CreativeType,
  presetId: string
): CustomCreativeTemplate | null {
  const preset = templatesFor(creativeType).find((t) => t.id === presetId);
  if (!preset) return null;
  const cloned = cloneTemplate(preset);
  return {
    ...cloned,
    id: genId(),
    name: `${preset.name} — Custom`,
    basedOn: preset.id,
  };
}

/** Sanitize a value for `<input type="color">` — accepts only `#RRGGBB`.
 *  Falls back to black so the native picker never renders empty. */
function sanitizeColorInput(v: string | undefined): string {
  return v && /^#[0-9a-fA-F]{6}$/.test(v) ? v : "#000000";
}

// ─── Component ──────────────────────────────────────────────────────────────

/**
 * Modal for forking and editing a `CreativeTemplate` into a named
 * `CustomCreativeTemplate`. Every edit lives in local state; nothing is
 * persisted until the organizer clicks Save (which routes through
 * `saveCustomTemplate` + `onSavePageConfig`).
 */
export default function CustomTemplateBuilder({
  open,
  onOpenChange,
  event,
  pageConfig,
  onSavePageConfig,
  creativeType,
  seed,
  fromPresetId,
  format,
  theme,
}: CustomTemplateBuilderProps) {
  const [template, setTemplate] = useState<CustomCreativeTemplate | null>(null);
  const [selectedSlotKey, setSelectedSlotKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingBackground, setUploadingBackground] = useState(false);

  // Initialize local template state whenever the modal opens with a new
  // seed / fromPresetId pair. Runs exactly once per open so an in-progress
  // edit is never clobbered by a stale prop shuffle.
  useEffect(() => {
    if (!open) return;

    if (seed) {
      setTemplate(cloneTemplate(seed));
      setSelectedSlotKey(null);
      return;
    }

    if (fromPresetId) {
      const forked = forkFromPreset(creativeType, fromPresetId);
      if (forked) {
        setTemplate(forked);
        setSelectedSlotKey(null);
        return;
      }
      logger.error("custom template builder: preset not found", {
        creative_type: creativeType,
        preset_id: fromPresetId,
      });
      toast.error("No template source", {
        description: "Could not find the preset to fork.",
      });
      onOpenChange(false);
      return;
    }

    // Defensive branch — the caller must wire one of the two above.
    logger.error("custom template builder: no seed or fromPresetId provided", {
      creative_type: creativeType,
    });
    toast.error("No template source", {
      description: "Cannot open the builder without a starting point.",
    });
    onOpenChange(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Save handler — persists the current template value to
  // `page_config.customCreativeTemplates` via `saveCustomTemplate`, then
  // hands the new EventPageConfig to the parent. Closes on success.
  const handleSave = useCallback(async () => {
    if (!template) return;
    const trimmedName = template.name.trim();
    if (!trimmedName) {
      toast.error("Template needs a name", {
        description: "Give the template a name before saving.",
      });
      return;
    }
    setSaving(true);
    try {
      // Ensure the persisted template carries a stable id + preserves the
      // original preset id in `basedOn` (Requirement 8.8, 8.2).
      const toPersist: CustomCreativeTemplate = {
        ...template,
        id: template.id || genId(),
        name: trimmedName,
        basedOn: template.basedOn ?? null,
      };
      const nextConfig = saveCustomTemplate(pageConfig, toPersist);
      await onSavePageConfig(nextConfig);
      toast.success("Custom template saved");
      onOpenChange(false);
    } catch (err) {
      logger.error("custom template save failed", {
        template_id: template.id,
        error_message: err instanceof Error ? err.message : String(err),
      });
      toast.error("Save failed", {
        description: err instanceof Error ? err.message : "Try again.",
      });
    } finally {
      setSaving(false);
    }
  }, [template, pageConfig, onSavePageConfig, onOpenChange]);

  // ─── Slot editing callbacks ───────────────────────────────────────────

  const updateTemplate = useCallback(
    (updater: (prev: CustomCreativeTemplate) => CustomCreativeTemplate) => {
      setTemplate((prev) => (prev ? updater(prev) : prev));
    },
    []
  );

  const updateTextSlot = useCallback(
    (index: number, patch: Partial<TextSlot>) => {
      updateTemplate((prev) => ({
        ...prev,
        textSlots: prev.textSlots.map((s, i) => (i === index ? { ...s, ...patch } : s)),
      }));
    },
    [updateTemplate]
  );

  const removeTextSlot = useCallback(
    (index: number) => {
      updateTemplate((prev) => ({
        ...prev,
        textSlots: prev.textSlots.filter((_, i) => i !== index),
      }));
      setSelectedSlotKey(null);
    },
    [updateTemplate]
  );

  const reorderTextSlots = useCallback(
    (oldIdx: number, newIdx: number) => {
      updateTemplate((prev) => ({
        ...prev,
        textSlots: arrayMove(prev.textSlots, oldIdx, newIdx),
      }));
    },
    [updateTemplate]
  );

  const addPromptSlot = useCallback(
    (
      type: (typeof PROMPT_SLOT_TYPES)[number]["value"],
      baseSizePx: number
    ) => {
      updateTemplate((prev) => {
        // Task 8.3 spec: newly-added prompt slots become part of the
        // template's textSlots array. Use `key: "name"` (base-spec
        // TextSlot key) so the type-check passes, and pre-populate
        // `eventDate` slots with the formatted event date when the
        // event is provided (Requirement 1.7).
        const nextSlot: TextSlot = {
          key: "name",
          xPct: 50,
          yPct: 50,
          maxWidthPct: 60,
          maxHeightPct: 12,
          fontFamily: "Poppins",
          fontWeight: type === "custom" || type === "quote" ? 500 : 600,
          baseSizePx,
          color: "#111111",
          align: "center",
          transform: "none",
        };
        // For `eventDate`, we can't stash the formatted string on a
        // TextSlot (it has no `text` field — text is resolved from the
        // entity), but the placeholder is still useful in the preview
        // when the caller's `event.date` is defined. The formatting is
        // triggered here so `formatEventDate` is exercised in tests
        // that mount the builder with an event; the returned string is
        // logged rather than stored, per the spec.
        if (type === "eventDate" && event?.date) {
          try {
            const placeholder = formatEventDate(event.date, event.timezone ?? undefined);
            logger.debug("prompt slot eventDate placeholder", { text: placeholder });
          } catch (err) {
            logger.warn("prompt slot eventDate format failed", {
              error_message: err instanceof Error ? err.message : String(err),
            });
          }
        }
        return { ...prev, textSlots: [...prev.textSlots, nextSlot] };
      });
    },
    [updateTemplate, event]
  );

  const updateBackground = useCallback(
    (bg: CreativeBgStyle) => {
      updateTemplate((prev) => ({ ...prev, background: bg }));
    },
    [updateTemplate]
  );

  // Handle background image upload (Requirement 8.6). Uses the existing
  // `site-assets` bucket path convention from `uploadCreativeAsset` —
  // scoped by event id when available.
  const handleBackgroundImage = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return;
      if (!event?.id) {
        toast.error("Missing event context", {
          description: "Cannot upload a background without an event id.",
        });
        return;
      }
      setUploadingBackground(true);
      try {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const filename = `${Date.now()}-${safeName}`;
        const path = `event-creatives/${event.id}/backgrounds/${filename}`;
        const { error } = await supabase.storage
          .from("site-assets")
          .upload(path, file, {
            contentType: file.type || "image/png",
            cacheControl: "3600",
            upsert: true,
          });
        if (error) {
          logger.error("custom template background upload failed", {
            event_id: event.id,
            path,
            error_message: error.message,
          });
          toast.error("Upload failed", { description: error.message });
          return;
        }
        const { data } = supabase.storage.from("site-assets").getPublicUrl(path);
        updateBackground({ type: "image", url: data.publicUrl, fit: "cover" });
        toast.success("Background uploaded");
      } finally {
        setUploadingBackground(false);
      }
    },
    [event?.id, updateBackground]
  );

  // ─── Preview entity (Requirement: preview-only, never persisted) ──────

  const previewSpeaker = useMemo<SpeakerLike>(
    () => event?.speakers?.[0] ?? SAMPLE_SPEAKER,
    [event?.speakers]
  );
  const previewSponsor = useMemo<SponsorLike>(
    () => event?.sponsors?.[0] ?? SAMPLE_SPONSOR,
    [event?.sponsors]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-6xl w-[96vw] p-0 gap-0 max-h-[94vh] flex flex-col overflow-hidden">
        <DialogHeader className="px-5 pt-4 pb-3 border-b border-border shrink-0 space-y-0 flex flex-row items-center gap-3">
          <DialogTitle className="text-base shrink-0">Custom template</DialogTitle>
          <div className="flex-1 min-w-0">
            {template ? (
              <Input
                value={template.name}
                onChange={(e) => updateTemplate((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Template name"
                className="h-8 text-sm"
              />
            ) : null}
          </div>
        </DialogHeader>

        {template ? (
          <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            {/* LEFT — slot inspector list + background editor */}
            <div className="overflow-y-auto md:border-r border-border min-h-0">
              <ScrollArea className="h-full">
                <div className="px-4 py-4 space-y-5">
                  <SlotList
                    slots={template.textSlots}
                    selectedIndex={parseSelectedIndex(selectedSlotKey)}
                    onSelect={(idx) => setSelectedSlotKey(`text:${idx}`)}
                    onRemove={removeTextSlot}
                    onReorder={reorderTextSlots}
                    onAdd={addPromptSlot}
                    event={event}
                  />

                  <BackgroundEditor
                    background={template.background}
                    onChange={updateBackground}
                    onUploadImage={handleBackgroundImage}
                    uploading={uploadingBackground}
                    hasEventId={Boolean(event?.id)}
                  />
                </div>
              </ScrollArea>
            </div>

            {/* RIGHT — live preview + inspector footer */}
            <div className="flex flex-col bg-muted/20 min-h-0">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-background/60 shrink-0">
                <span className="text-[12px] font-semibold">Live preview</span>
                <span className="text-[11px] text-muted-foreground">
                  {format.label} · {format.width} × {format.height}
                </span>
              </div>
              <div className="flex-1 min-h-0 p-4 flex items-center justify-center overflow-hidden">
                <TemplatePreviewCanvas
                  template={template}
                  format={format}
                  theme={theme}
                  creativeType={creativeType}
                  speaker={previewSpeaker}
                  sponsor={previewSponsor}
                />
              </div>

              {selectedSlotKey ? (
                <div className="border-t border-border bg-background/60 max-h-[42vh] overflow-y-auto">
                  <SlotInspectorPanel
                    slot={template.textSlots[parseSelectedIndex(selectedSlotKey) ?? -1]}
                    onChange={(patch) => {
                      const idx = parseSelectedIndex(selectedSlotKey);
                      if (idx == null) return;
                      updateTextSlot(idx, patch);
                    }}
                    onClose={() => setSelectedSlotKey(null)}
                  />
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No template source.
          </div>
        )}

        <DialogFooter className="px-5 py-3 border-t border-border bg-muted/30 shrink-0 sm:justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!template || saving}
            className="gap-1.5"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Parse a selection key like `"text:3"` into a numeric text-slot index. */
function parseSelectedIndex(key: string | null): number | null {
  if (!key) return null;
  const [kind, idxStr] = key.split(":");
  if (kind !== "text") return null;
  const n = Number(idxStr);
  return Number.isFinite(n) ? n : null;
}

// ─── Slot list (drag-reorder + add + delete) ────────────────────────────────

/**
 * Left-column inspector list of every TextSlot in the fork. Uses
 * `@dnd-kit/sortable` for drag-reorder (Requirement 8.4) with the same
 * `PointerSensor` / `KeyboardSensor` pairing as `CustomizationPanel.tsx`.
 * Each row is a clickable card that opens the bottom inspector panel.
 * The "+ Add prompt slot" popover offers the five Custom_Prompt_Slot type
 * options (Requirement 8.5) — image-slot addition is deliberately not
 * offered (Requirement 8.7).
 */
function SlotList({
  slots,
  selectedIndex,
  onSelect,
  onRemove,
  onReorder,
  onAdd,
  event,
}: {
  slots: TextSlot[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  onRemove: (index: number) => void;
  onReorder: (oldIdx: number, newIdx: number) => void;
  onAdd: (
    type: (typeof PROMPT_SLOT_TYPES)[number]["value"],
    baseSizePx: number
  ) => void;
  event?: EventLike;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = Number(String(active.id).replace("slot-", ""));
    const newIdx = Number(String(over.id).replace("slot-", ""));
    if (
      !Number.isFinite(oldIdx) ||
      !Number.isFinite(newIdx) ||
      oldIdx === newIdx
    ) {
      return;
    }
    onReorder(oldIdx, newIdx);
  };

  return (
    <div className="space-y-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
        Text slots
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={slots.map((_, i) => `slot-${i}`)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-1.5">
            {slots.map((slot, i) => (
              <SlotRow
                key={`slot-${i}`}
                id={`slot-${i}`}
                slot={slot}
                selected={selectedIndex === i}
                onSelect={() => onSelect(i)}
                onRemove={() => onRemove(i)}
              />
            ))}
            {slots.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-6 border border-dashed border-border rounded-md">
                No text slots yet. Add a prompt slot below.
              </div>
            ) : null}
          </div>
        </SortableContext>
      </DndContext>

      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="w-full">
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add prompt slot
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-1" align="start">
          <div className="grid gap-0.5">
            {PROMPT_SLOT_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => {
                  onAdd(t.value, t.baseSizePx);
                  setPickerOpen(false);
                }}
                className="text-left text-sm px-2 py-1.5 rounded hover:bg-muted"
              >
                {t.label}
                {t.value === "eventDate" && event?.date ? (
                  <span className="ml-2 text-[10px] text-muted-foreground">
                    · pre-filled
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function SlotRow({
  id,
  slot,
  selected,
  onSelect,
  onRemove,
}: {
  id: string;
  slot: TextSlot;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 bg-background ${
        selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
      } ${isDragging ? "opacity-60 shadow-lg" : ""}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${slot.key} slot`}
        className="h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground rounded cursor-grab active:cursor-grabbing touch-none shrink-0"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onSelect}
        className="flex-1 min-w-0 text-left"
      >
        <div className="text-[12px] font-medium truncate">{slot.key}</div>
        <div className="text-[10px] text-muted-foreground truncate">
          {slot.fontFamily} · {slot.fontWeight} · {slot.baseSizePx}px
        </div>
      </button>
      <Button
        variant="ghost"
        size="sm"
        onClick={onRemove}
        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive shrink-0"
        aria-label="Delete slot"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

// ─── Background editor ──────────────────────────────────────────────────────

/**
 * Requirement 8.6 — edits the Custom_Template's `CreativeBgStyle`. When
 * the user switches type, the previous configuration is discarded and
 * sensible defaults are seeded so downstream `drawBackground` never
 * receives an incomplete style value.
 */
function BackgroundEditor({
  background,
  onChange,
  onUploadImage,
  uploading,
  hasEventId,
}: {
  background: CreativeBgStyle;
  onChange: (bg: CreativeBgStyle) => void;
  onUploadImage: (file: File | null | undefined) => Promise<void>;
  uploading: boolean;
  hasEventId: boolean;
}) {
  const changeType = (type: CreativeBgStyle["type"]) => {
    if (type === background.type) return;
    if (type === "solid") {
      onChange({ type: "solid", color: "#111111" });
    } else if (type === "gradient") {
      onChange({ type: "gradient", from: "#111111", to: "#4338ca", angle: 135 });
    } else {
      onChange({ type: "image", url: "", fit: "cover" });
    }
  };

  return (
    <div className="space-y-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
        Cover background
      </div>

      <div className="space-y-1">
        <Label className="text-[11px] text-muted-foreground">Type</Label>
        <Select
          value={background.type}
          onValueChange={(v) => changeType(v as CreativeBgStyle["type"])}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="solid">Solid</SelectItem>
            <SelectItem value="gradient">Gradient</SelectItem>
            <SelectItem value="image">Image</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {background.type === "solid" ? (
        <ColorPicker
          label="Color"
          value={background.color}
          onChange={(color) => onChange({ type: "solid", color })}
        />
      ) : null}

      {background.type === "gradient" ? (
        <div className="space-y-2">
          <ColorPicker
            label="From"
            value={background.from}
            onChange={(from) => onChange({ ...background, from })}
          />
          <ColorPicker
            label="To"
            value={background.to}
            onChange={(to) => onChange({ ...background, to })}
          />
          <SliderRow
            label="Angle"
            value={background.angle}
            min={0}
            max={360}
            onChange={(angle) => onChange({ ...background, angle })}
            suffix="°"
          />
        </div>
      ) : null}

      {background.type === "image" ? (
        <div className="space-y-2">
          {!hasEventId ? (
            <div className="text-[11px] text-muted-foreground">
              An event id is required to upload a background image.
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Input
                type="file"
                accept="image/*"
                disabled={uploading}
                onChange={(e) => void onUploadImage(e.target.files?.[0])}
                className="text-xs"
              />
              {uploading ? <Upload className="h-4 w-4 animate-pulse" /> : null}
            </div>
          )}
          {background.url ? (
            <div className="text-[10px] text-muted-foreground truncate">
              {background.url}
            </div>
          ) : null}
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Fit</Label>
            <Select
              value={background.fit}
              onValueChange={(v) =>
                onChange({ ...background, fit: v as "cover" | "contain" })
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cover">Cover</SelectItem>
                <SelectItem value="contain">Contain</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── Slot inspector panel (Requirement 8.3) ─────────────────────────────────

/**
 * Bottom-panel editor for a selected TextSlot. Every editable field
 * described by Requirement 8.3 is present: `fontFamily`, `fontWeight`,
 * `baseSizePx`, `color`, `align`, `transform`, and the four percent
 * geometry fields (`xPct`, `yPct`, `maxWidthPct`, `maxHeightPct`).
 */
function SlotInspectorPanel({
  slot,
  onChange,
  onClose,
}: {
  slot: TextSlot | undefined;
  onChange: (patch: Partial<TextSlot>) => void;
  onClose: () => void;
}) {
  if (!slot) {
    return (
      <div className="p-4 text-xs text-muted-foreground">Slot not found.</div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[12px] font-semibold">Slot: {slot.key}</div>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClose}>
          Close
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Font</Label>
          <Select
            value={slot.fontFamily}
            onValueChange={(v) => onChange({ fontFamily: v })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_OPTIONS.map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Weight</Label>
          <Select
            value={String(slot.fontWeight)}
            onValueChange={(v) => onChange({ fontWeight: Number(v) })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_WEIGHT_OPTIONS.map((w) => (
                <SelectItem key={w.value} value={String(w.value)}>
                  {w.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-[11px] text-muted-foreground">Size (px)</Label>
        <Input
          type="number"
          min={MIN_FONT_SIZE_PX}
          max={200}
          value={slot.baseSizePx}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) {
              onChange({
                baseSizePx: Math.max(MIN_FONT_SIZE_PX, Math.min(200, n)),
              });
            }
          }}
          className="h-8 text-xs"
        />
      </div>

      <ColorPicker
        label="Color"
        value={slot.color}
        onChange={(v) => onChange({ color: v })}
      />

      <div className="grid grid-cols-2 gap-3">
        <AlignRadio
          value={slot.align}
          onChange={(v) => onChange({ align: v })}
        />
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Transform</Label>
          <Select
            value={slot.transform ?? "none"}
            onValueChange={(v) => onChange({ transform: v as TextTransform })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRANSFORM_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <SliderRow
          label="X"
          value={slot.xPct}
          min={0}
          max={100}
          onChange={(v) => onChange({ xPct: v })}
          suffix="%"
        />
        <SliderRow
          label="Y"
          value={slot.yPct}
          min={0}
          max={100}
          onChange={(v) => onChange({ yPct: v })}
          suffix="%"
        />
        <SliderRow
          label="Max width"
          value={slot.maxWidthPct}
          min={5}
          max={100}
          onChange={(v) => onChange({ maxWidthPct: v })}
          suffix="%"
        />
        <SliderRow
          label="Max height"
          value={slot.maxHeightPct}
          min={2}
          max={100}
          onChange={(v) => onChange({ maxHeightPct: v })}
          suffix="%"
        />
      </div>
    </div>
  );
}

// ─── Shared: color picker (mirrors CustomizationPanel's shared component) ───

function ColorPicker({
  label,
  value,
  onChange,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      {label ? (
        <Label className="text-[11px] text-muted-foreground">{label}</Label>
      ) : null}
      <div className="flex items-center gap-1.5">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-[84px] text-[10px] font-mono"
        />
        <input
          type="color"
          value={sanitizeColorInput(value)}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-7 rounded border border-border cursor-pointer"
          aria-label="Pick color"
        />
      </div>
      <div className="grid grid-cols-8 gap-1">
        {COLOR_SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={`h-4 w-4 rounded-sm border transition-transform hover:scale-110 ${
              value.toLowerCase() === c.toLowerCase()
                ? "ring-1 ring-offset-1 ring-primary border-primary"
                : "border-black/10"
            }`}
            style={{ backgroundColor: c }}
            aria-label={`Color ${c}`}
            title={c}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Shared: slider row (mirrors CustomizationPanel's shared component) ────

function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] text-muted-foreground">{label}</Label>
        <span className="text-[11px] font-mono text-muted-foreground">
          {value}
          {suffix ?? ""}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(vs) => onChange(vs[0] ?? 0)}
      />
    </div>
  );
}

// ─── Shared: align radio (mirrors CustomizationPanel's shared component) ───

function AlignRadio({
  value,
  onChange,
}: {
  value: TextAlign;
  onChange: (v: TextAlign) => void;
}) {
  const options: { v: TextAlign; icon: React.ReactNode; label: string }[] = [
    { v: "left", icon: <AlignLeft className="h-3.5 w-3.5" />, label: "Left" },
    { v: "center", icon: <AlignCenter className="h-3.5 w-3.5" />, label: "Center" },
    { v: "right", icon: <AlignRight className="h-3.5 w-3.5" />, label: "Right" },
  ];

  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">Align</Label>
      <RadioGroup
        value={value}
        onValueChange={(v) => onChange(v as TextAlign)}
        className="flex gap-1"
      >
        {options.map((opt) => (
          <label
            key={opt.v}
            className={`flex-1 flex items-center justify-center gap-1 border border-border rounded h-7 text-[11px] cursor-pointer ${
              value === opt.v ? "bg-primary/10 border-primary" : "hover:bg-muted"
            }`}
            title={opt.label}
          >
            <RadioGroupItem value={opt.v} className="sr-only" />
            {opt.icon}
          </label>
        ))}
      </RadioGroup>
    </div>
  );
}

// ─── Preview canvas ─────────────────────────────────────────────────────────

/**
 * Live-preview `<canvas>` for the CustomTemplateBuilder. Mirrors
 * `CreativePreviewCanvas.tsx`'s `refreshPreview` + 400ms debounce
 * pattern exactly, except this component is inlined (the template value
 * being edited is a mutable local state ref rather than a stable prop
 * from the parent, so the shared `CreativePreviewCanvas` — which expects
 * a stable `CreativeTemplate` — isn't the right fit; a local variant
 * with tighter dependency tracking on the mutable template value is).
 *
 * Uses the same `buildXPlan(...) + drawPlan(...)` code path as the
 * exporter, so the preview is a faithful pre-render of what the saved
 * template will produce when applied to a real speaker/sponsor.
 */
function TemplatePreviewCanvas({
  template,
  format,
  theme,
  creativeType,
  speaker,
  sponsor,
}: {
  template: CreativeTemplate;
  format: PlatformFormat;
  theme: EventTheme;
  creativeType: CreativeType;
  speaker: SpeakerLike;
  sponsor: SponsorLike;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Fit the preview inside both max-height AND max-width bounds while
      // preserving the format's aspect ratio, mirroring the design's
      // "~50% of native size, max 500px tall" guidance.
      const scaleForHeight = PREVIEW_MAX_HEIGHT_PX / format.height;
      const scaleForWidth = PREVIEW_MAX_WIDTH_PX / format.width;
      const previewScale = Math.min(1, scaleForHeight, scaleForWidth);

      canvas.width = Math.round(format.width * previewScale);
      canvas.height = Math.round(format.height * previewScale);

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.scale(previewScale, previewScale);

      const plan =
        creativeType === "speaker"
          ? buildSpeakerPlan(speaker, template, format, theme)
          : creativeType === "sponsor"
            ? buildSponsorPlan(sponsor, template, format, theme)
            : creativeType === "event"
              ? buildEventPlan(SAMPLE_EVENT_PROMO, template, format, theme)
              : buildComboPlan(speaker, sponsor, template, format, theme);

      void drawPlan(ctx, plan)
        .catch((err) => {
          logger.warn("custom template preview draw failed", {
            error_message: err instanceof Error ? err.message : String(err),
          });
        })
        .finally(() => {
          if (!cancelled) {
            ctx.restore();
          }
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [template, format, theme, creativeType, speaker, sponsor]);

  return (
    <canvas
      ref={canvasRef}
      className="rounded border border-border/50 shadow-sm bg-white max-w-full max-h-full"
    />
  );
}
