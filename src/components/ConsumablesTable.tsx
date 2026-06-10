import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import FormattedCellInput from '@/components/ui/formatted-cell-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Settings2, Plus, ChevronRight, ChevronDown, Trash2 } from 'lucide-react';
import { CONSUMABLE_CATEGORIES, ConsumableCategory } from '@/lib/consumablesData';
import { useConsumables } from '@/hooks/useConsumables';
import ConsumablesDatabaseModal from '@/components/ConsumablesDatabaseModal';

const fmt = (n: number) => {
  if (n === 0) return '';
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 }).format(n);
};

const fmtTotal = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 }).format(n);

const GRID_COLS = 'grid-cols-[120px_1fr_90px_90px_100px_100px_100px_32px]';

interface ConsumablesTableProps {
  onTotalChange?: (total: number) => void;
  onMarkupChange?: (markup: number) => void;
}

export default function ConsumablesTable({ onTotalChange, onMarkupChange }: ConsumablesTableProps = {}) {
  const {
    library, saveLibrary,
    rowsByCategory, updateRow, addRowToCategory, deleteRow,
    profitPct, saveProfitPct, profitRate,
    totals, itemsByCategory,
  } = useConsumables();

  useEffect(() => {
    onTotalChange?.(totals.totalPricePA);
  }, [totals.totalPricePA, onTotalChange]);

  useEffect(() => {
    onMarkupChange?.(profitPct);
  }, [profitPct, onMarkupChange]);

  const [dbOpen, setDbOpen] = useState(false);

  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    CONSUMABLE_CATEGORIES.forEach(cat => { init[cat] = false; });
    return init;
  });

  const toggleCategory = (cat: ConsumableCategory) => {
    setExpanded(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const handleAddRow = (cat: ConsumableCategory) => {
    setExpanded(prev => ({ ...prev, [cat]: true }));
    addRowToCategory(cat);
    setTimeout(() => {
      const catRows = document.querySelectorAll(`[data-category="${cat}"] [data-role="desc-trigger"], [data-category="${cat}"] [data-role="desc-input"]`);
      const last = catRows[catRows.length - 1] as HTMLElement | null;
      last?.focus();
      if (last?.tagName === 'BUTTON') (last as HTMLButtonElement).click();
    }, 100);
  };

  const getCategoryTotals = (cat: ConsumableCategory) => {
    const catRows = rowsByCategory[cat] || [];
    let totalCost = 0;
    let totalProfit = 0;
    let totalPrice = 0;
    catRows.forEach(row => {
      const hasCost = row.description && row.unitsPA != null && row.unitsPA > 0;
      if (hasCost) {
        const cost = row.unitCost * row.unitsPA!;
        const prof = cost * profitRate;
        totalCost += cost;
        totalProfit += prof;
        totalPrice += cost + prof;
      }
    });
    return { totalCost, totalProfit, totalPrice };
  };

  const isOthersCategory = (cat: ConsumableCategory) => cat === 'Others';

  return (
    <div>
      {/* Title bar */}
      <div className="flex items-center justify-between bg-[hsl(187,70%,42%)] text-white px-4 py-2 rounded-t-md">
        <span className="font-bold text-sm">Consumables</span>
        <Button
          size="sm"
          variant="ghost"
          className="text-white hover:bg-white/20 h-7 text-xs gap-1"
          onClick={() => setDbOpen(true)}
        >
          <Settings2 className="h-3.5 w-3.5" />
          Edit Consumables Database
        </Button>
      </div>

      {/* Profit row */}
      <div className="flex items-center gap-3 px-4 py-1.5 bg-[hsl(50,90%,88%)] border-x border-b border-border">
        <span className="text-xs font-semibold">Profit</span>
        <div className="flex items-center gap-1">
          <Input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={profitPct}
            onChange={e => saveProfitPct(parseFloat(e.target.value) || 0)}
            className="h-7 w-20 text-xs text-right font-mono bg-[hsl(50,85%,95%)]"
          />
          <span className="text-xs">%</span>
        </div>
      </div>

      {/* Header row */}
      <div className={`grid ${GRID_COLS} bg-[hsl(50,90%,65%)] border-x border-b border-border text-xs font-bold`}>
        <div className="px-2 py-1.5 border-r border-border/30">Cat</div>
        <div className="px-2 py-1.5 border-r border-border/30">Description</div>
        <div className="px-2 py-1.5 border-r border-border/30 text-right">Unit Cost</div>
        <div className="px-2 py-1.5 border-r border-border/30 text-right">No. of Units P.A</div>
        <div className="px-2 py-1.5 border-r border-border/30 text-right">Total Cost P.A</div>
        <div className="px-2 py-1.5 border-r border-border/30 text-right">Profit</div>
        <div className="px-2 py-1.5 border-r border-border/30 text-right">Total Price P.A</div>
        <div className="px-2 py-1.5" />
      </div>

      {/* Category blocks */}
      {CONSUMABLE_CATEGORIES.map((cat) => {
        const catRows = rowsByCategory[cat] || [];
        const catItems = itemsByCategory[cat] || [];
        const isExpanded = expanded[cat];
        const catTotals = getCategoryTotals(cat);
        const isOthers = isOthersCategory(cat);

        return (
          <div key={cat} data-category={cat} className="border-x border-b border-border">
            {/* Category header row */}
            <div
              className={`grid ${GRID_COLS} text-xs cursor-pointer hover:bg-muted/30 transition-colors select-none`}
              onClick={() => toggleCategory(cat)}
            >
              <div className="px-2 py-1.5 bg-[hsl(120,30%,85%)] border-r border-border/30 font-semibold flex items-center gap-1">
                {isExpanded
                  ? <ChevronDown className="h-3 w-3 shrink-0" />
                  : <ChevronRight className="h-3 w-3 shrink-0" />
                }
                {cat}
              </div>
              {!isExpanded ? (
                <>
                  <div className="px-2 py-1.5 border-r border-border/30 text-muted-foreground italic">
                    {catRows.filter(r => r.description).length} item{catRows.filter(r => r.description).length !== 1 ? 's' : ''}
                  </div>
                  <div className="px-2 py-1.5 border-r border-border/30" />
                  <div className="px-2 py-1.5 border-r border-border/30" />
                  <div className="px-2 py-1.5 border-r border-border/30 text-right font-mono bg-[hsl(210,20%,95%)]">
                    {catTotals.totalCost > 0 ? fmt(catTotals.totalCost) : ''}
                  </div>
                  <div className="px-2 py-1.5 border-r border-border/30 text-right font-mono bg-[hsl(210,20%,95%)]">
                    {catTotals.totalProfit > 0 ? fmt(catTotals.totalProfit) : ''}
                  </div>
                  <div className="px-2 py-1.5 border-r border-border/30 text-right font-mono bg-[hsl(210,20%,95%)]">
                    {catTotals.totalPrice > 0 ? fmt(catTotals.totalPrice) : ''}
                  </div>
                  <div className="px-2 py-1.5" />
                </>
              ) : (
                <>
                  <div className="px-2 py-1.5 border-r border-border/30" />
                  <div className="px-2 py-1.5 border-r border-border/30" />
                  <div className="px-2 py-1.5 border-r border-border/30" />
                  <div className="px-2 py-1.5 border-r border-border/30" />
                  <div className="px-2 py-1.5 border-r border-border/30" />
                  <div className="px-2 py-1.5 border-r border-border/30" />
                  <div className="px-2 py-1.5" />
                </>
              )}
            </div>

            {/* Expanded rows */}
            {isExpanded && (
              <>
                {catRows.map((row) => {
                  const hasCost = row.description && row.unitsPA != null && row.unitsPA > 0;
                  const totalCost = hasCost ? row.unitCost * row.unitsPA! : 0;
                  const profit = hasCost ? totalCost * profitRate : 0;
                  const totalPrice = totalCost + profit;

                  return (
                    <div
                      key={row.id}
                      className={`grid ${GRID_COLS} text-xs border-t border-border/30`}
                    >
                      {/* Empty category column */}
                      <div className="px-2 py-1.5 bg-[hsl(120,30%,85%)] border-r border-border/30" />

                      {/* Description – dropdown for standard categories, free-text for Others */}
                      <div className="px-1 py-0.5 border-r border-border/30 bg-[hsl(50,85%,95%)]">
                        {isOthers ? (
                          <Input
                            data-role="desc-input"
                            value={row.description}
                            onChange={e => updateRow(row.id, { description: e.target.value })}
                            placeholder="Enter description..."
                            className="h-7 text-xs border-0 bg-transparent shadow-none px-1"
                          />
                        ) : (
                          <Select
                            value={row.libraryItemId || ''}
                            onValueChange={(val) => {
                              const item = catItems.find(i => i.id === val);
                              if (item) {
                                updateRow(row.id, {
                                  libraryItemId: item.id,
                                  description: item.itemName,
                                  unitCost: item.unitCostExGst,
                                });
                              }
                            }}
                          >
                            <SelectTrigger data-role="desc-trigger" className="h-7 text-xs border-0 bg-transparent shadow-none px-1">
                              <SelectValue placeholder="" />
                            </SelectTrigger>
                            <SelectContent>
                              {catItems.map(i => (
                                <SelectItem key={i.id} value={i.id}>
                                  <span className="text-xs">{i.itemName}</span>
                                  {i.uomPack && <span className="text-muted-foreground ml-1 text-[10px]">({i.uomPack})</span>}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>

                      {/* Unit Cost – editable for Others, read-only for standard */}
                      <div className={`px-1 py-0.5 border-r border-border/30 ${isOthers ? 'bg-[hsl(50,85%,95%)]' : 'bg-[hsl(210,20%,95%)]'}`}>
                        {isOthers ? (
                          <FormattedCellInput
                            value={row.unitCost}
                            decimals={2}
                            min={0}
                            onChange={v => updateRow(row.id, { unitCost: v ?? 0 })}
                            className="h-7 text-xs text-right font-mono border-0 bg-transparent shadow-none px-1"
                          />
                        ) : (
                          <div className="h-7 flex items-center justify-end px-1 text-xs font-mono">
                            {row.description ? fmt(row.unitCost) : ''}
                          </div>
                        )}
                      </div>

                      {/* No. of Units P.A */}
                      <div className="px-1 py-0.5 border-r border-border/30 bg-[hsl(50,85%,95%)]">
                        <FormattedCellInput
                          value={row.unitsPA}
                          decimals={0}
                          allowNull
                          min={0}
                          onChange={v => updateRow(row.id, { unitsPA: v })}
                          className="h-7 text-xs text-right font-mono border-0 bg-transparent shadow-none px-1"
                        />
                      </div>

                      {/* Total Cost P.A */}
                      <div className="px-2 py-1.5 border-r border-border/30 text-right font-mono bg-[hsl(210,20%,95%)]">
                        {hasCost ? fmt(totalCost) : ''}
                      </div>

                      {/* Profit */}
                      <div className="px-2 py-1.5 border-r border-border/30 text-right font-mono bg-[hsl(210,20%,95%)]">
                        {hasCost ? fmt(profit) : ''}
                      </div>

                      {/* Total Price P.A */}
                      <div className="px-2 py-1.5 border-r border-border/30 text-right font-mono bg-[hsl(210,20%,95%)]">
                        {hasCost ? fmt(totalPrice) : ''}
                      </div>

                      {/* Delete button */}
                      <div className="flex items-center justify-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteRow(row.id);
                          }}
                          className="text-destructive hover:text-destructive/80 transition-colors p-0.5"
                          title="Delete row"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* Add row button */}
                <div className="px-2 py-0.5 flex justify-end bg-muted/10 border-t border-border/30">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] gap-1 text-muted-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddRow(cat);
                    }}
                  >
                    <Plus className="h-3 w-3" />Add row
                  </Button>
                </div>
              </>
            )}

            {/* Add row button visible even when collapsed */}
            {!isExpanded && (
              <div className="px-2 py-0.5 flex justify-end bg-muted/10 border-t border-border/30">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] gap-1 text-muted-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAddRow(cat);
                  }}
                >
                  <Plus className="h-3 w-3" />Add row
                </Button>
              </div>
            )}
          </div>
        );
      })}

      {/* Totals row */}
      <div className={`grid ${GRID_COLS} bg-[hsl(187,70%,42%)] text-white text-xs font-bold rounded-b-md`}>
        <div className="px-2 py-2 col-span-4 text-center border-r border-white/20">Total</div>
        <div className="px-2 py-2 text-right font-mono border-r border-white/20">{fmtTotal(totals.totalCostPA)}</div>
        <div className="px-2 py-2 text-right font-mono border-r border-white/20">{fmtTotal(totals.totalProfit)}</div>
        <div className="px-2 py-2 text-right font-mono border-r border-white/20">{fmtTotal(totals.totalPricePA)}</div>
        <div className="px-2 py-2" />
      </div>

      <ConsumablesDatabaseModal
        open={dbOpen}
        onOpenChange={setDbOpen}
        library={library}
        onSave={saveLibrary}
      />
    </div>
  );
}
