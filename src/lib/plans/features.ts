/**
 * Plan features: the catalogue of organiser features a super admin can switch
 * on or off per plan, and the rule that turns a plan plus an organisation's
 * own exceptions into the features it actually has.
 *
 * The database is the source of truth (`plans` table, `org_entitlements()`;
 * migration 048). `resolveFeatures` mirrors `_org_entitlements` in SQL so the
 * fallback below behaves the same while the migration has not been applied —
 * keep the two in step.
 */

export type FeatureGroup = "event" | "workspace" | "perks";

export interface FeatureDefinition {
  key: string;
  label: string;
  description: string;
  group: FeatureGroup;
  /**
   * False for features that are only listed on the plan for now — nothing in
   * the app checks them yet. The admin screen says so.
   */
  enforced: boolean;
}

export const FEATURE_GROUPS: Array<{ key: FeatureGroup; label: string }> = [
  { key: "event", label: "Event workspace" },
  { key: "workspace", label: "Organisation" },
  { key: "perks", label: "Plan perks" },
];

export const FEATURES: FeatureDefinition[] = [
  { key: "website_builder", label: "Event website & design", description: "Event page builder, themes and sections.", group: "event", enforced: true },
  { key: "agenda", label: "Agenda", description: "Sessions and multi-day schedules.", group: "event", enforced: true },
  { key: "speakers", label: "Speakers", description: "Speaker management, applications and portal.", group: "event", enforced: true },
  { key: "sponsor_management", label: "Sponsors", description: "Sponsors, tiers and the sponsor portal.", group: "event", enforced: true },
  { key: "venue_sourcing", label: "Venue sourcing", description: "Venue marketplace, service requests and venue replies.", group: "event", enforced: true },
  { key: "badges", label: "Badges", description: "Badge designer, printing and bulk download.", group: "event", enforced: true },
  { key: "self_checkin", label: "Self check-in kiosk", description: "Kiosk mode and self check-in / check-out links.", group: "event", enforced: true },
  { key: "communications", label: "Email broadcasts", description: "Communicate tab: email updates to registrants.", group: "event", enforced: true },
  { key: "whatsapp", label: "WhatsApp messaging", description: "WhatsApp template messages to registrants.", group: "event", enforced: true },
  { key: "webinar", label: "Webinar studio", description: "Built-in live stage, recording and webinar rooms.", group: "event", enforced: true },
  { key: "community", label: "Communities", description: "Event communities: feed, chat, calendar, moderation.", group: "event", enforced: true },
  { key: "creatives", label: "Creative studio", description: "Social posts and posters from the event's material.", group: "event", enforced: true },
  { key: "creatives_ai", label: "AI copy & backgrounds", description: "Gemini-drafted copy and generated backgrounds in the studio.", group: "event", enforced: true },
  { key: "brochure", label: "Brochure builder", description: "Multi-page brochures with the inline editor and PDF export.", group: "event", enforced: true },
  { key: "certificates", label: "Certificates", description: "Certificate designer, bulk issuing and verification.", group: "event", enforced: true },
  { key: "utm_tracking", label: "UTM & partner links", description: "Tracked links, attribution and partner dashboards.", group: "event", enforced: true },
  { key: "reports", label: "Reports & exports", description: "Event reports with CSV, Excel and PDF export.", group: "event", enforced: true },
  { key: "marketing", label: "Marketing", description: "Organisation-wide campaigns and templates.", group: "workspace", enforced: true },
  { key: "landing_builder", label: "Organisation landing page", description: "Public organisation page builder.", group: "workspace", enforced: true },
  { key: "custom_domain", label: "Custom domain", description: "Serve event pages from your own domain.", group: "workspace", enforced: false },
  { key: "advanced_analytics", label: "Advanced analytics", description: "Listed on the plan; not checked in the app yet.", group: "perks", enforced: false },
  { key: "white_label", label: "White label", description: "Listed on the plan; not checked in the app yet.", group: "perks", enforced: false },
  { key: "api_access", label: "API access", description: "Listed on the plan; not checked in the app yet.", group: "perks", enforced: false },
  { key: "priority_support", label: "Priority support", description: "Listed on the plan; handled by the support team.", group: "perks", enforced: false },
];

export const FEATURE_KEYS = FEATURES.map((f) => f.key);

const FEATURE_BY_KEY = new Map(FEATURES.map((f) => [f.key, f]));

export function featureLabel(key: string): string {
  return FEATURE_BY_KEY.get(key)?.label ?? key;
}

export interface PlanLimits {
  max_events: number;
  max_attendees_per_event: number;
  max_team_members: number;
}

export interface Plan {
  key: string;
  name: string;
  description: string;
  sort_order: number;
  is_public: boolean;
  limits: PlanLimits;
  features: string[];
}

/** Per-organisation exceptions: `true` grants a feature, `false` removes it. */
export type FeatureOverrides = Record<string, boolean>;

export interface Entitlements {
  org_id: string | null;
  plan: string;
  plan_name: string;
  limits: PlanLimits;
  features: string[];
  overrides: FeatureOverrides;
}

// Every module stays on for every plan, so applying the migration changes
// nothing for existing organisers until a super admin edits the matrix. The
// webinar studio was already a paid add-on and stays off unless granted.
const ALL_MODULES = FEATURES.filter((f) => f.group !== "perks" && f.key !== "webinar").map((f) => f.key);

export const DEFAULT_PLANS: Plan[] = [
  {
    key: "free",
    name: "Free",
    description: "For trying things out",
    sort_order: 0,
    is_public: true,
    limits: { max_events: 3, max_attendees_per_event: 50, max_team_members: 1 },
    features: [...ALL_MODULES],
  },
  {
    key: "starter",
    name: "Starter",
    description: "For growing organisers",
    sort_order: 1,
    is_public: true,
    limits: { max_events: 10, max_attendees_per_event: 200, max_team_members: 3 },
    features: [...ALL_MODULES],
  },
  {
    key: "pro",
    name: "Pro",
    description: "For serious teams",
    sort_order: 2,
    is_public: true,
    limits: { max_events: 50, max_attendees_per_event: 1000, max_team_members: 10 },
    features: [...ALL_MODULES, "advanced_analytics"],
  },
  {
    key: "business",
    name: "Business",
    description: "For agencies & enterprises",
    sort_order: 3,
    is_public: true,
    limits: { max_events: -1, max_attendees_per_event: -1, max_team_members: -1 },
    features: [...ALL_MODULES, "advanced_analytics", "white_label", "api_access", "priority_support"],
  },
];

/**
 * A plan's features, plus legacy add-ons, plus overrides set to `true`,
 * minus overrides set to `false`. Sorted and de-duplicated.
 */
export function resolveFeatures(
  planFeatures: readonly string[],
  addons: readonly string[] = [],
  overrides: FeatureOverrides = {},
): string[] {
  const granted = new Set<string>([...planFeatures, ...addons]);
  for (const [key, on] of Object.entries(overrides)) {
    if (on === true) granted.add(key);
  }
  for (const [key, on] of Object.entries(overrides)) {
    if (on === false) granted.delete(key);
  }
  return [...granted].sort();
}

export function findPlan(plans: readonly Plan[], key: string | null | undefined): Plan | undefined {
  return plans.find((p) => p.key === key) ?? plans.find((p) => p.key === "free");
}

/** What an organisation gets when the server can't be asked. */
export function fallbackEntitlements(
  orgId: string | null,
  planKey: string | null | undefined,
  addons: readonly string[] = [],
  overrides: FeatureOverrides = {},
  plans: readonly Plan[] = DEFAULT_PLANS,
): Entitlements {
  const plan = findPlan(plans, planKey);
  return {
    org_id: orgId,
    plan: planKey || "free",
    plan_name: plan?.name ?? "Free",
    limits: plan?.limits ?? DEFAULT_PLANS[0].limits,
    features: resolveFeatures(plan?.features ?? [], addons, overrides),
    overrides,
  };
}

/** Accepts the JSON returned by `org_entitlements()`; anything odd becomes safe defaults. */
export function parseEntitlements(raw: unknown): Entitlements | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.features)) return null;
  const limits = (r.limits ?? {}) as Partial<PlanLimits>;
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  return {
    org_id: typeof r.org_id === "string" ? r.org_id : null,
    plan: typeof r.plan === "string" ? r.plan : "free",
    plan_name: typeof r.plan_name === "string" ? r.plan_name : "Free",
    limits: {
      max_events: num(limits.max_events, -1),
      max_attendees_per_event: num(limits.max_attendees_per_event, -1),
      max_team_members: num(limits.max_team_members, -1),
    },
    features: r.features.filter((f): f is string => typeof f === "string"),
    overrides: (r.overrides && typeof r.overrides === "object" ? r.overrides : {}) as FeatureOverrides,
  };
}

/** Normalises a `plans` table row. */
export function parsePlan(row: Record<string, unknown>): Plan {
  const limits = (row.limits ?? {}) as Partial<PlanLimits>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : -1);
  return {
    key: String(row.key),
    name: String(row.name ?? row.key),
    description: String(row.description ?? ""),
    sort_order: typeof row.sort_order === "number" ? row.sort_order : 0,
    is_public: row.is_public !== false,
    limits: {
      max_events: num(limits.max_events),
      max_attendees_per_event: num(limits.max_attendees_per_event),
      max_team_members: num(limits.max_team_members),
    },
    features: Array.isArray(row.features) ? row.features.map(String) : [],
  };
}

export const PLAN_KEY_PATTERN = /^[a-z][a-z0-9_]{1,31}$/;

/** "Unlimited" for -1, otherwise the number. */
export function formatLimit(value: number): string {
  return value < 0 ? "Unlimited" : value.toLocaleString("en-IN");
}
