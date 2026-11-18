/**
 * Calls a public SQL function the way Supabase's REST API (PostgREST) does,
 * so every `supabaseRpc()` call in the app can move to the Prisma API with
 * no change at the call site.
 *
 * Same exposure as PostgREST: any function in the public schema, run as the
 * caller (asCaller), so EXECUTE grants and row security decide exactly as
 * they do today. Function and argument names are checked against the
 * catalog; argument values are bind parameters; types come from the catalog.
 */
import type { Tx } from "../db/caller.js";
import { HttpError } from "../http.js";

type Arg = { name: string; type: string; isArray: boolean; isJson: boolean };
type Fn = { args: Arg[]; requiredCount: number; returnsSet: boolean; returnsVoid: boolean };

const NAME = /^[a-z_][a-z0-9_]{0,62}$/;

// Catalog lookups are cached per function instance; the schema changes only on deploys.
const catalog = new Map<string, { at: number; fns: Fn[] }>();
const CATALOG_TTL_MS = 5 * 60_000;

type CatalogRow = {
  arg_names: string[] | null;
  arg_types: string[];
  arg_modes: string[] | null;
  nargdefaults: number;
  proretset: boolean;
  rettype: string;
  is_trigger: boolean;
};

async function overloads(tx: Tx, name: string): Promise<Fn[]> {
  const hit = catalog.get(name);
  if (hit && Date.now() - hit.at < CATALOG_TTL_MS) return hit.fns;
  const rows = await tx.$queryRaw<CatalogRow[]>`
    SELECT p.proargnames AS arg_names,
           ARRAY(SELECT format_type(u.t, NULL) FROM unnest(p.proargtypes) WITH ORDINALITY AS u(t, i) ORDER BY u.i) AS arg_types,
           p.proargmodes::text[] AS arg_modes,
           p.pronargdefaults::int AS nargdefaults,
           p.proretset,
           format_type(p.prorettype, NULL) AS rettype,
           p.prorettype = 'trigger'::regtype AS is_trigger
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ${name} AND p.prokind = 'f'`;
  const fns = rows
    .filter((r) => !r.is_trigger)
    .map((r): Fn => {
      // proargnames lists IN, OUT and TABLE columns; proargtypes only the inputs.
      const names = r.arg_names ?? [];
      const modes = r.arg_modes ?? names.map(() => "i");
      const inputNames = names.filter((_, i) => modes[i] === "i" || modes[i] === "b" || modes[i] === "v");
      const args = r.arg_types.map((type, i) => ({
        name: inputNames[i] ?? "",
        type,
        isArray: type.endsWith("[]"),
        isJson: type === "json" || type === "jsonb",
      }));
      return {
        args,
        requiredCount: args.length - Number(r.nargdefaults),
        returnsSet: r.proretset,
        returnsVoid: r.rettype === "void",
      };
    });
  catalog.set(name, { at: Date.now(), fns });
  return fns;
}

function pick(fns: Fn[], keys: string[]): Fn {
  const fits = fns.filter((f) => {
    const names = new Set(f.args.map((a) => a.name));
    if (!keys.every((k) => names.has(k))) return false;
    return f.args.slice(0, f.requiredCount).every((a) => keys.includes(a.name));
  });
  if (fits.length === 0) {
    throw new HttpError(404, "Could not find the function with those arguments", "PGRST202");
  }
  // Like PostgREST: the overload that matches the given arguments most closely.
  return fits.sort((a, b) => a.args.length - b.args.length)[0];
}

/** SQL that turns one jsonb bind parameter into the argument's type. */
function argSql(arg: Arg, n: number): string {
  if (arg.isJson) return `$${n}::jsonb::${arg.type}`;
  if (arg.isArray) return `ARRAY(SELECT jsonb_array_elements_text($${n}::jsonb))::${arg.type}`;
  return `($${n}::jsonb #>> '{}')::${arg.type}`;
}

export async function callFunction(tx: Tx, name: string, params: Record<string, unknown>): Promise<unknown> {
  if (!NAME.test(name)) throw new HttpError(400, "Invalid function name", "invalid_input");
  const keys = Object.keys(params);
  if (keys.some((k) => !NAME.test(k))) throw new HttpError(400, "Invalid argument name", "invalid_input");

  const fn = pick(await overloads(tx, name), keys);
  const byName = new Map(fn.args.map((a) => [a.name, a]));
  const values = keys.map((k) => JSON.stringify(params[k] ?? null));
  // Names were checked against NAME and the catalog; values are bind parameters.
  const call = `public.${name}(${keys.map((k, i) => `${k} => ${argSql(byName.get(k)!, i + 1)}`).join(", ")})`;

  if (fn.returnsVoid) {
    // A statement, not a query: Prisma has no way to read a void column back.
    await tx.$executeRawUnsafe(`SELECT ${call}`, ...values);
    return null;
  }
  if (fn.returnsSet) {
    const rows = await tx.$queryRawUnsafe<{ result: unknown }[]>(
      `SELECT coalesce(json_agg(r), '[]'::json) AS result FROM ${call} AS r`,
      ...values,
    );
    return rows[0]?.result ?? [];
  }
  const rows = await tx.$queryRawUnsafe<{ result: unknown }[]>(`SELECT to_json(${call}) AS result`, ...values);
  return rows[0]?.result ?? null;
}

type PgError = { status: number; code: string; message: string; details?: string; hint?: string };

/**
 * A Postgres error raised by the function, in PostgREST's shape, so call
 * sites that read error.code ('23505', '42501', 'P0001', …) or show
 * error.message behave the same. Null for anything that isn't a
 * user-facing database error: those stay opaque 500s.
 */
export function postgresError(e: unknown): PgError | null {
  const err = e as { meta?: Record<string, unknown>; message?: string } | null;
  const adapter = err?.meta?.driverAdapterError as { cause?: Record<string, unknown> } | undefined;
  const cause = adapter?.cause ?? {};
  const sqlstate = String(cause.originalCode ?? err?.meta?.code ?? "");
  if (!/^[0-9A-Z]{5}$/.test(sqlstate)) return null;
  const status =
    sqlstate === "42501" ? 403
      : sqlstate.startsWith("23") ? 409
        : sqlstate.startsWith("P0") || sqlstate.startsWith("22") || sqlstate.startsWith("28") ? 400
          : sqlstate === "57014" ? 504
            : 0;
  if (!status) return null;
  return {
    status,
    code: sqlstate,
    message: String(cause.originalMessage ?? err?.meta?.message ?? "Database error"),
    ...(cause.detail ? { details: String(cause.detail) } : {}),
    ...(cause.hint ? { hint: String(cause.hint) } : {}),
  };
}
