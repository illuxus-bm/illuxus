import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rpc = vi.fn();
vi.mock("@/lib/observability", () => ({ supabaseRpc: (...args: unknown[]) => rpc(...args) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), message: vi.fn() }) }));
vi.mock("../SponsorLogoUploader", () => ({ default: ({ value }: { value: string }) => <div>logo: {value || "none"}</div> }));

import { AddSponsorDialog } from "../AddSponsorDialog";

const record = (over: Record<string, unknown> = {}) => ({
  sponsor_id: "sp1", name: "KDK", company_id: "c1", company: "K.D.K. Software", website: "https://kdk.test", email: "hi@kdk.test",
  logo_url: null, tier: "gold", tier_label: null, events: 3, on_event: false, ...over,
});
let options: Record<string, unknown>;

beforeEach(() => {
  options = { records: [record()], companies: [{ company_id: "c2", name: "KDK Motors", website: "https://kdkmotors.test", verified: true }], exact: false };
  rpc.mockReset();
  rpc.mockImplementation(async (name: string) => {
    if (name === "organizer_sponsor_options") return { data: options, error: null };
    if (name === "organizer_add_event_sponsor") return { data: { event_sponsor_id: "es9", sponsor_id: "sp1", name: "KDK", email: "hi@kdk.test", company_id: "c1", company: "K.D.K. Software", created: false }, error: null };
    return { data: null, error: null };
  });
});

const calls = (name: string) => rpc.mock.calls.filter((c) => c[0] === name);
const onAdded = vi.fn();
const onClose = vi.fn();
const open = () => render(
  <QueryClientProvider client={new QueryClient()}>
    <AddSponsorDialog eventId="e1" tiers={[{ value: "gold", label: "Gold" }, { value: "custom", label: "Custom…" }]} presets={[]} onClose={onClose} onAdded={onAdded} />
  </QueryClientProvider>,
);
const search = (text: string) => fireEvent.change(screen.getByLabelText("Search for a sponsor or company"), { target: { value: text } });

describe("AddSponsorDialog", () => {
  beforeEach(() => { onAdded.mockReset(); onClose.mockReset(); });

  it("searches as you type, showing the organisation's sponsors and known companies", async () => {
    open();
    search("kdk");
    await waitFor(() => expect(calls("organizer_sponsor_options").at(-1)?.[1]).toMatchObject({ _event: "e1", _q: "kdk" }));
    expect(await screen.findByText("Your sponsors")).toBeTruthy();
    expect(screen.getByText("K.D.K. Software")).toBeTruthy();
    expect(screen.getByText("Known companies")).toBeTruthy();
    expect(screen.getByText("KDK Motors")).toBeTruthy();
  });

  it("reuses an existing sponsor: it asks only for this event's title, and sends only the record", async () => {
    open();
    fireEvent.click(await screen.findByRole("button", { name: /K\.D\.K\. Software/ }));
    expect(await screen.findByText(/Your existing sponsor/)).toBeTruthy();
    expect(screen.queryByLabelText("Email")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add to this event" }));
    await waitFor(() => expect(calls("organizer_add_event_sponsor")).toHaveLength(1));
    expect(calls("organizer_add_event_sponsor")[0][1]).toMatchObject({ _event: "e1", _sponsor: "sp1", _company: null, _name: null, _tier: "gold", _website: "https://kdk.test" });
    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });

  it("a known company fills in its website and logo, and is sent by id", async () => {
    options = { records: [], companies: [{ company_id: "c2", name: "KDK Motors", website: "https://kdkmotors.test", logo_url: "https://l/kdk.png", verified: true }], exact: false };
    open();
    fireEvent.click(await screen.findByRole("button", { name: /KDK Motors/ }));
    expect(((await screen.findByLabelText("Website")) as HTMLInputElement).value).toBe("https://kdkmotors.test");
    expect(await screen.findByText("logo: https://l/kdk.png")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add to this event" }));
    await waitFor(() => expect(calls("organizer_add_event_sponsor")[0][1]).toMatchObject({ _company: "c2", _sponsor: null, _website: "https://kdkmotors.test", _logo_url: "https://l/kdk.png" }));
  });

  it("an existing sponsor shows its website and logo", async () => {
    options = { records: [record({ logo_url: "https://l/own.png", has_website: true })], companies: [], exact: false };
    open();
    fireEvent.click(await screen.findByRole("button", { name: /K\.D\.K\. Software/ }));
    expect(await screen.findByText("https://kdk.test")).toBeTruthy();
    expect(screen.getByText("logo: https://l/own.png")).toBeTruthy();
  });

  it("a sponsor missing a website can be given one, offering the company's", async () => {
    options = { records: [record({ website: "https://fromcompany.test", has_website: false })], companies: [], exact: false };
    open();
    fireEvent.click(await screen.findByRole("button", { name: /K\.D\.K\. Software/ }));
    expect(((await screen.findByLabelText("Website")) as HTMLInputElement).value).toBe("https://fromcompany.test");
  });

  it("asks for a new company's website and logo, as none is on record", async () => {
    options = { records: [], companies: [], exact: false };
    open();
    search("Fresh Name Ltd");
    fireEvent.click(await screen.findByRole("button", { name: /Add "Fresh Name Ltd" as a new company/ }));
    expect(await screen.findByText(/isn't on record yet/)).toBeTruthy();
    expect(screen.getByText("logo: none")).toBeTruthy();
  });

  it("offers a new company only for a name that isn't already an option", async () => {
    options = { records: [], companies: [], exact: false };
    open();
    search("Fresh Name Ltd");
    fireEvent.click(await screen.findByRole("button", { name: /Add "Fresh Name Ltd" as a new company/ }));
    fireEvent.change(await screen.findByLabelText("Email"), { target: { value: "a@fresh.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to this event" }));
    await waitFor(() => expect(calls("organizer_add_event_sponsor")[0][1]).toMatchObject({ _name: "Fresh Name Ltd", _email: "a@fresh.test", _sponsor: null, _company: null }));
  });

  it("doesn't offer a new company for an exact match", async () => {
    options = { records: [record()], companies: [], exact: true };
    open();
    search("KDK");
    await screen.findByText("Your sponsors");
    await waitFor(() => expect(calls("organizer_sponsor_options").at(-1)?.[1]).toMatchObject({ _q: "KDK" }));
    expect(screen.queryByRole("button", { name: /as a new company/ })).toBeNull();
  });

  it("marks a sponsor already on this event and doesn't let it be picked", async () => {
    options = { records: [record({ on_event: true })], companies: [], exact: false };
    open();
    expect(await screen.findByText("On this event")).toBeTruthy();
    expect((screen.getByRole("button", { name: /K\.D\.K\. Software/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("says why when the server refuses", async () => {
    const { toast } = await import("sonner");
    rpc.mockImplementation(async (name: string) => (name === "organizer_sponsor_options" ? { data: options, error: null } : { data: null, error: { message: "This sponsor is already on this event." } }));
    open();
    fireEvent.click(await screen.findByRole("button", { name: /K\.D\.K\. Software/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Add to this event" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("This sponsor is already on this event."));
    expect(onClose).not.toHaveBeenCalled();
  });
});
