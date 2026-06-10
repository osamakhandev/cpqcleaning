import { useState, useEffect, useCallback } from 'react';
import type { OperatorLevel, ServiceType } from '@/types/roster';
import type { RateBand } from './rateData';

const STORAGE_KEY = 'cpq-wage-settings';

export interface WageServiceConfig {
  levels: Record<OperatorLevel, number>; // annual wage per level
  loadings: {
    afterHours: number;  // multiplier for 18:00–06:00 weekdays
    saturday: number;    // multiplier for all Saturday hours
    sunday: number;      // multiplier for all Sunday hours
    publicHoliday: number; // multiplier for PH
  };
}

export interface WageSettings {
  maintenance: WageServiceConfig;
  management: WageServiceConfig;
}

const ANNUAL_HOURS = 1981.32; // 52.14 * 38

const defaultMaintenanceConfig = (): WageServiceConfig => ({
  levels: { 'level-1': 70000, 'level-2': 75000, 'level-3': 85000, 'level-4': 95000, 'level-5': 100000 },
  loadings: { afterHours: 1.0, saturday: 1.0, sunday: 1.0, publicHoliday: 1.0 },
});

const defaultManagementConfig = (): WageServiceConfig => ({
  levels: { 'level-1': 90000, 'level-2': 100000, 'level-3': 110000, 'level-4': 120000, 'level-5': 130000 },
  loadings: { afterHours: 1.0, saturday: 1.0, sunday: 1.0, publicHoliday: 1.0 },
});

const defaultSettings = (): WageSettings => ({
  maintenance: defaultMaintenanceConfig(),
  management: defaultManagementConfig(),
});

export function calculateBaseHourly(annualWage: number): number {
  if (annualWage <= 0) return 0;
  return annualWage / ANNUAL_HOURS;
}

export interface WageHourlyRates {
  base: number;
  afterHours: number;
  saturday: number;
  sunday: number;
  publicHoliday: number;
}

export function getWageHourlyRates(annualWage: number, loadings: WageServiceConfig['loadings']): WageHourlyRates {
  const base = calculateBaseHourly(annualWage);
  return {
    base,
    afterHours: base * loadings.afterHours,
    saturday: base * loadings.saturday,
    sunday: base * loadings.sunday,
    publicHoliday: base * loadings.publicHoliday,
  };
}

/** Map a RateBand to the corresponding wage-derived rate */
export function getWageRateForBand(rates: WageHourlyRates, band: RateBand): number {
  switch (band) {
    case 'WKDAY_DAY': return rates.base;
    case 'WKDAY_EMAFT': return rates.afterHours;
    case 'WKDAY_PENALTY': return rates.afterHours; // Cleaning penalty uses same loading as after hours
    case 'WKDAY_PERM_NIGHT': return rates.afterHours; // same loading as after hours
    case 'SAT_FLAT': return rates.saturday;
    case 'SUN_FLAT': return rates.sunday;
    case 'PH_FLAT': return rates.publicHoliday;
    default: return rates.base;
  }
}

function loadSettings(): WageSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      const defaults = defaultSettings();
      return {
        maintenance: { ...defaults.maintenance, ...parsed.maintenance, levels: { ...defaults.maintenance.levels, ...parsed.maintenance?.levels }, loadings: { ...defaults.maintenance.loadings, ...parsed.maintenance?.loadings } },
        management: { ...defaults.management, ...parsed.management, levels: { ...defaults.management.levels, ...parsed.management?.levels }, loadings: { ...defaults.management.loadings, ...parsed.management?.loadings } },
      };
    }
  } catch (e) {
    console.error('Failed to load wage settings:', e);
  }
  return defaultSettings();
}

function saveSettings(settings: WageSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save wage settings:', e);
  }
}

export function useWageSettings() {
  const [settings, setSettings] = useState<WageSettings>(defaultSettings);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setSettings(loadSettings());
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (isLoaded) saveSettings(settings);
  }, [settings, isLoaded]);

  const updateService = useCallback((
    service: 'maintenance' | 'management',
    updates: Partial<WageServiceConfig>
  ) => {
    setSettings(prev => ({
      ...prev,
      [service]: {
        ...prev[service],
        ...updates,
        levels: { ...prev[service].levels, ...updates.levels },
        loadings: { ...prev[service].loadings, ...updates.loadings },
      },
    }));
  }, []);

  const updateLevelWage = useCallback((
    service: 'maintenance' | 'management',
    level: OperatorLevel,
    wage: number
  ) => {
    setSettings(prev => ({
      ...prev,
      [service]: {
        ...prev[service],
        levels: { ...prev[service].levels, [level]: wage },
      },
    }));
  }, []);

  const updateLoading = useCallback((
    service: 'maintenance' | 'management',
    key: keyof WageServiceConfig['loadings'],
    value: number
  ) => {
    setSettings(prev => ({
      ...prev,
      [service]: {
        ...prev[service],
        loadings: { ...prev[service].loadings, [key]: value },
      },
    }));
  }, []);

  const getConfigForOperator = useCallback((
    service: ServiceType,
    level: OperatorLevel
  ): { annualWage: number; rates: WageHourlyRates } | null => {
    if (service !== 'maintenance' && service !== 'management') return null;
    const config = settings[service];
    const annualWage = config.levels[level] ?? 0;
    return {
      annualWage,
      rates: getWageHourlyRates(annualWage, config.loadings),
    };
  }, [settings]);

  return { settings, isLoaded, updateService, updateLevelWage, updateLoading, getConfigForOperator };
}

/** Standalone loader for use outside React (e.g., in calculation modules) */
export function loadWageSettingsSync(): WageSettings {
  return loadSettings();
}
