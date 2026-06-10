import type { Segment } from '@/types/roster';

export interface AllocatedSegment {
  id: string;
  divisionId: string | null;
  task: string;
  minutes: number;
  paidHours: number;
  wageCostAllocated: number;
  allowanceAllocated: number;
  totalAllocated: number;
}

/**
 * Allocate a day's totals across segments.
 * If no segments → 100% to default division/task.
 * Reconciles rounding on the last segment.
 */
export function allocateDayToSegments(
  paidMinutesDay: number,
  wageCostDay: number,
  allowanceCostDay: number,
  segments: Segment[] | undefined,
  defaultDivision: string,
  defaultTask: string,
): AllocatedSegment[] {
  if (!segments || segments.length === 0) {
    return [{
      id: '__default__',
      divisionId: defaultDivision || null,
      task: defaultTask || '',
      minutes: paidMinutesDay,
      paidHours: paidMinutesDay / 60,
      wageCostAllocated: wageCostDay,
      allowanceAllocated: allowanceCostDay,
      totalAllocated: wageCostDay + allowanceCostDay,
    }];
  }

  if (paidMinutesDay <= 0) {
    return segments.map(seg => ({
      id: seg.id,
      divisionId: seg.divisionId,
      task: seg.task,
      minutes: seg.minutes,
      paidHours: 0,
      wageCostAllocated: 0,
      allowanceAllocated: 0,
      totalAllocated: 0,
    }));
  }

  const result: AllocatedSegment[] = [];
  let totalWageAllocated = 0;
  let totalAllowAllocated = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const share = seg.minutes / paidMinutesDay;
    const isLast = i === segments.length - 1;

    let wage: number;
    let allow: number;

    if (isLast) {
      // Remainder adjustment for exact reconciliation
      wage = wageCostDay - totalWageAllocated;
      allow = allowanceCostDay - totalAllowAllocated;
    } else {
      wage = wageCostDay * share;
      allow = allowanceCostDay * share;
      totalWageAllocated += wage;
      totalAllowAllocated += allow;
    }

    result.push({
      id: seg.id,
      divisionId: seg.divisionId,
      task: seg.task,
      minutes: seg.minutes,
      paidHours: seg.minutes / 60,
      wageCostAllocated: wage,
      allowanceAllocated: allow,
      totalAllocated: wage + allow,
    });
  }

  return result;
}

/**
 * Check if a day has multi-division segments.
 */
export function hasMultipleSegments(segments?: Segment[]): boolean {
  return !!segments && segments.length > 1;
}
