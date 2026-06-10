import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  type EquipmentLibraryItem,
  SEED_EQUIPMENT_LIBRARY,
  MAJOR_CATEGORIES,
  calcAnnualCost,
} from '@/lib/equipmentData';

// ── Storage keys ──
const LIBRARY_KEY = 'cpq-equipment-library';
const MAJOR_ROWS_KEY = 'cpq-equipment-major-rows';
const MINOR_ROWS_KEY = 'cpq-equipment-minor-rows';
const EQUIP_SETTINGS_KEY = 'cpq-equipment-settings';

// ── Types ──

export interface MajorEquipmentRow {
  id: string;
  category: string;
  library_item_id: string | null;
  model: string;
  life_years: number;
  interest_rate: number; // decimal
  unit_cost_ex_gst: number;
  units: number;
}

export interface MinorEquipmentRow {
  id: string;
  library_item_id: string | null;
  item_name: string;
  life_years: number;
  interest_rate: number;
  unit_cost_ex_gst: number;
  units: number;
}

export interface EquipmentSettings {
  major_life_years_default: number;
  major_interest_rate_default: number;
  minor_life_years_default: number;
  minor_interest_rate_default: number;
  allocation_method: 'labour_hours' | 'equal_split' | 'manual_percent';
  leapYearApply: boolean;
}

const DEFAULT_SETTINGS: EquipmentSettings = {
  major_life_years_default: 5,
  major_interest_rate_default: 0,
  minor_life_years_default: 3,
  minor_interest_rate_default: 0,
  allocation_method: 'labour_hours',
  leapYearApply: true,
};

// ── Load/save helpers ──

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : fallback;
  } catch { return fallback; }
}

function saveJSON(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

// ── Hook ──

export function useEquipmentDepreciation() {
  // Library
  const [library, setLibrary] = useState<EquipmentLibraryItem[]>(() =>
    loadJSON(LIBRARY_KEY, SEED_EQUIPMENT_LIBRARY)
  );

  // Settings
  const [settings, setSettings] = useState<EquipmentSettings>(() =>
    loadJSON(EQUIP_SETTINGS_KEY, DEFAULT_SETTINGS)
  );

  // Major rows – one per category (pre-seeded)
  const [majorRows, setMajorRows] = useState<MajorEquipmentRow[]>(() => {
    const stored = loadJSON<MajorEquipmentRow[] | null>(MAJOR_ROWS_KEY, null);
    if (stored && stored.length > 0) return stored;
    return MAJOR_CATEGORIES.map(cat => ({
      id: crypto.randomUUID(),
      category: cat,
      library_item_id: null,
      model: '',
      life_years: 5,
      interest_rate: 0,
      unit_cost_ex_gst: 0,
      units: 0,
    }));
  });

  // Minor rows – pre-seed 10 empty rows if none stored
  const [minorRows, setMinorRows] = useState<MinorEquipmentRow[]>(() => {
    const stored = loadJSON<MinorEquipmentRow[] | null>(MINOR_ROWS_KEY, null);
    if (stored && stored.length > 0) return stored;
    return Array.from({ length: 10 }, () => ({
      id: crypto.randomUUID(),
      library_item_id: null,
      item_name: '',
      life_years: DEFAULT_SETTINGS.minor_life_years_default,
      interest_rate: DEFAULT_SETTINGS.minor_interest_rate_default,
      unit_cost_ex_gst: 0,
      units: 0,
    }));
  });

  // Persist
  useEffect(() => { saveJSON(LIBRARY_KEY, library); }, [library]);
  useEffect(() => { saveJSON(MAJOR_ROWS_KEY, majorRows); }, [majorRows]);
  useEffect(() => { saveJSON(MINOR_ROWS_KEY, minorRows); }, [minorRows]);
  useEffect(() => { saveJSON(EQUIP_SETTINGS_KEY, settings); }, [settings]);

  // ── Library CRUD ──
  const updateLibrary = useCallback((items: EquipmentLibraryItem[]) => setLibrary(items), []);

  const addLibraryItem = useCallback((item: Omit<EquipmentLibraryItem, 'id'>): boolean => {
    // Duplicate check: same type + category + item_name (case-insensitive)
    const isDup = library.some(
      existing =>
        existing.type === item.type &&
        existing.category.toLowerCase().trim() === item.category.toLowerCase().trim() &&
        existing.item_name.toLowerCase().trim() === item.item_name.toLowerCase().trim()
    );
    if (isDup) return false;
    setLibrary(prev => [...prev, { ...item, id: crypto.randomUUID() }]);
    return true;
  }, [library]);

  const deleteLibraryItem = useCallback((id: string) => {
    setLibrary(prev => prev.filter(i => i.id !== id));
  }, []);

  const updateLibraryItem = useCallback((id: string, updates: Partial<EquipmentLibraryItem>) => {
    setLibrary(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
  }, []);

  // ── Settings ──
  const updateSettings = useCallback((updates: Partial<EquipmentSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  }, []);

  // ── Major rows ──
  const addMajorRow = useCallback(() => {
    setMajorRows(prev => [...prev, {
      id: crypto.randomUUID(),
      category: '',
      library_item_id: null,
      model: '',
      life_years: settings.major_life_years_default,
      interest_rate: settings.major_interest_rate_default,
      unit_cost_ex_gst: 0,
      units: 0,
    }]);
  }, [settings]);

  const updateMajorRow = useCallback((id: string, updates: Partial<MajorEquipmentRow>) => {
    setMajorRows(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  }, []);

  const deleteMajorRow = useCallback((id: string) => {
    setMajorRows(prev => prev.filter(r => r.id !== id));
  }, []);

  const selectMajorModel = useCallback((rowId: string, libraryItemId: string) => {
    const item = library.find(i => i.id === libraryItemId);
    if (!item) return;
    setMajorRows(prev => prev.map(r => r.id === rowId ? {
      ...r,
      library_item_id: libraryItemId,
      model: item.item_name,
      unit_cost_ex_gst: item.default_unit_cost_ex_gst,
      interest_rate: item.default_interest_rate || settings.major_interest_rate_default,
      life_years: item.default_life_years || settings.major_life_years_default,
    } : r));
  }, [library, settings]);

  // ── Minor rows ──
  const addMinorRow = useCallback(() => {
    setMinorRows(prev => [...prev, {
      id: crypto.randomUUID(),
      library_item_id: null,
      item_name: '',
      life_years: settings.minor_life_years_default,
      interest_rate: settings.minor_interest_rate_default,
      unit_cost_ex_gst: 0,
      units: 0,
    }]);
  }, [settings]);

  const updateMinorRow = useCallback((id: string, updates: Partial<MinorEquipmentRow>) => {
    setMinorRows(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  }, []);

  const deleteMinorRow = useCallback((id: string) => {
    setMinorRows(prev => prev.filter(r => r.id !== id));
  }, []);

  const selectMinorItem = useCallback((rowId: string, libraryItemId: string) => {
    const item = library.find(i => i.id === libraryItemId);
    if (!item) return;
    setMinorRows(prev => prev.map(r => r.id === rowId ? {
      ...r,
      library_item_id: libraryItemId,
      item_name: item.item_name,
      unit_cost_ex_gst: item.default_unit_cost_ex_gst,
      interest_rate: item.default_interest_rate || settings.minor_interest_rate_default,
      life_years: item.default_life_years || settings.minor_life_years_default,
    } : r));
  }, [library, settings]);

  // ── Computed totals ──
  const majorComputed = useMemo(() => {
    const N = settings.major_life_years_default;
    const r = settings.major_interest_rate_default;
    return majorRows.map(row => {
      const purchaseCost = row.unit_cost_ex_gst * row.units;
      const hasEntry = (row.model || row.category) && row.units > 0;
      const annualCost = hasEntry ? calcAnnualCost(purchaseCost, N, r) : 0;
      return { ...row, purchaseCost, annualCost };
    });
  }, [majorRows, settings.major_life_years_default, settings.major_interest_rate_default]);

  const minorComputed = useMemo(() => {
    const N = settings.minor_life_years_default;
    const r = settings.minor_interest_rate_default;
    return minorRows.map(row => {
      const purchaseCost = row.unit_cost_ex_gst * row.units;
      const annualCost = (row.item_name && row.units > 0)
        ? calcAnnualCost(purchaseCost, N, r)
        : 0;
      return { ...row, purchaseCost, annualCost };
    });
  }, [minorRows, settings.minor_life_years_default, settings.minor_interest_rate_default]);

  const totalMajorPurchase = majorComputed.reduce((s, r) => s + r.purchaseCost, 0);
  const annualAmortisationMajor = majorComputed.reduce((s, r) => s + r.annualCost, 0);
  const totalMinorPurchase = minorComputed.reduce((s, r) => s + r.purchaseCost, 0);
  const annualAmortisationMinorBase = minorComputed.reduce((s, r) => s + r.annualCost, 0);

  // Leap year price is added externally via props; the hook exposes settings.leapYearApply
  // The actual leapYearCharge value is passed to the component, not stored here.
  // annualAmortisationMinor includes leap year price when provided externally.
  // We expose the base value; the component adds the leap year price on top.
  const annualAmortisationMinor = annualAmortisationMinorBase;
  const annualAmortisationTotal = annualAmortisationMajor + annualAmortisationMinor;

  // Categories from library
  const majorLibraryItems = useMemo(() => library.filter(i => i.type === 'major' && i.active), [library]);
  const minorLibraryItems = useMemo(() => library.filter(i => i.type === 'minor' && i.active), [library]);
  const majorCategories = useMemo(() => [...new Set(majorLibraryItems.map(i => i.category))], [majorLibraryItems]);

  return {
    // Library
    library, updateLibrary, addLibraryItem, deleteLibraryItem, updateLibraryItem,
    majorLibraryItems, minorLibraryItems, majorCategories,
    // Settings
    settings, updateSettings,
    // Major
    majorRows: majorComputed, addMajorRow, updateMajorRow, deleteMajorRow, selectMajorModel,
    // Minor
    minorRows: minorComputed, addMinorRow, updateMinorRow, deleteMinorRow, selectMinorItem,
    // Totals
    totalMajorPurchase, annualAmortisationMajor,
    totalMinorPurchase, annualAmortisationMinor,
    annualAmortisationTotal,
  };
}
