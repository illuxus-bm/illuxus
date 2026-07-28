import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface SelectVenueInput {
  eventId: string;
  vendorId: string;
  orgId: string;
  notes?: string;
}

/**
 * Records the organizer's venue pick in `event_venue_selections` and
 * invokes the `notify-venue-selection` edge function which emails the
 * vendor's contact address via SMTP.
 *
 * Idempotent — safe to re-call for the same (event, vendor) pair; the
 * UNIQUE constraint on (event_id, vendor_id) triggers an upsert.
 */
export function useSelectVenueVendor() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ eventId, vendorId, orgId, notes }: SelectVenueInput) => {
      if (!user) throw new Error("Not authenticated");

      // 1. Upsert the selection row
      const { data: selection, error: upsertErr } = await supabase
        .from("event_venue_selections")
        .upsert(
          {
            event_id: eventId,
            vendor_id: vendorId,
            org_id: orgId,
            selected_by: user.id,
            status: "contacted",
            notes: notes ?? null,
            notified_at: new Date().toISOString(),
          },
          { onConflict: "event_id,vendor_id" }
        )
        .select()
        .single();

      if (upsertErr) throw upsertErr;

      // 2. Fire the notification (non-fatal — the selection is already saved)
      try {
        await supabase.functions.invoke("notify-venue-selection", {
          body: {
            event_id: eventId,
            vendor_id: vendorId,
            selection_id: selection.id,
          },
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("notify-venue-selection dispatch failed:", err);
      }

      return selection;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["event", vars.eventId] });
      qc.invalidateQueries({ queryKey: ["event-venue-selection", vars.eventId] });
    },
  });
}
