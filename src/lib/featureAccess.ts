/**
 * Plan-based feature access map.
 *
 * Each key is a feature identifier; the value is the list of plans that
 * grant edit/use access to that feature. Locked features remain VISIBLE
 * but become read-only when the user's plan is not in the list.
 */
export type PlanType = "basic" | "advanced" | "integrated";

export const PLAN_LABELS: Record<PlanType, string> = {
  basic: "CPQ Essentials",
  advanced: "CPQ Plus",
  integrated: "CPQ Integrated",
};

export const PLAN_TAGLINES: Record<PlanType, string> = {
  basic: "Experience-based pricing",
  advanced: "Structured and defendable pricing",
  integrated: "Full service contract pricing",
};

export const FEATURE_ACCESS: Record<string, PlanType[]> = {
  cleaning: ["basic", "advanced", "integrated"],

  post_30_june_start: ["basic", "advanced", "integrated"],
  fixed_price: ["advanced", "integrated"],

  sundry_basic_edit: ["basic", "advanced", "integrated"],
  sundry_breakdown: ["advanced", "integrated"],

  other_services: ["advanced", "integrated"],
  detailed_results: ["advanced", "integrated"],

  security: ["integrated"],
  maintenance: ["integrated"],
  management: ["integrated"],
  daily_board: ["integrated"],
};

export type FeatureKey = keyof typeof FEATURE_ACCESS;

export function hasAccess(plan: PlanType | null | undefined, feature: FeatureKey | string): boolean {
  if (!plan) return false;
  const allowed = FEATURE_ACCESS[feature];
  if (!allowed) return false;
  return allowed.includes(plan);
}

/** Returns the lowest plan tier that grants access to the given feature. */
export function minPlanFor(feature: FeatureKey | string): PlanType | null {
  const allowed = FEATURE_ACCESS[feature];
  if (!allowed || allowed.length === 0) return null;
  const order: PlanType[] = ["basic", "advanced", "integrated"];
  return order.find((p) => allowed.includes(p)) ?? null;
}
