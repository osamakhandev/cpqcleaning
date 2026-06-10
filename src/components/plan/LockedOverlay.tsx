import { Lock } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { UpgradeModal } from './UpgradeModal';
import { PLAN_LABELS, type PlanType } from '@/lib/featureAccess';

interface LockedOverlayProps {
  /** When false, children render normally with no overlay. */
  locked: boolean;
  requiredPlan: PlanType;
  featureLabel?: string;
  /** Banner text shown above content when locked. */
  banner?: string;
  /** Optional fallback action: an extra control rendered in the banner (e.g. % override switch). */
  bannerAction?: ReactNode;
  children: ReactNode;
}

/**
 * Renders children with a ghosted, click-blocking overlay when `locked` is true.
 * Click anywhere on the locked area opens the upgrade modal.
 */
export function LockedOverlay({
  locked,
  requiredPlan,
  featureLabel,
  banner,
  bannerAction,
  children,
}: LockedOverlayProps) {
  const [modalOpen, setModalOpen] = useState(false);

  if (!locked) return <>{children}</>;

  return (
    <div className="space-y-2">
      {banner !== undefined && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <div className="flex items-center gap-2">
            <Lock className="h-3.5 w-3.5 shrink-0" />
            <span>{banner || `This section is read-only on your current plan. Upgrade to ${PLAN_LABELS[requiredPlan]} to edit.`}</span>
          </div>
          {bannerAction}
        </div>
      )}
      <div className="relative">
        <div
          aria-disabled
          className="opacity-60 pointer-events-none select-none"
          // Inert so screen readers / focus skip the locked subtree
          // @ts-expect-error inert is valid HTML attribute
          inert=""
        >
          {children}
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="absolute inset-0 cursor-not-allowed bg-transparent"
          aria-label={`Locked — upgrade to ${PLAN_LABELS[requiredPlan]}`}
          title={`Locked — upgrade to ${PLAN_LABELS[requiredPlan]}`}
        />
      </div>
      <UpgradeModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        requiredPlan={requiredPlan}
        featureLabel={featureLabel}
      />
    </div>
  );
}