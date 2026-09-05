import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Full detail read for one venue, backing the marketplace picker's
 * detail drawer + the confirmed-selection card. Fetches:
 *   • the venue row with every column from migration 106
 *   • the owning vendor's identity for the "operated by" line
 *   • the vendor's active `vendor_services` (venue-add-ons the
 *     organizer can pre-select before Send request)
 *   • the venue's media rows, grouped by kind on the client
 *
 * The exported type stays named `VendorDetail` for continuity — every
 * caller thinks it's picking a venue. Field-by-field it's now venue-
 * shaped, with a nested `vendor` object for the owning business.
 */

export interface VendorService {
  id: string;
  title: string;
  description: string | null;
  base_price: number | null;
  currency: string;
  unit: "per_hour" | "per_event" | "per_person" | "per_day" | "flat";
  duration: string | null;
  is_instant_book: boolean;
  quote_on_request: boolean;
  is_active: boolean;
  addons: Array<{
    id: string;
    name: string;
    price: number;
    is_optional: boolean;
  }>;
}

export type VenueMediaKind =
  | "empty_hall"
  | "setup"
  | "facility"
  | "floor_plan"
  | "other";

export interface VenueMedia {
  id: string;
  url: string;
  caption: string | null;
  media_kind: VenueMediaKind;
  is_cover: boolean;
  sort_order: number;
}

export interface VendorDetail {
  // ─── Identity / marketplace card fields ─────────────────────────
  id: string;
  business_name: string;      // venue name (kept for continuity)
  tagline: string | null;     // venue description snippet
  bio: string | null;         // full venue description
  website: string | null;     // owning vendor's website
  city: string | null;        // from vendor
  country: string | null;
  logo_url: string | null;    // vendor logo
  cover_url: string | null;   // venue's cover image
  years_experience: number | null;
  response_time_hours: number | null;
  rating_avg: number | null;
  rating_count: number;
  verification_status: string | null;
  default_currency: string;

  // ─── Venue-specific detail (migration 106) ───────────────────────
  space_type: string | null;
  area_sqft: number | null;
  length_ft: number | null;
  width_ft: number | null;
  ceiling_height_ft: number | null;

  capacity_floating: number | null;
  capacity_theater: number | null;
  capacity_banquet: number | null;
  capacity_ushape: number | null;
  capacity_classroom: number | null;

  climate_control: string | null;
  has_stage: boolean;
  stage_dimensions: string | null;
  green_rooms_count: number | null;

  has_projector: boolean;
  has_screen: boolean;
  has_sound_system: boolean;
  has_microphones: boolean;
  has_power_backup: boolean;
  has_wifi: boolean;

  catering_policy: string | null;
  decor_policy: string | null;
  alcohol_policy: string | null;
  music_curfew_time: string | null;
  noise_restrictions: string | null;

  parking_car_capacity: number | null;
  parking_two_wheeler_capacity: number | null;
  has_valet: boolean;
  wheelchair_accessible: boolean;
  has_elevator: boolean;

  // ─── Related ────────────────────────────────────────────────────
  services: VendorService[];   // vendor-level services
  media: VenueMedia[];         // venue-level media (photos + floor plan)
  vendor: {
    id: string;
    business_name: string;
  };
}

interface RawVenue {
  id: string;
  vendor_id: string;
  name: string;
  space_type: string | null;
  description: string | null;
  area_sqft: number | null;
  length_ft: number | null;
  width_ft: number | null;
  ceiling_height_ft: number | null;
  capacity_floating: number | null;
  capacity_theater: number | null;
  capacity_banquet: number | null;
  capacity_ushape: number | null;
  capacity_classroom: number | null;
  climate_control: string | null;
  has_stage: boolean;
  stage_dimensions: string | null;
  green_rooms_count: number | null;
  has_projector: boolean;
  has_screen: boolean;
  has_sound_system: boolean;
  has_microphones: boolean;
  has_power_backup: boolean;
  has_wifi: boolean;
  catering_policy: string | null;
  decor_policy: string | null;
  alcohol_policy: string | null;
  music_curfew_time: string | null;
  noise_restrictions: string | null;
  parking_car_capacity: number | null;
  parking_two_wheeler_capacity: number | null;
  has_valet: boolean;
  wheelchair_accessible: boolean;
  has_elevator: boolean;
  vendor: {
    id: string;
    business_name: string;
    website: string | null;
    city: string | null;
    country: string | null;
    logo_url: string | null;
    years_experience: number | null;
    response_time_hours: number | null;
    rating_avg: number | null;
    rating_count: number;
    verification_status: string | null;
    default_currency: string;
  } | null;
}

export function useVenueDetail(venueId: string | null | undefined) {
  return useQuery({
    queryKey: ["venue-detail", venueId],
    enabled: !!venueId,
    staleTime: 60_000,
    queryFn: async (): Promise<VendorDetail | null> => {
      if (!venueId) return null;

      const [venueRes, mediaRes] = await Promise.all([
        supabase
          .from("venues" as never)
          .select(
            `id, vendor_id, name, space_type, description,
             area_sqft, length_ft, width_ft, ceiling_height_ft,
             capacity_floating, capacity_theater, capacity_banquet,
             capacity_ushape, capacity_classroom,
             climate_control, has_stage, stage_dimensions, green_rooms_count,
             has_projector, has_screen, has_sound_system, has_microphones,
             has_power_backup, has_wifi,
             catering_policy, decor_policy, alcohol_policy,
             music_curfew_time, noise_restrictions,
             parking_car_capacity, parking_two_wheeler_capacity,
             has_valet, wheelchair_accessible, has_elevator,
             vendor:vendors!inner (
               id, business_name, website, city, country, logo_url,
               years_experience, response_time_hours, rating_avg,
               rating_count, verification_status, default_currency
             )`,
          )
          .eq("id", venueId)
          .maybeSingle(),
        supabase
          .from("venue_media" as never)
          .select("id, url, caption, media_kind, is_cover, sort_order")
          .eq("venue_id", venueId)
          .order("is_cover", { ascending: false })
          .order("sort_order", { ascending: true }),
      ]);

      const raw = venueRes.data as RawVenue | null;
      if (!raw) return null;

      const media = ((mediaRes.data as unknown) ?? []) as VenueMedia[];
      const cover = media.find((m) => m.is_cover);

      // ─── Vendor-level services (still per-vendor; used as add-ons) ─
      const { data: servicesRaw } = await supabase
        .from("vendor_services" as never)
        .select(
          "id, title, description, base_price, currency, unit, duration, is_instant_book, quote_on_request, is_active",
        )
        .eq("vendor_id", raw.vendor_id)
        .eq("is_active", true)
        .order("base_price", { ascending: true, nullsFirst: true });

      const services = ((servicesRaw as unknown) ?? []) as Array<
        Omit<VendorService, "addons">
      >;
      const serviceIds = services.map((s) => s.id);

      let addonRows: Array<{
        id: string;
        service_id: string;
        name: string;
        price: number;
        is_optional: boolean;
      }> = [];
      if (serviceIds.length > 0) {
        const addonsFetch = await supabase
          .from("vendor_service_addons" as never)
          .select("id, service_id, name, price, is_optional")
          .in("service_id", serviceIds);
        addonRows = ((addonsFetch.data as unknown) ?? []) as typeof addonRows;
      }
      const addonsByService = new Map<string, VendorService["addons"]>();
      for (const a of addonRows) {
        const list = addonsByService.get(a.service_id) ?? [];
        list.push({
          id: a.id,
          name: a.name,
          price: a.price,
          is_optional: a.is_optional,
        });
        addonsByService.set(a.service_id, list);
      }

      const owner = raw.vendor;
      return {
        id: raw.id,
        business_name: raw.name,
        tagline: raw.description ? raw.description.slice(0, 140) : null,
        bio: raw.description,
        website: owner?.website ?? null,
        city: owner?.city ?? null,
        country: owner?.country ?? null,
        logo_url: owner?.logo_url ?? null,
        cover_url: cover?.url ?? null,
        years_experience: owner?.years_experience ?? null,
        response_time_hours: owner?.response_time_hours ?? null,
        rating_avg: owner?.rating_avg ?? null,
        rating_count: owner?.rating_count ?? 0,
        verification_status: owner?.verification_status ?? null,
        default_currency: owner?.default_currency ?? "INR",

        space_type: raw.space_type,
        area_sqft: raw.area_sqft,
        length_ft: raw.length_ft,
        width_ft: raw.width_ft,
        ceiling_height_ft: raw.ceiling_height_ft,

        capacity_floating: raw.capacity_floating,
        capacity_theater: raw.capacity_theater,
        capacity_banquet: raw.capacity_banquet,
        capacity_ushape: raw.capacity_ushape,
        capacity_classroom: raw.capacity_classroom,

        climate_control: raw.climate_control,
        has_stage: raw.has_stage,
        stage_dimensions: raw.stage_dimensions,
        green_rooms_count: raw.green_rooms_count,

        has_projector: raw.has_projector,
        has_screen: raw.has_screen,
        has_sound_system: raw.has_sound_system,
        has_microphones: raw.has_microphones,
        has_power_backup: raw.has_power_backup,
        has_wifi: raw.has_wifi,

        catering_policy: raw.catering_policy,
        decor_policy: raw.decor_policy,
        alcohol_policy: raw.alcohol_policy,
        music_curfew_time: raw.music_curfew_time,
        noise_restrictions: raw.noise_restrictions,

        parking_car_capacity: raw.parking_car_capacity,
        parking_two_wheeler_capacity: raw.parking_two_wheeler_capacity,
        has_valet: raw.has_valet,
        wheelchair_accessible: raw.wheelchair_accessible,
        has_elevator: raw.has_elevator,

        services: services.map((s) => ({
          ...s,
          addons: addonsByService.get(s.id) ?? [],
        })),
        media,
        vendor: {
          id: owner?.id ?? raw.vendor_id,
          business_name: owner?.business_name ?? "Unknown vendor",
        },
      };
    },
  });
}
