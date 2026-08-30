/**
 * BrochureEditorProperties — the right-hand side panel that shows
 * editable properties for the currently-selected element.
 *
 * Phase 1 covers the most-common properties: for text elements
 * (content, font size, weight, color, alignment); for image elements
 * (src URL, fit, corner radius); for shape/pill elements (fill,
 * stroke, radius). Every input is a controlled component that writes
 * back to the parent's `onChange` handler, which in turn calls
 * `updateElement` on the document tree.
 *
 * When nothing is selected the panel shows a friendly "Select an
 * element" empty state and page-level controls (page background
 * picker).
 */
import { useRef, type ReactNode } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Eye,
  EyeOff,
  FlipHorizontal,
  FlipVertical,
  Italic,
  Lock,
  Unlock,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";

import {
  removeElement,
  updateElement,
  type BrochureDocument,
  type BrochureElement,
  type ElementShadow,
  type ImageElement,
  type PageBackground,
  type PillElement,
  type ShapeElement,
  type ShapeGradient,
  type StrokeDash,
  type TextElement,
} from "./editor-document";
import { defaultGradient, defaultShadow } from "./editor-render-props";
import { EDITOR_FONTS, ensureFontLoaded } from "./editor-fonts";
import { PAGE_SIZE_PRESETS, findPresetMatch } from "./editor-page-sizes";

interface Props {
  document: BrochureDocument;
  activePageId: string;
  selectedElementId: string | null;
  onChange: (doc: BrochureDocument) => void;
  onSelect: (elementId: string | null) => void;
}

export default function BrochureEditorProperties({
  document: doc,
  activePageId,
  selectedElementId,
  onChange,
  onSelect,
}: Props) {
  const page = doc.pages.find((p) => p.id === activePageId);
  const element =
    (selectedElementId && page?.elements.find((el) => el.id === selectedElementId)) || null;

  const patchElement = (patch: Partial<BrochureElement>) => {
    if (!element || !page) return;
    onChange(updateElement(doc, page.id, element.id, patch));
  };

  const deleteElement = () => {
    if (!element || !page) return;
    onChange(removeElement(doc, page.id, element.id));
    onSelect(null);
  };

  const patchPageBackground = (bg: PageBackground) => {
    if (!page) return;
    onChange({
      ...doc,
      pages: doc.pages.map((p) => (p.id === page.id ? { ...p, background: bg } : p)),
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="w-72 h-full border-l border-border bg-background overflow-y-auto flex-shrink-0">
      <div className="p-3 space-y-4">
        {element ? (
          <ElementProperties
            element={element}
            onChange={patchElement}
            onDelete={deleteElement}
          />
        ) : (
          <PageProperties
            widthMm={page?.width ?? 210}
            heightMm={page?.height ?? 297}
            background={page?.background ?? { type: "solid", color: "#ffffff" }}
            onChangeSize={(width, height) => {
              if (!page) return;
              onChange({
                ...doc,
                pages: doc.pages.map((p) =>
                  p.id === page.id ? { ...p, width, height } : p
                ),
                updatedAt: new Date().toISOString(),
              });
            }}
            onChangeBackground={patchPageBackground}
          />
        )}
      </div>
    </div>
  );
}

// ─── Element editors ───────────────────────────────────────────────────────

function ElementProperties({
  element,
  onChange,
  onDelete,
}: {
  element: BrochureElement;
  onChange: (patch: Partial<BrochureElement>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {element.kind}
        </Label>
        <div className="flex items-center gap-1">
          <IconToggle
            active={!!element.hidden}
            label={element.hidden ? "Show element" : "Hide element"}
            onClick={() => onChange({ hidden: !element.hidden })}
          >
            {element.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </IconToggle>
          <IconToggle
            active={!!element.locked}
            label={element.locked ? "Unlock element" : "Lock element (stops canvas clicks)"}
            onClick={() => onChange({ locked: !element.locked })}
          >
            {element.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
          </IconToggle>
          <Button size="sm" variant="outline" onClick={onDelete} className="h-7 text-[11px]">
            Delete
          </Button>
        </div>
      </div>

      {element.locked && (
        <p className="text-[10px] text-muted-foreground/80 -mt-2">
          Locked — not clickable or draggable on the canvas. Edit it here, or unlock above.
        </p>
      )}
      {element.hidden && (
        <p className="text-[10px] text-muted-foreground/80 -mt-2">
          Hidden — excluded from the canvas and the exported PDF.
        </p>
      )}

      <GeometryFields element={element} onChange={onChange} />

      {element.kind === "text" && <TextFields el={element} onChange={onChange} />}
      {element.kind === "image" && <ImageFields el={element} onChange={onChange} />}
      {element.kind === "shape" && <ShapeFields el={element} onChange={onChange} />}
      {element.kind === "pill" && <PillFields el={element} onChange={onChange} />}

      <ShadowFields shadow={element.shadow} onChange={onChange} />
    </div>
  );
}

/**
 * Shadow controls, shared by every element kind.
 *
 * Collapsed to a single "Add shadow" button until enabled, because a shadow is
 * off for everything the templates build and five always-visible sliders would
 * push the kind-specific fields below the fold.
 */
function ShadowFields({
  shadow,
  onChange,
}: {
  shadow: ElementShadow | undefined;
  onChange: (patch: Partial<BrochureElement>) => void;
}) {
  if (!shadow) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange({ shadow: defaultShadow() })}
        className="w-full h-8 text-[12px]"
      >
        Add shadow
      </Button>
    );
  }
  const patch = (next: Partial<ElementShadow>) =>
    onChange({ shadow: { ...shadow, ...next } });
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Shadow
        </Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange({ shadow: undefined })}
          className="h-6 text-[10px]"
        >
          Remove
        </Button>
      </div>
      <ColorRow label="Color" value={shadow.color} onChange={(color) => patch({ color })} />
      <SliderRow
        label="Blur"
        value={shadow.blur}
        min={0}
        max={20}
        step={0.5}
        format={(v) => `${v} mm`}
        onChange={(blur) => patch({ blur })}
      />
      <div className="grid grid-cols-2 gap-2">
        <NumberRow
          label="Offset X (mm)"
          value={shadow.offsetX}
          step={0.5}
          onChange={(offsetX) => patch({ offsetX })}
        />
        <NumberRow
          label="Offset Y (mm)"
          value={shadow.offsetY}
          step={0.5}
          onChange={(offsetY) => patch({ offsetY })}
        />
      </div>
      <SliderRow
        label="Shadow opacity"
        value={shadow.opacity}
        min={0}
        max={1}
        step={0.05}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(opacity) => patch({ opacity })}
      />
    </div>
  );
}

function GeometryFields({
  element,
  onChange,
}: {
  element: BrochureElement;
  onChange: (patch: Partial<BrochureElement>) => void;
}) {
  const numberInput = (label: string, value: number, key: keyof BrochureElement, step = 1) => (
    <div className="space-y-1">
      <Label className="text-[10px]">{label}</Label>
      <Input
        type="number"
        step={step}
        value={Number.isFinite(value) ? Math.round(value * 10) / 10 : 0}
        onChange={(e) => {
          const n = Number.parseFloat(e.target.value);
          if (Number.isFinite(n)) onChange({ [key]: n } as unknown as Partial<BrochureElement>);
        }}
        className="h-8 text-[12px]"
      />
    </div>
  );
  return (
    <div className="space-y-2">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
        Position
      </Label>
      <div className="grid grid-cols-2 gap-2">
        {numberInput("X (mm)", element.x, "x")}
        {numberInput("Y (mm)", element.y, "y")}
        {numberInput("Width", element.width, "width")}
        {numberInput("Height", element.height, "height")}
      </div>
      <div className="space-y-1">
        <Label className="text-[10px]">Rotation ({Math.round(element.rotation)}°)</Label>
        <Slider
          min={-180}
          max={180}
          step={1}
          value={[element.rotation]}
          onValueChange={([v]) => onChange({ rotation: v } as unknown as Partial<BrochureElement>)}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-[10px]">Opacity ({Math.round(element.opacity * 100)}%)</Label>
        <Slider
          min={0}
          max={1}
          step={0.05}
          value={[element.opacity]}
          onValueChange={([v]) => onChange({ opacity: v } as unknown as Partial<BrochureElement>)}
        />
      </div>
    </div>
  );
}

/**
 * Font-family dropdown over the curated catalog, grouped by category.
 *
 * Extracted so pills can use it too — the pill panel had no font control at all
 * even though both renderers honour `PillElement.fontFamily`.
 */
function FontSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (family: string) => void;
}) {
  const fontGroups = EDITOR_FONTS.reduce<Record<string, typeof EDITOR_FONTS>>((acc, f) => {
    if (!acc[f.category]) acc[f.category] = [];
    acc[f.category].push(f);
    return acc;
  }, {});
  const categoryOrder = [
    "sans-serif",
    "serif",
    "display",
    "handwriting",
    "monospace",
  ] as const;
  const categoryLabels: Record<string, string> = {
    "sans-serif": "Sans-serif",
    serif: "Serif",
    display: "Display",
    handwriting: "Handwriting",
    monospace: "Monospace",
  };
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        onChange(v);
        // Fire-and-forget: inject the Google Fonts stylesheet for the
        // newly-picked family so Konva paints the correct glyphs. Failure is
        // silent — CSS falls back to the category default.
        void ensureFontLoaded(v);
      }}
    >
      <SelectTrigger className="h-8 text-[12px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-[320px]">
        {categoryOrder.map((cat) => {
          const items = fontGroups[cat] ?? [];
          if (items.length === 0) return null;
          return (
            <div key={cat}>
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground px-2 pt-2 pb-1">
                {categoryLabels[cat]}
              </div>
              {items.map((f) => (
                <SelectItem key={f.family} value={f.family}>
                  <span style={{ fontFamily: `"${f.family}", sans-serif` }}>{f.family}</span>
                </SelectItem>
              ))}
            </div>
          );
        })}
      </SelectContent>
    </Select>
  );
}

function TextFields({ el, onChange }: { el: TextElement; onChange: (p: Partial<TextElement>) => void }) {
  return (
    <div className="space-y-2">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Text</Label>
      <Textarea
        value={el.content}
        onChange={(e) => onChange({ content: e.target.value })}
        className="min-h-[60px] text-[12px]"
      />
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px]">Font family</Label>
          <FontSelect value={el.fontFamily} onChange={(fontFamily) => onChange({ fontFamily })} />
        </div>
        <NumberRow
          label="Font size (pt)"
          value={el.fontSize}
          onChange={(fontSize) => {
            if (fontSize > 0) onChange({ fontSize });
          }}
        />
      </div>
      {/* Style toggles. Italic was already honoured by BOTH renderers and used
          by the templates, but had no control anywhere — so an organiser could
          see italic text and neither reproduce nor remove it. */}
      <div className="space-y-1">
        <Label className="text-[10px]">Style</Label>
        <div className="flex items-center gap-1">
          <IconToggle
            active={el.fontWeight === "bold"}
            label="Bold"
            onClick={() => onChange({ fontWeight: el.fontWeight === "bold" ? "normal" : "bold" })}
          >
            <Bold className="h-3.5 w-3.5" />
          </IconToggle>
          <IconToggle
            active={el.fontStyle === "italic"}
            label="Italic"
            onClick={() => onChange({ fontStyle: el.fontStyle === "italic" ? "normal" : "italic" })}
          >
            <Italic className="h-3.5 w-3.5" />
          </IconToggle>
          <div className="w-px h-5 bg-border mx-0.5" aria-hidden="true" />
          <IconToggle active={el.align === "left"} label="Align left" onClick={() => onChange({ align: "left" })}>
            <AlignLeft className="h-3.5 w-3.5" />
          </IconToggle>
          <IconToggle active={el.align === "center"} label="Align centre" onClick={() => onChange({ align: "center" })}>
            <AlignCenter className="h-3.5 w-3.5" />
          </IconToggle>
          <IconToggle active={el.align === "right"} label="Align right" onClick={() => onChange({ align: "right" })}>
            <AlignRight className="h-3.5 w-3.5" />
          </IconToggle>
        </div>
      </div>

      <ColorRow label="Color" value={el.color} onChange={(color) => onChange({ color })} />

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px]">Letter case</Label>
          <Select
            value={el.textTransform ?? "none"}
            onValueChange={(v) => onChange({ textTransform: v as TextElement["textTransform"] })}
          >
            <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">As typed</SelectItem>
              <SelectItem value="uppercase">UPPERCASE</SelectItem>
              <SelectItem value="lowercase">lowercase</SelectItem>
              <SelectItem value="capitalize">Capitalise</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px]">Vertical</Label>
          <Select
            value={el.verticalAlign ?? "top"}
            onValueChange={(v) => onChange({ verticalAlign: v as TextElement["verticalAlign"] })}
          >
            <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="top">Top</SelectItem>
              <SelectItem value="middle">Middle</SelectItem>
              <SelectItem value="bottom">Bottom</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Line height was in the same position as italic: honoured by both
          renderers, set by every seed builder, no control. */}
      <SliderRow
        label="Line height"
        value={el.lineHeight}
        min={0.8}
        max={2.5}
        step={0.05}
        format={(v) => `${v.toFixed(2)}×`}
        onChange={(lineHeight) => onChange({ lineHeight })}
      />
      <SliderRow
        label="Letter spacing"
        value={el.letterSpacing ?? 0}
        min={-2}
        max={10}
        step={0.1}
        format={(v) => `${v.toFixed(1)} pt`}
        onChange={(letterSpacing) => onChange({ letterSpacing })}
      />

      {/* Glyph outline. Behind a button because it's rarely wanted and would
          otherwise push the common fields above it off-screen. */}
      {(el.strokeWidth ?? 0) > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Outline
            </Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange({ strokeWidth: 0 })}
              className="h-6 text-[10px]"
            >
              Remove
            </Button>
          </div>
          <ColorRow
            label="Outline color"
            value={el.strokeColor ?? "#000000"}
            onChange={(strokeColor) => onChange({ strokeColor })}
          />
          <SliderRow
            label="Outline width"
            value={el.strokeWidth ?? 0}
            min={0}
            max={3}
            step={0.05}
            format={(v) => `${v.toFixed(2)} mm`}
            onChange={(strokeWidth) => onChange({ strokeWidth })}
          />
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange({ strokeColor: el.strokeColor ?? "#000000", strokeWidth: 0.3 })}
          className="w-full h-8 text-[12px]"
        >
          Add text outline
        </Button>
      )}
    </div>
  );
}

function ImageFields({ el, onChange }: { el: ImageElement; onChange: (p: Partial<ImageElement>) => void }) {
  return (
    <div className="space-y-2">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Image</Label>

      <ImagePicker src={el.src} onPick={(src) => onChange({ src })} />

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px]">Fit</Label>
          <Select value={el.fit} onValueChange={(v) => onChange({ fit: v as "cover" | "contain" | "fill" })}>
            <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cover">Cover</SelectItem>
              <SelectItem value="contain">Contain</SelectItem>
              <SelectItem value="fill">Fill</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <NumberRow
          label="Radius (mm)"
          value={el.cornerRadius}
          min={0}
          onChange={(cornerRadius) => onChange({ cornerRadius })}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-[10px]">Mirror</Label>
        <div className="flex items-center gap-1">
          <IconToggle
            active={!!el.flipH}
            label="Flip horizontally"
            onClick={() => onChange({ flipH: !el.flipH })}
          >
            <FlipHorizontal className="h-3.5 w-3.5" />
          </IconToggle>
          <IconToggle
            active={!!el.flipV}
            label="Flip vertically"
            onClick={() => onChange({ flipV: !el.flipV })}
          >
            <FlipVertical className="h-3.5 w-3.5" />
          </IconToggle>
        </div>
      </div>

      {/* Crop — only meaningful when the image overflows or letterboxes, which
          `fill` never does (it stretches to the box exactly). Hiding these
          controls in fill mode avoids sliders that visibly do nothing. */}
      {el.fit !== "fill" && (
        <div className="space-y-2 pt-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Crop
          </Label>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-[10px]">Zoom</Label>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {(el.zoom ?? 1).toFixed(2)}×
              </span>
            </div>
            <Slider
              value={[el.zoom ?? 1]}
              min={1}
              max={3}
              step={0.05}
              onValueChange={([v]) => onChange({ zoom: v })}
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-[10px]">Horizontal focus</Label>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {Math.round((el.focalX ?? 0.5) * 100)}%
              </span>
            </div>
            <Slider
              value={[el.focalX ?? 0.5]}
              min={0}
              max={1}
              step={0.01}
              onValueChange={([v]) => onChange({ focalX: v })}
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-[10px]">Vertical focus</Label>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {Math.round((el.focalY ?? 0.5) * 100)}%
              </span>
            </div>
            <Slider
              value={[el.focalY ?? 0.5]}
              min={0}
              max={1}
              step={0.01}
              onValueChange={([v]) => onChange({ focalY: v })}
            />
          </div>

          <p className="text-[10px] text-muted-foreground/80">
            Focus picks which part of the image stays visible when it&apos;s cropped —
            useful for keeping a face or logo in frame.
          </p>

          {((el.zoom ?? 1) !== 1 || (el.focalX ?? 0.5) !== 0.5 || (el.focalY ?? 0.5) !== 0.5) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange({ zoom: 1, focalX: 0.5, focalY: 0.5 })}
              className="h-7 w-full text-[11px]"
            >
              Reset crop
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function ShapeFields({ el, onChange }: { el: ShapeElement; onChange: (p: Partial<ShapeElement>) => void }) {
  return (
    <div className="space-y-2">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Shape</Label>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px]">Type</Label>
          <Select value={el.shape} onValueChange={(v) => onChange({ shape: v as "rect" | "ellipse" })}>
            <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="rect">Rectangle</SelectItem>
              <SelectItem value="ellipse">Ellipse</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px]">Radius (mm)</Label>
          <Input
            type="number"
            value={el.cornerRadius}
            onChange={(e) => {
              const n = Number.parseFloat(e.target.value);
              if (Number.isFinite(n) && n >= 0) onChange({ cornerRadius: n });
            }}
            className="h-8 text-[12px]"
          />
        </div>
      </div>
      {/* Gradient takes precedence over the flat fill in both renderers, and the
          flat value is kept underneath so removing the gradient restores it. */}
      {el.fillGradient ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Gradient fill
            </Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange({ fillGradient: undefined })}
              className="h-6 text-[10px]"
            >
              Use solid
            </Button>
          </div>
          <ColorRow
            label="From"
            value={el.fillGradient.from}
            onChange={(from) => onChange({ fillGradient: { ...el.fillGradient!, from } })}
          />
          <ColorRow
            label="To"
            value={el.fillGradient.to}
            onChange={(to) => onChange({ fillGradient: { ...el.fillGradient!, to } })}
          />
          <div className="space-y-1">
            <Label className="text-[10px]">Direction</Label>
            <Select
              value={el.fillGradient.direction}
              onValueChange={(v) =>
                onChange({
                  fillGradient: {
                    ...el.fillGradient!,
                    direction: v as ShapeGradient["direction"],
                  },
                })
              }
            >
              <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="vertical">Vertical</SelectItem>
                <SelectItem value="horizontal">Horizontal</SelectItem>
                <SelectItem value="diagonal">Diagonal</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : (
        <>
          <ColorRow label="Fill" value={el.fill} onChange={(fill) => onChange({ fill })} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange({ fillGradient: defaultGradient(el.fill) })}
            className="w-full h-8 text-[12px]"
          >
            Use gradient fill
          </Button>
        </>
      )}

      <ColorRow label="Stroke" value={el.stroke} onChange={(stroke) => onChange({ stroke })} />
      <div className="grid grid-cols-2 gap-2">
        <NumberRow
          label="Stroke width"
          value={el.strokeWidth}
          step={0.1}
          min={0}
          onChange={(strokeWidth) => onChange({ strokeWidth })}
        />
        <div className="space-y-1">
          <Label className="text-[10px]">Stroke style</Label>
          <Select
            value={el.dash ?? "solid"}
            onValueChange={(v) => onChange({ dash: v as StrokeDash })}
          >
            <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="solid">Solid</SelectItem>
              <SelectItem value="dashed">Dashed</SelectItem>
              <SelectItem value="dotted">Dotted</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

function PillFields({ el, onChange }: { el: PillElement; onChange: (p: Partial<PillElement>) => void }) {
  return (
    <div className="space-y-2">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Pill</Label>
      <Input
        value={el.text}
        onChange={(e) => onChange({ text: e.target.value })}
        className="h-8 text-[12px]"
      />
      {/* `fontFamily` and `strokeWidth` were honoured by both renderers but had
          no control, so every pill added from the palette kept its black
          hairline outline and its creation-time font permanently. */}
      <div className="space-y-1">
        <Label className="text-[10px]">Font family</Label>
        <FontSelect value={el.fontFamily} onChange={(fontFamily) => onChange({ fontFamily })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumberRow
          label="Font size (pt)"
          value={el.fontSize}
          onChange={(fontSize) => {
            if (fontSize > 0) onChange({ fontSize });
          }}
        />
        <div className="space-y-1">
          <Label className="text-[10px]">Weight</Label>
          <Select
            value={el.fontWeight ?? "normal"}
            onValueChange={(v) => onChange({ fontWeight: v as "normal" | "bold" })}
          >
            <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">Regular</SelectItem>
              <SelectItem value="bold">Bold</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <SliderRow
        label="Letter spacing"
        value={el.letterSpacing ?? 0}
        min={-1}
        max={8}
        step={0.1}
        format={(v) => `${v.toFixed(1)} pt`}
        onChange={(letterSpacing) => onChange({ letterSpacing })}
      />
      <ColorRow label="Text" value={el.textColor} onChange={(textColor) => onChange({ textColor })} />
      <ColorRow label="Fill" value={el.fillColor} onChange={(fillColor) => onChange({ fillColor })} />
      <ColorRow label="Stroke" value={el.strokeColor} onChange={(strokeColor) => onChange({ strokeColor })} />
      <SliderRow
        label="Stroke width"
        value={el.strokeWidth}
        min={0}
        max={3}
        step={0.05}
        format={(v) => (v === 0 ? "None" : `${v.toFixed(2)} mm`)}
        onChange={(strokeWidth) => onChange({ strokeWidth })}
      />
    </div>
  );
}

// ─── Page-level editor (shown when nothing is selected) ────────────────────

function PageProperties({
  widthMm,
  heightMm,
  background,
  onChangeSize,
  onChangeBackground,
}: {
  widthMm: number;
  heightMm: number;
  background: PageBackground;
  onChangeSize: (widthMm: number, heightMm: number) => void;
  onChangeBackground: (bg: PageBackground) => void;
}) {
  const presetId = findPresetMatch(widthMm, heightMm);
  // Group presets by category for the dropdown.
  const groupOrder: Array<"Print" | "Presentation" | "Social" | "Web"> = [
    "Print",
    "Presentation",
    "Social",
    "Web",
  ];
  const grouped = PAGE_SIZE_PRESETS.reduce<Record<string, typeof PAGE_SIZE_PRESETS>>(
    (acc, p) => {
      if (!acc[p.group]) acc[p.group] = [];
      acc[p.group].push(p);
      return acc;
    },
    {}
  );
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Nothing selected
        </Label>
        <p className="text-[11px] text-muted-foreground mt-1">
          Click an element on the canvas to edit it. Adjust the page size and background below.
        </p>
      </div>

      {/* Page size presets */}
      <div className="space-y-2">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Page size
        </Label>
        <Select
          value={presetId}
          onValueChange={(v) => {
            if (v === "custom") return;
            const preset = PAGE_SIZE_PRESETS.find((p) => p.id === v);
            if (preset) onChangeSize(preset.widthMm, preset.heightMm);
          }}
        >
          <SelectTrigger className="h-8 text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-[360px]">
            <SelectItem value="custom">Custom ({Math.round(widthMm * 10) / 10} × {Math.round(heightMm * 10) / 10} mm)</SelectItem>
            {groupOrder.map((group) => {
              const items = grouped[group] ?? [];
              if (items.length === 0) return null;
              return (
                <div key={group}>
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground px-2 pt-2 pb-1">
                    {group}
                  </div>
                  {items.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </div>
              );
            })}
          </SelectContent>
        </Select>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px]">Width (mm)</Label>
            <Input
              type="number"
              step={1}
              value={Math.round(widthMm * 10) / 10}
              onChange={(e) => {
                const n = Number.parseFloat(e.target.value);
                if (Number.isFinite(n) && n >= 10 && n <= 2000) onChangeSize(n, heightMm);
              }}
              className="h-8 text-[12px]"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Height (mm)</Label>
            <Input
              type="number"
              step={1}
              value={Math.round(heightMm * 10) / 10}
              onChange={(e) => {
                const n = Number.parseFloat(e.target.value);
                if (Number.isFinite(n) && n >= 10 && n <= 2000) onChangeSize(widthMm, n);
              }}
              className="h-8 text-[12px]"
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Page background
        </Label>
        <Select
          value={background.type}
          onValueChange={(v) => {
            if (v === "solid") onChangeBackground({ type: "solid", color: "#ffffff" });
            if (v === "gradient") onChangeBackground({ type: "gradient", top: "#1a0730", bottom: "#3a1152" });
            if (v === "image") onChangeBackground({ type: "image", src: "", fit: "cover" });
          }}
        >
          <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="solid">Solid color</SelectItem>
            <SelectItem value="gradient">Vertical gradient</SelectItem>
            <SelectItem value="image">Image</SelectItem>
          </SelectContent>
        </Select>
        {background.type === "solid" && (
          <ColorRow
            label="Color"
            value={background.color}
            onChange={(color) => onChangeBackground({ type: "solid", color })}
          />
        )}
        {background.type === "gradient" && (
          <>
            <ColorRow
              label="Top"
              value={background.top}
              onChange={(top) => onChangeBackground({ ...background, top })}
            />
            <ColorRow
              label="Bottom"
              value={background.bottom}
              onChange={(bottom) => onChangeBackground({ ...background, bottom })}
            />
          </>
        )}
        {background.type === "image" && (
          <div className="space-y-2">
            {/* Upload was element-images only; a page background could be set
                from a URL and nothing else. */}
            <ImagePicker
              src={background.src}
              onPick={(src) => onChangeBackground({ ...background, src })}
            />
            {/* `fit` was hardcoded to "cover" here even though both renderers
                honour "contain", so letterboxing a background was unreachable. */}
            <div className="space-y-1">
              <Label className="text-[10px]">Background fit</Label>
              <Select
                value={background.fit}
                onValueChange={(v) =>
                  onChangeBackground({ ...background, fit: v as "cover" | "contain" })
                }
              >
                <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cover">Cover (fill the page, crop overflow)</SelectItem>
                  <SelectItem value="contain">Contain (fit whole image)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Image source picker ───────────────────────────────────────────────────

/** Largest file we'll inline as a data URL. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Device upload or URL paste, shared by image elements and page backgrounds.
 *
 * Uploaded files become data URLs inlined in the document JSON, so persisting
 * the brochure carries the image with it and no storage bucket is required.
 *
 * Rejections are reported. The previous version returned silently on both the
 * non-image and the oversize path — dropping a 6 MB photo did nothing at all,
 * with no error and no hint that a limit existed, even though the surrounding
 * comment claimed "a friendly toast".
 */
function ImagePicker({
  src,
  onPick,
}: {
  src: string;
  onPick: (src: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("That file isn't an image", {
        description: "Pick a PNG, JPG, WebP or SVG.",
      });
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      toast.error("Image is too large", {
        description: `${mb} MB — the limit is 5 MB. Resize it, or paste a URL instead.`,
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = typeof reader.result === "string" ? reader.result : "";
      if (url) onPick(url);
    };
    reader.onerror = () => {
      toast.error("Couldn't read that file");
    };
    reader.readAsDataURL(file);
  };

  const isUploaded = src.startsWith("data:");

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0] ?? null);
          // Reset so choosing the same file twice still fires a change event.
          if (fileInputRef.current) fileInputRef.current.value = "";
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => fileInputRef.current?.click()}
        className="w-full h-8 gap-1.5 text-[12px]"
      >
        <Upload className="h-3.5 w-3.5" />
        {isUploaded ? "Replace image…" : "Choose image…"}
      </Button>
      <div className="space-y-1">
        <Label className="text-[10px]">Or paste URL</Label>
        <Input
          value={isUploaded ? "" : src}
          onChange={(e) => onPick(e.target.value)}
          placeholder="https://…"
          className="h-8 text-[12px]"
        />
        <p className="text-[10px] text-muted-foreground/80">
          {isUploaded
            ? "Using an uploaded image. Paste a URL to replace it."
            : "Uploads embed in the document (max 5 MB) and survive save/load."}
        </p>
      </div>
    </div>
  );
}

// ─── Small shared field primitives ─────────────────────────────────────────

/** Labelled slider with a live formatted read-out. */
function SliderRow({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-[10px]">{label}</Label>
        <span className="text-[10px] text-muted-foreground tabular-nums">{format(value)}</span>
      </div>
      <Slider min={min} max={max} step={step} value={[value]} onValueChange={([v]) => onChange(v)} />
    </div>
  );
}

/** Labelled numeric input that only commits finite values. */
function NumberRow({
  label,
  value,
  step = 1,
  min,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  min?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px]">{label}</Label>
      <Input
        type="number"
        step={step}
        value={value}
        onChange={(e) => {
          const n = Number.parseFloat(e.target.value);
          if (!Number.isFinite(n)) return;
          if (min !== undefined && n < min) return;
          onChange(n);
        }}
        className="h-8 text-[12px]"
      />
    </div>
  );
}

/** Compact icon button with a pressed state, for boolean toggles. */
function IconToggle({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "secondary" : "ghost"}
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className="h-7 w-7 p-0"
    >
      {children}
    </Button>
  );
}

// ─── Small colour input row ────────────────────────────────────────────────

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px]">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={/^#([0-9a-fA-F]{6})$/.test(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-8 rounded border border-border cursor-pointer"
          aria-label={label}
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 text-[12px] flex-1"
        />
      </div>
    </div>
  );
}
