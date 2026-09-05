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

export interface VenueBookingBrief {
  event_type: string | null;
  event_duration_hours: number | null;
  expected_attendees: number | null;
  seating_capacity: number | null;
  seating_arrangement: string | null;
  needs_pre_function_area: boolean;
  needs_vip_area: boolean;
  needs_additional_rooms: boolean;
  venue_link: string | null;
}

export interface EventVenueSelection extends VenueBookingBrief {
  id: string;
  event_id: string;
  vendor_id: string;
  /** Persisted by migration 036. Null on legacy rows. */
  venue_id: string | null;
  org_id: string;
  selected_by: string | null;
  status: VenueSelectionStatus;
  notes: string | null;
  /** Ids of vendor_services the organizer picked at request time. Empty
   *  array = "no specific services chosen". Persisted by migration 032. */
  selected_service_ids: string[];
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
  /** The specific venue the organizer picked (from `public.venues`).
   *  Optional for backwards compatibility; new picks should always
   *  supply it so the vendor's Inbox shows which space is being
   *  requested. Persisted in `event_venue_selections.venue_id`. */
  venueId?: string;
  orgId: string;
  notes?: string;
  /** Which of the vendor's services the organizer picked. Defaults to []
   *  when the organizer sends a plain "we want this venue" request. */
  selectedServiceIds?: string[];
  /** Optional venue-booking brief captured on the questionnaire step. Any
   *  unset field is treated as null / false on the DB. Fields land in
   *  columns added by migration 035. */
  brief?: Partial<VenueBookingBrief>;
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
      venueId,
      orgId,
      notes,
      selectedServiceIds,
      brief,
    }: SelectVenueInput) => {
      if (!user) throw new Error("Not authenticated");

      const { data: selection, error: upsertErr } = await supabase
        .from("event_venue_selections" as never)
        .upsert(
          {
            event_id: eventId,
            vendor_id: vendorId,
            // venue_id column added by migration 036. Old requests
            // (pre-multi-venue) omitted it; new requests pin the
            // specific venue picked so the vendor knows which of
            // their spaces is being asked for.
            venue_id: venueId ?? null,
            org_id: orgId,
            selected_by: user.id,
            status: "contacted",
            notes: notes ?? null,
            // NOT NULL DEFAULT ARRAY[]::uuid[] on the DB side, but we
            // send an explicit empty array so the upsert doesn't reset
            // a previously-populated value on a re-request unless the
            // organizer picked a different set.
            selected_service_ids: selectedServiceIds ?? [],
            // Brief fields — migration 035. Booleans default to false so
            // an unspecified checkbox reads as "not needed".
            event_type:              brief?.event_type              ?? null,
            event_duration_hours:    brief?.event_duration_hours    ?? null,
            expected_attendees:      brief?.expected_attendees      ?? null,
            seating_capacity:        brief?.seating_capacity        ?? null,
            seating_arrangement:     brief?.seating_arrangement     ?? null,
            needs_pre_function_area: brief?.needs_pre_function_area ?? false,
            needs_vip_area:          brief?.needs_vip_area          ?? false,
            needs_additional_rooms:  brief?.needs_additional_rooms  ?? false,
            venue_link:              brief?.venue_link              ?? null,
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
            id, event_id, vendor_id, venue_id, org_id, selected_by, status, notes,
            selected_service_ids,
            event_type, event_duration_hours, expected_attendees,
            seating_capacity, seating_arrangement,
            needs_pre_function_area, needs_vip_area, needs_additional_rooms,
            venue_link,
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
// Update which services are attached to an existing selection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Overwrites the `selected_service_ids` array on an existing
 * `event_venue_selections` row. Used by the "Edit services" flow after a
 * venue accepts — the organizer can add or remove services from their
 * request without having to withdraw and re-send the whole booking.
 *
 * Does NOT touch status, notified_at, or the vendor's responded_at — this
 * is a metadata amendment, not a re-request. The vendor's next inbox load
 * (or realtime tick from the UPDATE) picks up the new service titles the
 * same way it picked up the initial ones.
 */
export function useUpdateVenueSelectionServices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      selectionId,
      eventId,
      selectedServiceIds,
    }: {
      selectionId: string;
      eventId: string;
      selectedServiceIds: string[];
    }) => {
      const { error } = await supabase
        .from("event_venue_selections" as never)
        .update({ selected_service_ids: selectedServiceIds } as never)
        .eq("id", selectionId);
      if (error) throw error;
      return { selectionId, eventId, selectedServiceIds };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({
        queryKey: ["event-venue-selection", data.eventId],
      });
    },
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
