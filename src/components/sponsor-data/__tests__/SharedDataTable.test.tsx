import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rpc = vi.fn();
vi.mock("@/lib/observability", () => ({ supabaseRpc: (...args: unknown[]) => rpc(...args) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), message: vi.fn() }) }));

import { SharedDataTable } from "../SharedDataTable";

const fields = [
  { key: "full_name", label: "Full name", contact: false }, { key: "designation", label: "Designation", contact: false },
  { key: "company", label: "Company", contact: false }, { key: "email", label: "Email", contact: true },
  { key: "mobile", label: "Mobile", contact: true }, { key: "linkedin_url", label: "LinkedIn", contact: true },
  { key: "attendance", label: "Attendance", contact: false }, { key: "industry", label: "Industry", contact: false },
  { key: "contact_permission", label: "Contact permission", contact: false },
];
const rows = [
  { full_name: "Pat Kumar", designation: "CFO", company: "Acme", email: "pat@acme.test", mobile: "+91 9876500011", attendance: "Attended", industry: "Banking", contact_permission: "Given" },
  { full_name: "Kept Private", designation: "CTO", company: "Acme", attendance: "Did not attend", contact_permission: "Not given" },
];

beforeEach(() => {
  rpc.mockReset();
  rpc.mockImplementation(async (name: string) => {
    if (name === "shared_dataset_rows") return { data: { total: 60, fields, reader: "sponsor", rows }, error: null };
    return { data: { fields, rows }, error: null };
  });
});

const calls = (name: string) => rpc.mock.calls.filter((c) => c[0] === name);
const open = (canExport = true) => render(<QueryClientProvider client={new QueryClient()}><SharedDataTable shareId="sh1" canExport={canExport} fileName="data" /></QueryClientProvider>);

describe("SharedDataTable", () => {
  it("shows email and mobile as working links", async () => {
    open();
    const email = await screen.findByRole("link", { name: "pat@acme.test" });
    expect(email.getAttribute("href")).toBe("mailto:pat@acme.test");
    expect(screen.getByRole("link", { name: "+91 9876500011" }).getAttribute("href")).toBe("tel:+919876500011");
  });

  it("reads the full list a page at a time, with the total", async () => {
    open();
    expect(await screen.findByText("1–25 of 60 participants")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next page of participants" }));
    await waitFor(() => expect(calls("shared_dataset_rows").at(-1)?.[1]).toMatchObject({ _offset: 25 }));
  });

  it("searches and filters on the server", async () => {
    open();
    await screen.findByText("Pat Kumar");
    fireEvent.click(screen.getByRole("button", { name: "With mobile" }));
    await waitFor(() => expect(calls("shared_dataset_rows").at(-1)?.[1]).toMatchObject({ _filter: "with_mobile", _offset: 0 }));
    fireEvent.change(screen.getByLabelText("Name, company, designation, email or mobile"), { target: { value: "98765" } });
    await waitFor(() => expect(calls("shared_dataset_rows").at(-1)?.[1]).toMatchObject({ _q: "98765" }));
  });

  it("sorts by a column", async () => {
    open();
    await screen.findByText("Pat Kumar");
    fireEvent.click(screen.getByRole("button", { name: /^Company/ }));
    await waitFor(() => expect(calls("shared_dataset_rows").at(-1)?.[1]).toMatchObject({ _sort: "company", _dir: "asc" }));
  });

  it("opens a participant's full details", async () => {
    open();
    fireEvent.click(await screen.findByText("Pat Kumar"));
    expect(await screen.findByRole("link", { name: /Email/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Call/ }).getAttribute("href")).toBe("tel:+919876500011");
  });

  it("offers downloads only when allowed", async () => {
    open(false);
    await screen.findByText("Pat Kumar");
    expect(screen.queryByRole("button", { name: /CSV/ })).toBeNull();
  });

  it("downloads every shared participant", async () => {
    const click = vi.fn();
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = createElement(tag);
      if (tag === "a") (el as HTMLAnchorElement).click = click;
      return el;
    });
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    open();
    fireEvent.click(await screen.findByRole("button", { name: /CSV/ }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(calls("shared_dataset_export")).toHaveLength(1);
  });
});
