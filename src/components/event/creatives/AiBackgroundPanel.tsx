/**
 * AiBackgroundPanel — the organizer-facing controls for generating an
 * AI_Background_Asset via the `generate-creative-background` Edge Function.
 *
 * Mounted inside `CreativeGeneratorDialog` (Task 9) and reused by
 * `BatchCreativeGeneratorDialog` (Task 11) when the "Background source"
 * selector is set to "AI-generated". The component contract is:
 *
 *  1. Style_Preset selector (5 presets, Requirement 2.1).
 *  2. Aspect_Ratio_Selection selector (4 ratios, Requirement 5.1).
 *  3. Optional custom-prompt textarea, APPENDED to the preset-derived
 *     prompt (Requirement 2.3, enforced by `buildResolvedPrompt`).
 *  4. Live resolved-prompt display, recomputed via `useMemo` on every
 *     relevant state change (Requirement 8.3 preview aid).
 *  5. "Preview" button opens an inline confirmation showing the resolved
 *     prompt + preset + aspect ratio, with "Generate" (confirm) and "Back"
 *     (cancel) actions (Requirement 8.3).
 *  6. On confirm, calls `callGenerateBackground`; on success shows a
 *     thumbnail + "Use this background" toggle; on error shows a
 *     category-specific toast and preserves the style/ratio selections so
 *     the organizer can revise + retry (Requirement 10.2).
 *  7. "Open library" button opens `AiBackgroundLibrary` (variant="picker")
 *     in a Dialog so the organizer can reuse a past generation instead of
 *     calling Gemini again (Requirement 7.2).
 *
 * The "Use this background" toggle calls `onBackgroundSelected` with the
 * selected asset when on, and `null` when off — so the parent dialog's
 * `aiBackground` state (which drives its `templateForRender` splice) always
 * reflects the organizer's current intent (Requirement 9.1).
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, ImagePlus, Loader2, Sparkles, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { logger } from "@/lib/observability";

import {
  ASPECT_RATIOS,
  AiBackgroundError,
  STYLE_PRESETS,
  STYLE_PRESET_DESCRIPTORS,
  buildResolvedPrompt,
  callGenerateBackground,
  type AiBackgroundErrorCode,
  type AiBackgroundResponse,
  type AspectRatio,
  type StylePreset,
} from "@/lib/creatives/creative-ai";
import type { EventTheme } from "@/lib/creatives/creative-templates";
import type { EventCreativeBackgroundRow } from "@/lib/creatives/creative-storage";

import AiBackgroundLibrary from "./AiBackgroundLibrary";

// ─── Public surface ──────────────────────────────────────────────────────────

export interface AiBackgroundSelection {
  assetUrl: string;
  stylePreset: StylePreset;
  promptText: string;
  backgroundId: string;
}

export interface AiBackgroundPanelProps {
  eventId: string;
  eventTitle: string;
  theme: EventTheme;
  /**
   * Called with the selected AI background once the organizer toggles
   * "Use this background" on (from a fresh generation OR from the
   * library). Called with `null` when the organizer toggles it off, so
   * the parent falls back to the template's original background
   * (Requirement 9.1).
   */
  onBackgroundSelected: (asset: AiBackgroundSelection | null) => void;
}

// ─── Display helpers ─────────────────────────────────────────────────────────

/** "abstract-gradient" → "Abstract Gradient". */
function presetLabel(preset: StylePreset): string {
  return preset
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const ASPECT_RATIO_LABELS: Record<AspectRatio, string> = {
  "1:1": "Square",
  "16:9": "Landscape",
  "9:16": "Portrait",
  "4:3": "Classic",
};

/**
 * Failure-category → toast description, per design.md's "Failure category
 * mapping" table (Requirements 9.2, 10.2). Every branch of the closed
 * `AiBackgroundErrorCode` union is covered explicitly, with `bad_request`
 * (and anything else) falling through to a generic retry message.
 */
function errorToastDescription(code: AiBackgroundErrorCode): string {
  switch (code) {
    case "network":
      return "Check your connection and try again";
    case "rate_limit":
      return "Daily AI background limit reached for this event";
    case "content_policy":
      return "That prompt was rejected — try adjusting the wording";
    case "service_outage":
      return "AI backgrounds are temporarily unavailable";
    case "configuration":
      return "AI backgrounds aren't configured yet — contact support";
    case "auth":
      return "You don't have permission to generate AI backgrounds";
    case "bad_request":
    default:
      return "Something went wrong generating your background — please try again";
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AiBackgroundPanel({
  eventId,
  eventTitle,
  theme,
  onBackgroundSelected,
}: AiBackgroundPanelProps) {
  const [stylePreset, setStylePreset] = useState<StylePreset>(STYLE_PRESETS[0]);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(ASPECT_RATIOS[0]);
  const [customPrompt, setCustomPrompt] = useState("");
  const [preview, setPreview] = useState<AiBackgroundResponse | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [useToggleOn, setUseToggleOn] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);

  /**
   * Recomputed on every relevant state change — the exact prompt that will
   * be sent to Gemini, shown live so the organizer knows what they're
   * about to generate before spending a quota slot (Requirement 8.3).
   */
  const resolvedPrompt = useMemo(
    () =>
      buildResolvedPrompt(
        stylePreset,
        theme.primaryColor,
        theme.accentColor,
        eventTitle,
        customPrompt,
      ),
    [stylePreset, theme.primaryColor, theme.accentColor, eventTitle, customPrompt],
  );

  const handlePreviewClick = () => {
    setConfirmationOpen(true);
  };

  const handleBack = () => {
    setConfirmationOpen(false);
  };

  const handleGenerateConfirm = async () => {
    setIsGenerating(true);
    try {
      const response = await callGenerateBackground({
        eventId,
        promptText: resolvedPrompt,
        stylePreset,
        aspectRatio,
      });

      setPreview(response);
      setConfirmationOpen(false);

      if (response.fromCache) {
        toast.info("Loaded from cache", {
          description: "This background matched a previous generation for this event.",
        });
      } else {
        toast.success("Background generated", {
          description: "Your AI background is ready to use.",
        });
      }
    } catch (err) {
      // `stylePreset` / `aspectRatio` are intentionally left untouched on
      // error so the organizer can revise the prompt and retry without
      // losing their selections (Requirement 10.2).
      const code: AiBackgroundErrorCode =
        err instanceof AiBackgroundError ? err.code : "service_outage";
      const message =
        err instanceof Error && err.message.length > 0
          ? err.message
          : "AI background generation failed";

      logger.error("ai background panel generation failed", {
        event_id: eventId,
        style_preset: stylePreset,
        aspect_ratio: aspectRatio,
        code,
        error_message: message,
      });

      toast.error("Couldn't generate background", {
        description: errorToastDescription(code),
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUseToggleChange = (checked: boolean) => {
    setUseToggleOn(checked);
    if (checked && preview) {
      onBackgroundSelected({
        assetUrl: preview.assetUrl,
        stylePreset,
        promptText: resolvedPrompt,
        backgroundId: preview.cacheKey,
      });
    } else {
      onBackgroundSelected(null);
    }
  };

  const handleLibrarySelect = (row: EventCreativeBackgroundRow) => {
    const hydratedPreset = STYLE_PRESETS.includes(row.style_preset as StylePreset)
      ? (row.style_preset as StylePreset)
      : stylePreset;
    const hydratedAspectRatio = ASPECT_RATIOS.includes(row.aspect_ratio as AspectRatio)
      ? (row.aspect_ratio as AspectRatio)
      : aspectRatio;

    setStylePreset(hydratedPreset);
    setAspectRatio(hydratedAspectRatio);
    setPreview({
      assetUrl: row.asset_url,
      storagePath: row.storage_path,
      cacheKey: row.cache_key,
      fromCache: true,
    });
    setUseToggleOn(true);
    setLibraryOpen(false);

    onBackgroundSelected({
      assetUrl: row.asset_url,
      stylePreset: hydratedPreset,
      promptText: row.prompt,
      backgroundId: row.cache_key,
    });

    toast.success("Background applied", {
      description: "Reused an existing AI background from your library.",
    });
  };

  const controlsDisabled = isGenerating || confirmationOpen;

  return (
    <div className="space-y-4">
      {/* STYLE PRESET */}
      <section>
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 block">
          Style preset
        </Label>
        <RadioGroup
          value={stylePreset}
          onValueChange={(v) => setStylePreset(v as StylePreset)}
          className="grid grid-cols-1 sm:grid-cols-2 gap-2"
          disabled={controlsDisabled}
        >
          {STYLE_PRESETS.map((preset) => {
            const descriptor = STYLE_PRESET_DESCRIPTORS[preset];
            return (
              <label
                key={preset}
                className={`border rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                  controlsDisabled ? "opacity-60 cursor-not-allowed" : ""
                } ${
                  stylePreset === preset
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/40"
                }`}
              >
                <RadioGroupItem value={preset} className="sr-only" disabled={controlsDisabled} />
                <div className="text-[13px] font-medium leading-tight">{presetLabel(preset)}</div>
                <div className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                  {descriptor.descriptiveText}
                </div>
              </label>
            );
          })}
        </RadioGroup>
      </section>

      {/* ASPECT RATIO */}
      <section>
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 block">
          Aspect ratio
        </Label>
        <RadioGroup
          value={aspectRatio}
          onValueChange={(v) => setAspectRatio(v as AspectRatio)}
          className="grid grid-cols-2 sm:grid-cols-4 gap-2"
          disabled={controlsDisabled}
        >
          {ASPECT_RATIOS.map((ratio) => (
            <label
              key={ratio}
              className={`border rounded-lg px-3 py-2 cursor-pointer transition-colors text-center ${
                controlsDisabled ? "opacity-60 cursor-not-allowed" : ""
              } ${
                aspectRatio === ratio
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/40"
              }`}
            >
              <RadioGroupItem value={ratio} className="sr-only" disabled={controlsDisabled} />
              <div className="text-[13px] font-medium leading-tight">{ratio}</div>
              <div className="text-[11px] text-muted-foreground leading-tight">
                {ASPECT_RATIO_LABELS[ratio]}
              </div>
            </label>
          ))}
        </RadioGroup>
      </section>

      {/* CUSTOM PROMPT */}
      <section>
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 block">
          Custom prompt
        </Label>
        <Textarea
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          placeholder="Add extra detail to the prompt (optional)"
          disabled={controlsDisabled}
          className="min-h-[72px] text-sm"
        />
      </section>

      {/* RESOLVED PROMPT (live) */}
      <section>
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 block">
          Resolved prompt
        </Label>
        <div className="border border-border rounded-lg bg-muted/30 px-3 py-2">
          <p className="text-[12px] text-muted-foreground leading-relaxed whitespace-pre-wrap break-words">
            {resolvedPrompt}
          </p>
        </div>
      </section>

      {/* INLINE CONFIRMATION */}
      {confirmationOpen && (
        <section className="border border-primary/40 bg-primary/5 rounded-lg p-3 space-y-3">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold">
            <Wand2 className="h-3.5 w-3.5" />
            Confirm generation
          </div>
          <div className="text-[12px] space-y-1">
            <p>
              <span className="text-muted-foreground">Preset: </span>
              {presetLabel(stylePreset)}
            </p>
            <p>
              <span className="text-muted-foreground">Aspect ratio: </span>
              {aspectRatio}
            </p>
            <p className="text-muted-foreground leading-relaxed break-words">{resolvedPrompt}</p>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button size="sm" variant="outline" onClick={handleBack} disabled={isGenerating} className="gap-1.5">
              <ChevronLeft className="h-3.5 w-3.5" />
              Back
            </Button>
            <Button size="sm" onClick={handleGenerateConfirm} disabled={isGenerating} className="gap-1.5">
              {isGenerating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Generate
            </Button>
          </div>
        </section>
      )}

      {/* ACTIONS */}
      {!confirmationOpen && (
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handlePreviewClick} disabled={isGenerating} className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            Preview
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setLibraryOpen(true)}
            disabled={isGenerating}
            className="gap-1.5"
          >
            <ImagePlus className="h-3.5 w-3.5" />
            Open library
          </Button>
        </div>
      )}

      {/* PREVIEW THUMBNAIL + USE TOGGLE */}
      {preview && (
        <section className="border border-border rounded-lg overflow-hidden bg-muted/20">
          <div className="p-3 flex flex-col items-center gap-3">
            <img
              src={preview.assetUrl}
              alt="AI-generated background preview"
              className="max-h-64 w-auto rounded-md border border-border object-contain bg-background"
            />
            <label className="w-full flex items-center justify-between gap-2 cursor-pointer">
              <div>
                <div className="text-[12px] font-medium">Use this background</div>
                <div className="text-[11px] text-muted-foreground">
                  Applies this AI background to the creative you're about to generate.
                </div>
              </div>
              <Switch checked={useToggleOn} onCheckedChange={handleUseToggleChange} />
            </label>
          </div>
        </section>
      )}

      {/* LIBRARY PICKER */}
      <Dialog open={libraryOpen} onOpenChange={setLibraryOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>AI background library</DialogTitle>
            <DialogDescription>
              Reuse a previously generated background instead of creating a new one.
            </DialogDescription>
          </DialogHeader>
          <AiBackgroundLibrary eventId={eventId} variant="picker" onSelect={handleLibrarySelect} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
