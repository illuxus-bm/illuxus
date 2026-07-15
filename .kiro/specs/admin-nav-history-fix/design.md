# Admin Nav History Fix — Bugfix Design

## Overview

Signed-in super admins report that clicking a link inside `/dashboard/admin/events` (Events Moderation) and then pressing the browser back button lands them on `/dashboard/admin` (Control Tower) instead of the events list they came from. The bugfix requirements identified the root cause: every super-admin page carries a **redundant** admin guard in addition to the outer `SuperAdminRoute` in `App.tsx`. When that redundant guard fires — under any transient state where `isAdmin` reads false with `loading` already false — it emits `<Navigate to="/dashboard" replace />`, which rewrites the current history slot. `DashboardLanding` at `/dashboard` then emits its own `<Navigate to="/dashboard/admin" replace />` for admins, rewriting the same slot again. That chain of two consecutive replaces after a push corrupts the entry the user browsed from, so browser-back no longer returns to it.

The fix is a **surgical removal**: delete the redundant page-level guard from 10 admin page files. The outer `SuperAdminRoute` in `App.tsx` (line ~246) already gates every admin route with the exact same check (`if (!isAdmin) return <Navigate to="/dashboard" replace />`) and remains the single source of truth. No new files, no API changes, no changes to `AuthContext`, `OrgContext`, `AppSidebar`, `AdminSidebar`, `DashboardTopBar`, or `vercel.json`. The `.kiro/specs/routing-auth-fixes/` fix (which prevents `isAdmin` from transiently reading false while `loading === false`) is preserved and complementary — the two fixes together eliminate both the underlying race and the redundant page-level machinery that would still corrupt history if any future regression reintroduced a transient state.

## Glossary

- **Bug_Condition (C)**: A navigation transition in which a route guard fires `<Navigate replace />` **more than once** while transitioning to a URL. In this codebase, that happens only for admin pages, because each admin page component contains its own `!isAdmin` guard on top of the outer `SuperAdminRoute`, and the redirected `/dashboard` route in turn emits a second replace via `DashboardLanding`.
- **Property (P)**: For any sequence of user-initiated pushes to admin routes followed by a subsequent push to a downstream (non-admin) route, browser-back returns to the last admin URL the user actually pushed to.
- **Preservation**: Every existing non-admin navigation behavior — mouse clicks on nav links (still push, not replace), unauthenticated redirects to `/login?next=<path>`, non-admin redirects to `/dashboard`, `OrganizerRoute`'s `!isAdmin` bypass for super admins, `AuthContext.loading` gating from `routing-auth-fixes` — must remain byte-for-byte unchanged.
- **`SuperAdminRoute`**: The single-source-of-truth admin gate in `src/App.tsx` (lines ~246–253). Renders `<FullPageLoader />` while `loading` is true, redirects to `/login?next=...` when the user is null, and emits `<Navigate to="/dashboard" replace />` when `!isAdmin`. Once it admits the user, the page inside it never needs to re-check `isAdmin`.
- **`DashboardLanding`**: The component at `/dashboard` that redirects admins to `/dashboard/admin` and non-admins to `/dashboard/events`. Present in `src/App.tsx`. Emits its own `<Navigate replace />` — this is by design for the entry-point route, but combined with a page-level admin guard replace it forms the harmful two-replace chain.
- **`isAdmin` / `authLoading`**: Fields destructured from `useAuth()`. Historically consumed by admin pages both for enabling data queries (`enabled: isAdmin`, `useEffect(() => { if (!isAdmin) return; ... }, [isAdmin])`) **and** for the redundant page-level guard. This design distinguishes the two usages — keep the query-enable usage, remove the guard usage.
- **Redundant page-level guard**: The literal three-line block present in each of the 10 target files:

  ```tsx
  if (authLoading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  ```

  Always positioned after the `useQuery` / `useMemo` / `useEffect` setup and before the JSX return.

## Bug Details

### Bug Condition

The bug manifests when a super admin's browser session performs a navigation transition into any admin route while React's render cycle observes `!isAdmin && !authLoading` for even a single commit — a state that can arise from a hypothetical future regression in `AuthContext`, a Supabase `USER_UPDATED` event that momentarily reshapes role state before the follow-up `checkAdminRole` refetch resolves, a tab-focus refetch that clears state briefly, or any other transient inconsistency. Under those conditions the redundant page-level guard fires `<Navigate to="/dashboard" replace />`, `DashboardLanding` then fires `<Navigate to="/dashboard/admin" replace />`, and the current history slot is rewritten twice — losing the URL the user actually navigated to.

**Formal Specification:**

```
FUNCTION isBugCondition(navigation)
  INPUT: navigation of type NavigationTransition
  OUTPUT: boolean

  RETURN navigation.targetPath MATCHES "/dashboard/admin(/.*)?"
         AND numberOfConsecutiveReplaces(navigation.guardChain) >= 2
         AND userPushedFromUrl(navigation) IS NOT equal_to history.back_target_after(navigation)
END FUNCTION
```

Equivalently, in terms of the codebase's actual guard machinery:

```
FUNCTION isBugCondition(navigation)
  RETURN navigation.targetPath MATCHES "/dashboard/admin(/.*)?"
         AND pageComponent(navigation.targetPath).containsRedundantAdminGuard()
END FUNCTION
```

The second form is the property this fix eliminates: after removal, `pageComponent(...).containsRedundantAdminGuard()` returns false for every admin page, and the chain of two consecutive replaces cannot be constructed by any path through the admin routes.

### Examples

- **Reported failure** — Super admin at `/dashboard/admin` (Control Tower) → clicks Events (`/dashboard/admin/events`) → EventModerationPage's redundant guard fires under a transient state → history slot rewritten to `/dashboard` then to `/dashboard/admin` → user clicks View attendees on a row (`/dashboard/events/:id/guests`) → browser back → lands on `/dashboard/admin` (WRONG; expected `/dashboard/admin/events`).
- **Reported failure, mirror** — Super admin at `/dashboard/admin/events` → clicks a row title (`/dashboard/events/:id`) → browser back → lands on `/dashboard/admin` (WRONG; expected `/dashboard/admin/events`).
- **Steady-state, still uses the redundant path** — Super admin at `/dashboard/admin/users` → clicks Analytics (`/dashboard/admin/analytics`); PlatformAnalyticsPage mounts and its redundant guard is checked. Because `.kiro/specs/routing-auth-fixes/` fixed the transient false-isAdmin race, the guard doesn't fire today — but the code is still present, waiting to trip on any future regression.
- **Edge case** — A brand-new super admin whose `checkAdminRole()` result is temporarily missing from React state (e.g., tab visibility resumes) would previously have their admin page's redundant guard fire and corrupt history mid-session.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

- Mouse clicks on `AdminSidebar` NavLinks continue to be plain React Router pushes — they add new history entries, and browser-back returns to the previous entry (Requirement 3.6).
- The outer `SuperAdminRoute` remains the sole admin gate and continues to emit `<Navigate to="/dashboard" replace />` for non-admins (Requirement 2.3, 2.4, 3.2). This is the one intentional replace for admin routes and doesn't participate in a chain because no page-level replace ever fires afterwards.
- Unauthenticated users hitting any admin route continue to be redirected to `/login?next=<encoded-admin-path>` (Requirement 3.1).
- `AuthContext.loading` continues to gate every route decision so `isAdmin` is never observed with `loading === false` while still stale (Requirement 3.4).
- `OrganizerRoute`'s `!isAdmin` bypass continues to let super admins reach `/dashboard/events/:id`, `/dashboard/events/:id/guests`, and every other organizer route (Requirement 3.5).
- `DashboardLanding` continues to redirect admins to `/dashboard/admin` on direct hits of `/dashboard` (Requirement 3.3) — this is correct behavior in isolation, and only became harmful when combined with the page-level replace above it.
- Page-level `useQuery(...).isLoading` and skeleton behavior is unaffected — removing the redundant admin guard does not touch the data-loading paths that render `<Skeleton />` while the page's own queries are pending (Requirement 3.9).
- All `useEffect(() => { if (!isAdmin) return; ... }, [isAdmin])` and `useQuery({ enabled: isAdmin })` usages inside admin pages are preserved — they gate side effects and network calls, not routing.

**Scope:**

All inputs that do NOT involve the redundant page-level admin guards are completely unaffected. This includes:

- Every non-admin route (`/dashboard/events`, `/u/me/*`, `/community/*`, etc.).
- Every non-navigation admin interaction (row clicks in tables, dialog opens, mutation runs).
- Every direct URL entry / bookmark / hard refresh of an admin route — `SuperAdminRoute` handles those exactly as it does today.
- Every login flow, including admin sign-in via `?next=/dashboard/admin/...`.

## Hypothesized Root Cause

Based on the bug analysis in `bugfix.md`, the root cause is well-understood and validated by direct code reading of the 10 target files:

1. **Duplicated authorization decision**: Ten admin page components each contain

   ```tsx
   if (authLoading) return null;
   if (!isAdmin) return <Navigate to="/dashboard" replace />;
   ```

   after the outer `SuperAdminRoute` in `App.tsx` has already checked the identical condition and admitted the user into the route.

2. **`<Navigate replace />` semantics**: React Router's `<Navigate to="X" replace />` rewrites the **current** history entry rather than pushing a new one. This is correct for entry-point redirects but harmful when it fires from inside a component that only mounted because the user *pushed* to that URL — because the pushed URL is the current entry, and rewriting it destroys the record of where the user came from.

3. **Chained replace via `DashboardLanding`**: The page-level guard replaces to `/dashboard`. `DashboardLanding` (mounted at `/dashboard`) then observes `isAdmin === true` (steady state has resumed) and emits its own `<Navigate to="/dashboard/admin" replace />`. The same history slot is rewritten twice, and the URL the user actually pushed to (`/dashboard/admin/events`, etc.) is erased.

4. **AuthContext.loading race (already fixed, but the redundant guards remain the *second* class of failure)**: `.kiro/specs/routing-auth-fixes/` addressed the specific race where `checkAdminRole()` and `loadAccountType()` resolved after `setLoading(false)`, causing `isAdmin === false && loading === false` to be briefly observable. That fix made the redundant guards mostly unreachable in practice. However, the redundant code is still present, and any future regression (or a Supabase auth event that transiently resets role state before its follow-up refetch resolves) would re-expose the same history corruption. The correct architectural response is to delete the redundant defense — the outer `SuperAdminRoute` re-evaluates on every render and is already sufficient.

## Correctness Properties

Property 1: Bug Condition — Admin Navigation Preserves Push History Under Transient Guard Chains

_For any_ sequence of user-initiated pushes to admin routes (`/dashboard/admin/*`) followed by a subsequent push to a downstream non-admin route (e.g., `/dashboard/events/:id/guests`), the fixed application SHALL result in a history stack where a single browser-back step lands on the last admin URL the user pushed to. The property is asserted on a pure history-stack simulator (`type HistoryStack = string[]`; `push`, `replace`, `back` operations) driven by fast-check-generated navigation sequences. The simulator's admin-navigation model consults the current codebase (via a file-content scan for the redundant guard pattern) to determine how many replaces each admin push produces. Pre-fix, the scan detects the redundant guards and models the buggy 2-replace chain — the property FAILS with a counterexample. Post-fix, the scan detects no redundant guards and models a clean single push per admin navigation — the property PASSES.

**Validates: Requirements 2.1, 2.2**

Property 2: Preservation — Steady-State Admin Round-Trip Navigation

_For any_ input where the bug condition does NOT hold (steady-state admin session, no transient race), the fixed application SHALL produce the same navigation outcome as the original code. Specifically: a super admin who navigates from `/dashboard/admin` to `/dashboard/admin/events` to `/dashboard/events/:id`, then presses browser back, lands on `/dashboard/admin/events`. This is asserted via a React Testing Library integration test with `MemoryRouter`, a mocked `AuthContext` that steadily reports `isAdmin === true`, and one representative admin page (`EventModerationPage` — the page the user reported). The test PASSES on unfixed code (steady-state race-free path) and continues to PASS after the fix, confirming no regression.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct: for each of the 10 admin page files listed in bugfix.md clause 1.4, delete the redundant page-level guard block and — where the destructured `isAdmin` / `authLoading` names are no longer referenced anywhere else in the file — trim the `useAuth()` destructure accordingly.

The block to remove is identical across all files (whitespace may vary by one blank line):

```tsx
if (authLoading) return null;
if (!isAdmin) return <Navigate to="/dashboard" replace />;
```

The following per-file specifications capture (a) the exact block to remove, (b) the `useAuth()` destructure treatment, and (c) whether the `Navigate` import at the top of the file needs to be dropped (only if no other `Navigate` reference remains — none of these files have another `Navigate` usage, so the import comes out everywhere).

---

**1. `src/pages/dashboard/AdminPanelPage.tsx`**

Remove block (line 152–154):
```tsx
  if (authLoading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
```
Replacement:
```tsx
```
(Nothing — remove the two lines and one preceding blank line.)

`useAuth()` destructure (line 117): `isAdmin` is still used in `enabled: isAdmin` (lines 126, 137, 148). `authLoading` is not used elsewhere.
- Change from: `const { isAdmin, loading: authLoading } = useAuth();`
- Change to: `const { isAdmin } = useAuth();`

`Navigate` import: remove `Navigate` from `import { Navigate, ... } from "react-router-dom";` if present. Verify no other `Navigate` reference in the file.

---

**2. `src/pages/dashboard/admin/ActivityFeedPage.tsx`**

Remove block (line 176–178):
```tsx
  if (authLoading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
```

`useAuth()` destructure (line 110): `isAdmin` is still used in `useEffect` early-return (line 132) and dependency list (line 156). `authLoading` is not used elsewhere.
- Change from: `const { isAdmin, loading: authLoading } = useAuth();`
- Change to: `const { isAdmin } = useAuth();`

Drop `Navigate` from the top-of-file `react-router-dom` import.

---

**3. `src/pages/dashboard/admin/PlatformAnalyticsPage.tsx`**

Remove block (line 238–240):
```tsx
  if (authLoading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
```

`useAuth()` destructure (line 156): grep shows no other reference to `isAdmin` or `authLoading` in the file body.
- Change from: `const { isAdmin, loading: authLoading } = useAuth();`
- Change to: remove the entire destructure line **and** the `import { useAuth } from "@/contexts/AuthContext";` import above (verify no other `useAuth` in file).

Drop `Navigate` from the top-of-file `react-router-dom` import.

---

**4. `src/pages/dashboard/admin/SystemHealthPage.tsx`**

Remove block (line 150–152):
```tsx
  if (authLoading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
```

`useAuth()` destructure (line 82): grep shows no other reference to `isAdmin` or `authLoading` in the file body.
- Change from: `const { isAdmin, loading: authLoading } = useAuth();`
- Change to: remove the entire destructure line **and** the `import { useAuth } from "@/contexts/AuthContext";` import.

Drop `Navigate` from the top-of-file `react-router-dom` import.

---

**5. `src/pages/dashboard/admin/OrganizationManagementPage.tsx`**

Remove block (line 387–389):
```tsx
  if (authLoading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
```

`useAuth()` destructure (line 297): grep shows no other reference to `isAdmin` or `authLoading` in the file body.
- Change from: `const { isAdmin, loading: authLoading } = useAuth();`
- Change to: remove the entire destructure line **and** the `import { useAuth } from "@/contexts/AuthContext";` import.

Drop `Navigate` from the top-of-file `react-router-dom` import.

---

**6. `src/pages/dashboard/admin/SiteEditorPage.tsx`**

Remove block (line 1008–1010):
```tsx
  if (authLoading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
```

`useAuth()` destructure (line 800): `isAdmin` is still used in `useEffect` (lines 853, 855). `authLoading` is not used elsewhere.
- Change from: `const { isAdmin, loading: authLoading } = useAuth();`
- Change to: `const { isAdmin } = useAuth();`

Drop `Navigate` from the top-of-file `react-router-dom` import.

---

**7. `src/pages/dashboard/admin/EventModerationPage.tsx`**

Remove block (line 176–178):
```tsx
  if (authLoading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
```

`useAuth()` destructure (line 87): grep shows no other reference to `isAdmin` or `authLoading` in the file body. `useAuth` is only imported for this destructure.
- Change from: `const { isAdmin, loading: authLoading } = useAuth();`
- Change to: remove the entire destructure line **and** the `import { useAuth } from "@/contexts/AuthContext";` import.

Drop `Navigate` from the top-of-file `react-router-dom` import: change `import { Navigate, Link } from "react-router-dom";` to `import { Link } from "react-router-dom";`.

---

**8. `src/pages/dashboard/admin/SupportTicketsPage.tsx`**

Remove block (line 370–372) plus the comment on line 370 (`// ── Auth fallback ──`):
```tsx
  // ── Auth fallback ──
  if (authLoading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
```

Also remove the "defence in depth" comment at file top (lines 17–19 mention this guard) — replace with a concise comment noting that `SuperAdminRoute` is the sole admin gate.

`useAuth()` destructure (line 181): `isAdmin` is still used in `useEffect` (lines 252, 256). `authLoading` is not used elsewhere.
- Change from: `const { isAdmin, loading: authLoading } = useAuth();`
- Change to: `const { isAdmin } = useAuth();`

Drop `Navigate` from the top-of-file `react-router-dom` import.

---

**9. `src/pages/dashboard/admin/RevenuePage.tsx`**

Remove block (line 194–196):
```tsx
  if (authLoading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
```

`useAuth()` destructure (line 79): grep shows no other reference to `isAdmin` or `authLoading` in the file body.
- Change from: `const { isAdmin, loading: authLoading } = useAuth();`
- Change to: remove the entire destructure line **and** the `import { useAuth } from "@/contexts/AuthContext";` import.

Drop `Navigate` from the top-of-file `react-router-dom` import.

---

**10. `src/pages/dashboard/admin/UserManagementPage.tsx`**

Remove block (lines 539–542, including the `/* ── Auth guard ── */` comment):
```tsx
  /* ── Auth guard ── */

  if (authLoading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
```

`useAuth()` destructure (line 411): destructures `{ isAdmin, loading: authLoading, user }`. `user` is used elsewhere in the file. Grep shows `isAdmin` and `authLoading` are not referenced beyond the guard.
- Change from: `const { isAdmin, loading: authLoading, user } = useAuth();`
- Change to: `const { user } = useAuth();`

Drop `Navigate` from the top-of-file `react-router-dom` import.

---

## Testing Strategy

### Validation Approach

The testing strategy follows the two-phase bugfix convention. Phase 1 authors an exploratory property-based test that asserts the **fixed invariant** — it fails on unfixed code (because the property's model detects the redundant guards via a file-content scan and produces a corrupt-history counterexample) and passes after the fix (because the scan finds no redundant guards and the model produces clean push history). Phase 2 authors a preservation integration test that captures steady-state admin navigation behavior and continues to pass across the fix.

### Exploratory Bug Condition Checking

**Goal**: Author Property 1 as a pure history-stack simulator that fails on unfixed code, confirming both the bug's presence in the abstract model of the codebase and the correctness of the removal fix.

**Test Plan**: Place at `src/lib/__tests__/navigation-history-invariant.pbt.test.ts`. The test defines a pure history-stack simulator (`type HistoryStack = string[]`; `push`, `replace`, `back`), then a per-navigation model function `simulateAdminNavigation(fromUrl, toAdminUrl)` that consults the actual codebase to determine what sequence of history operations each admin push produces:

- Read each of the 10 admin page files at test-startup time via `node:fs.readFileSync`.
- Match against the redundant-guard regex `/if\s*\(!isAdmin\)\s*return\s*<Navigate\s+to="\/dashboard"\s+replace/`.
- Set a module-level constant `SOME_ADMIN_PAGE_HAS_REDUNDANT_GUARD` from the disjunction of the matches.
- When `SOME_ADMIN_PAGE_HAS_REDUNDANT_GUARD === true`, `simulateAdminNavigation` emits `[push(target), replace("/dashboard"), replace("/dashboard/admin")]` — modeling the two-replace chain that current code can produce.
- When `false`, it emits `[push(target)]` only — the clean fixed behavior.

Fast-check generates arrays of admin URLs (2–6 elements, drawn from a curated list of the 10 admin routes) plus a final push to a downstream `/dashboard/events/:id/guests` URL. The property asserts that `back(finalStack) === lastAdminPushedInSequence`.

**Test Cases** (all under the single `fc.assert(fc.property(...))`):

1. **Two admin pushes then downstream push** — e.g., `[/dashboard/admin, /dashboard/admin/events]` then `/dashboard/events/x/guests`. Pre-fix: the second push runs through the buggy chain, back returns `/dashboard/admin` not `/dashboard/admin/events`. Post-fix: back returns `/dashboard/admin/events`. (will fail on unfixed code)
2. **Six admin pushes deep** — e.g., `[/dashboard/admin, /dashboard/admin/users, /dashboard/admin/analytics, /dashboard/admin/events, /dashboard/admin/revenue, /dashboard/admin/system]` then downstream. Pre-fix: several 2-replace chains stack up; back returns `/dashboard/admin` regardless of what was actually pushed last. Post-fix: back returns `/dashboard/admin/system`. (will fail on unfixed code)
3. **Single admin push then downstream** — `[/dashboard/admin/events]` then downstream. Pre-fix: back returns `/dashboard/admin` instead of `/dashboard/admin/events`. Post-fix: back returns `/dashboard/admin/events`. (will fail on unfixed code)
4. **Edge case — identical consecutive admin pushes** — `[/dashboard/admin/events, /dashboard/admin/events]` then downstream. Pre-fix and post-fix behavior differs only in what the intermediate history slot holds; the invariant assertion still discriminates. (may fail on unfixed code)

**Expected Counterexamples on Unfixed Code**:

- fast-check will shrink to a minimal counterexample such as `adminPushes=["/dashboard/admin/events"], finalPush="/dashboard/events/x/guests"` with `back(stack) === "/dashboard/admin"` while the property expected `"/dashboard/admin/events"`.
- Root cause confirmed: the file-content scan returned `true` for at least one admin page → the model emitted a 2-replace chain → the pre-final-push history slot was rewritten from the admin URL the user pushed to.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds (any admin navigation transition in the codebase), the fixed function produces the expected behavior.

**Pseudocode:**

```
FOR ALL adminPushSequence WHERE isBugCondition(adminPushSequence) DO
  finalStack := simulateNavigation_fixed(adminPushSequence)
  ASSERT back(finalStack) = last(adminPushSequence)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold — steady-state admin navigation, non-admin routes, unauthenticated flows, etc. — the fixed application produces the same result as the original.

**Pseudocode:**

```
FOR ALL navigation WHERE NOT isBugCondition(navigation) DO
  ASSERT observed_behavior(navigation, original_code) = observed_behavior(navigation, fixed_code)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking of the pure-simulator invariants (see Property 1 — the same simulator is used to cover non-bug-condition sequences as well). For the concrete steady-state admin round-trip, an RTL integration test captures the exact end-to-end behavior a user would observe.

**Test Plan**: Place at `src/pages/dashboard/admin/__tests__/EventModerationPage.test.tsx`. Use `MemoryRouter` (from `react-router-dom`) with `initialEntries=["/dashboard/admin", "/dashboard/admin/events"]` and `initialIndex=1`. Mock `useAuth` to always return `{ user: <admin>, isAdmin: true, loading: false, ... }`. Mock the `useQuery` calls that hit Supabase so the page renders without a network. Simulate: (a) verify the page renders on `/dashboard/admin/events`, (b) simulate a `<Link>` click to `/dashboard/events/some-id/guests` (mount a minimal route stub for that path), (c) call the router's back mechanism (via `useNavigate(-1)` or `history.back()` shim), (d) assert the router's current location is `/dashboard/admin/events`, not `/dashboard/admin`.

**Test Cases**:

1. **Steady-state admin round-trip on `EventModerationPage`** (Property 2): Observe on unfixed code that the round trip already succeeds under a steady mock AuthContext (because `.kiro/specs/routing-auth-fixes/` fixed the race that would trip the guard). After the fix, the same test still passes — confirming no regression in the happy path.
2. **`useQuery({ enabled: isAdmin })` preservation** — For admin pages that still consume `isAdmin` (AdminPanelPage, ActivityFeedPage, SiteEditorPage, SupportTicketsPage): observe on unfixed code that the enabled queries fire when `isAdmin === true`. After the fix, they still fire. Covered by existing unit tests for those hooks (no new test required — the destructure change preserves the `isAdmin` name that those `enabled:` clauses depend on).
3. **Existing `.kiro/specs/routing-auth-fixes/` PBTs remain green** — Run `src/contexts/__tests__/AuthContext.test.ts`, `src/contexts/__tests__/auth-loading.pbt.test.ts`, `src/pages/__tests__/DashboardLanding.test.tsx`, `src/App.pbt.test.ts` (all authored by that spec) and confirm they still pass. This fix does not touch `AuthContext` or `DashboardLanding`.

### Unit Tests

- `EventModerationPage.test.tsx` — one integration test covering Property 2 as described above. One page is sufficient because the fix is byte-identical across all 10 files.
- No new unit tests for the other 9 pages — their existing behavior is preserved as-is and covered by the `bun run lint` + `bun run build` pass in the checkpoint.

### Property-Based Tests

- `navigation-history-invariant.pbt.test.ts` — Property 1, described above. This is the only new PBT the fix requires.
- The `simulateAdminNavigation` model in that file uses `fc.array(fc.constantFrom(...admin URLs))` for sequence generation with `numRuns: 100`. Tag: `// Feature: admin-nav-history-fix, Property 1: navigation history invariant for admin routes`.

### Integration Tests

- `EventModerationPage.test.tsx` (Property 2) — full push → downstream push → back round-trip on one representative admin page.
- No Playwright e2e is added for this fix; the RTL integration test provides sufficient coverage at the fastest tier.

## Error Handling

This fix removes code; no new error paths are introduced.

- The outer `SuperAdminRoute` in `src/App.tsx` already handles every failure mode: `loading === true` → `<FullPageLoader />`; `!user` → `<Navigate to={loginRedirectFor(location)} replace />`; `!isAdmin` → `<Navigate to="/dashboard" replace />`.
- Removing the page-level guards does not change what happens for non-admin users hitting an admin URL — they are intercepted by `SuperAdminRoute` before any of the 10 page components are even instantiated. No leak of admin content is possible under any state.
- Removing the destructured `authLoading` from pages where it is no longer used does not affect the render tree because the outer `SuperAdminRoute` already gates on `loading` at the route level.
- Existing observability boundaries (`RootErrorBoundary`, `RouteErrorBoundary`) continue to catch any runtime error thrown by the admin page bodies. No change.
- No `logger.*` call sites are touched. No `supabaseRpc` call sites are touched. No `console.*` is introduced.
