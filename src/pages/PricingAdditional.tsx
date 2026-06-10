import { useMemo, useState, useCallback, useEffect } from 'react';
import { usePricingData } from '@/hooks/usePricingData';
import { PageActions } from '@/components/PageActions';
import HowItWorks from '@/components/HowItWorks';
import { HELP_CONTENT } from '@/data/helpContent';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import FormattedCellInput from '@/components/ui/formatted-cell-input';
import PublicHolidaysSection from '@/components/PublicHolidaysSection';
import ConsumablesTable from '@/components/ConsumablesTable';
import PeriodicalServicesTable from '@/components/PeriodicalServicesTable';
import SanitaryServicesTable from '@/components/SanitaryServicesTable';
import PeakTradingTable from '@/components/PeakTradingTable';
import ChristmasExtendedTradeTable from '@/components/ChristmasExtendedTradeTable';
import OtherServicesCostsSummary from '@/components/OtherServicesCostsSummary';
import { CHRISTMAS_EXTENDED_TRADE_STORAGE_KEY } from '@/lib/christmasExtendedTradeStorage';

const cellCls = "text-right px-2.5 py-1.5 font-mono text-xs align-middle";
const labelCls = "px-2.5 py-1.5 text-xs align-middle";
const headCls = "px-3 py-2 text-xs font-semibold text-center align-middle";

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 }).format(n);

const RENTAL_STORAGE_KEY = 'cpq_rental_value';

function loadRental(): number {
  try {
    const raw = localStorage.getItem(RENTAL_STORAGE_KEY);
    if (raw) return parseFloat(raw) || 0;
  } catch { /* ignore */ }
  return 0;
}

function loadConsumablesTotal(): number {
  try {
    const raw = localStorage.getItem('cpq_consumables_rows');
    const profitRaw = localStorage.getItem('cpq_consumables_profit');
    if (!raw) return 0;
    const rows = JSON.parse(raw);
    const profitPct = profitRaw ? JSON.parse(profitRaw) : 30;
    const profitRate = profitPct / 100;
    let total = 0;
    for (const r of rows) {
      if (r.description && r.unitsPA != null && r.unitsPA > 0) {
        const cost = r.unitCost * r.unitsPA;
        total += cost + cost * profitRate;
      }
    }
    return total;
  } catch { return 0; }
}

function loadConsumablesMarkup(): number {
  try {
    const raw = localStorage.getItem('cpq_consumables_profit');
    if (raw) return JSON.parse(raw);
  } catch {}
  return 30;
}

function loadSanitaryTotal(): number {
  try {
    const raw = localStorage.getItem('cpq_sanitary_rows');
    if (!raw) return 0;
    const rows = JSON.parse(raw);
    const mkRaw = localStorage.getItem('cpq_sanitary_markup');
    const markupRate = (mkRaw ? JSON.parse(mkRaw) : 15) / 100;
    let total = 0;
    for (const r of rows) {
      if (r.costPerUnit != null && r.frequency != null && r.quantity != null && r.costPerUnit > 0) {
        const cost = r.costPerUnit * r.frequency * r.quantity;
        total += cost + cost * markupRate;
      }
    }
    return total;
  } catch { return 0; }
}

function loadSanitaryMarkup(): number {
  try {
    const raw = localStorage.getItem('cpq_sanitary_markup');
    if (raw) return JSON.parse(raw);
  } catch {}
  return 15;
}

function loadPeakTradingTotal(): number {
  try {
    const raw = localStorage.getItem('cpq_peak_trading_rows');
    if (!raw) return 0;
    const rows = JSON.parse(raw);
    return rows.reduce((sum: number, r: any) => {
      const rate = r.casualRate ?? r.hourlyRate ?? 0;
      const emps = r.noOfEmployees ?? 0;
      const hrs = r.hoursPerEmployee ?? 0;
      const base = rate * emps * hrs;
      const apRate = r.adminProfitRate ?? 0;
      return sum + base + base * (apRate / 100);
    }, 0);
  } catch { return 0; }
}

function loadChristmasTotal(): number {
  try {
    const raw = localStorage.getItem(CHRISTMAS_EXTENDED_TRADE_STORAGE_KEY);
    if (!raw) return 0;
    const rows = JSON.parse(raw);
    return rows.reduce((sum: number, r: any) => {
      const rate = r.casualRate ?? r.hourlyRate ?? 0;
      const emps = r.noOfEmployees ?? 0;
      const hrs = r.hoursPerEmployee ?? 0;
      const base = rate * emps * hrs;
      const apRate = r.adminProfitRate ?? 0;
      return sum + base + base * (apRate / 100);
    }, 0);
  } catch { return 0; }
}

function loadPeriodicalTotals(): { grand: number; own: number; markup: number } {
  try {
    const raw = localStorage.getItem('cpq_periodical_rows');
    if (!raw) return { grand: 0, own: 0, markup: 0 };
    const removed = ['Sanitary Services', 'Peak Trading', 'Christmas Extended Trade', 'Rent', 'Leap Year'];
    const rows = JSON.parse(raw).filter((r: any) => !removed.includes(r.service));
    let sumCost = 0, sumMarkup = 0, sumPrice = 0;
    for (const r of rows) {
      if (r.costPerService != null && r.noOfServices != null && r.costPerService > 0 && r.noOfServices > 0) {
        const cost = r.costPerService * r.noOfServices;
        const markup = cost * ((r.profitPct || 0) / 100);
        sumCost += cost;
        sumMarkup += markup;
        sumPrice += cost + markup;
      }
    }
    const sanitary = loadSanitaryTotal();
    const peak = loadPeakTradingTotal();
    const xmas = loadChristmasTotal();
    const rental = loadRental();
    const grand = sumPrice + sanitary + peak + xmas + rental;
    const pctMarkup = sumCost > 0 ? (sumMarkup / sumCost) * 100 : 0;
    return { grand, own: sumPrice, markup: pctMarkup };
  } catch { return { grand: 0, own: 0, markup: 0 }; }
}

export default function PricingAdditional() {
  const {
    isLoading, fmt, fmtPct,
    adminCalc, adminTotalValue, adminTotalPct,
    totalPerWeek, totalPerMonth, totalPerAnnum,
    jobDetails,
    phDowCostMap, phPriceFactorMap,
    servicesWithOperators,
    statutoryRates,
    PAYROLL_TAX_RATES,
  } = usePricingData();

  // Determine primary service for casual rate lookup (first service with operators, default cleaning)
  const primaryService = servicesWithOperators && servicesWithOperators.length > 0 ? servicesWithOperators[0] : 'cleaning' as const;

  // Build overhead rates for Peak Trading / Christmas Extended Trade (casual staff only)
  const overheadRates = useMemo(() => {
    const st = jobDetails.jobState as keyof typeof PAYROLL_TAX_RATES;
    let payrollTaxRate = 0;
    if (statutoryRates.payrollTaxOverThreshold !== false) {
      payrollTaxRate = statutoryRates.payrollTaxOverride ?? PAYROLL_TAX_RATES[st] ?? 0;
    }
    return {
      superRate: 12,
      workersComp: statutoryRates.workersComp,
      payrollTaxRate,
      pli: statutoryRates.pli,
    };
  }, [jobDetails.jobState, statutoryRates]);

  const [sanitaryTotal, setSanitaryTotal] = useState(loadSanitaryTotal);
  const [peakTradingTotal, setPeakTradingTotal] = useState(loadPeakTradingTotal);
  const [peakTradingProfit, setPeakTradingProfit] = useState(0);
  const [christmasTotal, setChristmasTotal] = useState(loadChristmasTotal);
  const [christmasProfit, setChristmasProfit] = useState(0);
  const [rentalValue, setRentalValue] = useState(loadRental);
  const [consumablesTotal, setConsumablesTotal] = useState(loadConsumablesTotal);
  const initPeriodical = useMemo(() => loadPeriodicalTotals(), []);
  const [periodicalGrandTotal, setPeriodicalGrandTotal] = useState(() => initPeriodical.grand);
  const [periodicalOwnTotal, setPeriodicalOwnTotal] = useState(() => initPeriodical.own);
  const [phTotal, setPhTotal] = useState(0);

  // Markup states
  const [consumablesMarkup, setConsumablesMarkup] = useState(loadConsumablesMarkup);
  const [sanitaryMarkup, setSanitaryMarkup] = useState(loadSanitaryMarkup);
  const [periodicalMarkup, setPeriodicalMarkup] = useState(() => initPeriodical.markup);

  const [sanitaryOpen, setSanitaryOpen] = useState(false);
  const [peakOpen, setPeakOpen] = useState(false);
  const [xmasOpen, setXmasOpen] = useState(false);

  const handleSanitaryTotal = useCallback((v: number) => setSanitaryTotal(v), []);
  const handlePeakTradingTotal = useCallback((v: number) => setPeakTradingTotal(v), []);
  const handlePeakTradingProfit = useCallback((v: number) => setPeakTradingProfit(v), []);
  const handleChristmasTotal = useCallback((v: number) => setChristmasTotal(v), []);
  const handleChristmasProfit = useCallback((v: number) => setChristmasProfit(v), []);
  const handleConsumablesTotal = useCallback((v: number) => setConsumablesTotal(v), []);
  const handlePeriodicalTotal = useCallback((v: number) => setPeriodicalGrandTotal(v), []);
  const handlePeriodicalOwnTotal = useCallback((v: number) => setPeriodicalOwnTotal(v), []);
  const handlePhTotal = useCallback((v: number) => setPhTotal(v), []);
  const handleConsumablesMarkup = useCallback((v: number) => setConsumablesMarkup(v), []);
  const handleSanitaryMarkup = useCallback((v: number) => setSanitaryMarkup(v), []);
  const handlePeriodicalMarkup = useCallback((v: number) => setPeriodicalMarkup(v), []);

  const summaryValues = useMemo(() => ({
    publicHolidays: { markup: adminTotalPct, total: phTotal },
    bathroomConsumables: { markup: consumablesMarkup, total: consumablesTotal },
    periodicalServices: { markup: periodicalMarkup, total: periodicalOwnTotal },
    sanitaryServices: { markup: sanitaryMarkup, total: sanitaryTotal },
    rental: { markup: 0, total: rentalValue },
    peakTrading: { markup: 0, total: peakTradingTotal, profit: peakTradingProfit },
    christmasExtended: { markup: 0, total: christmasTotal, profit: christmasProfit },
  }), [adminTotalPct, phTotal, consumablesMarkup, consumablesTotal, periodicalMarkup, periodicalOwnTotal, sanitaryMarkup, sanitaryTotal, rentalValue, peakTradingTotal, peakTradingProfit, christmasTotal, christmasProfit]);

  // Persist rental value
  useEffect(() => {
    localStorage.setItem(RENTAL_STORAGE_KEY, String(rentalValue));
  }, [rentalValue]);

  const contractYear = useMemo(() => {
    if (jobDetails.contractCommencementMonth) {
      const y = new Date(jobDetails.contractCommencementMonth).getFullYear();
      if (!isNaN(y)) return y;
    }
    return new Date().getFullYear();
  }, [jobDetails.contractCommencementMonth]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-start gap-3">
          <div>
            <h1 className="text-2xl font-bold">Other Services & Costs</h1>
            <p className="text-muted-foreground text-sm">
              Outsourced or specialised services that occur periodically rather than daily, require separate suppliers, equipment, or compliance, or are non-cleaning operational expenses that still affect the service cost.
            </p>
          </div>
          <HowItWorks {...HELP_CONTENT["other-services-costs"]} size="sm" />
        </div>
        <PageActions showPrint />
      </div>

      {/* ── Accordion subsections ────────────────────────────── */}
      <Accordion type="multiple" defaultValue={['public-holidays']}>
        {/* Public Holidays */}
        <AccordionItem value="public-holidays" className="border border-border rounded-md mb-3 overflow-hidden">
          <AccordionTrigger className="px-4 py-3 bg-muted/20 hover:bg-muted/30 hover:no-underline text-sm font-semibold">
            <div className="flex items-center justify-between w-full pr-2">
              <span>Public Holidays</span>
              <span className="text-xs font-mono text-muted-foreground">
                Total: {fmtCurrency(phTotal)}
              </span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 py-4">
            <PublicHolidaysSection
              jobState={jobDetails.jobState}
              phIncluded={jobDetails.publicHolidayIncluded}
              sundayRosterForPH={jobDetails.sundayRosterForPublicHolidays}
              contractYear={contractYear}
              contractStartDate={jobDetails.contractCommencementMonth}
              phDowCostMap={phDowCostMap}
              phPriceFactorMap={phPriceFactorMap}
              adminProfitRate={adminTotalPct}
              onTotalChange={handlePhTotal}
            />
          </AccordionContent>
        </AccordionItem>

        {/* Bathroom Consumables */}
        <AccordionItem value="bathroom-consumables" className="border border-border rounded-md mb-3 overflow-hidden">
          <AccordionTrigger className="px-4 py-3 bg-muted/20 hover:bg-muted/30 hover:no-underline text-sm font-semibold">
            <div className="flex items-center justify-between w-full pr-2">
              <span>Bathroom Consumables</span>
              <span className="text-xs font-mono text-muted-foreground">Total: {fmtCurrency(consumablesTotal)}</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-0 py-0">
            <div className="p-4">
              <ConsumablesTable onTotalChange={handleConsumablesTotal} onMarkupChange={handleConsumablesMarkup} />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Periodical Services — main table only */}
        <AccordionItem value="periodical-subcontracted" className="border border-border rounded-md mb-3 overflow-hidden">
          <AccordionTrigger className="px-4 py-3 bg-muted/20 hover:bg-muted/30 hover:no-underline text-sm font-semibold">
            <div className="flex items-center justify-between w-full pr-2">
              <span>Periodical Services</span>
              <span className="text-xs font-mono text-muted-foreground">Total: {fmtCurrency(periodicalGrandTotal)}</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-0 py-0">
            <div className="p-4">
              <PeriodicalServicesTable
                sanitaryTotal={sanitaryTotal}
                peakTradingTotal={peakTradingTotal}
                christmasTotal={christmasTotal}
                rentalTotal={rentalValue}
                onTotalChange={handlePeriodicalTotal}
                onOwnTotalChange={handlePeriodicalOwnTotal}
                onMarkupChange={handlePeriodicalMarkup}
              />
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* ── Independent collapsible detail sections ──────────── */}
      <div className="space-y-3">
        {/* Sanitary Services */}
        <Collapsible open={sanitaryOpen} onOpenChange={setSanitaryOpen}>
          <div className="border border-border rounded-md overflow-hidden">
            <CollapsibleTrigger className="w-full flex items-center justify-between px-4 py-3 bg-muted/20 hover:bg-muted/30 text-sm font-semibold cursor-pointer">
              <span>Sanitary Services</span>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-muted-foreground">Total: {fmtCurrency(sanitaryTotal)}</span>
                <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-200 ${sanitaryOpen ? 'rotate-180' : ''}`} />
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent forceMount className="data-[state=closed]:hidden">
              <div className="p-4">
                <SanitaryServicesTable onTotalChange={handleSanitaryTotal} onMarkupChange={handleSanitaryMarkup} />
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>

        {/* Peak Trading */}
        <Collapsible open={peakOpen} onOpenChange={setPeakOpen}>
          <div className="border border-border rounded-md overflow-hidden">
            <CollapsibleTrigger className="w-full flex items-center justify-between px-4 py-3 bg-muted/20 hover:bg-muted/30 text-sm font-semibold cursor-pointer">
              <span>Peak Trading</span>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-muted-foreground">Total: {fmtCurrency(peakTradingTotal)}</span>
                <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-200 ${peakOpen ? 'rotate-180' : ''}`} />
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent forceMount className="data-[state=closed]:hidden">
              <div className="p-4">
                <PeakTradingTable onTotalChange={handlePeakTradingTotal} onProfitChange={handlePeakTradingProfit} defaultAdminProfitRate={adminTotalPct} jobService={primaryService} overheadRates={overheadRates} />
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>

        {/* Christmas Extended Trade */}
        <Collapsible open={xmasOpen} onOpenChange={setXmasOpen}>
          <div className="border border-border rounded-md overflow-hidden">
            <CollapsibleTrigger className="w-full flex items-center justify-between px-4 py-3 bg-muted/20 hover:bg-muted/30 text-sm font-semibold cursor-pointer">
              <span>Christmas Extended Trade</span>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-muted-foreground">Total: {fmtCurrency(christmasTotal)}</span>
                <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-200 ${xmasOpen ? 'rotate-180' : ''}`} />
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent forceMount className="data-[state=closed]:hidden">
              <div className="p-4">
                <ChristmasExtendedTradeTable onTotalChange={handleChristmasTotal} onProfitChange={handleChristmasProfit} defaultAdminProfitRate={adminTotalPct} jobService={primaryService} overheadRates={overheadRates} />
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>

        {/* Rental — independent item like Leap Year */}
        <div className="border border-border rounded-md overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-muted/20">
            <span className="text-sm font-semibold">Rental</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Annual Cost:</span>
              <FormattedCellInput
                value={rentalValue}
                decimals={2}
                min={0}
                onChange={v => setRentalValue(v ?? 0)}
                className="h-8 w-36 text-xs text-right font-mono"
                placeholder="$0.00"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Other Services & Costs Summary ───────────────────── */}
      <section>
        <h2 className="text-lg font-bold mb-3">Other Services & Costs Summary</h2>
        <OtherServicesCostsSummary values={summaryValues} />
      </section>

      {/* ── Administration & Profit ──────────────────────────── */}
      <section>
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className={`${headCls} text-left w-[40%]`} colSpan={2}>Administration & Profit</th>
                <th className={`${headCls}`}></th>
                <th className={`${headCls}`}></th>
                <th className={`${headCls}`}>Annual Value</th>
              </tr>
            </thead>
            <tbody>
              {adminCalc.map((item, idx) => (
                <tr key={item.id} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/10'}>
                  <td className={labelCls} colSpan={2}>{item.label}</td>
                  <td className={cellCls}>{fmtPct(item.pct)}</td>
                  <td className={cellCls}></td>
                  <td className={cellCls}>{fmt(item.value)}</td>
                </tr>
              ))}
              <tr className="border-t border-border bg-muted/40 font-semibold">
                <td className={`${labelCls} font-semibold`} colSpan={2}>Total Administration & Profit</td>
                <td className={cellCls}>{fmtPct(adminTotalPct)}</td>
                <td className={cellCls}></td>
                <td className={cellCls}>{fmt(adminTotalValue)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Summary bar ─────────────────────────────────────── */}
      <section>
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
            <tbody>
              <tr className="bg-muted/20 border-b border-border">
                <td className={`${labelCls} font-semibold w-[40%]`} colSpan={4}>Total Direct Labour Price Per Week</td>
                <td className={`${cellCls} font-semibold`}>{fmt(totalPerWeek)}</td>
              </tr>
              <tr className="bg-muted/20 border-b border-border">
                <td className={`${labelCls} font-semibold w-[40%]`} colSpan={4}>Total Direct Labour Price Per Month</td>
                <td className={`${cellCls} font-semibold`}>{fmt(totalPerMonth)}</td>
              </tr>
              <tr className="bg-muted/40">
                <td className={`${labelCls} font-bold w-[40%]`} colSpan={4}>Total Direct Labour Price Per Annum</td>
                <td className={`${cellCls} font-bold`}>{fmt(totalPerAnnum)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
