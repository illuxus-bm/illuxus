/**
 * Parity: the same supabase-js query chains, sent to real PostgREST (what
 * Supabase runs) and to /api/v1/query, against the same database and as the
 * same people, must return the same data, errors and counts.
 *
 * Runs when POSTGREST_URL is set (CI's prisma job runs the official
 * PostgREST image against the RDS-shaped database), plus TEST_DATABASE_URL
 * and TEST_DATABASE_ADMIN_URL.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PostgrestClient } from "@supabase/postgrest-js";
import { SignJWT } from "jose";
import pg from "pg";

const postgrestUrl = process.env.POSTGREST_URL;
const url = process.env.TEST_DATABASE_URL;
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
const SECRET = process.env.TEST_JWT_SECRET ?? "integration-secret-integration-secret-42";
const ISSUER = "https://test.supabase.co/auth/v1";
const OWNER = "a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7";
const ORG = "b8b8b8b8-b8b8-4b8b-8b8b-b8b8b8b8b8b8";

type Op = { m: string; a: unknown[] };
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a chain applied to two different builder types
type AnyBuilder = any;

/** Records a chain for /api/v1/query. */
function recorder(): { ops: Op[]; proxy: AnyBuilder } {
  const ops: Op[] = [];
  const proxy: AnyBuilder = new Proxy({}, { get: (_t, m: string) => (...a: unknown[]) => { ops.push({ m, a }); return proxy; } });
  return { ops, proxy };
}

const CASES: [string, string, (q: AnyBuilder) => AnyBuilder][] = [
  ["star with order and limit", "events", (q) => q.select("*").eq("org_id", ORG).order("date").limit(3)],
  ["columns and aliases", "events", (q) => q.select("name:title, slug, starts:date, price").eq("org_id", ORG).order("title")],
  ["to-one embed", "events", (q) => q.select("title, organizations(name, slug, logo_url)").eq("org_id", ORG).order("title")],
  ["aliased embed", "events", (q) => q.select("title, org:organizations(name)").eq("org_id", ORG).order("title")],
  ["to-many embed", "organizations", (q) => q.select("slug, events(title, status)").eq("id", ORG)],
  ["the events listing page", "events", (q) => q
    .select("id, slug, title, description, date, end_date, location, venue, capacity, tickets_sold, price, currency, timezone, status, image_url, banner_landscape_url, organizations(name, slug, subdomain, logo_url)")
    .eq("status", "published").or(`end_date.gte.2026-01-01T00:00:00Z,and(end_date.is.null,date.gte.2026-01-01T00:00:00Z)`)
    .order("date", { ascending: true }).limit(200)],
  ["in", "events", (q) => q.select("title").in("slug", ["par-a", "par-c", "missing"]).order("title")],
  ["empty in", "events", (q) => q.select("title").in("slug", [])],
  ["neq / gt / lte", "events", (q) => q.select("title").eq("org_id", ORG).neq("slug", "par-a").gt("price", 0).lte("price", 50)],
  ["is null / not is null", "events", (q) => q.select("title").eq("org_id", ORG).is("location", null)],
  ["not in", "events", (q) => q.select("title").eq("org_id", ORG).not("slug", "in", "(par-a,par-b)").order("title")],
  ["ilike with *", "events", (q) => q.select("title").ilike("title", "*parity b*")],
  ["or with nested and", "events", (q) => q.select("title").eq("org_id", ORG).or("price.gt.40,and(price.eq.0,location.is.null)").order("title")],
  ["order desc nulls last", "events", (q) => q.select("title, location").eq("org_id", ORG).order("location", { ascending: false, nullsFirst: false })],
  ["range", "events", (q) => q.select("slug").eq("org_id", ORG).order("slug").range(1, 2)],
  ["single", "events", (q) => q.select("title").eq("slug", "par-a").single()],
  ["single with no row", "events", (q) => q.select("title").eq("slug", "nope").single()],
  ["maybeSingle with no row", "events", (q) => q.select("title").eq("slug", "nope").maybeSingle()],
  ["maybeSingle with many rows", "events", (q) => q.select("title").eq("org_id", ORG).maybeSingle()],
  ["exact count", "events", (q) => q.select("title", { count: "exact" }).eq("org_id", ORG).limit(1)],
  ["head count", "events", (q) => q.select("*", { count: "exact", head: true }).eq("org_id", ORG)],
  ["draft hidden from visitors", "events", (q) => q.select("title").eq("slug", "par-draft")],
  ["table without a grant", "cities", (q) => q.select("name").limit(1)],
  ["bad uuid", "events", (q) => q.select("title").eq("id", "not-a-uuid")],
];

describe.skipIf(!postgrestUrl || !url || !adminUrl)("parity with PostgREST", () => {
  let admin: pg.Client;
  let post: (r: Request) => Promise<Response>;
  const token = (sub: string) =>
    new SignJWT({ role: "authenticated" }).setProtectedHeader({ alg: "HS256" }).setIssuer(ISSUER).setAudience("authenticated")
      .setSubject(sub).setIssuedAt().setExpirationTime("5m").sign(new TextEncoder().encode(SECRET));

  beforeAll(async () => {
    Object.assign(process.env, { DATABASE_URL: url, AUTH_JWT_SECRET: SECRET, AUTH_ISSUER: ISSUER, SUPABASE_URL: "https://test.supabase.co" });
    vi.spyOn(console, "log").mockImplementation(() => {});
    admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`
      DELETE FROM public.events WHERE org_id = '${ORG}';
      INSERT INTO auth.users (id, email) VALUES ('${OWNER}', 'parity@example.com') ON CONFLICT DO NOTHING;
      INSERT INTO public.organizations (id, name, slug, owner_id, logo_url) VALUES ('${ORG}', 'Parity Org', 'parity-org', '${OWNER}', NULL) ON CONFLICT DO NOTHING;
      INSERT INTO public.events (user_id, org_id, title, slug, date, end_date, status, price, location) VALUES
        ('${OWNER}', '${ORG}', 'Parity A', 'par-a', '2030-02-01T10:00:00Z', NULL, 'published', 12.50, 'Pune'),
        ('${OWNER}', '${ORG}', 'Parity B', 'par-b', '2030-02-02T10:00:00Z', '2030-02-02T18:30:00Z', 'published', 0, NULL),
        ('${OWNER}', '${ORG}', 'Parity C', 'par-c', '2030-02-03T10:00:00Z', NULL, 'published', 45, 'Goa'),
        ('${OWNER}', '${ORG}', 'Parity Draft', 'par-draft', '2030-02-04T10:00:00Z', NULL, 'draft', 0, NULL);`);
    post = (await import("../../api/v1/query.js")).POST;
  });
  afterAll(async () => {
    await admin?.end();
    const { prisma } = await import("../db/client.js");
    await prisma().$disconnect();
  });

  for (const who of ["anon", "owner"] as const) {
    for (const [name, table, build] of CASES) {
      it(`${who}: ${name}`, async () => {
        const headers: Record<string, string> = who === "owner" ? { Authorization: `Bearer ${await token(OWNER)}` } : {};
        const rest = await build(new PostgrestClient(postgrestUrl!, { headers }).from(table));

        const { ops, proxy } = recorder();
        build(proxy);
        const res = await post(new Request("https://illuxus.com/api/v1/query", {
          method: "POST",
          headers: { "content-type": "application/json", ...(headers.Authorization ? { authorization: headers.Authorization } : {}) },
          body: JSON.stringify({ table, ops }),
        }));
        const ours = await res.json();

        expect(ours.error?.code ?? null).toBe(rest.error?.code ?? null);
        expect(ours.data ?? null).toEqual(rest.data ?? null);
        expect(ours.count ?? null).toBe(rest.count ?? null);
        if (Array.isArray(rest.data) && rest.data[0] && typeof rest.data[0] === "object") {
          expect(Object.keys(ours.data[0])).toEqual(Object.keys(rest.data[0]));
        }
      });
    }
  }
});
