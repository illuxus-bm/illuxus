# Moving the data layer to Prisma (and AWS RDS)

Status: **foundation in place, first screen migrated behind a flag.** Production keeps running on
Supabase exactly as before until `VITE_DATA_BACKEND=api` is set and each step below is verified.

## Why this shape

Prisma runs on a server, not in a browser. Today the app (web, iOS, Android) queries Postgres
directly through Supabase's API, and **row security policies** decide what each person may read or
write. Moving to Prisma therefore means adding a server API that the apps call instead.

The API keeps the existing security model rather than rewriting it:

```
Browser / iOS / Android
   │  Authorization: Bearer <access token>         (the Supabase Auth session the app already has)
   ▼
api/v1/*  (Vercel Node functions)  ── server/http.ts: CORS, validation, errors, request id, logs
   │  server/auth/verify.ts: verify the token (project JWKS, or legacy HS256 secret)
   │  server/db/caller.ts:   BEGIN; SET LOCAL ROLE anon|authenticated; set the token's claims
   ▼
Prisma 7 (driver adapter: node-postgres)  ── DATABASE_URL → AWS RDS, or Supabase
   ▼
Postgres: the same tables, row security policies, triggers and SQL functions as today
```

Because each request runs as the same role, with the same `auth.uid()`, as a Supabase request, the
**existing 375 policies, 113 triggers and 400 SQL functions keep enforcing access unchanged**, on
Supabase and on RDS. There is no second copy of the rules to drift out of step. `asCaller()` sets
everything with `is_local`, so a pooled connection never carries one person's identity to the next
request (tested).

## What's in the repository

| Path | What it is |
| --- | --- |
| `prisma/schema.prisma` | 133 models, introspected from the production schema (`public` + `auth`) |
| `prisma.config.ts` | Prisma CLI config; reads `DATABASE_URL` |
| `server/` | API internals: env validation, Prisma client, caller identity, auth, HTTP wrapper, services |
| `api/v1/health.ts` | `GET /api/v1/health`: API up, database reachable |
| `api/v1/events/index.ts` | `GET /api/v1/events?when=upcoming\|past&limit=&after=\|before=`: public listing |
| `api/v1/me/profile.ts` | `GET` / `PATCH /api/v1/me/profile`: your own profile (allow-listed fields) |
| `src/lib/data/api-client.ts` | Browser client: token, timeouts, errors, `viaApi()` with Supabase fallback |
| `scripts/rds/bootstrap.sql` | What Supabase provides that the schema needs, for RDS |
| `scripts/rds/build-rds-install.mjs` | Writes `supabase/install.rds.sql` from `supabase/install.sql` |
| `scripts/rds/copy-data.sh` | Copies data Supabase → RDS and compares every table's row count |
| `.github/workflows/prisma.yml` | CI: builds an RDS-shaped database, checks schema drift, runs the API tests |

Migrated so far: the **public events listing** (`/events`, `EventsListingPage`). It uses the API
when the flag is on and falls back to its old Supabase query if the API is unreachable, so an API
outage can't take the page down.

## Setting up AWS RDS

1. **Create the instance:** RDS for PostgreSQL **17** (Supabase runs 17), in a private subnet. Enable
   storage encryption, automated backups (7+ days), Multi-AZ for production, and deletion
   protection. Vercel functions reach it over the internet unless you use Vercel Secure Compute, so
   either use Secure Compute or restrict the security group as tightly as Vercel allows. In front of
   RDS, use **RDS Proxy**: serverless functions open many short-lived connections.
2. **Parameter group:** `shared_preload_libraries = pg_cron,pg_stat_statements` and
   `cron.database_name = illuxus` (for the scheduled communications job), plus
   `rds.logical_replication = 1` if you'll use realtime replication. Without `pg_cron`, the install
   skips the job and prints a notice; run `SELECT public.communications_run_scheduled()` every
   minute from EventBridge Scheduler instead.
3. **Create the database and the API's login role** (as the master user):
   ```sql
   CREATE DATABASE illuxus;
   CREATE ROLE illuxus_api LOGIN PASSWORD '<strong password>';
   ```
4. **Build the schema:**
   ```bash
   psql "$RDS_ADMIN_URL" -v ON_ERROR_STOP=1 -v app_user=illuxus_api -f scripts/rds/bootstrap.sql
   ```
   ```bash
   psql "$RDS_ADMIN_URL" -v ON_ERROR_STOP=1 -f supabase/install.rds.sql
   ```
   The install ends with its own check (`illuxus install OK: 131 tables, …`).
5. **Copy the data** (app read-only or offline during the copy):
   ```bash
   SOURCE_DATABASE_URL="<supabase session pooler URL>" TARGET_DATABASE_URL="$RDS_ADMIN_URL" scripts/rds/copy-data.sh
   ```
   It refuses a target that already has users, and fails if any table's row count differs.
6. **Point the API at RDS:** in Vercel, set `DATABASE_URL` (the `illuxus_api` login through RDS
   Proxy, `sslmode=verify-full`), `DATABASE_SSL_CA` (the RDS CA bundle), `SUPABASE_URL` and, while
   tokens are still HS256, `AUTH_JWT_SECRET`. Check `GET /api/v1/health`.

Every step except the AWS console work is exercised in CI on each relevant pull request
(`.github/workflows/prisma.yml`).

## Rollout

Each step is reversible by unsetting the flag or the variable.

1. **API on Supabase first.** Set `DATABASE_URL` to Supabase's session pooler (role: a login that is
   a member of `anon` and `authenticated`). Turn on `VITE_DATA_BACKEND=api` in a preview deployment,
   then in production. Watch the function logs (one JSON line per request, with status and
   duration).
2. **Move screens one at a time** (below), each behind `viaApi()` with its Supabase fallback, with a
   test, until no browser code queries tables directly.
3. **Switch the database to RDS:** copy the data during a short maintenance window, change
   `DATABASE_URL`, verify, and keep Supabase as the rollback for a few days.
4. **Then the Supabase services the app still uses** (below), each its own project.

## What still talks to Supabase directly

Measured on this branch:

| Area | Size | Plan |
| --- | --- | --- |
| Table queries (`supabase.from`) | 377 calls in 108 files, on 46 tables | Move to `api/v1` services by area: events, registrations, people, organisations, communities, creatives, venues |
| SQL functions (`rpc`) | 128 calls, 79 functions | Call the same functions from the API: `tx.$queryRaw\`SELECT * FROM public.fn(${arg})\`` inside `asCaller()`. They run unchanged on RDS. |
| Edge functions (`functions.invoke`) | 48 calls, 30 functions | Port to `api/v1` (Node), reading data through Prisma; email (SMTP), WhatsApp, AI and LiveKit/Agora calls move as they are |
| Realtime (`.channel`) | 22 files | Needs a replacement before Supabase can be dropped: RDS has no Realtime. Options: AWS AppSync Events, Ably/Pusher, or a small WebSocket service fed by logical replication |
| Storage | 11 files | Supabase Storage keeps working with an RDS database; to move, use S3 with pre-signed uploads from the API |
| Auth | 25 files | Supabase Auth keeps working (the API verifies its tokens). Moving to Cognito means migrating password hashes and keeping `auth.users` in step with the new provider |
| `pg_net` | email/webhook hand-offs in SQL | On RDS, `net.http_post` queues into `net.http_request_queue`; a worker (EventBridge + Lambda) must send them |

## Working on it

```bash
bun install                 # also runs `prisma generate`
bun run typecheck:server    # strict TypeScript for server/ and api/v1
bun run test:server         # unit tests; database tests run when TEST_DATABASE_URL is set
bun run db:pull             # after a schema change: re-introspect (against a database built from install.rds.sql)
bun run rds:build-install   # after supabase/install.sql changes
```

A database change is still written as a section of `supabase/migrations/000_full_schema.sql` with a
test in `supabase/tests/` (the repo's existing process). Then rebuild `install.sql` and
`install.rds.sql`, and re-pull `schema.prisma`. Prisma Migrate isn't used: the schema's functions,
triggers and policies are beyond what it can express.

### Adding an endpoint

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

Rules:
- **Always query inside `asCaller()`.** Outside it, queries run as the API's own login, with no
  caller identity, so row security can't apply the right person's rules.
- Use `.js` on relative imports: Vercel runs the functions as ES modules.
- Validate every input with zod via `parse()`; bad input is a 400, never a crash.
- `route()` turns any thrown error into a safe JSON response; never put internals in a message.
