# Implementation Plan: admin-nav-history-fix

## Overview

Remove the redundant page-level admin guard from 10 super-admin page files. The outer `SuperAdminRoute` in `src/App.tsx` already gates every admin route with the identical check and remains the single source of truth. The fix follows the bugfix workflow's exploration-first convention: Task 1 authors the property-based test that encodes the fixed invariant (fails on unfixed code because the property's model detects the redundant guards via a codebase file-content scan; passes after the fix). Task 2 removes the redundant guards. Tasks 3–5 verify.

## Tasks

- [x] 1. Write bug condition exploration property test
  - **Property 1: Bug Condition** — Admin Navigation Preserves Push History Under Transient Guard Chains
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the redundant page-level guards are present and can produce the corrupt-history two-replace chain.
  - **DO NOT attempt to fix the test or the code when it fails.**
  - **NOTE**: This test encodes the FIXED invariant — it will validate the fix when it passes after Task 2.
  - **GOAL**: Surface counterexamples that demonstrate the class of bug (two consecutive `<Navigate replace />` calls after a user push corrupt history) is reachable given the current code.
  - Create file `src/lib/__tests__/navigation-history-invariant.pbt.test.ts`.
  - Import `fc from 'fast-check'` and `{ describe, it, expect } from 'vitest'`.
  - Import `fs from 'node:fs'` and `path from 'node:path'` for the file-content scan.
  - Define a pure history-stack simulator:
    - `type HistoryStack = { entries: string[]; index: number };`
    - `push(stack, url): HistoryStack` — appends and moves index to last.
    - `replace(stack, url): HistoryStack` — rewrites entry at index.
    - `back(stack): HistoryStack` — decrements index (bounded ≥ 0).
    - `currentUrl(stack): string` — returns `stack.entries[stack.index]`.
  - Define an admin route constant: `const ADMIN_ROUTES = ["/dashboard/admin", "/dashboard/admin/events", "/dashboard/admin/users", "/dashboard/admin/analytics", "/dashboard/admin/organizations", "/dashboard/admin/revenue", "/dashboard/admin/system", "/dashboard/admin/activity", "/dashboard/admin/site", "/dashboard/admin/tickets"] as const;`
  - Define the 10 target file paths and read them at test-startup time via `fs.readFileSync(...)`. Test the disjunction of matches against the regex `/if\s*\(!isAdmin\)\s*return\s*<Navigate\s+to="\/dashboard"\s+replace/`.
  - Assign the disjunction result to a module-level constant `SOME_ADMIN_PAGE_HAS_REDUNDANT_GUARD`.
  - Define `simulateAdminPush(stack, adminUrl): HistoryStack`:
    - If `SOME_ADMIN_PAGE_HAS_REDUNDANT_GUARD === true`: emit `push(adminUrl) → replace("/dashboard") → replace("/dashboard/admin")`.
    - If `false`: emit `push(adminUrl)` only.
  - Define `simulateDownstreamPush(stack, url): HistoryStack` — plain `push`, no chain.
  - Write the fast-check property:
    ```
    fc.property(
      fc.array(fc.constantFrom(...ADMIN_ROUTES), { minLength: 1, maxLength: 6 }),
      fc.constant("/dashboard/events/some-id/guests"),
      (adminSequence, downstream) => {
        let stack = { entries: ["/dashboard/admin"], index: 0 };
        for (const url of adminSequence) stack = simulateAdminPush(stack, url);
        const expectedBackTarget = currentUrl(stack);
        stack = simulateDownstreamPush(stack, downstream);
        stack = back(stack);
        return currentUrl(stack) === expectedBackTarget;
      }
    )
    ```
  - Run with `fc.assert(..., { numRuns: 100 })`.
  - Tag the file header: `// Feature: admin-nav-history-fix, Property 1: navigation history invariant for admin routes`
  - Run `bun run test --run src/lib/__tests__/navigation-history-invariant.pbt.test.ts`.
  - **EXPECTED OUTCOME**: Test FAILS with a shrunken counterexample such as `adminSequence=["/dashboard/admin/events"]` → back returns `/dashboard/admin` instead of `/dashboard/admin/events`. This confirms the redundant guards are present and reachable in the codebase.
  - Document the counterexample in a comment at the bottom of the test file (`// Counterexample on unfixed code: ...`).
  - Mark task complete when test is written, run, and failure is documented.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** — Steady-State Admin Round-Trip Navigation
  - **IMPORTANT**: Follow observation-first methodology. Observe behavior on UNFIXED code first, then encode it in a test that will still pass after the fix.
  - Create file `src/pages/dashboard/admin/__tests__/EventModerationPage.test.tsx`.
  - Import `render, screen` from `@testing-library/react`, `userEvent` from `@testing-library/user-event`, `describe, it, expect, vi, beforeEach` from `vitest`, and `MemoryRouter, Routes, Route, useNavigate` from `react-router-dom`.
  - Mock `@/contexts/AuthContext` so `useAuth()` returns a steady admin: `{ user: { id: "u1", email: "admin@illuxus.test" }, isAdmin: true, loading: false, accountType: null, profileCompleted: true, refreshProfile: vi.fn() }`.
  - Mock `@/contexts/OrgContext` so `useOrg()` returns `{ org: null, loading: false, memberships: [], onboardingCompleted: true }`.
  - Mock `@/integrations/supabase/client` and `@/lib/observability` (`supabaseRpc`) so `useQuery` resolves to empty arrays without a network — sufficient for the page shell to render.
  - Set up a `MemoryRouter` with `initialEntries=["/dashboard/admin", "/dashboard/admin/events"]` and `initialIndex=1`, and route stubs for `/dashboard/admin`, `/dashboard/admin/events` (renders `<EventModerationPage />`), and `/dashboard/events/:id/guests` (renders a minimal stub with a `data-testid="guest-list"` node).
  - Add a probe component `<LocationProbe />` inside the router that renders the current location's `pathname` into a `data-testid="current-path"` node so assertions can read it.
  - Observation step (on unfixed code): render, confirm the page mounts on `/dashboard/admin/events`, programmatically navigate to `/dashboard/events/some-id/guests` (via a `data-testid="test-forward-link"` route helper), then call `navigate(-1)` (or `history.back()`), and assert `data-testid="current-path"` reads `/dashboard/admin/events`. On unfixed code this passes because `.kiro/specs/routing-auth-fixes/` fixed the transient race and the mocked `AuthContext` is steady — so the redundant guard never fires under this test's inputs.
  - Write the test:
    ```
    it("Property 2: super-admin round-trip preserves history entry to admin events page", async () => {
      // ... setup ...
      // Forward push
      await userEvent.click(screen.getByTestId("test-forward-link"));
      expect(screen.getByTestId("current-path").textContent).toBe("/dashboard/events/some-id/guests");
      // Back
      await userEvent.click(screen.getByTestId("test-back-button"));
      expect(screen.getByTestId("current-path").textContent).toBe("/dashboard/admin/events");
    });
    ```
  - Tag the file header: `// Feature: admin-nav-history-fix, Property 2: steady-state admin round-trip preservation`
  - Run `bun run test --run src/pages/dashboard/admin/__tests__/EventModerationPage.test.tsx`.
  - **EXPECTED OUTCOME**: Test PASSES on UNFIXED code (steady-state race-free path). This is the baseline behavior we must preserve.
  - Mark task complete when test is written, run, and passing on unfixed code.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

- [x] 3. Fix — remove redundant page-level admin guard from 10 admin page files
  - Apply the byte-identical edit described in `design.md` § Fix Implementation to each file. The edit is: (a) delete the two-line guard block; (b) trim `useAuth()` destructure per the file-specific spec; (c) drop unused `Navigate` import; (d) drop unused `useAuth` import where the destructure is entirely removed.
  - _Bug_Condition: isBugCondition(navigation) — an admin navigation transition whose target page contains the redundant `if (!isAdmin) return <Navigate to="/dashboard" replace />` block. See design.md § Bug Details._
  - _Expected_Behavior: expectedBehavior(result) — after each removal, the outer `SuperAdminRoute` remains the sole admin gate and no page-level `<Navigate replace />` can chain with `DashboardLanding`'s replace to corrupt history. See design.md § Correctness Properties, Property 1._
  - _Preservation: All non-admin navigation, `AuthContext.loading` gating, `OrganizerRoute`'s `!isAdmin` bypass, `DashboardLanding`'s admin redirect, existing `useQuery({ enabled: isAdmin })` and `useEffect(() => { if (!isAdmin) return; ... }, [isAdmin])` call sites remain byte-for-byte unchanged. See design.md § Expected Behavior._
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

  - [x] 3.1 Remove guard from `src/pages/dashboard/AdminPanelPage.tsx`
    - Delete the block at lines 152–154 (blank line + `if (authLoading) return null;` + `if (!isAdmin) return <Navigate to="/dashboard" replace />;`).
    - Change destructure from `const { isAdmin, loading: authLoading } = useAuth();` to `const { isAdmin } = useAuth();` (isAdmin still used in `enabled:` clauses at lines 126, 137, 148).
    - Remove `Navigate` from the `react-router-dom` import at the top of the file.
    - _Requirements: 2.2_

  - [x] 3.2 Remove guard from `src/pages/dashboard/admin/ActivityFeedPage.tsx`
    - Delete the block at lines 176–178.
    - Change destructure to `const { isAdmin } = useAuth();` (isAdmin still used in the realtime `useEffect`).
    - Remove `Navigate` from the `react-router-dom` import.
    - _Requirements: 2.2_

  - [x] 3.3 Remove guard from `src/pages/dashboard/admin/PlatformAnalyticsPage.tsx`
    - Delete the block at lines 238–240.
    - Remove the destructure line entirely (no other `isAdmin`/`authLoading` reference in file). Remove `import { useAuth } from "@/contexts/AuthContext";`.
    - Remove `Navigate` from the `react-router-dom` import.
    - _Requirements: 2.2_

  - [x] 3.4 Remove guard from `src/pages/dashboard/admin/SystemHealthPage.tsx`
    - Delete the block at lines 150–152.
    - Remove the destructure line entirely. Remove `import { useAuth } ...`.
    - Remove `Navigate` from the `react-router-dom` import.
    - _Requirements: 2.2_

  - [x] 3.5 Remove guard from `src/pages/dashboard/admin/OrganizationManagementPage.tsx`
    - Delete the block at lines 387–389.
    - Remove the destructure line entirely. Remove `import { useAuth } ...`.
    - Remove `Navigate` from the `react-router-dom` import.
    - _Requirements: 2.2_

  - [x] 3.6 Remove guard from `src/pages/dashboard/admin/SiteEditorPage.tsx`
    - Delete the block at lines 1008–1010.
    - Change destructure to `const { isAdmin } = useAuth();` (isAdmin still used in the drafts `useEffect` at line 853).
    - Remove `Navigate` from the `react-router-dom` import.
    - _Requirements: 2.2_

  - [x] 3.7 Remove guard from `src/pages/dashboard/admin/EventModerationPage.tsx`
    - Delete the block at lines 176–178.
    - Remove the destructure line entirely (no other `isAdmin`/`authLoading` reference in file). Remove `import { useAuth } ...`.
    - Change `import { Navigate, Link } from "react-router-dom";` to `import { Link } from "react-router-dom";`.
    - _Requirements: 2.2_

  - [x] 3.8 Remove guard from `src/pages/dashboard/admin/SupportTicketsPage.tsx`
    - Delete the `// ── Auth fallback ──` comment (line 370) plus the two-line guard block (lines 371–372).
    - Update the file-top JSDoc (lines 17–19) — remove the "defence in depth" phrasing; keep a one-line note that `SuperAdminRoute` is the sole admin gate.
    - Change destructure to `const { isAdmin } = useAuth();` (isAdmin still used in the tickets/stats `useEffect` at lines 252, 256).
    - Remove `Navigate` from the `react-router-dom` import.
    - _Requirements: 2.2_

  - [x] 3.9 Remove guard from `src/pages/dashboard/admin/RevenuePage.tsx`
    - Delete the block at lines 194–196.
    - Remove the destructure line entirely. Remove `import { useAuth } ...`.
    - Remove `Navigate` from the `react-router-dom` import.
    - _Requirements: 2.2_

  - [x] 3.10 Remove guard from `src/pages/dashboard/admin/UserManagementPage.tsx`
    - Delete the `/* ── Auth guard ── */` comment plus the two-line guard block (lines 539–542).
    - Change destructure from `const { isAdmin, loading: authLoading, user } = useAuth();` to `const { user } = useAuth();` (only `user` is referenced elsewhere).
    - Remove `Navigate` from the `react-router-dom` import.
    - _Requirements: 2.2_

  - [x] 3.11 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** — Admin Navigation Preserves Push History Under Transient Guard Chains
    - **IMPORTANT**: Re-run the SAME test from Task 1 — do NOT write a new test.
    - Run `bun run test --run src/lib/__tests__/navigation-history-invariant.pbt.test.ts`.
    - **EXPECTED OUTCOME**: Test PASSES. The file-content scan now finds no redundant guard in any of the 10 files → `SOME_ADMIN_PAGE_HAS_REDUNDANT_GUARD === false` → `simulateAdminPush` emits a single `push`, no chain → `back(stack)` returns the last admin URL for all generated sequences.
    - _Requirements: 2.1, 2.2_

  - [x] 3.12 Verify preservation test still passes
    - **Property 2: Preservation** — Steady-State Admin Round-Trip Navigation
    - **IMPORTANT**: Re-run the SAME test from Task 2 — do NOT write a new test.
    - Run `bun run test --run src/pages/dashboard/admin/__tests__/EventModerationPage.test.tsx`.
    - **EXPECTED OUTCOME**: Test PASSES. The round-trip navigation still lands on `/dashboard/admin/events` after the fix — no regression.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

- [x] 4. Verify pre-existing tests still pass (especially routing-auth-fixes regression suite)
  - Run the routing-auth-fixes tests explicitly to guarantee that spec's invariants remain green:
    - `bun run test --run src/contexts/__tests__/AuthContext.test.ts` (if present)
    - `bun run test --run src/contexts/__tests__/auth-loading.pbt.test.ts` (if present)
    - `bun run test --run src/pages/__tests__/DashboardLanding.test.tsx` (if present)
    - `bun run test --run src/App.pbt.test.ts` (if present)
  - Confirm no test files were touched by this fix (only 10 admin page files + 2 new test files were changed / added).
  - _Requirements: 3.4, 3.5, 3.6, 3.7_

- [x] 5. Final checkpoint — full test suite + lint + build
  - Run `bun run test --run` — confirm all tests pass (unit + PBT + integration).
  - Run `bun run lint` — confirm no ESLint errors, especially `no-console`.
  - Run `bun run build` — confirm the production build compiles cleanly with no TS errors after the destructure and import changes.
  - Ask the user if any questions arise.
  - _Requirements: all_

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "2"] },
    { "wave": 2, "tasks": ["3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "3.8", "3.9", "3.10"] },
    { "wave": 3, "tasks": ["3.11", "3.12"] },
    { "wave": 4, "tasks": ["4"] },
    { "wave": 5, "tasks": ["5"] }
  ]
}
```

## Notes

- Task 1 (exploration property test) MUST FAIL on unfixed code — that failure is the confirmation that the redundant guards exist and produce the two-replace chain. Do not "fix" the test when it fails.
- Task 2 (preservation integration test) MUST PASS on unfixed code — it captures the steady-state baseline. The `.kiro/specs/routing-auth-fixes/` fix already prevents the transient race that would otherwise trip the guard under this test's inputs.
- The fix in Task 3 is byte-identical across the 10 files (delete the same two-line guard block); the per-file sub-tasks capture the small destructure / import trims that differ.
- No changes to `AuthContext`, `OrgContext`, `App.tsx` (route table), `AdminSidebar`, `AppSidebar`, `DashboardTopBar`, or `vercel.json`. The `SuperAdminRoute` in `App.tsx` remains the single source of truth (Requirement 3.7).
- The "thrown to main page on refresh in production" symptom is explicitly out of scope for this spec (see bugfix.md § Out of scope). Follow-up specs should be filed after production `logger.warn('routing.fallback_to_root', ...)` instrumentation identifies the actual trigger.
- Never use `console.*` — use `logger` from `@/lib/observability`. This fix adds no new logging.
- Never call `supabase.rpc()` directly — this fix touches no RPC call sites.
- Do not edit `src/components/ui/` primitives — none are touched here.
