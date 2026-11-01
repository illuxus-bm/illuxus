import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const rpc = vi.fn();
vi.mock("@/lib/observability", () => ({ supabaseRpc: (...args: unknown[]) => rpc(...args) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), message: vi.fn() }) }));
vi.mock("@/components/DashboardLayout", () => ({ DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

import IntelligenceCentrePage from "../IntelligenceCentrePage";

const OVERVIEW = {
  people: { contacts: 19, unverified: 15, incomplete: 7, without_company: 3, with_account: 4, quality: 62 },
  companies: { companies: 5, missing_domain: 2, provisional: 4, incomplete: 3 },
  duplicate_contacts: 1, duplicate_companies: 1, flagged: 0, corrections_open: 6, corrections_safe: 2, association_suggestions: 1, merges: 0,
  sponsors_unconnected: 4, sponsors_repeats: 2,
};
const responses: Record<string, unknown> = {
  intel_overview: OVERVIEW,
  intel_search_contacts: [{ person_id: "p1", display_name: "Aman Shaikh", email: "aman@abc.test", phone: "+919876511111", company: "ABC", designation: "CFO", has_account: true, registrations: 2, updated_at: "2026-10-01", total: 60 }],
  intel_search_companies: [{ company_id: "c1", name: "Tata Consultancy Services", domains: ["tcs.test"], industry: null, hq_country: "India", contacts: 3, entry_count: 9, verification_status: "provisional", updated_at: "2026-10-01", total: 1 }],
  intel_search_sponsors: { total: 2, rows: [
    { id: "sp1", name: "Acme", email: null, website: "https://acme.test", company_id: "c1", company: "Acme Ltd", same_company: 1, events: 2, team: 1, created_by: "org@x.test" },
    { id: "sp2", name: "Globex", email: null, website: null, company_id: null, company: null, same_company: 0, events: 0, team: 0, created_by: "org@x.test" },
  ] },
  intel_duplicate_queue: { total: 1, rows: [{ id: "d1", score: 95, reasons: ["phone", "same_name"], status: "open", a: { id: "p1", name: "AMAN SHAIKH", emails: ["a@x.test"] }, b: { id: "p2", name: "Aman Shaikh", emails: ["b@x.test"] } }] },
  intel_corrections: { total: 1, safe_total: 1, rows: [{ id: "s1", entity_type: "person", entity_id: "p1", field: "first_name", kind: "capitalisation", current_value: "AMAN", suggested_value: "Aman", reason: "Written in all capitals or all lower case", confidence: 90, evidence: "Formatting rule", safe: true, status: "open", label: "AMAN SHAIKH" }] },
  intel_audit_history: { total: 1, merges_total: 1, merges: [{ id: "m1", entity_type: "person", merged_ids: ["p2"], survivor: "Aman Shaikh", reason: "Same person", created_at: "2026-10-01", reverted_at: null }], events: [{ id: "e1", action: "intel.contacts_merged", target_type: "person", target_id: "p1", actor: "admin@illuxus.test", details: {}, created_at: "2026-10-01" }] },
};

beforeEach(() => {
  rpc.mockReset();
  rpc.mockImplementation(async (name: string) => ({ data: responses[name] ?? null, error: null }));
});

const openTab = (tab: string) => render(
  <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter initialEntries={[`/dashboard/admin/intelligence?tab=${tab}`]}><IntelligenceCentrePage /></MemoryRouter>
  </QueryClientProvider>,
);
const callsTo = (name: string) => rpc.mock.calls.filter((c) => c[0] === name);
const switchTab = (name: string) => fireEvent.mouseDown(screen.getByRole("tab", { name }), { button: 0 });

describe("Intelligence Centre", () => {
  it("overview: shows counts and the quality score", async () => {
    openTab("overview");
    expect(await screen.findByText("62%")).toBeTruthy();
    expect(screen.getByText("Suspected duplicate contacts")).toBeTruthy();
  });
  it("contacts: lists records and marks those with a login", async () => {
    openTab("contacts");
    expect(await screen.findByText("aman@abc.test")).toBeTruthy();
    expect(screen.getByText("login")).toBeTruthy();
  });
  it("companies: lists records with their domains", async () => {
    openTab("companies");
    expect(await screen.findByText("tcs.test")).toBeTruthy();
  });
  it("duplicates: shows the score band, the reasons and the decisions", async () => {
    openTab("duplicates");
    expect(await screen.findByText(/95% · Very high/)).toBeTruthy();
    expect(screen.getByText("Same phone number")).toBeTruthy();
    for (const name of [/Compare/, /^Different$/, /^Ignore$/, /^Flag$/]) expect(screen.getByRole("button", { name })).toBeTruthy();
  });
  it("corrections: shows old value, suggestion, reason and confidence", async () => {
    openTab("corrections");
    expect(await screen.findByText("AMAN")).toBeTruthy();
    expect((screen.getByPlaceholderText("Enter a value") as HTMLInputElement).value).toBe("Aman");
    expect(screen.getByText("90%")).toBeTruthy();
  });
  it("audit: lists merges with a rollback", async () => {
    openTab("audit");
    expect(await screen.findByRole("button", { name: /Roll back/ })).toBeTruthy();
    expect(screen.getByText("contacts merged")).toBeTruthy();
  });
  it("pages through contacts on the server, keeping the list up while the next page loads", async () => {
    openTab("contacts");
    expect(await screen.findByText("1–25 of 60 contacts")).toBeTruthy();
    let finish: (v: unknown) => void = () => {};
    rpc.mockImplementationOnce(() => new Promise((r) => { finish = r; }));
    fireEvent.click(screen.getByRole("button", { name: "Next page of contacts" }));
    await waitFor(() => expect(callsTo("intel_search_contacts").at(-1)?.[1]).toMatchObject({ _offset: 25, _limit: 25 }));
    expect(screen.getByText("aman@abc.test")).toBeTruthy();
    expect(screen.queryByText("Loading…")).toBeNull();
    finish({ data: responses.intel_search_contacts, error: null });
    expect(await screen.findByText("26–50 of 60 contacts")).toBeTruthy();
  });
  it("sorts on the server and goes back to the first page", async () => {
    openTab("contacts");
    await screen.findByText("1–25 of 60 contacts");
    fireEvent.click(screen.getByRole("button", { name: "Next page of contacts" }));
    await screen.findByText("26–50 of 60 contacts");
    fireEvent.click(screen.getByRole("button", { name: "Name" }));
    await waitFor(() => expect(callsTo("intel_search_contacts").at(-1)?.[1]).toMatchObject({ _sort: "name", _dir: "asc", _offset: 0 }));
  });
  it("keeps a tab's filter and doesn't refetch when coming back to it", async () => {
    openTab("contacts");
    await screen.findByText("aman@abc.test");
    const panel = screen.getByRole("tabpanel");
    fireEvent.change(within(panel).getByLabelText("Filter"), { target: { value: "incomplete" } });
    await waitFor(() => expect(callsTo("intel_search_contacts").at(-1)?.[1]).toMatchObject({ _filter: "incomplete" }));
    const before = callsTo("intel_search_contacts").length;
    switchTab("Companies");
    await screen.findByText("tcs.test");
    switchTab("Contacts");
    await waitFor(() => expect(screen.getByRole("tabpanel").textContent).toContain("aman@abc.test"));
    expect((within(screen.getByRole("tabpanel")).getByLabelText("Filter") as HTMLSelectElement).value).toBe("incomplete");
    expect(callsTo("intel_search_contacts").length).toBe(before);
  });
  it("sponsors: shows connections and connects an unconnected record", async () => {
    rpc.mockImplementation(async (name: string) => ({
      data: name === "intel_search_companies" ? [{ company_id: "c9", name: "Globex Corporation", domains: [], verification_status: "verified", total: 1 }] : responses[name] ?? null,
      error: null,
    }));
    openTab("sponsors");
    expect(await screen.findByText("Acme Ltd")).toBeTruthy();
    expect(screen.getByText("1 other record for this company")).toBeTruthy();
    expect(screen.getByText("Not connected", { selector: "div" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    fireEvent.change(await screen.findByLabelText("Search for Connected to"), { target: { value: "glob" } });
    fireEvent.click(await screen.findByRole("button", { name: /Globex Corporation/ }));
    await waitFor(() => expect(callsTo("intel_connect_sponsor").at(-1)?.[1]).toMatchObject({ _sponsor: "sp2", _company: "c9" }));
  });
  it("duplicates: a decision takes the suggestion off the list straight away", async () => {
    openTab("duplicates");
    await screen.findByText(/95% · Very high/);
    fireEvent.click(screen.getByRole("button", { name: "Ignore" }));
    await waitFor(() => expect(callsTo("intel_set_duplicate_statuses").at(-1)?.[1]).toMatchObject({ _ids: ["d1"], _status: "ignored" }));
  });
  it("says so when the server refuses", async () => {
    const { toast } = await import("sonner");
    rpc.mockResolvedValue({ data: null, error: { message: "Only Super Admin can use the Intelligence Centre" } });
    openTab("overview");
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith("Only Super Admin can use the Intelligence Centre"));
  });
});
