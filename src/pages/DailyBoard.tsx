import { useState, useMemo } from 'react';
import { format, startOfWeek, addDays } from 'date-fns';
import { Calendar, Filter, SortAsc, AlertTriangle, ChevronDown, ChevronRight, Users, TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useRosterStore } from '@/contexts/RosterContext';
import { calculateDay } from '@/lib/rosterCalculations';
import { DAYS_OF_WEEK, DAY_LABELS, SERVICE_LABELS } from '@/types/roster';
import type { DayOfWeek, ServiceType, OperatorLevel, Operator, ShiftEntry, DayCalculation } from '@/types/roster';
import { useServiceColors, hasSupervisionAllowance, levelNumber } from '@/lib/serviceColors';

type SortOption = 'start-time' | 'operator-number' | 'service';
type GroupByOption = 'none' | 'service' | 'division';

interface DailyShiftRow {
  operator: Operator;
  shift: ShiftEntry;
  calculation: DayCalculation;
  day: DayOfWeek;
}

interface GroupedRows {
  key: string;
  label: string;
  rows: DailyShiftRow[];
}

const LEVEL_LABELS: Record<OperatorLevel, string> = {
  'level-1': 'Level 1',
  'level-2': 'Level 2',
  'level-3': 'Level 3',
  'level-4': 'Level 4',
  'level-5': 'Level 5',
};

// Get day of week from a Date object
function getDayOfWeek(date: Date): DayOfWeek {
  const dayIndex = date.getDay();
  const mapping: DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return mapping[dayIndex];
}

// Timeline bar component for the daily board (compact version)
function CompactTimelineBar({ calculation, serviceColor, showHatch }: { calculation: DayCalculation; serviceColor?: string; showHatch?: boolean }) {
  if (!calculation.isValid || calculation.startMin < 0) {
    return (
      <div className="h-3 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">
        Invalid
      </div>
    );
  }

  const { startMin, coverageMin, hasBreak, isUnpaidBreak, breakStartMin, endMin } = calculation;
  // End == 00:00 with start > 0 means same-day 24:00, NOT overnight
  const endsAtMidnightSameDay = endMin === 0 && startMin > 0;
  const isOvernight = endMin < startMin && coverageMin > 0 && !endsAtMidnightSameDay;
  const displayEndMin = isOvernight ? endMin + 1440 : (endsAtMidnightSameDay ? 1440 : endMin);
  const timelineMaxMin = isOvernight ? 1920 : 1440;
  const totalHours = timelineMaxMin / 60;
  const barWidthMin = Math.min(displayEndMin, timelineMaxMin) - startMin;
  
  const startPercent = (startMin / timelineMaxMin) * 100;
  const widthPercent = (barWidthMin / timelineMaxMin) * 100;
  
  const breakDuration = 30;
  const breakStartPercent = hasBreak ? ((breakStartMin - startMin) / barWidthMin) * 100 : 0;
  const breakWidthPercent = hasBreak ? (breakDuration / barWidthMin) * 100 : 0;

  const midnightPercent = isOvernight ? (24 * 60 / timelineMaxMin) * 100 : 0;

  const currentDay = calculation.day;
  const nextDayIndex = (DAYS_OF_WEEK.indexOf(currentDay) + 1) % 7;
  const nextDay = DAYS_OF_WEEK[nextDayIndex];

  return (
    <div className="space-y-0.5">
      {isOvernight && (
        <div className="relative h-3 text-[9px] text-muted-foreground font-medium">
          <span className="absolute" style={{ right: `${100 - midnightPercent + 1}%` }}>
            {DAY_LABELS[currentDay].slice(0, 3)}
          </span>
          <span className="absolute" style={{ left: `${midnightPercent + 1}%` }}>
            {DAY_LABELS[nextDay].slice(0, 3)}
          </span>
        </div>
      )}
      <div className="relative h-3 bg-muted rounded overflow-visible">
        {/* Hourly grid lines */}
        {Array.from({ length: totalHours - 1 }, (_, i) => i + 1).map(hour => (
          <div
            key={hour}
            className={cn(
              "absolute h-full w-px",
              hour === 24 ? "bg-destructive/60 z-10" : hour % 2 === 0 ? "bg-border/50" : "bg-border/25"
            )}
            style={{ left: `${(hour / totalHours) * 100}%` }}
          />
        ))}
        
        {isOvernight && (
          <div
            className="absolute h-full w-0.5 bg-destructive/70 z-10"
            style={{ left: `${midnightPercent}%` }}
            title="Midnight"
          />
        )}

        <div
          className={cn(
            "absolute h-full rounded-sm",
            !serviceColor && "bg-primary",
            showHatch && "supervision-hatch"
          )}
          style={{
            left: `${startPercent}%`,
            width: `${widthPercent}%`,
            ...(serviceColor ? { backgroundColor: serviceColor } : {}),
          }}
        >
          {hasBreak && (
            <div
              className={cn(
                "absolute h-full",
                isUnpaidBreak ? "bg-muted" : "bg-primary-foreground/30"
              )}
              style={{
                left: `${breakStartPercent}%`,
                width: `${breakWidthPercent}%`,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// Coverage Heatmap component
function CoverageHeatmap({ rows }: { rows: DailyShiftRow[] }) {
  // Generate 30-minute blocks from 00:00 to 24:00
  const blocks = useMemo(() => {
    const result: { time: string; count: number; startMin: number }[] = [];
    
    for (let min = 0; min < 24 * 60; min += 30) {
      const hours = Math.floor(min / 60);
      const mins = min % 60;
      const time = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
      
      // Count operators on site during this block
      let count = 0;
      rows.forEach(row => {
        if (!row.calculation.isValid || row.calculation.coverageMin === 0) return;
        
        const shiftStart = row.calculation.startMin;
        const shiftEnd = shiftStart + row.calculation.coverageMin;
        
        // Check if shift overlaps with this 30-min block [min, min+30)
        if (shiftStart < min + 30 && shiftEnd > min) {
          count++;
        }
      });
      
      result.push({ time, count, startMin: min });
    }
    
    return result;
  }, [rows]);

  const maxCount = Math.max(...blocks.map(b => b.count), 1);
  const peakBlocks = blocks.filter(b => b.count === maxCount && b.count > 0);
  const minActiveCount = Math.min(...blocks.filter(b => b.count > 0).map(b => b.count));
  const quietestBlocks = blocks.filter(b => b.count === minActiveCount && b.count > 0);

  // Only show every 2 hours for labels
  const labeledHours = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Coverage Heatmap (30-min intervals)
          </CardTitle>
          <div className="flex items-center gap-4 text-sm">
            {peakBlocks.length > 0 && (
              <span className="flex items-center gap-1 text-primary">
                <TrendingUp className="h-4 w-4" />
                Peak: {maxCount} @ {peakBlocks[0].time}
              </span>
            )}
            {quietestBlocks.length > 0 && minActiveCount > 0 && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <TrendingDown className="h-4 w-4" />
                Quietest: {minActiveCount} @ {quietestBlocks[0].time}
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {/* Time labels */}
          <div className="flex">
            {labeledHours.map((hour, idx) => (
              <div 
                key={hour} 
                className="text-[10px] text-muted-foreground"
                style={{ 
                  width: idx === labeledHours.length - 1 ? 'auto' : `${(2 / 24) * 100}%`,
                  textAlign: idx === 0 ? 'left' : idx === labeledHours.length - 1 ? 'right' : 'center'
                }}
              >
                {hour.toString().padStart(2, '0')}:00
              </div>
            ))}
          </div>
          
          {/* Heatmap blocks */}
          <div className="flex h-10 rounded overflow-hidden border">
            {blocks.map((block, idx) => {
              const intensity = block.count / maxCount;
              const isPeak = block.count === maxCount && block.count > 0;
              
              return (
                <div
                  key={idx}
                  className={cn(
                    "flex-1 flex items-center justify-center text-[9px] font-medium border-r last:border-r-0 transition-colors",
                    block.count === 0 && "bg-muted text-muted-foreground",
                    block.count > 0 && "text-primary-foreground",
                    isPeak && "ring-1 ring-inset ring-primary-foreground/50"
                  )}
                  style={{
                    backgroundColor: block.count > 0 
                      ? `hsl(var(--primary) / ${0.3 + intensity * 0.7})` 
                      : undefined
                  }}
                  title={`${block.time}: ${block.count} operator${block.count !== 1 ? 's' : ''}`}
                >
                  {block.count > 0 ? block.count : ''}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
            <span>Low coverage</span>
            <div className="flex items-center gap-1">
              <div className="w-4 h-3 rounded bg-primary/30" />
              <div className="w-4 h-3 rounded bg-primary/50" />
              <div className="w-4 h-3 rounded bg-primary/70" />
              <div className="w-4 h-3 rounded bg-primary" />
            </div>
            <span>High coverage</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Grouped section component
function GroupedSection({ 
  group, 
  showTasks,
  defaultOpen = true,
  serviceColors,
}: { 
  group: GroupedRows; 
  showTasks: boolean;
  defaultOpen?: boolean;
  serviceColors: Record<ServiceType, string>;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <div className="flex items-center gap-2 py-3 px-4 bg-muted/50 cursor-pointer hover:bg-muted transition-colors rounded-t-lg">
          {isOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          <span className="font-medium">{group.label}</span>
          <Badge variant="secondary" className="ml-2">
            {group.rows.length} shift{group.rows.length !== 1 ? 's' : ''}
          </Badge>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ShiftTable rows={group.rows} showTasks={showTasks} serviceColors={serviceColors} />
      </CollapsibleContent>
    </Collapsible>
  );
}

// Shift table component
function ShiftTable({ rows, showTasks, serviceColors }: { rows: DailyShiftRow[]; showTasks: boolean; serviceColors: Record<ServiceType, string> }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-24">Service</TableHead>
          <TableHead className="w-28">Operator</TableHead>
          <TableHead className="w-24">Division</TableHead>
          {showTasks && <TableHead className="min-w-[150px]">Tasks</TableHead>}
          <TableHead className="w-20">Start</TableHead>
          <TableHead className="w-20">End</TableHead>
          <TableHead className="w-64">Coverage</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(row => {
          const hasWarnings = row.calculation.warnings.length > 0;
          const isInvalid = !row.calculation.isValid && row.calculation.coverageMin !== 0;
          const color = serviceColors[row.operator.service];
          const hatch = hasSupervisionAllowance(row.operator);
          
          return (
            <TableRow 
              key={row.operator.id}
              className={cn(
                isInvalid && "bg-destructive/10"
              )}
            >
              <TableCell>
                <Badge variant="outline" className="font-normal">
                  {SERVICE_LABELS[row.operator.service]}
                </Badge>
              </TableCell>
              <TableCell className="font-mono font-medium">
                #{row.operator.number} (L{levelNumber(row.operator.level)})
              </TableCell>
              <TableCell>
                {row.shift.segments && row.shift.segments.length > 1 ? (
                  <span className="text-xs font-medium" title={row.shift.segments.map(s => `${s.divisionId || 'Unassigned'} – ${s.minutes}min`).join('\n')}>Mixed</span>
                ) : (
                  row.shift.division || <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              {showTasks && (
                <TableCell>
                  {row.shift.tasks ? (
                    <div className="text-sm whitespace-pre-wrap max-w-[200px] line-clamp-2" title={row.shift.tasks}>
                      {row.shift.tasks}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              )}
              <TableCell className="font-mono">
                {row.calculation.startTime || '—'}
              </TableCell>
              <TableCell className="font-mono">
                {row.calculation.endTime || '—'}
              </TableCell>
              <TableCell>
                <div className="space-y-1">
                  <CompactTimelineBar calculation={row.calculation} serviceColor={color} showHatch={hatch} />
                  {hasWarnings && (
                    <div className="flex items-start gap-1 text-xs text-destructive">
                      <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                      <span className="truncate" title={row.calculation.warnings.join('; ')}>
                        {row.calculation.warnings[0]}
                      </span>
                    </div>
                  )}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export default function DailyBoard() {
  const { operators, rosters, isLoaded } = useRosterStore();
  const { colors: serviceColors } = useServiceColors();
  
  // Default to Monday of current week
  const defaultDate = startOfWeek(new Date(), { weekStartsOn: 1 });
  const [selectedDate, setSelectedDate] = useState<Date>(defaultDate);
  const [calendarOpen, setCalendarOpen] = useState(false);
  
  // Filters
  const [serviceFilter, setServiceFilter] = useState<ServiceType | 'all'>('all');
  const [divisionFilter, setDivisionFilter] = useState<string>('all');
  const [classificationFilter, setClassificationFilter] = useState<OperatorLevel | 'all'>('all');
  const [showOnlyRostered, setShowOnlyRostered] = useState(true);
  
  // Sorting & Grouping
  const [sortBy, setSortBy] = useState<SortOption>('start-time');
  const [groupBy, setGroupBy] = useState<GroupByOption>('none');
  const [showTasks, setShowTasks] = useState(true);

  // Get all unique divisions from rosters
  const allDivisions = useMemo(() => {
    const divisions = new Set<string>();
    rosters.forEach(roster => {
      Object.values(roster.shifts).forEach(shift => {
        if (shift.division) {
          divisions.add(shift.division);
        }
      });
    });
    return Array.from(divisions).sort();
  }, [rosters]);

  // Build the daily shift rows
  const dailyShiftRows = useMemo((): DailyShiftRow[] => {
    const day = getDayOfWeek(selectedDate);
    const prevDay = DAYS_OF_WEEK[(DAYS_OF_WEEK.indexOf(day) - 1 + 7) % 7];
    const rows: DailyShiftRow[] = [];

    operators.forEach(operator => {
      const roster = rosters.find(r => r.operatorId === operator.id);
      if (!roster) return;

      const shift = roster.shifts[day];
      const calculation = calculateDay(day, shift, operator.employmentType, operator.service);

      rows.push({
        operator,
        shift,
        calculation,
        day,
      });

      // Add overnight spill from previous day
      const prevShift = roster.shifts[prevDay];
      const prevCalc = calculateDay(prevDay, prevShift, operator.employmentType, operator.service);
      if (prevCalc.isValid && prevCalc.coverageMin > 0 && prevCalc.endMin < prevCalc.startMin) {
        const spillCalc: DayCalculation = {
          ...prevCalc,
          day,
          startMin: 0,
          endMin: prevCalc.endMin,
          coverageMin: prevCalc.endMin,
          coverageHours: prevCalc.endMin / 60,
          paidMin: 0,
          paidHours: 0,
          hasBreak: false,
          isUnpaidBreak: false,
          breakStartMin: 0,
          warnings: [],
          isAutoCalculated: false,
          isAutoCalcStart: false,
          isAutoCalcEnd: false,
        };
        rows.push({
          operator,
          shift: prevShift,
          calculation: spillCalc,
          day,
        });
      }
    });

    return rows;
  }, [operators, rosters, selectedDate]);

  // Apply filters
  const filteredRows = useMemo(() => {
    return dailyShiftRows.filter(row => {
      // Show only rostered filter
      if (showOnlyRostered && row.calculation.coverageMin === 0) {
        return false;
      }

      // Service filter
      if (serviceFilter !== 'all' && row.operator.service !== serviceFilter) {
        return false;
      }

      // Division filter
      if (divisionFilter !== 'all' && row.shift.division !== divisionFilter) {
        return false;
      }

      // Classification filter
      if (classificationFilter !== 'all' && row.operator.level !== classificationFilter) {
        return false;
      }

      return true;
    });
  }, [dailyShiftRows, showOnlyRostered, serviceFilter, divisionFilter, classificationFilter]);

  // Apply sorting
  const sortedRows = useMemo(() => {
    const sorted = [...filteredRows];
    
    switch (sortBy) {
      case 'start-time':
        sorted.sort((a, b) => {
          // Non-rostered shifts go to the end
          if (a.calculation.startMin < 0 && b.calculation.startMin >= 0) return 1;
          if (b.calculation.startMin < 0 && a.calculation.startMin >= 0) return -1;
          return a.calculation.startMin - b.calculation.startMin;
        });
        break;
      case 'operator-number':
        sorted.sort((a, b) => a.operator.number - b.operator.number);
        break;
      case 'service':
        sorted.sort((a, b) => a.operator.service.localeCompare(b.operator.service));
        break;
    }

    return sorted;
  }, [filteredRows, sortBy]);

  // Apply grouping
  const groupedRows = useMemo((): GroupedRows[] => {
    if (groupBy === 'none') {
      return [{ key: 'all', label: 'All Shifts', rows: sortedRows }];
    }

    const groups = new Map<string, DailyShiftRow[]>();

    sortedRows.forEach(row => {
      let key: string;
      let label: string;

      if (groupBy === 'service') {
        key = row.operator.service;
        label = SERVICE_LABELS[row.operator.service];
      } else {
        key = row.shift.division || 'unassigned';
        label = row.shift.division || 'Unassigned';
      }

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(row);
    });

    return Array.from(groups.entries())
      .map(([key, rows]) => ({
        key,
        label: groupBy === 'service' 
          ? SERVICE_LABELS[key as ServiceType] || key
          : key === 'unassigned' ? 'Unassigned' : key,
        rows,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [sortedRows, groupBy]);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const selectedDayLabel = DAY_LABELS[getDayOfWeek(selectedDate)];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Daily Roster Board</h1>
          <p className="text-muted-foreground">
            Visual shift coverage for {selectedDayLabel}, {format(selectedDate, 'MMMM d, yyyy')}
          </p>
        </div>
        
        {/* Date selector */}
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-[240px] justify-start text-left font-normal">
              <Calendar className="mr-2 h-4 w-4" />
              {format(selectedDate, 'EEEE, MMM d, yyyy')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <CalendarComponent
              mode="single"
              selected={selectedDate}
              onSelect={(date) => {
                if (date) {
                  setSelectedDate(date);
                  setCalendarOpen(false);
                }
              }}
              initialFocus
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Quick day navigation */}
      <div className="flex flex-wrap gap-2">
        {DAYS_OF_WEEK.map((day, index) => {
          const dayDate = addDays(startOfWeek(selectedDate, { weekStartsOn: 1 }), index);
          const isSelected = getDayOfWeek(selectedDate) === day;
          
          return (
            <Button
              key={day}
              variant={isSelected ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedDate(dayDate)}
            >
              {DAY_LABELS[day].slice(0, 3)}
            </Button>
          );
        })}
      </div>

      {/* Coverage Heatmap */}
      <CoverageHeatmap rows={filteredRows} />

      {/* Filters and Sorting */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters & Sorting
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
            {/* Sort */}
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground flex items-center gap-1">
                <SortAsc className="h-3 w-3" />
                Sort by
              </Label>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="start-time">Start Time</SelectItem>
                  <SelectItem value="operator-number">Operator #</SelectItem>
                  <SelectItem value="service">Service (A-Z)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Group by */}
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Group by</Label>
              <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupByOption)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="service">Service</SelectItem>
                  <SelectItem value="division">Division</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Service Filter */}
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Service</Label>
              <Select value={serviceFilter} onValueChange={(v) => setServiceFilter(v as ServiceType | 'all')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Services</SelectItem>
                  {Object.entries(SERVICE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Division Filter */}
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Division</Label>
              <Select value={divisionFilter} onValueChange={setDivisionFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Divisions</SelectItem>
                  {allDivisions.map(div => (
                    <SelectItem key={div} value={div}>{div}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Classification Filter */}
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Classification</Label>
              <Select value={classificationFilter} onValueChange={(v) => setClassificationFilter(v as OperatorLevel | 'all')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Levels</SelectItem>
                  <SelectItem value="level-1">Level 1</SelectItem>
                  <SelectItem value="level-2">Level 2</SelectItem>
                  <SelectItem value="level-3">Level 3</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Show only rostered toggle */}
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Display</Label>
              <div className="flex items-center space-x-2 h-10">
                <Switch
                  id="show-rostered"
                  checked={showOnlyRostered}
                  onCheckedChange={setShowOnlyRostered}
                />
                <Label htmlFor="show-rostered" className="text-sm cursor-pointer">
                  Rostered only
                </Label>
              </div>
            </div>

            {/* Show tasks toggle */}
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Tasks</Label>
              <div className="flex items-center space-x-2 h-10">
                <Switch
                  id="show-tasks"
                  checked={showTasks}
                  onCheckedChange={setShowTasks}
                />
                <Label htmlFor="show-tasks" className="text-sm cursor-pointer">
                  Show tasks
                </Label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timeline legend */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span className="font-medium">Gantt Timeline:</span>
        <span>00:00</span>
        <div className="flex-1 h-4 bg-muted rounded relative">
          {Array.from({ length: 23 }, (_, i) => i + 1).map(hour => (
            <div
              key={hour}
              className={cn(
                "absolute h-full w-px",
                hour % 2 === 0 ? "bg-border/60" : "bg-border/30"
              )}
              style={{ left: `${(hour / 24) * 100}%` }}
            />
          ))}
          <span className="absolute text-[10px] text-muted-foreground" style={{ left: '25%', transform: 'translateX(-50%)', top: '-14px' }}>06:00</span>
          <span className="absolute text-[10px] text-muted-foreground" style={{ left: '50%', transform: 'translateX(-50%)', top: '-14px' }}>12:00</span>
          <span className="absolute text-[10px] text-muted-foreground" style={{ left: '75%', transform: 'translateX(-50%)', top: '-14px' }}>18:00</span>
        </div>
        <span>24:00</span>
        <div className="flex items-center gap-3 ml-4 border-l pl-4">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-primary" />
            <span>Work</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-muted border" />
            <span>Break (unpaid)</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-primary/60" />
            <span>Break (paid)</span>
          </span>
        </div>
      </div>

      {/* Main roster content */}
      {sortedRows.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12 text-muted-foreground">
              {operators.length === 0 
                ? 'No operators have been added yet.'
                : 'No shifts match the current filters.'}
            </div>
          </CardContent>
        </Card>
      ) : groupBy === 'none' ? (
        <Card>
          <CardContent className="pt-6">
            <ShiftTable rows={sortedRows} showTasks={showTasks} serviceColors={serviceColors} />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groupedRows.map(group => (
            <Card key={group.key}>
              <GroupedSection group={group} showTasks={showTasks} serviceColors={serviceColors} />
            </Card>
          ))}
        </div>
      )}

      {/* Summary */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Showing {sortedRows.length} of {dailyShiftRows.length} shifts
        </span>
        <span>
          {sortedRows.filter(r => r.calculation.coverageMin > 0).length} active shifts
        </span>
      </div>
    </div>
  );
}
