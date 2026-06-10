import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { usePlan } from "@/contexts/PlanContext";
import { getRequiredPlan, planMeets } from "@/lib/routeAccess";
import { PageLocked } from "@/components/plan/PageLocked";
import { AccessBlocked } from "@/components/plan/AccessBlocked";

interface RequirePlanProps {
  children: ReactNode;
  pageLabel?: string;
}

/**
 * Gates a route based on the current user's plan & subscription status.
 * Trial users always have access. Paused/cancelled subscriptions block access.
 */
export function RequirePlan({ children, pageLabel }: RequirePlanProps) {
  const { plan, inTrial, loading, accessBlocked, isPaused, isCanceled, subscription } = usePlan();
  const { pathname } = useLocation();

  if (loading) return null;

  if (accessBlocked) {
    return (
      <AccessBlocked
        reason={isPaused ? "paused" : isCanceled ? "canceled" : "past_due"}
        pauseEndsAt={subscription?.pause_ends_at ?? null}
      />
    );
  }

  const required = getRequiredPlan(pathname);
  if (!required) return <>{children}</>;
  if (inTrial || planMeets(plan, required)) return <>{children}</>;

  return <PageLocked requiredPlan={required} pageLabel={pageLabel} />;
}
