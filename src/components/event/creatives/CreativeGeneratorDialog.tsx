/**
 * CreativeGeneratorDialog — single-creative flow for the Creative_Generator.
 *
 * Mirrors `PrintBadgesDialog.tsx`'s two-pane layout: a scrollable left pane
 * of settings (creative type, template, entity, platform formats, "save as
 * default" toggle) and a right pane hosting the live `CreativePreviewCanvas`.
 *
 * The primary "Generate" action, for each selected `Platform_Format`: (for
 * combo) validates the speaker/sponsor pair is actually linked to the event
 * via `assertComboEligible` ONCE before the format loop (Requirement 4.3),
 * then renders via the matching `renderXCreative` function, uploads the PNG
 * to `site-assets` (`uploadCreativeAsset`), inserts an `event_creatives` row
 * (`buildCreativeAssetRecord` + `insertCreativeAssetRecord`), and triggers a
 * browser download — mirroring `src/lib/ticket-pdf.ts`'s
 * `downloadTicketPdf` object-URL pattern. A failure for one format is
 * toasted and the loop continues to the next format rather than aborting.
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Sparkles, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/observability";
import { useAuth } from "@/contexts/AuthContext";

import TemplatePicker from "./TemplatePicker";
import EntityPicker from "./EntityPicker";
import CreativePreviewCanvas from "./CreativePreviewCanvas";

import {
  templatesFor,
  PLATFORM_FORMATS,
  saveCreativeTemplatePref,
  readCreativeTemplatePref,
  type CreativeTemplate,
  type CreativeType,
  type EventTheme,
  type PlatformFormat,
  type PlatformFormatId,
} from "@/lib/creatives/creative-templates";
import {
  renderSpeakerCreative,
  renderSponsorCreative,
  renderComboCreative,
  assertComboEligible,
  creativeFilename,
  ComboEntityNotLinkedError,
  type SpeakerLike,
  type SponsorLike,
} from "@/lib/creatives/creative-renderer";
import {
  uploadCreativeAsset,
  buildCreativeAssetRecord,
  insertCreativeAssetRecord,
} from "@/lib/creatives/creative-storage";
import type { EventPageConfig } from "@/components/event/page-form/types";

interface CreativeGeneratorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  eventPageConfig: EventPageConfig; // for reading/writing creativeTemplatePrefs and theme colors
  onConfigChange: (config: EventPageConfig) => void; // caller persists via supabase.from("events").update({ page_config })
}

const TYPE_OPTIONS: { v: CreativeType; label: string; sub: string }[] = [
  { v: "speaker", label: "Speaker", sub: "Announce a speaker" },
  { v: "sponsor", label: "Sponsor", sub: "Promote a sponsor" },
  { v: "combo", label: "Combo", sub: "Speaker + sponsor" },
];

export default function CreativeGeneratorDialog({
  open,
  onOpenChange,
  eventId,
  eventPageConfig,
  onConfigChange,
}: CreativeGeneratorDialogProps) {
  const { user } = useAuth();

  const [type, setType] = useState<CreativeType>("speaker");
  const [templateId, setTemplateId] = useState<string>(
    () => readCreativeTemplatePref(eventPageConfig, "speaker") ?? templatesFor("speaker")[0].id
  );
  const [speaker, setSpeaker] = useState<SpeakerLike | null>(null);
  const [sponsor, setSponsor] = useState<SponsorLike | null>(null);
  const [selectedFormats, setSelectedFormats] = useState<Set<PlatformFormatId>>(new Set());
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const [eventSpeakerIds, setEventSpeakerIds] = useState<Set<string>>(new Set());
  const [eventSponsorIds, setEventSponsorIds] = useState<Set<string>>(new Set());

  // Re-initialize template + entity selection whenever the creative type
  // changes, mirroring TemplatePicker's per-type registry switch.
  useEffect(() => {
    setTemplateId(readCreativeTemplatePref(eventPageConfig, type) ?? templatesFor(type)[0].id);
    setSpeaker(null);
    setSponsor(null);
    // Only re-init on `type` change — re-reading eventPageConfig here would
    // clobber an in-progress "save as default" toggle against stale props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  // Reset transient (non-persisted) selections whenever the dialog re-opens.
  useEffect(() => {
    if (!open) return;
    setSelectedFormats(new Set());
    setSaveAsDefault(false);
  }, [open]);

  // Fetch the event's linked speaker/sponsor id sets once per dialog open —
  // used by `assertComboEligible` to validate a Combo_Creative request
  // (Requirement 4.3) without re-querying on every Generate click.
  useEffect(() => {
    if (!open) return;
    let mounted = true;

    async function loadLinkedIds() {
      const [speakerRes, sponsorRes] = await Promise.all([
        supabase.from("event_speakers").select("speaker_id").eq("event_id", eventId),
        supabase.from("event_sponsors").select("sponsor_id").eq("event_id", eventId),
      ]);

      if (speakerRes.error) {
        logger.error("creative generator event speakers fetch failed", {
          event_id: eventId,
          error_message: speakerRes.error.message,
        });
      }
      if (sponsorRes.error) {
        logger.error("creative generator event sponsors fetch failed", {
          event_id: eventId,
          error_message: sponsorRes.error.message,
        });
      }

      if (!mounted) return;
      setEventSpeakerIds(new Set((speakerRes.data ?? []).map((l) => l.speaker_id)));
      setEventSponsorIds(new Set((sponsorRes.data ?? []).map((l) => l.sponsor_id)));
    }

    loadLinkedIds();
    return () => {
      mounted = false;
    };
  }, [open, eventId]);

  const template = useMemo<CreativeTemplate>(() => {
    const templates = templatesFor(type);
    return templates.find((t) => t.id === templateId) ?? templates[0];
  }, [type, templateId]);

  const theme: EventTheme = useMemo(
    () => ({
      primaryColor: eventPageConfig.theme?.primaryColor,
      accentColor: eventPageConfig.theme?.accentColor,
      // orgLogoUrl intentionally left undefined — no org logo source wired
      // up yet; documented gap, not a blocker for this dialog.
    }),
    [eventPageConfig.theme?.primaryColor, eventPageConfig.theme?.accentColor]
  );

  const formatsList = useMemo<PlatformFormat[]>(
    () => PLATFORM_FORMATS.filter((f) => selectedFormats.has(f.id)),
    [selectedFormats]
  );
  const previewFormat: PlatformFormat = formatsList[0] ?? PLATFORM_FORMATS[0];

  const toggleFormat = (id: PlatformFormatId) => {
    setSelectedFormats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canGenerate =
    selectedFormats.size > 0 &&
    (type === "speaker" ? !!speaker : type === "sponsor" ? !!sponsor : !!speaker && !!sponsor);

  const handleGenerate = async () => {
    if (!canGenerate) return;

    const createdBy = user?.id;
    if (!createdBy) {
      toast.error("Cannot generate", { description: "You must be signed in to generate creatives." });
      return;
    }

    setIsGenerating(true);
    try {
      // Persist the "save as default" preference once, before the per-format
      // loop, not once per format.
      if (saveAsDefault) {
        onConfigChange(saveCreativeTemplatePref(eventPageConfig, type, templateId));
      }

      // Combo eligibility is checked ONCE for the whole request — it applies
      // to the pair, not to any individual format — so a rejection here
      // skips the entire format loop rather than being retried per format.
      if (type === "combo") {
        if (!speaker || !sponsor) return;
        try {
          assertComboEligible(speaker.id, sponsor.id, eventSpeakerIds, eventSponsorIds);
        } catch (err) {
          if (err instanceof ComboEntityNotLinkedError) {
            toast.error("Cannot generate", { description: err.message });
            logger.warn("combo creative rejected", {
              event_id: eventId,
              speaker_id: speaker.id,
              sponsor_id: sponsor.id,
              reason: err.message,
            });
            return;
          }
          throw err;
        }
      }

      const entityName =
        type === "speaker"
          ? speaker?.name ?? "speaker"
          : type === "sponsor"
            ? sponsor?.name ?? "sponsor"
            : `${speaker?.name ?? "speaker"}-${sponsor?.name ?? "sponsor"}`;

      for (const format of formatsList) {
        try {
          let blob: Blob;
          if (type === "speaker") {
            if (!speaker) continue;
            blob = await renderSpeakerCreative(speaker, template, format, theme);
          } else if (type === "sponsor") {
            if (!sponsor) continue;
            blob = await renderSponsorCreative(sponsor, template, format, theme);
          } else {
            if (!speaker || !sponsor) continue;
            blob = await renderComboCreative(speaker, sponsor, template, format, theme);
          }

          const filename = creativeFilename(entityName, format);
          const { assetUrl, storagePath } = await uploadCreativeAsset(eventId, filename, blob);
          const record = buildCreativeAssetRecord({
            eventId,
            creativeType: type,
            speakerId: type === "speaker" || type === "combo" ? speaker?.id ?? null : null,
            sponsorId: type === "sponsor" || type === "combo" ? sponsor?.id ?? null : null,
            templateId,
            platformFormat: format.id,
            assetUrl,
            storagePath,
            createdBy,
          });
          await insertCreativeAssetRecord(record);

          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);

          toast.success(`${format.label} ready`, { description: filename });
        } catch (err) {
          toast.error(`Failed to generate ${format.label}`, {
            description: (err as Error).message,
          });
        }
      }
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-6xl w-[96vw] p-0 gap-0 max-h-[94vh] flex flex-col overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0 space-y-0.5">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4" /> Generate creative
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            Create a branded promotional graphic for a speaker or sponsor
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          {/* LEFT — settings (scrollable) */}
          <div className="overflow-y-auto px-5 py-4 space-y-5 md:border-r border-border min-h-0">
            {/* TYPE */}
            <section>
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 block">
                Creative type
              </Label>
              <RadioGroup
                value={type}
                onValueChange={(v) => setType(v as CreativeType)}
                className="grid grid-cols-3 gap-2"
              >
                {TYPE_OPTIONS.map((opt) => (
                  <label
                    key={opt.v}
                    className={`border rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                      type === opt.v ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                    }`}
                  >
                    <RadioGroupItem value={opt.v} className="sr-only" />
                    <div className="text-[13px] font-medium leading-tight">{opt.label}</div>
                    <div className="text-[11px] text-muted-foreground leading-tight">{opt.sub}</div>
                  </label>
                ))}
              </RadioGroup>
            </section>

            {/* TEMPLATE */}
            <section>
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 block">
                Template
              </Label>
              <TemplatePicker type={type} value={templateId} onChange={setTemplateId} />
            </section>

            {/* ENTITY */}
            <section>
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 block">
                {type === "combo" ? "Speaker & sponsor" : type === "speaker" ? "Speaker" : "Sponsor"}
              </Label>
              <EntityPicker
                eventId={eventId}
                mode={type}
                speakerId={speaker?.id ?? null}
                sponsorId={sponsor?.id ?? null}
                onSpeakerChange={setSpeaker}
                onSponsorChange={setSponsor}
              />
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
                  Select at least one format to generate.
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
                    Use this template by default for {type} creatives on this event.
                  </div>
                </div>
              </label>
            </section>
          </div>

          {/* RIGHT — live preview */}
          <div className="flex flex-col bg-muted/20 min-h-0 border-t md:border-t-0 border-border">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-background/60 shrink-0">
              <span className="text-[12px] font-semibold">Live preview</span>
              <span className="text-[11px] text-muted-foreground">
                {previewFormat.label} · {previewFormat.width} × {previewFormat.height}
              </span>
            </div>
            <div className="flex-1 min-h-0 p-4 flex items-center justify-center overflow-hidden">
              <CreativePreviewCanvas
                mode={type}
                template={template}
                format={previewFormat}
                theme={theme}
                speaker={speaker}
                sponsor={sponsor}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="px-5 py-3 border-t border-border bg-muted/30 shrink-0 sm:justify-between gap-2 flex-wrap">
          <span className="text-[12px] text-muted-foreground self-center">
            {selectedFormats.size} format{selectedFormats.size === 1 ? "" : "s"} selected
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleGenerate} disabled={!canGenerate || isGenerating} className="gap-1.5">
              {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Generate
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
