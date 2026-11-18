/**
 * Public event listing: the query behind /events (EventsListingPage), moved
 * to the server. Runs as the caller, so the events table's row security
 * ("View published events") decides what's visible, as it does today.
 */
import { z } from "zod";
import type { Tx } from "../db/caller.js";

export const listEventsInput = z.object({
  when: z.enum(["upcoming", "past"]).default("upcoming"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  /** Cursor: the `date` of the last event of the previous page (ISO). */
  before: z.string().datetime({ offset: true }).optional(),
  after: z.string().datetime({ offset: true }).optional(),
});
export type ListEventsInput = z.infer<typeof listEventsInput>;

const select = {
  id: true, slug: true, title: true, description: true, date: true, end_date: true,
  location: true, venue: true, capacity: true, tickets_sold: true, price: true,
  currency: true, timezone: true, status: true, image_url: true, banner_landscape_url: true,
  organizations: { select: { name: true, slug: true, subdomain: true, logo_url: true } },
} as const;

export async function listPublishedEvents(tx: Tx, input: ListEventsInput, now = new Date()) {
  const past = input.when === "past";
  // Ended: end_date < now, or no end_date and start < now. Upcoming/ongoing: the opposite.
  const timeFilter = past
    ? { OR: [{ end_date: { lt: now } }, { end_date: null, date: { lt: now } }] }
    : { OR: [{ end_date: { gte: now } }, { end_date: null, date: { gte: now } }] };
  const cursor = past
    ? input.before ? { date: { lt: new Date(input.before) } } : {}
    : input.after ? { date: { gt: new Date(input.after) } } : {};
  const rows = await tx.events.findMany({
    where: { status: "published", AND: [timeFilter, cursor] },
    orderBy: [{ date: past ? "desc" : "asc" }, { id: "asc" }],
    take: input.limit + 1,
    select,
  });
  const hasMore = rows.length > input.limit;
  // numeric(10,2) arrives as a Decimal, which would reach the browser as a
  // string; the app treats price as a number, as Supabase returns it.
  const items = (hasMore ? rows.slice(0, input.limit) : rows).map((r) => ({ ...r, price: r.price == null ? null : Number(r.price) }));
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: hasMore && last?.date ? { [past ? "before" : "after"]: last.date.toISOString() } : null,
  };
}
