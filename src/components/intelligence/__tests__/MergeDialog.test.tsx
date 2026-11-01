import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const rpc = vi.fn();
vi.mock("@/lib/observability", () => ({ supabaseRpc: (...args: unknown[]) => rpc(...args) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), message: vi.fn() }) }));

import { MergeDialog } from "../MergeDialog";
import { confidenceBand, mergeOptions, reasonLabel } from "@/lib/intelligence/admin-api";

const person = (id: string, over: Record<string, unknown> = {}) => ({
  id, display_name: "Aman Shaikh", first_name: "Aman", last_name: "Shaikh", designation: "CFO", user_id: null, created_at: "2026-01-01", ...over,
});
const company = (id: string, over: Record<string, unknown> = {}) => ({ id, name: "TCS", created_at: "2026-01-01", ...over });

let records: Record<string, Record<string, unknown>>;
let impact: Record<string, unknown>;

beforeEach(() => {
  rpc.mockReset();
  impact = { registrations: 2, speaker_records: 1 };
  rpc.mockImplementation(async (name: string, params: Record<string, unknown>) => {
    if (name === "intel_contact_detail") return { data: { person: records[params._id as string] }, error: null };
    if (name === "intel_company_detail") return { data: { company: records[params._id as string] }, error: null };
    if (name === "intel_merge_preview") return { data: impact, error: null };
    return { data: "merge-1", error: null };
  });
});

const mergeCalls = (name: string) => rpc.mock.calls.filter((c) => c[0] === name);
const open = (entity: "person" | "company", ids = ["a", "b"], onMerged = vi.fn()) =>
  render(<MergeDialog entity={entity} ids={ids} open onOpenChange={vi.fn()} onMerged={onMerged} />);
const mergeButton = () => screen.findByRole("button", { name: /Merge into/ });
/** The merge button, then the confirmation it leads to. */
const confirmMerge = async () => {
  fireEvent.click(await mergeButton());
  fireEvent.click(await screen.findByRole("button", { name: "Confirm merge" }));
};

describe("MergeDialog", () => {
  it("shows what will move, and needs a reason before merging", async () => {
    records = { a: person("a"), b: person("b") };
    open("person");
    expect(await screen.findByText("Event registrations")).toBeTruthy();
    expect((await mergeButton() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "Same person" } });
    expect((await mergeButton() as HTMLButtonElement).disabled).toBe(false);
  });

  it("sends only the fields whose final value differs from the survivor's", async () => {
    records = { a: person("a"), b: person("b", { designation: "Chief Financial Officer" }) };
    const onMerged = vi.fn();
    open("person", ["a", "b"], onMerged);
    fireEvent.click(await screen.findByRole("button", { name: "Chief Financial Officer" }));
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "Same person" } });
    await confirmMerge();
    await waitFor(() => expect(mergeCalls("intel_merge_people")).toHaveLength(1));
    expect(mergeCalls("intel_merge_people")[0][1]).toEqual({
      _survivor: "a", _others: ["b"], _choices: { designation: "Chief Financial Officer" }, _reason: "Same person",
    });
    await waitFor(() => expect(onMerged).toHaveBeenCalled());
  });

  it("makes the record with a login the survivor", async () => {
    records = { a: person("a"), b: person("b", { user_id: "u1" }) };
    open("person");
    fireEvent.change(await screen.findByLabelText(/Reason/), { target: { value: "Same person" } });
    await confirmMerge();
    await waitFor(() => expect(mergeCalls("intel_merge_people")).toHaveLength(1));
    expect(mergeCalls("intel_merge_people")[0][1]).toMatchObject({ _survivor: "b", _others: ["a"] });
  });

  it("refuses two records that each have a login", async () => {
    records = { a: person("a", { user_id: "u1" }), b: person("b", { user_id: "u2" }) };
    open("person");
    expect(await screen.findByText(/Accounts are never merged or moved/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "Same person" } });
    expect((await mergeButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it("needs explicit confirmation for separate legal entities", async () => {
    records = { a: company("a"), b: company("b") };
    impact = { contacts: 3, distinct_legal_entities: true, parent_child: false };
    open("company");
    const box = await screen.findByRole("checkbox");
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "Same company" } });
    expect((await mergeButton() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(box);
    expect((await mergeButton() as HTMLButtonElement).disabled).toBe(false);
    await confirmMerge();
    await waitFor(() => expect(mergeCalls("intel_merge_companies")).toHaveLength(1));
    expect(mergeCalls("intel_merge_companies")[0][1]).toMatchObject({ _allow_distinct: true });
  });
});

describe("helpers", () => {
  it("uses the agreed confidence bands", () => {
    expect([100, 95, 94, 80, 79, 60, 59].map((s) => confidenceBand(s).label)).toEqual(
      ["Very high", "Very high", "High", "High", "Possible", "Possible", "Low"]);
  });
  it("lists distinct values, survivor first", () => {
    expect(mergeOptions([{ d: "CFO" }, { d: "Chief" }, { d: "CFO" }], "d", 1)).toEqual(["Chief", "CFO"]);
  });
  it("explains reasons in words", () => {
    expect(reasonLabel("phone")).toBe("Same phone number");
    expect(reasonLabel("something_new")).toBe("something new");
  });

  it("confirms before merging, and going back merges nothing", async () => {
    records = { a: person("a"), b: person("b") };
    open("person");
    fireEvent.change(await screen.findByLabelText(/Reason/), { target: { value: "Same person" } });
    fireEvent.click(await mergeButton());
    fireEvent.click(await screen.findByRole("button", { name: "Back" }));
    expect(mergeCalls("intel_merge_people")).toHaveLength(0);
    expect(await mergeButton()).toBeTruthy();
  });

  it("shows the scan's confidence and reasons", async () => {
    records = { a: person("a"), b: person("b") };
    render(<MergeDialog entity="person" ids={["a", "b"]} match={{ score: 95, reasons: ["phone"] }} open onOpenChange={vi.fn()} onMerged={vi.fn()} />);
    expect(await screen.findByText(/95% · Very high/)).toBeTruthy();
    expect(screen.getByText("Same phone number")).toBeTruthy();
  });

  it("offers to combine repeat sponsor records after a company merge, and does it", async () => {
    records = { a: company("a"), b: company("b") };
    impact = { sponsors: 2 };
    open("company");
    expect(await screen.findByText(/combine each organiser's repeat sponsor records/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "Same company" } });
    await confirmMerge();
    await waitFor(() => expect(mergeCalls("intel_consolidate_company_sponsors")).toHaveLength(1));
    expect(mergeCalls("intel_consolidate_company_sponsors")[0][1]).toEqual({ _company: "a", _reason: "Same company" });
  });

  it("leaves sponsor records alone when that's unticked", async () => {
    records = { a: company("a"), b: company("b") };
    impact = { sponsors: 2 };
    open("company");
    fireEvent.click(await screen.findByRole("checkbox", { name: /combine each organiser/ }));
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "Same company" } });
    await confirmMerge();
    await waitFor(() => expect(mergeCalls("intel_merge_companies")).toHaveLength(1));
    expect(mergeCalls("intel_consolidate_company_sponsors")).toHaveLength(0);
  });
});
