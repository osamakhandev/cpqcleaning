import { useMemo, useState, useCallback, useEffect } from 'react';
import { useRosterStore } from '@/contexts/RosterContext';
import { calculateOperatorWeek } from '@/lib/rosterCalculations';
import { calculateShiftCost, formatCurrency, type ShiftCost } from '@/lib/costingCalculations';
import { calculateSecurityAllowances, calculateCleaningAllowances, type AllowanceBreakdown } from '@/lib/securityAllowances';
import { useWageSettings } from '@/lib/wageSettings';
import { DAYS_OF_WEEK } from '@/types/roster';
import type { OperatorCalculations, DayOfWeek, ServiceType, EmploymentType } from '@/types/roster';
import { getPublicHolidays } from '@/lib/publicHolidays';
import { calculateLeapYearCharge, type LeapYearChargeResult } from '@/lib/leapYearCharge';
import { calcAnnualCost } from '@/lib/equipmentData';
import { UNIFORM_ITEMS, type UniformItemKey } from '@/hooks/useSundryTables';

const SERVICES_ORDER: ServiceType[] = ['cleaning', 'customer-service', 'security', 'maintenance', 'management'];

const SERVICE_HEADINGS: Record<ServiceType, string> = {
  cleaning: 'Cleaning',
  'customer-service': 'Customer Service',
  security: 'Security',
  maintenance: 'Maintenance',
  management: 'Management',
  landscape: 'Landscape',
};

type DayGroup = 'mon-fri' | 'sat' | 'sun';
type EmpDayKey = `${'ft' | 'pt' | 'casual'}-${DayGroup}`;

const ROW_DEFS: { key: EmpDayKey; label: string; et: EmploymentType; dayGroup: DayGroup }[] = [
  { key: 'ft-mon-fri', label: 'Full Time Staff - Monday to Friday', et: 'full-time', dayGroup: 'mon-fri' },
  { key: 'pt-mon-fri', label: 'Part Time Staff - Monday to Friday', et: 'part-time', dayGroup: 'mon-fri' },
  { key: 'ft-sat', label: 'Full Time Staff - Saturday', et: 'full-time', dayGroup: 'sat' },
  { key: 'pt-sat', label: 'Part Time Staff - Saturday', et: 'part-time', dayGroup: 'sat' },
  { key: 'ft-sun', label: 'Full Time Staff - Sunday', et: 'full-time', dayGroup: 'sun' },
  { key: 'pt-sun', label: 'Part Time Staff - Sunday', et: 'part-time', dayGroup: 'sun' },
  { key: 'casual-mon-fri', label: 'Casual Staff - Monday to Friday', et: 'casual', dayGroup: 'mon-fri' },
  { key: 'casual-sat', label: 'Casual Staff - Saturday', et: 'casual', dayGroup: 'sat' },
  { key: 'casual-sun', label: 'Casual Staff - Sunday', et: 'casual', dayGroup: 'sun' },
];

const WEEKDAYS: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri'];

const normalizeService = (value: unknown): ServiceType => {
  if (value === 'cleaning' || value === 'customer-service' || value === 'security' ||
    value === 'maintenance' || value === 'landscape' || value === 'management') return value;
  return 'cleaning';
};

function fmt(val: number | null | undefined): string {
  if (val === null || val === undefined || val === 0) return '–';
  return formatCurrency(val);
}

function fmtHrs(val: number | null | undefined): string {
  if (val === null || val === undefined || val === 0) return '–';
  return val.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(val: number): string {
  return val.toFixed(2) + '%';
}

// ── State / Territory types ─────────────────────────────────────

export type AustralianState = 'ACT' | 'NSW' | 'VIC' | 'QLD' | 'SA' | 'WA' | 'TAS' | 'NT';
export const AUSTRALIAN_STATES: AustralianState[] = ['ACT', 'NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT'];

// ── Levy tables ─────────────────────────────────────────────────

const LSL_CLEANING_LEVIES: Record<AustralianState, number> = {
  ACT: 1.07, NSW: 1.00, QLD: 0.75, VIC: 1.80,
  SA: 0, WA: 0, TAS: 0, NT: 0,
};

const LSL_SECURITY_LEVIES: Record<AustralianState, number> = {
  ACT: 1.47, VIC: 1.80,
  NSW: 0, QLD: 0, SA: 0, WA: 0, TAS: 0, NT: 0,
};

const PAYROLL_TAX_RATES: Record<AustralianState, number> = {
  ACT: 6.85, NSW: 5.45, VIC: 4.85, QLD: 4.75,
  SA: 4.95, WA: 5.50, TAS: 4.00, NT: 5.50,
};

export const PAYROLL_TAX_THRESHOLDS: Record<AustralianState, number> = {
  ACT: 2000000, NSW: 1200000, VIC: 900000, QLD: 1300000,
  SA: 1500000, WA: 1000000, TAS: 1250000, NT: 1500000,
};

// ── Job details persistence ─────────────────────────────────────

const JOB_DETAILS_KEY = 'cpq-job-details';

export interface JobDetails {
  jobName: string;
  jobState: AustralianState;
  clientName: string;
  channel: string;
  date: string;
  jobAddress: string;
  jobBuildingName: string;
  customer: string;
  cleaningArea: string;
  smallStandaloneSite: boolean;
  contractCommencementMonth: string;
  tenderDueDate: string;
  publicHolidayIncluded: boolean | null;
  sundayRosterForPublicHolidays: boolean | null;
  phIncludedServices: ServiceType[];
  contractLengthYears: number;
  contractPriceCondition: 'Fixed Price' | 'CPI' | 'Other';
  fixedYears: number;
  forecastWageRiseYear1: number;
  forecastJulyIncrease: number;
  fixedPriceSchedule: { increaseForecast: number }[];
  manualYear1Factor: number | null;
  adminTrainingLabel: string;
}

const DEFAULT_FIXED_PRICE_SCHEDULE = Array.from({ length: 10 }, () => ({ increaseForecast: 0 }));

const STATUTORY_RATES_KEY = 'cpq-statutory-rates';


const loadJobDetails = (): JobDetails => {
  try {
    const stored = localStorage.getItem(JOB_DETAILS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        jobName: parsed.jobName ?? '',
        jobState: AUSTRALIAN_STATES.includes(parsed.jobState) ? parsed.jobState : 'NSW',
        clientName: parsed.clientName ?? '',
        channel: parsed.channel ?? '',
        date: parsed.date ?? new Date().toISOString().slice(0, 10),
        jobAddress: parsed.jobAddress ?? '',
        jobBuildingName: parsed.jobBuildingName ?? '',
        customer: parsed.customer ?? '',
        cleaningArea: parsed.cleaningArea ?? '',
        smallStandaloneSite: parsed.smallStandaloneSite ?? false,
        contractCommencementMonth: parsed.contractCommencementMonth ?? '',
        tenderDueDate: parsed.tenderDueDate ?? '',
        publicHolidayIncluded: parsed.publicHolidayIncluded ?? null,
        sundayRosterForPublicHolidays: parsed.sundayRosterForPublicHolidays ?? null,
        phIncludedServices: Array.isArray(parsed.phIncludedServices) ? parsed.phIncludedServices : [],
        contractLengthYears: parsed.contractLengthYears ?? 5,
        contractPriceCondition: parsed.contractPriceCondition ?? 'Fixed Price',
        fixedYears: parsed.fixedYears ?? 5,
        forecastWageRiseYear1: parsed.forecastWageRiseYear1 ?? 0,
        forecastJulyIncrease: parsed.forecastJulyIncrease ?? 0,
        fixedPriceSchedule: parsed.fixedPriceSchedule ?? DEFAULT_FIXED_PRICE_SCHEDULE,
        // Migrate debugYear1FactorOverride → manualYear1Factor
        manualYear1Factor: parsed.manualYear1Factor ?? parsed.debugYear1FactorOverride ?? parsed.debugFactorOverride ?? null,
        adminTrainingLabel: parsed.adminTrainingLabel ?? 'Administration',
      };
    }
  } catch {}
  return {
    jobName: '', jobState: 'NSW', clientName: '', channel: '',
    date: new Date().toISOString().slice(0, 10),
    jobAddress: '', jobBuildingName: '', customer: '',
    cleaningArea: '', smallStandaloneSite: false, contractCommencementMonth: '', tenderDueDate: '',
    publicHolidayIncluded: null, sundayRosterForPublicHolidays: null,
    phIncludedServices: [],
    contractLengthYears: 5, contractPriceCondition: 'Fixed Price',
    fixedYears: 5, forecastWageRiseYear1: 0, forecastJulyIncrease: 0,
    fixedPriceSchedule: DEFAULT_FIXED_PRICE_SCHEDULE,
    manualYear1Factor: null,
    adminTrainingLabel: 'Administration',
  };
};

// ── Sundry item definitions ─────────────────────────────────────

export type SundryRateSource = 'default' | 'custom' | 'calculator';

export interface SundryItemState {
  id: string;
  label: string;
  defaultPct: number;
  customPct: number;
  source: SundryRateSource;
  calculatorTotal: number;
}

interface LineItem { id: string; label: string; pct: number; }

const DEFAULT_SUNDRY: LineItem[] = [
  { id: 'uniform', label: 'Uniform Allowance', pct: 0.70 },
  { id: 'chemicals', label: 'Chemicals & Supplies', pct: 4.00 },
  { id: 'fuel', label: 'Fuel (Petrol / Gas, etc)', pct: 0.50 },
  { id: 'equip-deprec', label: 'Equipment Depreciation Value', pct: 3.50 },
  { id: 'equip-repair', label: 'Equipment Repair & Maintenance', pct: 0.80 },
  { id: 'comms', label: 'Communication', pct: 0.25 },
];

const DEFAULT_SUNDRY_STATE: SundryItemState[] = DEFAULT_SUNDRY.map((s) => ({
  id: s.id,
  label: s.label,
  defaultPct: s.pct,
  customPct: s.pct,
  source: 'default' as SundryRateSource,
  calculatorTotal: 0,
}));

const sanitizeSundryItems = (items: unknown): SundryItemState[] => {
  if (!Array.isArray(items)) return DEFAULT_SUNDRY_STATE;

  const persistedById = new Map(
    items
      .filter((item): item is Partial<SundryItemState> & { id: string } => typeof item === 'object' && item !== null && typeof (item as { id?: unknown }).id === 'string')
      .map((item) => [item.id, item]),
  );

  return DEFAULT_SUNDRY_STATE.map((defaultItem) => {
    const persisted = persistedById.get(defaultItem.id);
    if (!persisted) return defaultItem;

    return {
      ...defaultItem,
      label: typeof persisted.label === 'string' ? persisted.label : defaultItem.label,
      defaultPct: typeof persisted.defaultPct === 'number' ? persisted.defaultPct : defaultItem.defaultPct,
      customPct: typeof persisted.customPct === 'number' ? persisted.customPct : defaultItem.customPct,
      source: persisted.source === 'default' || persisted.source === 'custom' || persisted.source === 'calculator'
        ? persisted.source
        : defaultItem.source,
      calculatorTotal: typeof persisted.calculatorTotal === 'number' ? persisted.calculatorTotal : defaultItem.calculatorTotal,
    };
  });
};

export interface AdminRateState {
  staffTraining: number;
  staffManagement: number;
  profit: number;
}

const DEFAULT_ADMIN_RATES: AdminRateState = {
  staffTraining: 3.00,
  staffManagement: 5.00,
  profit: 12.00,
};

// ── Statutory rate state ────────────────────────────────────────

export type PliRateSource = 'default' | 'custom' | 'quoted';

export interface StatutoryRates {
  anl: number;
  leaveLoading: number;
  sl: number;
  lslCleaningOverride: number | null; // null = use state default levy
  lslSecurityOverride: number | null; // null = use state default levy
  workersComp: number;
  payrollTaxOverride: number | null; // null = use state default
  pli: number;
  pliSource: PliRateSource;
  pliCustomPct: number;
  pliQuotedValue: number;
  payrollTaxOverThreshold: boolean | null; // null = not yet answered
}

const DEFAULT_PLI_PCT = 2.00;

const DEFAULT_STATUTORY_RATES: StatutoryRates = {
  anl: 7.67,
  leaveLoading: 17.50,
  sl: 3.84,
  lslCleaningOverride: null,
  lslSecurityOverride: null,
  workersComp: 2.50,
  payrollTaxOverride: null,
  pli: DEFAULT_PLI_PCT,
  pliSource: 'default',
  pliCustomPct: DEFAULT_PLI_PCT,
  pliQuotedValue: 0,
  payrollTaxOverThreshold: true, // Default to Yes
};

// ── Statutory calc result row ───────────────────────────────────

export interface StatutoryRow {
  id: string;
  label: string;
  pct: number;
  value: number;
  base: number;
  baseLabel: string;
  locked: boolean;
  editable: boolean;
  helperText?: string;
  noteText?: string;
  stateInfo?: string; // e.g. "Where: VIC | Levy: 1.80%"
}

// ── Row data type ───────────────────────────────────────────────

type RowData = {
  annualHours: number;
  annualLabour: number;   // wages only
  annualAllowances: number;
  operatorCount: number;
};

export function usePricingData() {
  const { operators, rosters, getRoster, isLoaded } = useRosterStore();
  const { getConfigForOperator, isLoaded: wageLoaded } = useWageSettings();

  // ── Job details state ──────────────────────────────────────────
  const [jobDetails, setJobDetailsState] = useState<JobDetails>(loadJobDetails);

  const setJobName = useCallback((name: string) => {
    setJobDetailsState(prev => {
      const next = { ...prev, jobName: name };
      localStorage.setItem(JOB_DETAILS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const setJobState = useCallback((state: AustralianState) => {
    setJobDetailsState(prev => {
      const next = { ...prev, jobState: state };
      localStorage.setItem(JOB_DETAILS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const updateJobDetails = useCallback((updates: Partial<JobDetails>) => {
    setJobDetailsState(prev => {
      const next = { ...prev, ...updates };
      localStorage.setItem(JOB_DETAILS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Re-sync from localStorage when it changes externally (scenario load)
  useEffect(() => {
    const handler = () => setJobDetailsState(loadJobDetails());
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  // ── Statutory editable rates (persisted) ────────────────────────

  const [statutoryRates, setStatutoryRates] = useState<StatutoryRates>(() => {
    try {
      const stored = localStorage.getItem(STATUTORY_RATES_KEY);
      if (stored) return { ...DEFAULT_STATUTORY_RATES, ...JSON.parse(stored) };
    } catch { /* ignore */ }
    return DEFAULT_STATUTORY_RATES;
  });

  const updateStatutoryRate = useCallback((key: keyof StatutoryRates, value: number | boolean | string | null) => {
    setStatutoryRates(prev => {
      const next = { ...prev, [key]: value };
      localStorage.setItem(STATUTORY_RATES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Re-sync statutory rates from localStorage on external changes (scenario load)
  useEffect(() => {
    const handler = () => {
      try {
        const stored = localStorage.getItem(STATUTORY_RATES_KEY);
        if (stored) setStatutoryRates({ ...DEFAULT_STATUTORY_RATES, ...JSON.parse(stored) });
        else setStatutoryRates(DEFAULT_STATUTORY_RATES);
      } catch { /* ignore */ }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  // ── Sundry state (persisted) ────────────────────────────────────
  const SUNDRY_ITEMS_KEY = 'cpq-sundry-items';
  const ADMIN_RATES_KEY = 'cpq-admin-rates';

  const [sundryItems, setSundryItems] = useState<SundryItemState[]>(() => {
    try {
      const stored = localStorage.getItem(SUNDRY_ITEMS_KEY);
      if (stored) return sanitizeSundryItems(JSON.parse(stored));
    } catch {}
    return DEFAULT_SUNDRY_STATE;
  });
  const [adminRates, setAdminRates] = useState<AdminRateState>(() => {
    try {
      const stored = localStorage.getItem(ADMIN_RATES_KEY);
      if (stored) return JSON.parse(stored);
    } catch {}
    return DEFAULT_ADMIN_RATES;
  });

  useEffect(() => {
    setSundryItems(prev => sanitizeSundryItems(prev));
  }, []);

  // Persist sundry & admin state
  useEffect(() => {
    localStorage.setItem(SUNDRY_ITEMS_KEY, JSON.stringify(sundryItems));
  }, [sundryItems]);
  useEffect(() => {
    localStorage.setItem(ADMIN_RATES_KEY, JSON.stringify(adminRates));
  }, [adminRates]);

  const updateAdminRate = useCallback((key: keyof AdminRateState, value: number) => {
    setAdminRates(prev => ({ ...prev, [key]: value }));
  }, []);

  const setSundrySource = useCallback((id: string, source: SundryRateSource) => {
    setSundryItems(prev => prev.map(item => item.id === id ? { ...item, source } : item));
  }, []);
  const setSundryCustomPct = useCallback((id: string, pct: number) => {
    setSundryItems(prev => prev.map(item => item.id === id ? { ...item, customPct: pct } : item));
  }, []);
  const setSundryCalculatorTotal = useCallback((id: string, total: number) => {
    setSundryItems(prev => prev.map(item => item.id === id ? { ...item, calculatorTotal: total } : item));
  }, []);

  // ── Auto-sync sundry calculator totals from localStorage (no extra hooks) ──
  useEffect(() => {
    const syncFromStorage = () => {
      try {
        // Read sundry tables state
        const stRaw = localStorage.getItem('cpq-sundry-tables');
        const st = stRaw ? JSON.parse(stRaw) : null;

        // Read equipment depreciation state
        const majorRaw = localStorage.getItem('cpq-equipment-major-rows');
        const minorRaw = localStorage.getItem('cpq-equipment-minor-rows');
        const settingsRaw = localStorage.getItem('cpq-equipment-settings');
        const majorRows = majorRaw ? JSON.parse(majorRaw) : [];
        const minorRows = minorRaw ? JSON.parse(minorRaw) : [];
        const eqSettings = settingsRaw ? JSON.parse(settingsRaw) : { major_life_years_default: 5, major_interest_rate_default: 0, minor_life_years_default: 3, minor_interest_rate_default: 0 };

        // Compute totals
        const fuelAnnual = st?.fuel?.reduce((s: number, r: any) => s + (r.costPerUnitPerWeek || 0) * (r.units || 0), 0) * 52.14 || 0;
        const repairAnnual = st?.repairs?.reduce((s: number, r: any) => s + (r.quantity || 0) * (r.frequencyPA || 0) * (r.cost || 0), 0) || 0;
        const commAnnual = st?.communication?.reduce((s: number, r: any) => s + (r.unitQuantity || 0) * (r.weeklyValuePerUnit || 0), 0) * 52.14 || 0;
        const chemAnnual = st?.chemicals?.reduce((s: number, r: any) => s + (r.costPerUnitPerWeek || 0) * (r.units || 0), 0) * 52.14 || 0;

        // Uniform
        const uniformMargin = 1 + (st?.uniformMargin ?? 5) / 100;
        const uniformCosts = st?.uniformUnitCosts ?? {};
        let uniformAnnual = 0;
        if (st?.uniformRows) {
          const totalsPerItem: Record<string, number> = {};
          UNIFORM_ITEMS.forEach((k: UniformItemKey) => { totalsPerItem[k] = 0; });
          st.uniformRows.forEach((row: any) => {
            UNIFORM_ITEMS.forEach((k: UniformItemKey) => {
              totalsPerItem[k] += (row.noEmployees || 0) * (row[k] || 0);
            });
          });
          UNIFORM_ITEMS.forEach((k: UniformItemKey) => {
            uniformAnnual += totalsPerItem[k] * (uniformCosts[k] || 0) * uniformMargin;
          });
        }

        // Equipment depreciation
        const majorAnnual = majorRows.reduce((s: number, r: any) => {
          const pc = (r.unit_cost_ex_gst || 0) * (r.units || 0);
          return s + (r.model && r.units > 0 ? calcAnnualCost(pc, eqSettings.major_life_years_default, eqSettings.major_interest_rate_default) : 0);
        }, 0);
        const minorAnnual = minorRows.reduce((s: number, r: any) => {
          const pc = (r.unit_cost_ex_gst || 0) * (r.units || 0);
          return s + (r.item_name && r.units > 0 ? calcAnnualCost(pc, eqSettings.minor_life_years_default, eqSettings.minor_interest_rate_default) : 0);
        }, 0);

        const totals: Record<string, number> = {
          uniform: uniformAnnual,
          chemicals: chemAnnual,
          fuel: fuelAnnual,
          'equip-deprec': majorAnnual + minorAnnual,
          'equip-repair': repairAnnual,
          comms: commAnnual,
        };

        Object.entries(totals).forEach(([id, total]) => {
          setSundryCalculatorTotal(id, total);
        });
      } catch {}
    };

    syncFromStorage();
    // Re-sync when other tabs update storage
    window.addEventListener('storage', syncFromStorage);
    // Also poll periodically for same-tab updates
    const interval = setInterval(syncFromStorage, 2000);
    return () => {
      window.removeEventListener('storage', syncFromStorage);
      clearInterval(interval);
    };
  }, [setSundryCalculatorTotal]);


  // ── Year-1 Fixed Price factor (single source of truth) ────────
  const year1FactorDebug = useMemo(() => {
    const isFixed = jobDetails.contractPriceCondition === 'Fixed Price';
    if (!isFixed) {
      return { year1Factor: 1, computedYear1Factor: 1, isFixedPrice: false, impactRate: 0, rise: 0, daysPreJuly: 0, daysPostJuly: 0, totalDays: 0, startStr: '' };
    }

    // Use Year 1 rise from the Fixed Price Schedule (single source of truth)
    const rise = (jobDetails.fixedPriceSchedule?.[0]?.increaseForecast ?? 0) / 100;
    const startStr = jobDetails.contractCommencementMonth || '';

    let daysPreJuly = 0;
    let daysPostJuly = 0;
    let totalDays = 365;
    let impactRate = 0;

    if (startStr) {
      const parts = startStr.split('-');
      if (parts.length === 3) {
        const startYear = Number(parts[0]);
        const startMonth = Number(parts[1]) - 1;
        const startDay = Number(parts[2]);
        const start = new Date(startYear, startMonth, startDay);

        if (!isNaN(start.getTime())) {
          // Match the Fixed Price Schedule's getNextJuly logic
          const julyYear = startMonth < 6 ? startYear : startYear + 1;
          const july = new Date(julyYear, 6, 1);
          const anniversary = new Date(startYear + 1, startMonth, startDay);
          totalDays = Math.round((anniversary.getTime() - start.getTime()) / 86400000);
          if (totalDays <= 0) totalDays = 365;

          daysPreJuly = Math.round((july.getTime() - start.getTime()) / 86400000);
          daysPostJuly = totalDays - daysPreJuly;
          if (daysPreJuly < 0) { daysPreJuly = 0; daysPostJuly = totalDays; }

          impactRate = rise * (daysPostJuly / totalDays);
        }
      }
    }

    const computedFactor = 1 + impactRate;
    const manual = jobDetails.manualYear1Factor;
    const appliedFactor = (manual !== null && manual !== undefined && !isNaN(manual)) ? manual : computedFactor;

    return { year1Factor: appliedFactor, computedYear1Factor: computedFactor, isFixedPrice: true, impactRate, rise, daysPreJuly, daysPostJuly, totalDays, startStr };
  }, [jobDetails.contractPriceCondition, jobDetails.fixedPriceSchedule, jobDetails.contractCommencementMonth, jobDetails.manualYear1Factor]);

  const { year1Factor, isFixedPrice, computedYear1Factor } = year1FactorDebug;

  // ── Forecast July Increase factor ──────────────────────────────
  // Separate from fixed-price escalation — adjusts base rates for expected award increase
  const forecastJulyFactor = useMemo(() => {
    const pct = jobDetails.forecastJulyIncrease;
    if (!pct || pct === 0) return 1;

    const startStr = jobDetails.contractCommencementMonth || '';
    if (!startStr) {
      // No start date → assume contract starts after July → full increase
      return 1 + pct / 100;
    }

    const parts = startStr.split('-');
    if (parts.length < 3) return 1 + pct / 100;

    const startYear = Number(parts[0]);
    const startMonth = Number(parts[1]) - 1; // 0-indexed
    const startDay = Number(parts[2]);
    const start = new Date(startYear, startMonth, startDay);
    if (isNaN(start.getTime())) return 1 + pct / 100;

    // Next July 1 after or on the rate effective date
    const julyYear = startMonth < 6 ? startYear : startYear + 1;
    const july = new Date(julyYear, 6, 1);

    // Case B: contract starts on or after next July → full increase
    if (start >= july) return 1 + pct / 100;

    // Case A: contract starts before July → weighted average
    const anniversary = new Date(startYear + 1, startMonth, startDay);
    const totalDays = Math.round((anniversary.getTime() - start.getTime()) / 86400000) || 365;
    const daysPreJuly = Math.max(0, Math.round((july.getTime() - start.getTime()) / 86400000));
    const daysPostJuly = totalDays - daysPreJuly;

    // Pre-July: current rates (factor 1), Post-July: increased rates (factor 1+pct)
    const weightedFactor = (daysPreJuly * 1 + daysPostJuly * (1 + pct / 100)) / totalDays;
    return weightedFactor;
  }, [jobDetails.forecastJulyIncrease, jobDetails.contractCommencementMonth]);

  // Combined scaling factor: forecast July adjustment × fixed-price escalation
  const combinedFactor = year1Factor * forecastJulyFactor;

  const computed = useMemo(() => {
    const calcs = new Map<string, OperatorCalculations>();
    const costs = new Map<string, ShiftCost[]>();
    const allowances = new Map<string, AllowanceBreakdown | null>();

    operators.forEach(op => {
      const roster = getRoster(op.id);
      if (!roster) return;
      const calc = calculateOperatorWeek(roster, op.employmentType, DAYS_OF_WEEK, op.service, op.weeksPerYear);
      calcs.set(op.id, calc);

      const ns = normalizeService(op.service);
      const wageInfo = getConfigForOperator(ns, op.level);
      const dayCosts = calc.days.map(d => {
        const base = calculateShiftCost(d.day, d.startTime || '', d.endTime || '', d.paidHours, ns, op.employmentType, op.level, op.isFixedNights ?? false, wageInfo?.rates ?? null);
        // Apply combined factor (forecast July + year-1 escalation) to cost
        if (combinedFactor !== 1 && base.cost !== null) {
          return { ...base, cost: base.cost * combinedFactor, segments: base.segments.map(seg => ({ ...seg, cost: seg.cost !== null ? seg.cost * combinedFactor : null })) };
        }
        return base;
      });
      costs.set(op.id, dayCosts);

      const workedDays = calc.days.filter(d => d.coverageMin > 0).map(d => d.day);
      let allowResult: AllowanceBreakdown | null = null;
      if (ns === 'security' && op.securityAllowances) {
        allowResult = calculateSecurityAllowances(op.securityAllowances, calc.weeklyPaidHours, workedDays.length);
      } else if (ns === 'cleaning' && op.cleaningAllowances) {
        allowResult = calculateCleaningAllowances(op.cleaningAllowances, calc.weeklyPaidHours, workedDays, op.level);
      }
      // Apply combined factor to allowances
      if (allowResult && combinedFactor !== 1) {
        allowResult = {
          ...allowResult,
          totalWeekly: allowResult.totalWeekly * combinedFactor,
          items: allowResult.items.map(item => ({ ...item, cost: item.cost * combinedFactor })),
        };
      }
      allowances.set(op.id, allowResult);
    });

    return { calcs, costs, allowances };
  }, [operators, rosters, getRoster, getConfigForOperator, combinedFactor]);

  // ── Service data with operator counts ─────────────────────────

  const { serviceData, servicesWithOperators } = useMemo(() => {
    const data: Record<ServiceType, Record<EmpDayKey, RowData>> = {} as any;
    const opSets: Record<ServiceType, Record<EmpDayKey, Set<string>>> = {} as any;

    SERVICES_ORDER.forEach(svc => {
      data[svc] = {} as any;
      opSets[svc] = {} as any;
      ROW_DEFS.forEach(rd => {
        data[svc][rd.key] = { annualHours: 0, annualLabour: 0, annualAllowances: 0, operatorCount: 0 };
        opSets[svc][rd.key] = new Set();
      });
    });

    operators.forEach(op => {
      const calc = computed.calcs.get(op.id);
      const dayCosts = computed.costs.get(op.id);
      const allowInfo = computed.allowances.get(op.id);
      if (!calc || !dayCosts) return;

      const svc = normalizeService(op.service);
      if (!data[svc]) return;
      const et = op.employmentType;
      const annualFactor = et === 'casual' && typeof op.weeksPerYear === 'number' ? op.weeksPerYear : 52.14;
      const etPrefix = et === 'full-time' ? 'ft' : et === 'part-time' ? 'pt' : 'casual';
      const workedDayGroups = new Set<DayGroup>();
      calc.days.forEach(d => {
        if (d.coverageMin <= 0) return;
        workedDayGroups.add(d.day === 'sat' ? 'sat' : d.day === 'sun' ? 'sun' : 'mon-fri');
      });
      const primaryDayGroup: DayGroup | null = workedDayGroups.has('mon-fri')
        ? 'mon-fri'
        : workedDayGroups.has('sat')
          ? 'sat'
          : workedDayGroups.has('sun')
            ? 'sun'
            : null;
      const primaryRowKey = primaryDayGroup ? `${etPrefix}-${primaryDayGroup}` as EmpDayKey : null;

      calc.days.forEach((d, idx) => {
        if (d.coverageMin <= 0) return;

        let dayGroup: DayGroup;
        if (d.day === 'sat') dayGroup = 'sat';
        else if (d.day === 'sun') dayGroup = 'sun';
        else dayGroup = 'mon-fri';

        const rowKey: EmpDayKey = `${etPrefix}-${dayGroup}` as EmpDayKey;
        const row = data[svc][rowKey];
        if (!row) return;

        row.annualHours += d.paidHours * annualFactor;
        row.annualLabour += (dayCosts[idx]?.cost ?? 0) * annualFactor;
        if (rowKey === primaryRowKey) opSets[svc][rowKey].add(op.id);
      });

      const weeklyAllowance = allowInfo?.totalWeekly ?? 0;
      if (weeklyAllowance > 0) {
        const workedDays = calc.days.filter(d => d.coverageMin > 0);
        if (workedDays.length > 0) {
          const perDay = weeklyAllowance / workedDays.length;
          workedDays.forEach(d => {
            let dayGroup: DayGroup;
            if (d.day === 'sat') dayGroup = 'sat';
            else if (d.day === 'sun') dayGroup = 'sun';
            else dayGroup = 'mon-fri';

            const rowKey: EmpDayKey = `${etPrefix}-${dayGroup}` as EmpDayKey;
            const row = data[svc][rowKey];
            if (row) row.annualAllowances += perDay * annualFactor;
          });
        }
      }
    });

    SERVICES_ORDER.forEach(svc => {
      ROW_DEFS.forEach(rd => {
        data[svc][rd.key].operatorCount = opSets[svc][rd.key].size;
      });
    });

    const withOps = SERVICES_ORDER.filter(svc =>
      ROW_DEFS.some(rd => {
        const row = data[svc][rd.key];
        return row.operatorCount > 0 || row.annualHours > 0 || row.annualLabour > 0 || row.annualAllowances > 0;
      })
    );

    return { serviceData: data, servicesWithOperators: withOps };
  }, [operators, computed]);

  // ── Grand totals with per-service wage breakdowns ─────────────

  const grandTotals = useMemo(() => {
    let totalHours = 0, totalLabour = 0, totalAllowances = 0, totalWageExclCasual = 0;
    let cleaningWageNoCasual = 0, securityWageNoCasual = 0;

    SERVICES_ORDER.forEach(svc => {
      ROW_DEFS.forEach(rd => {
        const row = serviceData[svc]?.[rd.key];
        if (!row) return;
        totalHours += row.annualHours;
        totalLabour += row.annualLabour;
        totalAllowances += row.annualAllowances;
        if (rd.et !== 'casual') {
          totalWageExclCasual += row.annualLabour;
          if (svc === 'cleaning') cleaningWageNoCasual += row.annualLabour;
          if (svc === 'security') securityWageNoCasual += row.annualLabour;
        }
      });
    });

    return {
      totalHours,
      totalLabour,
      totalAllowances,
      annualTotal: totalLabour + totalAllowances,
      totalWageExclCasual,
      cleaningWageNoCasual,
      securityWageNoCasual,
    };
  }, [serviceData]);

  // ── Per-operator annual labour cost (for division/service allocation) ──
  // Now supports segments: if a day has segments, allocate that day's cost across divisions

  const operatorAnnualCosts = useMemo(() => {
    const results: { id: string; service: ServiceType; employmentType: EmploymentType; division: string; tasks: string; annualLabourCost: number; annualHours: number }[] = [];

    operators.forEach(op => {
      const calc = computed.calcs.get(op.id);
      const dayCosts = computed.costs.get(op.id);
      const allowInfo = computed.allowances.get(op.id);
      if (!calc || !dayCosts) {
        results.push({ id: op.id, service: normalizeService(op.service), employmentType: op.employmentType, division: op.defaultDivision || 'Unassigned', tasks: op.defaultTasks || 'Unassigned', annualLabourCost: 0, annualHours: 0 });
        return;
      }

      const et = op.employmentType;
      const annualFactor = et === 'casual' && typeof op.weeksPerYear === 'number' ? op.weeksPerYear : 52.14;
      const ns = normalizeService(op.service);
      const roster = getRoster(op.id);

      // Calculate weekly allowance per day
      const workedDays = calc.days.filter(d => d.coverageMin > 0);
      const weeklyAllowance = allowInfo?.totalWeekly ?? 0;
      const dailyAllowance = workedDays.length > 0 ? weeklyAllowance / workedDays.length : 0;

      // Per-division+task accumulator (composite key ensures task differences are preserved)
      const divTaskBuckets = new Map<string, { division: string; tasks: string; cost: number; hours: number }>();

      calc.days.forEach((d, idx) => {
        if (d.coverageMin <= 0) return;
        const dayCost = (dayCosts[idx]?.cost ?? 0);
        const dayAllow = dailyAllowance;
        const dayTotal = dayCost + dayAllow;
        const dayHours = d.paidHours;
        const shift = roster?.shifts[d.day];

        if (shift?.segments && shift.segments.length > 1 && d.paidMin > 0) {
          // Segment-based allocation
          let allocated = 0;
          shift.segments.forEach((seg, si) => {
            const share = seg.minutes / d.paidMin;
            const isLast = si === shift.segments!.length - 1;
            const segCost = isLast ? dayTotal - allocated : dayTotal * share;
            allocated += segCost;
            const segHours = dayHours * share;

            const divKey = seg.divisionId || 'Unassigned';
            const taskKey = seg.task || 'Unassigned';
            const compositeKey = `${divKey}|||${taskKey}`;
            const existing = divTaskBuckets.get(compositeKey);
            if (existing) {
              existing.cost += segCost * annualFactor;
              existing.hours += segHours * annualFactor;
            } else {
              divTaskBuckets.set(compositeKey, { division: divKey, tasks: taskKey, cost: segCost * annualFactor, hours: segHours * annualFactor });
            }
          });
        } else {
          // Single division
          const divKey = shift?.division || op.defaultDivision || 'Unassigned';
          const taskKey = shift?.tasks || op.defaultTasks || 'Unassigned';
          const compositeKey = `${divKey}|||${taskKey}`;
          const existing = divTaskBuckets.get(compositeKey);
          if (existing) {
            existing.cost += dayTotal * annualFactor;
            existing.hours += dayHours * annualFactor;
          } else {
            divTaskBuckets.set(compositeKey, { division: divKey, tasks: taskKey, cost: dayTotal * annualFactor, hours: dayHours * annualFactor });
          }
        }
      });

      // Emit one row per division+task bucket
      if (divTaskBuckets.size === 0) {
        results.push({ id: op.id, service: ns, employmentType: et, division: op.defaultDivision || 'Unassigned', tasks: op.defaultTasks || 'Unassigned', annualLabourCost: 0, annualHours: 0 });
      } else {
        divTaskBuckets.forEach((val) => {
          results.push({ id: op.id, service: ns, employmentType: et, division: val.division, tasks: val.tasks, annualLabourCost: val.cost, annualHours: val.hours });
        });
      }
    });

    return results;
  }, [operators, computed, getRoster]);

  // ── Statutory calculations (cascading) ────────────────────────

  const { statutoryCalc, statutoryTotal } = useMemo(() => {
    const st = jobDetails.jobState;
    const wageNoCasual = grandTotals.totalWageExclCasual;
    const totalLC = grandTotals.annualTotal;

    // 1. ANL
    const anlValue = (statutoryRates.anl / 100) * wageNoCasual;

    // 2. Leave Loading (on ANL value)
    const leaveLoadingValue = (statutoryRates.leaveLoading / 100) * anlValue;

    // 3. SL
    const slValue = (statutoryRates.sl / 100) * wageNoCasual;

    // 4. LSL Cleaning (editable via override, falls back to state levy)
    const lslCleaningRate = statutoryRates.lslCleaningOverride !== null ? statutoryRates.lslCleaningOverride : (LSL_CLEANING_LEVIES[st] ?? 0);
    const lslCleaningValue = (lslCleaningRate / 100) * grandTotals.cleaningWageNoCasual;

    // 5. LSL Security (editable via override, falls back to state levy)
    const lslSecurityRate = statutoryRates.lslSecurityOverride !== null ? statutoryRates.lslSecurityOverride : (LSL_SECURITY_LEVIES[st] ?? 0);
    const lslSecurityValue = (lslSecurityRate / 100) * grandTotals.securityWageNoCasual;

    // 6. Super (locked 12% on cascading base)
    const superRate = 12.00;
    const superBase = totalLC + anlValue + leaveLoadingValue + slValue;
    const superValue = (superRate / 100) * superBase;

    // 7. Workers Comp (cascading base)
    const workersCompBase = totalLC + anlValue + leaveLoadingValue + slValue + lslCleaningValue + lslSecurityValue + superValue;
    const workersCompValue = (statutoryRates.workersComp / 100) * workersCompBase;

    // 8. Payroll Tax (threshold-gated, defaults to Yes)
    const payrollTaxBase = workersCompBase;
    let payrollTaxRate: number;
    if (statutoryRates.payrollTaxOverThreshold === false) {
      payrollTaxRate = 0;
    } else {
      // Default to Yes (true or null both apply the rate)
      payrollTaxRate = PAYROLL_TAX_RATES[st] ?? 0;
    }
    const payrollTaxValue = (payrollTaxRate / 100) * payrollTaxBase;

    const rows: StatutoryRow[] = [
      {
        id: 'anl', label: 'Annual Leave (ANL)', pct: statutoryRates.anl, value: anlValue,
        base: wageNoCasual, baseLabel: 'FT+PT Wage (excl. allowances)',
        locked: false, editable: true,
      },
      {
        id: 'leave-loading', label: 'Leave Loading', pct: statutoryRates.leaveLoading, value: leaveLoadingValue,
        base: anlValue, baseLabel: 'ANL Value',
        locked: false, editable: true,
      },
      {
        id: 'sl', label: 'Sick Leave (SL)', pct: statutoryRates.sl, value: slValue,
        base: wageNoCasual, baseLabel: 'FT+PT Wage (excl. allowances)',
        locked: false, editable: true,
      },
      {
        id: 'lsl-cleaning', label: 'Long Service Leave – Cleaning', pct: lslCleaningRate, value: lslCleaningValue,
        base: grandTotals.cleaningWageNoCasual, baseLabel: 'Cleaning FT+PT Wage',
        locked: false, editable: true,
        stateInfo: `State default: ${st} | Levy: ${fmtPct(LSL_CLEANING_LEVIES[st] ?? 0)}`,
      },
      {
        id: 'lsl-security', label: 'Long Service Leave – Security', pct: lslSecurityRate, value: lslSecurityValue,
        base: grandTotals.securityWageNoCasual, baseLabel: 'Security FT+PT Wage',
        locked: false, editable: true,
        stateInfo: `State default: ${st} | Levy: ${fmtPct(LSL_SECURITY_LEVIES[st] ?? 0)}`,
      },
      {
        id: 'super', label: 'Superannuation', pct: superRate, value: superValue,
        base: superBase, baseLabel: 'Labour + ANL + LL + SL',
        locked: true, editable: false,
        noteText: 'Fixed rate. Locked.',
      },
      {
        id: 'workers-comp', label: 'Workers Compensation', pct: statutoryRates.workersComp, value: workersCompValue,
        base: workersCompBase, baseLabel: 'Labour + Statutory (above)',
        locked: false, editable: true,
        helperText: 'Varies by insurer and WHS performance. Confirm rate with senior manager.',
      },
      {
        id: 'payroll-tax', label: 'Payroll Tax', pct: payrollTaxRate, value: payrollTaxValue,
        base: payrollTaxBase, baseLabel: 'Labour + Statutory (above)',
        locked: true, editable: false,
      },
    ];

    // PLI (closed-form, after payroll tax)
    const pliK = (statutoryRates.pli / 100) * 1.05;
    const pliBase = rows.reduce((s, r) => s + r.value, 0) + grandTotals.annualTotal;
    // PLI is added to statutory rows but calculated separately for the closed-form
    // We add a placeholder here; the actual PLI value comes from the closed-form calc later
    
    const total = rows.reduce((s, r) => s + r.value, 0);
    return { statutoryCalc: rows, statutoryTotal: total };
  }, [statutoryRates, grandTotals, jobDetails.jobState]);

  // ── Sundry calculations (base for default = Annual Labour Cost + Total Statutory) ──

  const sundryCalc = useMemo(() => {
    const labourBase = grandTotals.annualTotal;
    const defaultBase = labourBase + statutoryTotal;

    return sundryItems.map(item => {
      let effectivePct: number;
      let value: number;
      if (item.source === 'calculator' && labourBase > 0) {
        value = item.calculatorTotal;
        effectivePct = (item.calculatorTotal / labourBase) * 100;
      } else if (item.source === 'custom') {
        effectivePct = item.customPct;
        value = labourBase * (effectivePct / 100);
      } else {
        effectivePct = item.defaultPct;
        value = defaultBase * (effectivePct / 100);
      }
      return { ...item, pct: effectivePct, value };
    });
  }, [sundryItems, grandTotals, statutoryTotal]);
  const sundryTotalValue = sundryCalc.reduce((s, i) => s + i.value, 0);
  const sundryTotalPct = sundryCalc.reduce((s, i) => s + i.pct, 0);

  // ── Administration & Profit + PLI (combined closed-form) ──────
  // PLI is included in the subtotal BEFORE applying admin/profit margin.
  // Combined formula: contractFinal = C / (1 - p - k)
  //   where C = Labour + Statutory(excl PLI) + Sundry
  //         p = admin rate total (as decimal)
  //         k = PLI rate * 1.05 (stamp duty loading)

  // Determine effective PLI rate based on source
  const effectivePliPct = statutoryRates.pliSource === 'custom'
    ? statutoryRates.pliCustomPct
    : statutoryRates.pli; // 'default' uses the stored default; 'quoted' will override below

  const { adminCalc, adminTotalPct, adminTotalValue, baseCost, pliValue, pliError, contractTotalAnnual, pliRow, adminError } = useMemo(() => {
    const costExclPLI = grandTotals.annualTotal + statutoryTotal + sundryTotalValue;
    const adminRateTotal = adminRates.staffTraining + adminRates.staffManagement + adminRates.profit;
    const adminTotalPct = adminRateTotal;
    const p = adminRateTotal / 100;

    const trainingLabel = jobDetails.adminTrainingLabel || 'Administration';
    const zeroAdmin = [
      { id: 'staff-training', label: trainingLabel, pct: adminRates.staffTraining, value: 0 },
      { id: 'staff-mgmt', label: 'Staff Management', pct: adminRates.staffManagement, value: 0 },
      { id: 'profit', label: 'Profit', pct: adminRates.profit, value: 0 },
    ];

    // ── Quoted value mode: PLI is a fixed dollar amount ──
    if (statutoryRates.pliSource === 'quoted') {
      const fixedPli = statutoryRates.pliQuotedValue || 0;

      if (adminRateTotal >= 100 || p >= 1) {
        return {
          adminCalc: zeroAdmin, adminTotalPct,
          adminTotalValue: 0, baseCost: costExclPLI,
          pliValue: fixedPli, pliError: false,
          contractTotalAnnual: 0,
          pliRow: {
            id: 'pli', label: 'Public Liability Insurance', pct: 0, value: fixedPli,
            base: 0, baseLabel: 'Contract Total',
            locked: false, editable: true,
          } as StatutoryRow,
          adminError: true,
        };
      }

      // contractFinal = (C + fixedPli) / (1 - p)
      const contractTotalFinal = (costExclPLI + fixedPli) / (1 - p);
      const totalAdminProfit = p * contractTotalFinal;
      const baseCostDisplayed = costExclPLI + fixedPli;
      // Back-calculate display rate %
      const backCalcPct = contractTotalFinal > 0 ? (fixedPli / contractTotalFinal / 1.05) * 100 : 0;

      const rSum = adminRateTotal;
      const trainingValue = rSum > 0 ? totalAdminProfit * (adminRates.staffTraining / rSum) : 0;
      const mgmtValue = rSum > 0 ? totalAdminProfit * (adminRates.staffManagement / rSum) : 0;
      const profitValue = rSum > 0 ? totalAdminProfit * (adminRates.profit / rSum) : 0;

      return {
        adminCalc: [
          { id: 'staff-training', label: trainingLabel, pct: adminRates.staffTraining, value: trainingValue },
          { id: 'staff-mgmt', label: 'Staff Management', pct: adminRates.staffManagement, value: mgmtValue },
          { id: 'profit', label: 'Profit', pct: adminRates.profit, value: profitValue },
        ],
        adminTotalPct,
        adminTotalValue: totalAdminProfit,
        baseCost: baseCostDisplayed,
        pliValue: fixedPli,
        pliError: false,
        contractTotalAnnual: contractTotalFinal,
        pliRow: {
          id: 'pli', label: 'Public Liability Insurance', pct: backCalcPct, value: fixedPli,
          base: contractTotalFinal, baseLabel: 'Contract Total',
          locked: false, editable: true,
        } as StatutoryRow,
        adminError: adminRateTotal >= 100,
      };
    }

    // ── Default / Custom rate mode: closed-form ──
    const ratePct = statutoryRates.pliSource === 'custom' ? statutoryRates.pliCustomPct : statutoryRates.pli;
    const k = (ratePct / 100) * 1.05;
    const combinedRate = p + k;

    if (adminRateTotal >= 100 || combinedRate >= 1) {
      return {
        adminCalc: zeroAdmin, adminTotalPct,
        adminTotalValue: 0, baseCost: costExclPLI,
        pliValue: 0, pliError: k >= 1,
        contractTotalAnnual: 0,
        pliRow: {
          id: 'pli', label: 'Public Liability Insurance', pct: ratePct, value: 0,
          base: 0, baseLabel: 'Contract Total',
          locked: false, editable: true,
        } as StatutoryRow,
        adminError: true,
      };
    }

    // Solve: contractFinal = C / (1 - p - k)
    const contractTotalFinal = costExclPLI / (1 - combinedRate);
    const pli = k * contractTotalFinal;
    const totalAdminProfit = p * contractTotalFinal;
    const baseCostDisplayed = costExclPLI + pli;

    const rSum = adminRateTotal;
    const trainingValue = rSum > 0 ? totalAdminProfit * (adminRates.staffTraining / rSum) : 0;
    const mgmtValue = rSum > 0 ? totalAdminProfit * (adminRates.staffManagement / rSum) : 0;
    const profitValue = rSum > 0 ? totalAdminProfit * (adminRates.profit / rSum) : 0;

    return {
      adminCalc: [
        { id: 'staff-training', label: trainingLabel, pct: adminRates.staffTraining, value: trainingValue },
        { id: 'staff-mgmt', label: 'Staff Management', pct: adminRates.staffManagement, value: mgmtValue },
        { id: 'profit', label: 'Profit', pct: adminRates.profit, value: profitValue },
      ],
      adminTotalPct,
      adminTotalValue: totalAdminProfit,
      baseCost: baseCostDisplayed,
      pliValue: pli,
      pliError: false,
      contractTotalAnnual: contractTotalFinal,
      pliRow: {
        id: 'pli', label: 'Public Liability Insurance', pct: ratePct, value: pli,
        base: contractTotalFinal, baseLabel: 'Contract Total',
        locked: false, editable: true,
      } as StatutoryRow,
      adminError: adminRateTotal >= 100,
    };
  }, [adminRates, grandTotals, statutoryTotal, sundryTotalValue, statutoryRates.pli, statutoryRates.pliSource, statutoryRates.pliCustomPct, statutoryRates.pliQuotedValue, jobDetails.adminTrainingLabel]);

  // ── Contract price totals ────────────────────────────────────

  const totalPerAnnum = contractTotalAnnual;
  const totalPerMonth = totalPerAnnum / 12;
  const totalPerWeek = totalPerAnnum / 52.14;

  // ── FT+PT per-day cost (labour+allowances, annualised), service-filtered ──
  // Used by Detailed Summary PH table

  const ftPtPerDayCosts = useMemo(() => {
    // Returns per-day annualised labour+allowances for FT+PT operators
    // keyed by DayOfWeek, optionally filtered to selected services
    const perDay: Record<DayOfWeek, Record<ServiceType, number>> = {} as any;
    DAYS_OF_WEEK.forEach(d => {
      perDay[d] = {} as any;
      SERVICES_ORDER.forEach(s => { perDay[d][s] = 0; });
    });

    operators.forEach(op => {
      const et = op.employmentType;
      if (et === 'casual') return; // FT+PT only
      const calc = computed.calcs.get(op.id);
      const dayCosts = computed.costs.get(op.id);
      const allowInfo = computed.allowances.get(op.id);
      if (!calc || !dayCosts) return;

      const svc = normalizeService(op.service);
      const annualFactor = 52.14;

      // Labour per day
      calc.days.forEach((d, idx) => {
        const cost = (dayCosts[idx]?.cost ?? 0) * annualFactor;
        perDay[d.day][svc] = (perDay[d.day][svc] ?? 0) + cost;
      });

      // Allowances: distribute proportionally to worked days
      const weeklyAllowance = allowInfo?.totalWeekly ?? 0;
      if (weeklyAllowance > 0) {
        const workedDays = calc.days.filter(d => d.coverageMin > 0);
        if (workedDays.length > 0) {
          const perDayAllowance = (weeklyAllowance / workedDays.length) * annualFactor;
          workedDays.forEach(d => {
            perDay[d.day][svc] = (perDay[d.day][svc] ?? 0) + perDayAllowance;
          });
        }
      }
    });

    return perDay;
  }, [operators, computed]);

  // PH multipliers: total rate multipliers applied to base day cost
  // Mon–Fri: 2.50×, Sat: 1.67×, Sun: 1.25×
  // Cost = BaseDayCost × multiplier
  const PH_MULTIPLIERS: Record<DayOfWeek, number> = {
    mon: 2.50, tue: 2.50, wed: 2.50, thu: 2.50, fri: 2.50,
    sat: 1.67, sun: 1.25,
  };

  // ── Count actual PH dates per weekday within 12-month contract window ──
  const phCountsByDay = useMemo(() => {
    const counts: Record<DayOfWeek, number> = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 };
    const startStr = jobDetails.contractCommencementMonth;
    if (!startStr) return counts;

    // Contract window: start date → start date + 12 months
    const windowStart = new Date(startStr + '-01T00:00:00');
    const windowEnd = new Date(windowStart);
    windowEnd.setFullYear(windowEnd.getFullYear() + 1);

    // Fetch holidays for both years that might overlap the window
    const year1 = windowStart.getFullYear();
    const year2 = windowEnd.getFullYear();
    const years = year1 === year2 ? [year1] : [year1, year2];
    const allHolidays = years.flatMap(y => getPublicHolidays(jobDetails.jobState, y));

    const DOW_MAP: Record<number, DayOfWeek> = { 0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat' };

    allHolidays.forEach(ph => {
      const d = new Date(ph.date + 'T00:00:00');
      if (d >= windowStart && d < windowEnd) {
        const dow = DOW_MAP[d.getDay()];
        if (dow) counts[dow] = (counts[dow] ?? 0) + 1;
      }
    });

    return counts;
  }, [jobDetails.contractCommencementMonth, jobDetails.jobState]);

  // ── PH cost calculation (Detailed Summary) ───────────────────
  // CORRECT formula: BaseDayCost(day) × N_day × (multiplier − 1)
  // BaseDayCost = annualised cost / 52.14 (i.e. the "Day" row from FT+PT table)
  const phDayCosts = useMemo(() => {
    const inclSvcs = jobDetails.phIncludedServices.length > 0
      ? jobDetails.phIncludedServices
      : SERVICES_ORDER;

    return DAYS_OF_WEEK.map(day => {
      // Sum across selected services, then divide by 52.14 to get per-day cost
      const annualisedCostDay = inclSvcs.reduce((sum, svc) => sum + (ftPtPerDayCosts[day]?.[svc] ?? 0), 0);
      const baseDayCost = annualisedCostDay / 52.14;
      const multiplier = PH_MULTIPLIERS[day];
      const nDays = phCountsByDay[day] ?? 0;
      // Cost = days × base_day × multiplier (total rate)
      const phExtraCost = baseDayCost * nDays * multiplier;
      return {
        day,
        baseCost: baseDayCost,       // $/day
        multiplier,
        nDays,
        phCost: phExtraCost,         // extra annual cost for PH on this weekday
      };
    });
  }, [ftPtPerDayCosts, jobDetails.phIncludedServices, phCountsByDay]);

  const phTotalBase = phDayCosts.reduce((s, d) => s + d.baseCost, 0);
  const phTotalCost = phDayCosts.reduce((s, d) => s + d.phCost, 0);

  // ── GrossUpFactor & per-DOW cost for PH selection table ──────
  // FT+PT total annual labour cost (wages + allowances, excl casuals)
  const ftPtAnnualTotal = useMemo(() => {
    let total = 0;
    operators.forEach(op => {
      if (op.employmentType === 'casual') return;
      const calc = computed.calcs.get(op.id);
      const dayCosts = computed.costs.get(op.id);
      const allowInfo = computed.allowances.get(op.id);
      if (!calc || !dayCosts) return;
      const annualFactor = 52.14;
      calc.days.forEach((d, idx) => {
        total += (dayCosts[idx]?.cost ?? 0) * annualFactor;
      });
      const weeklyAllowance = allowInfo?.totalWeekly ?? 0;
      total += weeklyAllowance * annualFactor;
    });
    return total;
  }, [operators, computed]);

  // ── PH on-cost stack (for Labour Price Breakdown) ────────────
  const phPricedCosts = useMemo(() => {
    if (!jobDetails.publicHolidayIncluded || phTotalCost <= 0) {
      return { phBase: 0, phAnl: 0, phLL: 0, phSL: 0, phLSLCleaning: 0, phLSLSecurity: 0, phSuper: 0, phWorkersComp: 0, phPayrollTax: 0, phStatutoryTotal: 0, phTotalPriced: 0 };
    }

    const st = jobDetails.jobState;
    const phBase = phTotalCost;

    // Apply same statutory stack but using phBase as the labour base
    // ANL / SL base = phBase (wages equivalent — PH is FT+PT only so we use full phBase)
    const phAnl = (statutoryRates.anl / 100) * phBase;
    const phLL = (statutoryRates.leaveLoading / 100) * phAnl;
    const phSL = (statutoryRates.sl / 100) * phBase;

    // LSL — apply cleaning/security rates based on what's in included services
    const inclSvcs = jobDetails.phIncludedServices.length > 0 ? jobDetails.phIncludedServices : SERVICES_ORDER;
    const hasClean = inclSvcs.includes('cleaning');
    const hasSec = inclSvcs.includes('security');

    // Proportion of cleaning/security in total base day cost
    const totalBaseFull = DAYS_OF_WEEK.reduce((sum, day) => {
      const svcSum = inclSvcs.reduce((s, svc) => s + (ftPtPerDayCosts[day]?.[svc] ?? 0), 0);
      return sum + svcSum;
    }, 0);
    const cleanBaseFull = hasClean ? DAYS_OF_WEEK.reduce((sum, day) => sum + (ftPtPerDayCosts[day]?.['cleaning'] ?? 0), 0) : 0;
    const secBaseFull = hasSec ? DAYS_OF_WEEK.reduce((sum, day) => sum + (ftPtPerDayCosts[day]?.['security'] ?? 0), 0) : 0;
    const cleanProportion = totalBaseFull > 0 ? cleanBaseFull / totalBaseFull : 0;
    const secProportion = totalBaseFull > 0 ? secBaseFull / totalBaseFull : 0;

    const lslCleanRate = LSL_CLEANING_LEVIES[st] ?? 0;
    const lslSecRate = LSL_SECURITY_LEVIES[st] ?? 0;
    const phLSLCleaning = (lslCleanRate / 100) * phBase * cleanProportion;
    const phLSLSecurity = (lslSecRate / 100) * phBase * secProportion;

    // Super on full PH base including leave items
    const superRate = 12.00;
    const superBase = phBase + phAnl + phLL + phSL;
    const phSuper = (superRate / 100) * superBase;

    // Workers Comp cascading
    const wcBase = superBase + phSuper;
    const phWorkersComp = (statutoryRates.workersComp / 100) * wcBase;

    // Payroll Tax
    let ptRate = 0;
    if (statutoryRates.payrollTaxOverThreshold === true) ptRate = PAYROLL_TAX_RATES[st] ?? 0;
    const phPayrollTax = (ptRate / 100) * wcBase;

    const phStatutoryTotal = phAnl + phLL + phSL + phLSLCleaning + phLSLSecurity + phSuper + phWorkersComp + phPayrollTax;
    const phTotalPriced = phBase + phStatutoryTotal;

    return { phBase, phAnl, phLL, phSL, phLSLCleaning, phLSLSecurity, phSuper, phWorkersComp, phPayrollTax, phStatutoryTotal, phTotalPriced };
  }, [phTotalCost, jobDetails.publicHolidayIncluded, jobDetails.phIncludedServices, jobDetails.jobState, statutoryRates, ftPtPerDayCosts]);

  // ── Gross-up factor: Total Contract Price / FT+PT Annual Labour Cost ──
  const grossUpFactor = ftPtAnnualTotal > 0 ? contractTotalAnnual / ftPtAnnualTotal : 1;

  // ── Per-DOW cost map: Cost for one PH on that day-of-week (labour basis) ──
  // Cost = BaseDayCost × multiplier (total rate, no gross-up)
  // Used by Detailed Summary PH cost summary table
  const phDowCostMap = useMemo((): Record<DayOfWeek, number> => {
    const map = {} as Record<DayOfWeek, number>;
    phDayCosts.forEach(row => {
      map[row.day as DayOfWeek] = row.baseCost * row.multiplier;
    });
    return map;
  }, [phDayCosts]);

  // ── PH fully-loaded sell price per DOW ──────────────────────
  // PH_PRICE_FACTOR = Total Contract Price Per Annum / FT+PT Annual Labour Cost
  // This embeds all statutory on-costs, sundry, admin & profit automatically.
  // phPriceFactorMap[dow] = sell price for ONE PH on that day-of-week
  // Respects sundayRosterForPublicHolidays: if true, all PHs are priced as Sunday.
  const phPriceFactorMap = useMemo((): Record<DayOfWeek, number> => {
    const phPriceFactor = ftPtAnnualTotal > 0 ? contractTotalAnnual / ftPtAnnualTotal : 1;
    const map = {} as Record<DayOfWeek, number>;
    DAYS_OF_WEEK.forEach(dow => {
      // If sundayRosterForPH=true, use sunday cost basis for every day
      const basisDow: DayOfWeek = jobDetails.sundayRosterForPublicHolidays === true ? 'sun' : dow;
      const labourCost = phDowCostMap[basisDow] ?? 0;
      map[dow] = labourCost * phPriceFactor;
    });
    return map;
  }, [ftPtAnnualTotal, contractTotalAnnual, phDowCostMap, jobDetails.sundayRosterForPublicHolidays]);

  // ── Leap Year Charge (Fixed Price only) ──────────────────────
  const leapYearCharge = useMemo((): LeapYearChargeResult => {
    if (jobDetails.contractPriceCondition !== 'Fixed Price' || jobDetails.fixedYears <= 0) {
      return { leapDays: [], totalCharge: 0, applicable: false };
    }

    // Daily sell price by DOW: proportion of weekly cost × contractTotalAnnual / 52.14
    // Use all operators (FT+PT+Casual) weekly cost per day
    const dailyCostByDow = {} as Record<DayOfWeek, number>;
    const weeklyLabourByDow = {} as Record<DayOfWeek, number>;
    let totalWeeklyLabour = 0;

    DAYS_OF_WEEK.forEach(dow => {
      let dayLabour = 0;
      operators.forEach(op => {
        const calc = computed.calcs.get(op.id);
        const dayCosts = computed.costs.get(op.id);
        const allowInfo = computed.allowances.get(op.id);
        if (!calc || !dayCosts) return;

        const dayIdx = DAYS_OF_WEEK.indexOf(dow);
        const d = calc.days[dayIdx];
        if (!d || d.coverageMin <= 0) return;

        dayLabour += dayCosts[dayIdx]?.cost ?? 0;

        // Proportional allowances
        const weeklyAllowance = allowInfo?.totalWeekly ?? 0;
        const workedDayCount = calc.days.filter(dd => dd.coverageMin > 0).length;
        if (weeklyAllowance > 0 && workedDayCount > 0) {
          dayLabour += weeklyAllowance / workedDayCount;
        }
      });
      weeklyLabourByDow[dow] = dayLabour;
      totalWeeklyLabour += dayLabour;
    });

    // Daily sell price = (dayLabour / totalWeeklyLabour) * contractTotalAnnual / 52.14
    DAYS_OF_WEEK.forEach(dow => {
      if (totalWeeklyLabour > 0) {
        const proportion = weeklyLabourByDow[dow] / totalWeeklyLabour;
        dailyCostByDow[dow] = proportion * contractTotalAnnual / 52.14;
      } else {
        dailyCostByDow[dow] = 0;
      }
    });

    // isWorkedDay: true if any operator is rostered on that DOW
    const isWorkedDay = (dow: DayOfWeek): boolean => {
      return operators.some(op => {
        const calc = computed.calcs.get(op.id);
        if (!calc) return false;
        const dayIdx = DAYS_OF_WEEK.indexOf(dow);
        return calc.days[dayIdx]?.coverageMin > 0;
      });
    };

    return calculateLeapYearCharge(
      jobDetails.contractCommencementMonth,
      jobDetails.fixedYears,
      dailyCostByDow,
      isWorkedDay,
    );
  }, [jobDetails.contractPriceCondition, jobDetails.fixedYears, jobDetails.contractCommencementMonth, operators, computed, contractTotalAnnual]);

  const hasLabourData = operators.length > 0 && grandTotals.annualTotal > 0;

  return {
    isLoading: !isLoaded || !wageLoaded,
    hasLabourData,
    serviceData, grandTotals, SERVICES_ORDER, SERVICE_HEADINGS, ROW_DEFS,
    fmt, fmtHrs, fmtPct,
    // Job details
    jobDetails,
    jobName: jobDetails.jobName, jobState: jobDetails.jobState,
    setJobName, setJobState, updateJobDetails,
    AUSTRALIAN_STATES,
    // Statutory
    statutoryRates, updateStatutoryRate,
    statutoryCalc, statutoryTotal, pliRow, pliError, pliValue,
    PAYROLL_TAX_RATES, PAYROLL_TAX_THRESHOLDS,
    // Sundry
    sundryItems, setSundrySource, setSundryCustomPct, setSundryCalculatorTotal,
    sundryCalc, sundryTotalValue, sundryTotalPct,
    // Sundry display totals (includes PLI for display purposes only)
    sundryDisplayTotal: sundryTotalValue + (pliError ? 0 : pliValue),
    // Admin
    adminRates, updateAdminRate,
    adminCalc, adminTotalValue, adminTotalPct,
    baseCost, contractTotalAnnual, adminError,
    // Totals
    totalPerWeek, totalPerMonth, totalPerAnnum,
    // Services
    servicesWithOperators,
    // Per-operator costs for division/service breakdown
    operatorAnnualCosts,
    // PH cost data (for Detailed Summary + Labour Price Breakdown)
    phDayCosts, phTotalBase, phTotalCost, PH_MULTIPLIERS,
    phPricedCosts,
    ftPtPerDayCosts,
    // PH per-DOW cost for selection table (labour basis)
    phDowCostMap, grossUpFactor,
    // PH fully-loaded sell price per DOW (includes all on-costs, sundry, admin & profit)
    phPriceFactorMap,
    // Leap Year Charge
    leapYearCharge,
    // Year-1 Fixed Price factor
    year1Factor, isFixedPrice, year1FactorDebug, computedYear1Factor,
    // Forecast July increase
    forecastJulyFactor,
  };
}
