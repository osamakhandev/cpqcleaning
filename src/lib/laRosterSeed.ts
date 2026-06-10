/**
 * Pure helpers for seeding Labour-Assessment-managed roster cells.
 *
 * Rules (see LA → Operators sync spec):
 *   - LA-managed operators must auto-seed their Weekly Roster cells from the
 *     operator's default template (start/end/division/tasks).
 *   - A field is considered "LA-controlled" while it is blank OR still equal to
 *     the previous LA target. As soon as the user types anything else into a
 *     cell, that field is preserved forever — LA must never overwrite it.
 *   - Multi-segment cells (cur.segments?.length > 0) are user-authored and are
 *     never touched.
 *   - Manual operators (source !== "labour-assessment") must never be reseeded
 *     by this helper. Callers filter the input accordingly.
 */
import { DAYS_OF_WEEK, type DayOfWeek, type ShiftEntry } from "@/types/roster";

const EMPTY_SHIFT: ShiftEntry = { startTime: "", endTime: "", division: "", tasks: "" };

export function blankShifts(): Record<DayOfWeek, ShiftEntry> {
  return {
    mon: { ...EMPTY_SHIFT },
    tue: { ...EMPTY_SHIFT },
    wed: { ...EMPTY_SHIFT },
    thu: { ...EMPTY_SHIFT },
    fri: { ...EMPTY_SHIFT },
    sat: { ...EMPTY_SHIFT },
    sun: { ...EMPTY_SHIFT },
  };
}

export interface SeedResult {
  shifts: Record<DayOfWeek, ShiftEntry>;
  changed: boolean;
}

/**
 * Re-seed one managed operator's weekly shifts.
 *
 * @param current      Current roster shifts for the operator (may be partial).
 * @param target       Desired template derived from operator defaults.
 * @param previous     Previous LA-applied template (used to detect user edits).
 */
export function seedManagedRosterShifts(
  current: Partial<Record<DayOfWeek, ShiftEntry>> | undefined,
  target: Record<DayOfWeek, ShiftEntry>,
  previous: Record<DayOfWeek, ShiftEntry>,
): SeedResult {
  const next: Record<DayOfWeek, ShiftEntry> = { ...blankShifts(), ...(current ?? {}) };
  let changed = false;

  for (const day of DAYS_OF_WEEK) {
    const cur = next[day] ?? { ...EMPTY_SHIFT };

    // Multi-segment cells are user-authored: never touch.
    if (cur.segments?.length) continue;

    const prev = previous[day] ?? EMPTY_SHIFT;
    const tgt = target[day] ?? EMPTY_SHIFT;

    const candidate: ShiftEntry = {
      startTime: cur.startTime === "" || cur.startTime === prev.startTime ? tgt.startTime : cur.startTime,
      endTime: cur.endTime === "" || cur.endTime === prev.endTime ? tgt.endTime : cur.endTime,
      division: cur.division === "" || cur.division === prev.division ? tgt.division : cur.division,
      tasks: cur.tasks === "" || cur.tasks === prev.tasks ? tgt.tasks : cur.tasks,
    };

    if (
      candidate.startTime !== cur.startTime ||
      candidate.endTime !== cur.endTime ||
      candidate.division !== cur.division ||
      candidate.tasks !== cur.tasks
    ) {
      next[day] = candidate;
      changed = true;
    }
  }

  return { shifts: next, changed };
}
