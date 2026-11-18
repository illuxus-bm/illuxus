// GET /api/v1/events?when=upcoming|past&limit=&after=|before=
import { json, parse, route } from "../../../server/http.js";
import { asCaller } from "../../../server/db/caller.js";
import { listEventsInput, listPublishedEvents } from "../../../server/services/events.js";

export const GET = route("events.list", {
  GET: async ({ url, caller }) => {
    const input = parse(listEventsInput, Object.fromEntries(url.searchParams));
    const page = await asCaller(caller, (tx) => listPublishedEvents(tx, input));
    // Public listing: cache briefly at the edge for anonymous visitors only.
    const cache = caller.kind === "anon" ? "public, s-maxage=60, stale-while-revalidate=300" : "private, no-store";
    return json({ data: page.items, nextCursor: page.nextCursor }, { headers: { "Cache-Control": cache } });
  },
});
export const OPTIONS = GET;
