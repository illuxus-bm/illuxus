import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { bgTransformToCss, frontBgStyleToCss, type BadgeDesign, type ElementKey, type ElementPlacement } from "@/lib/badge-design";

interface Props {
  design: BadgeDesign;
  onChange: (d: BadgeDesign) => void;
  /** Physical badge size in millimeters — drives true WYSIWYG. */
  widthMm: number;
  heightMm: number;
  sampleName?: string;
  sampleCompany?: string;
  showGrid?: boolean;
}

const PX_PER_MM = 3.7795;            // 96dpi CSS pixels per millimeter
const PT_TO_PX = 1.3333;             // 72pt → 96px
const SNAP_PCT = 1.5;                // snap when within ±1.5%
const GUIDE_PCT = 2;                 // show guide when within ±2%
const TARGETS = [10, 50, 90];        // safe edges + center

const SAMPLE_VALUES: Partial<Record<ElementKey, string>> = {
  name:       "Jane Doe",
  company:    "Acme Inc.",
  email:      "jane@example.com",
  title:      "Head of Product",
  ticket:     "VIP",
  eventTitle: "ILLUXUS SUMMIT",
  eventDate:  "Sat, Jul 4 · 1:23 AM",
  orgName:    "ILLUXUS",
  customText: "Custom text",
};

export default function BadgeDesignerCanvas({
  design, onChange, widthMm, heightMm,
  sampleName, sampleCompany,
  showGrid = true,
}: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });

  // Fit-to-container scale so 1mm in design = scale*PX_PER_MM on screen.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const maxW = el.clientWidth;
      const idealW = widthMm * PX_PER_MM;
      const s = Math.min(1, maxW / idealW);
      setScale(s > 0 ? s : 1);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [widthMm]);

  useEffect(() => { setGuides({ v: [], h: [] }); }, [widthMm, heightMm]);

  const w = widthMm * PX_PER_MM * scale;
  const h = heightMm * PX_PER_MM * scale;

  const startDrag = (key: ElementKey, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const box = wrapRef.current?.querySelector<HTMLDivElement>("[data-canvas]");
    if (!box) return;
    const rect = box.getBoundingClientRect();

    const move = (ev: PointerEvent) => {
      let x = ((ev.clientX - rect.left) / rect.width) * 100;
      let y = ((ev.clientY - rect.top) / rect.height) * 100;
      x = Math.max(0, Math.min(100, x));
      y = Math.max(0, Math.min(100, y));

      const vGuides: number[] = [];
      const hGuides: number[] = [];
      for (const t of TARGETS) {
        if (Math.abs(x - t) <= SNAP_PCT) x = t;
        if (Math.abs(y - t) <= SNAP_PCT) y = t;
        if (Math.abs(x - t) <= GUIDE_PCT) vGuides.push(t);
        if (Math.abs(y - t) <= GUIDE_PCT) hGuides.push(t);
      }
      setGuides({ v: vGuides, h: hGuides });
      onChange({ ...design, elements: { ...design.elements, [key]: { ...design.elements[key], x, y } } });
    };
    const up = () => {
      setGuides({ v: [], h: [] });
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const bgStyle: React.CSSProperties = design.frontBg
    ? {
        backgroundImage: `url(${design.frontBg})`,
        ...bgTransformToCss(design.frontBgTransform),
      }
    : (() => {
        const css = frontBgStyleToCss(design.frontBgStyle);
        if (!css) return { backgroundColor: "hsl(var(--muted))" };
        const style = design.frontBgStyle?.type === "solid"
          ? { backgroundColor: css }
          : { backgroundImage: css };
        return style;
      })();

  const valueFor = (k: ElementKey, el: ElementPlacement): string => {
    if (k === "name") return sampleName ?? SAMPLE_VALUES.name!;
    if (k === "company") return sampleCompany ?? SAMPLE_VALUES.company!;
    if (k === "customText" || k === "ticket") return el.staticText?.trim() || SAMPLE_VALUES[k] || "";
    return SAMPLE_VALUES[k] || "";
  };

  // Render order: text elements first, QR on top
  const allKeys = Object.keys(design.elements) as ElementKey[];
  const textKeys = allKeys.filter((k) => k !== "qr");

  return (
    <div ref={wrapRef} className="w-full flex flex-col items-center">
      <div
        data-canvas
        className="relative rounded-md border border-border overflow-hidden select-none shadow-sm"
        style={{ width: `${w}px`, height: `${h}px`, ...bgStyle }}
      >
        {/* Grid overlay */}
        {showGrid && (
          <div
            className="absolute inset-0 pointer-events-none opacity-40"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgba(0,0,0,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.06) 1px, transparent 1px)",
              backgroundSize: `${w / 10}px ${h / 10}px`,
            }}
          />
        )}

        {/* Snap guides */}
        {guides.v.map((p) => (
          <div key={`v${p}`} className="absolute top-0 bottom-0 w-px bg-primary/70 pointer-events-none"
               style={{ left: `${p}%` }} />
        ))}
        {guides.h.map((p) => (
          <div key={`h${p}`} className="absolute left-0 right-0 h-px bg-primary/70 pointer-events-none"
               style={{ top: `${p}%` }} />
        ))}

        {/* Text elements */}
        {textKeys.map((key) => {
          const el = design.elements[key];
          if (!el?.enabled) return null;
          const text = valueFor(key, el);
          if (!text) return null;
          const fontPx = el.size * PT_TO_PX * scale;
          const transformMap: Record<string, string> = { uppercase: "uppercase", lowercase: "lowercase", capitalize: "capitalize", none: "none" };
          const css: React.CSSProperties = {
            left: `${el.x}%`,
            top: `${el.y}%`,
            transform: "translate(-50%, -50%)",
            color: el.color,
            fontFamily: el.fontFamily ? `${el.fontFamily}, system-ui, sans-serif` : "system-ui, sans-serif",
            fontWeight: el.fontWeight ?? 400,
            fontStyle: el.italic ? "italic" : "normal",
            textAlign: el.align ?? "center",
            textTransform: (transformMap[el.transform ?? "none"] || "none") as React.CSSProperties["textTransform"],
            letterSpacing: `${(el.letterSpacing ?? 0).toFixed(3)}em`,
            lineHeight: el.lineHeight ?? 1.1,
            fontSize: `${fontPx}px`,
            whiteSpace: "nowrap",
          };
          return (
            <div
              key={key}
              onPointerDown={(e) => startDrag(key, e)}
              className="absolute cursor-move outline outline-1 outline-primary/40 hover:outline-primary px-1"
              style={css}
              title={`Drag ${key}`}
            >
              {text}
            </div>
          );
        })}

        {/* QR last so it sits on top */}
        {design.elements.qr?.enabled && (() => {
          const el = design.elements.qr;
          const qrPx = el.size * PX_PER_MM * scale;
          return (
            <div
              key="qr"
              onPointerDown={(e) => startDrag("qr", e)}
              className="absolute cursor-move outline outline-1 outline-primary/40 hover:outline-primary"
              style={{ left: `${el.x}%`, top: `${el.y}%`, transform: "translate(-50%, -50%)" }}
            >
              <div
                className="bg-foreground/80 text-background flex items-center justify-center font-mono"
                style={{ width: `${qrPx}px`, height: `${qrPx}px`, fontSize: `${Math.max(8, qrPx * 0.18)}px` }}
              >QR</div>
            </div>
          );
        })()}

        {!design.frontBg && (!design.frontBgStyle || design.frontBgStyle.type === "none") && (
          <div className="absolute inset-0 flex items-center justify-center text-[11px] text-muted-foreground pointer-events-none">
            Upload a background or design with text only
          </div>
        )}
      </div>
      <div className="mt-1.5 text-[10px] text-muted-foreground tabular-nums">
        {widthMm.toFixed(0)} × {heightMm.toFixed(0)} mm · preview at {(scale * 100).toFixed(0)}%
      </div>
    </div>
  );
}
