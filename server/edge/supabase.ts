/**
 * `createClient()` for the edge functions ported to Node (server/functions).
 *
 * Same interface the functions were written against (supabase-js), so their
 * code barely changes, but table and SQL-function calls run in-process
 * through the Prisma query engine, against DATABASE_URL (Supabase today,
 * AWS RDS later):
 *   - createClient(url, SERVICE_ROLE_KEY)  → runs as service_role
 *   - createClient(url, anonKey, { global: { headers: { Authorization } } })
 *                                          → runs as that signed-in person
 *   - anything else                        → runs as anon
 *
 * Sign-in (`auth`) and file storage (`storage`) stay on Supabase for now and
 * go to the real supabase-js client. `functions.invoke` calls the ported
 * function in-process.
 */
import { createClient as createRealClient, type SupabaseClient } from "@supabase/supabase-js";
import { ANONYMOUS, SERVICE, asCaller, type Caller } from "../db/caller.js";
import { callerFromRequest } from "../auth/verify.js";
import { runQuery, Unsupported, type Op } from "../services/query/compile.js";
import { callFunction, postgresError } from "../services/rpc.js";

type PgErr = { code: string; message: string; details: string | null; hint: string | null };
type Result = { data: unknown; error: PgErr | null; count: number | null; status: number; statusText: string };

const ok = (data: unknown, count: number | null = null, status = 200): Result => ({ data, error: null, count, status, statusText: "OK" });
const fail = (status: number, code: string, message: string, details: string | null = null): Result =>
  ({ data: null, error: { code, message, details, hint: null }, count: null, status, statusText: "" });

function isServiceKey(key: string): boolean {
  const own = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return Boolean(own && key === own);
}

type Options = { global?: { headers?: Record<string, string> }; auth?: Record<string, unknown> };

async function resolveCaller(key: string, options: Options): Promise<Caller> {
  if (isServiceKey(key)) return SERVICE;
  const authorization = options.global?.headers?.Authorization ?? options.global?.headers?.authorization;
  if (!authorization) return ANONYMOUS;
  // A token that doesn't verify is an error on every query, as in PostgREST.
  return callerFromRequest(new Headers({ authorization }));
}

function toResult(e: unknown): Result {
  if (e instanceof Unsupported) {
    return fail(422, "unsupported_query", `Not supported by the Prisma query engine yet: ${e.message}`);
  }
  if ((e as { status?: number })?.status === 401) return fail(401, "PGRST301", "JWT could not be verified");
  const pg = postgresError(e);
  if (pg) return fail(pg.status, pg.code, pg.message, pg.details ?? null);
  throw e;
}

function builder(callerP: Promise<Caller>, table: string): unknown {
  const ops: Op[] = [];
  let throwOnError = false;
  let pending: Promise<Result> | null = null;
  const run = () =>
    (pending ??= (async () => {
      try {
        const caller = await callerP;
        const r = await asCaller(caller, (tx) => runQuery(tx, table, ops));
        return r.error
          ? fail(r.status, r.error.code, r.error.message, r.error.details ?? null)
          : ok(r.data, r.count, r.status);
      } catch (e) {
        return toResult(e);
      }
    })().then((r) => {
      if (throwOnError && r.error) throw Object.assign(new Error(r.error.message), r.error);
      return r;
    }));
  const proxy: unknown = new Proxy({}, {
    get(_t, prop) {
      if (prop === "then") return (a?: (v: Result) => unknown, b?: (e: unknown) => unknown) => run().then(a, b);
      if (prop === "catch") return (b?: (e: unknown) => unknown) => run().catch(b);
      if (prop === "finally") return (f?: () => void) => run().finally(f);
      if (typeof prop !== "string") return undefined;
      if (prop === "throwOnError") return () => { throwOnError = true; return proxy; };
      if (prop === "returns" || prop === "abortSignal") return () => proxy;
      return (...a: unknown[]) => { ops.push({ m: prop, a }); return proxy; };
    },
  });
  return proxy;
}

/** Typed as supabase-js's client, so ported code keeps its original types. */
export function createClient(url: string, key: string, options: Options = {}): SupabaseClient {
  const real = createRealClient(url, key, { ...options, auth: { persistSession: false, autoRefreshToken: false, ...(options.auth ?? {}) } });
  const callerP = resolveCaller(key, options);
  callerP.catch(() => {}); // surfaced per query instead
  const authorization = options.global?.headers?.Authorization ?? options.global?.headers?.authorization;

  const client = {
    from: (table: string) => builder(callerP, table),
    schema: (name: string) => {
      if (name !== "public") throw new Error(`schema ${name} is not served by the Prisma API`);
      return { from: (table: string) => builder(callerP, table) };
    },
    rpc: async (fn: string, args: Record<string, unknown> = {}): Promise<Result> => {
      try {
        const caller = await callerP;
        return ok(await asCaller(caller, (tx) => callFunction(tx, fn, args)));
      } catch (e) {
        if ((e as { code?: string })?.code === "PGRST202") return fail(404, "PGRST202", String((e as Error).message));
        return toResult(e);
      }
    },
    auth: real.auth,
    storage: real.storage,
    functions: {
      invoke: async (name: string, opts: { body?: unknown; headers?: Record<string, string> } = {}) => {
        const { invokeFunction } = await import("../functions/invoke.js");
        const headers = new Headers(opts.headers);
        if (!headers.has("authorization")) headers.set("authorization", authorization ?? `Bearer ${key}`);
        return invokeFunction(name, opts.body, headers);
      },
    },
  };
  return client as unknown as SupabaseClient;
}
