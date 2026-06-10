import type { RepairRow } from '@/hooks/useSundryTables';
import { cellCls, labelCls, headCls, actionCls, COL_7, fmt, CurrencyCell, NumInput, TextInput, AddRowButton, DeleteButton, TotalFooter } from './SundryTableShared';

interface Props {
  rows: RepairRow[];
  totals: { weekly: number; monthly: number; annual: number };
  onUpdate: (id: string, patch: Partial<RepairRow>) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
}

export default function RepairsTable({ rows, totals, onUpdate, onAdd, onDelete }: Props) {
  return (
    <div className="border border-border rounded-md overflow-hidden">
      <div className="bg-[hsl(187,65%,55%)] text-white px-3 py-2 font-bold text-sm text-center uppercase tracking-wide">
        Equipment Repairs and Maintenance
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: COL_7.label }} />
            <col style={{ width: COL_7.desc }} />
            <col style={{ width: COL_7.qty }} />
            <col style={{ width: COL_7.freq }} />
            <col style={{ width: COL_7.cost }} />
            <col style={{ width: COL_7.total }} />
            <col style={{ width: COL_7.action }} />
          </colgroup>
          <thead>
            <tr className="bg-muted/40 border-b border-border">
              <th className={`${headCls} text-left`}>Equipment</th>
              <th className={`${headCls} text-left`}>Comments</th>
              <th className={headCls}>Quantity</th>
              <th className={headCls}>Frequency p.a.</th>
              <th className={headCls}>Cost</th>
              <th className={headCls}>Total</th>
              <th className={headCls}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const total = r.quantity * r.frequencyPA * r.cost;
              return (
                <tr key={r.id} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/10'}>
                  <td className={labelCls}><TextInput value={r.equipment} onChange={v => onUpdate(r.id, { equipment: v })} className="w-full" /></td>
                  <td className={labelCls}><TextInput value={r.comments} onChange={v => onUpdate(r.id, { comments: v })} className="w-full" /></td>
                  <td className={cellCls}><NumInput value={r.quantity} onChange={v => onUpdate(r.id, { quantity: v })} integer className="w-full" /></td>
                  <td className={cellCls}><NumInput value={r.frequencyPA} onChange={v => onUpdate(r.id, { frequencyPA: v })} integer className="w-full" /></td>
                  <td className={cellCls}><CurrencyCell value={r.cost} onChange={v => onUpdate(r.id, { cost: v })} className="w-full" /></td>
                  <td className={`${cellCls} font-medium`}>{fmt(total)}</td>
                  <td className={actionCls}><DeleteButton onClick={() => onDelete(r.id)} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <AddRowButton onClick={onAdd} />
      <TotalFooter label="All Equipment maintenance cost" weekly={totals.weekly} monthly={totals.monthly} annual={totals.annual} />
    </div>
  );
}
