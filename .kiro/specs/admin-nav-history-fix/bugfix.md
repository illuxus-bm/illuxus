# Bugfix Requirements Document

## Introduction

Super admins report that the browser back button on `/dashboard/events/:id` or `/dashboard/events/:id/guests` (reached from `/dashboard/admin/events` → Events Moderation) does not return to Events Moderation — it goes directly to the Control Tower (`/dashboard/admin`), skipping the admin's platform-wide event list entirely.

Root cause hypothesis (validated by code reading): every super-admin page under `src/pages/dashboard/admin/*` (10 files) and `src/pages/dashboard/AdminPanelPage.tsx` carries a **redundant** admin guard inside the page component itself, in addition to the outer `SuperAdminRoute` in `App.tsx` that already gates the route:

```tsx
if (authLoading) return null;
if (!isAdmin) return <Navigate to="/dashboard" replace />;
```

The outer `SuperAdminRoute` already renders `<FullPageLoader />` while `loading` is true and already emits `<Navigate to="/dashboard" replace />` when `!isAdmin`. The page-level check is a defense-in-depth duplication that is never needed under normal steady-state operation.

Why the duplication corrupts history: `<Navigate replace />` **rewrites the current history entry** instead of pushing a new one. If the page-level guard ever fires (or _would fire_ during a re-render), it replaces the current URL (`/dashboard/admin/events`) with `/dashboard`. `DashboardLanding` at `/dashboard` then emits its own `<Navigate to="/dashboard/admin" replace />` for admins, replacing again. The net effect is that the history slot the user came from stops being `/dashboard/admin/events` and becomes `/dashboard/admin`.

When the user later follows a link (`View attendees` → `/dashboard/events/:id/guests`) and hits browser back, they land on the rewritten slot — `/dashboard/admin` — not the Events Moderation list.

The AuthContext race that used to make `isAdmin` transiently false was fixed in `.kiro/specs/routing-auth-fixes/`. That fix must be preserved. This fix removes a **separate class** of history corruption: the redundant page-level admin guards that any future regression, tab-focus refetch, RLS hiccup, or edge-case re-render could still trip, even with AuthContext behaving correctly.

A second reported symptom — "users being thrown to the main page (`/`) on page refresh in production" — is scoped **out** of this spec because no deterministic code path from a protected route to `/` was found during investigation. See the "Out of scope" note at the end and the recommended follow-ups.

## Bug Analysis

### Current Behavior (Defect)

Sequence that reproduces the observed history corruption for a signed-in super admin:

Setup: user starts at `/dashboard/admin` (Control Tower). History stack: `[/dashboard/admin]`, index 0.

1.1 WHEN the super admin clicks the "Events" nav link in `AdminSidebar` while on `/dashboard/admin` THEN a new history entry `/dashboard/admin/events` SHALL be pushed (correct); AND WHEN the `EventModerationPage` component re-renders with `authLoading === false` AND `isAdmin === false` at any point (transient RLS/network hiccup, USER_UPDATED event that flips role state before the follow-up refetch resolves, or any future regression in `AuthContext`) THEN the page emits `<Navigate to="/dashboard" replace />`, which rewrites the current history entry to `/dashboard`.

1.2 WHEN the history entry has been rewritten to `/dashboard` by the redundant page-level guard AND `DashboardLanding` mounts at `/dashboard` with `loading === false` AND `isAdmin === true` (steady state resumes) THEN `DashboardLanding` emits `<Navigate to="/dashboard/admin" replace />`, further replacing the current entry — so the slot that used to hold `/dashboard/admin/events` now holds `/dashboard/admin`.

1.3 WHEN the super admin subsequently clicks a `<Link>` inside `EventModerationPage` (for example `View attendees` → `/dashboard/events/:id/guests`, or a click through to `/dashboard/events/:id`) AND then clicks the browser back button THEN the browser pops to the previous history entry, which is now `/dashboard/admin` (Control Tower) — not the expected `/dashboard/admin/events` (Events Moderation).

1.4 WHEN any of the ten admin pages listed below is rendered while `!isAdmin` transiently holds THEN each page independently emits `<Navigate to="/dashboard" replace />`, creating the same double-replace chain regardless of which admin page the super admin was on:
- `src/pages/dashboard/AdminPanelPage.tsx` (mounted at `/dashboard/admin`)
- `src/pages/dashboard/admin/ActivityFeedPage.tsx` (`/dashboard/admin/activity`)
- `src/pages/dashboard/admin/PlatformAnalyticsPage.tsx` (`/dashboard/admin/analytics`)
- `src/pages/dashboard/admin/SystemHealthPage.tsx` (`/dashboard/admin/system`)
- `src/pages/dashboard/admin/OrganizationManagementPage.tsx` (`/dashboard/admin/organizations`)
- `src/pages/dashboard/admin/SiteEditorPage.tsx` (`/dashboard/admin/site`)
- `src/pages/dashboard/admin/EventModerationPage.tsx` (`/dashboard/admin/events`)
- `src/pages/dashboard/admin/SupportTicketsPage.tsx` (`/dashboard/admin/tickets`)
- `src/pages/dashboard/admin/RevenuePage.tsx` (`/dashboard/admin/revenue`)
- `src/pages/dashboard/admin/UserManagementPage.tsx` (`/dashboard/admin/users`)

1.5 WHEN the redundant page-level guard fires as described above THEN the guard's control flow is redundant with the outer `SuperAdminRoute` — both check `!isAdmin` and both emit the same `<Navigate to="/dashboard" replace />` — but only the page-level one has the side effect of rewriting an already-visited history entry, because the outer `SuperAdminRoute` decision happens **before** the page even mounts on entry to the route.

### Expected Behavior (Correct)

The outer `SuperAdminRoute` in `App.tsx` (line ~246) is the single source of truth for admin gating. Once it has admitted the user into an admin route, no page rendered inside that route needs to re-check `isAdmin`.

2.1 WHEN the super admin navigates from `/dashboard/admin` to `/dashboard/admin/events` and then to `/dashboard/events/:id/guests` (or `/dashboard/events/:id`) AND then clicks the browser back button THEN the browser SHALL return the user to `/dashboard/admin/events` (Events Moderation), preserving the natural push-history order.

2.2 WHEN any of the ten admin pages listed in 1.4 renders under any React state (including future edge cases where `isAdmin` transiently reads false while `loading` reads false) THEN the page SHALL NOT emit a `<Navigate replace />` of its own — it SHALL trust the outer `SuperAdminRoute` decision and either render its content or return a neutral placeholder (`null` or `<FullPageLoader />` while the page's own data queries are still pending), but SHALL NOT rewrite the current history entry.

2.3 WHEN the outer `SuperAdminRoute` receives `loading === true` (from `AuthContext`) THEN it SHALL continue to render `<FullPageLoader />` (unchanged); WHEN it receives `loading === false` AND `user === null` THEN it SHALL continue to redirect to `/login?next=<path>` (unchanged); WHEN it receives `loading === false` AND `user !== null` AND `isAdmin === false` THEN it SHALL continue to `<Navigate to="/dashboard" replace />` (unchanged — this is the single, correct place for that decision).

2.4 WHEN a non-admin user attempts to reach any of the ten admin routes directly (bookmarked URL, deep link, or manual entry) THEN the outer `SuperAdminRoute` SHALL redirect them to `/dashboard` exactly once (unchanged) and the underlying page component SHALL never mount for them — so removing the page-level guard cannot leak admin content to non-admin users under any state.

2.5 WHEN a super admin is on any admin page AND a background event fires that would previously have transiently flipped `isAdmin` to false (Supabase USER_UPDATED with an unrelated field change, a manual `refreshProfile()` call, a hypothetical future refactor that momentarily resets role state) THEN the page SHALL NOT self-redirect — the outer `SuperAdminRoute` re-evaluates on every render and remains the single decision point, and if the flip is genuine and permanent it will handle the redirect exactly once, still without any history-rewriting chain.

### Unchanged Behavior (Regression Prevention)

The AuthContext race fix from `.kiro/specs/routing-auth-fixes/` and every other existing routing behavior must remain intact.

3.1 WHEN an unauthenticated user hits any admin route THEN the `SuperAdminRoute` SHALL CONTINUE TO redirect to `/login?next=<encoded-admin-path>` so the sign-in flow returns them to the intended destination.

3.2 WHEN a signed-in non-admin (organizer, workspace member, or attendee) hits any admin route THEN the `SuperAdminRoute` SHALL CONTINUE TO `<Navigate to="/dashboard" replace />` — `DashboardLanding` then routes them to `/dashboard/events` as today.

3.3 WHEN a super admin signs in with no `?next=` param THEN the login flow SHALL CONTINUE TO land them at `/dashboard` and `DashboardLanding` SHALL CONTINUE TO `<Navigate to="/dashboard/admin" replace />` for them.

3.4 WHEN `AuthContext` restores a session on mount OR handles a sign-in / sign-out on `onAuthStateChange` THEN it SHALL CONTINUE TO keep `loading === true` until both `checkAdminRole()` and `loadAccountType()` have resolved (Requirement 1 of `routing-auth-fixes`), so `isAdmin` is never observed with `loading === false` while still stale.

3.5 WHEN `OrganizerRoute` gates `/dashboard/events/:id`, `/dashboard/events/:id/guests`, or any other organizer route THEN it SHALL CONTINUE TO honor the `isAdmin` bypass so super admins can navigate through to those pages without being redirected to `/my/tickets` (Requirement 2 of `routing-auth-fixes`).

3.6 WHEN a super admin follows a mouse click on any admin sidebar `<NavLink>` (which wraps React Router's `NavLink` — client-side push, not a full page reload) THEN the click SHALL CONTINUE TO push a new history entry (not replace) — so a clean forward-then-back navigation preserves the previous entry exactly as it did before this fix.

3.7 WHEN the fix ships THEN NO changes SHALL be made to `AuthContext.tsx`, `OrgContext.tsx`, `AppSidebar.tsx`, `AdminSidebar.tsx`, `DashboardTopBar.tsx`, or `vercel.json` — the scope is strictly the redundant page-level guards.

3.8 WHEN a super admin refreshes any admin page directly (bookmark, address-bar entry, hard reload) THEN the outer `SuperAdminRoute` SHALL CONTINUE TO show `<FullPageLoader />` until `AuthContext.loading` becomes false, then either admit them (`isAdmin`) or bounce them (`!isAdmin`) exactly as it does today. The fix SHALL NOT introduce any new flash of unauthenticated content on refresh.

3.9 WHEN the page-level `authLoading` gate was previously returning `null` (a blank frame) instead of `<FullPageLoader />` while the page's data queries loaded THEN removing the redundant guard SHALL NOT change the initial render skeleton behavior for the page's own queries (KPI skeletons, table skeletons via `<Skeleton />`, dropdown menus) — those loading indicators come from the page's `useQuery(...).isLoading` flags, not from the redundant admin guard, and SHALL continue to render as they do today.

---

## Out of scope: "thrown to main page on refresh"

The second reported symptom — users being redirected to `/` on Vercel production page refresh — is **not** included in this spec because no deterministic automatic path from a protected route to `/` was identified during code investigation.

Candidates ruled out by reading the code:
- `vercel.json`'s SPA rewrite (`/(.*)` → `/index.html`) correctly routes every `/dashboard/*` path to the SPA shell; the two rewrites above it (`/org/:orgSlug/events/:eventSlug` and `/events/:eventId`) match strictly on their literal path prefixes and cannot capture `/dashboard/*`.
- `AuthContext` on failed session restoration sets `user = null` — protected routes then redirect to `/login?next=<path>`, not to `/`.
- `DashboardLanding` only navigates to `/dashboard/admin` or `/dashboard/events` — never to `/`.
- `LazyRouteBoundary` and `FallbackView` both offer a "Go home" **button** that links to `/`, but the click is user-initiated, not automatic.

Candidates that remain plausible but need production evidence:
- Stale PWA service-worker cache serving an old `index.html` whose chunk hashes no longer exist on disk. The user then sees `LazyRouteBoundary`'s error UI and may click "Go home", perceiving it as automatic. Instrumentation would confirm this.
- `CompleteProfilePage`'s `navigate("/", { replace: true })` for users whose `profile_completed` flag returns `true` from `get_my_profile` but who were sent to `/complete-profile` by `ProfileGate` due to a data-consistency edge case. Narrow and unlikely, but detectable.

Recommended follow-ups (separate specs, not tracked here):
- Add a `logger.warn('routing.fallback_to_root', { from, cause })` at each place that navigates to `/` from anywhere in an authenticated flow (`CompleteProfilePage`, `LazyRouteBoundary`, `FallbackView`) so production logs identify the actual trigger.
- Once production logs point at the real cause, open a targeted bugfix spec for that specific path.
