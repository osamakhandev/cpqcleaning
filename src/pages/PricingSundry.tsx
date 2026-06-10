import { useEffect, useMemo } from 'react';
import { Lightbulb, Lock } from 'lucide-react';
import HowItWorks from '@/components/HowItWorks';
import { HELP_CONTENT } from '@/data/helpContent';
import { usePricingData, type PliRateSource } from '@/hooks/usePricingData';
import { PageActions } from '@/components/PageActions';
import EquipmentDepreciation from '@/components/EquipmentDepreciation';
import FuelTable from '@/components/sundry/FuelTable';
import RepairsTable from '@/components/sundry/RepairsTable';
import UniformTable from '@/components/sundry/UniformTable';
import CommunicationTable from '@/components/sundry/CommunicationTable';
import ChemicalsTable from '@/components/sundry/ChemicalsTable';
import SundrySummary from '@/components/sundry/SundrySummary';
import { useSundryTables } from '@/hooks/useSundryTables';
import { useEquipmentDepreciation } from '@/hooks/useEquipmentDepreciation';
import { usePlan } from '@/contexts/PlanContext';
import { LockedOverlay } from '@/components/plan/LockedOverlay';

const cellCls = "text-right px-2.5 py-1.5 font-mono text-xs align-middle";
const labelCls = "px-2.5 py-1.5 text-xs align-middle";
const headCls = "px-3 py-2 text-xs font-semibold text-center align-middle";

export default function PricingSundry() {
  const {
    isLoading, fmt, fmtPct,
    sundryCalc, sundryTotalValue, sundryTotalPct,
    pliRow, pliError, statutoryRates,
    totalPerWeek, totalPerMonth, totalPerAnnum,
    leapYearCharge,
    setSundryCalculatorTotal,
  } = usePricingData();

  const st = useSundryTables();
  const eq = useEquipmentDepreciation();
  const { hasAccess } = usePlan();

  const canEditBreakdown = hasAccess('sundry_breakdown');
  // Detect whether breakdown data already exists (e.g. created on Advanced
  // before a downgrade). When true on Basic, we still render the breakdown
  // but lock it behind an upgrade overlay rather than hiding the data.
  const hasBreakdownData = useMemo(() => (
    st.fuel.length > 0 ||
    st.repairs.length > 0 ||
    st.uniformRows.length > 0 ||
    st.communication.length > 0 ||
    st.chemicals.length > 0 ||
    eq.annualAmortisationTotal > 0
  ), [st.fuel, st.repairs, st.uniformRows, st.communication, st.chemicals, eq.annualAmortisationTotal]);

  const showBreakdown = canEditBreakdown || hasBreakdownData;
  const breakdownLocked = !canEditBreakdown && hasBreakdownData;

  // Build live calculator totals map
  const liveCalcTotals = useMemo(() => ({
    uniform: st.uniformTotals.annual,
    chemicals: st.chemTotals.annual,
    fuel: st.fuelTotals.annual,
    'equip-deprec': eq.annualAmortisationTotal,
    'equip-repair': st.repairTotals.annual,
    comms: st.commTotals.annual,
  }), [st.uniformTotals, st.chemTotals, st.fuelTotals, st.repairTotals, st.commTotals, eq.annualAmortisationTotal]);

  // Push live totals directly into usePricingData (immediate, no polling lag)
  useEffect(() => {
    Object.entries(liveCalcTotals).forEach(([id, total]) => {
      setSundryCalculatorTotal(id, total);
    });
  }, [liveCalcTotals, setSundryCalculatorTotal]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;
  }

  // Summary uses live calculator totals always (these are the "real" computed values)
  const summaryLines = sundryCalc.map(item => ({
    label: item.label,
    annual: liveCalcTotals[item.id as keyof typeof liveCalcTotals] ?? 0,
    rateSource: item.source === 'calculator' ? 'calculator' : item.source,
  }));

  const grandTotal = summaryLines.reduce((s, l) => s + l.annual, 0);

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-start gap-3">
          <div>
            <h1 className="text-2xl font-bold">Sundry Expenses</h1>
            <p className="text-muted-foreground text-sm">Sundry expense calculations applied on top of labour and statutory costs</p>
          </div>
          <HowItWorks {...HELP_CONTENT["sundry-expenses"]} size="sm" />
        </div>
        <PageActions showPrint />
      </div>

      {/* Existing percentage-based sundry table */}
      <section>
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className={`${headCls} text-left w-[40%]`} colSpan={2}>Sundry Expenses</th>
                <th className={`${headCls}`}></th>
                <th className={`${headCls}`}></th>
                <th className={`${headCls}`}>Annual Value</th>
              </tr>
            </thead>
            <tbody>
              {sundryCalc.map((item, idx) => (
                <tr key={item.id} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/10'}>
                  <td className={labelCls} colSpan={2}>{item.label}</td>
                  <td className={cellCls}>{fmtPct(item.pct)}</td>
                  <td className={cellCls}></td>
                  <td className={cellCls}>{fmt(item.value)}</td>
                </tr>
              ))}
              {/* PLI row */}
              <tr className={sundryCalc.length % 2 === 0 ? 'bg-background' : 'bg-muted/10'}>
                <td className={labelCls} colSpan={2}>
                  {pliRow.label}
                  <span className="ml-2 text-muted-foreground text-[10px]">
                    ({statutoryRates.pliSource === 'quoted' ? 'Quoted value' : statutoryRates.pliSource === 'custom' ? 'My own rate' : 'Default rate'})
                  </span>
                </td>
                <td className={cellCls}>{fmtPct(pliRow.pct)}</td>
                <td className={cellCls}></td>
                <td className={cellCls}>{pliError ? '–' : fmt(pliRow.value)}</td>
              </tr>
              <tr className="border-t border-border bg-muted/40 font-semibold">
                <td className={`${labelCls} font-semibold`} colSpan={2}>Total Sundry Expenses</td>
                <td className={cellCls}></td>
                <td className={cellCls}></td>
                <td className={cellCls}>{fmt(sundryTotalValue + (pliError ? 0 : pliRow.value))}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {!canEditBreakdown && (
          <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
            <Lightbulb className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              <strong>Advanced plan</strong> breaks each % into individual cost drivers (fuel, equipment, uniforms, chemicals, communication) for defendable, line-by-line pricing.
            </span>
          </div>
        )}
      </section>

      {/* Summary bar */}
      <section>
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
            <tbody>
              <tr className="bg-muted/20 border-b border-border">
                <td className={`${labelCls} font-semibold w-[40%]`} colSpan={4}>Total Direct Labour Price Per Week</td>
                <td className={`${cellCls} font-semibold`}>{fmt(totalPerWeek)}</td>
              </tr>
              <tr className="bg-muted/20 border-b border-border">
                <td className={`${labelCls} font-semibold w-[40%]`} colSpan={4}>Total Direct Labour Price Per Month</td>
                <td className={`${cellCls} font-semibold`}>{fmt(totalPerMonth)}</td>
              </tr>
              <tr className="bg-muted/40">
                <td className={`${labelCls} font-bold w-[40%]`} colSpan={4}>Total Direct Labour Price Per Annum</td>
                <td className={`${cellCls} font-bold`}>{fmt(totalPerAnnum)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {showBreakdown ? (
        <LockedOverlay
          locked={breakdownLocked}
          requiredPlan="advanced"
          featureLabel="Detailed sundry breakdown"
          banner={breakdownLocked
            ? 'This section was created under Advanced. Upgrade to edit or update these values. You can still override using the % rates above.'
            : undefined}
        >
          <div className="space-y-8">
            {/* Equipment Depreciation section */}
            <EquipmentDepreciation leapYearCharge={leapYearCharge} />

            {/* A) Fuel */}
            <FuelTable
              rows={st.fuel}
              totals={st.fuelTotals}
              onUpdate={st.updateFuelRow}
              onAdd={st.addFuelRow}
              onDelete={st.deleteFuelRow}
            />

            {/* B) Equipment Repair & Maintenance */}
            <RepairsTable
              rows={st.repairs}
              totals={st.repairTotals}
              onUpdate={st.updateRepairRow}
              onAdd={st.addRepairRow}
              onDelete={st.deleteRepairRow}
            />

            {/* C) Uniform cost calculation */}
            <UniformTable
              rows={st.uniformRows}
              unitCosts={st.uniformUnitCosts}
              margin={st.uniformMargin}
              totals={st.uniformTotals}
              onUpdateRow={st.updateUniformRow}
              onAddRow={st.addUniformRow}
              onDeleteRow={st.deleteUniformRow}
              onUpdateCost={st.updateUniformCost}
              onSetMargin={st.setUniformMargin}
            />

            {/* D) Communication */}
            <CommunicationTable
              rows={st.communication}
              totals={st.commTotals}
              onUpdate={st.updateCommRow}
              onAdd={st.addCommRow}
              onDelete={st.deleteCommRow}
            />

            {/* E) Chemicals & Supplies */}
            <ChemicalsTable
              rows={st.chemicals}
              totals={st.chemTotals}
              onUpdate={st.updateChemRow}
              onAdd={st.addChemRow}
              onDelete={st.deleteChemRow}
            />

            {/* F) Sundry Summary Roll-up */}
            <SundrySummary lines={summaryLines} grandTotal={grandTotal} />
          </div>
        </LockedOverlay>
      ) : (
        <section className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-xs text-muted-foreground">
          <Lock className="h-4 w-4 mx-auto mb-2 text-muted-foreground" />
          <p className="font-medium text-foreground mb-1">Detailed sundry breakdown — Advanced plan</p>
          <p>Calculated from individual cost inputs (fuel, equipment depreciation, repairs, uniforms, communication, chemicals). Ensures accurate and consistent pricing.</p>
        </section>
      )}
    </div>
  );
}
