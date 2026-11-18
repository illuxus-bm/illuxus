/**
 * `db.from(table)`: a drop-in for `supabase.from(table)` that moves table
 * queries to the Prisma API (docs/PRISMA_MIGRATION.md).
 *
 * - VITE_DATA_BACKEND unset (the default): `db.from` IS `supabase.from`.
 *   Nothing changes.
 * - VITE_DATA_BACKEND=api: the query chain (.select().eq().order()…) is
 *   recorded and sent to /api/v1/query, which runs it through Prisma as the
 *   signed-in person, under the same grants and row security. The result has
 *   the same { data, error, count, status } shape supabase-js returns.
 *
 * When the API can't take a query, the same chain is replayed on Supabase:
 * - reads: on any failure that isn't the query's own database error;
 * - writes: only when the API says nothing ran (a shape it doesn't support
 *   yet, or the database unreachable before starting). A write whose outcome
 *   is unknown (a timeout) is reported as an error instead, never repeated,
 *   so nothing can be written twice.
 */
import { supabase } from "@/integrations/supabase/client";
import { ApiError, apiEnabled, apiFetch } from "./api-client";
import { supabaseRpc } from "@/lib/observability/rpc";

type Recorded = { m: string; a: unknown[] };

/** Methods /api/v1/query understands; any other sends the chain to Supabase. */
const SERVER_METHODS = new Set([
  "select", "insert", "upsert", "update", "delete",
  "eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in", "not", "filter", "match", "or",
  "order", "limit", "range", "single", "maybeSingle",
]);
/** Handled in the browser, not sent. */
const LOCAL_METHODS = new Set(["abortSignal", "returns", "throwOnError"]);
const WRITES = new Set(["insert", "upsert", "update", "delete"]);

type Result = { data: unknown; error: unknown; count: number | null; status: number; statusText: string };

function serializable(value: unknown): boolean {
  try {
    return JSON.stringify(value) !== undefined || value === undefined;
  } catch {
    return false;
  }
}

function replay(table: string, ops: Recorded[]): PromiseLike<Result> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- replaying arbitrary supabase-js builder calls
  let builder: any = supabase.from(table as never);
  for (const op of ops) builder = builder[op.m](...op.a);
  return builder;
}

async function execute(table: string, ops: Recorded[]): Promise<Result> {
  const local = ops.filter((o) => LOCAL_METHODS.has(o.m));
  const remote = ops.filter((o) => !LOCAL_METHODS.has(o.m));
  const signal = local.find((o) => o.m === "abortSignal")?.a[0] as AbortSignal | undefined;
  const throwOnError = local.some((o) => o.m === "throwOnError");
  const isWrite = remote.some((o) => WRITES.has(o.m));

  const legacy = async (): Promise<Result> => replay(table, ops);
  const canSend = remote.every((o) => SERVER_METHODS.has(o.m) && o.a.every(serializable));
  if (!canSend) return legacy();

  let result: Result;
  try {
    const body = await apiFetch<{ data: unknown; count: number | null; status: number; error?: unknown }>("/query", {
      method: "POST",
      body: JSON.stringify({ table, ops: remote }),
      signal,
    });
    result = { data: body.data ?? null, error: null, count: body.count ?? null, status: body.status ?? 200, statusText: "" };
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    // Refused before reaching the database: unsupported shape, bad request,
    // expired sign-in, or the database unreachable.
    const nothingRan = e.code === "unsupported_query" || e.code === "invalid_input" || e.status === 401 || e.status === 503;
    const isDbError = /^[0-9A-Z]{5}$|^PGRST/.test(e.code) && e.status >= 400 && e.status < 500;
    if (isDbError) {
      result = { data: null, error: { code: e.code, message: e.message, details: null, hint: null }, count: null, status: e.status, statusText: "" };
    } else if (!isWrite || nothingRan) {
      return legacy();
    } else {
      result = { data: null, error: { code: e.code, message: e.message, details: null, hint: null }, count: null, status: e.status, statusText: "" };
    }
  }
  if (throwOnError && result.error) throw result.error;
  return result;
}

function recorder(table: string): unknown {
  const ops: Recorded[] = [];
  let pending: Promise<Result> | null = null;
  const run = () => (pending ??= execute(table, ops));
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") return (ok?: (v: Result) => unknown, fail?: (e: unknown) => unknown) => run().then(ok, fail);
        if (prop === "catch") return (fail?: (e: unknown) => unknown) => run().catch(fail);
        if (prop === "finally") return (fn?: () => void) => run().finally(fn);
        if (typeof prop !== "string") return undefined;
        return (...args: unknown[]) => {
          ops.push({ m: prop, a: args });
          return proxy;
        };
      },
    },
  );
  return proxy;
}

export const db = {
  from: ((table: string) => (apiEnabled() ? recorder(table) : supabase.from(table as never))) as typeof supabase.from,
  /** supabase.rpc, or the API's /rpc (with Supabase as its fallback) when switched on. */
  rpc: ((fn: string, args?: Record<string, unknown>) =>
    apiEnabled() ? supabaseRpc(fn, args ?? {}) : supabase.rpc(fn as never, args as never)) as unknown as typeof supabase.rpc,
};
