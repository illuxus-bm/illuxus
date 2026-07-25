/**
 * CustomizationPanel — organizer-facing UI for editing a
 * `CustomizationConfig` (Creative_Customization spec) inside the
 * `CreativeGeneratorDialog` and `BatchCreativeGeneratorDialog`.
 *
 * The panel is a single, self-contained React component with nine
 * collapsible sections. Each section edits one field on the local
 * `CustomizationConfig` state (Requirements 1-10 + 12). The parent owns
 * the config; the panel mirrors it into local state on mount and
 * debounces (`400ms`) every change back out through `onChange` — matching
 * the base spec's live-preview convention.
 *
 * PURE UI. All rendering / persistence side-effects flow through
 * callbacks passed from the parent (`onSavePageConfig`,
 * `onApplyBrandKit`). The one direct side-effect the panel owns is
 * uploading a custom watermark logo via `uploadWatermarkLogo` — that
 * upload writes into the `site-assets` bucket and the resulting URL is
 * stored on the local config so the parent's debounced snapshot picks it
 * up automatically.
 *
 * `BrandKitPicker` and `EntityTemplateOverrideEditor` are imported from
 * sibling files that Task 10 and Task 11 respectively will land. Until
 * those tasks ship, those imports are the only expected TypeScript
 * errors on this file.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  GripVertical,
  Plus,
  Trash2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Upload,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { logger } from "@/lib/observability";
import { formatEventDate } from "@/lib/datetime";
import { uploadWatermarkLogo } from "@/lib/creatives/creative-storage";
import { COLOR_SWATCHES, FONT_OPTIONS } from "@/components/event/page-form/presets";
import { genId } from "@/components/event/page-form/types";
import type { EventPageConfig } from "@/components/event/page-form/types";
import type {
  CreativeTemplate,
  CreativeType,
  PlatformFormat,
  TextSlot,
} from "@/lib/creatives/creative-templates";
import type {
  AppliedBrandKit,
  BackgroundOverlay,
  BorderStyle,
  CustomizationConfig,
  CustomPromptSlot,
  CustomPromptSlotType,
  PositionNudge,
  SlotKey,
  SlotOverride,
  TextAlign,
  WatermarkConfig,
} from "@/lib/creatives/creative-customization";
import {
  BORDER_THICKNESS_MAX_PX,
  MIN_FONT_SIZE_PX,
  NUDGE_MAX_PCT,
} from "@/lib/creatives/creative-customization";

// Task 10 / Task 11 land these files; imports resolve when those tasks ship.
import BrandKitPicker from "./BrandKitPicker";
import EntityTemplateOverrideEditor from "./EntityTemplateOverrideEditor";

// ─── Props ──────────────────────────────────────────────────────────────────

export interface CustomizationPanelProps {
  config: CustomizationConfig;
  onChange: (config: CustomizationConfig) => void;
  template: CreativeTemplate;
  format: PlatformFormat;
  event?: { id?: string; date?: string | null; timezone?: string | null };
  orgId?: string | null;
  entityId?: string;
  creativeType: CreativeType;
  pageConfig?: EventPageConfig;
  onSavePageConfig?: (config: EventPageConfig) => Promise<void>;
  onApplyBrandKit?: (kit: AppliedBrandKit | undefined) => void;
  appliedBrandKit?: AppliedBrandKit;
  hasOrgLogo?: boolean;
}

// ─── Debounce convention (matches CreativeGeneratorDialog live-preview) ─────

const DEBOUNCE_MS = 400;

// ─── Custom_Prompt_Slot defaults per type (Requirement 1.2 / 1.7) ───────────

const CUSTOM_PROMPT_TYPE_LABELS: Record<CustomPromptSlotType, string> = {
  headline: "Headline",
  tagline: "Tagline",
  eventDate: "Event date",
  quote: "Quote",
  custom: "Custom",
};

const CUSTOM_PROMPT_TYPES: CustomPromptSlotType[] = [
  "headline",
  "tagline",
  "eventDate",
  "quote",
  "custom",
];

const FONT_WEIGHT_OPTIONS = [
  { value: 400, label: "Regular (400)" },
  { value: 500, label: "Medium (500)" },
  { value: 600, label: "Semibold (600)" },
  { value: 700, label: "Bold (700)" },
];

function newCustomPromptSlot(
  type: CustomPromptSlotType,
  event?: CustomizationPanelProps["event"]
): CustomPromptSlot {
  let text = "";
  if (type === "eventDate" && event?.date) {
    text = formatEventDate(event.date, event.timezone ?? undefined);
  }
  return {
    id: genId(),
    type,
    text,
    xPct: 50,
    yPct: 50,
    maxWidthPct: 60,
    maxHeightPct: 10,
    fontFamily: "Poppins",
    fontWeight: 600,
    baseSizePx: type === "quote" ? 36 : 48,
    color: "#111111",
    align: "center",
  };
}

// ─── Panel component ────────────────────────────────────────────────────────

export default function CustomizationPanel({
  config,
  onChange,
  template,
  format,
  event,
  orgId,
  entityId,
  creativeType,
  pageConfig,
  onSavePageConfig,
  onApplyBrandKit,
  appliedBrandKit,
  hasOrgLogo,
}: CustomizationPanelProps) {
  // Local mirror of the parent config. The parent stays the source of truth;
  // we sync the initial value on mount only. All local edits flow through
  // `updateConfig(updater)`, which schedules a debounced `onChange` back to
  // the parent (400ms — matching the base spec's live-preview convention).
  const [localConfig, setLocalConfig] = useState<CustomizationConfig>(config);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onChange(localConfig);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localConfig]);

  const updateConfig = useCallback(
    (updater: (prev: CustomizationConfig) => CustomizationConfig) => {
      setLocalConfig((prev) => updater(prev));
    },
    []
  );

  // Set of slot keys editable in Slot_Overrides / Position_Nudges: built-in
  // template text slots + Custom_Prompt_Slot keys.
  const editableSlotKeys = useMemo<{ key: SlotKey; label: string; slot?: TextSlot }[]>(
    () => {
      const builtins = template.textSlots.map((s) => ({
        key: s.key as SlotKey,
        label: s.key,
        slot: s,
      }));
      const custom = (localConfig.customPromptSlots ?? []).map((s) => ({
        key: `custom:${s.id}` as SlotKey,
        label: `${CUSTOM_PROMPT_TYPE_LABELS[s.type]}${s.text ? ` — ${s.text.slice(0, 24)}` : ""}`,
        slot: undefined as TextSlot | undefined,
      }));
      return [...builtins, ...custom];
    },
    [template.textSlots, localConfig.customPromptSlots]
  );

  return (
    <div className="w-full">
      <ScrollArea className="h-[600px] pr-3">
        <div className="space-y-2">
          <CustomPromptSlotsSection
            slots={localConfig.customPromptSlots ?? []}
            event={event}
            onChange={(slots) =>
              updateConfig((prev) => ({
                ...prev,
                customPromptSlots: slots.length ? slots : undefined,
              }))
            }
          />

          <SlotOverridesSection
            overrides={localConfig.slotOverrides ?? {}}
            slots={editableSlotKeys}
            template={template}
            onChange={(overrides) =>
              updateConfig((prev) => ({
                ...prev,
                slotOverrides:
                  Object.keys(overrides).length > 0 ? overrides : undefined,
              }))
            }
          />

          <PositionNudgesSection
            nudges={localConfig.positionNudges ?? {}}
            slots={editableSlotKeys}
            onChange={(nudges) =>
              updateConfig((prev) => ({
                ...prev,
                positionNudges:
                  Object.keys(nudges).length > 0 ? nudges : undefined,
              }))
            }
          />

          <BackgroundOverlaySection
            overlay={localConfig.backgroundOverlay}
            onChange={(overlay) =>
              updateConfig((prev) => ({
                ...prev,
                backgroundOverlay: overlay,
              }))
            }
          />

          <WatermarkSection
            watermark={localConfig.watermark}
            orgId={orgId ?? null}
            hasOrgLogo={Boolean(hasOrgLogo)}
            onChange={(watermark) =>
              updateConfig((prev) => ({ ...prev, watermark }))
            }
          />

          <BorderSection
            border={localConfig.border}
            format={format}
            onChange={(border) => updateConfig((prev) => ({ ...prev, border }))}
          />

          <BrandKitSection
            orgId={orgId ?? null}
            appliedBrandKit={appliedBrandKit}
            onApply={(kit) => {
              onApplyBrandKit?.(kit);
              updateConfig((prev) => ({
                ...prev,
                appliedBrandKitId: kit?.id,
              }));
            }}
          />

          {entityId ? (
            <EntityOverrideSection
              entityId={entityId}
              creativeType={creativeType}
              pageConfig={pageConfig}
              onSavePageConfig={onSavePageConfig}
            />
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}

// ─── Section shell ──────────────────────────────────────────────────────────

function SectionShell({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border border-border rounded-lg bg-card">
      <CollapsibleTrigger className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium hover:bg-muted/40 rounded-lg">
        <span>{title}</span>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3 pt-1 space-y-3 border-t border-border">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Shared: color picker ───────────────────────────────────────────────────

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

/** The native `<input type="color">` accepts only `#RRGGBB`. Fall back to
 *  black rather than a runtime error when the current config carries a
 *  named color or an rgba string. */
function sanitizeColorInput(v: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : "#000000";
}

// ─── Shared: labeled slider row ─────────────────────────────────────────────

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

// ─── Section 1: Custom Prompt Slots (Requirements 1.1, 1.2, 1.4, 1.5, 1.7) ─

function CustomPromptSlotsSection({
  slots,
  event,
  onChange,
}: {
  slots: CustomPromptSlot[];
  event?: CustomizationPanelProps["event"];
  onChange: (slots: CustomPromptSlot[]) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = slots.findIndex((s) => s.id === active.id);
    const newIdx = slots.findIndex((s) => s.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    onChange(arrayMove(slots, oldIdx, newIdx));
  };

  const addSlot = (type: CustomPromptSlotType) => {
    onChange([...slots, newCustomPromptSlot(type, event)]);
    setPickerOpen(false);
  };

  const updateSlot = (id: string, patch: Partial<CustomPromptSlot>) => {
    onChange(slots.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const removeSlot = (id: string) => {
    onChange(slots.filter((s) => s.id !== id));
  };

  return (
    <SectionShell title="Custom prompt slots">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={slots.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {slots.map((slot) => (
              <CustomPromptSlotCard
                key={slot.id}
                slot={slot}
                onChange={(patch) => updateSlot(slot.id, patch)}
                onRemove={() => removeSlot(slot.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="w-full mt-1">
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add slot
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-1" align="start">
          <div className="grid gap-0.5">
            {CUSTOM_PROMPT_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => addSlot(t)}
                className="text-left text-sm px-2 py-1.5 rounded hover:bg-muted"
              >
                {CUSTOM_PROMPT_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </SectionShell>
  );
}

function CustomPromptSlotCard({
  slot,
  onChange,
  onRemove,
}: {
  slot: CustomPromptSlot;
  onChange: (patch: Partial<CustomPromptSlot>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: slot.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`border border-border rounded-lg bg-background p-2.5 space-y-2.5 ${
        isDragging ? "opacity-60 shadow-lg" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${CUSTOM_PROMPT_TYPE_LABELS[slot.type]} slot`}
          className="h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground rounded cursor-grab active:cursor-grabbing touch-none"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="flex-1 text-xs font-medium">
          {CUSTOM_PROMPT_TYPE_LABELS[slot.type]}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRemove}
          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
          aria-label="Delete slot"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {slot.type === "quote" ? (
        <Textarea
          value={slot.text}
          onChange={(e) => onChange({ text: e.target.value })}
          rows={2}
          placeholder="Quote text"
          className="text-xs"
        />
      ) : (
        <Input
          value={slot.text}
          onChange={(e) => onChange({ text: e.target.value })}
          placeholder="Text"
          className="h-8 text-xs"
        />
      )}

      <div className="grid grid-cols-2 gap-2">
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

      <div className="grid grid-cols-2 gap-2">
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
              onChange({ baseSizePx: Math.max(MIN_FONT_SIZE_PX, Math.min(200, n)) });
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

      <AlignRadio
        value={slot.align}
        onChange={(align) => {
          if (align !== "inherit") onChange({ align });
        }}
      />
    </div>
  );
}

function AlignRadio({
  value,
  onChange,
  includeInherit = false,
}: {
  value: TextAlign | "inherit";
  onChange: (v: TextAlign | "inherit") => void;
  includeInherit?: boolean;
}) {
  const options: { v: TextAlign | "inherit"; icon: React.ReactNode; label: string }[] = [
    { v: "left", icon: <AlignLeft className="h-3.5 w-3.5" />, label: "Left" },
    { v: "center", icon: <AlignCenter className="h-3.5 w-3.5" />, label: "Center" },
    { v: "right", icon: <AlignRight className="h-3.5 w-3.5" />, label: "Right" },
  ];
  if (includeInherit) {
    options.unshift({
      v: "inherit",
      icon: <span className="text-[10px]">↺</span>,
      label: "Inherit",
    });
  }

  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">Align</Label>
      <RadioGroup
        value={value}
        onValueChange={(v) => onChange(v as TextAlign | "inherit")}
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

// ─── Section 2: Slot Overrides (Requirements 2.1-2.5) ───────────────────────

function SlotOverridesSection({
  overrides,
  slots,
  template,
  onChange,
}: {
  overrides: Partial<Record<SlotKey, SlotOverride>>;
  slots: { key: SlotKey; label: string; slot?: TextSlot }[];
  template: CreativeTemplate;
  onChange: (overrides: Partial<Record<SlotKey, SlotOverride>>) => void;
}) {
  const setOverride = (key: SlotKey, patch: Partial<SlotOverride>) => {
    const current = overrides[key] ?? {};
    const merged: SlotOverride = { ...current, ...patch };
    const next: Partial<Record<SlotKey, SlotOverride>> = { ...overrides };
    if (merged.color === undefined && merged.fontFamily === undefined) {
      delete next[key];
    } else {
      next[key] = merged;
    }
    onChange(next);
  };

  const defaultColorFor = (key: SlotKey): string => {
    const slot = template.textSlots.find((s) => s.key === key);
    return slot?.color ?? "#111111";
  };

  const defaultFontFor = (key: SlotKey): string => {
    const slot = template.textSlots.find((s) => s.key === key);
    return slot?.fontFamily ?? "Poppins";
  };

  return (
    <SectionShell title="Slot overrides">
      {slots.length === 0 ? (
        <div className="text-xs text-muted-foreground">
          No slots to override on this template.
        </div>
      ) : (
        <div className="space-y-3">
          {slots.map((s) => {
            const ov = overrides[s.key] ?? {};
            return (
              <div key={s.key} className="border border-border rounded-md p-2 space-y-2 bg-background">
                <div className="text-xs font-medium">{s.label}</div>
                <ColorPicker
                  label="Color"
                  value={ov.color ?? defaultColorFor(s.key)}
                  onChange={(v) => setOverride(s.key, { color: v })}
                />
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Font</Label>
                  <Select
                    value={ov.fontFamily ?? defaultFontFor(s.key)}
                    onValueChange={(v) => setOverride(s.key, { fontFamily: v })}
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
              </div>
            );
          })}
        </div>
      )}
    </SectionShell>
  );
}

// ─── Section 3: Position Nudges (Requirements 3.1-3.4) ──────────────────────

function PositionNudgesSection({
  nudges,
  slots,
  onChange,
}: {
  nudges: Partial<Record<SlotKey, PositionNudge>>;
  slots: { key: SlotKey; label: string }[];
  onChange: (nudges: Partial<Record<SlotKey, PositionNudge>>) => void;
}) {
  const setNudge = (key: SlotKey, patch: Partial<PositionNudge>) => {
    const current = nudges[key] ?? {};
    const merged: PositionNudge = { ...current, ...patch };
    const next: Partial<Record<SlotKey, PositionNudge>> = { ...nudges };
    if (
      merged.dxPct === undefined &&
      merged.dyPct === undefined &&
      merged.align === undefined
    ) {
      delete next[key];
    } else {
      next[key] = merged;
    }
    onChange(next);
  };

  return (
    <SectionShell title="Position nudges">
      {slots.length === 0 ? (
        <div className="text-xs text-muted-foreground">
          No slots to nudge on this template.
        </div>
      ) : (
        <div className="space-y-3">
          {slots.map((s) => {
            const n = nudges[s.key] ?? {};
            const alignValue: TextAlign | "inherit" = n.align ?? "inherit";
            return (
              <div key={s.key} className="border border-border rounded-md p-2 space-y-2 bg-background">
                <div className="text-xs font-medium">{s.label}</div>
                <SliderRow
                  label="Δ X"
                  value={n.dxPct ?? 0}
                  min={-NUDGE_MAX_PCT}
                  max={NUDGE_MAX_PCT}
                  onChange={(v) => setNudge(s.key, { dxPct: v === 0 ? undefined : v })}
                  suffix="%"
                />
                <SliderRow
                  label="Δ Y"
                  value={n.dyPct ?? 0}
                  min={-NUDGE_MAX_PCT}
                  max={NUDGE_MAX_PCT}
                  onChange={(v) => setNudge(s.key, { dyPct: v === 0 ? undefined : v })}
                  suffix="%"
                />
                <AlignRadio
                  value={alignValue}
                  onChange={(a) =>
                    setNudge(s.key, {
                      align: a === "inherit" ? undefined : (a as TextAlign),
                    })
                  }
                  includeInherit
                />
              </div>
            );
          })}
        </div>
      )}
    </SectionShell>
  );
}

// ─── Section 4: Background Overlay (Requirements 5.2-5.4) ───────────────────

function BackgroundOverlaySection({
  overlay,
  onChange,
}: {
  overlay: BackgroundOverlay | undefined;
  onChange: (overlay: BackgroundOverlay | undefined) => void;
}) {
  const update = (patch: Partial<BackgroundOverlay>) => {
    const merged: BackgroundOverlay = { ...(overlay ?? {}), ...patch };
    // Purge undefined keys so isEmptyCustomization semantics are preserved.
    const cleaned: BackgroundOverlay = {};
    if (merged.dim) cleaned.dim = merged.dim;
    if (merged.gradient) cleaned.gradient = merged.gradient;
    if (merged.blurRegion) cleaned.blurRegion = merged.blurRegion;
    onChange(
      cleaned.dim || cleaned.gradient || cleaned.blurRegion ? cleaned : undefined
    );
  };

  return (
    <SectionShell title="Background overlay">
      {/* Dim */}
      <div className="border border-border rounded-md p-2 space-y-2 bg-background">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium">Dim</Label>
          <Switch
            checked={Boolean(overlay?.dim)}
            onCheckedChange={(on) =>
              update({
                dim: on ? { color: "#000000", opacity: 40 } : undefined,
              })
            }
          />
        </div>
        {overlay?.dim ? (
          <>
            <ColorPicker
              label="Color"
              value={overlay.dim.color}
              onChange={(color) =>
                update({ dim: { ...overlay.dim!, color } })
              }
            />
            <SliderRow
              label="Opacity"
              value={overlay.dim.opacity}
              min={0}
              max={100}
              onChange={(opacity) =>
                update({ dim: { ...overlay.dim!, opacity } })
              }
              suffix="%"
            />
          </>
        ) : null}
      </div>

      {/* Gradient */}
      <div className="border border-border rounded-md p-2 space-y-2 bg-background">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium">Gradient</Label>
          <Switch
            checked={Boolean(overlay?.gradient)}
            onCheckedChange={(on) =>
              update({
                gradient: on
                  ? { from: "#000000", to: "#00000000", direction: 180, opacity: 50 }
                  : undefined,
              })
            }
          />
        </div>
        {overlay?.gradient ? (
          <>
            <ColorPicker
              label="From"
              value={overlay.gradient.from}
              onChange={(from) =>
                update({ gradient: { ...overlay.gradient!, from } })
              }
            />
            <ColorPicker
              label="To"
              value={overlay.gradient.to}
              onChange={(to) =>
                update({ gradient: { ...overlay.gradient!, to } })
              }
            />
            <SliderRow
              label="Direction"
              value={overlay.gradient.direction}
              min={0}
              max={360}
              onChange={(direction) =>
                update({ gradient: { ...overlay.gradient!, direction } })
              }
              suffix="°"
            />
            <SliderRow
              label="Opacity"
              value={overlay.gradient.opacity}
              min={0}
              max={100}
              onChange={(opacity) =>
                update({ gradient: { ...overlay.gradient!, opacity } })
              }
              suffix="%"
            />
          </>
        ) : null}
      </div>

      {/* Blur region */}
      <div className="border border-border rounded-md p-2 space-y-2 bg-background">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium">Blur region</Label>
          <Switch
            checked={Boolean(overlay?.blurRegion)}
            onCheckedChange={(on) =>
              update({
                blurRegion: on
                  ? { boxPct: [10, 60, 80, 20], blurRadiusPx: 16 }
                  : undefined,
              })
            }
          />
        </div>
        {overlay?.blurRegion ? (
          <>
            <SliderRow
              label="X"
              value={overlay.blurRegion.boxPct[0]}
              min={0}
              max={100}
              onChange={(v) =>
                update({
                  blurRegion: {
                    ...overlay.blurRegion!,
                    boxPct: [
                      v,
                      overlay.blurRegion!.boxPct[1],
                      overlay.blurRegion!.boxPct[2],
                      overlay.blurRegion!.boxPct[3],
                    ],
                  },
                })
              }
              suffix="%"
            />
            <SliderRow
              label="Y"
              value={overlay.blurRegion.boxPct[1]}
              min={0}
              max={100}
              onChange={(v) =>
                update({
                  blurRegion: {
                    ...overlay.blurRegion!,
                    boxPct: [
                      overlay.blurRegion!.boxPct[0],
                      v,
                      overlay.blurRegion!.boxPct[2],
                      overlay.blurRegion!.boxPct[3],
                    ],
                  },
                })
              }
              suffix="%"
            />
            <SliderRow
              label="Width"
              value={overlay.blurRegion.boxPct[2]}
              min={0}
              max={100}
              onChange={(v) =>
                update({
                  blurRegion: {
                    ...overlay.blurRegion!,
                    boxPct: [
                      overlay.blurRegion!.boxPct[0],
                      overlay.blurRegion!.boxPct[1],
                      v,
                      overlay.blurRegion!.boxPct[3],
                    ],
                  },
                })
              }
              suffix="%"
            />
            <SliderRow
              label="Height"
              value={overlay.blurRegion.boxPct[3]}
              min={0}
              max={100}
              onChange={(v) =>
                update({
                  blurRegion: {
                    ...overlay.blurRegion!,
                    boxPct: [
                      overlay.blurRegion!.boxPct[0],
                      overlay.blurRegion!.boxPct[1],
                      overlay.blurRegion!.boxPct[2],
                      v,
                    ],
                  },
                })
              }
              suffix="%"
            />
            <SliderRow
              label="Blur"
              value={overlay.blurRegion.blurRadiusPx}
              min={0}
              max={50}
              onChange={(blurRadiusPx) =>
                update({
                  blurRegion: { ...overlay.blurRegion!, blurRadiusPx },
                })
              }
              suffix="px"
            />
          </>
        ) : null}
      </div>
    </SectionShell>
  );
}

// ─── Section 5: Watermark (Requirements 6.1, 6.4) ───────────────────────────

const WATERMARK_POSITIONS: WatermarkConfig["position"][] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];

const WATERMARK_POSITION_LABEL: Record<WatermarkConfig["position"], string> = {
  "top-left": "↖",
  "top-right": "↗",
  "bottom-left": "↙",
  "bottom-right": "↘",
};

function WatermarkSection({
  watermark,
  orgId,
  hasOrgLogo,
  onChange,
}: {
  watermark: WatermarkConfig | undefined;
  orgId: string | null;
  hasOrgLogo: boolean;
  onChange: (watermark: WatermarkConfig | undefined) => void;
}) {
  const [uploading, setUploading] = useState(false);

  const enable = (on: boolean) => {
    if (!on) {
      onChange(undefined);
      return;
    }
    onChange({
      position: "bottom-right",
      opacity: 80,
      sizePct: 12,
    });
  };

  const handleFile = async (file: File | null | undefined) => {
    if (!file) return;
    if (!orgId) {
      toast.error("No organization", {
        description: "Cannot upload without an org context.",
      });
      return;
    }
    setUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filename = `${Date.now()}-${safeName}`;
      const { url } = await uploadWatermarkLogo(orgId, filename, file);
      onChange({
        ...(watermark ?? {
          position: "bottom-right",
          opacity: 80,
          sizePct: 12,
        }),
        uploadedLogoUrl: url,
      });
      toast.success("Logo uploaded");
    } catch (err) {
      logger.error("watermark logo upload failed in panel", {
        org_id: orgId,
        error_message: err instanceof Error ? err.message : String(err),
      });
      toast.error("Upload failed", {
        description: err instanceof Error ? err.message : "Try again.",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <SectionShell title="Watermark">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">Show watermark</Label>
        <Switch
          checked={Boolean(watermark)}
          onCheckedChange={(on) => enable(on)}
        />
      </div>

      {watermark ? (
        <>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Position</Label>
            <RadioGroup
              value={watermark.position}
              onValueChange={(v) =>
                onChange({
                  ...watermark,
                  position: v as WatermarkConfig["position"],
                })
              }
              className="grid grid-cols-4 gap-1"
            >
              {WATERMARK_POSITIONS.map((p) => (
                <label
                  key={p}
                  className={`flex items-center justify-center border border-border rounded h-9 text-lg cursor-pointer ${
                    watermark.position === p
                      ? "bg-primary/10 border-primary"
                      : "hover:bg-muted"
                  }`}
                  title={p}
                >
                  <RadioGroupItem value={p} className="sr-only" />
                  <span aria-hidden>{WATERMARK_POSITION_LABEL[p]}</span>
                </label>
              ))}
            </RadioGroup>
          </div>

          <SliderRow
            label="Opacity"
            value={watermark.opacity}
            min={0}
            max={100}
            onChange={(opacity) => onChange({ ...watermark, opacity })}
            suffix="%"
          />
          <SliderRow
            label="Size"
            value={watermark.sizePct}
            min={5}
            max={30}
            onChange={(sizePct) => onChange({ ...watermark, sizePct })}
            suffix="%"
          />

          {!hasOrgLogo ? (
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">
                Custom logo
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept="image/*"
                  disabled={uploading}
                  onChange={(e) => handleFile(e.target.files?.[0])}
                  className="text-xs"
                />
                {uploading ? <Upload className="h-4 w-4 animate-pulse" /> : null}
              </div>
              {watermark.uploadedLogoUrl ? (
                <div className="text-[10px] text-muted-foreground truncate">
                  {watermark.uploadedLogoUrl}
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </SectionShell>
  );
}

// ─── Section 6: Border (Requirements 7.1-7.3) ───────────────────────────────

function BorderSection({
  border,
  format,
  onChange,
}: {
  border: BorderStyle | undefined;
  format: PlatformFormat;
  onChange: (border: BorderStyle | undefined) => void;
}) {
  const maxRadius = Math.floor(Math.min(format.width, format.height) / 2);

  const enable = (on: boolean) => {
    if (!on) {
      onChange(undefined);
      return;
    }
    onChange({
      color: "#111111",
      thicknessPx: 4,
      cornerRadiusPx: 12,
    });
  };

  const update = (patch: Partial<BorderStyle>) => {
    if (!border) return;
    onChange({ ...border, ...patch });
  };

  const toggleShadow = (on: boolean) => {
    if (!border) return;
    if (!on) {
      const { dropShadow: _drop, ...rest } = border;
      onChange(rest);
      return;
    }
    onChange({
      ...border,
      dropShadow: { color: "#00000066", offsetX: 0, offsetY: 4, blur: 8 },
    });
  };

  return (
    <SectionShell title="Border">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">Show border</Label>
        <Switch
          checked={Boolean(border)}
          onCheckedChange={(on) => enable(on)}
        />
      </div>

      {border ? (
        <>
          <ColorPicker
            label="Color"
            value={border.color}
            onChange={(color) => update({ color })}
          />
          <SliderRow
            label="Thickness"
            value={border.thicknessPx}
            min={0}
            max={BORDER_THICKNESS_MAX_PX}
            onChange={(thicknessPx) => update({ thicknessPx })}
            suffix="px"
          />
          <SliderRow
            label="Corner radius"
            value={border.cornerRadiusPx}
            min={0}
            max={maxRadius}
            onChange={(cornerRadiusPx) => update({ cornerRadiusPx })}
            suffix="px"
          />

          <div className="border border-border rounded-md p-2 space-y-2 bg-background">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Drop shadow</Label>
              <Switch
                checked={Boolean(border.dropShadow)}
                onCheckedChange={(on) => toggleShadow(on)}
              />
            </div>
            {border.dropShadow ? (
              <>
                <ColorPicker
                  label="Color"
                  value={border.dropShadow.color}
                  onChange={(color) =>
                    update({
                      dropShadow: { ...border.dropShadow!, color },
                    })
                  }
                />
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Offset X</Label>
                    <Input
                      type="number"
                      min={-100}
                      max={100}
                      value={border.dropShadow.offsetX}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (Number.isFinite(n)) {
                          update({
                            dropShadow: { ...border.dropShadow!, offsetX: n },
                          });
                        }
                      }}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Offset Y</Label>
                    <Input
                      type="number"
                      min={-100}
                      max={100}
                      value={border.dropShadow.offsetY}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (Number.isFinite(n)) {
                          update({
                            dropShadow: { ...border.dropShadow!, offsetY: n },
                          });
                        }
                      }}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Blur</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={border.dropShadow.blur}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (Number.isFinite(n) && n >= 0) {
                          update({
                            dropShadow: { ...border.dropShadow!, blur: n },
                          });
                        }
                      }}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </>
      ) : null}
    </SectionShell>
  );
}

// ─── Section 7: Brand Kit (Requirements 9.3-9.5, 12.5) ──────────────────────

function BrandKitSection({
  orgId,
  appliedBrandKit,
  onApply,
}: {
  orgId: string | null;
  appliedBrandKit?: AppliedBrandKit;
  onApply: (kit: AppliedBrandKit | undefined) => void;
}) {
  return (
    <SectionShell title="Brand kit">
      <BrandKitPicker
        orgId={orgId}
        appliedBrandKit={appliedBrandKit}
        onApply={onApply}
      />
    </SectionShell>
  );
}

// ─── Section 8: Entity Override (Requirements 10.1, 10.2, 10.4, 10.5) ──────

function EntityOverrideSection({
  entityId,
  creativeType,
  pageConfig,
  onSavePageConfig,
}: {
  entityId: string;
  creativeType: CreativeType;
  pageConfig?: EventPageConfig;
  onSavePageConfig?: (config: EventPageConfig) => Promise<void>;
}) {
  return (
    <SectionShell title="Entity override">
      <EntityTemplateOverrideEditor
        entityId={entityId}
        creativeType={creativeType}
        pageConfig={pageConfig}
        onSavePageConfig={onSavePageConfig}
      />
    </SectionShell>
  );
}
