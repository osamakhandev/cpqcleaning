import { useState, useEffect, useMemo } from 'react';
import { Checkbox } from '@/components/ui/checkbox';

const STORAGE_KEY = 'cpq_osc_summary_included';

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 }).format(n);

const fmtPct = (n: number) => `${n.toFixed(2)}%`;

interface RowDef { key: string; label: string }

const ROWS: RowDef[] = [
  { key: 'publicHolidays', label: 'Public Holidays' },
  { key: 'bathroomConsumables', label: 'Bathroom Consumables' },
  { key: 'periodicalServices', label: 'Periodical Services' },
  { key: 'sanitaryServices', label: 'Sanitary Services' },
  { key: 'rental', label: 'Rental' },
  { key: 'peakTrading', label: 'Peak Trading' },
  { key: 'christmasExtended', label: 'Christmas Extended Trade' },
];

function loadIncluded(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  const defaults: Record<string, boolean> = {};
  ROWS.forEach(r => { defaults[r.key] = true; });
  return defaults;
}

interface RowValues { markup: number; total: number; baseCost?: number; profit?: number }

export interface OtherServicesCostsSummaryProps {
  values: {
    publicHolidays: RowValues;
    bathroomConsumables: RowValues;
    periodicalServices: RowValues;
    sanitaryServices: RowValues;
    rental: RowValues;
    peakTrading: RowValues;
    christmasExtended: RowValues;
  };
  onGrandTotalChange?: (total: number) => void;
}

function calcMarginValue(data: RowValues | undefined, key: string): number {
  if (!data) return 0;
  // Peak Trading & Christmas: use profit directly from source table
  if (data.profit !== undefined) return data.profit;
  if (key === 'publicHolidays') return data.total * (data.markup / 100);
  if (data.baseCost !== undefined) return data.total - data.baseCost;
  if (data.markup === 0) return 0;
  const base = data.total / (1 + data.markup / 100);
  return data.total - base;
}

const headCls = "px-2 py-1.5 text-[11px] font-semibold border border-border bg-muted/40 whitespace-nowrap";
const cellCls = "text-right px-2 py-1 font-mono text-xs border border-border";
const labelCellCls = "px-2 py-1 text-xs border border-border";

export default function OtherServicesCostsSummary({ values, onGrandTotalChange }: OtherServicesCostsSummaryProps) {
  const [included, setIncluded] = useState<Record<string, boolean>>(loadIncluded);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(included));
  }, [included]);

  const toggle = (key: string) => {
    setIncluded(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const { grandTotal, marginTotal } = useMemo(() => {
    let sum = 0;
    let mSum = 0;
    ROWS.forEach(r => {
      if (included[r.key]) {
        const d = values[r.key as keyof typeof values];
        sum += d?.total ?? 0;
        mSum += calcMarginValue(d, r.key);
      }
    });
    return { grandTotal: sum, marginTotal: mSum };
  }, [included, values]);

  useEffect(() => {
    onGrandTotalChange?.(grandTotal);
  }, [grandTotal, onGrandTotalChange]);

  // Persist margin total and per-row data so Executive Summary can read directly
  useEffect(() => {
    localStorage.setItem('cpq_osc_margin_total', JSON.stringify(marginTotal));

    // Persist each row's total and profit for Executive Summary to consume
    const rowData: Record<string, { total: number; profit: number }> = {};
    ROWS.forEach(r => {
      const d = values[r.key as keyof typeof values];
      const isIncl = included[r.key] ?? true;
      rowData[r.key] = {
        total: isIncl ? (d?.total ?? 0) : 0,
        profit: isIncl ? calcMarginValue(d, r.key) : 0,
      };
    });
    localStorage.setItem('cpq_osc_summary_rows', JSON.stringify(rowData));
  }, [marginTotal, included, values]);

  return (
    <div className="border border-border rounded-md overflow-hidden">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-muted/40">
            <th className={`${headCls} text-center w-14`}>Include in Contract?</th>
            <th className={`${headCls} text-left`}>Item</th>
            <th className={`${headCls} text-right`}>Margin %</th>
            <th className={`${headCls} text-right`}>Margin Value</th>
            <th className={`${headCls} text-right`}>Total Value</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row, idx) => {
            const data = values[row.key as keyof typeof values];
            const isIncluded = included[row.key] ?? true;
            const mv = calcMarginValue(data, row.key);
            const marginLabel = (row.key === 'publicHolidays' || row.key === 'peakTrading' || row.key === 'christmasExtended') ? 'Profit' : 'Markup';
            return (
              <tr
                key={row.key}
                className={`${idx % 2 === 0 ? 'bg-background' : 'bg-muted/10'} transition-opacity ${!isIncluded ? 'opacity-35' : ''}`}
              >
                <td className={`${cellCls} text-center`}><div className="flex items-center justify-center h-full">
                  <Checkbox
                    checked={isIncluded}
                    onCheckedChange={() => toggle(row.key)}
                    className="h-3.5 w-3.5 rounded-sm border-muted-foreground/30 data-[state=checked]:bg-primary/70 data-[state=checked]:border-primary/70"
                  />
                </div></td>
                <td className={labelCellCls}>
                  {row.label}
                </td>
                <td className={cellCls}>
                  <span className="text-[10px] text-muted-foreground/60 font-sans mr-1">{marginLabel}</span>
                  {fmtPct(data?.markup ?? 0)}
                </td>
                <td className={cellCls}>
                  {fmtCurrency(mv)}
                </td>
                <td className={`${cellCls} font-medium`}>
                  {fmtCurrency(data?.total ?? 0)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-muted/40 font-semibold border-t border-border">
            <td className={labelCellCls} />
            <td className={`${labelCellCls} font-bold uppercase tracking-wide`}>
              Total Other Services &amp; Costs
            </td>
            <td className={cellCls} />
            <td className={`${cellCls} font-bold`}>
              {fmtCurrency(marginTotal)}
            </td>
            <td className={`${cellCls} font-bold`}>
              {fmtCurrency(grandTotal)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
