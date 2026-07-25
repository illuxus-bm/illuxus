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
  type ImageElement,
  type PageBackground,
  type PillElement,
  type ShapeElement,
  type TextElement,
} from "./editor-document";

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
            background={page?.background ?? { type: "solid", color: "#ffffff" }}
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
        <Button size="sm" variant="outline" onClick={onDelete} className="h-7 text-[11px]">
          Delete
        </Button>
      </div>

      <GeometryFields element={element} onChange={onChange} />

      {element.kind === "text" && <TextFields el={element} onChange={onChange} />}
      {element.kind === "image" && <ImageFields el={element} onChange={onChange} />}
      {element.kind === "shape" && <ShapeFields el={element} onChange={onChange} />}
      {element.kind === "pill" && <PillFields el={element} onChange={onChange} />}
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
          <Input
            value={el.fontFamily}
            onChange={(e) => onChange({ fontFamily: e.target.value })}
            className="h-8 text-[12px]"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px]">Font size (pt)</Label>
          <Input
            type="number"
            value={el.fontSize}
            onChange={(e) => {
              const n = Number.parseFloat(e.target.value);
              if (Number.isFinite(n) && n > 0) onChange({ fontSize: n });
            }}
            className="h-8 text-[12px]"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px]">Weight</Label>
          <Select value={el.fontWeight} onValueChange={(v) => onChange({ fontWeight: v as "normal" | "bold" })}>
            <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">Regular</SelectItem>
              <SelectItem value="bold">Bold</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px]">Align</Label>
          <Select value={el.align} onValueChange={(v) => onChange({ align: v as "left" | "center" | "right" })}>
            <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="left">Left</SelectItem>
              <SelectItem value="center">Center</SelectItem>
              <SelectItem value="right">Right</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <ColorRow label="Color" value={el.color} onChange={(color) => onChange({ color })} />
    </div>
  );
}

function ImageFields({ el, onChange }: { el: ImageElement; onChange: (p: Partial<ImageElement>) => void }) {
  return (
    <div className="space-y-2">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Image</Label>
      <div className="space-y-1">
        <Label className="text-[10px]">URL</Label>
        <Input
          value={el.src}
          onChange={(e) => onChange({ src: e.target.value })}
          placeholder="https://…"
          className="h-8 text-[12px]"
        />
      </div>
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
      <ColorRow label="Fill" value={el.fill} onChange={(fill) => onChange({ fill })} />
      <ColorRow label="Stroke" value={el.stroke} onChange={(stroke) => onChange({ stroke })} />
      <div className="space-y-1">
        <Label className="text-[10px]">Stroke width</Label>
        <Input
          type="number"
          value={el.strokeWidth}
          step={0.1}
          onChange={(e) => {
            const n = Number.parseFloat(e.target.value);
            if (Number.isFinite(n) && n >= 0) onChange({ strokeWidth: n });
          }}
          className="h-8 text-[12px]"
        />
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
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px]">Font size</Label>
          <Input
            type="number"
            value={el.fontSize}
            onChange={(e) => {
              const n = Number.parseFloat(e.target.value);
              if (Number.isFinite(n) && n > 0) onChange({ fontSize: n });
            }}
            className="h-8 text-[12px]"
          />
        </div>
      </div>
      <ColorRow label="Text" value={el.textColor} onChange={(textColor) => onChange({ textColor })} />
      <ColorRow label="Fill" value={el.fillColor} onChange={(fillColor) => onChange({ fillColor })} />
      <ColorRow label="Stroke" value={el.strokeColor} onChange={(strokeColor) => onChange({ strokeColor })} />
    </div>
  );
}

// ─── Page-level editor (shown when nothing is selected) ────────────────────

function PageProperties({
  background,
  onChangeBackground,
}: {
  background: PageBackground;
  onChangeBackground: (bg: PageBackground) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Nothing selected
        </Label>
        <p className="text-[11px] text-muted-foreground mt-1">
          Click an element on the canvas to edit it, or change the page background below.
        </p>
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
          <div className="space-y-1">
            <Label className="text-[10px]">Image URL</Label>
            <Input
              value={background.src}
              onChange={(e) => onChangeBackground({ ...background, src: e.target.value })}
              placeholder="https://…"
              className="h-8 text-[12px]"
            />
          </div>
        )}
      </div>
    </div>
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
