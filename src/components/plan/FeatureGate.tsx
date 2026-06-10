import type { ReactNode } from 'react';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { LockedOverlay } from '@/components/plan/LockedOverlay';
import type { FeatureKey } from '@/lib/featureAccess';

interface FeatureGateProps {
  feature: FeatureKey | string;
  /** What to render when the user does NOT have access. Defaults to a locked overlay. */
  fallback?: ReactNode;
  /** When true, render nothing instead of a locked overlay if access is denied. */
  hideWhenLocked?: boolean;
  /** Optional human label for the upgrade modal. */
  featureLabel?: string;
  children: ReactNode;
}

/**
 * Wraps children with plan-based access control.
 * - If the user is on trial or the feature is in their plan: renders children.
 * - Otherwise: renders the fallback or a LockedOverlay (clickable upgrade modal).
 */
export function FeatureGate({
  feature,
  fallback,
  hideWhenLocked = false,
  featureLabel,
  children,
}: FeatureGateProps) {
  const { allowed, requiredPlan } = useFeatureAccess(feature);

  if (allowed) return <>{children}</>;
  if (hideWhenLocked) return null;
  if (fallback !== undefined) return <>{fallback}</>;

  return (
    <LockedOverlay
      locked
      requiredPlan={requiredPlan ?? 'integrated'}
      featureLabel={featureLabel ?? feature}
      banner=""
    >
      {children}
    </LockedOverlay>
  );
}
