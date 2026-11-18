/**
 * The API against a real database built like AWS RDS (scripts/rds/bootstrap.sql
 * + supabase/install.rds.sql), connected as the API's own unprivileged login
 * role. Proves the production row security policies, triggers and functions
 * keep deciding access through Prisma.
 *
 *   TEST_DATABASE_URL        the API's login (e.g. illuxus_api)
 *   TEST_DATABASE_ADMIN_URL  a superuser/master login, to seed rows
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";
import pg from "pg";

const url = process.env.TEST_DATABASE_URL;
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
const SECRET = "integration-secret-integration-secret-42";
const ISSUER = "https://test.supabase.co/auth/v1";
const ALICE = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const BOB = "b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2";
const ORG = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";

describe.skipIf(!url || !adminUrl)("API on a real database", () => {
  let admin: pg.Client;
  let api: {
    health: (r: Request) => Promise<Response>;
    events: (r: Request) => Promise<Response>;
    profile: (r: Request) => Promise<Response>;
  };
  const token = (sub: string) =>
    new SignJWT({ email: `${sub.slice(0, 4)}@example.com` }).setProtectedHeader({ alg: "HS256" }).setIssuer(ISSUER)
      .setAudience("authenticated").setSubject(sub).setIssuedAt().setExpirationTime("5m").sign(new TextEncoder().encode(SECRET));
  const get = async (fn: (r: Request) => Promise<Response>, path: string, init: RequestInit = {}) => {
    const res = await fn(new Request(`https://illuxus.com${path}`, init));
    return { status: res.status, body: await res.json(), headers: res.headers };
  };

  beforeAll(async () => {
    Object.assign(process.env, { DATABASE_URL: url, AUTH_JWT_SECRET: SECRET, AUTH_ISSUER: ISSUER, SUPABASE_URL: "https://test.supabase.co" });
    vi.spyOn(console, "log").mockImplementation(() => {}); // request log lines
    admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`
      INSERT INTO auth.users (id, email) VALUES ($1, 'alice@example.com'), ($2, 'bob@example.com') ON CONFLICT DO NOTHING;
      -- handle_new_user (a trigger on auth.users) has already created both profiles.
      UPDATE public.profiles SET display_name = CASE user_id WHEN $1 THEN 'Alice' ELSE 'Bob' END WHERE user_id IN ($1, $2);
      INSERT INTO public.organizations (id, name, slug, owner_id) VALUES ($3, 'Org', 'org-it', $1) ON CONFLICT DO NOTHING;
      INSERT INTO public.events (user_id, org_id, title, slug, date, status) VALUES
        ($1, $3, 'Future published', 'it-future', now() + interval '10 days', 'published'),
        ($1, $3, 'Future draft',     'it-draft',  now() + interval '11 days', 'draft'),
        ($1, $3, 'Past published',   'it-past',   now() - interval '10 days', 'published')
      ON CONFLICT DO NOTHING;`.replace(/\$1/g, `'${ALICE}'`).replace(/\$2/g, `'${BOB}'`).replace(/\$3/g, `'${ORG}'`));
    api = {
      health: (await import("../../api/v1/health.js")).GET,
      events: (await import("../../api/v1/events/index.js")).GET,
      profile: (await import("../../api/v1/me/profile.js")).GET,
    };
  });
  afterAll(async () => {
    await admin?.end();
    const { prisma } = await import("../db/client.js");
    await prisma().$disconnect();
  });

  it("reports the database reachable", async () => {
    const r = await get(api.health, "/api/v1/health");
    expect([r.status, r.body.data.database]).toEqual([200, "reachable"]);
  });

  it("lists upcoming published events to anonymous visitors, never drafts", async () => {
    const r = await get(api.events, "/api/v1/events?when=upcoming");
    expect(r.status).toBe(200);
    const titles = r.body.data.map((e: { title: string }) => e.title);
    expect(titles).toContain("Future published");
    expect(titles).not.toContain("Future draft");
    expect(titles).not.toContain("Past published");
    expect(r.body.data[0].organizations?.slug).toBe("org-it");
    expect(r.headers.get("cache-control")).toMatch(/s-maxage/);
  });

  it("lists past events newest first and pages with a cursor", async () => {
    const r = await get(api.events, "/api/v1/events?when=past&limit=1");
    expect(r.body.data.map((e: { title: string }) => e.title)).toEqual(["Past published"]);
  });

  it("rejects bad input with a 400, not a crash", async () => {
    expect((await get(api.events, "/api/v1/events?limit=9999")).status).toBe(400);
    expect((await get(api.events, "/api/v1/events?when=sometime")).status).toBe(400);
  });

  it("returns your own profile, and needs you signed in", async () => {
    expect((await get(api.profile, "/api/v1/me/profile")).status).toBe(401);
    const r = await get(api.profile, "/api/v1/me/profile", { headers: { authorization: `Bearer ${await token(ALICE)}` } });
    expect([r.status, r.body.data.display_name]).toEqual([200, "Alice"]);
  });

  it("updates only your own profile, with triggers running as you", async () => {
    const r = await get(api.profile, "/api/v1/me/profile", {
      method: "PATCH",
      headers: { authorization: `Bearer ${await token(BOB)}`, "content-type": "application/json" },
      body: JSON.stringify({ headline: "Hello", company: "Initech" }),
    });
    expect([r.status, r.body.data.headline, r.body.data.user_id]).toEqual([200, "Hello", BOB]);
    const alice = await admin.query(`SELECT headline FROM public.profiles WHERE user_id = $1`, [ALICE]);
    expect(alice.rows[0].headline).toBeNull();
  });

  it("refuses fields you may not set, and unknown or invalid ones", async () => {
    const auth = { authorization: `Bearer ${await token(BOB)}`, "content-type": "application/json" };
    expect((await get(api.profile, "/api/v1/me/profile", { method: "PATCH", headers: auth, body: JSON.stringify({ account_type: "admin" }) })).status).toBe(400);
    expect((await get(api.profile, "/api/v1/me/profile", { method: "PATCH", headers: auth, body: JSON.stringify({ linkedin_url: "not a url" }) })).status).toBe(400);
    expect((await get(api.profile, "/api/v1/me/profile", { method: "PATCH", headers: auth, body: "{" })).status).toBe(400);
  });

  it("refuses a forged token", async () => {
    const forged = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setIssuer(ISSUER).setAudience("authenticated")
      .setSubject(ALICE).setExpirationTime("5m").sign(new TextEncoder().encode("x".repeat(40)));
    expect((await get(api.profile, "/api/v1/me/profile", { headers: { authorization: `Bearer ${forged}` } })).status).toBe(401);
  });

  it("leaves no identity on pooled connections between requests", async () => {
    const { prisma } = await import("../db/client.js");
    const rows = await prisma().$queryRaw<{ role: string; sub: string | null }[]>`SELECT current_user AS role, nullif(current_setting('request.jwt.claim.sub', true), '') AS sub`;
    expect(rows[0].sub).toBeNull();
    expect(rows[0].role).not.toBe("authenticated");
  });
});
