/**
 * useLaAutoRoster — continuous Labour Assessment → Operators' Details sync.
 *
 * Mounted once inside <AssessmentProvider>. Watches LA state via the
 * Assessment context and, when enabled and not frozen, debounces (~400ms)
 * and calls roster store `applyLaPlan(plan, frozen)`. The plan builder is
 * pure; the diff/apply logic in the roster store preserves manual operators
 * and user-edited shift cells.
 */
import { useEffect, useMemo, useRef } from "react";
import { useRosterStoreOptional } from "@/contexts/RosterContext";
import { buildLaPlan } from "@/lib/laAutoRoster";
import type { LAState } from "@/contexts/AssessmentContext";

export function useLaAutoRoster(
  state: LAState,
  enabled: boolean,
  frozen: boolean,
  isLoading: boolean,
  saveBeforeApply?: () => Promise<void>,
) {
  const roster = useRosterStoreOptional();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Build the plan deterministically from the relevant slices of LA state.
  // Memoised so the effect only re-runs when something meaningful changes.
  const plan = useMemo(
    () => (enabled && !frozen ? buildLaPlan(state) : null),
    // Coarse but cheap deps — buildLaPlan is pure & fast.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      enabled,
      frozen,
      state.buildingElements,
      state.elementTasks,
      state.wendDetailerPrograms,
      state.tenantSpecialGroups,
    ],
  );

  useEffect(() => {
    if (!roster || isLoading || !plan) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void (async () => {
        await saveBeforeApply?.();
        roster.applyLaPlan(plan, frozen);
      })();
    }, 400);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [plan, frozen, isLoading, roster, saveBeforeApply]);
}
