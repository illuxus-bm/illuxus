import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Deep vendor detail used by the venue picker's "view details" drawer.
 *
 * The organizer sees this before they commit to sending a request — so
 * we surface everything they need to make a call: portfolio images,
 * offered services with their addons (e.g. "with food" / "without food"),
 * and the service areas the vendor delivers to.
 *
 * We deliberately fetch each related table in parallel rather than a
 * single joined query — PostgREST embed syntax works for one-hop but not
 * nested addons, and the query stays readable this way.
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

export interface VendorPortfolioItem {
  id: string;
  url: string;
  caption: string | null;
  media_type: "image" | "video";
  is_cover: boolean;
  sort_order: number;
}

export interface VendorServiceArea {
  id: string;
  city: string;
  country: string;
  radius_km: number | null;
}

export interface VendorDetail {
  id: string;
  business_name: string;
  tagline: string | null;
  bio: string | null;
  website: string | null;
  city: string | null;
  country: string | null;
  logo_url: string | null;
  cover_url: string | null;
  years_experience: number | null;
  response_time_hours: number | null;
  rating_avg: number | null;
  rating_count: number;
  verification_status: string | null;
  default_currency: string;
  portfolio: VendorPortfolioItem[];
  services: VendorService[];
  service_areas: VendorServiceArea[];
}

export function useVenueDetail(vendorId: string | null | undefined) {
  return useQuery({
    queryKey: ["venue-detail", vendorId],
    queryFn: async (): Promise<VendorDetail | null> => {
      if (!vendorId) return null;

      const [
        vendorRes,
        portfolioRes,
        servicesRes,
        addonsRes,
        areasRes,
      ] = await Promise.all([
        supabase
          .from("vendors" as never)
          .select(
            "id, business_name, tagline, bio, website, city, country, logo_url, cover_url, years_experience, response_time_hours, rating_avg, rating_count, verification_status, default_currency",
          )
          .eq("id", vendorId)
          .maybeSingle(),
        supabase
          .from("vendor_portfolio" as never)
          .select("id, url, caption, media_type, is_cover, sort_order")
          .eq("vendor_id", vendorId)
          .order("is_cover", { ascending: false })
          .order("sort_order", { ascending: true }),
        supabase
          .from("vendor_services" as never)
          .select(
            "id, title, description, base_price, currency, unit, duration, is_instant_book, quote_on_request, is_active",
          )
          .eq("vendor_id", vendorId)
          .eq("is_active", true)
          .order("base_price", { ascending: true, nullsFirst: true }),
        // Addons — join by service id after we know which services exist
        Promise.resolve({ data: [] as Array<never>, error: null }),
        supabase
          .from("vendor_service_areas" as never)
          .select("id, city, country, radius_km")
          .eq("vendor_id", vendorId),
      ]);

      const vendor = vendorRes.data as VendorDetail | null;
      if (!vendor) return null;

      const services = (servicesRes.data ?? []) as Array<
        Omit<VendorService, "addons">
      >;
      const serviceIds = services.map((s) => s.id);

      // Second-pass fetch for addons, only when there are services to join to.
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
        addonRows = (addonsFetch.data ?? []) as typeof addonRows;
      }

      // Best-effort silence on the addons placeholder above so the linter
      // doesn't yell about an unused destructured var if the file is
      // extended later.
      void addonsRes;

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

      return {
        ...vendor,
        portfolio: (portfolioRes.data ?? []) as VendorPortfolioItem[],
        service_areas: (areasRes.data ?? []) as VendorServiceArea[],
        services: services.map((s) => ({
          ...s,
          addons: addonsByService.get(s.id) ?? [],
        })),
      };
    },
    enabled: !!vendorId,
    staleTime: 60_000,
  });
}
