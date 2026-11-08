// Tests migration 086 (blocking people and reporting chat messages in communities) on an in-memory Postgres.
// Run:  node supabase/tests/086_ugc_safety.test.mjs
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const bundle = fs.readFileSync(new URL("../migrations/000_full_schema.sql", import.meta.url), "utf8");
function section(name) {
  const startMarker = `-- >>> BEGIN SOURCE MIGRATION: ${name} >>>\n`;
  const endMarker = `-- <<< END SOURCE MIGRATION: ${name} <<<`;
  const start = bundle.indexOf(startMarker);
  const end = bundle.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`Migration section not found: ${name}`);
  return bundle.slice(start + startMarker.length, end).replace(/NOTIFY pgrst, 'reload schema';/g, "");
}

const db = new PGlite();
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; } catch (err) { failures.push(`${name}: ${err.message}`); }
}
function eq(actual, expected, what) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
async function as(uid, fn) {
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${uid ?? ""}', false);`);
  try { return await fn(); } finally { await db.exec("RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false);"); }
}
async function rejects(fn, pattern, what) {
  try { await fn(); } catch (err) { if (pattern.test(err.message)) return; throw new Error(`${what}: wrong error ${err.message}`); }
  throw new Error(`${what}: expected an error`);
}

const ASHA = "11111111-1111-4111-8111-111111111111";
const BEN = "22222222-2222-4222-8222-222222222222";   // the one Asha blocks
const CARA = "33333333-3333-4333-8333-333333333333";  // a bystander
const OUTSIDER = "44444444-4444-4444-8444-444444444444";
const COMMUNITY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHANNEL = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

// The parts of the community schema (migration 005) that 086 builds on.
await db.exec(`
  SET check_function_bodies = off;
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  CREATE TABLE auth.users (id uuid PRIMARY KEY);
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;

  CREATE TABLE public.communities (id uuid PRIMARY KEY);
  CREATE TABLE public.community_members (community_id uuid, user_id uuid);
  CREATE FUNCTION public.is_community_member(_u uuid, _c uuid) RETURNS boolean LANGUAGE sql STABLE AS
    $$ SELECT EXISTS (SELECT 1 FROM public.community_members WHERE community_id = _c AND user_id = _u) $$;

  CREATE TABLE public.community_posts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), community_id uuid, author_id uuid NOT NULL, body_md text);
  CREATE TABLE public.community_comments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), post_id uuid REFERENCES public.community_posts(id), author_id uuid NOT NULL, body text);
  CREATE TABLE public.community_channels (id uuid PRIMARY KEY, community_id uuid);
  CREATE TABLE public.community_messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), channel_id uuid, author_id uuid NOT NULL, body text);
  CREATE TABLE public.community_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), community_id uuid NOT NULL, reporter_id uuid NOT NULL,
    post_id uuid REFERENCES public.community_posts(id) ON DELETE CASCADE,
    comment_id uuid REFERENCES public.community_comments(id) ON DELETE CASCADE,
    reason text NOT NULL, notes text, created_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((post_id IS NOT NULL)::int + (comment_id IS NOT NULL)::int = 1));

  -- Everyone in the community reads everything, as in 005.
  DO $$ DECLARE t text; BEGIN
    FOREACH t IN ARRAY ARRAY['community_posts','community_comments','community_messages','community_reports'] LOOP
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('CREATE POLICY "read" ON public.%I FOR SELECT TO authenticated USING (true)', t);
      EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    END LOOP;
  END $$;

  INSERT INTO auth.users VALUES ('${ASHA}'), ('${BEN}'), ('${CARA}'), ('${OUTSIDER}');
  INSERT INTO public.communities VALUES ('${COMMUNITY}');
  INSERT INTO public.community_members VALUES ('${COMMUNITY}', '${ASHA}'), ('${COMMUNITY}', '${BEN}'), ('${COMMUNITY}', '${CARA}');
  INSERT INTO public.community_channels VALUES ('${CHANNEL}', '${COMMUNITY}');
  INSERT INTO public.community_posts (id, community_id, author_id, body_md) VALUES
    ('c0000000-0000-4000-8000-000000000001', '${COMMUNITY}', '${BEN}', 'from ben'),
    ('c0000000-0000-4000-8000-000000000002', '${COMMUNITY}', '${CARA}', 'from cara');
  INSERT INTO public.community_comments (id, post_id, author_id, body) VALUES
    ('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002', '${BEN}', 'ben replies'),
    ('d0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000002', '${CARA}', 'cara replies');
  INSERT INTO public.community_messages (id, channel_id, author_id, body) VALUES
    ('e0000000-0000-4000-8000-000000000001', '${CHANNEL}', '${BEN}', 'ben says hi'),
    ('e0000000-0000-4000-8000-000000000002', '${CHANNEL}', '${CARA}', 'cara says hi');
`);

const migration = section("086_ugc_safety.sql");
await db.exec(migration);
// Idempotent: a second run changes nothing and doesn't fail.
await check("runs twice", async () => { await db.exec(migration); });

const authors = async (table) =>
  (await db.query(`SELECT author_id FROM public.${table} ORDER BY author_id`)).rows.map((r) => r.author_id);

await check("before blocking, Asha sees everyone", async () => {
  await as(ASHA, async () => {
    eq(await authors("community_posts"), [BEN, CARA], "posts");
    eq(await authors("community_messages"), [BEN, CARA], "messages");
  });
});

await check("Asha blocks Ben", async () => {
  await as(ASHA, () => db.query(`INSERT INTO public.user_blocks (blocker_id, blocked_id) VALUES ($1, $2)`, [ASHA, BEN]));
});

await check("Ben's posts, comments and messages disappear for Asha", async () => {
  await as(ASHA, async () => {
    eq(await authors("community_posts"), [CARA], "posts");
    eq(await authors("community_comments"), [CARA], "comments");
    eq(await authors("community_messages"), [CARA], "messages");
  });
});

await check("everyone else still sees Ben, and Ben sees Asha's community as before", async () => {
  await as(CARA, async () => eq(await authors("community_posts"), [BEN, CARA], "Cara's posts"));
  await as(BEN, async () => eq(await authors("community_messages"), [BEN, CARA], "Ben's messages"));
});

await check("blocks are private to the person who made them", async () => {
  await as(BEN, async () => eq((await db.query(`SELECT * FROM public.user_blocks`)).rows.length, 0, "Ben's view"));
  await as(CARA, async () => eq((await db.query(`SELECT * FROM public.user_blocks`)).rows.length, 0, "Cara's view"));
});

await check("nobody can block on someone else's behalf, or block themselves", async () => {
  await rejects(() => as(CARA, () => db.query(`INSERT INTO public.user_blocks VALUES ($1, $2)`, [ASHA, CARA])), /row-level security/, "on behalf");
  await rejects(() => as(CARA, () => db.query(`INSERT INTO public.user_blocks (blocker_id, blocked_id) VALUES ($1, $1)`, [CARA])), /check constraint/, "self");
});

await check("unblocking brings Ben back", async () => {
  await as(ASHA, () => db.query(`DELETE FROM public.user_blocks WHERE blocked_id = $1`, [BEN]));
  await as(ASHA, async () => eq(await authors("community_posts"), [BEN, CARA], "posts"));
});

await check("members can report a chat message", async () => {
  await as(ASHA, () => db.query(`SELECT public.community_report(_message_id => $1, _reason => 'harassment', _notes => '  rude  ')`,
    ["e0000000-0000-4000-8000-000000000001"]));
  const row = (await db.query(`SELECT community_id, reporter_id, message_id, post_id, reason, notes FROM public.community_reports`)).rows[0];
  eq(row, { community_id: COMMUNITY, reporter_id: ASHA, message_id: "e0000000-0000-4000-8000-000000000001", post_id: null, reason: "harassment", notes: "rude" }, "report");
});

await check("posts and comments can still be reported, by position as the app calls it", async () => {
  await as(CARA, () => db.query(`SELECT public.community_report($1, NULL, 'spam', NULL)`, ["c0000000-0000-4000-8000-000000000001"]));
  await as(CARA, () => db.query(`SELECT public.community_report(NULL, $1, 'spam')`, ["d0000000-0000-4000-8000-000000000001"]));
  eq(Number((await db.query(`SELECT count(*) FROM public.community_reports`)).rows[0].count), 3, "reports");
});

await check("a report needs exactly one target, a reason, and membership", async () => {
  await rejects(() => as(ASHA, () => db.query(`SELECT public.community_report(_reason => 'spam')`)), /exactly one/, "no target");
  await rejects(() => as(ASHA, () => db.query(`SELECT public.community_report($1, NULL, '  ', NULL, NULL)`, ["c0000000-0000-4000-8000-000000000002"])), /reason/, "blank reason");
  await rejects(() => as(OUTSIDER, () => db.query(`SELECT public.community_report(_message_id => $1, _reason => 'spam')`, ["e0000000-0000-4000-8000-000000000002"])), /Not a member/, "outsider");
  await rejects(() => db.query(`INSERT INTO public.community_reports (community_id, reporter_id, reason) VALUES ($1, $2, 'x')`, [COMMUNITY, ASHA]), /community_reports_one_target/, "table check");
});

console.log(`${passed} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  ✗ ${f}`);
process.exit(failures.length ? 1 : 0);
