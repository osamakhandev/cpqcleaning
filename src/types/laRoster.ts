export type DayOfWeek = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

export const ALL_DAYS: DayOfWeek[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export type OptimisationMode = "no-exceed" | "allow-exceed";

export interface RosterSettings {
  coreWorkDays: DayOfWeek[];
  minShiftHours: number;
  maxShiftHours: number;
  roundingIncrement: number;
  preferSingleStaff: boolean;
  optimisationMode: OptimisationMode;
  allowExceptionShift: boolean;
}

export const DEFAULT_ROSTER_SETTINGS: RosterSettings = {
  coreWorkDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  minShiftHours: 4.0,
  maxShiftHours: 4.0,
  roundingIncrement: 0.25,
  preferSingleStaff: true,
  optimisationMode: "no-exceed",
  allowExceptionShift: true,
};

export interface ShiftCell {
  hours: number;
  userEdited: boolean;
}

export interface RosterRow {
  label: string;
  shifts: Record<DayOfWeek, ShiftCell>;
}

export interface CoreRosterPlan {
  coreWeeklyHours: number;
  dailyAvg: number;
  dailyTargets: Record<DayOfWeek, number>;
  rows: RosterRow[];
  warnings: string[];
}

export type SupportShiftStyle = "even" | "front-load" | "single-day";

export interface SupportRoleSettings {
  roleName: string;
  workDays: DayOfWeek[];
  shiftStyle: SupportShiftStyle;
  maxShiftHours: number;
}

export interface SupportRolePlan {
  roleName: string;
  weeklyHours: number;
  settings: SupportRoleSettings;
  rows: RosterRow[];
}
