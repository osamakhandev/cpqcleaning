import type { CommunicationRow } from '@/hooks/useSundryTables';
import { cellCls, labelCls, headCls, actionCls, fmt, CurrencyCell, NumInput, TextInput, AddRowButton, DeleteButton } from './SundryTableShared';

interface Props {
  rows: CommunicationRow[];
  totals: { weekly: number; monthly: number; annual: number };
  onUpdate: (id: string, patch: Partial<CommunicationRow>) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
}

export default function CommunicationTable({ rows, totals, onUpdate, onAdd, onDelete }: Props) {
  return (
    <div className="border border-border rounded-md overflow-hidden">
      <div className="bg-[hsl(187,65%,55%)] text-white px-3 py-2 font-bold text-sm text-center uppercase tracking-wide">
        Communication
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '28%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '22%' }} />
            <col style={{ width: '6%' }} />
          </colgroup>
          <thead>
            <tr className="bg-muted/40 border-b border-border">
              <th className={`${headCls} text-left`}>Communication Costs</th>
              <th className={headCls}>Unit Quantity</th>
              <th className={headCls}>Weekly Value</th>
              <th className={headCls}>Monthly Value</th>
              <th className={headCls}>Annual Value</th>
              <th className={headCls}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const weekly = r.unitQuantity * r.weeklyValuePerUnit;
              return (
                <tr key={r.id} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/10'}>
                  <td className={labelCls}><TextInput value={r.item} onChange={v => onUpdate(r.id, { item: v })} className="w-full" /></td>
                  <td className={cellCls}><NumInput value={r.unitQuantity} onChange={v => onUpdate(r.id, { unitQuantity: v })} integer className="w-full" /></td>
                  <td className={cellCls}><CurrencyCell value={r.weeklyValuePerUnit} onChange={v => onUpdate(r.id, { weeklyValuePerUnit: v })} className="w-full" /></td>
                  <td className={`${cellCls} font-medium`}>{fmt(weekly * 52.14 / 12)}</td>
                  <td className={`${cellCls} font-medium`}>{fmt(weekly * 52.14)}</td>
                  <td className={actionCls}><DeleteButton onClick={() => onDelete(r.id)} /></td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-border bg-[hsl(48,80%,85%)] font-semibold">
              <td className={`${labelCls} font-bold`} colSpan={2}>Total</td>
              <td className={`${cellCls} font-bold`}>{fmt(totals.weekly)}</td>
              <td className={`${cellCls} font-bold`}>{fmt(totals.monthly)}</td>
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
