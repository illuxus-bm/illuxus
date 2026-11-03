// Tests migrations 077 (atomic rate limit) and 078 (anonymous reaction reads) on an in-memory Postgres.
// Run:  npm i --no-save @electric-sql/pglite  &&  node supabase/tests/077_078_rate_limit_reactions.test.mjs
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const bundle = fs.readFileSync(new URL("../migrations/000_full_schema.sql", import.meta.url), "utf8");
function section(name) {
  const startMarker = `-- >>> BEGIN SOURCE MIGRATION: ${name} >>>\n`;
  const endMarker = `-- <<< END SOURCE MIGRATION: ${name} <<<`;
  const start = bundle.indexOf(startMarker);
  const end = bundle.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`Migration section not found: ${name}`);
  // PGlite has no PostgREST listening; NOTIFY is harmless but noisy.
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
async function as(role, fn) {
  await db.exec(`SET ROLE ${role}`);
  try { return await fn(); } finally { await db.exec("RESET ROLE"); }
}

const LIVE = "11111111-1111-4111-8111-111111111111";
const ENDED = "22222222-2222-4222-8222-222222222222";
const DRAFT_LIVE = "33333333-3333-4333-8333-333333333333";
const NO_REACTIONS = "44444444-4444-4444-8444-444444444444";
const PUBLISHED = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DRAFT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

await db.exec(`
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

  CREATE TABLE public.guest_rate_limits (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, bucket text NOT NULL, key_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now());
  ALTER TABLE public.guest_rate_limits ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.guest_rate_limits FROM PUBLIC, anon, authenticated;
  GRANT ALL ON public.guest_rate_limits TO service_role;

  CREATE TABLE public.events (id uuid PRIMARY KEY, status text NOT NULL);
  CREATE TABLE public.webinar_sessions (id uuid PRIMARY KEY, event_id uuid NOT NULL, status text NOT NULL, reactions_enabled boolean NOT NULL DEFAULT true);
  CREATE TABLE public.webinar_reactions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL, user_id uuid, emoji text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
  ALTER TABLE public.webinar_reactions ENABLE ROW LEVEL SECURITY;
  GRANT SELECT (id, session_id, emoji, created_at) ON public.webinar_reactions TO anon;
  -- The policy migration 078 replaces.
  CREATE POLICY "Guests see reactions" ON public.webinar_reactions FOR SELECT TO anon USING (true);

  INSERT INTO public.events VALUES ('${PUBLISHED}', 'published'), ('${DRAFT}', 'draft');
  INSERT INTO public.webinar_sessions VALUES
    ('${LIVE}', '${PUBLISHED}', 'live', true), ('${ENDED}', '${PUBLISHED}', 'ended', true),
    ('${DRAFT_LIVE}', '${DRAFT}', 'live', true), ('${NO_REACTIONS}', '${PUBLISHED}', 'live', false);
  INSERT INTO public.webinar_reactions (session_id, user_id, emoji)
    SELECT id, gen_random_uuid(), '👏' FROM public.webinar_sessions;
`);

await db.exec(section("077_atomic_rate_limit.sql"));
await db.exec(section("078_reaction_reads.sql"));

const take = async (key, max = 3, windowSeconds = 60) =>
  (await db.query("SELECT public.take_rate_limit('test', $1, $2, $3) AS ok", [key, max, windowSeconds])).rows[0].ok;

// ── 077 ─────────────────────────────────────────────────────────────────────

await check("allows up to the maximum, then refuses", async () => {
  const results = await as("service_role", async () => [await take("a"), await take("a"), await take("a"), await take("a"), await take("a")]);
  eq(results, [true, true, true, false, false], "five calls against a limit of three");
});

await check("a refused call records nothing", async () => {
  const { rows } = await db.query("SELECT count(*)::int AS n FROM public.guest_rate_limits WHERE key_hash = 'a'");
  eq(rows[0].n, 3, "rows for the key");
});

await check("keys and buckets are counted apart", async () => {
  const other = await as("service_role", () => take("b"));
  eq(other, true, "a different key");
  const { rows } = await as("service_role", () => db.query("SELECT public.take_rate_limit('other', 'a', 3, 60) AS ok"));
  eq(rows[0].ok, true, "the same key in another bucket");
});

await check("uses older than the window don't count", async () => {
  await db.exec("UPDATE public.guest_rate_limits SET created_at = now() - interval '2 minutes' WHERE key_hash = 'a' AND bucket = 'test'");
  eq(await as("service_role", () => take("a")), true, "after the window");
});

await check("clears rows a day past the window", async () => {
  await db.exec("INSERT INTO public.guest_rate_limits (bucket, key_hash, created_at) VALUES ('test', 'c', now() - interval '3 days')");
  await as("service_role", () => take("c"));
  const { rows } = await db.query("SELECT count(*)::int AS n FROM public.guest_rate_limits WHERE key_hash = 'c' AND created_at < now() - interval '1 day'");
  eq(rows[0].n, 0, "stale rows for the key");
});

await check("rejects a missing or non-positive limit", async () => {
  let threw = false;
  try { await as("service_role", () => take("d", 0)); } catch { threw = true; }
  eq(threw, true, "max = 0 raises");
});

await check("only the service role can call it", async () => {
  for (const role of ["anon", "authenticated"]) {
    let denied = false;
    try { await as(role, () => take("e")); } catch (err) { denied = /permission denied/.test(err.message); }
    eq(denied, true, `${role} denied`);
  }
});

await check("takes a transaction-scoped lock for its key", async () => {
  // The lock is what makes count-then-insert exact under concurrency. PGlite
  // has a single connection, so this checks the lock is taken and released
  // with the transaction rather than racing two sessions.
  await db.exec("BEGIN; SET LOCAL ROLE service_role;");
  await db.query("SELECT public.take_rate_limit('lock', 'k', 5, 60)");
  const held = (await db.query("SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND granted")).rows[0].n;
  await db.exec("COMMIT");
  const after = (await db.query("SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory'")).rows[0].n;
  eq([held >= 1, after], [true, 0], "lock held in the transaction, released after");
});

// ── 078 ─────────────────────────────────────────────────────────────────────

await check("anonymous viewers see reactions on a live session of a published event", async () => {
  const { rows } = await as("anon", () => db.query("SELECT session_id FROM public.webinar_reactions ORDER BY session_id"));
  eq(rows.map((r) => r.session_id), [LIVE], "visible sessions");
});

await check("anonymous viewers never see who reacted", async () => {
  let denied = false;
  try { await as("anon", () => db.query("SELECT user_id FROM public.webinar_reactions")); } catch (err) { denied = /permission denied/.test(err.message); }
  eq(denied, true, "user_id column denied");
});

await check("a session going live or ending changes what is visible", async () => {
  await db.exec(`UPDATE public.webinar_sessions SET status = 'ended' WHERE id = '${LIVE}'`);
  const { rows } = await as("anon", () => db.query("SELECT count(*)::int AS n FROM public.webinar_reactions"));
  eq(rows[0].n, 0, "after the live session ended");
  await db.exec(`UPDATE public.webinar_sessions SET status = 'live' WHERE id = '${LIVE}'`);
});

console.log(`${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
