// Feature: admin-nav-history-fix, Property 2: steady-state admin round-trip preservation
//
// Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9
//
// Property 2 — Preservation: Steady-State Admin Round-Trip Navigation.
//
// For any input where the bug condition does NOT hold (steady-state admin
// session, no transient race), the application SHALL produce a clean
// round-trip: a super admin at `/dashboard/admin/events` who pushes to a
// downstream route (`/dashboard/events/:id/guests`) and then presses browser
// back SHALL land back on `/dashboard/admin/events`.
//
// This test uses an RTL integration harness with `MemoryRouter`, a mocked
// `AuthContext` that STEADILY reports `isAdmin: true, loading: false`, and
// `EventModerationPage` — the exact page the user reported the bug on.
//
// EXPECTED OUTCOME on UNFIXED code: this test PASSES. The `routing-auth-fixes`
// spec already fixed the transient race that could trip the redundant
// page-level guard, so under a steady mocked auth context the guard reads
// `if (false) return ...` and never fires. The round-trip works — this test
// captures the baseline behavior that the fix must not regress.
//
// EXPECTED OUTCOME after Task 3 removes the redundant guards: this test still
// PASSES — confirming no regression in the steady-state happy path.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  MemoryRouter,
  Routes,
  Route,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ─── Mocks (must be declared before the SUT import) ─────────────────────────

// Steady super-admin auth context — no transient race, `loading: false` and
// `isAdmin: true` throughout. This matches the post-`routing-auth-fixes`
// invariant and is the input class Property 2 covers.
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "admin@illuxus.test" },
    isAdmin: true,
    loading: false,
    accountType: null,
    profileCompleted: true,
    refreshProfile: vi.fn(),
    signOut: vi.fn(),
    session: null,
  }),
}));

// Neutral org context — `EventModerationPage` doesn't consume it directly, but
// `DashboardLayout` / `DashboardTopBar` do. `DashboardLayout` is stubbed below,
// so this only covers any incidental imports.
vi.mock("@/contexts/OrgContext", () => ({
  useOrg: () => ({
    org: null,
    subscription: null,
    loading: false,
    eventCount: 0,
    memberCount: 0,
    canCreateEvent: false,
    hasFeature: () => false,
    hasAddon: () => false,
    refreshOrg: vi.fn(),
    onboardingCompleted: true,
    memberships: [],
    myRole: null,
    setActiveOrg: vi.fn(),
  }),
}));

// Stub `DashboardLayout` so the test doesn't drag in `SidebarProvider`,
// `AppSidebar`, `AdminSidebar`, `DashboardTopBar` and their transitive
// dependencies. The layout has zero bearing on the navigation-history
// invariant we're asserting.
vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dashboard-layout-stub">{children}</div>
  ),
}));

// Observability layer — `EventModerationPage` calls `supabaseRpc` from the
// moderation mutation paths (never triggered by this test, but the module
// must resolve).
vi.mock("@/lib/observability", () => ({
  supabaseRpc: vi.fn(async () => ({ data: null, error: null })),
  logger: {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  },
}));

// Supabase client — `EventModerationPage` runs two `useQuery` calls:
//   1. `supabase.from("events").select("...").order("created_at", ...)`
//   2. `supabase.from("organizations").select("id, name, slug")`
// The first awaits `.order(...)`; the second awaits `.select(...)` directly.
// Both need to resolve to `{ data: [], error: null }` so the page mounts
// without crashing. Build a fully thenable chain that returns itself for
// every intermediate builder call and resolves to the empty result when
// finally awaited.
vi.mock("@/integrations/supabase/client", () => {
  const EMPTY_RESULT = { data: [] as unknown[], error: null };
  const makeChain = () => {
    // Use `unknown` + a self-reference so `.select`, `.eq`, etc. can return
    // the same builder object for further chaining.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      order: vi.fn(() => Promise.resolve(EMPTY_RESULT)),
      limit: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      single: vi.fn(async () => ({ data: null, error: null })),
      // Make the builder itself thenable so `await supabase.from(...).select(...)`
      // resolves to the empty result even when no terminal method is chained.
      then: (onFulfilled: (v: typeof EMPTY_RESULT) => unknown, onRejected?: (e: unknown) => unknown) =>
        Promise.resolve(EMPTY_RESULT).then(onFulfilled, onRejected),
    };
    return chain;
  };
  return {
    supabase: {
      from: vi.fn(() => makeChain()),
      auth: {
        getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
        onAuthStateChange: vi.fn(() => ({
          data: { subscription: { unsubscribe: vi.fn() } },
        })),
      },
      channel: vi.fn(() => ({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnThis(),
      })),
      removeChannel: vi.fn(),
    },
  };
});

// Import the SUT AFTER the mocks are registered so it picks them up.
import EventModerationPage from "../EventModerationPage";

// ─── Test harness ───────────────────────────────────────────────────────────

/** Renders the current pathname so assertions can read it. */
function LocationProbe() {
  const location = useLocation();
  return <span data-testid="current-path">{location.pathname}</span>;
}

/**
 * Exposes two navigation actions the test drives:
 *   - forward-link → pushes to a downstream non-admin route
 *   - back-button  → invokes `navigate(-1)` (equivalent to browser back)
 * Rendered outside the `Routes` so it's always mounted regardless of the
 * current URL.
 */
function TestNav() {
  const navigate = useNavigate();
  return (
    <div>
      <button
        type="button"
        data-testid="test-forward-link"
        onClick={() => navigate("/dashboard/events/some-id/guests")}
      >
        forward
      </button>
      <button
        type="button"
        data-testid="test-back-button"
        onClick={() => navigate(-1)}
      >
        back
      </button>
    </div>
  );
}

function AdminPanelStub() {
  const location = useLocation();
  return <div data-testid="admin-panel">{location.pathname}</div>;
}

function GuestListStub() {
  const location = useLocation();
  return <div data-testid="guest-list">{location.pathname}</div>;
}

function renderWithRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={["/dashboard/admin", "/dashboard/admin/events"]}
        initialIndex={1}
      >
        <LocationProbe />
        <TestNav />
        <Routes>
          <Route path="/dashboard/admin" element={<AdminPanelStub />} />
          <Route
            path="/dashboard/admin/events"
            element={<EventModerationPage />}
          />
          <Route
            path="/dashboard/events/:id/guests"
            element={<GuestListStub />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Property 2 ─────────────────────────────────────────────────────────────

describe("Property 2: steady-state admin round-trip preservation", () => {
  it("super-admin round-trip preserves history entry to admin events page", () => {
    renderWithRouter();

    // The router starts at index 1 → `/dashboard/admin/events` — the page
    // the user reported the bug on.
    expect(screen.getByTestId("current-path").textContent).toBe(
      "/dashboard/admin/events",
    );

    // Forward push: simulate the user clicking a "View attendees" link that
    // navigates to `/dashboard/events/:id/guests`.
    fireEvent.click(screen.getByTestId("test-forward-link"));
    expect(screen.getByTestId("current-path").textContent).toBe(
      "/dashboard/events/some-id/guests",
    );

    // Browser back: history should return to the last real push
    // (`/dashboard/admin/events`), not the `/dashboard/admin` slot the buggy
    // two-replace chain would have rewritten it to.
    fireEvent.click(screen.getByTestId("test-back-button"));
    expect(screen.getByTestId("current-path").textContent).toBe(
      "/dashboard/admin/events",
    );
  });
});
