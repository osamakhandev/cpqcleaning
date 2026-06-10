import { usePlan } from '@/contexts/PlanContext';
import { hasAccess, minPlanFor, type FeatureKey, type PlanType } from '@/lib/featureAccess';

export type AccessReason = 'trial' | 'plan' | 'locked';

export interface FeatureAccessResult {
  allowed: boolean;
  reason: AccessReason;
  /** Lowest plan that grants this feature, or null if unknown. */
  requiredPlan: PlanType | null;
  /** True while the user's trial is still active. */
  inTrial: boolean;
  /** Days remaining in trial, or null if not on trial. */
  trialDaysRemaining: number | null;
}

/**
 * Hook returning whether the current user can access the given feature.
 * Trial overrides plan-based gating.
 */
export function useFeatureAccess(feature: FeatureKey | string): FeatureAccessResult {
  const { plan, inTrial, trialDaysRemaining } = usePlan();
  const required = minPlanFor(feature);

  if (inTrial) {
    return { allowed: true, reason: 'trial', requiredPlan: required, inTrial, trialDaysRemaining };
  }

  const allowed = hasAccess(plan, feature);
  return {
    allowed,
    reason: allowed ? 'plan' : 'locked',
    requiredPlan: required,
    inTrial,
    trialDaysRemaining,
  };
}
