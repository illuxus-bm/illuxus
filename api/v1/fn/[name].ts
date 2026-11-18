// /api/v1/fn/<name>: a ported edge function (server/functions/<name>), with
// Supabase's gateway check. The function does its own CORS and auth, as it
// did on Supabase. Unported names answer 404 not_ported, and the browser then
// calls the Supabase-hosted function instead.
import { gatewayAllows, loadHandler } from "../../../server/functions/invoke.js";

async function handle(req: Request): Promise<Response> {
  const name = decodeURIComponent(new URL(req.url).pathname.split("/").filter(Boolean).pop() ?? "");
  const json = (status: number, code: string, message: string) =>
    new Response(JSON.stringify({ error: { code, message } }), { status, headers: { "Content-Type": "application/json" } });
  try {
    const handler = /^[a-z0-9-]{1,64}$/.test(name) ? await loadHandler(name) : null;
    if (!handler) return json(404, "not_ported", `Function ${name} is not served here`);
    // Preflight goes straight to the function, which answers CORS itself.
    if (req.method !== "OPTIONS" && !(await gatewayAllows(name, req.headers))) {
      return json(401, "unauthorized", "Invalid JWT");
    }
    return await handler(req);
  } catch (e) {
    // eslint-disable-next-line no-console -- stdout is the function's log sink
    console.error(JSON.stringify({ level: "error", route: `fn.${name}`, error: String((e as Error)?.message ?? e).slice(0, 500) }));
    return json(500, "internal", "Something went wrong");
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
