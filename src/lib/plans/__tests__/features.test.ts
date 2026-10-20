import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_PLANS,
  FEATURE_KEYS,
  FEATURES,
  fallbackEntitlements,
  featureLabel,
  formatLimit,
  parseEntitlements,
  parsePlan,
  resolveFeatures,
} from "../features";
import { buildUpgradeRequest } from "../upgrade-request";

describe("resolveFeatures", () => {
  it("combines the plan, legacy add-ons and overrides", () => {
    expect(resolveFeatures(["brochure", "creatives"], ["webinar"], { certificates: true, creatives: false })).toEqual([
      "brochure",
      "certificates",
      "webinar",
    ]);
  });

  it("lets an 'off' override beat both the plan and an add-on", () => {
    expect(resolveFeatures(["webinar"], ["webinar"], { webinar: false })).toEqual([]);
  });

  it("de-duplicates and sorts", () => {
    expect(resolveFeatures(["b", "a", "b"], ["a"])).toEqual(["a", "b"]);
  });
});

describe("built-in plans", () => {
  it("keeps every module on for every plan, except the webinar add-on", () => {
    const modules = FEATURES.filter((f) => f.group !== "perks" && f.key !== "webinar").map((f) => f.key);
    for (const plan of DEFAULT_PLANS) {
      expect(plan.features).toEqual(expect.arrayContaining(modules));
      expect(plan.features).not.toContain("webinar");
    }
  });

  it("only lists known feature keys", () => {
    for (const plan of DEFAULT_PLANS) {
      for (const f of plan.features) expect(FEATURE_KEYS).toContain(f);
    }
  });

  it("match the seed rows in the database migration", () => {
    const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/000_full_schema.sql"), "utf8");
    const start = sql.indexOf("BEGIN SOURCE MIGRATION: 048_plan_features.sql");
    expect(start).toBeGreaterThan(-1);
    const section = sql.slice(start, sql.indexOf("END SOURCE MIGRATION: 048_plan_features.sql", start));
    for (const plan of DEFAULT_PLANS) {
      const row = new RegExp(`\\('${plan.key}', '${plan.name}', '[^']*', ${plan.sort_order},\\s*'([^']+)',\\s*ARRAY\\[([^\\]]+)\\]\\)`).exec(section);
      expect(row, plan.key).not.toBeNull();
      expect(JSON.parse(row![1])).toEqual(plan.limits);
      expect(row![2].split(",").map((s) => s.trim().replace(/'/g, "")).sort()).toEqual([...plan.features].sort());
    }
  });
});

describe("fallbackEntitlements", () => {
  it("uses the built-in plan, and free for an unknown one", () => {
    expect(fallbackEntitlements("o", "pro").features).toContain("advanced_analytics");
    const unknown = fallbackEntitlements("o", "platinum");
    expect(unknown.plan_name).toBe("Free");
    expect(unknown.features).not.toContain("advanced_analytics");
  });

  it("applies add-ons and overrides", () => {
    const e = fallbackEntitlements("o", "free", ["webinar"], { brochure: false });
    expect(e.features).toContain("webinar");
    expect(e.features).not.toContain("brochure");
  });
});

describe("parsing server rows", () => {
  it("accepts org_entitlements output", () => {
    expect(
      parseEntitlements({
        org_id: "o",
        plan: "pro",
        plan_name: "Pro",
        limits: { max_events: 50, max_attendees_per_event: 1000, max_team_members: 10 },
        features: ["brochure", 3],
        overrides: { webinar: true },
      }),
    ).toEqual({
      org_id: "o",
      plan: "pro",
      plan_name: "Pro",
      limits: { max_events: 50, max_attendees_per_event: 1000, max_team_members: 10 },
      features: ["brochure"],
      overrides: { webinar: true },
    });
  });

  it("rejects anything without a feature list", () => {
    expect(parseEntitlements(null)).toBeNull();
    expect(parseEntitlements({ plan: "pro" })).toBeNull();
  });

  it("fills missing limits as unlimited", () => {
    expect(parsePlan({ key: "x", name: "X", limits: { max_events: 2 }, features: null })).toMatchObject({
      limits: { max_events: 2, max_attendees_per_event: -1, max_team_members: -1 },
      features: [],
      is_public: true,
    });
  });
});

describe("labels", () => {
  it("names features and limits", () => {
    expect(featureLabel("certificates")).toBe("Certificates");
    expect(featureLabel("unknown_thing")).toBe("unknown_thing");
    expect(formatLimit(-1)).toBe("Unlimited");
    expect(formatLimit(1000)).toBe("1,000");
  });
});

describe("buildUpgradeRequest", () => {
  const base = { name: "Asha", email: "asha@example.com", orgName: "Acme", orgId: "org-1", currentPlan: "free" };

  it("files a billing ticket for one feature", () => {
    const r = buildUpgradeRequest({ ...base, feature: "certificates" });
    expect(r).toMatchObject({ category: "billing", source: "plan_upgrade_request", email: "asha@example.com" });
    expect(r.subject).toBe("Upgrade request: Certificates for Acme");
    expect(r.message).toContain("Organisation id: org-1");
    expect(r.message).toContain("Feature: Certificates (certificates)");
  });

  it("files a billing ticket for a whole plan", () => {
    const r = buildUpgradeRequest({ ...base, requestedPlan: "Pro" });
    expect(r.subject).toBe("Upgrade request: the Pro plan for Acme");
    expect(r.message).toContain("Requested plan: Pro");
  });
});
