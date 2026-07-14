/**
 * TemplatePicker — per-type Creative_Template thumbnail picker.
 *
 * Mirrors the radio-card visual pattern used by `PrintBadgesDialog.tsx`'s
 * `TYPE_OPTIONS`/`SIZE_OPTIONS` rendering (bordered label wrapping a
 * `RadioGroupItem`, `border-primary bg-primary/5` when selected,
 * `border-border hover:bg-muted/40` otherwise).
 *
 * Creative_Templates are code-defined layouts, not pre-rendered images, so
 * there's no thumbnail asset to show. Instead each card renders a
 * lightweight CSS-only `TemplateSwatch`: the template's actual `background`
 * (solid/gradient) plus small abstract markers positioned at the template's
 * real `imageSlots`/`textSlots` percentages — a real visual hint without the
 * cost of a full canvas render per card.
 */
import type { CSSProperties } from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  templatesFor,
  type CreativeTemplate,
  type CreativeType,
  type ImageSlot,
  type TextSlot,
} from "@/lib/creatives/creative-templates";

interface TemplatePickerProps {
  type: CreativeType;
  value: string;
  onChange: (templateId: string) => void;
}

export default function TemplatePicker({ type, value, onChange }: TemplatePickerProps) {
  const templates = templatesFor(type);

  return (
    <RadioGroup value={value} onValueChange={onChange} className="grid grid-cols-2 gap-2">
      {templates.map((t) => (
        <label
          key={t.id}
          className={`border rounded-lg overflow-hidden cursor-pointer transition-colors ${
            value === t.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
          }`}
        >
          <RadioGroupItem value={t.id} className="sr-only" />
          <TemplateSwatch template={t} />
          <div className="px-2.5 py-2">
            <div className="text-[13px] font-medium leading-tight">{t.name}</div>
            <div className="text-[11px] text-muted-foreground leading-tight">{t.description}</div>
          </div>
        </label>
      ))}
    </RadioGroup>
  );
}

/**
 * Lightweight CSS-only visual preview of a `CreativeTemplate`: the
 * template's real `background` rendered via inline `style`, plus small
 * absolutely-positioned markers standing in for each image/text slot,
 * positioned via the same `xPct`/`yPct` percentages the real renderer uses
 * (`creative-renderer.ts`'s plan builders + `reflowTemplate`).
 */
function TemplateSwatch({ template }: { template: CreativeTemplate }) {
  const backgroundStyle: CSSProperties =
    template.background.type === "solid"
      ? { backgroundColor: template.background.color }
      : template.background.type === "gradient"
        ? {
            background: `linear-gradient(${template.background.angle}deg, ${template.background.from}, ${template.background.to})`,
          }
        // "image" backgrounds can't be previewed at this scale without loading
        // the event's actual theme image — use a neutral placeholder color.
        : { backgroundColor: "#cbd5e1" };

  return (
    <div className="relative h-14 w-full overflow-hidden" style={backgroundStyle}>
      {Object.values(template.imageSlots).map((slot, i) => slot && <ImageSlotMarker key={i} slot={slot} />)}
      {template.textSlots.map((slot) => <TextSlotMarker key={slot.key} slot={slot} />)}
      {template.divider && (
        <div
          className="absolute bg-white/40"
          style={{
            left: `${template.divider.xPct}%`,
            top: `${template.divider.yPct1}%`,
            height: `${template.divider.yPct2 - template.divider.yPct1}%`,
            width: "1px",
            transform: "translateX(-50%)",
          }}
        />
      )}
    </div>
  );
}

function ImageSlotMarker({ slot }: { slot: ImageSlot }) {
  return (
    <div
      className="absolute bg-white/60"
      style={{
        left: `${slot.xPct}%`,
        top: `${slot.yPct}%`,
        width: "8px",
        height: "8px",
        borderRadius: slot.shape === "circle" ? "50%" : "2px",
        transform: "translate(-50%, -50%)",
      }}
    />
  );
}

function TextSlotMarker({ slot }: { slot: TextSlot }) {
  return (
    <div
      className="absolute bg-white/50"
      style={{
        left: `${slot.xPct}%`,
        top: `${slot.yPct}%`,
        width: `${Math.min(slot.maxWidthPct, 40)}%`,
        height: "3px",
        transform: "translate(-50%, -50%)",
      }}
    />
  );
}
