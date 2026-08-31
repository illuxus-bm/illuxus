import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * A venue in the marketplace = a `vendors` row that has been mapped to
 * the "venue" category in `vendor_category_map`. Both apps share the same
 * Supabase project so we query the shared table directly.
 *
 * Columns we surface to the organizer while picking:
 *  - business_name, tagline, bio, city, country
 *  - cover_url, logo_url
 *  - rating_avg, rating_count
 *  - notify_email (used for the outbound notification)
 *  - default_currency (starting price)
 *  - starting_price — cheapest active service, computed client-side so
 *    we can render a Product-Card style "from $X" price on the browse grid
 */

export interface VenueVendor {
  id: string;
  business_name: string;
  tagline: string | null;
  bio: string | null;
  city: string | null;
  country: string | null;
  cover_url: string | null;
  logo_url: string | null;
  rating_avg: number | null;
  rating_count: number;
  default_currency: string;
  notify_email: boolean;
  verification_status: string | null;
  /** Denormalised for display — the vendor's owner email (may be blank) */
  contact_email: string | null;
  /** Cheapest active vendor_services.base_price for this vendor, in the
   *  vendor's default_currency. `null` when the vendor has no active
   *  services or every service is quote-on-request. */
  starting_price: number | null;
  starting_price_unit: string | null;
  /** Number of active services offered by this vendor. */
  service_count: number;
}

interface Filters {
  city?: string;
  search?: string;
  /**
   * When set, restrict the result to vendors that are available on this
   * specific date. Accepts a full ISO timestamp — only the calendar-date
   * portion is used, because vendor_availability is a plain DATE column.
   *
   * A vendor is treated as UNavailable on date D when either:
   *   - vendor_availability has a row with date = D AND status IN ('booked','held')
   *   - event_venue_selections has an ACCEPTED row for that vendor pointing
   *     at another event whose event.date falls on D
   */
  eventDate?: string | null;
}

export function useVenueVendors(filters?: Filters) {
  return useQuery({
    queryKey: [
      "venue-vendors",
      filters?.city ?? "",
      filters?.search ?? "",
      filters?.eventDate ?? "",
    ],
    queryFn: async (): Promise<VenueVendor[]> => {
      // Vendors that have the "venue" category
      const { data: catRow, error: catErr } = await supabase
        .from("vendor_categories" as never)
        .select("id")
        .eq("slug", "venue")
        .maybeSingle();
      if (catErr) throw catErr;
      const category = catRow as { id: string } | null;
      if (!category) return [];

      const { data: mapRows, error: mapErr } = await supabase
        .from("vendor_category_map" as never)
        .select("vendor_id")
        .eq("category_id", category.id);
      if (mapErr) throw mapErr;

      const vendorIds = ((mapRows ?? []) as Array<{ vendor_id: string }>).map(
        (r) => r.vendor_id,
      );
      if (vendorIds.length === 0) return [];

      // ─── Availability filter ────────────────────────────────────────────
      // Compute the set of vendor ids that CANNOT take a booking on the
      // requested date, then drop them from the candidate list before we
      // even ask for their profile row. Doing this pre-filter (versus
      // filtering after the SELECT) keeps the round-trips predictable
      // when the marketplace grows.
      let candidateIds = vendorIds;
      const isoDate = toDateOnly(filters?.eventDate);
      if (isoDate) {
        const [busyRes, takenRes] = await Promise.all([
          supabase
            .from("vendor_availability" as never)
            .select("vendor_id, status")
            .in("vendor_id", candidateIds)
            .eq("date", isoDate)
            .in("status", ["booked", "held"]),
          // Any vendor already accepted for another event on the same date
          // is effectively booked — even if the vendor hasn't manually
          // populated vendor_availability yet.
          supabase
            .from("event_venue_selections" as never)
            .select("vendor_id, event:events!inner(date)")
            .in("vendor_id", candidateIds)
            .eq("status", "accepted"),
        ]);

        const unavailable = new Set<string>();
        for (const row of (busyRes.data ?? []) as Array<{ vendor_id: string }>) {
          unavailable.add(row.vendor_id);
        }
        for (const row of (takenRes.data ?? []) as Array<{
          vendor_id: string;
          event: { date: string | null } | null;
        }>) {
          const takenDate = toDateOnly(row.event?.date ?? null);
          if (takenDate === isoDate) unavailable.add(row.vendor_id);
        }
        candidateIds = candidateIds.filter((id) => !unavailable.has(id));
        if (candidateIds.length === 0) return [];
      }

      // ─── Vendor rows ────────────────────────────────────────────────────
      let query = supabase
        .from("vendors" as never)
        .select(
          "id, business_name, tagline, bio, city, country, cover_url, logo_url, rating_avg, rating_count, default_currency, notify_email, verification_status",
        )
        .in("id", candidateIds)
        .order("rating_avg", { ascending: false, nullsFirst: false });

      if (filters?.city) {
        query = query.ilike("city", `%${filters.city}%`);
      }
      if (filters?.search) {
        query = query.or(
          `business_name.ilike.%${filters.search}%,tagline.ilike.%${filters.search}%,bio.ilike.%${filters.search}%`,
        );
      }

      const { data: vendors, error } = await query;
      if (error) throw error;
      const rows = (vendors ?? []) as Array<Omit<VenueVendor, "contact_email" | "starting_price" | "starting_price_unit" | "service_count">>;
      if (rows.length === 0) return [];

      // ─── Starting price & service count ─────────────────────────────────
      // One extra query for all vendors on-screen — pulls every active
      // service, then we bucket-min per vendor in memory. Keeps the vendor
      // list query itself flat, which lets us pipe it through the standard
      // ilike / order builder above.
      const shownIds = rows.map((v) => v.id);
      const { data: services } = await supabase
        .from("vendor_services" as never)
        .select("vendor_id, base_price, unit, quote_on_request, is_active")
        .in("vendor_id", shownIds)
        .eq("is_active", true);

      const priceIndex = new Map<
        string,
        { min: number | null; unit: string | null; count: number }
      >();
      for (const svc of (services ?? []) as Array<{
        vendor_id: string;
        base_price: number | null;
        unit: string | null;
        quote_on_request: boolean;
      }>) {
        const bucket = priceIndex.get(svc.vendor_id) ?? {
          min: null,
          unit: null,
          count: 0,
        };
        bucket.count += 1;
        if (!svc.quote_on_request && typeof svc.base_price === "number" && svc.base_price > 0) {
          if (bucket.min === null || svc.base_price < bucket.min) {
            bucket.min = svc.base_price;
            bucket.unit = svc.unit ?? null;
          }
        }
        priceIndex.set(svc.vendor_id, bucket);
      }

      return rows.map((v) => {
        const info = priceIndex.get(v.id);
        return {
          ...v,
          contact_email: null,
          starting_price: info?.min ?? null,
          starting_price_unit: info?.unit ?? null,
          service_count: info?.count ?? 0,
        };
      });
    },
    staleTime: 60_000,
  });
}

/** Extract the calendar date (YYYY-MM-DD) from an ISO timestamp. Uses the
 *  local timezone deliberately — vendor_availability stores plain dates,
 *  and event.date is displayed in the organizer's local timezone throughout
 *  the app, so we treat them consistently. */
function toDateOnly(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
