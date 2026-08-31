import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// ─────────────────────────────────────────────────────────────────────────────
// Shared types
// ─────────────────────────────────────────────────────────────────────────────

export type VenueSelectionStatus =
  | "contacted"
  | "accepted"
  | "declined"
  | "cancelled";

export interface EventVenueSelection {
  id: string;
  event_id: string;
  vendor_id: string;
  org_id: string;
  selected_by: string | null;
  status: VenueSelectionStatus;
  notes: string | null;
  notified_at: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
  vendor: {
    id: string;
    business_name: string;
    tagline: string | null;
    city: string | null;
    country: string | null;
    logo_url: string | null;
    cover_url: string | null;
    rating_avg: number | null;
    rating_count: number;
    verification_status: string | null;
  } | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Select a venue vendor for an event
// ─────────────────────────────────────────────────────────────────────────────

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
 * UNIQUE constraint on (event_id, vendor_id) triggers an upsert. When
 * upserting we deliberately reset the status back to "contacted" (from
 * a previously "cancelled" or "declined" state) so re-picking the same
 * vendor kicks off a fresh request instead of resurrecting a dead row.
 */
export function useSelectVenueVendor() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      eventId,
      vendorId,
      orgId,
      notes,
    }: SelectVenueInput) => {
      if (!user) throw new Error("Not authenticated");

      const { data: selection, error: upsertErr } = await supabase
        .from("event_venue_selections" as never)
        .upsert(
          {
            event_id: eventId,
            vendor_id: vendorId,
            org_id: orgId,
            selected_by: user.id,
            status: "contacted",
            notes: notes ?? null,
            notified_at: new Date().toISOString(),
            responded_at: null,
          } as never,
          { onConflict: "event_id,vendor_id" },
        )
        .select()
        .single();

      if (upsertErr) throw upsertErr;
      const inserted = selection as unknown as EventVenueSelection;

      // Best-effort notification. The row is already saved, so a mail
      // hiccup shouldn't turn the whole mutation red.
      try {
        await supabase.functions.invoke("notify-venue-selection", {
          body: {
            event_id: eventId,
            vendor_id: vendorId,
            selection_id: inserted.id,
          },
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("notify-venue-selection dispatch failed:", err);
      }

      return inserted;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["event", vars.eventId] });
      qc.invalidateQueries({ queryKey: ["event-venue-selection", vars.eventId] });
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Read the current selection for an event
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches the "active" venue selection for an event, if any. Prefers a live
 * (contacted / accepted) row; falls back to the most recent row so the UI
 * can surface "Declined 3 days ago — pick another venue" instead of jumping
 * straight back to the browse grid.
 */
export function useEventVenueSelection(eventId: string | null | undefined) {
  return useQuery({
    queryKey: ["event-venue-selection", eventId],
    queryFn: async (): Promise<EventVenueSelection | null> => {
      if (!eventId) return null;
      const { data, error } = await supabase
        .from("event_venue_selections" as never)
        .select(
          `
            id, event_id, vendor_id, org_id, selected_by, status, notes,
            notified_at, responded_at, created_at, updated_at,
            vendor:vendors (
              id, business_name, tagline, city, country, logo_url, cover_url,
              rating_avg, rating_count, verification_status
            )
          `,
        )
        .eq("event_id", eventId)
        .order("status", { ascending: true }) // 'accepted' < 'contacted' < 'declined' alphabetically
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as EventVenueSelection) ?? null;
    },
    enabled: !!eventId,
    staleTime: 15_000,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Cancel a pending / declined selection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Marks a selection as cancelled so the organizer can pick a different
 * venue. Deliberately does not DELETE the row so the vendor keeps a
 * record of the withdrawn request in their inbox.
 */
export function useCancelVenueSelection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      selectionId,
      eventId,
    }: {
      selectionId: string;
      eventId: string;
    }) => {
      const { error } = await supabase
        .from("event_venue_selections" as never)
        .update({
          status: "cancelled",
        } as never)
        .eq("id", selectionId);
      if (error) throw error;
      return { selectionId, eventId };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({
        queryKey: ["event-venue-selection", data.eventId],
      });
    },
  });
}
