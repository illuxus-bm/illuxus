/**
 * Database background jobs for AWS RDS (api/v1/jobs/[job].ts):
 *
 *   communications-tick  what pg_cron runs every minute on Supabase:
 *                        public.communications_run_scheduled()
 *   http-queue           sends the HTTP calls SQL functions queued with
 *                        net.http_post (scripts/rds/bootstrap.sql turns it
 *                        into a queue on RDS, where pg_net doesn't exist)
 */
import { SERVICE, asCaller } from "../db/caller.js";

const BATCH = 25;
const TIMEOUT_MS = 8_000;

type Queued = { id: bigint; url: string; body: unknown; headers: Record<string, string> | null };

async function communicationsTick() {
  await asCaller(SERVICE, (tx) => tx.$executeRaw`SELECT public.communications_run_scheduled()`, { timeoutMs: 50_000 });
  return { ok: true };
}

/**
 * Claims up to BATCH unsent rows (SKIP LOCKED, so overlapping runs never
 * send the same one), sends each, and marks it sent. A failed send stays
 * unsent and is retried on the next run, after 5 attempts it's left for a
 * person to look at (attempts / last_error).
 */
async function drainHttpQueue() {
  const claimed = await asCaller(SERVICE, (tx) => tx.$queryRaw<Queued[]>`
    UPDATE net.http_request_queue q
       SET attempts = q.attempts + 1, claimed_at = now()
     WHERE q.id IN (
       SELECT id FROM net.http_request_queue
        WHERE sent_at IS NULL AND attempts < 5
          AND (claimed_at IS NULL OR claimed_at < now() - interval '2 minutes')
        ORDER BY id
        LIMIT ${BATCH}
        FOR UPDATE SKIP LOCKED)
    RETURNING q.id, q.url, q.body, q.headers`);

  let sent = 0;
  let failed = 0;
  // Oldest first: UPDATE … RETURNING promises no order.
  claimed.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const row of claimed) {
    let error: string | null = null;
    try {
      const res = await fetch(row.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(row.headers ?? {}) },
        body: JSON.stringify(row.body ?? {}),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) error = `HTTP ${res.status}`;
    } catch (e) {
      error = String((e as Error)?.message ?? e).slice(0, 300);
    }
    await asCaller(SERVICE, (tx) => error
      ? tx.$executeRaw`UPDATE net.http_request_queue SET last_error = ${error}, claimed_at = NULL WHERE id = ${row.id}`
      : tx.$executeRaw`UPDATE net.http_request_queue SET sent_at = now(), last_error = NULL WHERE id = ${row.id}`);
    if (error) failed++;
    else sent++;
  }
  return { claimed: claimed.length, sent, failed };
}

export const JOBS = {
  "communications-tick": communicationsTick,
  "http-queue": drainHttpQueue,
} as const;

export function runJob(name: keyof typeof JOBS) {
  return JOBS[name]();
}
