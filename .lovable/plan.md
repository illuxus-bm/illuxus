## 1. Currency exchange refresh every 5 minutes

Tighten the FX cache so rates stay fresh on both server and client:

- `supabase/functions/fx-rates/index.ts`: reduce in-memory `TTL_MS` to 5 min and set `Cache-Control: public, max-age=300`.
- `src/lib/fx.ts`: reduce `STORAGE_TTL_MS` to 5 min, and in `useFxRates`, add a `setInterval` (every 5 min) plus a `visibilitychange` listener that re-runs `loadRates()` and updates state. Clear the in-module `memo` on each refresh so all consumers pick up new values.

This means: cached up to 5 min, then auto-refetched while the app is open.

## 2. Remove the "weird box" selection on Analytics

Recharts SVG elements (bars, pie slices, lines) show a default focus/selection outline (a dashed/blue box) when clicked. Add `outline-none` and disable focus rings on chart primitives in `src/pages/dashboard/AnalyticsPage.tsx`:

- Wrap each chart container with `className="focus:outline-none [&_*]:outline-none [&_.recharts-wrapper]:outline-none [&_.recharts-surface]:outline-none"`.
- On `<Bar>`, `<Pie>`, `<Line>`, `<Cell>` add `style={{ outline: "none" }}` and remove `activeDot`/`activeShape` focus default by passing `isAnimationActive` unchanged but adding `tabIndex={-1}` on the ResponsiveContainer wrapper div.
- Also disable text selection on chart cards (`select-none` on the chart card wrapper) so dragging on the chart doesn't paint a text-selection rectangle.

## 3. Better, richer Analytics

Rework `src/pages/dashboard/AnalyticsPage.tsx` into a more informative dashboard. Existing KPIs stay; new additions:

### Filters bar (top)
- Time range pills: 7d / 30d / 90d / YTD / All (default 30d).
- Event filter dropdown (All events / specific event).
- Keep `CurrencySwitcher`.

### Expanded KPI row (8 cards in 2 rows of 4)
1. Total Revenue (with % change vs previous period)
2. Tickets Sold (with % change)
3. Avg. Ticket Price
4. Conversion: paid / total registrations
5. Total Events
6. Published Events
7. Upcoming Events (date > now)
8. Check-in Rate (checked_in / paid)

Each card shows a small sparkline (Recharts `<LineChart>` mini) of the last N periods and a colored delta chip (green/red).

### Charts grid
- Revenue & Tickets dual-axis area chart (replaces current line chart, with gradient fills).
- Revenue by Event (existing bar chart, kept).
- Registration status breakdown (pie): confirmed / pending / cancelled / refunded.
- Top 5 events table: name, tickets, revenue, fill rate (sold / capacity if available), check-in %.
- Day-of-week heatmap: which weekdays bring most registrations (simple Recharts bar with 7 bars).
- Cumulative revenue area chart for the selected range.

### Data layer
Extend the Supabase query to also pull `ticket_types` (for capacity) and `status='checked_in'` counts. Add helper functions `withinRange()`, `previousPeriod()`, and `pctChange()` at top of file. Memoize aggregations with `useMemo` keyed on `[registrations, events, range, eventFilter, displayCcy, rates]`.

### Styling
Reuse existing card token (`bg-card border border-border rounded-xl`), keep monochrome Linear/Vercel aesthetic, JetBrains Mono for numeric KPIs (per project Core memory). No new colors outside design tokens; sparkline uses `hsl(var(--primary))` with low-opacity area fill.

## Files touched

- `supabase/functions/fx-rates/index.ts` — 5-min TTL + cache header
- `src/lib/fx.ts` — 5-min client cache + auto-refresh interval
- `src/pages/dashboard/AnalyticsPage.tsx` — outline fix + full analytics rework

No DB migrations, no new dependencies (Recharts already used).
