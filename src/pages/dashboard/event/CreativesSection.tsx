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
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/observability";
import { normalizeConfig, type EventPageConfig } from "@/components/event/page-form/types";
import CreativeLibrarySection from "@/components/event/creatives/CreativeLibrarySection";
import CreativeGeneratorDialog from "@/components/event/creatives/CreativeGeneratorDialog";
import BatchCreativeGeneratorDialog from "@/components/event/creatives/BatchCreativeGeneratorDialog";

export default function CreativesSection({ eventId }: { eventId: string }) {
  const [config, setConfig] = useState<EventPageConfig | null>(null);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [batchSpeakerOpen, setBatchSpeakerOpen] = useState(false);
  const [batchSponsorOpen, setBatchSponsorOpen] = useState(false);
  const [libraryKey, setLibraryKey] = useState(0);

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

  if (!config) {
    return (
      <div className="flex items-center justify-center py-16 text-[13px] text-muted-foreground">
        Loading creatives…
      </div>
    );
  }

  return (
    <>
      <CreativeLibrarySection
        key={libraryKey}
        eventId={eventId}
        onGenerateClick={() => setGeneratorOpen(true)}
        onBatchSpeakerClick={() => setBatchSpeakerOpen(true)}
        onBatchSponsorClick={() => setBatchSponsorOpen(true)}
      />
      <CreativeGeneratorDialog
        open={generatorOpen}
        onOpenChange={closeAndRefresh(setGeneratorOpen)}
        eventId={eventId}
        eventPageConfig={config}
        onConfigChange={handleConfigChange}
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
