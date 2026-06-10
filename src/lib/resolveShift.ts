/**
 * Single source of truth for computing resolved shift times.
 * This function takes raw user inputs and computes the actual times used everywhere.
 */

import type { EmploymentType } from '@/types/roster';
import { normalizeTimeValue } from '@/lib/timeUtils';

const FULL_TIME_PAID_HOURS = 7.6;
const FULL_TIME_PAID_MIN = FULL_TIME_PAID_HOURS * 60; // 456 minutes
const BREAK_DURATION_MIN = 30;
const DAY_START_HOUR = 6; // 06:00
const DAY_END_HOUR = 18;  // 18:00

export interface ResolvedShift {
  startResolved: string;
  endResolved: string;
  isAutoCalcStart: boolean;
  isAutoCalcEnd: boolean;
  isComplete: boolean;
  isIncomplete: boolean;
  incompleteReason: string;
}

function timeToMinutes(time: string): number {
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

function minutesToTime(minutes: number): string {
  if (minutes < 0) return '';
  const hours = Math.floor(minutes / 60) % 24;
  const mins = Math.round(minutes % 60);
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

// Treat end == 00:00 as 24:00 of the SAME day (only when start > 0)
function normalizeEndMin(startMin: number, endMin: number): number {
  if (endMin === 0 && startMin > 0) return 1440;
  return endMin;
}

function shiftIncludesOutOfHours(startMin: number, endMin: number): boolean {
  const dayStartMin = DAY_START_HOUR * 60;  // 06:00 = 360
  const dayEndMin = DAY_END_HOUR * 60;      // 18:00 = 1080
  const adjEnd = normalizeEndMin(startMin, endMin);
  
  // If overnight shift (adjEnd < startMin), it definitely includes out-of-hours
  if (adjEnd < startMin) return true;
  
  // Check if any part is before 06:00 or after 18:00
  return startMin < dayStartMin || adjEnd > dayEndMin;
}

function autoCalculateEndTime(startTime: string): string {
  const startMin = timeToMinutes(startTime);
  if (startMin < 0) return '';
  
  // First assume day shift (unpaid break): coverage = 7.6 + 0.5 = 8.1 hours
  const dayCoverageMin = FULL_TIME_PAID_MIN + BREAK_DURATION_MIN; // 486 min
  let endMin = startMin + dayCoverageMin;
  
  // Re-check: if shift includes out-of-hours, switch to paid break (7.6 hours)
  if (shiftIncludesOutOfHours(startMin, endMin)) {
    const shortEnd = startMin + FULL_TIME_PAID_MIN; // 456 min
    // Only use the shorter shift if it STILL includes out-of-hours
    // Otherwise the break would be unpaid and we need the longer shift
    if (shiftIncludesOutOfHours(startMin, shortEnd)) {
      endMin = shortEnd;
    }
  }
  
  return minutesToTime(endMin);
}

function autoCalculateStartTime(endTime: string): string {
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
    // Only use the shorter shift if it STILL includes out-of-hours
    if (shiftIncludesOutOfHours(shortStart, endMin)) {
      startMin = shortStart;
    }
  }
  
  return minutesToTime(startMin);
}

/**
 * Resolves raw user inputs to actual shift times.
 * 
 * Rules:
 * - If both start_input and end_input are provided: use them directly
 * - If FT operator and only one input is provided: auto-calc the missing value
 * - If PT/Casual and one input is missing: treat as incomplete, show warning
 * - If neither input provided: empty shift (not rostered for that day)
 */
export function resolveShift(
  startInput: string,
  endInput: string,
  employmentType: EmploymentType
): ResolvedShift {
  // Normalize raw numeric inputs before processing
  const normStart = normalizeTimeValue(startInput || '');
  const normEnd = normalizeTimeValue(endInput || '');

  const result: ResolvedShift = {
    startResolved: '',
    endResolved: '',
    isAutoCalcStart: false,
    isAutoCalcEnd: false,
    isComplete: false,
    isIncomplete: false,
    incompleteReason: '',
  };

  const hasStart = !!normStart && normStart.includes(':');
  const hasEnd = !!normEnd && normEnd.includes(':');

  // Case 1: Neither provided - not rostered
  if (!hasStart && !hasEnd) {
    return result;
  }

  // Case 2: Both provided - use as-is
  if (hasStart && hasEnd) {
    result.startResolved = normStart;
    result.endResolved = normEnd;
    result.isComplete = true;
    return result;
  }

  // Case 3: Only one provided
  if (employmentType === 'full-time') {
    // FT: Auto-calculate the missing value
    if (hasStart && !hasEnd) {
      result.startResolved = normStart;
      result.endResolved = autoCalculateEndTime(normStart);
      result.isAutoCalcEnd = true;
      result.isComplete = !!result.endResolved;
    } else if (!hasStart && hasEnd) {
      result.startResolved = autoCalculateStartTime(normEnd);
      result.endResolved = normEnd;
      result.isAutoCalcStart = true;
      result.isComplete = !!result.startResolved;
    }
  } else {
    // PT/Casual: Incomplete shift
    result.startResolved = normStart || '';
    result.endResolved = normEnd || '';
    result.isIncomplete = true;
    result.incompleteReason = hasStart 
      ? 'End time is required for part-time/casual operators'
      : 'Start time is required for part-time/casual operators';
  }

  return result;
}
