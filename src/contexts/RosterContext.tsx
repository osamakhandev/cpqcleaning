import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import {
  type Operator,
  type WeeklyRoster,
  type DayOfWeek,
  type ShiftEntry,
  type ServiceType,
  type LaSeededSnapshot,
  type OperatorSource,
  type CleaningAllowances,
  DAYS_OF_WEEK,
  DEFAULT_CLEANING_ALLOWANCES,
  EmploymentType,
  OperatorLevel,
} from "@/types/roster";
import type { LaOperatorSpec } from "@/lib/laAutoRoster";
import { normalizeTimeValue } from "@/lib/timeUtils";
import { seedManagedRosterShifts } from "@/lib/laRosterSeed";
import { invalidateDivisionsCache } from "@/components/DivisionsSettings";

const STORAGE_KEY = "cpq-roster-data";
const SCENARIOS_KEY = "cpq-scenarios";
const ACTIVE_SCENARIO_KEY = "cpq-active-scenario";

interface RosterStore {
  operators: Operator[];
  rosters: WeeklyRoster[];
}

interface Scenario {
  id: string;
  name: string;
  createdAt: string;
  data: RosterStore;
  wageSettings?: any;
  serviceColors?: any;
  jobDetails?: { jobName: string; jobState: string };
  divisions?: string[];
  taskLibrary?: string[];
}

interface ScenarioMeta {
  scenarios: Scenario[];
  defaultScenarioId: string | null;
}

const loadScenarioMeta = (): ScenarioMeta => {
  try {
    const stored = localStorage.getItem(SCENARIOS_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return { scenarios: [], defaultScenarioId: null };
};

const saveScenarioMeta = (meta: ScenarioMeta) => {
  localStorage.setItem(SCENARIOS_KEY, JSON.stringify(meta));
};

const getStoredShiftTimesForDay = (
  operator: Pick<Operator, "defaultStartTime" | "defaultEndTime" | "useShiftTimeOverrides" | "shiftTimeOverrides">,
  day: DayOfWeek,
): Pick<ShiftEntry, "startTime" | "endTime"> => {
  const defaultStartTime = operator.defaultStartTime ?? "";
  const defaultEndTime = operator.defaultEndTime ?? "";

  if (!operator.useShiftTimeOverrides) {
    return { startTime: defaultStartTime, endTime: defaultEndTime };
  }

  const override = operator.shiftTimeOverrides?.[day];
  if (!override) {
    return { startTime: defaultStartTime, endTime: defaultEndTime };
  }

  const overrideStartTime = override.startTime ?? "";
  const overrideEndTime = override.endTime ?? "";
  const hasAnyExplicitOverride = overrideStartTime !== "" || overrideEndTime !== "";

  if (!hasAnyExplicitOverride) {
    return { startTime: defaultStartTime, endTime: defaultEndTime };
  }

  return {
    startTime: overrideStartTime,
    endTime: overrideEndTime,
  };
};

const createShiftsFromOperator = (
  operator: Pick<Operator, "workDays" | "defaultStartTime" | "defaultEndTime" | "useShiftTimeOverrides" | "shiftTimeOverrides" | "defaultDivision" | "divisionOverrides" | "defaultTasks" | "tasksOverrides">,
): Record<DayOfWeek, ShiftEntry> => {
  const shifts: Record<DayOfWeek, ShiftEntry> = {
    mon: { startTime: "", endTime: "", division: "", tasks: "" },
    tue: { startTime: "", endTime: "", division: "", tasks: "" },
    wed: { startTime: "", endTime: "", division: "", tasks: "" },
    thu: { startTime: "", endTime: "", division: "", tasks: "" },
    fri: { startTime: "", endTime: "", division: "", tasks: "" },
    sat: { startTime: "", endTime: "", division: "", tasks: "" },
    sun: { startTime: "", endTime: "", division: "", tasks: "" },
  };

  const workDays = operator.workDays ?? ["mon", "tue", "wed", "thu", "fri"];

  for (const day of workDays) {
    const { startTime, endTime } = getStoredShiftTimesForDay(operator, day);

    // Resolve division
    let division = operator.defaultDivision ?? "";
    if (operator.divisionOverrides && !operator.divisionOverrides.applyAll && operator.divisionOverrides.dayValues[day] !== undefined) {
      division = operator.divisionOverrides.dayValues[day] ?? division;
    }

    // Resolve tasks
    let tasks = operator.defaultTasks ?? "";
    if (operator.tasksOverrides && !operator.tasksOverrides.applyAll && operator.tasksOverrides.dayValues[day] !== undefined) {
      tasks = operator.tasksOverrides.dayValues[day] ?? tasks;
    }

    shifts[day] = { startTime, endTime, division, tasks };
  }

  return shifts;
};

const normalizeEmploymentType = (value: unknown): EmploymentType => {
  if (value === "full-time" || value === "part-time" || value === "casual") return value;
  if (value === "Full Time") return "full-time";
  if (value === "Part Time") return "part-time";
  if (value === "Casual") return "casual";
  return "full-time";
};

const normalizeLevel = (value: unknown): OperatorLevel => {
  if (value === "level-1" || value === "level-2" || value === "level-3" || value === "level-4" || value === "level-5") return value;
  if (value === "Level 1") return "level-1";
  if (value === "Level 2") return "level-2";
  if (value === "Level 3") return "level-3";
  if (value === "Level 4") return "level-4";
  if (value === "Level 5") return "level-5";
  return "level-1";
};

const normalizeService = (value: unknown): ServiceType => {
  if (
    value === "cleaning" ||
    value === "customer-service" ||
    value === "security" ||
    value === "maintenance" ||
    value === "landscape" ||
    value === "management"
  ) {
    return value;
  }

  // Back-compat: old stored label forms
  if (value === "Cleaning") return "cleaning";
  if (value === "Customer Service" || value === "Customer service" || value === "customer service") {
    return "customer-service";
  }

  return "cleaning";
};

const DEFAULT_OVERRIDES = { applyAll: true, overrideDays: [] as DayOfWeek[], dayValues: {} };

const normalizeOperator = (op: any): Operator => {
  return {
    id: String(op?.id ?? crypto.randomUUID()),
    number: typeof op?.number === "number" ? op.number : 1,
    name: String(op?.name ?? ""),
    employmentType: normalizeEmploymentType(op?.employmentType),
    level: normalizeLevel(op?.level),
    service: normalizeService(op?.service),
    isFixedNights: Boolean(op?.isFixedNights),
    defaultStartTime: String(op?.defaultStartTime ?? ""),
    defaultEndTime: String(op?.defaultEndTime ?? ""),
    workDays: Array.isArray(op?.workDays) ? op.workDays : ["mon", "tue", "wed", "thu", "fri"],
    source: (op?.source === "labour-assessment" ? "labour-assessment" : "manual") as OperatorSource,
    laKey: typeof op?.laKey === "string" ? op.laKey : undefined,
    laSeeded: op?.laSeeded ?? undefined,
    useShiftTimeOverrides: Boolean(op?.useShiftTimeOverrides),
    shiftTimeOverrides: op?.shiftTimeOverrides ?? {},
    weeksPerYear: typeof op?.weeksPerYear === "number" ? op.weeksPerYear : 52.14,
    defaultDivision: String(op?.defaultDivision ?? ""),
    divisionOverrides: op?.divisionOverrides ?? { ...DEFAULT_OVERRIDES },
    defaultTasks: String(op?.defaultTasks ?? ""),
    tasksOverrides: op?.tasksOverrides ?? { ...DEFAULT_OVERRIDES },
    ...(op?.securityAllowances ? { securityAllowances: op.securityAllowances } : {}),
    ...(op?.cleaningAllowances ? { cleaningAllowances: op.cleaningAllowances } : {}),
  };
};

const normalizeRosterTimes = (rosters: WeeklyRoster[]): WeeklyRoster[] => {
  return rosters.map(roster => ({
    ...roster,
    shifts: Object.fromEntries(
      DAYS_OF_WEEK.map(day => [day, {
        ...roster.shifts[day],
        startTime: normalizeTimeValue(roster.shifts[day]?.startTime || ''),
        endTime: normalizeTimeValue(roster.shifts[day]?.endTime || ''),
      }])
    ) as Record<DayOfWeek, ShiftEntry>,
  }));
};

const loadFromStorage = (): RosterStore => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      const rawOperators = Array.isArray(parsed?.operators) ? parsed.operators : [];
      const rawRosters = Array.isArray(parsed?.rosters) ? parsed.rosters : [];
      return {
        operators: rawOperators.map(normalizeOperator),
        rosters: normalizeRosterTimes(rawRosters),
      };
    }
  } catch (e) {
    console.error("Failed to load roster data:", e);
  }
  return { operators: [], rosters: [] };
};

const saveToStorage = (data: RosterStore) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error("Failed to save roster data:", e);
  }
};

const upsertRosterForOperator = (
  rosters: WeeklyRoster[],
  operator: Pick<Operator, "id" | "workDays" | "defaultStartTime" | "defaultEndTime" | "useShiftTimeOverrides" | "shiftTimeOverrides" | "defaultDivision" | "divisionOverrides" | "defaultTasks" | "tasksOverrides">,
): WeeklyRoster[] => {
  const desired: WeeklyRoster = {
    operatorId: operator.id,
    shifts: createShiftsFromOperator(operator),
  };

  const idx = rosters.findIndex((r) => r.operatorId === operator.id);
  if (idx === -1) return [...rosters, desired];

  // If a roster exists, keep existing shifts unless it's clearly missing/invalid.
  const existing = rosters[idx];
  if (!existing?.shifts) {
    const copy = rosters.slice();
    copy[idx] = desired;
    return copy;
  }

  return rosters;
};

const ensureRostersForOperators = (store: RosterStore): RosterStore => {
  let nextRosters = store.rosters;
  for (const op of store.operators) {
    nextRosters = upsertRosterForOperator(nextRosters, op);
  }
  return { operators: store.operators, rosters: nextRosters };
};

interface RosterContextValue {
  operators: Operator[];
  rosters: WeeklyRoster[];
  isLoaded: boolean;
  addOperator: (
    name: string,
    employmentType: EmploymentType,
    level: OperatorLevel,
    service: ServiceType,
    isFixedNights: boolean,
    defaultStartTime?: string,
    defaultEndTime?: string,
    workDays?: DayOfWeek[],
  ) => Operator;
  updateOperator: (id: string, updates: Partial<Omit<Operator, "id" | "number">>) => void;
  deleteOperator: (id: string) => void;
  updateShift: (operatorId: string, day: DayOfWeek, updates: Partial<ShiftEntry>) => void;
  getRoster: (operatorId: string) => WeeklyRoster | undefined;
  getOperator: (id: string) => Operator | undefined;
  duplicateOperator: (sourceId: string) => Operator | null;
  copyRoster: (sourceId: string, targetIds: string[]) => void;
  duplicateOperatorWithRoster: (sourceId: string) => Operator | null;
  // Task library
  taskLibrary: string[];
  addTaskToLibrary: (task: string) => void;
  deleteTaskFromLibrary: (task: string) => void;
  // Scenario management
  scenarios: Scenario[];
  activeScenarioId: string | null;
  saveScenario: (name: string) => string;
  loadScenario: (id: string) => void;
  deleteScenario: (id: string) => void;
  renameScenario: (id: string, name: string) => void;
  duplicateScenario: (id: string) => string;
  setDefaultScenario: (id: string | null) => void;
  defaultScenarioId: string | null;
  exportScenario: (id: string) => string;
  importScenario: (json: string) => string | null;
  clearAllOperators: () => { operators: Operator[]; rosters: WeeklyRoster[] };
  restoreOperators: (backup: { operators: Operator[]; rosters: WeeklyRoster[] }) => void;
  // ── Labour Assessment sync ──
  /** Diff-apply an LA plan: update matching managed operators in place,
   *  remove managed operators no longer in the plan, create new ones for new
   *  keys. Manual operators are never touched. When `frozen` is true, no
   *  changes are written. */
  applyLaPlan: (plan: LaOperatorSpec[], frozen: boolean) => void;
  /** Convert a single LA-managed operator to manual. */
  detachLaOperator: (id: string) => void;
  /** Convert ALL LA-managed operators to manual (Freeze LA Roster). */
  detachAllLaOperators: () => number;
  /** Hard-delete all LA-managed operators (used by Regenerate before next apply). */
  removeAllLaOperators: () => void;
}

const RosterContext = createContext<RosterContextValue | null>(null);

export function RosterProvider({ children }: { children: ReactNode }) {
  const [operators, setOperatorsRaw] = useState<Operator[]>([]);
  const [rosters, setRostersRaw] = useState<WeeklyRoster[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [defaultScenarioId, setDefaultScenarioIdState] = useState<string | null>(null);
  const [taskLibrary, setTaskLibrary] = useState<string[]>([]);

  const operatorsRef = useRef<Operator[]>([]);
  const rostersRef = useRef<WeeklyRoster[]>([]);

  // Synchronous-ref-updating wrappers so refs are always current
  const setOperators: typeof setOperatorsRaw = (action) => {
    setOperatorsRaw((prev) => {
      const next = typeof action === "function" ? action(prev) : action;
      operatorsRef.current = next;
      return next;
    });
  };
  const setRosters: typeof setRostersRaw = (action) => {
    setRostersRaw((prev) => {
      const next = typeof action === "function" ? action(prev) : action;
      rostersRef.current = next;
      return next;
    });
  };

  // Load from storage on mount
  useEffect(() => {
    const meta = loadScenarioMeta();
    setScenarios(meta.scenarios);
    setDefaultScenarioIdState(meta.defaultScenarioId);

    // If there's a default scenario, load it; otherwise load current working data
    if (meta.defaultScenarioId) {
      const defaultScenario = meta.scenarios.find(s => s.id === meta.defaultScenarioId);
      if (defaultScenario) {
        const store = ensureRostersForOperators({
          operators: defaultScenario.data.operators.map(normalizeOperator),
          rosters: normalizeRosterTimes(defaultScenario.data.rosters),
        });
        setOperators(store.operators);
        setRosters(store.rosters);
        if (defaultScenario.wageSettings) {
          localStorage.setItem('cpq-wage-settings', JSON.stringify(defaultScenario.wageSettings));
        }
        if (defaultScenario.serviceColors) {
          localStorage.setItem('cpq-service-colors', JSON.stringify(defaultScenario.serviceColors));
        }
        if (defaultScenario.jobDetails) {
          localStorage.setItem('cpq-job-details', JSON.stringify(defaultScenario.jobDetails));
        }
        setTaskLibrary(defaultScenario.taskLibrary || []);
        localStorage.setItem('cpq-task-library', JSON.stringify(defaultScenario.taskLibrary || []));
        setActiveScenarioId(meta.defaultScenarioId);
        setIsLoaded(true);
        return;
      }
    }

    const data = ensureRostersForOperators(loadFromStorage());
    setOperators(data.operators);
    setRosters(data.rosters);
    // Load task library from localStorage
    try {
      const storedTasks = JSON.parse(localStorage.getItem('cpq-task-library') || '[]');
      setTaskLibrary(Array.isArray(storedTasks) ? storedTasks : []);
    } catch { setTaskLibrary([]); }
    setIsLoaded(true);
  }, []);

  // Save to storage on changes
  useEffect(() => {
    if (isLoaded) {
      saveToStorage({ operators, rosters });
    }
  }, [operators, rosters, isLoaded]);

  const getNextOperatorNumber = useCallback(() => {
    if (operatorsRef.current.length === 0) return 1;
    return Math.max(...operatorsRef.current.map((o) => o.number)) + 1;
  }, []);

  const addOperator = useCallback(
    (
      name: string,
      employmentType: EmploymentType,
      level: OperatorLevel,
      service: ServiceType = "cleaning",
      isFixedNights: boolean = false,
      defaultStartTime: string = "",
      defaultEndTime: string = "",
      workDays: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri"],
    ) => {
      const id = crypto.randomUUID();
      const number = getNextOperatorNumber();

      const newOperator: Operator = {
        id,
        number,
        name,
        employmentType,
        level,
        service,
        isFixedNights,
        defaultStartTime,
        defaultEndTime,
        workDays,
        defaultDivision: "",
        divisionOverrides: { ...DEFAULT_OVERRIDES },
        defaultTasks: "",
        tasksOverrides: { ...DEFAULT_OVERRIDES },
      };

      setOperators((prev) => [...prev, newOperator]);
      // Add a blank roster (no shifts) — shifts are only populated via "Duplicate with shifts"
      const blankShifts: Record<DayOfWeek, ShiftEntry> = {
        mon: { startTime: "", endTime: "", division: "", tasks: "" },
        tue: { startTime: "", endTime: "", division: "", tasks: "" },
        wed: { startTime: "", endTime: "", division: "", tasks: "" },
        thu: { startTime: "", endTime: "", division: "", tasks: "" },
        fri: { startTime: "", endTime: "", division: "", tasks: "" },
        sat: { startTime: "", endTime: "", division: "", tasks: "" },
        sun: { startTime: "", endTime: "", division: "", tasks: "" },
      };
      setRosters((prev) => {
        const idx = prev.findIndex((r) => r.operatorId === id);
        if (idx === -1) return [...prev, { operatorId: id, shifts: blankShifts }];
        const copy = prev.slice();
        copy[idx] = { operatorId: id, shifts: blankShifts };
        return copy;
      });

      return newOperator;
    },
    [getNextOperatorNumber],
  );

  const updateOperator = useCallback(
    (id: string, updates: Partial<Omit<Operator, "id" | "number">>) => {
      // Strip undefined values so they don't overwrite existing data
      const cleanUpdates: Record<string, any> = {};
      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) cleanUpdates[key] = value;
      }

      const current = operatorsRef.current.find((op) => op.id === id);
      const merged: Operator = {
        ...(current ?? normalizeOperator({})),
        id,
        ...cleanUpdates,
      } as Operator;

      setOperators((prev) => prev.map((op) => (op.id === id ? merged : op)));

      // Regenerate all roster-controlled fields from the operator profile so
      // Roster Details and Weekly Roster always read the same saved data.
      const newShifts = createShiftsFromOperator(merged);
      setRosters((prev) => {
        const idx = prev.findIndex((r) => r.operatorId === id);
        if (idx === -1) return [...prev, { operatorId: id, shifts: newShifts }];

        const copy = prev.slice();
        const oldShifts = copy[idx].shifts;
        const syncedShifts = { ...newShifts };

        for (const day of DAYS_OF_WEEK) {
          const oldShift = oldShifts[day];
          if (!oldShift?.segments) continue;
          syncedShifts[day] = {
            ...syncedShifts[day],
            segments: oldShift.segments,
          };
        }

        copy[idx] = { operatorId: id, shifts: syncedShifts };
        return copy;
      });
    },
    [],
  );

  const deleteOperator = useCallback((id: string) => {
    setOperators((prev) => {
      // Filter out the deleted operator
      const remaining = prev.filter((op) => op.id !== id);
      // Sort by current number to maintain order, then reassign sequential numbers
      const sorted = [...remaining].sort((a, b) => a.number - b.number);
      return sorted.map((op, index) => ({
        ...op,
        number: index + 1,
      }));
    });
    setRosters((prev) => prev.filter((r) => r.operatorId !== id));
  }, []);

  const clearAllOperators = useCallback(() => {
    const backup = { operators: [...operatorsRef.current], rosters: [...rostersRef.current] };
    setOperators([]);
    setRosters([]);
    return backup;
  }, []);

  const restoreOperators = useCallback((backup: { operators: Operator[]; rosters: WeeklyRoster[] }) => {
    setOperators(backup.operators);
    setRosters(backup.rosters);
  }, []);

  const updateShift = useCallback(
    (operatorId: string, day: DayOfWeek, updates: Partial<ShiftEntry>) => {
      const normalizedUpdates = { ...updates };
      if (normalizedUpdates.startTime !== undefined) {
        normalizedUpdates.startTime = normalizeTimeValue(normalizedUpdates.startTime);
      }
      if (normalizedUpdates.endTime !== undefined) {
        normalizedUpdates.endTime = normalizeTimeValue(normalizedUpdates.endTime);
      }

      const hasTimeUpdate = normalizedUpdates.startTime !== undefined || normalizedUpdates.endTime !== undefined;

      setRosters((prev) =>
        prev.map((roster) => {
          if (roster.operatorId !== operatorId) return roster;

          const currentShift = roster.shifts[day] ?? { startTime: "", endTime: "", division: "", tasks: "" };
          const nextShift = {
            ...currentShift,
            ...normalizedUpdates,
          };

          const clearedShift = hasTimeUpdate && nextShift.startTime === "" && nextShift.endTime === ""
            ? { startTime: "", endTime: "", division: "", tasks: "" }
            : nextShift;

          return {
            ...roster,
            shifts: {
              ...roster.shifts,
              [day]: clearedShift,
            },
          };
        }),
      );

      if (normalizedUpdates.division !== undefined || normalizedUpdates.tasks !== undefined || hasTimeUpdate) {
        setOperators((prev) =>
          prev.map((op) => {
            if (op.id !== operatorId) return op;
            const updated = { ...op };

            if (hasTimeUpdate) {
              const currentRoster = rostersRef.current.find((r) => r.operatorId === operatorId);
              const currentShift = currentRoster?.shifts[day] ?? { startTime: "", endTime: "", division: "", tasks: "" };
              const nextStartTime = normalizedUpdates.startTime !== undefined ? normalizedUpdates.startTime : currentShift.startTime ?? "";
              const nextEndTime = normalizedUpdates.endTime !== undefined ? normalizedUpdates.endTime : currentShift.endTime ?? "";
              const hasActiveShift = nextStartTime !== "" || nextEndTime !== "";

              const nextWorkDays = new Set(op.workDays ?? []);
              if (hasActiveShift) nextWorkDays.add(day);
              else nextWorkDays.delete(day);
              updated.workDays = DAYS_OF_WEEK.filter((d) => nextWorkDays.has(d));

              if (op.useShiftTimeOverrides) {
                const overrides = { ...(op.shiftTimeOverrides ?? {}) };
                const existing = overrides[day] ?? { startTime: "", endTime: "" };
                overrides[day] = {
                  startTime: normalizedUpdates.startTime !== undefined ? normalizedUpdates.startTime : existing.startTime,
                  endTime: normalizedUpdates.endTime !== undefined ? normalizedUpdates.endTime : existing.endTime,
                };
                updated.shiftTimeOverrides = overrides;
              } else {
                const overrides: Partial<Record<DayOfWeek, { startTime: string; endTime: string }>> = {};
                for (const d of op.workDays ?? []) {
                  const rosterShift = currentRoster?.shifts[d];
                  overrides[d] = {
                    startTime: rosterShift?.startTime ?? op.defaultStartTime ?? "",
                    endTime: rosterShift?.endTime ?? op.defaultEndTime ?? "",
                  };
                }
                const existing = overrides[day] ?? { startTime: "", endTime: "" };
                overrides[day] = {
                  startTime: normalizedUpdates.startTime !== undefined ? normalizedUpdates.startTime : existing.startTime,
                  endTime: normalizedUpdates.endTime !== undefined ? normalizedUpdates.endTime : existing.endTime,
                };
                updated.useShiftTimeOverrides = true;
                updated.shiftTimeOverrides = overrides;
              }

              const nextOverrides = { ...(updated.shiftTimeOverrides ?? {}) };
              if (!hasActiveShift) {
                delete nextOverrides[day];
              }

              const hasAnyOverrides = Object.values(nextOverrides).some((override) => {
                if (!override) return false;
                return (override.startTime ?? "") !== "" || (override.endTime ?? "") !== "";
              });

              updated.useShiftTimeOverrides = hasAnyOverrides;
              updated.shiftTimeOverrides = hasAnyOverrides ? nextOverrides : {};
            }

            if (normalizedUpdates.division !== undefined) {
              const divOverrides = { ...op.divisionOverrides };
              if (divOverrides.applyAll) {
                divOverrides.applyAll = false;
                divOverrides.overrideDays = [day];
                divOverrides.dayValues = { [day]: normalizedUpdates.division };
              } else {
                if (!divOverrides.overrideDays.includes(day)) {
                  divOverrides.overrideDays = [...divOverrides.overrideDays, day];
                }
                divOverrides.dayValues = { ...divOverrides.dayValues, [day]: normalizedUpdates.division };
              }
              updated.divisionOverrides = divOverrides;
            }
            if (normalizedUpdates.tasks !== undefined) {
              const taskOverrides = { ...op.tasksOverrides };
              if (taskOverrides.applyAll) {
                taskOverrides.applyAll = false;
                taskOverrides.overrideDays = [day];
                taskOverrides.dayValues = { [day]: normalizedUpdates.tasks };
              } else {
                if (!taskOverrides.overrideDays.includes(day)) {
                  taskOverrides.overrideDays = [...taskOverrides.overrideDays, day];
                }
                taskOverrides.dayValues = { ...taskOverrides.dayValues, [day]: normalizedUpdates.tasks };
              }
              updated.tasksOverrides = taskOverrides;
            }
            return updated;
          }),
        );
      }
    },
    [],
  );

  const getRoster = useCallback(
    (operatorId: string): WeeklyRoster | undefined => {
      return rosters.find((r) => r.operatorId === operatorId);
    },
    [rosters],
  );

  const getOperator = useCallback(
    (id: string): Operator | undefined => {
      return operators.find((op) => op.id === id);
    },
    [operators],
  );

  const duplicateOperator = useCallback((sourceId: string): Operator | null => {
    const source = operatorsRef.current.find(op => op.id === sourceId);
    if (!source) return null;

    const id = crypto.randomUUID();
    const number = getNextOperatorNumber();

    const newOperator: Operator = {
      id,
      number,
      name: '',
      employmentType: source.employmentType,
      level: source.level,
      service: source.service,
      isFixedNights: source.isFixedNights,
      defaultStartTime: source.defaultStartTime,
      defaultEndTime: source.defaultEndTime,
      workDays: [...source.workDays],
      defaultDivision: source.defaultDivision ?? "",
      divisionOverrides: { ...DEFAULT_OVERRIDES },
      defaultTasks: "",
      tasksOverrides: { ...DEFAULT_OVERRIDES },
    };

    // Generate shifts strictly from the new operator profile (no stale data)
    const generatedShifts = createShiftsFromOperator(newOperator);

    setOperators(prev => [...prev, newOperator]);
    setRosters(prev => [...prev, { operatorId: id, shifts: generatedShifts }]);

    return newOperator;
  }, [getNextOperatorNumber]);

  const copyRoster = useCallback((sourceId: string, targetIds: string[]) => {
    const sourceRoster = rostersRef.current.find(r => r.operatorId === sourceId);
    if (!sourceRoster) return;

    setRosters(prev => prev.map(roster => {
      if (!targetIds.includes(roster.operatorId)) return roster;
      const newShifts: Record<DayOfWeek, ShiftEntry> = {} as any;
      for (const day of DAYS_OF_WEEK) {
        const src = sourceRoster.shifts[day];
        newShifts[day] = { startTime: src.startTime, endTime: src.endTime, division: src.division, tasks: src.tasks, ...(src.segments ? { segments: JSON.parse(JSON.stringify(src.segments)) } : {}) };
      }
      return { ...roster, shifts: newShifts };
    }));
  }, []);

  const duplicateOperatorWithRoster = useCallback((sourceId: string): Operator | null => {
    const source = operatorsRef.current.find(op => op.id === sourceId);
    const newOp = duplicateOperator(sourceId);
    if (!newOp || !source) return null;

    // Restore fields that duplicateOperator intentionally strips (allowances, overrides, tasks)
    const fullCopyPatch: Partial<Operator> = {
      defaultTasks: source.defaultTasks ?? "",
      divisionOverrides: source.divisionOverrides ? JSON.parse(JSON.stringify(source.divisionOverrides)) : { ...DEFAULT_OVERRIDES },
      tasksOverrides: source.tasksOverrides ? JSON.parse(JSON.stringify(source.tasksOverrides)) : { ...DEFAULT_OVERRIDES },
      useShiftTimeOverrides: source.useShiftTimeOverrides,
      shiftTimeOverrides: source.shiftTimeOverrides ? JSON.parse(JSON.stringify(source.shiftTimeOverrides)) : undefined,
      weeksPerYear: source.weeksPerYear,
      ...(source.securityAllowances ? { securityAllowances: { ...source.securityAllowances } } : {}),
      ...(source.cleaningAllowances ? { cleaningAllowances: { ...source.cleaningAllowances } } : {}),
    };

    // Build the fully-merged operator profile to generate shifts from
    const mergedOp: Operator = { ...newOp, ...fullCopyPatch } as Operator;

    setOperators(prev => prev.map(op =>
      op.id === newOp.id ? { ...op, ...fullCopyPatch } : op
    ));

    // Generate clean shifts from the merged profile, then overlay source shift data
    // ONLY for days that are in the new operator's workDays
    const baseShifts = createShiftsFromOperator(mergedOp);
    const sourceRoster = rostersRef.current.find(r => r.operatorId === sourceId);
    if (sourceRoster) {
      const workDaySet = new Set(mergedOp.workDays);
      for (const day of DAYS_OF_WEEK) {
        if (workDaySet.has(day)) {
          const src = sourceRoster.shifts[day];
          baseShifts[day] = {
            startTime: src.startTime,
            endTime: src.endTime,
            division: src.division,
            tasks: src.tasks,
            ...(src.segments ? { segments: JSON.parse(JSON.stringify(src.segments)) } : {}),
          };
        }
        // Non-work days remain empty from createShiftsFromOperator
      }
    }

    setRosters(prev => prev.map(roster =>
      roster.operatorId === newOp.id ? { ...roster, shifts: baseShifts } : roster
    ));

    return newOp;
  }, [duplicateOperator]);

  // ── Labour Assessment sync ─────────────────────────────────────────────
  // Operators with `source === 'labour-assessment'` and a matching `laKey`
  // are kept in lockstep with the LA plan. Manual operators are never touched.

  const renumberOperators = (ops: Operator[]): Operator[] =>
    [...ops].sort((a, b) => a.number - b.number).map((op, i) => ({ ...op, number: i + 1 }));

  const blankShifts = (): Record<DayOfWeek, ShiftEntry> => ({
    mon: { startTime: "", endTime: "", division: "", tasks: "" },
    tue: { startTime: "", endTime: "", division: "", tasks: "" },
    wed: { startTime: "", endTime: "", division: "", tasks: "" },
    thu: { startTime: "", endTime: "", division: "", tasks: "" },
    fri: { startTime: "", endTime: "", division: "", tasks: "" },
    sat: { startTime: "", endTime: "", division: "", tasks: "" },
    sun: { startTime: "", endTime: "", division: "", tasks: "" },
  });

  const applyLaPlan = useCallback((plan: LaOperatorSpec[], frozen: boolean) => {
    if (frozen) return; // Freeze halts all writes.

    // Ensure any divisions referenced by the plan exist in the global
    // divisions store. Auto-creates "Tenant Special Services" the first
    // time it appears in a plan; idempotent for existing entries.
    try {
      const required = new Set(
        plan.map(p => p.seedDefaultDivision).filter((d): d is string => !!d && d.length > 0),
      );
      if (required.size > 0) {
        const raw = localStorage.getItem('cpq-divisions');
        const current: string[] = raw ? (JSON.parse(raw) as string[]) : [];
        let changed = false;
        const next = [...current];
        for (const d of required) {
          if (!next.includes(d)) { next.push(d); changed = true; }
        }
        if (changed) {
          localStorage.setItem('cpq-divisions', JSON.stringify(next));
          // Notify any useDivisions() subscribers so UI re-renders.
          import('@/components/DivisionsSettings').then(m => m.invalidateDivisionsCache()).catch(() => {});
        }
      }
    } catch { /* localStorage unavailable — non-fatal */ }

    const currentOps = operatorsRef.current;
    const planByKey = new Map(plan.map(p => [p.laKey, p]));
    const planKeys = new Set(planByKey.keys());

    // 1. Remove managed operators whose laKey is no longer in the plan.
    const survivors: Operator[] = [];
    const removedIds = new Set<string>();
    for (const op of currentOps) {
      if (op.source === "labour-assessment" && (!op.laKey || !planKeys.has(op.laKey))) {
        removedIds.add(op.id);
      } else {
        survivors.push(op);
      }
    }

    // 2. Update existing managed operators (or create new ones for new keys).
    const updatedOps: Operator[] = [];
    const usedKeys = new Set<string>();
    let maxNumber = survivors.reduce((m, o) => Math.max(m, o.number), 0);
    const seenKeys = new Set<string>();
    // Track which existing managed operators we've already matched to plan entries.
    const existingByKey = new Map<string, Operator>();
    for (const op of survivors) {
      if (op.source === "labour-assessment" && op.laKey && !existingByKey.has(op.laKey)) {
        existingByKey.set(op.laKey, op);
      }
    }

    for (const op of survivors) {
      if (op.source !== "labour-assessment" || !op.laKey) {
        updatedOps.push(op);
        continue;
      }
      const spec = planByKey.get(op.laKey);
      if (!spec) {
        // shouldn't happen — already filtered
        updatedOps.push(op);
        continue;
      }
      if (seenKeys.has(op.laKey)) {
        // Duplicate managed op with same key — drop the dupe
        removedIds.add(op.id);
        continue;
      }
      seenKeys.add(op.laKey);
      usedKeys.add(op.laKey);

      // Decide whether seed-only fields may be re-seeded.
      const seeded = op.laSeeded ?? {};
      const empMatchesSeed = seeded.employmentType === undefined || seeded.employmentType === op.employmentType;
      const lvlMatchesSeed = seeded.level === undefined || seeded.level === op.level;
      const divMatchesSeed = seeded.defaultDivision === undefined || seeded.defaultDivision === op.defaultDivision;
      const currentToilet = op.cleaningAllowances?.toiletCleaning ?? false;
      const toiletMatchesSeed = seeded.toiletCleaning === undefined || seeded.toiletCleaning === currentToilet;

      const nextEmp = empMatchesSeed ? spec.seedEmploymentType : op.employmentType;
      const nextLvl = lvlMatchesSeed ? spec.seedLevel : op.level;
      const nextDiv = divMatchesSeed ? spec.seedDefaultDivision : op.defaultDivision;
      const specToilet = !!spec.seedToiletAllowance;
      const nextToilet = toiletMatchesSeed ? specToilet : currentToilet;

      const nextSeeded: LaSeededSnapshot = {
        employmentType: empMatchesSeed ? spec.seedEmploymentType : seeded.employmentType,
        level: lvlMatchesSeed ? spec.seedLevel : seeded.level,
        defaultDivision: divMatchesSeed ? spec.seedDefaultDivision : seeded.defaultDivision,
        toiletCleaning: toiletMatchesSeed ? specToilet : seeded.toiletCleaning,
      };

      const nextAllowances: CleaningAllowances = toiletMatchesSeed
        ? { ...(op.cleaningAllowances ?? DEFAULT_CLEANING_ALLOWANCES), toiletCleaning: nextToilet }
        : (op.cleaningAllowances ?? DEFAULT_CLEANING_ALLOWANCES);

      updatedOps.push({
        ...op,
        // LA-controlled (always re-applied)
        service: spec.service,
        defaultStartTime: spec.defaultStartTime,
        defaultEndTime: spec.defaultEndTime,
        workDays: [...spec.workDays],
        defaultTasks: spec.defaultTasks,
        // Seed-only (re-seeded only if user hasn't changed)
        employmentType: nextEmp,
        level: nextLvl,
        defaultDivision: nextDiv,
        cleaningAllowances: nextAllowances,
        laSeeded: nextSeeded,
      });
    }

    // 3. Create operators for any new plan keys.
    for (const spec of plan) {
      if (usedKeys.has(spec.laKey)) continue;
      maxNumber += 1;
      const id = crypto.randomUUID();
      updatedOps.push({
        id,
        number: maxNumber,
        name: spec.seedName,
        employmentType: spec.seedEmploymentType,
        level: spec.seedLevel,
        service: spec.service,
        isFixedNights: spec.defaultStartTime >= "18:00" || spec.defaultStartTime < "06:00",
        defaultStartTime: spec.defaultStartTime,
        defaultEndTime: spec.defaultEndTime,
        workDays: [...spec.workDays],
        defaultDivision: spec.seedDefaultDivision,
        divisionOverrides: { ...DEFAULT_OVERRIDES },
        defaultTasks: spec.defaultTasks,
        tasksOverrides: { ...DEFAULT_OVERRIDES },
        cleaningAllowances: spec.seedToiletAllowance
          ? { ...DEFAULT_CLEANING_ALLOWANCES, toiletCleaning: true }
          : { ...DEFAULT_CLEANING_ALLOWANCES },
        source: "labour-assessment",
        laKey: spec.laKey,
        laSeeded: {
          employmentType: spec.seedEmploymentType,
          level: spec.seedLevel,
          defaultDivision: spec.seedDefaultDivision,
          toiletCleaning: !!spec.seedToiletAllowance,
        },
      });
    }

    // 4. Renumber sequentially (matches existing convention).
    const finalOps = renumberOperators(updatedOps);

    // 5. Only update operators when their managed profile changed. Roster
    //    seeding still runs below so existing blank weekly cells are backfilled
    //    even when the LA operator list itself is unchanged.
    const sameSize = finalOps.length === currentOps.length;
    const sameContent = sameSize && finalOps.every((op, i) => {
      const prev = currentOps[i];
      if (!prev) return false;
      return prev.id === op.id
        && prev.number === op.number
        && prev.employmentType === op.employmentType
        && prev.level === op.level
        && prev.defaultDivision === op.defaultDivision
        && prev.defaultStartTime === op.defaultStartTime
        && prev.defaultEndTime === op.defaultEndTime
        && prev.defaultTasks === op.defaultTasks
        && prev.workDays.join(",") === op.workDays.join(",")
        && prev.service === op.service
        && prev.source === op.source
        && prev.laKey === op.laKey;
    });
    if (!sameContent || removedIds.size > 0) {
      setOperators(finalOps);
    }

    // 6. Ensure each managed operator has a roster row, and seed shift cells
    //    from the operator's default template where the cell/field is blank or
    //    still matches the previous LA-controlled value. User edits are kept.
    const managedById = new Map(
      finalOps
        .filter(o => o.source === "labour-assessment" && o.laKey)
        .map(o => [o.id, o] as const),
    );
    const previousById = new Map(currentOps.map(op => [op.id, op] as const));
    const targetTemplateById = new Map<string, Record<DayOfWeek, ShiftEntry>>();
    const previousTemplateById = new Map<string, Record<DayOfWeek, ShiftEntry>>();
    for (const [id, op] of managedById) {
      targetTemplateById.set(id, createShiftsFromOperator(op));
      const previous = previousById.get(id);
      previousTemplateById.set(id, previous ? createShiftsFromOperator(previous) : blankShifts());
    }
    setRosters(prev => {
      let changed = false;
      let next = removedIds.size > 0 ? prev.filter(r => !removedIds.has(r.operatorId)) : prev;
      if (next.length !== prev.length) changed = true;
      const have = new Set(next.map(r => r.operatorId));
      for (const op of finalOps) {
        if (!have.has(op.id)) {
          next = [...next, { operatorId: op.id, shifts: blankShifts() }];
          changed = true;
        }
      }
      // Seed/update LA-controlled fields on managed operators. A field remains
      // LA-controlled while it is blank or equal to the previous LA template.
      next = next.map(roster => {
        const op = managedById.get(roster.operatorId);
        if (!op) return roster;
        const targetTemplate = targetTemplateById.get(roster.operatorId);
        const previousTemplate = previousTemplateById.get(roster.operatorId);
        if (!targetTemplate || !previousTemplate) return roster;

        const { shifts: newShifts, changed: rosterChanged } = seedManagedRosterShifts(
          roster.shifts,
          targetTemplate,
          previousTemplate,
        );
        if (!rosterChanged) return roster;
        changed = true;
        return { ...roster, shifts: newShifts };
      });
      return changed ? next : prev;
    });
  }, []);

  const detachLaOperator = useCallback((id: string) => {
    setOperators(prev => prev.map(op =>
      op.id === id && op.source === "labour-assessment"
        ? { ...op, source: "manual", laKey: undefined, laSeeded: undefined }
        : op,
    ));
  }, []);

  const detachAllLaOperators = useCallback((): number => {
    let count = 0;
    setOperators(prev => prev.map(op => {
      if (op.source !== "labour-assessment") return op;
      count++;
      return { ...op, source: "manual" as OperatorSource, laKey: undefined, laSeeded: undefined };
    }));
    return count;
  }, []);

  const removeAllLaOperators = useCallback(() => {
    const removedIds = new Set(
      operatorsRef.current.filter(o => o.source === "labour-assessment").map(o => o.id),
    );
    if (removedIds.size === 0) return;
    setOperators(prev => renumberOperators(prev.filter(o => !removedIds.has(o.id))));
    setRosters(prev => prev.filter(r => !removedIds.has(r.operatorId)));
  }, []);


  // --- Task library ---
  const addTaskToLibrary = useCallback((task: string) => {
    const normalized = task.trim().replace(/\s+/g, ' ');
    if (!normalized) return;
    setTaskLibrary(prev => {
      // Case-insensitive duplicate check
      if (prev.some(t => t.toLowerCase() === normalized.toLowerCase())) return prev;
      const next = [...prev, normalized];
      localStorage.setItem('cpq-task-library', JSON.stringify(next));
      return next;
    });
  }, []);

  const deleteTaskFromLibrary = useCallback((task: string) => {
    const lower = task.toLowerCase();
    // Remove from task library
    setTaskLibrary(prev => {
      const next = prev.filter(t => t.toLowerCase() !== lower);
      localStorage.setItem('cpq-task-library', JSON.stringify(next));
      return next;
    });
    // Remove from all operators' default tasks and per-day shift tasks
    setOperators(prev => {
      const updated = prev.map(op => {
        let changed = false;
        let defaultTasks = op.defaultTasks;
        if (defaultTasks && defaultTasks.toLowerCase() === lower) {
          defaultTasks = '';
          changed = true;
        }
        return changed ? { ...op, defaultTasks } : op;
      });
      return updated;
    });
    // Remove from all rosters' shift tasks
    setRosters(prev => {
      return prev.map(r => {
        let changed = false;
        const newShifts = { ...r.shifts };
        for (const day of Object.keys(newShifts) as DayOfWeek[]) {
          const shift = newShifts[day];
          if (shift?.tasks && shift.tasks.toLowerCase() === lower) {
            newShifts[day] = { ...shift, tasks: '' };
            changed = true;
          }
        }
        return changed ? { ...r, shifts: newShifts } : r;
      });
    });
  }, []);

  // --- Scenario management ---
  const saveScenario = useCallback((name: string): string => {
    const id = crypto.randomUUID();
    let wageSettings: any = null;
    let serviceColors: any = null;
    let jobDetails: any = null;
    try { wageSettings = JSON.parse(localStorage.getItem('cpq-wage-settings') || 'null'); } catch {}
    try { serviceColors = JSON.parse(localStorage.getItem('cpq-service-colors') || 'null'); } catch {}
    try { jobDetails = JSON.parse(localStorage.getItem('cpq-job-details') || 'null'); } catch {}
    let divisions: string[] | null = null;
    try { divisions = JSON.parse(localStorage.getItem('cpq-divisions') || 'null'); } catch {}

    const scenario: Scenario = {
      id,
      name,
      createdAt: new Date().toISOString(),
      data: { operators: operatorsRef.current, rosters: rostersRef.current },
      wageSettings,
      serviceColors,
      jobDetails,
      divisions: divisions || [],
      taskLibrary,
    };
    setScenarios(prev => {
      const next = [...prev, scenario];
      saveScenarioMeta({ scenarios: next, defaultScenarioId: defaultScenarioId });
      return next;
    });
    setActiveScenarioId(id);
    return id;
  }, [defaultScenarioId, taskLibrary]);

  const loadScenario = useCallback((id: string) => {
    const meta = loadScenarioMeta();
    const scenario = meta.scenarios.find(s => s.id === id);
    if (!scenario) return;

    const store = ensureRostersForOperators({
      operators: scenario.data.operators.map(normalizeOperator),
      rosters: normalizeRosterTimes(scenario.data.rosters),
    });
    setOperators(store.operators);
    setRosters(store.rosters);
    if (scenario.wageSettings) {
      localStorage.setItem('cpq-wage-settings', JSON.stringify(scenario.wageSettings));
    }
    if (scenario.serviceColors) {
      localStorage.setItem('cpq-service-colors', JSON.stringify(scenario.serviceColors));
    }
    if (scenario.jobDetails) {
      localStorage.setItem('cpq-job-details', JSON.stringify(scenario.jobDetails));
    }
    // Extract divisions from operators if not explicitly saved in scenario
    let divisions = scenario.divisions || [];
    if (divisions.length === 0) {
      const extracted = new Set<string>();
      for (const op of scenario.data.operators) {
        if (op.defaultDivision) extracted.add(op.defaultDivision);
        if (op.divisionOverrides?.dayValues) {
          Object.values(op.divisionOverrides.dayValues).forEach((v: any) => {
            if (v) extracted.add(v);
          });
        }
      }
      divisions = Array.from(extracted);
    }
    localStorage.setItem('cpq-divisions', JSON.stringify(divisions));
    invalidateDivisionsCache();
    // Load task library from scenario
    const scenarioTasks = scenario.taskLibrary || [];
    setTaskLibrary(scenarioTasks);
    localStorage.setItem('cpq-task-library', JSON.stringify(scenarioTasks));
    setActiveScenarioId(id);
  }, []);

  const deleteScenario = useCallback((id: string) => {
    setScenarios(prev => {
      const next = prev.filter(s => s.id !== id);
      const newDefault = defaultScenarioId === id ? null : defaultScenarioId;
      saveScenarioMeta({ scenarios: next, defaultScenarioId: newDefault });
      if (defaultScenarioId === id) setDefaultScenarioIdState(null);
      return next;
    });
    if (activeScenarioId === id) setActiveScenarioId(null);
  }, [activeScenarioId, defaultScenarioId]);

  const renameScenario = useCallback((id: string, name: string) => {
    setScenarios(prev => {
      const next = prev.map(s => s.id === id ? { ...s, name } : s);
      saveScenarioMeta({ scenarios: next, defaultScenarioId: defaultScenarioId });
      return next;
    });
  }, [defaultScenarioId]);

  const duplicateScenario = useCallback((id: string): string => {
    const meta = loadScenarioMeta();
    const source = meta.scenarios.find(s => s.id === id);
    if (!source) return '';
    const newId = crypto.randomUUID();
    const dup: Scenario = { ...source, id: newId, name: `${source.name} (copy)`, createdAt: new Date().toISOString() };
    setScenarios(prev => {
      const next = [...prev, dup];
      saveScenarioMeta({ scenarios: next, defaultScenarioId: defaultScenarioId });
      return next;
    });
    return newId;
  }, [defaultScenarioId]);

  const setDefaultScenario = useCallback((id: string | null) => {
    setDefaultScenarioIdState(id);
    setScenarios(prev => {
      saveScenarioMeta({ scenarios: prev, defaultScenarioId: id });
      return prev;
    });
  }, []);

  const exportScenario = useCallback((id: string): string => {
    const meta = loadScenarioMeta();
    const scenario = meta.scenarios.find(s => s.id === id);
    if (!scenario) return '';
    return JSON.stringify(scenario, null, 2);
  }, []);

  const importScenario = useCallback((json: string): string | null => {
    try {
      const parsed = JSON.parse(json);
      if (!parsed?.data?.operators || !parsed?.data?.rosters) return null;
      const id = crypto.randomUUID();

      // Extract divisions from operator data if not explicitly saved
      if (!parsed.divisions || parsed.divisions.length === 0) {
        const extracted = new Set<string>();
        for (const op of parsed.data.operators) {
          if (op.defaultDivision) extracted.add(op.defaultDivision);
          if (op.divisionOverrides?.dayValues) {
            Object.values(op.divisionOverrides.dayValues).forEach((v: any) => {
              if (v) extracted.add(v);
            });
          }
        }
        parsed.divisions = Array.from(extracted);
      }

      const scenario: Scenario = {
        ...parsed,
        id,
        createdAt: new Date().toISOString(),
      };
      setScenarios(prev => {
        const next = [...prev, scenario];
        saveScenarioMeta({ scenarios: next, defaultScenarioId: defaultScenarioId });
        return next;
      });
      return id;
    } catch { return null; }
  }, [defaultScenarioId]);

  // Auto-save active scenario when data changes
  useEffect(() => {
    if (!isLoaded || !activeScenarioId) return;
    let wageSettings: any = null;
    let serviceColors: any = null;
    let jobDetails: any = null;
    try { wageSettings = JSON.parse(localStorage.getItem('cpq-wage-settings') || 'null'); } catch {}
    try { serviceColors = JSON.parse(localStorage.getItem('cpq-service-colors') || 'null'); } catch {}
    try { jobDetails = JSON.parse(localStorage.getItem('cpq-job-details') || 'null'); } catch {}
    let divisions: string[] | null = null;
    try { divisions = JSON.parse(localStorage.getItem('cpq-divisions') || 'null'); } catch {}

    setScenarios(prev => {
      const next = prev.map(s => s.id === activeScenarioId
        ? { ...s, data: { operators, rosters }, wageSettings, serviceColors, jobDetails, divisions: divisions || [], taskLibrary }
        : s
      );
      saveScenarioMeta({ scenarios: next, defaultScenarioId: defaultScenarioId });
      return next;
    });
  }, [operators, rosters, isLoaded, activeScenarioId, defaultScenarioId, taskLibrary]);

  return (
    <RosterContext.Provider
      value={{
        operators,
        rosters,
        isLoaded,
        addOperator,
        updateOperator,
        deleteOperator,
        updateShift,
        getRoster,
        getOperator,
        duplicateOperator,
        copyRoster,
        duplicateOperatorWithRoster,
        applyLaPlan,
        detachLaOperator,
        detachAllLaOperators,
        removeAllLaOperators,
        taskLibrary,
        addTaskToLibrary,
        deleteTaskFromLibrary,
        scenarios,
        activeScenarioId,
        saveScenario,
        loadScenario,
        deleteScenario,
        renameScenario,
        duplicateScenario,
        setDefaultScenario,
        defaultScenarioId,
        exportScenario,
        importScenario,
        clearAllOperators,
        restoreOperators,
      }}
    >
      {children}
    </RosterContext.Provider>
  );
}

export function useRosterStore() {
  const context = useContext(RosterContext);
  if (!context) {
    throw new Error("useRosterStore must be used within a RosterProvider");
  }
  return context;
}

export function useRosterStoreOptional() {
  return useContext(RosterContext);
}

