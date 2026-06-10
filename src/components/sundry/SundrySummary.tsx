import { cellCls, labelCls, headCls, fmt } from './SundryTableShared';

interface SummaryLine {
  label: string;
  annual: number;
  rateSource?: string;
}

interface Props {
  lines: SummaryLine[];
  grandTotal: number;
}

const SOURCE_LABELS: Record<string, string> = {
  default: 'Calculated',
  custom: 'User defined',
  calculator: 'Calculated',
};

export default function SundrySummary({ lines, grandTotal }: Props) {
  return (
    <div className="border border-border rounded-md overflow-hidden">
      <div className="bg-[hsl(0,72%,51%)] text-white px-3 py-2 font-bold text-sm text-center uppercase tracking-wide">
        Calculated Sundry Expenses Summary
      </div>
      <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '40%' }} />
          <col style={{ width: '30%' }} />
          <col style={{ width: '30%' }} />
        </colgroup>
        <thead>
          <tr className="bg-muted/40 border-b border-border">
            <th className={`${headCls} text-left`}>Category</th>
            <th className={`${headCls} text-left`}>Rate Source</th>
            <th className={headCls}>Annual Value</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, idx) => (
            <tr key={l.label} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/10'}>
              <td className={labelCls}>{l.label}</td>
              <td className={`${labelCls} text-muted-foreground`}>
                {l.rateSource ? (SOURCE_LABELS[l.rateSource] ?? l.rateSource) : '–'}
              </td>
              <td className={`${cellCls} font-medium`}>{fmt(l.annual)}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-border bg-[hsl(48,80%,85%)] font-bold">
            <td className={`${labelCls} font-bold`}>Total Sundry Expenses</td>
            <td className={labelCls}></td>
            <td className={`${cellCls} font-bold`}>{fmt(grandTotal)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
