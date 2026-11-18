// POST /api/v1/jobs/<job>: background work Supabase does inside the database
// (pg_cron, pg_net) that a plain AWS RDS instance may not. Call it every
// minute from a scheduler (EventBridge Scheduler, or a Vercel cron on a plan
// that allows one-minute schedules) with `Authorization: Bearer $CRON_SECRET`.
//
// Off unless DB_JOBS_ENABLED=true: while the database is on Supabase, its own
// pg_cron and pg_net already do this, and running both would send twice.
import { timingSafeEqual } from "node:crypto";
import { runJob, JOBS } from "../../../server/services/jobs.js";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(req: Request): Promise<Response> {
  const job = new URL(req.url).pathname.split("/").filter(Boolean).pop() ?? "";
  if (!authorized(req)) return json(401, { error: { code: "unauthorized", message: "Bad or missing CRON_SECRET" } });
  if (!(job in JOBS)) return json(404, { error: { code: "not_found", message: `No job ${job}` } });
  if (process.env.DB_JOBS_ENABLED !== "true") return json(200, { job, skipped: "DB_JOBS_ENABLED is not true" });
  try {
    return json(200, { job, ...(await runJob(job as keyof typeof JOBS)) });
  } catch (e) {
    // eslint-disable-next-line no-console -- stdout is the function's log sink
    console.error(JSON.stringify({ level: "error", route: `jobs.${job}`, error: String((e as Error)?.message ?? e).slice(0, 500) }));
    return json(500, { error: { code: "internal", message: "Job failed" } });
  }
}

export const GET = handle; // Vercel cron sends GET
export const POST = handle;
