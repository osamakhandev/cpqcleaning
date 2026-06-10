import type { DayOfWeek, ServiceType, EmploymentType, OperatorLevel } from '@/types/roster';
import { lookupRate, type RateBand } from './rateData';
import { timeToMinutes, normalizeEndMin } from './rosterCalculations';
import { type WageHourlyRates, getWageRateForBand } from './wageSettings';

// ── Time boundaries ──────────────────────────────────────────────
const DAY_BAND_START = 6 * 60;   // 06:00
const DAY_BAND_END = 18 * 60;    // 18:00
const NIGHT_SHIFT_END = 8 * 60;  // 08:00

// ── Service costing mode ─────────────────────────────────────────
export type CostingMode = 'highest' | 'split' | 'wage';

export function getServiceCostingMode(service: ServiceType): CostingMode {
  if (service === 'cleaning' || service === 'customer-service') return 'highest';
  if (service === 'security' || service === 'landscape') return 'split';
  if (service === 'maintenance' || service === 'management') return 'wage';
  return 'highest';
}

// ── Helpers ──────────────────────────────────────────────────────
function getNextDay(day: DayOfWeek): DayOfWeek {
  const order: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  return order[(order.indexOf(day) + 1) % 7];
}

function isOvernight(startMin: number, endMin: number): boolean {
  return endMin < startMin;
}

function touchesHigherBand(startMin: number, endMin: number): boolean {
  if (isOvernight(startMin, endMin)) return true;
  return startMin < DAY_BAND_START || endMin > DAY_BAND_END;
}

function qualifiesForPermanentNight(startMin: number, endMin: number, isFixedNights: boolean): boolean {
  if (!isFixedNights) return false;
  const endsBeforeOrAt8AM = endMin <= NIGHT_SHIFT_END;
  const crosses = isOvernight(startMin, endMin);
  const startsLateEndsEarly = startMin >= 20 * 60 && endMin <= NIGHT_SHIFT_END;
  return endsBeforeOrAt8AM && (crosses || startsLateEndsEarly);
}

// ══════════════════════════════════════════════════════════════════
// A) HIGHEST RATE WINS — Cleaning & Customer Service
//    Cleaning uses WKDAY_PENALTY (starts before 06:00 OR finishes after 18:00)
// ══════════════════════════════════════════════════════════════════

export function determineRateBand(
  day: DayOfWeek,
  startTime: string,
  endTime: string,
  isFixedNights: boolean
): RateBand | null {
  if (!startTime || !endTime) return null;
  const startMinRaw = timeToMinutes(startTime);
  const endMinRaw = timeToMinutes(endTime);
  if (startMinRaw < 0 || endMinRaw < 0) return null;

  // Normalise end == 00:00 to 24:00 of same day (not next-day overnight)
  const startMin = startMinRaw;
  const endMin = normalizeEndMin(startMinRaw, endMinRaw);

  const overnight = isOvernight(startMin, endMin);
  const nextDay = getNextDay(day);

  if (overnight) {
    if (nextDay === 'sun') return 'SUN_FLAT';
    if (nextDay === 'sat') return 'SAT_FLAT';
    if (day === 'sun') return 'SUN_FLAT';
    if (day === 'sat') return 'SUN_FLAT';
    if (qualifiesForPermanentNight(startMin, endMin, isFixedNights)) return 'WKDAY_PERM_NIGHT';
    return 'WKDAY_PENALTY';
  }

  if (day === 'sat') return 'SAT_FLAT';
  if (day === 'sun') return 'SUN_FLAT';
  if (qualifiesForPermanentNight(startMin, endMin, isFixedNights)) return 'WKDAY_PERM_NIGHT';
  if (touchesHigherBand(startMin, endMin)) return 'WKDAY_PENALTY';
  return 'WKDAY_DAY';
}

// ══════════════════════════════════════════════════════════════════
// B) SPLIT-BAND LOGIC — Security & Landscape
// ══════════════════════════════════════════════════════════════════

export interface BandSegment {
  rateBand: RateBand;
  minutes: number;
  hours: number;
}

function weekdayBandAt(min: number): RateBand {
  if (min < DAY_BAND_START) return 'WKDAY_EMAFT';
  if (min < DAY_BAND_END) return 'WKDAY_DAY';
  return 'WKDAY_EMAFT';
}

// Cleaning-specific: weekday band uses WKDAY_PENALTY instead of WKDAY_EMAFT
function cleaningWeekdayBandAt(min: number): RateBand {
  if (min < DAY_BAND_START) return 'WKDAY_PENALTY';
  if (min < DAY_BAND_END) return 'WKDAY_DAY';
  return 'WKDAY_PENALTY';
}

function splitSameDayMinutes(day: DayOfWeek, fromMin: number, toMin: number): BandSegment[] {
  if (fromMin >= toMin) return [];

  if (day === 'sat') return [{ rateBand: 'SAT_FLAT', minutes: toMin - fromMin, hours: (toMin - fromMin) / 60 }];
  if (day === 'sun') return [{ rateBand: 'SUN_FLAT', minutes: toMin - fromMin, hours: (toMin - fromMin) / 60 }];

  // Weekday: split at 06:00 and 18:00 boundaries
  const boundaries = [DAY_BAND_START, DAY_BAND_END];
  const segments: BandSegment[] = [];
  let cursor = fromMin;

  for (const boundary of boundaries) {
    if (boundary <= cursor || boundary >= toMin) continue;
    const mins = boundary - cursor;
    segments.push({ rateBand: weekdayBandAt(cursor), minutes: mins, hours: mins / 60 });
    cursor = boundary;
  }
  // Remaining
  const remaining = toMin - cursor;
  if (remaining > 0) {
    segments.push({ rateBand: weekdayBandAt(cursor), minutes: remaining, hours: remaining / 60 });
  }

  return mergeSegments(segments);
}

function mergeSegments(segments: BandSegment[]): BandSegment[] {
  if (segments.length <= 1) return segments;
  const merged: BandSegment[] = [segments[0]];
  for (let i = 1; i < segments.length; i++) {
    const last = merged[merged.length - 1];
    if (last.rateBand === segments[i].rateBand) {
      last.minutes += segments[i].minutes;
      last.hours += segments[i].hours;
    } else {
      merged.push({ ...segments[i] });
    }
  }
  return merged;
}

export function splitShiftIntoBands(
  day: DayOfWeek,
  startMin: number,
  endMin: number
): BandSegment[] {
  if (!isOvernight(startMin, endMin)) {
    return splitSameDayMinutes(day, startMin, endMin);
  }
  // Overnight: split at midnight
  const part1 = splitSameDayMinutes(day, startMin, 1440);
  const part2 = splitSameDayMinutes(getNextDay(day), 0, endMin);
  return mergeSegments([...part1, ...part2]);
}

// ══════════════════════════════════════════════════════════════════
// Unified ShiftCost interface
// ══════════════════════════════════════════════════════════════════

export interface CostSegmentResult {
  rateBand: RateBand;
  paidHours: number;
  hourlyRate: number | null;
  cost: number | null;
}

export interface ShiftCost {
  rateBand: RateBand | null;       // primary band (highest or first)
  hourlyRate: number | null;       // for single-band; null for split
  paidHours: number;
  cost: number | null;             // total cost
  hasRate: boolean;
  isSplit: boolean;
  segments: CostSegmentResult[];   // empty for highest-rate-wins
  costingMode: CostingMode;
}

const EMPTY_COST: ShiftCost = {
  rateBand: null, hourlyRate: null, paidHours: 0, cost: null,
  hasRate: false, isSplit: false, segments: [], costingMode: 'highest',
};

// ── Main entry point ─────────────────────────────────────────────

export function calculateShiftCost(
  day: DayOfWeek,
  startTime: string,
  endTime: string,
  paidHours: number,
  service: ServiceType,
  employmentType: EmploymentType,
  level: OperatorLevel,
  isFixedNights: boolean,
  wageRates?: WageHourlyRates | null
): ShiftCost {
  if (!startTime || !endTime || paidHours <= 0) {
    return { ...EMPTY_COST, paidHours, costingMode: getServiceCostingMode(service) };
  }

  const startMinRaw = timeToMinutes(startTime);
  const endMinRaw = timeToMinutes(endTime);
  if (startMinRaw < 0 || endMinRaw < 0) {
    return { ...EMPTY_COST, paidHours, costingMode: getServiceCostingMode(service) };
  }

  // Normalise end == 00:00 to 24:00 of same day (not next-day overnight)
  const startMin = startMinRaw;
  const endMin = normalizeEndMin(startMinRaw, endMinRaw);

  const mode = getServiceCostingMode(service);

  if (mode === 'highest') {
    return calcHighestRate(day, startTime, endTime, paidHours, service, employmentType, level, isFixedNights);
  }

  if (mode === 'wage') {
    return calcWageBased(day, startMin, endMin, paidHours, wageRates ?? null);
  }

  // mode === 'split'
  return calcSplitBand(day, startMin, endMin, paidHours, service, employmentType, level);
}

// ── Cleaning / Customer Service ──────────────────────────────────

function calcHighestRate(
  day: DayOfWeek, startTime: string, endTime: string, paidHours: number,
  service: ServiceType, employmentType: EmploymentType, level: OperatorLevel, isFixedNights: boolean
): ShiftCost {
  const rateBand = determineRateBand(day, startTime, endTime, isFixedNights);
  if (!rateBand) return { ...EMPTY_COST, paidHours, costingMode: 'highest' };

  const hourlyRate = lookupRate(service, employmentType, level, rateBand);
  if (hourlyRate === null) {
    return { rateBand, hourlyRate: null, paidHours, cost: null, hasRate: false, isSplit: false, segments: [], costingMode: 'highest' };
  }
  return {
    rateBand, hourlyRate, paidHours, cost: hourlyRate * paidHours,
    hasRate: true, isSplit: false, segments: [], costingMode: 'highest',
  };
}

// ── Security / Landscape ─────────────────────────────────────────

function calcSplitBand(
  day: DayOfWeek, startMin: number, endMin: number, paidHours: number,
  service: ServiceType, employmentType: EmploymentType, level: OperatorLevel
): ShiftCost {
  const rawSegments = splitShiftIntoBands(day, startMin, endMin);
  const totalRawMin = rawSegments.reduce((s, seg) => s + seg.minutes, 0);
  if (totalRawMin <= 0) return { ...EMPTY_COST, paidHours, costingMode: 'split' };

  let totalCost = 0;
  let allHaveRates = true;
  const segments: CostSegmentResult[] = rawSegments.map(seg => {
    const segPaidHours = paidHours * (seg.minutes / totalRawMin);
    const rate = lookupRate(service, employmentType, level, seg.rateBand);
    if (rate === null) allHaveRates = false;
    const segCost = rate !== null ? rate * segPaidHours : null;
    if (segCost !== null) totalCost += segCost;
    return { rateBand: seg.rateBand, paidHours: segPaidHours, hourlyRate: rate, cost: segCost };
  });

  const primaryBand = rawSegments.length > 0 ? rawSegments[0].rateBand : null;

  return {
    rateBand: primaryBand,
    hourlyRate: segments.length === 1 ? segments[0].hourlyRate : null,
    paidHours,
    cost: allHaveRates ? totalCost : null,
    hasRate: allHaveRates,
    isSplit: segments.length > 1,
    segments,
    costingMode: 'split',
  };
}

// ── Maintenance / Management ─────────────────────────────────────

function calcWageBased(
  day: DayOfWeek, startMin: number, endMin: number, paidHours: number,
  wageRates: WageHourlyRates | null
): ShiftCost {
  if (!wageRates || wageRates.base <= 0) {
    return { ...EMPTY_COST, paidHours, costingMode: 'wage', rateBand: null, hasRate: false };
  }

  const rawSegments = splitShiftIntoBands(day, startMin, endMin);
  const totalRawMin = rawSegments.reduce((s, seg) => s + seg.minutes, 0);
  if (totalRawMin <= 0) return { ...EMPTY_COST, paidHours, costingMode: 'wage' };

  let totalCost = 0;
  const segments: CostSegmentResult[] = rawSegments.map(seg => {
    const segPaidHours = paidHours * (seg.minutes / totalRawMin);
    const rate = getWageRateForBand(wageRates, seg.rateBand);
    const segCost = rate * segPaidHours;
    totalCost += segCost;
    return { rateBand: seg.rateBand, paidHours: segPaidHours, hourlyRate: rate, cost: segCost };
  });

  const primaryBand = rawSegments.length > 0 ? rawSegments[0].rateBand : null;

  return {
    rateBand: primaryBand,
    hourlyRate: segments.length === 1 ? segments[0].hourlyRate : null,
    paidHours,
    cost: totalCost,
    hasRate: true,
    isSplit: segments.length > 1,
    segments,
    costingMode: 'wage',
  };
}

// ══════════════════════════════════════════════════════════════════
// Formatting
// ══════════════════════════════════════════════════════════════════

export function formatCurrency(amount: number | null): string {
  if (amount === null) return '—';
  return '$' + amount.toLocaleString('en-AU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
