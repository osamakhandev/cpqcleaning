import type { UniformAllocationRow, UniformUnitCosts, UniformItemKey } from '@/hooks/useSundryTables';
import { UNIFORM_ITEMS, UNIFORM_LABELS } from '@/hooks/useSundryTables';
import { cellCls, labelCls, headCls, actionCls, fmt, CurrencyCell, NumInput, TextInput, AddRowButton, DeleteButton, TotalFooter } from './SundryTableShared';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/costingCalculations';

interface Props {
  rows: UniformAllocationRow[];
  unitCosts: UniformUnitCosts;
  margin: number;
  totals: { totalsPerItem: Record<UniformItemKey, number>; costPerItem: Record<UniformItemKey, number>; annual: number; weekly: number; monthly: number };
  onUpdateRow: (id: string, patch: Partial<UniformAllocationRow>) => void;
  onAddRow: () => void;
  onDeleteRow: (id: string) => void;
  onUpdateCost: (key: UniformItemKey, val: number) => void;
  onSetMargin: (val: number) => void;
}

export default function UniformTable({ rows, unitCosts, margin, totals, onUpdateRow, onAddRow, onDeleteRow, onUpdateCost, onSetMargin }: Props) {
  return (
    <div className="border border-border rounded-md overflow-hidden">
      <div className="bg-[hsl(187,65%,55%)] text-white px-3 py-2 font-bold text-sm text-center uppercase tracking-wide">
        Uniform cost calculation
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs" style={{ tableLayout: 'fixed' }}>
          <thead>
            <tr className="bg-muted/40 border-b border-border">
              <th className={`${headCls} text-left`}>Item allocation</th>
              <th className={headCls}>No. Employees</th>
              {UNIFORM_ITEMS.map(k => (
                <th key={k} className={headCls}>{UNIFORM_LABELS[k]}</th>
              ))}
              <th className={`${headCls} w-8`}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={r.id} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/10'}>
                <td className={labelCls}><TextInput value={r.itemAllocation} onChange={v => onUpdateRow(r.id, { itemAllocation: v })} className="w-full" /></td>
                <td className={cellCls}><NumInput value={r.noEmployees} onChange={v => onUpdateRow(r.id, { noEmployees: v })} integer className="w-full" /></td>
                {UNIFORM_ITEMS.map(k => (
                  <td key={k} className={cellCls}><NumInput value={r[k]} onChange={v => onUpdateRow(r.id, { [k]: v })} integer className="w-full" /></td>
                ))}
                <td className={actionCls}><DeleteButton onClick={() => onDeleteRow(r.id)} /></td>
              </tr>
            ))}

            {/* Quantity totals row */}
            <tr className="border-t border-border bg-muted/30 font-semibold">
              <td className={`${labelCls} font-bold`} colSpan={2}>Quantity</td>
              {UNIFORM_ITEMS.map(k => (
                <td key={k} className={`${cellCls} font-semibold`}>{totals.totalsPerItem[k] || 0}</td>
              ))}
              <td></td>
            </tr>

            {/* Spacer */}
            <tr><td colSpan={UNIFORM_ITEMS.length + 3} className="h-2"></td></tr>

            {/* Unit cost row */}
            <tr className="bg-muted/10">
              <td className={`${labelCls} font-semibold`} colSpan={2}>Unit cost</td>
              {UNIFORM_ITEMS.map(k => (
                <td key={k} className={cellCls}><CurrencyCell value={unitCosts[k]} onChange={v => onUpdateCost(k, v)} className="w-full" /></td>
              ))}
              <td></td>
            </tr>

            {/* Total cost (incl margin) row */}
            <tr className="bg-muted/20 border-t border-border">
              <td className={`${labelCls} font-semibold`}>Total Cost<br /><span className="text-muted-foreground font-normal">(including margin)</span></td>
              <td className={cellCls}>
                <Input
                  type="text"
                  className="h-7 text-xs text-right font-mono bg-[hsl(48,80%,90%)] border-[hsl(48,50%,70%)] w-full"
                  defaultValue={margin.toFixed(2) + '%'}
                  onFocus={e => { e.target.value = margin.toFixed(2); e.target.select(); }}
                  onBlur={e => {
                    const raw = e.target.value.replace(/%/g, '').trim();
                    const num = parseFloat(raw);
                    onSetMargin(isNaN(num) ? 0 : num);
                    e.target.value = (isNaN(num) ? 0 : num).toFixed(2) + '%';
                  }}
                  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                />
              </td>
              {UNIFORM_ITEMS.map(k => (
                <td key={k} className={`${cellCls} font-semibold`}>{fmt(totals.costPerItem[k])}</td>
              ))}
              <td className={`${cellCls} font-bold`}>{fmt(totals.annual)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <AddRowButton onClick={onAddRow} />
      <TotalFooter label="Uniform cost" weekly={totals.weekly} monthly={totals.monthly} annual={totals.annual} />
    </div>
  );
}
