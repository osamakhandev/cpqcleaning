import { useState, useRef } from 'react';
import { Settings2, Plus, Trash2, Info, ChevronDown, ChevronRight, Maximize2, Minimize2, BookmarkPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import FormattedNumberInput from '@/components/ui/formatted-number-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useEquipmentDepreciation } from '@/hooks/useEquipmentDepreciation';
import EquipmentLibraryModal from '@/components/EquipmentLibraryModal';
import { formatCurrency } from '@/lib/costingCalculations';
import { MAJOR_CATEGORIES } from '@/lib/equipmentData';
import { toast } from 'sonner';
import type { LeapYearChargeResult } from '@/lib/leapYearCharge';

const cellCls  = 'text-right px-2.5 py-1.5 font-mono text-xs align-middle';
const labelCls = 'px-2.5 py-1.5 text-xs align-middle';
const headCls  = 'px-2.5 py-2 text-xs font-semibold text-center align-middle';
const actionCls = 'px-1 py-1.5 text-center align-middle';

function PctCell({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <Input
      type="text"
      inputMode="decimal"
      className="h-7 text-xs w-20 text-right font-mono bg-[hsl(48,80%,90%)] border-[hsl(48,50%,70%)]"
      defaultValue={(value * 100).toFixed(2) + '%'}
      onFocus={e => { e.target.value = String((value * 100).toFixed(2)); e.target.select(); }}
      onBlur={e => {
        const raw = e.target.value.replace(/%/g, '').trim();
        const num = parseFloat(raw);
        const final = isNaN(num) ? 0 : num;
        onChange(final / 100);
        e.target.value = final.toFixed(2) + '%';
      }}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
    />
  );
}

function NumCell({ value, onChange, min = 0, integer = false, className = '' }: {
  value: number; onChange: (v: number) => void; min?: number; integer?: boolean; className?: string;
}) {
  if (integer) {
    return (
      <Input
        type="number"
        min={min}
        step={1}
        className={`h-7 text-xs text-right font-mono bg-[hsl(48,80%,90%)] border-[hsl(48,50%,70%)] ${className}`}
        defaultValue={value || ''}
        onBlur={e => {
          const v = parseInt(e.target.value) || 0;
          onChange(Math.max(min, v));
        }}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      />
    );
  }
  return (
    <FormattedNumberInput
      value={value}
      onChange={onChange}
      decimals={2}
      min={min}
      placeholder="0"
      className={`h-7 text-xs text-right font-mono bg-[hsl(48,80%,90%)] border-[hsl(48,50%,70%)] ${className}`}
    />
  );
}

const fmt = (v: number) => v === 0 ? '–' : formatCurrency(v);

/* ── Minor Equipment Combo: dropdown + free text ── */
function MinorEquipmentCombo({ value, libraryItemId, libraryItems, onSelectLibrary, onCustomName }: {
  value: string;
  libraryItemId: string | null;
  libraryItems: { id: string; item_name: string }[];
  onSelectLibrary: (id: string) => void;
  onCustomName: (name: string) => void;
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [localVal, setLocalVal] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = libraryItems.filter(i =>
    !localVal || i.item_name.toLowerCase().includes(localVal.toLowerCase())
  );

  return (
    <div className="relative w-full">
      <Input
        ref={inputRef}
        type="text"
        className="h-7 text-xs bg-[hsl(48,80%,90%)] border-[hsl(48,50%,70%)]"
        placeholder="Type or select..."
        value={localVal}
        onChange={e => { setLocalVal(e.target.value); setShowDropdown(true); }}
        onFocus={() => setShowDropdown(true)}
        onBlur={() => {
          setTimeout(() => setShowDropdown(false), 150);
          if (localVal !== value) onCustomName(localVal);
        }}
        onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
      />
      {showDropdown && filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-popover border border-border rounded-md shadow-md max-h-40 overflow-auto">
          {filtered.map(i => (
            <button
              key={i.id}
              className="w-full text-left px-2 py-1 text-xs hover:bg-accent transition-colors"
              onMouseDown={e => {
                e.preventDefault();
                onSelectLibrary(i.id);
                setLocalVal(i.item_name);
                setShowDropdown(false);
              }}
            >
              {i.item_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Major Equipment Combo: dropdown + free text for model ── */
function MajorModelCombo({ value, items, onSelectLibrary, onCustomModel }: {
  value: string;
  items: { id: string; item_name: string }[];
  onSelectLibrary: (id: string) => void;
  onCustomModel: (model: string) => void;
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [localVal, setLocalVal] = useState(value);

  const filtered = items.filter(i =>
    !localVal || i.item_name.toLowerCase().includes(localVal.toLowerCase())
  );

  return (
    <div className="relative w-full">
      <Input
        type="text"
        className="h-7 text-xs bg-[hsl(48,80%,90%)] border-[hsl(48,50%,70%)]"
        placeholder="Type or select model..."
        value={localVal}
        onChange={e => { setLocalVal(e.target.value); setShowDropdown(true); }}
        onFocus={() => setShowDropdown(true)}
        onBlur={() => {
          setTimeout(() => setShowDropdown(false), 150);
          if (localVal !== value) onCustomModel(localVal);
        }}
        onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
      />
      {showDropdown && filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-popover border border-border rounded-md shadow-md max-h-40 overflow-auto">
          {filtered.map(i => (
            <button
              key={i.id}
              className="w-full text-left px-2 py-1 text-xs hover:bg-accent transition-colors"
              onMouseDown={e => {
                e.preventDefault();
                onSelectLibrary(i.id);
                setLocalVal(i.item_name);
                setShowDropdown(false);
              }}
            >
              {i.item_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  leapYearCharge?: LeapYearChargeResult;
}

export default function EquipmentDepreciation({ leapYearCharge }: Props) {
  const eq = useEquipmentDepreciation();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [leapBreakdownOpen, setLeapBreakdownOpen] = useState(false);
  const [majorExpanded, setMajorExpanded] = useState(false);

  const leapApply = eq.settings.leapYearApply;
  const leapPrice = leapApply && leapYearCharge?.applicable ? leapYearCharge.totalCharge : 0;

  // Totals including leap year price
  const effectiveMinorAmort = eq.annualAmortisationMinor + leapPrice;
  const effectiveTotal = eq.annualAmortisationMajor + effectiveMinorAmort;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Equipment Depreciation</h2>
          <p className="text-muted-foreground text-sm">Major and minor equipment amortization costs</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setLibraryOpen(true)}>
          <Settings2 className="h-4 w-4 mr-1.5" />
          Edit Equipment Library
        </Button>
      </div>

      {/* Two-panel layout */}
      <div className={majorExpanded ? 'space-y-4' : 'grid grid-cols-1 lg:grid-cols-2 gap-4'}>

        {/* ── MAJOR PANEL ── */}
        <div className="border border-border rounded-md overflow-hidden">
          <div className="bg-[hsl(187,65%,35%)] text-white px-3 py-2 font-bold text-sm uppercase tracking-wide flex items-center justify-between">
            <span className="flex-1 text-center">Major Equipment Amortization</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-white hover:bg-white/20"
              onClick={() => setMajorExpanded(!majorExpanded)}
              title={majorExpanded ? 'Collapse Major Equipment' : 'Expand Major Equipment'}
            >
              {majorExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          </div>

          {/* Header defaults */}
          <div className="flex gap-3 px-3 py-2 bg-muted/30 border-b border-border text-xs items-center flex-wrap">
            <span className="font-semibold text-muted-foreground">Contract Period:</span>
            <div className="flex items-center gap-1">
              <NumCell value={eq.settings.major_life_years_default} onChange={v => eq.updateSettings({ major_life_years_default: v })} min={1} integer className="w-14" />
              <span className="text-muted-foreground">Years</span>
            </div>
            <span className="font-semibold text-muted-foreground ml-2">Interest Rate:</span>
            <PctCell value={eq.settings.major_interest_rate_default} onChange={v => eq.updateSettings({ major_interest_rate_default: v })} />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '25%' }} />
                <col style={{ width: '30%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '6%' }} />
              </colgroup>
              <thead className={majorExpanded ? 'sticky top-0 z-10 bg-muted/40' : ''}>
                <tr className="bg-muted/40 border-b border-border">
                  <th className={`${headCls} text-left`}>Major Equipment</th>
                  <th className={`${headCls} text-left`}>Model</th>
                  <th className={headCls}>Cost ex GST</th>
                  <th className={headCls}>No. of Units</th>
                  <th className={headCls}>Purchase Cost</th>
                  <th className={headCls}></th>
                </tr>
              </thead>
              <tbody>
                {eq.majorRows.map((row, idx) => {
                  const isCustom = !MAJOR_CATEGORIES.includes(row.category);
                  const itemsForCat = row.category ? eq.majorLibraryItems.filter(i => i.category === row.category) : [];
                  const isManualModel = !row.library_item_id && row.model.trim() !== '';
                  return (
                    <tr key={row.id} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/10'}>
                      <td className={`${labelCls} font-medium whitespace-nowrap`}>
                        {isCustom ? (
                          <Input
                            type="text"
                            className="h-7 text-xs w-full bg-[hsl(48,80%,90%)] border-[hsl(48,50%,70%)]"
                            placeholder="Equipment name..."
                            defaultValue={row.category}
                            onBlur={e => eq.updateMajorRow(row.id, { category: e.target.value })}
                            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                          />
                        ) : row.category}
                      </td>
                      <td className={labelCls}>
                        <div className="flex items-center gap-1">
                          {isCustom ? (
                             <Input
                              type="text"
                              className="h-7 text-xs w-full bg-[hsl(48,80%,90%)] border-[hsl(48,50%,70%)]"
                              placeholder="Model..."
                              defaultValue={row.model}
                              onBlur={e => eq.updateMajorRow(row.id, { model: e.target.value })}
                              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                            />
                          ) : (
                            <MajorModelCombo
                              value={row.model}
                              items={itemsForCat}
                              onSelectLibrary={id => eq.selectMajorModel(row.id, id)}
                              onCustomModel={model => eq.updateMajorRow(row.id, { model, library_item_id: null })}
                            />
                          )}
                          {/* Add to Library for custom category rows or manual model entries */}
                          {((isCustom && row.category.trim() && row.model.trim()) || (!isCustom && isManualModel)) && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 shrink-0"
                                    onClick={() => {
                                      const cat = isCustom ? row.category.trim() : row.category;
                                      const ok = eq.addLibraryItem({
                                        type: 'major',
                                        category: cat,
                                        item_name: row.model.trim(),
                                        default_unit_cost_ex_gst: row.unit_cost_ex_gst,
                                        default_life_years: eq.settings.major_life_years_default,
                                        default_interest_rate: eq.settings.major_interest_rate_default,
                                        active: true,
                                      });
                                      if (ok) toast.success(`"${row.model}" added to library under ${cat}`);
                                      else toast.info('Item already exists in library');
                                    }}
                                  >
                                    <BookmarkPlus className="h-3 w-3 text-primary" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">Add to Library</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      </td>
                      <td className={cellCls}>
                        <NumCell value={row.unit_cost_ex_gst} onChange={v => eq.updateMajorRow(row.id, { unit_cost_ex_gst: v })} className="w-full" />
                      </td>
                      <td className={cellCls}>
                        <NumCell value={row.units} onChange={v => eq.updateMajorRow(row.id, { units: v })} min={0} integer className="w-full" />
                      </td>
                      <td className={`${cellCls} font-medium`}>{fmt(row.purchaseCost)}</td>
                      <td className={actionCls}>
                        {isCustom && (
                          <Button variant="ghost" size="icon" className="h-6 w-6 mx-auto" onClick={() => eq.deleteMajorRow(row.id)}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {/* Total row */}
                <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                  <td className={`${labelCls} font-bold`} colSpan={5}>Total Major Equipment Purchase Cost</td>
                  <td className={`${cellCls} font-bold`}>{fmt(eq.totalMajorPurchase)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Add row button */}
          <div className="px-3 py-1.5 border-t border-border bg-background">
            <Button variant="outline" size="sm" onClick={eq.addMajorRow} className="h-7 text-xs">
              <Plus className="h-3 w-3 mr-1" /> Add Row
            </Button>
          </div>

          {/* Annual amortisation footer */}
          <div className="bg-[hsl(48,80%,85%)] border-t border-border px-3 py-2 flex justify-between items-center">
            <span className="text-xs font-bold">Annual amortisation cost major equipment</span>
            <span className="font-mono text-sm font-bold">{fmt(eq.annualAmortisationMajor)}</span>
          </div>
        </div>

        {/* ── MINOR PANEL ── */}
        <div className="border border-border rounded-md overflow-hidden">
          <div
            className="bg-[hsl(187,65%,35%)] text-white px-3 py-2 font-bold text-sm uppercase tracking-wide flex items-center justify-between cursor-pointer"
            onClick={() => majorExpanded && setMajorExpanded(false)}
          >
            <span className="flex-1 text-center">Minor Equipment Amortization</span>
            {majorExpanded && (
              <span className="font-mono text-xs font-normal opacity-80">{fmt(effectiveMinorAmort)}</span>
            )}
          </div>

          {!majorExpanded && (
            <>
              {/* Header defaults */}
              <div className="flex gap-3 px-3 py-2 bg-muted/30 border-b border-border text-xs items-center flex-wrap">
                <span className="font-semibold text-muted-foreground">Contract Period:</span>
                <div className="flex items-center gap-1">
                  <NumCell value={eq.settings.minor_life_years_default} onChange={v => eq.updateSettings({ minor_life_years_default: v })} min={1} integer className="w-14" />
                  <span className="text-muted-foreground">Years</span>
                </div>
                <span className="font-semibold text-muted-foreground ml-2">Interest Rate:</span>
                <PctCell value={eq.settings.minor_interest_rate_default} onChange={v => eq.updateSettings({ minor_interest_rate_default: v })} />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: '30%' }} />
                    <col style={{ width: '22%' }} />
                    <col style={{ width: '14%' }} />
                    <col style={{ width: '28%' }} />
                    <col style={{ width: '6%' }} />
                  </colgroup>
                  <thead>
                    <tr className="bg-muted/40 border-b border-border">
                      <th className={`${headCls} text-left`}>Minor Equipment</th>
                      <th className={headCls}>Cost ex GST</th>
                      <th className={headCls}>No. of Units</th>
                      <th className={headCls}>Purchase Cost</th>
                      <th className={headCls}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {eq.minorRows.map((row, idx) => {
                      const isCustom = !row.library_item_id;
                      return (
                        <tr key={row.id} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/10'}>
                          <td className={labelCls}>
                            <div className="flex items-center gap-1">
                              <MinorEquipmentCombo
                                value={row.item_name}
                                libraryItemId={row.library_item_id}
                                libraryItems={eq.minorLibraryItems}
                                onSelectLibrary={id => eq.selectMinorItem(row.id, id)}
                                onCustomName={name => eq.updateMinorRow(row.id, { item_name: name, library_item_id: null })}
                              />
                              {isCustom && row.item_name.trim() && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 shrink-0"
                                        onClick={() => {
                                          const ok = eq.addLibraryItem({
                                            type: 'minor',
                                            category: 'Minor Equipment',
                                            item_name: row.item_name.trim(),
                                            default_unit_cost_ex_gst: row.unit_cost_ex_gst,
                                            default_life_years: eq.settings.minor_life_years_default,
                                            default_interest_rate: eq.settings.minor_interest_rate_default,
                                            active: true,
                                          });
                                          if (ok) toast.success(`"${row.item_name}" added to library`);
                                          else toast.info('Item already exists in library');
                                        }}
                                      >
                                        <BookmarkPlus className="h-3 w-3 text-primary" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs">Add to Library</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                          </td>
                          <td className={cellCls}>
                            <NumCell value={row.unit_cost_ex_gst} onChange={v => eq.updateMinorRow(row.id, { unit_cost_ex_gst: v })} className="w-full" />
                          </td>
                          <td className={cellCls}>
                            <NumCell value={row.units} onChange={v => eq.updateMinorRow(row.id, { units: v })} min={0} integer className="w-full" />
                          </td>
                          <td className={`${cellCls} font-medium`}>{fmt(row.purchaseCost)}</td>
                          <td className={actionCls}>
                            <Button variant="ghost" size="icon" className="h-6 w-6 mx-auto" onClick={() => eq.deleteMinorRow(row.id)}>
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}

                    {/* ── LEAP YEAR PRICE fixed row ── */}
                    <tr className="bg-muted/20 border-t border-border">
                      <td className={`${labelCls} font-medium`}>
                        <div className="flex items-center gap-2">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-1.5">
                                  <Checkbox
                                    checked={leapApply}
                                    onCheckedChange={(checked) => eq.updateSettings({ leapYearApply: !!checked })}
                                    className="h-3.5 w-3.5"
                                  />
                                  <Info className="h-3 w-3 text-muted-foreground" />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs text-xs">
                                Include or exclude leap year pricing from amortisation.
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <span className="text-xs font-medium text-muted-foreground">Leap year price</span>
                        </div>
                      </td>
                      <td className={cellCls} colSpan={2}>
                        {leapApply && leapPrice > 0 && leapYearCharge && leapYearCharge.leapDays.length > 0 && (
                          <button
                            onClick={() => setLeapBreakdownOpen(!leapBreakdownOpen)}
                            className="text-xs text-primary hover:underline flex items-center gap-0.5 ml-auto"
                          >
                            {leapBreakdownOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                            details
                          </button>
                        )}
                      </td>
                      <td className={`${cellCls} font-medium`}>{formatCurrency(leapPrice)}</td>
                      <td></td>
                    </tr>

                    {/* Leap breakdown rows */}
                    {leapBreakdownOpen && leapApply && leapYearCharge && leapYearCharge.leapDays.map(ld => (
                      <tr key={ld.dateISO} className="bg-muted/5">
                        <td className={`${labelCls} pl-8 text-muted-foreground`}>{ld.date} ({ld.weekdayLabel})</td>
                        <td className={`${cellCls} text-muted-foreground`}>{ld.worked ? 'Y' : 'N'}</td>
                        <td className={`${cellCls} text-muted-foreground`}>{ld.worked ? formatCurrency(ld.dailyCost) : '–'}</td>
                        <td className={`${cellCls} text-muted-foreground`}>{ld.charge > 0 ? formatCurrency(ld.charge) : '–'}</td>
                        <td></td>
                      </tr>
                    ))}

                    {/* Total row */}
                    <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                      <td className={`${labelCls} font-bold`} colSpan={3}>Total Minor Equipment Purchase Cost</td>
                      <td className={`${cellCls} font-bold`}>{fmt(eq.totalMinorPurchase)}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Add row button */}
              <div className="px-3 py-1.5 border-t border-border bg-background">
                <Button variant="outline" size="sm" onClick={eq.addMinorRow} className="h-7 text-xs">
                  <Plus className="h-3 w-3 mr-1" /> Add Row
                </Button>
              </div>

              {/* Annual amortisation footer */}
              <div className="bg-[hsl(48,80%,85%)] border-t border-border px-3 py-2 flex justify-between items-center">
                <span className="text-xs font-bold">Annual amortisation cost minor equipment</span>
                <span className="font-mono text-sm font-bold">{fmt(effectiveMinorAmort)}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── TOTAL BANNER ── */}
      <div className="bg-[hsl(0,72%,51%)] text-white rounded-md px-4 py-3 flex items-center justify-between">
        <span className="font-bold text-sm uppercase tracking-wide">Total Annual Amortization Cost</span>
        <span className="font-mono text-lg font-bold">{fmt(effectiveTotal)}</span>
      </div>

      {/* Allocation method */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground bg-muted/20 rounded-md px-3 py-2 border border-border">
        <span className="font-semibold">Division allocation:</span>
        <Select value={eq.settings.allocation_method} onValueChange={v => eq.updateSettings({ allocation_method: v as any })}>
          <SelectTrigger className="h-7 text-xs w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="labour_hours">Pro-rata by labour hours</SelectItem>
            <SelectItem value="equal_split">Equal split</SelectItem>
            <SelectItem value="manual_percent">Manual percentage</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="border border-border rounded-md px-3 py-2 bg-muted/10">
          <span className="text-muted-foreground">Weekly</span>
          <span className="font-mono font-semibold float-right">{fmt(effectiveTotal / 52.14)}</span>
        </div>
        <div className="border border-border rounded-md px-3 py-2 bg-muted/10">
          <span className="text-muted-foreground">Monthly</span>
          <span className="font-mono font-semibold float-right">{fmt(effectiveTotal / 12)}</span>
        </div>
      </div>

      <EquipmentLibraryModal
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        library={eq.library}
        onAddItem={eq.addLibraryItem}
        onUpdateItem={eq.updateLibraryItem}
        onDeleteItem={eq.deleteLibraryItem}
      />
    </section>
  );
}
