import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rpc = vi.fn();
vi.mock("@/lib/observability", () => ({ supabaseRpc: (...args: unknown[]) => rpc(...args) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), message: vi.fn() }) }));

import { ShareDataDialog } from "../ShareDataDialog";

const preview = (over: Record<string, unknown> = {}) => ({
  event: { id: "e1", title: "CFO Connect Mumbai", date: "2026-01-10", end_date: null, ended: true },
  sponsor: { id: "s1", name: "ABC Technologies", title: "custom", title_label: "Platinum Partner" },
  eligible: 120, with_email: 88, with_mobile: 80, with_both: 78, without_contact: 32,
  fields: [{ key: "full_name", label: "Full name", contact: false }, { key: "email", label: "Email", contact: true }, { key: "mobile", label: "Mobile", contact: true }],
  not_collected: ["Department", "Country"], current: null, ...over,
});
let p: Record<string, unknown>;

beforeEach(() => {
  p = preview();
  rpc.mockReset();
  rpc.mockImplementation(async (name: string) => {
    if (name === "organizer_sponsor_share_preview") return { data: p, error: null };
    if (name === "organizer_sponsor_share_history") return { data: [], error: null };
    return { data: "share-1", error: null };
  });
});

const calls = (name: string) => rpc.mock.calls.filter((c) => c[0] === name);
const onChanged = vi.fn();
const open = () => render(<QueryClientProvider client={new QueryClient()}><ShareDataDialog eventSponsorId="es1" onClose={vi.fn()} onChanged={onChanged} /></QueryClientProvider>);

describe("ShareDataDialog", () => {
  it("names the sponsor and event and counts what would be shared", async () => {
    open();
    expect(await screen.findByText(/ABC Technologies · Platinum Partner · CFO Connect Mumbai/)).toBeTruthy();
    for (const [label, n] of [["Eligible participants", "120"], ["With email", "88"], ["With mobile", "80"], ["With both", "78"], ["Without contact details", "32"]]) {
      expect(screen.getByText(label).parentElement?.textContent).toContain(n);
    }
  });

  it("shares email and mobile, with no setting to leave anyone out", async () => {
    open();
    expect(await screen.findByText(/Not collected by the registration form/)).toBeTruthy();
    expect(screen.queryByText(/permission/i)).toBeNull();
    expect(screen.getByText("Email")).toBeTruthy();
    expect(screen.getByText("Mobile")).toBeTruthy();
  });

  it("shares on confirmation with the chosen options", async () => {
    open();
    fireEvent.click(await screen.findByRole("switch", { name: "Allow download" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm & Share Data" }));
    await waitFor(() => expect(calls("organizer_share_sponsor_data")).toHaveLength(1));
    expect(calls("organizer_share_sponsor_data")[0][1]).toEqual({ _event_sponsor: "es1", _share_before_end: false, _allow_export: false });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("before an event ends, needs an explicit confirmation", async () => {
    p = preview({ event: { ...preview().event, ended: false } });
    open();
    const button = await screen.findByRole("button", { name: "Confirm & Share Data" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Share before the event ends" }));
    expect((button as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(button);
    await waitFor(() => expect(calls("organizer_share_sponsor_data")[0][1]).toMatchObject({ _share_before_end: true }));
  });

  it("when already shared, offers a new version and revoking", async () => {
    p = preview({ current: { id: "sh1", version: 2, status: "active", record_count: 120, with_email: 88, with_mobile: 80, allow_export: true, shared_at: "2026-01-12T10:00:00Z" } });
    open();
    expect(await screen.findByText(/Data shared · version 2/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Share updated data (version 3)" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Revoke access" }));
    fireEvent.change(screen.getByLabelText("Reason for revoking"), { target: { value: "Contract ended" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm revoke" }));
    await waitFor(() => expect(calls("organizer_revoke_sponsor_data")[0][1]).toEqual({ _share: "sh1", _reason: "Contract ended" }));
  });

  it("shows why when the server refuses", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Only the event owner or an organisation admin can share participant data" } });
    open();
    expect(await screen.findByText("Only the event owner or an organisation admin can share participant data")).toBeTruthy();
  });
});
