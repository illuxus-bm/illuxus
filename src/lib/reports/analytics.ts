// The numbers behind the organiser's Reports page. Every figure is worked out on one slice (events, state, dates), in the reader's local days.

export type RegState = "confirmed" | "pending" | "waitlisted" | "declined" | "cancelled";

// Fixed order, so a state keeps its place and colour whatever its size.
export const REG_STATES: readonly RegState[] = ["confirmed", "pending", "waitlisted", "declined", "cancelled"];

export const REG_STATE_LABEL: Record<RegState, string> = {
  confirmed: "Confirmed",
  pending: "Awaiting approval",
  waitlisted: "Waitlisted",
  declined: "Declined",
  cancelled: "Cancelled",
};

export interface ReportRegistration {
  event_id: string;
  status: string;
  approval_status: string | null;
  amount_paid: number | string | null;
  checked_in: boolean | null;
  created_at: string;
}

export interface ReportEvent {
  id: string;
  title: string;
  date: string;
  status: string;
  currency: string | null;
  capacity: number | null;
}

// `status` defaults to "confirmed" even for a declined or waitlisted guest, so both columns decide the state.
export function registrationState(r: Pick<ReportRegistration, "status" | "approval_status">): RegState {
  if (r.status === "cancelled") return "cancelled";
  if (r.approval_status === "declined") return "declined";
  if (r.approval_status === "waitlisted") return "waitlisted";
  if (r.approval_status === "pending" || r.status === "pending") return "pending";
  return "confirmed";
}

// A sold ticket, by the same rule the database uses for `events.tickets_sold` (migration 009).
export const holdsSeat = (state: RegState) => state === "confirmed" || state === "pending";

// ─── The period ───────────────────────────────────────────────────────────────

export type RangeKey = "7d" | "30d" | "90d" | "ytd" | "all";

export interface ReportWindow {
  /** Null for all time. */
  start: Date | null;
  /** The period it is compared with; null for all time. */
  prevStart: Date | null;
  prevEnd: Date | null;
  compareLabel: string | null;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
// Through the calendar, not milliseconds, so a daylight-saving change cannot move it off midnight.
const shiftDays = (d: Date, days: number) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());

// "30d" is today and the 29 days before it; the earlier period stops at the same time of day, so today's part-day is compared like for like.
export function reportWindow(range: RangeKey, now: Date): ReportWindow {
  if (range === "all") return { start: null, prevStart: null, prevEnd: null, compareLabel: null };
  if (range === "ytd") {
    return {
      start: new Date(now.getFullYear(), 0, 1),
      prevStart: new Date(now.getFullYear() - 1, 0, 1),
      prevEnd: new Date(now.getFullYear() - 1, now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds()),
      compareLabel: "same period last year",
    };
  }
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const start = shiftDays(startOfDay(now), -(days - 1));
  return { start, prevStart: shiftDays(start, -days), prevEnd: shiftDays(now, -days), compareLabel: `previous ${days} days` };
}

/** Percent change; null when the earlier period has nothing to compare with. */
export function pctChange(curr: number, prev: number): number | null {
  if (!(prev > 0)) return null;
  return ((curr - prev) / prev) * 100;
}

// ─── Time buckets for the trend ───────────────────────────────────────────────

export type Granularity = "day" | "week" | "month";

export interface TrendBucket {
  /** Local date the bucket starts on, `YYYY-MM-DD`. */
  key: string;
  start: Date;
  label: string;
  longLabel: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-US", opts);

function bucketStart(d: Date, granularity: Granularity): Date {
  if (granularity === "month") return new Date(d.getFullYear(), d.getMonth(), 1);
  const day = startOfDay(d);
  // Weeks run Monday to Sunday.
  return granularity === "week" ? shiftDays(day, -((day.getDay() + 6) % 7)) : day;
}

function nextBucket(d: Date, granularity: Granularity): Date {
  if (granularity === "month") return new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return shiftDays(d, granularity === "week" ? 7 : 1);
}

// Every bucket between two dates, none left out: a day with no registrations is a zero, not a gap.
export function trendBuckets(from: Date, to: Date): { granularity: Granularity; buckets: TrendBucket[] } {
  const spanDays = Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000) + 1;
  const granularity: Granularity = spanDays <= 92 ? "day" : spanDays <= 400 ? "week" : "month";
  const crossesYears = from.getFullYear() !== to.getFullYear();

  const buckets: TrendBucket[] = [];
  for (let d = bucketStart(from, granularity); d.getTime() <= to.getTime(); d = nextBucket(d, granularity)) {
    let label: string;
    let longLabel: string;
    if (granularity === "month") {
      label = crossesYears ? `${fmt(d, { month: "short" })} '${String(d.getFullYear()).slice(2)}` : fmt(d, { month: "short" });
      longLabel = fmt(d, { month: "long", year: "numeric" });
    } else {
      label = fmt(d, { month: "short", day: "numeric" });
      longLabel = granularity === "week"
        ? `Week of ${fmt(d, { month: "short", day: "numeric", year: "numeric" })}`
        : fmt(d, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
    }
    buckets.push({ key: dayKey(d), start: d, label, longLabel });
  }
  return { granularity, buckets };
}

// ─── The report ───────────────────────────────────────────────────────────────

export interface TrendPoint extends TrendBucket {
  registrations: number;
  tickets: number;
  revenue: number;
  cumulativeRevenue: number;
}

export interface EventPerformance {
  id: string;
  title: string;
  registrations: number;
  tickets: number;
  revenue: number;
  checkedIn: number;
  /** Tickets at an event that has started. */
  checkInOf: number;
  checkInRate: number | null;
  capacity: number | null;
  /** To date, whatever the period. */
  seatsTaken: number;
  fillRate: number | null;
}

export interface Report {
  window: ReportWindow;
  granularity: Granularity;
  totals: {
    registrations: number;
    tickets: number;
    confirmed: number;
    pending: number;
    revenue: number;
    paidTickets: number;
    /** Revenue per ticket sold. */
    avgTicket: number;
    confirmationRate: number | null;
  };
  previous: { registrations: number; tickets: number; revenue: number } | null;
  checkIn: { checkedIn: number; of: number; rate: number | null; eventsHeld: number };
  events: { total: number; published: number; drafts: number; upcoming: number };
  trend: TrendPoint[];
  states: { state: RegState; label: string; count: number; share: number }[];
  byEvent: EventPerformance[];
  /** Monday first. */
  weekdays: { name: string; registrations: number }[];
}

export interface ReportInput {
  /** The events in scope, and all of their registrations. */
  events: ReportEvent[];
  registrations: ReportRegistration[];
  range: RangeKey;
  state: RegState | "all";
  now: Date;
  toDisplay: (amount: number, currency: string | null) => number;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function buildReport({ events, registrations, range, state, now, toDisplay }: ReportInput): Report {
  const window = reportWindow(range, now);
  const nowMs = now.getTime();
  const startMs = window.start ? window.start.getTime() : -Infinity;
  const prevStartMs = window.prevStart ? window.prevStart.getTime() : null;
  const prevEndMs = window.prevEnd ? window.prevEnd.getTime() : null;

  const eventById = new Map(events.map((e) => [e.id, e]));
  const started = (e: ReportEvent) => new Date(e.date).getTime() <= nowMs;

  // Counted before any filter: capacity filled belongs to the event, not to the period.
  const seatsTaken = new Map<string, number>();
  const pool: { r: ReportRegistration; s: RegState; t: number; ev: ReportEvent }[] = [];
  for (const r of registrations) {
    const ev = eventById.get(r.event_id);
    if (!ev) continue;
    const s = registrationState(r);
    if (holdsSeat(s)) seatsTaken.set(ev.id, (seatsTaken.get(ev.id) ?? 0) + 1);
    if (state !== "all" && s !== state) continue;
    const t = new Date(r.created_at).getTime();
    if (Number.isFinite(t)) pool.push({ r, s, t, ev });
  }

  // All time starts at the first registration but never shows less than a month, or a new organiser gets a single dot.
  const monthAgo = shiftDays(startOfDay(now), -29);
  let from = window.start;
  if (!from) {
    const first = pool.reduce((min, p) => Math.min(min, p.t), Infinity);
    from = Number.isFinite(first) && first < monthAgo.getTime() ? startOfDay(new Date(first)) : monthAgo;
  }
  const { granularity, buckets } = trendBuckets(from, now);
  const trend: TrendPoint[] = buckets.map((b) => ({ ...b, registrations: 0, tickets: 0, revenue: 0, cumulativeRevenue: 0 }));
  const trendByKey = new Map(trend.map((p) => [p.key, p]));

  const totals = { registrations: 0, tickets: 0, confirmed: 0, pending: 0, revenue: 0, paidTickets: 0 };
  const previous = { registrations: 0, tickets: 0, revenue: 0 };
  const stateCounts = new Map<RegState, number>();
  const weekdayCounts = [0, 0, 0, 0, 0, 0, 0];
  const perEvent = new Map<string, EventPerformance>();
  const checkIn = { checkedIn: 0, of: 0 };
  const eventsHeld = new Set<string>();

  for (const { r, s, t, ev } of pool) {
    const seat = holdsSeat(s);
    // As on the event's own overview: money counts unless the registration was cancelled.
    const amount = s === "cancelled" ? 0 : toDisplay(Number(r.amount_paid) || 0, ev.currency);

    if (prevStartMs !== null && prevEndMs !== null && t >= prevStartMs && t < prevEndMs) {
      previous.registrations++;
      if (seat) previous.tickets++;
      previous.revenue += amount;
    }
    if (t < startMs) continue;

    totals.registrations++;
    stateCounts.set(s, (stateCounts.get(s) ?? 0) + 1);
    if (s === "confirmed") totals.confirmed++;
    if (s === "pending") totals.pending++;
    if (seat) totals.tickets++;
    totals.revenue += amount;
    if (amount > 0) totals.paidTickets++;

    const when = new Date(t);
    weekdayCounts[(when.getDay() + 6) % 7]++;

    const point = trendByKey.get(dayKey(bucketStart(when, granularity)));
    if (point) {
      point.registrations++;
      if (seat) point.tickets++;
      point.revenue += amount;
    }

    let row = perEvent.get(ev.id);
    if (!row) {
      const taken = seatsTaken.get(ev.id) ?? 0;
      const capacity = ev.capacity && ev.capacity > 0 ? ev.capacity : null;
      row = {
        id: ev.id, title: ev.title, registrations: 0, tickets: 0, revenue: 0,
        checkedIn: 0, checkInOf: 0, checkInRate: null,
        capacity, seatsTaken: taken, fillRate: capacity ? Math.min(100, (taken / capacity) * 100) : null,
      };
      perEvent.set(ev.id, row);
    }
    row.registrations++;
    if (seat) row.tickets++;
    row.revenue += amount;

    // Tickets for an event that has not started cannot be checked in, so they stay out of the rate.
    const checkedIn = !!r.checked_in;
    if (checkedIn || (seat && started(ev))) {
      checkIn.of++;
      row.checkInOf++;
      eventsHeld.add(ev.id);
      if (checkedIn) { checkIn.checkedIn++; row.checkedIn++; }
    }
  }

  let running = 0;
  for (const p of trend) { running += p.revenue; p.cumulativeRevenue = running; }

  const byEvent = Array.from(perEvent.values());
  for (const row of byEvent) row.checkInRate = row.checkInOf > 0 ? (row.checkedIn / row.checkInOf) * 100 : null;
  byEvent.sort((a, b) =>
    b.revenue - a.revenue || b.tickets - a.tickets || b.registrations - a.registrations || a.title.localeCompare(b.title));

  return {
    window,
    granularity,
    totals: {
      ...totals,
      avgTicket: totals.tickets > 0 ? totals.revenue / totals.tickets : 0,
      confirmationRate: totals.registrations > 0 ? (totals.confirmed / totals.registrations) * 100 : null,
    },
    previous: window.prevStart ? previous : null,
    checkIn: { ...checkIn, rate: checkIn.of > 0 ? (checkIn.checkedIn / checkIn.of) * 100 : null, eventsHeld: eventsHeld.size },
    events: {
      total: events.length,
      published: events.filter((e) => e.status === "published").length,
      drafts: events.filter((e) => e.status === "draft").length,
      upcoming: events.filter((e) => e.status !== "cancelled" && !started(e)).length,
    },
    trend,
    states: REG_STATES
      .map((s) => ({ state: s, label: REG_STATE_LABEL[s], count: stateCounts.get(s) ?? 0 }))
      .filter((s) => s.count > 0)
      .map((s) => ({ ...s, share: (s.count / totals.registrations) * 100 })),
    byEvent,
    weekdays: WEEKDAYS.map((name, i) => ({ name, registrations: weekdayCounts[i] })),
  };
}
