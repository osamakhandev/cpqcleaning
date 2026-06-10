import { useState, useCallback, useMemo } from 'react';
import {
  ConsumableItem, ConsumableRow, ConsumableCategory,
  SEED_CONSUMABLES, createAllBlankRows, createBlankRowsForCategory,
  CONSUMABLE_CATEGORIES,
} from '@/lib/consumablesData';

const LIB_KEY = 'cpq_consumables_library';
const ROWS_KEY = 'cpq_consumables_rows';
const PROFIT_KEY = 'cpq_consumables_profit';

function loadLibrary(): ConsumableItem[] {
  try {
    const raw = localStorage.getItem(LIB_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [...SEED_CONSUMABLES];
}

function loadRows(): ConsumableRow[] {
  try {
    const raw = localStorage.getItem(ROWS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return createAllBlankRows();
}

function loadProfit(): number {
  try {
    const raw = localStorage.getItem(PROFIT_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return 30;
}

export function useConsumables() {
  const [library, setLibrary] = useState<ConsumableItem[]>(loadLibrary);
  const [rows, setRows] = useState<ConsumableRow[]>(loadRows);
  const [profitPct, setProfitPct] = useState<number>(loadProfit);

  const saveLibrary = useCallback((items: ConsumableItem[]) => {
    setLibrary(items);
    localStorage.setItem(LIB_KEY, JSON.stringify(items));
  }, []);

  const saveRows = useCallback((r: ConsumableRow[]) => {
    setRows(r);
    localStorage.setItem(ROWS_KEY, JSON.stringify(r));
  }, []);

  const saveProfitPct = useCallback((p: number) => {
    setProfitPct(p);
    localStorage.setItem(PROFIT_KEY, JSON.stringify(p));
  }, []);

  const updateRow = useCallback((rowId: string, updates: Partial<ConsumableRow>) => {
    setRows(prev => {
      const next = prev.map(r => r.id === rowId ? { ...r, ...updates } : r);
      localStorage.setItem(ROWS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const addRowToCategory = useCallback((category: ConsumableCategory) => {
    setRows(prev => {
      const newRow = createBlankRowsForCategory(category)[0];
      // insert after last row of this category
      const lastIdx = prev.reduce((acc, r, i) => r.category === category ? i : acc, -1);
      const next = [...prev];
      next.splice(lastIdx + 1, 0, newRow);
      localStorage.setItem(ROWS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const deleteRow = useCallback((rowId: string) => {
    setRows(prev => {
      const next = prev.filter(r => r.id !== rowId);
      localStorage.setItem(ROWS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const itemsByCategory = useMemo(() => {
    const map: Record<string, ConsumableItem[]> = {};
    for (const cat of CONSUMABLE_CATEGORIES) map[cat] = [];
    for (const item of library) {
      if (item.active && map[item.category]) map[item.category].push(item);
    }
    return map;
  }, [library]);

  const rowsByCategory = useMemo(() => {
    const map: Record<string, ConsumableRow[]> = {};
    for (const cat of CONSUMABLE_CATEGORIES) map[cat] = [];
    for (const row of rows) {
      if (map[row.category]) map[row.category].push(row);
    }
    return map;
  }, [rows]);

  const profitRate = profitPct / 100;

  const totals = useMemo(() => {
    let totalCost = 0;
    let totalProfit = 0;
    for (const row of rows) {
      if (!row.description || row.unitsPA == null || row.unitsPA <= 0) continue;
      const cost = row.unitCost * row.unitsPA;
      const profit = cost * profitRate;
      totalCost += cost;
      totalProfit += profit;
    }
    return {
      totalCostPA: totalCost,
      totalProfit,
      totalPricePA: totalCost + totalProfit,
    };
  }, [rows, profitRate]);

  return {
    library,
    saveLibrary,
    rows,
    rowsByCategory,
    updateRow,
    addRowToCategory,
    deleteRow,
    profitPct,
    saveProfitPct,
    profitRate,
    totals,
    itemsByCategory,
  };
}
