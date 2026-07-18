/**
 * BrochureSectionPage — dashboard entry point for the Brochure_Generator.
 *
 * Mirrors `CreativesSection.tsx`'s role (fetch this event's `page_config` so
 * the configurator dialog can read/write `brochurePrefs` + theme colors,
 * then mount the dialog), simplified since this spec introduces no
 * persisted Brochure_Library (Requirements decision #6 in requirements.md —
 * generation is an on-demand configure → preview → download flow, nothing
 * is saved to Storage or a new table). The page itself is just a launcher
 * card; all the actual configuration UI lives in
 * `BrochureConfiguratorDialog`.
 */
import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/observability";
import { Button } from "@/components/ui/button";
import { normalizeConfig, type EventPageConfig } from "@/components/event/page-form/types";
import BrochureConfiguratorDialog from "@/components/event/brochure/BrochureConfiguratorDialog";

export default function BrochureSectionPage({ eventId }: { eventId: string }) {
  const [config, setConfig] = useState<EventPageConfig | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

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
          logger.error("brochure section page_config fetch failed", {
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
      logger.error("brochure prefs save failed", {
        event_id: eventId,
        error_message: error.message,
      });
    }
  };

  if (!config) {
    return (
      <div className="flex items-center justify-center py-16 text-[13px] text-muted-foreground">
        Loading brochure…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center justify-center gap-3 py-16 border border-dashed border-border rounded-lg text-center">
        <FileText className="h-8 w-8 text-muted-foreground" />
        <div>
          <p className="text-[13px] font-medium">Generate an event brochure</p>
          <p className="text-[12px] text-muted-foreground max-w-md">
            Auto-populate a branded, multi-page PDF from this event's agenda, speakers, sponsors, and
            venue details — pick a theme, reorder sections, and download.
          </p>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)} className="gap-1.5">
          <FileText className="h-3.5 w-3.5" />
          Generate brochure
        </Button>
      </div>
      <BrochureConfiguratorDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        eventId={eventId}
        eventPageConfig={config}
        onConfigChange={handleConfigChange}
      />
    </div>
  );
}
