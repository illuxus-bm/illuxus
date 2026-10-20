/**
 * Upgrade requests. There is no self-serve billing yet, so asking for a
 * bigger plan or a single feature files a billing support ticket that the
 * team actions from the super-admin panel.
 */
import { featureLabel } from "@/lib/plans/features";

export interface UpgradeRequestInput {
  name: string;
  email: string;
  orgName: string;
  orgId: string;
  currentPlan: string;
  /** A single feature the organiser tried to use. */
  feature?: string;
  /** A plan the organiser picked (onboarding). */
  requestedPlan?: string;
  pageUrl?: string;
}

export function buildUpgradeRequest(input: UpgradeRequestInput) {
  const what = input.feature
    ? featureLabel(input.feature)
    : `the ${input.requestedPlan ?? "a paid"} plan`;
  const subject = `Upgrade request: ${what} for ${input.orgName}`.slice(0, 200);
  const lines = [
    `${input.name} asked to upgrade ${input.orgName}.`,
    "",
    `Organisation id: ${input.orgId}`,
    `Current plan: ${input.currentPlan}`,
    input.requestedPlan ? `Requested plan: ${input.requestedPlan}` : null,
    input.feature ? `Feature: ${featureLabel(input.feature)} (${input.feature})` : null,
    "",
    "Change the plan or grant the feature at /dashboard/admin/organizations.",
  ].filter((l): l is string => l !== null);
  return {
    name: (input.name || input.email).slice(0, 120),
    email: input.email,
    subject,
    category: "billing",
    source: "plan_upgrade_request",
    message: lines.join("\n"),
    page_url: input.pageUrl,
  };
}
