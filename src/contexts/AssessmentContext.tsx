import React, { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  LineItem,
  LineItemOverride,
  ProjectConfig,
  BuildingElement,
  ElementTask,
  FloorPlanData,
  ElementGroup,
  DerivedAllowance,
  WendDetailerProgram,
  WendDetailerMode,
  TenantSpecialGroup,
} from "@/types/labourAssessment";
import { DEFAULTS_LIBRARY, CONDITION_FLAGS, DEFAULT_BUILDING_ELEMENTS, TENANT_SPECIAL_TEMPLATES } from "@/data/laSeedData";
import { recalcLineItem, recalcElementTask } from "@/lib/laCalculations";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useLaAutoRoster } from "@/hooks/useLaAutoRoster";

const LABOUR_ASSESSMENT_KEY = 'labour-assessment';
const LABOUR_ASSESSMENT_LOCAL_KEY = 'cpq-labour-assessment';

// ── LA state shape (stored inside cpq projects.data["labour-assessment"]) ──
export interface LAState {
  project: ProjectConfig;
  floorPlan: FloorPlanData;
  buildingElements: BuildingElement[];
  elementTasks: ElementTask[];
  lineItems: LineItem[];
  conditions: Record<string, boolean>;
  overrides: LineItemOverride[];
  projectSetupComplete: boolean;
  wendDetailerMode: string;
  wendDetailerFixedHours: number;
  wendDetailerIncludeInCore: boolean;
  wendDetailerPrograms: WendDetailerProgram[];
  tenantSpecialGroups?: TenantSpecialGroup[];
  /** When true, LA continuously syncs into Operators' Details. */
  laAutoRosterEnabled?: boolean;
  /** When true, LA stops writing to Operators (calculations continue). */
  laRosterFrozen?: boolean;
}

interface AssessmentContextType {
  project: ProjectConfig;
  setProject: (p: ProjectConfig) => void;
  floorPlan: FloorPlanData;
  setFloorPlan: (fp: FloorPlanData) => void;
  buildingElements: BuildingElement[];
  addBuildingElement: (group: ElementGroup, elementType: string, elementName: string, quantityType: "AREA" | "UNIT", tabMapping: string) => void;
  removeBuildingElement: (id: string) => void;
  updateBuildingElement: (id: string, updates: Partial<BuildingElement>) => void;
  elementTasks: ElementTask[];
  updateElementTask: (id: string, updates: Partial<ElementTask>, override?: { field: string; oldValue: string | number; newValue: string | number; reasonCode: string; reasonNote: string }) => void;
  toggleElementTaskInclude: (id: string) => void;
  includeAllElementTasks: (elementId: string) => void;
  resetElementTasks: (elementId: string) => void;
  lineItems: LineItem[];
  conditions: Record<string, boolean>;
  toggleCondition: (flag: string) => void;
  overrides: LineItemOverride[];
  updateLineItem: (id: string, updates: Partial<LineItem>, override?: { field: string; oldValue: string | number; newValue: string | number; reasonCode: string; reasonNote: string }) => void;
  toggleInclude: (id: string) => void;
  includeAllInZone: (zone: string, tabId: string) => void;
  resetZoneToDefaults: (zone: string, tabId: string) => void;
  projectSetupComplete: boolean;
  setProjectSetupComplete: (v: boolean) => void;
  getTabHours: (tabId: string) => number;
  getTotalHours: () => number;
  wendDetailerMode: WendDetailerMode;
  setWendDetailerMode: (m: WendDetailerMode) => void;
  wendDetailerPrograms: WendDetailerProgram[];
  setWendDetailerPrograms: React.Dispatch<React.SetStateAction<WendDetailerProgram[]>>;
  wendDetailerFixedHours: number;
  setWendDetailerFixedHours: (h: number) => void;
  wendDetailerIncludeInCore: boolean;
  setWendDetailerIncludeInCore: (v: boolean) => void;
  getWendDetailerHours: () => number;
  getDiscretionaryHours: () => number;
  tenantSpecialGroups: TenantSpecialGroup[];
  addTenantSpecialGroup: () => string;
  updateTenantSpecialGroup: (id: string, updates: Partial<TenantSpecialGroup>) => void;
  removeTenantSpecialGroup: (id: string) => void;
  addTenantSpecialElement: (
    tenantGroupId: string,
    elementType: string,
    elementName: string,
    quantityType: "AREA" | "UNIT"
  ) => void;
  getTenantSpecialHours: (tenantGroupId: string) => number;
  getTotalTenantSpecialHours: () => number;
  // ── LA → Operators sync controls ──
  laAutoRosterEnabled: boolean;
  setLaAutoRosterEnabled: (v: boolean) => void;
  laRosterFrozen: boolean;
  setLaRosterFrozen: (v: boolean) => void;
  saveAssessmentNow: (overrides?: Partial<LAState>) => Promise<void>;
  isLoading: boolean;
  cpqProjectId: string;
}

const AssessmentContext = createContext<AssessmentContextType | null>(null);

function generateElementTasksForElement(
  element: BuildingElement,
  conditions: Record<string, boolean>
): ElementTask[] {
  const applicableTasks = DEFAULTS_LIBRARY.filter(
    d => d.zone === element.elementType && d.facilityType === "Commercial"
  );
  return applicableTasks.map(d => {
    const isAreaRate = d.calcMethod === "AREA_RATE";
    const task: ElementTask = {
      id: `et-${element.id}-${d.taskId}`,
      buildingElementId: element.id,
      taskId: d.taskId,
      taskName: d.taskName,
      calcMethod: d.calcMethod,
      defaultRate: d.baseRate,
      rateUnit: d.rateUnit,
      rateOverride: null,
      frequencyPerWeek: d.defaultFrequency,
      frequencyDefault: d.defaultFrequency,
      quantityValue: isAreaRate ? element.quantityValue : 0,
      quantitySource: isAreaRate ? "ELEMENT" : "MANUAL",
      included: true,
      notes: "",
      hasOverride: false,
      conditionFlags: d.conditionFlags,
      hoursBase: 0,
      hoursAdjusted: 0,
      taskGroup: d.taskGroup,
      toiletAllowanceEligible: d.toiletAllowanceEligible,
    };
    return recalcElementTask(task, element, conditions);
  });
}

function buildInitialLineItems(conditions: Record<string, boolean>): LineItem[] {
  return DEFAULTS_LIBRARY
    .filter(d => d.facilityType === "Commercial" && d.tabMapping === "detailer-periodics")
    .map(d => {
      const item: LineItem = {
        id: `${d.taskId}-${d.zone}`,
        taskId: d.taskId,
        taskName: d.taskName,
        zone: d.zone,
        zoneDivision: d.zoneDivision,
        tabMapping: d.tabMapping,
        taskGroup: d.taskGroup,
        included: true,
        calcMethod: d.calcMethod,
        baseRate: d.baseRate,
        baseRateDefault: d.baseRate,
        rateUnit: d.rateUnit,
        frequencyPerWeek: d.defaultFrequency,
        frequencyDefault: d.defaultFrequency,
        quantitySource: "DIRECT",
        quantityValue: 0,
        conditionFlags: d.conditionFlags,
        hoursBase: 0,
        hoursAdjusted: 0,
        notes: "",
        hasOverride: false,
      };
      return recalcLineItem(item, conditions);
    });
}

function buildInitialElements(conditions: Record<string, boolean>): { elements: BuildingElement[]; tasks: ElementTask[] } {
  let counter = 0;
  const elements: BuildingElement[] = [];
  const allTasks: ElementTask[] = [];

  for (const template of DEFAULT_BUILDING_ELEMENTS) {
    const id = `el-${counter++}`;
    const element: BuildingElement = { ...template, id };
    elements.push(element);

    if (template.group !== "Supervision") {
      const tasks = generateElementTasksForElement(element, conditions);
      allTasks.push(...tasks);
    }
  }

  return { elements, tasks: allTasks };
}

function buildDefaultConditions(): Record<string, boolean> {
  const c: Record<string, boolean> = {};
  CONDITION_FLAGS.forEach(f => { c[f.flag] = f.defaultValue; });
  return c;
}

const DEFAULT_FLOOR_PLAN: FloorPlanData = {
  areaDataSource: "estimated",
  numberOfLevels: 1,
  totalTenancyArea: 0,
  totalCommonArea: 0,
  nonCleanablePercent: 5,
  nonCleanableAreaOverridden: null,
  tenancySplitPercent: 85,
  tenancySplitOverridden: false,
  inputMode: "percentage",
  carpetPercent: 70,
  carpetArea: 0,
  hardFloorArea: 0,
  gfa: 0,
  glaPercent: 85,
  glaCalculated: 0,
  glaOverridden: null,
  wendDetailerGla: 0,
  wendDetailerGlaOverridden: false,
  derivedAblutions: { percent: 2.5, calculatedArea: 0, overriddenArea: null },
  derivedOtherAmenities: { percent: 1.5, calculatedArea: 0, overriddenArea: null },
  derivedCirculation: { percent: 9.0, calculatedArea: 0, overriddenArea: null },
  derivedFireStairs: { percent: 2.5, calculatedArea: 0, overriddenArea: null },
  derivedPlantRooms: { percent: 3.0, calculatedArea: 0, overriddenArea: null },
  derivedServiceStorage: { percent: 1.5, calculatedArea: 0, overriddenArea: null },
  commercialBuildingStandard: "B",
};

const DEFAULT_WEND_PROGRAMS: WendDetailerProgram[] = [
  { id: "wdp-1", name: "Weekend touch-up clean", included: true, satApplied: true, sunApplied: false, rate: 1500, areaBasis: 0, areaBasisOverridden: false, hoursPerDay: 0, hoursPerWeek: 0, notes: "" },
  { id: "wdp-2", name: "Detailer walk-through", included: true, satApplied: true, sunApplied: false, rate: 2000, areaBasis: 0, areaBasisOverridden: false, hoursPerDay: 0, hoursPerWeek: 0, notes: "" },
  { id: "wdp-3", name: "Periodic spot detailing", included: false, satApplied: true, sunApplied: true, rate: 2500, areaBasis: 0, areaBasisOverridden: false, hoursPerDay: 0, hoursPerWeek: 0, notes: "" },
];

const wendDefaultById = new Map(DEFAULT_WEND_PROGRAMS.map(p => [p.id, p] as const));

function tenantSpecialScore(state?: Partial<LAState> | null): number {
  if (!state) return 0;
  const tenantElements = (state.buildingElements ?? []).filter(e => e.tabMapping === "tenancy-specials");
  const tenantElementIds = new Set(tenantElements.map(e => e.id));
  const tenantTasks = (state.elementTasks ?? []).filter(t => tenantElementIds.has(t.buildingElementId));
  const tenantText = (state.tenantSpecialGroups ?? []).filter(g =>
    Boolean(g.tenantName?.trim() || g.location?.trim() || g.notes?.trim())
  ).length;
  const taskInputs = tenantTasks.filter(t =>
    (t.quantityValue ?? 0) > 0 || (t.hoursAdjusted ?? 0) > 0 || (t.rateOverride ?? 0) > 0 || Boolean(t.notes?.trim())
  ).length;
  return ((state.tenantSpecialGroups ?? []).length * 100) + (tenantElements.length * 10) + tenantText + taskInputs;
}

function wendDetailerScore(state?: Partial<LAState> | null): number {
  if (!state) return 0;
  let score = state.wendDetailerMode === "fixed-hours" ? 25 : 0;
  score += Math.max(0, state.wendDetailerFixedHours ?? 0) * 2;
  for (const p of state.wendDetailerPrograms ?? []) {
    const def = wendDefaultById.get(p.id);
    score += 1 + Math.max(0, p.hoursPerWeek ?? 0) + Math.max(0, p.areaBasis ?? 0) / 1000;
    if (!def || p.name !== def.name || p.rate !== def.rate || p.included !== def.included ||
        p.satApplied !== def.satApplied || p.sunApplied !== def.sunApplied || Boolean(p.notes?.trim())) {
      score += 25;
    }
    if (p.areaBasisOverridden) score += 10;
  }
  return score;
}

function mergeTenantSpecialSlice(base: LAState, source: LAState): LAState {
  const baseTenantIds = new Set((base.buildingElements ?? []).filter(e => e.tabMapping === "tenancy-specials").map(e => e.id));
  const sourceTenantElements = (source.buildingElements ?? []).filter(e => e.tabMapping === "tenancy-specials");
  const sourceTenantIds = new Set(sourceTenantElements.map(e => e.id));
  return {
    ...base,
    tenantSpecialGroups: source.tenantSpecialGroups ?? [],
    buildingElements: [
      ...(base.buildingElements ?? []).filter(e => e.tabMapping !== "tenancy-specials"),
      ...sourceTenantElements,
    ],
    elementTasks: [
      ...(base.elementTasks ?? []).filter(t => !baseTenantIds.has(t.buildingElementId)),
      ...(source.elementTasks ?? []).filter(t => sourceTenantIds.has(t.buildingElementId)),
    ],
  };
}

function mergeAssessmentSnapshots(base: LAState | undefined, incoming: LAState | undefined): LAState | undefined {
  if (!base) return incoming;
  if (!incoming) return base;
  let merged: LAState = { ...base, ...incoming };
  if (tenantSpecialScore(base) > tenantSpecialScore(incoming)) {
    merged = mergeTenantSpecialSlice(merged, base);
  }
  if (wendDetailerScore(base) > wendDetailerScore(incoming)) {
    merged = {
      ...merged,
      wendDetailerMode: base.wendDetailerMode,
      wendDetailerFixedHours: base.wendDetailerFixedHours,
      wendDetailerIncludeInCore: base.wendDetailerIncludeInCore,
      wendDetailerPrograms: base.wendDetailerPrograms,
    };
  }
  return merged;
}

const SAVE_DEBOUNCE = 2000;

export function AssessmentProvider({ children, cpqProjectId }: { children: React.ReactNode; cpqProjectId: string }) {
  const [isLoading, setIsLoading] = useState(true);

  const defaultConditions = buildDefaultConditions();
  const { elements: defaultElements, tasks: defaultTasks } = buildInitialElements(defaultConditions);

  const [project, setProject] = useState<ProjectConfig>({
    projectName: "",
    facilityType: "Commercial",
    basisOfEstimate: "Combination",
    notes: "",
  });

  const [floorPlan, setFloorPlanState] = useState<FloorPlanData>(DEFAULT_FLOOR_PLAN);
  const [conditions, setConditions] = useState<Record<string, boolean>>(defaultConditions);
  const [buildingElements, setBuildingElements] = useState<BuildingElement[]>(defaultElements);
  const [elementTasks, setElementTasks] = useState<ElementTask[]>(defaultTasks);
  const [lineItems, setLineItems] = useState<LineItem[]>(() => buildInitialLineItems(defaultConditions));
  const [overrides, setOverrides] = useState<LineItemOverride[]>([]);
  
  const [projectSetupComplete, setProjectSetupComplete] = useState(false);

  const [wendDetailerMode, setWendDetailerMode] = useState<WendDetailerMode>("area-based");
  const [wendDetailerFixedHours, setWendDetailerFixedHours] = useState(0);
  const [wendDetailerIncludeInCore, setWendDetailerIncludeInCore] = useState(true);
  const [wendDetailerPrograms, setWendDetailerPrograms] = useState<WendDetailerProgram[]>(DEFAULT_WEND_PROGRAMS);
  const [tenantSpecialGroups, setTenantSpecialGroups] = useState<TenantSpecialGroup[]>([]);
  const [laAutoRosterEnabled, setLaAutoRosterEnabled] = useState(false);
  const [laRosterFrozen, setLaRosterFrozen] = useState(false);

  // ── Persistence: load LA state from CPQ project's data["labour-assessment"] ──
  useEffect(() => {
    if (!cpqProjectId) { setIsLoading(false); return; }

    const load = async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('data')
        .eq('id', cpqProjectId)
        .single();

      if (!error && data) {
          const blob = data.data as Record<string, Json> | null;
          const savedLegacyState = blob?.[LABOUR_ASSESSMENT_KEY] as unknown as LAState | undefined;
          const savedLocalState = blob?.[LABOUR_ASSESSMENT_LOCAL_KEY] as unknown as LAState | undefined;
          const laState = mergeAssessmentSnapshots(savedLegacyState, savedLocalState);
        if (laState && laState.project) {
          setProject(laState.project);
          const loadedFp = laState.floorPlan || DEFAULT_FLOOR_PLAN;
          // Migrate: ensure new derived fields exist
          if (!loadedFp.derivedPlantRooms) loadedFp.derivedPlantRooms = DEFAULT_FLOOR_PLAN.derivedPlantRooms;
          if (!loadedFp.derivedServiceStorage) loadedFp.derivedServiceStorage = DEFAULT_FLOOR_PLAN.derivedServiceStorage;
          // Migrate: split legacy derivedAmenities into Ablutions (2.5/4) + Other (1.5/4).
          if (!loadedFp.derivedAblutions || !loadedFp.derivedOtherAmenities) {
            const legacy = loadedFp.derivedAmenities;
            if (legacy) {
              const pct = legacy.percent || 4.0;
              loadedFp.derivedAblutions = { percent: +(pct * (2.5 / 4.0)).toFixed(2), calculatedArea: 0, overriddenArea: null };
              loadedFp.derivedOtherAmenities = { percent: +(pct * (1.5 / 4.0)).toFixed(2), calculatedArea: 0, overriddenArea: null };
            } else {
              loadedFp.derivedAblutions = DEFAULT_FLOOR_PLAN.derivedAblutions;
              loadedFp.derivedOtherAmenities = DEFAULT_FLOOR_PLAN.derivedOtherAmenities;
            }
            delete loadedFp.derivedAmenities;
          }
          if (!loadedFp.areaDataSource) loadedFp.areaDataSource = "estimated";
          if (loadedFp.numberOfLevels === undefined || loadedFp.numberOfLevels === null) loadedFp.numberOfLevels = 1;
          if (loadedFp.nonCleanablePercent === undefined || loadedFp.nonCleanablePercent === null) loadedFp.nonCleanablePercent = 5;
          if (loadedFp.nonCleanableAreaOverridden === undefined) loadedFp.nonCleanableAreaOverridden = null;
          if (loadedFp.tenancySplitPercent === undefined || loadedFp.tenancySplitPercent === null) loadedFp.tenancySplitPercent = 85;
          if (loadedFp.tenancySplitOverridden === undefined) loadedFp.tenancySplitOverridden = false;
          if (!loadedFp.commercialBuildingStandard) loadedFp.commercialBuildingStandard = "B";
          setFloorPlanState(loadedFp);
          const rawElements = laState.buildingElements || defaultElements;
          // Migrate: drop legacy "Common Amenities (Derived)" element. The new
          // Ablutions + Other Amenities derived elements seed automatically on
          // the next setFloorPlan via the DERIVED_ELEMENTS loop.
          const legacyAmenityIds = new Set(
            rawElements.filter((e: BuildingElement) => e.elementType === "Common Amenities (Derived)").map(e => e.id),
          );
          const loadedElementsRaw = rawElements.filter((e: BuildingElement) => !legacyAmenityIds.has(e.id));
          // Discretionary Staff (Supervision) rows are user-managed once a
          // project is saved. Do NOT re-seed missing rows from the defaults
          // on reload — deleted rows must stay deleted. Defaults are only
          // applied to brand-new projects via buildInitialElements().
          const loadedElements = loadedElementsRaw;
          setBuildingElements(loadedElements);
          const rawTasks = laState.elementTasks || defaultTasks;
          // Tenant Special Services tasks must always use manual quantity entry.
          const tenantSpecialElementIds = new Set(
            loadedElements
              .filter((e: BuildingElement) => e.tabMapping === "tenancy-specials")
              .map(e => e.id)
          );
          const normalizedTasks = rawTasks
            .filter((t: ElementTask) => !legacyAmenityIds.has(t.buildingElementId))
            .map((t: ElementTask) =>
              tenantSpecialElementIds.has(t.buildingElementId) && t.quantitySource !== "MANUAL"
                ? { ...t, quantitySource: "MANUAL" as const }
                : t
            );
          setElementTasks(normalizedTasks);

          setLineItems(laState.lineItems || buildInitialLineItems(defaultConditions));
          setConditions(laState.conditions || defaultConditions);
          setOverrides(laState.overrides || []);
          
          setProjectSetupComplete(laState.projectSetupComplete ?? false);
          setWendDetailerMode((laState.wendDetailerMode as WendDetailerMode) ?? "area-based");
          setWendDetailerFixedHours(laState.wendDetailerFixedHours ?? 0);
          setWendDetailerIncludeInCore(laState.wendDetailerIncludeInCore ?? true);
          setWendDetailerPrograms(laState.wendDetailerPrograms ?? DEFAULT_WEND_PROGRAMS);
          setLaAutoRosterEnabled(laState.laAutoRosterEnabled ?? false);
          setLaRosterFrozen(laState.laRosterFrozen ?? false);

          // ── Tenant Specials migration ──
          // Legacy projects stored a single shared Tenancy Specials element list with no
          // tenantGroupId. Wrap them in one default group so calculations are preserved.
          const loadedGroups = laState.tenantSpecialGroups ?? [];
          const legacySpecials = loadedElements.filter(
            (e: BuildingElement) => e.tabMapping === "tenancy-specials" && !e.tenantGroupId
          );
          if (loadedGroups.length === 0 && legacySpecials.length > 0) {
            const legacyGroup: TenantSpecialGroup = {
              id: `tsg-legacy-${Date.now()}`,
              tenantName: "General Tenancy Specials",
              location: "",
              notes: "Auto-migrated from previous shared Tenancy Specials list.",
              included: true,
            };
            setTenantSpecialGroups([legacyGroup]);
            setBuildingElements(prev =>
              prev.map(el =>
                el.tabMapping === "tenancy-specials" && !el.tenantGroupId
                  ? { ...el, tenantGroupId: legacyGroup.id }
                  : el
              )
            );
          } else {
            setTenantSpecialGroups(loadedGroups);
          }
        }
      }
      setIsLoading(false);
    };
    load();
  }, [cpqProjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Autosave: debounce writes to projects.data["labour-assessment"] ──
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);

  const getState = useCallback((): LAState => ({
    project,
    floorPlan,
    buildingElements,
    elementTasks,
    lineItems,
    conditions,
    overrides,
    projectSetupComplete,
    wendDetailerMode,
    wendDetailerFixedHours,
    wendDetailerIncludeInCore,
    wendDetailerPrograms,
    tenantSpecialGroups,
    laAutoRosterEnabled,
    laRosterFrozen,
  }), [project, floorPlan, buildingElements, elementTasks, lineItems, conditions, overrides,
    projectSetupComplete, wendDetailerMode, wendDetailerFixedHours,
    wendDetailerIncludeInCore, wendDetailerPrograms, tenantSpecialGroups,
    laAutoRosterEnabled, laRosterFrozen]);

  const saveAssessmentNow = useCallback(async (overrides: Partial<LAState> = {}) => {
    const laState = { ...getState(), ...overrides } as LAState;
    try { localStorage.setItem(LABOUR_ASSESSMENT_LOCAL_KEY, JSON.stringify(laState)); } catch {}
    if (!cpqProjectId) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const { data: row } = await supabase
      .from('projects')
      .select('data')
      .eq('id', cpqProjectId)
      .single();
    const currentData = (row?.data as Record<string, Json>) || {};
    const merged = {
      ...currentData,
      [LABOUR_ASSESSMENT_KEY]: laState as unknown as Json,
      [LABOUR_ASSESSMENT_LOCAL_KEY]: laState as unknown as Json,
    };
    const { error } = await supabase
      .from('projects')
      .update({ data: merged as Json })
      .eq('id', cpqProjectId);
    if (error) throw error;
  }, [getState, cpqProjectId]);

  useEffect(() => {
    if (!cpqProjectId || isLoading) return;
    try { localStorage.setItem(LABOUR_ASSESSMENT_LOCAL_KEY, JSON.stringify(getState())); } catch {}
  }, [getState, cpqProjectId, isLoading]);

  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    if (!cpqProjectId || isLoading) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      await saveAssessmentNow();
    }, SAVE_DEBOUNCE);

    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [saveAssessmentNow, cpqProjectId, isLoading]);

  // ── Business logic (same as original) ──

  // Ref to read latest commercial-building standard inside callbacks without
  // adding it to every dep array.
  const stdRef = useRef<"A" | "B" | undefined>(floorPlan.commercialBuildingStandard as "A" | "B" | undefined);
  useEffect(() => {
    stdRef.current = floorPlan.commercialBuildingStandard as "A" | "B" | undefined;
  }, [floorPlan.commercialBuildingStandard]);
  const std = () => stdRef.current;

  const recalcAllElementTasks = useCallback((tasks: ElementTask[], elements: BuildingElement[], conds: Record<string, boolean>) => {
    return tasks.map(task => {
      const element = elements.find(e => e.id === task.buildingElementId);
      if (!element) return task;
      return recalcElementTask(task, element, conds, std());
    });
  }, []);

  const recalcAllLineItems = useCallback((items: LineItem[], conds: Record<string, boolean>) => {
    return items.map(item => recalcLineItem(item, conds, std()));
  }, []);

  // Re-run multiplier-aware recalculation whenever conditions or the commercial
  // building standard change. The standard affects the SECURE_FLOORS uplift.
  useEffect(() => {
    setLineItems(prev => prev.map(li => recalcLineItem(li, conditions, std())));
    setElementTasks(prev => prev.map(t => {
      const el = buildingElements.find(e => e.id === t.buildingElementId);
      if (!el) return t;
      return recalcElementTask(t, el, conditions, std());
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conditions, floorPlan.commercialBuildingStandard]);




  const DERIVED_ELEMENTS = [
    { key: "derivedAblutions" as const, name: "Common Ablutions (Derived)", type: "Common Ablutions (Derived)" },
    { key: "derivedOtherAmenities" as const, name: "Common Other Amenities (Derived)", type: "Common Other Amenities (Derived)" },
    { key: "derivedCirculation" as const, name: "Common Circulation & Lift Lobbies (Derived)", type: "Common Circulation & Lift Lobbies (Derived)" },
    { key: "derivedFireStairs" as const, name: "Fire Stairs (Derived)", type: "Fire Stairs (Derived)" },
    { key: "derivedPlantRooms" as const, name: "Plant Rooms & Services (Derived)", type: "Plant Rooms & Services (Derived)" },
    { key: "derivedServiceStorage" as const, name: "Service Storage & Back-of-House (Derived)", type: "Service Storage & Back-of-House (Derived)" },
  ];

  const setFloorPlan = useCallback((fp: FloorPlanData) => {
    const effectiveGla = fp.glaOverridden !== null ? fp.glaOverridden : fp.glaCalculated;
    if (!fp.wendDetailerGlaOverridden) {
      fp = { ...fp, wendDetailerGla: effectiveGla };
    }

    setFloorPlanState(fp);

    setWendDetailerPrograms(prev =>
      prev.map(p => {
        if (p.areaBasisOverridden) return p;
        const updated = { ...p, areaBasis: fp.wendDetailerGlaOverridden ? fp.wendDetailerGla : effectiveGla };
        if (updated.rate > 0) {
          updated.hoursPerDay = updated.areaBasis / updated.rate;
        }
        const daysCount = (updated.satApplied ? 1 : 0) + (updated.sunApplied ? 1 : 0);
        updated.hoursPerWeek = updated.hoursPerDay * daysCount;
        return updated;
      })
    );

    setBuildingElements(prev => {
      let next = prev.map(el => {
        if (el.elementType === "Carpet" && el.group === "Tenancy Areas") {
          return { ...el, quantityValue: fp.carpetArea };
        }
        if (el.elementType === "Hard Floor" && el.group === "Tenancy Areas") {
          return { ...el, quantityValue: fp.hardFloorArea };
        }
        return el;
      });

      for (const def of DERIVED_ELEMENTS) {
        const allowance = fp[def.key];
        const area = allowance.overriddenArea !== null ? allowance.overriddenArea : allowance.calculatedArea;
        const existing = next.find(e => e.elementType === def.type && e.group === "Common & Public Areas");
        if (fp.gfa > 0) {
          if (existing) {
            next = next.map(e => e.id === existing.id ? { ...e, quantityValue: area } : e);
          } else {
            const id = `el-derived-${def.key}-${Date.now()}`;
            const newEl: BuildingElement = {
              id, group: "Common & Public Areas", elementType: def.type, elementName: def.name,
              quantityType: "AREA", quantityValue: area, frequencyPw: 5, included: true, notes: "",
              tabMapping: "common-public",
            };
            next = [...next, newEl];
            const tasks = generateElementTasksForElement(newEl, conditions);
            setElementTasks(t => [...t, ...tasks]);
          }
        }
      }

      setElementTasks(tasks => recalcAllElementTasks(tasks, next, conditions));
      return next;
    });
  }, [conditions, recalcAllElementTasks]);

  const toggleCondition = useCallback((flag: string) => {
    setConditions(prev => {
      const next = { ...prev, [flag]: !prev[flag] };
      setLineItems(items => recalcAllLineItems(items, next));
      setBuildingElements(els => {
        setElementTasks(tasks => recalcAllElementTasks(tasks, els, next));
        return els;
      });
      return next;
    });
  }, [recalcAllLineItems, recalcAllElementTasks]);

  const addBuildingElement = useCallback((
    group: ElementGroup, elementType: string, elementName: string,
    quantityType: "AREA" | "UNIT", tabMapping: string
  ) => {
    const id = `el-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const element: BuildingElement = {
      id, group, elementType, elementName, quantityType,
      quantityValue: group === "Supervision" ? 1 : 0,
      frequencyPw: 5, included: true, notes: "", tabMapping,
    };
    setBuildingElements(prev => [...prev, element]);
    const tasks = generateElementTasksForElement(element, conditions);
    setElementTasks(prev => [...prev, ...tasks]);
  }, [conditions]);

  const removeBuildingElement = useCallback((id: string) => {
    setBuildingElements(prev => prev.filter(e => e.id !== id));
    setElementTasks(prev => prev.filter(t => t.buildingElementId !== id));
  }, []);

  const updateBuildingElement = useCallback((id: string, updates: Partial<BuildingElement>) => {
    setBuildingElements(prev => {
      const next = prev.map(el => el.id === id ? { ...el, ...updates } : el);
      const updated = next.find(e => e.id === id);
      if (updated) {
        setElementTasks(tasks =>
          tasks.map(t => {
            if (t.buildingElementId !== id) return t;
            return recalcElementTask(t, updated, conditions, std());
          })
        );
      }
      return next;
    });
  }, [conditions]);

  const updateElementTask = useCallback((
    id: string,
    updates: Partial<ElementTask>,
    override?: { field: string; oldValue: string | number; newValue: string | number; reasonCode: string; reasonNote: string }
  ) => {
    if (override) {
      setOverrides(prev => [...prev, {
        id: `ovr-${Date.now()}`,
        lineItemId: id,
        field: override.field,
        oldValue: override.oldValue,
        newValue: override.newValue,
        reasonCode: override.reasonCode,
        reasonNote: override.reasonNote,
        user: "Current User",
        timestamp: new Date().toISOString(),
      }]);
    }
    setElementTasks(prev => {
      return prev.map(task => {
        if (task.id !== id) return task;
        const updated = { ...task, ...updates, hasOverride: override ? true : task.hasOverride };
        const element = buildingElements.find(e => e.id === updated.buildingElementId);
        if (!element) return updated;
        return recalcElementTask(updated, element, conditions, std());
      });
    });
  }, [conditions, buildingElements]);

  const toggleElementTaskInclude = useCallback((id: string) => {
    setElementTasks(prev => prev.map(t =>
      t.id === id ? { ...t, included: !t.included } : t
    ));
  }, []);

  const includeAllElementTasks = useCallback((elementId: string) => {
    setElementTasks(prev => prev.map(t =>
      t.buildingElementId === elementId ? { ...t, included: true } : t
    ));
  }, []);

  const resetElementTasks = useCallback((elementId: string) => {
    const element = buildingElements.find(e => e.id === elementId);
    if (!element) return;
    setElementTasks(prev => {
      const otherTasks = prev.filter(t => t.buildingElementId !== elementId);
      const freshTasks = generateElementTasksForElement(element, conditions);
      return [...otherTasks, ...freshTasks];
    });
  }, [buildingElements, conditions]);

  const updateLineItem = useCallback((
    id: string,
    updates: Partial<LineItem>,
    override?: { field: string; oldValue: string | number; newValue: string | number; reasonCode: string; reasonNote: string }
  ) => {
    if (override) {
      setOverrides(prev => [...prev, {
        id: `ovr-${Date.now()}`,
        lineItemId: id,
        field: override.field,
        oldValue: override.oldValue,
        newValue: override.newValue,
        reasonCode: override.reasonCode,
        reasonNote: override.reasonNote,
        user: "Current User",
        timestamp: new Date().toISOString(),
      }]);
    }
    setLineItems(prev => {
      return prev.map(item => {
        if (item.id !== id) return item;
        const updated = { ...item, ...updates, hasOverride: override ? true : item.hasOverride };
        return recalcLineItem(updated, conditions, std());
      });
    });
  }, [conditions]);

  const toggleInclude = useCallback((id: string) => {
    setLineItems(prev => prev.map(item =>
      item.id === id ? { ...item, included: !item.included } : item
    ));
  }, []);

  const includeAllInZone = useCallback((zone: string, tabId: string) => {
    setLineItems(prev => prev.map(item =>
      item.zone === zone && item.tabMapping === tabId ? { ...item, included: true } : item
    ));
  }, []);

  const resetZoneToDefaults = useCallback((zone: string, tabId: string) => {
    setLineItems(prev => {
      return prev.map(item => {
        if (item.zone !== zone || item.tabMapping !== tabId) return item;
        const def = DEFAULTS_LIBRARY.find(d => d.taskId === item.taskId);
        if (!def) return item;
        const reset: LineItem = {
          ...item,
          baseRate: def.baseRate,
          frequencyPerWeek: def.defaultFrequency,
          hasOverride: false,
          included: true,
          quantitySource: "DIRECT",
          quantityValue: 0,
          notes: "",
        };
        return recalcLineItem(reset, conditions, std());
      });
    });
  }, [conditions]);

  const getWendDetailerHours = useCallback(() => {
    if (wendDetailerMode === "fixed-hours") return wendDetailerFixedHours;
    return wendDetailerPrograms
      .filter(p => p.included)
      .reduce((s, p) => s + p.hoursPerWeek, 0);
  }, [wendDetailerMode, wendDetailerFixedHours, wendDetailerPrograms]);

  const getDiscretionaryHours = useCallback(() => {
    // Discretionary Staff (Supervision group) hours = qty × hoursPerDay × workdays/week.
    // These elements don't produce elementTasks; they spawn operators directly.
    return buildingElements
      .filter(el => el.group === "Supervision" && el.included)
      .reduce((s, el) => {
        const qty = Math.max(0, Math.floor(el.quantityValue || 0));
        const hpd = el.hoursPerDay ?? 0;
        const days = Math.min(7, Math.max(0, el.frequencyPw ?? 5));
        return s + qty * hpd * days;
      }, 0);
  }, [buildingElements]);

  const getTabHours = useCallback((tabId: string) => {
    if (["tenancy-areas", "tenancy-specials", "common-public"].includes(tabId)) {
      // Tenancy Areas consolidates Tenancy Specials, but tenant-specials elements are
      // only counted when their parent tenantSpecialGroup is also included.
      const mappingIds = tabId === "tenancy-areas"
        ? ["tenancy-areas", "tenancy-specials"]
        : [tabId];
      const includedGroupIds = new Set(tenantSpecialGroups.filter(g => g.included).map(g => g.id));
      const tabElements = buildingElements.filter(e => {
        if (!mappingIds.includes(e.tabMapping) || !e.included) return false;
        if (e.tabMapping === "tenancy-specials") {
          return e.tenantGroupId ? includedGroupIds.has(e.tenantGroupId) : false;
        }
        return true;
      });
      const tabElementIds = new Set(tabElements.map(e => e.id));
      return elementTasks
        .filter(t => tabElementIds.has(t.buildingElementId) && t.included)
        .reduce((s, t) => s + t.hoursAdjusted, 0);
    }
    if (tabId === "detailer-periodics") {
      return getWendDetailerHours();
    }
    if (tabId === "support-roles") {
      return getDiscretionaryHours();
    }
    return lineItems
      .filter(li => li.included && li.tabMapping === tabId)
      .reduce((s, li) => s + li.hoursAdjusted, 0);
  }, [buildingElements, elementTasks, lineItems, getWendDetailerHours, getDiscretionaryHours, tenantSpecialGroups]);



  const getTotalHours = useCallback(() => {
    const includedGroupIds = new Set(tenantSpecialGroups.filter(g => g.included).map(g => g.id));
    const etHours = elementTasks
      .filter(t => {
        const el = buildingElements.find(e => e.id === t.buildingElementId);
        if (!t.included || !el?.included) return false;
        if (el.tabMapping === "tenancy-specials") {
          return el.tenantGroupId ? includedGroupIds.has(el.tenantGroupId) : false;
        }
        return true;
      })
      .reduce((s, t) => s + t.hoursAdjusted, 0);
    const liHours = lineItems
      .filter(li => li.included)
      .reduce((s, li) => s + li.hoursAdjusted, 0);
    const wendHours = wendDetailerIncludeInCore ? getWendDetailerHours() : 0;
    const discHours = getDiscretionaryHours();
    return etHours + liHours + wendHours + discHours;
  }, [elementTasks, buildingElements, lineItems, wendDetailerIncludeInCore, getWendDetailerHours, getDiscretionaryHours, tenantSpecialGroups]);

  // ── Tenant Special Groups actions ──
  const addTenantSpecialGroup = useCallback((): string => {
    const id = `tsg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newGroup: TenantSpecialGroup = {
      id,
      tenantName: "",
      location: "",
      notes: "",
      included: true,
    };
    setTenantSpecialGroups(prev => [...prev, newGroup]);

    // Clone the 6 default tenant-special templates into this group.
    const baseTime = Date.now();
    const newElements: BuildingElement[] = TENANT_SPECIAL_TEMPLATES.map((tpl, idx) => ({
      ...tpl,
      id: `el-${baseTime}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
      tenantGroupId: id,
    }));
    setBuildingElements(prev => [...prev, ...newElements]);

    // Tenant Special Services are independent of LA building elements.
    // Force MANUAL quantity entry on every task — no "from element" sourcing.
    const newTasks: ElementTask[] = newElements.flatMap(el =>
      generateElementTasksForElement(el, conditions).map(t => ({
        ...t,
        quantitySource: "MANUAL" as const,
        quantityValue: 0,
        hoursBase: 0,
        hoursAdjusted: 0,
      }))
    );
    setElementTasks(prev => [...prev, ...newTasks]);
    return id;
  }, [conditions]);

  const updateTenantSpecialGroup = useCallback((id: string, updates: Partial<TenantSpecialGroup>) => {
    setTenantSpecialGroups(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g));
  }, []);

  const removeTenantSpecialGroup = useCallback((id: string) => {
    setTenantSpecialGroups(prev => prev.filter(g => g.id !== id));
    setBuildingElements(prev => {
      const removedIds = new Set(prev.filter(e => e.tenantGroupId === id).map(e => e.id));
      setElementTasks(t => t.filter(task => !removedIds.has(task.buildingElementId)));
      return prev.filter(e => e.tenantGroupId !== id);
    });
  }, []);

  const addTenantSpecialElement = useCallback((
    tenantGroupId: string,
    elementType: string,
    elementName: string,
    quantityType: "AREA" | "UNIT"
  ) => {
    const id = `el-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const element: BuildingElement = {
      id,
      group: "Tenancy Specials",
      elementType,
      elementName,
      quantityType,
      quantityValue: 0,
      frequencyPw: 5,
      included: true,
      notes: "",
      tabMapping: "tenancy-specials",
      tenantGroupId,
    };
    setBuildingElements(prev => [...prev, element]);
    // Tenant Special Services are independent of LA building elements.
    // Force MANUAL quantity entry on every task — no "from element" sourcing.
    const tasks = generateElementTasksForElement(element, conditions).map(t => ({
      ...t,
      quantitySource: "MANUAL" as const,
      quantityValue: 0,
      hoursBase: 0,
      hoursAdjusted: 0,
    }));
    setElementTasks(prev => [...prev, ...tasks]);
  }, [conditions]);

  const getTenantSpecialHours = useCallback((tenantGroupId: string): number => {
    const groupElementIds = new Set(
      buildingElements.filter(e => e.tenantGroupId === tenantGroupId && e.included).map(e => e.id)
    );
    return elementTasks
      .filter(t => groupElementIds.has(t.buildingElementId) && t.included)
      .reduce((s, t) => s + t.hoursAdjusted, 0);
  }, [buildingElements, elementTasks]);

  const getTotalTenantSpecialHours = useCallback((): number => {
    const includedGroupIds = new Set(tenantSpecialGroups.filter(g => g.included).map(g => g.id));
    const groupElementIds = new Set(
      buildingElements
        .filter(e => e.included && e.tenantGroupId && includedGroupIds.has(e.tenantGroupId))
        .map(e => e.id)
    );
    return elementTasks
      .filter(t => groupElementIds.has(t.buildingElementId) && t.included)
      .reduce((s, t) => s + t.hoursAdjusted, 0);
  }, [buildingElements, elementTasks, tenantSpecialGroups]);

  const value = useMemo(() => ({
    project, setProject, floorPlan, setFloorPlan,
    buildingElements, addBuildingElement, removeBuildingElement, updateBuildingElement,
    elementTasks, updateElementTask, toggleElementTaskInclude,
    includeAllElementTasks, resetElementTasks,
    lineItems, conditions, toggleCondition, overrides,
    updateLineItem, toggleInclude, includeAllInZone, resetZoneToDefaults,
    
    projectSetupComplete, setProjectSetupComplete,
    getTabHours, getTotalHours,
    wendDetailerMode, setWendDetailerMode,
    wendDetailerPrograms, setWendDetailerPrograms,
    wendDetailerFixedHours, setWendDetailerFixedHours,
    wendDetailerIncludeInCore, setWendDetailerIncludeInCore,
    getWendDetailerHours,
    getDiscretionaryHours,
    tenantSpecialGroups,
    addTenantSpecialGroup, updateTenantSpecialGroup, removeTenantSpecialGroup,
    addTenantSpecialElement, getTenantSpecialHours, getTotalTenantSpecialHours,
    laAutoRosterEnabled, setLaAutoRosterEnabled,
    laRosterFrozen, setLaRosterFrozen,
    saveAssessmentNow,
    isLoading,
    cpqProjectId,
  }), [project, floorPlan, setFloorPlan, buildingElements, elementTasks, lineItems,
    conditions, overrides, projectSetupComplete,
    addBuildingElement, removeBuildingElement, updateBuildingElement,
    updateElementTask, toggleElementTaskInclude, includeAllElementTasks, resetElementTasks,
    toggleCondition, updateLineItem, toggleInclude, includeAllInZone,
    resetZoneToDefaults, getTabHours, getTotalHours,
    wendDetailerMode, wendDetailerPrograms, wendDetailerFixedHours,
    wendDetailerIncludeInCore, getWendDetailerHours, getDiscretionaryHours,
    tenantSpecialGroups, addTenantSpecialGroup, updateTenantSpecialGroup,
    removeTenantSpecialGroup, addTenantSpecialElement, getTenantSpecialHours, getTotalTenantSpecialHours,
    laAutoRosterEnabled, laRosterFrozen,
    saveAssessmentNow, isLoading, cpqProjectId]);

  // Continuous LA → Operators sync. Mounted here so it has access to the
  // full LA state and runs regardless of which page is currently rendered.
  const laStateForSync = useMemo(() => getState(), [getState]);
  useLaAutoRoster(laStateForSync, laAutoRosterEnabled, laRosterFrozen, isLoading, saveAssessmentNow);

  return (
    <AssessmentContext.Provider value={value}>
      {children}
    </AssessmentContext.Provider>
  );
}

export function useAssessment() {
  const ctx = useContext(AssessmentContext);
  if (!ctx) throw new Error("useAssessment must be used within AssessmentProvider");
  return ctx;
}
