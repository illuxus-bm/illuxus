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
}

export function useVenueVendors(filters?: {
  city?: string;
  search?: string;
}) {
  return useQuery({
    queryKey: ["venue-vendors", filters?.city ?? "", filters?.search ?? ""],
    queryFn: async (): Promise<VenueVendor[]> => {
      // Vendors that have the "venue" category
      const { data: catRow, error: catErr } = await supabase
        .from("vendor_categories")
        .select("id")
        .eq("slug", "venue")
        .maybeSingle();
      if (catErr) throw catErr;
      if (!catRow) return [];

      const { data: mapRows, error: mapErr } = await supabase
        .from("vendor_category_map")
        .select("vendor_id")
        .eq("category_id", catRow.id);
      if (mapErr) throw mapErr;

      const vendorIds = (mapRows ?? []).map((r) => r.vendor_id);
      if (vendorIds.length === 0) return [];

      let query = supabase
        .from("vendors")
        .select(
          "id, business_name, tagline, bio, city, country, cover_url, logo_url, rating_avg, rating_count, default_currency, notify_email, verification_status"
        )
        .in("id", vendorIds)
        .order("rating_avg", { ascending: false, nullsFirst: false });

      if (filters?.city) {
        query = query.ilike("city", `%${filters.city}%`);
      }
      if (filters?.search) {
        query = query.or(
          `business_name.ilike.%${filters.search}%,tagline.ilike.%${filters.search}%,bio.ilike.%${filters.search}%`
        );
      }

      const { data: vendors, error } = await query;
      if (error) throw error;

      // Fetch owner emails via vendor_members → auth.users join (through a view or RPC).
      // Since we can't join to auth.users directly from PostgREST, we return null
      // and the notification edge function looks up the email at send time.
      return (vendors ?? []).map((v) => ({
        ...v,
        contact_email: null,
      })) as VenueVendor[];
    },
    staleTime: 60_000,
  });
}
