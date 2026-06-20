/**
 * Lazy, debounced server-side search across the organiser's speakers and
 * sponsors rosters.
 *
 * Why this exists
 * ----------------
 * The "Add existing speaker / sponsor" pickers used to receive the entire
 * roster as a prop — `select("*").from("speakers")` returns every row the
 * organiser is allowed to read by RLS. For an org with 5k speakers across
 * multiple events, that's ~5MB of egress per dashboard mount, every time.
 *
 * This hook flips it: the picker fetches at most 50 matched rows from the
 * server when the user types, and nothing else. Initial mount = zero
 * roster fetches. Open the popover with empty input = top-50 by name.
 *
 * Implementation notes
 * --------------------
 * - Debounce 250ms so typing doesn't fire one query per keystroke.
 * - Caches per `(kind, q)` pair via TanStack Query so re-opening the
 *   picker for the same query doesn't refetch.
 * - The query uses ILIKE on name + email + company / website (sponsors).
 *   For org sizes up to ~10k rows per organiser the user_id index
 *   added in migration 015 keeps the scan fast.
 * - `enabled: open` so the hook does nothing until the popover opens.
 */

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SpeakerLite {
  id: string;
  name: string;
  email: string | null;
  bio: string | null;
  photo_url: string | null;
  company: string | null;
  title: string | null;
  designation: string | null;
  first_name: string | null;
  last_name: string | null;
  mobile_country_code: string | null;
  mobile_number: string | null;
  linkedin_url: string | null;
  company_website: string | null;
  company_employee_count: string | null;
  industry: string | null;
}

export interface SponsorLite {
  id: string;
  name: string;
  email: string | null;
  logo_url: string | null;
  website: string | null;
  tier: string;
  tier_label: string | null;
  description: string | null;
}

const DEBOUNCE_MS = 250;
const RESULT_LIMIT = 50;

/**
 * Debounce a string by `ms` milliseconds. Returns the latest value
 * after the user stops changing it.
 */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/**
 * Build a Postgres ILIKE pattern for a free-text query. `%foo%` matches
 * "foo" anywhere; trimming + escaping prevents pattern injection
 * (e.g. user types "%bar%" and gets every row).
 */
function ilikePattern(q: string): string {
  return `%${q.trim().replace(/[%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * Search speakers visible to the signed-in organiser. Returns up to 50
 * rows ordered by name. Empty query returns the first 50 by name.
 *
 * @param query  Free-text search (matched against name, email, company).
 * @param open   When false, the hook stays idle.
 */
export function useOrgSpeakerSearch(query: string, open: boolean) {
  const debounced = useDebounced(query, DEBOUNCE_MS);
  return useQuery<SpeakerLite[]>({
    queryKey: ["org-speaker-search", debounced.trim()],
    enabled: open,
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase.from("speakers").select("*");
      const trimmed = debounced.trim();
      if (trimmed) {
        const pat = ilikePattern(trimmed);
        // Postgres .or() takes a comma-separated filter list. Each
        // filter is `column.op.value`. ILIKE is case-insensitive.
        q = q.or(`name.ilike.${pat},email.ilike.${pat},company.ilike.${pat}`);
      }
      const { data, error } = await q.order("name").limit(RESULT_LIMIT);
      if (error) throw error;
      return (data ?? []) as SpeakerLite[];
    },
  });
}

/**
 * Search sponsors visible to the signed-in organiser. Returns up to 50
 * rows ordered by name. Empty query returns the first 50.
 */
export function useOrgSponsorSearch(query: string, open: boolean) {
  const debounced = useDebounced(query, DEBOUNCE_MS);
  return useQuery<SponsorLite[]>({
    queryKey: ["org-sponsor-search", debounced.trim()],
    enabled: open,
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase.from("sponsors").select("*");
      const trimmed = debounced.trim();
      if (trimmed) {
        const pat = ilikePattern(trimmed);
        q = q.or(`name.ilike.${pat},email.ilike.${pat},website.ilike.${pat}`);
      }
      const { data, error } = await q.order("name").limit(RESULT_LIMIT);
      if (error) throw error;
      return (data ?? []) as SponsorLite[];
    },
  });
}
