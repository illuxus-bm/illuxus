// GET /api/v1/health: is the API up, and can it reach its database?
import { route } from "../../server/http.js";
import { prisma } from "../../server/db/client.js";

export const GET = route("health", {
  GET: async () => {
    const started = Date.now();
    await prisma().$queryRaw`SELECT 1`;
    return { ok: true, database: "reachable", ms: Date.now() - started };
  },
});
export const OPTIONS = GET;
