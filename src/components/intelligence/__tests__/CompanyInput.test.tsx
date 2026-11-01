import { useState } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const rpc = vi.fn();
vi.mock("@/lib/observability", () => ({ supabaseRpc: (...args: unknown[]) => rpc(...args) }));

import { CompanyInput } from "../CompanyInput";

function Harness({ onValue }: { onValue?: (v: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <CompanyInput
      aria-label="Company"
      value={value}
      onChange={(v) => {
        setValue(v);
        onValue?.(v);
      }}
    />
  );
}

const ROWS = [
  { company_id: "c1", name: "Tata Consultancy Services", verified: true },
  { company_id: "c2", name: "Tata Motors", verified: false },
];

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: ROWS, error: null });
});

const type = (text: string) => fireEvent.change(screen.getByRole("combobox"), { target: { value: text } });

describe("CompanyInput", () => {
  it("suggests companies once two characters are typed", async () => {
    render(<Harness />);
    type("ta");
    expect(await screen.findByRole("option", { name: /Tata Consultancy Services/ })).toBeTruthy();
    expect(rpc).toHaveBeenCalledWith("suggest_companies", { _q: "ta", _limit: 8 });
    expect(screen.getByRole("combobox").getAttribute("aria-expanded")).toBe("true");
  });

  it("does not look anything up for a single character", async () => {
    render(<Harness />);
    type("t");
    await new Promise((r) => setTimeout(r, 300));
    expect(rpc).not.toHaveBeenCalled();
  });

  it("fills in the picked company and stops suggesting", async () => {
    const seen: string[] = [];
    render(<Harness onValue={(v) => seen.push(v)} />);
    type("tata m");
    fireEvent.mouseDown(await screen.findByRole("option", { name: /Tata Motors/ }));
    expect(seen.at(-1)).toBe("Tata Motors");
    expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe("Tata Motors");
    expect(screen.queryByRole("listbox")).toBeNull();
    await new Promise((r) => setTimeout(r, 300));
    expect(rpc).toHaveBeenCalledTimes(1); // picking doesn't search for the picked name
  });

  it("picks with the keyboard", async () => {
    render(<Harness />);
    type("ta");
    await screen.findByRole("listbox");
    const box = screen.getByRole("combobox");
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "Enter" });
    expect((box as HTMLInputElement).value).toBe("Tata Motors");
  });

  it("keeps any name typed — suggestions are optional", async () => {
    render(<Harness />);
    type("My Own Startup");
    await screen.findByRole("listbox");
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe("My Own Startup");
  });

  it("shows nothing when the lookup fails or is rate-limited", async () => {
    rpc.mockResolvedValue({ data: null, error: new Error("Too many lookups") });
    render(<Harness />);
    type("ta");
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("marks verified companies", async () => {
    render(<Harness />);
    type("ta");
    const option = await screen.findByRole("option", { name: /Tata Consultancy Services/ });
    expect(option.querySelector('[aria-label="Verified"]')).toBeTruthy();
  });
});
