export type CalcMethod = "AREA_RATE" | "TIME_PER_UNIT";
export type ClutterLevel = "LOW" | "NORMAL" | "HIGH" | "EXTREME";
export type QuantitySource = "DIRECT" | "DERIVED_RULE";
export type BasisOfEstimate = "Document-based" | "Site inspected" | "Combination";
export type DerivedRuleType = "PCT_TOTAL_AREA" | "PCT_ZONE_AREA";
export type ElementGroup = "Tenancy Areas" | "Common & Public Areas" | "Tenancy Specials" | "Supervision";

export interface DefaultTask {
  taskId: string;
  taskName: string;
  zoneDivision: string;
  zone: string;
  taskGroup: string;
  calcMethod: CalcMethod;
  baseRate: number;
  rateUnit: string;
  defaultFrequency: number;
  conditionFlags: string[];
  facilityType: string;
  tabMapping: string;
  /** Seed default for ElementTask.toiletAllowanceEligible. */
  toiletAllowanceEligible?: boolean;
}

export interface ClutterMultiplier {
  level: ClutterLevel;
  multiplier: number;
}

export interface OverrideReason {
  code: string;
  label: string;
}

export interface ConditionFlag {
  flag: string;
  label: string;
  defaultValue: boolean;
}

export interface ProjectConfig {
  projectName: string;
  facilityType: string;
  basisOfEstimate: BasisOfEstimate;
  notes: string;
}

export interface LineItemOverride {
  id: string;
  lineItemId: string;
  field: string;
  oldValue: string | number;
  newValue: string | number;
  reasonCode: string;
  reasonNote: string;
  user: string;
  timestamp: string;
}

export interface DerivedRule {
  type: DerivedRuleType;
  percent: number;
  referenceValue?: number;
}

export interface LineItem {
  id: string;
  taskId: string;
  taskName: string;
  zone: string;
  zoneDivision: string;
  tabMapping: string;
  taskGroup: string;
  included: boolean;
  calcMethod: CalcMethod;
  baseRate: number;
  baseRateDefault: number;
  rateUnit: string;
  frequencyPerWeek: number;
  frequencyDefault: number;
  quantitySource: QuantitySource;
  quantityValue: number;
  derivedRule?: DerivedRule;
  conditionFlags: string[];
  hoursBase: number;
  hoursAdjusted: number;
  notes: string;
  hasOverride: boolean;
}

export interface TabConfig {
  id: string;
  label: string;
  zones: string[];
}

export interface DerivedAllowance {
  percent: number;
  calculatedArea: number;
  overriddenArea: number | null;
}

export type WendDetailerMode = "area-based" | "fixed-hours";

export interface WendDetailerProgram {
  id: string;
  name: string;
  included: boolean;
  satApplied: boolean;
  sunApplied: boolean;
  rate: number;
  areaBasis: number;
  areaBasisOverridden: boolean;
  hoursPerDay: number;
  hoursPerWeek: number;
  notes: string;
}

export type AreaDataSource = "estimated" | "supplied" | "measured";

export type CommercialBuildingStandard = "A" | "B";

export interface FloorPlanData {
  /** Benchmark profile for desktop estimating. Defaults to "B".
   *  Drives default Building Element percentages in Start Here. */
  commercialBuildingStandard?: CommercialBuildingStandard;
  areaDataSource: AreaDataSource;
  numberOfLevels: number;
  totalTenancyArea: number;
  totalCommonArea: number;
  /** Non-cleanable area as % of GFA (benchmark in Estimated mode). */
  nonCleanablePercent: number;
  /** Manual override for non-cleanable area (m²); null = use percent x GFA. */
  nonCleanableAreaOverridden: number | null;
  /** % of Total Cleanable Area allocated to Tenancy (remainder = Common/Public). */
  tenancySplitPercent: number;
  /** True when the user has overridden the derived tenancy/common split in Estimated mode. */
  tenancySplitOverridden: boolean;
  inputMode: "percentage" | "manual";
  carpetPercent: number;
  carpetArea: number;
  hardFloorArea: number;
  gfa: number;
  glaPercent: number;
  glaCalculated: number;
  glaOverridden: number | null;
  wendDetailerGla: number;
  wendDetailerGlaOverridden: boolean;
  /**
   * @deprecated Use derivedAblutions + derivedOtherAmenities. Retained only
   * for migrating legacy saved blobs; not present on new projects.
   */
  derivedAmenities?: DerivedAllowance;
  /** Ablution areas (Toilets / Washrooms / Change / EOT). Default 2.5% of GLA.
   *  Hours from this element feed Toilet Cleaning Allowance calculations. */
  derivedAblutions: DerivedAllowance;
  /** Other amenities (Kitchens / Tea Rooms / Breakouts / Lunchrooms). Default
   *  1.5% of GLA. Hours from this element do NOT trigger toilet allowance. */
  derivedOtherAmenities: DerivedAllowance;
  derivedCirculation: DerivedAllowance;
  derivedFireStairs: DerivedAllowance;
  derivedPlantRooms: DerivedAllowance;
  derivedServiceStorage: DerivedAllowance;
}

export interface BuildingElement {
  id: string;
  group: ElementGroup;
  elementType: string;
  elementName: string;
  quantityType: "AREA" | "UNIT";
  quantityValue: number;
  frequencyPw: number;
  included: boolean;
  notes: string;
  tabMapping: string;
  /** Discretionary Staff (Supervision group) — hours per day per resource. */
  hoursPerDay?: number;
  /** Discretionary Staff (Supervision group) — shift start time, HH:MM 24-hour. */
  startTime?: string;
  /** Tenancy Specials — link to a TenantSpecialGroup. Undefined for non-specials. */
  tenantGroupId?: string;
}

/** A tenant-specific special-service scope (extra cleaning billed to that tenant). */
export interface TenantSpecialGroup {
  id: string;
  tenantName: string;
  location: string;
  notes: string;
  included: boolean;
}

export interface ElementTask {
  id: string;
  buildingElementId: string;
  taskId: string;
  taskName: string;
  calcMethod: CalcMethod;
  defaultRate: number;
  rateUnit: string;
  rateOverride: number | null;
  frequencyPerWeek: number;
  frequencyDefault: number;
  quantityValue: number;
  quantitySource: "ELEMENT" | "MANUAL";
  included: boolean;
  notes: string;
  hasOverride: boolean;
  conditionFlags: string[];
  hoursBase: number;
  hoursAdjusted: number;
  taskGroup: string;
  /**
   * Toilet Cleaning Allowance Eligible (CPQ).
   * When `true`, hours from this task count toward the Toilet Cleaning operator
   * plan and trigger the Toilet Cleaning Allowance on the resulting operator.
   * When `undefined`, a temporary fallback is applied: an hour is considered
   * eligible if the parent element's zone is "Toilets" OR the task name matches
   * a toilet-cleaning keyword (toilet, amenities, washroom, change room, end of trip).
   * When `false`, the task is explicitly excluded.
   */
  toiletAllowanceEligible?: boolean;
}
