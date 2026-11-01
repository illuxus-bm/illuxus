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
  sponsors_unconnected: 4, sponsors_repeats: 2, sponsor_identities: 12, event_sponsorships: 31, merge_recommendations: 3,
};
const responses: Record<string, unknown> = {
  intel_overview: OVERVIEW,
  intel_search_contacts: [{ person_id: "p1", display_name: "Aman Shaikh", email: "aman@abc.test", phone: "+919876511111", company: "ABC", designation: "CFO", has_account: true, registrations: 2, updated_at: "2026-10-01", total: 60 }],
  intel_search_companies: [{ company_id: "c1", name: "Tata Consultancy Services", domains: ["tcs.test"], industry: null, hq_country: "India", contacts: 3, entry_count: 9, verification_status: "provisional", updated_at: "2026-10-01", total: 1 }],
  intel_search_sponsors: { total: 2, rows: [
    { id: "sp1", name: "Acme", email: null, website: "https://acme.test", company_id: "c1", company: "Acme Ltd", same_company: 1, same_owner: ["sp9"], events: 2, team: 1, created_by: "org@x.test",
      sponsorships: [{ id: "es1", event: "CFO Connect Mumbai", date: "2026-01-01", tier: "platinum", tier_label: null }, { id: "es2", event: "HR Circle", date: "2026-02-01", tier: "custom", tier_label: "Knowledge Partner" }] },
    { id: "sp2", name: "Globex", email: null, website: null, company_id: null, company: null, same_company: 0, same_owner: [], events: 0, team: 0, created_by: "org@x.test", sponsorships: [] },
  ] },
  intel_sponsor_review: { total: 1, counts: { duplicate_sponsor_records: 1 }, rows: [{ kind: "duplicate_sponsor_records", title: "Acme Ltd", detail: "2 records from org@x.test", company_id: "c1", sponsor_ids: ["sp1", "sp9"], person_ids: [] }] },
  intel_sponsor_merge_preview: { same_owner: true, same_company: true, conflicts: [], repeats: 0, records: [{ id: "sp1", name: "Acme", company: "Acme Ltd", team: 1, events: [{ event: "CFO Connect Mumbai", tier: "platinum", tier_label: null }] }, { id: "sp9", name: "Acme Pvt", company: "Acme Ltd", team: 0, events: [{ event: "HR Circle", tier: "custom", tier_label: "Knowledge Partner" }] }] },
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
    expect(await screen.findByText("62% data quality")).toBeTruthy();
    for (const label of ["Total contacts", "Total companies", "Sponsor identities", "Event sponsorships", "Potential duplicate contacts", "Potential duplicate companies", "Corrections pending", "Merge recommendations"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByText("31")).toBeTruthy();
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
    fireEvent.click(within(panel).getByRole("button", { name: "Incomplete" }));
    await waitFor(() => expect(callsTo("intel_search_contacts").at(-1)?.[1]).toMatchObject({ _filter: "incomplete" }));
    const before = callsTo("intel_search_contacts").length;
    switchTab("Companies");
    await screen.findByText("tcs.test");
    switchTab("Contacts");
    await waitFor(() => expect(screen.getByRole("tabpanel").textContent).toContain("aman@abc.test"));
    expect(within(screen.getByRole("tabpanel")).getByRole("button", { name: "Incomplete" }).getAttribute("aria-pressed")).toBe("true");
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
    fireEvent.click(screen.getByRole("button", { name: "2 events of Acme" }));
    expect(await screen.findByText("Knowledge Partner")).toBeTruthy();
    expect(screen.getByText("Platinum")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    fireEvent.change(await screen.findByLabelText("Search for Connected to"), { target: { value: "glob" } });
    fireEvent.click(await screen.findByRole("button", { name: /Globex Corporation/ }));
    await waitFor(() => expect(callsTo("intel_connect_sponsor").at(-1)?.[1]).toMatchObject({ _sponsor: "sp2", _company: "c9" }));
  });
  it("sponsors: combining shows each record's events and titles, and confirms first", async () => {
    openTab("sponsors");
    fireEvent.click(await screen.findByRole("button", { name: "Combine" }));
    expect(await screen.findByText("Combine sponsor records")).toBeTruthy();
    expect(await screen.findByText("Knowledge Partner")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "Same company" } });
    fireEvent.click(screen.getByRole("button", { name: "Combine records" }));
    expect(callsTo("intel_merge_sponsors")).toHaveLength(0);
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(callsTo("intel_merge_sponsors").at(-1)?.[1]).toMatchObject({ _survivor: "sp1", _others: ["sp9"] }));
  });
  it("sponsors: moving a sponsorship goes to the chosen company", async () => {
    rpc.mockImplementation(async (name: string) => ({
      data: name === "intel_search_companies" ? [{ company_id: "c9", name: "Right Co", domains: [], verification_status: "verified", total: 1 }] : responses[name] ?? null,
      error: null,
    }));
    openTab("sponsors");
    fireEvent.click(await screen.findByRole("button", { name: "2 events of Acme" }));
    fireEvent.click((await screen.findAllByRole("button", { name: "Move" }))[0]);
    fireEvent.change(await screen.findByLabelText("Search for Move to"), { target: { value: "right" } });
    fireEvent.click(await screen.findByRole("button", { name: /Right Co/ }));
    await waitFor(() => expect(callsTo("intel_move_sponsorship").at(-1)?.[1]).toMatchObject({ _event_sponsor: "es1", _company: "c9" }));
  });
  it("merge centre: lists recommendations of high confidence, and merges with rollback", async () => {
    openTab("merge");
    expect(await screen.findByText("Recommended merges")).toBeTruthy();
    expect(await screen.findByText("Repeat sponsor records")).toBeTruthy();
    expect(await screen.findByRole("button", { name: /Roll back/ })).toBeTruthy();
    await waitFor(() => expect(callsTo("intel_duplicate_queue").at(-1)?.[1]).toMatchObject({ _min_score: 80 }));
  });
  it("review queue: lists sponsor data to decide on, without changing it", async () => {
    openTab("review");
    expect(await screen.findByText("Repeat sponsor records")).toBeTruthy();
    expect(screen.getByText("2 records from org@x.test")).toBeTruthy();
    expect(callsTo("intel_merge_sponsors")).toHaveLength(0);
  });
  it("shows a way to retry when a list can't load", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "nope" } });
    openTab("contacts");
    expect(await screen.findByRole("button", { name: "Try again" })).toBeTruthy();
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
