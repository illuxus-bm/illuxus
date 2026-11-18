/**
 * /api/v1/jobs on the RDS-shaped database: the scheduled communications run
 * and the pg_net replacement queue. Set TEST_DATABASE_URL and
 * TEST_DATABASE_ADMIN_URL (see api.db.test.ts).
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";

const url = process.env.TEST_DATABASE_URL;
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
const SECRET = "cron-secret-for-tests-0123456789";

describe.skipIf(!url || !adminUrl)("database jobs", () => {
  let admin: pg.Client;
  let receiver: Server;
  let base = "";
  const received: string[] = [];
  let job: (r: Request) => Promise<Response>;
  const call = async (name: string, secret = SECRET) => {
    const res = await job(new Request(`https://illuxus.com/api/v1/jobs/${name}`, { method: "POST", headers: { authorization: `Bearer ${secret}` } }));
    return { status: res.status, body: await res.json() };
  };

  beforeAll(async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    Object.assign(process.env, { DATABASE_URL: url, CRON_SECRET: SECRET, DB_JOBS_ENABLED: "true", SUPABASE_URL: "https://test.supabase.co" });
    receiver = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        received.push(`${req.url} ${body}`);
        res.statusCode = req.url === "/broken" ? 500 : 200;
        res.end("ok");
      });
    });
    await new Promise<void>((r) => receiver.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}`;
    admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`DELETE FROM net.http_request_queue`);
    job = (await import("../../api/v1/jobs/[job].js")).POST;
  });
  afterAll(async () => {
    await admin?.end();
    await new Promise<void>((r) => receiver.close(() => r()));
    const { prisma } = await import("../db/client.js");
    await prisma().$disconnect();
  });

  it("refuses callers without the cron secret, and unknown jobs", async () => {
    expect((await call("http-queue", "wrong-secret-wrong-secret-00")).status).toBe(401);
    expect((await call("no-such-job")).status).toBe(404);
  });

  it("does nothing unless switched on, so it can't double-send next to Supabase's own pg_cron", async () => {
    process.env.DB_JOBS_ENABLED = "false";
    expect((await call("communications-tick")).body.skipped).toBeTruthy();
    process.env.DB_JOBS_ENABLED = "true";
  });

  it("runs the scheduled communications", async () => {
    const r = await call("communications-tick");
    expect([r.status, r.body.ok]).toEqual([200, true]);
  });

  it("sends calls queued by net.http_post, and retries only the ones that failed", async () => {
    // communications-tick (above) may itself have queued hand-offs; start clean.
    await admin.query(`DELETE FROM net.http_request_queue`);
    // As SQL functions do: through net.http_post, as a signed-in person's transaction would.
    await admin.query(`SET ROLE authenticated; SELECT net.http_post($1, '{"n":1}'::jsonb); SELECT net.http_post($2, '{"n":2}'::jsonb); RESET ROLE;`
      .replace("$1", `'${base}/ok'`).replace("$2", `'${base}/broken'`));
    const first = await call("http-queue");
    expect(first.body).toMatchObject({ claimed: 2, sent: 1, failed: 1 });
    expect(received).toEqual([`/ok {"n":1}`, `/broken {"n":2}`]);
    const second = await call("http-queue");
    expect(second.body).toMatchObject({ claimed: 1, sent: 0, failed: 1 });
    const rows = await admin.query(`SELECT url, sent_at IS NOT NULL AS sent, attempts, last_error FROM net.http_request_queue ORDER BY id`);
    expect(rows.rows.map((r) => [r.url.endsWith("/ok"), r.sent, r.attempts])).toEqual([[true, true, 1], [false, false, 2]]);
    expect(rows.rows[1].last_error).toBe("HTTP 500");
  });
});
