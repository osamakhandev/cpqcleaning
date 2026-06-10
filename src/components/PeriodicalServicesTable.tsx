import { useState, useCallback, useMemo, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import FormattedCellInput from '@/components/ui/formatted-cell-input';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';

const fmt = (n: number) =>
  n === 0 ? '' : new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 }).format(n);
const fmtTotal = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 }).format(n);
const fmtPct = (n: number) => `${n.toFixed(2)}%`;

interface Row {
  id: string;
  service: string;
  details: string;
  costPerService: number | null;
  noOfServices: number | null;
  profitPct: number;
}

const DEFAULT_ROWS: Omit<Row, 'id'>[] = [
  { service: 'Internal Window Clean', details: '', costPerService: 600, noOfServices: null, profitPct: 10 },
  { service: 'External Window Clean', details: '', costPerService: 400, noOfServices: null, profitPct: 10 },
  { service: 'Carpet Shampoo', details: '', costPerService: 1100, noOfServices: null, profitPct: 10 },
  { service: 'Strip and Reseal', details: '', costPerService: null, noOfServices: null, profitPct: 10 },
  { service: 'Pressure Wash', details: '', costPerService: null, noOfServices: null, profitPct: 10 },
  { service: 'Pest Control', details: '', costPerService: null, noOfServices: null, profitPct: 10 },
  { service: 'Waste Management', details: '', costPerService: null, noOfServices: null, profitPct: 10 },
  { service: 'Slip Testing', details: '', costPerService: 1500, noOfServices: null, profitPct: 10 },
  { service: 'First Aid Course', details: '', costPerService: null, noOfServices: null, profitPct: 10 },
  { service: 'Other', details: '', costPerService: null, noOfServices: null, profitPct: 10 },
  { service: 'Other', details: '', costPerService: null, noOfServices: null, profitPct: 10 },
  { service: 'Other', details: '', costPerService: null, noOfServices: null, profitPct: 10 },
  { service: 'Other', details: '', costPerService: null, noOfServices: null, profitPct: 10 },
  { service: 'Other', details: '', costPerService: null, noOfServices: null, profitPct: 10 },
];

let _id = 0;
const mkId = () => `ps-${++_id}`;

const STORAGE_KEY = 'cpq_periodical_rows';

function loadRows(): Row[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Row[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Filter out legacy rows that were moved to separate sections
        const removed = ['Sanitary Services', 'Peak Trading', 'Christmas Extended Trade', 'Rent', 'Leap Year'];
        const filtered = parsed.filter(r => !removed.includes(r.service));
        if (filtered.length > 0) return filtered;
      }
    }
  } catch { /* ignore */ }
  return DEFAULT_ROWS.map(r => ({ ...r, id: mkId() }));
}

interface Props {
  sanitaryTotal: number;
  peakTradingTotal: number;
  christmasTotal: number;
  rentalTotal: number;
  onTotalChange?: (total: number) => void;
  onOwnTotalChange?: (total: number) => void;
  onMarkupChange?: (markup: number) => void;
}

export default function PeriodicalServicesTable({ sanitaryTotal, peakTradingTotal, christmasTotal, rentalTotal, onTotalChange, onOwnTotalChange, onMarkupChange }: Props) {
  const [rows, setRows] = useState<Row[]>(loadRows);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  }, [rows]);

  const update = useCallback((id: string, patch: Partial<Row>) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  }, []);

  const addRow = useCallback(() => {
    setRows(prev => [...prev, { id: mkId(), service: 'Other', details: '', costPerService: null, noOfServices: null, profitPct: 10 }]);
  }, []);

  const removeRow = useCallback((id: string) => {
    setRows(prev => prev.filter(r => r.id !== id));
  }, []);

  const computed = useMemo(() => {
    let sumCost = 0, sumMarkup = 0, sumPrice = 0;
    const mapped = rows.map(row => {
      let totalCostPA: number | null = null;

      if (row.costPerService != null && row.noOfServices != null && row.costPerService > 0 && row.noOfServices > 0) {
        totalCostPA = row.costPerService * row.noOfServices;
      }

      const hasVal = totalCostPA != null && totalCostPA > 0;
      const markup = hasVal ? totalCostPA! * (row.profitPct / 100) : null;
      const totalPrice = hasVal && markup != null ? totalCostPA! + markup : null;

      if (hasVal) {
        sumCost += totalCostPA!;
        sumMarkup += markup!;
        sumPrice += totalPrice!;
      }

      return { ...row, totalCostPA, markup, totalPrice };
    });

    // Add external section totals to the grand total
    const externalTotal = sanitaryTotal + peakTradingTotal + christmasTotal + rentalTotal;
    const grandCost = sumCost + externalTotal;
    const grandPrice = sumPrice + externalTotal; // External totals pass through at cost (markup applied in their own sections or not)

    return { mapped, sumCost, sumMarkup, sumPrice, grandCost, grandPrice, externalTotal };
  }, [rows, sanitaryTotal, peakTradingTotal, christmasTotal, rentalTotal]);

  // Compute weighted average markup for periodical rows only
  const periodicalMarkupPct = useMemo(() => {
    if (computed.sumCost === 0) return 0;
    return (computed.sumMarkup / computed.sumCost) * 100;
  }, [computed.sumCost, computed.sumMarkup]);

  // Sync total price to localStorage for Executive Summary
  useEffect(() => {
    localStorage.setItem('cpq_periodical_total', String(computed.grandPrice));
    window.dispatchEvent(new Event('storage'));
    onTotalChange?.(computed.grandPrice);
  }, [computed.grandPrice, onTotalChange]);

  useEffect(() => {
    onOwnTotalChange?.(computed.sumPrice);
  }, [computed.sumPrice, onOwnTotalChange]);

  useEffect(() => {
    onMarkupChange?.(periodicalMarkupPct);
  }, [periodicalMarkupPct, onMarkupChange]);

  const cols = "grid grid-cols-[160px_130px_100px_80px_100px_70px_100px_100px_30px]";

  return (
    <div>
      {/* Title */}
      <div className="bg-[hsl(187,70%,42%)] text-white px-4 py-2 rounded-t-md font-bold text-sm text-center">
        Periodical Services
      </div>

      {/* Header */}
      <div className={`${cols} bg-[hsl(50,90%,65%)] border-x border-b border-border text-xs font-bold`}>
        <div className="px-2 py-1.5 border-r border-border/30">Periodical Services</div>
        <div className="px-2 py-1.5 border-r border-border/30">Details</div>
        <div className="px-2 py-1.5 border-r border-border/30 text-right">Cost per Service</div>
        <div className="px-2 py-1.5 border-r border-border/30 text-right text-[10px] leading-tight">No. of Services P.A</div>
        <div className="px-2 py-1.5 border-r border-border/30 text-right">Total Cost P.A</div>
        <div className="px-2 py-1.5 border-r border-border/30 text-right">Profit</div>
        <div className="px-2 py-1.5 border-r border-border/30 text-right">Total Mark up Cost</div>
        <div className="px-2 py-1.5 text-right">Total Price P.A</div>
        <div />
      </div>

      {/* Rows */}
      {computed.mapped.map((row, i) => (
        <div key={row.id} className={`${cols} border-x border-b border-border/30 text-xs ${i % 2 === 0 ? '' : 'bg-muted/5'}`}>
          <div className="px-1 py-0.5 border-r border-border/30 bg-[hsl(50,85%,95%)]">
            <Input value={row.service} onChange={e => update(row.id, { service: e.target.value })}
              className="h-7 text-xs border-0 bg-transparent shadow-none px-1" />
          </div>
          <div className="px-1 py-0.5 border-r border-border/30 bg-[hsl(50,85%,95%)]">
            <Input value={row.details} onChange={e => update(row.id, { details: e.target.value })}
              className="h-7 text-xs border-0 bg-transparent shadow-none px-1" />
          </div>
          <div className="px-1 py-0.5 border-r border-border/30 bg-[hsl(50,85%,95%)]">
            <FormattedCellInput
              value={row.costPerService}
              onChange={v => update(row.id, { costPerService: v })}
              decimals={2}
              allowNull
              min={0}
              className="h-7 text-xs text-right font-mono border-0 bg-transparent shadow-none px-1" />
          </div>
          <div className="px-1 py-0.5 border-r border-border/30 bg-[hsl(50,85%,95%)]">
            <FormattedCellInput
              value={row.noOfServices}
              onChange={v => update(row.id, { noOfServices: v })}
              decimals={0}
              allowNull
              min={0}
              className="h-7 text-xs text-right font-mono border-0 bg-transparent shadow-none px-1" />
          </div>
          <div className="px-2 py-1.5 border-r border-border/30 text-right font-mono bg-[hsl(210,20%,95%)]">
            {row.totalCostPA != null && row.totalCostPA > 0 ? fmt(row.totalCostPA) : ''}
          </div>
          <div className="px-1 py-0.5 border-r border-border/30 bg-[hsl(50,85%,95%)]">
            <Input type="number" min="0" max="100" step="0.01"
              value={row.profitPct}
              onChange={e => update(row.id, { profitPct: parseFloat(e.target.value) || 0 })}
              className="h-7 text-xs text-right font-mono border-0 bg-transparent shadow-none px-1" />
          </div>
          <div className="px-2 py-1.5 border-r border-border/30 text-right font-mono bg-[hsl(210,20%,95%)]">
            {row.markup != null ? fmt(row.markup) : ''}
          </div>
          <div className="px-2 py-1.5 text-right font-mono bg-[hsl(210,20%,95%)]">
            {row.totalPrice != null ? fmt(row.totalPrice) : ''}
          </div>
          <div className="flex items-center justify-center">
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
              onClick={() => removeRow(row.id)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      ))}

      {/* Add row */}
      <div className="border-x border-b border-border px-2 py-1 flex justify-end bg-muted/10">
        <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 text-muted-foreground" onClick={addRow}>
          <Plus className="h-3 w-3" />Add row
        </Button>
      </div>

      {/* Subtotal for table rows */}
      <div className={`${cols} bg-[hsl(50,90%,65%)] text-xs font-bold border-x border-b border-border`}>
        <div className="px-2 py-1.5 col-span-4 border-r border-border/30 font-bold">Total Periodical Services</div>
        <div className="px-2 py-1.5 text-right font-mono border-r border-border/30">{fmtTotal(computed.sumCost)}</div>
        <div className="px-2 py-1.5 border-r border-border/30" />
        <div className="px-2 py-1.5 text-right font-mono border-r border-border/30">{fmtTotal(computed.sumMarkup)}</div>
        <div className="px-2 py-1.5 text-right font-mono">{fmtTotal(computed.sumPrice)}</div>
        <div />
      </div>

      {/* External section breakdown */}
      {(sanitaryTotal > 0 || peakTradingTotal > 0 || christmasTotal > 0 || rentalTotal > 0) && (
        <div className="border-x border-b border-border text-xs">
          {sanitaryTotal > 0 && (
            <div className="grid grid-cols-[370px_1fr] border-b border-border/30 bg-muted/5">
              <div className="px-2 py-1.5 text-muted-foreground">+ Sanitary Services</div>
              <div className="px-2 py-1.5 text-right font-mono">{fmtTotal(sanitaryTotal)}</div>
            </div>
          )}
          {peakTradingTotal > 0 && (
            <div className="grid grid-cols-[370px_1fr] border-b border-border/30 bg-muted/5">
              <div className="px-2 py-1.5 text-muted-foreground">+ Peak Trading</div>
              <div className="px-2 py-1.5 text-right font-mono">{fmtTotal(peakTradingTotal)}</div>
            </div>
          )}
          {christmasTotal > 0 && (
            <div className="grid grid-cols-[370px_1fr] border-b border-border/30 bg-muted/5">
              <div className="px-2 py-1.5 text-muted-foreground">+ Christmas Extended Trade</div>
              <div className="px-2 py-1.5 text-right font-mono">{fmtTotal(christmasTotal)}</div>
            </div>
          )}
          {rentalTotal > 0 && (
            <div className="grid grid-cols-[370px_1fr] border-b border-border/30 bg-muted/5">
              <div className="px-2 py-1.5 text-muted-foreground">+ Rental</div>
              <div className="px-2 py-1.5 text-right font-mono">{fmtTotal(rentalTotal)}</div>
            </div>
          )}
        </div>
      )}

      {/* Grand Total */}
      <div className={`${cols} bg-[hsl(187,70%,42%)] text-white text-xs font-bold rounded-b-md`}>
        <div className="px-2 py-2 col-span-4 border-r border-white/20 font-bold">Grand Total (incl. all sections)</div>
        <div className="px-2 py-2 text-right font-mono border-r border-white/20">{fmtTotal(computed.grandCost)}</div>
        <div className="px-2 py-2 border-r border-white/20" />
        <div className="px-2 py-2 text-right font-mono border-r border-white/20">{fmtTotal(computed.sumMarkup)}</div>
        <div className="px-2 py-2 text-right font-mono">{fmtTotal(computed.grandPrice)}</div>
        <div />
      </div>
    </div>
  );
}
