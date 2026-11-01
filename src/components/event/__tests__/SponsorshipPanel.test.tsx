import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rpc = vi.fn();
vi.mock("@/lib/observability", () => ({ supabaseRpc: (...args: unknown[]) => rpc(...args) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), message: vi.fn() }) }));

import { SponsorshipPanel } from "../SponsorshipPanel";

const detail = (over: Record<string, unknown> = {}) => ({
  access: "commercial",
  sponsor: { id: "sp1", name: "ABC Tech", email: null, website: null, logo_url: null, description: null },
  company: { id: "c1", name: "ABC Technologies", website: "https://abc.test", industry: "Software", description: null, domains: ["abc.test"] },
  sponsorship: { id: "es1", event_id: "e1", tier: "custom", tier_label: "Knowledge Partner", logo_url: null, package: "Booth", deliverables: null, status: "active", notes: null, commercial_value: 500000, currency: "INR", contract_url: null, payment_status: "part_paid" },
  team: [{ id: "m1", person_id: "p1", name: "Aman Shaikh", email: "aman@abc.test", designation: "CFO", accepted_at: null, invite_token: "tok", assigned: true, role_label: "Lead", responsibilities: null }],
  history: [{ event_sponsor_id: "es2", event_id: "e2", event: "CFO Connect Delhi", date: null, tier: "gold", tier_label: null }],
  ...over,
});
let current: Record<string, unknown>;
let known: unknown[];

beforeEach(() => {
  current = detail();
  known = [{ member_id: "m9", person_id: "p9", name: "Priya Shah", email: "priya@abc.test", designation: "Marketing Director", phone: null, assigned: false }];
  rpc.mockReset();
  rpc.mockImplementation(async (name: string) => {
    if (name === "organizer_sponsorship_detail") return { data: current, error: null };
    if (name === "organizer_search_company_contacts") return { data: known, error: null };
    if (name === "organizer_add_sponsor_contact") return { data: { member_id: "m2", sponsor_id: "sp1", existing: false }, error: null };
    if (name === "organizer_assign_sponsor_contact") return { data: { member_id: "m10", new_member: true, sponsor_id: "sp1" }, error: null };
    return { data: null, error: null };
  });
});

const calls = (name: string) => rpc.mock.calls.filter((c) => c[0] === name);
const onInvite = vi.fn();
const open = (tab: "company" | "sponsorship" | "team" = "team") => render(
  <QueryClientProvider client={new QueryClient()}>
    <SponsorshipPanel eventSponsorId="es1" sponsorName="ABC Tech" initialTab={tab} onClose={vi.fn()} onChanged={vi.fn()}
                      onInvite={onInvite} onCopyInvite={vi.fn()} onRemoveMember={vi.fn(async () => {})} />
  </QueryClientProvider>,
);

describe("SponsorshipPanel: the team", () => {
  beforeEach(() => onInvite.mockReset());

  it("never asks for the company, and says where people will go", async () => {
    open();
    fireEvent.click(await screen.findByRole("button", { name: /Add new contact/ }));
    expect(screen.getByText("ABC Technologies", { selector: "strong" })).toBeTruthy();
    expect(screen.queryByText("Company *")).toBeNull();
    expect(screen.queryByText("Company website")).toBeNull();
    expect(screen.getByText("First name *")).toBeTruthy();
    expect(screen.getByText("LinkedIn profile")).toBeTruthy();
  });

  it("finds a known contact and adds them, inviting them to a sponsor they weren't on", async () => {
    open();
    fireEvent.click(await screen.findByRole("button", { name: /Add existing contact/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Add" }));
    await waitFor(() => expect(calls("organizer_assign_sponsor_contact")).toHaveLength(1));
    expect(calls("organizer_assign_sponsor_contact")[0][1]).toMatchObject({ _event_sponsor: "es1", _member: "m9" });
    await waitFor(() => expect(onInvite).toHaveBeenCalledWith({ sponsorId: "sp1", memberId: "m10", recipient: "priya@abc.test" }));
  });

  it("marks a contact already on this event instead of offering them again", async () => {
    known = [{ member_id: "m1", person_id: "p1", name: "Aman Shaikh", email: "aman@abc.test", designation: null, phone: null, assigned: true }];
    open();
    fireEvent.click(await screen.findByRole("button", { name: /Add existing contact/ }));
    expect(await screen.findByText("On this event", { selector: "span" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull();
  });

  it("taking someone off the event keeps them on the team", async () => {
    open();
    fireEvent.click((await screen.findAllByRole("checkbox", { name: /On this event/ }))[0]);
    await waitFor(() => expect(calls("organizer_set_sponsor_contact")).toHaveLength(1));
    expect(calls("organizer_set_sponsor_contact")[0][1]).toMatchObject({ _member: "m1", _remove: true });
  });

  it("resends an invitation through the existing path", async () => {
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Resend invitation email to aman@abc.test" }));
    expect(onInvite).toHaveBeenCalledWith({ sponsorId: "sp1", memberId: "m1", recipient: "aman@abc.test" });
  });
});

describe("SponsorshipPanel: this event and the company", () => {
  it("shows the canonical company and other sponsorships", async () => {
    open("company");
    expect((await screen.findAllByText("ABC Technologies")).length).toBeGreaterThan(0);
    expect(screen.getByText("abc.test")).toBeTruthy();
    expect(screen.getByText("CFO Connect Delhi")).toBeTruthy();
    expect(screen.getByText("Gold")).toBeTruthy();
  });

  it("saves this event's details, including commercial ones", async () => {
    open("sponsorship");
    fireEvent.change(await screen.findByLabelText("Package"), { target: { value: "Stage" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls("organizer_update_sponsorship")).toHaveLength(1));
    expect(calls("organizer_update_sponsorship")[0][1]).toMatchObject({
      _event_sponsor: "es1",
      _changes: { package: "Stage", tier: "custom", tier_label: "Knowledge Partner", commercial_value: "500000" },
    });
  });

  it("leaves commercial details out for those without access", async () => {
    current = detail({ access: "manage", sponsorship: { ...(detail().sponsorship as object), commercial_value: null, currency: null, payment_status: null } });
    open("sponsorship");
    fireEvent.change(await screen.findByLabelText("Package"), { target: { value: "Stage" } });
    expect(screen.queryByLabelText("Value")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls("organizer_update_sponsorship")).toHaveLength(1));
    const changes = calls("organizer_update_sponsorship")[0][1]._changes as Record<string, unknown>;
    for (const k of ["commercial_value", "currency", "contract_url", "payment_status"]) expect(k in changes).toBe(false);
  });

  it("says why when access is refused", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "You don't have access to this event's sponsors" } });
    open();
    expect(await screen.findByText("You don't have access to this event's sponsors")).toBeTruthy();
  });
});
