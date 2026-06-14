---
inclusion: always
---

# illuxus — project overview for AI agents

This file is auto-included on every interaction. It exists so any AI session has the
project's architecture and conventions without re-discovering them. Keep it short
and factual; long-form docs live in `README.md`, `ROADMAP.md`, and `docs/`.

## What illuxus is

A Lu.ma-style events platform: organizers run branded events, sell tickets, check
attendees in/out via QR, host LiveKit webinars, and grow communities around their
events. Single-page React app, Supabase backend (Postgres + Realtime + Storage +
Edge Functions), Sentry-compatible observability.

## Stack

- Vite 5 + React 18 + TypeScript 5, Tailwind 3 + shadcn/ui
- TanStack Query v5 for server state; React Context for app-wide auth/org/theme
- `react-router-dom` v6, route-level code-splitting
- `react-hook-form` + `zod` for forms; Recharts; `@dnd-kit`; `framer-motion`
- LiveKit (`@livekit/components-react`) for live video
- Supabase JS v2; Sentry for remote sink
- Vitest + `fast-check` (property-based) + Playwright (e2e + visual)
- **Bun is the canonical package manager.** Use `bun run …`, not `npm` or `pnpm`.

## Hard rules

- **Never call `console.*`.** ESLint enforces `no-console: error`. The single
  permitted exception is the contractual `console.warn('UI sync failure')` in
  `src/components/event/RegistrationsSection.tsx`.
- **Never call `supabase.rpc(...)` directly.** Use `supabaseRpc` from
  `@/lib/observability` so every RPC carries a correlation id and is logged with
  duration and result.
- **Use `logger` from `@/lib/observability`** for any logging. It scrubs PII and
  buffers offline.
- **Don't edit `src/components/ui/`** primitives casually — they're shadcn-generated.
  Wrap in feature components.
- **Don't edit `src/integrations/supabase/types.ts` by hand** — regenerate after a
  migration.
- **Don't string-concat org/event URLs.** Use the builders in `src/lib/event-routes.ts`.
- **Don't hardcode public domains.** Share/preview URL builders read from
  `VITE_PUBLIC_DOMAIN` / `VITE_PUBLIC_PUBLISHED_HOST` / `VITE_PUBLIC_ORIGIN` and
  fall back to `window.location.origin`. Never inline `illuxus.com` or any other
  host into a component.
- **Money never uses raw `Intl.NumberFormat`** at the call site. Use `formatMoney`
  from `@/lib/currency`. It already handles invalid currency codes.
- **Datetimes are stored UTC and rendered in event-local time** via helpers in
  `@/lib/datetime`. Don't reach for `new Date().toLocaleString()` in product code.

## Where things live

```
src/
├── App.tsx                         route table + auth/org/profile gates
├── components/
│   ├── ui/                         shadcn primitives
│   ├── event/                      organizer event-management surfaces
│   ├── community/                  community feed/comments/notifications/layout
│   ├── webinar/                    LiveKit stage, lobby, branding, analytics
│   └── …                           public marketing components
├── pages/                          route components, mirrors the URL tree
├── contexts/                       AuthContext, OrgContext, ThemeContext
├── hooks/                          app-wide + community/* feature hooks
└── lib/
    ├── observability/              logger, sinks, redaction, rpc wrapper, boundaries
    ├── attendance/                 pure state machine + 13 fast-check property tests
    ├── community/                  rbac + shared types
    ├── currency.ts, fx.ts          money + 5-minute cached exchange rates
    ├── datetime.ts, timezones.ts   time helpers
    ├── event-routes.ts             canonical URL builders
    ├── ticket-pdf, print-badges    PDF generation
    └── …
supabase/
├── migrations/                     001 → 007 (tables, fns, attendance, community)
└── functions/                      LiveKit suite, email, fx, recordings, etc.
```

## Auth + gating model

`AuthProvider` → `OrgProvider` → `ProfileGate` → role gate. App.tsx defines:

- `RequireAuthOnly` — auth only (used by `/complete-profile` to avoid loops)
- `AttendeeRoute` — auth + profile complete
- `OrganizerRoute` — auth + profile + redirects attendees to `/u/me/events`
- `ProtectedRoute` — auth + profile + org gate
- `SuperAdminRoute` — auth + profile + `isAdmin`

`OnboardingGuard` sits inside organizer routes and pushes users without an org to
`/onboarding`.

## Observability layer (mandatory)

Every UI + RPC error path flows through `src/lib/observability/`:

- `logger.{trace,debug,info,warn,error,fatal}(message, fields?)`
- `supabaseRpc(client, name, params)` — wrapper around `supabase.rpc`; sets
  `x-correlation-id`, threads the id through the resulting promise, logs in dev.
- `RootErrorBoundary` wraps the app; `RouteErrorBoundary` wraps each route.
- Boot buffer (max 64 records) catches logs before the real Logger loads and flushes
  on init.
- Privacy opt-out: `VITE_OBSERVABILITY_OPT_OUT=1` (build) or
  `localStorage:observability:opt-out` (per-user).

## Attendance (special status)

`src/lib/attendance/applyAttendance.ts` is a pure TS port of the SQL
`_apply_attendance` helper, fully covered by 13 fast-check property tests in
`src/lib/attendance/__tests__/property-*.pbt.test.ts`. **Any change to the SQL
helper must mirror the TS port and vice versa.** Use the existing PBTs as the
contract.

State machine: `attendance_state ∈ {"never", "inside", "outside"}`. Transitions are
recorded into `attendance_events` (`kind ∈ {"in", "out", "auto_out"}`).

## Spec workflow

In-flight specs live under `.kiro/specs/<feature-name>/` with `requirements.md`,
`design.md`, and `tasks.md`. Current specs:

- `observability-foundation` — Phases A–E shipped, Phase F (prod DSN + canary) open.
- `checkin-checkout-tabs` — DB + state machine + UI + cleanup done; component tests
  open.

Always check `tasks.md` for status before claiming work. Don't restart finished
phases.

## Property-based testing

When behavior has a clear invariant — state machines, idempotence, ordering,
redaction, offline-queue draining — write a `fast-check` property test, not (only) a
hand-rolled example test. Pattern off the existing PBT files in
`src/lib/attendance/__tests__/` and `src/lib/observability/__tests__/`.

## Common foot-guns

- **Editing `pnpm-lock.yaml` or assuming pnpm.** Project uses bun.
- **Forgetting `OnboardingGuard`** on a new organizer route — users without an org
  get pushed to `/onboarding`. New organizer dashboard pages need the guard.
- **Adding a new table without regenerating `supabase/types.ts`.** Page code starts
  failing TS compile in odd places (e.g. current `event_emails` errors in
  `MarketingPage.tsx`).
- **Bypassing the route error boundary by rendering inside a `Suspense` fallback.**
  Always wrap route elements in `<RouteErrorBoundary>` per the existing pattern.
- **Reaching for raw fetch / direct Supabase clients.** Use the singleton in
  `src/integrations/supabase/client.ts` and `supabaseRpc`.

## Quickstart commands

```sh
bun install
bun run dev               # vite dev server
bun run test              # vitest single run (unit + PBT)
bun run lint              # eslint
npx playwright test       # e2e
npx playwright test tests/visual   # visual regression
```

## More context

- `README.md` — human-friendly project overview, route map, data layer
- `ROADMAP.md` — mindmap, Now/Next/Later, epics tied to code paths
- `docs/observability.md` — Logger API and conventions
- `docs/observability-privacy.md` — what is collected and how to opt out
- `.kiro/specs/<feature>/` — in-flight specs
