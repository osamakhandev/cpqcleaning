import { useState, useCallback, useMemo, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import FormattedCellInput from '@/components/ui/formatted-cell-input';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';
import { lookupRate, type RateBand } from '@/lib/rateData';
import {
  CHRISTMAS_EXTENDED_TRADE_STORAGE_KEY,
  clearLegacyChristmasExtendedTradeStorage,
  isLegacyChristmasExtendedTradeRows,
} from '@/lib/christmasExtendedTradeStorage';
import type { ServiceType, OperatorLevel } from '@/types/roster';
import type { OverheadRates } from '@/components/PeakTradingTable';

const fmt = (n: number) =>
  n === 0 ? '' : new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 }).format(n);
const fmtTotal = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 }).format(n);

function descriptionToRateBand(desc: string): RateBand | null {
  const d = desc.toLowerCase();
  if (d.includes('public holiday') || d.includes('ph')) return 'PH_FLAT';
  if (d.includes('sunday') || d.includes('sun')) return 'SUN_FLAT';
  if (d.includes('saturday') || d.includes('sat')) return 'SAT_FLAT';
  if (d.includes('monday') || d.includes('weekday') || d.includes('mon') || d.includes('fri')) {
    if (d.includes('pm') || d.includes('night') || d.includes('evening') || d.includes('aft')) return 'WKDAY_PENALTY';
    return 'WKDAY_DAY';
  }
  return null;
}

interface Row {
  id: string;
  description: string;
  casualRate: number | null;
  casualRateOverridden: boolean;
  noOfEmployees: number | null;
  hoursPerEmployee: number | null;
  adminProfitRate: number | null;
}

const DEFAULT_ROWS: Omit<Row, 'id'>[] = [
  { description: 'Monday - Friday (am)', casualRate: null, casualRateOverridden: false, noOfEmployees: 0, hoursPerEmployee: 0, adminProfitRate: null },
  { description: 'Monday - Friday (pm)', casualRate: null, casualRateOverridden: false, noOfEmployees: 0, hoursPerEmployee: 0, adminProfitRate: null },
  { description: 'Saturday (am-pm)', casualRate: null, casualRateOverridden: false, noOfEmployees: 0, hoursPerEmployee: 0, adminProfitRate: null },
  { description: 'Sunday (am-pm)', casualRate: null, casualRateOverridden: false, noOfEmployees: 0, hoursPerEmployee: 0, adminProfitRate: null },
  { description: 'Public Holiday (am-pm)', casualRate: null, casualRateOverridden: false, noOfEmployees: 0, hoursPerEmployee: 0, adminProfitRate: null },
];

let _id = 0;
const mkId = () => `xmas-${++_id}`;

function loadRows(): Row[] {
  clearLegacyChristmasExtendedTradeStorage();

  try {
    const raw = localStorage.getItem(CHRISTMAS_EXTENDED_TRADE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0 && !isLegacyChristmasExtendedTradeRows(parsed)) {
        return parsed.map((r: any) => ({
          id: r.id || mkId(),
          description: r.description ?? '',
          casualRate: r.casualRate ?? r.hourlyRate ?? null,
          casualRateOverridden: r.casualRateOverridden ?? (r.casualRate != null || r.hourlyRate != null),
          noOfEmployees: r.noOfEmployees ?? null,
          hoursPerEmployee: r.hoursPerEmployee ?? null,
          adminProfitRate: r.adminProfitRate ?? null,
        }));
      }

      localStorage.removeItem(CHRISTMAS_EXTENDED_TRADE_STORAGE_KEY);
    }
  } catch {
    localStorage.removeItem(CHRISTMAS_EXTENDED_TRADE_STORAGE_KEY);
  }

  return DEFAULT_ROWS.map(r => ({ ...r, id: mkId() }));
}

/**
 * Calculate per-hour overheads for casual staff.
 * Includes ONLY: Super, Workers Comp, Payroll Tax, PLI.
 * Excludes: Annual Leave, Leave Loading, Long Service Leave (not applicable to casuals).
 */
function calcOverheadsPerHour(casualRate: number, oh: OverheadRates): number {
  const superVal = casualRate * (oh.superRate / 100);
  const wcBase = casualRate + superVal;
  const wcVal = wcBase * (oh.workersComp / 100);
  const ptVal = wcBase * (oh.payrollTaxRate / 100);
  const pliBase = casualRate + superVal + wcVal + ptVal;
  const pliVal = pliBase * (oh.pli / 100);
  return superVal + wcVal + ptVal + pliVal;
}

interface Props {
  onTotalChange: (total: number) => void;
  onProfitChange?: (profit: number) => void;
  defaultAdminProfitRate?: number;
  jobService?: ServiceType;
  jobLevel?: OperatorLevel;
  overheadRates?: OverheadRates;
}

export default function ChristmasExtendedTradeTable({
  onTotalChange,
  onProfitChange,
  defaultAdminProfitRate = 0,
  jobService = 'cleaning',
  jobLevel = 'level-1',
  overheadRates = { superRate: 12, workersComp: 2.5, payrollTaxRate: 0, pli: 2 },
}: Props) {
  const [rows, setRows] = useState<Row[]>(loadRows);

  useEffect(() => {
    localStorage.setItem(CHRISTMAS_EXTENDED_TRADE_STORAGE_KEY, JSON.stringify(rows));
  }, [rows]);

  const resolvedRows = useMemo(() => {
    return rows.map(r => {
      if (r.casualRateOverridden && r.casualRate != null) return r;
      const band = descriptionToRateBand(r.description);
      if (!band) return r;
      const rate = lookupRate(jobService, 'casual', jobLevel, band);
      if (rate !== null) return { ...r, casualRate: rate };
      return r;
    });
  }, [rows, jobService, jobLevel]);

  const update = useCallback((id: string, patch: Partial<Row>) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  }, []);

  const handleCasualRateChange = useCallback((id: string, value: string) => {
    if (value === '') {
      update(id, { casualRate: null, casualRateOverridden: false });
    } else {
      const parsed = parseFloat(value);
      if (!isNaN(parsed)) {
        update(id, { casualRate: parsed, casualRateOverridden: true });
      }
    }
  }, [update]);

  const addRow = useCallback(() => {
    setRows(prev => [...prev, { id: mkId(), description: '', casualRate: null, casualRateOverridden: false, noOfEmployees: null, hoursPerEmployee: null, adminProfitRate: null }]);
  }, []);

  const removeRow = useCallback((id: string) => {
    setRows(prev => prev.filter(r => r.id !== id));
  }, []);

  const computeRow = (r: Row) => {
    const rate = r.casualRate ?? 0;
    const emps = r.noOfEmployees ?? 0;
    const hrs = r.hoursPerEmployee ?? 0;
    const oh = calcOverheadsPerHour(rate, overheadRates);
    const apRate = r.adminProfitRate ?? defaultAdminProfitRate;
    const loadedRate = rate + oh;
    const profit = loadedRate * (apRate / 100) * emps * hrs;
    const chargeOutRate = loadedRate * (1 + apRate / 100);
    const finalPrice = chargeOutRate * emps * hrs;
    return { oh, profit, chargeOutRate, finalPrice, apRate };
  };

  const { total, totalProfit } = useMemo(() => {
    let total = 0;
    let totalProfit = 0;
    resolvedRows.forEach(r => {
      const { finalPrice, profit } = computeRow(r);
      total += finalPrice;
      totalProfit += profit;
    });
    return { total, totalProfit };
  }, [resolvedRows, defaultAdminProfitRate, overheadRates]);

  useEffect(() => { onTotalChange(total); }, [total, onTotalChange]);
  useEffect(() => { onProfitChange?.(totalProfit); }, [totalProfit, onProfitChange]);

  // Column order: Description | Casual Rate | Overheads | Admin & Profit % | Profit | Charge Out Rate/h | No. of Employees | Hours Per Employee | Final Price | Delete
  const cols = "grid grid-cols-[180px_70px_70px_65px_70px_75px_60px_65px_80px_30px]";

  return (
    <div>
      <div className="bg-[hsl(187,70%,42%)] text-white px-4 py-2 rounded-t-md font-bold text-sm text-center">
        Christmas Extended Trade
      </div>

      <div className={`${cols} bg-[hsl(50,90%,65%)] border-x border-b border-border text-[10px] font-bold leading-tight`}>
        <div className="px-2 py-1.5 border-r border-border/30">Description</div>
        <div className="px-2 py-1.5 border-r border-border/30 text-right">Casual Rate</div>
        <div className="px-1 py-1.5 border-r border-border/30 text-right">Overheads<br/>(ex A&P)</div>
        <div className="px-1 py-1.5 border-r border-border/30 text-right">Admin &<br/>Profit %</div>
        <div className="px-2 py-1.5 border-r border-border/30 text-right">Profit</div>
        <div className="px-1 py-1.5 border-r border-border/30 text-right">Charge Out<br/>Rate/h</div>
        <div className="px-1 py-1.5 border-r border-border/30 text-right">No. of<br/>Employees</div>
        <div className="px-1 py-1.5 border-r border-border/30 text-right">Hours Per<br/>Employee</div>
        <div className="px-2 py-1.5 text-right">Final Price</div>
        <div />
      </div>

      {resolvedRows.map((row, i) => {
        const { oh, profit, chargeOutRate, finalPrice } = computeRow(row);
        const rate = row.casualRate ?? 0;
        const hasValues = rate > 0 && (row.noOfEmployees ?? 0) > 0 && (row.hoursPerEmployee ?? 0) > 0;

        return (
          <div key={row.id} className={`${cols} border-x border-b border-border/30 text-xs ${i % 2 === 0 ? '' : 'bg-muted/5'}`}>
            {/* Description */}
            <div className="px-1 py-0.5 border-r border-border/30 bg-[hsl(50,85%,95%)]">
              <Input value={row.description} onChange={e => {
                update(row.id, { description: e.target.value });
                if (!row.casualRateOverridden) {
                  update(row.id, { description: e.target.value, casualRate: null });
                }
              }}
                className="h-7 text-xs border-0 bg-transparent shadow-none px-1" />
            </div>
            {/* Casual Rate */}
            <div className="px-1 py-0.5 border-r border-border/30 bg-[hsl(50,85%,95%)]">
              <FormattedCellInput
                value={row.casualRate}
                decimals={2}
                allowNull
                min={0}
                placeholder="auto"
                onChange={v => handleCasualRateChange(row.id, v == null ? '' : String(v))}
                className={`h-7 text-xs text-right font-mono border-0 bg-transparent shadow-none px-1 ${!row.casualRateOverridden && row.casualRate != null ? 'text-muted-foreground' : ''}`}
              />
            </div>
            {/* Overheads (ex Admin & Profit) - calculated, read-only */}
            <div className="px-2 py-1.5 text-right font-mono border-r border-border/30 bg-[hsl(210,20%,95%)]">
              {rate > 0 ? oh.toFixed(2) : ''}
            </div>
            {/* Admin & Profit % */}
            <div className="px-1 py-0.5 border-r border-border/30 bg-[hsl(50,85%,95%)]">
              <Input type="number" min="0" step="0.01"
                value={row.adminProfitRate ?? ''}
                placeholder={defaultAdminProfitRate.toFixed(2)}
                onChange={e => update(row.id, { adminProfitRate: e.target.value === '' ? null : parseFloat(e.target.value) })}
                className="h-7 text-xs text-right font-mono border-0 bg-transparent shadow-none px-1" />
            </div>
            {/* Profit */}
            <div className="px-2 py-1.5 text-right font-mono border-r border-border/30 bg-[hsl(210,20%,95%)]">
              {hasValues && profit > 0 ? fmt(profit) : ''}
            </div>
            {/* Charge Out Rate/h */}
            <div className="px-2 py-1.5 text-right font-mono border-r border-border/30 bg-[hsl(210,20%,95%)]">
              {rate > 0 ? chargeOutRate.toFixed(2) : ''}
            </div>
            {/* No. of Employees */}
            <div className="px-1 py-0.5 border-r border-border/30 bg-[hsl(50,85%,95%)]">
              <FormattedCellInput value={row.noOfEmployees} decimals={0} allowNull min={0}
                onChange={v => update(row.id, { noOfEmployees: v })}
                className="h-7 text-xs text-right font-mono border-0 bg-transparent shadow-none px-1" />
            </div>
            {/* Hours Per Employee */}
            <div className="px-1 py-0.5 border-r border-border/30 bg-[hsl(50,85%,95%)]">
              <FormattedCellInput value={row.hoursPerEmployee} allowNull min={0}
                onChange={v => update(row.id, { hoursPerEmployee: v })}
                className="h-7 text-xs text-right font-mono border-0 bg-transparent shadow-none px-1" />
            </div>
            {/* Final Price */}
            <div className="px-2 py-1.5 text-right font-mono bg-[hsl(210,20%,95%)]">
              {hasValues && finalPrice > 0 ? fmt(finalPrice) : ''}
            </div>
            {/* Delete */}
            <div className="flex items-center justify-center">
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeRow(row.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        );
      })}

      <div className="border-x border-b border-border px-2 py-1 flex justify-end bg-muted/10">
        <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 text-muted-foreground" onClick={addRow}>
          <Plus className="h-3 w-3" />Add row
        </Button>
      </div>

      <div className={`${cols} bg-[hsl(187,70%,42%)] text-white text-xs font-bold rounded-b-md`}>
        <div className="px-2 py-2 col-span-4 text-right border-r border-white/20 font-bold">Total</div>
        <div className="px-2 py-2 text-right font-mono border-r border-white/20">{fmtTotal(totalProfit)}</div>
        <div className="px-2 py-2 col-span-3 border-r border-white/20" />
        <div className="px-2 py-2 text-right font-mono">{fmtTotal(total)}</div>
        <div />
      </div>
    </div>
  );
}
