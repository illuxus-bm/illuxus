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
import { useEffect, useMemo, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Layers, Download, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/observability";
import { useAuth } from "@/contexts/AuthContext";

import TemplatePicker from "./TemplatePicker";

import {
  templatesFor,
  PLATFORM_FORMATS,
  saveCreativeTemplatePref,
  readCreativeTemplatePref,
  type CreativeTemplate,
  type EventTheme,
  type PlatformFormat,
  type PlatformFormatId,
} from "@/lib/creatives/creative-templates";
import {
  renderSpeakerCreative,
  renderSponsorCreative,
  creativeFilename,
  type SpeakerLike,
  type SponsorLike,
} from "@/lib/creatives/creative-renderer";
import { runBatch, buildBatchArchive, type BatchOutcome, type BatchProgress } from "@/lib/creatives/creative-batch";
import {
  uploadCreativeAsset,
  buildCreativeAssetRecord,
  insertCreativeAssetRecord,
} from "@/lib/creatives/creative-storage";
import type { EventPageConfig } from "@/components/event/page-form/types";

type BatchEntity = SpeakerLike | SponsorLike;

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

  const [entities, setEntities] = useState<BatchEntity[]>([]);
  const [loadingEntities, setLoadingEntities] = useState(true);

  const [templateId, setTemplateId] = useState<string>(
    () => readCreativeTemplatePref(eventPageConfig, batchType) ?? templatesFor(batchType)[0].id
  );
  const [selectedFormats, setSelectedFormats] = useState<Set<PlatformFormatId>>(new Set());
  const [saveAsDefault, setSaveAsDefault] = useState(false);

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
    setProgress(null);
    setOutcomes(null);
    // Only re-init on open/batchType change — re-reading eventPageConfig here
    // would clobber an in-progress "save as default" toggle against stale
    // props, matching CreativeGeneratorDialog's rationale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, batchType]);

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

  const formatsList = useMemo<PlatformFormat[]>(
    () => PLATFORM_FORMATS.filter((f) => selectedFormats.has(f.id)),
    [selectedFormats]
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

      const theme: EventTheme = {
        primaryColor: eventPageConfig.theme.primaryColor,
        accentColor: eventPageConfig.theme.accentColor,
      };

      const render = async (entity: BatchEntity, format: PlatformFormat): Promise<Blob> => {
        return batchType === "speaker"
          ? renderSpeakerCreative(entity as SpeakerLike, template, format, theme)
          : renderSponsorCreative(entity as SponsorLike, template, format, theme);
      };

      const results = await runBatch(entities, formatsList, render, (completed, total) =>
        setProgress({ completed, total })
      );
      setOutcomes(results);

      // Persist every successful render. Each outcome gets its own try/catch
      // so a persistence failure for one never blocks persisting the others
      // — the render step's fault isolation (Requirement 6.5) already
      // happened inside runBatch; this is a secondary, logged-only concern.
      for (const outcome of results) {
        if (outcome.status !== "success") continue;
        try {
          const { assetUrl, storagePath } = await uploadCreativeAsset(eventId, outcome.filename, outcome.blob);
          const record = buildCreativeAssetRecord({
            eventId,
            creativeType: batchType,
            speakerId: batchType === "speaker" ? outcome.entity.id : null,
            sponsorId: batchType === "sponsor" ? outcome.entity.id : null,
            templateId,
            platformFormat: outcome.format.id,
            assetUrl,
            storagePath,
            createdBy,
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
