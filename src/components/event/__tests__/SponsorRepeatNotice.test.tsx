import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const results = vi.hoisted(() => ({ rows: [] as unknown[] }));
vi.mock("@/hooks/useOrgPeopleSearch", () => ({ useOrgSponsorSearch: () => ({ data: results.rows }) }));

import { SponsorRepeatNotice, findRepeats } from "../SponsorRepeatNotice";
import type { SponsorLite } from "@/hooks/useOrgPeopleSearch";

const sponsor = (id: string, name: string, website: string | null = null) =>
  ({ id, name, website, email: null, logo_url: null, tier: "bronze", tier_label: null, description: null }) as SponsorLite;

describe("findRepeats", () => {
  it("matches a name that differs only by case, spacing or legal suffix", () => {
    const rows = [sponsor("1", "ACME  Pvt Ltd"), sponsor("2", "Acme Motors")];
    expect(findRepeats(rows, "Acme", "").map((s) => s.id)).toEqual(["1"]);
  });
  it("matches the same website under a different name", () => {
    expect(findRepeats([sponsor("1", "Tata", "https://www.tcs.com/about")], "TCS", "tcs.com").map((s) => s.id)).toEqual(["1"]);
  });
  it("doesn't match when both are blank", () => {
    expect(findRepeats([sponsor("1", "Acme")], "", "")).toEqual([]);
  });
});

describe("SponsorRepeatNotice", () => {
  beforeEach(() => { results.rows = []; });
  it("shows nothing when there's no repeat", () => {
    results.rows = [sponsor("1", "Other Co")];
    const { container } = render(<SponsorRepeatNotice name="Acme" website="" assignedIds={new Set()} onUse={vi.fn()} />);
    expect(container.textContent).toBe("");
  });
  it("offers the existing record, listing it once", () => {
    const onUse = vi.fn();
    results.rows = [sponsor("1", "Acme Ltd")];
    render(<SponsorRepeatNotice name="Acme" website="" assignedIds={new Set()} onUse={onUse} />);
    fireEvent.click(screen.getByRole("button", { name: "Use this sponsor" }));
    expect(onUse).toHaveBeenCalledWith(expect.objectContaining({ id: "1" }));
  });
  it("says so when it's already on this event, with nothing that would remove it", () => {
    results.rows = [sponsor("1", "Acme Ltd")];
    render(<SponsorRepeatNotice name="Acme" website="" assignedIds={new Set(["1"])} onUse={vi.fn()} />);
    expect(screen.getByText("Already on this event")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
