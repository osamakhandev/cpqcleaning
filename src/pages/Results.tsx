import { useMemo, useState, useCallback } from 'react';
import { usePricingData } from '@/hooks/usePricingData';
import { FixedPriceBanner } from '@/components/FixedPriceBanner';
import { Link } from 'react-router-dom';
import { BarChart3 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { getExportFileName, applySheetFormatting, boldLastRow, downloadWorkbook } from '@/lib/excelExport';
import { PageActions } from '@/components/PageActions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TimelineBar } from '@/components/TimelineBar';
import { WarningBadge } from '@/components/WarningBadge';
import { useRosterStore } from '@/contexts/RosterContext';
import { 
  calculateOperatorWeek, 
  formatDecimalHours, 
  exportToCSV 
} from '@/lib/rosterCalculations';
import { calculateShiftCost, formatCurrency, type ShiftCost, type CostingMode } from '@/lib/costingCalculations';
import { calculateSecurityAllowances, calculateCleaningAllowances, type AllowanceBreakdown } from '@/lib/securityAllowances';
import { RATE_BAND_LABELS } from '@/lib/rateData';
import { useWageSettings } from '@/lib/wageSettings';
import { DAYS_OF_WEEK, DAY_LABELS, SERVICE_LABELS } from '@/types/roster';
import type { OperatorCalculations, DayOfWeek, ServiceType } from '@/types/roster';
import { useServiceColors, hasSupervisionAllowance, levelNumber } from '@/lib/serviceColors';
import { FloatingSearchOperator } from '@/components/FloatingSearchOperator';

const employmentLabels = {
  'full-time': 'Full Time',
  'part-time': 'Part Time',
  'casual': 'Casual',
};

const normalizeService = (value: unknown): keyof typeof SERVICE_LABELS => {
  if (
    value === 'cleaning' || value === 'customer-service' || value === 'security' ||
    value === 'maintenance' || value === 'landscape' || value === 'management'
  ) return value;
  if (value === 'Cleaning') return 'cleaning';
  if (value === 'Customer Service' || value === 'Customer service' || value === 'customer service') return 'customer-service';
  return 'cleaning';
};

function RateBandDisplay({ costInfo }: { costInfo: ShiftCost }) {
  if (!costInfo.hasRate && !costInfo.rateBand) return <span>—</span>;

  if (costInfo.isSplit && costInfo.segments.length > 1) {
    return (
      <div className="flex flex-col gap-0.5">
        {costInfo.segments.map((seg, i) => (
          <Badge key={i} variant="outline" className="text-xs justify-between gap-1">
            <span>{RATE_BAND_LABELS[seg.rateBand] ?? seg.rateBand}</span>
            <span className="font-mono text-muted-foreground ml-1">
              {seg.paidHours.toFixed(1)}h
            </span>
          </Badge>
        ))}
      </div>
    );
  }

  return (
    <Badge variant="outline" className="text-xs">
      {RATE_BAND_LABELS[costInfo.rateBand as keyof typeof RATE_BAND_LABELS] ?? costInfo.rateBand ?? '—'}
    </Badge>
  );
}

function RateDisplay({ costInfo }: { costInfo: ShiftCost }) {
  if (costInfo.isSplit && costInfo.segments.length > 1) {
    return (
      <div className="flex flex-col gap-0.5 text-right">
        {costInfo.segments.map((seg, i) => (
          <span key={i} className="font-mono text-xs">
            {seg.hourlyRate !== null ? formatCurrency(seg.hourlyRate) : '—'}
          </span>
        ))}
      </div>
    );
  }
  return <span className="font-mono">{costInfo.hourlyRate !== null ? formatCurrency(costInfo.hourlyRate) : '—'}</span>;
}

export default function Results() {
  const { operators, rosters, getRoster, isLoaded } = useRosterStore();
  const { getConfigForOperator, isLoaded: wageLoaded } = useWageSettings();
  const [warningsOpen, setWarningsOpen] = useState(false);
  const [operatorSearch, setOperatorSearch] = useState('');
  const { year1Factor, isFixedPrice } = usePricingData();

  const { colors: serviceColors } = useServiceColors();

  const calculations = useMemo(() => {
    const map = new Map<string, OperatorCalculations>();
    operators.forEach(op => {
      const roster = getRoster(op.id);
      if (roster) {
        map.set(op.id, calculateOperatorWeek(roster, op.employmentType, DAYS_OF_WEEK, op.service, op.weeksPerYear));
      }
    });
    return map;
  }, [operators, rosters, getRoster]);

  const costData = useMemo(() => {
    const map = new Map<string, ShiftCost[]>();
    operators.forEach(op => {
      const roster = getRoster(op.id);
      const calc = calculations.get(op.id);
      if (!roster || !calc) return;

      const normalizedService = normalizeService((op as any).service);
      const wageInfo = getConfigForOperator(normalizedService, op.level);

      const dayCosts: ShiftCost[] = calc.days.map(dayCalc => {
        const base = calculateShiftCost(
          dayCalc.day,
          dayCalc.startTime || '',
          dayCalc.endTime || '',
          dayCalc.paidHours,
          normalizedService,
          op.employmentType,
          op.level,
          op.isFixedNights ?? false,
          wageInfo?.rates ?? null,
        );
        if (year1Factor !== 1 && base.cost !== null) {
          return { ...base, cost: base.cost * year1Factor, segments: base.segments.map(seg => ({ ...seg, cost: seg.cost !== null ? seg.cost * year1Factor : null })) };
        }
        return base;
      });
      map.set(op.id, dayCosts);
    });
    return map;
  }, [operators, rosters, calculations, getRoster, getConfigForOperator, year1Factor]);

  const allowanceData = useMemo(() => {
    const map = new Map<string, AllowanceBreakdown | null>();
    operators.forEach(op => {
      const calc = calculations.get(op.id);
      if (!calc) { map.set(op.id, null); return; }
      const normalizedService = normalizeService(op.service);
      const workedDays = calc.days.filter(d => d.coverageMin > 0).map(d => d.day);
      let result: AllowanceBreakdown | null = null;
      if (normalizedService === 'security' && op.securityAllowances) {
        result = calculateSecurityAllowances(op.securityAllowances, calc.weeklyPaidHours, workedDays.length);
      } else if (normalizedService === 'cleaning' && op.cleaningAllowances) {
        result = calculateCleaningAllowances(op.cleaningAllowances, calc.weeklyPaidHours, workedDays, op.level);
      }
      if (result && year1Factor !== 1) {
        result = {
          ...result,
          totalWeekly: result.totalWeekly * year1Factor,
          items: result.items.map(item => ({ ...item, cost: item.cost * year1Factor })),
        };
      }
      map.set(op.id, result);
    });
    return map;
  }, [operators, calculations, year1Factor]);

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // --- Sheet 1: Roster Results ---
    const headers = ['Operator #', 'Service', 'Employment', 'Level', 'Day', 'Start', 'End', 'Division', 'Paid Hours', 'Rate Band', 'Rate $/h', 'Wage $', 'Warnings'];
    const aoa: (string | number)[][] = [headers];

    operators.forEach(op => {
      const calc = calculations.get(op.id);
      const opCosts = costData.get(op.id);
      if (!calc) return;
      const ns = normalizeService(op.service);
      calc.days.forEach((day, idx) => {
        const costInfo = opCosts?.[idx];
        const roster = getRoster(op.id);
        const shift = roster?.shifts[day.day];
        aoa.push([
          op.number,
          SERVICE_LABELS[ns],
          employmentLabels[op.employmentType],
          `Level ${levelNumber(op.level)}`,
          DAY_LABELS[day.day],
          day.startTime || '',
          day.endTime || '',
          shift?.division || '',
          day.paidHours,
          costInfo?.rateBand || '',
          costInfo?.hourlyRate ?? 0,
          costInfo?.cost ?? 0,
          '',
        ]);
      });
      // Add warnings as separate rows
      if (calc.warnings.length > 0) {
        calc.warnings.forEach(w => {
          aoa.push([op.number, '', '', '', '', '', '', '', 0, '', 0, 0, w]);
        });
      }
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    applySheetFormatting(ws, headers);
    XLSX.utils.book_append_sheet(wb, ws, 'Roster Results');

    // --- Sheet 2: Summary ---
    const summHeaders = ['Operator #', 'Service', 'Employment', 'Level', 'Weekly Hours', 'Weekly Cost', 'Allowances', 'Weekly Total', 'Annual Cost', 'Warnings'];
    const summAoa: (string | number)[][] = [summHeaders];

    operators.forEach(op => {
      const calc = calculations.get(op.id);
      const opCosts = costData.get(op.id);
      const allow = allowanceData.get(op.id);
      if (!calc) return;
      const ns = normalizeService(op.service);
      const labour = opCosts?.reduce((s, c) => s + (c.cost ?? 0), 0) ?? 0;
      const allowCost = allow?.totalWeekly ?? 0;
      const weeklyTotal = labour + allowCost;
      const mult = getAnnualMultiplier(op);
      summAoa.push([
        op.number, SERVICE_LABELS[ns], employmentLabels[op.employmentType],
        `Level ${levelNumber(op.level)}`, calc.weeklyPaidHours, labour, allowCost, weeklyTotal,
        weeklyTotal * mult, calc.warnings.length,
      ]);
    });
    summAoa.push(['', '', '', 'TOTAL', totalWeeklyHours, totalWeeklyCost - Array.from(allowanceData.values()).reduce((s, a) => s + (a?.totalWeekly ?? 0), 0), Array.from(allowanceData.values()).reduce((s, a) => s + (a?.totalWeekly ?? 0), 0), totalWeeklyCost, totalAnnualCost, totalWarnings]);

    const ws2 = XLSX.utils.aoa_to_sheet(summAoa);
    applySheetFormatting(ws2, summHeaders);
    boldLastRow(ws2);
    XLSX.utils.book_append_sheet(wb, ws2, 'Summary');

    downloadWorkbook(wb, getExportFileName('RosterResults'));
  };

  const handleExport = () => {
    const csv = exportToCSV(operators, rosters, calculations, DAYS_OF_WEEK);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `roster-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredOperators = useMemo(() => {
    const q = operatorSearch.trim().toLowerCase();
    if (!q) return operators;
    return operators.filter(op => {
      const numStr = String(op.number);
      if (numStr.includes(q)) return true;
      if (op.name && op.name.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [operators, operatorSearch]);

  if (!isLoaded || !wageLoaded) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (operators.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Results</h1>
          <p className="text-muted-foreground">View calculated hours and costs</p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <BarChart3 className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-2">No data to display</h3>
            <p className="text-muted-foreground text-center mb-4">
              Add operators and roster shifts to see results
            </p>
            <Button asChild>
              <Link to="/">Go to Operators</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Helper to get annual multiplier per operator
  const getAnnualMultiplier = (op: typeof operators[0]) => {
    if (op.employmentType === 'casual' && typeof op.weeksPerYear === 'number') {
      return op.weeksPerYear;
    }
    return 52.14;
  };

  const totalWeeklyHours = Array.from(calculations.values())
    .reduce((sum, calc) => sum + calc.weeklyPaidHours, 0);
  const totalWarnings = Array.from(calculations.values())
    .reduce((sum, calc) => sum + calc.warnings.length, 0);
  const totalAnnualCost = operators.reduce((sum, op) => {
    const dayCosts = costData.get(op.id);
    const labourCost = dayCosts?.reduce((daySum, dc) => daySum + (dc.cost ?? 0), 0) ?? 0;
    const allowanceCost = allowanceData.get(op.id)?.totalWeekly ?? 0;
    const weeklyOpCost = labourCost + allowanceCost;
    return sum + weeklyOpCost * getAnnualMultiplier(op);
  }, 0);
  const totalWeeklyCost = operators.reduce((sum, op) => {
    const dayCosts = costData.get(op.id);
    const labourCost = dayCosts?.reduce((daySum, dc) => daySum + (dc.cost ?? 0), 0) ?? 0;
    const allowanceCost = allowanceData.get(op.id)?.totalWeekly ?? 0;
    return sum + labourCost + allowanceCost;
  }, 0);
  const warningOperatorCount = operators.filter(op => {
    const calc = calculations.get(op.id);
    return calc && calc.warnings.length > 0;
  }).length;


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Results</h1>
          <p className="text-muted-foreground">View calculated hours and costs</p>
        </div>
        <PageActions
          onExportExcel={handleExportExcel}
          onExportCSV={handleExport}
          showExcel
          showCSV
          showPrint
        />
      </div>

      <FloatingSearchOperator onFilterChange={setOperatorSearch} matchCount={filteredOperators.length} totalCount={operators.length} storageKey="cpq-search-results-pos" />

      <FixedPriceBanner />

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold font-mono">{operators.length}</div>
            <div className="text-sm text-muted-foreground">Total Operators</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold font-mono">{formatDecimalHours(totalWeeklyHours)}</div>
            <div className="text-sm text-muted-foreground">Weekly Hours</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold font-mono text-primary">{formatCurrency(totalWeeklyCost)}</div>
            <div className="text-sm text-muted-foreground">Weekly Cost</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold font-mono text-primary">{formatCurrency(totalAnnualCost)}</div>
            <div className="text-sm text-muted-foreground">Price per Annum</div>
          </CardContent>
        </Card>
        <Card
          className={totalWarnings > 0 ? 'cursor-pointer hover:border-warning/50 transition-colors' : ''}
          onClick={() => totalWarnings > 0 && setWarningsOpen(true)}
        >
          <CardContent className="pt-6">
            <div className={`text-2xl font-bold font-mono ${totalWarnings > 0 ? 'text-warning' : 'text-success'}`}>
              {totalWarnings}
            </div>
            <div className="text-sm text-muted-foreground">Active Warnings</div>
          </CardContent>
        </Card>
      </div>

      {/* Warnings detail dialog */}
      <Dialog open={warningsOpen} onOpenChange={setWarningsOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Active Warnings ({totalWarnings})</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {operators.filter(op => {
              const calc = calculations.get(op.id);
              return calc && calc.warnings.length > 0;
            }).map(op => {
              const calc = calculations.get(op.id)!;
              return (
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
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Operator results */}
      {filteredOperators.map(operator => {
        const calc = calculations.get(operator.id);
        const opCostData = costData.get(operator.id);
        const allowanceInfo = allowanceData.get(operator.id);
        if (!calc) return null;

        const labourCost = opCostData?.reduce((sum, dc) => sum + (dc.cost ?? 0), 0) ?? 0;
        const allowanceCost = allowanceInfo?.totalWeekly ?? 0;
        const weeklyOpCost = labourCost + allowanceCost;
        const annualMultiplier = getAnnualMultiplier(operator);
        const normalizedService = normalizeService((operator as any).service);
        const costingMode: CostingMode = opCostData?.[0]?.costingMode ?? 'highest';
        const opServiceColor = serviceColors[normalizedService];
        const opShowHatch = hasSupervisionAllowance(operator);

        return (
          <Card key={operator.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-3">
                  <span>Operator {operator.number} (Level {levelNumber(operator.level)})</span>
                  {operator.name && (
                    <span className="text-muted-foreground font-normal">{operator.name}</span>
                  )}
                  <Badge variant="outline">{employmentLabels[operator.employmentType]}</Badge>
                  <Badge variant="secondary">
                    {SERVICE_LABELS[normalizedService]}
                    {operator.isFixedNights && ' (Fixed Nights)'}
                  </Badge>
                  {costingMode !== 'highest' && (
                    <Badge variant="outline" className="text-xs bg-muted">
                      {costingMode === 'split' ? 'Split-Band' : 'Wage-Based'}
                    </Badge>
                  )}
                </CardTitle>
                <div className="flex items-center gap-4">
                  {calc.warnings.length > 0 && <WarningBadge warnings={calc.warnings} />}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Totals */}
              <div className={`grid gap-4 p-4 bg-muted/50 rounded-lg ${allowanceInfo ? 'grid-cols-7' : 'grid-cols-6'}`}>
                <div>
                  <div className="text-sm text-muted-foreground">Weekly Hours</div>
                  <div className="text-xl font-mono font-bold">{formatDecimalHours(calc.weeklyPaidHours)}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Labour Cost</div>
                  <div className="text-xl font-mono font-bold text-primary">{formatCurrency(labourCost)}</div>
                </div>
                {allowanceInfo && (
                  <div>
                    <div className="text-sm text-muted-foreground">Allowances</div>
                    <div className="text-xl font-mono font-bold text-primary">{formatCurrency(allowanceCost)}</div>
                  </div>
                )}
                <div>
                  <div className="text-sm text-muted-foreground">Weekly Total</div>
                  <div className="text-xl font-mono font-bold text-primary">{formatCurrency(weeklyOpCost)}</div>
                </div>
                {operator.employmentType === 'casual' && (
                  <div>
                    <div className="text-sm text-muted-foreground">Weeks/Year</div>
                    <div className="text-xl font-mono font-bold">{annualMultiplier}</div>
                  </div>
                )}
                <div>
                  <div className="text-sm text-muted-foreground">Yearly Cost{operator.employmentType === 'casual' ? ` (×${annualMultiplier})` : ''}</div>
                  <div className="text-xl font-mono font-bold text-primary">{formatCurrency(weeklyOpCost * annualMultiplier)}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Avg Hourly</div>
                  <div className="text-xl font-mono font-bold">
                    {calc.weeklyPaidHours > 0 ? formatCurrency(weeklyOpCost / calc.weeklyPaidHours) : '—'}
                  </div>
                </div>
              </div>

              {/* Daily breakdown */}
              <div>
                <h4 className="font-medium mb-3">Daily Coverage & Costs</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-28">Day</TableHead>
                      <TableHead className="w-24">Start</TableHead>
                      <TableHead className="w-24">End</TableHead>
                      <TableHead className="w-24">Division</TableHead>
                      <TableHead className="w-24 text-right">Paid</TableHead>
                      <TableHead className="w-36">Rate Band</TableHead>
                      <TableHead className="w-24 text-right">Rate</TableHead>
                      <TableHead className="w-24 text-right">Cost</TableHead>
                      
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {calc.days.map((day, idx) => {
                      const costInfo = opCostData?.[idx];
                      const roster = getRoster(operator.id);
                      const shift = roster?.shifts[day.day];
                      return (
                        <TableRow key={day.day}>
                          <TableCell className="font-medium">{DAY_LABELS[day.day]}</TableCell>
                          <TableCell className="font-mono">{day.startTime || '—'}</TableCell>
                          <TableCell className="font-mono">{day.endTime || '—'}</TableCell>
                          <TableCell className="text-sm">
                            {shift?.segments && shift.segments.length > 1 ? (
                              <span className="font-medium" title={shift.segments.map(s => `${s.divisionId || 'Unassigned'} – ${s.minutes}min`).join('\n')}>Mixed</span>
                            ) : (
                              shift?.division || '—'
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono font-medium">
                            {day.isValid ? formatDecimalHours(day.paidHours) : '—'}
                          </TableCell>
                          <TableCell>
                            {costInfo ? <RateBandDisplay costInfo={costInfo} /> : '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            {costInfo ? <RateDisplay costInfo={costInfo} /> : '—'}
                          </TableCell>
                          <TableCell className="text-right font-mono font-medium text-primary">
                            {formatCurrency(costInfo?.cost ?? null)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {allowanceInfo && allowanceInfo.items.length > 0 && (
                <div>
                  <h4 className="font-medium mb-3">Allowances</h4>
                  <div className="space-y-1 p-4 bg-muted/30 rounded-lg">
                    {allowanceInfo.items.map((item, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span>{item.name}</span>
                        <span className="font-mono text-muted-foreground">
                          {item.detail} = <span className="text-foreground font-medium">{formatCurrency(item.cost)}</span>
                        </span>
                      </div>
                    ))}
                    <div className="border-t pt-2 mt-2 flex justify-between font-medium">
                      <span>Total Allowances (Weekly)</span>
                      <span className="font-mono text-primary">{formatCurrency(allowanceInfo.totalWeekly)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Timeline legend */}
              <div className="flex items-center gap-6 text-sm text-muted-foreground px-4">
                <span className="flex items-center gap-2">
                  <span className="w-4 h-3 rounded-sm" style={{ backgroundColor: opServiceColor }} />
                  Day shift (06:00-18:00)
                </span>
                <span className="flex items-center gap-2">
                  <span className="w-4 h-3 rounded-sm" style={{ backgroundColor: opServiceColor, opacity: 0.8 }} />
                  Night/Early shift
                </span>
                <span className="flex items-center gap-2">
                  <span className="w-4 h-3 rounded-sm break-unpaid" />
                  Unpaid break
                </span>
                <span className="flex items-center gap-2">
                  <span className="w-4 h-3 rounded-sm break-paid" />
                  Paid break
                </span>
                {opShowHatch && (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-3 rounded-sm supervision-hatch" style={{ backgroundColor: opServiceColor }} />
                    Supervision
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Annual Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Annual Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6 p-4 bg-muted/30 rounded-lg">
            <div>
              <div className="text-sm text-muted-foreground">Total Paid Hours / Week</div>
              <div className="text-xl font-mono font-bold">{formatDecimalHours(totalWeeklyHours)}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Total Cost / Week</div>
              <div className="text-xl font-mono font-bold text-primary">{formatCurrency(totalWeeklyCost)}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Price per Annum</div>
              <div className="text-xl font-mono font-bold text-primary">{formatCurrency(totalAnnualCost)}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Total Operators</div>
              <div className="text-xl font-mono font-bold">{operators.length}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Compliance</div>
              <div className={`text-lg font-mono font-bold ${totalWarnings > 0 ? 'text-warning' : 'text-success'}`}>
                {totalWarnings > 0
                  ? `${totalWarnings} warning${totalWarnings !== 1 ? 's' : ''} across ${warningOperatorCount} operator${warningOperatorCount !== 1 ? 's' : ''}`
                  : 'No warnings'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
