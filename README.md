# illuxus

Events platform in the spirit of Lu.ma: organizers create branded event pages, sell
tickets, run check-in/check-out, host live webinars, and grow communities around
their events. Built as a single-page React app on top of Supabase, with a strong bias
toward observability, property-based testing, and shadcn/Linear-flavored UI.

> **For AI agents and vibecoding:** start at
> [`.kiro/steering/project-overview.md`](./.kiro/steering/project-overview.md) for
> architecture and conventions, [`ROADMAP.md`](./ROADMAP.md) for product trajectory,
> then specs under [`.kiro/specs/`](./.kiro/specs) for in-flight work.

---

## Stack at a glance

| Layer            | Choice                                                                                   |
| ---------------- | ---------------------------------------------------------------------------------------- |
| Build / dev      | Vite 5 + SWC, Bun                                                                        |
| Language         | TypeScript 5                                                                             |
| UI               | React 18, Tailwind 3, shadcn/ui (Radix primitives), Framer Motion, Sonner toasts         |
| Routing          | `react-router-dom` v6 with route-level code-splitting                                    |
| Data             | Supabase Postgres (RLS-first), Realtime, Storage, Edge Functions                         |
| Server state     | TanStack Query v5                                                                        |
| Forms            | `react-hook-form` + `zod`                                                                |
| Charts           | Recharts                                                                                 |
| Drag & drop      | `@dnd-kit`                                                                               |
| Live video       | Agora (`agora-rtc-sdk-ng`) + LiveKit (`@livekit/components-react`) for webinar stage     |
| QR / badges      | `html5-qrcode`, `qrcode.react`, `jspdf`                                                  |
| Observability    | Sentry (via DSN), unified internal Logger + RPC wrapper, Error Boundaries                |
| Tests            | Vitest, fast-check (property-based), Playwright (e2e + visual)                           |

---

## Getting started

```sh
bun install
cp .env.example .env.local   # fill in Supabase + observability values
bun run dev
```

| Script                | Purpose                                      |
| --------------------- | -------------------------------------------- |
| `bun run dev`         | Vite dev server                              |
| `bun run build`       | Production build                             |
| `bun run build:dev`   | Dev-mode build (sourcemaps, no minification) |
| `bun run preview`     | Preview a production build locally           |
| `bun run lint`        | ESLint over `src/`                           |
| `bun run test`        | Vitest single run (unit + property tests)    |
| `bun run test:watch`  | Vitest watch mode                            |
| `bun run audit:tokens`| Audits design tokens in QuickView surfaces   |

The project uses **bun** as the canonical package manager (see `bun.lock`). A
`package-lock.json` exists for npm fallback. There is no pnpm workspace; ignore the
stray `pnpm-*.yaml` files if you see them.

---

## High-level architecture

```mermaid
flowchart LR
  subgraph Client[React SPA]
    direction TB
    Routes[react-router routes]
    UI[shadcn UI]
    Query[TanStack Query]
    Obs[observability layer]
  end

  subgraph Supabase
    direction TB
    DB[(Postgres + RLS)]
    RT[Realtime channels]
    Storage[(Storage buckets)]
    Edge[Edge Functions]
  end

  subgraph External
    AG[Agora RTC]
    LK[LiveKit Cloud]
    Sentry[Sentry / DSN sink]
    FX[Open exchange rates]
  end

  Routes --> UI
  UI --> Query
  Query -->|supabaseRpc| Obs
  Obs -->|x-correlation-id| DB
  Obs -->|warn+| Sentry
  UI --> RT
  UI --> Storage
  Edge --> DB
  Edge --> AG
  Edge --> LK
  Edge --> FX
  AG -.events.-> Edge
  LK -.webhook.-> Edge
```

Key principles:

- **Every RPC goes through `supabaseRpc`** from `@/lib/observability`, which adds a
  correlation id, logs name/params/duration in dev, and threads errors back into the
  Logger. **Do not** call `supabase.rpc(...)` directly — that is enforced via lint.
- **Every log line goes through `logger`** from `@/lib/observability`. Direct
  `console.*` is banned (`no-console: error`); the only sanctioned exception is the
  contractual `console.warn('UI sync failure')` in `RegistrationsSection.tsx`.
- **Routes are lazy** via `lazyWithLog(...)` so chunk-load failures land in the
  Logger before bubbling up to the Route Error Boundary.
- **Auth + org context wrap every authenticated route**: `AuthProvider` →
  `OrgProvider` → `ProfileGate` → optional role-specific gate (organizer / admin /
  attendee).
- **Public domain resolution**: every share URL uses `publicOrigin()` from
  `src/lib/publicUrl.ts` (env `VITE_PUBLIC_ORIGIN` → `window.location.origin` →
  `https://illuxus.com`). Never inline a host.

---

## Project layout

```
src/
├── App.tsx                     route table + auth gates + GlobalFooter
├── main.tsx                    entrypoint, boots Logger, mounts <App/>
├── components/
│   ├── ui/                     shadcn primitives (do not edit casually)
│   ├── event/                  event-management surfaces (registrations, settings,
│   │                           sessions, sponsors, speakers, attendance, reports,
│   │                           page-form, page-builder)
│   ├── community/              feed, comments, layout, notifications
│   ├── webinar/                AgoraWebinarStage, LiveKit stage, lobby, controls
│   ├── applications/           speaker / sponsor application dialogs
│   ├── auth/                   password meter, 2FA challenge
│   ├── people/                 PersonFieldsForm
│   └── layout/                 SiteContainer + responsive gutters
├── pages/
│   ├── Index, LoginPage, DiscoverFeed, EventsListingPage,
│   ├── PublicEventPage, PublicOrgPage, EventLivePage, SelfCheckInPage,
│   ├── FeaturesPage, PricingPage, AboutPage, ContactPage, PrivacyPage, TermsPage,
│   ├── u/                      attendee surfaces (profile, my events, applications)
│   ├── t/                      ticket detail
│   ├── speaker/, sponsor/      portal pages
│   ├── dashboard/              organizer dashboard (events, attendees, tickets,
│   │   ├── admin/              analytics, marketing, landing-builder, domains,
│   │   ├── community/          reports, help, settings, billing, admin, community)
│   │   └── event/              broadcast + guest list
│   └── dev/                    dev-only preview routes
├── contexts/                   AuthContext, OrgContext, ThemeContext
├── hooks/                      app-wide hooks + community/* feature hooks
├── lib/
│   ├── observability/          logger, sinks (console/remote), redaction,
│   │                           correlation, offline queue, error boundaries,
│   │                           supabaseRpc wrapper
│   ├── attendance/             pure state machine + 13 fast-check property tests
│   ├── community/              rbac + shared types
│   ├── currency.ts, fx.ts      money formatting + 5-min cached FX
│   ├── datetime.ts, timezones  time utilities (event-local time is canonical)
│   ├── publicUrl.ts            canonical share-URL builder (env-aware)
│   ├── attendee-link.ts        per-attendee tracked join URLs with UTM
│   ├── ticket-pdf, print-badges, badge-design
│   └── event-routes.ts         canonical /org/:slug/events/:slug builders
├── integrations/supabase/      generated types + browser client
└── types/                      cross-feature TS types

supabase/
├── migrations/
│   └── 000_full_schema.sql     consolidated schema + all incremental migrations
├── functions/                  edge functions (livekit-*, fx-rates,
│                               send-event-email, send-communication-email,
│                               recording-*, org-events,
│                               create-participant-account, seed-cities,
│                               whatsapp-*)
└── config.toml

docs/                           observability + agora setup docs
.kiro/specs/                    in-flight specs (kiro spec-driven dev)
.kiro/steering/                 always-included project context for AI agents
tests/                          Playwright e2e + visual regression
scripts/                        token audit, slug check
```

---

## Route map (quick reference)

Public:

- `/` — landing (signed-out + admins) or `/discover` feed (signed-in users)
- `/discover` — Lu.ma-style discovery feed
- `/events` — public events listing (shows ongoing + future events)
- `/events/:id` — single event by id/slug
- `/org/:slug` — org public page
- `/org/:orgSlug/events/:eventSlug` — canonical event URL
- `/o/:slug` and `/o/:orgSlug/:eventSlug` — legacy redirects (preserved forever)
- `/features`, `/pricing`, `/about`, `/contact`, `/privacy`, `/terms` — marketing/legal

Auth + onboarding:

- `/login`, `/reset-password`, `/complete-profile`, `/onboarding`

Attendee:

- `/u/me`, `/u/me/events`, `/u/me/applications`, `/u/me/settings`
- `/t/:id` — ticket detail
- `/checkin/:eventId` — public self-check-in
- `/checkout/:eventId` — public self-check-out
- `/e/:id/live` — live event page (with optional `?join=` token for unique attendee links)

Organizer dashboard (gated by `OrganizerRoute` + `OnboardingGuard`):

- `/dashboard/events`, `/dashboard/events/new`, `/dashboard/events/:id`
- `/dashboard/events/:id/guests`, `/dashboard/events/:id/broadcast`
- `/dashboard/tickets`, `/dashboard/reports`, `/dashboard/marketing`,
  `/dashboard/landing-builder`,
  `/dashboard/settings`, `/dashboard/billing`, `/dashboard/help`

Community (per organizer):

- `/dashboard/community`, `/dashboard/community/:slug`, then
  `/feed`, `/members`, `/announcements`, `/calendar`, `/resources`, `/chat`,
  `/leaderboard`, `/moderation`, `/settings` under that.

Portals:

- `/speaker`, `/speaker/events/:eventId`
- `/sponsor`, `/sponsor/events/:eventId`, `/sponsor/accept`

Admin (super-admin only):

- `/dashboard/admin`, `/dashboard/admin/site`, `/dashboard/admin/audit`

---

## Data layer

The Supabase schema lives as a single consolidated file:

```
supabase/migrations/000_full_schema.sql
```

This file holds the cumulative DDL: tables, RLS policies, RPCs, triggers, and any
later additions (event-owner edits to speakers/sponsors, person-title normalisation,
org invitation acceptance, etc.). Apply it via `supabase db push` or paste into
the SQL editor on a fresh project. The file is idempotent (`DROP POLICY IF EXISTS`
and `CREATE OR REPLACE FUNCTION` throughout) so re-runs are safe.

Edge functions in `supabase/functions/`:

- LiveKit suite (`livekit-token`, `livekit-room-create`, `livekit-room-end`,
  `livekit-go-live`, `livekit-promote`, `livekit-webhook`)
- Agora-related stage and webhook helpers
- `recording-start`, `recording-stop` — Supabase Storage-backed recordings
- `fx-rates` — 5-minute cached currency exchange
- `send-event-email`, `send-communication-email` — transactional email
- `create-participant-account`, `seed-cities`, `org-events`
- WhatsApp suite (`send-whatsapp`, `whatsapp-sync-templates`, `whatsapp-webhook`)

Generated database types live at `src/integrations/supabase/types.ts`. Regenerate
after a schema change; never edit by hand.

---

## Observability

Single, unified layer at `src/lib/observability/`:

- `logger` — leveled structured logger with PII redaction, correlation ids, offline
  ring buffer + IndexedDB queue, end-of-life flush on `pagehide`.
- `supabaseRpc` — wraps every Supabase RPC with `x-correlation-id`, dev logging,
  duration metrics, and error correlation back into the Logger.
- `boundaries/RootErrorBoundary`, `boundaries/RouteErrorBoundary` — render
  `FallbackView` with the active correlation id; Reload + Go-Home actions.
- `sinks/console`, `sinks/remote` — console for dev, Sentry-compatible remote sink
  for `warn+` in production. Privacy opt-out is honored at both build (`VITE_OBSERVABILITY_OPT_OUT`)
  and per-user (`localStorage:observability:opt-out`) layers.

Read first:

- [`docs/observability.md`](./docs/observability.md) — Logger API, log levels,
  structured-field conventions, correlation ids, adding a new sink.
- [`docs/observability-privacy.md`](./docs/observability-privacy.md) — what is
  collected, retention window, opt-out mechanism.
- [`docs/agora-setup.md`](./docs/agora-setup.md) — Agora webinar configuration.

---

## Theming

The event landing page renderer (`src/components/event/page-form/PublicEventRenderer.tsx`)
reads from a `ThemeConfig` stored on `events.page_config`:

- `primaryColor`, `accentColor`, `backgroundColor`, `textColor` — palette tokens
- `fontFamily` — Google Font name, loaded dynamically when not a system font
- `titleScale` — heading size multiplier (12–32px in the editor, default 1.0 = 16px)
- `bodyScale` — body content size multiplier (10–22px in the editor, default 1.0 = 16px)

The Design tab in `EventPageForm.tsx` exposes these as sliders. Both scales apply
via CSS `zoom` so rem-based Tailwind classes scale correctly. Older configs that
only stored `fontScale` are read back as the title scale for backward compatibility.

The application itself has a separate light/dark mode (`src/contexts/ThemeContext.tsx`)
that toggles a `dark` class on `<html>` and is applied synchronously at module load
to avoid FOUC.

---

## Mobile

The app is responsive down to 375px (iPhone SE). Patterns to follow:

- Wrap tables in `<div className="overflow-x-auto">` rather than letting them overflow.
- Use `grid-cols-1 sm:grid-cols-2` style breakpoints instead of fixed columns.
- Header and toolbar buttons collapse to icon-only on mobile via `<span className="hidden sm:inline">…</span>`.
- Touch targets ≥ `h-9` (36px) — the standard shadcn `size="sm"` button.
- Hover-only UI is forbidden; use always-visible affordances on mobile that fade in on hover at `sm:` and up.

---

## Testing

| Suite                | Command                                | What it covers                                |
| -------------------- | -------------------------------------- | --------------------------------------------- |
| Unit                 | `bun run test`                         | Vitest specs in `src/**/__tests__/*.test.ts*` |
| Property-based       | included in `bun run test`             | `*.property.test.ts` and `src/lib/attendance/__tests__/property-*.pbt.test.ts` (13 PBT files for the attendance state machine) |
| E2E                  | `npx playwright test`                  | `tests/e2e/*.spec.ts`                         |
| Visual regression    | `npx playwright test tests/visual`     | QuickView surfaces                            |

The attendance state machine (`src/lib/attendance/applyAttendance.ts`) is a TS port
of the SQL helper and is fully property-tested. Any change to one must mirror the
other; use the existing PBTs as the contract.

---

## In-flight specs

`/.kiro/specs/` tracks active feature work using the Kiro spec workflow (Requirements
→ Design → Tasks). Current specs:

- **`observability-foundation`** — Phases A–E shipped (logger, error boundaries, RPC
  wrapper, console.* migration, lint flip to error). Phase F (production Remote
  Sink wiring + canary rollout) is the remaining pending block.
- **`checkin-checkout-tabs`** — DB foundation, TS port + 13 PBTs, client UI, and
  cleanup are done. Outstanding: example/integration tests for `QRScannerDialog`
  and live-update components.
- **`agora-migration`** — Migration of the live-stage from LiveKit to Agora. Both
  systems coexist for now; LiveKit is preserved as the recording/edge-function path.
- **`security-and-scale`** — Backlog of hardening + capacity work.

See `tasks.md` inside each spec for the granular task list and acceptance criteria.

---

## Conventions

- **Money** uses `formatMoney` from `@/lib/currency`. The DB stores amounts in the
  event's currency; `useFxRates` (5-minute TTL, refresh on visibility change)
  converts to display currency.
- **Datetimes** are stored UTC and formatted in event-local time using helpers from
  `@/lib/datetime` and the `timezones` whitelist. **Never** call `new Date(iso).getDate()`
  on a stored timestamptz — strip the `T` suffix or use the helpers (the agenda
  Day-N tab bug is a recurring failure mode of doing this wrong).
- **Routing** to org/event pages goes through `event-routes.ts` builders; never
  string-concat URLs. Share URLs go through `publicOrigin()` (see `src/lib/publicUrl.ts`).
- **shadcn primitives** in `components/ui/` are generated. Wrap them in feature
  components rather than editing them.
- **Design tokens** are CSS variables on `:root` — Tailwind classes use
  `bg-card`, `border-border`, `text-foreground`, etc. New colors require a token,
  not a hex value.
- **Person titles** must be one of `('Mr','Ms','Mrs','Prefer not to say')` — the DB
  has a validation trigger. The canonical list lives in `src/lib/phone-country.ts`
  as `TITLE_OPTIONS`.
- **Footer is global**: `<GlobalFooter />` in `App.tsx` renders the shared `Footer`
  on every public route. Don't add per-page `<Footer />` calls.
- **PBT first** when behavior has a clear invariant (state machines, idempotence,
  ordering, redaction). Use `fast-check` and pattern off the existing PBT files.

---

## Acknowledgements

Public links and bookmarks should remain stable forever — both the legacy
`/o/:slug` URLs and the canonical `/org/:slug` are kept working via redirects in
`App.tsx`.
