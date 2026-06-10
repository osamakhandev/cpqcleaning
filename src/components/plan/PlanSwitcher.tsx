import { usePlan } from '@/contexts/PlanContext';
import { PLAN_LABELS, type PlanType } from '@/lib/featureAccess';
import { DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';

/**
 * Dev-only inline plan switcher. Renders inside the user dropdown menu.
 * Persists changes to the user's profile so the new plan applies immediately.
 */
export function PlanSwitcher() {
  const { plan, setPlan } = usePlan();

  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="text-[10px] font-normal text-muted-foreground uppercase tracking-wide">
        Plan (dev)
      </DropdownMenuLabel>
      <DropdownMenuRadioGroup value={plan} onValueChange={(v) => void setPlan(v as PlanType)}>
        {(['basic', 'advanced', 'integrated'] as PlanType[]).map((p) => (
          <DropdownMenuRadioItem key={p} value={p} className="text-xs">
            {PLAN_LABELS[p]}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  );
}