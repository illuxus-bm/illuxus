/**
 * A fixed-window limit on how often something may happen, kept in the
 * `guest_rate_limits` table (service role only). Keys are stored hashed.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Records one use of `bucket`/`key` and returns true, or returns false when
 * `max` uses already happened within `windowMs`. If the limiter itself is
 * unavailable it refuses rather than running unlimited.
 */
export async function withinLimit(
  admin: SupabaseClient,
  bucket: string,
  key: string,
  max: number,
  windowMs: number,
): Promise<boolean> {
  const keyHash = await sha256Hex(key);
  const since = new Date(Date.now() - windowMs).toISOString();
  const { count, error } = await admin
    .from("guest_rate_limits")
    .select("id", { count: "exact", head: true })
    .eq("bucket", bucket).eq("key_hash", keyHash).gte("created_at", since);
  if (error || (count ?? 0) >= max) return false;
  const { error: insertError } = await admin.from("guest_rate_limits").insert({ bucket, key_hash: keyHash });
  return !insertError;
}
