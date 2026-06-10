import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { usePricingData } from '@/hooks/usePricingData';
import { FixedPriceBanner } from '@/components/FixedPriceBanner';
import { useRosterStore } from '@/contexts/RosterContext';
import { calculateOperatorWeek } from '@/lib/rosterCalculations';
import { calculateShiftCost, formatCurrency } from '@/lib/costingCalculations';
import { calculateSecurityAllowances, calculateCleaningAllowances } from '@/lib/securityAllowances';
import { useWageSettings } from '@/lib/wageSettings';
import { useServiceColors } from '@/lib/serviceColors';
import { DAYS_OF_WEEK, SERVICE_LABELS } from '@/types/roster';
import HowItWorks from '@/components/HowItWorks';
import { HELP_CONTENT } from '@/data/helpContent';
import type { ServiceType, EmploymentType, DayOfWeek } from '@/types/roster';
import cpqLogo from '@/assets/cpq-logo.png';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ContractDonutChart } from '@/components/ContractDonutChart';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CalendarIcon, Download } from 'lucide-react';
import html2canvas from 'html2canvas';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
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

// Donut chart colours are defined in ContractDonutChart component


const BAR_COLORS: Record<ServiceType, string> = {
  cleaning: 'hsl(200, 70%, 50%)',
  'customer-service': 'hsl(40, 80%, 55%)',
  security: 'hsl(350, 60%, 55%)',
  maintenance: 'hsl(140, 50%, 45%)',
  management: 'hsl(280, 50%, 55%)',
  landscape: 'hsl(100, 50%, 45%)'
};

type ApprovalRowData = {
  label: string;
  roleTitle: string;
  name: string;
  date?: Date;
  signature: string;
};

export default function ExecutiveSummary() {
  const {
    isLoading,
    jobDetails,
    grandTotals,
    contractTotalAnnual,
    totalPerWeek,
    statutoryTotal,
    sundryTotalValue, sundryDisplayTotal,
    adminCalc, adminTotalValue, adminTotalPct,
    phPricedCosts,
    leapYearCharge,
    servicesWithOperators,
    fmt,
    year1Factor, isFixedPrice, forecastJulyFactor,
  } = usePricingData();


  const { operators, rosters, getRoster, isLoaded, activeScenarioId, scenarios } = useRosterStore();
  const { getConfigForOperator, isLoaded: wageLoaded } = useWageSettings();
  const { colors: serviceColors } = useServiceColors();
  const { totals: consumablesTotals } = useConsumables();



  const [assumptions, setAssumptions] = useState(
    `• Typical week annualised at 52.14 weeks
• Public holidays: ${jobDetails.publicHolidayIncluded ? 'included' : 'excluded'} per Job Details
• ${jobDetails.contractPriceCondition} pricing per Job Details
• Scope as per agreed specifications`
  );
  const [emailApproval, setEmailApproval] = useState(false);
  const [approvalRows, setApprovalRows] = useState<ApprovalRowData[]>(() =>
    APPROVAL_ROWS.map((row) => ({
      label: row.label,
      roleTitle: row.defaultTitle,
      name: '',
      date: undefined,
      signature: '',
    }))
  );

  const updateApprovalRow = useCallback((idx: number, field: keyof ApprovalRowData, value: string | Date | undefined) => {
    setApprovalRows((prev) => prev.map((row, rowIdx) => (rowIdx === idx ? { ...row, [field]: value } : row)));
  }, []);

  const contentRef = useRef<HTMLDivElement>(null);

  const handleDownloadImage = useCallback(async () => {
    if (!contentRef.current) return;
    const el = contentRef.current;
    // Temporarily show the print header for the capture
    const printHeader = el.querySelector('.exec-print-header') as HTMLElement | null;
    if (printHeader) {
      printHeader.style.display = 'flex';
    }
    // Hide no-print elements inside the capture area
    const noPrintEls = el.querySelectorAll('.no-print') as NodeListOf<HTMLElement>;
    noPrintEls.forEach(e => e.style.display = 'none');

    try {
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: el.scrollWidth,
      });

      // Restore elements
      if (printHeader) printHeader.style.display = '';
      noPrintEls.forEach(e => e.style.display = '');

      // Download
      const link = document.createElement('a');
      link.download = `Executive-Summary-${jobDetails.jobBuildingName || 'Report'}-${new Date().toISOString().slice(0,10)}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Image export failed:', err);
      if (printHeader) printHeader.style.display = '';
      noPrintEls.forEach(e => e.style.display = '');
    }
  }, [jobDetails.jobBuildingName]);

  // Compute OSC subtotal at page level for KPI cards
  const [oscSubtotalForKpi, setOscSubtotalForKpi] = useState(0);
  useEffect(() => {
    const compute = () => {
      try {
        // Read directly from OSC Summary persisted rows (single source of truth)
        const summaryRaw = localStorage.getItem('cpq_osc_summary_rows');
        if (summaryRaw) {
          const rows = JSON.parse(summaryRaw) as Record<string, { total: number; profit: number }>;
          let total = 0;
          for (const key of Object.keys(rows)) {
            total += rows[key]?.total ?? 0;
          }
          setOscSubtotalForKpi(total);
          return;
        }
        // Fallback: compute manually if summary not yet persisted
        const inclRaw = localStorage.getItem('cpq_osc_summary_included');
        const incl = inclRaw ? JSON.parse(inclRaw) : { publicHolidays: true, bathroomConsumables: true, periodicalServices: true, sanitaryServices: true, rental: true, peakTrading: true, christmasExtended: true };
        let total = 0;
        if (incl.publicHolidays) total += loadPhTotal(phPricedCosts.phTotalPriced);
        if (incl.bathroomConsumables) total += consumablesTotals.totalPricePA;
        if (incl.periodicalServices) {
          const raw = localStorage.getItem('cpq_periodical_rows');
          if (raw) {
            const rows = JSON.parse(raw);
            for (const r of rows) {
              const cost = r.costPerService ?? r.cost ?? 0;
              const freq = r.noOfServices ?? r.frequency ?? 0;
              const markup = r.profitPct ?? r.markupPct ?? 0;
              if (cost > 0 && freq > 0) {
                const c = cost * freq;
                total += c + c * (markup / 100);
              }
            }
          }
        }
        if (incl.sanitaryServices) {
          const raw = localStorage.getItem('cpq_sanitary_rows');
          if (raw) {
            const rows = JSON.parse(raw);
            const mkRaw = localStorage.getItem('cpq_sanitary_markup');
            const rate = (mkRaw ? JSON.parse(mkRaw) : 15) / 100;
            for (const r of rows) {
              if (r.costPerUnit > 0 && r.frequency > 0 && r.quantity > 0) {
                const c = r.costPerUnit * r.frequency * r.quantity;
                total += c + c * rate;
              }
            }
          }
        }
        if (incl.rental) {
          const raw = localStorage.getItem('cpq_rental_value');
          if (raw) total += parseFloat(raw) || 0;
        }
        if (incl.peakTrading) {
          const raw = localStorage.getItem('cpq_peak_trading_rows');
          if (raw) {
            const rows = JSON.parse(raw);
            for (const r of rows) {
              const rate = r.casualRate ?? r.hourlyRate ?? 0;
              const emps = r.noOfEmployees ?? 0;
              const hrs = r.hoursPerEmployee ?? 0;
              const base = rate * emps * hrs;
              const apRate = r.adminProfitRate ?? 0;
              if (rate > 0 && emps > 0 && hrs > 0) total += base + base * (apRate / 100);
            }
          }
        }
        if (incl.christmasExtended) {
          const raw = localStorage.getItem(CHRISTMAS_EXTENDED_TRADE_STORAGE_KEY);
          if (raw) {
            const rows = JSON.parse(raw);
            for (const r of rows) {
              const rate = r.casualRate ?? r.hourlyRate ?? 0;
              const emps = r.noOfEmployees ?? 0;
              const hrs = r.hoursPerEmployee ?? 0;
              const apRate = r.adminProfitRate ?? 0;
              if (rate > 0 && emps > 0 && hrs > 0) {
                const base = rate * emps * hrs;
                total += base + base * (apRate / 100);
              }
            }
          }
        }
        setOscSubtotalForKpi(total);
      } catch { setOscSubtotalForKpi(0); }
    };
    compute();
    window.addEventListener('storage', compute);
    const interval = setInterval(compute, 2000);
    return () => { window.removeEventListener('storage', compute); clearInterval(interval); };
  }, [phPricedCosts.phTotalPriced, consumablesTotals.totalPricePA]);

  const totalContractPriceWithOsc = contractTotalAnnual + oscSubtotalForKpi;

  const combinedAnnualFactor = year1Factor * forecastJulyFactor;

  // Compute per-operator data
  const computed = useMemo(() => {
    const calcs = new Map<string, ReturnType<typeof calculateOperatorWeek>>();
    const costs = new Map<string, ReturnType<typeof calculateShiftCost>[]>();
    const allowances = new Map<string, {totalWeekly: number;} | null>();

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
      let allowResult: {totalWeekly: number; items?: any[]} | null = null;
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

  // Workforce summary
  const workforceSummary = useMemo(() => {
    const map = new Map<ServiceType, {ft: number;pt: number;casual: number;weeklyHrs: number;annualCost: number;}>();

    operators.forEach((op) => {
      const svc = normalizeService(op.service);
      if (!map.has(svc)) map.set(svc, { ft: 0, pt: 0, casual: 0, weeklyHrs: 0, annualCost: 0 });
      const row = map.get(svc)!;

      if (op.employmentType === 'full-time') row.ft++;else
      if (op.employmentType === 'part-time') row.pt++;else
      row.casual++;

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

  // Weekly hours by service for bar chart
  const weeklyHoursByService = useMemo(() => {
    const data: {day: string;[key: string]: number | string;}[] = [];
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

  // Total weekly hours
  const totalWeeklyHours = useMemo(() => {
    return Array.from(computed.calcs.values()).reduce((s, c) => s + c.weeklyPaidHours, 0);
  }, [computed]);

  // Total warnings
  const totalWarnings = useMemo(() => {
    return Array.from(computed.calcs.values()).reduce((s, c) => s + c.warnings.length, 0);
  }, [computed]);

  // Scenario name
  const scenarioName = useMemo(() => {
    if (!activeScenarioId) return 'Default';
    const s = scenarios.find((sc) => sc.id === activeScenarioId);
    return s?.name ?? 'Default';
  }, [activeScenarioId, scenarios]);

  // Fixed price schedule rows
  const fixedPriceRows = useMemo(() => {
    if (jobDetails.contractPriceCondition !== 'Fixed Price' || jobDetails.fixedYears <= 0 || !jobDetails.contractCommencementMonth) return null;

    const start = new Date(jobDetails.contractCommencementMonth);
    if (isNaN(start.getTime())) return null;

    const july = new Date(start.getMonth() < 6 ? start.getFullYear() : start.getFullYear() + 1, 6, 1);
    const n = Math.min(jobDetails.fixedYears, 10);
    const rows: {year: number;start: string;end: string;rise: string;price: number;}[] = [];

    for (let i = 0; i < n; i++) {
      const yStart = new Date(start.getFullYear() + i, start.getMonth(), start.getDate());
      const yEnd = new Date(start.getFullYear() + i + 1, start.getMonth(), start.getDate());
      yEnd.setDate(yEnd.getDate() - 1);
      const r = (jobDetails.fixedPriceSchedule[i]?.increaseForecast ?? 0) / 100;

      if (i === 0) {
        const dPre = Math.round((july.getTime() - start.getTime()) / 86400000);
        const dPost = Math.round((new Date(start.getFullYear() + 1, start.getMonth(), start.getDate()).getTime() - july.getTime()) / 86400000);
        const total = dPre + dPost;
        const price = total > 0 ?
        contractTotalAnnual * (dPre / total) + contractTotalAnnual * (1 + r) * (dPost / total) :
        contractTotalAnnual;
        const impact = total > 0 ? r * (dPost / total) * 100 : r * 100;
        rows.push({ year: 1, start: fmtD(yStart), end: fmtD(yEnd), rise: impact.toFixed(2) + '%', price });
      } else {
        const prev = rows[i - 1].price;
        rows.push({ year: i + 1, start: fmtD(yStart), end: fmtD(yEnd), rise: (r * 100).toFixed(2) + '%', price: prev * (1 + r) });
      }
    }
    return rows;
  }, [jobDetails, contractTotalAnnual]);

  // Statutory total (PLI now in sundry)
  const totalStatutory = statutoryTotal;


  // Pie data — Direct Service Price only: Labour, Statutory, Sundry, Profit (bundled admin)
  const donutData = useMemo(() => {
    const profitTotal = adminCalc.reduce((s, item) => s + item.value, 0);
    return [
      { name: 'Labour', value: grandTotals.annualTotal },
      { name: 'Statutory On-costs', value: totalStatutory },
      { name: 'Sundry Expenses', value: sundryDisplayTotal },
      { name: 'Profit', value: profitTotal },
    ].filter((d) => d.value > 0);
  }, [grandTotals, totalStatutory, sundryDisplayTotal, adminCalc]);

  // Workforce donut data — from workforceSummary annual costs
  const workforceDonutData = useMemo(() => {
    return workforceSummary.map(w => ({
      name: SERVICE_LABELS[w.service],
      value: w.annualCost,
    }));
  }, [workforceSummary]);

  if (!isLoaded || !wageLoaded || isLoading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;
  }

  const wfTotals = workforceSummary.reduce((acc, r) => ({
    ft: acc.ft + r.ft, pt: acc.pt + r.pt, casual: acc.casual + r.casual,
    weeklyHrs: acc.weeklyHrs + r.weeklyHrs, annualCost: acc.annualCost + r.annualCost
  }), { ft: 0, pt: 0, casual: 0, weeklyHrs: 0, annualCost: 0 });

  const labourPriceBreakdownTotal = grandTotals.annualTotal;
  const workforceAnnualMismatch = wfTotals.annualCost - labourPriceBreakdownTotal;
  const showWorkforceMismatchWarning = Math.abs(workforceAnnualMismatch) > 1;

  const servicesForBar = SERVICES.filter((s) => workforceSummary.some((w) => w.service === s));

  const printDate = new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
  const printTime = new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });

  return (
    <>
      <div ref={contentRef} className="exec-summary-screen no-print space-y-6 max-w-5xl mx-auto">
      <FixedPriceBanner />

      {/* ── Page header + export actions ── */}
      <div className="no-print flex items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div>
            <h1 className="text-2xl font-bold">Executive Summary</h1>
            <p className="text-muted-foreground text-sm">Final pricing summary and management overview</p>
          </div>
          <HowItWorks {...HELP_CONTENT["executive-summary"]} size="sm" />
        </div>
        <Button onClick={handleDownloadImage} variant="outline" size="sm">
          <Download className="h-4 w-4 mr-2" />
          Download Image (PNG)
        </Button>
      </div>

      {/* ═══ 1. HEADER (print only) ═══ */}
      <div className="exec-print-header hidden rounded-lg border border-[hsl(120,25%,75%)] bg-[hsl(120,40%,94%)] p-4 print:p-3 items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <img src={cpqLogo} alt="CPQ Logo" className="h-12 w-auto print:h-8" />
          <div>
            <h1 className="text-lg font-bold">Executive Summary</h1>
            <div className="text-[10px] text-muted-foreground">Generated: {printDate} {printTime}</div>
          </div>
        </div>
        <div className="text-right space-y-0.5">
          <div className="text-base font-bold">
            {jobDetails.jobBuildingName || '—'}
          </div>
          <div className="text-[10px] text-muted-foreground space-x-3">
            {jobDetails.jobState && <span>{jobDetails.jobState}</span>}
            {jobDetails.contractCommencementMonth &&
            <span>Start: {new Date(jobDetails.contractCommencementMonth).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
            }
            {jobDetails.tenderDueDate &&
            <span>Tender: {new Date(jobDetails.tenderDueDate).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
            }
            <span>Scenario: {scenarioName}</span>
          </div>
        </div>
      </div>

      {/* ── Print footer (fixed to bottom of every printed page) ── */}
      <div className="exec-print-footer hidden">
        <div className="flex justify-between items-center">
          <span>Generated by CPQ – {printDate} {printTime}</span>
          <span>Executive Summary</span>
        </div>
      </div>

      {/* ═══ 2. KPI CARDS ═══ */}
      <div className={`grid gap-3 ${totalWarnings > 0 ? 'grid-cols-5' : 'grid-cols-4'}`}>
        <KpiCard label="Total Contract Price (Annual)" value={fmtCur(totalContractPriceWithOsc)} highlight />
        <KpiCard label="Total Contract Price (Monthly)" value={fmtCur(totalContractPriceWithOsc / 12)} />
        <KpiCard label="Weekly Paid Hours" value={fmtNum(totalWeeklyHours)} />
        <KpiCard label="Total Operators" value={String(operators.length)} />
        {totalWarnings > 0 &&
        <KpiCard label="Active Warnings" value={String(totalWarnings)} warn />
        }
      </div>

      {/* ═══ 2b. CONTRACT PRICE DONUT CHART ═══ */}
      {donutData.length > 0 && (
        <section className="border border-border rounded-md p-4 print:p-2">
          <ContractDonutChart
            data={donutData}
            totalContractPrice={contractTotalAnnual}
            workforceData={workforceDonutData}
            totalLabourCost={wfTotals.annualCost}
          />
        </section>
      )}

      {/* ═══ 3. WORKFORCE SUMMARY ═══ */}
      {workforceSummary.length > 0 &&
      <section>
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
                {workforceSummary.map((row, idx) =>
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
              )}
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
      }

      {/* ═══ 4. PRICE BUILD-UP WATERFALL ═══ */}
      <PriceWaterfall
        labourAnnual={grandTotals.annualTotal}
        statutoryOnCosts={totalStatutory}
        sundryExpenses={sundryDisplayTotal}
        adminCalc={adminCalc}
        adminTotalValue={adminTotalValue}
        contractTotalAnnual={contractTotalAnnual}
        totalPerWeek={totalPerWeek}
        fmt={fmt}
        phTotal={phPricedCosts.phTotalPriced}
        consumablesTotal={consumablesTotals.totalPricePA}
        consumablesCostPA={consumablesTotals.totalCostPA}
        adminTotalPct={adminTotalPct}
        adminProfitValue={adminCalc.find(i => i.id === 'profit')?.value ?? 0}
      />

      {/* ═══ 5. KEY ASSUMPTIONS ═══ */}
      <section>
        <SectionTitle>Key Assumptions</SectionTitle>
        <Textarea
          value={assumptions}
          onChange={(e) => setAssumptions(e.target.value)}
          rows={4}
          className="text-xs bg-[hsl(48,80%,95%)] border-[hsl(48,50%,70%)] resize-y print:border-none print:bg-transparent" />
        
      </section>

      {/* ═══ 6. FIXED PRICE SCHEDULE (conditional) ═══ */}
      {fixedPriceRows && fixedPriceRows.length > 0 &&
      <section>
          <SectionTitle>Fixed Price Schedule</SectionTitle>
          <div className="border border-border rounded-md overflow-hidden">
            <table className="w-full border-collapse text-xs" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '10%' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '32%' }} />
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
                {fixedPriceRows.map((row, idx) =>
              <tr key={row.year} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/10'}>
                    <td className={`${cellCls} text-center`}>{row.year}</td>
                    <td className={`${cellCls} text-center font-sans`}>{row.start}</td>
                    <td className={`${cellCls} text-center font-sans`}>{row.end}</td>
                    <td className={cellCls}>{row.rise}</td>
                    <td className={`${cellCls} font-semibold`}>{fmtCur(row.price)}</td>
                  </tr>
              )}
              </tbody>
            </table>
          </div>
        </section>
      }

      {/* ═══ 7. CHARTS ═══ */}
      {servicesForBar.length > 0 &&
        <section className="border border-border rounded-md p-4 print:p-2">
          <h3 className="text-xs font-semibold mb-2 text-center">Daily Paid Hours by Service</h3>
          <ResponsiveContainer width="100%" height={260}>
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
      }

      {/* ═══ 8. APPROVAL BLOCK ═══ */}
      <ApprovalTable
        rows={approvalRows}
        emailApproval={emailApproval}
        onEmailApprovalChange={setEmailApproval}
        onUpdate={updateApprovalRow}
      />
      </div>
    </>);

}

/* ── Subcomponents ────────────────────────────────────────── */

function KpiCard({ label, value, highlight, warn }: {label: string;value: string;highlight?: boolean;warn?: boolean;}) {
  return (
    <div className={`rounded-md border p-3 text-center ${
    highlight ? 'border-[hsl(120,25%,75%)] bg-[hsl(120,40%,94%)]' :
    warn ? 'border-destructive/30 bg-destructive/5' :
    'border-border bg-card'}`
    }>
      <div className={`text-lg font-bold font-mono ${warn ? 'text-destructive' : ''}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{label}</div>
    </div>);

}

/* ── PriceWaterfall ────────────────────────────────────────── */

interface WaterfallProps {
  labourAnnual: number;
  statutoryOnCosts: number;
  sundryExpenses: number;
  adminCalc: { id: string; label: string; value: number }[];
  adminTotalValue: number;
  contractTotalAnnual: number;
  totalPerWeek: number;
  fmt: (v: number) => string;
  phTotal: number;
  consumablesTotal: number;
  consumablesCostPA: number;
  adminTotalPct: number;
  adminProfitValue: number;
}

const OSC_KEYS = [
  { key: 'publicHolidays', label: 'Public Holidays' },
  { key: 'bathroomConsumables', label: 'Bathroom Consumables' },
  { key: 'sanitaryServices', label: 'Sanitary Services' },
  { key: 'periodicalServices', label: 'Periodical Services' },
  { key: 'rental', label: 'Rental' },
  { key: 'peakTrading', label: 'Peak Trading' },
  { key: 'christmasExtended', label: 'Christmas Extended Trade' },
] as const;

function loadOscInclusion(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem('cpq_osc_summary_included');
    if (raw) return JSON.parse(raw);
  } catch {}
  const d: Record<string, boolean> = {};
  OSC_KEYS.forEach(r => { d[r.key] = true; });
  return d;
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

function loadRentalValue(): number {
  try {
    const raw = localStorage.getItem('cpq_rental_value');
    if (raw) return parseFloat(raw) || 0;
  } catch {}
  return 0;
}

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
  return {
    total,
    baseCost: 0,
    profitValue: loadPhProfit(total, profitPct),
  };
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

/** Read persisted row-level data from OSC Summary (single source of truth) */
function loadOscSummaryRows(): Record<string, { total: number; profit: number }> | null {
  try {
    const raw = localStorage.getItem('cpq_osc_summary_rows');
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function PriceWaterfall({ labourAnnual, statutoryOnCosts, sundryExpenses, adminCalc, adminTotalValue, contractTotalAnnual, totalPerWeek, fmt, phTotal, consumablesTotal, consumablesCostPA, adminTotalPct, adminProfitValue }: WaterfallProps) {
  const [oscInclusion, setOscInclusion] = useState(loadOscInclusion);

  useEffect(() => {
    const sync = () => setOscInclusion(loadOscInclusion());
    window.addEventListener('storage', sync);
    const interval = setInterval(sync, 2000);
    return () => { window.removeEventListener('storage', sync); clearInterval(interval); };
  }, []);

  // Read OSC row data directly from the OSC Summary table (single source of truth)
  const [oscSummaryRows, setOscSummaryRows] = useState<Record<string, { total: number; profit: number }> | null>(loadOscSummaryRows);

  useEffect(() => {
    const refresh = () => setOscSummaryRows(loadOscSummaryRows());
    window.addEventListener('storage', refresh);
    const interval = setInterval(refresh, 2000);
    return () => { window.removeEventListener('storage', refresh); clearInterval(interval); };
  }, []);

  // Build OSC items: prefer persisted summary rows, fallback to direct calculation
  const oscItems = useMemo(() => {
    return OSC_KEYS.map(k => {
      // If we have persisted summary data, use it (single source of truth)
      if (oscSummaryRows && k.key in oscSummaryRows) {
        const row = oscSummaryRows[k.key];
        return { ...k, total: row.total, profit: row.profit };
      }

      // Fallback: compute from raw data (should rarely happen)
      let total = 0;
      let profit = 0;
      if (k.key === 'publicHolidays') {
        const ph = buildPublicHolidayData(phTotal, adminTotalPct);
        total = ph.total;
        profit = ph.profitValue;
      } else if (k.key === 'bathroomConsumables') {
        total = consumablesTotal;
        profit = consumablesTotal - consumablesCostPA;
      } else if (k.key === 'sanitaryServices') {
        const s = computeSanitaryTotal();
        total = s.total;
        profit = s.total - s.baseCost;
      } else if (k.key === 'periodicalServices') {
        const p = computePeriodicalData();
        total = p.total;
        profit = p.total - p.baseCost;
      } else if (k.key === 'rental') {
        total = loadRentalValue();
        profit = 0;
      }
      return { ...k, total, profit };
    });
  }, [oscSummaryRows, phTotal, consumablesTotal, consumablesCostPA, adminTotalPct]);

  // Only included items with value
  const includedOsc = useMemo(() =>
    oscItems.filter(k => oscInclusion[k.key] && k.total > 0)
  , [oscItems, oscInclusion]);

  const oscSubtotal = useMemo(() =>
    includedOsc.reduce((s, i) => s + i.total, 0)
  , [includedOsc]);

  // Read OSC profit total directly from the Other Services & Costs summary table
  const [oscProfitTotal, setOscProfitTotal] = useState(() => {
    try {
      const raw = localStorage.getItem('cpq_osc_margin_total');
      if (raw) return JSON.parse(raw) ?? 0;
    } catch {}
    return 0;
  });

  useEffect(() => {
    const refresh = () => {
      try {
        const raw = localStorage.getItem('cpq_osc_margin_total');
        if (raw) setOscProfitTotal(JSON.parse(raw) ?? 0);
      } catch {}
    };
    window.addEventListener('storage', refresh);
    const interval = setInterval(refresh, 2000);
    return () => { window.removeEventListener('storage', refresh); clearInterval(interval); };
  }, []);

  // FIXED: Total Contract Price = Direct Service + OSC
  const totalContractPrice = contractTotalAnnual + oscSubtotal;
  const directServiceTotal = contractTotalAnnual;

  // Profit summary – "Profit on Direct Service" = full Admin & Profit value (not just profit line)
  const directServiceProfit = adminTotalValue;
  const totalProfit = directServiceProfit + oscProfitTotal;
  const profitPct = totalContractPrice > 0 ? (totalProfit / totalContractPrice) * 100 : 0;

  const rCls = "py-3 px-4 text-xs align-middle";
  const vCls = "py-3 px-5 text-xs text-right font-mono tabular-nums align-middle";

  return (
    <section>
      <SectionTitle>Price Build-up (Annual)</SectionTitle>
      <div className="border border-border/40 rounded-md overflow-hidden bg-card">

        {/* ── SECTION 1: Direct Service Price ── */}
        <div className="px-4 pt-3.5 pb-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[hsl(210,70%,50%)]">
            Direct Service Price
          </h3>
        </div>
        <table className="w-full" style={{ tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 }}>
          <colgroup>
            <col style={{ width: '55%' }} />
            <col style={{ width: '45%' }} />
          </colgroup>
          <tbody>
            <tr className="border-t border-border/15">
              <td className={rCls}>Annual Labour Cost (Wages + Allowances)</td>
              <td className={vCls}>{fmt(labourAnnual)}</td>
            </tr>
            <tr className="border-t border-border/15">
              <td className={rCls}>Statutory On-costs</td>
              <td className={vCls}>{fmt(statutoryOnCosts)}</td>
            </tr>
            <tr className="border-t border-border/15">
              <td className={rCls}>Sundry Expenses</td>
              <td className={vCls}>{fmt(sundryExpenses)}</td>
            </tr>
            <tr className="border-t border-border/15">
              <td className={rCls}>Administration & Profit</td>
              <td className={vCls}>{fmt(adminTotalValue)}</td>
            </tr>
            <tr className="border-t border-border/30 bg-muted/15">
              <td className={`${rCls} font-semibold`}>Total Direct Service</td>
              <td className={`${vCls} font-semibold`}>{fmt(directServiceTotal)}</td>
            </tr>
          </tbody>
        </table>

        {/* ── SECTION 2: Other Services & Costs ── */}
        {includedOsc.length > 0 && (
          <>
            <div className="px-4 pt-4 pb-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[hsl(210,70%,50%)]">
                Other Services & Costs
              </h3>
            </div>
            <table className="w-full" style={{ tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 }}>
              <colgroup>
                <col style={{ width: '55%' }} />
                <col style={{ width: '45%' }} />
              </colgroup>
              <tbody>
                {includedOsc.map(item => (
                  <tr key={item.key} className="border-t border-border/10">
                    <td className={`${rCls} pl-8 text-muted-foreground`}>{item.label}</td>
                    <td className={`${vCls}`}>
                      <span className="mr-2 text-[10px] text-muted-foreground/60 font-normal">
                        ( {formatCurrency(item.profit)} )
                      </span>
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

        {/* ── GRAND TOTAL ── */}
        <table className="w-full" style={{ tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 }}>
          <colgroup>
            <col style={{ width: '55%' }} />
            <col style={{ width: '45%' }} />
          </colgroup>
          <tbody>
            <tr className="border-t-2 border-foreground/15 bg-[hsl(120,40%,94%)]">
              <td className={`${rCls} font-bold text-sm py-3.5`}>TOTAL CONTRACT PRICE (ANNUAL)</td>
              <td className={`${vCls} font-bold text-sm py-3.5`}>{fmt(totalContractPrice)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Per-period summary ── */}
      <div className="mt-2 flex gap-6 text-xs">
        <span className="text-muted-foreground">Per Week: <span className="font-mono font-medium text-foreground">{fmt(totalContractPrice / 52.14)}</span></span>
        <span className="text-muted-foreground">Per Month: <span className="font-mono font-medium text-foreground">{fmt(totalContractPrice / 12)}</span></span>
      </div>

      {/* ── PROFIT SUMMARY ── */}
      <div className="mt-4 border border-border/40 rounded-md overflow-hidden bg-card">
        <div className="px-4 pt-3.5 pb-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[hsl(210,70%,50%)]">
            Profit Summary
          </h3>
        </div>
        <table className="w-full" style={{ tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 }}>
          <colgroup>
            <col style={{ width: '55%' }} />
            <col style={{ width: '45%' }} />
          </colgroup>
          <tbody>
            <tr className="border-t border-border/15">
              <td className={rCls}>Administration & Profit</td>
              <td className={vCls}>{fmt(directServiceProfit)}</td>
            </tr>
            <tr className="border-t border-border/15">
              <td className={rCls}>Profit on Other Services & Costs</td>
              <td className={vCls}>{fmt(oscProfitTotal)}</td>
            </tr>
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
  );
}

function SectionTitle({ children }: {children: React.ReactNode;}) {
  return (
    <div className="rounded border border-[hsl(120,25%,75%)] bg-[hsl(120,40%,94%)] px-3 py-1.5 mb-2 print:mb-1">
      <h2 className="font-semibold text-sm">{children}</h2>
    </div>);

}

function fmtD(d: Date): string {
  return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
}

const APPROVAL_ROWS = [
  { label: 'Prepared by', defaultTitle: 'estimator' },
  { label: 'Reviewed by', defaultTitle: 'GM' },
  { label: 'Approved by', defaultTitle: 'CEO' },
];

interface ApprovalTableProps {
  rows: ApprovalRowData[];
  emailApproval: boolean;
  onEmailApprovalChange: (value: boolean) => void;
  onUpdate: (idx: number, field: keyof ApprovalRowData, value: string | Date | undefined) => void;
}

function ApprovalTable({ rows, emailApproval, onEmailApprovalChange, onUpdate }: ApprovalTableProps) {

  const inputCls = 'h-7 text-xs border-0 border-b border-muted-foreground/30 rounded-none bg-transparent shadow-none focus-visible:ring-0 focus-visible:border-primary px-1 w-full print:border-0';

  return (
    <section className="print:break-inside-avoid">
      <SectionTitle>Approval</SectionTitle>
      <div className="border border-border rounded-md overflow-hidden">
        <table className="w-full border-collapse text-xs" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '22%' }} />
            <col style={{ width: '30%' }} />
            <col style={{ width: '22%' }} />
            <col style={{ width: '26%' }} />
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
            {rows.map((row, idx) => (
              <tr key={idx} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/10'}>
                <td className={labelCls}>
                  <div className="flex items-center gap-0 h-7 border-0 border-b border-muted-foreground/30 px-1">
                    <span className="text-xs whitespace-nowrap">{row.label} –</span>
                    <Input className="h-7 text-xs border-0 rounded-none bg-transparent shadow-none focus-visible:ring-0 px-1 w-full print:border-0" defaultValue={row.roleTitle} onBlur={e => onUpdate(idx, 'roleTitle', e.target.value)} />
                  </div>
                </td>
                <td className={labelCls}>
                  <Input className={inputCls} placeholder="Enter name…" defaultValue={row.name} onBlur={e => onUpdate(idx, 'name', e.target.value)} />
                </td>
                <td className={labelCls}>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" className={cn('h-7 w-full justify-start text-xs font-normal border-0 border-b border-muted-foreground/30 rounded-none bg-transparent shadow-none px-1 hover:bg-muted/20 print:border-0', !row.date && 'text-muted-foreground')}>
                        {row.date ? format(row.date, 'dd MMM yyyy') : <span className="flex items-center gap-1"><CalendarIcon className="h-3 w-3" />Pick date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={row.date} onSelect={d => onUpdate(idx, 'date', d)} initialFocus className={cn('p-3 pointer-events-auto')} />
                    </PopoverContent>
                  </Popover>
                </td>
                <td className={labelCls}>
                  <Input className={inputCls} placeholder="Enter signature…" defaultValue={row.signature} onBlur={e => onUpdate(idx, 'signature', e.target.value)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 space-y-1.5 print:mt-1">
        <p className="text-[10px] italic text-muted-foreground">
          If a signature is not available, approval may be provided via email confirmation.
        </p>
        <label className="flex items-center gap-1.5 cursor-pointer print:hidden">
          <Checkbox checked={emailApproval} onCheckedChange={v => onEmailApprovalChange(!!v)} className="h-3.5 w-3.5" />
          <span className="text-[10px] text-muted-foreground">Approval provided via email</span>
        </label>
        {emailApproval && (
          <p className="hidden print:block text-[10px] italic text-muted-foreground font-medium">
            ✓ Approval provided via email
          </p>
        )}
      </div>
    </section>
  );
}