import { useMemo, useCallback, useState } from 'react';
import { useRosterStore } from '@/contexts/RosterContext';
import { usePricingData } from '@/hooks/usePricingData';
import { FixedPriceBanner } from '@/components/FixedPriceBanner';
import {
  calculateOperatorWeek,
} from '@/lib/rosterCalculations';
import { calculateShiftCost, formatCurrency, type ShiftCost } from '@/lib/costingCalculations';
import { calculateSecurityAllowances, calculateCleaningAllowances, type AllowanceBreakdown } from '@/lib/securityAllowances';
import { useWageSettings } from '@/lib/wageSettings';
import { useServiceColors } from '@/lib/serviceColors';
import { DAYS_OF_WEEK, SERVICE_LABELS } from '@/types/roster';
import type { OperatorCalculations, DayOfWeek, ServiceType, EmploymentType } from '@/types/roster';
import { useDivisions } from '@/components/DivisionsSettings';
import { useAssessment } from '@/contexts/AssessmentContext';
import { FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { getExportFileName, applySheetFormatting, boldLastRow, downloadWorkbook } from '@/lib/excelExport';

const DAY_SHORT: Record<DayOfWeek, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
};

const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  'full-time': 'Full Time',
  'part-time': 'Part Time',
  'casual': 'Casual',
};

const SERVICES: ServiceType[] = ['cleaning', 'security', 'customer-service', 'management', 'maintenance', 'landscape'];

const normalizeService = (value: unknown): ServiceType => {
  if (
    value === 'cleaning' || value === 'customer-service' || value === 'security' ||
    value === 'maintenance' || value === 'landscape' || value === 'management'
  ) return value;
  return 'cleaning';
};

function fmt(val: number | null | undefined, type: 'hours' | 'currency'): string {
  if (val === null || val === undefined || val === 0) return '–';
  if (type === 'currency') return formatCurrency(val);
  return val.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ── Day-based table (Mon–Sun + TOTAL) ── */
function DayTable({
  empLabel,
  serviceData,
  type,
  serviceColors,
}: {
  empLabel: string;
  serviceData: Record<ServiceType, { days: Record<DayOfWeek, number>; total: number }>;
  type: 'hours' | 'currency';
  serviceColors: Record<ServiceType, string>;
}) {
  const totals: Record<DayOfWeek, number> = {} as any;
  DAYS_OF_WEEK.forEach(d => {
    totals[d] = SERVICES.reduce((sum, s) => sum + serviceData[s].days[d], 0);
  });
  const grandTotal = SERVICES.reduce((sum, s) => sum + serviceData[s].total, 0);

  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="border-b border-border bg-muted/30">
          <th className="text-left px-2 py-1.5 font-semibold w-32">{empLabel}</th>
          {DAYS_OF_WEEK.map(d => (
            <th key={d} className="text-right px-2 py-1.5 font-medium">{DAY_SHORT[d]}</th>
          ))}
          <th className="text-right px-2 py-1.5 font-semibold">TOTAL</th>
        </tr>
      </thead>
      <tbody>
        {SERVICES.map((service, idx) => {
          const row = serviceData[service];
          const hasData = row.total !== 0;
          return (
            <tr key={service} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/10'}>
              <td className="px-2 py-1">
                <span className="inline-block w-2 h-2 rounded-sm mr-1.5" style={{ backgroundColor: serviceColors[service] }} />
                <span className="font-medium">{SERVICE_LABELS[service]}</span>
              </td>
              {DAYS_OF_WEEK.map(d => (
                <td key={d} className="text-right px-2 py-1 font-mono">{hasData ? fmt(row.days[d], type) : '–'}</td>
              ))}
              <td className="text-right px-2 py-1 font-mono font-medium">{hasData ? fmt(row.total, type) : '–'}</td>
            </tr>
          );
        })}
        <tr className="border-t border-border bg-muted/40 font-semibold">
          <td className="px-2 py-1.5">TOTAL</td>
          {DAYS_OF_WEEK.map(d => (
            <td key={d} className="text-right px-2 py-1.5 font-mono">{fmt(totals[d], type)}</td>
          ))}
          <td className="text-right px-2 py-1.5 font-mono">{fmt(grandTotal, type)}</td>
        </tr>
      </tbody>
    </table>
  );
}

/* ── Rollup table (HOURS / Labour / Allowance / TOTAL Cost) ── */
function RollupTable({
  empLabel,
  data,
  serviceColors,
}: {
  empLabel: string;
  data: Record<ServiceType, { hours: number; labour: number; allowance: number; totalCost: number }>;
  serviceColors: Record<ServiceType, string>;
}) {
  const totals = SERVICES.reduce(
    (acc, s) => ({
      hours: acc.hours + data[s].hours,
      labour: acc.labour + data[s].labour,
      allowance: acc.allowance + data[s].allowance,
      totalCost: acc.totalCost + data[s].totalCost,
    }),
    { hours: 0, labour: 0, allowance: 0, totalCost: 0 },
  );

  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="border-b border-border bg-muted/30">
          <th className="text-left px-2 py-1.5 font-semibold w-32">{empLabel}</th>
          <th className="text-right px-2 py-1.5 font-medium">HOURS</th>
          <th className="text-right px-2 py-1.5 font-medium">Labour</th>
          <th className="text-right px-2 py-1.5 font-medium">Allowance</th>
          <th className="text-right px-2 py-1.5 font-semibold">TOTAL Cost</th>
        </tr>
      </thead>
      <tbody>
        {SERVICES.map((service, idx) => {
          const row = data[service];
          const hasData = row.totalCost !== 0 || row.hours !== 0;
          return (
            <tr key={service} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/10'}>
              <td className="px-2 py-1">
                <span className="inline-block w-2 h-2 rounded-sm mr-1.5" style={{ backgroundColor: serviceColors[service] }} />
                <span className="font-medium">{SERVICE_LABELS[service]}</span>
              </td>
              <td className="text-right px-2 py-1 font-mono">{hasData ? fmt(row.hours, 'hours') : '–'}</td>
              <td className="text-right px-2 py-1 font-mono">{hasData ? fmt(row.labour, 'currency') : '–'}</td>
              <td className="text-right px-2 py-1 font-mono">{hasData ? fmt(row.allowance, 'currency') : '–'}</td>
              <td className="text-right px-2 py-1 font-mono font-medium">{hasData ? fmt(row.totalCost, 'currency') : '–'}</td>
            </tr>
          );
        })}
        <tr className="border-t border-border bg-muted/40 font-semibold">
          <td className="px-2 py-1.5">TOTAL</td>
          <td className="text-right px-2 py-1.5 font-mono">{fmt(totals.hours, 'hours')}</td>
          <td className="text-right px-2 py-1.5 font-mono">{fmt(totals.labour, 'currency')}</td>
          <td className="text-right px-2 py-1.5 font-mono">{fmt(totals.allowance, 'currency')}</td>
          <td className="text-right px-2 py-1.5 font-mono">{fmt(totals.totalCost, 'currency')}</td>
        </tr>
      </tbody>
    </table>
  );
}

export default function DetailedSummary() {
  const { operators, rosters, getRoster, isLoaded } = useRosterStore();
  const { getConfigForOperator, isLoaded: wageLoaded } = useWageSettings();
  const { colors: serviceColors } = useServiceColors();
  const {
    jobDetails, phDayCosts, phTotalCost, PH_MULTIPLIERS, phDowCostMap,
    isLoading: pricingLoading, year1Factor, isFixedPrice,
    grandTotals, statutoryCalc, statutoryTotal,
    sundryCalc, sundryTotalValue, sundryDisplayTotal,
    adminCalc, adminTotalValue,
    contractTotalAnnual,
    operatorAnnualCosts,
    totalPerWeek, totalPerMonth, totalPerAnnum,
  } = usePricingData();
  const { divisions } = useDivisions();
  const { tenantSpecialGroups, getTenantSpecialHours } = useAssessment();
  const [exporting, setExporting] = useState(false);

  // Pre-compute calculations, costs, allowances per operator
  const computed = useMemo(() => {
    const calcs = new Map<string, OperatorCalculations>();
    const costs = new Map<string, ShiftCost[]>();
    const allowances = new Map<string, AllowanceBreakdown | null>();

    operators.forEach(op => {
      const roster = getRoster(op.id);
      if (!roster) return;

      const calc = calculateOperatorWeek(roster, op.employmentType, DAYS_OF_WEEK, op.service, op.weeksPerYear);
      calcs.set(op.id, calc);

      const ns = normalizeService(op.service);
      const wageInfo = getConfigForOperator(ns, op.level);
      const dayCosts = calc.days.map(d => {
        const base = calculateShiftCost(d.day, d.startTime || '', d.endTime || '', d.paidHours, ns, op.employmentType, op.level, op.isFixedNights ?? false, wageInfo?.rates ?? null);
        if (year1Factor !== 1 && base.cost !== null) {
          return { ...base, cost: base.cost * year1Factor, segments: base.segments.map(seg => ({ ...seg, cost: seg.cost !== null ? seg.cost * year1Factor : null })) };
        }
        return base;
      });
      costs.set(op.id, dayCosts);

      const workedDays = calc.days.filter(d => d.coverageMin > 0).map(d => d.day);
      let allowResult: AllowanceBreakdown | null = null;
      if (ns === 'security' && op.securityAllowances) {
        allowResult = calculateSecurityAllowances(op.securityAllowances, calc.weeklyPaidHours, workedDays.length);
      } else if (ns === 'cleaning' && op.cleaningAllowances) {
        allowResult = calculateCleaningAllowances(op.cleaningAllowances, calc.weeklyPaidHours, workedDays, op.level);
      }
      if (allowResult && year1Factor !== 1) {
        allowResult = {
          ...allowResult,
          totalWeekly: allowResult.totalWeekly * year1Factor,
          items: allowResult.items.map(item => ({ ...item, cost: item.cost * year1Factor })),
        };
      }
      allowances.set(op.id, allowResult);
    });

    return { calcs, costs, allowances };
  }, [operators, rosters, getRoster, getConfigForOperator, year1Factor]);

  // Build aggregated data structures
  const aggregated = useMemo(() => {
    const empTypes: EmploymentType[] = ['full-time', 'part-time', 'casual'];
    const emptyDays = () => {
      const d: Record<DayOfWeek, number> = {} as any;
      DAYS_OF_WEEK.forEach(day => (d[day] = 0));
      return d;
    };
    const emptyServiceMap = () => {
      const m: Record<ServiceType, { days: Record<DayOfWeek, number>; total: number }> = {} as any;
      SERVICES.forEach(s => (m[s] = { days: emptyDays(), total: 0 }));
      return m;
    };
    const emptyRollupMap = () => {
      const m: Record<ServiceType, { hours: number; labour: number; allowance: number; totalCost: number }> = {} as any;
      SERVICES.forEach(s => (m[s] = { hours: 0, labour: 0, allowance: 0, totalCost: 0 }));
      return m;
    };

    const hours: Record<EmploymentType, Record<ServiceType, { days: Record<DayOfWeek, number>; total: number }>> = {} as any;
    const labour: Record<EmploymentType, Record<ServiceType, { days: Record<DayOfWeek, number>; total: number }>> = {} as any;
    const allowance: Record<EmploymentType, Record<ServiceType, { days: Record<DayOfWeek, number>; total: number }>> = {} as any;
    const rollup: Record<EmploymentType, Record<ServiceType, { hours: number; labour: number; allowance: number; totalCost: number }>> = {} as any;
    const weeklyHours: Record<ServiceType, { days: Record<DayOfWeek, number>; total: number }> = emptyServiceMap();

    empTypes.forEach(et => {
      hours[et] = emptyServiceMap();
      labour[et] = emptyServiceMap();
      allowance[et] = emptyServiceMap();
      rollup[et] = emptyRollupMap();
    });

    operators.forEach(op => {
      const calc = computed.calcs.get(op.id);
      const dayCosts = computed.costs.get(op.id);
      const allowInfo = computed.allowances.get(op.id);
      if (!calc || !dayCosts) return;

      const et = op.employmentType;
      const svc = normalizeService(op.service);
      const annualFactor = et === 'casual' && typeof op.weeksPerYear === 'number' ? op.weeksPerYear : 52.14;

      calc.days.forEach((d, idx) => {
        const paidHrs = d.paidHours;
        const cost = dayCosts[idx]?.cost ?? 0;

        hours[et][svc].days[d.day] += paidHrs * annualFactor;
        hours[et][svc].total += paidHrs * annualFactor;

        labour[et][svc].days[d.day] += cost * annualFactor;
        labour[et][svc].total += cost * annualFactor;

        weeklyHours[svc].days[d.day] += paidHrs;
        weeklyHours[svc].total += paidHrs;
      });

      const weeklyAllowance = allowInfo?.totalWeekly ?? 0;
      const workedDaysList = calc.days.filter(d => d.coverageMin > 0);
      if (weeklyAllowance > 0 && workedDaysList.length > 0) {
        const perDay = weeklyAllowance / workedDaysList.length;
        workedDaysList.forEach(d => {
          allowance[et][svc].days[d.day] += perDay * annualFactor;
        });
        allowance[et][svc].total += weeklyAllowance * annualFactor;
      }

      const totalLabourWeekly = dayCosts.reduce((sum, dc) => sum + (dc.cost ?? 0), 0);
      rollup[et][svc].hours += calc.weeklyPaidHours * annualFactor;
      rollup[et][svc].labour += totalLabourWeekly * annualFactor;
      rollup[et][svc].allowance += weeklyAllowance * annualFactor;
      rollup[et][svc].totalCost += (totalLabourWeekly + weeklyAllowance) * annualFactor;
    });

    // Combined all employment types hours
    const allHours = emptyServiceMap();
    SERVICES.forEach(s => {
      empTypes.forEach(et => {
        DAYS_OF_WEEK.forEach(d => {
          allHours[s].days[d] += hours[et][s].days[d];
        });
        allHours[s].total += hours[et][s].total;
      });
    });

    return { hours, labour, allowance, rollup, weeklyHours, allHours };
  }, [operators, computed]);

  // FT+PT combined year/day totals
  const ftPtCombined = useMemo(() => {
    const perDay: Record<DayOfWeek, number> = {} as any;
    DAYS_OF_WEEK.forEach(d => {
      perDay[d] = 0;
      SERVICES.forEach(s => {
        perDay[d] += (aggregated.labour['full-time'][s].days[d] + aggregated.allowance['full-time'][s].days[d]);
        perDay[d] += (aggregated.labour['part-time'][s].days[d] + aggregated.allowance['part-time'][s].days[d]);
      });
    });
    const yearTotal = DAYS_OF_WEEK.reduce((sum, d) => sum + perDay[d], 0);
    return { perDay, yearTotal };
  }, [aggregated]);

  /* ── Excel Export (excludes Public Holidays) ── */
  const handleExportExcel = useCallback(() => {
    if (exporting) return;
    setExporting(true);
    try {
      const wb = XLSX.utils.book_new();
      const jobName = jobDetails.jobName || 'Project';
      const empTypes: EmploymentType[] = ['full-time', 'part-time', 'casual'];
      const dayHeaders = DAYS_OF_WEEK.map(d => DAY_SHORT[d]);

      const addDaySheet = (
        title: string,
        sheetName: string,
        getData: (et: EmploymentType, s: ServiceType) => { days: Record<DayOfWeek, number>; total: number },
        formatType: 'hours' | 'currency',
        empFilter?: EmploymentType[],
      ) => {
        const types = empFilter || empTypes;
        const rows: any[][] = [[title], []];
        types.forEach(et => {
          rows.push([EMPLOYMENT_LABELS[et], ...dayHeaders, 'TOTAL']);
          SERVICES.forEach(s => {
            const d = getData(et, s);
            rows.push([SERVICE_LABELS[s], ...DAYS_OF_WEEK.map(day => d.days[day]), d.total]);
          });
          const totals = DAYS_OF_WEEK.map(day => SERVICES.reduce((sum, s) => sum + getData(et, s).days[day], 0));
          const grand = SERVICES.reduce((sum, s) => sum + getData(et, s).total, 0);
          rows.push(['TOTAL', ...totals, grand]);
          rows.push([]);
        });
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [{ wch: 28 }, ...Array(8).fill({ wch: 16 })];
        if (ws['A1']) ws['A1'].s = { font: { bold: true, sz: 13 } };
        // Apply number formats
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
        for (let C = 1; C <= range.e.c; C++) {
          for (let R = 2; R <= range.e.r; R++) {
            const addr = XLSX.utils.encode_cell({ r: R, c: C });
            if (ws[addr] && typeof ws[addr].v === 'number') {
              ws[addr].z = formatType === 'currency' ? '$#,##0.00' : '0.00';
            }
          }
        }
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      };

      /* Tab 1: Total HOURS / YEAR */
      addDaySheet(
        'Total HOURS / YEAR (excl. PH)',
        'Total Hours Year',
        (et, s) => aggregated.hours[et][s],
        'hours',
      );

      /* Tab 2: Weekly Hours */
      {
        const rows: any[][] = [['Weekly Hours'], [], ['Service', ...dayHeaders, 'TOTAL']];
        SERVICES.forEach(s => {
          const r = aggregated.weeklyHours[s];
          rows.push([SERVICE_LABELS[s], ...DAYS_OF_WEEK.map(d => r.days[d]), r.total]);
        });
        const totals = DAYS_OF_WEEK.map(d => SERVICES.reduce((sum, s) => sum + aggregated.weeklyHours[s].days[d], 0));
        const grand = SERVICES.reduce((sum, s) => sum + aggregated.weeklyHours[s].total, 0);
        rows.push(['TOTAL', ...totals, grand]);
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [{ wch: 28 }, ...Array(8).fill({ wch: 14 })];
        if (ws['A1']) ws['A1'].s = { font: { bold: true, sz: 13 } };
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
        for (let C = 1; C <= range.e.c; C++) {
          for (let R = 2; R <= range.e.r; R++) {
            const addr = XLSX.utils.encode_cell({ r: R, c: C });
            if (ws[addr] && typeof ws[addr].v === 'number') ws[addr].z = '0.00';
          }
        }
        XLSX.utils.book_append_sheet(wb, ws, 'Weekly Hours');
      }

      /* Tab 3: Total LABOUR Cost $ / YEAR (wages only, excl allowances) */
      addDaySheet(
        'Total LABOUR Cost $ / YEAR – Wages Only (excl. PH)',
        'Labour Cost Year',
        (et, s) => aggregated.labour[et][s],
        'currency',
      );

      /* Tab 4: Total Allowance Cost $ / YEAR */
      addDaySheet(
        'Total Allowance Cost $ / YEAR (excl. PH)',
        'Allowance Cost Year',
        (et, s) => aggregated.allowance[et][s],
        'currency',
      );

      /* Tab 5: Total / YEAR (combined wages + allowances) */
      {
        const rows: any[][] = [['Total / YEAR – Labour + Allowances (excl. PH)'], []];
        empTypes.forEach(et => {
          rows.push([EMPLOYMENT_LABELS[et], 'HOURS', 'Labour', 'Allowance', 'TOTAL Cost']);
          SERVICES.forEach(s => {
            const r = aggregated.rollup[et][s];
            rows.push([SERVICE_LABELS[s], r.hours, r.labour, r.allowance, r.totalCost]);
          });
          const t = SERVICES.reduce((a, s) => ({
            hours: a.hours + aggregated.rollup[et][s].hours,
            labour: a.labour + aggregated.rollup[et][s].labour,
            allowance: a.allowance + aggregated.rollup[et][s].allowance,
            totalCost: a.totalCost + aggregated.rollup[et][s].totalCost,
          }), { hours: 0, labour: 0, allowance: 0, totalCost: 0 });
          rows.push(['TOTAL', t.hours, t.labour, t.allowance, t.totalCost]);
          rows.push([]);
        });
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
        if (ws['A1']) ws['A1'].s = { font: { bold: true, sz: 13 } };
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
        for (let R = 2; R <= range.e.r; R++) {
          const hAddr = XLSX.utils.encode_cell({ r: R, c: 1 });
          if (ws[hAddr] && typeof ws[hAddr].v === 'number') ws[hAddr].z = '0.00';
          for (let C = 2; C <= 4; C++) {
            const addr = XLSX.utils.encode_cell({ r: R, c: C });
            if (ws[addr] && typeof ws[addr].v === 'number') ws[addr].z = '$#,##0.00';
          }
        }
        XLSX.utils.book_append_sheet(wb, ws, 'Total Year');
      }

      /* Tab 6: Total LABOUR Cost $ / YEAR (FT + PT only, incl allowances) */
      {
        const ftPtTypes: EmploymentType[] = ['full-time', 'part-time'];
        const rows: any[][] = [['Total LABOUR Cost $ / YEAR – FT + PT Only (incl. Allowances, excl. PH)'], []];
        ftPtTypes.forEach(et => {
          rows.push([EMPLOYMENT_LABELS[et], ...dayHeaders, 'TOTAL']);
          SERVICES.forEach(s => {
            const lab = aggregated.labour[et][s];
            const all = aggregated.allowance[et][s];
            const combined = DAYS_OF_WEEK.map(d => lab.days[d] + all.days[d]);
            rows.push([SERVICE_LABELS[s], ...combined, lab.total + all.total]);
          });
          const totals = DAYS_OF_WEEK.map(d => SERVICES.reduce((sum, s) => sum + aggregated.labour[et][s].days[d] + aggregated.allowance[et][s].days[d], 0));
          const grand = SERVICES.reduce((sum, s) => sum + aggregated.labour[et][s].total + aggregated.allowance[et][s].total, 0);
          rows.push(['TOTAL', ...totals, grand]);
          rows.push([]);
        });
        // Combined FT+PT total
        rows.push(['Combined FT + PT', ...dayHeaders, 'TOTAL']);
        SERVICES.forEach(s => {
          const vals = DAYS_OF_WEEK.map(d =>
            aggregated.labour['full-time'][s].days[d] + aggregated.allowance['full-time'][s].days[d] +
            aggregated.labour['part-time'][s].days[d] + aggregated.allowance['part-time'][s].days[d]
          );
          const total = aggregated.labour['full-time'][s].total + aggregated.allowance['full-time'][s].total +
            aggregated.labour['part-time'][s].total + aggregated.allowance['part-time'][s].total;
          rows.push([SERVICE_LABELS[s], ...vals, total]);
        });
        const combTotals = DAYS_OF_WEEK.map(d => SERVICES.reduce((sum, s) =>
          sum + aggregated.labour['full-time'][s].days[d] + aggregated.allowance['full-time'][s].days[d] +
          aggregated.labour['part-time'][s].days[d] + aggregated.allowance['part-time'][s].days[d], 0));
        const combGrand = SERVICES.reduce((sum, s) =>
          sum + aggregated.labour['full-time'][s].total + aggregated.allowance['full-time'][s].total +
          aggregated.labour['part-time'][s].total + aggregated.allowance['part-time'][s].total, 0);
        rows.push(['TOTAL', ...combTotals, combGrand]);

        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [{ wch: 28 }, ...Array(8).fill({ wch: 16 })];
        if (ws['A1']) ws['A1'].s = { font: { bold: true, sz: 13 } };
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
        for (let C = 1; C <= range.e.c; C++) {
          for (let R = 2; R <= range.e.r; R++) {
            const addr = XLSX.utils.encode_cell({ r: R, c: C });
            if (ws[addr] && typeof ws[addr].v === 'number') ws[addr].z = '$#,##0.00';
          }
        }
        XLSX.utils.book_append_sheet(wb, ws, 'FT+PT Labour Year');
      }

      /* Tab 7: Division Breakdown */
      {
        const totalLabourCost = grandTotals.annualTotal;
        const totalNonLabour = contractTotalAnnual - totalLabourCost;
        const divBuckets = new Map<string, { cost: number; hours: number }>();
        operatorAnnualCosts.forEach(op => {
          const key = op.division || 'Unassigned';
          const ex = divBuckets.get(key);
          if (ex) { ex.cost += op.annualLabourCost; ex.hours += op.annualHours; }
          else divBuckets.set(key, { cost: op.annualLabourCost, hours: op.annualHours });
        });
        const divHeaders = ['Division', 'hs', 'Annual Labour Cost', 'Share %', 'Statutory', 'Sundry', 'Admin & Profit', 'Avg $/h', 'Annual Total'];
        const divRows: any[][] = [
          ['Division Breakdown – excl. PH'],
          [],
          divHeaders,
        ];
        let divTotalHours = 0, divTotalLabour = 0, divTotalAll = 0;
        const divKeys = [...divBuckets.keys()].sort((a, b) => {
          if (a === 'Unassigned') return 1;
          if (b === 'Unassigned') return -1;
          return divisions.indexOf(a) - divisions.indexOf(b);
        });
        divKeys.forEach(key => {
          const b = divBuckets.get(key)!;
          const share = totalLabourCost > 0 ? b.cost / totalLabourCost : 0;
          const stat = statutoryTotal * share;
          const sun = sundryDisplayTotal * share;
          const adm = adminTotalValue * share;
          const total = b.cost + stat + sun + adm;
          const avg = b.hours > 0 ? total / b.hours : 0;
          divRows.push([key, b.hours, b.cost, share, stat, sun, adm, avg, total]);
          divTotalHours += b.hours; divTotalLabour += b.cost; divTotalAll += total;
        });
        divRows.push(['TOTAL', divTotalHours, divTotalLabour, 1, statutoryTotal, sundryDisplayTotal, adminTotalValue, divTotalHours > 0 ? divTotalAll / divTotalHours : 0, divTotalAll]);
        const ws = XLSX.utils.aoa_to_sheet(divRows);
        applySheetFormatting(ws, divHeaders, { currencyCols: [2, 4, 5, 6, 7, 8], hoursCols: [1] });
        ws['!cols'] = [{ wch: 22 }, ...Array(8).fill({ wch: 16 })];
        if (ws['A1']) ws['A1'].s = { font: { bold: true, sz: 13 } };
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
        for (let R = 3; R <= range.e.r; R++) {
          const addr = XLSX.utils.encode_cell({ r: R, c: 3 });
          if (ws[addr] && typeof ws[addr].v === 'number') ws[addr].z = '0.00%';
        }
        boldLastRow(ws);
        XLSX.utils.book_append_sheet(wb, ws, 'Division Breakdown');
      }

      /* Tab 8: Tenant Special Services (LA) */
      if (tenantSpecialGroups.length > 0) {
        const tssHeaders = ['Tenant Name', 'Location', 'Weekly Hours', 'Annual Hours'];
        const tssRows: any[][] = [
          ['Tenant Special Services'],
          [],
          tssHeaders,
        ];
        let tssWk = 0;
        let tssAnn = 0;
        for (const g of tenantSpecialGroups) {
          const wk = g.included ? getTenantSpecialHours(g.id) : 0;
          const ann = wk * 52.14;
          tssRows.push([
            g.tenantName || '(unnamed tenant)',
            g.location || '',
            wk,
            ann,
          ]);
          tssWk += wk;
          tssAnn += ann;
        }
        tssRows.push(['TOTAL', '', tssWk, tssAnn]);
        const ws = XLSX.utils.aoa_to_sheet(tssRows);
        applySheetFormatting(ws, tssHeaders, { hoursCols: [2, 3] });
        ws['!cols'] = [{ wch: 30 }, { wch: 24 }, { wch: 16 }, { wch: 16 }];
        if (ws['A1']) ws['A1'].s = { font: { bold: true, sz: 13 } };
        boldLastRow(ws);
        XLSX.utils.book_append_sheet(wb, ws, 'Tenant Special Services');
      }

      downloadWorkbook(wb, getExportFileName('DetailedSummary', jobName));
    } finally {
      setExporting(false);
    }
  }, [exporting, aggregated, ftPtCombined, grandTotals, statutoryTotal, sundryDisplayTotal, sundryTotalValue, adminTotalValue, contractTotalAnnual, operatorAnnualCosts, jobDetails, divisions, tenantSpecialGroups, getTenantSpecialHours]);

  if (!isLoaded || !wageLoaded || pricingLoading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;
  }

  const empTypes: EmploymentType[] = ['full-time', 'part-time', 'casual'];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Detailed Summary</h1>
          <p className="text-muted-foreground text-sm">Annualised hours, labour cost, allowances, and totals</p>
        </div>
        <button
          onClick={handleExportExcel}
          disabled={exporting}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-background hover:bg-muted/50 transition-colors disabled:opacity-50"
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          {exporting ? 'Exporting…' : 'Export Excel'}
        </button>
      </div>
      <FixedPriceBanner />

      {/* ─── Section A: Total HOURS / YEAR ─── */}
      <section className="space-y-1">
        <h2 className="text-sm font-bold tracking-wide border-b border-border pb-1">Total HOURS / YEAR</h2>
        <div className="border border-border rounded-md overflow-hidden divide-y divide-border">
          {empTypes.map(et => (
            <DayTable
              key={et}
              empLabel={EMPLOYMENT_LABELS[et]}
              serviceData={aggregated.hours[et]}
              type="hours"
              serviceColors={serviceColors}
            />
          ))}
          <DayTable
            empLabel="All Employment Types (FT + PT + Casual)"
            serviceData={aggregated.allHours}
            type="hours"
            serviceColors={serviceColors}
          />
        </div>
      </section>

      {/* ─── Section B: Weekly hours ─── */}
      <section className="space-y-1">
        <h2 className="text-sm font-bold tracking-wide border-b border-border pb-1">Weekly Hours</h2>
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-2 py-1.5 font-semibold w-32">Service</th>
                {DAYS_OF_WEEK.map(d => (
                  <th key={d} className="text-right px-2 py-1.5 font-medium">{DAY_SHORT[d]}</th>
                ))}
                <th className="text-right px-2 py-1.5 font-semibold">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {SERVICES.map((service, idx) => {
                const row = aggregated.weeklyHours[service];
                const hasData = row.total !== 0;
                return (
                  <tr key={service} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/10'}>
                    <td className="px-2 py-1">
                      <span className="inline-block w-2 h-2 rounded-sm mr-1.5" style={{ backgroundColor: serviceColors[service] }} />
                      <span className="font-medium">{SERVICE_LABELS[service]}</span>
                    </td>
                    {DAYS_OF_WEEK.map(d => (
                      <td key={d} className="text-right px-2 py-1 font-mono">{hasData ? fmt(row.days[d], 'hours') : '–'}</td>
                    ))}
                    <td className="text-right px-2 py-1 font-mono font-medium">{hasData ? fmt(row.total, 'hours') : '–'}</td>
                  </tr>
                );
              })}
              {(() => {
                const totals: Record<DayOfWeek, number> = {} as any;
                DAYS_OF_WEEK.forEach(d => {
                  totals[d] = SERVICES.reduce((sum, s) => sum + aggregated.weeklyHours[s].days[d], 0);
                });
                const grand = SERVICES.reduce((sum, s) => sum + aggregated.weeklyHours[s].total, 0);
                return (
                  <tr className="border-t border-border bg-muted/40 font-semibold">
                    <td className="px-2 py-1.5">TOTAL</td>
                    {DAYS_OF_WEEK.map(d => (
                      <td key={d} className="text-right px-2 py-1.5 font-mono">{fmt(totals[d], 'hours')}</td>
                    ))}
                    <td className="text-right px-2 py-1.5 font-mono">{fmt(grand, 'hours')}</td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
      </section>

      {/* ─── Section C: Total LABOUR Cost $ / YEAR ─── */}
      <section className="space-y-1">
        <h2 className="text-sm font-bold tracking-wide border-b border-border pb-1">Total LABOUR Cost $ / YEAR</h2>
        <div className="border border-border rounded-md overflow-hidden divide-y divide-border">
          {empTypes.map(et => (
            <DayTable
              key={et}
              empLabel={EMPLOYMENT_LABELS[et]}
              serviceData={aggregated.labour[et]}
              type="currency"
              serviceColors={serviceColors}
            />
          ))}
        </div>
      </section>

      {/* ─── Section D: Total Allowance Cost $ / YEAR ─── */}
      <section className="space-y-1">
        <h2 className="text-sm font-bold tracking-wide border-b border-border pb-1">Total Allowance Cost $ / YEAR</h2>
        <div className="border border-border rounded-md overflow-hidden divide-y divide-border">
          {empTypes.map(et => (
            <DayTable
              key={et}
              empLabel={EMPLOYMENT_LABELS[et]}
              serviceData={aggregated.allowance[et]}
              type="currency"
              serviceColors={serviceColors}
            />
          ))}
        </div>
      </section>

      {/* ─── Section E: Total / YEAR ─── */}
      <section className="space-y-1">
        <h2 className="text-sm font-bold tracking-wide border-b border-border pb-1">Total / YEAR</h2>
        <div className="border border-border rounded-md overflow-hidden divide-y divide-border">
          {empTypes.map(et => (
            <RollupTable
              key={et}
              empLabel={EMPLOYMENT_LABELS[et]}
              data={aggregated.rollup[et]}
              serviceColors={serviceColors}
            />
          ))}
        </div>
      </section>

      {/* ─── Section F: FT+PT combined ─── */}
      <section className="space-y-1">
        <h2 className="text-sm font-bold tracking-wide border-b border-border pb-1">
          Total LABOUR Cost $ / YEAR including allowances – Full Time and Part Time staff only
        </h2>
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-2 py-1.5 font-medium w-16"></th>
                {DAYS_OF_WEEK.map(d => (
                  <th key={d} className="text-right px-2 py-1.5 font-medium">{DAY_SHORT[d]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="bg-background">
                <td className="px-2 py-1 font-semibold">Year</td>
                {DAYS_OF_WEEK.map(d => (
                  <td key={d} className="text-right px-2 py-1 font-mono">{fmt(ftPtCombined.perDay[d], 'currency')}</td>
                ))}
              </tr>
              <tr className="bg-muted/10">
                <td className="px-2 py-1 font-semibold">Day</td>
                {DAYS_OF_WEEK.map(d => (
                  <td key={d} className="text-right px-2 py-1 font-mono">
                    {fmt(ftPtCombined.perDay[d] > 0 ? ftPtCombined.perDay[d] / 52.14 : 0, 'currency')}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ─── Section G: Public Holidays ─── */}
      <section className="space-y-1">
        <h2 className="text-sm font-bold tracking-wide border-b border-border pb-1">Public Holidays (PH)</h2>
        <p className="text-xs text-muted-foreground">
          PH estimate based on day-of-week labour cost incl. allowances (FT + PT only). Casuals excluded.
        </p>
        {jobDetails.publicHolidayIncluded !== true ? (
          <p className="text-xs text-muted-foreground italic">
            Public holidays excluded (Job Details).
          </p>
        ) : (
          <>
            <div className="border border-border rounded-md overflow-hidden">
              <div className="px-3 py-1.5 bg-muted/20 border-b border-border">
                <span className="text-xs font-semibold">Public Holiday Cost Summary (selected services)</span>
              </div>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-2 py-1.5 font-semibold w-24">Day of week</th>
                    <th className="text-right px-2 py-1.5 font-medium">Base day cost ($/day)</th>
                    <th className="text-right px-2 py-1.5 font-medium">PH multiplier</th>
                    <th className="text-right px-2 py-1.5 font-semibold">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {phDayCosts.map((row, idx) => (
                    <tr key={row.day} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/10'}>
                      <td className="px-2 py-1 font-medium capitalize">{DAY_SHORT[row.day as DayOfWeek]}</td>
                      <td className="text-right px-2 py-1 font-mono">{row.baseCost > 0 ? fmt(row.baseCost, 'currency') : '–'}</td>
                      <td className="text-right px-2 py-1 font-mono">{row.multiplier.toFixed(2)}×</td>
                      <td className="text-right px-2 py-1 font-mono font-medium">{phDowCostMap[row.day as DayOfWeek] > 0 ? fmt(phDowCostMap[row.day as DayOfWeek], 'currency') : '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(jobDetails.phIncludedServices ?? []).length === 0 && (
                <p className="px-3 py-2 text-xs text-muted-foreground italic">
                  No services selected for PH coverage in Job Details.
                </p>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground italic">
              Multiplier represents total PH rate factor. Cost = Base day cost × multiplier (labour basis — FT + PT only, excl. casuals).
            </p>
          </>
        )}
      </section>
    </div>
  );
}
