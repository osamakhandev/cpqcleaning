import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { usePricingData } from '@/hooks/usePricingData';
import { FixedPriceBanner } from '@/components/FixedPriceBanner';
import { Download, FileSpreadsheet, AlertTriangle } from 'lucide-react';
import { PageActions } from '@/components/PageActions';
import HowItWorks from '@/components/HowItWorks';
import { HELP_CONTENT } from '@/data/helpContent';
import * as XLSX from 'xlsx';
import { getExportFileName } from '@/lib/excelExport';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useRosterStore } from '@/contexts/RosterContext';
import { calculateOperatorWeek, formatDecimalHours } from '@/lib/rosterCalculations';
import { calculateShiftCost, formatCurrency, type ShiftCost } from '@/lib/costingCalculations';
import { calculateSecurityAllowances, calculateCleaningAllowances, type AllowanceBreakdown, type AllowanceLineItem } from '@/lib/securityAllowances';
import { RATE_BAND_LABELS } from '@/lib/rateData';
import { useWageSettings } from '@/lib/wageSettings';
import { DAYS_OF_WEEK, DAY_LABELS, SERVICE_LABELS } from '@/types/roster';
import type { OperatorCalculations, DayOfWeek, ServiceType, Operator } from '@/types/roster';
import { levelNumber } from '@/lib/serviceColors';

const employmentLabels: Record<string, string> = {
  'full-time': 'Full Time',
  'part-time': 'Part Time',
  'casual': 'Casual',
};

const SHORT_DAY: Record<DayOfWeek, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
};

const normalizeService = (value: unknown): ServiceType => {
  if (value === 'cleaning' || value === 'customer-service' || value === 'security' ||
    value === 'maintenance' || value === 'landscape' || value === 'management') return value as ServiceType;
  if (value === 'Cleaning') return 'cleaning';
  if (value === 'Customer Service' || value === 'Customer service') return 'customer-service';
  return 'cleaning';
};

// ── Daily allowance breakdown ────────────────────────────────────

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

// ── Operator row data ────────────────────────────────────────────

interface OperatorRow {
  op: Operator;
  ns: ServiceType;
  calc: OperatorCalculations;
  costData: ShiftCost[];
  dailyAllow: number[];
  yearFactor: number;
  weeklyAllowance: number;
  weeklyCoverage: number;
  weeklyWage: number;
  weeklyTotal: number;
}

// ── Sticky horizontal scrollbar hook ─────────────────────────────

function useStickyScrollbar(scrollRef: React.RefObject<HTMLDivElement | null>) {
  const barRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);

  const syncSizes = useCallback(() => {
    if (!scrollRef.current || !innerRef.current) return;
    innerRef.current.style.width = `${scrollRef.current.scrollWidth}px`;
  }, [scrollRef]);

  useEffect(() => {
    syncSizes();
    const ro = new ResizeObserver(syncSizes);
    if (scrollRef.current) ro.observe(scrollRef.current);
    return () => ro.disconnect();
  }, [syncSizes, scrollRef]);

  useEffect(() => {
    const scroll = scrollRef.current;
    const bar = barRef.current;
    if (!scroll || !bar) return;

    const onScroll = () => {
      if (syncing.current) return;
      syncing.current = true;
      bar.scrollLeft = scroll.scrollLeft;
      syncing.current = false;
    };
    const onBar = () => {
      if (syncing.current) return;
      syncing.current = true;
      scroll.scrollLeft = bar.scrollLeft;
      syncing.current = false;
    };

    scroll.addEventListener('scroll', onScroll);
    bar.addEventListener('scroll', onBar);
    return () => {
      scroll.removeEventListener('scroll', onScroll);
      bar.removeEventListener('scroll', onBar);
    };
  }, [scrollRef]);

  return { barRef, innerRef };
}

// ── Component ────────────────────────────────────────────────────

export default function DetailedResults() {
  const { operators, rosters, getRoster, isLoaded } = useRosterStore();
  const { getConfigForOperator, isLoaded: wageLoaded } = useWageSettings();
  const { year1Factor, isFixedPrice } = usePricingData();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { barRef, innerRef } = useStickyScrollbar(scrollContainerRef);

  // Filters
  const [filterService, setFilterService] = useState<string>('all');
  const [filterOperator, setFilterOperator] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterDivision, setFilterDivision] = useState<string>('all');
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [warningsOpen, setWarningsOpen] = useState(false);

  // Build row data
  const allRows: OperatorRow[] = useMemo(() => {
    return operators.map(op => {
      const roster = getRoster(op.id);
      const ns = normalizeService(op.service);
      const calc = roster
        ? calculateOperatorWeek(roster, op.employmentType, DAYS_OF_WEEK, ns, op.weeksPerYear)
        : null;
      if (!calc) return null;

      const wageInfo = getConfigForOperator(ns, op.level);
      const costArr: ShiftCost[] = calc.days.map(d => {
        const base = calculateShiftCost(d.day, d.startTime || '', d.endTime || '', d.paidHours,
          ns, op.employmentType, op.level, op.isFixedNights ?? false, wageInfo?.rates ?? null);
        if (year1Factor !== 1 && base.cost !== null) {
          return { ...base, cost: base.cost * year1Factor, hourlyRate: base.hourlyRate !== null ? base.hourlyRate * year1Factor : null, segments: base.segments.map(seg => ({ ...seg, cost: seg.cost !== null ? seg.cost * year1Factor : null, hourlyRate: seg.hourlyRate * year1Factor })) };
        }
        return base;
      });

      const workedDays = calc.days.filter(d => d.coverageMin > 0).map(d => d.day);
      let allowInfo: AllowanceBreakdown | null = null;
      if (ns === 'security' && op.securityAllowances) {
        allowInfo = calculateSecurityAllowances(op.securityAllowances, calc.weeklyPaidHours, workedDays.length);
      } else if (ns === 'cleaning' && op.cleaningAllowances) {
        allowInfo = calculateCleaningAllowances(op.cleaningAllowances, calc.weeklyPaidHours, workedDays, op.level);
      }
      if (allowInfo && year1Factor !== 1) {
        allowInfo = {
          ...allowInfo,
          totalWeekly: allowInfo.totalWeekly * year1Factor,
          items: allowInfo.items.map(item => ({ ...item, cost: item.cost * year1Factor })),
        };
      }

      const dailyAllow = computeDailyAllowances(allowInfo, calc.days);
      const weeklyAllowance = allowInfo?.totalWeekly ?? 0;
      const weeklyWage = costArr.reduce((s, c) => s + (c.cost ?? 0), 0);
      const weeklyCoverage = calc.days.reduce((s, d) => s + d.coverageHours, 0);
      const yearFactor = op.employmentType === 'casual' && typeof op.weeksPerYear === 'number'
        ? op.weeksPerYear : 52.14;

      return {
        op, ns, calc, costData: costArr, dailyAllow, yearFactor,
        weeklyAllowance, weeklyCoverage, weeklyWage,
        weeklyTotal: weeklyWage + weeklyAllowance,
      } as OperatorRow;
    }).filter(Boolean) as OperatorRow[];
  }, [operators, rosters, getRoster, getConfigForOperator, year1Factor]);

  const totalWarnings = useMemo(() => allRows.reduce((sum, r) => sum + r.calc.warnings.length, 0), [allRows]);

  // Filter options
  const services = useMemo(() => [...new Set(operators.map(op => normalizeService(op.service)))], [operators]);
  const divisions = useMemo(() => {
    const divs = new Set<string>();
    operators.forEach(op => {
      const roster = getRoster(op.id);
      if (!roster) return;
      DAYS_OF_WEEK.forEach(d => { if (roster.shifts[d]?.division) divs.add(roster.shifts[d].division); });
    });
    return [...divs].sort();
  }, [operators, rosters, getRoster]);
  const levels = useMemo(() => [...new Set(operators.map(op => op.level))].sort(), [operators]);

  const filteredRows = useMemo(() => {
    return allRows.filter(({ op }) => {
      if (filterService !== 'all' && normalizeService(op.service) !== filterService) return false;
      if (filterOperator && !String(op.number).includes(filterOperator) && !op.name.toLowerCase().includes(filterOperator.toLowerCase())) return false;
      if (filterStatus !== 'all' && op.employmentType !== filterStatus) return false;
      if (filterLevel !== 'all' && op.level !== filterLevel) return false;
      if (filterDivision !== 'all') {
        const roster = getRoster(op.id);
        if (!roster) return false;
        if (!DAYS_OF_WEEK.some(d => roster.shifts[d]?.division === filterDivision)) return false;
      }
      return true;
    });
  }, [allRows, filterService, filterOperator, filterStatus, filterLevel, filterDivision, getRoster]);

  // ── Shared row builder ──
  const buildExportRows = () => {
    const formatWorkDays = (days: DayOfWeek[] | undefined) => {
      if (!days || days.length === 0) return '—';
      if (days.length === 7) return 'All days';
      return DAYS_OF_WEEK.filter(d => days.includes(d)).map(d => SHORT_DAY[d]).join(', ');
    };

    return filteredRows.map(row => {
      const { op, calc, costData, dailyAllow, yearFactor, weeklyAllowance, weeklyTotal } = row;
      const dayVals: Record<string, string | number>[] = DAYS_OF_WEEK.map((_, idx) => {
        const d = calc.days[idx];
        const wage = costData[idx]?.cost ?? 0;
        const allow = dailyAllow[idx];
        const total = wage + allow;
        const rate = d.paidHours > 0 && wage > 0 ? wage / d.paidHours : 0;
        const times = d.startTime && d.endTime ? `${d.startTime}–${d.endTime}` : '';
        return d.paidHours > 0
          ? { times, paidHrs: d.paidHours, rate, wage, allow, total }
          : { times: '', paidHrs: 0, rate: 0, wage: 0, allow: 0, total: 0 };
      });
      return {
        opNum: op.number,
        service: SERVICE_LABELS[normalizeService(op.service)],
        employment: employmentLabels[op.employmentType],
        level: `Level ${levelNumber(op.level)}`,
        workDays: formatWorkDays(op.workDays),
        shiftTimes: op.defaultStartTime && op.defaultEndTime ? `${op.defaultStartTime}–${op.defaultEndTime}` : '—',
        dayVals,
        weeklyAllowance,
        weeklyPaidHrs: calc.weeklyPaidHours,
        weeklyTotal,
        yearFactor,
      };
    });
  };

  // ── Excel Export ──
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();
    const rows = buildExportRows();

    // --- Sheet 1: Detailed Results ---
    const dayHeaders = DAYS_OF_WEEK.flatMap(d => [
      `${SHORT_DAY[d]} Times`, `${SHORT_DAY[d]} Paid Hrs`, `${SHORT_DAY[d]} $/h`, `${SHORT_DAY[d]} Wage`, `${SHORT_DAY[d]} Allow`, `${SHORT_DAY[d]} Total`,
    ]);
    const headers = ['Operator #', 'Service', 'Employment', 'Level', 'Work Days', 'Shift Times', ...dayHeaders, 'Weekly Allow', 'Weekly Paid Hrs', 'Weekly Total', 'Yearly Allow', 'Yearly Paid Hrs', 'Yearly Total'];

    const aoaData: (string | number)[][] = [headers];
    rows.forEach(r => {
      const dayFlat = r.dayVals.flatMap(d =>
        d.paidHrs === 0 ? ['–', 0, 0, 0, 0, 0] : [d.times, d.paidHrs, d.rate, d.wage, d.allow, d.total]
      );
      aoaData.push([
        r.opNum, r.service, r.employment, r.level, r.workDays, r.shiftTimes,
        ...dayFlat,
        r.weeklyAllowance, r.weeklyPaidHrs, r.weeklyTotal,
        r.weeklyAllowance * r.yearFactor, r.weeklyPaidHrs * r.yearFactor, r.weeklyTotal * r.yearFactor,
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoaData);

    // Column widths
    const colWidths = headers.map((h, i) => {
      if (i <= 5) return { wch: Math.max(h.length, 14) };
      return { wch: Math.max(h.length, 12) };
    });
    ws['!cols'] = colWidths;

    // Bold header row + number formats
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let C = range.s.c; C <= range.e.c; C++) {
      const headerAddr = XLSX.utils.encode_cell({ r: 0, c: C });
      if (ws[headerAddr]) {
        ws[headerAddr].s = { font: { bold: true }, fill: { fgColor: { rgb: 'F3F4F6' } } };
      }
      // Apply number formats to data rows
      const hdr = headers[C] || '';
      const isCurrency = hdr.includes('Wage') || hdr.includes('Allow') || hdr.includes('Total') || hdr.includes('$/h');
      const isHours = hdr.includes('Hrs');
      for (let R = 1; R <= range.e.r; R++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        if (ws[addr] && typeof ws[addr].v === 'number') {
          ws[addr].z = isCurrency ? '$#,##0.00' : isHours ? '0.00' : undefined;
        }
      }
    }

    // Freeze top row
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };
    // SheetJS uses '!freeze' or we can set views
    if (!ws['!views']) ws['!views'] = [{}];
    (ws['!views'] as Record<string, unknown>[])[0] = { state: 'frozen', ySplit: 1 };

    XLSX.utils.book_append_sheet(wb, ws, 'Detailed Results');

    // --- Sheet 2: Weekly Summary ---
    const summHeaders = ['Operator #', 'Service', 'Employment', 'Level', 'Weekly Paid Hrs', 'Weekly Wage', 'Weekly Allowances', 'Weekly Total', 'Year Factor', 'Yearly Total'];
    const summData: (string | number)[][] = [summHeaders];
    let grandWeeklyHrs = 0, grandWeeklyWage = 0, grandWeeklyAllow = 0, grandWeeklyTotal = 0, grandYearlyTotal = 0;

    rows.forEach(r => {
      const weeklyWage = r.weeklyTotal - r.weeklyAllowance;
      const yearlyTotal = r.weeklyTotal * r.yearFactor;
      grandWeeklyHrs += r.weeklyPaidHrs;
      grandWeeklyWage += weeklyWage;
      grandWeeklyAllow += r.weeklyAllowance;
      grandWeeklyTotal += r.weeklyTotal;
      grandYearlyTotal += yearlyTotal;
      summData.push([r.opNum, r.service, r.employment, r.level, r.weeklyPaidHrs, weeklyWage, r.weeklyAllowance, r.weeklyTotal, r.yearFactor, yearlyTotal]);
    });

    // Totals row
    summData.push(['', '', '', 'TOTAL', grandWeeklyHrs, grandWeeklyWage, grandWeeklyAllow, grandWeeklyTotal, '', grandYearlyTotal]);

    const ws2 = XLSX.utils.aoa_to_sheet(summData);
    ws2['!cols'] = summHeaders.map(h => ({ wch: Math.max(h.length, 14) }));

    // Bold header + totals, number formats
    const range2 = XLSX.utils.decode_range(ws2['!ref'] || 'A1');
    for (let C = range2.s.c; C <= range2.e.c; C++) {
      const hAddr = XLSX.utils.encode_cell({ r: 0, c: C });
      if (ws2[hAddr]) ws2[hAddr].s = { font: { bold: true }, fill: { fgColor: { rgb: 'F3F4F6' } } };
      const tAddr = XLSX.utils.encode_cell({ r: range2.e.r, c: C });
      if (ws2[tAddr]) ws2[tAddr].s = { font: { bold: true } };

      const hdr = summHeaders[C] || '';
      const isCur = hdr.includes('Wage') || hdr.includes('Allow') || hdr.includes('Total');
      const isHrs = hdr.includes('Hrs');
      for (let R = 1; R <= range2.e.r; R++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        if (ws2[addr] && typeof ws2[addr].v === 'number') {
          ws2[addr].z = isCur ? '$#,##0.00' : isHrs ? '0.00' : undefined;
        }
      }
    }
    if (!ws2['!views']) ws2['!views'] = [{}];
    (ws2['!views'] as Record<string, unknown>[])[0] = { state: 'frozen', ySplit: 1 };

    XLSX.utils.book_append_sheet(wb, ws2, 'Weekly Summary');

    XLSX.writeFile(wb, getExportFileName('DetailedResults'));
  };

  // ── CSV Export (secondary) ──
  const handleExportCSV = () => {
    const rows = buildExportRows();
    const dayHeaders = DAYS_OF_WEEK.flatMap(d => [
      `${SHORT_DAY[d]} Times`, `${SHORT_DAY[d]} Paid Hrs`, `${SHORT_DAY[d]} Rate/h`, `${SHORT_DAY[d]} Wage`, `${SHORT_DAY[d]} Allow`, `${SHORT_DAY[d]} Total`,
    ]);
    const headers = ['Operator #', 'Service', 'Employment', 'Level', 'Work Days', 'Shift Times', ...dayHeaders, 'Weekly Allow$', 'Weekly Paid Hrs', 'Weekly Total$', 'Yearly Allow$', 'Yearly Paid Hrs', 'Yearly Total$'];
    const csvRows: string[][] = [headers];
    rows.forEach(r => {
      const dayFlat = r.dayVals.flatMap(d =>
        d.paidHrs === 0 ? ['–', '–', '–', '–', '–', '–'] : [String(d.times), (d.paidHrs as number).toFixed(2), (d.rate as number).toFixed(2), (d.wage as number).toFixed(2), (d.allow as number).toFixed(2), (d.total as number).toFixed(2)]
      );
      csvRows.push([
        String(r.opNum), r.service, r.employment, r.level, r.workDays, r.shiftTimes,
        ...dayFlat,
        r.weeklyAllowance.toFixed(2), r.weeklyPaidHrs.toFixed(2), r.weeklyTotal.toFixed(2),
        (r.weeklyAllowance * r.yearFactor).toFixed(2), (r.weeklyPaidHrs * r.yearFactor).toFixed(2), (r.weeklyTotal * r.yearFactor).toFixed(2),
      ]);
    });
    const csv = csvRows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `detailed-results-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isLoaded || !wageLoaded) {
    return <div className="flex items-center justify-center h-64"><div className="text-muted-foreground">Loading...</div></div>;
  }

  if (operators.length === 0) {
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold">Detailed Results</h1><p className="text-muted-foreground">Extended operator cost breakdown</p></div>
        <Card><CardContent className="flex flex-col items-center justify-center py-16">
          <h3 className="text-lg font-medium mb-2">No data to display</h3>
          <p className="text-muted-foreground text-center">Add operators and roster shifts to see results</p>
        </CardContent></Card>
      </div>
    );
  }

  const fmtVal = (v: number | null) => v !== null && v !== 0 ? formatCurrency(v) : '–';
  const fmtHrs = (h: number) => h > 0 ? formatDecimalHours(h) : '–';


  return (
    <div className="space-y-6">
      <FixedPriceBanner />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold truncate">Detailed Results</h1>
            <p className="text-muted-foreground text-sm">All operators — daily, weekly & yearly cost breakdown</p>
          </div>
          <HowItWorks {...HELP_CONTENT["detailed-results"]} size="sm" />
        </div>
        <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
          {/* Warnings KPI */}
          <Card
            className={totalWarnings > 0 ? 'cursor-pointer hover:border-warning/50 transition-colors' : ''}
            onClick={() => totalWarnings > 0 && setWarningsOpen(true)}
          >
            <CardContent className="py-2 px-4 flex items-center gap-2">
              <AlertTriangle className={`h-4 w-4 ${totalWarnings > 0 ? 'text-warning' : 'text-success'}`} />
              <span className={`font-mono font-bold ${totalWarnings > 0 ? 'text-warning' : 'text-success'}`}>{totalWarnings}</span>
              <span className="text-xs text-muted-foreground">Warnings</span>
            </CardContent>
          </Card>
          <PageActions
            onExportExcel={handleExportExcel}
            onExportCSV={handleExportCSV}
            showExcel
            showCSV
            showPrint
            showLandscapePrint
          />
        </div>
      </div>

      {/* Warnings detail dialog */}
      <Dialog open={warningsOpen} onOpenChange={setWarningsOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Active Warnings ({totalWarnings})</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {allRows.filter(r => r.calc.warnings.length > 0).map(({ op, calc }) => (
              <div key={op.id} className="border rounded-lg p-3 space-y-2">
                <div className="font-medium flex items-center gap-2">
                  <span>Operator {op.number}</span>
                  {op.name && <span className="text-muted-foreground">– {op.name}</span>}
                  <Badge variant="outline" className="text-xs">{employmentLabels[op.employmentType]}</Badge>
                </div>
                <ul className="space-y-1">
                  {calc.warnings.map((w, i) => (
                    <li key={i} className="text-sm text-warning flex items-start gap-2">
                      <span className="mt-0.5">⚠</span>
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Service</label>
              <Select value={filterService} onValueChange={setFilterService}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Services</SelectItem>
                  {services.map(s => <SelectItem key={s} value={s}>{SERVICE_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Operator #</label>
              <Input placeholder="Search..." value={filterOperator} onChange={e => setFilterOperator(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Employment</label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="full-time">Full Time</SelectItem>
                  <SelectItem value="part-time">Part Time</SelectItem>
                  <SelectItem value="casual">Casual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Division</label>
              <Select value={filterDivision} onValueChange={setFilterDivision}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {divisions.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Level</label>
              <Select value={filterLevel} onValueChange={setFilterLevel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {levels.map(l => <SelectItem key={l} value={l}>Level {levelNumber(l)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* All Operators Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Operators ({filteredRows.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0 relative">
          {/* Sticky top horizontal scrollbar */}
          <div
            ref={barRef}
            className="overflow-x-auto overflow-y-hidden sticky top-0 z-30"
            style={{ height: 16, scrollbarWidth: 'thin' }}
          >
            <div ref={innerRef} style={{ height: 1 }} />
          </div>
          <div
            ref={scrollContainerRef}
            className="overflow-x-auto overflow-y-auto max-h-[75vh]"
            style={{ scrollbarWidth: 'thin' }}
          >
            <div className="min-w-max">
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 z-20">
                  {/* Group header row */}
                  <tr className="border-b bg-muted">
                    <th colSpan={6} className="sticky left-0 z-30 bg-muted border-r border-border px-2 py-1.5 text-left text-xs font-bold text-foreground uppercase tracking-wide">Operator Details</th>
                    {DAYS_OF_WEEK.map(d => (
                      <th key={d} colSpan={6} className="px-1 py-1.5 text-center text-xs font-bold text-foreground uppercase tracking-wide border-l border-border bg-muted">{SHORT_DAY[d]}</th>
                    ))}
                    <th colSpan={3} className="px-1 py-1.5 text-center text-xs font-bold text-foreground uppercase tracking-wide border-l border-border bg-muted">Weekly</th>
                    <th colSpan={3} className="px-1 py-1.5 text-center text-xs font-bold text-foreground uppercase tracking-wide border-l border-border bg-muted">Yearly</th>
                    <th colSpan={7} className="px-1 py-1.5 text-center text-xs font-bold text-foreground uppercase tracking-wide border-l border-border bg-muted">Year Wage$ by Day</th>
                    <th colSpan={7} className="px-1 py-1.5 text-center text-xs font-bold text-foreground uppercase tracking-wide border-l border-border bg-muted">Year Total$ by Day</th>
                  </tr>
                  {/* Column header row */}
                  <tr className="border-b bg-muted">
                    {/* Sticky left columns */}
                    <th className="sticky left-0 z-30 bg-muted px-3 py-2 text-left text-xs font-semibold text-foreground whitespace-nowrap min-w-[80px]">#</th>
                    <th className="sticky left-[80px] z-30 bg-muted px-3 py-2 text-left text-xs font-semibold text-foreground whitespace-nowrap min-w-[90px]">Service</th>
                    <th className="sticky left-[170px] z-30 bg-muted px-3 py-2 text-left text-xs font-semibold text-foreground whitespace-nowrap min-w-[85px]">Emp.</th>
                    <th className="sticky left-[255px] z-30 bg-muted px-3 py-2 text-left text-xs font-semibold text-foreground whitespace-nowrap min-w-[60px]">Lvl</th>
                    <th className="sticky left-[315px] z-30 bg-muted px-3 py-2 text-left text-xs font-semibold text-foreground whitespace-nowrap min-w-[90px]">Days</th>
                    <th className="sticky left-[405px] z-30 bg-muted px-3 py-2 text-left text-xs font-semibold text-foreground whitespace-nowrap min-w-[100px] border-r border-border">Times</th>
                    {/* Daily columns: 7 days × 6 cols (Times, Paid hrs, Rate/h, Wage, Allow, Total) */}
                    {DAYS_OF_WEEK.map(d => (
                      <DaySubHeaders key={d} />
                    ))}
                    {/* Weekly columns (no Cov Hrs) */}
                    <th className="px-2 py-2 text-right text-xs font-semibold text-foreground whitespace-nowrap border-l border-border">Allow</th>
                    <th className="px-2 py-2 text-right text-xs font-semibold text-foreground whitespace-nowrap">Paid Hrs</th>
                    <th className="px-2 py-2 text-right text-xs font-semibold text-foreground whitespace-nowrap">Total</th>
                    {/* Yearly columns (no Cov Hrs) */}
                    <th className="px-2 py-2 text-right text-xs font-semibold text-foreground whitespace-nowrap border-l border-border">Allow</th>
                    <th className="px-2 py-2 text-right text-xs font-semibold text-foreground whitespace-nowrap">Paid Hrs</th>
                    <th className="px-2 py-2 text-right text-xs font-semibold text-foreground whitespace-nowrap">Total</th>
                    {/* Year Wage$ by Day */}
                    {DAYS_OF_WEEK.map((d, i) => (
                      <th key={`yw-${d}`} className={`px-2 py-2 text-right text-xs font-semibold text-foreground whitespace-nowrap ${i === 0 ? 'border-l border-border' : ''}`}>{SHORT_DAY[d]}</th>
                    ))}
                    {/* Year Total$ by Day */}
                    {DAYS_OF_WEEK.map((d, i) => (
                      <th key={`yt-${d}`} className={`px-2 py-2 text-right text-xs font-semibold text-foreground whitespace-nowrap ${i === 0 ? 'border-l border-border' : ''}`}>{SHORT_DAY[d]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map(row => {
                    const { op, ns, calc, costData, dailyAllow, yearFactor, weeklyAllowance, weeklyCoverage, weeklyWage, weeklyTotal } = row;
                    const formatWorkDays = (days: DayOfWeek[] | undefined) => {
                      if (!days || days.length === 0) return '—';
                      if (days.length === 7) return 'All';
                      if (days.length === 5 && ['mon', 'tue', 'wed', 'thu', 'fri'].every(d => days.includes(d as DayOfWeek))) return 'M–F';
                      const sorted = DAYS_OF_WEEK.filter(d => days.includes(d));
                      return sorted.map(d => SHORT_DAY[d][0]).join('');
                    };

                    return (
                      <tr key={op.id} className={cn("border-b hover:bg-muted/30 transition-colors", calc.warnings.length > 0 && "bg-warning/5")}>
                        {/* Sticky left cols */}
                        <td className={cn("sticky left-0 z-10 px-3 py-2 font-mono font-medium whitespace-nowrap min-w-[80px]", calc.warnings.length > 0 ? "bg-warning/5" : "bg-background")}>
                          <div className="flex items-center gap-1">
                            Op {op.number}
                            {calc.warnings.length > 0 && (
                              <span title={calc.warnings.join('\n')}>
                                <AlertTriangle className="h-3 w-3 text-warning" />
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="sticky left-[80px] z-10 bg-background px-3 py-2 whitespace-nowrap min-w-[90px]">
                          <Badge variant="outline" className="text-xs">{SERVICE_LABELS[ns]}</Badge>
                        </td>
                        <td className="sticky left-[170px] z-10 bg-background px-3 py-2 whitespace-nowrap min-w-[85px]">
                          <Badge variant={op.employmentType === 'full-time' ? 'default' : 'secondary'} className="text-xs">
                            {employmentLabels[op.employmentType]}
                          </Badge>
                        </td>
                        <td className="sticky left-[255px] z-10 bg-background px-3 py-2 whitespace-nowrap min-w-[60px]">
                          <Badge variant="outline" className="text-xs">L{levelNumber(op.level)}</Badge>
                        </td>
                        <td className="sticky left-[315px] z-10 bg-background px-3 py-2 text-xs whitespace-nowrap min-w-[90px]">
                          {formatWorkDays(op.workDays)}
                        </td>
                        <td className="sticky left-[405px] z-10 bg-background px-3 py-2 font-mono text-xs whitespace-nowrap min-w-[100px] border-r border-border">
                          {op.defaultStartTime && op.defaultEndTime
                            ? `${op.defaultStartTime}–${op.defaultEndTime}`
                            : '—'}
                        </td>

                        {/* Daily columns: 7 days × 6 (Times, Paid hrs, Rate/h, Wage, Allow, Total) */}
                        {DAYS_OF_WEEK.map((_, idx) => {
                          const d = calc.days[idx];
                          const ci = costData[idx];
                          const allow = dailyAllow[idx];
                          const wage = ci?.cost ?? 0;
                          const total = wage + allow;
                          const rate = d.paidHours > 0 && wage > 0 ? wage / d.paidHours : 0;
                          const active = d.paidHours > 0;
                          const times = d.startTime && d.endTime ? `${d.startTime}–${d.endTime}` : '–';

                          return (
                            <DayCells key={idx} idx={idx} active={active} times={times} paidHrs={d.paidHours} allow={allow} rate={rate} wage={wage} total={total} />
                          );
                        })}

                        {/* Weekly cols (no Cov Hrs) */}
                        <td className="px-2 py-2 text-right font-mono text-xs whitespace-nowrap border-l border-border">{fmtVal(weeklyAllowance)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs whitespace-nowrap">{fmtHrs(calc.weeklyPaidHours)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-semibold whitespace-nowrap text-primary">{fmtVal(weeklyTotal)}</td>

                        {/* Yearly cols (no Cov Hrs) */}
                        <td className="px-2 py-2 text-right font-mono text-xs whitespace-nowrap border-l border-border">{fmtVal(weeklyAllowance * yearFactor)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs whitespace-nowrap">{fmtHrs(calc.weeklyPaidHours * yearFactor)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-semibold whitespace-nowrap text-primary">{fmtVal(weeklyTotal * yearFactor)}</td>

                        {/* Year Wage$ by Day */}
                        {DAYS_OF_WEEK.map((_, idx) => {
                          const w = costData[idx]?.cost ?? 0;
                          return (
                            <td key={`yw-${idx}`} className={`px-2 py-2 text-right font-mono text-xs whitespace-nowrap text-muted-foreground ${idx === 0 ? 'border-l border-border' : ''}`}>
                              {w > 0 ? fmtVal(w * yearFactor) : '–'}
                            </td>
                          );
                        })}

                        {/* Year Total$ by Day */}
                        {DAYS_OF_WEEK.map((_, idx) => {
                          const w = (costData[idx]?.cost ?? 0) + dailyAllow[idx];
                          return (
                            <td key={`yt-${idx}`} className={`px-2 py-2 text-right font-mono text-xs whitespace-nowrap text-muted-foreground ${idx === 0 ? 'border-l border-border' : ''}`}>
                              {w > 0 ? fmtVal(w * yearFactor) : '–'}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {/* Sticky horizontal scrollbar - always visible */}
          <div
            ref={barRef}
            className="sticky bottom-0 z-30 overflow-x-auto bg-background border-t border-border"
            style={{ height: 16 }}
          >
            <div ref={innerRef} style={{ height: 1 }} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Sub-components for header/cells ──────────────────────────────

function DaySubHeaders() {
  return (
    <>
      <th className="px-2 py-2 text-center text-xs font-semibold text-foreground whitespace-nowrap border-l border-border">Times</th>
      <th className="px-2 py-2 text-right text-xs font-semibold text-foreground whitespace-nowrap">Paid hrs</th>
      <th className="px-2 py-2 text-right text-xs font-semibold text-foreground whitespace-nowrap">Rate/h</th>
      <th className="px-2 py-2 text-right text-xs font-semibold text-foreground whitespace-nowrap">Wage</th>
      <th className="px-2 py-2 text-right text-xs font-semibold text-foreground whitespace-nowrap">Allow</th>
      <th className="px-2 py-2 text-right text-xs font-semibold text-foreground whitespace-nowrap">Total</th>
    </>
  );
}

function DayCells({ idx, active, times, paidHrs, allow, rate, wage, total }: {
  idx: number; active: boolean; times: string; paidHrs: number; allow: number; rate: number; wage: number; total: number;
}) {
  const border = idx === 0 ? 'border-l border-border' : '';
  if (!active) {
    return (
      <>
        <td className={`px-2 py-2 text-center font-mono text-xs text-muted-foreground whitespace-nowrap ${border}`}>–</td>
        <td className="px-2 py-2 text-right font-mono text-xs text-muted-foreground whitespace-nowrap">–</td>
        <td className="px-2 py-2 text-right font-mono text-xs text-muted-foreground whitespace-nowrap">–</td>
        <td className="px-2 py-2 text-right font-mono text-xs text-muted-foreground whitespace-nowrap">–</td>
        <td className="px-2 py-2 text-right font-mono text-xs text-muted-foreground whitespace-nowrap">–</td>
        <td className="px-2 py-2 text-right font-mono text-xs text-muted-foreground whitespace-nowrap">–</td>
      </>
    );
  }
  const fmt = (v: number) => v > 0 ? formatCurrency(v) : '–';
  return (
    <>
      <td className={`px-2 py-2 text-center font-mono text-xs whitespace-nowrap ${border}`}>{times}</td>
      <td className="px-2 py-2 text-right font-mono text-xs whitespace-nowrap">{formatDecimalHours(paidHrs)}</td>
      <td className="px-2 py-2 text-right font-mono text-xs whitespace-nowrap">{fmt(rate)}</td>
      <td className="px-2 py-2 text-right font-mono text-xs whitespace-nowrap">{fmt(wage)}</td>
      <td className="px-2 py-2 text-right font-mono text-xs whitespace-nowrap">{fmt(allow)}</td>
      <td className="px-2 py-2 text-right font-mono text-xs font-semibold whitespace-nowrap text-primary">{fmt(total)}</td>
    </>
  );
}
