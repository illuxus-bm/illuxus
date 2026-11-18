// POST /api/v1/rpc/<function>: call a public SQL function as the caller.
// The browser's supabaseRpc() uses this when VITE_DATA_BACKEND=api.
import { HttpError, json, route } from "../../../server/http.js";
import { asCaller } from "../../../server/db/caller.js";
import { callFunction, postgresError } from "../../../server/services/rpc.js";

export const POST = route("rpc", {
  POST: async ({ req, url, caller }) => {
    const name = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "");
    const text = await req.text();
    let params: unknown = {};
    if (text) {
      try {
        params = JSON.parse(text);
      } catch {
        throw new HttpError(400, "Body must be JSON", "invalid_input");
      }
    }
    if (!params || typeof params !== "object" || Array.isArray(params)) {
      throw new HttpError(400, "Arguments must be a JSON object", "invalid_input");
    }
    try {
      const data = await asCaller(caller, (tx) => callFunction(tx, name, params as Record<string, unknown>));
      return json({ data });
    } catch (e) {
      const pg = postgresError(e);
      if (!pg) throw e;
      return json({ error: pg }, { status: pg.status });
    }
  },
});
export const OPTIONS = POST;
