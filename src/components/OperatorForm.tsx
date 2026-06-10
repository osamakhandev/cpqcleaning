import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { TaskCombobox } from '@/components/TaskCombobox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { TimeInput } from '@/components/TimeInput';
import { resolveShift } from '@/lib/resolveShift';
import { Lightbulb } from 'lucide-react';
import type {
  Operator,
  EmploymentType,
  OperatorLevel,
  DayOfWeek,
  ServiceType,
  SecurityAllowances,
  CleaningAllowances,
  DayOverrides,
  ShiftTimeOverride,
} from '@/types/roster';
import {
  DAYS_OF_WEEK,
  DAY_LABELS,
  SERVICE_LABELS,
  DEFAULT_SECURITY_ALLOWANCES,
  DEFAULT_CLEANING_ALLOWANCES,
  DEFAULT_DAY_OVERRIDES,
} from '@/types/roster';

interface OperatorFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  operator?: Operator;
  divisions?: string[];
  taskLibrary?: string[];
  onAddTask?: (task: string) => void;
  onDeleteTask?: (task: string) => void;
  onSubmit: (data: {
    name: string;
    employmentType: EmploymentType;
    level: OperatorLevel;
    service: ServiceType;
    isFixedNights: boolean;
    defaultStartTime: string;
    defaultEndTime: string;
    workDays: DayOfWeek[];
    useShiftTimeOverrides?: boolean;
    shiftTimeOverrides?: Partial<Record<DayOfWeek, ShiftTimeOverride>>;
    weeksPerYear?: number;
    securityAllowances?: SecurityAllowances;
    cleaningAllowances?: CleaningAllowances;
    defaultDivision: string;
    divisionOverrides: DayOverrides<string>;
    defaultTasks: string;
    tasksOverrides: DayOverrides<string>;
  }) => void;
}

const DEFAULT_WORK_DAYS: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri'];

const SERVICE_OPTIONS: ServiceType[] = ['cleaning', 'customer-service', 'security', 'maintenance', 'landscape', 'management'];

const LEVEL_LABELS: Record<OperatorLevel, string> = {
  'level-1': 'Level 1',
  'level-2': 'Level 2',
  'level-3': 'Level 3',
  'level-4': 'Level 4',
  'level-5': 'Level 5',
};

// Day selector sub-component for allowance day selection
function DaySelector({
  dayMode,
  days,
  onModeChange,
  onDaysChange,
}: {
  dayMode?: 'all' | 'select';
  days?: DayOfWeek[];
  onModeChange: (mode: 'all' | 'select') => void;
  onDaysChange: (days: DayOfWeek[]) => void;
}) {
  return (
    <div className="ml-6 space-y-1 mt-1">
      <div className="flex items-center gap-2">
        <Checkbox
          checked={dayMode === 'select'}
          onCheckedChange={(v) => onModeChange(v ? 'select' : 'all')}
        />
        <span className="text-xs text-muted-foreground">Select specific days (default: all worked days)</span>
      </div>
      {dayMode === 'select' && (
        <div className="flex gap-1 flex-wrap">
          {DAYS_OF_WEEK.map((d) => (
            <div
              key={d}
              className={`px-2 py-0.5 text-xs rounded cursor-pointer border transition-colors ${
                (days ?? []).includes(d)
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-muted/50 border-border hover:bg-muted'
              }`}
              onClick={() => {
                const current = days ?? [];
                onDaysChange(current.includes(d) ? current.filter((x) => x !== d) : [...current, d]);
              }}
            >
              {DAY_LABELS[d].slice(0, 3)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Summary line helpers
function divisionSummary(defaultDiv: string, overrides: DayOverrides<string>): string {
  if (!defaultDiv && overrides.applyAll) return 'Not set';
  let s = defaultDiv ? `Default: ${defaultDiv}` : 'No default';
  if (!overrides.applyAll && overrides.overrideDays.length > 0) {
    s += ` (overrides: ${overrides.overrideDays.map((d) => DAY_LABELS[d].slice(0, 3)).join(', ')})`;
  }
  return s;
}

function tasksSummary(defaultTasks: string, overrides: DayOverrides<string>): string {
  if (!defaultTasks && overrides.applyAll) return 'No tasks set';
  let s = defaultTasks ? `Default: ${defaultTasks}` : 'No default';
  if (!overrides.applyAll && overrides.overrideDays.length > 0) {
    s += ` (overrides: ${overrides.overrideDays.map((d) => DAY_LABELS[d].slice(0, 3)).join(', ')})`;
  }
  return s;
}

function allowanceSummaryText(
  service: ServiceType,
  secAllowances: SecurityAllowances,
  clnAllowances: CleaningAllowances,
): string {
  if (service === 'security') {
    const active: string[] = [];
    if (secAllowances.aviationAllowance) active.push('Aviation');
    if (secAllowances.brokenShift) active.push('Broken Shift');
    if (secAllowances.firstAid) active.push('First Aid');
    if (secAllowances.firearm) active.push('Firearm');
    if (secAllowances.supervisionBand !== 'none') active.push('Supervision');
    return active.length ? active.join(', ') : 'None';
  }
  if (service === 'cleaning') {
    const active: string[] = [];
    if (clnAllowances.toiletCleaning) active.push('Toilet');
    if (clnAllowances.refuseCollection) active.push('Refuse');
    if (clnAllowances.leadingHandBand !== 'none') active.push('Leading Hand');
    if (clnAllowances.firstAid) active.push('First Aid');
    if (clnAllowances.brokenShift) active.push('Broken Shift');
    if (clnAllowances.coldPlaces) active.push('Cold');
    if (clnAllowances.hotPlaces46to54 || clnAllowances.hotPlacesAbove54) active.push('Hot');
    if (clnAllowances.heightBelow22 || clnAllowances.heightAbove22) active.push('Height');
    return active.length ? active.join(', ') : 'None';
  }
  return 'N/A';
}

export function OperatorForm({ open, onOpenChange, operator, divisions: divisionsList, taskLibrary = [], onAddTask, onDeleteTask, onSubmit }: OperatorFormProps) {
  const [name, setName] = useState(operator?.name ?? '');
  const [employmentType, setEmploymentType] = useState<EmploymentType>(operator?.employmentType ?? 'full-time');
  const [level, setLevel] = useState<OperatorLevel>(operator?.level ?? 'level-1');
  const [service, setService] = useState<ServiceType>(operator?.service ?? 'cleaning');
  const [isFixedNights, setIsFixedNights] = useState(operator?.isFixedNights ?? false);
  const [defaultStartTime, setDefaultStartTime] = useState(operator?.defaultStartTime ?? '');
  const [defaultEndTime, setDefaultEndTime] = useState(operator?.defaultEndTime ?? '');
  const [workDays, setWorkDays] = useState<DayOfWeek[]>(operator?.workDays ?? DEFAULT_WORK_DAYS);
  const [useShiftTimeOverrides, setUseShiftTimeOverrides] = useState(operator?.useShiftTimeOverrides ?? false);
  const [shiftTimeOverrides, setShiftTimeOverrides] = useState<Partial<Record<DayOfWeek, ShiftTimeOverride>>>(operator?.shiftTimeOverrides ?? {});
  const [weeksPerYear, setWeeksPerYear] = useState<number>(operator?.weeksPerYear ?? 52.14);
  const [secAllowances, setSecAllowances] = useState<SecurityAllowances>(operator?.securityAllowances ?? { ...DEFAULT_SECURITY_ALLOWANCES });
  const [clnAllowances, setClnAllowances] = useState<CleaningAllowances>(operator?.cleaningAllowances ?? { ...DEFAULT_CLEANING_ALLOWANCES });

  // Division state
  const [defaultDivision, setDefaultDivision] = useState(operator?.defaultDivision ?? '');
  const [divisionOverrides, setDivisionOverrides] = useState<DayOverrides<string>>(operator?.divisionOverrides ?? { ...DEFAULT_DAY_OVERRIDES });

  // Tasks state
  const [defaultTasks, setDefaultTasks] = useState(operator?.defaultTasks ?? '');
  const [tasksOverrides, setTasksOverrides] = useState<DayOverrides<string>>(operator?.tasksOverrides ?? { ...DEFAULT_DAY_OVERRIDES });

  useEffect(() => {
    if (open) {
      setName(operator?.name ?? '');
      setEmploymentType(operator?.employmentType ?? 'full-time');
      setLevel(operator?.level ?? 'level-1');
      setService(operator?.service ?? 'cleaning');
      setIsFixedNights(operator?.isFixedNights ?? false);
      setDefaultStartTime(operator?.defaultStartTime ?? '');
      setDefaultEndTime(operator?.defaultEndTime ?? '');
      setWorkDays(operator?.workDays ?? DEFAULT_WORK_DAYS);
      setUseShiftTimeOverrides(operator?.useShiftTimeOverrides ?? false);
      setShiftTimeOverrides(operator?.shiftTimeOverrides ?? {});
      setWeeksPerYear(operator?.weeksPerYear ?? 52.14);
      setSecAllowances(operator?.securityAllowances ?? { ...DEFAULT_SECURITY_ALLOWANCES });
      setClnAllowances(operator?.cleaningAllowances ?? { ...DEFAULT_CLEANING_ALLOWANCES });
      setDefaultDivision(operator?.defaultDivision ?? '');
      setDivisionOverrides(operator?.divisionOverrides ?? { ...DEFAULT_DAY_OVERRIDES });
      setDefaultTasks(operator?.defaultTasks ?? '');
      setTasksOverrides(operator?.tasksOverrides ?? { ...DEFAULT_DAY_OVERRIDES });
    }
  }, [open, operator]);

  useEffect(() => {
    const fiveLevelServices: ServiceType[] = ['security', 'maintenance', 'management'];
    if (!fiveLevelServices.includes(service) && (level === 'level-4' || level === 'level-5')) {
      setLevel('level-3');
    }
  }, [service, level]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Auto-capture tasks to library on submit
    if (defaultTasks.trim()) onAddTask?.(defaultTasks.trim());
    if (!tasksOverrides.applyAll) {
      Object.values(tasksOverrides.dayValues).forEach(v => {
        if (v && v.trim()) onAddTask?.(v.trim());
      });
    }
    onSubmit({
      name: name.trim(),
      employmentType,
      level,
      service,
      isFixedNights,
      defaultStartTime,
      defaultEndTime,
      workDays,
      useShiftTimeOverrides,
      shiftTimeOverrides: useShiftTimeOverrides ? shiftTimeOverrides : undefined,
      weeksPerYear: employmentType === 'casual' ? weeksPerYear : undefined,
      securityAllowances: service === 'security' ? secAllowances : undefined,
      cleaningAllowances: service === 'cleaning' ? clnAllowances : undefined,
      defaultDivision,
      divisionOverrides,
      defaultTasks,
      tasksOverrides,
    });
    onOpenChange(false);
  };

  const toggleDay = (day: DayOfWeek) => {
    setWorkDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  };

  const fiveLevelServices: ServiceType[] = ['security', 'maintenance', 'management'];
  const extendedLevels: OperatorLevel[] = ['level-1', 'level-2', 'level-3', 'level-4', 'level-5'];
  const standardLevels: OperatorLevel[] = ['level-1', 'level-2', 'level-3'];
  const availableLevels = fiveLevelServices.includes(service) ? extendedLevels : standardLevels;

  const updateSec = <K extends keyof SecurityAllowances>(key: K, value: SecurityAllowances[K]) => {
    setSecAllowances((prev) => ({ ...prev, [key]: value }));
  };
  const updateCln = <K extends keyof CleaningAllowances>(key: K, value: CleaningAllowances[K]) => {
    setClnAllowances((prev) => ({ ...prev, [key]: value }));
  };

  const toggleOverrideDay = (
    overrides: DayOverrides<string>,
    setOverrides: React.Dispatch<React.SetStateAction<DayOverrides<string>>>,
    day: DayOfWeek,
  ) => {
    setOverrides((prev) => {
      const has = prev.overrideDays.includes(day);
      const newDays = has ? prev.overrideDays.filter((d) => d !== day) : [...prev.overrideDays, day];
      const newValues = { ...prev.dayValues };
      if (has) delete newValues[day];
      else if (!newValues[day]) newValues[day] = '';
      return { ...prev, overrideDays: newDays, dayValues: newValues };
    });
  };

  const hasAllowances = service === 'security' || service === 'cleaning';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{operator ? `Edit Operator ${operator.number}` : 'Add Operator'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Top section - unchanged fields */}
          <div className="space-y-2">
            <Label htmlFor="name">Name (optional)</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., John Smith" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="service">Service</Label>
            <Select value={service} onValueChange={(v) => setService(v as ServiceType)}>
              <SelectTrigger id="service"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SERVICE_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>{SERVICE_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="employment">Employment Type</Label>
            <Select value={employmentType} onValueChange={(v) => setEmploymentType(v as EmploymentType)}>
              <SelectTrigger id="employment"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="full-time">Full Time</SelectItem>
                <SelectItem value="part-time">Part Time</SelectItem>
                <SelectItem value="casual">Casual</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="level">Level</Label>
            <Select value={level} onValueChange={(v) => setLevel(v as OperatorLevel)}>
              <SelectTrigger id="level"><SelectValue /></SelectTrigger>
              <SelectContent>
                {availableLevels.map((l) => (
                  <SelectItem key={l} value={l}>{LEVEL_LABELS[l]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="fixedNights" className="cursor-pointer">Fixed Nights</Label>
              <p className="text-xs text-muted-foreground">Permanently assigned to night shifts (ends ≤08:00)</p>
            </div>
            <Switch id="fixedNights" checked={isFixedNights} onCheckedChange={setIsFixedNights} />
          </div>

          <div className="space-y-2">
            <Label>Work Days</Label>
            <p className="text-xs text-muted-foreground mb-2">Select the days this operator is scheduled to work</p>
            <div className="grid grid-cols-7 gap-1">
              {DAYS_OF_WEEK.map((day) => (
                <div
                  key={day}
                  className={`flex flex-col items-center p-2 rounded-md border cursor-pointer transition-colors ${
                    workDays.includes(day) ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/50 border-border hover:bg-muted'
                  }`}
                  onClick={() => toggleDay(day)}
                >
                  <span className="text-xs font-medium">{DAY_LABELS[day].slice(0, 3)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Default Shift Times</Label>
            <p className="text-xs text-muted-foreground mb-2">Set preferred start and end times for this operator</p>
            {(() => {
              const defaultResolved = resolveShift(defaultStartTime, defaultEndTime, employmentType);
              const showDefaultStartHint = employmentType === 'full-time' && !defaultStartTime && defaultEndTime;
              const showDefaultEndHint = employmentType === 'full-time' && defaultStartTime && !defaultEndTime;
              return (
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <Label htmlFor="startTime" className="text-xs text-muted-foreground">Start</Label>
                    <TimeInput
                      value={defaultStartTime}
                      onChange={setDefaultStartTime}
                      autoCalculated={defaultResolved.isAutoCalcStart}
                      placeholder={defaultResolved.isAutoCalcStart ? defaultResolved.startResolved : "09:00"}
                      className="w-full"
                    />
                    {showDefaultStartHint && (
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                        <Lightbulb className="h-3 w-3" />
                        <span>Auto: ~{defaultResolved.startResolved}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <Label htmlFor="endTime" className="text-xs text-muted-foreground">End</Label>
                    <TimeInput
                      value={defaultEndTime}
                      onChange={setDefaultEndTime}
                      autoCalculated={defaultResolved.isAutoCalcEnd}
                      placeholder={defaultResolved.isAutoCalcEnd ? defaultResolved.endResolved : "17:00"}
                      className="w-full"
                    />
                    {showDefaultEndHint && (
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                        <Lightbulb className="h-3 w-3" />
                        <span>Auto: ~{defaultResolved.endResolved}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Per-day shift time overrides toggle */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="shiftOverrides" className="cursor-pointer">Assign different shift times by day</Label>
              <p className="text-xs text-muted-foreground">Override start/end times for specific workdays</p>
            </div>
            <Switch id="shiftOverrides" checked={useShiftTimeOverrides} onCheckedChange={setUseShiftTimeOverrides} />
          </div>

          {useShiftTimeOverrides && (
            <div className="space-y-2 border rounded-lg p-3">
              {DAYS_OF_WEEK.filter(d => workDays.includes(d)).map((day) => {
                const override = shiftTimeOverrides[day];
                const effectiveStart = override?.startTime ?? '';
                const effectiveEnd = override?.endTime ?? '';
                const resolved = resolveShift(effectiveStart, effectiveEnd, employmentType);
                const showStartHint = employmentType === 'full-time' && !effectiveStart && effectiveEnd;
                const showEndHint = employmentType === 'full-time' && effectiveStart && !effectiveEnd;
                return (
                  <div key={day} className="flex items-center gap-2">
                    <span className="text-xs font-medium w-10">{DAY_LABELS[day].slice(0, 3)}</span>
                    <div className="flex-1">
                      <TimeInput
                        value={effectiveStart}
                        onChange={(v) => setShiftTimeOverrides(prev => ({ ...prev, [day]: { ...prev[day], startTime: v, endTime: prev[day]?.endTime ?? '' } }))}
                        autoCalculated={resolved.isAutoCalcStart}
                        placeholder={resolved.isAutoCalcStart ? resolved.startResolved : (defaultStartTime || 'Start')}
                        className="w-full h-7 text-xs"
                      />
                      {showStartHint && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                          <Lightbulb className="h-3 w-3" />
                          <span>Auto: ~{resolved.startResolved}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <TimeInput
                        value={effectiveEnd}
                        onChange={(v) => setShiftTimeOverrides(prev => ({ ...prev, [day]: { ...prev[day], endTime: v, startTime: prev[day]?.startTime ?? '' } }))}
                        autoCalculated={resolved.isAutoCalcEnd}
                        placeholder={resolved.isAutoCalcEnd ? resolved.endResolved : (defaultEndTime || 'End')}
                        className="w-full h-7 text-xs"
                      />
                      {showEndHint && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                          <Lightbulb className="h-3 w-3" />
                          <span>Auto: ~{resolved.endResolved}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground">Leave blank to use default times</p>
            </div>
          )}

          {/* Casual weeks per year */}
          {employmentType === 'casual' && (
            <div className="space-y-2">
              <Label htmlFor="weeksPerYear">Weeks per year required</Label>
              <p className="text-xs text-muted-foreground">For periodical services (default 52.14 = every week)</p>
              <Input
                id="weeksPerYear"
                type="number"
                min={0}
                max={52.14}
                step={0.01}
                value={weeksPerYear}
                onChange={(e) => setWeeksPerYear(parseFloat(e.target.value) || 0)}
                className="font-mono w-32"
              />
            </div>
          )}

          {/* Accordion sections */}
          <Accordion type="multiple" className="w-full">
            {/* Allowances accordion */}
            {hasAllowances && (
              <AccordionItem value="allowances">
                <AccordionTrigger className="py-3 text-sm">
                  <div className="flex flex-col items-start text-left">
                    <span className="font-semibold">Allowances</span>
                    <span className="text-xs text-muted-foreground font-normal">
                      {allowanceSummaryText(service, secAllowances, clnAllowances)}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  {service === 'security' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1">
                          <span className="text-sm font-medium">Aviation Allowance</span>
                          <p className="text-xs text-muted-foreground">$2.02 per hour</p>
                        </div>
                        <Checkbox checked={secAllowances.aviationAllowance} onCheckedChange={(v) => updateSec('aviationAllowance', !!v)} />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1">
                          <span className="text-sm font-medium">Broken Shift</span>
                          <p className="text-xs text-muted-foreground">$17.47 per broken shift</p>
                        </div>
                        <Checkbox checked={secAllowances.brokenShift} onCheckedChange={(v) => updateSec('brokenShift', !!v)} />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1">
                          <span className="text-sm font-medium">First Aid</span>
                          <p className="text-xs text-muted-foreground">$7.33/shift (max $36.46/week)</p>
                        </div>
                        <Checkbox checked={secAllowances.firstAid} onCheckedChange={(v) => updateSec('firstAid', !!v)} />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1">
                          <span className="text-sm font-medium">Firearm</span>
                          <p className="text-xs text-muted-foreground">$3.67/shift (max $18.34/week)</p>
                        </div>
                        <Checkbox checked={secAllowances.firearm} onCheckedChange={(v) => updateSec('firearm', !!v)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-sm">Supervision</Label>
                        <Select value={secAllowances.supervisionBand} onValueChange={(v) => updateSec('supervisionBand', v as SecurityAllowances['supervisionBand'])}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            <SelectItem value="1-5">1–5 employees ($45.52/wk)</SelectItem>
                            <SelectItem value="6-10">6–10 employees ($52.53/wk)</SelectItem>
                            <SelectItem value="11-20">11–20 employees ($68.17/wk)</SelectItem>
                            <SelectItem value=">20">&gt;20 employees ($80.46/wk)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                  {service === 'cleaning' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1">
                          <span className="text-sm font-medium">Toilet Cleaning</span>
                          <p className="text-xs text-muted-foreground">$3.53/shift (max $17.35/week)</p>
                        </div>
                        <Checkbox checked={clnAllowances.toiletCleaning} onCheckedChange={(v) => updateCln('toiletCleaning', !!v)} />
                      </div>
                      {clnAllowances.toiletCleaning && (
                        <DaySelector dayMode={clnAllowances.toiletCleaningDayMode} days={clnAllowances.toiletCleaningDays} onModeChange={(v) => updateCln('toiletCleaningDayMode', v)} onDaysChange={(v) => updateCln('toiletCleaningDays', v)} />
                      )}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1">
                          <span className="text-sm font-medium">Refuse Collection</span>
                          <p className="text-xs text-muted-foreground">$4.48 per shift</p>
                        </div>
                        <Checkbox checked={clnAllowances.refuseCollection} onCheckedChange={(v) => updateCln('refuseCollection', !!v)} />
                      </div>
                      {clnAllowances.refuseCollection && (
                        <DaySelector dayMode={clnAllowances.refuseCollectionDayMode} days={clnAllowances.refuseCollectionDays} onModeChange={(v) => updateCln('refuseCollectionDayMode', v)} onDaysChange={(v) => updateCln('refuseCollectionDays', v)} />
                      )}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1">
                            <Label className="text-sm">Leading Hand</Label>
                            <p className="text-xs text-muted-foreground">Daily rate (weekly ÷ 5)</p>
                          </div>
                        </div>
                        <Select value={clnAllowances.leadingHandBand} onValueChange={(v) => updateCln('leadingHandBand', v as CleaningAllowances['leadingHandBand'])}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            <SelectItem value="1-10">1–10 employees ($58.93/wk → $11.79/day)</SelectItem>
                            <SelectItem value="11-20">11–20 employees ($75.83/wk → $15.17/day)</SelectItem>
                            <SelectItem value=">20">&gt;20 employees ($92.72/wk → $18.54/day)</SelectItem>
                          </SelectContent>
                        </Select>
                        {clnAllowances.leadingHandBand !== 'none' && (
                          <DaySelector dayMode={clnAllowances.leadingHandDayMode} days={clnAllowances.leadingHandDays} onModeChange={(v) => updateCln('leadingHandDayMode', v)} onDaysChange={(v) => updateCln('leadingHandDays', v)} />
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1">
                          <span className="text-sm font-medium">Hot Places (&gt;54°C)</span>
                          <p className="text-xs text-muted-foreground">$0.80 per hour</p>
                        </div>
                        <Checkbox checked={clnAllowances.hotPlacesAbove54} onCheckedChange={(v) => updateCln('hotPlacesAbove54', !!v)} />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1">
                          <span className="text-sm font-medium">Hot Places (46–54°C)</span>
                          <p className="text-xs text-muted-foreground">$0.66 per hour</p>
                        </div>
                        <Checkbox checked={clnAllowances.hotPlaces46to54} onCheckedChange={(v) => updateCln('hotPlaces46to54', !!v)} />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1">
                          <span className="text-sm font-medium">Height (above 22nd floor)</span>
                          <p className="text-xs text-muted-foreground">$2.17 per hour</p>
                        </div>
                        <Checkbox checked={clnAllowances.heightAbove22} onCheckedChange={(v) => updateCln('heightAbove22', !!v)} />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1">
                          <span className="text-sm font-medium">Height (≤22nd floor)</span>
                          <p className="text-xs text-muted-foreground">$1.06 per hour</p>
                        </div>
                        <Checkbox checked={clnAllowances.heightBelow22} onCheckedChange={(v) => updateCln('heightBelow22', !!v)} />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1">
                          <span className="text-sm font-medium">First Aid</span>
                          <p className="text-xs text-muted-foreground">$16.11/week → $3.22/day</p>
                        </div>
                        <Checkbox checked={clnAllowances.firstAid} onCheckedChange={(v) => updateCln('firstAid', !!v)} />
                      </div>
                      {clnAllowances.firstAid && (
                        <DaySelector dayMode={clnAllowances.firstAidDayMode} days={clnAllowances.firstAidDays} onModeChange={(v) => updateCln('firstAidDayMode', v)} onDaysChange={(v) => updateCln('firstAidDays', v)} />
                      )}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1">
                          <span className="text-sm font-medium">Cold Places</span>
                          <p className="text-xs text-muted-foreground">$0.66 per hour</p>
                        </div>
                        <Checkbox checked={clnAllowances.coldPlaces} onCheckedChange={(v) => updateCln('coldPlaces', !!v)} />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1">
                          <span className="text-sm font-medium">Broken Shift</span>
                          <p className="text-xs text-muted-foreground">$4.50/day (max $22.49/week)</p>
                        </div>
                        <Checkbox checked={clnAllowances.brokenShift} onCheckedChange={(v) => updateCln('brokenShift', !!v)} />
                      </div>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            )}

            {/* Division accordion */}
            <AccordionItem value="division">
              <AccordionTrigger className="py-3 text-sm">
                <div className="flex flex-col items-start text-left">
                  <span className="font-semibold">Division</span>
                  <span className="text-xs text-muted-foreground font-normal">
                    {divisionSummary(defaultDivision, divisionOverrides)}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Default Division</Label>
                    {divisionsList && divisionsList.length > 0 ? (
                      <Select value={defaultDivision || '__none__'} onValueChange={(v) => setDefaultDivision(v === '__none__' ? '' : v)}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select division..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— None —</SelectItem>
                          {divisionsList.map((d) => (
                            <SelectItem key={d} value={d}>{d}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-xs text-muted-foreground italic py-1">No divisions created – go to Divisions Settings to add</p>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Apply to all worked days</span>
                    <Switch
                      checked={divisionOverrides.applyAll}
                      onCheckedChange={(v) => setDivisionOverrides((prev) => ({ ...prev, applyAll: v }))}
                    />
                  </div>
                  {!divisionOverrides.applyAll && (
                    <div className="space-y-2">
                      <div className="flex gap-1 flex-wrap">
                        {DAYS_OF_WEEK.map((d) => (
                          <div
                            key={d}
                            className={`px-2 py-0.5 text-xs rounded cursor-pointer border transition-colors ${
                              divisionOverrides.overrideDays.includes(d)
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-muted/50 border-border hover:bg-muted'
                            }`}
                            onClick={() => toggleOverrideDay(divisionOverrides, setDivisionOverrides, d)}
                          >
                            {DAY_LABELS[d].slice(0, 3)}
                          </div>
                        ))}
                      </div>
                      {divisionOverrides.overrideDays.map((d) => (
                        <div key={d} className="flex items-center gap-2">
                          <span className="text-xs font-medium w-8">{DAY_LABELS[d].slice(0, 3)}</span>
                          {divisionsList && divisionsList.length > 0 ? (
                            <Select
                              value={divisionOverrides.dayValues[d] || '__none__'}
                              onValueChange={(v) =>
                                setDivisionOverrides((prev) => ({
                                  ...prev,
                                  dayValues: { ...prev.dayValues, [d]: v === '__none__' ? '' : v },
                                }))
                              }
                            >
                              <SelectTrigger className="h-7 text-xs flex-1"><SelectValue placeholder="Select..." /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">— None —</SelectItem>
                                {divisionsList.map((div) => (
                                  <SelectItem key={div} value={div}>{div}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <p className="text-xs text-muted-foreground italic flex-1 py-1">No divisions created</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Tasks accordion */}
            <AccordionItem value="tasks">
              <AccordionTrigger className="py-3 text-sm">
                <div className="flex flex-col items-start text-left">
                  <span className="font-semibold">Tasks</span>
                  <span className="text-xs text-muted-foreground font-normal">
                    {tasksSummary(defaultTasks, tasksOverrides)}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Default Tasks</Label>
                    <TaskCombobox
                      value={defaultTasks}
                      onChange={setDefaultTasks}
                      taskLibrary={taskLibrary}
                      onAddTask={onAddTask}
                      onDeleteTask={onDeleteTask}
                      placeholder="Select or type task..."
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Apply to all worked days</span>
                    <Switch
                      checked={tasksOverrides.applyAll}
                      onCheckedChange={(v) => setTasksOverrides((prev) => ({ ...prev, applyAll: v }))}
                    />
                  </div>
                  {!tasksOverrides.applyAll && (
                    <div className="space-y-2">
                      <div className="flex gap-1 flex-wrap">
                        {DAYS_OF_WEEK.map((d) => (
                          <div
                            key={d}
                            className={`px-2 py-0.5 text-xs rounded cursor-pointer border transition-colors ${
                              tasksOverrides.overrideDays.includes(d)
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-muted/50 border-border hover:bg-muted'
                            }`}
                            onClick={() => toggleOverrideDay(tasksOverrides, setTasksOverrides, d)}
                          >
                            {DAY_LABELS[d].slice(0, 3)}
                          </div>
                        ))}
                      </div>
                      {tasksOverrides.overrideDays.map((d) => (
                        <div key={d} className="space-y-1">
                          <span className="text-xs font-medium">{DAY_LABELS[d].slice(0, 3)}</span>
                          <TaskCombobox
                            value={tasksOverrides.dayValues[d] ?? ''}
                            onChange={(v) =>
                              setTasksOverrides((prev) => ({
                                ...prev,
                                dayValues: { ...prev.dayValues, [d]: v },
                              }))
                            }
                            taskLibrary={taskLibrary}
                            onAddTask={onAddTask}
                            onDeleteTask={onDeleteTask}
                            placeholder={defaultTasks || 'Tasks'}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">{operator ? 'Update' : 'Add Operator'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
