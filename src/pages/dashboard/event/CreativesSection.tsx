/**
 * CreativesSection — dashboard entry point composing the Creative_Generator
 * UI (task 14.1): fetches this event's `page_config` (so the generator
 * dialogs can read/write `creativeTemplatePrefs` + theme colors), renders
 * `CreativeLibrarySection` with buttons that open `CreativeGeneratorDialog`
 * and two `BatchCreativeGeneratorDialog` instances (speaker/sponsor), and
 * remounts the library (`libraryKey`) whenever a dialog closes so newly
 * generated creatives show up without a manual "Refresh" click — the
 * refetch-trigger gap called out as deferred work in
 * `CreativeLibrarySection.tsx`'s doc comment.
 *
 * Creative_Customization spec — Task 14.1 mounts `BrandKitLibrary` behind
 * a new "Brand kits" tab alongside "Creatives" and "AI backgrounds"
 * (design.md § BrandKitLibrary). The two pre-existing sections keep their
 * behavior unchanged; the additive tab structure just gates their render.
 * `BrandKitLibrary` is `React.lazy`-loaded so its dialogs/RLS-scoped
 * queries stay out of the initial creatives bundle until the organizer
 * clicks the tab.
 */
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/observability";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { normalizeConfig, type EventPageConfig } from "@/components/event/page-form/types";
import CreativeLibrarySection from "@/components/event/creatives/CreativeLibrarySection";
import CreativeGeneratorDialog from "@/components/event/creatives/CreativeGeneratorDialog";
import BatchCreativeGeneratorDialog from "@/components/event/creatives/BatchCreativeGeneratorDialog";
import AiBackgroundLibrary from "@/components/event/creatives/AiBackgroundLibrary";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { applyAiDraft, type AiCopyDraft } from "@/lib/creatives/creative-ai";
import type { CreativeType } from "@/lib/creatives/creative-templates";

const BrandKitLibraryLazy = lazy(
  () => import("@/components/event/creatives/BrandKitLibrary"),
);

export default function CreativesSection({ eventId }: { eventId: string }) {
  const { user, isAdmin } = useAuth();
  const { org } = useOrg();
  const [config, setConfig] = useState<EventPageConfig | null>(null);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [batchSpeakerOpen, setBatchSpeakerOpen] = useState(false);
  const [batchSponsorOpen, setBatchSponsorOpen] = useState(false);
  const [libraryKey, setLibraryKey] = useState(0);
  // Prefill state for the "Apply AI draft" flow. When set, the
  // CreativeGeneratorDialog opens on the Event_Promo tab with the
  // draft's tagline / CTA / stats already populated. Cleared after the
  // dialog closes so a subsequent "Generate creative" click falls
  // through to the historical defaults.
  const [prefillDraft, setPrefillDraft] = useState<AiCopyDraft | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase
      .from("events")
      .select("page_config")
      .eq("id", eventId)
      .single()
      .then(({ data, error }) => {
        if (!mounted) return;
        if (error) {
          logger.error("creatives section page_config fetch failed", {
            event_id: eventId,
            error_message: error.message,
          });
        }
        setConfig(normalizeConfig(data?.page_config));
      });
    return () => {
      mounted = false;
    };
  }, [eventId]);

  const handleConfigChange = async (next: EventPageConfig) => {
    setConfig(next);
    const { error } = await supabase
      .from("events")
      .update({ page_config: next as never })
      .eq("id", eventId);
    if (error) {
      logger.error("creative template pref save failed", {
        event_id: eventId,
        error_message: error.message,
      });
    }
  };

  // Bump `libraryKey` whenever a dialog just closed (true -> false), so
  // CreativeLibrarySection remounts and refetches after a generate/batch run.
  const closeAndRefresh = (setOpen: (open: boolean) => void) => (open: boolean) => {
    setOpen(open);
    if (!open) setLibraryKey((k) => k + 1);
  };

  // Opens the generator prefilled from an AI-drafted event promo. Marks
  // the draft `applied` optimistically so it drops out of the review
  // banner immediately; if the organizer bails on the dialog without
  // generating, the draft simply won't re-appear (they can always
  // regenerate from the composer). Ignores non-event drafts — the
  // review banner only surfaces event-level drafts today, but the
  // guard keeps future speaker/sponsor drafts from silently
  // mis-routing into the event composer.
  const handleApplyAiDraft = (draft: AiCopyDraft) => {
    if (draft.entity_type !== "event") {
      logger.warn("apply ai draft called with non-event draft", {
        draft_id: draft.id,
        entity_type: draft.entity_type,
      });
      return;
    }
    setPrefillDraft(draft);
    setGeneratorOpen(true);
    void applyAiDraft(draft.id);
  };

  // Memoize the initialEventPromo shape so the dialog's reset useEffect
  // (which lists it in its dep array) only re-fires when the identity
  // truly changes. Without this the object literal would allocate on
  // every parent render and the composer state would reset mid-edit.
  const initialEventPromo = useMemo(
    () =>
      prefillDraft
        ? {
            tagline: prefillDraft.copy.tagline,
            ctaLabel: prefillDraft.copy.ctaLabel,
            stats: prefillDraft.copy.stats ?? [],
          }
        : undefined,
    [prefillDraft],
  );
  const initialType: CreativeType | undefined = prefillDraft ? "event" : undefined;

  const handleGeneratorOpenChange = (open: boolean) => {
    closeAndRefresh(setGeneratorOpen)(open);
    if (!open) setPrefillDraft(null);
  };

  if (!config) {
    return (
      <div className="flex items-center justify-center py-16 text-[13px] text-muted-foreground">
        Loading creatives…
      </div>
    );
  }

  const currentOrgId = org?.id ?? null;
  const isOrgOwner = Boolean(org && user && org.owner_id === user.id);

  return (
    <>
      <Tabs defaultValue="creatives" className="space-y-4">
        <TabsList>
          <TabsTrigger value="creatives">Creatives</TabsTrigger>
          <TabsTrigger value="ai-backgrounds">AI backgrounds</TabsTrigger>
          <TabsTrigger value="brand-kits">Brand kits</TabsTrigger>
        </TabsList>

        <TabsContent value="creatives" className="space-y-4">
          <CreativeLibrarySection
            key={libraryKey}
            eventId={eventId}
            onGenerateClick={() => setGeneratorOpen(true)}
            onBatchSpeakerClick={() => setBatchSpeakerOpen(true)}
            onBatchSponsorClick={() => setBatchSponsorOpen(true)}
            onApplyAiDraft={handleApplyAiDraft}
          />
        </TabsContent>

        <TabsContent value="ai-backgrounds" className="space-y-4">
          <AiBackgroundLibrary eventId={eventId} variant="peer" />
        </TabsContent>

        <TabsContent value="brand-kits" className="space-y-4">
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-16 text-[13px] text-muted-foreground">
                Loading brand kits…
              </div>
            }
          >
            <BrandKitLibraryLazy
              orgId={currentOrgId}
              isOrgOwner={isOrgOwner}
              isAdmin={isAdmin}
              currentUserId={user?.id ?? ""}
            />
          </Suspense>
        </TabsContent>
      </Tabs>

      <CreativeGeneratorDialog
        open={generatorOpen}
        onOpenChange={handleGeneratorOpenChange}
        eventId={eventId}
        eventPageConfig={config}
        onConfigChange={handleConfigChange}
        initialType={initialType}
        initialEventPromo={initialEventPromo}
      />
      <BatchCreativeGeneratorDialog
        open={batchSpeakerOpen}
        onOpenChange={closeAndRefresh(setBatchSpeakerOpen)}
        eventId={eventId}
        batchType="speaker"
        eventPageConfig={config}
        onConfigChange={handleConfigChange}
      />
      <BatchCreativeGeneratorDialog
        open={batchSponsorOpen}
        onOpenChange={closeAndRefresh(setBatchSponsorOpen)}
        eventId={eventId}
        batchType="sponsor"
        eventPageConfig={config}
        onConfigChange={handleConfigChange}
      />
    </>
  );
}
