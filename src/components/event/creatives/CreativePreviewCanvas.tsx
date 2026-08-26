/**
 * CreativePreviewCanvas — shared live-preview `<canvas>` used by both
 * `CreativeGeneratorDialog` and `BatchCreativeGeneratorDialog`.
 *
 * Mirrors `PrintBadgesDialog.tsx`'s `refreshPreview` pattern exactly: a
 * `useMemo`-wrapped async refresh function (deps = every selection input)
 * paired with a `useEffect` that debounces re-invoking it by 400ms whenever
 * those deps change, cleaning up the pending timer on the next change/unmount
 * (Requirements 7.1, 7.2). Where `PrintBadgesDialog` re-renders an HTML
 * preview into an `<iframe>`, this component re-draws a `RenderPlan` (via
 * `buildSpeakerPlan`/`buildSponsorPlan`/`buildComboPlan` + `drawPlan`) onto a
 * `<canvas>` — the exact same plan-building/drawing path the real
 * `renderXCreative` export functions use, so the preview is a faithful
 * (not approximated) representation of the exported PNG.
 *
 * No entity picked yet is a valid, common state while the organizer is still
 * choosing a template/format — in that case a documented sample
 * speaker/sponsor stands in (mirroring `PrintBadgesDialog`'s
 * `badges[0] ?? { name: "Jane Doe", ... }` sample-badge fallback) so the
 * preview always shows *something* representative rather than a blank canvas.
 *
 * Sizing: `drawPlan` draws entirely in the logical `format.width` x
 * `format.height` coordinate space passed to the plan builders — it never
 * reads `canvas.width`/`canvas.height` directly (confirmed by reading
 * `drawPlan`'s implementation in `creative-renderer.ts`). That means the
 * on-screen preview can be shrunk purely by (1) sizing the canvas's actual
 * backing store down to `format.width/height * previewScale` and (2) scaling
 * the drawing context by that same factor (`ctx.scale(previewScale,
 * previewScale)`) before calling `drawPlan` — every subsequent draw call,
 * including stroke widths and `fitText`'s resolved font sizes, is
 * proportionally scaled along with it, since both are specified in the
 * context's current (now-scaled) coordinate space. This renders a
 * proportionally-shrunk, pixel-faithful preview at a fraction of the cost of
 * a full-resolution render, rather than rendering full-size and shrinking
 * with CSS.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  buildSpeakerPlan,
  buildSponsorPlan,
  buildComboPlan,
  buildEventPlan,
  drawPlan,
  type SpeakerLike,
  type SponsorLike,
  type EventPromoLike,
} from "@/lib/creatives/creative-renderer";
import type { CreativeTemplate, CreativeType, EventTheme, PlatformFormat } from "@/lib/creatives/creative-templates";
import {
  decoratePlanWithCustomization,
  type CustomizationConfig,
} from "@/lib/creatives/creative-customization";

interface CreativePreviewCanvasProps {
  mode: CreativeType;
  template: CreativeTemplate;
  format: PlatformFormat;
  theme: EventTheme;
  speaker?: SpeakerLike | null;
  sponsor?: SponsorLike | null;
  /** Used only when `mode === "event"` — the organizer's Event_Promo form
   *  values (title, tagline, date label, CTA, wordmark, stats). Falls back
   *  to a documented sample promo when omitted, mirroring
   *  `SAMPLE_SPEAKER`/`SAMPLE_SPONSOR`'s stand-in convention. */
  eventPromo?: EventPromoLike | null;
  /**
   * Optional Creative_Customization payload. When provided, the built plan is
   * routed through `decoratePlanWithCustomization` before drawing so the
   * live-preview canvas and the exported PNG share the exact same code path
   * (Property 49 — Preview_Parity). When omitted or empty, `decoratePlan…`
   * short-circuits and the preview stays byte-identical to the base spec's
   * output (Property 45 — Additivity_Invariant).
   */
  customization?: CustomizationConfig;
  /** Effective font family resolved via `resolveEffective` — passed through
   *  to `decoratePlanWithCustomization` as `DecorateContext.effectiveFontFamily`. */
  effectiveFontFamily?: string;
  /** Effective watermark logo URL resolved via `resolveEffective` — passed
   *  through to `decoratePlanWithCustomization` so the decorator can gate
   *  emission of the watermark element (Requirement 6.3). */
  effectiveWatermarkLogoUrl?: string;
}

/** Stand-in speaker used while no real speaker is selected yet, mirroring
 *  `PrintBadgesDialog`'s sample-badge fallback so the preview never renders
 *  blank while the organizer is still picking an entity. */
const SAMPLE_SPEAKER: SpeakerLike = {
  id: "sample",
  name: "Jane Doe",
  photo_url: null,
  title: "Chief Scientist",
  company: "Acme Inc.",
};

/** Stand-in sponsor used while no real sponsor is selected yet — same
 *  rationale as `SAMPLE_SPEAKER`. */
const SAMPLE_SPONSOR: SponsorLike = {
  id: "sample",
  name: "Acme Corp",
  logo_url: null,
  tier: "gold",
};

/** Stand-in Event_Promo used while the organizer's form is empty — same
 *  rationale as `SAMPLE_SPEAKER`/`SAMPLE_SPONSOR`. */
const SAMPLE_EVENT_PROMO: EventPromoLike = {
  id: "sample",
  title: "Annual Tech Summit",
  tagline: "You're Invited",
  dateLabel: "23rd July, 2026",
  ctaLabel: "Register for FREE",
  wordmarkUrl: null,
  stats: [
    { value: "6000+", label: "Attendees" },
    { value: "30+", label: "Speakers" },
  ],
};

/** Preview canvases are shrunk to roughly this max width (px) so they render
 *  quickly and fit comfortably inside a dialog pane, regardless of how large
 *  the target `Platform_Format` is (e.g. a 1600x900 Twitter/X post). */
const PREVIEW_MAX_WIDTH_PX = 360;

export default function CreativePreviewCanvas({
  mode,
  template,
  format,
  theme,
  speaker,
  sponsor,
  eventPromo,
  customization,
  effectiveFontFamily,
  effectiveWatermarkLogoUrl,
}: CreativePreviewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const refreshPreview = useMemo(
    () => async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      setPreviewLoading(true);
      try {
        const previewScale = Math.min(1, PREVIEW_MAX_WIDTH_PX / format.width);
        canvas.width = Math.round(format.width * previewScale);
        canvas.height = Math.round(format.height * previewScale);

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.scale(previewScale, previewScale);

        const usedSpeaker = speaker ?? SAMPLE_SPEAKER;
        const usedSponsor = sponsor ?? SAMPLE_SPONSOR;
        const usedEventPromo = eventPromo ?? SAMPLE_EVENT_PROMO;
        const basePlan =
          mode === "speaker"
            ? buildSpeakerPlan(usedSpeaker, template, format, theme)
            : mode === "sponsor"
              ? buildSponsorPlan(usedSponsor, template, format, theme)
              : mode === "event"
                ? buildEventPlan(usedEventPromo, template, format, theme)
                : buildComboPlan(usedSpeaker, usedSponsor, template, format, theme);

        // Route through the decorator when a Customization_Config is
        // provided so the preview and the exported PNG share the exact
        // same code path (Property 49 — Preview_Parity). When
        // `customization` is omitted, or every field is unset,
        // `decoratePlanWithCustomization` short-circuits to `basePlan`
        // by reference — preserving the base spec's byte-identical
        // output (Property 45 — Additivity_Invariant).
        const plan = customization
          ? decoratePlanWithCustomization(basePlan, customization, {
              effectiveFontFamily: effectiveFontFamily ?? "Poppins",
              effectiveWatermarkLogoUrl,
            })
          : basePlan;

        await drawPlan(ctx, plan);
        ctx.restore();
      } finally {
        setPreviewLoading(false);
      }
    },
    [
      mode,
      template,
      format,
      theme,
      speaker,
      sponsor,
      eventPromo,
      customization,
      effectiveFontFamily,
      effectiveWatermarkLogoUrl,
    ],
  );

  // Refresh preview when key settings change (debounced 400ms) — mirrors
  // PrintBadgesDialog.tsx's refreshPreview debounce exactly.
  useEffect(() => {
    const t = setTimeout(() => { void refreshPreview(); }, 400);
    return () => clearTimeout(t);
  }, [refreshPreview]);

  return (
    <div className="relative flex items-center justify-center w-full h-full">
      <canvas
        ref={canvasRef}
        className="rounded border border-border/50 shadow-sm bg-white max-w-full max-h-full"
      />
      {previewLoading && (
        <div className="absolute top-2 right-2">
          <RefreshCw className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
        </div>
      )}
    </div>
  );
}
