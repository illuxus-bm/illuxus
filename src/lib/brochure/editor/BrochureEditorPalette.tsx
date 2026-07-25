/**
 * BrochureEditorPalette — left sidebar of the editor that offers
 * "Add element" affordances. Clicking a button appends a new element
 * to the active page, centred within the visible area, and selects it
 * so the properties panel switches to it immediately.
 */
import {
  Type,
  Heading1,
  Image as ImageIcon,
  Square,
  Circle,
  Tag as PillIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";

import {
  newImageElement,
  newPillElement,
  newShapeElement,
  newTextElement,
  type BrochureElement,
} from "./editor-document";

type NewElementKind = "text" | "heading" | "image" | "rect" | "ellipse" | "pill";

interface Props {
  /** Current page dimensions in mm, used to centre newly-added
   *  elements within the page. */
  pageWidth: number;
  pageHeight: number;
  /** Callback receives the freshly-constructed element; the parent
   *  is responsible for appending it to the document and selecting it. */
  onAddElement: (element: BrochureElement) => void;
}

export default function BrochureEditorPalette({ pageWidth, pageHeight, onAddElement }: Props) {
  const centerX = pageWidth / 2;
  const centerY = pageHeight / 2;

  const add = (kind: NewElementKind) => {
    switch (kind) {
      case "text":
        onAddElement(
          newTextElement({
            x: centerX - 40,
            y: centerY - 6,
            width: 80,
            height: 12,
            content: "Your text here",
            fontFamily: "Poppins",
            fontSize: 14,
            fontWeight: "normal",
            color: "#111111",
            align: "left",
          })
        );
        return;
      case "heading":
        onAddElement(
          newTextElement({
            x: centerX - 60,
            y: centerY - 10,
            width: 120,
            height: 20,
            content: "Heading",
            fontFamily: "Poppins",
            fontSize: 32,
            fontWeight: "bold",
            color: "#000000",
            align: "left",
          })
        );
        return;
      case "image":
        onAddElement(
          newImageElement({
            x: centerX - 40,
            y: centerY - 25,
            width: 80,
            height: 50,
            src: "",
            fit: "cover",
            cornerRadius: 2,
          })
        );
        return;
      case "rect":
        onAddElement(
          newShapeElement({
            x: centerX - 30,
            y: centerY - 20,
            width: 60,
            height: 40,
            shape: "rect",
            fill: "#e5e7eb",
            stroke: "transparent",
            strokeWidth: 0,
            cornerRadius: 2,
          })
        );
        return;
      case "ellipse":
        onAddElement(
          newShapeElement({
            x: centerX - 25,
            y: centerY - 25,
            width: 50,
            height: 50,
            shape: "ellipse",
            fill: "#e5e7eb",
            stroke: "transparent",
            strokeWidth: 0,
            cornerRadius: 0,
          })
        );
        return;
      case "pill":
        onAddElement(
          newPillElement({
            x: centerX - 25,
            y: centerY - 5,
            width: 50,
            height: 10,
            text: "Pill",
            fontFamily: "Poppins",
            fontSize: 10,
            textColor: "#000000",
            fillColor: "#ffffff",
            strokeColor: "#000000",
            strokeWidth: 0.4,
          })
        );
        return;
    }
  };

  const items: Array<{ label: string; icon: typeof Type; kind: NewElementKind }> = [
    { label: "Text", icon: Type, kind: "text" },
    { label: "Heading", icon: Heading1, kind: "heading" },
    { label: "Image", icon: ImageIcon, kind: "image" },
    { label: "Rectangle", icon: Square, kind: "rect" },
    { label: "Ellipse", icon: Circle, kind: "ellipse" },
    { label: "Pill", icon: PillIcon, kind: "pill" },
  ];

  return (
    <div className="w-20 h-full border-r border-border bg-background flex-shrink-0 flex flex-col items-center gap-1.5 py-3">
      {items.map((item) => (
        <Button
          key={item.kind}
          type="button"
          variant="ghost"
          onClick={() => add(item.kind)}
          className="flex flex-col items-center justify-center gap-0.5 w-14 h-14 p-0"
          title={`Add ${item.label.toLowerCase()}`}
        >
          <item.icon className="h-4 w-4" />
          <span className="text-[10px] font-medium">{item.label}</span>
        </Button>
      ))}
    </div>
  );
}
