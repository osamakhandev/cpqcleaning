import {
  RosterSettings,
  DayOfWeek,
  ALL_DAYS,
  CoreRosterPlan,
  RosterRow,
  ShiftCell,
  SupportRoleSettings,
  SupportRolePlan,
} from "@/types/laRoster";
import { LineItem, ElementTask, BuildingElement } from "@/types/labourAssessment";

const CORE_ELEMENT_TABS = ["tenancy-areas", "tenancy-specials", "common-public"];

export function getCoreWeeklyHours(
  elementTasks: ElementTask[],
  buildingElements: BuildingElement[],
  lineItems: LineItem[]
): number {
  const coreElementIds = new Set(
    buildingElements.filter(e => CORE_ELEMENT_TABS.includes(e.tabMapping) && e.included).map(e => e.id)
  );
  const etHours = elementTasks
    .filter(t => coreElementIds.has(t.buildingElementId) && t.included)
    .reduce((s, t) => s + t.hoursAdjusted, 0);

  const liHours = lineItems
    .filter(li => li.included && li.tabMapping === "detailer-periodics")
    .reduce((s, li) => s + li.hoursAdjusted, 0);

  return etHours + liHours;
}

export function getSupportRoleHours(lineItems: LineItem[]): Record<string, number> {
  const result: Record<string, number> = {};
  lineItems
    .filter(li => li.included && li.tabMapping === "support-roles")
    .forEach(li => {
      result[li.zone] = (result[li.zone] || 0) + li.hoursAdjusted;
    });
  return result;
}

function roundToIncrement(value: number, increment: number): number {
  return Math.round(value / increment) * increment;
}

function emptyShift(): ShiftCell {
  return { hours: 0, userEdited: false };
}

function emptyShifts(): Record<DayOfWeek, ShiftCell> {
  const s: Record<string, ShiftCell> = {};
  ALL_DAYS.forEach(d => { s[d] = emptyShift(); });
  return s as Record<DayOfWeek, ShiftCell>;
}

// ─── Standard 4h fixed-shift algorithm with exception shift ───
function generateFixedShiftRoster(
  coreWeeklyHours: number,
  settings: RosterSettings
): CoreRosterPlan {
  const STANDARD_SHIFT = 4.0;
  const MAX_EXCEPTION = 7.0;
  const { coreWorkDays, roundingIncrement, optimisationMode, allowExceptionShift } = settings;
  const warnings: string[] = [];
  const numDays = coreWorkDays.length;

  if (numDays === 0 || coreWeeklyHours <= 0) {
    return {
      coreWeeklyHours,
      dailyAvg: 0,
      dailyTargets: Object.fromEntries(ALL_DAYS.map(d => [d, 0])) as Record<DayOfWeek, number>,
      rows: [],
      warnings: numDays === 0 ? ["No work days selected."] : [],
    };
  }

  // Total slots of STANDARD_SHIFT hours
  const totalSlots = coreWeeklyHours / STANDARD_SHIFT;

  // Full-time operators: each works all numDays days/week
  const fullTimeOps = Math.floor(totalSlots / numDays);
  const remainderSlots = totalSlots - fullTimeOps * numDays;

  // Partial operator days (each day = 1 shift = STANDARD_SHIFT hours)
  let partialDays: number;
  if (optimisationMode === "allow-exceed") {
    partialDays = Math.ceil(remainderSlots);
  } else {
    partialDays = Math.floor(remainderSlots);
  }

  // Hours covered so far with standard 4h shifts only
  const standardHours = (fullTimeOps * numDays + partialDays) * STANDARD_SHIFT;
  let remainderHours = coreWeeklyHours - standardHours; // positive = still need more hours

  // Exception shift: one shift between 4h and 7h to absorb remainder
  let exceptionShiftHours = 0;
  let exceptionApplied = false;

  if (allowExceptionShift && Math.abs(remainderHours) > 0.01 && remainderHours > 0) {
    // We need remainderHours more. Add one exception shift on a day.
    // The exception shift replaces a blank slot or adds to a day.
    // Must be between STANDARD_SHIFT and MAX_EXCEPTION
    if (remainderHours <= MAX_EXCEPTION && remainderHours >= STANDARD_SHIFT) {
      // Use remainder as-is for exception shift
      exceptionShiftHours = roundToIncrement(remainderHours, roundingIncrement);
      exceptionApplied = true;
      remainderHours = 0;
    } else if (remainderHours < STANDARD_SHIFT) {
      // Remainder is < 4h. We can add an extra 4h shift and make the total exceed,
      // or add an exception shift of (STANDARD_SHIFT + remainder) on a day where
      // a 4h shift already exists — but that would change a standard shift.
      // Better approach: add one shift of (STANDARD_SHIFT + remainder) capped at MAX_EXCEPTION
      // as an entirely new slot on an available day.
      // If partial operator has room, bump one of their days to a longer shift.
      // Actually simplest: just add a new operator for 1 day with the exception hours.
      // But remainder < 4h violates min. So we can't do a shift < 4h.
      // Option: bump a standard 4h shift to 4h + remainder (max 7h)
      const bumpedHours = roundToIncrement(STANDARD_SHIFT + remainderHours, roundingIncrement);
      if (bumpedHours <= MAX_EXCEPTION) {
        exceptionShiftHours = bumpedHours;
        exceptionApplied = true;
        remainderHours = 0;
      }
    } else {
      // remainder > MAX_EXCEPTION: can't fit in one exception shift
      // Add a full extra day (4h) and then check remainder again
      // This case is rare; leave as variance
    }
  }

  // Calculate final variance
  const totalRostered = standardHours + (exceptionApplied ? exceptionShiftHours : 0)
    - (exceptionApplied && exceptionShiftHours > STANDARD_SHIFT ? STANDARD_SHIFT : 0);
  // If exception replaces a standard shift, we net out differently
  // Let's recalculate properly below when building rows

  // Build rows
  const rows: RosterRow[] = [];
  const dailyTargets: Record<string, number> = {};
  ALL_DAYS.forEach(d => { dailyTargets[d] = 0; });

  const totalStandardOps = fullTimeOps + (partialDays > 0 ? 1 : 0);

  for (let i = 0; i < Math.max(totalStandardOps, 0); i++) {
    const row: RosterRow = {
      label: `Cleaner ${i + 1}`,
      shifts: emptyShifts(),
    };

    const isPartial = partialDays > 0 && partialDays < numDays && i === totalStandardOps - 1;
    const daysForThisOp = isPartial ? partialDays : numDays;

    for (let d = 0; d < daysForThisOp && d < coreWorkDays.length; d++) {
      const day = coreWorkDays[d];
      row.shifts[day] = { hours: STANDARD_SHIFT, userEdited: false };
      dailyTargets[day] = (dailyTargets[day] || 0) + STANDARD_SHIFT;
    }

    rows.push(row);
  }

  // Apply exception shift
  if (exceptionApplied && exceptionShiftHours > 0) {
    if (exceptionShiftHours > STANDARD_SHIFT) {
      // Bump the last allocated shift from 4h to exceptionShiftHours
      // Find a row+day that has a 4h shift and bump it
      let bumped = false;
      for (let ri = rows.length - 1; ri >= 0 && !bumped; ri--) {
        for (let di = coreWorkDays.length - 1; di >= 0 && !bumped; di--) {
          const day = coreWorkDays[di];
          if (rows[ri].shifts[day].hours === STANDARD_SHIFT) {
            rows[ri].shifts[day] = { hours: exceptionShiftHours, userEdited: false };
            dailyTargets[day] = dailyTargets[day] - STANDARD_SHIFT + exceptionShiftHours;
            bumped = true;
          }
        }
      }
      if (bumped) {
        warnings.push(
          `Exception shift: one ${exceptionShiftHours.toFixed(2)}h shift used on one day to reduce variance. This is not a regular pattern.`
        );
      }
    } else {
      // exceptionShiftHours === STANDARD_SHIFT, just add an extra day
      // Find a day not yet used by the partial operator, or add a new operator
      let added = false;
      if (rows.length > 0) {
        const lastRow = rows[rows.length - 1];
        for (const day of coreWorkDays) {
          if (lastRow.shifts[day].hours === 0) {
            lastRow.shifts[day] = { hours: STANDARD_SHIFT, userEdited: false };
            dailyTargets[day] = (dailyTargets[day] || 0) + STANDARD_SHIFT;
            added = true;
            break;
          }
        }
      }
      if (!added) {
        // New operator for 1 day
        const newRow: RosterRow = {
          label: `Cleaner ${rows.length + 1}`,
          shifts: emptyShifts(),
        };
        const day = coreWorkDays[0];
        newRow.shifts[day] = { hours: STANDARD_SHIFT, userEdited: false };
        dailyTargets[day] = (dailyTargets[day] || 0) + STANDARD_SHIFT;
        rows.push(newRow);
      }
    }
  }

  // If no rows at all, add one empty
  if (rows.length === 0) {
    rows.push({ label: "Cleaner 1", shifts: emptyShifts() });
  }

  // Calculate actual total
  const actualTotal = rows.reduce((s, r) =>
    s + ALL_DAYS.reduce((ds, d) => ds + r.shifts[d].hours, 0), 0
  );
  const variance = actualTotal - coreWeeklyHours;

  if (Math.abs(variance) > 0.01) {
    const sign = variance > 0 ? "+" : "";
    warnings.push(
      `Variance: ${sign}${roundToIncrement(variance, roundingIncrement).toFixed(2)}h. Rostered ${actualTotal.toFixed(2)}h vs assessed ${coreWeeklyHours.toFixed(2)}h.`
    );

    if (variance < 0) {
      const suggestions: string[] = [];
      if (!allowExceptionShift) suggestions.push("enable 'Allow one exception shift'");
      if (optimisationMode === "no-exceed") suggestions.push("switch to 'allow exceeding'");
      suggestions.push("add weekend work days");
      warnings.push(`Suggestions: ${suggestions.join(", ")}.`);
    }
  }

  // Validation: no shift < 4h, at most one > 4h
  let exceptionCount = 0;
  for (const r of rows) {
    for (const d of ALL_DAYS) {
      const h = r.shifts[d].hours;
      if (h > 0) {
        if (h < STANDARD_SHIFT - 0.001) {
          warnings.push(`ERROR: ${r.label} on ${d} has ${h}h (below ${STANDARD_SHIFT}h minimum).`);
        }
        if (h > STANDARD_SHIFT + 0.001) {
          exceptionCount++;
          if (h > MAX_EXCEPTION + 0.001) {
            warnings.push(`ERROR: ${r.label} on ${d} has ${h}h (exceeds ${MAX_EXCEPTION}h maximum).`);
          }
        }
      }
    }
  }
  if (exceptionCount > 1) {
    warnings.push(`ERROR: ${exceptionCount} exception shifts found; only 1 is allowed.`);
  }

  return {
    coreWeeklyHours,
    dailyAvg: coreWeeklyHours / numDays,
    dailyTargets: dailyTargets as Record<DayOfWeek, number>,
    rows,
    warnings,
  };
}

// ─── Variable-shift-length algorithm (original) ─────────────
function generateVariableShiftRoster(
  coreWeeklyHours: number,
  settings: RosterSettings
): CoreRosterPlan {
  const { coreWorkDays, minShiftHours, maxShiftHours, roundingIncrement, preferSingleStaff } = settings;
  const warnings: string[] = [];
  const numDays = coreWorkDays.length;

  if (numDays === 0 || coreWeeklyHours <= 0) {
    return {
      coreWeeklyHours,
      dailyAvg: 0,
      dailyTargets: Object.fromEntries(ALL_DAYS.map(d => [d, 0])) as Record<DayOfWeek, number>,
      rows: [],
      warnings: numDays === 0 ? ["No work days selected."] : [],
    };
  }

  const dailyAvg = coreWeeklyHours / numDays;
  const floorToIncrement = (v: number, inc: number) => Math.floor(v / inc) * inc;

  let baseDaily = floorToIncrement(dailyAvg, roundingIncrement);
  if (baseDaily < minShiftHours) {
    baseDaily = minShiftHours;
    if (baseDaily * numDays > coreWeeklyHours) {
      warnings.push(
        "Daily minimum shift settings cause hours to exceed assessed weekly hours. Consider reducing work days or lowering MinShiftHours."
      );
    }
  }

  const dailyTargets: Record<string, number> = {};
  ALL_DAYS.forEach(d => { dailyTargets[d] = 0; });
  coreWorkDays.forEach(d => { dailyTargets[d] = baseDaily; });

  let allocated = coreWorkDays.reduce((s, d) => s + dailyTargets[d], 0);
  let remainder = roundToIncrement(coreWeeklyHours - allocated, roundingIncrement);

  if (remainder > 0) {
    for (const day of coreWorkDays) {
      if (remainder <= 0) break;
      const canAdd = roundToIncrement(maxShiftHours - dailyTargets[day], roundingIncrement);
      if (canAdd > 0) {
        const add = Math.min(canAdd, remainder);
        dailyTargets[day] = roundToIncrement(dailyTargets[day] + add, roundingIncrement);
        remainder = roundToIncrement(remainder - add, roundingIncrement);
      }
    }
    if (remainder > 0.01) {
      warnings.push(
        `Unable to allocate ${remainder.toFixed(2)}h within max shift constraints. Consider adding work days or increasing MaxShiftHours.`
      );
    }
  } else if (remainder < -0.01) {
    warnings.push(
      "Daily minimum shift settings cause hours to exceed assessed weekly hours."
    );
  }

  let maxStaff = 0;
  const dayStaffShifts: Record<string, number[]> = {};

  for (const day of ALL_DAYS) {
    const target = dailyTargets[day];
    if (target <= 0) {
      dayStaffShifts[day] = [];
      continue;
    }

    if (preferSingleStaff && target <= maxShiftHours) {
      dayStaffShifts[day] = [target];
    } else {
      const staffCount = Math.ceil(target / maxShiftHours);
      const evenHours = roundToIncrement(target / staffCount, roundingIncrement);
      const shifts: number[] = [];
      let remaining = target;
      for (let i = 0; i < staffCount; i++) {
        if (i === staffCount - 1) {
          shifts.push(roundToIncrement(remaining, roundingIncrement));
        } else {
          const h = Math.min(evenHours, remaining);
          shifts.push(h);
          remaining -= h;
        }
      }
      dayStaffShifts[day] = shifts;
    }
    maxStaff = Math.max(maxStaff, dayStaffShifts[day].length);
  }

  const rows: RosterRow[] = [];
  for (let i = 0; i < Math.max(maxStaff, 1); i++) {
    const row: RosterRow = {
      label: `Cleaner ${i + 1}`,
      shifts: emptyShifts(),
    };
    for (const day of ALL_DAYS) {
      const shifts = dayStaffShifts[day] || [];
      if (i < shifts.length) {
        row.shifts[day] = { hours: shifts[i], userEdited: false };
      }
    }
    rows.push(row);
  }

  const totalGenerated = rows.reduce((s, r) =>
    s + ALL_DAYS.reduce((ds, d) => ds + r.shifts[d].hours, 0), 0
  );
  if (Math.abs(totalGenerated - coreWeeklyHours) > 0.25) {
    warnings.push(
      `Generated roster (${totalGenerated.toFixed(2)}h) differs from assessed hours (${coreWeeklyHours.toFixed(2)}h) by ${(totalGenerated - coreWeeklyHours).toFixed(2)}h.`
    );
  }

  for (const r of rows) {
    for (const d of ALL_DAYS) {
      if (r.shifts[d].hours > maxShiftHours + 0.01) {
        warnings.push(`${r.label} on ${d} exceeds max shift hours (${r.shifts[d].hours.toFixed(2)}h > ${maxShiftHours}h).`);
      }
    }
  }

  return {
    coreWeeklyHours,
    dailyAvg,
    dailyTargets: dailyTargets as Record<DayOfWeek, number>,
    rows,
    warnings,
  };
}

// ─── Public entry point ─────────────────────────────────────
export function generateCoreRoster(
  coreWeeklyHours: number,
  settings: RosterSettings
): CoreRosterPlan {
  // Use fixed-shift algorithm when min=max (standard 4h approach)
  const isFixedShift = Math.abs(settings.minShiftHours - settings.maxShiftHours) < 0.001;

  if (isFixedShift) {
    return generateFixedShiftRoster(coreWeeklyHours, settings);
  }
  return generateVariableShiftRoster(coreWeeklyHours, settings);
}

export function generateSupportRolePlan(
  roleName: string,
  weeklyHours: number,
  settings: SupportRoleSettings
): SupportRolePlan {
  const { workDays, maxShiftHours, shiftStyle } = settings;
  const numDays = workDays.length;

  if (numDays === 0 || weeklyHours <= 0) {
    return { roleName, weeklyHours, settings, rows: [] };
  }

  const dailyTargets: Record<string, number> = {};
  ALL_DAYS.forEach(d => { dailyTargets[d] = 0; });

  if (shiftStyle === "single-day") {
    dailyTargets[workDays[0]] = roundToIncrement(weeklyHours, 0.25);
  } else if (shiftStyle === "front-load") {
    let remaining = weeklyHours;
    for (const day of workDays) {
      const alloc = roundToIncrement(Math.min(remaining, maxShiftHours), 0.25);
      dailyTargets[day] = alloc;
      remaining -= alloc;
      if (remaining <= 0) break;
    }
  } else {
    const daily = roundToIncrement(weeklyHours / numDays, 0.25);
    let allocated = 0;
    workDays.forEach((d, i) => {
      if (i === numDays - 1) {
        dailyTargets[d] = roundToIncrement(weeklyHours - allocated, 0.25);
      } else {
        dailyTargets[d] = daily;
        allocated += daily;
      }
    });
  }

  let maxStaff = 0;
  const dayShifts: Record<string, number[]> = {};
  for (const day of ALL_DAYS) {
    const t = dailyTargets[day];
    if (t <= 0) { dayShifts[day] = []; continue; }
    if (t <= maxShiftHours) {
      dayShifts[day] = [t];
    } else {
      const count = Math.ceil(t / maxShiftHours);
      const even = roundToIncrement(t / count, 0.25);
      const shifts: number[] = [];
      let rem = t;
      for (let i = 0; i < count; i++) {
        if (i === count - 1) shifts.push(roundToIncrement(rem, 0.25));
        else { shifts.push(even); rem -= even; }
      }
      dayShifts[day] = shifts;
    }
    maxStaff = Math.max(maxStaff, dayShifts[day].length);
  }

  const rows: RosterRow[] = [];
  for (let i = 0; i < Math.max(maxStaff, 1); i++) {
    const row: RosterRow = { label: `Staff ${i + 1}`, shifts: emptyShifts() };
    for (const day of ALL_DAYS) {
      if (i < (dayShifts[day]?.length || 0)) {
        row.shifts[day] = { hours: dayShifts[day][i], userEdited: false };
      }
    }
    rows.push(row);
  }

  return { roleName, weeklyHours, settings, rows };
}
