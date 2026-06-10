import { useRef, useCallback } from 'react';
import { usePricingData } from '@/hooks/usePricingData';
import { FixedPriceBanner } from '@/components/FixedPriceBanner';
import * as XLSX from 'xlsx';
import { getExportFileName, applySheetFormatting, boldLastRow, downloadWorkbook } from '@/lib/excelExport';
import { PageActions } from '@/components/PageActions';
import HowItWorks from '@/components/HowItWorks';
import { HELP_CONTENT } from '@/data/helpContent';
import html2canvas from 'html2canvas';
import { toast } from 'sonner';
import cpqLogo from '@/assets/cpq-logo.png';
import { useEffect, useState } from 'react';
import { useConsumables } from '@/hooks/useConsumables';
import { CHRISTMAS_EXTENDED_TRADE_STORAGE_KEY } from '@/lib/christmasExtendedTradeStorage';

const cellCls = "text-right px-2.5 py-1.5 font-mono text-xs align-middle";
const labelCls = "px-2.5 py-1.5 text-xs align-middle";
const headCls = "px-3 py-2 text-xs font-semibold text-center align-middle";

export default function PricingStatutory() {
  const {
    isLoading, serviceData, grandTotals, SERVICE_HEADINGS, ROW_DEFS,
    fmt, fmtHrs, fmtPct,
    statutoryCalc, statutoryTotal, pliRow, pliError,
    sundryCalc, sundryTotalValue, sundryTotalPct,
    servicesWithOperators,
    adminCalc, adminTotalValue, adminTotalPct,
    contractTotalAnnual, adminError,
    totalPerWeek, totalPerMonth, totalPerAnnum,
    jobDetails,
    phPricedCosts,
    hasLabourData,
  } = usePricingData();

  const captureRef = useRef<HTMLDivElement>(null);
  const { totals: consumablesTotals } = useConsumables();

  // Replicate Executive Summary's OSC computation, but expose per-row breakdown
  const [oscBreakdown, setOscBreakdown] = useState<Record<string, number>>({
    publicHolidays: 0, bathroomConsumables: 0, sanitaryServices: 0,
    periodicalServices: 0, rental: 0, peakTrading: 0, christmasExtended: 0,
  });
  useEffect(() => {
    const compute = () => {
      try {
        const inclRaw = localStorage.getItem('cpq_osc_summary_included');
        const incl = inclRaw ? JSON.parse(inclRaw) : { publicHolidays: true, bathroomConsumables: true, periodicalServices: true, sanitaryServices: true, rental: true, peakTrading: true, christmasExtended: true };
        const out: Record<string, number> = {
          publicHolidays: 0, bathroomConsumables: 0, sanitaryServices: 0,
          periodicalServices: 0, rental: 0, peakTrading: 0, christmasExtended: 0,
        };

        // Prefer persisted OSC summary rows for parity with Executive Summary
        const summaryRaw = localStorage.getItem('cpq_osc_summary_rows');
        if (summaryRaw) {
          const rows = JSON.parse(summaryRaw) as Record<string, { total: number }>;
          for (const k of Object.keys(out)) out[k] = rows[k]?.total ?? 0;
          setOscBreakdown(out);
          return;
        }

        if (incl.publicHolidays) out.publicHolidays = phPricedCosts.phTotalPriced || 0;
        if (incl.bathroomConsumables) out.bathroomConsumables = consumablesTotals.totalPricePA || 0;
        if (incl.periodicalServices) {
          const raw = localStorage.getItem('cpq_periodical_rows');
          if (raw) {
            const rows = JSON.parse(raw);
            let t = 0;
            for (const r of rows) {
              const cost = r.costPerService ?? r.cost ?? 0;
              const freq = r.noOfServices ?? r.frequency ?? 0;
              const markup = r.profitPct ?? r.markupPct ?? 0;
              if (cost > 0 && freq > 0) { const c = cost * freq; t += c + c * (markup / 100); }
            }
            out.periodicalServices = t;
          }
        }
        if (incl.sanitaryServices) {
          const raw = localStorage.getItem('cpq_sanitary_rows');
          if (raw) {
            const rows = JSON.parse(raw);
            const mkRaw = localStorage.getItem('cpq_sanitary_markup');
            const rate = (mkRaw ? JSON.parse(mkRaw) : 15) / 100;
            let t = 0;
            for (const r of rows) {
              if (r.costPerUnit > 0 && r.frequency > 0 && r.quantity > 0) {
                const c = r.costPerUnit * r.frequency * r.quantity;
                t += c + c * rate;
              }
            }
            out.sanitaryServices = t;
          }
        }
        if (incl.rental) {
          const raw = localStorage.getItem('cpq_rental_value');
          if (raw) out.rental = parseFloat(raw) || 0;
        }
        if (incl.peakTrading) {
          const raw = localStorage.getItem('cpq_peak_trading_rows');
          if (raw) {
            const rows = JSON.parse(raw);
            let t = 0;
            for (const r of rows) {
              const rate = r.casualRate ?? r.hourlyRate ?? 0;
              const emps = r.noOfEmployees ?? 0;
              const hrs = r.hoursPerEmployee ?? 0;
              const apRate = r.adminProfitRate ?? 0;
              if (rate > 0 && emps > 0 && hrs > 0) { const base = rate * emps * hrs; t += base + base * (apRate / 100); }
            }
            out.peakTrading = t;
          }
        }
        if (incl.christmasExtended) {
          const raw = localStorage.getItem(CHRISTMAS_EXTENDED_TRADE_STORAGE_KEY);
          if (raw) {
            const rows = JSON.parse(raw);
            let t = 0;
            for (const r of rows) {
              const rate = r.casualRate ?? r.hourlyRate ?? 0;
              const emps = r.noOfEmployees ?? 0;
              const hrs = r.hoursPerEmployee ?? 0;
              const apRate = r.adminProfitRate ?? 0;
              if (rate > 0 && emps > 0 && hrs > 0) { const base = rate * emps * hrs; t += base + base * (apRate / 100); }
            }
            out.christmasExtended = t;
          }
        }
        setOscBreakdown(out);
      } catch { /* keep last */ }
    };
    compute();
    window.addEventListener('storage', compute);
    const interval = setInterval(compute, 2000);
    return () => { window.removeEventListener('storage', compute); clearInterval(interval); };
  }, [phPricedCosts.phTotalPriced, consumablesTotals.totalPricePA]);

  const captureImage = useCallback(async (withLogo: boolean) => {
    if (!captureRef.current) return;
    const el = captureRef.current;

    // Show/hide logo header
    const logoHeader = el.querySelector('.export-logo-header') as HTMLElement | null;
    if (logoHeader) logoHeader.style.display = withLogo ? 'flex' : 'none';

    el.classList.add('labour-breakdown-export');
    try {
      const canvas = await html2canvas(el, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
        windowWidth: el.scrollWidth,
        windowHeight: el.scrollHeight,
      });
      el.classList.remove('labour-breakdown-export');
      if (logoHeader) logoHeader.style.display = 'none';

      canvas.toBlob(async (blob) => {
        if (!blob) { toast.error('Failed to generate image'); return; }
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          toast.success('Copied to clipboard');
        } catch {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `Labour-Price-Breakdown${withLogo ? '' : '-no-logo'}.png`;
          a.click();
          URL.revokeObjectURL(url);
          toast.success('Downloaded as image');
        }
      }, 'image/png');
    } catch {
      el.classList.remove('labour-breakdown-export');
      if (logoHeader) logoHeader.style.display = 'none';
      toast.error('Failed to capture image');
    }
  }, []);

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;
  }

  const fmtOrBlank = (val: number) => hasLabourData ? fmt(val) : '';

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();
    const aoa: (string | number | null)[][] = [];

    // Track which rows are titles, headers, totals, section totals, grand total
    const titleRows: number[] = [];
    const headerRows: number[] = [];
    const groupHeaderRows: number[] = [];
    const totalRows: number[] = [];
    const sectionTotalRows: number[] = [];
    const grandTotalRows: number[] = [];
    const pctCells: string[] = [];
    const currCells: string[] = [];
    const hrsCells: string[] = [];

    let r = 0;

    // ── Title ──
    aoa.push(['Labour Price Breakdown', null, null, null, null]);
    titleRows.push(r); r++;
    aoa.push([null, null, null, null, null]); r++; // blank row

    // ── Service Labour Header ──
    aoa.push(['Service', 'Annual Hours', 'Annual Wage', 'Annual Allowances', 'Annual Labour Cost']);
    headerRows.push(r); r++;

    // ── Service groups ──
    servicesWithOperators.forEach((svc, svcIdx) => {
      const data = serviceData[svc];
      if (!data) return;

      // Group heading
      aoa.push([SERVICE_HEADINGS[svc], null, null, null, null]);
      groupHeaderRows.push(r); r++;

      ROW_DEFS.forEach((rd: any) => {
        const row = data[rd.key];
        if (!row || (row.operatorCount === 0 && row.annualHours === 0 && row.annualLabour === 0 && row.annualAllowances === 0)) return;
        const totalCost = row.annualLabour + row.annualAllowances;
        aoa.push([`    ${rd.label} ${row.operatorCount > 0 ? `(x${row.operatorCount})` : `(same staff)`}`, row.annualHours, row.annualLabour, row.annualAllowances || null, totalCost]);
        hrsCells.push(XLSX.utils.encode_cell({ r, c: 1 }));
        currCells.push(XLSX.utils.encode_cell({ r, c: 2 }));
        currCells.push(XLSX.utils.encode_cell({ r, c: 3 }));
        currCells.push(XLSX.utils.encode_cell({ r, c: 4 }));
        r++;
      });

      // Add blank row between groups (except last)
      if (svcIdx < servicesWithOperators.length - 1) {
        aoa.push([null, null, null, null, null]); r++;
      }
    });

    // Totals row
    aoa.push(['Totals', grandTotals.totalHours, grandTotals.totalLabour, grandTotals.totalAllowances, grandTotals.annualTotal]);
    hrsCells.push(XLSX.utils.encode_cell({ r, c: 1 }));
    currCells.push(XLSX.utils.encode_cell({ r, c: 2 }));
    currCells.push(XLSX.utils.encode_cell({ r, c: 3 }));
    currCells.push(XLSX.utils.encode_cell({ r, c: 4 }));
    sectionTotalRows.push(r); r++;

    // Blank separator
    aoa.push([null, null, null, null, null]); r++;

    // ── Statutory On-costs ──
    aoa.push(['Statutory On-costs', null, 'Rate %', null, 'Annual Value']);
    headerRows.push(r); r++;

    statutoryCalc.forEach((item: any) => {
      aoa.push([item.label, null, (item.pct ?? 0) / 100, null, item.value]);
      pctCells.push(XLSX.utils.encode_cell({ r, c: 2 }));
      currCells.push(XLSX.utils.encode_cell({ r, c: 4 }));
      r++;
    });

    aoa.push(['Total Statutory On-costs', null, null, null, statutoryTotal]);
    currCells.push(XLSX.utils.encode_cell({ r, c: 4 }));
    sectionTotalRows.push(r); r++;

    // Blank separator
    aoa.push([null, null, null, null, null]); r++;

    // ── Sundry Expenses ──
    aoa.push(['Sundry Expenses', null, 'Rate %', null, 'Annual Value']);
    headerRows.push(r); r++;

    sundryCalc.forEach((item: any) => {
      aoa.push([item.label, null, (item.pct ?? 0) / 100, null, item.value]);
      pctCells.push(XLSX.utils.encode_cell({ r, c: 2 }));
      currCells.push(XLSX.utils.encode_cell({ r, c: 4 }));
      r++;
    });
    // PLI row in sundry
    aoa.push([pliRow.label, null, (pliRow.pct ?? 0) / 100, null, pliError ? 0 : pliRow.value]);
    pctCells.push(XLSX.utils.encode_cell({ r, c: 2 }));
    currCells.push(XLSX.utils.encode_cell({ r, c: 4 }));
    r++;

    const sundryDisplayTotal = sundryTotalValue + (pliError ? 0 : pliRow.value);
    aoa.push(['Total Sundry Expenses', null, null, null, sundryDisplayTotal]);
    currCells.push(XLSX.utils.encode_cell({ r, c: 4 }));
    sectionTotalRows.push(r); r++;

    // Blank separator
    aoa.push([null, null, null, null, null]); r++;

    // ── Administration & Profit ──
    aoa.push(['Administration & Profit', null, 'Rate %', null, 'Annual Value']);
    headerRows.push(r); r++;

    adminCalc.forEach((item: any) => {
      aoa.push([item.label, null, (item.pct ?? 0) / 100, null, adminError ? 0 : item.value]);
      pctCells.push(XLSX.utils.encode_cell({ r, c: 2 }));
      currCells.push(XLSX.utils.encode_cell({ r, c: 4 }));
      r++;
    });

    aoa.push(['Total Administration & Profit', null, (adminTotalPct ?? 0) / 100, null, adminError ? 0 : adminTotalValue]);
    pctCells.push(XLSX.utils.encode_cell({ r, c: 2 }));
    currCells.push(XLSX.utils.encode_cell({ r, c: 4 }));
    sectionTotalRows.push(r); r++;

    // Blank separator
    aoa.push([null, null, null, null, null]); r++;

    // ── Contract Summary ──
    aoa.push(['Total Direct Labour Price Per Week', null, null, null, totalPerWeek]);
    currCells.push(XLSX.utils.encode_cell({ r, c: 4 }));
    totalRows.push(r); r++;

    aoa.push(['Total Direct Labour Price Per Month', null, null, null, totalPerMonth]);
    currCells.push(XLSX.utils.encode_cell({ r, c: 4 }));
    totalRows.push(r); r++;

    aoa.push(['Total Direct Labour Price Per Annum', null, null, null, totalPerAnnum]);
    currCells.push(XLSX.utils.encode_cell({ r, c: 4 }));
    grandTotalRows.push(r); r++;

    // ── Build sheet ──
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [
      { wch: 42 },  // A (labels)
      { wch: 16 },  // B (hours / spacer)
      { wch: 18 },  // C (wage / rate%)
      { wch: 16 },  // D (allowances / spacer)
      { wch: 22 },  // E (cost / annual value)
    ];

    // Merge title across columns
    if (!ws['!merges']) ws['!merges'] = [];
    ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } });

    // Apply styles
    const headerFill = { fgColor: { rgb: 'F3F4F6' } };
    const boldFont = { bold: true };
    const titleFont = { bold: true, sz: 16 };

    // Title
    titleRows.forEach(row => {
      const addr = XLSX.utils.encode_cell({ r: row, c: 0 });
      if (ws[addr]) ws[addr].s = { font: titleFont };
    });

    // Header rows
    headerRows.forEach(row => {
      for (let c = 0; c <= 4; c++) {
        const addr = XLSX.utils.encode_cell({ r: row, c });
        if (ws[addr]) ws[addr].s = { font: boldFont, fill: headerFill, alignment: { horizontal: 'center' } };
      }
    });

    // Group headers (bold, no fill)
    groupHeaderRows.forEach(row => {
      const addr = XLSX.utils.encode_cell({ r: row, c: 0 });
      if (ws[addr]) ws[addr].s = { font: boldFont };
    });

    // Section total rows (bold + top border)
    sectionTotalRows.forEach(row => {
      for (let c = 0; c <= 4; c++) {
        const addr = XLSX.utils.encode_cell({ r: row, c });
        if (ws[addr]) ws[addr].s = { font: boldFont, border: { top: { style: 'thin' } } };
      }
    });

    // Contract total rows (bold)
    totalRows.forEach(row => {
      for (let c = 0; c <= 4; c++) {
        const addr = XLSX.utils.encode_cell({ r: row, c });
        if (ws[addr]) ws[addr].s = { font: boldFont };
      }
    });

    // Grand total (bold + larger)
    grandTotalRows.forEach(row => {
      for (let c = 0; c <= 4; c++) {
        const addr = XLSX.utils.encode_cell({ r: row, c });
        if (ws[addr]) ws[addr].s = { font: { bold: true, sz: 12 }, border: { top: { style: 'medium' } } };
      }
    });

    // Number formats
    currCells.forEach(addr => {
      if (ws[addr] && typeof ws[addr].v === 'number') ws[addr].z = '$#,##0.00';
    });
    hrsCells.forEach(addr => {
      if (ws[addr] && typeof ws[addr].v === 'number') ws[addr].z = '#,##0.00';
    });
    pctCells.forEach(addr => {
      if (ws[addr] && typeof ws[addr].v === 'number') ws[addr].z = '0.00%';
    });

    XLSX.utils.book_append_sheet(wb, ws, 'Labour Price Breakdown');
    downloadWorkbook(wb, getExportFileName('LabourPriceBreakdown'));
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <FixedPriceBanner />
      <div className="flex items-center justify-between no-print">
        <div className="flex items-start gap-3">
          <div>
            <h1 className="text-2xl font-bold">Labour Price Breakdown</h1>
            <p className="text-muted-foreground text-sm">Summary of service labour costs, statutory on-costs, sundry expenses, and contract totals</p>
          </div>
          <HowItWorks {...HELP_CONTENT["labour-price-breakdown"]} size="sm" />
        </div>
        <PageActions
          showExcel
          showPrint
          onExportExcel={handleExportExcel}
          showCopyImage
          onCopyImage={() => captureImage(false)}
          showCopyImageWithLogo
          onCopyImageWithLogo={() => captureImage(true)}
        />
      </div>

      <div ref={captureRef}>
        {/* Hidden logo header — shown only during "with logo" export */}
        <div className="export-logo-header items-center gap-3 pb-4 mb-4 border-b border-border" style={{ display: 'none' }}>
          <img src={cpqLogo} alt="CPQ Logo" className="h-12 w-auto" />
          <div>
            <h1 className="text-lg font-bold">Labour Price Breakdown</h1>
            <p className="text-xs text-muted-foreground">
              {jobDetails.jobBuildingName || 'Untitled Job'}{jobDetails.jobBuildingName ? ' — ' : ''}{new Date().toLocaleDateString('en-AU')}
            </p>
          </div>
        </div>

      {/* ─── Service Labour Summary ─────────────────────────── */}
      <section>
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className={`${headCls} text-left w-[40%]`}>Service</th>
                <th className={`${headCls}`}>Annual Hours</th>
                <th className={`${headCls}`}>Annual Wage</th>
                <th className={`${headCls}`}>Annual Allowances</th>
                <th className={`${headCls}`}>Annual Labour Cost</th>
              </tr>
            </thead>
            <tbody>
              {servicesWithOperators.map((svc) => (
                <ServiceBlock key={svc} heading={SERVICE_HEADINGS[svc]} rows={serviceData[svc]} ROW_DEFS={ROW_DEFS} fmt={fmt} fmtHrs={fmtHrs} />
              ))}
              <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                <td className={`${labelCls} font-semibold`}>Totals</td>
                <td className={cellCls}>{fmtHrs(grandTotals.totalHours)}</td>
                <td className={cellCls}>{fmt(grandTotals.totalLabour)}</td>
                <td className={cellCls}>{fmt(grandTotals.totalAllowances)}</td>
                <td className={cellCls}>{fmt(grandTotals.annualTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ─── Statutory On-Costs (read-only summary) ──────────── */}
      <section>
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className={`${headCls} text-left w-[50%]`}>Statutory On-costs</th>
                <th className={`${headCls}`}>Rate %</th>
                <th className={`${headCls}`}>Annual Value</th>
              </tr>
            </thead>
            <tbody>
              {statutoryCalc.map((item, idx) => (
                <tr key={item.id} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/10'}>
                  <td className={labelCls}>{item.label}</td>
                  <td className={cellCls}>{fmtPct(item.pct)}</td>
                  <td className={cellCls}>{fmtOrBlank(item.value)}</td>
                </tr>
              ))}
              <tr className="border-t border-border bg-muted/40 font-semibold">
                <td className={`${labelCls} font-semibold`}>Total Statutory On-costs</td>
                <td className={cellCls}></td>
                <td className={cellCls}>{fmtOrBlank(statutoryTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ─── Sundry Expenses (read-only summary) ─────────────── */}
      <section>
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className={`${headCls} text-left w-[50%]`}>Sundry Expenses</th>
                <th className={`${headCls}`}>Rate %</th>
                <th className={`${headCls}`}>Annual Value</th>
              </tr>
            </thead>
            <tbody>
              {sundryCalc.map((item: any, idx: number) => (
                <tr key={item.id} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/10'}>
                  <td className={labelCls}>{item.label}</td>
                  <td className={cellCls}>{fmtPct(item.pct)}</td>
                  <td className={cellCls}>{fmtOrBlank(item.value)}</td>
                </tr>
              ))}
              {/* PLI row */}
              <tr className={sundryCalc.length % 2 === 0 ? 'bg-background' : 'bg-muted/10'}>
                <td className={labelCls}>{pliRow.label}</td>
                <td className={cellCls}>{fmtPct(pliRow.pct)}</td>
                <td className={cellCls}>{pliError ? '–' : fmtOrBlank(pliRow.value)}</td>
              </tr>
              <tr className="border-t border-border bg-muted/40 font-semibold">
                <td className={`${labelCls} font-semibold`}>Total Sundry Expenses</td>
                <td className={cellCls}></td>
                <td className={cellCls}>{fmtOrBlank(sundryTotalValue + (pliError ? 0 : pliRow.value))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ─── Administration & Profit ────────────────────────── */}
      <AdminProfitSection
        adminCalc={adminCalc}
        adminTotalValue={adminTotalValue}
        adminTotalPct={adminTotalPct}
        adminError={adminError}
        fmt={fmt}
        fmtPct={fmtPct}
        hasLabourData={hasLabourData}
      />

      {/* ─── Public Holidays (priced with on-costs) ─────────── */}
      {jobDetails.publicHolidayIncluded === true && phPricedCosts.phTotalPriced > 0 && (
        <section>
          <div className="border border-border rounded-md overflow-hidden">
            <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
              <thead>
                <tr className="bg-muted/40 border-b border-border">
                  <th className={`${headCls} text-left w-[50%]`}>Public Holidays – Cost & On-costs</th>
                  <th className={`${headCls}`}>Annual Value</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-background">
                  <td className={labelCls}>PH Base Labour (incl. allowances, FT+PT)</td>
                  <td className={cellCls}>{fmt(phPricedCosts.phBase)}</td>
                </tr>
                <tr className="bg-muted/10">
                  <td className={`${labelCls} pl-6`}>Statutory On-costs on PH</td>
                  <td className={cellCls}>{fmt(phPricedCosts.phStatutoryTotal)}</td>
                </tr>
                <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                  <td className={`${labelCls} font-bold`}>Public Holidays – Total (priced)</td>
                  <td className={cellCls}>{fmt(phPricedCosts.phTotalPriced)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ─── Summary Bar ───────────────────────────────────── */}
      <section>
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
            <tbody>
              <tr className="bg-muted/20 border-b border-border">
                <td className={`${labelCls} font-semibold w-[50%]`}>Total Direct Labour Price Per Week</td>
                <td className={`${cellCls} font-semibold`}>{fmtOrBlank(totalPerWeek)}</td>
              </tr>
              <tr className="bg-muted/20 border-b border-border">
                <td className={`${labelCls} font-semibold w-[50%]`}>Total Direct Labour Price Per Month</td>
                <td className={`${cellCls} font-semibold`}>{fmtOrBlank(totalPerMonth)}</td>
              </tr>
              <tr className="bg-muted/40">
                <td className={`${labelCls} font-bold w-[50%]`}>Total Direct Labour Price Per Annum</td>
                <td className={`${cellCls} font-bold`}>{fmtOrBlank(totalPerAnnum)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Other Services & Costs + Final Contract Total */}
      {(() => {
        const oscRows: { key: string; label: string }[] = [
          { key: 'publicHolidays', label: 'Public Holidays' },
          { key: 'bathroomConsumables', label: 'Bathroom Consumables' },
          { key: 'sanitaryServices', label: 'Sanitary Services' },
          { key: 'periodicalServices', label: 'Periodical Services' },
          { key: 'rental', label: 'Rental' },
          { key: 'peakTrading', label: 'Peak Trading' },
          { key: 'christmasExtended', label: 'Christmas Extended Trade' },
        ];
        const oscTotal = oscRows.reduce((s, r) => s + (oscBreakdown[r.key] || 0), 0);
        const finalAnnual = contractTotalAnnual + oscTotal;
        return (
          <section className="mt-6 space-y-4">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-[hsl(210,70%,50%)] mb-2">
                Other Services & Costs
              </h2>
              <div className="border border-border/40 rounded-md overflow-hidden bg-card">
                <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
                  <tbody>
                    {oscRows.map((r, idx) => (
                      <tr key={r.key} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/10'}>
                        <td className="py-2.5 px-4 text-xs align-middle pl-8 w-[60%]">{r.label}</td>
                        <td className="py-2.5 px-5 text-xs text-right font-mono tabular-nums align-middle">
                          {fmtOrBlank(oscBreakdown[r.key] || 0)}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t border-border/30 bg-muted/15 font-semibold">
                      <td className="py-3 px-4 text-xs align-middle pl-8">Other Services & Costs (Total)</td>
                      <td className="py-3 px-5 text-xs text-right font-mono tabular-nums align-middle">
                        {fmtOrBlank(oscTotal)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="border border-border/40 rounded-md overflow-hidden bg-card">
              <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
                <tbody>
                  <tr className="bg-[hsl(120,40%,94%)] font-bold text-sm">
                    <td className="py-3.5 px-4 align-middle w-[60%]">
                      TOTAL CONTRACT PRICE (ANNUAL)
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        (Direct Service + Other Services & Costs)
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-right font-mono tabular-nums align-middle">
                      {fmtOrBlank(finalAnnual)}
                    </td>
                  </tr>
                </tbody>
              </table>
              <div className="flex gap-6 text-xs justify-end pr-5 py-2 bg-muted/10 border-t border-border/30">
                <div>
                  <span className="text-muted-foreground">Per Week: </span>
                  <span className="font-mono font-medium tabular-nums">{fmtOrBlank(finalAnnual / 52.14)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Per Month: </span>
                  <span className="font-mono font-medium tabular-nums">{fmtOrBlank(finalAnnual / 12)}</span>
                </div>
              </div>
            </div>
          </section>
        );
      })()}
      </div>{/* end captureRef */}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Service block (read-only)
// ═══════════════════════════════════════════════════════════════

function ServiceBlock({ heading, rows, ROW_DEFS, fmt, fmtHrs }: any) {
  const activeRows = ROW_DEFS.filter((rd: any) => {
    const row = rows[rd.key];
    return row && (row.operatorCount > 0 || row.annualHours > 0 || row.annualLabour > 0 || row.annualAllowances > 0);
  });

  if (activeRows.length === 0) return null;

  return (
    <>
      <tr className="bg-muted/20 border-t border-border">
        <td className={`${labelCls} font-semibold text-foreground`} colSpan={5}>{heading}</td>
      </tr>
      {activeRows.map((rd: any, idx: number) => {
        const row = rows[rd.key];
        const total = row.annualLabour + row.annualAllowances;
        const label = `${rd.label} ${row.operatorCount > 0 ? `(x${row.operatorCount})` : `(same staff)`}`;
        return (
          <tr key={rd.key} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/10'}>
            <td className={`${labelCls} pl-6`}>{label}</td>
            <td className={cellCls}>{fmtHrs(row.annualHours)}</td>
            <td className={cellCls}>{fmt(row.annualLabour)}</td>
            <td className={cellCls}>{fmt(row.annualAllowances)}</td>
            <td className={cellCls}>{fmt(total)}</td>
          </tr>
        );
      })}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// Administration & Profit section (read-only output)
// ═══════════════════════════════════════════════════════════════

function AdminProfitSection({
  adminCalc, adminTotalValue, adminTotalPct,
  adminError, fmt, fmtPct, hasLabourData,
}: any) {
  const fmtOrBlank = (val: number) => hasLabourData ? fmt(val) : '';

  return (
    <section>
      <div className="border border-border rounded-md overflow-hidden">
        <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
          <thead>
            <tr className="bg-muted/40 border-b border-border">
              <th className={`${headCls} text-left w-[50%]`}>Administration & Profit</th>
              <th className={`${headCls}`}>Rate %</th>
              <th className={`${headCls}`}>Annual Value</th>
            </tr>
          </thead>
          <tbody>
            {adminCalc.map((item: any, idx: number) => (
              <tr key={item.id} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/10'}>
                <td className={labelCls}>{item.label}</td>
                <td className={cellCls}>{fmtPct(item.pct)}</td>
                <td className={cellCls}>{adminError ? '–' : fmtOrBlank(item.value)}</td>
              </tr>
            ))}
            <tr className="border-t border-border bg-muted/40 font-semibold">
              <td className={`${labelCls} font-semibold`}>Total Administration & Profit</td>
              <td className={cellCls}>{fmtPct(adminTotalPct)}</td>
              <td className={cellCls}>{adminError ? '–' : fmtOrBlank(adminTotalValue)}</td>
            </tr>
          </tbody>
        </table>
        {adminError && (
          <div className="px-3 py-2 bg-destructive/10 text-destructive text-xs font-medium border-t border-destructive/20">
            Total Admin & Profit rate must be less than 100%. Contract total cannot be calculated.
          </div>
        )}
      </div>
    </section>
  );
}
