import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
};
const responses: Record<string, unknown> = {
  intel_overview: OVERVIEW,
  intel_search_contacts: [{ person_id: "p1", display_name: "Aman Shaikh", email: "aman@abc.test", phone: "+919876511111", company: "ABC", designation: "CFO", has_account: true, registrations: 2, updated_at: "2026-10-01", total: 1 }],
  intel_search_companies: [{ company_id: "c1", name: "Tata Consultancy Services", domains: ["tcs.test"], industry: null, hq_country: "India", contacts: 3, verification_status: "provisional", updated_at: "2026-10-01", total: 1 }],
  intel_duplicate_queue: [{ id: "d1", score: 95, reasons: ["phone", "same_name"], status: "open", a: { id: "p1", name: "AMAN SHAIKH", emails: ["a@x.test"] }, b: { id: "p2", name: "Aman Shaikh", emails: ["b@x.test"] } }],
  intel_corrections: [{ id: "s1", entity_type: "person", entity_id: "p1", field: "first_name", kind: "capitalisation", current_value: "AMAN", suggested_value: "Aman", reason: "Written in all capitals or all lower case", confidence: 90, evidence: "Formatting rule", safe: true, status: "open", label: "AMAN SHAIKH" }],
  intel_audit_history: { merges: [{ id: "m1", entity_type: "person", merged_ids: ["p2"], survivor: "Aman Shaikh", reason: "Same person", created_at: "2026-10-01", reverted_at: null }], events: [{ id: "e1", action: "intel.contacts_merged", target_type: "person", target_id: "p1", actor: "admin@illuxus.test", details: {}, created_at: "2026-10-01" }] },
};

beforeEach(() => {
  rpc.mockReset();
  rpc.mockImplementation(async (name: string) => ({ data: responses[name] ?? null, error: null }));
});

const openTab = (tab: string) => render(
  <MemoryRouter initialEntries={[`/dashboard/admin/intelligence?tab=${tab}`]}><IntelligenceCentrePage /></MemoryRouter>,
);

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
  it("says so when the server refuses", async () => {
    const { toast } = await import("sonner");
    rpc.mockResolvedValue({ data: null, error: { message: "Only Super Admin can use the Intelligence Centre" } });
    openTab("overview");
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith("Only Super Admin can use the Intelligence Centre"));
  });
});
