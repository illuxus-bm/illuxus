import { describe, expect, it } from "vitest";
import {
  buildReport, holdsSeat, pctChange, registrationState, reportWindow, trendBuckets,
  type ReportEvent, type ReportRegistration, type RegState,
} from "@/lib/reports/analytics";

// Tuesday 13 October 2026, 15:00 in whatever zone the tests run in.
const NOW = new Date(2026, 9, 13, 15, 0, 0);
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).toISOString();

const event = (id: string, over: Partial<ReportEvent> = {}): ReportEvent => ({
  id, title: `Event ${id}`, date: at(2026, 9, 1), status: "published", currency: "INR", capacity: 100, ...over,
});
const reg = (event_id: string, created_at: string, over: Partial<ReportRegistration> = {}): ReportRegistration => ({
  event_id, created_at, status: "confirmed", approval_status: "approved", amount_paid: 0, checked_in: false, ...over,
});
const report = (events: ReportEvent[], registrations: ReportRegistration[], over: Partial<Parameters<typeof buildReport>[0]> = {}) =>
  buildReport({ events, registrations, range: "30d", state: "all", now: NOW, toDisplay: (amount) => amount, ...over });
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("registrationState", () => {
  it("reads both columns, cancellation first", () => {
    const cases: [string, string | null, RegState][] = [
      ["confirmed", "approved", "confirmed"],
      ["confirmed", null, "confirmed"],
      ["confirmed", "pending", "pending"],
      ["pending", "approved", "pending"],
      ["confirmed", "waitlisted", "waitlisted"],
      ["confirmed", "declined", "declined"],
      ["cancelled", "approved", "cancelled"],
      ["cancelled", "declined", "cancelled"],
    ];
    for (const [status, approval_status, expected] of cases) {
      expect(registrationState({ status, approval_status })).toBe(expected);
    }
  });

  it("counts a seat exactly when the database's tickets_sold rule does", () => {
    for (const status of ["confirmed", "pending", "cancelled"]) {
      for (const approval_status of ["approved", "pending", "waitlisted", "declined", null]) {
        const sold = status !== "cancelled" && !["declined", "waitlisted"].includes(approval_status ?? "approved");
        expect(holdsSeat(registrationState({ status, approval_status }))).toBe(sold);
      }
    }
  });
});

describe("reportWindow", () => {
  it("covers whole calendar days, from local midnight", () => {
    const w = reportWindow("7d", NOW);
    expect(w.start).toEqual(new Date(2026, 9, 7, 0, 0, 0));
    expect(w.prevStart).toEqual(new Date(2026, 8, 30, 0, 0, 0));
    expect(w.prevEnd).toEqual(new Date(2026, 9, 6, 15, 0, 0));
    expect(w.compareLabel).toBe("previous 7 days");
  });

  it("compares the year so far with the same days last year", () => {
    const w = reportWindow("ytd", NOW);
    expect(w.start).toEqual(new Date(2026, 0, 1));
    expect(w.prevStart).toEqual(new Date(2025, 0, 1));
    expect(w.prevEnd).toEqual(new Date(2025, 9, 13, 15, 0, 0));
  });

  it("has nothing to compare all time with", () => {
    expect(reportWindow("all", NOW)).toEqual({ start: null, prevStart: null, prevEnd: null, compareLabel: null });
  });
});

describe("pctChange", () => {
  it("is null without a baseline, not +100%", () => {
    expect(pctChange(12, 0)).toBeNull();
    expect(pctChange(0, 0)).toBeNull();
    expect(pctChange(15, 10)).toBe(50);
    expect(pctChange(5, 10)).toBe(-50);
  });
});

describe("trendBuckets", () => {
  it("lists every day, including the empty ones", () => {
    const { granularity, buckets } = trendBuckets(new Date(2026, 9, 7), NOW);
    expect(granularity).toBe("day");
    expect(buckets.map((b) => b.key)).toEqual([
      "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13",
    ]);
    expect(buckets[6].label).toBe("Oct 13");
    expect(buckets[6].longLabel).toBe("Tue, Oct 13, 2026");
  });

  it("goes by week, Monday first, beyond three months", () => {
    const { granularity, buckets } = trendBuckets(new Date(2026, 0, 1), NOW);
    expect(granularity).toBe("week");
    expect(buckets[0].key).toBe("2025-12-29");
    expect(buckets.every((b) => b.start.getDay() === 1)).toBe(true);
    expect(buckets[buckets.length - 1].key).toBe("2026-10-12");
  });

  it("goes by month beyond a year, and says which year", () => {
    const { granularity, buckets } = trendBuckets(new Date(2025, 2, 20), NOW);
    expect(granularity).toBe("month");
    expect(buckets[0].key).toBe("2025-03-01");
    expect(buckets[0].label).toBe("Mar '25");
    expect(buckets).toHaveLength(20);
  });
});

describe("buildReport", () => {
  it("does not count declined, waitlisted or cancelled registrations as tickets", () => {
    const r = report([event("a")], [
      reg("a", at(2026, 10, 10), { amount_paid: 500 }),
      reg("a", at(2026, 10, 10), { approval_status: "pending" }),
      reg("a", at(2026, 10, 11), { approval_status: "waitlisted" }),
      reg("a", at(2026, 10, 11), { approval_status: "declined" }),
      reg("a", at(2026, 10, 12), { status: "cancelled", amount_paid: 500 }),
    ]);
    expect(r.totals.registrations).toBe(5);
    expect(r.totals.tickets).toBe(2);
    expect(r.totals.confirmed).toBe(1);
    expect(r.totals.pending).toBe(1);
    expect(r.totals.revenue).toBe(500);
    expect(r.totals.avgTicket).toBe(250);
    expect(r.totals.confirmationRate).toBe(20);
    expect(r.states.map((s) => [s.state, s.count])).toEqual([
      ["confirmed", 1], ["pending", 1], ["waitlisted", 1], ["declined", 1], ["cancelled", 1],
    ]);
  });

  it("puts a local day's registrations in one bucket, whatever the UTC date", () => {
    const r = report([event("a")], [
      reg("a", at(2026, 10, 12, 0, 30)),
      reg("a", at(2026, 10, 12, 10, 0)),
      reg("a", at(2026, 10, 12, 23, 30)),
    ], { range: "7d" });
    expect(r.trend.map((p) => p.registrations)).toEqual([0, 0, 0, 0, 0, 3, 0]);
    expect(r.weekdays.find((d) => d.name === "Mon")?.registrations).toBe(3);
  });

  it("makes every breakdown add up to the headline figures", () => {
    const events = [event("a", { currency: "INR" }), event("b", { currency: "USD" })];
    const regs = [
      reg("a", at(2026, 10, 1), { amount_paid: 1000 }),
      reg("a", at(2026, 10, 5), { amount_paid: 1000, checked_in: true }),
      reg("a", at(2026, 10, 9), { approval_status: "declined" }),
      reg("b", at(2026, 10, 9), { amount_paid: 10 }),
      reg("b", at(2026, 10, 13, 9), { amount_paid: 10, status: "cancelled" }),
      reg("b", at(2026, 8, 1), { amount_paid: 10 }),
    ];
    const r = report(events, regs, { toDisplay: (amount, ccy) => (ccy === "USD" ? amount * 80 : amount) });

    expect(r.totals.registrations).toBe(5);
    expect(r.totals.revenue).toBe(2800);
    expect(sum(r.trend.map((p) => p.registrations))).toBe(r.totals.registrations);
    expect(sum(r.trend.map((p) => p.tickets))).toBe(r.totals.tickets);
    expect(sum(r.trend.map((p) => p.revenue))).toBe(r.totals.revenue);
    expect(r.trend[r.trend.length - 1].cumulativeRevenue).toBe(r.totals.revenue);
    expect(sum(r.states.map((s) => s.count))).toBe(r.totals.registrations);
    expect(sum(r.weekdays.map((d) => d.registrations))).toBe(r.totals.registrations);
    expect(sum(r.byEvent.map((e) => e.registrations))).toBe(r.totals.registrations);
    expect(sum(r.byEvent.map((e) => e.tickets))).toBe(r.totals.tickets);
    expect(sum(r.byEvent.map((e) => e.revenue))).toBe(r.totals.revenue);
    expect(r.byEvent.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("applies the dates to the status and per-event breakdowns too", () => {
    const r = report([event("a"), event("b")], [
      reg("a", at(2026, 10, 12)),
      reg("a", at(2026, 5, 1), { status: "cancelled" }),
      reg("b", at(2026, 5, 1), { amount_paid: 900 }),
    ], { range: "7d" });
    expect(r.states.map((s) => s.state)).toEqual(["confirmed"]);
    expect(r.byEvent.map((e) => e.id)).toEqual(["a"]);
    expect(r.totals.revenue).toBe(0);
  });

  it("compares with the period before, like for like", () => {
    const r = report([event("a")], [
      reg("a", at(2026, 10, 10), { amount_paid: 300 }),
      reg("a", at(2026, 10, 12), { amount_paid: 300 }),
      reg("a", at(2026, 10, 13, 9), { amount_paid: 300 }),
      reg("a", at(2026, 10, 2), { amount_paid: 200 }),
      reg("a", at(2026, 10, 6, 14, 0), { amount_paid: 200 }),
      reg("a", at(2026, 10, 6, 16, 0), { amount_paid: 200 }),
      reg("a", at(2026, 9, 29), { amount_paid: 200 }),
    ], { range: "7d" });
    expect(r.totals.tickets).toBe(3);
    expect(r.previous).toEqual({ registrations: 2, tickets: 2, revenue: 400 });
    expect(pctChange(r.totals.revenue, r.previous!.revenue)).toBe(125);
  });

  it("has no earlier period for all time, and starts at the first registration", () => {
    const r = report([event("a")], [reg("a", at(2026, 6, 15)), reg("a", at(2026, 10, 12))], { range: "all" });
    expect(r.previous).toBeNull();
    expect(r.totals.registrations).toBe(2);
    expect(r.granularity).toBe("week");
    expect(r.trend[0].key).toBe("2026-06-15");
    expect(sum(r.trend.map((p) => p.registrations))).toBe(2);
  });

  it("still draws a month when all time holds almost nothing", () => {
    const r = report([event("a")], [reg("a", at(2026, 10, 13, 9))], { range: "all" });
    expect(r.trend).toHaveLength(30);
    expect(r.trend[29].registrations).toBe(1);
  });

  it("leaves events that have not started out of the check-in rate", () => {
    const held = event("held", { date: at(2026, 10, 1) });
    const later = event("later", { date: at(2026, 11, 20) });
    const r = report([held, later], [
      reg("held", at(2026, 9, 20), { checked_in: true }),
      reg("held", at(2026, 9, 21)),
      reg("held", at(2026, 9, 22), { approval_status: "declined" }),
      reg("later", at(2026, 10, 2)),
      reg("later", at(2026, 10, 3)),
    ]);
    expect(r.checkIn).toEqual({ checkedIn: 1, of: 2, rate: 50, eventsHeld: 1 });
    expect(r.byEvent.find((e) => e.id === "held")?.checkInRate).toBe(50);
    expect(r.byEvent.find((e) => e.id === "later")?.checkInRate).toBeNull();
    expect(r.events).toEqual({ total: 2, published: 2, drafts: 0, upcoming: 1 });
  });

  it("has no check-in rate, not 0%, before any event starts", () => {
    const r = report([event("later", { date: at(2026, 11, 20) })], [reg("later", at(2026, 10, 2))]);
    expect(r.checkIn.rate).toBeNull();
    expect(r.checkIn.eventsHeld).toBe(0);
  });

  it("measures capacity filled over all time, whatever the dates or state", () => {
    const regs = [
      ...Array.from({ length: 30 }, () => reg("a", at(2026, 3, 1))),
      reg("a", at(2026, 3, 2), { status: "cancelled" }),
      reg("a", at(2026, 10, 12)),
    ];
    const recent = report([event("a", { capacity: 50 })], regs, { range: "7d" });
    expect(recent.byEvent[0].tickets).toBe(1);
    expect(recent.byEvent[0].seatsTaken).toBe(31);
    expect(recent.byEvent[0].fillRate).toBe(62);

    const cancelled = report([event("a", { capacity: 50 })], regs, { range: "all", state: "cancelled" });
    expect(cancelled.totals.registrations).toBe(1);
    expect(cancelled.totals.tickets).toBe(0);
    expect(cancelled.byEvent[0].fillRate).toBe(62);
    expect(report([event("a", { capacity: 0 })], regs).byEvent[0].fillRate).toBeNull();
  });

  it("ignores registrations of events outside the scope", () => {
    const r = report([event("a")], [reg("a", at(2026, 10, 12)), reg("other", at(2026, 10, 12), { amount_paid: 999 })]);
    expect(r.totals.registrations).toBe(1);
    expect(r.totals.revenue).toBe(0);
  });
});
