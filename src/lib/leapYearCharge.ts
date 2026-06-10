import type { DayOfWeek } from '@/types/roster';

/** Check if a year is a leap year */
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

/** Map JS getDay() to our DayOfWeek type */
const DOW_MAP: Record<number, DayOfWeek> = {
  0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat',
};

const DAY_NAMES: Record<DayOfWeek, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};

export interface LeapDayInfo {
  date: string;         // "29 Feb YYYY"
  dateISO: string;      // "YYYY-02-29"
  year: number;
  weekday: DayOfWeek;
  weekdayLabel: string;
  worked: boolean;
  dailyCost: number;    // if worked, the daily contract cost; else 0
  charge: number;       // same as dailyCost if worked, else 0
}

export interface LeapYearChargeResult {
  leapDays: LeapDayInfo[];
  totalCharge: number;
  applicable: boolean;  // true if Fixed Price + fixedYears > 0
}

/**
 * Find all Feb 29 dates within a contract period and calculate charges.
 *
 * @param contractStartISO  - ISO date string "YYYY-MM-DD" for contract start
 * @param fixedYears        - number of fixed contract years
 * @param dailyCostByDow    - cost for a single day by day-of-week (full sell price)
 * @param isWorkedDay       - function checking if a given DayOfWeek has any roster coverage
 */
export function calculateLeapYearCharge(
  contractStartISO: string,
  fixedYears: number,
  dailyCostByDow: Record<DayOfWeek, number>,
  isWorkedDay: (dow: DayOfWeek) => boolean,
): LeapYearChargeResult {
  if (!contractStartISO || fixedYears <= 0) {
    return { leapDays: [], totalCharge: 0, applicable: false };
  }

  const start = new Date(contractStartISO + 'T00:00:00');
  if (isNaN(start.getTime())) {
    return { leapDays: [], totalCharge: 0, applicable: false };
  }

  // Contract end = start + fixedYears years - 1 day
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + fixedYears);
  end.setDate(end.getDate() - 1);

  // Find all Feb 29 in range
  const leapDays: LeapDayInfo[] = [];
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();

  for (let year = startYear; year <= endYear; year++) {
    if (!isLeapYear(year)) continue;

    const feb29 = new Date(year, 1, 29); // month 1 = February
    // Verify the date is valid (should be for leap years)
    if (feb29.getMonth() !== 1 || feb29.getDate() !== 29) continue;

    // Check if within contract range (inclusive)
    if (feb29 < start || feb29 > end) continue;

    const dow = DOW_MAP[feb29.getDay()];
    const worked = isWorkedDay(dow);
    const dailyCost = worked ? (dailyCostByDow[dow] ?? 0) : 0;

    leapDays.push({
      date: `29 Feb ${year}`,
      dateISO: `${year}-02-29`,
      year,
      weekday: dow,
      weekdayLabel: DAY_NAMES[dow],
      worked,
      dailyCost,
      charge: dailyCost,
    });
  }

  const totalCharge = leapDays.reduce((sum, ld) => sum + ld.charge, 0);

  return { leapDays, totalCharge, applicable: true };
}
