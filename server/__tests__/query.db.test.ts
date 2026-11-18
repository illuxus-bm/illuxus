/**
 * /api/v1/query (the supabase-js compatible query engine) on a real database
 * built like AWS RDS, connected as the API's unprivileged login. Expected
 * values follow PostgREST's output: Postgres builds the JSON in both.
 * Set TEST_DATABASE_URL and TEST_DATABASE_ADMIN_URL (see api.db.test.ts).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";
import pg from "pg";

const url = process.env.TEST_DATABASE_URL;
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
const SECRET = "integration-secret-integration-secret-42";
const ISSUER = "https://test.supabase.co/auth/v1";
const OWNER = "c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3";
const FAN = "d4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4";
const ORG = "e5e5e5e5-e5e5-4e5e-8e5e-e5e5e5e5e5e5";
const OTHER_ORG = "f6f6f6f6-f6f6-4f6f-8f6f-f6f6f6f6f6f6";

type Op = { m: string; a: unknown[] };
type Chain = { table: string; ops: Op[] } & Record<string, (...a: unknown[]) => Chain>;
/** Records a chain the way src/lib/data/db.ts does: chain("events").select("*").eq("id", 1) */
function chain(table: string): Chain {
  const ops: Op[] = [];
  const target = { table, ops };
  const proxy: Chain = new Proxy(target, {
    get(t, prop: string) {
      if (prop === "table" || prop === "ops") return t[prop as "table" | "ops"];
      return (...a: unknown[]) => { ops.push({ m: prop, a }); return proxy; };
    },
  }) as never;
  return proxy;
}

describe.skipIf(!url || !adminUrl)("query engine on a real database", () => {
  let admin: pg.Client;
  let post: (r: Request) => Promise<Response>;
  const token = (sub: string) =>
    new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setIssuer(ISSUER).setAudience("authenticated")
      .setSubject(sub).setIssuedAt().setExpirationTime("5m").sign(new TextEncoder().encode(SECRET));
  const run = async (c: Chain, sub?: string) => {
    const res = await post(new Request("https://illuxus.com/api/v1/query", {
      method: "POST",
      headers: { "content-type": "application/json", ...(sub ? { authorization: `Bearer ${await token(sub)}` } : {}) },
      body: JSON.stringify({ table: c.table, ops: c.ops }),
    }));
    return { http: res.status, ...(await res.json()) };
  };

  beforeAll(async () => {
    Object.assign(process.env, { DATABASE_URL: url, AUTH_JWT_SECRET: SECRET, AUTH_ISSUER: ISSUER, SUPABASE_URL: "https://test.supabase.co" });
    vi.spyOn(console, "log").mockImplementation(() => {});
    admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`
      DELETE FROM public.org_followers WHERE user_id IN ('${OWNER}', '${FAN}');
      DELETE FROM public.events WHERE org_id IN ('${ORG}', '${OTHER_ORG}');
      DELETE FROM public.community_badges WHERE id LIKE 'qb-%';
      INSERT INTO auth.users (id, email) VALUES ('${OWNER}', 'owner@example.com'), ('${FAN}', 'fan@example.com') ON CONFLICT DO NOTHING;
      INSERT INTO public.organizations (id, name, slug, owner_id) VALUES
        ('${ORG}', 'Query Org', 'q-org', '${OWNER}'), ('${OTHER_ORG}', 'Other Org', 'q-other', '${OWNER}') ON CONFLICT DO NOTHING;
      INSERT INTO public.events (user_id, org_id, title, slug, date, status, price, location) VALUES
        ('${OWNER}', '${ORG}', 'Q Alpha', 'q-alpha', '2030-01-10T09:00:00Z', 'published', 12.5, 'Pune'),
        ('${OWNER}', '${ORG}', 'Q Beta',  'q-beta',  '2030-01-11T09:00:00Z', 'published', 0, NULL),
        ('${OWNER}', '${ORG}', 'Q Gamma', 'q-gamma', '2030-01-12T09:00:00Z', 'published', 99, 'Mumbai'),
        ('${OWNER}', '${ORG}', 'Q Draft', 'q-draft', '2030-01-13T09:00:00Z', 'draft', 0, NULL)
      ON CONFLICT DO NOTHING;
      INSERT INTO public.community_badges (id, label, icon, description, rule_kind)
        SELECT 'qb-' || lpad(g::text, 4, '0'), 'Badge ' || g, 'star', 'test', 'manual' FROM generate_series(1, 1005) g;`);
    post = (await import("../../api/v1/query.js")).POST;
  });
  afterAll(async () => {
    await admin?.end();
    const { prisma } = await import("../db/client.js");
    await prisma().$disconnect();
  });

  it("filters, orders and limits like PostgREST, with Postgres's own value formats", async () => {
    const r = await run(chain("events").select("title, date, price, location").eq("org_id", ORG).order("date", { ascending: false }).limit(2));
    expect(r.http).toBe(200);
    expect(r.data).toEqual([
      { title: "Q Gamma", date: "2030-01-12T09:00:00+00:00", price: 99, location: "Mumbai" },
      { title: "Q Beta", date: "2030-01-11T09:00:00+00:00", price: 0, location: null },
    ]);
  });

  it("keeps columns in the order asked for, as PostgREST does", async () => {
    const r = await run(chain("events").select("title, date, id").eq("slug", "q-alpha").single());
    expect(Object.keys(r.data)).toEqual(["title", "date", "id"]);
  });

  it("never shows anonymous visitors a draft, and shows the owner theirs", async () => {
    const anon = await run(chain("events").select("title").eq("org_id", ORG).order("date"));
    expect(anon.data.map((e: { title: string }) => e.title)).toEqual(["Q Alpha", "Q Beta", "Q Gamma"]);
    const owner = await run(chain("events").select("title").eq("slug", "q-draft"), OWNER);
    expect(owner.data).toEqual([{ title: "Q Draft" }]);
  });

  it("embeds a to-one relation as an object, with aliases", async () => {
    const r = await run(chain("events").select("name:title, org:organizations(name, slug)").eq("slug", "q-alpha").single());
    expect(r.data).toEqual({ name: "Q Alpha", org: { name: "Query Org", slug: "q-org" } });
  });

  it("embeds a to-many relation as an array", async () => {
    const r = await run(chain("organizations").select("slug, events(title)").eq("id", ORG).single(), OWNER);
    expect(r.data.slug).toBe("q-org");
    expect(r.data.events.map((e: { title: string }) => e.title).sort()).toEqual(["Q Alpha", "Q Beta", "Q Draft", "Q Gamma"]);
  });

  it("handles in, neq, is, not, ilike, match and or() trees", async () => {
    const titles = async (c: Chain) =>
      (await run(c.order("title"))).data.map((e: { title: string }) => e.title);
    const base = () => chain("events").select("title").eq("org_id", ORG);
    expect(await titles(base().in("slug", ["q-alpha", "q-gamma"]))).toEqual(["Q Alpha", "Q Gamma"]);
    expect(await titles(base().neq("slug", "q-alpha"))).toEqual(["Q Beta", "Q Gamma"]);
    expect(await titles(base().is("location", null))).toEqual(["Q Beta"]);
    expect(await titles(base().not("location", "is", null))).toEqual(["Q Alpha", "Q Gamma"]);
    expect(await titles(base().not("slug", "in", "(q-alpha,q-beta)"))).toEqual(["Q Gamma"]);
    expect(await titles(base().ilike("title", "%gam%"))).toEqual(["Q Gamma"]);
    expect(await titles(base().match({ slug: "q-beta" }))).toEqual(["Q Beta"]);
    expect(await titles(base().or("price.gt.50,and(price.eq.0,location.is.null)"))).toEqual(["Q Beta", "Q Gamma"]);
    expect(await titles(base().or("date.gte.2030-01-12T00:00:00+00:00,slug.eq.q-alpha"))).toEqual(["Q Alpha", "Q Gamma"]);
    expect(await titles(base().in("slug", []))).toEqual([]);
  });

  it("pages with range and caps every read at the live project's 1000 rows", async () => {
    const page = await run(chain("community_badges").select("id").like("id", "qb-%").order("id").range(2, 4));
    expect(page.data).toEqual([{ id: "qb-0003" }, { id: "qb-0004" }, { id: "qb-0005" }]);
    const all = await run(chain("community_badges").select("id").like("id", "qb-%").limit(5000));
    expect(all.data).toHaveLength(1000);
  });

  it("counts like count: 'exact', with and without rows", async () => {
    const head = await run(chain("community_badges").select("*", { count: "exact", head: true }).like("id", "qb-%"));
    expect([head.data, head.count]).toEqual([null, 1005]);
    const withRows = await run(chain("events").select("title", { count: "exact" }).eq("org_id", ORG).limit(1));
    expect([withRows.data.length, withRows.count]).toEqual([1, 3]);
  });

  it("single and maybeSingle answer like PostgREST, PGRST116 included", async () => {
    const none = await run(chain("events").select("title").eq("slug", "nope").single());
    expect([none.http, none.error?.code]).toEqual([406, "PGRST116"]);
    const maybe = await run(chain("events").select("title").eq("slug", "nope").maybeSingle());
    expect([maybe.http, maybe.data, maybe.error]).toEqual([200, null, undefined]);
    const many = await run(chain("events").select("title").eq("org_id", ORG).maybeSingle());
    expect(many.error?.code).toBe("PGRST116");
  });

  it("inserts as you, returning the row when asked, and refuses rows row security forbids", async () => {
    const mine = await run(chain("org_followers").insert({ user_id: FAN, org_id: ORG }).select("user_id, org_id").single(), FAN);
    expect([mine.http, mine.data]).toEqual([200, { user_id: FAN, org_id: ORG }]);
    const quiet = await run(chain("org_followers").insert([{ user_id: FAN, org_id: OTHER_ORG }]), FAN);
    expect([quiet.http, quiet.data]).toEqual([200, null]);
    const forged = await run(chain("org_followers").insert({ user_id: OWNER, org_id: ORG }), FAN);
    expect([forged.http, forged.error?.code]).toEqual([403, "42501"]);
    const dup = await run(chain("org_followers").insert({ user_id: FAN, org_id: ORG }), FAN);
    expect([dup.http, dup.error?.code]).toEqual([409, "23505"]);
  });

  it("upserts on a conflict target", async () => {
    const r = await run(chain("org_followers").upsert({ user_id: FAN, org_id: ORG }, { onConflict: "user_id,org_id", ignoreDuplicates: true }), FAN);
    expect(r.http).toBe(200);
    const n = await admin.query(`SELECT count(*)::int AS n FROM public.org_followers WHERE user_id = $1 AND org_id = $2`, [FAN, ORG]);
    expect(n.rows[0].n).toBe(1);
  });

  it("updates only rows row security lets you, and deletes yours", async () => {
    const own = await run(chain("profiles").update({ headline: "Fan of Q" }).eq("user_id", FAN).select("headline"), FAN);
    expect(own.data).toEqual([{ headline: "Fan of Q" }]);
    const other = await run(chain("profiles").update({ headline: "hacked" }).eq("user_id", OWNER).select("headline"), FAN);
    expect(other.data).toEqual([]);
    const del = await run(chain("org_followers").delete().eq("user_id", FAN).eq("org_id", OTHER_ORG).select("org_id"), FAN);
    expect(del.data).toEqual([{ org_id: OTHER_ORG }]);
  });

  it("refuses what it doesn't handle (the browser then uses Supabase), before touching the database", async () => {
    const cases = [
      chain("events").select("title, organizations!inner(slug)"),
      chain("events").select("title").eq("organizations.slug", "q-org"),
      chain("no_such_table").select("*"),
      chain("events").select("title; drop table events"),
      chain("events").select("title").eq("title\"; drop", 1),
      chain("events").update({ title: "everything" }),
      chain("events").delete(),
      chain("events").select("*").contains("tags", ["a"]),
      chain("events").select("title").eq("location", null),
    ];
    for (const c of cases) {
      const r = await run(c, OWNER);
      expect([r.http, r.error?.code]).toEqual([422, "unsupported_query"]);
    }
    const still = await admin.query(`SELECT count(*)::int AS n FROM public.events WHERE org_id = $1`, [ORG]);
    expect(still.rows[0].n).toBe(4);
  });
});
