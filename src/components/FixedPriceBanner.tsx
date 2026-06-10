import { usePricingData } from '@/hooks/usePricingData';

export function FixedPriceBanner() {
  const { year1Factor, isFixedPrice, computedYear1Factor, year1FactorDebug, jobDetails } = usePricingData();
  if (!isFixedPrice) return null;

  const { impactRate, rise, daysPreJuly, daysPostJuly, totalDays, startStr } = year1FactorDebug;
  const isOverridden = jobDetails.manualYear1Factor !== null;

  return (
    <div className="rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 px-4 py-3 text-xs text-amber-800 dark:text-amber-300 space-y-1">
      <div className="font-medium">
        Fixed Price ON — Applied Year-1 factor: <span className="font-mono">{year1Factor.toFixed(6)}</span>
        {isOverridden && <span className="ml-1">(manual override)</span>}
        {!isOverridden && <span className="ml-1">(computed: +{((computedYear1Factor - 1) * 100).toFixed(2)}%)</span>}
      </div>
      <div className="text-[11px] text-amber-700/70 dark:text-amber-400/70">
        Start: {startStr || '—'} · Pre-July: {daysPreJuly}d · Post-July: {daysPostJuly}d · Rise: {(rise * 100).toFixed(2)}% · Impact: {(impactRate * 100).toFixed(4)}%
      </div>
    </div>
  );
}
