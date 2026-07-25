/**
 * Brand_Kit persistence + pure conversion helpers for the
 * Creative_Customization feature (Requirement 9).
 *
 * A Brand_Kit is an organization-scoped named snapshot of theme fields
 * (`primaryColor`, `accentColor`, `fontFamily`, `logoUrl`,
 * `preferredTemplateIds`, `preferredFormats`) that organizers can apply to
 * a Creative without editing the event's underlying `page_config`. Kits
 * live in the `public.brand_kits` table introduced by migration
 * `025_brand_kits.sql`; the actual authorization boundary is enforced by
 * that migration's four RLS policies (SELECT via `org_members`;
 * INSERT/UPDATE/DELETE via `organizations.owner_id`; both branches
 * additionally allow platform admins). See Property 48.
 *
 * Design split (mirrors `creative-storage.ts`):
 *   - Pure builders (`buildBrandKitRecord`, `readBrandKitSnapshot`) are
 *     kept free of `supabase` imports so they can be exercised in
 *     property tests without a network mock.
 *   - Imperative wrappers (`fetchBrandKits`, `createBrandKit`,
 *     `deleteBrandKit`) never throw: they log via `logger.error` and
 *     return an empty-shape sentinel (`[]` / `null` / `false`) so
 *     `BrandKitLibrary` and `BrandKitPicker` can degrade gracefully.
 */

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { logger } from "@/lib/observability";

import type { AppliedBrandKit } from "./creative-customization";

/**
 * The `snapshot` JSONB payload persisted on `brand_kits.snapshot`. Every
 * field is optional so an organizer may save a partial kit (e.g. just a
 * font + logo) and have the base-spec resolution fall through to the
 * event theme / template defaults for the unset fields (Property 44).
 */
export interface BrandKitSnapshot {
  primaryColor?: string;
  accentColor?: string;
  fontFamily?: string;
  logoUrl?: string;
  preferredTemplateIds?: string[];
  preferredFormats?: string[];
}

/**
 * Row shape of the `brand_kits` table. Sourced from the generated
 * `Database` types so any future migration change automatically flows
 * through call sites, then re-declares the `snapshot` field with the
 * strongly-typed `BrandKitSnapshot` shape (Supabase codegen types the
 * JSONB column as `Json`, which is not useful at the call site).
 */
export type BrandKitRow = Omit<
  Database["public"]["Tables"]["brand_kits"]["Row"],
  "snapshot"
> & {
  snapshot: BrandKitSnapshot;
};

// ─── Pure helpers ──────────────────────────────────────────────────────────

/**
 * Builds the `INSERT INTO brand_kits` payload for a new Brand_Kit. Pure —
 * no Supabase calls. Trims the display name so a stray trailing space
 * doesn't produce two visually-identical kits with different `name`
 * strings.
 */
export function buildBrandKitRecord(input: {
  orgId: string;
  name: string;
  snapshot: BrandKitSnapshot;
  createdBy: string;
}): Omit<BrandKitRow, "id" | "created_at"> {
  return {
    org_id: input.orgId,
    name: input.name.trim(),
    snapshot: { ...input.snapshot },
    created_by: input.createdBy,
  };
}

/**
 * Converts a `BrandKitRow` into the `AppliedBrandKit` shape consumed by
 * `resolveEffective` in `creative-customization.ts`. Pure. Copies fields
 * one-for-one; does not resolve any precedence rules (that is
 * `resolveEffective`'s job).
 */
export function readBrandKitSnapshot(row: BrandKitRow): AppliedBrandKit {
  return {
    id: row.id,
    primaryColor: row.snapshot.primaryColor,
    accentColor: row.snapshot.accentColor,
    fontFamily: row.snapshot.fontFamily,
    logoUrl: row.snapshot.logoUrl,
    preferredTemplateIds: row.snapshot.preferredTemplateIds,
    preferredFormats: row.snapshot.preferredFormats,
  };
}

// ─── Supabase CRUD wrappers ────────────────────────────────────────────────

/**
 * Fetches every Brand_Kit visible to the caller for the given org,
 * ordered most-to-least recently created (Requirement 9.3). Never throws
 * — logs via `logger.error` and returns `[]` on failure, mirroring
 * `fetchEventCreativeBackgrounds`'s convention in `creative-storage.ts`.
 * RLS scopes the returned rows automatically (Property 48).
 */
export async function fetchBrandKits(orgId: string): Promise<BrandKitRow[]> {
  const { data, error } = await supabase
    .from("brand_kits")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  if (error) {
    logger.error("brand kits fetch failed", {
      org_id: orgId,
      error_message: error.message,
    });
    return [];
  }
  return (data ?? []) as BrandKitRow[];
}

/**
 * Inserts a Brand_Kit and returns the persisted row (including the
 * server-assigned `id` and `created_at`). RLS is the actual security
 * boundary (Property 48) — this helper assumes the caller has already
 * gated on org ownership at the UI layer via
 * `isAuthorizedForEventCreatives` or an equivalent client-side check.
 * Logs and returns `null` on failure so `BrandKitLibrary` can surface a
 * toast without a try/catch.
 */
export async function createBrandKit(
  record: Omit<BrandKitRow, "id" | "created_at">
): Promise<BrandKitRow | null> {
  const { data, error } = await supabase
    .from("brand_kits")
    .insert(record)
    .select("*")
    .single();
  if (error) {
    logger.error("brand kit insert failed", {
      org_id: record.org_id,
      error_message: error.message,
    });
    return null;
  }
  return data as BrandKitRow;
}

/**
 * Deletes a Brand_Kit by id. RLS enforces "org owner or platform admin
 * only" (Property 48); a caller without those grants will observe a
 * silent no-op returning `false` because the RLS `USING` clause will
 * filter the row out of the DELETE's scope. Logs and returns `false` on
 * any error.
 */
export async function deleteBrandKit(id: string): Promise<boolean> {
  const { error } = await supabase.from("brand_kits").delete().eq("id", id);
  if (error) {
    logger.error("brand kit delete failed", {
      id,
      error_message: error.message,
    });
    return false;
  }
  return true;
}
