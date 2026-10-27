import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Availability read for the marketplace picker's detail view.
 *
 * Combines two sources of "this vendor is unavailable on date D":
 *   1. `vendor_availability` — rows the vendor (or the confirmed-booking
 *      trigger) inserted with status IN ('booked', 'held').
 *   2. `event_venue_selections` — rows where the vendor already accepted
 *      another organizer's pick for a date near the target.
 *
 * The picker's list-mode already filters vendors that are unavailable on
 * the specific event date. This hook does the reverse: for a single
 * vendor whose card the organizer opened, show *every* nearby busy date
 * so they can gauge how tightly booked the venue is and pick a fallback
 * date if theirs turns out to conflict.
 *
 * `windowDays` controls how far ahead we look — default is a 90-day window
 * anchored on today, extended forward to include the event date if that's
 * further out.
 */

export type AvailabilityReason = "booked" | "held" | "accepted_selection";

export interface VendorBusyDay {
  /** Calendar date, ISO `YYYY-MM-DD`. */
  date: string;
  reason: AvailabilityReason;
  /** Free-text note surfaced from vendor_availability, or the event title
   *  for accepted selections. `null` when there's nothing extra to show. */
  note: string | null;
}

interface Options {
  windowDays?: number;
  /** Limit to one venue of the vendor: whole-business blocks still count,
   *  blocks / selections for the vendor's other venues don't. */
  venueId?: string | null;
  /** Optional ISO datetime — extends the visible window forward so the
   *  picker always shows the event date even when it's beyond the default
   *  90-day horizon. */
  focusDate?: string | null;
}

export function useVendorAvailability(
  vendorId: string | null | undefined,
  { windowDays = 90, focusDate = null, venueId = null }: Options = {},
) {
  return useQuery({
    queryKey: ["vendor-availability", vendorId, venueId ?? "", windowDays, focusDate ?? ""],
    enabled: !!vendorId,
    staleTime: 60_000,
    queryFn: async (): Promise<VendorBusyDay[]> => {
      if (!vendorId) return [];

      const today = toIsoDate(new Date());
      const horizon = extendHorizon(today, windowDays, focusDate);

      // ─── Manual blocks + confirmed booking auto-blocks ───────────────
      let availabilityQuery = supabase
        .from("vendor_availability" as never)
        .select("date, status, note")
        .eq("vendor_id", vendorId)
        .in("status", ["booked", "held"])
        .gte("date", today)
        .lte("date", horizon)
        .order("date", { ascending: true });
      if (venueId) {
        availabilityQuery = availabilityQuery.or(`venue_id.is.null,venue_id.eq.${venueId}`);
      }
      const availabilityRes = await availabilityQuery;

      // ─── Accepted event picks (they lock the calendar even if the
      // vendor didn't manually mark availability). ─────────────────────
      let selectionsQuery = supabase
        .from("event_venue_selections" as never)
        .select("event:events!inner(date, end_date, title)")
        .eq("vendor_id", vendorId)
        .eq("status", "accepted");
      if (venueId) {
        selectionsQuery = selectionsQuery.or(`venue_id.is.null,venue_id.eq.${venueId}`);
      }
      const selectionsRes = await selectionsQuery;

      const busy = new Map<string, VendorBusyDay>();

      for (const row of (availabilityRes.data ?? []) as Array<{
        date: string;
        status: "booked" | "held";
        note: string | null;
      }>) {
        // Manual blocks take precedence over accepted-selection labels
        // because the vendor's own note is more informative.
        busy.set(row.date, {
          date: row.date,
          reason: row.status,
          note: row.note,
        });
      }

      // Multi-day events block every day from start to end.
      for (const row of (selectionsRes.data ?? []) as Array<{
        event: { date: string | null; end_date: string | null; title: string | null } | null;
      }>) {
        const first = toIsoDate(row.event?.date ?? null);
        if (!first) continue;
        const last = toIsoDate(row.event?.end_date ?? null) || first;
        for (const d of eachDay(first, last)) {
          if (d < today || d > horizon) continue;
          if (busy.has(d)) continue; // manual block already covers it
          busy.set(d, {
            date: d,
            reason: "accepted_selection",
            note: row.event?.title ?? null,
          });
        }
      }

      return Array.from(busy.values()).sort((a, b) =>
        a.date.localeCompare(b.date),
      );
    },
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────

function toIsoDate(input: string | Date | null | undefined): string {
  if (!input) return "";
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Every YYYY-MM-DD from `first` to `last` inclusive (capped at a year so a
 *  bad end date can't spin). */
export function eachDay(first: string, last: string): string[] {
  const out: string[] = [];
  const d = new Date(`${first}T00:00:00`);
  const end = new Date(`${(last < first ? first : last)}T00:00:00`);
  while (d <= end && out.length < 366) {
    out.push(toIsoDate(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** Push the window end past `focusDate` (plus a small buffer) so the event
 *  date is always visible regardless of how far out it is. */
function extendHorizon(
  today: string,
  windowDays: number,
  focusDate: string | null,
): string {
  const base = new Date(today);
  base.setDate(base.getDate() + windowDays);
  let horizon = base;

  if (focusDate) {
    const focus = new Date(focusDate);
    if (!Number.isNaN(focus.getTime())) {
      const buffer = new Date(focus);
      buffer.setDate(buffer.getDate() + 14);
      if (buffer > horizon) horizon = buffer;
    }
  }

  return toIsoDate(horizon);
}
