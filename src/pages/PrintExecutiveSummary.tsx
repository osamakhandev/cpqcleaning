import { useMemo, useState, useEffect, useRef } from 'react';
import { usePricingData } from '@/hooks/usePricingData';
import { useRosterStore } from '@/contexts/RosterContext';
import { calculateOperatorWeek } from '@/lib/rosterCalculations';
import { calculateShiftCost, formatCurrency } from '@/lib/costingCalculations';
import { calculateSecurityAllowances, calculateCleaningAllowances } from '@/lib/securityAllowances';
import { useWageSettings } from '@/lib/wageSettings';
import { useServiceColors } from '@/lib/serviceColors';
import { DAYS_OF_WEEK, SERVICE_LABELS } from '@/types/roster';
import type { ServiceType, EmploymentType, DayOfWeek } from '@/types/roster';
import cpqLogo from '@/assets/cpq-logo.png';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ContractDonutChart } from '@/components/ContractDonutChart';
import { AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { useConsumables } from '@/hooks/useConsumables';
import { CHRISTMAS_EXTENDED_TRADE_STORAGE_KEY } from '@/lib/christmasExtendedTradeStorage';

const normalizeService = (value: unknown): ServiceType => {
  if (value === 'cleaning' || value === 'customer-service' || value === 'security' ||
  value === 'maintenance' || value === 'landscape' || value === 'management') return value;
  return 'cleaning';
};

const fmtCur = (v: number) => formatCurrency(v) ?? '–';
const fmtNum = (v: number) => v.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const cellCls = "text-right px-2.5 py-1.5 font-mono text-xs align-middle";
const labelCls = "px-2.5 py-1.5 text-xs align-middle";
const headCls = "px-3 py-2 text-xs font-semibold text-center align-middle";

const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  'full-time': 'FT',
  'part-time': 'PT',
  'casual': 'Casual'
};

const SERVICES: ServiceType[] = ['cleaning', 'customer-service', 'security', 'maintenance', 'management', 'landscape'];

const BAR_COLORS: Record<ServiceType, string> = {
  cleaning: 'hsl(200, 70%, 50%)',
  'customer-service': 'hsl(40, 80%, 55%)',
  security: 'hsl(350, 60%, 55%)',
  maintenance: 'hsl(140, 50%, 45%)',
  management: 'hsl(280, 50%, 55%)',
  landscape: 'hsl(100, 50%, 45%)'
};

const OSC_KEYS = [
  { key: 'publicHolidays', label: 'Public Holidays' },
  { key: 'bathroomConsumables', label: 'Bathroom Consumables' },
  { key: 'sanitaryServices', label: 'Sanitary Services' },
  { key: 'periodicalServices', label: 'Periodical Services' },
  { key: 'rental', label: 'Rental' },
  { key: 'peakTrading', label: 'Peak Trading' },
  { key: 'christmasExtended', label: 'Christmas Extended Trade' },
] as const;

function loadStoredNumber(key: string): number | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    const value = typeof parsed === 'number' ? parsed : Number(parsed);
    return Number.isFinite(value) ? value : null;
  } catch {}
  return null;
}

function loadPhTotal(fallbackTotal = 0): number {
  const storedTotal = loadStoredNumber('cpq_ph_total');
  if (storedTotal !== null) return storedTotal;
  return fallbackTotal;
}

function loadPhProfit(total: number, profitPct: number): number {
  const storedProfit = loadStoredNumber('cpq_ph_profit');
  if (storedProfit !== null) return storedProfit;
  return total > 0 && profitPct > 0 ? total * (profitPct / 100) : 0;
}

function buildPublicHolidayData(fallbackTotal: number, profitPct: number) {
  const total = loadPhTotal(fallbackTotal);
  return { total, baseCost: 0, profitValue: loadPhProfit(total, profitPct) };
}

function computeSanitaryTotal(): { total: number; baseCost: number } {
  try {
    const raw = localStorage.getItem('cpq_sanitary_rows');
    if (!raw) return { total: 0, baseCost: 0 };
    const rows = JSON.parse(raw);
    const mkRaw = localStorage.getItem('cpq_sanitary_markup');
    const markupPct = mkRaw ? JSON.parse(mkRaw) : 15;
    const rate = markupPct / 100;
    let baseCost = 0;
    for (const r of rows) {
      if (r.costPerUnit != null && r.frequency != null && r.quantity != null && r.costPerUnit > 0) {
        baseCost += r.costPerUnit * r.frequency * r.quantity;
      }
    }
    return { total: baseCost + baseCost * rate, baseCost };
  } catch { return { total: 0, baseCost: 0 }; }
}

function computePeriodicalData(): { total: number; baseCost: number } {
  try {
    const raw = localStorage.getItem('cpq_periodical_rows');
    if (!raw) return { total: 0, baseCost: 0 };
    const rows = JSON.parse(raw);
    let baseCost = 0;
    let total = 0;
    for (const r of rows) {
      const cost = r.costPerService ?? r.cost ?? 0;
      const freq = r.noOfServices ?? r.frequency ?? 0;
      const markup = r.profitPct ?? r.markupPct ?? 0;
      if (cost > 0 && freq > 0) {
        const lineCost = cost * freq;
        baseCost += lineCost;
        total += lineCost + lineCost * (markup / 100);
      }
    }
    return { total, baseCost };
  } catch { return { total: 0, baseCost: 0 }; }
}

function computePeakTradingTotal(): number {
  try {
    const raw = localStorage.getItem('cpq_peak_trading_rows');
    if (!raw) return 0;
    const rows = JSON.parse(raw);
    return rows.reduce((sum: number, r: any) => {
      if (r.coverageNeeded === 'Y' && r.hourlyRate != null && r.noOfEmployees != null && r.hoursPerEmployee != null)
        return sum + r.hourlyRate * r.noOfEmployees * r.hoursPerEmployee;
      return sum;
    }, 0);
  } catch { return 0; }
}

function computeChristmasTotal(): number {
  try {
    const raw = localStorage.getItem(CHRISTMAS_EXTENDED_TRADE_STORAGE_KEY);
    if (!raw) return 0;
    const rows = JSON.parse(raw);
    return rows.reduce((sum: number, r: any) => {
      const rate = r.casualRate ?? r.hourlyRate ?? 0;
      const emps = r.noOfEmployees ?? 0;
      const hrs = r.hoursPerEmployee ?? 0;
      const apRate = r.adminProfitRate ?? 0;

      if (rate > 0 && emps > 0 && hrs > 0) {
        const base = rate * emps * hrs;
        return sum + base + base * (apRate / 100);
      }

      return sum;
    }, 0);
  } catch { return 0; }
}

function loadRentalValue(): number {
  try {
    const raw = localStorage.getItem('cpq_rental_value');
    if (raw) return parseFloat(raw) || 0;
  } catch {}
  return 0;
}

function loadOscInclusion(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem('cpq_osc_summary_included');
    if (raw) return JSON.parse(raw);
  } catch {}
  const d: Record<string, boolean> = {};
  OSC_KEYS.forEach(r => { d[r.key] = true; });
  return d;
}

function fmtD(d: Date): string {
  return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
}

const PRINT_DEBUG_KEY = 'cpq-print-debug-status';

export default function PrintExecutiveSummary() {
  const {
    isLoading, jobDetails, grandTotals, contractTotalAnnual, totalPerWeek,
    statutoryTotal, sundryTotalValue, sundryDisplayTotal,
    adminCalc, adminTotalValue, adminTotalPct,
    phPricedCosts, leapYearCharge, servicesWithOperators, fmt,
    year1Factor, isFixedPrice, forecastJulyFactor,
  } = usePricingData();

  const { operators, rosters, getRoster, isLoaded, activeScenarioId, scenarios } = useRosterStore();
  const { getConfigForOperator, isLoaded: wageLoaded } = useWageSettings();
  const { colors: serviceColors } = useServiceColors();
  const { totals: consumablesTotals } = useConsumables();

  // Read approval data from localStorage (saved by main page)
  const [approvalRows] = useState(() => {
    try {
      const raw = localStorage.getItem('cpq_approval_rows');
      if (raw) return JSON.parse(raw);
    } catch {}
    return [
      { label: 'Prepared by', roleTitle: 'estimator', name: '', date: undefined, signature: '' },
      { label: 'Reviewed by', roleTitle: 'GM', name: '', date: undefined, signature: '' },
      { label: 'Approved by', roleTitle: 'CEO', name: '', date: undefined, signature: '' },
    ];
  });
  const [emailApproval] = useState(() => {
    try {
      return localStorage.getItem('cpq_email_approval') === 'true';
    } catch { return false; }
  });
  const [assumptions] = useState(() => {
    try {
      const raw = localStorage.getItem('cpq_assumptions');
      if (raw) return raw;
    } catch {}
    return `• Typical week annualised at 52.14 weeks
• Public holidays: ${jobDetails.publicHolidayIncluded ? 'included' : 'excluded'} per Job Details
• ${jobDetails.contractPriceCondition} pricing per Job Details
• Scope as per agreed specifications`;
  });

  const combinedAnnualFactor = year1Factor * forecastJulyFactor;

  const computed = useMemo(() => {
    const calcs = new Map<string, ReturnType<typeof calculateOperatorWeek>>();
    const costs = new Map<string, ReturnType<typeof calculateShiftCost>[]>();
    const allowances = new Map<string, { totalWeekly: number } | null>();
    operators.forEach((op) => {
      const roster = getRoster(op.id);
      if (!roster) return;
      const calc = calculateOperatorWeek(roster, op.employmentType, DAYS_OF_WEEK, op.service, op.weeksPerYear);
      calcs.set(op.id, calc);
      const ns = normalizeService(op.service);
      const wageInfo = getConfigForOperator(ns, op.level);
      const dayCosts = calc.days.map((d) => {
        const base = calculateShiftCost(d.day, d.startTime || '', d.endTime || '', d.paidHours, ns, op.employmentType, op.level, op.isFixedNights ?? false, wageInfo?.rates ?? null);
        if (combinedAnnualFactor !== 1 && base.cost !== null) {
          return { ...base, cost: base.cost * combinedAnnualFactor, segments: base.segments.map(seg => ({ ...seg, cost: seg.cost !== null ? seg.cost * combinedAnnualFactor : null })) };
        }
        return base;
      });
      costs.set(op.id, dayCosts);
      const workedDays = calc.days.filter((d) => d.coverageMin > 0).map((d) => d.day);
      let allowResult: { totalWeekly: number; items?: any[] } | null = null;
      if (ns === 'security' && op.securityAllowances) {
        allowResult = calculateSecurityAllowances(op.securityAllowances, calc.weeklyPaidHours, workedDays.length);
      } else if (ns === 'cleaning' && op.cleaningAllowances) {
        allowResult = calculateCleaningAllowances(op.cleaningAllowances, calc.weeklyPaidHours, workedDays, op.level);
      }
      if (allowResult && combinedAnnualFactor !== 1) {
        allowResult = { ...allowResult, totalWeekly: allowResult.totalWeekly * combinedAnnualFactor };
      }
      allowances.set(op.id, allowResult);
    });
    return { calcs, costs, allowances };
  }, [operators, rosters, getRoster, getConfigForOperator, combinedAnnualFactor]);

  const workforceSummary = useMemo(() => {
    const map = new Map<ServiceType, { ft: number; pt: number; casual: number; weeklyHrs: number; annualCost: number }>();
    operators.forEach((op) => {
      const svc = normalizeService(op.service);
      if (!map.has(svc)) map.set(svc, { ft: 0, pt: 0, casual: 0, weeklyHrs: 0, annualCost: 0 });
      const row = map.get(svc)!;
      if (op.employmentType === 'full-time') row.ft++; else if (op.employmentType === 'part-time') row.pt++; else row.casual++;
      const calc = computed.calcs.get(op.id);
      const dayCosts = computed.costs.get(op.id);
      const allowInfo = computed.allowances.get(op.id);
      if (!calc || !dayCosts) return;
      row.weeklyHrs += calc.weeklyPaidHours;
      const weeklyLabour = dayCosts.reduce((s, dc) => s + (dc.cost ?? 0), 0);
      const weeklyAllow = allowInfo?.totalWeekly ?? 0;
      const annualFactor = op.employmentType === 'casual' && typeof op.weeksPerYear === 'number' ? op.weeksPerYear : 52.14;
      row.annualCost += (weeklyLabour + weeklyAllow) * annualFactor;
    });
    return SERVICES.filter((s) => map.has(s)).map((s) => ({ service: s, ...map.get(s)! }));
  }, [operators, computed]);

  const weeklyHoursByService = useMemo(() => {
    const data: { day: string; [key: string]: number | string }[] = [];
    const dayLabels: Record<DayOfWeek, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
    DAYS_OF_WEEK.forEach((dow) => {
      const entry: any = { day: dayLabels[dow] };
      operators.forEach((op) => {
        const svc = normalizeService(op.service);
        const calc = computed.calcs.get(op.id);
        if (!calc) return;
        const dayIdx = DAYS_OF_WEEK.indexOf(dow);
        const paidHrs = calc.days[dayIdx]?.paidHours ?? 0;
        entry[svc] = (entry[svc] ?? 0) + paidHrs;
      });
      data.push(entry);
    });
    return data;
  }, [operators, computed]);

  const totalWeeklyHours = useMemo(() => Array.from(computed.calcs.values()).reduce((s, c) => s + c.weeklyPaidHours, 0), [computed]);
  const totalWarnings = useMemo(() => Array.from(computed.calcs.values()).reduce((s, c) => s + c.warnings.length, 0), [computed]);
  const scenarioName = useMemo(() => {
    if (!activeScenarioId) return 'Default';
    const s = scenarios.find((sc) => sc.id === activeScenarioId);
    return s?.name ?? 'Default';
  }, [activeScenarioId, scenarios]);

  const totalStatutory = statutoryTotal;

  const donutData = useMemo(() => {
    const profitTotal = adminCalc.reduce((s, item) => s + item.value, 0);
    return [
      { name: 'Labour', value: grandTotals.annualTotal },
      { name: 'Statutory On-costs', value: totalStatutory },
      { name: 'Sundry Expenses', value: sundryDisplayTotal },
      { name: 'Profit', value: profitTotal },
    ].filter((d) => d.value > 0);
  }, [grandTotals, totalStatutory, sundryDisplayTotal, adminCalc]);

  const workforceDonutData = useMemo(() => workforceSummary.map(w => ({ name: SERVICE_LABELS[w.service], value: w.annualCost })), [workforceSummary]);

  // OSC computation
  const oscInclusion = loadOscInclusion();
  const sanitary = computeSanitaryTotal();
  const periodical = computePeriodicalData();
  const oscData = {
    publicHolidays: buildPublicHolidayData(phPricedCosts.phTotalPriced, adminTotalPct),
    periodicalServices: { total: periodical.total, baseCost: periodical.baseCost },
    sanitaryServices: { total: sanitary.total, baseCost: sanitary.baseCost },
    rental: { total: loadRentalValue(), baseCost: loadRentalValue() },
    peakTrading: { total: computePeakTradingTotal(), baseCost: computePeakTradingTotal() },
    christmasExtended: { total: computeChristmasTotal(), baseCost: computeChristmasTotal() },
  };

  const oscItems = OSC_KEYS.map(k => {
    let total = 0, profit = 0;
    if (k.key === 'publicHolidays') {
      total = oscData.publicHolidays.total;
      profit = oscData.publicHolidays.profitValue;
    } else if (k.key === 'bathroomConsumables') {
      total = consumablesTotals.totalPricePA;
      profit = consumablesTotals.totalPricePA - consumablesTotals.totalCostPA;
    } else {
      const data = oscData[k.key as keyof typeof oscData];
      if (data) { total = data.total; profit = data.total - data.baseCost; }
    }
    return { ...k, total, profit };
  });

  const includedOsc = oscItems.filter(k => oscInclusion[k.key] && k.total > 0);
  const oscSubtotal = includedOsc.reduce((s, i) => s + i.total, 0);
  const oscProfitTotal = includedOsc.reduce((s, i) => s + i.profit, 0);
  const totalContractPriceWithOsc = contractTotalAnnual + oscSubtotal;
  const directServiceProfit = adminTotalValue;
  const totalProfit = directServiceProfit + oscProfitTotal;
  const profitPct = totalContractPriceWithOsc > 0 ? (totalProfit / totalContractPriceWithOsc) * 100 : 0;

  const fixedPriceRows = useMemo(() => {
    if (jobDetails.contractPriceCondition !== 'Fixed Price' || jobDetails.fixedYears <= 0 || !jobDetails.contractCommencementMonth) return null;
    const start = new Date(jobDetails.contractCommencementMonth);
    if (isNaN(start.getTime())) return null;
    const july = new Date(start.getMonth() < 6 ? start.getFullYear() : start.getFullYear() + 1, 6, 1);
    const n = Math.min(jobDetails.fixedYears, 10);
    const rows: { year: number; start: string; end: string; rise: string; price: number }[] = [];
    for (let i = 0; i < n; i++) {
      const yStart = new Date(start.getFullYear() + i, start.getMonth(), start.getDate());
      const yEnd = new Date(start.getFullYear() + i + 1, start.getMonth(), start.getDate());
      yEnd.setDate(yEnd.getDate() - 1);
      const r = (jobDetails.fixedPriceSchedule[i]?.increaseForecast ?? 0) / 100;
      if (i === 0) {
        const dPre = Math.round((july.getTime() - start.getTime()) / 86400000);
        const dPost = Math.round((new Date(start.getFullYear() + 1, start.getMonth(), start.getDate()).getTime() - july.getTime()) / 86400000);
        const total = dPre + dPost;
        const price = total > 0 ? contractTotalAnnual * (dPre / total) + contractTotalAnnual * (1 + r) * (dPost / total) : contractTotalAnnual;
        const impact = total > 0 ? r * (dPost / total) * 100 : r * 100;
        rows.push({ year: 1, start: fmtD(yStart), end: fmtD(yEnd), rise: impact.toFixed(2) + '%', price });
      } else {
        const prev = rows[i - 1].price;
        rows.push({ year: i + 1, start: fmtD(yStart), end: fmtD(yEnd), rise: (r * 100).toFixed(2) + '%', price: prev * (1 + r) });
      }
    }
    return rows;
  }, [jobDetails, contractTotalAnnual]);

  const wfTotals = workforceSummary.reduce((acc, r) => ({
    ft: acc.ft + r.ft, pt: acc.pt + r.pt, casual: acc.casual + r.casual,
    weeklyHrs: acc.weeklyHrs + r.weeklyHrs, annualCost: acc.annualCost + r.annualCost
  }), { ft: 0, pt: 0, casual: 0, weeklyHrs: 0, annualCost: 0 });

  const labourPriceBreakdownTotal = grandTotals.annualTotal;
  const showWorkforceMismatchWarning = Math.abs(wfTotals.annualCost - labourPriceBreakdownTotal) > 1;
  const servicesForBar = SERVICES.filter((s) => workforceSummary.some((w) => w.service === s));
  const assumptionLines = assumptions.split('\n').filter((l: string) => l.trim().length > 0);

  const printDate = new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
  const printTime = new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
  const printRootRef = useRef<HTMLDivElement | null>(null);
  const [hasPrinted, setHasPrinted] = useState(false);
  const [debugMessage, setDebugMessage] = useState('Loading Executive Summary...');

  const hasRenderableData = useMemo(() => (
    Boolean(jobDetails.jobBuildingName) ||
    operators.length > 0 ||
    workforceSummary.length > 0 ||
    donutData.length > 0 ||
    servicesForBar.length > 0 ||
    Boolean(fixedPriceRows?.length) ||
    totalContractPriceWithOsc > 0
  ), [jobDetails.jobBuildingName, operators.length, workforceSummary.length, donutData.length, servicesForBar.length, fixedPriceRows, totalContractPriceWithOsc]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(PRINT_DEBUG_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { status?: string };
      if (parsed.status && ['payload-missing', 'payload-error', 'project-missing', 'project-error', 'no-print-data'].includes(parsed.status)) {
        setDebugMessage('No print data found');
      }
    } catch {
      // Ignore debug-state parsing failures.
    }
  }, []);

  useEffect(() => {
    if (!isLoaded || !wageLoaded || isLoading) {
      setDebugMessage('Loading Executive Summary...');
      return;
    }

    setDebugMessage(hasRenderableData ? 'Job data loaded' : 'No print data found');
  }, [isLoaded, wageLoaded, isLoading, hasRenderableData]);

  useEffect(() => {
    if (!isLoaded || !wageLoaded || isLoading || hasPrinted || !hasRenderableData || !printRootRef.current) return;

    const timer = window.setTimeout(() => {
      const textContent = printRootRef.current?.innerText?.trim() ?? '';
      if (!textContent) return;
      setHasPrinted(true);
      window.print();
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [isLoaded, wageLoaded, isLoading, hasPrinted, hasRenderableData]);

  if (!isLoaded || !wageLoaded || isLoading) {
    return <div className="flex items-center justify-center h-screen text-muted-foreground">{debugMessage}</div>;
  }

  if (!hasRenderableData) {
    return <div className="flex items-center justify-center h-screen text-muted-foreground">{debugMessage}</div>;
  }

  const rCls = "py-3 px-4 text-xs align-middle";
  const vCls = "py-3 px-5 text-xs text-right font-mono tabular-nums align-middle";

  return (
    <div ref={printRootRef} className="print-report bg-white text-foreground" style={{ maxWidth: '210mm', margin: '0 auto', padding: '15mm' }}>
      <div className="no-print mb-3 text-xs text-muted-foreground">{debugMessage}</div>
      <div className="no-print flex justify-end mb-4 gap-2">
        <button onClick={() => window.print()} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90">
          Print
        </button>
        <button onClick={() => window.close()} className="px-4 py-2 text-sm bg-muted text-muted-foreground rounded-md hover:opacity-90">
          Close
        </button>
      </div>

      {/* ═══ HEADER ═══ */}
      <div className="print-section flex items-center justify-between border-b border-border pb-3 mb-4">
        <div className="flex items-center gap-3">
          <img src={cpqLogo} alt="CPQ Logo" style={{ height: '46px', width: 'auto' }} />
          <div>
            <h1 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>Executive Summary</h1>
            <div style={{ fontSize: '9px', color: '#888' }}>Generated: {printDate} {printTime}</div>
          </div>
        </div>
        <div className="text-right space-y-0.5">
          <div className="text-base font-bold">{jobDetails.jobBuildingName || '—'}</div>
          <div className="text-[10px] text-muted-foreground space-x-3">
            {jobDetails.jobState && <span>{jobDetails.jobState}</span>}
            {jobDetails.contractCommencementMonth && (
              <span>Start: {new Date(jobDetails.contractCommencementMonth).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
            )}
            {jobDetails.tenderDueDate && (
              <span>Tender: {new Date(jobDetails.tenderDueDate).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
            )}
            <span>Scenario: {scenarioName}</span>
          </div>
        </div>
      </div>

      {/* ═══ KPI CARDS ═══ */}
      <div className={`print-section grid gap-3 mb-4 ${totalWarnings > 0 ? 'grid-cols-5' : 'grid-cols-4'}`}>
        <KpiCard label="Total Contract Price (Annual)" value={fmtCur(totalContractPriceWithOsc)} highlight />
        <KpiCard label="Total Contract Price (Monthly)" value={fmtCur(totalContractPriceWithOsc / 12)} />
        <KpiCard label="Weekly Paid Hours" value={fmtNum(totalWeeklyHours)} />
        <KpiCard label="Total Operators" value={String(operators.length)} />
        {totalWarnings > 0 && <KpiCard label="Active Warnings" value={String(totalWarnings)} warn />}
      </div>

      {/* ═══ DONUT CHARTS ═══ */}
      {donutData.length > 0 && (
        <section className="print-section chart-card border border-border rounded-md p-2 mb-4">
          <ContractDonutChart
            data={donutData}
            totalContractPrice={contractTotalAnnual}
            workforceData={workforceDonutData}
            totalLabourCost={wfTotals.annualCost}
          />
        </section>
      )}

      {/* PAGE BREAK */}
      <div style={{ breakBefore: 'page' }} />

      {/* ═══ WORKFORCE SUMMARY ═══ */}
      {workforceSummary.length > 0 && (
        <section className="print-section section mb-4">
          <SectionTitle>Workforce Summary</SectionTitle>
          <div className="border border-border rounded-md overflow-hidden">
            <table className="w-full border-collapse text-xs" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '22%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '20%' }} />
              </colgroup>
              <thead>
                <tr className="bg-muted/40 border-b border-border">
                  <th className={`${headCls} text-center`}>Service</th>
                  <th className={`${headCls} text-center`}>FT</th>
                  <th className={`${headCls} text-center`}>PT</th>
                  <th className={`${headCls} text-center`}>Casual</th>
                  <th className={`${headCls} text-center`}>Total</th>
                  <th className={`${headCls} text-center`}>Weekly Hrs</th>
                  <th className={`${headCls} text-center`}>Annual Labour Cost</th>
                </tr>
              </thead>
              <tbody>
                {workforceSummary.map((row, idx) => (
                  <tr key={row.service} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/10'}>
                    <td className={`${labelCls} text-left`}>
                      <span className="inline-block w-2 h-2 rounded-sm mr-1.5 align-middle" style={{ backgroundColor: serviceColors[row.service] }} />
                      {SERVICE_LABELS[row.service]}
                    </td>
                    <td className={`${cellCls} text-center`}>{row.ft || '–'}</td>
                    <td className={`${cellCls} text-center`}>{row.pt || '–'}</td>
                    <td className={`${cellCls} text-center`}>{row.casual || '–'}</td>
                    <td className={`${cellCls} text-center font-medium`}>{row.ft + row.pt + row.casual}</td>
                    <td className={`${cellCls} text-center`}>{fmtNum(row.weeklyHrs)}</td>
                    <td className={`${cellCls} text-right`}>{fmtCur(row.annualCost)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                  <td className={`${labelCls} font-bold text-left`}>TOTAL</td>
                  <td className={`${cellCls} text-center`}>{wfTotals.ft}</td>
                  <td className={`${cellCls} text-center`}>{wfTotals.pt}</td>
                  <td className={`${cellCls} text-center`}>{wfTotals.casual}</td>
                  <td className={`${cellCls} text-center font-bold`}>{wfTotals.ft + wfTotals.pt + wfTotals.casual}</td>
                  <td className={`${cellCls} text-center`}>{fmtNum(wfTotals.weeklyHrs)}</td>
                  <td className={`${cellCls} text-right`}>{fmtCur(labourPriceBreakdownTotal)}</td>
                </tr>
              </tbody>
            </table>
            {showWorkforceMismatchWarning && (
              <div className="flex items-start gap-2 border-t border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>Workforce Summary total does not reconcile with Labour Price Breakdown</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ═══ PRICE BUILD-UP ═══ */}
      <section className="print-section section mb-4">
        <SectionTitle>Price Build-up (Annual)</SectionTitle>
        <div className="border border-border/40 rounded-md overflow-hidden bg-card">
          <div className="px-4 pt-3.5 pb-1">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[hsl(210,70%,50%)]">Direct Service Price</h3>
          </div>
          <table className="w-full" style={{ tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 }}>
            <colgroup><col style={{ width: '55%' }} /><col style={{ width: '45%' }} /></colgroup>
            <tbody>
              <tr className="border-t border-border/15"><td className={rCls}>Annual Labour Cost (Wages + Allowances)</td><td className={vCls}>{fmt(grandTotals.annualTotal)}</td></tr>
              <tr className="border-t border-border/15"><td className={rCls}>Statutory On-costs</td><td className={vCls}>{fmt(totalStatutory)}</td></tr>
              <tr className="border-t border-border/15"><td className={rCls}>Sundry Expenses</td><td className={vCls}>{fmt(sundryDisplayTotal)}</td></tr>
              <tr className="border-t border-border/15"><td className={rCls}>Administration & Profit</td><td className={vCls}>{fmt(adminTotalValue)}</td></tr>
              <tr className="border-t border-border/30 bg-muted/15">
                <td className={`${rCls} font-semibold`}>Total Direct Service</td>
                <td className={`${vCls} font-semibold`}>{fmt(contractTotalAnnual)}</td>
              </tr>
            </tbody>
          </table>

          {includedOsc.length > 0 && (
            <>
              <div className="px-4 pt-4 pb-1">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[hsl(210,70%,50%)]">Other Services & Costs</h3>
              </div>
              <table className="w-full" style={{ tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 }}>
                <colgroup><col style={{ width: '55%' }} /><col style={{ width: '45%' }} /></colgroup>
                <tbody>
                  {includedOsc.map(item => (
                    <tr key={item.key} className="border-t border-border/10">
                      <td className={`${rCls} pl-8 text-muted-foreground`}>{item.label}</td>
                      <td className={vCls}>
                        <span className="mr-2 text-[10px] text-muted-foreground/60 font-normal">( {formatCurrency(item.profit)} )</span>
                        <span>{fmt(item.total)}</span>
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-border/25 bg-muted/15">
                    <td className={`${rCls} pl-8 font-semibold`}>Other Services & Costs</td>
                    <td className={`${vCls} font-semibold`}>{fmt(oscSubtotal)}</td>
                  </tr>
                </tbody>
              </table>
            </>
          )}

          <table className="w-full" style={{ tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 }}>
            <colgroup><col style={{ width: '55%' }} /><col style={{ width: '45%' }} /></colgroup>
            <tbody>
              <tr className="border-t-2 border-foreground/15 bg-[hsl(120,40%,94%)]">
                <td className={`${rCls} font-bold text-sm py-3.5`}>TOTAL CONTRACT PRICE (ANNUAL)</td>
                <td className={`${vCls} font-bold text-sm py-3.5`}>{fmt(totalContractPriceWithOsc)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex gap-6 text-xs">
          <span className="text-muted-foreground">Per Week: <span className="font-mono font-medium text-foreground">{fmt(totalContractPriceWithOsc / 52.14)}</span></span>
          <span className="text-muted-foreground">Per Month: <span className="font-mono font-medium text-foreground">{fmt(totalContractPriceWithOsc / 12)}</span></span>
        </div>
      </section>

      {/* ═══ PROFIT SUMMARY ═══ */}
      <section className="print-section section mb-4">
        <div className="border border-border/40 rounded-md overflow-hidden bg-card">
          <div className="px-4 pt-3.5 pb-1">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[hsl(210,70%,50%)]">Profit Summary</h3>
          </div>
          <table className="w-full" style={{ tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 }}>
            <colgroup><col style={{ width: '55%' }} /><col style={{ width: '45%' }} /></colgroup>
            <tbody>
              <tr className="border-t border-border/15"><td className={rCls}>Administration & Profit</td><td className={vCls}>{fmt(directServiceProfit)}</td></tr>
              {oscProfitTotal > 0 && (
                <tr className="border-t border-border/15"><td className={rCls}>Profit on Other Services & Costs</td><td className={vCls}>{fmt(oscProfitTotal)}</td></tr>
              )}
              <tr className="border-t border-border/30 bg-muted/15">
                <td className={`${rCls} font-semibold`}>Total Profit</td>
                <td className={`${vCls} font-semibold`}>{fmt(totalProfit)}</td>
              </tr>
              <tr className="border-t border-border/15">
                <td className={`${rCls} text-muted-foreground`}>Profit %</td>
                <td className={`${vCls} text-muted-foreground`}>{profitPct.toFixed(2)}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* PAGE BREAK */}
      <div style={{ breakBefore: 'page' }} />

      {/* ═══ KEY ASSUMPTIONS ═══ */}
      <section className="print-section section mb-4">
        <SectionTitle>Key Assumptions</SectionTitle>
        <div className="rounded-md border border-border bg-card px-3 py-2 text-xs whitespace-pre-line">
          {assumptionLines.join('\n')}
        </div>
      </section>

      {/* ═══ FIXED PRICE SCHEDULE ═══ */}
      {fixedPriceRows && fixedPriceRows.length > 0 && (
        <section className="print-section section mb-4">
          <SectionTitle>Fixed Price Schedule</SectionTitle>
          <div className="border border-border rounded-md overflow-hidden">
            <table className="w-full border-collapse text-xs" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '10%' }} /><col style={{ width: '22%' }} /><col style={{ width: '22%' }} />
                <col style={{ width: '14%' }} /><col style={{ width: '32%' }} />
              </colgroup>
              <thead>
                <tr className="bg-muted/40 border-b border-border">
                  <th className={`${headCls} text-center`}>Year</th>
                  <th className={`${headCls} text-center`}>Start Date</th>
                  <th className={`${headCls} text-center`}>End Date</th>
                  <th className={`${headCls} text-center`}>Wage Rise %</th>
                  <th className={`${headCls} text-center`}>Annual Price</th>
                </tr>
              </thead>
              <tbody>
                {fixedPriceRows.map((row, idx) => (
                  <tr key={row.year} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/10'}>
                    <td className={`${cellCls} text-center`}>{row.year}</td>
                    <td className={`${cellCls} text-center font-sans`}>{row.start}</td>
                    <td className={`${cellCls} text-center font-sans`}>{row.end}</td>
                    <td className={cellCls}>{row.rise}</td>
                    <td className={`${cellCls} font-semibold`}>{fmtCur(row.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* PAGE BREAK */}
      <div style={{ breakBefore: 'page' }} />

      {/* ═══ DAILY PAID HOURS CHART ═══ */}
      {servicesForBar.length > 0 && (
        <section className="print-section section border border-border rounded-md p-3 mb-4">
          <h3 className="text-xs font-semibold mb-2 text-center">Daily Paid Hours by Service</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={weeklyHoursByService} barCategoryGap="20%" barGap={2}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {servicesForBar.map((svc) =>
                <Bar key={svc} dataKey={svc} name={SERVICE_LABELS[svc]} fill={BAR_COLORS[svc]} radius={[2, 2, 0, 0]} />
              )}
            </BarChart>
          </ResponsiveContainer>
        </section>
      )}

      {/* ═══ APPROVAL ═══ */}
      <section className="print-section section approval-section" style={{ breakInside: 'avoid' }}>
        <SectionTitle>Approval</SectionTitle>
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full border-collapse text-xs" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '25%' }} /><col style={{ width: '30%' }} />
              <col style={{ width: '20%' }} /><col style={{ width: '25%' }} />
            </colgroup>
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className={`${headCls} text-center`}>Role</th>
                <th className={`${headCls} text-center`}>Name</th>
                <th className={`${headCls} text-center`}>Date</th>
                <th className={`${headCls} text-center`}>Signature</th>
              </tr>
            </thead>
            <tbody>
              {approvalRows.map((row: any, idx: number) => (
                <tr key={idx} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/10'} style={{ height: '32px' }}>
                  <td className={labelCls}>{row.label} – {row.roleTitle}</td>
                  <td className={labelCls}>{row.name || '\u00a0'}</td>
                  <td className={labelCls}>{row.date ? format(new Date(row.date), 'dd MMM yyyy') : '\u00a0'}</td>
                  <td className={labelCls}>{row.signature || '\u00a0'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-[9px] italic text-muted-foreground">
          If a signature is not available, approval may be provided via email confirmation.
        </p>
        {emailApproval && (
          <p className="mt-1 text-[10px] italic text-muted-foreground font-medium">
            ✓ Approval provided via email
          </p>
        )}
      </section>

      {/* Print footer */}
      <div className="print-footer" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '6px 18mm', fontSize: '8px', color: '#888', borderTop: '1px solid #ddd', background: 'white' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Generated by CPQ – {printDate} {printTime}</span>
          <span>Executive Summary</span>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, highlight, warn }: { label: string; value: string; highlight?: boolean; warn?: boolean }) {
  return (
    <div className={`rounded-md border p-3 text-center ${
      highlight ? 'border-[hsl(120,25%,75%)] bg-[hsl(120,40%,94%)]' :
      warn ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-card'
    }`}>
      <div className={`text-lg font-bold font-mono ${warn ? 'text-destructive' : ''}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{label}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded border border-[hsl(120,25%,75%)] bg-[hsl(120,40%,94%)] px-3 py-1.5 mb-2">
      <h2 className="font-semibold text-sm">{children}</h2>
    </div>
  );
}
