export type EmploymentType = 'full-time' | 'part-time' | 'casual';
export type OperatorLevel = 'level-1' | 'level-2' | 'level-3' | 'level-4' | 'level-5';
export type ServiceType = 'cleaning' | 'customer-service' | 'security' | 'maintenance' | 'landscape' | 'management';

export const SERVICE_LABELS: Record<ServiceType, string> = {
  'cleaning': 'Cleaning',
  'customer-service': 'Customer Service',
  'security': 'Security',
  'maintenance': 'Maintenance',
  'landscape': 'Landscape',
  'management': 'Management',
};

export interface SecurityAllowances {
  aviationAllowance: boolean;
  brokenShift: boolean;
  firstAid: boolean;
  firearm: boolean;
  supervisionBand: 'none' | '1-5' | '6-10' | '11-20' | '>20';
}

export const DEFAULT_SECURITY_ALLOWANCES: SecurityAllowances = {
  aviationAllowance: false,
  brokenShift: false,
  firstAid: false,
  firearm: false,
  supervisionBand: 'none',
};

export interface CleaningAllowances {
  brokenShift: boolean;
  coldPlaces: boolean;
  firstAid: boolean;
  heightBelow22: boolean;
  heightAbove22: boolean;
  hotPlaces46to54: boolean;
  hotPlacesAbove54: boolean;
  leadingHandBand: 'none' | '1-10' | '11-20' | '>20';
  refuseCollection: boolean;
  toiletCleaning: boolean;
  // Day selection for specific allowances
  toiletCleaningDayMode?: 'all' | 'select';
  toiletCleaningDays?: DayOfWeek[];
  refuseCollectionDayMode?: 'all' | 'select';
  refuseCollectionDays?: DayOfWeek[];
  firstAidDayMode?: 'all' | 'select';
  firstAidDays?: DayOfWeek[];
  leadingHandDayMode?: 'all' | 'select';
  leadingHandDays?: DayOfWeek[];
}

export const DEFAULT_DAY_OVERRIDES: DayOverrides<string> = {
  applyAll: true,
  overrideDays: [],
  dayValues: {},
};

export const DEFAULT_CLEANING_ALLOWANCES: CleaningAllowances = {
  brokenShift: false,
  coldPlaces: false,
  firstAid: false,
  heightBelow22: false,
  heightAbove22: false,
  hotPlaces46to54: false,
  hotPlacesAbove54: false,
  leadingHandBand: 'none',
  refuseCollection: false,
  toiletCleaning: false,
};

export interface DayOverrides<T> {
  applyAll: boolean;
  overrideDays: DayOfWeek[];
  dayValues: Partial<Record<DayOfWeek, T>>;
}

export interface ShiftTimeOverride {
  startTime: string;
  endTime: string;
}

/** Snapshot of LA-seeded values for fields that LA may seed but the user owns
 *  (Employment Type, Level, Default Division). If current value === snapshot,
 *  LA may continue to re-seed on sync. Once the user changes the field, the
 *  snapshot no longer matches and LA leaves it alone for that operator. */
export interface LaSeededSnapshot {
  employmentType?: EmploymentType;
  level?: OperatorLevel;
  defaultDivision?: string;
  /** Snapshot of the toiletCleaning allowance LA seeded on creation. While the
   *  current value matches this snapshot, LA may continue to re-seed it. Once
   *  the user toggles the checkbox, the snapshot no longer matches and LA
   *  leaves the field alone for that operator. */
  toiletCleaning?: boolean;
}

export type OperatorSource = "manual" | "labour-assessment";

export interface Operator {
  id: string;
  number: number;
  name: string;
  employmentType: EmploymentType;
  level: OperatorLevel;
  service: ServiceType;
  isFixedNights: boolean;
  defaultStartTime: string;
  defaultEndTime: string;
  workDays: DayOfWeek[];
  /** Origin of this operator. 'labour-assessment' rows are eligible for LA sync;
   *  'manual' (default) are never touched by LA. */
  source?: OperatorSource;
  /** Stable key identifying the LA scope this operator was generated from
   *  (e.g. "disc:el-123:0", "core:2", "wend:wdp-1"). Required for LA-managed. */
  laKey?: string;
  /** Snapshot of seed-only fields — see LaSeededSnapshot. */
  laSeeded?: LaSeededSnapshot;
  // Per-day shift time overrides (when toggle is ON)
  useShiftTimeOverrides?: boolean;
  shiftTimeOverrides?: Partial<Record<DayOfWeek, ShiftTimeOverride>>;
  // Casual: weeks per year for periodical services
  weeksPerYear?: number;
  securityAllowances?: SecurityAllowances;
  cleaningAllowances?: CleaningAllowances;
  // Division & Tasks defaults
  defaultDivision: string;
  divisionOverrides: DayOverrides<string>;
  defaultTasks: string;
  tasksOverrides: DayOverrides<string>;
}

export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface Segment {
  id: string;
  divisionId: string | null;
  task: string;
  minutes: number; // integer minutes
}

export interface ShiftEntry {
  startTime: string;
  endTime: string;
  division: string;
  tasks: string;
  segments?: Segment[];
}

export interface WeeklyRoster {
  operatorId: string;
  shifts: Record<DayOfWeek, ShiftEntry>;
}

export interface DayCalculation {
  day: DayOfWeek;
  startTime: string;
  endTime: string;
  startMin: number;
  endMin: number;
  coverageMin: number;
  coverageHours: number;
  paidMin: number;
  paidHours: number;
  hasBreak: boolean;
  isUnpaidBreak: boolean;
  breakStartMin: number;
  isValid: boolean;
  warnings: string[];
  isAutoCalculated: boolean;
  isAutoCalcStart: boolean;
  isAutoCalcEnd: boolean;
}

export interface OperatorCalculations {
  operatorId: string;
  days: DayCalculation[];
  weeklyPaidMin: number;
  weeklyPaidHours: number;
  monthlyPaidHours: number;
  yearlyPaidHours: number;
  warnings: string[];
}

export const DAYS_OF_WEEK: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export const DAY_LABELS: Record<DayOfWeek, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};
