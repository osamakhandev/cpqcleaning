import { useState, useCallback, useMemo, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import FormattedCellInput from '@/components/ui/formatted-cell-input';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';

const fmt = (n: number) =>
  n === 0 ? '' : new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 }).format(n);
const fmtTotal = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 }).format(n);

interface Row {
  id: string;
  description: string;
  costPerUnit: number | null;
  frequency: number | null;
  quantity: number | null;
}

const DEFAULT_DESCRIPTIONS = [
  'Signature Manual Sanitary Unit',
  'Signature Autolid (No Touch) Sanitary Unit',
  'Signature Aerosol Air Fresheners',
  'Signature Nappy Service (1 x 26)',
  'Signature Antibac Hand Sanitiser',
  'Baby Change Tables',
  'Signature Toilet Seat Anti-Bacterial',
  'Signature Foam Soap Dispenser',
  'Jet Hand Dryer',
  'Clinical Waste',
  'Sharps Disposal Unit (1.4 litre)',
  'Signature WC & Urinal Dual Sanitiser',
  'Signature WC & Urinal Dual Sanitiser',
  'Urinal Sanitiser Mats',
  'Hygiene Treatment Urinal & WC',
];

let _id = 0;
const mkId = () => `san-${++_id}`;

const STORAGE_KEY = 'cpq_sanitary_rows';
const MARKUP_KEY = 'cpq_sanitary_markup';

function loadRows(): Row[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return DEFAULT_DESCRIPTIONS.map(d => ({ id: mkId(), description: d, costPerUnit: null, frequency: null, quantity: null }));
}

function loadMarkup(): number {
  try {
    const raw = localStorage.getItem(MARKUP_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return 15;
}

interface Props {
  onTotalChange: (total: number) => void;
  onMarkupChange?: (markup: number) => void;
}

export default function SanitaryServicesTable({ onTotalChange, onMarkupChange }: Props) {
  const [rows, setRows] = useState<Row[]>(loadRows);
  const [markupPct, setMarkupPct] = useState<number>(loadMarkup);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  }, [rows]);

  useEffect(() => {
    localStorage.setItem(MARKUP_KEY, JSON.stringify(markupPct));
  }, [markupPct]);

  const markupRate = markupPct / 100;

  const update = useCallback((id: string, patch: Partial<Row>) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  }, []);

  const addRow = useCallback(() => {
    setRows(prev => [...prev, { id: mkId(), description: '', costPerUnit: null, frequency: null, quantity: null }]);
  }, []);

  const removeRow = useCallback((id: string) => {
    setRows(prev => prev.filter(r => r.id !== id));
  }, []);

  const totals = useMemo(() => {
    let totalCost = 0;
    let totalMarkup = 0;
    for (const r of rows) {
      if (r.costPerUnit != null && r.frequency != null && r.quantity != null && r.costPerUnit > 0) {
        const cost = r.costPerUnit * r.frequency * r.quantity;
        totalCost += cost;
        totalMarkup += cost * markupRate;
      }
    }
    return { totalCost, totalMarkup, totalPrice: totalCost + totalMarkup };
  }, [rows, markupRate]);

  useEffect(() => { onTotalChange(totals.totalPrice); }, [totals.totalPrice, onTotalChange]);
  useEffect(() => { onMarkupChange?.(markupPct); }, [markupPct, onMarkupChange]);

  const cols = "grid grid-cols-[200px_1fr_90px_80px_80px_100px_80px_100px_100px_30px]";

  return (
    <div>
      {/* Title */}
      <div className="bg-[hsl(187,70%,42%)] text-white px-4 py-2 rounded-t-md font-bold text-sm text-center">
        Sanitary Services
      </div>

      {/* Markup row */}
      <div className="flex items-center gap-3 px-4 py-1.5 bg-[hsl(50,90%,88%)] border-x border-b border-border">
        <span className="text-xs font-semibold">Markup</span>
        <div className="flex items-center gap-1">
          <Input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={markupPct}
            onChange={e => setMarkupPct(parseFloat(e.target.value) || 0)}
            className="h-7 w-20 text-xs text-right font-mono bg-[hsl(50,85%,95%)]"
          />
          <span className="text-xs">%</span>
        </div>
      </div>

      {/* Note */}
      <div className="border-x border-b border-border bg-muted/10 px-4 py-2 text-xs text-muted-foreground italic">
        The total value is included in <span className="font-semibold not-italic">Other Services &amp; Costs</span> and contributes to overall pricing.
      </div>

      {/* Header */}
      <div className={`${cols} bg-[hsl(50,90%,65%)] border-x border-b border-border text-xs font-bold`}>
        <div className="px-2 py-1.5 border-r border-border/30">Description</div>
        <div className="px-2 py-1.5 border-r border-border/30 text-right">Cost per unit</div>
        <div className="px-2 py-1.5 border-r border-border/30 text-right">Frequency</div>
        <div className="px-2 py-1.5 border-r border-border/30 text-right">Quantity</div>
        <div className="px-2 py-1.5 border-r border-border/30 text-right">Total Cost P.A</div>
        <div className="px-2 py-1.5 border-r border-border/30 text-right">Markup</div>
        <div className="px-2 py-1.5 border-r border-border/30 text-right">Total Markup Cost</div>
        <div className="px-2 py-1.5 text-right">Total Price P.A</div>
        <div />
        <div />
      </div>

      {/* Rows */}
      {rows.map((row, i) => {
        const hasVal = row.costPerUnit != null && row.frequency != null && row.quantity != null && row.costPerUnit > 0;
        const totalCost = hasVal ? row.costPerUnit! * row.frequency! * row.quantity! : 0;
        const markupCost = hasVal ? totalCost * markupRate : 0;
        const totalPrice = totalCost + markupCost;

        return (
          <div key={row.id} className={`${cols} border-x border-b border-border/30 text-xs ${i % 2 === 0 ? '' : 'bg-muted/5'}`}>
            <div className="px-1 py-0.5 border-r border-border/30 bg-[hsl(50,85%,95%)]">
              <Input value={row.description} onChange={e => update(row.id, { description: e.target.value })}
                className="h-7 text-xs border-0 bg-transparent shadow-none px-1" />
            </div>
            <div className="px-1 py-0.5 border-r border-border/30 bg-[hsl(50,85%,95%)]">
              <FormattedCellInput value={row.costPerUnit} decimals={2} allowNull min={0}
                onChange={v => update(row.id, { costPerUnit: v })}
                className="h-7 text-xs text-right font-mono border-0 bg-transparent shadow-none px-1" />
            </div>
            <div className="px-1 py-0.5 border-r border-border/30 bg-[hsl(50,85%,95%)]">
              <FormattedCellInput value={row.frequency} decimals={0} allowNull min={0}
                onChange={v => update(row.id, { frequency: v })}
                className="h-7 text-xs text-right font-mono border-0 bg-transparent shadow-none px-1" />
            </div>
            <div className="px-1 py-0.5 border-r border-border/30 bg-[hsl(50,85%,95%)]">
              <FormattedCellInput value={row.quantity} decimals={0} allowNull min={0}
                onChange={v => update(row.id, { quantity: v })}
                className="h-7 text-xs text-right font-mono border-0 bg-transparent shadow-none px-1" />
            </div>
            {/* Total Cost P.A */}
            <div className="px-2 py-1.5 border-r border-border/30 text-right font-mono bg-[hsl(210,20%,95%)]">
              {hasVal && totalCost > 0 ? fmt(totalCost) : ''}
            </div>
            {/* Markup % */}
            <div className="px-2 py-1.5 border-r border-border/30 text-right font-mono bg-[hsl(210,20%,95%)]">
              {hasVal && totalCost > 0 ? `${markupPct.toFixed(2)}%` : ''}
            </div>
            {/* Total Markup Cost */}
            <div className="px-2 py-1.5 border-r border-border/30 text-right font-mono bg-[hsl(210,20%,95%)]">
              {hasVal && markupCost > 0 ? fmt(markupCost) : ''}
            </div>
            {/* Total Price P.A */}
            <div className="px-2 py-1.5 text-right font-mono bg-[hsl(210,20%,95%)]">
              {hasVal && totalPrice > 0 ? fmt(totalPrice) : ''}
            </div>
            <div className="flex items-center justify-center">
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeRow(row.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        );
      })}

      {/* Add row */}
      <div className="border-x border-b border-border px-2 py-1 flex justify-end bg-muted/10">
        <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 text-muted-foreground" onClick={addRow}>
          <Plus className="h-3 w-3" />Add row
        </Button>
      </div>

      {/* Totals */}
      <div className={`${cols} bg-[hsl(187,70%,42%)] text-white text-xs font-bold rounded-b-md`}>
        <div className="px-2 py-2 col-span-4 text-right border-r border-white/20 font-bold">Total</div>
        <div className="px-2 py-2 text-right font-mono border-r border-white/20">{fmtTotal(totals.totalCost)}</div>
        <div className="px-2 py-2 border-r border-white/20" />
        <div className="px-2 py-2 text-right font-mono border-r border-white/20">{fmtTotal(totals.totalMarkup)}</div>
        <div className="px-2 py-2 text-right font-mono">{fmtTotal(totals.totalPrice)}</div>
        <div />
        <div />
      </div>
    </div>
  );
}
