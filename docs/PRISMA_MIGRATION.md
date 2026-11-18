# Moving the data layer to Prisma (and AWS RDS)

Status: **every database call in the apps can run through the Prisma API, and all 30 edge functions
are ported to Node.** All of it is behind one switch, `VITE_DATA_BACKEND=api`, which is off by
default: until it's set, production runs exactly as before. The database itself is still Supabase's;
moving it to RDS is the last step and needs your AWS account (below).

## How it works

Prisma runs on a server, not in a browser. Today the web, iOS and Android apps query Postgres
directly through Supabase's API, and **row security policies** decide what each person may read or
write. The Prisma API sits in between without rewriting those rules:

```
Browser / iOS / Android
   │  Authorization: Bearer <access token>         (the Supabase Auth session the app already has)
   ▼
api/v1/*  (Vercel Node functions)  ── server/http.ts: CORS, validation, errors, request id, logs
   │  server/auth/verify.ts: verify the token (project JWKS, or legacy HS256 secret)
   │  server/db/caller.ts:   BEGIN; SET LOCAL ROLE anon|authenticated; set the token's claims
   ▼
Prisma 7 (driver adapter: node-postgres)  ── DATABASE_URL → Supabase today, AWS RDS next
   ▼
Postgres: the same tables, 375 row security policies, 113 triggers and 400 SQL functions
```

Each request runs as the same role, with the same `auth.uid()`, as a Supabase request, so **the
existing policies, grants, triggers and SQL functions keep enforcing access unchanged**. There's no
second copy of the rules to drift out of step. `asCaller()` sets everything with `is_local`, so a
pooled connection never carries one person's identity to the next request (tested).

## The pieces

| Browser call | Goes to (when switched on) | What it does |
| --- | --- | --- |
| `db.from(table)…` (463 calls, 101 files) | `POST /api/v1/query` | The supabase-js query chain, run by `server/services/query/` through Prisma. Same JSON as PostgREST: column order, embeds, value formats, `single`/`maybeSingle` errors, counts, the live project's 1000-row cap |
| `supabaseRpc(fn)` / `db.rpc(fn)` (150+ calls) | `POST /api/v1/rpc/<fn>` | The SQL function, called as PostgREST calls it (named arguments; values, rows, sets, void); Postgres errors keep their SQLSTATE |
| `db.functions.invoke(name)` (51 calls) | `/api/v1/fn/<name>` | The edge function's Node port (`server/functions/<name>`), with Supabase's `verify_jwt` gateway check |
| the events listing | `GET /api/v1/events` | A typed Prisma endpoint (an example of hand-written ones) |
| own profile | `GET`/`PATCH /api/v1/me/profile` | Typed Prisma endpoint with an allow-list of fields |

`db` (`src/lib/data/db.ts`) **is** the Supabase client while the switch is off. When it's on:

- **Reads** fall back to Supabase on any API failure, so an API outage can't take a screen down.
- **Writes** fall back only when the API guarantees nothing ran (a query shape it doesn't support
  yet, or the database unreachable before starting). If the outcome is unknown (a timeout), the
  error is reported, never retried, so nothing is written twice.
- **Edge functions** go to the Supabase-hosted copy only when the API doesn't serve that function;
  any other failure is reported and not retried, because the function may already have sent an
  email.
- Query shapes the engine doesn't handle yet (`!inner` joins, filters on embedded tables,
  `contains`, …) are refused before touching the database and run on Supabase. Each one shows up in
  the function logs as `unsupported_query`, a to-do list for the engine.

### Edge functions

`scripts/port-edge-function.mjs` ports `supabase/functions/<name>` to `server/functions/<name>`
mechanically (imports, `Deno.env`, `Deno.serve` → default export) plus a few listed patches, each
with its reason. The Deno source stays the deployed version until the switch is on; CI fails if a
port is out of date (`bun run functions:port`).

- `server/edge/supabase.ts`: `createClient()` with supabase-js's interface. Table and SQL-function
  calls run in-process through the Prisma engine (service-role key → `service_role`; a user's token
  → that user). Sign-in (`auth`) and file storage (`storage`) still go to Supabase.
- `server/edge/smtp-client.ts`: denomailer's `SMTPClient` interface on nodemailer.
- `server/edge/deno.ts`: `Deno.env.get` reads `process.env`. Set each function's secrets (SMTP_*,
  GEMINI_*, LIVEKIT_*, AGORA_*, WHATSAPP_*, SUPABASE_SERVICE_ROLE_KEY, …) as Vercel environment
  variables under the same names.
- Every port loads in Node, answers CORS preflight and refuses bad requests cleanly
  (`server/__tests__/functions.test.ts`).

### Background jobs (for RDS)

Supabase runs two things inside the database that plain RDS may not: `pg_cron` (scheduled emails and
WhatsApp, every minute) and `pg_net` (HTTP hand-offs from SQL). On RDS, `bootstrap.sql` turns
`net.http_post` into a queue, and `POST /api/v1/jobs/<job>` does the work:

- `communications-tick`: `SELECT public.communications_run_scheduled()`
- `http-queue`: sends queued calls (skip-locked, so overlapping runs never double-send; failures
  retried up to 5 times, with `last_error` kept)

Call both every minute with `Authorization: Bearer $CRON_SECRET`, from EventBridge Scheduler or a
Vercel cron (one-minute crons need a paid Vercel plan, which is why `vercel.json` doesn't declare
them). They do nothing unless `DB_JOBS_ENABLED=true`: while the database is on Supabase, pg_cron and
pg_net already do this.

## Setting up AWS RDS

1. **Create the instance:** RDS for PostgreSQL **17** (Supabase runs 17), private subnet, storage
   encryption, automated backups (7+ days), Multi-AZ for production, deletion protection. Put **RDS
   Proxy** in front: serverless functions open many short-lived connections. Vercel reaches RDS over
   the internet unless you use Vercel Secure Compute, so restrict the security group as far as your
   setup allows.
2. **Parameter group:** `shared_preload_libraries = pg_cron,pg_stat_statements` and
   `cron.database_name = illuxus` if you'd rather keep the scheduled job inside the database (then
   leave `communications-tick` off). `rds.logical_replication = 1` only if you'll replicate for
   realtime.
3. **Database and logins** (as the master user):
   ```sql
   CREATE DATABASE illuxus;
   CREATE ROLE illuxus_api LOGIN PASSWORD '<strong password>';
   ```
4. **Schema:**
   ```bash
   psql "$RDS_ADMIN_URL" -v ON_ERROR_STOP=1 -v app_user=illuxus_api -f scripts/rds/bootstrap.sql
   ```
   ```bash
   psql "$RDS_ADMIN_URL" -v ON_ERROR_STOP=1 -f supabase/install.rds.sql
   ```
   The install ends with its own check (`illuxus install OK: 131 tables, …`).
5. **Data.** Either restore a backup taken from Supabase (one consistent snapshot, checksummed):
   ```bash
   TARGET_DATABASE_URL="$RDS_ADMIN_URL" node scripts/rds/restore-backup.mjs ./illuxus-supabase-backup-<time>
   ```
   or copy live (app read-only or offline meanwhile):
   ```bash
   SOURCE_DATABASE_URL="<supabase session pooler URL>" TARGET_DATABASE_URL="$RDS_ADMIN_URL" scripts/rds/copy-data.sh
   ```
   Refuses a target that already has users; fails if any table's row count differs.
6. **Vercel environment:** `DATABASE_URL` (illuxus_api via RDS Proxy, `sslmode=verify-full`),
   `DATABASE_SERVICE_URL` (the schema owner, for the edge functions' service-role work: on RDS,
   `service_role` can't bypass row security), `DATABASE_SSL_CA` (the RDS CA bundle), `SUPABASE_URL`,
   `AUTH_JWT_SECRET` while tokens are HS256, the edge-function secrets, `CRON_SECRET`, and
   `DB_JOBS_ENABLED=true`. Check `GET /api/v1/health`.

Every step except the AWS console work runs in CI on each relevant pull request
(`.github/workflows/prisma.yml`): it builds an RDS-shaped database from these files, checks
`schema.prisma` against it, runs the API, engine, function and job tests against it as the
unprivileged API role, compares the engine with real PostgREST, and round-trips the data copy.

## Rollout

Each step is undone by unsetting the variable.

1. **API on Supabase's database.** Set `DATABASE_URL` to Supabase's session pooler (a login that's a
   member of `anon`, `authenticated` and `service_role`), the edge-function secrets, then
   `VITE_DATA_BACKEND=api` on a preview deployment. Use the app; watch the function logs (one JSON
   line per request) for errors and `unsupported_query`. Then production.
2. **Database to RDS:** copy the data in a short maintenance window, switch `DATABASE_URL` /
   `DATABASE_SERVICE_URL`, turn on the jobs, verify, keep Supabase as the rollback for a few days.

## Still on Supabase, by design for now

| Area | Size | What's needed to move it |
| --- | --- | --- |
| Sign-in (Supabase Auth) | 25 files | Keeps working with an RDS database: the API verifies its tokens. Moving to Cognito (or another provider) means migrating password hashes and keeping `auth.users` in step. A product decision. |
| Realtime (`.channel`) | 22 files | RDS has no Realtime. Needs a replacement: AWS AppSync Events, Ably/Pusher, or a small WebSocket service fed by logical replication. A product decision. |
| File storage | 11 files | Supabase Storage keeps working with an RDS database. Moving means S3 with pre-signed uploads from the API, plus copying the files. |

## Working on it

```bash
bun install                 # also runs `prisma generate`
bun run typecheck:server    # strict TypeScript for server/ and api/v1
bun run test:server         # unit tests; database tests run when TEST_DATABASE_URL is set
bun run functions:port      # after changing an edge function in supabase/functions
bun run db:pull             # after a schema change (against a database built from install.rds.sql)
bun run rds:build-install   # after supabase/install.sql changes
```

A database change is still a section of `supabase/migrations/000_full_schema.sql` with a test in
`supabase/tests/`. Then rebuild `install.sql` and `install.rds.sql` and re-pull `schema.prisma`.
Prisma Migrate isn't used: the schema's functions, triggers and policies are beyond what it can
express.

### Adding a typed endpoint

```ts
// api/v1/things.ts
import { parse, route } from "../../server/http.js";
import { asCaller } from "../../server/db/caller.js";
import { z } from "zod";

export const GET = route("things.list", {
  GET: async ({ url, caller }) => {
    const input = parse(z.object({ limit: z.coerce.number().int().max(100).default(20) }), Object.fromEntries(url.searchParams));
    return asCaller(caller, (tx) => tx.things.findMany({ take: input.limit }));
  },
});
export const OPTIONS = GET;
```

- **Always query inside `asCaller()`.** Outside it, queries run as the API's own login, with no
  caller identity, so row security can't apply the right person's rules.
- Use `.js` on relative imports: Vercel runs the functions as ES modules.
- Validate every input with zod via `parse()`; bad input is a 400, never a crash.
- `route()` turns any thrown error into a safe JSON response; never put internals in a message.
