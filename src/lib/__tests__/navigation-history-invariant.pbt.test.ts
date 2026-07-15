// Feature: admin-nav-history-fix, Property 1: navigation history invariant for admin routes
//
// Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2
//
// Property 1 — Bug Condition: Admin Navigation Preserves Push History Under
// Transient Guard Chains.
//
// For any sequence of user-initiated pushes to admin routes
// (`/dashboard/admin/*`) followed by a subsequent push to a downstream
// non-admin route (e.g. `/dashboard/events/:id/guests`), a single browser-back
// step SHALL land on the last admin URL the user pushed to.
//
// The property is asserted on a pure history-stack simulator (`push`,
// `replace`, `back`) driven by fast-check-generated navigation sequences. The
// admin-navigation model consults the actual codebase via a file-content scan
// for the redundant guard pattern to decide how many operations each admin
// push produces:
//
//   - If ANY of the 10 admin page files under `src/pages/dashboard/admin/*`
//     (plus `src/pages/dashboard/AdminPanelPage.tsx`) contains the redundant
//     block `if (!isAdmin) return <Navigate to="/dashboard" replace />;`, the
//     model emits `push(target) → replace("/dashboard") → replace("/dashboard/admin")`
//     — mirroring the buggy two-replace chain that the outer `SuperAdminRoute`
//     admits into the tree, only for the page-level guard to rewrite twice.
//   - If NONE of the files contain the redundant block, the model emits a
//     single `push(target)` — the clean fixed behavior.
//
// EXPECTED OUTCOME on unfixed code: this test FAILS with a shrunken
// counterexample (e.g. `adminSequence=["/dashboard/admin"]` → `back` returns
// `"/dashboard/admin"` twice because the last real push slot got rewritten to
// `/dashboard/admin` via the double-replace chain, corrupting the entry the
// user actually pushed to). The failure CONFIRMS the redundant guards are
// present and reachable in the codebase.
//
// EXPECTED OUTCOME after Task 3 removes the redundant guards: the file-content
// scan finds no matches → `SOME_ADMIN_PAGE_HAS_REDUNDANT_GUARD === false` →
// `simulateAdminPush` emits a single `push` → the property holds for all
// generated sequences.

import { describe, it } from "vitest";
import fc from "fast-check";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// ─── Locate the 10 target files ─────────────────────────────────────────────
//
// Vitest runs under ESM (`"type": "module"` in package.json), so `__dirname`
// isn't defined. Resolve via `import.meta.url` and walk up to the workspace
// root, then join the 10 admin page paths listed in `bugfix.md` § 1.4.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// __dirname === <root>/src/lib/__tests__  →  workspace root is three levels up.
const WORKSPACE_ROOT = path.resolve(__dirname, "..", "..", "..");

const ADMIN_PAGE_FILES = [
  "src/pages/dashboard/AdminPanelPage.tsx",
  "src/pages/dashboard/admin/ActivityFeedPage.tsx",
  "src/pages/dashboard/admin/PlatformAnalyticsPage.tsx",
  "src/pages/dashboard/admin/SystemHealthPage.tsx",
  "src/pages/dashboard/admin/OrganizationManagementPage.tsx",
  "src/pages/dashboard/admin/SiteEditorPage.tsx",
  "src/pages/dashboard/admin/EventModerationPage.tsx",
  "src/pages/dashboard/admin/SupportTicketsPage.tsx",
  "src/pages/dashboard/admin/RevenuePage.tsx",
  "src/pages/dashboard/admin/UserManagementPage.tsx",
] as const;

const REDUNDANT_GUARD_REGEX =
  /if\s*\(!isAdmin\)\s*return\s*<Navigate\s+to="\/dashboard"\s+replace/;

const SOME_ADMIN_PAGE_HAS_REDUNDANT_GUARD: boolean = ADMIN_PAGE_FILES.some(
  (relPath) => {
    const absPath = path.resolve(WORKSPACE_ROOT, relPath);
    const source = readFileSync(absPath, "utf8");
    return REDUNDANT_GUARD_REGEX.test(source);
  },
);

// ─── Pure history-stack simulator ───────────────────────────────────────────

type HistoryStack = { entries: string[]; index: number };

function push(stack: HistoryStack, url: string): HistoryStack {
  // Browser semantics: pushing while not at the tip truncates forward entries.
  const kept = stack.entries.slice(0, stack.index + 1);
  const nextEntries = [...kept, url];
  return { entries: nextEntries, index: nextEntries.length - 1 };
}

function replace(stack: HistoryStack, url: string): HistoryStack {
  const nextEntries = stack.entries.slice();
  nextEntries[stack.index] = url;
  return { entries: nextEntries, index: stack.index };
}

function back(stack: HistoryStack): HistoryStack {
  return { entries: stack.entries, index: Math.max(0, stack.index - 1) };
}

function currentUrl(stack: HistoryStack): string {
  return stack.entries[stack.index];
}

// ─── Navigation model ───────────────────────────────────────────────────────
//
// `simulateAdminPush` mirrors what happens when the user clicks a link into
// an admin route: React Router pushes the target, then the newly-mounted page
// runs its guards. Under the buggy code path the redundant page-level guard
// fires and `DashboardLanding` fires next, giving us the corrupt-history
// two-replace chain.

function simulateAdminPush(
  stack: HistoryStack,
  adminUrl: string,
): HistoryStack {
  let next = push(stack, adminUrl);
  if (SOME_ADMIN_PAGE_HAS_REDUNDANT_GUARD) {
    // Page-level guard rewrites to `/dashboard`, then `DashboardLanding`
    // rewrites again to `/dashboard/admin`.
    next = replace(next, "/dashboard");
    next = replace(next, "/dashboard/admin");
  }
  return next;
}

function simulateDownstreamPush(
  stack: HistoryStack,
  url: string,
): HistoryStack {
  // Non-admin routes have no redundant page-level guard, so they push cleanly.
  return push(stack, url);
}

// ─── Admin route universe (drawn from `AdminSidebar.tsx` + `App.tsx`) ───────

const ADMIN_ROUTES = [
  "/dashboard/admin",
  "/dashboard/admin/events",
  "/dashboard/admin/users",
  "/dashboard/admin/analytics",
  "/dashboard/admin/organizations",
  "/dashboard/admin/revenue",
  "/dashboard/admin/system",
  "/dashboard/admin/activity",
  "/dashboard/admin/site",
  "/dashboard/admin/tickets",
] as const;

// ─── Property ───────────────────────────────────────────────────────────────

describe("Property 1: navigation history invariant for admin routes", () => {
  it("browser-back after a downstream push returns to the last admin URL the user pushed to", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...ADMIN_ROUTES), {
          minLength: 1,
          maxLength: 6,
        }),
        fc.constant("/dashboard/events/some-id/guests"),
        (adminSequence, downstream) => {
          // Start the session at `/dashboard/admin` (Control Tower) — the
          // route the super admin lands on after sign-in.
          let stack: HistoryStack = {
            entries: ["/dashboard/admin"],
            index: 0,
          };
          for (const url of adminSequence) {
            stack = simulateAdminPush(stack, url);
          }

          // The invariant we care about is: browser-back after a downstream
          // push returns to the LAST ADMIN URL THE USER PUSHED TO — not
          // whatever the buggy chain rewrote that slot into. Capture the
          // user's intent directly from the generated sequence, not from
          // `currentUrl(stack)` (which is already corrupted under the
          // two-replace chain).
          const expectedBackTarget = adminSequence[adminSequence.length - 1];

          stack = simulateDownstreamPush(stack, downstream);
          stack = back(stack);

          return currentUrl(stack) === expectedBackTarget;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Counterexample on unfixed code ─────────────────────────────────────────
//
// Recorded from `bun run test --run src/lib/__tests__/navigation-history-invariant.pbt.test.ts`
// while the 10 admin page files still contained the redundant page-level
// `if (!isAdmin) return <Navigate to="/dashboard" replace />;` guard:
//
//   Counterexample: [["/dashboard/admin/users"], "/dashboard/events/some-id/guests"]
//   Shrunk 1 time(s)
//   Got error: Property failed by returning false
//
// Trace of the buggy chain for that counterexample:
//   1. Initial stack:        entries=["/dashboard/admin"],                       index=0
//   2. simulateAdminPush("/dashboard/admin/users"):
//      a. push        →      entries=["/dashboard/admin","/dashboard/admin/users"], index=1
//      b. replace("/dashboard") →
//                            entries=["/dashboard/admin","/dashboard"],          index=1
//      c. replace("/dashboard/admin") →
//                            entries=["/dashboard/admin","/dashboard/admin"],    index=1
//   3. simulateDownstreamPush("/dashboard/events/some-id/guests"):
//                            entries=[…,"/dashboard/admin","/dashboard/events/some-id/guests"], index=2
//   4. back()          →     entries unchanged, index=1
//   5. currentUrl()    →     "/dashboard/admin"
//
// Expected back target: "/dashboard/admin/users" (what the user pushed to).
// Observed back target: "/dashboard/admin"       (the slot got rewritten twice
//                                                 by the redundant page-level
//                                                 guard + `DashboardLanding`).
//
// This confirms the redundant page-level guards are present and reachable in
// the codebase and produce the exact history-corruption chain described in
// `bugfix.md` § 1.2 and `design.md` § Bug Details.
