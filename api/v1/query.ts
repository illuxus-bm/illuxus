// POST /api/v1/query  { table, ops }: a supabase-js query chain, run through
// Prisma as the caller (server/services/query/compile.ts). Used by
// src/lib/data/db.ts when VITE_DATA_BACKEND=api.
import { z } from "zod";
import { json, parse, route } from "../../server/http.js";
import { asCaller } from "../../server/db/caller.js";
import { runQuery, Unsupported } from "../../server/services/query/compile.js";
import { postgresError } from "../../server/services/rpc.js";

const body = z.object({
  table: z.string().regex(/^[a-z_][a-z0-9_]{0,62}$/),
  ops: z.array(z.object({ m: z.string().max(32), a: z.array(z.unknown()).max(4) })).min(1).max(100),
});

export const POST = route("query", {
  POST: async ({ req, caller }) => {
    const input = parse(body, await req.json().catch(() => null));
    try {
      const result = await asCaller(caller, (tx) => runQuery(tx, input.table, input.ops));
      return json(result, { status: result.error ? result.status : 200 });
    } catch (e) {
      // Not handled here yet: nothing ran, so the browser sends it to Supabase.
      if (e instanceof Unsupported) return json({ error: { code: "unsupported_query", message: e.message } }, { status: 422 });
      const pg = postgresError(e);
      if (!pg) throw e;
      return json({ data: null, count: null, status: pg.status, error: pg }, { status: pg.status });
    }
  },
});
export const OPTIONS = POST;
