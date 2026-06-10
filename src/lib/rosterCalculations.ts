import type { 
  DayOfWeek, 
  ShiftEntry, 
  DayCalculation, 
  OperatorCalculations, 
  WeeklyRoster,
  EmploymentType,
  ServiceType,
  DAYS_OF_WEEK 
} from '@/types/roster';
import { DAY_LABELS } from '@/types/roster';
import { resolveShift } from './resolveShift';
import { normalizeTimeValue } from './timeUtils';

const FULL_TIME_PAID_HOURS = 7.6;
const FULL_TIME_PAID_MIN = FULL_TIME_PAID_HOURS * 60; // 456 minutes
const FULL_TIME_WEEKLY_PAID_MIN = 2280; // 38.0 * 60 = 2280 minutes
const MAX_DAILY_PAID_MIN = 456; // 7.6 * 60 = 456 minutes
const MAX_WEEKLY_PAID_MIN = 2280; // 38.0 * 60 = 2280 minutes
const BREAK_DURATION_MIN = 30;
const BREAK_THRESHOLD_MIN = 240; // 4 hours
const DAY_START_HOUR = 6; // 06:00
const DAY_END_HOUR = 18;  // 18:00

export function timeToMinutes(time: string): number {
  if (!time) return -1;
  let normalized = time;
  if (!time.includes(':')) {
    normalized = normalizeTimeValue(time);
    if (!normalized.includes(':')) return -1;
  }
  const [hours, minutes] = normalized.split(':').map(Number);
  if (isNaN(hours) || isNaN(minutes)) return -1;
  return hours * 60 + minutes;
}

export function minutesToTime(minutes: number): string {
  if (minutes < 0) return '';
  const hours = Math.floor(minutes / 60) % 24;
  const mins = Math.round(minutes % 60);
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

export function minutesToDecimalHours(minutes: number): number {
  return minutes / 60;
}

export function formatDecimalHours(hours: number): string {
  return hours.toFixed(2);
}

/**
 * Treat end_time === "00:00" (endMin === 0) as 24:00 of the SAME day,
 * but only when there is a real start time and start is not also 0.
 * This prevents shifts ending exactly at midnight from being misclassified
 * as overnight / next-day.
 */
export function normalizeEndMin(startMin: number, endMin: number): number {
  if (endMin === 0 && startMin > 0) return 1440;
  return endMin;
}

// Check if shift includes any time outside 06:00-18:00
function shiftIncludesOutOfHours(startMin: number, endMin: number): boolean {
  const dayStartMin = DAY_START_HOUR * 60;  // 06:00 = 360
  const dayEndMin = DAY_END_HOUR * 60;      // 18:00 = 1080
  const adjEnd = normalizeEndMin(startMin, endMin);
  
  // If overnight shift (adjEnd < startMin), it definitely includes out-of-hours
  if (adjEnd < startMin) return true;
  
  // Check if any part is before 06:00 or after 18:00
  return startMin < dayStartMin || adjEnd > dayEndMin;
}

export function autoCalculateEndTime(
  startTime: string, 
  employmentType: EmploymentType
): string {
  if (employmentType !== 'full-time' || !startTime) return '';
  
  const startMin = timeToMinutes(startTime);
  if (startMin < 0) return '';
  
  // First assume day shift (unpaid break): coverage = 7.6 + 0.5 = 8.1 hours
  const dayCoverageMin = FULL_TIME_PAID_MIN + BREAK_DURATION_MIN; // 486 min
  let endMin = startMin + dayCoverageMin;
  
  // Re-check: if shift includes out-of-hours, switch to paid break (7.6 hours)
  if (shiftIncludesOutOfHours(startMin, endMin)) {
    const shortEnd = startMin + FULL_TIME_PAID_MIN; // 456 min
    // Only use shorter shift if it STILL includes out-of-hours
    if (shiftIncludesOutOfHours(startMin, shortEnd)) {
      endMin = shortEnd;
    }
  }
  
  return minutesToTime(endMin);
}

export function autoCalculateStartTime(
  endTime: string, 
  employmentType: EmploymentType
): string {
  if (employmentType !== 'full-time' || !endTime) return '';
  
  const endMin = timeToMinutes(endTime);
  if (endMin < 0) return '';
  
  // First assume day shift (unpaid break): coverage = 8.1 hours
  const dayCoverageMin = FULL_TIME_PAID_MIN + BREAK_DURATION_MIN; // 486 min
  let startMin = endMin - dayCoverageMin;
  
  // Handle wrap-around for overnight shifts
  if (startMin < 0) {
    startMin += 24 * 60;
  }
  
  // Re-check: if shift includes out-of-hours, switch to paid break (7.6 hours)
  if (shiftIncludesOutOfHours(startMin, endMin)) {
    let shortStart = endMin - FULL_TIME_PAID_MIN;
    if (shortStart < 0) {
      shortStart += 24 * 60;
    }
    // Only use shorter shift if it STILL includes out-of-hours
    if (shiftIncludesOutOfHours(shortStart, endMin)) {
      startMin = shortStart;
    }
  }
  
  return minutesToTime(startMin);
}

export function calculateDay(
  day: DayOfWeek,
  shift: ShiftEntry | undefined,
  employmentType: EmploymentType,
  service: ServiceType = 'cleaning'
): DayCalculation {
  // Handle undefined shift defensively
  const safeShift: ShiftEntry = shift ?? { startTime: '', endTime: '', division: '', tasks: '' };
  
  // Use resolveShift as the single source of truth for computing times
  const resolved = resolveShift(
    safeShift.startTime ?? '',
    safeShift.endTime ?? '',
    employmentType
  );
  
  const result: DayCalculation = {
    day,
    startTime: resolved.startResolved,
    endTime: resolved.endResolved,
    startMin: -1,
    endMin: -1,
    coverageMin: 0,
    coverageHours: 0,
    paidMin: 0,
    paidHours: 0,
    hasBreak: false,
    isUnpaidBreak: false,
    breakStartMin: 0,
    isValid: false,
    warnings: [],
    isAutoCalculated: resolved.isAutoCalcStart || resolved.isAutoCalcEnd,
    isAutoCalcStart: resolved.isAutoCalcStart,
    isAutoCalcEnd: resolved.isAutoCalcEnd,
  };

  // Use resolved times for all calculations
  const startTime = resolved.startResolved;
  const endTime = resolved.endResolved;
  
  // Handle incomplete shift warning for PT/Casual
  if (resolved.isIncomplete) {
    result.warnings.push(`Non-compliance: ${resolved.incompleteReason}`);
  }

  // Skip if no times entered
  if (!startTime && !endTime) {
    return result;
  }

  const startMin = timeToMinutes(startTime);
  const endMin = timeToMinutes(endTime);

  result.startMin = startMin;
  result.endMin = endMin;

  // Validate times
  if (startMin < 0 || endMin < 0) {
    result.warnings.push(`Non-compliance: Invalid time format on ${DAY_LABELS[day]}.`);
    return result;
  }

  // Treat end == 00:00 as 24:00 of the same day for calculation purposes
  const endMinAdj = normalizeEndMin(startMin, endMin);

  // Calculate coverage (handle overnight shifts)
  let coverageMin = endMinAdj - startMin;
  if (coverageMin < 0) {
    // Genuine overnight shift (e.g. 22:00 -> 02:00)
    coverageMin += 24 * 60;
    if (coverageMin <= 0 || coverageMin > 24 * 60) {
      result.warnings.push(`Non-compliance: End time must be after start time on ${DAY_LABELS[day]}.`);
      return result;
    }
  } else if (coverageMin === 0) {
    // start === end with no normalisation applied (e.g. both 00:00) — invalid
    result.warnings.push(`Non-compliance: End time must be after start time on ${DAY_LABELS[day]}.`);
    return result;
  }

  result.coverageMin = coverageMin;
  result.coverageHours = minutesToDecimalHours(coverageMin);
  result.isValid = true;

  // Determine break and paid time based on shift window
  if (coverageMin > BREAK_THRESHOLD_MIN) {
    result.hasBreak = true;
    result.breakStartMin = startMin + BREAK_THRESHOLD_MIN; // 4 hours after start
    
    // Determine if break is unpaid or paid based on the WORK portion only (exclude break time).
    // A day shift that extends slightly past 18:00 only because of the unpaid break
    // should still be classified as unpaid break.
    const workEndMin = coverageMin > BREAK_DURATION_MIN
      ? endMin - BREAK_DURATION_MIN
      : endMin;
    const workIncludesOutOfHours = shiftIncludesOutOfHours(startMin, workEndMin);
    result.isUnpaidBreak = !workIncludesOutOfHours;
    
    if (result.isUnpaidBreak) {
      result.paidMin = coverageMin - BREAK_DURATION_MIN; // Deduct 30 min
    } else {
      result.paidMin = coverageMin; // No deduction
    }
  } else {
    result.paidMin = coverageMin;
  }

  result.paidHours = minutesToDecimalHours(result.paidMin);

  // Daily maximum warning: Security only — max 12h per day
  if (service === 'security') {
    if (result.paidMin > 720) {
      result.warnings.push(`⚠ >12h`);
    }
  }

  return result;
}

// Check if operator has two consecutive days off
function hasTwoConsecutiveDaysOff(dayCalculations: DayCalculation[]): boolean {
  // Days in order: Mon, Tue, Wed, Thu, Fri, Sat, Sun
  // Need to check wrap-around (Sun-Mon as consecutive)
  for (let i = 0; i < dayCalculations.length; i++) {
    const currentDayOff = dayCalculations[i].coverageMin === 0;
    const nextIndex = (i + 1) % dayCalculations.length;
    const nextDayOff = dayCalculations[nextIndex].coverageMin === 0;
    
    if (currentDayOff && nextDayOff) {
      return true;
    }
  }
  return false;
}

// Check if operator works more than maxConsecutive days in a row (with wrap-around)
function exceedsConsecutiveDays(dayCalculations: DayCalculation[], maxConsecutive: number): boolean {
  const n = dayCalculations.length;
  let consecutive = 0;
  // Check 2 * n to handle wrap-around
  for (let i = 0; i < 2 * n; i++) {
    if (dayCalculations[i % n].coverageMin > 0) {
      consecutive++;
      if (consecutive > maxConsecutive) return true;
    } else {
      consecutive = 0;
    }
  }
  return false;
}

export function calculateOperatorWeek(
  roster: WeeklyRoster,
  employmentType: EmploymentType,
  days: DayOfWeek[],
  service: ServiceType = 'cleaning',
  weeksPerYear?: number
): OperatorCalculations {
  const dayCalculations: DayCalculation[] = days.map(day => 
    calculateDay(day, roster.shifts[day], employmentType, service)
  );

  // Sum paid minutes from all days (unrounded)
  const weeklyPaidMin = dayCalculations.reduce((sum, day) => sum + day.paidMin, 0);
  const weeklyPaidHours = minutesToDecimalHours(weeklyPaidMin);
  
  // Casual operators: annualise using user-entered weeksPerYear; FT/PT: always 52.14
  const annualFactor = employmentType === 'casual' && typeof weeksPerYear === 'number' ? weeksPerYear : 52.14;
  const yearlyPaidHours = weeklyPaidHours * annualFactor;
  const monthlyPaidHours = yearlyPaidHours / 12;

  const isSecurity = service === 'security';
  const warnings: string[] = [];
  
  // Collect day-level warnings (e.g. Security >12h)
  dayCalculations.forEach(day => {
    day.warnings.forEach(w => {
      warnings.push(`${day.day.toUpperCase()}: ${w}`);
    });
  });

  // Full-time weekly hours check (all services)
  if (employmentType === 'full-time') {
    if (weeklyPaidMin < FULL_TIME_WEEKLY_PAID_MIN) {
      warnings.push(`WEEKLY: ⚠ FT hours < 38/week (current: ${formatDecimalHours(weeklyPaidHours)}h)`);
    } else if (weeklyPaidMin > FULL_TIME_WEEKLY_PAID_MIN) {
      // For Security FT, show generic >38h message to avoid duplication
      if (isSecurity) {
        warnings.push(`WEEKLY: ⚠ >38h/week (current: ${formatDecimalHours(weeklyPaidHours)}h)`);
      } else {
        warnings.push(`WEEKLY: ⚠ FT hours > 38/week (current: ${formatDecimalHours(weeklyPaidHours)}h)`);
      }
    }
  }

  // Security non-FT: max 38h/week
  if (isSecurity && employmentType !== 'full-time' && weeklyPaidMin > MAX_WEEKLY_PAID_MIN) {
    warnings.push(`WEEKLY: ⚠ >38h/week (current: ${formatDecimalHours(weeklyPaidHours)}h)`);
  }

  // Two consecutive days off warning (all services except Management)
  if (service !== 'management' && !hasTwoConsecutiveDaysOff(dayCalculations)) {
    warnings.push(`WEEKLY: ⚠ No 2 consecutive days off`);
  }

  // Minimum 8-hour break between consecutive shifts
  const MIN_BREAK_BETWEEN_SHIFTS = 8 * 60; // 480 minutes
  const dayLabelsShort: Record<DayOfWeek, string> = {
    mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
  };
  for (let i = 0; i < dayCalculations.length; i++) {
    const current = dayCalculations[i];
    const next = dayCalculations[(i + 1) % dayCalculations.length];
    // Both days must have valid shifts
    if (current.coverageMin === 0 || next.coverageMin === 0) continue;
    if (current.endMin < 0 || next.startMin < 0) continue;

    // Calculate end minute as absolute. End == 00:00 with start > 0 = same-day 24:00, NOT overnight.
    const currentEndAdj = normalizeEndMin(current.startMin, current.endMin);
    let currentEndAbsolute = currentEndAdj;
    if (currentEndAdj < current.startMin) {
      // Overnight shift — end is on the next calendar day
      currentEndAbsolute = currentEndAdj + 24 * 60;
    }

    // Next shift start is on the next calendar day relative to current shift's day
    const nextStartAbsolute = next.startMin + 24 * 60;

    const breakMinutes = nextStartAbsolute - currentEndAbsolute;
    if (breakMinutes < MIN_BREAK_BETWEEN_SHIFTS) {
      const breakHours = (breakMinutes / 60).toFixed(1);
      const currentDay = dayLabelsShort[days[i]];
      const nextDay = dayLabelsShort[days[(i + 1) % days.length]];
      warnings.push(`WEEKLY: ⚠ Minimum 8-hour break not met between ${currentDay}–${nextDay} (current break: ${breakHours}h)`);
    }
  }

  return {
    operatorId: roster.operatorId,
    days: dayCalculations,
    weeklyPaidMin,
    weeklyPaidHours,
    monthlyPaidHours,
    yearlyPaidHours,
    warnings,
  };
}

export function exportToCSV(
  operators: { id: string; name: string; number: number }[],
  rosters: WeeklyRoster[],
  calculations: Map<string, OperatorCalculations>,
  days: DayOfWeek[]
): string {
  const headers = [
    'Operator',
    'Day',
    'Start',
    'End',
    'Coverage (hrs)',
    'Paid (hrs)',
    'Break Type',
    'Warnings',
  ];

  const rows: string[][] = [headers];

  operators.forEach(op => {
    const roster = rosters.find(r => r.operatorId === op.id);
    const calc = calculations.get(op.id);
    
    if (!roster || !calc) return;

    calc.days.forEach(day => {
      if (!day.startTime && !day.endTime) return;
      
      rows.push([
        `Operator ${op.number}`,
        day.day.toUpperCase(),
        day.startTime || '',
        day.endTime || '',
        formatDecimalHours(day.coverageHours),
        formatDecimalHours(day.paidHours),
        day.hasBreak ? (day.isUnpaidBreak ? 'Unpaid' : 'Paid') : 'None',
        day.warnings.join('; '),
      ]);
    });

    // Add weekly total row
    rows.push([
      `Operator ${op.number}`,
      'WEEKLY TOTAL',
      '',
      '',
      '',
      formatDecimalHours(calc.weeklyPaidHours),
      '',
      calc.warnings.filter(w => w.includes('Weekly')).join('; '),
    ]);

    rows.push([]); // Empty row between operators
  });

  return rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
}
