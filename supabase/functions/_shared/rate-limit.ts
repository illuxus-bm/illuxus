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
 * `max` uses already happened within `windowMs`. The check and the record are
 * one locked database call (take_rate_limit, migration 077), so concurrent
 * requests can't all get through. If the limiter itself is unavailable it
 * refuses rather than running unlimited.
 */
export async function withinLimit(
  admin: SupabaseClient,
  bucket: string,
  key: string,
  max: number,
  windowMs: number,
): Promise<boolean> {
  const { data, error } = await admin.rpc("take_rate_limit", {
    _bucket: bucket,
    _key_hash: await sha256Hex(key),
    _max: max,
    _window_seconds: Math.max(1, Math.ceil(windowMs / 1000)),
  });
  return !error && data === true;
}
