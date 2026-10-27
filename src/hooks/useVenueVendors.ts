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
  /** The venue's own city (migration 108), falling back to the vendor's. */
  city: string | null;
  country: string | null;
  address_line: string | null;
  cover_url: string | null;
  logo_url: string | null;
  rating_avg: number | null;
  rating_count: number;
  default_currency: string;
  notify_email: boolean;
  verification_status: string | null;
  contact_email: string | null;
  /** Cheapest active service offered at this venue (pinned to it or
   *  vendor-wide). Null when there are no priced services. */
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
  /** City name or a full location string ("Bandra West, Mumbai, India").
   *  Matched with `matchesCity`, so either form works. */
  city?: string;
  search?: string;
  /**
   * When set, restrict the result to venues free on every day from
   * `eventDate` to `eventEndDate` (inclusive; end defaults to start).
   * Busy = a manual / booking block in vendor_availability, or another
   * event's accepted selection overlapping the range. Resolved by the
   * `unavailable_venue_ids` RPC (migration 108) because RLS hides other
   * organizations' selections from a direct read.
   */
  eventDate?: string | null;
  eventEndDate?: string | null;
  /** The organizer's own event, so its accepted booking doesn't count as
   *  a clash when they re-open the picker. */
  excludeEventId?: string | null;
}

interface VenueRow {
  id: string;
  vendor_id: string;
  name: string;
  space_type: string | null;
  description: string | null;
  is_active: boolean;
  address_line: string | null;
  city: string | null;
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

interface ServiceRow {
  vendor_id: string;
  venue_id: string | null;
  base_price: number | null;
  unit: string | null;
}

export function useVenueVendors(filters?: Filters) {
  return useQuery({
    queryKey: [
      "venue-vendors",
      filters?.city ?? "",
      filters?.search ?? "",
      filters?.eventDate ?? "",
      filters?.eventEndDate ?? "",
      filters?.excludeEventId ?? "",
    ],
    queryFn: async (): Promise<VenueVendor[]> => {
      // ─── Venues + owning vendor ───────────────────────────────────
      let query = supabase
        .from("venues" as never)
        .select(
          `id, vendor_id, name, space_type, description, is_active,
           address_line, city,
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

      // ─── City ───────────────────────────────────────────────────
      if (filters?.city) {
        const location = filters.city;
        venues = venues.filter((v) =>
          matchesCity(v.city ?? v.vendor?.city ?? null, location),
        );
      }
      if (venues.length === 0) return [];

      // ─── Availability across the whole event range ──────────────
      const start = toDateOnly(filters?.eventDate);
      if (start) {
        const end = toDateOnly(filters?.eventEndDate) ?? start;
        const { data: busy, error: busyErr } = await supabase.rpc(
          "unavailable_venue_ids" as never,
          {
            p_start: start,
            p_end: end < start ? start : end,
            p_exclude_event_id: filters?.excludeEventId ?? null,
          } as never,
        );
        if (busyErr) throw busyErr;
        const busyIds = new Set((busy ?? []) as unknown as string[]);
        venues = venues.filter((v) => !busyIds.has(v.id));
        if (venues.length === 0) return [];
      }
      const venueIds = venues.map((v) => v.id);

      // ─── Cover media ────────────────────────────────────────────
      // One extra fetch to grab every venue's cover photo. Non-cover
      // media is loaded lazily by the detail view.
      const { data: mediaRows } = await supabase
        .from("venue_media" as never)
        .select("venue_id, url, is_cover")
        .in("venue_id", venueIds)
        .eq("is_cover", true);
      const coverByVenueId = new Map<string, string>();
      for (const m of (mediaRows ?? []) as Array<{ venue_id: string; url: string }>) {
        if (!coverByVenueId.has(m.venue_id)) {
          coverByVenueId.set(m.venue_id, m.url);
        }
      }

      // ─── Service pricing per venue (starting price on the card) ──
      // A service counts for a venue when it's pinned to that venue or
      // offered vendor-wide (venue_id null).
      const vendorIds = Array.from(new Set(venues.map((v) => v.vendor_id)));
      const { data: services } = await supabase
        .from("vendor_services" as never)
        .select("vendor_id, venue_id, base_price, unit, is_active")
        .in("vendor_id", vendorIds)
        .eq("is_active", true);
      const serviceRows = (services ?? []) as ServiceRow[];
      const priceIndex = new Map<
        string,
        { min: number | null; unit: string | null; count: number }
      >();
      for (const v of venues) {
        const bucket = { min: null as number | null, unit: null as string | null, count: 0 };
        for (const svc of serviceRows) {
          if (svc.vendor_id !== v.vendor_id) continue;
          if (svc.venue_id && svc.venue_id !== v.id) continue;
          bucket.count += 1;
          // Prices are stored in minor units (paise / cents) by the venue app.
          const price = svc.base_price == null ? 0 : Number(svc.base_price) / 100;
          if (price > 0) {
            if (bucket.min === null || price < bucket.min) {
              bucket.min = price;
              bucket.unit = svc.unit ?? null;
            }
          }
        }
        priceIndex.set(v.id, bucket);
      }

      // ─── Shape into VenueVendor cards ────────────────────────────
      return venues.map<VenueVendor>((v) => {
        const owner = v.vendor;
        const priceInfo = priceIndex.get(v.id);
        const cap = pickMaxCapacity(v);
        return {
          id: v.id,
          business_name: v.name,
          tagline: v.description
            ? v.description.slice(0, 140)
            : null,
          bio: v.description ?? null,
          city: v.city ?? owner?.city ?? null,
          country: owner?.country ?? null,
          address_line: v.address_line,
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

// ─── City matching ──────────────────────────────────────────────────
//
// Organizers type locations freely ("Bandra West, Mumbai", "New Delhi,
// India", "Bangalore") while venues store a bare city. A venue matches
// when its city appears in the location text or the other way round,
// after folding common alternate names onto one spelling.

const CITY_ALIASES: Record<string, string> = {
  bombay: "mumbai",
  "new delhi": "delhi",
  bangalore: "bengaluru",
  calcutta: "kolkata",
  madras: "chennai",
  gurgaon: "gurugram",
  poona: "pune",
  baroda: "vadodara",
  trivandrum: "thiruvananthapuram",
  cochin: "kochi",
};

function normaliseCityText(text: string): string {
  let t = ` ${text.toLowerCase().replace(/[^a-z]+/g, " ").trim()} `;
  for (const [alias, canonical] of Object.entries(CITY_ALIASES)) {
    t = t.split(` ${alias} `).join(` ${canonical} `);
  }
  return t;
}

/** True when `venueCity` is the city named in `location` (or vice versa).
 *  Whole-word match, so "Pune" doesn't match "Punjab". */
export function matchesCity(venueCity: string | null, location: string): boolean {
  if (!venueCity) return false;
  const city = normaliseCityText(venueCity);
  const loc = normaliseCityText(location);
  if (city.trim() === "" || loc.trim() === "") return false;
  return loc.includes(city) || city.includes(loc);
}

/** Picks the city out of a free-text event location, given the cities
 *  venues are listed in. Longest match wins so "Navi Mumbai" beats
 *  "Mumbai" when both are listed. Null when none appear. */
export function detectCity(
  location: string | null | undefined,
  knownCities: Array<string | null>,
): string | null {
  if (!location) return null;
  let best: string | null = null;
  for (const c of knownCities) {
    if (!c) continue;
    if (matchesCity(c, location) && (best === null || c.length > best.length)) {
      best = c;
    }
  }
  return best;
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
