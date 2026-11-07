import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_PLANS } from "@/lib/plans/features";

const rpc = vi.fn(async () => ({ data: null, error: null }));
let plansError: { message: string } | null = null;
let plansRows: Record<string, unknown>[] = DEFAULT_PLANS as unknown as Record<string, unknown>[];

vi.mock("@/lib/observability", () => ({ supabaseRpc: (...args: unknown[]) => rpc(...(args as [])) }));
vi.mock("@/components/DashboardLayout", () => ({ DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: () =>
        table === "plans"
          ? { order: async () => (plansError ? { data: null, error: plansError } : { data: plansRows, error: null }) }
          : Promise.resolve({ data: [{ plan: "free" }, { plan: "free" }, { plan: "pro" }], error: null }),
    }),
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import PlansPage from "../PlansPage";

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <PlansPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe("PlansPage", () => {
  beforeEach(() => {
    rpc.mockClear();
    plansError = null;
    plansRows = DEFAULT_PLANS as unknown as Record<string, unknown>[];
  });

  it("shows one column per plan with organisation counts", async () => {
    renderPage();
    expect(await screen.findByLabelText("free plan name")).toHaveValue("Free");
    expect(screen.getByLabelText("business plan name")).toHaveValue("Business");
    expect(screen.getByText(/2 orgs/)).toBeInTheDocument();
    expect(screen.getByText(/1 org$/)).toBeInTheDocument();
  });

  it("saves only the plan that changed, with its new feature list", async () => {
    renderPage();
    const box = await screen.findByRole("checkbox", { name: "Certificates on Free" });
    expect(box).toHaveAttribute("data-state", "checked");
    fireEvent.click(box);
    expect(screen.getByText("Unsaved")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Save \(1\)/ }));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    const [name, args] = rpc.mock.calls[0] as unknown as [string, { _key: string; _features: string[]; _limits: unknown }];
    expect(name).toBe("admin_save_plan");
    expect(args._key).toBe("free");
    expect(args._features).not.toContain("certificates");
    expect(args._features).toContain("brochure");
    expect(args._limits).toEqual(DEFAULT_PLANS[0].limits);
  });

  it("saves a plan's prices", async () => {
    renderPage();
    const monthly = await screen.findByLabelText("Monthly price on Pro");
    expect(monthly).toHaveValue(79);
    fireEvent.change(monthly, { target: { value: "2499" } });
    fireEvent.change(screen.getByLabelText("Yearly price on Pro"), { target: { value: "24990" } });
    fireEvent.change(screen.getByLabelText("Monthly price on Business"), { target: { value: "" } });
    expect(screen.getAllByText("Custom").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /Save \(2\)/ }));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    const calls = rpc.mock.calls as unknown as Array<[string, { _key: string; _pricing: unknown }]>;
    expect(calls.find(([, a]) => a._key === "pro")?.[1]._pricing).toEqual({ monthly: 2499, yearly: 24990, currency: "USD" });
    expect(calls.find(([, a]) => a._key === "business")?.[1]._pricing).toEqual({ monthly: null, yearly: null, currency: "USD" });
  });

  it("leaves prices out of the save before the price columns exist", async () => {
    plansRows = DEFAULT_PLANS.map(({ price_monthly: _m, price_yearly: _y, currency: _c, ...rest }) => rest);
    renderPage();
    expect(await screen.findByText(/Plan prices aren't in the database yet/)).toBeInTheDocument();
    expect(screen.getByLabelText("Monthly price on Pro")).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Certificates on Free" }));
    fireEvent.click(screen.getByRole("button", { name: /Save \(1\)/ }));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    expect((rpc.mock.calls[0] as unknown as [string, Record<string, unknown>])[1]).not.toHaveProperty("_pricing");
  });

  it("treats an empty limit as unlimited", async () => {
    renderPage();
    const events = await screen.findByLabelText("Events on Free");
    fireEvent.change(events, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /Save \(1\)/ }));
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    const args = (rpc.mock.calls[0] as unknown as [string, { _limits: { max_events: number } }])[1];
    expect(args._limits.max_events).toBe(-1);
  });

  it("marks features nothing checks yet", async () => {
    renderPage();
    const row = (await screen.findByText("API access")).closest("tr")!;
    expect(within(row).getByText("Label only")).toBeInTheDocument();
  });

  it("won't save before the database migration is applied", async () => {
    plansError = { message: 'relation "public.plans" does not exist' };
    renderPage();
    expect(await screen.findByText(/plans table isn't in the database yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Certificates on Free" }));
    expect(screen.getByRole("button", { name: /Save/ })).toBeDisabled();
  });
});
