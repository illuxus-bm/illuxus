import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Marketplace list of venues (physical spaces), one row per
 * `public.venues` (created by illuxus-vendor migration 106).
 *
 * Historically this file returned rows from `vendors` filtered by the
 * `venue` category — one vendor = one venue. That model broke the
 * moment aman's Bizmillennium wanted to list a ballroom AND a terrace
 * AND a poolside space. Now every venue is a first-class row.
 *
 * The exported type stays named `VenueVendor` to avoid touching every
 * call site (the picker, the booking form, etc.). Semantically it's
 * now "a marketplace venue card", not "a vendor".
 */

export interface VenueVendor {
  id: string;
  /** Venue name — what the organizer sees on the card (e.g. "Grand Ballroom"). */
  business_name: string;
  /** Free-text one-liner from the venue's description field. Trimmed
   *  in the card, expanded in the detail view. */
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
  contact_email: string | null;
  /** Cheapest active vendor_services.base_price for the venue's vendor,
   *  kept for continuity with the old marketplace card. Null when the
   *  vendor has no priced services. */
  starting_price: number | null;
  starting_price_unit: string | null;
  service_count: number;

  // ─── New in the venues model (migration 106) ─────────────────────
  /** Space taxonomy — "indoor_hall", "outdoor_lawn", "terrace", etc. */
  space_type: string | null;
  /** Largest capacity across all seating arrangements, with the
   *  matching layout name. Rendered as "Up to 400 · Banquet" on the
   *  card so the organizer can gauge fit at a glance. */
  max_capacity: number | null;
  max_capacity_layout: string | null;
  /** The vendor that owns this venue — needed for the outbound request
   *  (email + vendor_members RLS both key off vendor_id). */
  vendor_id: string;
  vendor_business_name: string;
}

interface Filters {
  city?: string;
  search?: string;
  /**
   * When set, restrict the result to venues whose owning vendor is
   * available on this date. A venue is treated as unavailable when
   * the owning vendor has vendor_availability with status IN
   * ('booked','held') on that date, OR when an accepted
   * event_venue_selections row exists for the venue's vendor on that
   * date.
   */
  eventDate?: string | null;
}

interface VenueRow {
  id: string;
  vendor_id: string;
  name: string;
  space_type: string | null;
  description: string | null;
  is_active: boolean;
  capacity_floating: number | null;
  capacity_theater: number | null;
  capacity_banquet: number | null;
  capacity_ushape: number | null;
  capacity_classroom: number | null;
  vendor: {
    id: string;
    business_name: string;
    city: string | null;
    country: string | null;
    logo_url: string | null;
    rating_avg: number | null;
    rating_count: number;
    default_currency: string;
    notify_email: boolean;
    verification_status: string | null;
  } | null;
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
      // ─── Venues + owning vendor ───────────────────────────────────
      let query = supabase
        .from("venues" as never)
        .select(
          `id, vendor_id, name, space_type, description, is_active,
           capacity_floating, capacity_theater, capacity_banquet,
           capacity_ushape, capacity_classroom,
           vendor:vendors!inner (
             id, business_name, city, country, logo_url,
             rating_avg, rating_count, default_currency,
             notify_email, verification_status
           )`,
        )
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (filters?.search) {
        // Search across the venue's own text fields.
        query = query.or(
          `name.ilike.%${filters.search}%,description.ilike.%${filters.search}%`,
        );
      }

      const { data, error } = (await query) as unknown as {
        data: VenueRow[] | null;
        error: Error | null;
      };
      if (error) throw error;

      let venues = (data ?? []) as VenueRow[];

      // ─── Post-filter by city (search on the joined vendor) ──────
      // PostgREST's `.ilike()` doesn't cross an embedded relation
      // easily, so filter client-side. Small marketplace = cheap.
      if (filters?.city) {
        const needle = filters.city.toLowerCase();
        venues = venues.filter(
          (v) =>
            v.vendor?.city?.toLowerCase().includes(needle) ?? false,
        );
      }
      if (venues.length === 0) return [];

      // ─── Availability filter ────────────────────────────────────
      let filteredIds = venues.map((v) => v.id);
      const isoDate = toDateOnly(filters?.eventDate);
      if (isoDate) {
        const vendorIds = Array.from(
          new Set(venues.map((v) => v.vendor_id)),
        );
        const [busyRes, takenRes] = await Promise.all([
          supabase
            .from("vendor_availability" as never)
            .select("vendor_id, status")
            .in("vendor_id", vendorIds)
            .eq("date", isoDate)
            .in("status", ["booked", "held"]),
          supabase
            .from("event_venue_selections" as never)
            .select("vendor_id, event:events!inner(date)")
            .in("vendor_id", vendorIds)
            .eq("status", "accepted"),
        ]);
        const unavailableVendors = new Set<string>();
        for (const r of (busyRes.data ?? []) as Array<{ vendor_id: string }>) {
          unavailableVendors.add(r.vendor_id);
        }
        for (const r of (takenRes.data ?? []) as Array<{
          vendor_id: string;
          event: { date: string | null } | null;
        }>) {
          if (toDateOnly(r.event?.date ?? null) === isoDate) {
            unavailableVendors.add(r.vendor_id);
          }
        }
        filteredIds = venues
          .filter((v) => !unavailableVendors.has(v.vendor_id))
          .map((v) => v.id);
        if (filteredIds.length === 0) return [];
        venues = venues.filter((v) => filteredIds.includes(v.id));
      }

      // ─── Cover media ────────────────────────────────────────────
      // One extra fetch to grab every venue's cover photo. Non-cover
      // media is loaded lazily by the detail view.
      const { data: mediaRows } = await supabase
        .from("venue_media" as never)
        .select("venue_id, url, is_cover")
        .in("venue_id", filteredIds)
        .eq("is_cover", true);
      const coverByVenueId = new Map<string, string>();
      for (const m of (mediaRows ?? []) as Array<{ venue_id: string; url: string }>) {
        if (!coverByVenueId.has(m.venue_id)) {
          coverByVenueId.set(m.venue_id, m.url);
        }
      }

      // ─── Service pricing per vendor (starting price on the card) ─
      const vendorIds = Array.from(new Set(venues.map((v) => v.vendor_id)));
      const { data: services } = await supabase
        .from("vendor_services" as never)
        .select("vendor_id, base_price, unit, quote_on_request, is_active")
        .in("vendor_id", vendorIds)
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

      // ─── Shape into VenueVendor cards ────────────────────────────
      return venues.map<VenueVendor>((v) => {
        const owner = v.vendor;
        const priceInfo = priceIndex.get(v.vendor_id);
        const cap = pickMaxCapacity(v);
        return {
          id: v.id,
          business_name: v.name,
          tagline: v.description
            ? v.description.slice(0, 140)
            : null,
          bio: v.description ?? null,
          city: owner?.city ?? null,
          country: owner?.country ?? null,
          cover_url: coverByVenueId.get(v.id) ?? null,
          logo_url: owner?.logo_url ?? null,
          rating_avg: owner?.rating_avg ?? null,
          rating_count: owner?.rating_count ?? 0,
          default_currency: owner?.default_currency ?? "INR",
          notify_email: owner?.notify_email ?? true,
          verification_status: owner?.verification_status ?? null,
          contact_email: null,
          starting_price: priceInfo?.min ?? null,
          starting_price_unit: priceInfo?.unit ?? null,
          service_count: priceInfo?.count ?? 0,
          space_type: v.space_type,
          max_capacity: cap?.value ?? null,
          max_capacity_layout: cap?.layout ?? null,
          vendor_id: v.vendor_id,
          vendor_business_name: owner?.business_name ?? "Unknown vendor",
        };
      });
    },
    staleTime: 60_000,
  });
}

// ─── Helpers ────────────────────────────────────────────────────────

function toDateOnly(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function pickMaxCapacity(v: VenueRow): { value: number; layout: string } | null {
  const options: Array<{ value: number | null; layout: string }> = [
    { value: v.capacity_floating, layout: "Floating" },
    { value: v.capacity_theater, layout: "Theater" },
    { value: v.capacity_banquet, layout: "Banquet" },
    { value: v.capacity_ushape, layout: "U-Shape" },
    { value: v.capacity_classroom, layout: "Classroom" },
  ];
  let best: { value: number; layout: string } | null = null;
  for (const o of options) {
    if (o.value != null && (best === null || o.value > best.value)) {
      best = { value: o.value, layout: o.layout };
    }
  }
  return best;
}
