/**
 * Supabase Storage + `event_creatives` table I/O boundary for the
 * Creative_Generator.
 *
 * Mirrors the upload pattern already used by `SpeakerPhotoUploader.tsx` /
 * `SponsorLogoUploader.tsx` (`supabase.storage.from("site-assets").upload(...)`
 * + `.getPublicUrl(...)`), writing rendered creative PNGs under a new
 * `event-creatives/{event_id}/` prefix of the existing `site-assets` bucket
 * (Requirement 9.3 — no new bucket or policy). This module is deliberately
 * separate from the pure rendering modules (`creative-templates.ts`,
 * `creative-renderer.ts`, `creative-batch.ts`): those own template/plan/batch
 * logic and never touch Supabase, while this module owns the actual Storage
 * upload and `event_creatives` insert/read/delete calls.
 *
 * `buildCreativeAssetRecord` is kept pure (no Supabase calls) so its
 * payload-shape guarantees (Property 16) are testable without a network
 * dependency; `uploadCreativeAsset` and `insertCreativeAssetRecord` are the
 * imperative I/O steps that consume its output.
 */

import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/observability";

import type { CreativeType, PlatformFormat } from "./creative-templates";

export interface UploadCreativeAssetResult {
  assetUrl: string;
  storagePath: string;
}

/**
 * Uploads a rendered creative PNG blob to the existing `site-assets` Storage
 * bucket under `event-creatives/{eventId}/` and returns its public URL and
 * storage path. Mirrors the upload pattern used by `SpeakerPhotoUploader` /
 * `SponsorLogoUploader`. Uses `upsert: true` so a retry after a failed
 * `event_creatives` insert (see design.md's Error Handling section) reuses
 * the same storage path instead of orphaning a duplicate file.
 */
export async function uploadCreativeAsset(
  eventId: string,
  filename: string,
  blob: Blob
): Promise<UploadCreativeAssetResult> {
  const path = `event-creatives/${eventId}/${filename}`;
  const { error } = await supabase.storage.from("site-assets").upload(path, blob, {
    cacheControl: "3600",
    upsert: true,
    contentType: "image/png",
  });
  if (error) {
    logger.error("creative upload failed", {
      event_id: eventId,
      storage_path: path,
      error_message: error.message,
    });
    throw error;
  }

  const { data } = supabase.storage.from("site-assets").getPublicUrl(path);
  return { assetUrl: data.publicUrl, storagePath: path };
}

export interface CreativeAssetInput {
  eventId: string;
  creativeType: CreativeType;
  speakerId?: string | null;
  sponsorId?: string | null;
  templateId: string;
  platformFormat: PlatformFormat["id"];
  assetUrl: string;
  storagePath: string;
  createdBy: string;
}

export interface CreativeAssetRecord {
  event_id: string;
  creative_type: CreativeType;
  speaker_id: string | null;
  sponsor_id: string | null;
  template_id: string;
  platform_format: string;
  asset_url: string;
  storage_path: string;
  created_by: string;
}

/**
 * Pure function building the `event_creatives` insert payload from render
 * outputs. Enforces the same speaker_id/sponsor_id-per-creative_type shape
 * as the table's `event_creatives_entity_check` CHECK constraint (speaker →
 * speaker_id set, sponsor_id null; sponsor → sponsor_id set, speaker_id
 * null; combo → both set) so a malformed payload never reaches Supabase.
 * Throws if the input's speaker_id/sponsor_id don't match what
 * `creativeType` requires. Property 16.
 */
export function buildCreativeAssetRecord(input: CreativeAssetInput): CreativeAssetRecord {
  const { creativeType, speakerId, sponsorId } = input;
  if (creativeType === "speaker" && (!speakerId || sponsorId)) {
    throw new Error("Speaker creative records require speaker_id and no sponsor_id.");
  }
  if (creativeType === "sponsor" && (!sponsorId || speakerId)) {
    throw new Error("Sponsor creative records require sponsor_id and no speaker_id.");
  }
  if (creativeType === "combo" && (!speakerId || !sponsorId)) {
    throw new Error("Combo creative records require both speaker_id and sponsor_id.");
  }

  return {
    event_id: input.eventId,
    creative_type: creativeType,
    speaker_id: speakerId ?? null,
    sponsor_id: sponsorId ?? null,
    template_id: input.templateId,
    platform_format: input.platformFormat,
    asset_url: input.assetUrl,
    storage_path: input.storagePath,
    created_by: input.createdBy,
  };
}

/**
 * Inserts a built `CreativeAssetRecord` into `event_creatives`. Logs and
 * rethrows on failure so the caller can surface a retry action to the user
 * (design.md's Error Handling section — the uploaded file isn't orphaned
 * since `uploadCreativeAsset` used `upsert: true`).
 */
export async function insertCreativeAssetRecord(record: CreativeAssetRecord): Promise<void> {
  const { error } = await supabase.from("event_creatives").insert(record);
  if (error) {
    logger.error("creative record insert failed", {
      event_id: record.event_id,
      storage_path: record.storage_path,
      error_message: error.message,
    });
    throw error;
  }
}

export interface EventCreativeRow {
  id: string;
  event_id: string;
  creative_type: string;
  speaker_id: string | null;
  sponsor_id: string | null;
  template_id: string;
  platform_format: string;
  asset_url: string;
  storage_path: string;
  created_by: string;
  created_at: string;
}

/**
 * Fetches an event's Creative_Library rows, ordered most-to-least recently
 * created (Requirement 8.2). Relies on the database `ORDER BY created_at
 * DESC` (backed by the `event_creatives_event_idx` index from the
 * migration) as the primary ordering guarantee; `sortByCreatedAtDesc` below
 * is a defensive client-side re-sort for callers that merge/cache rows from
 * multiple fetches.
 */
export async function fetchEventCreatives(eventId: string): Promise<EventCreativeRow[]> {
  const { data, error } = await supabase
    .from("event_creatives")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });
  if (error) {
    logger.error("creative library fetch failed", {
      event_id: eventId,
      error_message: error.message,
    });
    throw error;
  }
  return data ?? [];
}

/**
 * Pure client-side sort guaranteeing most-recent-first ordering by
 * `created_at`, regardless of the input order — a defensive re-sort so the
 * Creative_Library UI never depends solely on the database query's ORDER BY
 * having been applied upstream (e.g. after client-side merging of cached
 * pages). Does not mutate the input array. Property 17.
 */
export function sortByCreatedAtDesc<T extends { created_at: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export interface DeleteCreativeAssetResult {
  storageDeleted: boolean;
  recordDeleted: boolean;
}

/**
 * Deletes a Creative_Asset: removes its file from `site-assets` Storage AND
 * its `event_creatives` row. Always attempts BOTH steps exactly once — even
 * if the storage delete fails, the record delete is still attempted (and
 * vice versa) — via `Promise.allSettled` (not `Promise.all`), so a
 * transient failure in one step never silently skips the other. Never
 * throws; reports which step(s) succeeded/failed via the returned result so
 * the caller (`CreativeLibrarySection`) can show a precise toast and decide
 * whether to remove the row from local state (Requirement 8.3, design.md's
 * Error Handling section). Property 18.
 */
export async function deleteCreativeAsset(
  assetId: string,
  storagePath: string
): Promise<DeleteCreativeAssetResult> {
  const [storageResult, recordResult] = await Promise.allSettled([
    supabase.storage.from("site-assets").remove([storagePath]),
    supabase.from("event_creatives").delete().eq("id", assetId),
  ]);

  const storageDeleted =
    storageResult.status === "fulfilled" && !storageResult.value.error;
  const recordDeleted =
    recordResult.status === "fulfilled" && !recordResult.value.error;

  if (!storageDeleted) {
    const reason =
      storageResult.status === "rejected"
        ? (storageResult.reason as Error)?.message
        : storageResult.value.error?.message;
    logger.error("creative asset storage delete failed", {
      asset_id: assetId,
      storage_path: storagePath,
      error_message: reason,
    });
  }
  if (!recordDeleted) {
    const reason =
      recordResult.status === "rejected"
        ? (recordResult.reason as Error)?.message
        : recordResult.value.error?.message;
    logger.error("creative asset record delete failed", {
      asset_id: assetId,
      error_message: reason,
    });
  }

  // Partial failure (one step succeeded, the other failed) gets its own
  // summary log so `CreativeLibrarySection` can be diagnosed from logs alone,
  // per design.md's Error Handling section.
  if (storageDeleted !== recordDeleted) {
    logger.error("creative delete partial failure", {
      asset_id: assetId,
      storage_deleted: storageDeleted,
      record_deleted: recordDeleted,
    });
  }

  return { storageDeleted, recordDeleted };
}

/**
 * Pure UI-layer gate for creative generation, batch generation, and
 * Creative_Library access: `true` iff the requester owns the event
 * (`requesterId === ownerId`) or is a platform admin. This predicate is
 * NOT the security boundary — the RLS policies on `event_creatives` and the
 * `site-assets` bucket (see the migration in `022_event_creatives.sql`) are
 * the actual enforcement; this function only prevents the UI from
 * rendering/offering actions a user can't use, giving a clean early
 * denial message before a request would be rejected server-side anyway
 * (Requirement 9.1, 9.2). Property 19.
 */
export function isAuthorizedForEventCreatives(
  ownerId: string,
  requesterId: string,
  isAdmin: boolean
): boolean {
  return requesterId === ownerId || isAdmin;
}
