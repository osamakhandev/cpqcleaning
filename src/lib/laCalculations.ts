import { CalcMethod, LineItem, ElementTask, BuildingElement } from "@/types/labourAssessment";

/** Tenancy-tab mappings that absorb the Secure-Floors productivity penalty. */
const TENANCY_TABS = new Set(["tenancy-areas", "tenancy-specials"]);

/**
 * Returns the productivity multiplier applied AFTER the base hours
 * calculation. Always >= 1 (extra hours, never reduction).
 *
 * - SECURE_FLOORS on  + Tenancy task    → +3% (A) / +5% (B)
 * - RECYCLING_STATIONS + DESK_BINS both on, task tagged with DESK_BINS → +10%
 */
export function conditionMultiplier(
  conditionFlags: string[],
  tabMapping: string | undefined,
  activeConditions: Record<string, boolean>,
  commercialStandard?: "A" | "B"
): number {
  let m = 1;
  if (activeConditions.SECURE_FLOORS && tabMapping && TENANCY_TABS.has(tabMapping)) {
    m *= 1 + (commercialStandard === "A" ? 0.03 : 0.05);
  }
  if (
    activeConditions.RECYCLING_STATIONS &&
    activeConditions.DESK_BINS &&
    conditionFlags.includes("DESK_BINS")
  ) {
    m *= 1.1;
  }
  return m;
}

export function calculateHours(
  calcMethod: CalcMethod,
  quantityValue: number,
  baseRate: number,
  frequencyPerWeek: number,
  conditionFlags: string[],
  activeConditions: Record<string, boolean>,
  tabMapping?: string,
  commercialStandard?: "A" | "B"
): { hoursBase: number; hoursAdjusted: number; conditionMet: boolean } {
  if (conditionFlags.length > 0) {
    const allMet = conditionFlags.every(f => activeConditions[f] === true);
    if (!allMet) {
      return { hoursBase: 0, hoursAdjusted: 0, conditionMet: false };
    }
  }

  let hoursBase = 0;
  if (calcMethod === "AREA_RATE") {
    hoursBase = baseRate > 0 ? (quantityValue / baseRate) * frequencyPerWeek : 0;
  } else {
    hoursBase = (quantityValue * baseRate / 60) * frequencyPerWeek;
  }

  const mult = conditionMultiplier(conditionFlags, tabMapping, activeConditions, commercialStandard);
  return { hoursBase, hoursAdjusted: hoursBase * mult, conditionMet: true };
}

export function recalcLineItem(
  item: LineItem,
  activeConditions: Record<string, boolean>,
  commercialStandard?: "A" | "B"
): LineItem {
  const result = calculateHours(
    item.calcMethod,
    item.quantityValue,
    item.baseRate,
    item.frequencyPerWeek,
    item.conditionFlags,
    activeConditions,
    item.tabMapping,
    commercialStandard
  );
  return {
    ...item,
    hoursBase: result.hoursBase,
    hoursAdjusted: result.hoursAdjusted,
  };
}

export function recalcElementTask(
  task: ElementTask,
  element: BuildingElement,
  activeConditions: Record<string, boolean>,
  commercialStandard?: "A" | "B"
): ElementTask {
  const qty = task.quantitySource === "ELEMENT" ? element.quantityValue : task.quantityValue;
  const rate = task.rateOverride ?? task.defaultRate;

  const result = calculateHours(
    task.calcMethod,
    qty,
    rate,
    task.frequencyPerWeek,
    task.conditionFlags,
    activeConditions,
    element.tabMapping,
    commercialStandard
  );

  return {
    ...task,
    hoursBase: result.hoursBase,
    hoursAdjusted: result.hoursAdjusted,
  };
}
