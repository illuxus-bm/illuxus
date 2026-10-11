/**
 * BrochureEditorPalette — left sidebar of the editor that offers
 * "Add element" affordances. Clicking a button appends a new element
 * to the active page, centred within the visible area, and selects it
 * so the properties panel switches to it immediately.
 *
 * "Image" opens the file picker straight away and places the picture at
 * its own proportions — it used to drop an empty grey placeholder that
 * then had to be filled in from the properties panel. "Shapes" opens a
 * small gallery rather than listing every shape down the bar.
 */
import { useRef, useState } from "react";
import {
  ArrowRight,
  Circle,
  Diamond,
  Heading1,
  Hexagon,
  Image as ImageIcon,
  Minus,
  Shapes,
  Square,
  Star,
  Tag as PillIcon,
  Triangle,
  Type,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import {
  newImageElement,
  newPillElement,
  newShapeElement,
  newTextElement,
  type BrochureElement,
  type ShapeKind,
} from "./editor-document";
import { placedImageSizeMm, readImageFile } from "./editor-image-file";
import { SHAPE_LABELS } from "./editor-render-props";

interface Props {
  /** Current page dimensions in mm, used to centre newly-added
   *  elements within the page. */
  pageWidth: number;
  pageHeight: number;
  /** The active brochure's resolved font family (theme default with
   *  any organizer override already applied — same value seeded into
   *  the document's own text/pill elements). Newly-added elements use
   *  this instead of a hardcoded family so a "Text"/"Heading"/"Pill"
   *  added on, say, a JetBrains-Mono-themed brochure doesn't visually
   *  clash with every other element already on the page. Falls back to
   *  "Poppins" (the editor's baseline default) when omitted. */
  defaultFontFamily?: string;
  /** Fill for newly-added shapes — the brochure's accent color, so a
   *  new shape belongs to the design instead of arriving in grey. */
  accentColor?: string;
  /** The active page's background color, when it is a flat color. A shape
   *  in the accent color added to an accent-colored page would be invisible,
   *  so on such a page new shapes are black instead. */
  pageColor?: string;
  /** Callback receives the freshly-constructed element; the parent
   *  is responsible for appending it to the document and selecting it. */
  onAddElement: (element: BrochureElement) => void;
}

const SHAPE_ICONS: Record<ShapeKind, typeof Square> = {
  rect: Square,
  ellipse: Circle,
  triangle: Triangle,
  diamond: Diamond,
  hexagon: Hexagon,
  star: Star,
  arrow: ArrowRight,
  line: Minus,
};

export default function BrochureEditorPalette({
  pageWidth,
  pageHeight,
  defaultFontFamily,
  accentColor,
  pageColor,
  onAddElement,
}: Props) {
  const centerX = pageWidth / 2;
  const centerY = pageHeight / 2;
  const fontFamily = defaultFontFamily ?? "Poppins";
  const accent = accentColor ?? "#e5e7eb";
  const sameAsPage = (color: string) => !!pageColor && pageColor.toLowerCase() === color.toLowerCase();
  const fill = sameAsPage(accent) ? "#000000" : accent;
  // Ink that shows on the page: white on a black page, black anywhere else.
  const ink = sameAsPage("#000000") ? "#ffffff" : "#000000";
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [shapesOpen, setShapesOpen] = useState(false);

  const addText = (heading: boolean) => {
    const width = heading ? 120 : 80;
    onAddElement(
      newTextElement({
        x: centerX - width / 2,
        y: centerY - (heading ? 10 : 6),
        width,
        height: heading ? 14 : 7,
        content: heading ? "Heading" : "Your text here",
        fontFamily,
        fontSize: heading ? 32 : 14,
        fontWeight: heading ? "bold" : "normal",
        color: ink,
        align: "left",
      })
    );
  };

  const addShape = (shape: ShapeKind) => {
    // A line is a stroke with a grab area; everything else is a filled box.
    const size =
      shape === "line"
        ? { width: 80, height: 4 }
        : shape === "arrow"
          ? { width: 60, height: 24 }
          : shape === "rect"
            ? { width: 60, height: 40 }
            : { width: 50, height: 50 };
    onAddElement(
      newShapeElement({
        x: centerX - size.width / 2,
        y: centerY - size.height / 2,
        ...size,
        shape,
        fill: shape === "line" ? "transparent" : fill,
        stroke: shape === "line" ? ink : "transparent",
        strokeWidth: shape === "line" ? 0.6 : 0,
        cornerRadius: shape === "rect" ? 2 : 0,
      })
    );
  };

  const addPill = () => {
    onAddElement(
      newPillElement({
        x: centerX - 25,
        y: centerY - 5,
        width: 50,
        height: 10,
        text: "Pill",
        fontFamily,
        fontSize: 10,
        textColor: "#000000",
        fillColor: "#ffffff",
        strokeColor: "#000000",
        strokeWidth: 0.4,
      })
    );
  };

  const addImageFile = async (file: File | null) => {
    if (!file) return;
    const result = await readImageFile(file);
    if (result.status !== "ok") {
      toast.error(result.title, { description: result.description });
      return;
    }
    const size = placedImageSizeMm(result.width, result.height, pageWidth, pageHeight);
    onAddElement(
      newImageElement({
        x: centerX - size.width / 2,
        y: centerY - size.height / 2,
        ...size,
        src: result.dataUrl,
        fit: "cover",
        cornerRadius: 0,
      })
    );
  };

  const buttonClass = "flex flex-col items-center justify-center gap-0.5 w-14 h-14 p-0";

  return (
    <div className="w-20 h-full border-r border-border bg-background flex-shrink-0 flex flex-col items-center gap-1.5 py-3 overflow-y-auto">
      <Button type="button" variant="ghost" onClick={() => addText(false)} className={buttonClass} title="Add text">
        <Type className="h-4 w-4" />
        <span className="text-[10px] font-medium">Text</span>
      </Button>
      <Button type="button" variant="ghost" onClick={() => addText(true)} className={buttonClass} title="Add heading">
        <Heading1 className="h-4 w-4" />
        <span className="text-[10px] font-medium">Heading</span>
      </Button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void addImageFile(e.target.files?.[0] ?? null);
          // Reset so choosing the same file twice still fires a change event.
          if (fileInputRef.current) fileInputRef.current.value = "";
        }}
      />
      <Button
        type="button"
        variant="ghost"
        onClick={() => fileInputRef.current?.click()}
        className={buttonClass}
        title="Add an image from your computer (or drop one onto the page)"
      >
        <ImageIcon className="h-4 w-4" />
        <span className="text-[10px] font-medium">Image</span>
      </Button>

      <Popover open={shapesOpen} onOpenChange={setShapesOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" className={buttonClass} title="Add a shape">
            <Shapes className="h-4 w-4" />
            <span className="text-[10px] font-medium">Shapes</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent side="right" align="start" className="w-[212px] p-2">
          <div className="grid grid-cols-4 gap-1">
            {(Object.keys(SHAPE_LABELS) as ShapeKind[]).map((shape) => {
              const Icon = SHAPE_ICONS[shape];
              return (
                <Button
                  key={shape}
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    addShape(shape);
                    // Picking a shape is the end of the trip to the gallery.
                    setShapesOpen(false);
                  }}
                  className="h-11 w-11 p-0"
                  title={`Add ${SHAPE_LABELS[shape].toLowerCase()}`}
                  aria-label={`Add ${SHAPE_LABELS[shape].toLowerCase()}`}
                >
                  <Icon className="h-5 w-5" />
                </Button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      <Button type="button" variant="ghost" onClick={() => addShape("line")} className={buttonClass} title="Add a line">
        <Minus className="h-4 w-4" />
        <span className="text-[10px] font-medium">Line</span>
      </Button>
      <Button type="button" variant="ghost" onClick={addPill} className={buttonClass} title="Add pill">
        <PillIcon className="h-4 w-4" />
        <span className="text-[10px] font-medium">Pill</span>
      </Button>
    </div>
  );
}
