import { describe, expect, it } from "vitest";

import { breadcrumbTrail } from "../Breadcrumbs";

describe("breadcrumbTrail", () => {
  it("is empty on the home page", () => {
    expect(breadcrumbTrail("/")).toEqual([]);
  });

  it("names the known pages", () => {
    expect(breadcrumbTrail("/refunds")).toEqual([{ label: "Refund Policy", to: "/refunds" }]);
    expect(breadcrumbTrail("/faqs/")).toEqual([{ label: "FAQs", to: "/faqs" }]);
  });

  it("makes a readable label for a page it has no name for, and links each level", () => {
    expect(breadcrumbTrail("/support/ticket-status")).toEqual([
      { label: "Support", to: "/support" },
      { label: "Ticket status", to: "/support/ticket-status" },
    ]);
  });
});
