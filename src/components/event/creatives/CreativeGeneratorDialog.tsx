/**
 * CreativeGeneratorDialog — single-creative flow for the Creative_Generator.
 *
 * Mirrors `PrintBadgesDialog.tsx`'s two-pane layout: a scrollable left pane
 * of settings (a Settings tab with creative type, template, entity,
 * platform formats, "save as default" toggle; a Customize tab hosting the
 * Creative_Customization spec's `CustomizationPanel`) and a right pane
 * hosting the live `CreativePreviewCanvas`.
 *
 * The primary "Generate" action, for each selected `Platform_Format`: (for
 * combo) validates the speaker/sponsor pair is actually linked to the event
 * via `assertComboEligible` ONCE before the format loop (Requirement 4.3),
 * then routes through the explicit `resolveEffective` → `buildXPlan` →
 * `decoratePlanWithCustomization` → `drawPlan` → `canvas.toBlob("image/png")`
 * pipeline so the Customization_Config is applied end-to-end (Property 49 —
 * Preview_Parity). When `customization = {}` (no active customization),
 * the decorator short-circuits and the output stays byte-identical to the
 * base spec's `renderXCreative` convenience wrappers (Property 45 —
 * Additivity_Invariant). The resulting PNG is uploaded to `site-assets`
 * (`uploadCreativeAsset`), an `event_creatives` row is inserted
 * (`buildCreativeAssetRecord` + `insertCreativeAssetRecord`, carrying the
 * persisted `customization` snapshot for Property 47 round-trip), and a
 * browser download is triggered — mirroring `src/lib/ticket-pdf.ts`'s
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
import AiBackgroundPanel, { type AiBackgroundSelection } from "./AiBackgroundPanel";
import CustomizationPanel from "./CustomizationPanel";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOrg } from "@/contexts/OrgContext";

import {
  templatesFor,
  PLATFORM_FORMATS,
  saveCreativeTemplatePref,
  readCreativeTemplatePref,
  readEffectiveTemplateId,
  type CreativeTemplate,
  type CreativeType,
  type EventTheme,
  type PlatformFormat,
  type PlatformFormatId,
} from "@/lib/creatives/creative-templates";
import {
  buildSpeakerPlan,
  buildSponsorPlan,
  buildComboPlan,
  drawPlan,
  assertComboEligible,
  creativeFilename,
  ComboEntityNotLinkedError,
  type RenderPlan,
  type SpeakerLike,
  type SponsorLike,
} from "@/lib/creatives/creative-renderer";
import {
  uploadCreativeAsset,
  buildCreativeAssetRecord,
  insertCreativeAssetRecord,
} from "@/lib/creatives/creative-storage";
import {
  resolveEffective,
  decoratePlanWithCustomization,
  type AppliedBrandKit,
  type CustomCreativeTemplate,
  type CustomizationConfig,
} from "@/lib/creatives/creative-customization";
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

/** Where a Creative's rendered background comes from (Requirement 1.1, 1.4). */
type BackgroundSource = "template" | "ai";

const BACKGROUND_SOURCE_OPTIONS: { v: BackgroundSource; label: string; sub: string }[] = [
  { v: "template", label: "Template", sub: "Use the template's built-in background" },
  { v: "ai", label: "AI-generated", sub: "Generate a bespoke background with AI" },
];

/**
 * Resolves a template id to a `CreativeTemplate` by first checking the
 * built-in registry for the given `CreativeType`, then falling back to any
 * `Custom_Template` persisted on `page_config.customCreativeTemplates`.
 * Returns `undefined` when neither has it — used by the render pipeline to
 * resolve `Entity_Template_Override` (Requirement 10.3). The `customCreativeTemplates`
 * schema is stored as `[key: string]: unknown` to keep the low-level
 * `page-form/types.ts` module independent of the creatives module; casting
 * back to `CreativeTemplate` here is safe because `saveCustomTemplate` writes
 * the full `CreativeTemplate` shape.
 */
function findTemplateById(
  id: string,
  type: CreativeType,
  pageConfig: EventPageConfig,
): CreativeTemplate | undefined {
  const builtin = templatesFor(type).find((t) => t.id === id);
  if (builtin) return builtin;
  const custom = pageConfig.customCreativeTemplates?.find((t) => t.id === id && t.type === type);
  return custom as CreativeTemplate | undefined;
}

/**
 * Renders a decorated `RenderPlan` to a `"image/png"` `Blob`. Mirrors the
 * private `renderPlanToPngBlob` in `creative-renderer.ts` — an off-screen
 * `<canvas>` sized exactly to `plan.format`'s pixel dimensions, drawn via
 * `drawPlan`, exported via `canvas.toBlob("image/png")`. Wrapped locally so
 * the dialog can route through `decoratePlanWithCustomization` before
 * exporting (Property 49 — Preview_Parity), rather than via the base-spec
 * convenience wrappers which take a template + theme + format tuple and
 * skip the decorator.
 */
async function renderDecoratedPlanToBlob(plan: RenderPlan): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = plan.format.width;
  canvas.height = plan.format.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get 2D canvas context");
  await drawPlan(ctx, plan);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("canvas.toBlob returned null — PNG export failed"));
    }, "image/png");
  });
}

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
  const [backgroundSource, setBackgroundSource] = useState<BackgroundSource>("template");
  const [aiBackground, setAiBackground] = useState<AiBackgroundSelection | null>(null);

  const [eventSpeakerIds, setEventSpeakerIds] = useState<Set<string>>(new Set());
  const [eventSponsorIds, setEventSponsorIds] = useState<Set<string>>(new Set());

  // ─── Creative_Customization state (Task 12.1) ─────────────────────────────
  // Local `customization` state fed to `CustomizationPanel` (Requirement
  // 13.1). Default `{}` means every hook point in the plan pipeline
  // short-circuits and the rendered output stays byte-identical to the
  // base spec (Property 45 — Additivity_Invariant). `appliedBrandKit`
  // (Requirement 9) is fed to `resolveEffective` at render time.
  const [customization, setCustomization] = useState<CustomizationConfig>({});
  const [appliedBrandKit, setAppliedBrandKit] = useState<AppliedBrandKit | undefined>(undefined);

  // Event date + timezone, needed by `CustomizationPanel`'s Custom_Prompt_Slot
  // section to pre-populate `eventDate` slots (Requirement 1.7). Fetched
  // once per dialog open — a small denormalized fetch rather than
  // extending the parent's prop surface.
  const [eventMeta, setEventMeta] = useState<{ date: string | null; timezone: string | null }>({
    date: null,
    timezone: null,
  });

  const { org } = useOrg();
  const currentOrgId = org?.id ?? null;
  const organizationLogoUrl = org?.logo_url ?? undefined;

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
    setBackgroundSource("template");
    setAiBackground(null);
    setCustomization({});
    setAppliedBrandKit(undefined);
  }, [open]);

  // Clear any selected AI background whenever the organizer switches back to
  // the template background source, so a stale `aiBackground` never lingers
  // into a template-sourced render (Requirement 1.4).
  useEffect(() => {
    if (backgroundSource === "template") {
      setAiBackground(null);
    }
  }, [backgroundSource]);

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

  // Fetch `events.date` + `events.timezone` on dialog open — used by
  // `CustomizationPanel`'s Custom_Prompt_Slot section to pre-populate
  // `eventDate` slots with the event's own timezone-aware date
  // (Requirement 1.7).
  useEffect(() => {
    if (!open) return;
    let mounted = true;
    supabase
      .from("events")
      .select("date, timezone")
      .eq("id", eventId)
      .single()
      .then(({ data, error }) => {
        if (!mounted) return;
        if (error) {
          logger.error("creative generator event meta fetch failed", {
            event_id: eventId,
            error_message: error.message,
          });
          return;
        }
        setEventMeta({ date: data?.date ?? null, timezone: data?.timezone ?? null });
      });
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
      // orgLogoUrl is passed to `resolveEffective(orgLogoUrl: ...)` at
      // render time (Requirement 6.2) rather than being spliced into
      // the base theme, so the base-spec render path stays byte-identical
      // when no customization is applied.
    }),
    [eventPageConfig.theme?.primaryColor, eventPageConfig.theme?.accentColor]
  );

  const formatsList = useMemo<PlatformFormat[]>(
    () => PLATFORM_FORMATS.filter((f) => selectedFormats.has(f.id)),
    [selectedFormats]
  );
  const previewFormat: PlatformFormat = formatsList[0] ?? PLATFORM_FORMATS[0];

  // Identify the "primary" entity for the Creative_Customization panel —
  // used for its Entity_Template_Override section (Requirement 10.1) and
  // as the reset key for `customization` / `appliedBrandKit` (per the
  // task's "avoid stale config carrying between entities" rule). For
  // combo creatives the speaker is the primary entity.
  const primaryEntityId: string | undefined =
    type === "sponsor" ? sponsor?.id : speaker?.id;

  // Reset customization + applied Brand_Kit whenever the entity, primary
  // format, or template changes — avoids a customization crafted for one
  // entity/format/template combo silently applying to the next one. The
  // reset is a no-op on the mount pass since both start at `{} /
  // undefined`.
  useEffect(() => {
    setCustomization({});
    setAppliedBrandKit(undefined);
  }, [primaryEntityId, previewFormat.id, templateId, type]);

  // Entity_Template_Override resolution (Requirement 10.3). Looks up any
  // saved per-entity template preference for `primaryEntityId`, and when
  // present, resolves it to a `CreativeTemplate` reference from either the
  // built-in registry or `page_config.customCreativeTemplates`. When no
  // override exists (or the id no longer resolves to a template), returns
  // `undefined` and `resolveEffective` falls back to the base template
  // selected in the TemplatePicker.
  const entityOverrideTemplate = useMemo<CreativeTemplate | undefined>(() => {
    if (!primaryEntityId) return undefined;
    const overrideId = readEffectiveTemplateId(eventPageConfig, primaryEntityId, type);
    if (!overrideId) return undefined;
    return findTemplateById(overrideId, type, eventPageConfig);
  }, [primaryEntityId, type, eventPageConfig]);

  // Effective render inputs (Property 44 — Resolution_Precedence). Threads
  // the base template, base theme, current customization, applied Brand_Kit,
  // any Entity_Template_Override, and the organization's logo URL through
  // the pure `resolveEffective` helper. The result is fed into both the
  // exported render (`handleGenerate`) and the live preview canvas —
  // Property 49 (Preview_Parity) requires both paths to share this exact
  // resolution.
  const effective = useMemo(
    () =>
      resolveEffective({
        baseTemplate: template,
        baseTheme: theme,
        config: customization,
        brandKit: appliedBrandKit,
        entityOverrideTemplate,
        orgLogoUrl: organizationLogoUrl,
      }),
    [template, theme, customization, appliedBrandKit, entityOverrideTemplate, organizationLogoUrl],
  );

  // Live-preview counterpart of the `templateForRender` splice performed in
  // `handleGenerate` below — keeps the preview pane showing the AI
  // background once selected, not just the exported file. When
  // `aiBackground` is `null` (AI selected but no successful generation yet),
  // this falls back to `effective.template` unchanged (Requirement 9.1, 9.3).
  // The AI background splice happens AFTER `resolveEffective` so the AI
  // background is applied to whichever template ultimately wins (snapshot,
  // entity override, or base).
  const previewTemplate = useMemo<CreativeTemplate>(() => {
    if (backgroundSource === "ai" && aiBackground) {
      return {
        ...effective.template,
        background: { type: "image", url: aiBackground.assetUrl, fit: "cover" },
      };
    }
    return effective.template;
  }, [effective.template, backgroundSource, aiBackground]);

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

      // Whether the effective template came from `customCreativeTemplates`
      // — used at persistence time to bake a `snapshotTemplate` into the
      // Creative's `Customization_Config` so the row keeps rendering
      // identically even after the source Custom_Template is deleted
      // (Requirement 8.10, Property 47 — Customization_Config round-trip).
      const usedCustomTemplate = Boolean(
        eventPageConfig.customCreativeTemplates?.some((t) => t.id === effective.template.id),
      );

      // Bake `appliedBrandKitId` + `snapshotTemplate` into the persisted
      // Customization_Config once, outside the per-format loop — every
      // format share the same customization payload per Creative row.
      const persistedCustomization: CustomizationConfig = { ...customization };
      if (appliedBrandKit) {
        persistedCustomization.appliedBrandKitId = appliedBrandKit.id;
      }
      if (usedCustomTemplate) {
        persistedCustomization.snapshotTemplate = effective.template as CustomCreativeTemplate;
      }

      for (const format of formatsList) {
        try {
          // Splice the AI background URL into an effective-template COPY
          // AFTER `resolveEffective` picks the winning template — never
          // mutates `effective.template` or the static preset registry.
          // When AI was selected but no generation was ever confirmed
          // (`aiBackground` is `null`), this falls back to
          // `effective.template` unchanged, so the export still succeeds
          // using the template's original background (Requirement 9.1,
          // 9.3).
          const templateForRender: CreativeTemplate =
            backgroundSource === "ai" && aiBackground
              ? {
                  ...effective.template,
                  background: { type: "image", url: aiBackground.assetUrl, fit: "cover" },
                }
              : effective.template;

          // Explicit `buildXPlan` + `decoratePlanWithCustomization` +
          // `drawPlan` + `canvas.toBlob` pipeline — replaces the
          // base-spec `renderXCreative` convenience wrappers so the
          // Customization_Config is routed through the decorator
          // (Property 49 — Preview_Parity). When
          // `customization = {}`, `decoratePlanWithCustomization`
          // short-circuits and the output stays byte-identical to the
          // base spec (Property 45 — Additivity_Invariant).
          let basePlan: RenderPlan;
          if (type === "speaker") {
            if (!speaker) continue;
            basePlan = buildSpeakerPlan(speaker, templateForRender, format, effective.theme);
          } else if (type === "sponsor") {
            if (!sponsor) continue;
            basePlan = buildSponsorPlan(sponsor, templateForRender, format, effective.theme);
          } else {
            if (!speaker || !sponsor) continue;
            basePlan = buildComboPlan(speaker, sponsor, templateForRender, format, effective.theme);
          }
          const decoratedPlan = decoratePlanWithCustomization(basePlan, customization, {
            effectiveFontFamily: effective.effectiveFontFamily,
            effectiveWatermarkLogoUrl: effective.effectiveWatermarkLogoUrl,
          });
          const blob = await renderDecoratedPlanToBlob(decoratedPlan);

          const filename = creativeFilename(entityName, format);
          const { assetUrl, storagePath } = await uploadCreativeAsset(eventId, filename, blob);
          // Same AI-off fallback as `templateForRender` above: no AI
          // background selected/confirmed yields `metadata: {}`, matching
          // every pre-AI caller's persisted shape (Requirement 11.3).
          const metadata =
            backgroundSource === "ai" && aiBackground
              ? {
                  aiBackgroundId: aiBackground.backgroundId,
                  stylePreset: aiBackground.stylePreset,
                  promptText: aiBackground.promptText,
                }
              : {};
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
            metadata,
            customization: persistedCustomization,
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
          {/* LEFT — settings + customization tabs (scrollable) */}
          <div className="flex flex-col md:border-r border-border min-h-0">
            <Tabs defaultValue="settings" className="flex flex-col flex-1 min-h-0">
              <TabsList className="mx-5 mt-4 grid grid-cols-2">
                <TabsTrigger value="settings" className="text-[12px]">
                  Settings
                </TabsTrigger>
                <TabsTrigger value="customize" className="text-[12px]">
                  Customize
                </TabsTrigger>
              </TabsList>
              <TabsContent
                value="settings"
                className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5 mt-0"
              >
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
              </TabsContent>
              <TabsContent
                value="customize"
                className="flex-1 min-h-0 overflow-y-auto px-5 py-4 mt-0"
              >
                <CustomizationPanel
                  config={customization}
                  onChange={setCustomization}
                  template={effective.template}
                  format={previewFormat}
                  event={{ id: eventId, date: eventMeta.date, timezone: eventMeta.timezone }}
                  orgId={currentOrgId}
                  entityId={primaryEntityId}
                  creativeType={type}
                  pageConfig={eventPageConfig}
                  onSavePageConfig={async (next) => {
                    await Promise.resolve(onConfigChange(next));
                  }}
                  onApplyBrandKit={setAppliedBrandKit}
                  appliedBrandKit={appliedBrandKit}
                  hasOrgLogo={Boolean(organizationLogoUrl)}
                />
              </TabsContent>
            </Tabs>
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
                template={previewTemplate}
                format={previewFormat}
                theme={effective.theme}
                speaker={speaker}
                sponsor={sponsor}
                customization={customization}
                effectiveFontFamily={effective.effectiveFontFamily}
                effectiveWatermarkLogoUrl={effective.effectiveWatermarkLogoUrl}
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
