import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Filter, SortAsc, ChevronDown, ChevronRight, Users, CalendarDays, AlertTriangle, Columns3, RotateCcw, Save, BookmarkCheck, Trash2, Plus, Maximize, Minimize, Copy, Download, ZoomIn } from 'lucide-react';
import HowItWorks from '@/components/HowItWorks';
import { HELP_CONTENT } from '@/data/helpContent';
import html2canvas from 'html2canvas';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useRosterStore } from '@/contexts/RosterContext';
import { calculateDay, calculateOperatorWeek } from '@/lib/rosterCalculations';
import { DAYS_OF_WEEK, DAY_LABELS, SERVICE_LABELS } from '@/types/roster';
import type { DayOfWeek, ServiceType, OperatorLevel, Operator, ShiftEntry, DayCalculation } from '@/types/roster';
import { useServiceColors, hasSupervisionAllowance } from '@/lib/serviceColors';


type SortOption = 'start-time' | 'service' | 'service-start-time';

const LEVEL_LABELS: Record<OperatorLevel, string> = {
  'level-1': 'L1',
  'level-2': 'L2',
  'level-3': 'L3',
  'level-4': 'L4',
  'level-5': 'L5',
};

const EMP_LABELS: Record<string, string> = {
  'full-time': 'FT',
  'part-time': 'PT',
  'casual': 'Cas',
};

const SHORT_DAY: Record<DayOfWeek, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
};

// ── Saved Views ──

const SAVED_VIEWS_KEY = 'cpq-weekly-board-saved-views';

interface SavedViewState {
  sortBy: SortOption;
  serviceFilter: string;
  startTimeFilter: string;
  showOnlyRostered: boolean;
  hiddenCols: string[];
}

interface SavedView {
  id: string;
  name: string;
  state: SavedViewState;
  createdAt: string;
}

function loadSavedViews(): SavedView[] {
  try {
    const raw = localStorage.getItem(SAVED_VIEWS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function persistSavedViews(views: SavedView[]) {
  localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(views));
}

// ── Data types ──

interface OperatorDayData {
  shift: ShiftEntry;
  calculation: DayCalculation;
  isSpillover?: boolean;
}

interface OperatorRow {
  operator: Operator;
  days: Record<DayOfWeek, OperatorDayData>;
}

interface DayTimelineConfig {
  startHour: number;
  endHour: number;
  hasOvernight: boolean;
}

interface ServiceGroup {
  service: ServiceType;
  label: string;
  rows: OperatorRow[];
  dayTotal: { operators: number; paidHours: number };
}

// ── Darken a hex/hsl colour for break hatching ──
function darkenColor(color: string, amount: number): string {
  // Handle hex colours
  if (color.startsWith('#')) {
    const hex = color.replace('#', '');
    const r = Math.max(0, parseInt(hex.substring(0, 2), 16) - Math.round(255 * amount));
    const g = Math.max(0, parseInt(hex.substring(2, 4), 16) - Math.round(255 * amount));
    const b = Math.max(0, parseInt(hex.substring(4, 6), 16) - Math.round(255 * amount));
    return `rgb(${r},${g},${b})`;
  }
  // Fallback: just return a semi-transparent black overlay effect
  return `rgba(0,0,0,${amount})`;
}

// ── Timeline bar per cell ──

function CellTimelineBar({
  calculation,
  config,
  serviceColor,
  showHatch,
}: {
  calculation: DayCalculation;
  config: DayTimelineConfig;
  serviceColor?: string;
  showHatch?: boolean;
}) {
  if (!calculation.isValid || calculation.coverageMin <= 0) {
    return <div className="h-4 bg-muted rounded" />;
  }

  const { startMin, endMin, coverageMin, hasBreak, isUnpaidBreak, breakStartMin } = calculation;
  // End == 00:00 with start > 0 means same-day 24:00, NOT overnight
  const endsAtMidnightSameDay = endMin === 0 && startMin > 0;
  const isOvernight = endMin < startMin && coverageMin > 0 && !endsAtMidnightSameDay;
  const displayEndMin = isOvernight ? endMin + 1440 : (endsAtMidnightSameDay ? 1440 : endMin);

  const windowStartMin = config.startHour * 60;
  const windowEndMin = config.endHour * 60;
  const windowSpan = windowEndMin - windowStartMin;

  const barStart = Math.max(startMin - windowStartMin, 0);
  const barEnd = Math.min(displayEndMin - windowStartMin, windowSpan);
  const barWidth = barEnd - barStart;

  if (barWidth <= 0) return <div className="h-4 bg-muted rounded" />;

  const startPct = (barStart / windowSpan) * 100;
  const widthPct = (barWidth / windowSpan) * 100;

  const breakDuration = 30;
  const breakRelStart = hasBreak ? breakStartMin - startMin : 0;
  const breakStartPct = hasBreak ? (breakRelStart / barWidth) * 100 : 0;
  const breakWidthPct = hasBreak ? (breakDuration / barWidth) * 100 : 0;

  const totalDisplayHours = config.endHour - config.startHour;

  return (
    <div className="relative h-full bg-muted/40 rounded overflow-hidden">
      {/* Hour grid lines */}
      {Array.from({ length: totalDisplayHours }, (_, i) => {
        const hour = config.startHour + i + 1;
        const pct = ((i + 1) / totalDisplayHours) * 100;
        const isMidnight = hour === 24;
        return (
          <div
            key={i}
            className={cn(
              "absolute h-full w-px",
              isMidnight ? "bg-destructive/60 z-10" : hour % 2 === 0 ? "bg-border/40" : "bg-border/20"
            )}
            style={{ left: `${pct}%` }}
          />
        );
      })}

      {/* Shift bar */}
      <div
        className={cn(
          "absolute h-full rounded-sm",
          !serviceColor && "bg-primary",
          showHatch && "supervision-hatch"
        )}
        style={{
          left: `${startPct}%`,
          width: `${widthPct}%`,
          ...(serviceColor ? { backgroundColor: serviceColor } : {}),
        }}
      >
        {hasBreak && (() => {
          const base = serviceColor || 'hsl(187, 65%, 35%)';
          const darkerColor = darkenColor(base, 0.2);
          return (
            <div
              className="absolute h-full"
              style={{
                left: `${breakStartPct}%`,
                width: `${breakWidthPct}%`,
                backgroundColor: base,
                backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 2px, ${darkerColor} 2px, ${darkerColor} 4px)`,
              }}
            />
          );
        })()}
      </div>
    </div>
  );
}

// ── 15-minute coverage heatmap ──

function DayHeatmap15({
  rows,
  config,
}: {
  rows: { calculation: DayCalculation; isSpillover?: boolean }[];
  config: DayTimelineConfig;
}) {
  const blocks = useMemo(() => {
    const result: { time: string; count: number }[] = [];
    const windowStartMin = config.startHour * 60;
    const windowEndMin = config.endHour * 60;

    for (let min = windowStartMin; min < windowEndMin; min += 15) {
      const displayHour = Math.floor(min / 60) % 24;
      const displayMin = min % 60;
      const time = `${displayHour.toString().padStart(2, '0')}:${displayMin.toString().padStart(2, '0')}`;

      let count = 0;
      rows.forEach(({ calculation: calc, isSpillover }) => {
        if (!calc.isValid || calc.coverageMin <= 0) return;

        let shiftStart = calc.startMin;
        let shiftEnd: number;

        if (isSpillover) {
          shiftStart = 1440;
          shiftEnd = 1440 + calc.endMin;
        } else {
          const endsAtMidnightSameDay = calc.endMin === 0 && calc.startMin > 0;
          const isOvernight = calc.endMin < calc.startMin && !endsAtMidnightSameDay;
          shiftEnd = isOvernight ? calc.endMin + 1440 : (endsAtMidnightSameDay ? 1440 : calc.endMin);
        }

        if (shiftStart < min + 15 && shiftEnd > min) {
          count++;
        }
      });

      result.push({ time, count });
    }
    return result;
  }, [rows, config]);

  const maxCount = Math.max(...blocks.map(b => b.count), 1);
  const hasAnyActivity = blocks.some(b => b.count > 0);

  return (
    <TooltipProvider delayDuration={100}>
      <div className="flex h-4 rounded overflow-hidden border">
        {blocks.map((block, idx) => {
          const intensity = block.count / maxCount;
          const isGap = block.count === 0 && hasAnyActivity;

          return (
            <Tooltip key={idx}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "flex-1 transition-colors",
                    block.count === 0 && "bg-muted",
                    isGap && "bg-destructive/30"
                  )}
                  style={{
                    backgroundColor: block.count > 0
                      ? `hsl(var(--primary) / ${0.3 + intensity * 0.7})`
                      : undefined,
                  }}
                />
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs px-2 py-1">
                {block.time}: {block.count} op{block.count !== 1 ? 's' : ''}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

// ── Main component ──

export default function WeeklyBoard() {
  const { operators, rosters, isLoaded } = useRosterStore();
  const { colors: serviceColors } = useServiceColors();

  // Selected day (typical week, no calendar dates)
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>('mon');

  // Filters
  const [serviceFilter, setServiceFilter] = useState<ServiceType | 'all'>('all');
  const [startTimeFilter, setStartTimeFilter] = useState<string>('all');
  const showOnlyRostered = true; // Always show rostered only on this page

  // Column visibility
  type HideableCol = 'service' | 'lvl' | 'status' | 'division' | 'tasks' | 'day2start' | 'day2end';
  const ALL_HIDEABLE: { id: HideableCol; label: string }[] = [
    { id: 'service', label: 'Service' },
    { id: 'lvl', label: 'Lvl' },
    { id: 'status', label: 'Status' },
    { id: 'division', label: 'Division' },
    { id: 'tasks', label: 'Tasks' },
    { id: 'day2start', label: 'Day 2 Start' },
    { id: 'day2end', label: 'Day 2 End' },
  ];
  const [hiddenCols, setHiddenCols] = useState<Set<HideableCol>>(new Set());

  const toggleCol = (col: HideableCol) => {
    setHiddenCols(prev => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col); else next.add(col);
      return next;
    });
  };

  const show = (col: HideableCol) => !hiddenCols.has(col);

  // Sorting
  const [sortBy, setSortBy] = useState<SortOption>('start-time');

  // Collapsed service groups
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ── Full Screen Graph Mode ──
  const [fullScreenMode, setFullScreenMode] = useState(false);
  const [fitToScreen, setFitToScreen] = useState(false);
  
  const graphRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!fullScreenMode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullScreenMode(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [fullScreenMode]);

  const handleCopyAsImage = useCallback(async () => {
    if (!graphRef.current) return;
    try {
      const canvas = await html2canvas(graphRef.current, {
        backgroundColor: null,
        scale: 2,
        useCORS: true,
      });
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob }),
          ]);
        } catch {
          // Fallback: download
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'labour-deployment.png';
          a.click();
          URL.revokeObjectURL(url);
        }
      }, 'image/png');
    } catch (err) {
      console.error('Failed to capture image', err);
    }
  }, []);

  const handleDownloadPng = useCallback(async () => {
    if (!graphRef.current) return;
    try {
      const canvas = await html2canvas(graphRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
      });
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = 'labour-deployment.png';
      a.click();
    } catch (err) {
      console.error('Failed to download image', err);
    }
  }, []);

  // ── Saved Views ──
  const [savedViews, setSavedViews] = useState<SavedView[]>(() => loadSavedViews());
  const [saveViewName, setSaveViewName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);

  const getCurrentViewState = useCallback((): SavedViewState => ({
    sortBy,
    serviceFilter,
    startTimeFilter,
    showOnlyRostered,
    hiddenCols: Array.from(hiddenCols),
  }), [sortBy, serviceFilter, startTimeFilter, showOnlyRostered, hiddenCols]);

  const handleSaveView = useCallback(() => {
    const name = saveViewName.trim();
    if (!name) return;
    const newView: SavedView = {
      id: crypto.randomUUID(),
      name,
      state: getCurrentViewState(),
      createdAt: new Date().toISOString(),
    };
    const updated = [...savedViews, newView];
    setSavedViews(updated);
    persistSavedViews(updated);
    setSaveViewName('');
    setShowSaveInput(false);
  }, [saveViewName, getCurrentViewState, savedViews]);

  const handleLoadView = useCallback((view: SavedView) => {
    const s = view.state;
    setSortBy(s.sortBy);
    setServiceFilter(s.serviceFilter as ServiceType | 'all');
    setStartTimeFilter(s.startTimeFilter);
    // showOnlyRostered is always true on this page
    setHiddenCols(new Set(s.hiddenCols as HideableCol[]));
  }, []);

  const handleDeleteView = useCallback((id: string) => {
    const updated = savedViews.filter(v => v.id !== id);
    setSavedViews(updated);
    persistSavedViews(updated);
  }, [savedViews]);

  // ── Build per-operator, per-day data ──

  const operatorRows = useMemo((): OperatorRow[] => {
    return operators.map(operator => {
      const roster = rosters.find(r => r.operatorId === operator.id);
      const days = {} as Record<DayOfWeek, OperatorDayData>;

      DAYS_OF_WEEK.forEach(day => {
        const shift = roster?.shifts[day] ?? { startTime: '', endTime: '', division: '', tasks: '' };
        const calculation = calculateDay(day, shift, operator.employmentType, operator.service);
        days[day] = { shift, calculation };
      });

      return { operator, days };
    });
  }, [operators, rosters]);

  // ── Compute warnings per operator (uses same logic as Results) ──
  const warningMap = useMemo(() => {
    const map = new Map<string, string[]>();
    operators.forEach(op => {
      const roster = rosters.find(r => r.operatorId === op.id);
      if (!roster) return;
      const weekCalc = calculateOperatorWeek(roster, op.employmentType, DAYS_OF_WEEK, op.service, op.weeksPerYear);
      map.set(op.id, weekCalc.warnings);
    });
    return map;
  }, [operators, rosters]);

  const totalWarnings = useMemo(() => {
    let count = 0;
    warningMap.forEach(w => { count += w.length; });
    return count;
  }, [warningMap]);

  // ── Compute timeline config for the selected day ──

  const dayConfig = useMemo((): DayTimelineConfig => {
    const day = selectedDay;
    const idx = DAYS_OF_WEEK.indexOf(day);
    let earliestStart = 24 * 60;
    let latestEnd = 0;
    let hasOvernight = false;

    operatorRows.forEach(row => {
      const calc = row.days[day]?.calculation;
      if (!calc?.isValid || calc.coverageMin <= 0) return;

      if (calc.startMin < earliestStart) earliestStart = calc.startMin;

      const isON = calc.endMin < calc.startMin;
      if (isON) {
        hasOvernight = true;
        const extEnd = calc.endMin + 1440;
        if (extEnd > latestEnd) latestEnd = extEnd;
      } else {
        if (calc.endMin > latestEnd) latestEnd = calc.endMin;
      }
    });

    // Check previous day for overnight spilling into this day
    const prevDay = DAYS_OF_WEEK[(idx - 1 + 7) % 7];
    operatorRows.forEach(row => {
      const prevCalc = row.days[prevDay]?.calculation;
      if (prevCalc?.isValid && prevCalc.coverageMin > 0 && prevCalc.endMin < prevCalc.startMin) {
        if (0 < earliestStart) earliestStart = 0;
        if (prevCalc.endMin > latestEnd) latestEnd = Math.max(latestEnd, prevCalc.endMin);
      }
    });

    if (earliestStart >= 24 * 60) {
      return { startHour: 0, endHour: 24, hasOvernight: false };
    }

    let startHour = Math.max(0, Math.floor(earliestStart / 60) - 1);
    let endHour = Math.min(hasOvernight ? 32 : 24, Math.ceil(latestEnd / 60) + 1);

    if (endHour - startHour < 8) {
      endHour = Math.min(startHour + 12, hasOvernight ? 32 : 24);
    }

    return { startHour, endHour, hasOvernight };
  }, [operatorRows, selectedDay]);

  // ── Filter ──

  const filteredRows = useMemo(() => {
    return operatorRows.filter(row => {
      if (serviceFilter !== 'all' && row.operator.service !== serviceFilter) return false;

      if (startTimeFilter !== 'all') {
        const calc = row.days[selectedDay]?.calculation;
        if (!calc?.isValid || calc.coverageMin <= 0) return false;
        const h = Math.floor(calc.startMin / 60);
        switch (startTimeFilter) {
          case 'early': if (h >= 6) return false; break;
          case 'morning': if (h < 6 || h >= 12) return false; break;
          case 'afternoon': if (h < 12 || h >= 18) return false; break;
          case 'evening': if (h < 18) return false; break;
        }
      }

      if (showOnlyRostered) {
        const calc = row.days[selectedDay]?.calculation;
        if (!calc?.coverageMin || calc.coverageMin <= 0) return false;
      }

      return true;
    });
  }, [operatorRows, serviceFilter, startTimeFilter, showOnlyRostered, selectedDay]);

  // ── Sort ──

  const sortedRows = useMemo(() => {
    const sorted = [...filteredRows];
    const getStart = (row: OperatorRow) => {
      const c = row.days[selectedDay]?.calculation;
      return c?.isValid && c.coverageMin > 0 ? c.startMin : 9999;
    };
    switch (sortBy) {
      case 'start-time':
        sorted.sort((a, b) => getStart(a) - getStart(b) || a.operator.number - b.operator.number);
        break;
      case 'service':
        sorted.sort((a, b) => a.operator.service.localeCompare(b.operator.service) || a.operator.number - b.operator.number);
        break;
      case 'service-start-time':
        sorted.sort((a, b) => a.operator.service.localeCompare(b.operator.service) || getStart(a) - getStart(b) || a.operator.number - b.operator.number);
        break;
    }
    return sorted;
  }, [filteredRows, sortBy, selectedDay]);

  // ── Group by service ──

  const serviceGroups = useMemo((): ServiceGroup[] => {
    const groupMap = new Map<ServiceType, OperatorRow[]>();

    sortedRows.forEach(row => {
      const svc = row.operator.service;
      if (!groupMap.has(svc)) groupMap.set(svc, []);
      groupMap.get(svc)!.push(row);
    });

    return Array.from(groupMap.entries()).map(([service, rows]) => {
      let ops = 0;
      let paidMin = 0;
      rows.forEach(row => {
        const calc = row.days[selectedDay]?.calculation;
        if (calc?.isValid && calc.coverageMin > 0) {
          ops++;
          paidMin += calc.paidMin;
        }
      });

      return {
        service,
        label: SERVICE_LABELS[service],
        rows,
        dayTotal: { operators: ops, paidHours: paidMin / 60 },
      };
    });
  }, [sortedRows, selectedDay]);

  // ── Coverage data for heatmap ──

  const heatmapData = useMemo(() => {
    const day = selectedDay;
    const idx = DAYS_OF_WEEK.indexOf(day);
    const entries: { calculation: DayCalculation; isSpillover?: boolean }[] = [];

    filteredRows.forEach(row => {
      const calc = row.days[day]?.calculation;
      if (calc?.isValid && calc.coverageMin > 0) {
        entries.push({ calculation: calc });
      }
    });

    // Spillover from previous day
    const prevDay = DAYS_OF_WEEK[(idx - 1 + 7) % 7];
    filteredRows.forEach(row => {
      const prevCalc = row.days[prevDay]?.calculation;
      if (prevCalc?.isValid && prevCalc.coverageMin > 0 && prevCalc.endMin < prevCalc.startMin) {
        entries.push({
          calculation: {
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
          },
          isSpillover: true,
        });
      }
    });

    return entries;
  }, [filteredRows, selectedDay]);

  // ── Compute combined timeline title for identical days ──

  const timelineTitle = useMemo(() => {
    // Build a fingerprint for each day based on what would be displayed
    const fingerprints = new Map<DayOfWeek, string>();

    DAYS_OF_WEEK.forEach(day => {
      const dayFiltered = operatorRows.filter(row => {
        if (serviceFilter !== 'all' && row.operator.service !== serviceFilter) return false;
        if (startTimeFilter !== 'all') {
          const calc = row.days[day]?.calculation;
          if (!calc?.isValid || calc.coverageMin <= 0) return false;
          const h = Math.floor(calc.startMin / 60);
          switch (startTimeFilter) {
            case 'early': if (h >= 6) return false; break;
            case 'morning': if (h < 6 || h >= 12) return false; break;
            case 'afternoon': if (h < 12 || h >= 18) return false; break;
            case 'evening': if (h < 18) return false; break;
          }
        }
        if (showOnlyRostered) {
          const calc = row.days[day]?.calculation;
          if (!calc?.coverageMin || calc.coverageMin <= 0) return false;
        }
        return true;
      });

      const daySorted = [...dayFiltered];
      const getStart = (row: OperatorRow) => {
        const c = row.days[day]?.calculation;
        return c?.isValid && c.coverageMin > 0 ? c.startMin : 9999;
      };
      switch (sortBy) {
        case 'start-time':
          daySorted.sort((a, b) => getStart(a) - getStart(b) || a.operator.number - b.operator.number);
          break;
        case 'service':
          daySorted.sort((a, b) => a.operator.service.localeCompare(b.operator.service) || a.operator.number - b.operator.number);
          break;
        case 'service-start-time':
          daySorted.sort((a, b) => a.operator.service.localeCompare(b.operator.service) || getStart(a) - getStart(b) || a.operator.number - b.operator.number);
          break;
      }

      const fp = daySorted.map(row => {
        const calc = row.days[day]?.calculation;
        const shift = row.days[day]?.shift;
        const hasShift = calc?.isValid && calc.coverageMin > 0;
        return `${row.operator.id}|${row.operator.service}|${hasShift ? calc!.startMin : '-'}|${hasShift ? calc!.endMin : '-'}|${shift?.division || ''}|${shift?.tasks || ''}`;
      }).join(';;');

      fingerprints.set(day, fp);
    });

    const selectedFp = fingerprints.get(selectedDay)!;
    const identicalDays = DAYS_OF_WEEK.filter(day => fingerprints.get(day) === selectedFp);

    if (identicalDays.length <= 1) {
      return `${SHORT_DAY[selectedDay]} — Timeline`;
    }

    return `${identicalDays.map(d => SHORT_DAY[d]).join('-')} — Timeline`;
  }, [operatorRows, serviceFilter, startTimeFilter, showOnlyRostered, sortBy, selectedDay]);

  // ── Stats ──

  const totalShifts = sortedRows.filter(row => {
    const c = row.days[selectedDay]?.calculation;
    return c?.isValid && c.coverageMin > 0;
  }).length;

  // ── Timeline hour labels ──

  const hourLabels = useMemo(() => {
    const labels: { hour: number; label: string; pct: number }[] = [];
    const span = dayConfig.endHour - dayConfig.startHour;
    for (let h = dayConfig.startHour; h <= dayConfig.endHour; h += 2) {
      const displayH = h % 24;
      labels.push({
        hour: h,
        label: `${displayH.toString().padStart(2, '0')}:00`,
        pct: ((h - dayConfig.startHour) / span) * 100,
      });
    }
    return labels;
  }, [dayConfig]);

  const selectedDayIdx = DAYS_OF_WEEK.indexOf(selectedDay);
  const nextDayLabel = SHORT_DAY[DAYS_OF_WEEK[(selectedDayIdx + 1) % 7]];

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // fullScreenMode is used to conditionally hide UI chrome below

  const mainContent = (
    <div className={cn("space-y-4", fullScreenMode && "p-4")}>
      {/* Header – hidden in full screen */}
      {!fullScreenMode && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <CalendarDays className="h-6 w-6" />
                Labour Deployment Graphs
              </h1>
              <p className="text-muted-foreground text-sm">
                Typical week model · Read-only view
              </p>
            </div>
            <HowItWorks {...HELP_CONTENT["labour-deployment-graphs"]} size="sm" />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setFullScreenMode(true)} className="gap-1.5">
              <Maximize className="h-4 w-4" />
              Full Screen
            </Button>
          </div>
        </div>
      )}

      {/* Day selector tabs */}
      <div className="flex gap-1 border rounded-lg p-1 bg-muted/30 w-fit">
        {DAYS_OF_WEEK.map((day) => {
          const isSelected = day === selectedDay;
          return (
            <button
              key={day}
              onClick={() => setSelectedDay(day)}
              className={cn(
                "px-5 py-2 rounded-md font-medium transition-all",
                isSelected
                  ? "bg-primary text-primary-foreground shadow-md text-base font-bold ring-2 ring-primary/30"
                  : "text-muted-foreground text-sm hover:text-foreground hover:bg-muted/50"
              )}
            >
              {SHORT_DAY[day]}
            </button>
          );
        })}
      </div>

      {/* Stats – hidden in full screen */}
      {!fullScreenMode && (
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span>
              <strong>{sortedRows.length}</strong> operators · <strong>{totalShifts}</strong> shifts on {SHORT_DAY[selectedDay]}
            </span>
          </div>
          {totalWarnings > 0 && (
            <div className="flex items-center gap-1.5 text-warning">
              <AlertTriangle className="h-4 w-4" />
              <span><strong>{totalWarnings}</strong> warning{totalWarnings !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>
      )}

      {/* Refine View – hidden in full screen */}
      {!fullScreenMode && (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Refine View
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Adjust filters and sorting to explore labour deployment</p>
            </div>
            <div className="flex items-center gap-2">
              {/* Saved Views */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 text-xs px-3 gap-1.5">
                    <BookmarkCheck className="h-3 w-3" />
                    Views{savedViews.length > 0 && ` (${savedViews.length})`}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-3" align="end">
                  <div className="space-y-3">
                    <p className="text-xs font-medium text-muted-foreground">Saved Views</p>

                    {savedViews.length === 0 && !showSaveInput && (
                      <p className="text-xs text-muted-foreground italic">No saved views yet</p>
                    )}

                    {savedViews.map(view => (
                      <div key={view.id} className="flex items-center justify-between gap-2 group">
                        <button
                          className="text-xs text-left hover:text-primary truncate flex-1 py-0.5"
                          onClick={() => handleLoadView(view)}
                          title={`Load "${view.name}"`}
                        >
                          {view.name}
                        </button>
                        <button
                          className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                          onClick={() => handleDeleteView(view.id)}
                          title="Delete view"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}

                    {showSaveInput ? (
                      <div className="flex items-center gap-1.5">
                        <Input
                          placeholder="View name..."
                          value={saveViewName}
                          onChange={(e) => setSaveViewName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleSaveView(); if (e.key === 'Escape') setShowSaveInput(false); }}
                          className="h-7 text-xs flex-1"
                          autoFocus
                        />
                        <Button size="sm" className="h-7 text-xs px-2" onClick={handleSaveView} disabled={!saveViewName.trim()}>
                          <Save className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs w-full gap-1.5"
                        onClick={() => setShowSaveInput(true)}
                      >
                        <Plus className="h-3 w-3" />
                        Save current view
                      </Button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              {/* Reset */}
              {(sortBy !== 'start-time' || serviceFilter !== 'all' || startTimeFilter !== 'all' || hiddenCols.size > 0) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs px-3 gap-1.5"
                  onClick={() => {
                    setSortBy('start-time');
                    setServiceFilter('all');
                    setStartTimeFilter('all');
                    setHiddenCols(new Set());
                  }}
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <SortAsc className="h-3 w-3" />
                Sort by
              </Label>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                <SelectTrigger className="h-8 text-xs w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="start-time">Start Time</SelectItem>
                  <SelectItem value="service">Service</SelectItem>
                  <SelectItem value="service-start-time">Service / Start Time</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Service</Label>
              <Select value={serviceFilter} onValueChange={(v) => setServiceFilter(v as ServiceType | 'all')}>
                <SelectTrigger className="h-8 text-xs w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Services</SelectItem>
                  {Object.entries(SERVICE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Start time</Label>
              <Select value={startTimeFilter} onValueChange={setStartTimeFilter}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All times</SelectItem>
                  <SelectItem value="early">Before 06:00</SelectItem>
                  <SelectItem value="morning">06:00–12:00</SelectItem>
                  <SelectItem value="afternoon">12:00–18:00</SelectItem>
                  <SelectItem value="evening">After 18:00</SelectItem>
                </SelectContent>
              </Select>
            </div>


          {/* Columns control */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <Columns3 className="h-3 w-3" />
              Columns
            </Label>
            <div className="flex items-center gap-2 h-8">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 text-[11px] px-2">
                    <Columns3 className="h-3 w-3 mr-1" />
                    Columns{hiddenCols.size > 0 ? ` (${ALL_HIDEABLE.length - hiddenCols.size}/${ALL_HIDEABLE.length})` : ''}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-44 p-2" align="end">
                  <div className="space-y-1">
                    {ALL_HIDEABLE.map(col => (
                      <label key={col.id} className="flex items-center gap-2 text-xs cursor-pointer py-0.5">
                        <Checkbox
                          checked={show(col.id)}
                          onCheckedChange={() => toggleCol(col.id)}
                        />
                        {col.label}
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
          </div>

          {/* Active Filters indicator */}
          {(() => {
            const active: string[] = [];
            if (serviceFilter !== 'all') active.push(`Service (${SERVICE_LABELS[serviceFilter]})`);
            if (startTimeFilter !== 'all') {
              const timeLabels: Record<string, string> = { early: 'Before 06:00', morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' };
              active.push(`Start time (${timeLabels[startTimeFilter]})`);
            }
            
            if (sortBy !== 'start-time') {
              const sortLabels: Record<string, string> = { service: 'Service', 'service-start-time': 'Service / Start Time' };
              active.push(`Sort: ${sortLabels[sortBy] || sortBy}`);
            }
            if (hiddenCols.size > 0) active.push(`${hiddenCols.size} column${hiddenCols.size > 1 ? 's' : ''} hidden`);

            if (active.length === 0) return null;
            return (
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-muted-foreground font-medium">Active filters:</span>
                {active.map((label) => (
                  <Badge key={label} variant="secondary" className="text-[11px] font-normal">{label}</Badge>
                ))}
              </div>
            );
          })()}
        </CardContent>
      </Card>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="font-medium">Legend:</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-primary" /> Work</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#2b9a9a', backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(0,0,0,0.2) 2px, rgba(0,0,0,0.2) 4px)' }} /> Break</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-destructive/30 border border-destructive/50" /> Coverage gap</span>
        {dayConfig.hasOvernight && (
          <span className="flex items-center gap-1"><span className="w-0.5 h-3 bg-destructive/60" /> Midnight ({SHORT_DAY[selectedDay]} | {nextDayLabel})</span>
        )}
      </div>

      {(() => {
        const dataCols = 3 + (show('service') ? 1 : 0) + (show('lvl') ? 1 : 0) + (show('status') ? 1 : 0) + (show('division') ? 1 : 0) + (show('tasks') ? 1 : 0) + (show('day2start') ? 1 : 0) + (show('day2end') ? 1 : 0);
        const totalCols = dataCols + 1; // +1 for timeline
        return (
      <ScrollArea className="w-full border rounded-lg">
        <div className="min-w-[600px]">
          <table className="w-full text-xs border-collapse">
            <thead className="bg-muted/50 sticky top-0 z-20">
              {/* Column headers */}
              <tr className="border-b">
                <th className="text-left px-2 py-2 font-semibold w-8 border-r">#</th>
                {show('service') && <th className="text-left px-2 py-2 font-semibold w-20 border-r">Service</th>}
                {show('lvl') && <th className="text-left px-2 py-2 font-semibold w-8 border-r">Lvl</th>}
                {show('status') && <th className="text-left px-2 py-2 font-semibold w-10 border-r">Status</th>}
                {show('division') && <th className="text-left px-2 py-2 font-semibold w-20 border-r">Division</th>}
                {show('tasks') && <th className="text-left px-2 py-2 font-semibold w-24 border-r">Tasks</th>}
                <th className="text-left px-2 py-2 font-semibold w-14 border-r">Start</th>
                <th className="text-left px-2 py-2 font-semibold w-14 border-r">End</th>
                {show('day2start') && <th className="text-left px-2 py-2 font-semibold w-14 border-r text-muted-foreground/60">Day 2 Start</th>}
                {show('day2end') && <th className="text-left px-2 py-2 font-semibold w-14 border-r text-muted-foreground/60">Day 2 End</th>}
                {/* Timeline header */}
                <th className="text-left px-2 py-2 font-semibold border-r-0">
                  <div className="flex items-center justify-between">
                    <span>{timelineTitle}</span>
                    {dayConfig.hasOvernight && (
                      <span className="text-destructive text-[10px] font-normal">
                        {SHORT_DAY[selectedDay]} | {nextDayLabel}
                      </span>
                    )}
                  </div>
                  {/* Hour labels */}
                  <div className="relative h-3 mt-1">
                    {hourLabels.map(({ hour, label, pct }) => (
                      <span
                        key={hour}
                        className={cn(
                          "absolute text-[9px] font-normal -translate-x-1/2",
                          hour === 24 ? "text-destructive font-semibold" : "text-muted-foreground"
                        )}
                        style={{ left: `${pct}%` }}
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </th>
              </tr>

              {/* Heatmap row */}
              <tr className="border-b bg-muted/30">
                <td colSpan={dataCols} className="px-2 py-1 text-[10px] text-muted-foreground border-r font-medium">
                  Coverage (15-min)
                </td>
                <td className="px-1 py-1">
                  <DayHeatmap15 rows={heatmapData} config={dayConfig} />
                </td>
              </tr>
            </thead>

            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={totalCols} className="text-center py-8 text-muted-foreground">
                    No operators match filters
                  </td>
                </tr>
              ) : sortBy === 'service' ? (
                serviceGroups.map(group => {
                  const isCollapsed = collapsedGroups.has(group.service);

                  return (
                    <React.Fragment key={group.service}>
                      {/* Service group header */}
                      <tr
                        className="bg-muted/60 border-b cursor-pointer hover:bg-muted/80 transition-colors"
                        onClick={() => toggleGroup(group.service)}
                      >
                        <td colSpan={dataCols} className="px-2 py-1.5 border-r">
                          <div className="flex items-center gap-2">
                            {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            <span
                              className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                              style={{ backgroundColor: serviceColors[group.service] }}
                            />
                            <span className="font-semibold text-xs">{group.label}</span>
                            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                              {group.rows.length} op{group.rows.length !== 1 ? 's' : ''}
                            </Badge>
                          </div>
                        </td>
                        <td className="px-1 py-1.5 text-center">
                          <div className="text-[10px] font-medium">
                            {group.dayTotal.operators > 0 ? (
                              <>
                                <span>{group.dayTotal.operators} op{group.dayTotal.operators !== 1 ? 's' : ''}</span>
                                <span className="text-muted-foreground ml-1">
                                  {group.dayTotal.paidHours.toFixed(1)}h
                                </span>
                              </>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </div>
                        </td>
                      </tr>

                      {!isCollapsed && group.rows.map(row => {
                        const op = row.operator;
                        const data = row.days[selectedDay];
                        const calc = data?.calculation;
                        const shift = data?.shift;
                        const hasShift = calc?.isValid && calc.coverageMin > 0;
                        const isOvernight = hasShift && calc!.endMin < calc!.startMin && !(calc!.endMin === 0 && calc!.startMin > 0);
                        const hatch = hasSupervisionAllowance(op);

                        const isMultiSeg = shift?.segments && shift.segments.length > 1;
                        const division = isMultiSeg ? 'Mixed' : (shift?.division || op.defaultDivision || '—');
                        const tasks = isMultiSeg ? 'Multiple' : (shift?.tasks || op.defaultTasks || '—');
                        const segTooltip = isMultiSeg ? shift!.segments!.map(s => `${s.divisionId || 'Unassigned'} – ${s.minutes}min`).join('\n') : undefined;

                        const opWarnings = warningMap.get(op.id) ?? [];
                        return (
                          <tr key={op.id} className={cn("border-b hover:bg-muted/20 transition-colors", opWarnings.length > 0 && "bg-warning/5")}>
                            <td className="px-2 py-1.5 font-mono font-medium border-r">
                              <div className="flex items-center gap-1">
                                {op.number}
                                {opWarnings.length > 0 && (
                                  <span title={opWarnings.join('\n')}>
                                    <AlertTriangle className="h-3 w-3 text-warning" />
                                  </span>
                                )}
                              </div>
                            </td>
                            {show('service') && <td className="px-2 py-1.5 border-r">
                              <div className="flex items-center gap-1">
                                <span
                                  className="w-2 h-2 rounded-sm flex-shrink-0"
                                  style={{ backgroundColor: serviceColors[op.service] }}
                                />
                                <span className="truncate">{SERVICE_LABELS[op.service]?.slice(0, 8)}</span>
                              </div>
                            </td>}
                            {show('lvl') && <td className="px-2 py-1.5 border-r">{LEVEL_LABELS[op.level]}</td>}
                            {show('status') && <td className="px-2 py-1.5 border-r">{EMP_LABELS[op.employmentType]}</td>}
                            {show('division') && <td className="px-2 py-1.5 border-r truncate max-w-[80px]" title={segTooltip || division}>{division}</td>}
                            {show('tasks') && <td className="px-2 py-1.5 border-r truncate max-w-[96px]" title={segTooltip || tasks}>{tasks}</td>}
                            <td className="px-2 py-1.5 border-r font-mono text-[11px]">
                              {hasShift ? calc!.startTime : '—'}
                            </td>
                            <td className="px-2 py-1.5 border-r font-mono text-[11px]">
                              {hasShift ? calc!.endTime : '—'}
                            </td>
                            {show('day2start') && <td className="px-2 py-1.5 border-r font-mono text-[11px] text-muted-foreground">
                              {isOvernight ? '00:00' : '—'}
                            </td>}
                            {show('day2end') && <td className="px-2 py-1.5 border-r font-mono text-[11px] text-muted-foreground">
                              {isOvernight ? calc!.endTime : '—'}
                            </td>}

                            {/* Timeline */}
                            <td className="px-1 py-1.5">
                              {hasShift ? (
                                <TooltipProvider delayDuration={200}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="h-4">
                                        <CellTimelineBar
                                          calculation={calc!}
                                          config={dayConfig}
                                          serviceColor={serviceColors[op.service]}
                                          showHatch={hatch}
                                        />
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs">
                                      <div>
                                        {calc!.startTime}–{calc!.endTime} ({calc!.paidHours.toFixed(1)}h paid)
                                      </div>
                                      {shift?.division && <div>Div: {shift.division}</div>}
                                      {shift?.tasks && <div>Tasks: {shift.tasks}</div>}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : (
                                <div className="h-4 bg-muted/20 rounded" />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })
              ) : (
                sortedRows.map(row => {
                  const op = row.operator;
                  const data = row.days[selectedDay];
                  const calc = data?.calculation;
                  const shift = data?.shift;
                  const hasShift = calc?.isValid && calc.coverageMin > 0;
                  const isOvernight = hasShift && calc!.endMin < calc!.startMin && !(calc!.endMin === 0 && calc!.startMin > 0);
                  const hatch = hasSupervisionAllowance(op);

                  const isMultiSeg = shift?.segments && shift.segments.length > 1;
                  const division = isMultiSeg ? 'Mixed' : (shift?.division || op.defaultDivision || '—');
                  const tasks = isMultiSeg ? 'Multiple' : (shift?.tasks || op.defaultTasks || '—');
                  const segTooltip = isMultiSeg ? shift!.segments!.map(s => `${s.divisionId || 'Unassigned'} – ${s.minutes}min`).join('\n') : undefined;

                  const opWarnings = warningMap.get(op.id) ?? [];
                  return (
                    <tr key={op.id} className={cn("border-b hover:bg-muted/20 transition-colors", opWarnings.length > 0 && "bg-warning/5")}>
                      <td className="px-2 py-1.5 font-mono font-medium border-r">
                        <div className="flex items-center gap-1">
                          {op.number}
                          {opWarnings.length > 0 && (
                            <span title={opWarnings.join('\n')}>
                              <AlertTriangle className="h-3 w-3 text-warning" />
                            </span>
                          )}
                        </div>
                      </td>
                      {show('service') && <td className="px-2 py-1.5 border-r">
                        <div className="flex items-center gap-1">
                          <span
                            className="w-2 h-2 rounded-sm flex-shrink-0"
                            style={{ backgroundColor: serviceColors[op.service] }}
                          />
                          <span className="truncate">{SERVICE_LABELS[op.service]?.slice(0, 8)}</span>
                        </div>
                      </td>}
                      {show('lvl') && <td className="px-2 py-1.5 border-r">{LEVEL_LABELS[op.level]}</td>}
                      {show('status') && <td className="px-2 py-1.5 border-r">{EMP_LABELS[op.employmentType]}</td>}
                      {show('division') && <td className="px-2 py-1.5 border-r truncate max-w-[80px]" title={segTooltip || division}>{division}</td>}
                      {show('tasks') && <td className="px-2 py-1.5 border-r truncate max-w-[96px]" title={segTooltip || tasks}>{tasks}</td>}
                      <td className="px-2 py-1.5 border-r font-mono text-[11px]">
                        {hasShift ? calc!.startTime : '—'}
                      </td>
                      <td className="px-2 py-1.5 border-r font-mono text-[11px]">
                        {hasShift ? calc!.endTime : '—'}
                      </td>
                      {show('day2start') && <td className="px-2 py-1.5 border-r font-mono text-[11px] text-muted-foreground">
                        {isOvernight ? '00:00' : '—'}
                      </td>}
                      {show('day2end') && <td className="px-2 py-1.5 border-r font-mono text-[11px] text-muted-foreground">
                        {isOvernight ? calc!.endTime : '—'}
                      </td>}

                      {/* Timeline */}
                      <td className="px-1 py-1.5">
                        {hasShift ? (
                          <TooltipProvider delayDuration={200}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="h-4">
                                  <CellTimelineBar
                                    calculation={calc!}
                                    config={dayConfig}
                                    serviceColor={serviceColors[op.service]}
                                    showHatch={hatch}
                                  />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                <div>
                                  {calc!.startTime}–{calc!.endTime} ({calc!.paidHours.toFixed(1)}h paid)
                                </div>
                                {shift?.division && <div>Div: {shift.division}</div>}
                                {shift?.tasks && <div>Tasks: {shift.tasks}</div>}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <div className="h-4 bg-muted/20 rounded" />
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
        );
      })()}

      {/* Footer – hidden in full screen */}
      {!fullScreenMode && (
        <div className="flex items-center justify-between text-sm text-muted-foreground border-t pt-4">
          <span>{sortedRows.length} operator{sortedRows.length !== 1 ? 's' : ''} shown</span>
          <span>{totalShifts} active shift{totalShifts !== 1 ? 's' : ''} on {SHORT_DAY[selectedDay]}</span>
        </div>
      )}

      {/* Full screen footer */}
      {fullScreenMode && (
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
          <span>{sortedRows.length} operators · {totalShifts} shifts on {SHORT_DAY[selectedDay]}</span>
          <span className="text-[10px]">Press ESC to exit</span>
        </div>
      )}
    </div>
  );

  // ── Full Screen Graph-Only Workspace ──
  if (fullScreenMode) {
    return (
      <div className="fixed inset-0 z-[100] bg-background flex flex-col print:static print:z-auto">
        {/* Minimal top bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30 flex-shrink-0 print:hidden">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold">Full Screen — Labour Deployment</h2>
            <div className="flex gap-1">
              {DAYS_OF_WEEK.map((day) => (
                <button
                  key={day}
                  onClick={() => setSelectedDay(day)}
                  className={cn(
                    "px-3 py-1 rounded text-xs font-medium transition-all",
                    day === selectedDay
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  {SHORT_DAY[day]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={fitToScreen ? "default" : "outline"}
              size="sm"
              onClick={() => setFitToScreen(prev => !prev)}
              className="gap-1.5 text-xs"
            >
              <ZoomIn className="h-3.5 w-3.5" />
              Fit to Screen
            </Button>
            <Button variant="outline" size="sm" onClick={handleCopyAsImage} className="gap-1.5 text-xs">
              <Copy className="h-3.5 w-3.5" />
              Copy as Image
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownloadPng} className="gap-1.5 text-xs">
              <Download className="h-3.5 w-3.5" />
              Download PNG
            </Button>
            <Button variant="outline" size="sm" onClick={() => setFullScreenMode(false)} className="gap-1.5">
              <Minimize className="h-4 w-4" />
              Exit
            </Button>
          </div>
        </div>

        {/* Reuse the current filtered/sorted view */}
        <div className={cn("flex-1 overflow-auto", fitToScreen && "overflow-hidden")} ref={graphRef}>
          <div className={cn(fitToScreen && "h-full flex flex-col")}>
            {mainContent}
          </div>
        </div>
      </div>
    );
  }

  return (
    mainContent
  );
}
