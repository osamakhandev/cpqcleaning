import type { PlanType } from '@/lib/featureAccess';

/** Plan tier ordering. Higher index = more access. */
const PLAN_ORDER: PlanType[] = ['basic', 'advanced', 'integrated'];

/**
 * Minimum plan required to access each gated route.
 * Routes not listed here are unrestricted (auth, billing, projects, etc).
 */
export const ROUTE_PLAN: Record<string, PlanType> = {
  // Basic
  '/job-details': 'basic',
  '/': 'basic',
  '/roster': 'basic',
  '/weekly-board': 'basic',
  '/results': 'basic',

  // Advanced
  '/pricing/statutory': 'advanced',
  '/pricing/divisions': 'advanced',
  '/labour-assessment': 'advanced',
  '/daily-board': 'advanced',
  '/detailed-summary': 'advanced',
  '/pricing/executive-summary': 'advanced',

  // Integrated
  '/pricing/sundry': 'integrated',
  '/pricing/additional': 'integrated',
  '/pricing/detailed-results': 'integrated',
};

export function getRequiredPlan(pathname: string): PlanType | null {
  return ROUTE_PLAN[pathname] ?? null;
}

export function planMeets(plan: PlanType | null | undefined, required: PlanType): boolean {
  if (!plan) return false;
  return PLAN_ORDER.indexOf(plan) >= PLAN_ORDER.indexOf(required);
}

export function canAccessRoute(
  plan: PlanType | null | undefined,
  inTrial: boolean,
  pathname: string,
): boolean {
  if (inTrial) return true;
  const required = getRequiredPlan(pathname);
  if (!required) return true;
  return planMeets(plan, required);
}
