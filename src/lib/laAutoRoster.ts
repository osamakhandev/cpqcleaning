/**
 * Labour Assessment → Operators auto-generation engine.
 *
 * Pure functions: build a deterministic list of LA-managed operator specs from
 * the current Assessment state. The roster store applies the plan by diff —
 * managed operators with matching `laKey` are updated in place; missing keys
 * are removed; new keys create operators. Manual operators are never touched.
 *
 * Field-control matrix (matches approved design):
 *   LA-controlled (always re-applied):
 *     defaultStartTime, defaultEndTime, workDays, defaultTasks, service,
 *     weeksPerYear (casuals only)
 *   Seed-only (LA seeds on create + re-seeds while user hasn't changed it):
 *     employmentType, level, defaultDivision
 *   User-only (never touched after creation):
 *     name, allowances, per-day shift overrides, per-day division/task
 *     overrides, roster shift cells.
 */

import type { LAState } from "@/contexts/AssessmentContext";
import type { BuildingElement, ElementTask, WendDetailerProgram } from "@/types/labourAssessment";
import type { DayOfWeek, EmploymentType, OperatorLevel, ServiceType } from "@/types/roster";

export interface LaOperatorSpec {
  laKey: string;
  /** Always-applied (LA-controlled) fields */
  service: ServiceType;
  defaultStartTime: string;
  defaultEndTime: string;
  workDays: DayOfWeek[];
  defaultTasks: string;
  /** Seed-only fields (snapshotted into operator.laSeeded) */
  seedEmploymentType: EmploymentType;
  seedLevel: OperatorLevel;
  seedDefaultDivision: string;
  /** Seed Toilet Cleaning Allowance on creation (seed-only). */
  seedToiletAllowance?: boolean;
  /** Default name seeded only on creation. */
  seedName: string;
  /** Hint for UI grouping. */
  groupLabel: string;
  /** Paid hours per workday (informational, for plan summaries). */
  paidHoursPerDay: number;
}

const MON_FRI: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri"];
const SAT_SUN: DayOfWeek[] = ["sat", "sun"];

/** Add hours (with 30-min unpaid break for >4.5h day shifts fully inside 06–18). */
function calcEndTime(startTime: string, hoursPerDay: number): string {
  if (!startTime || !startTime.includes(":") || hoursPerDay <= 0) return "";
  const [h, m] = startTime.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return "";
  const startMin = h * 60 + m;
  const paidMin = Math.round(hoursPerDay * 60);
  let coverageMin = paidMin;
  if (hoursPerDay > 4.5) {
    const tentativeEndUnpaid = startMin + paidMin + 30;
    const dayStart = 6 * 60;
    const dayEnd = 18 * 60;
    if (startMin >= dayStart && tentativeEndUnpaid <= dayEnd) {
      coverageMin = paidMin + 30;
    }
  }
  const endMin = (startMin + coverageMin) % (24 * 60);
  const eh = Math.floor(endMin / 60);
  const em = endMin % 60;
  return `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
}

/**
 * Toilet Cleaning Allowance eligibility (CPQ).
 *
 * Long-term, each ElementTask carries an explicit `toiletAllowanceEligible`
 * flag set by the estimator. Until that UI ships, fall back to a permissive
 * detection: an hour counts as toilet-cleaning if the parent element's zone
 * (or name) is "Toilets" OR the task name matches a toilet-related keyword.
 */
const TOILET_NAME_RE = /(toilet|amenit|wash\s*room|change\s*room|end\s*of\s*trip)/i;

function isToiletEligible(task: ElementTask, element: BuildingElement | undefined): boolean {
  if (task.toiletAllowanceEligible === true) return true;
  if (task.toiletAllowanceEligible === false) return false;
  // Fallback rule: zone OR task name matches the toilet-cleaning keyword set.
  const zone = `${element?.elementType ?? ""} ${element?.elementName ?? ""}`;
  if (TOILET_NAME_RE.test(zone)) return true;
  return TOILET_NAME_RE.test(task.taskName || "");
}

/** Threshold (hrs/week) above which Tenant Special Services get their own
 *  dedicated operators in the "Tenant Special Services" division. Below the
 *  threshold, hours fold into the standard Night Clean pack but reporting
 *  may still surface them via the LA summary table. */
export const TENANT_SPECIAL_THRESHOLD_HRS = 15;

/** Core cleaning weekly hours, split between standard tenancy/common-public
 *  and tenancy-specials (gated by tenant group inclusion). Toilet eligibility
 *  spans both. */
function getCoreWeeklyHours(state: LAState): {
  total: number;
  tenantSpecial: number;
  toilet: number;
  tenantSpecialToilet: number;
} {
  const tenantGroupIds = new Set(
    (state.tenantSpecialGroups ?? []).filter(g => g.included).map(g => g.id),
  );
  const elementsById = new Map(state.buildingElements.map(e => [e.id, e] as const));
  const coreElementIds = new Set<string>();
  const tenantSpecialElementIds = new Set<string>();
  for (const e of state.buildingElements) {
    if (!e.included) continue;
    if (e.tabMapping === "tenancy-specials") {
      if (e.tenantGroupId && tenantGroupIds.has(e.tenantGroupId)) {
        tenantSpecialElementIds.add(e.id);
      }
    } else if (e.tabMapping === "tenancy-areas" || e.tabMapping === "common-public") {
      coreElementIds.add(e.id);
    }
  }
  let total = 0;
  let tenantSpecial = 0;
  let toilet = 0;
  let tenantSpecialToilet = 0;
  for (const t of state.elementTasks) {
    if (!t.included) continue;
    const hrs = t.hoursAdjusted || 0;
    if (coreElementIds.has(t.buildingElementId)) {
      total += hrs;
      if (isToiletEligible(t, elementsById.get(t.buildingElementId))) toilet += hrs;
    } else if (tenantSpecialElementIds.has(t.buildingElementId)) {
      tenantSpecial += hrs;
      if (isToiletEligible(t, elementsById.get(t.buildingElementId))) tenantSpecialToilet += hrs;
    }
  }
  return { total, tenantSpecial, toilet, tenantSpecialToilet };
}

/** Discretionary Staff = elements in Supervision group; each row spawns
 *  `quantityValue` identical operators. Reads LA element values (included,
 *  quantityValue, hoursPerDay, startTime, elementName) as INPUTS ONLY —
 *  this function never writes back to the BuildingElement. The estimator
 *  owns Discretionary Staff settings on the Labour Assessment side. */
function buildDiscretionarySpecs(elements: BuildingElement[]): LaOperatorSpec[] {

  const specs: LaOperatorSpec[] = [];
  for (const el of elements) {
    if (el.group !== "Supervision" || !el.included) continue;
    const qty = Math.max(0, Math.floor(el.quantityValue ?? 0));
    const hpd = el.hoursPerDay ?? 0;
    const start = el.startTime ?? "";
    const end = calcEndTime(start, hpd);
    // CPQ rule: 7.6 paid hours/day on a Mon–Fri Discretionary row qualifies
    // the generated operator as Full Time. Anything less stays part-time
    // (casuals are reserved for weekend programs).
    const isFullTime = Math.abs(hpd - 7.6) < 0.01;
    const seedEmploymentType: EmploymentType = isFullTime ? "full-time" : "part-time";
    for (let i = 0; i < qty; i++) {
      specs.push({
        laKey: `disc:${el.id}:${i}`,
        service: "cleaning",
        defaultStartTime: start,
        defaultEndTime: end,
        workDays: MON_FRI,
        defaultTasks: el.elementName,
        seedEmploymentType,
        seedLevel: "level-1",
        seedDefaultDivision: "Cleaning",
        seedName: "",
        groupLabel: el.elementName,
        paidHoursPerDay: hpd,
      });
    }
  }
  return specs;
}

/** Generic 4h-shift packer used for Night Cleaner and Toilet Cleaning specs. */
function packNightShiftSpecs(
  weeklyHours: number,
  opts: {
    keyPrefix: string;
    defaultTasks: string;
    groupLabel: string;
    seedToiletAllowance?: boolean;
  },
): LaOperatorSpec[] {
  if (weeklyHours <= 0.01) return [];
  const SHIFT = 4.0;
  const MAX = 7.0;
  const DAYS = 5;
  const totalShifts = Math.max(1, Math.round(weeklyHours / SHIFT));
  const fullOps = Math.floor(totalShifts / DAYS);
  const partialDays = totalShifts % DAYS;

  const specs: LaOperatorSpec[] = [];
  let count = 0;
  const base = {
    service: "cleaning" as const,
    defaultStartTime: "18:00",
    seedEmploymentType: "part-time" as EmploymentType,
    seedLevel: "level-1" as OperatorLevel,
    seedDefaultDivision: "Cleaning",
    seedName: "",
    defaultTasks: opts.defaultTasks,
    groupLabel: opts.groupLabel,
    seedToiletAllowance: opts.seedToiletAllowance,
  };

  for (let i = 0; i < fullOps; i++) {
    specs.push({
      ...base,
      laKey: `${opts.keyPrefix}:${count++}`,
      defaultEndTime: calcEndTime("18:00", SHIFT),
      workDays: MON_FRI,
      paidHoursPerDay: SHIFT,
    });
  }

  const allocatedHours = (fullOps * DAYS + partialDays) * SHIFT;
  const remainder = weeklyHours - allocatedHours;
  if (partialDays > 0 || remainder > 0.01) {
    const days = MON_FRI.slice(0, Math.max(partialDays, partialDays === 0 && remainder > 0 ? 1 : 0));
    let shiftHours = SHIFT;
    if (remainder > 0.01 && days.length > 0) {
      shiftHours = Math.min(MAX, SHIFT + remainder);
    } else if (partialDays === 0 && remainder > 0.01) {
      shiftHours = Math.min(MAX, remainder);
    }
    if (days.length > 0) {
      specs.push({
        ...base,
        laKey: `${opts.keyPrefix}:${count++}`,
        defaultEndTime: calcEndTime("18:00", shiftHours),
        workDays: days,
        paidHoursPerDay: shiftHours,
      });
    }
  }
  return specs;
}

/** Toilet Cleaning Allowance qualification threshold (per-operator).
 *  Toilet hours are packed shift-by-shift into night-cleaner operators
 *  ("concentrate first"). Any operator whose shift is >= 50% toilet duties
 *  is reclassified as a Toilet Cleaning operator and receives the allowance.
 *  Sub-50% remainders stay inside Night Clean (no allowance). */
const TOILET_QUALIFY_RATIO = 0.5;

/** Allocate toilet hours into already-packed night-cleaner specs using
 *  concentrate-first: fill one operator's weekly shift hours fully before
 *  spilling into the next. Returns the reclassified spec list. */
function applyToiletAllocation(
  nightSpecs: LaOperatorSpec[],
  toiletHours: number,
): LaOperatorSpec[] {
  if (toiletHours <= 0.01 || nightSpecs.length === 0) return nightSpecs;
  let remaining = toiletHours;
  let toiletCount = 0;
  let nightCount = 0;
  return nightSpecs.map(spec => {
    const shiftHours = spec.paidHoursPerDay * spec.workDays.length;
    if (shiftHours <= 0) return spec;
    const allocated = Math.min(remaining, shiftHours);
    remaining -= allocated;
    const ratio = allocated / shiftHours;
    if (ratio >= TOILET_QUALIFY_RATIO) {
      const idx = toiletCount++;
      return {
        ...spec,
        laKey: `toilet:${idx}`,
        defaultTasks: "Toilet Cleaning",
        groupLabel: "Toilet Cleaning",
        seedToiletAllowance: true,
      };
    }
    const idx = nightCount++;
    return { ...spec, laKey: `core:${idx}` };
  });
}

/** One operator per included Weekend/Detailer program. */
function buildWendSpecs(programs: WendDetailerProgram[]): LaOperatorSpec[] {
  const specs: LaOperatorSpec[] = [];
  for (const p of programs) {
    if (!p.included) continue;
    if (p.hoursPerDay <= 0) continue;
    const days: DayOfWeek[] = [];
    if (p.satApplied) days.push("sat");
    if (p.sunApplied) days.push("sun");
    if (days.length === 0) continue;
    specs.push({
      laKey: `wend:${p.id}`,
      service: "cleaning",
      defaultStartTime: "06:00",
      defaultEndTime: calcEndTime("06:00", p.hoursPerDay),
      workDays: days,
      defaultTasks: p.name,
      seedEmploymentType: "casual",
      seedLevel: "level-1",
      seedDefaultDivision: "Cleaning",
      seedName: "",
      groupLabel: p.name,
      paidHoursPerDay: p.hoursPerDay,
    });
  }
  return specs;
}

/** Build the full operator plan from current LA state. */
export function buildLaPlan(state: LAState): LaOperatorSpec[] {
  const disc = buildDiscretionarySpecs(state.buildingElements);
  const { total, tenantSpecial, toilet } = getCoreWeeklyHours(state);

  // Decide whether Tenant Special Services qualifies for dedicated operators.
  // Above threshold → separate pack with division "Tenant Special Services".
  // Below threshold → fold hours into the standard Night Clean pack so they
  // still get rostered, just without a dedicated operator pool.
  const useDedicatedTenant = tenantSpecial >= TENANT_SPECIAL_THRESHOLD_HRS;
  const standardHours = useDedicatedTenant ? total : total + tenantSpecial;

  // Pack standard core hours into night-cleaner shifts, then allocate
  // toilet-eligible hours into those shifts (concentrate first). Operators
  // whose shift is >= 50% toilet duties are reclassified as Toilet Cleaning.
  const packed = packNightShiftSpecs(standardHours, {
    keyPrefix: "core",
    defaultTasks: "Night Clean",
    groupLabel: "Night Cleaner",
  });
  const allocated = applyToiletAllocation(packed, toilet);

  // Dedicated Tenant Special Services operators (above threshold only).
  // Excluded from toilet reclassification — keeps "Tenant Special" semantics
  // clean for reporting/division breakdown.
  const tenantSpecs = useDedicatedTenant
    ? packNightShiftSpecs(tenantSpecial, {
        keyPrefix: "tenant-special",
        defaultTasks: "Tenant Special",
        groupLabel: "Tenant Special Services",
      }).map(spec => ({ ...spec, seedDefaultDivision: "Tenant Special Services" }))
    : [];

  const wend = buildWendSpecs(state.wendDetailerPrograms ?? []);
  return [...allocated, ...tenantSpecs, ...disc, ...wend];
}
