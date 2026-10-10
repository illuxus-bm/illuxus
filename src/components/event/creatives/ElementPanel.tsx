/**
 * ElementPanel — properties of the selected element, and the layers list.
 *
 * Purely presentational: it reads a node and reports patches. The studio
 * decides how they are stored and undone.
 */
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  Copy,
  Italic,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { nodeLabel, setBounds, type LayerMove, type NodePatch } from "@/lib/creatives/studio/edits";
import { FAMILY_WEIGHTS } from "@/lib/creatives/studio/render";
import { isHexColor, nodeBounds, type Fill, type Scene, type SceneNode } from "@/lib/creatives/studio/scene";
import { cn } from "@/lib/utils";

/** A gradient shows as its first stop in the picker; choosing a colour replaces it with a flat fill. */
function fillToHex(fill: Fill | undefined, fallback = "#000000"): string {
  if (!fill) return fallback;
  const value = typeof fill === "string" ? fill : (fill.stops[0]?.[1] ?? fallback);
  return isHexColor(value) && value.length === 7 ? value : fallback;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    // Wrapping the control is what ties the label to it, for every kind of
    // control this panel uses.
    <label className="block">
      <span className="mb-1 block text-[12px] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function NumberField({ label, value, onChange, step = 1, min }: { label: string; value: number; onChange: (value: number) => void; step?: number; min?: number }) {
  return (
    <Field label={label}>
      <Input
        type="number"
        step={step}
        min={min}
        value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
        onChange={(event) => {
          const next = Number.parseFloat(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
        className="h-8 text-[13px]"
      />
    </Field>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent p-0.5"
        />
        <span className="font-mono text-[11px] uppercase text-muted-foreground">{value}</span>
      </div>
    </Field>
  );
}

const WEIGHT_NAMES: Record<number, string> = { 300: "Light", 400: "Regular", 500: "Medium", 600: "Semibold", 700: "Bold", 800: "Extra bold", 900: "Black" };
const selectClass = "h-8 w-full rounded-md border border-input bg-background px-2 text-[13px]";

export interface ElementPanelProps {
  scene: Scene;
  node: SceneNode | null;
  /** Photos and logos from the event, offered when replacing an image. */
  eventImages: Array<{ label: string; url: string }>;
  onPatch: (patch: NodePatch) => void;
  onReorder: (move: LayerMove) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onUploadImage: () => void;
}

export function ElementPanel({ scene, node, eventImages, onPatch, onReorder, onDuplicate, onDelete, onUploadImage }: ElementPanelProps) {
  if (!node) {
    return (
      <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-[12px] text-muted-foreground">
        Click anything on the creative to edit it. Drag to move, pull a handle to resize, double-click text to type. Use the
        buttons above the canvas to add text, shapes and images.
      </p>
    );
  }
  const bounds = nodeBounds(node);
  const resize = (next: Partial<typeof bounds>): void => onPatch(setBounds(node, { ...bounds, ...next }));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1">
        <span className="mr-auto truncate text-[13px] font-semibold text-foreground">{nodeLabel(node)}</span>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Bring to front" onClick={() => onReorder("front")}>
          <ArrowUpToLine className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Bring forward" onClick={() => onReorder("forward")}>
          <ArrowUp className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Send backward" onClick={() => onReorder("backward")}>
          <ArrowDown className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Send to back" onClick={() => onReorder("back")}>
          <ArrowDownToLine className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Duplicate (Ctrl+D)" onClick={onDuplicate}>
          <Copy className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Delete" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {node.kind === "text" && (
        <>
          <Field label="Text">
            <Textarea rows={3} value={node.text} onChange={(event) => onPatch({ text: event.target.value })} className="text-[13px]" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Font">
              <select value={node.family} onChange={(event) => onPatch({ family: event.target.value })} className={selectClass}>
                {[...new Set([node.family, ...Object.keys(FAMILY_WEIGHTS)])].map((family) => (
                  <option key={family} value={family}>
                    {family}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Weight">
              <select value={node.weight} onChange={(event) => onPatch({ weight: Number(event.target.value) })} className={selectClass}>
                {[...new Set([node.weight, ...(FAMILY_WEIGHTS[node.family] ?? [400, 700])])].sort((a, b) => a - b).map((weight) => (
                  <option key={weight} value={weight}>
                    {WEIGHT_NAMES[weight] ?? weight}
                  </option>
                ))}
              </select>
            </Field>
            <NumberField label="Size (px)" value={node.size} min={6} onChange={(size) => onPatch({ size: Math.max(6, size) })} />
            <ColorField label="Colour" value={fillToHex(node.color)} onChange={(color) => onPatch({ color })} />
            <NumberField label="Line height" value={node.lineHeight ?? 1.2} step={0.05} min={0.6} onChange={(lineHeight) => onPatch({ lineHeight: Math.max(0.6, lineHeight) })} />
            <NumberField label="Letter spacing" value={node.letterSpacing ?? 0} step={0.5} onChange={(letterSpacing) => onPatch({ letterSpacing })} />
          </div>
          <div className="flex items-center gap-1">
            {(
              [
                ["left", AlignLeft],
                ["center", AlignCenter],
                ["right", AlignRight],
              ] as const
            ).map(([align, Icon]) => (
              <Button
                key={align}
                type="button"
                size="icon"
                variant={(node.align ?? "left") === align ? "default" : "outline"}
                className="h-8 w-8"
                title={`Align ${align}`}
                onClick={() => onPatch({ align })}
              >
                <Icon className="h-4 w-4" />
              </Button>
            ))}
            <Button type="button" size="icon" variant={node.italic ? "default" : "outline"} className="ml-2 h-8 w-8" title="Italic" onClick={() => onPatch({ italic: !node.italic })}>
              <Italic className="h-4 w-4" />
            </Button>
            <select
              value={node.valign ?? "top"}
              onChange={(event) => onPatch({ valign: event.target.value })}
              className={cn(selectClass, "ml-2 w-auto")}
              title="Vertical position in the box"
            >
              <option value="top">Top</option>
              <option value="middle">Middle</option>
              <option value="bottom">Bottom</option>
            </select>
          </div>
        </>
      )}

      {(node.kind === "rect" || node.kind === "ellipse") && (
        <div className="grid grid-cols-2 gap-2">
          <ColorField label="Fill" value={fillToHex(node.fill, "#ffffff")} onChange={(fill) => onPatch({ fill })} />
          <ColorField label="Outline" value={fillToHex(node.stroke, "#000000")} onChange={(stroke) => onPatch({ stroke, strokeWidth: node.strokeWidth || 4 })} />
          <NumberField label="Outline width" value={node.strokeWidth ?? 0} min={0} onChange={(strokeWidth) => onPatch({ strokeWidth: Math.max(0, strokeWidth) })} />
          {node.kind === "rect" && (
            <NumberField label="Corner radius" value={typeof node.radius === "number" ? node.radius : 0} min={0} onChange={(radius) => onPatch({ radius: Math.max(0, radius) })} />
          )}
          {node.fill && (
            <Button type="button" variant="outline" size="sm" className="col-span-2 h-8 text-[12px]" onClick={() => onPatch({ fill: undefined, stroke: node.stroke ?? fillToHex(node.fill), strokeWidth: node.strokeWidth || 4 })}>
              Remove fill (outline only)
            </Button>
          )}
        </div>
      )}

      {node.kind === "image" && (
        <div className="space-y-2">
          <Field label="Replace with">
            <select
              value=""
              onChange={(event) => {
                if (event.target.value === "__upload") onUploadImage();
                else if (event.target.value) onPatch({ src: event.target.value });
              }}
              className={selectClass}
            >
              <option value="">Choose an image…</option>
              <option value="__upload">Upload from your computer…</option>
              {eventImages.map((image) => (
                <option key={image.url} value={image.url}>
                  {image.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Fit">
              <select value={node.fit} onChange={(event) => onPatch({ fit: event.target.value })} className={selectClass}>
                <option value="cover">Fill the frame</option>
                <option value="contain">Show whole image</option>
              </select>
            </Field>
            <Field label="Shape">
              <select value={node.circle ? "circle" : "box"} onChange={(event) => onPatch({ circle: event.target.value === "circle" })} className={selectClass}>
                <option value="box">Rectangle</option>
                <option value="circle">Circle</option>
              </select>
            </Field>
            {!node.circle && (
              <NumberField label="Corner radius" value={typeof node.radius === "number" ? node.radius : 0} min={0} onChange={(radius) => onPatch({ radius: Math.max(0, radius) })} />
            )}
            <NumberField label="Crop position (0–1)" value={node.focalY ?? 0.5} step={0.05} min={0} onChange={(focalY) => onPatch({ focalY: Math.max(0, Math.min(1, focalY)) })} />
          </div>
          <label className="flex items-center gap-2 text-[13px] text-foreground">
            <input type="checkbox" checked={Boolean(node.grayscale)} onChange={(event) => onPatch({ grayscale: event.target.checked })} />
            Black and white
          </label>
        </div>
      )}

      {(node.kind === "line" || node.kind === "dots" || node.kind === "icon") && (
        <div className="grid grid-cols-2 gap-2">
          <ColorField label="Colour" value={fillToHex(node.color)} onChange={(color) => onPatch({ color })} />
          {node.kind === "line" && <NumberField label="Thickness" value={node.width} min={1} onChange={(width) => onPatch({ width: Math.max(1, width) })} />}
        </div>
      )}

      <div className="grid grid-cols-4 gap-2 border-t border-border pt-3">
        <NumberField label="X" value={bounds.x} onChange={(x) => resize({ x })} />
        <NumberField label="Y" value={bounds.y} onChange={(y) => resize({ y })} />
        <NumberField label="W" value={bounds.w} min={8} onChange={(w) => resize({ w })} />
        <NumberField label="H" value={bounds.h} min={8} onChange={(h) => resize({ h })} />
        <div className="col-span-2">
          <NumberField label="Rotation (°)" value={node.rotation ?? 0} onChange={(rotation) => onPatch({ rotation })} />
        </div>
        <div className="col-span-2">
          <NumberField label="Opacity (%)" value={Math.round((node.opacity ?? 1) * 100)} min={0} onChange={(value) => onPatch({ opacity: Math.max(0, Math.min(100, value)) / 100 })} />
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Position and size are in pixels of the {scene.width} × {scene.height} creative.
      </p>
    </div>
  );
}

export function LayersList({ scene, selectedId, onSelect }: { scene: Scene; selectedId: string | null; onSelect: (id: string) => void }) {
  // Front-most first, as in every design tool.
  const layers = [...scene.nodes].reverse().filter((node) => {
    const b = nodeBounds(node);
    return node.id && b.w > 0 && b.h > 0;
  });
  return (
    <div className="max-h-[60vh] space-y-0.5 overflow-y-auto pr-1">
      {layers.map((node) => (
        <button
          key={node.id}
          type="button"
          onClick={() => onSelect(node.id as string)}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition",
            node.id === selectedId ? "bg-foreground text-background" : "text-foreground hover:bg-muted",
          )}
        >
          <span className="w-12 shrink-0 text-[10px] uppercase opacity-60">{node.kind}</span>
          <span className="truncate">{nodeLabel(node)}</span>
        </button>
      ))}
    </div>
  );
}
