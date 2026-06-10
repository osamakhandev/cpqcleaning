import type { ChemicalsRow } from '@/hooks/useSundryTables';
import { cellCls, labelCls, headCls, actionCls, COL_5, fmt, CurrencyCell, NumInput, TextInput, AddRowButton, DeleteButton } from './SundryTableShared';

interface Props {
  rows: ChemicalsRow[];
  totals: { weekly: number; monthly: number; annual: number };
  onUpdate: (id: string, patch: Partial<ChemicalsRow>) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
}

export default function ChemicalsTable({ rows, totals, onUpdate, onAdd, onDelete }: Props) {
  return (
    <div className="border border-border rounded-md overflow-hidden">
      <div className="bg-[hsl(187,65%,55%)] text-white px-3 py-2 font-bold text-sm text-center uppercase tracking-wide">
        Chemicals &amp; Supplies
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: COL_5.label }} />
            <col style={{ width: COL_5.cost }} />
            <col style={{ width: COL_5.units }} />
            <col style={{ width: COL_5.total }} />
            <col style={{ width: COL_5.action }} />
          </colgroup>
          <thead>
            <tr className="bg-muted/40 border-b border-border">
              <th className={`${headCls} text-left`}>Item</th>
              <th className={headCls}>Cost per unit per week</th>
              <th className={headCls}>No. of Units</th>
              <th className={headCls}>Cost per year</th>
              <th className={headCls}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const weekly = r.costPerUnitPerWeek * r.units;
              return (
                <tr key={r.id} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/10'}>
                  <td className={labelCls}><TextInput value={r.item} onChange={v => onUpdate(r.id, { item: v })} className="w-full" /></td>
                  <td className={cellCls}><CurrencyCell value={r.costPerUnitPerWeek} onChange={v => onUpdate(r.id, { costPerUnitPerWeek: v })} className="w-full" /></td>
                  <td className={cellCls}><NumInput value={r.units} onChange={v => onUpdate(r.id, { units: v })} integer className="w-full" /></td>
                  <td className={`${cellCls} font-medium`}>{fmt(weekly * 52.14)}</td>
                  <td className={actionCls}><DeleteButton onClick={() => onDelete(r.id)} /></td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-border bg-[hsl(48,80%,85%)] font-semibold">
              <td className={`${labelCls} font-bold`} colSpan={3}>Total chemicals &amp; supplies</td>
              <td className={`${cellCls} font-bold`}>{fmt(totals.annual)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
      <AddRowButton onClick={onAdd} />
    </div>
  );
}
