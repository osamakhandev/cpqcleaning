import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Users, Info, AlertTriangle, Lightbulb, Copy, Split } from 'lucide-react';
import HowItWorks from '@/components/HowItWorks';
import { HELP_CONTENT } from '@/data/helpContent';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FloatingSearchOperator } from '@/components/FloatingSearchOperator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { FixedPriceBanner } from '@/components/FixedPriceBanner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { TimeInput } from '@/components/TimeInput';
import { SegmentsModal } from '@/components/SegmentsModal';
import { SplitScopeModal } from '@/components/SplitScopeModal';
import { useRosterStore, useRosterStoreOptional } from '@/contexts/RosterContext';
import { useDivisions } from '@/components/DivisionsSettings';
import { calculateOperatorWeek, formatDecimalHours } from '@/lib/rosterCalculations';
import { calculateShiftCost, formatCurrency, type ShiftCost } from '@/lib/costingCalculations';
import { calculateSecurityAllowances, calculateCleaningAllowances } from '@/lib/securityAllowances';
import type { AllowanceBreakdown, AllowanceLineItem } from '@/lib/securityAllowances';
import { RATE_BAND_LABELS, type RateBand } from '@/lib/rateData';
import { useWageSettings } from '@/lib/wageSettings';
import { usePricingData } from '@/hooks/usePricingData';
import { hasMultipleSegments } from '@/lib/segmentAllocation';
import { resolveShift } from '@/lib/resolveShift';
import { DAYS_OF_WEEK, DAY_LABELS } from '@/types/roster';
import type { DayOfWeek, Operator, ShiftEntry, Segment, ServiceType } from '@/types/roster';

const SERVICE_CODES: Record<ServiceType, string> = {
  cleaning: 'CLN',
  security: 'SEC',
  'customer-service': 'CS',
  maintenance: 'MTC',
  landscape: 'LND',
  management: 'MGT',
};
import { toast } from 'sonner';

const employmentLabels = {
  'full-time': 'FT',
  'part-time': 'PT',
  'casual': 'C',
};

// ── Daily allowance breakdown (same logic as DetailedResults) ─────
function classifyAllowances(items: AllowanceLineItem[]): { perShiftTotal: number; weeklyFlatTotal: number } {
  let perShiftTotal = 0;
  let weeklyFlatTotal = 0;
  for (const item of items) {
    const n = item.name.toLowerCase();
    if (n.includes('supervision') || n.includes('leading hand')) {
      weeklyFlatTotal += item.cost;
    } else {
      perShiftTotal += item.cost;
    }
  }
  return { perShiftTotal, weeklyFlatTotal };
}

function computeDailyAllowances(
  allowanceInfo: AllowanceBreakdown | null,
  dayCalcs: { paidHours: number }[],
): number[] {
  if (!allowanceInfo || allowanceInfo.items.length === 0) {
    return dayCalcs.map(() => 0);
  }
  const { perShiftTotal, weeklyFlatTotal } = classifyAllowances(allowanceInfo.items);
  const workedCount = dayCalcs.filter(d => d.paidHours > 0).length;
  const totalPaidHours = dayCalcs.reduce((s, d) => s + d.paidHours, 0);

  return dayCalcs.map(d => {
    if (d.paidHours <= 0) return 0;
    const perShift = workedCount > 0 ? perShiftTotal / workedCount : 0;
    const proRata = totalPaidHours > 0 ? weeklyFlatTotal * (d.paidHours / totalPaidHours) : 0;
    return perShift + proRata;
  });
}

export default function Roster() {
  const store = useRosterStoreOptional();
  const { divisions: divisionsList } = useDivisions();
  const { getConfigForOperator } = useWageSettings();

  const operators = store?.operators ?? [];
  const [operatorSearch, setOperatorSearch] = useState('');
  const [warningsOpen, setWarningsOpen] = useState(false);
  const rosters = store?.rosters ?? [];
  const updateShift = store?.updateShift;
  const getRoster = store?.getRoster;
  const isLoaded = store?.isLoaded ?? false;
  const taskLibrary = store?.taskLibrary ?? [];
  const addTaskToLibrary = store?.addTaskToLibrary;
  const deleteTaskFromLibrary = store?.deleteTaskFromLibrary;

  const operatorWarnings = useMemo(() => {
    if (!getRoster) return [];
    return operators.map(op => {
      const roster = getRoster(op.id);
      if (!roster) return { op, warnings: [] as string[] };
      const calc = calculateOperatorWeek(roster, op.employmentType, DAYS_OF_WEEK, op.service, op.weeksPerYear);
      return { op, warnings: calc.warnings };
    });
  }, [operators, rosters, getRoster]);

  const formatWarningText = (warning: string) => {
    if (warning.startsWith('WEEKLY: ')) return warning.replace('WEEKLY: ', '');
    const matchedDay = DAYS_OF_WEEK.find((day) => warning.startsWith(`${day.toUpperCase()}: `));
    if (!matchedDay) return warning;
    return `${DAY_LABELS[matchedDay]}: ${warning.replace(`${matchedDay.toUpperCase()}: `, '')}`;
  };

  // Compute total warnings across all operators
  const totalWarnings = useMemo(() => {
    if (!getRoster) return 0;
    let count = 0;
    operators.forEach(op => {
      const roster = getRoster(op.id);
      if (!roster) return;
      const calc = calculateOperatorWeek(roster, op.employmentType, DAYS_OF_WEEK, op.service, op.weeksPerYear);
      count += calc.warnings.length;
    });
    return count;
  }, [operators, rosters, getRoster]);

  const filteredOperators = useMemo(() => {
    const q = operatorSearch.trim();
    if (!q) return operators;
    return operators.filter(op => String(op.number).includes(q));
  }, [operators, operatorSearch]);

  const handleApplyDefaults = (
    operatorId: string,
    workDays: DayOfWeek[],
    startTime: string,
    endTime: string
  ) => {
    workDays.forEach(day => {
      updateShift?.(operatorId, day, {
        startTime: startTime,
        endTime: endTime,
      });
    });
  };

  if (!store || !isLoaded) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (operators.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-start gap-3">
          <div>
            <h1 className="text-2xl font-bold">Weekly Roster</h1>
            <p className="text-muted-foreground">Review shifts, pay rates, and warnings</p>
          </div>
          <HowItWorks {...HELP_CONTENT["weekly-roster"]} size="sm" />
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-2">No operators to roster</h3>
            <p className="text-muted-foreground text-center mb-4">
              Add operators first before creating their roster
            </p>
            <Button asChild>
              <Link to="/">Go to Operators</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }


  return (
    <div className="space-y-6">
      <FixedPriceBanner />
      <div className="flex items-center justify-between">
        <div className="flex items-start gap-3">
          <div>
            <h1 className="text-2xl font-bold">Weekly Roster</h1>
            <p className="text-muted-foreground">Quick shift adjustment · Pay & warning review</p>
          </div>
          <HowItWorks {...HELP_CONTENT["weekly-roster"]} size="sm" />
        </div>
        <div className="flex items-center gap-3">
          {totalWarnings > 0 && (
            <div
              className="flex items-center gap-1.5 text-sm text-warning cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => setWarningsOpen(true)}
            >
              <AlertTriangle className="h-4 w-4" />
              <span className="font-medium">{totalWarnings} warning{totalWarnings !== 1 ? 's' : ''}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600 no-print">
            <Info className="h-4 w-4 text-emerald-600" />
            <span>Full Time: Enter only Start OR End for auto-calculation</span>
          </div>
        </div>
      </div>

      <FloatingSearchOperator onFilterChange={setOperatorSearch} matchCount={filteredOperators.length} totalCount={operators.length} storageKey="cpq-search-roster-pos" />

      {filteredOperators.map(operator => (
        <OperatorRosterCard 
          key={operator.id} 
          operator={operator}
          roster={getRoster!(operator.id)}
          divisionsList={divisionsList}
          taskLibrary={taskLibrary}
          onAddTask={addTaskToLibrary!}
          onDeleteTask={deleteTaskFromLibrary!}
          onUpdateShift={updateShift!}
          onApplyDefaults={handleApplyDefaults}
          highlight={operatorSearch.trim() !== '' && filteredOperators.length === 1}
        />
      ))}

      <Dialog open={warningsOpen} onOpenChange={setWarningsOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Active Warnings ({totalWarnings})</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {operatorWarnings.filter(ow => ow.warnings.length > 0).map(({ op, warnings }) => (
              <div key={op.id} className="border rounded-lg p-3 space-y-2">
                <div className="font-medium flex items-center gap-2">
                  <span>Operator {op.number}</span>
                  {op.name && <span className="text-muted-foreground">– {op.name}</span>}
                  <Badge variant="outline" className="text-xs">
                    {op.employmentType === 'full-time' ? 'Full Time' : op.employmentType === 'part-time' ? 'Part Time' : 'Casual'}
                  </Badge>
                </div>
                <ul className="space-y-1">
                  {warnings.map((w, i) => (
                    <li key={i} className="text-sm text-warning flex items-start gap-2">
                      <span className="mt-0.5">⚠</span>
                      <span>{formatWarningText(w)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OperatorRosterCard({ 
  operator, 
  roster,
  divisionsList,
  taskLibrary,
  onAddTask,
  onDeleteTask,
  onUpdateShift,
  onApplyDefaults,
  highlight,
}: { 
  operator: Operator;
  roster: ReturnType<typeof useRosterStore>['getRoster'] extends (id: string) => infer R ? R : never;
  divisionsList: string[];
  taskLibrary: string[];
  onAddTask: (task: string) => void;
  onDeleteTask: (task: string) => void;
  onUpdateShift: (operatorId: string, day: DayOfWeek, updates: Partial<ShiftEntry>) => void;
  onApplyDefaults: (operatorId: string, workDays: DayOfWeek[], startTime: string, endTime: string) => void;
  highlight?: boolean;
}) {
  const [segmentsModalDay, setSegmentsModalDay] = useState<DayOfWeek | null>(null);
  const [splitScopeOpen, setSplitScopeOpen] = useState(false);
  const [splitTriggerDay, setSplitTriggerDay] = useState<DayOfWeek | null>(null);
  const [splitTargetDays, setSplitTargetDays] = useState<DayOfWeek[]>([]);
  const { getConfigForOperator } = useWageSettings();
  const { year1Factor } = usePricingData();

  const operatorCalc = useMemo(() => {
    if (!roster) return null;
    return calculateOperatorWeek(roster, operator.employmentType, DAYS_OF_WEEK, operator.service, operator.weeksPerYear);
  }, [roster, operator.employmentType, operator.service, operator.weeksPerYear]);

  const calculations = operatorCalc?.days ?? [];
  const weeklyPaidHours = operatorCalc?.weeklyPaidHours ?? 0;
  const ns = operator.service;

  // Per-day shift costs — same logic as DetailedResults, using RESOLVED times
  const dayCosts = useMemo((): Record<DayOfWeek, ShiftCost | null> => {
    const result = {} as Record<DayOfWeek, ShiftCost | null>;
    const wageInfo = getConfigForOperator(ns, operator.level);

    DAYS_OF_WEEK.forEach((day, index) => {
      const calc = calculations[index];
      if (!calc || !calc.isValid || calc.paidHours <= 0) {
        result[day] = null;
        return;
      }
      // Use resolved (auto-calculated) times, not raw stored values
      const shift = roster?.shifts[day];
      const resolved = resolveShift(shift?.startTime ?? '', shift?.endTime ?? '', operator.employmentType);
      const base = calculateShiftCost(
        day,
        resolved.startResolved || shift?.startTime || '',
        resolved.endResolved || shift?.endTime || '',
        calc.paidHours,
        ns,
        operator.employmentType,
        operator.level,
        operator.isFixedNights,
        wageInfo?.rates ?? null
      );
      // Apply year1Factor like DetailedResults
      if (year1Factor !== 1 && base.cost !== null) {
        result[day] = {
          ...base,
          cost: base.cost * year1Factor,
          hourlyRate: base.hourlyRate !== null ? base.hourlyRate * year1Factor : null,
          segments: base.segments.map(seg => ({
            ...seg,
            cost: seg.cost !== null ? seg.cost * year1Factor : null,
            hourlyRate: seg.hourlyRate * year1Factor,
          })),
        };
      } else {
        result[day] = base;
      }
    });
    return result;
  }, [calculations, roster, operator, ns, getConfigForOperator, year1Factor]);

  // Allowances — same logic as DetailedResults
  const allowanceInfo = useMemo((): AllowanceBreakdown | null => {
    if (!operatorCalc) return null;
    const workedDays = operatorCalc.days.filter(d => d.coverageMin > 0).map(d => d.day);
    let info: AllowanceBreakdown | null = null;
    if (ns === 'security' && operator.securityAllowances) {
      info = calculateSecurityAllowances(operator.securityAllowances, weeklyPaidHours, workedDays.length);
    } else if (ns === 'cleaning' && operator.cleaningAllowances) {
      info = calculateCleaningAllowances(operator.cleaningAllowances, weeklyPaidHours, workedDays, operator.level);
    }
    if (info && year1Factor !== 1) {
      info = {
        ...info,
        totalWeekly: info.totalWeekly * year1Factor,
        items: info.items.map(item => ({ ...item, cost: item.cost * year1Factor })),
      };
    }
    return info;
  }, [ns, operator.securityAllowances, operator.cleaningAllowances, operator.level, operatorCalc, weeklyPaidHours, year1Factor]);

  // Per-day allowance using same distribution as DetailedResults
  const dailyAllowances = useMemo(() => {
    return computeDailyAllowances(allowanceInfo, calculations.map(c => ({ paidHours: c?.paidHours ?? 0 })));
  }, [allowanceInfo, calculations]);
  
  const getDayWarnings = (day: DayOfWeek): string[] => {
    return operatorCalc?.warnings
      .filter(w => w.startsWith(`${day.toUpperCase()}:`))
      .map(w => w.replace(`${day.toUpperCase()}: `, '')) ?? [];
  };
  
  const weeklyWarnings = operatorCalc?.warnings
    .filter(w => w.startsWith('WEEKLY:'))
    .map(w => w.replace('WEEKLY: ', '')) ?? [];
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (highlight && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlight]);

  if (!roster) return null;

  const handleApplyDefaults = () => {
    if (operator.defaultStartTime || operator.defaultEndTime) {
      onApplyDefaults(
        operator.id,
        operator.workDays,
        operator.defaultStartTime,
        operator.defaultEndTime
      );
      toast.success(`Applied default times to ${operator.workDays.length} days`);
    } else {
      toast.info('No default times configured for this operator');
    }
  };

  const handleSaveSegments = (day: DayOfWeek, segments: Segment[]) => {
    // Apply to all target days
    const days = splitTargetDays.length > 0 ? splitTargetDays : [day];
    days.forEach(d => {
      const dayCalc = calculations[DAYS_OF_WEEK.indexOf(d)];
      const dayPaidMin = dayCalc?.paidMin ?? 0;
      if (dayPaidMin <= 0) return;
      if (d === day) {
        onUpdateShift(operator.id, d, { segments });
      } else {
        // Scale segment minutes proportionally to this day's paid minutes
        const srcTotal = segments.reduce((s, seg) => s + seg.minutes, 0);
        const scaled = segments.map(seg => ({
          ...seg,
          id: crypto.randomUUID(),
          minutes: srcTotal > 0 ? Math.round(seg.minutes / srcTotal * dayPaidMin) : 0,
        }));
        // Fix rounding so total matches exactly
        const scaledTotal = scaled.reduce((s, seg) => s + seg.minutes, 0);
        if (scaled.length > 0 && scaledTotal !== dayPaidMin) {
          scaled[scaled.length - 1].minutes += dayPaidMin - scaledTotal;
        }
        onUpdateShift(operator.id, d, { segments: scaled });
      }
    });
    if (days.length > 1) {
      toast.success(`Split applied to ${days.length} days`);
    }
    setSplitTargetDays([]);
  };

  const handleClearSegments = (day: DayOfWeek) => {
    onUpdateShift(operator.id, day, { segments: undefined });
  };

  const handleSplitClick = (day: DayOfWeek) => {
    setSplitTriggerDay(day);
    setSplitScopeOpen(true);
  };

  const handleScopeConfirm = (days: DayOfWeek[]) => {
    setSplitTargetDays(days);
    if (splitTriggerDay) {
      setSegmentsModalDay(splitTriggerDay);
    }
  };

  // Format rate display for a day — now shows hours × rate
  const formatRateLines = (cost: ShiftCost | null): { lines: string[]; total: number | null } => {
    if (!cost || !cost.hasRate) return { lines: [], total: null };
    if (cost.isSplit && cost.segments.length > 0) {
      const lines = cost.segments.map(s =>
        `${s.paidHours.toFixed(2)}h × ${formatCurrency(s.hourlyRate)}/h`
      );
      return { lines, total: cost.cost };
    }
    if (cost.hourlyRate !== null) {
      const lines = [`${cost.paidHours.toFixed(2)}h × ${formatCurrency(cost.hourlyRate)}/h`];
      return { lines, total: cost.cost };
    }
    return { lines: [], total: null };
  };

  const formatRateBandLabel = (cost: ShiftCost | null): string => {
    if (!cost || !cost.rateBand) return '';
    if (cost.isSplit && cost.segments.length > 1) {
      return 'Split';
    }
    return RATE_BAND_LABELS[cost.rateBand] ?? cost.rateBand;
  };


  return (
    <Card ref={cardRef} className={highlight ? 'ring-2 ring-primary/30 bg-primary/5' : ''}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-3">
            <span>Operator {operator.number} (Level {operator.level.replace('level-', '')})</span>
            {operator.name && (
              <span className="text-muted-foreground font-normal">
                {operator.name}
              </span>
            )}
            <Badge variant={operator.employmentType === 'full-time' ? 'default' : 'secondary'}>
              {SERVICE_CODES[operator.service]}
            </Badge>
            <Badge variant={operator.employmentType === 'full-time' ? 'default' : 'secondary'}>
              {employmentLabels[operator.employmentType]}
            </Badge>
          </CardTitle>
          <div className="flex items-center gap-4">
            {(operator.source !== 'labour-assessment') && (operator.defaultStartTime || operator.defaultEndTime) && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleApplyDefaults}
                className="text-xs"
              >
                <Copy className="h-3 w-3 mr-1" />
                Apply Defaults
              </Button>
            )}
            <div className="flex flex-col items-end gap-0.5">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Weekly:</span>
                <span className="font-mono font-semibold text-lg">
                  {formatDecimalHours(weeklyPaidHours)} hrs
                </span>
              </div>
              {(() => {
                const weeklyWage = DAYS_OF_WEEK.reduce((sum, day, idx) => {
                  const cost = dayCosts[day];
                  const allow = dailyAllowances[idx] ?? 0;
                  return sum + (cost?.cost ?? 0) + allow;
                }, 0);
                return weeklyWage > 0 ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Weekly Wage:</span>
                    <span className="font-mono font-semibold text-lg text-primary">
                      {formatCurrency(weeklyWage)}
                    </span>
                  </div>
                ) : null;
              })()}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Day</TableHead>
              <TableHead className="w-28">
                <div className="flex items-center gap-1">
                  Start
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-3 w-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>24-hour format (e.g., 09:00)</TooltipContent>
                  </Tooltip>
                </div>
              </TableHead>
              <TableHead className="w-28">End</TableHead>
              <TableHead className="w-32">Division</TableHead>
              <TableHead className="min-w-[120px]">Tasks</TableHead>
              <TableHead className="w-24 text-right">Coverage</TableHead>
              <TableHead className="w-24 text-right">Paid</TableHead>
              <TableHead className="w-20">Break</TableHead>
              <TableHead className="w-36">Rate of Pay</TableHead>
              <TableHead className="w-24 text-right">Paid at Rate</TableHead>
              <TableHead className="w-24 text-right">Allowances</TableHead>
              <TableHead className="w-28 text-right">Daily Wage</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {DAYS_OF_WEEK.map((day, index) => {
              const shift = roster.shifts[day];
              const calc = calculations[index];
              const dayWarnings = getDayWarnings(day);
              const resolved = resolveShift(shift.startTime, shift.endTime, operator.employmentType);
              const showStartHelper = operator.employmentType === 'full-time' && !shift.startTime && shift.endTime;
              const showEndHelper = operator.employmentType === 'full-time' && shift.startTime && !shift.endTime;
              const isMultiSegment = hasMultipleSegments(shift.segments);
              const shiftCost = dayCosts[day];
              const hasShift = calc?.isValid && calc.paidMin > 0;

              // Resolve division: prefer shift.division, fall back to operator profile
              const effectiveDivision = shift.division
                || (operator.divisionOverrides && !operator.divisionOverrides.applyAll && operator.divisionOverrides.dayValues[day])
                || operator.defaultDivision
                || '';

              // Per-day allowance using same distribution as DetailedResults
              const dayAllowance = dailyAllowances[index] ?? 0;
              
              return (
                <TableRow key={day}>
                  <TableCell className="font-medium">
                    {DAY_LABELS[day]}
                  </TableCell>
                  <TableCell>
                    <div className="relative space-y-1">
                      <TimeInput
                        value={shift.startTime}
                        onChange={(v) => onUpdateShift(operator.id, day, { startTime: v })}
                        autoCalculated={resolved.isAutoCalcStart}
                        placeholder={resolved.isAutoCalcStart ? resolved.startResolved : "HH:MM"}
                      />
                      {showStartHelper && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Lightbulb className="h-3 w-3" />
                          <span>Auto: ~{resolved.startResolved}</span>
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="relative space-y-1">
                      <TimeInput
                        value={shift.endTime}
                        onChange={(v) => onUpdateShift(operator.id, day, { endTime: v })}
                        autoCalculated={resolved.isAutoCalcEnd}
                        placeholder={resolved.isAutoCalcEnd ? resolved.endResolved : "HH:MM"}
                      />
                      {showEndHelper && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Lightbulb className="h-3 w-3" />
                          <span>Auto: ~{resolved.endResolved}</span>
                        </div>
                      )}
                    </div>
                  </TableCell>
                  {/* Division — display only */}
                  <TableCell>
                    {isMultiSegment ? (
                      <div className="space-y-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="secondary" className="cursor-default">Mixed</Badge>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <div className="space-y-0.5 text-xs">
                              {shift.segments!.map(seg => (
                                <div key={seg.id} className="flex justify-between gap-3">
                                  <span>{seg.divisionId || 'Unassigned'}</span>
                                  <span className="font-mono">{seg.minutes} min</span>
                                </div>
                              ))}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs px-1.5"
                          onClick={() => handleSplitClick(day)}
                        >
                          <Split className="h-3 w-3 mr-1" />
                          Edit
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <span className="text-sm">{effectiveDivision || '—'}</span>
                        {calc?.paidMin > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 text-[10px] px-1 text-muted-foreground"
                            onClick={() => handleSplitClick(day)}
                          >
                            <Split className="h-2.5 w-2.5 mr-0.5" />
                            Split
                          </Button>
                        )}
                      </div>
                    )}
                  </TableCell>
                  {/* Tasks — display only */}
                  <TableCell>
                    {isMultiSegment ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="secondary" className="cursor-default">Multiple</Badge>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <div className="space-y-0.5 text-xs">
                            {shift.segments!.map(seg => (
                              <div key={seg.id}>
                                {seg.task || '(no task)'}
                              </div>
                            ))}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {shift.tasks || '—'}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {calc.isValid ? formatDecimalHours(calc.coverageHours) : '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono font-medium">
                    {calc.isValid ? formatDecimalHours(calc.paidHours) : '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-start gap-2">
                      {calc.hasBreak ? (
                        <Badge variant={calc.isUnpaidBreak ? 'secondary' : 'outline'}>
                          {calc.isUnpaidBreak ? 'Unpaid' : 'Paid'}
                        </Badge>
                      ) : hasShift ? (
                        <span className="text-xs text-muted-foreground">No break</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                  </TableCell>
                  {/* Rate of Pay */}
                  <TableCell>
                    {(() => {
                      const rateInfo = formatRateLines(shiftCost);
                      if (rateInfo.lines.length === 0) return <span className="text-muted-foreground text-xs">—</span>;
                      return (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="space-y-0.5 cursor-default">
                              {rateInfo.lines.map((line, i) => (
                                <div key={i} className="text-xs font-mono font-medium">{line}</div>
                              ))}
                              <div className="text-[10px] text-muted-foreground">
                                {formatRateBandLabel(shiftCost)}
                              </div>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs text-xs">
                            {shiftCost!.isSplit && shiftCost!.segments.length > 0 ? (
                              <div className="space-y-0.5">
                                {shiftCost!.segments.map((s, i) => (
                                  <div key={i} className="flex justify-between gap-3">
                                    <span>{RATE_BAND_LABELS[s.rateBand] ?? s.rateBand}</span>
                                    <span className="font-mono">{s.paidHours.toFixed(2)}h × {formatCurrency(s.hourlyRate)} = {formatCurrency(s.cost)}</span>
                                  </div>
                                ))}
                                <div className="border-t pt-1 font-medium flex justify-between">
                                  <span>Total</span>
                                  <span className="font-mono">{formatCurrency(shiftCost!.cost)}</span>
                                </div>
                              </div>
                            ) : (
                              <div>
                                {formatRateBandLabel(shiftCost)}: {rateInfo.lines[0]} = {formatCurrency(shiftCost!.cost)}
                              </div>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      );
                    })()}
                  </TableCell>
                  {/* Paid at Rate */}
                  <TableCell className="text-right font-mono text-sm">
                    {shiftCost && shiftCost.cost !== null ? (
                      formatCurrency(shiftCost.cost)
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  {/* Allowances */}
                  <TableCell className="text-right">
                    {dayAllowance > 0 ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-xs font-mono cursor-default">{formatCurrency(dayAllowance)}</span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs text-xs">
                          <div className="space-y-0.5">
                            {allowanceInfo!.items.map((item, i) => {
                              const workedCount = calculations.filter(c => c?.paidHours > 0).length;
                              const totalPaidHrs = calculations.reduce((s, c) => s + (c?.paidHours ?? 0), 0);
                              const n = item.name.toLowerCase();
                              const isFlat = n.includes('supervision') || n.includes('leading hand');
                              const share = isFlat
                                ? (totalPaidHrs > 0 ? item.cost * ((calc?.paidHours ?? 0) / totalPaidHrs) : 0)
                                : (workedCount > 0 ? item.cost / workedCount : 0);
                              return (
                                <div key={i} className="flex justify-between gap-3">
                                  <span>{item.name}</span>
                                  <span className="font-mono">{formatCurrency(share)}</span>
                                </div>
                              );
                            })}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  {/* Daily Wage incl. Allowances */}
                  <TableCell className="text-right font-mono font-semibold text-sm">
                    {(() => {
                      const paidAtRate = shiftCost?.cost ?? 0;
                      const dailyTotal = paidAtRate + dayAllowance;
                      return dailyTotal > 0 ? formatCurrency(dailyTotal) : <span className="text-muted-foreground text-xs font-normal">—</span>;
                    })()}
                  </TableCell>
                </TableRow>
              );
            })}
            {/* Day warnings displayed after each row's break column */}
            {DAYS_OF_WEEK.map((day) => {
              const dayWarnings = getDayWarnings(day);
              if (dayWarnings.length === 0) return null;
              return (
                <TableRow key={`warn-${day}`} className="hover:bg-transparent">
                  <TableCell colSpan={13} className="py-1 px-2">
                    <div className="space-y-1">
                      {dayWarnings.map((warning, wIndex) => (
                        <div 
                          key={wIndex} 
                          className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md"
                        >
                          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                          <span>{warning}</span>
                        </div>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {/* Weekly warnings section */}
        {weeklyWarnings.length > 0 && (
          <div className="space-y-2 pt-2 border-t">
            <h4 className="text-sm font-medium text-muted-foreground">Weekly Compliance Warnings</h4>
            {weeklyWarnings.map((warning, index) => (
              <Alert key={index} variant="destructive" className="border-destructive/50 bg-destructive/10">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{warning}</AlertDescription>
              </Alert>
            ))}
          </div>
        )}

        {allowanceInfo && allowanceInfo.items.length > 0 && (
          <div className="space-y-2 pt-2 border-t">
            <h4 className="text-sm font-medium text-muted-foreground">
              Allowances Total: <span className="font-mono font-semibold text-foreground">{formatCurrency(allowanceInfo.totalWeekly)}/week</span>
            </h4>
            <div className="space-y-1">
              {allowanceInfo.items.map((item, i) => (
                <div key={i} className="flex justify-between text-xs text-muted-foreground px-2">
                  <span>{item.name}</span>
                  <span className="font-mono">{item.detail} = {formatCurrency(item.cost)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Split Scope Modal */}
        <SplitScopeModal
          open={splitScopeOpen}
          onOpenChange={setSplitScopeOpen}
          triggerDay={splitTriggerDay || 'mon'}
          workedDays={operator.workDays}
          onConfirm={handleScopeConfirm}
        />

        {/* Segments Modal */}
        {segmentsModalDay && (
          <SegmentsModal
            open={!!segmentsModalDay}
            onOpenChange={(open) => { if (!open) { setSegmentsModalDay(null); setSplitTargetDays([]); } }}
            day={segmentsModalDay}
            paidMinutes={calculations[DAYS_OF_WEEK.indexOf(segmentsModalDay)]?.paidMin ?? 0}
            currentSegments={roster.shifts[segmentsModalDay]?.segments}
            currentDivision={roster.shifts[segmentsModalDay]?.division ?? ''}
            currentTask={roster.shifts[segmentsModalDay]?.tasks ?? ''}
            divisionsList={divisionsList}
            taskLibrary={taskLibrary}
            onAddTask={onAddTask}
            onDeleteTask={onDeleteTask}
            onSave={(segs) => handleSaveSegments(segmentsModalDay, segs)}
            onClear={() => handleClearSegments(segmentsModalDay)}
          />
        )}
      </CardContent>
    </Card>
  );
}
