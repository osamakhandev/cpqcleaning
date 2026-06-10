import { useState, useCallback, useMemo, useEffect } from 'react';

const STORAGE_KEY = 'cpq-sundry-tables';

// ── Types ──

export interface FuelRow {
  id: string;
  item: string;
  costPerUnitPerWeek: number;
  units: number;
  notes: string;
}

export interface RepairRow {
  id: string;
  equipment: string;
  comments: string;
  quantity: number;
  frequencyPA: number;
  cost: number;
}

export interface UniformAllocationRow {
  id: string;
  itemAllocation: string;
  noEmployees: number;
  suits: number;
  pants: number;
  shirts: number;
  polo: number;
  jacket: number;
  nameBadges: number;
  aprons: number;
  jumper: number;
  vests: number;
}

export interface UniformUnitCosts {
  suits: number;
  pants: number;
  shirts: number;
  polo: number;
  jacket: number;
  nameBadges: number;
  aprons: number;
  jumper: number;
  vests: number;
}

export interface CommunicationRow {
  id: string;
  item: string;
  unitQuantity: number;
  weeklyValuePerUnit: number;
}

export interface ChemicalsRow {
  id: string;
  item: string;
  costPerUnitPerWeek: number;
  units: number;
}

export interface SundryTablesState {
  fuel: FuelRow[];
  repairs: RepairRow[];
  uniformRows: UniformAllocationRow[];
  uniformUnitCosts: UniformUnitCosts;
  uniformMargin: number;
  communication: CommunicationRow[];
  chemicals: ChemicalsRow[];
}

const uid = () => crypto.randomUUID().slice(0, 8);

const DEFAULT_UNIFORM_COSTS: UniformUnitCosts = {
  suits: 1000, pants: 44, shirts: 45, polo: 18.50,
  jacket: 85, nameBadges: 2.50, aprons: 25, jumper: 48, vests: 41,
};

const DEFAULT_STATE: SundryTablesState = {
  fuel: [
    { id: uid(), item: 'Gazda', costPerUnitPerWeek: 0, units: 0, notes: '' },
    { id: uid(), item: 'Ride on Sweeper', costPerUnitPerWeek: 0, units: 0, notes: '' },
    { id: uid(), item: 'Ride on Scrubber', costPerUnitPerWeek: 0, units: 0, notes: '' },
    { id: uid(), item: 'Ride on Sweeper/Scrubber', costPerUnitPerWeek: 0, units: 0, notes: '' },
    { id: uid(), item: 'Car', costPerUnitPerWeek: 0, units: 0, notes: '' },
  ],
  repairs: [
    { id: uid(), equipment: '', comments: '', quantity: 0, frequencyPA: 0, cost: 0 },
    { id: uid(), equipment: '', comments: '', quantity: 0, frequencyPA: 0, cost: 0 },
  ],
  uniformRows: [
    { id: uid(), itemAllocation: 'Site Managers', noEmployees: 0, suits: 0, pants: 0, shirts: 0, polo: 0, jacket: 0, nameBadges: 0, aprons: 0, jumper: 0, vests: 0 },
    { id: uid(), itemAllocation: 'Site Supervisors', noEmployees: 0, suits: 0, pants: 0, shirts: 0, polo: 0, jacket: 0, nameBadges: 0, aprons: 0, jumper: 0, vests: 0 },
    { id: uid(), itemAllocation: 'F/T Cleaners', noEmployees: 0, suits: 0, pants: 0, shirts: 0, polo: 0, jacket: 0, nameBadges: 0, aprons: 0, jumper: 0, vests: 0 },
    { id: uid(), itemAllocation: 'P/T Cleaners', noEmployees: 0, suits: 0, pants: 0, shirts: 0, polo: 0, jacket: 0, nameBadges: 0, aprons: 0, jumper: 0, vests: 0 },
    { id: uid(), itemAllocation: 'Night Cleaners', noEmployees: 0, suits: 0, pants: 0, shirts: 0, polo: 0, jacket: 0, nameBadges: 0, aprons: 0, jumper: 0, vests: 0 },
    { id: uid(), itemAllocation: 'External Cleaners', noEmployees: 0, suits: 0, pants: 0, shirts: 0, polo: 0, jacket: 0, nameBadges: 0, aprons: 0, jumper: 0, vests: 0 },
  ],
  uniformUnitCosts: DEFAULT_UNIFORM_COSTS,
  uniformMargin: 5.0,
  communication: [
    { id: uid(), item: 'Internet connection Contract Cost', unitQuantity: 0, weeklyValuePerUnit: 0 },
    { id: uid(), item: 'Tablet Data Cost', unitQuantity: 0, weeklyValuePerUnit: 0 },
    { id: uid(), item: 'Mobile Data Cost', unitQuantity: 0, weeklyValuePerUnit: 0 },
  ],
  chemicals: [
    { id: uid(), item: 'Chemicals', costPerUnitPerWeek: 0, units: 0 },
    { id: uid(), item: 'Mops, buckets etc', costPerUnitPerWeek: 0, units: 0 },
    { id: uid(), item: 'other', costPerUnitPerWeek: 0, units: 0 },
    { id: uid(), item: 'other', costPerUnitPerWeek: 0, units: 0 },
    { id: uid(), item: 'other', costPerUnitPerWeek: 0, units: 0 },
  ],
};

function loadState(): SundryTablesState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_STATE;
}

export const UNIFORM_ITEMS = ['suits', 'pants', 'shirts', 'polo', 'jacket', 'nameBadges', 'aprons', 'jumper', 'vests'] as const;
export type UniformItemKey = typeof UNIFORM_ITEMS[number];
export const UNIFORM_LABELS: Record<UniformItemKey, string> = {
  suits: 'Suits', pants: 'Pants', shirts: 'Shirts', polo: 'Polo',
  jacket: 'Jacket', nameBadges: 'Name Badges', aprons: 'Aprons', jumper: 'Jumper', vests: 'Vests',
};

export function useSundryTables() {
  const [state, setState] = useState<SundryTablesState>(loadState);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const update = useCallback((patch: Partial<SundryTablesState>) => {
    setState(prev => ({ ...prev, ...patch }));
  }, []);

  // ── Fuel helpers ──
  const updateFuelRow = useCallback((id: string, patch: Partial<FuelRow>) => {
    setState(prev => ({ ...prev, fuel: prev.fuel.map(r => r.id === id ? { ...r, ...patch } : r) }));
  }, []);
  const addFuelRow = useCallback(() => {
    setState(prev => ({ ...prev, fuel: [...prev.fuel, { id: uid(), item: '', costPerUnitPerWeek: 0, units: 0, notes: '' }] }));
  }, []);
  const deleteFuelRow = useCallback((id: string) => {
    setState(prev => ({ ...prev, fuel: prev.fuel.filter(r => r.id !== id) }));
  }, []);

  // ── Repairs helpers ──
  const updateRepairRow = useCallback((id: string, patch: Partial<RepairRow>) => {
    setState(prev => ({ ...prev, repairs: prev.repairs.map(r => r.id === id ? { ...r, ...patch } : r) }));
  }, []);
  const addRepairRow = useCallback(() => {
    setState(prev => ({ ...prev, repairs: [...prev.repairs, { id: uid(), equipment: '', comments: '', quantity: 0, frequencyPA: 0, cost: 0 }] }));
  }, []);
  const deleteRepairRow = useCallback((id: string) => {
    setState(prev => ({ ...prev, repairs: prev.repairs.filter(r => r.id !== id) }));
  }, []);

  // ── Uniform helpers ──
  const updateUniformRow = useCallback((id: string, patch: Partial<UniformAllocationRow>) => {
    setState(prev => ({ ...prev, uniformRows: prev.uniformRows.map(r => r.id === id ? { ...r, ...patch } : r) }));
  }, []);
  const addUniformRow = useCallback(() => {
    setState(prev => ({
      ...prev,
      uniformRows: [...prev.uniformRows, { id: uid(), itemAllocation: '', noEmployees: 0, suits: 0, pants: 0, shirts: 0, polo: 0, jacket: 0, nameBadges: 0, aprons: 0, jumper: 0, vests: 0 }],
    }));
  }, []);
  const deleteUniformRow = useCallback((id: string) => {
    setState(prev => ({ ...prev, uniformRows: prev.uniformRows.filter(r => r.id !== id) }));
  }, []);
  const updateUniformCost = useCallback((key: UniformItemKey, val: number) => {
    setState(prev => ({ ...prev, uniformUnitCosts: { ...prev.uniformUnitCosts, [key]: val } }));
  }, []);
  const setUniformMargin = useCallback((val: number) => {
    setState(prev => ({ ...prev, uniformMargin: val }));
  }, []);

  // ── Communication helpers ──
  const updateCommRow = useCallback((id: string, patch: Partial<CommunicationRow>) => {
    setState(prev => ({ ...prev, communication: prev.communication.map(r => r.id === id ? { ...r, ...patch } : r) }));
  }, []);
  const addCommRow = useCallback(() => {
    setState(prev => ({ ...prev, communication: [...prev.communication, { id: uid(), item: '', unitQuantity: 0, weeklyValuePerUnit: 0 }] }));
  }, []);
  const deleteCommRow = useCallback((id: string) => {
    setState(prev => ({ ...prev, communication: prev.communication.filter(r => r.id !== id) }));
  }, []);

  // ── Chemicals helpers ──
  const updateChemRow = useCallback((id: string, patch: Partial<ChemicalsRow>) => {
    setState(prev => ({ ...prev, chemicals: prev.chemicals.map(r => r.id === id ? { ...r, ...patch } : r) }));
  }, []);
  const addChemRow = useCallback(() => {
    setState(prev => ({ ...prev, chemicals: [...prev.chemicals, { id: uid(), item: '', costPerUnitPerWeek: 0, units: 0 }] }));
  }, []);
  const deleteChemRow = useCallback((id: string) => {
    setState(prev => ({ ...prev, chemicals: prev.chemicals.filter(r => r.id !== id) }));
  }, []);

  // ── Computed totals ──

  const fuelTotals = useMemo(() => {
    const weekly = state.fuel.reduce((s, r) => s + r.costPerUnitPerWeek * r.units, 0);
    return { weekly, monthly: weekly * 52.14 / 12, annual: weekly * 52.14 };
  }, [state.fuel]);

  const repairTotals = useMemo(() => {
    const annual = state.repairs.reduce((s, r) => s + r.quantity * r.frequencyPA * r.cost, 0);
    return { weekly: annual / 52.14, monthly: annual / 12, annual };
  }, [state.repairs]);

  const uniformTotals = useMemo(() => {
    const totalsPerItem: Record<UniformItemKey, number> = {} as any;
    UNIFORM_ITEMS.forEach(k => { totalsPerItem[k] = 0; });
    state.uniformRows.forEach(row => {
      UNIFORM_ITEMS.forEach(k => {
        totalsPerItem[k] += row.noEmployees * row[k];
      });
    });
    const margin = 1 + state.uniformMargin / 100;
    let annual = 0;
    const costPerItem: Record<UniformItemKey, number> = {} as any;
    UNIFORM_ITEMS.forEach(k => {
      const base = totalsPerItem[k] * state.uniformUnitCosts[k];
      costPerItem[k] = base * margin;
      annual += costPerItem[k];
    });
    return { totalsPerItem, costPerItem, annual, weekly: annual / 52.14, monthly: annual / 12 };
  }, [state.uniformRows, state.uniformUnitCosts, state.uniformMargin]);

  const commTotals = useMemo(() => {
    const weekly = state.communication.reduce((s, r) => s + r.unitQuantity * r.weeklyValuePerUnit, 0);
    return { weekly, monthly: weekly * 52.14 / 12, annual: weekly * 52.14 };
  }, [state.communication]);

  const chemTotals = useMemo(() => {
    const weekly = state.chemicals.reduce((s, r) => s + r.costPerUnitPerWeek * r.units, 0);
    return { weekly, monthly: weekly * 52.14 / 12, annual: weekly * 52.14 };
  }, [state.chemicals]);

  return {
    ...state,
    updateFuelRow, addFuelRow, deleteFuelRow, fuelTotals,
    updateRepairRow, addRepairRow, deleteRepairRow, repairTotals,
    updateUniformRow, addUniformRow, deleteUniformRow, updateUniformCost, setUniformMargin, uniformTotals,
    updateCommRow, addCommRow, deleteCommRow, commTotals,
    updateChemRow, addChemRow, deleteChemRow, chemTotals,
  };
}
