/**
 * BatchCreativeGeneratorDialog — Batch_Generator flow for the Creative_Generator.
 *
 * Mirrors `CreativeGeneratorDialog.tsx`'s settings-panel structure (template
 * picker, platform format checklist, "save as event default" toggle) but
 * targets every linked speaker or every linked sponsor on the event instead
 * of a single hand-picked entity (Requirement 6.1, 6.2) — so there is no
 * `EntityPicker` here, and combo batches are out of scope per the design.
 *
 * The primary "Run batch" action wires `runBatch` (per-entity × per-format
 * fault isolation, `creative-batch.ts`) to a progress bar (Requirement 6.4),
 * then — for every successful render — uploads the PNG to `site-assets` and
 * inserts an `event_creatives` row, mirroring `CreativeGeneratorDialog`'s
 * persistence step but per batch outcome. A persistence failure for one
 * outcome is logged and does not block persisting the others or the run's
 * "done" state (Requirement 6.5's fault isolation is about the render step;
 * post-render persistence failures are a secondary, logged-only concern).
 *
 * Once the run completes, every outcome is listed (success/failure, entity +
 * format) and a single "Download all (.zip)" button (Requirement 6.6) builds
 * an archive of every successful PNG via `buildBatchArchive`.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Layers, Download, Loader2, CheckCircle2, XCircle, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/observability";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";

import TemplatePicker from "./TemplatePicker";
import AiBackgroundPanel, { type AiBackgroundSelection } from "./AiBackgroundPanel";
import CustomizationPanel from "./CustomizationPanel";

import {
  templatesFor,
  PLATFORM_FORMATS,
  saveCreativeTemplatePref,
  readCreativeTemplatePref,
  readEffectiveTemplateId,
  type CreativeTemplate,
  type EventTheme,
  type PlatformFormat,
  type PlatformFormatId,
} from "@/lib/creatives/creative-templates";
import {
  buildSpeakerPlan,
  buildSponsorPlan,
  drawPlan,
  creativeFilename,
  type SpeakerLike,
  type SponsorLike,
} from "@/lib/creatives/creative-renderer";
import {
  resolveEffective,
  decoratePlanWithCustomization,
  type AppliedBrandKit,
  type CustomizationConfig,
} from "@/lib/creatives/creative-customization";
import { runBatch, buildBatchArchive, type BatchOutcome, type BatchProgress } from "@/lib/creatives/creative-batch";
import {
  uploadCreativeAsset,
  buildCreativeAssetRecord,
  insertCreativeAssetRecord,
} from "@/lib/creatives/creative-storage";
import type { EventPageConfig } from "@/components/event/page-form/types";

type BatchEntity = SpeakerLike | SponsorLike;

/** Where a Creative's rendered background comes from (Requirement 1.1, 1.4). */
type BackgroundSource = "template" | "ai";

const BACKGROUND_SOURCE_OPTIONS: { v: BackgroundSource; label: string; sub: string }[] = [
  { v: "template", label: "Template", sub: "Use the template's built-in background" },
  { v: "ai", label: "AI-generated", sub: "Generate a bespoke background with AI" },
];

interface BatchCreativeGeneratorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  batchType: "speaker" | "sponsor"; // which entity type this batch run targets
  eventPageConfig: EventPageConfig;
  onConfigChange: (config: EventPageConfig) => void;
}

export default function BatchCreativeGeneratorDialog({
  open,
  onOpenChange,
  eventId,
  batchType,
  eventPageConfig,
  onConfigChange,
}: BatchCreativeGeneratorDialogProps) {
  const { user } = useAuth();
  const { org } = useOrg();

  const [entities, setEntities] = useState<BatchEntity[]>([]);
  const [loadingEntities, setLoadingEntities] = useState(true);

  const [templateId, setTemplateId] = useState<string>(
    () => readCreativeTemplatePref(eventPageConfig, batchType) ?? templatesFor(batchType)[0].id
  );
  const [selectedFormats, setSelectedFormats] = useState<Set<PlatformFormatId>>(new Set());
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [backgroundSource, setBackgroundSource] = useState<BackgroundSource>("template");
  const [aiBackground, setAiBackground] = useState<AiBackgroundSelection | null>(null);

  // Creative_Customization spec — shared config across the batch (Task 13.1).
  // A single `CustomizationConfig` applies to every entity × format pair in
  // the run; `appliedBrandKit` mirrors what `CustomizationPanel` reports up
  // through `onApplyBrandKit`, so `resolveEffective` can thread the kit's
  // theme/font/logo fallbacks into every render (Requirement 9.4, 9.5).
  const [customization, setCustomization] = useState<CustomizationConfig>({});
  const [appliedBrandKit, setAppliedBrandKit] = useState<AppliedBrandKit | undefined>(undefined);
  const [customizeOpen, setCustomizeOpen] = useState(false);

  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [outcomes, setOutcomes] = useState<BatchOutcome<BatchEntity>[] | null>(null);

  // Reset transient (non-persisted) selections + prior results whenever the
  // dialog re-opens, mirroring CreativeGeneratorDialog's open-reset effect.
  useEffect(() => {
    if (!open) return;
    setTemplateId(readCreativeTemplatePref(eventPageConfig, batchType) ?? templatesFor(batchType)[0].id);
    setSelectedFormats(new Set());
    setSaveAsDefault(false);
    setBackgroundSource("template");
    setAiBackground(null);
    setCustomization({});
    setAppliedBrandKit(undefined);
    setCustomizeOpen(false);
    setProgress(null);
    setOutcomes(null);
    // Only re-init on open/batchType change — re-reading eventPageConfig here
    // would clobber an in-progress "save as default" toggle against stale
    // props, matching CreativeGeneratorDialog's rationale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, batchType]);

  // Clear any selected AI background whenever the organizer switches back to
  // the template background source, so a stale `aiBackground` never lingers
  // into a template-sourced render (Requirement 1.4).
  useEffect(() => {
    if (backgroundSource === "template") {
      setAiBackground(null);
    }
  }, [backgroundSource]);

  // Fetch ALL linked entities for `batchType` — same event_speakers/speakers
  // (or event_sponsors/sponsors) join pattern as EntityPicker.tsx, but the
  // full linked set rather than a single pick (Requirement 6.1, 6.2).
  useEffect(() => {
    if (!open) return;
    let mounted = true;

    async function load() {
      setLoadingEntities(true);
      try {
        if (batchType === "speaker") {
          const { data: links, error: linksError } = await supabase
            .from("event_speakers")
            .select("speaker_id, display_order")
            .eq("event_id", eventId)
            .order("display_order");
          if (linksError) {
            logger.error("batch creative generator event speakers fetch failed", {
              event_id: eventId,
              error_message: linksError.message,
            });
          }
          const ids = (links ?? []).map((l) => l.speaker_id);
          if (ids.length > 0) {
            const { data: rows, error } = await supabase.from("speakers").select("*").in("id", ids);
            if (error) {
              logger.error("batch creative generator speakers fetch failed", {
                event_id: eventId,
                error_message: error.message,
              });
            }
            if (mounted) setEntities((rows ?? []) as SpeakerLike[]);
          } else if (mounted) {
            setEntities([]);
          }
        } else {
          const { data: links, error: linksError } = await supabase
            .from("event_sponsors")
            .select("sponsor_id, display_order")
            .eq("event_id", eventId)
            .order("display_order");
          if (linksError) {
            logger.error("batch creative generator event sponsors fetch failed", {
              event_id: eventId,
              error_message: linksError.message,
            });
          }
          const ids = (links ?? []).map((l) => l.sponsor_id);
          if (ids.length > 0) {
            const { data: rows, error } = await supabase.from("sponsors").select("*").in("id", ids);
            if (error) {
              logger.error("batch creative generator sponsors fetch failed", {
                event_id: eventId,
                error_message: error.message,
              });
            }
            if (mounted) setEntities((rows ?? []) as SponsorLike[]);
          } else if (mounted) {
            setEntities([]);
          }
        }
      } finally {
        if (mounted) setLoadingEntities(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [open, eventId, batchType]);

  const template = useMemo<CreativeTemplate>(() => {
    const templates = templatesFor(batchType);
    return templates.find((t) => t.id === templateId) ?? templates[0];
  }, [batchType, templateId]);

  const theme: EventTheme = useMemo(
    () => ({
      primaryColor: eventPageConfig.theme.primaryColor,
      accentColor: eventPageConfig.theme.accentColor,
    }),
    [eventPageConfig.theme.primaryColor, eventPageConfig.theme.accentColor]
  );

  const formatsList = useMemo<PlatformFormat[]>(
    () => PLATFORM_FORMATS.filter((f) => selectedFormats.has(f.id)),
    [selectedFormats]
  );

  // Representative format for the `CustomizationPanel` — the first selected
  // format when the organizer has picked at least one, else the first entry
  // in the registry. The panel uses this to clamp border corner-radius and
  // blur-region geometry; per-format re-clamps still happen at render time
  // via `clampBorder` / `resolveWatermarkBox`, so the "wrong" format here
  // only affects the panel's slider caps, never a saved value.
  const previewFormat = useMemo<PlatformFormat>(
    () => formatsList[0] ?? PLATFORM_FORMATS[0],
    [formatsList]
  );

  // Adapter for `CustomizationPanel.onSavePageConfig`. The parent already
  // persists `page_config` changes through `onConfigChange`
  // (`CreativesSection.handleConfigChange` writes to Supabase), so this
  // wrapper simply forwards and returns a resolved promise — matching the
  // async signature the panel expects while leaving the parent's exact
  // persistence path unchanged.
  const handleSavePageConfig = useCallback(
    async (next: EventPageConfig) => {
      onConfigChange(next);
    },
    [onConfigChange]
  );

  const toggleFormat = (id: PlatformFormatId) => {
    setSelectedFormats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canRun = !isRunning && !loadingEntities && entities.length > 0 && selectedFormats.size > 0;

  const sortedOutcomes = useMemo(() => {
    if (!outcomes) return [];
    return [...outcomes].sort((a, b) => {
      const nameCompare = a.entity.name.localeCompare(b.entity.name);
      if (nameCompare !== 0) return nameCompare;
      return a.format.label.localeCompare(b.format.label);
    });
  }, [outcomes]);

  const successCount = outcomes?.filter((o) => o.status === "success").length ?? 0;
  const failedCount = outcomes ? outcomes.length - successCount : 0;
  const canDownloadZip = !!outcomes && successCount > 0;

  const handleRun = async () => {
    if (!canRun) return;

    const createdBy = user?.id;
    if (!createdBy) {
      toast.error("Cannot generate", { description: "You must be signed in to run a batch." });
      return;
    }

    setIsRunning(true);
    setOutcomes(null);
    setProgress({ completed: 0, total: entities.length * formatsList.length });
    try {
      // Persist the "save as default" preference once, before the run.
      if (saveAsDefault) {
        onConfigChange(saveCreativeTemplatePref(eventPageConfig, batchType, templateId));
      }

      // Splice the AI background URL into a template COPY — never mutates
      // `template` or the static preset registry. Computed ONCE per run
      // (not per outcome) since the batch pipeline reuses one AI background
      // across every entity + format in the run. When AI was selected but
      // no generation was ever confirmed (`aiBackground` is `null`), this
      // falls back to `template` unchanged, so the run still succeeds using
      // the template's original background (Requirement 9.1, 9.3).
      const templateForRender: CreativeTemplate =
        backgroundSource === "ai" && aiBackground
          ? { ...template, background: { type: "image", url: aiBackground.assetUrl, fit: "cover" } }
          : template;

      // Same AI-off fallback as `templateForRender` above: no AI background
      // selected/confirmed yields `metadata: {}`, matching every pre-AI
      // caller's persisted shape (Requirement 11.3).
      const metadata =
        backgroundSource === "ai" && aiBackground
          ? {
              aiBackgroundId: aiBackground.backgroundId,
              stylePreset: aiBackground.stylePreset,
              promptText: aiBackground.promptText,
            }
          : {};

      // Preset registry + Custom_Templates that match this batch's
      // creative type — used to resolve a per-entity template override id
      // to a `CreativeTemplate` object. Computed once per run because
      // neither the registry nor `page_config.customCreativeTemplates`
      // changes mid-run.
      const templateRegistry = templatesFor(batchType);
      const customTemplates = (eventPageConfig.customCreativeTemplates ?? []).filter(
        (t) => t.type === batchType
      );

      // Resolves `entity` → the `CreativeTemplate` to use, applying the
      // per-entity template override precedence (Requirement 10.3 / Task
      // 13.2). Falls back to the batch's default template when no override
      // is stored. The AI-background splice still applies to whichever
      // template is chosen — the batch reuses the same AI background
      // across every entity per the AI_Backgrounds spec's contract.
      const resolvePerEntityTemplate = (entity: BatchEntity): CreativeTemplate => {
        const effectiveId = readEffectiveTemplateId(eventPageConfig, entity.id, batchType);
        if (!effectiveId || effectiveId === templateId) {
          return templateForRender;
        }
        const builtIn = templateRegistry.find((t) => t.id === effectiveId);
        const overrideTemplate: CreativeTemplate | undefined =
          builtIn ??
          (customTemplates.find((t) => t.id === effectiveId) as unknown as
            | CreativeTemplate
            | undefined);
        if (!overrideTemplate) {
          logger.warn("batch creative per-entity template not found, falling back to batch default", {
            event_id: eventId,
            entity_id: entity.id,
            template_id: effectiveId,
          });
          return templateForRender;
        }
        // Splice AI background into the override too, so a batch running
        // with AI background source reuses the same generated image on
        // every entity regardless of which template they use.
        return backgroundSource === "ai" && aiBackground
          ? {
              ...overrideTemplate,
              background: { type: "image", url: aiBackground.assetUrl, fit: "cover" },
            }
          : overrideTemplate;
      };

      // Per-entity render pipeline (Task 13.2). Every stage is the same
      // pure code path the single-creative dialog uses (Task 12.2), which
      // is how Property 49 (Preview_Parity) is a structural guarantee:
      //   1. resolveEffective — apply Resolution_Precedence
      //   2. buildXPlan       — pure base plan
      //   3. decoratePlanWithCustomization — additive customization pass
      //   4. drawPlan + canvas.toBlob — export to PNG
      const render = async (entity: BatchEntity, format: PlatformFormat): Promise<Blob> => {
        const baseTemplate = resolvePerEntityTemplate(entity);
        const effective = resolveEffective({
          baseTemplate,
          baseTheme: theme,
          config: customization,
          brandKit: appliedBrandKit,
          orgLogoUrl: org?.logo_url ?? undefined,
        });

        const basePlan =
          batchType === "speaker"
            ? buildSpeakerPlan(entity as SpeakerLike, effective.template, format, effective.theme)
            : buildSponsorPlan(entity as SponsorLike, effective.template, format, effective.theme);

        const decoratedPlan = decoratePlanWithCustomization(basePlan, customization, {
          effectiveFontFamily: effective.effectiveFontFamily,
          effectiveWatermarkLogoUrl: effective.effectiveWatermarkLogoUrl,
        });

        const canvas = document.createElement("canvas");
        canvas.width = format.width;
        canvas.height = format.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          throw new Error("Could not get 2D canvas context");
        }
        await drawPlan(ctx, decoratedPlan);

        return new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error("canvas.toBlob returned null — PNG export failed"));
          }, "image/png");
        });
      };

      const results = await runBatch(entities, formatsList, render, (completed, total) =>
        setProgress({ completed, total })
      );
      setOutcomes(results);

      // Persist every successful render. Each outcome gets its own try/catch
      // so a persistence failure for one never blocks persisting the others
      // — the render step's fault isolation (Requirement 6.5) already
      // happened inside runBatch; this is a secondary, logged-only concern.
      //
      // Task 13.2 — persist the effective `template_id` per row (the
      // per-entity override wins over the batch default) and the shared
      // `customization` config with `appliedBrandKitId` baked in. The
      // `customization` state already carries `appliedBrandKitId` because
      // `CustomizationPanel.BrandKitSection.onApply` writes it into the
      // config alongside firing `onApplyBrandKit`.
      for (const outcome of results) {
        if (outcome.status !== "success") continue;
        try {
          const { assetUrl, storagePath } = await uploadCreativeAsset(eventId, outcome.filename, outcome.blob);
          const effectiveTemplateId =
            readEffectiveTemplateId(eventPageConfig, outcome.entity.id, batchType) ?? templateId;
          const record = buildCreativeAssetRecord({
            eventId,
            creativeType: batchType,
            speakerId: batchType === "speaker" ? outcome.entity.id : null,
            sponsorId: batchType === "sponsor" ? outcome.entity.id : null,
            templateId: effectiveTemplateId,
            platformFormat: outcome.format.id,
            assetUrl,
            storagePath,
            createdBy,
            metadata,
            customization,
          });
          await insertCreativeAssetRecord(record);
        } catch (err) {
          logger.error("batch creative persistence failed", {
            event_id: eventId,
            entity_id: outcome.entity.id,
            platform_format: outcome.format.id,
            error_message: (err as Error)?.message ?? String(err),
          });
        }
      }

      const succeeded = results.filter((o) => o.status === "success").length;
      const failed = results.length - succeeded;
      if (failed === 0) {
        toast.success("Batch complete", {
          description: `${succeeded} creative${succeeded === 1 ? "" : "s"} generated.`,
        });
      } else {
        toast.warning("Batch complete with errors", {
          description: `${succeeded} succeeded, ${failed} failed.`,
        });
      }
    } finally {
      setIsRunning(false);
    }
  };

  const handleDownloadZip = async () => {
    if (!outcomes) return;
    try {
      const blob = await buildBatchArchive(outcomes);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${eventId}-creatives-batch.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      toast.error("Failed to build archive", { description: (err as Error).message });
    }
  };

  const entityLabel = batchType === "speaker" ? "speakers" : "sponsors";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl w-[92vw] p-0 gap-0 max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0 space-y-0.5">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Layers className="h-4 w-4" /> Batch generate {batchType === "speaker" ? "speaker" : "sponsor"} creatives
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            Generate a creative for every {batchType} assigned to this event, in one run
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5">
          {/* ENTITIES SUMMARY */}
          <section>
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 block">
              Targets
            </Label>
            {loadingEntities ? (
              <p className="text-[12px] text-muted-foreground py-2">Loading…</p>
            ) : entities.length === 0 ? (
              <p className="text-[12px] text-muted-foreground italic">
                No {entityLabel} assigned to this event yet.
              </p>
            ) : (
              <p className="text-[12px] text-muted-foreground">
                {entities.length} {entityLabel} will be included in this run.
              </p>
            )}
          </section>

          {/* BACKGROUND SOURCE */}
          <section>
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 block">
              Background source
            </Label>
            <RadioGroup
              value={backgroundSource}
              onValueChange={(v) => setBackgroundSource(v as BackgroundSource)}
              className="grid grid-cols-2 gap-2"
            >
              {BACKGROUND_SOURCE_OPTIONS.map((opt) => (
                <label
                  key={opt.v}
                  className={`border rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                    backgroundSource === opt.v ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                  }`}
                >
                  <RadioGroupItem value={opt.v} className="sr-only" />
                  <div className="text-[13px] font-medium leading-tight">{opt.label}</div>
                  <div className="text-[11px] text-muted-foreground leading-tight">{opt.sub}</div>
                </label>
              ))}
            </RadioGroup>
            {backgroundSource === "ai" && (
              <div className="mt-3">
                <AiBackgroundPanel
                  eventId={eventId}
                  eventTitle={eventPageConfig.seo?.metaTitle ?? ""}
                  theme={theme}
                  onBackgroundSelected={setAiBackground}
                />
              </div>
            )}
            <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
              The same AI-generated background is reused across every{" "}
              {batchType === "speaker" ? "speaker" : "sponsor"} in this batch run. To use a different
              background per entity, run the generator individually per entity.
            </p>
          </section>

          {/* TEMPLATE */}
          <section>
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 block">
              Template
            </Label>
            <TemplatePicker type={batchType} value={templateId} onChange={setTemplateId} />
          </section>

          {/* FORMATS */}
          <section>
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 block">
              Platform formats
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {PLATFORM_FORMATS.map((f) => (
                <label
                  key={f.id}
                  className={`flex items-start gap-2 border rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                    selectedFormats.has(f.id) ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                  }`}
                >
                  <Checkbox
                    checked={selectedFormats.has(f.id)}
                    onCheckedChange={() => toggleFormat(f.id)}
                    className="mt-0.5 shrink-0"
                  />
                  <div>
                    <div className="text-[13px] font-medium leading-tight">{f.label}</div>
                    <div className="text-[11px] text-muted-foreground leading-tight">
                      {f.width} × {f.height}px
                    </div>
                  </div>
                </label>
              ))}
            </div>
            {selectedFormats.size === 0 && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Select at least one format to run the batch.
              </p>
            )}
          </section>

          {/* SAVE AS DEFAULT */}
          <section className="border border-border rounded-lg p-3 bg-muted/30">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <Checkbox
                checked={saveAsDefault}
                onCheckedChange={(v) => setSaveAsDefault(!!v)}
                className="mt-0.5 shrink-0"
              />
              <div>
                <div className="text-[12px] font-medium">Save as event default</div>
                <div className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                  Use this template by default for {batchType} creatives on this event.
                </div>
              </div>
            </label>
          </section>

          {/* CUSTOMIZE — shared config across the batch (Task 13.1). The
              `CustomizationPanel` is mounted once and every entity × format
              pair in the run picks up the same `CustomizationConfig`.
              `entityId` is deliberately omitted so the panel's Entity
              Override section stays hidden — batch mode has no single
              entity to target (per Task 7.9's conditional render). */}
          <section>
            <Collapsible open={customizeOpen} onOpenChange={setCustomizeOpen}>
              <CollapsibleTrigger className="w-full flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2.5 hover:bg-muted/50">
                <div className="text-left">
                  <div className="text-[12px] font-medium">Customize</div>
                  <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                    Custom prompts, overlays, watermark, border, brand kit — applied to every {batchType} in this run.
                  </div>
                </div>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform ${
                    customizeOpen ? "rotate-180" : ""
                  }`}
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3">
                <CustomizationPanel
                  config={customization}
                  onChange={setCustomization}
                  template={template}
                  format={previewFormat}
                  event={{ id: eventId }}
                  orgId={org?.id ?? null}
                  creativeType={batchType}
                  pageConfig={eventPageConfig}
                  onSavePageConfig={handleSavePageConfig}
                  onApplyBrandKit={setAppliedBrandKit}
                  appliedBrandKit={appliedBrandKit}
                  hasOrgLogo={Boolean(org?.logo_url)}
                />
              </CollapsibleContent>
            </Collapsible>
          </section>

          {/* PROGRESS */}
          {isRunning && progress && (
            <section className="space-y-1.5">
              <div className="flex items-center justify-between text-[12px]">
                <span className="font-medium">Generating…</span>
                <span className="text-muted-foreground">
                  {progress.completed} of {progress.total} completed
                </span>
              </div>
              <Progress value={progress.total > 0 ? (progress.completed / progress.total) * 100 : 0} />
            </section>
          )}

          {/* RESULTS SUMMARY */}
          {outcomes && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Results</Label>
                <span className="text-[11px] text-muted-foreground">
                  {successCount} succeeded{failedCount > 0 ? `, ${failedCount} failed` : ""}
                </span>
              </div>
              <ul className="border border-border rounded-lg divide-y divide-border max-h-56 overflow-y-auto">
                {sortedOutcomes.map((outcome, i) => (
                  <li
                    key={`${outcome.entity.id}-${outcome.format.id}-${i}`}
                    className="flex items-center gap-2 px-3 py-1.5 text-[12px]"
                  >
                    {outcome.status === "success" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                    )}
                    <span className="font-medium shrink-0">{outcome.entity.name}</span>
                    <span className="text-muted-foreground shrink-0">· {outcome.format.label}</span>
                    {outcome.status === "failed" && (
                      <span className="text-destructive text-[11px] truncate">{outcome.error}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <DialogFooter className="px-5 py-3 border-t border-border bg-muted/30 shrink-0 sm:justify-between gap-2 flex-wrap">
          <span className="text-[12px] text-muted-foreground self-center">
            {selectedFormats.size} format{selectedFormats.size === 1 ? "" : "s"} · {entities.length} {entityLabel}
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>
              {outcomes ? "Close" : "Cancel"}
            </Button>
            {canDownloadZip && (
              <Button size="sm" variant="outline" onClick={handleDownloadZip} className="gap-1.5">
                <Download className="h-3.5 w-3.5" />
                Download all (.zip)
              </Button>
            )}
            <Button size="sm" onClick={handleRun} disabled={!canRun} className="gap-1.5">
              {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Layers className="h-3.5 w-3.5" />}
              {outcomes ? "Run again" : "Run batch"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
