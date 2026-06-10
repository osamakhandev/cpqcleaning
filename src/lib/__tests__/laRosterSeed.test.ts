import { describe, it, expect } from "vitest";
import { seedManagedRosterShifts, blankShifts } from "@/lib/laRosterSeed";
import { DAYS_OF_WEEK, type DayOfWeek, type ShiftEntry } from "@/types/roster";

const SHIFT = (s: string, e: string, division = "Cleaning", tasks = "Night Clean"): ShiftEntry => ({
  startTime: s, endTime: e, division, tasks,
});

function template(workDays: DayOfWeek[], shift: ShiftEntry): Record<DayOfWeek, ShiftEntry> {
  const out = blankShifts();
  for (const d of workDays) out[d] = { ...shift };
  return out;
}

describe("seedManagedRosterShifts — auto-seed", () => {
  it("populates blank shifts for all LA workdays", () => {
    const target = template(["mon", "tue", "wed", "thu", "fri"], SHIFT("18:00", "22:00"));
    const prev = blankShifts();
    const { shifts, changed } = seedManagedRosterShifts(undefined, target, prev);
    expect(changed).toBe(true);
    for (const d of ["mon", "tue", "wed", "thu", "fri"] as DayOfWeek[]) {
      expect(shifts[d]).toEqual({ startTime: "18:00", endTime: "22:00", division: "Cleaning", tasks: "Night Clean" });
    }
    for (const d of ["sat", "sun"] as DayOfWeek[]) {
      expect(shifts[d]).toEqual({ startTime: "", endTime: "", division: "", tasks: "" });
    }
  });

  it("returns changed=false when shifts already match the target", () => {
    const target = template(["mon"], SHIFT("18:00", "22:00"));
    const prev = template(["mon"], SHIFT("18:00", "22:00"));
    const { changed } = seedManagedRosterShifts(target, target, prev);
    expect(changed).toBe(false);
  });

  it("updates a stale cell that still matches the previous LA template", () => {
    const prev = template(["mon"], SHIFT("18:00", "22:00"));
    const target = template(["mon"], SHIFT("19:00", "23:00"));
    const { shifts, changed } = seedManagedRosterShifts(prev, target, prev);
    expect(changed).toBe(true);
    expect(shifts.mon).toEqual(target.mon);
  });
});

describe("seedManagedRosterShifts — user edit protection", () => {
  it("never overwrites a user-edited start time", () => {
    const prev = template(["mon"], SHIFT("18:00", "22:00"));
    const userEdited = { ...prev, mon: { ...prev.mon, startTime: "17:30" } };
    const target = template(["mon"], SHIFT("19:00", "23:00"));
    const { shifts } = seedManagedRosterShifts(userEdited, target, prev);
    expect(shifts.mon.startTime).toBe("17:30");
    // other fields still matched the prev template, so they upgrade to target
    expect(shifts.mon.endTime).toBe("23:00");
  });

  it("preserves user edits across every field independently", () => {
    const prev = template(["mon"], SHIFT("18:00", "22:00", "Cleaning", "Night Clean"));
    const edited = {
      ...prev,
      mon: { startTime: "17:00", endTime: "21:00", division: "Front of House", tasks: "Detail" },
    };
    const target = template(["mon"], SHIFT("19:00", "23:00", "Maintenance", "Other"));
    const { shifts, changed } = seedManagedRosterShifts(edited, target, prev);
    expect(changed).toBe(false);
    expect(shifts.mon).toEqual(edited.mon);
  });

  it("does not touch segmented (split-shift) cells", () => {
    const prev = template(["mon"], SHIFT("18:00", "22:00"));
    const segmented: Record<DayOfWeek, ShiftEntry> = {
      ...prev,
      mon: { ...prev.mon, segments: [{ id: "s1", divisionId: null, task: "x", minutes: 60 }] },
    };
    const target = template(["mon"], SHIFT("19:00", "23:00"));
    const { shifts, changed } = seedManagedRosterShifts(segmented, target, prev);
    expect(changed).toBe(false);
    expect(shifts.mon).toBe(segmented.mon);
  });

  it("backfills only blank fields, preserves the rest", () => {
    const prev = template(["mon"], SHIFT("18:00", "22:00"));
    // user cleared end time only; start matches prev → eligible for re-seed
    const partial = { ...prev, mon: { ...prev.mon, endTime: "", division: "User Div" } };
    const target = template(["mon"], SHIFT("19:00", "23:00", "Cleaning", "Night Clean"));
    const { shifts } = seedManagedRosterShifts(partial, target, prev);
    expect(shifts.mon.startTime).toBe("19:00"); // start matched prev → upgraded
    expect(shifts.mon.endTime).toBe("23:00");   // was blank → seeded from target
    expect(shifts.mon.division).toBe("User Div"); // user-set → preserved
  });
});

describe("seedManagedRosterShifts — workday changes", () => {
  it("clears workdays that have been removed from the LA plan when they still match the previous template", () => {
    const prev = template(["mon", "tue"], SHIFT("18:00", "22:00"));
    const target = template(["mon"], SHIFT("18:00", "22:00")); // tue removed
    const { shifts, changed } = seedManagedRosterShifts(prev, target, prev);
    expect(changed).toBe(true);
    expect(shifts.tue).toEqual({ startTime: "", endTime: "", division: "", tasks: "" });
    expect(shifts.mon).toEqual(prev.mon);
  });

  it("retains user-entered values on a day LA no longer schedules (per-field)", () => {
    const prev = template(["mon", "tue"], SHIFT("18:00", "22:00"));
    // User changed every field on Tuesday — none match the previous LA template.
    const edited = { ...prev, tue: { startTime: "06:00", endTime: "10:00", division: "Day Crew", tasks: "Day Clean" } };
    const target = template(["mon"], SHIFT("18:00", "22:00")); // tue dropped from plan
    const { shifts } = seedManagedRosterShifts(edited, target, prev);
    // All four fields differ from prev → all preserved.
    expect(shifts.tue).toEqual(edited.tue);
  });

  it("only resets fields that still match the previous LA template, even when the day is dropped", () => {
    const prev = template(["mon", "tue"], SHIFT("18:00", "22:00", "Cleaning", "Night Clean"));
    // User changed only the times; division/tasks still match the prev template.
    const edited = { ...prev, tue: { startTime: "06:00", endTime: "10:00", division: "Cleaning", tasks: "Night Clean" } };
    const target = template(["mon"], SHIFT("18:00", "22:00")); // tue dropped from plan
    const { shifts } = seedManagedRosterShifts(edited, target, prev);
    expect(shifts.tue.startTime).toBe("06:00"); // user-changed → preserved
    expect(shifts.tue.endTime).toBe("10:00");   // user-changed → preserved
    expect(shifts.tue.division).toBe("");        // matched prev → cleared by LA
    expect(shifts.tue.tasks).toBe("");            // matched prev → cleared by LA
  });
});

describe("seedManagedRosterShifts — idempotence", () => {
  it("running twice with the same target is a no-op on the second pass", () => {
    const prev = blankShifts();
    const target = template(["mon", "wed", "fri"], SHIFT("18:00", "22:00"));
    const first = seedManagedRosterShifts(undefined, target, prev);
    const second = seedManagedRosterShifts(first.shifts, target, target);
    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
  });
});
