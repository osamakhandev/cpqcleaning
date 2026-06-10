import { useState, useMemo, useCallback, useEffect } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, AlertTriangle } from 'lucide-react';
import { getPublicHolidays, dateToDayLabel, dateToDayOfWeek } from '@/lib/publicHolidays';
import type { DayOfWeek } from '@/types/roster';
import type { AustralianState } from '@/hooks/usePricingData';

const PH_STATE_KEY = 'cpq-ph-state';

interface CustomHoliday {
  id: string;
  name: string;
  date: string;
  notes: string;
}

interface PHState {
  includedHolidays: Record<string, boolean>;
  customHolidays: CustomHoliday[];
}

const DEFAULT_PH_STATE: PHState = {
  includedHolidays: {},
  customHolidays: [],
};

function loadPHState(): PHState {
  try {
    const s = localStorage.getItem(PH_STATE_KEY);
    if (s) {
      const parsed = JSON.parse(s);
      return {
        includedHolidays: parsed.includedHolidays ?? {},
        customHolidays: parsed.customHolidays ?? [],
      };
    }
  } catch {}
  return DEFAULT_PH_STATE;
}

const STATE_LABELS: Record<AustralianState, string> = {
  ACT: 'ACT',
  NSW: 'NSW',
  VIC: 'VIC',
  QLD: 'QLD',
  SA: 'SA',
  WA: 'WA',
  TAS: 'TAS',
  NT: 'NT',
};

// Keep OpCalcData exported for backward compat
export interface OpCalcData {
  operator: { id: string; name?: string; number?: number; service: string; level: string; employmentType: string };
  calc: { days: { day: DayOfWeek; paidHours: number; coverageMin: number }[] };
}

interface Props {
  jobState: AustralianState;
  phIncluded: boolean | null;
  sundayRosterForPH: boolean | null;
  contractYear: number;
  contractStartDate?: string;
  phDowCostMap?: Partial<Record<DayOfWeek, number>>;
  phPriceFactorMap?: Partial<Record<DayOfWeek, number>>;
  adminProfitRate?: number;
  onTotalChange?: (total: number) => void;
}

const cellCls = "text-right px-2 py-1 font-mono text-xs border border-border";
const headCls = "px-2 py-1.5 text-[11px] font-semibold border border-border bg-muted/40 whitespace-nowrap";
const labelCellCls = "px-2 py-1 text-xs border border-border";

function fmtCurrency(v: number): string {
  if (v === 0) return '$0.00';
  return '$' + v.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PublicHolidaysSection({
  jobState, phIncluded, sundayRosterForPH, contractYear, contractStartDate,
  phDowCostMap = {}, phPriceFactorMap = {}, adminProfitRate = 0, onTotalChange,
}: Props) {
  const [phState, setPHState] = useState<PHState>(loadPHState);

  useEffect(() => {
    localStorage.setItem(PH_STATE_KEY, JSON.stringify(phState));
  }, [phState]);

  const holidays = useMemo(() => {
    const startDate = contractStartDate ? new Date(contractStartDate + 'T00:00:00') : null;
    const y1 = getPublicHolidays(jobState, contractYear);
    const y2 = getPublicHolidays(jobState, contractYear + 1);
    const all = [...y1, ...y2];

    if (!startDate || isNaN(startDate.getTime())) {
      return y1;
    }

    const endDate = new Date(startDate);
    endDate.setFullYear(endDate.getFullYear() + 1);

    return all
      .filter(h => {
        const hd = new Date(h.date + 'T00:00:00');
        return hd >= startDate && hd < endDate;
      })
      .filter((h, i, arr) => arr.findIndex(x => x.date === h.date && x.name === h.name) === i)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [jobState, contractYear, contractStartDate]);

  // Merge system holidays + custom holidays into one list for the selection table
  const allHolidays = useMemo(() => {
    const system = holidays.map(h => ({
      id: h.id,
      name: h.name,
      date: h.date,
      notes: h.notes ?? '',
      isCustom: false,
    }));
    const custom = (phState.customHolidays || []).map(ch => ({
      id: ch.id,
      name: ch.name || '',
      date: ch.date || '',
      notes: ch.notes || '',
      isCustom: true,
    }));
    return [...system, ...custom].sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.localeCompare(b.date);
    });
  }, [holidays, phState.customHolidays]);

  const toggleHoliday = useCallback((id: string) => {
    setPHState(prev => ({
      ...prev,
      includedHolidays: { ...prev.includedHolidays, [id]: !prev.includedHolidays[id] },
    }));
  }, []);

  const addCustomHoliday = useCallback(() => {
    const newId = `custom-${Date.now()}`;
    setPHState(prev => ({
      ...prev,
      customHolidays: [...(prev.customHolidays || []), { id: newId, name: '', date: '', notes: '' }],
    }));
  }, []);

  const updateCustomHoliday = useCallback((id: string, field: keyof CustomHoliday, value: string) => {
    setPHState(prev => ({
      ...prev,
      customHolidays: (prev.customHolidays || []).map(ch =>
        ch.id === id ? { ...ch, [field]: value } : ch
      ),
    }));
  }, []);

  const removeCustomHoliday = useCallback((id: string) => {
    setPHState(prev => ({
      ...prev,
      customHolidays: (prev.customHolidays || []).filter(ch => ch.id !== id),
      includedHolidays: (() => {
        const copy = { ...prev.includedHolidays };
        delete copy[id];
        return copy;
      })(),
    }));
  }, []);

  // Total of selected holidays using fully-loaded phPriceFactorMap
  const totalSelectedPrice = useMemo(() => allHolidays
    .filter(h => phState.includedHolidays[h.id] && h.date)
    .reduce((sum, h) => {
      const actualDow = dateToDayOfWeek(h.date);
      return sum + (phPriceFactorMap[actualDow] ?? 0);
    }, 0), [allHolidays, phState.includedHolidays, phPriceFactorMap]);

  useEffect(() => {
    onTotalChange?.(totalSelectedPrice);
    localStorage.setItem('cpq_ph_total', JSON.stringify(totalSelectedPrice));
    localStorage.setItem('cpq_ph_profit', JSON.stringify(totalSelectedPrice * (adminProfitRate / 100)));
  }, [totalSelectedPrice, adminProfitRate, onTotalChange]);

  if (phIncluded === false || phIncluded === null) {
    return (
      <div className="p-4 text-sm text-muted-foreground italic">
        Public holidays excluded. Enable "Is any public holiday included?" on Job Details to configure.
      </div>
    );
  }

  const DOW_ORDER: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const DOW_LABEL: Record<DayOfWeek, string> = {
    mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
  };

  const stateLabel = STATE_LABELS[jobState] || jobState;

  return (
    <div className="space-y-6">

      {/* ── 1. PH Cost Summary Table ─────────────────────────── */}
      <div>
        <h4 className="text-sm font-semibold mb-2">{stateLabel} Public Holidays (PH) cost summary</h4>
        <p className="text-xs text-muted-foreground mb-2">
          Labour cost basis (FT + PT only, incl. allowances, excl. casuals). Selected services from Job Details applied.
        </p>
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-muted/40">
                <th className={`${headCls} text-left`}>Day of week</th>
                <th className={`${headCls} text-right`}>Base day cost ($/day)</th>
                <th className={`${headCls} text-right`}>PH multiplier</th>
                <th className={`${headCls} text-right`}>Cost</th>
              </tr>
            </thead>
            <tbody>
              {DOW_ORDER.map((dow, idx) => {
                const baseCost = (phDowCostMap[dow] ?? 0) / (dow === 'mon' || dow === 'tue' || dow === 'wed' || dow === 'thu' || dow === 'fri' ? 2.50 : dow === 'sat' ? 1.67 : 1.25);
                const cost = phDowCostMap[dow] ?? 0;
                const multiplier = dow === 'sat' ? 1.67 : dow === 'sun' ? 1.25 : 2.50;
                return (
                  <tr key={dow} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/10'}>
                    <td className={labelCellCls}>{DOW_LABEL[dow]}</td>
                    <td className={cellCls}>{baseCost > 0 ? fmtCurrency(baseCost) : '–'}</td>
                    <td className={cellCls}>{multiplier.toFixed(2)}×</td>
                    <td className={`${cellCls} font-medium`}>{cost > 0 ? fmtCurrency(cost) : '–'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground italic mt-1">
          Multiplier represents PH total rate factor. Cost = Base day cost × multiplier (labour basis only — not the sell price).
        </p>
      </div>

      {/* ── 2. Sunday roster note ────────────────────────────── */}
      {sundayRosterForPH === true && (
        <div className="rounded border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <strong className="text-foreground">Sunday roster applies for public holidays.</strong> All PH sell prices below use the Sunday day cost basis.
        </div>
      )}

      {/* ── 3. Public Holiday Selection Table ───────────────── */}
      <div>
        <h4 className="text-sm font-semibold mb-2">{stateLabel} Public holiday selection</h4>
        {!contractStartDate && (
          <p className="text-xs text-muted-foreground italic mb-2">
            Set Contract Start Date on Job Details to filter holidays to your 12-month contract period.
          </p>
        )}
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-muted/40">
                <th className={`${headCls} text-center w-14`}>Include</th>
                <th className={`${headCls} text-left`}>Public Holiday</th>
                <th className={`${headCls} text-center w-16`}>Day</th>
                <th className={`${headCls} text-center w-28`}>Date</th>
                <th className={`${headCls} text-left w-32`}>Notes</th>
                <th className={`${headCls} text-right w-32`}>Price (fully loaded)</th>
                <th className={`${headCls} text-center w-10`}></th>
              </tr>
            </thead>
            <tbody>
              {allHolidays.map((h, idx) => {
                const hasDate = !!h.date;
                const actualDow = hasDate ? dateToDayOfWeek(h.date) : null;
                const price = (phState.includedHolidays[h.id] && actualDow) ? (phPriceFactorMap[actualDow] ?? 0) : 0;

                if (h.isCustom) {
                  return (
                    <tr key={h.id} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/10'}>
                      <td className={`${cellCls} text-center`}>
                        <div className="flex items-center justify-center">
                          <Checkbox
                            checked={!!phState.includedHolidays[h.id]}
                            onCheckedChange={() => toggleHoliday(h.id)}
                            disabled={!hasDate}
                          />
                        </div>
                      </td>
                      <td className={labelCellCls}>
                        <Input
                          value={h.name}
                          onChange={e => updateCustomHoliday(h.id, 'name', e.target.value)}
                          placeholder="Holiday name"
                          className="h-6 text-xs border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                        />
                      </td>
                      <td className={`${cellCls} text-center font-normal`}>
                        {hasDate ? dateToDayLabel(h.date) : '–'}
                      </td>
                      <td className={`${cellCls} text-center font-normal`}>
                        <Input
                          type="date"
                          value={h.date}
                          onChange={e => updateCustomHoliday(h.id, 'date', e.target.value)}
                          className="h-6 text-xs border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 text-center"
                        />
                      </td>
                      <td className={labelCellCls}>
                        <Input
                          value={h.notes}
                          onChange={e => updateCustomHoliday(h.id, 'notes', e.target.value)}
                          placeholder="Notes"
                          className="h-6 text-xs border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                        />
                      </td>
                      <td className={cellCls}>
                        {(phState.includedHolidays[h.id] && hasDate) ? fmtCurrency(phPriceFactorMap[actualDow!] ?? 0) : '$0.00'}
                      </td>
                      <td className={`${cellCls} text-center`}>
                        <button
                          onClick={() => removeCustomHoliday(h.id)}
                          className="text-destructive hover:text-destructive/80 text-xs font-medium"
                          title="Remove row"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={h.id + h.date} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/10'}>
                    <td className={`${cellCls} text-center`}>
                      <div className="flex items-center justify-center">
                        <Checkbox
                          checked={!!phState.includedHolidays[h.id]}
                          onCheckedChange={() => toggleHoliday(h.id)}
                        />
                      </div>
                    </td>
                    <td className={labelCellCls}>{h.name}</td>
                    <td className={`${cellCls} text-center font-normal`}>{dateToDayLabel(h.date)}</td>
                    <td className={`${cellCls} text-center font-normal`}>
                      {new Date(h.date + 'T00:00:00').toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className={`${labelCellCls} text-muted-foreground`}>{h.notes}</td>
                    <td className={cellCls}>{phState.includedHolidays[h.id] ? fmtCurrency(phPriceFactorMap[actualDow!] ?? 0) : '$0.00'}</td>
                    <td className={`${cellCls} text-center`}></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-muted/40 font-semibold border-t border-border">
                <td className={labelCellCls} colSpan={5}>Total (selected holidays)</td>
                <td className={cellCls}>{fmtCurrency(totalSelectedPrice)}</td>
                <td className={`${cellCls} text-center`}></td>
              </tr>
              {adminProfitRate > 0 && (
                <tr className="bg-muted/20 border-t border-border">
                  <td className={`${labelCellCls} text-muted-foreground`} colSpan={5}>
                    Admin &amp; Profit on Public Holidays ({adminProfitRate.toFixed(2)}%)
                  </td>
                  <td className={`${cellCls} text-muted-foreground`}>
                    {fmtCurrency(totalSelectedPrice * (adminProfitRate / 100))}
                  </td>
                  <td className={`${cellCls} text-center`}></td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>

        {/* Add Row button */}
        <div className="mt-2">
          <Button variant="outline" size="sm" onClick={addCustomHoliday} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Add Row
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground italic mt-1">
          Price includes all statutory on-costs, sundry expenses, administration & profit — consistent with Labour Price Breakdown.
          {sundayRosterForPH === true ? ' Sunday roster pricing applied to all holidays.' : ''}
        </p>

        {/* User warning note */}
        <div className="mt-3 rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-800 dark:text-amber-300">
            <strong>Note:</strong> Check official public holiday dates for this state/territory and add any additional declared or substitute days if required using <em>Add Row</em>.
          </p>
        </div>
      </div>

    </div>
  );
}
