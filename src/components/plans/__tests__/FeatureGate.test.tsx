import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Entitlements } from "@/lib/plans/features";

const state: { entitlements: Entitlements | null; loading: boolean; isAdmin: boolean } = {
  entitlements: null,
  loading: false,
  isAdmin: false,
};

vi.mock("@/hooks/usePlanFeatures", () => ({
  useOrgEntitlements: (orgId: string | null) => ({
    data: orgId ? state.entitlements : undefined,
    isLoading: !!orgId && state.loading,
  }),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isAdmin: state.isAdmin, user: { email: "o@example.com", user_metadata: {} } }),
}));
vi.mock("@/contexts/OrgContext", () => ({
  useOrg: () => ({ org: { id: "org-1", name: "Acme" }, memberships: [] }),
}));

import { FeatureGate } from "../FeatureGate";

const ent = (features: string[]): Entitlements => ({
  org_id: "org-1",
  plan: "free",
  plan_name: "Free",
  limits: { max_events: 3, max_attendees_per_event: 50, max_team_members: 1 },
  features,
  overrides: {},
});

const gate = (feature: string | undefined, orgId?: string | null) =>
  render(
    <MemoryRouter>
      <FeatureGate feature={feature} orgId={orgId}>
        <p>Studio content</p>
      </FeatureGate>
    </MemoryRouter>,
  );

describe("FeatureGate", () => {
  beforeEach(() => {
    state.entitlements = null;
    state.loading = false;
    state.isAdmin = false;
  });

  it("shows the content when the plan includes the feature", () => {
    state.entitlements = ent(["certificates"]);
    gate("certificates");
    expect(screen.getByText("Studio content")).toBeInTheDocument();
  });

  it("explains what's missing and offers a request when it doesn't", () => {
    state.entitlements = ent(["brochure"]);
    gate("certificates");
    expect(screen.queryByText("Studio content")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Certificates isn't included in your Free plan" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Request access/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See plans" })).toHaveAttribute("href", "/dashboard/billing");
  });

  it("lets super admins through, with a note", () => {
    state.isAdmin = true;
    state.entitlements = ent([]);
    gate("certificates");
    expect(screen.getByText("Studio content")).toBeInTheDocument();
    expect(screen.getByText(/isn't on this organisation's Free plan/)).toBeInTheDocument();
  });

  it("allows when the server can't say (migration not applied)", () => {
    state.entitlements = null;
    gate("certificates");
    expect(screen.getByText("Studio content")).toBeInTheDocument();
  });

  it("waits while the plan loads", () => {
    state.loading = true;
    gate("certificates");
    expect(screen.queryByText("Studio content")).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Checking your plan" })).toBeInTheDocument();
  });

  it("doesn't gate sections without a feature, or events without an organisation", () => {
    state.entitlements = ent([]);
    gate(undefined);
    expect(screen.getByText("Studio content")).toBeInTheDocument();
    gate("certificates", null);
    expect(screen.getAllByText("Studio content")).toHaveLength(2);
  });
});
