import type { SecurityAllowances, CleaningAllowances, DayOfWeek } from '@/types/roster';

export interface AllowanceLineItem {
  name: string;
  detail: string;
  cost: number;
}

export interface AllowanceBreakdown {
  items: AllowanceLineItem[];
  totalWeekly: number;
}

export function calculateSecurityAllowances(
  allowances: SecurityAllowances,
  weeklyPaidHours: number,
  workedShifts: number
): AllowanceBreakdown {
  const items: AllowanceLineItem[] = [];

  // Aviation: $2.02/hour
  if (allowances.aviationAllowance) {
    const cost = weeklyPaidHours * 2.02;
    items.push({ name: 'Aviation Allowance', detail: `${weeklyPaidHours.toFixed(1)}h × $2.02`, cost });
  }

  // Broken shift: $17.47/shift
  if (allowances.brokenShift) {
    const cost = workedShifts * 17.47;
    items.push({ name: 'Broken Shift', detail: `${workedShifts} shifts × $17.47`, cost });
  }

  // First aid: $7.33/shift, cap $36.46/week
  if (allowances.firstAid) {
    const raw = workedShifts * 7.33;
    const capped = Math.min(raw, 36.46);
    const detail = raw > 36.46
      ? `${workedShifts} shifts × $7.33 = $${raw.toFixed(2)} → capped to $36.46`
      : `${workedShifts} shifts × $7.33`;
    items.push({ name: 'First Aid', detail, cost: capped });
  }

  // Firearm: $3.67/shift, cap $18.34/week
  if (allowances.firearm) {
    const raw = workedShifts * 3.67;
    const capped = Math.min(raw, 18.34);
    const detail = raw > 18.34
      ? `${workedShifts} shifts × $3.67 = $${raw.toFixed(2)} → capped to $18.34`
      : `${workedShifts} shifts × $3.67`;
    items.push({ name: 'Firearm', detail, cost: capped });
  }

  // Supervision
  const supervisionRates: Record<string, number> = {
    'none': 0, '1-5': 45.52, '6-10': 52.53, '11-20': 68.17, '>20': 80.46,
  };
  if (allowances.supervisionBand !== 'none') {
    const rate = supervisionRates[allowances.supervisionBand] ?? 0;
    items.push({ name: 'Supervision', detail: `${allowances.supervisionBand} employees: $${rate.toFixed(2)}/week`, cost: rate });
  }

  const totalWeekly = items.reduce((sum, item) => sum + item.cost, 0);
  return { items, totalWeekly };
}

function getApplicableDayCount(
  dayMode: 'all' | 'select' | undefined,
  selectedDays: DayOfWeek[] | undefined,
  workedDays: DayOfWeek[]
): number {
  if (!dayMode || dayMode === 'all') return workedDays.length;
  return (selectedDays ?? []).filter(d => workedDays.includes(d)).length;
}

export function calculateCleaningAllowances(
  allowances: CleaningAllowances,
  weeklyPaidHours: number,
  workedDays: DayOfWeek[],
  operatorLevel: string
): AllowanceBreakdown {
  const items: AllowanceLineItem[] = [];
  const workedShifts = workedDays.length;

  // Toilet cleaning: $3.53/shift, cap $17.35/week
  if (allowances.toiletCleaning) {
    const days = getApplicableDayCount(allowances.toiletCleaningDayMode, allowances.toiletCleaningDays, workedDays);
    const raw = days * 3.53;
    const capped = Math.min(raw, 17.35);
    const detail = raw > 17.35
      ? `${days} days × $3.53 = $${raw.toFixed(2)} → capped to $17.35`
      : `${days} days × $3.53`;
    items.push({ name: 'Toilet Cleaning', detail, cost: capped });
  }

  // Refuse collection: $4.48/shift
  if (allowances.refuseCollection) {
    const days = getApplicableDayCount(allowances.refuseCollectionDayMode, allowances.refuseCollectionDays, workedDays);
    const cost = days * 4.48;
    items.push({ name: 'Refuse Collection', detail: `${days} days × $4.48`, cost });
  }

  // Leading hand – daily rate = weekly / 5
  if (allowances.leadingHandBand !== 'none') {
    const leadingHandWeeklyRates: Record<string, number> = {
      '1-10': 58.93, '11-20': 75.83, '>20': 92.72,
    };
    const weeklyRate = leadingHandWeeklyRates[allowances.leadingHandBand] ?? 0;
    const dailyRate = weeklyRate / 5;
    const days = getApplicableDayCount(allowances.leadingHandDayMode, allowances.leadingHandDays, workedDays);
    const cost = days * dailyRate;
    items.push({ name: 'Leading Hand', detail: `${days} days × $${dailyRate.toFixed(2)}/day`, cost });
  }

  // Hot places >54°C: $0.80/hour
  if (allowances.hotPlacesAbove54) {
    const cost = weeklyPaidHours * 0.80;
    items.push({ name: 'Hot Places (>54°C)', detail: `${weeklyPaidHours.toFixed(1)}h × $0.80`, cost });
  }

  // Hot places 46-54°C: $0.66/hour
  if (allowances.hotPlaces46to54) {
    const cost = weeklyPaidHours * 0.66;
    items.push({ name: 'Hot Places (46–54°C)', detail: `${weeklyPaidHours.toFixed(1)}h × $0.66`, cost });
  }

  // Height above 22nd floor: $2.17/hour
  if (allowances.heightAbove22) {
    const cost = weeklyPaidHours * 2.17;
    items.push({ name: 'Height (above 22nd floor)', detail: `${weeklyPaidHours.toFixed(1)}h × $2.17`, cost });
  }

  // Height ≤22nd floor: $1.06/hour
  if (allowances.heightBelow22) {
    const cost = weeklyPaidHours * 1.06;
    items.push({ name: 'Height (≤22nd floor)', detail: `${weeklyPaidHours.toFixed(1)}h × $1.06`, cost });
  }

  // First aid: $16.11/week → daily rate = $16.11 / 5
  if (allowances.firstAid) {
    const dailyRate = 16.11 / 5;
    const days = getApplicableDayCount(allowances.firstAidDayMode, allowances.firstAidDays, workedDays);
    const cost = days * dailyRate;
    items.push({ name: 'First Aid', detail: `${days} days × $${dailyRate.toFixed(2)}/day`, cost });
  }

  // Cold places: $0.66/hour
  if (allowances.coldPlaces) {
    const cost = weeklyPaidHours * 0.66;
    items.push({ name: 'Cold Places', detail: `${weeklyPaidHours.toFixed(1)}h × $0.66`, cost });
  }

  // Broken shift: $4.50/day, cap $22.49/week
  if (allowances.brokenShift) {
    const raw = workedShifts * 4.50;
    const capped = Math.min(raw, 22.49);
    const detail = raw > 22.49
      ? `${workedShifts} days × $4.50 = $${raw.toFixed(2)} → capped to $22.49`
      : `${workedShifts} days × $4.50`;
    items.push({ name: 'Broken Shift', detail, cost: capped });
  }

  const totalWeekly = items.reduce((sum, item) => sum + item.cost, 0);
  return { items, totalWeekly };
}
