/**
 * BrochureSectionPage — dashboard entry point for the event brochure.
 *
 * Fetches the event's `page_config` (where the brochure's settings and any
 * customised layout are kept) and shows the brochure studio in the page:
 * settings, live preview, and the button into the full editor.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/observability";
import { normalizeConfig, type EventPageConfig } from "@/components/event/page-form/types";
import BrochureConfiguratorDialog from "@/components/event/brochure/BrochureConfiguratorDialog";

export default function BrochureSectionPage({ eventId }: { eventId: string }) {
  const [config, setConfig] = useState<EventPageConfig | null>(null);

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
    <BrochureConfiguratorDialog
      inline
      open
      onOpenChange={() => undefined}
      eventId={eventId}
      eventPageConfig={config}
      onConfigChange={handleConfigChange}
    />
  );
}
