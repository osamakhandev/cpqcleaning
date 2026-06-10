/**
 * Pure helpers that compute the live impact of CPQ Labour Assessment
 * condition flags on weekly hours.
 *
 * Used by the floating Assessment Impact Panel to surface "what
 * happened to my hours?" answers without re-running calculations.
 */
import type { LineItem, ElementTask, BuildingElement, FloorPlanData } from "@/types/labourAssessment";

const TENANCY_TABS = new Set(["tenancy-areas", "tenancy-specials"]);

interface ImpactInputs {
  lineItems: LineItem[];
  elementTasks: ElementTask[];
  buildingElements: BuildingElement[];
  floorPlan: FloorPlanData;
  conditions: Record<string, boolean>;
}

export interface FlagImpact {
  flag: string;
  /** Extra weekly hours currently attributable to this flag being ON. */
  deltaHrs: number;
  /** Non-numeric note (e.g. AFTER_HOURS_ONLY shows a label, not hours). */
  note?: string;
}

/**
 * Compute per-flag impact in weekly hours.
 *
 * Mirrors the logic of `conditionMultiplier` in laCalculations:
 *  - DESK_BINS: hours from included tasks whose conditionFlags contain DESK_BINS
 *  - RECYCLING_STATIONS: +10% uplift on those same bin tasks
 *  - SECURE_FLOORS: +3% (A) / +5% (B) uplift on included Tenancy tasks
 *  - AFTER_HOURS_ONLY: behavioural — no hours delta
 */
export function computeFlagImpacts(inp: ImpactInputs): Record<string, FlagImpact> {
  const { lineItems, elementTasks, buildingElements, floorPlan, conditions } = inp;
  const std = floorPlan.commercialBuildingStandard as "A" | "B" | undefined;
  const secureUplift = std === "A" ? 0.03 : 0.05;

  const includedLi = lineItems.filter(i => i.included);
  const elementById = new Map(buildingElements.map(e => [e.id, e]));
  const includedEt = elementTasks.filter(t => {
    const el = elementById.get(t.buildingElementId);
    return t.included && el?.included;
  });

  // DESK_BINS — total hours from currently-included bin tasks (already uplifted
  // by RECYCLING_STATIONS if ON; we report the bare bin contribution).
  let binHrs = 0;
  for (const li of includedLi) if (li.conditionFlags.includes("DESK_BINS")) binHrs += li.hoursAdjusted;
  for (const t of includedEt) if (t.conditionFlags.includes("DESK_BINS")) binHrs += t.hoursAdjusted;
  // Strip the recycling uplift to get the bin-only base contribution.
  const binBase = conditions.RECYCLING_STATIONS && conditions.DESK_BINS ? binHrs / 1.1 : binHrs;

  // RECYCLING_STATIONS — the 10% uplift currently applied to bin tasks.
  const recyclingDelta = conditions.RECYCLING_STATIONS && conditions.DESK_BINS
    ? binBase * 0.1
    : 0;

  // SECURE_FLOORS — uplift on currently-included tenancy tasks. We back-out
  // the secure uplift from each task's adjusted hours to get its base, then
  // report base × uplift as the delta attributable to the flag.
  let tenancyAdjusted = 0;
  for (const li of includedLi) {
    if (TENANCY_TABS.has(li.tabMapping)) tenancyAdjusted += li.hoursAdjusted;
  }
  for (const t of includedEt) {
    const el = elementById.get(t.buildingElementId);
    if (el && TENANCY_TABS.has(el.tabMapping)) tenancyAdjusted += t.hoursAdjusted;
  }
  const tenancyBase = conditions.SECURE_FLOORS ? tenancyAdjusted / (1 + secureUplift) : tenancyAdjusted;
  const secureDelta = conditions.SECURE_FLOORS ? tenancyBase * secureUplift : 0;

  return {
    DESK_BINS: { flag: "DESK_BINS", deltaHrs: conditions.DESK_BINS ? binBase : 0 },
    RECYCLING_STATIONS: { flag: "RECYCLING_STATIONS", deltaHrs: recyclingDelta },
    SECURE_FLOORS: { flag: "SECURE_FLOORS", deltaHrs: secureDelta },
    AFTER_HOURS_ONLY: {
      flag: "AFTER_HOURS_ONLY",
      deltaHrs: 0,
      note: conditions.AFTER_HOURS_ONLY ? "Night staffing model applied" : undefined,
    },
  };
}
