import { useState, useEffect, useCallback } from 'react';
import { 
  type Operator, 
  type WeeklyRoster, 
  type DayOfWeek, 
  type ShiftEntry,
  type ServiceType,
  type SecurityAllowances,
  DAYS_OF_WEEK,
  EmploymentType,
  OperatorLevel
} from '@/types/roster';

const STORAGE_KEY = 'cpq-roster-data';

interface RosterStore {
  operators: Operator[];
  rosters: WeeklyRoster[];
}

// Create empty shifts - no pre-filling from defaults
// Raw user inputs are stored; defaults are for UI convenience only
const createEmptyShifts = (): Record<DayOfWeek, ShiftEntry> => {
  return {
    mon: { startTime: '', endTime: '', division: '', tasks: '' },
    tue: { startTime: '', endTime: '', division: '', tasks: '' },
    wed: { startTime: '', endTime: '', division: '', tasks: '' },
    thu: { startTime: '', endTime: '', division: '', tasks: '' },
    fri: { startTime: '', endTime: '', division: '', tasks: '' },
    sat: { startTime: '', endTime: '', division: '', tasks: '' },
    sun: { startTime: '', endTime: '', division: '', tasks: '' },
  };
};

const loadFromStorage = (): RosterStore => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load roster data:', e);
  }
  return { operators: [], rosters: [] };
};

const saveToStorage = (data: RosterStore) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to save roster data:', e);
  }
};

export function useRosterStore() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [rosters, setRosters] = useState<WeeklyRoster[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from storage on mount
  useEffect(() => {
    const data = loadFromStorage();
    setOperators(data.operators);
    setRosters(data.rosters);
    setIsLoaded(true);
  }, []);

  // Save to storage on changes
  useEffect(() => {
    if (isLoaded) {
      saveToStorage({ operators, rosters });
    }
  }, [operators, rosters, isLoaded]);

  const getNextOperatorNumber = useCallback(() => {
    if (operators.length === 0) return 1;
    return Math.max(...operators.map(o => o.number)) + 1;
  }, [operators]);

  const addOperator = useCallback((
    name: string,
    employmentType: EmploymentType,
    level: OperatorLevel,
    service: ServiceType = 'cleaning',
    isFixedNights: boolean = false,
    defaultStartTime: string = '',
    defaultEndTime: string = '',
    workDays: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri'],
    allowances?: SecurityAllowances | undefined
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
      divisionOverrides: { applyAll: true, overrideDays: [], dayValues: {} },
      defaultTasks: "",
      tasksOverrides: { applyAll: true, overrideDays: [], dayValues: {} },
      securityAllowances: allowances,
    };

    // Create empty roster - user must enter shift times on /roster page
    const newRoster: WeeklyRoster = {
      operatorId: id,
      shifts: createEmptyShifts(),
    };

    setOperators(prev => [...prev, newOperator]);
    setRosters(prev => [...prev, newRoster]);

    return newOperator;
  }, [getNextOperatorNumber]);

  const updateOperator = useCallback((
    id: string,
    updates: Partial<Omit<Operator, 'id' | 'number'>>
  ) => {
    setOperators(prev => prev.map(op => 
      op.id === id ? { ...op, ...updates } : op
    ));
  }, []);

  const deleteOperator = useCallback((id: string) => {
    setOperators(prev => {
      // Filter out the deleted operator
      const remaining = prev.filter(op => op.id !== id);
      // Sort by current number to maintain order, then reassign sequential numbers
      const sorted = [...remaining].sort((a, b) => a.number - b.number);
      return sorted.map((op, index) => ({
        ...op,
        number: index + 1,
      }));
    });
    setRosters(prev => prev.filter(r => r.operatorId !== id));
  }, []);

  const updateShift = useCallback((
    operatorId: string,
    day: DayOfWeek,
    updates: Partial<ShiftEntry>
  ) => {
    setRosters(prev => prev.map(roster => {
      if (roster.operatorId !== operatorId) return roster;
      
      return {
        ...roster,
        shifts: {
          ...roster.shifts,
          [day]: {
            ...roster.shifts[day],
            ...updates,
          },
        },
      };
    }));
  }, []);

  const duplicateOperator = useCallback((sourceId: string): Operator | null => {
    const source = operators.find(op => op.id === sourceId);
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
      divisionOverrides: source.divisionOverrides ? { ...source.divisionOverrides } : { applyAll: true, overrideDays: [], dayValues: {} },
      defaultTasks: source.defaultTasks ?? "",
      tasksOverrides: source.tasksOverrides ? { ...source.tasksOverrides } : { applyAll: true, overrideDays: [], dayValues: {} },
      ...(source.securityAllowances ? { securityAllowances: { ...source.securityAllowances } } : {}),
      ...(source.cleaningAllowances ? { cleaningAllowances: { ...source.cleaningAllowances } } : {}),
    };

    const newRoster: WeeklyRoster = {
      operatorId: id,
      shifts: createEmptyShifts(),
    };

    setOperators(prev => [...prev, newOperator]);
    setRosters(prev => [...prev, newRoster]);

    return newOperator;
  }, [operators, getNextOperatorNumber]);

  const copyRoster = useCallback((sourceId: string, targetIds: string[]) => {
    const sourceRoster = rosters.find(r => r.operatorId === sourceId);
    if (!sourceRoster) return;

    setRosters(prev => prev.map(roster => {
      if (!targetIds.includes(roster.operatorId)) return roster;
      const newShifts = { ...roster.shifts };
      for (const day of DAYS_OF_WEEK) {
        const src = sourceRoster.shifts[day];
        newShifts[day] = {
          startTime: src.startTime,
          endTime: src.endTime,
          division: src.division,
          tasks: src.tasks,
        };
      }
      return { ...roster, shifts: newShifts };
    }));
  }, [rosters]);

  const duplicateOperatorWithRoster = useCallback((sourceId: string): Operator | null => {
    const newOp = duplicateOperator(sourceId);
    if (!newOp) return null;
    // We need to copy roster after the state updates, so do it inline
    const sourceRoster = rosters.find(r => r.operatorId === sourceId);
    if (sourceRoster) {
      setRosters(prev => prev.map(roster => {
        if (roster.operatorId !== newOp.id) return roster;
        const newShifts: Record<DayOfWeek, ShiftEntry> = {} as any;
        for (const day of DAYS_OF_WEEK) {
          const src = sourceRoster.shifts[day];
          newShifts[day] = {
            startTime: src.startTime,
            endTime: src.endTime,
            division: src.division,
            tasks: src.tasks,
          };
        }
        return { ...roster, shifts: newShifts };
      }));
    }
    return newOp;
  }, [duplicateOperator, rosters]);

  const getRoster = useCallback((operatorId: string): WeeklyRoster | undefined => {
    return rosters.find(r => r.operatorId === operatorId);
  }, [rosters]);

  const getOperator = useCallback((id: string): Operator | undefined => {
    return operators.find(op => op.id === id);
  }, [operators]);

  return {
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
  };
}
