import { ClutterMultiplier, ConditionFlag, DefaultTask, OverrideReason, TabConfig, BuildingElement } from "@/types/labourAssessment";

export const CLUTTER_MULTIPLIERS: ClutterMultiplier[] = [
  { level: "LOW", multiplier: 0.90 },
  { level: "NORMAL", multiplier: 1.00 },
  { level: "HIGH", multiplier: 1.15 },
  { level: "EXTREME", multiplier: 1.35 },
];

export const OVERRIDE_REASONS: OverrideReason[] = [
  { code: "CLIENT_SPEC", label: "Client specification differs" },
  { code: "SITE_CONDITION", label: "Site condition observed" },
  { code: "HISTORICAL", label: "Historical performance data" },
  { code: "BENCHMARKING", label: "Industry benchmarking" },
  { code: "SCOPE_CHANGE", label: "Scope change" },
  { code: "OTHER", label: "Other (note required)" },
];

export const CONDITION_FLAGS: ConditionFlag[] = [
  { flag: "DESK_BINS", label: "Desk bins included", defaultValue: true },
  { flag: "RECYCLING_STATIONS", label: "Recycling stations present", defaultValue: true },
  { flag: "SECURE_FLOORS", label: "Secure floor access required", defaultValue: false },
  { flag: "AFTER_HOURS_ONLY", label: "After-hours cleaning only", defaultValue: false },
];

export const COMMERCIAL_TABS: TabConfig[] = [
  {
    id: "start-here",
    label: "Start Here",
    zones: [],
  },
  {
    id: "tenancy-areas",
    label: "Tenancy Areas",
    zones: ["Carpet", "Hard Floor"],
  },
  {
    id: "common-public",
    label: "Common & Public Areas",
    zones: ["Main Foyer", "Lift Lobbies", "Circulation Corridors", "End-of-Trip (EOT)", "Lifts", "Escalators / Travelators", "Stairs", "External Areas", "Carpark"],
  },
  {
    id: "detailer-periodics",
    label: "W'end / Detailer",
    zones: ["Weekend Cleaning", "Detailer / Periodics"],
  },
];

// Element-based tabs (the 3 main assessment tabs)
export const ELEMENT_BASED_TABS = ["tenancy-areas", "tenancy-specials", "common-public"];
// Line-item-based tabs (kept from old approach)
export const LINE_ITEM_TABS = ["detailer-periodics"];

export const DEFAULTS_LIBRARY: DefaultTask[] = [
  // ═══════════════════════════════════════════════════════
  // TENANCY AREAS – Carpet (rates from commercial template)
  // ═══════════════════════════════════════════════════════
  { taskId: "C001", taskName: "Pick up Bins", zoneDivision: "Tenancy", zone: "Carpet", taskGroup: "Bins/Detailing", calcMethod: "AREA_RATE", baseRate: 3000, rateUnit: "m²/hr", defaultFrequency: 5, conditionFlags: ["DESK_BINS"], facilityType: "Commercial", tabMapping: "tenancy-areas" },
  { taskId: "C002", taskName: "Detail / Spot clean / Dust", zoneDivision: "Tenancy", zone: "Carpet", taskGroup: "Bins/Detailing", calcMethod: "AREA_RATE", baseRate: 2500, rateUnit: "m²/hr", defaultFrequency: 5, conditionFlags: [], facilityType: "Commercial", tabMapping: "tenancy-areas" },
  { taskId: "C003", taskName: "Full Vacuum", zoneDivision: "Tenancy", zone: "Carpet", taskGroup: "Floor Programs", calcMethod: "AREA_RATE", baseRate: 1800, rateUnit: "m²/hr", defaultFrequency: 5, conditionFlags: [], facilityType: "Commercial", tabMapping: "tenancy-areas" },
  { taskId: "C004", taskName: "Spot Vacuum", zoneDivision: "Tenancy", zone: "Carpet", taskGroup: "Floor Programs", calcMethod: "AREA_RATE", baseRate: 2500, rateUnit: "m²/hr", defaultFrequency: 5, conditionFlags: [], facilityType: "Commercial", tabMapping: "tenancy-areas" },

  // ═══════════════════════════════════════════════════════
  // TENANCY AREAS – Hard Floor
  // ═══════════════════════════════════════════════════════
  { taskId: "C010", taskName: "Pick up Bins", zoneDivision: "Tenancy", zone: "Hard Floor", taskGroup: "Bins/Detailing", calcMethod: "AREA_RATE", baseRate: 3000, rateUnit: "m²/hr", defaultFrequency: 5, conditionFlags: ["DESK_BINS"], facilityType: "Commercial", tabMapping: "tenancy-areas" },
  { taskId: "C011", taskName: "Detail / Spot clean / Dust", zoneDivision: "Tenancy", zone: "Hard Floor", taskGroup: "Bins/Detailing", calcMethod: "AREA_RATE", baseRate: 2500, rateUnit: "m²/hr", defaultFrequency: 5, conditionFlags: [], facilityType: "Commercial", tabMapping: "tenancy-areas" },
  { taskId: "C012", taskName: "Sweep", zoneDivision: "Tenancy", zone: "Hard Floor", taskGroup: "Floor Programs", calcMethod: "AREA_RATE", baseRate: 3000, rateUnit: "m²/hr", defaultFrequency: 5, conditionFlags: [], facilityType: "Commercial", tabMapping: "tenancy-areas" },
  { taskId: "C013", taskName: "Full Mop", zoneDivision: "Tenancy", zone: "Hard Floor", taskGroup: "Floor Programs", calcMethod: "AREA_RATE", baseRate: 1500, rateUnit: "m²/hr", defaultFrequency: 5, conditionFlags: [], facilityType: "Commercial", tabMapping: "tenancy-areas" },
  { taskId: "C014", taskName: "Spot Mop", zoneDivision: "Tenancy", zone: "Hard Floor", taskGroup: "Floor Programs", calcMethod: "AREA_RATE", baseRate: 3000, rateUnit: "m²/hr", defaultFrequency: 5, conditionFlags: [], facilityType: "Commercial", tabMapping: "tenancy-areas" },
  { taskId: "C015", taskName: "Full Buff", zoneDivision: "Tenancy", zone: "Hard Floor", taskGroup: "Floor Programs", calcMethod: "AREA_RATE", baseRate: 1000, rateUnit: "m²/hr", defaultFrequency: 1, conditionFlags: [], facilityType: "Commercial", tabMapping: "tenancy-areas" },
  { taskId: "C016", taskName: "Spot Buff", zoneDivision: "Tenancy", zone: "Hard Floor", taskGroup: "Floor Programs", calcMethod: "AREA_RATE", baseRate: 2000, rateUnit: "m²/hr", defaultFrequency: 3, conditionFlags: [], facilityType: "Commercial", tabMapping: "tenancy-areas" },
  { taskId: "C017", taskName: "Machine Scrub Open", zoneDivision: "Tenancy", zone: "Hard Floor", taskGroup: "Floor Programs", calcMethod: "AREA_RATE", baseRate: 2000, rateUnit: "m²/hr", defaultFrequency: 1, conditionFlags: [], facilityType: "Commercial", tabMapping: "tenancy-areas" },
  { taskId: "C018", taskName: "Machine Scrub Obstruct", zoneDivision: "Tenancy", zone: "Hard Floor", taskGroup: "Floor Programs", calcMethod: "AREA_RATE", baseRate: 1000, rateUnit: "m²/hr", defaultFrequency: 1, conditionFlags: [], facilityType: "Commercial", tabMapping: "tenancy-areas" },

  // ═══════════════════════════════════════════════════════
  // TENANCY SPECIALS – Office Rooms
  // ═══════════════════════════════════════════════════════
  { taskId: "C020", taskName: "Office Rooms", zoneDivision: "Specials", zone: "Office Rooms", taskGroup: "Amenities", calcMethod: "TIME_PER_UNIT", baseRate: 2, rateUnit: "min/unit", defaultFrequency: 5, conditionFlags: [], facilityType: "Commercial", tabMapping: "tenancy-specials" },

  // ═══════════════════════════════════════════════════════
  // TENANCY SPECIALS – Meeting Rooms
  // ═══════════════════════════════════════════════════════
  { taskId: "C025", taskName: "Meeting Rooms", zoneDivision: "Specials", zone: "Meeting Rooms", taskGroup: "Amenities", calcMethod: "AREA_RATE", baseRate: 620, rateUnit: "m²/hr", defaultFrequency: 5, conditionFlags: [], facilityType: "Commercial", tabMapping: "tenancy-specials" },

  // ═══════════════════════════════════════════════════════
  // TENANCY SPECIALS – Toilets
  // ═══════════════════════════════════════════════════════
  { taskId: "C030", taskName: "Toilets (per unit)", zoneDivision: "Specials", zone: "Toilets", taskGroup: "Amenities", calcMethod: "TIME_PER_UNIT", baseRate: 3, rateUnit: "min/unit", defaultFrequency: 5, conditionFlags: [], facilityType: "Commercial", tabMapping: "tenancy-specials", toiletAllowanceEligible: true },
  { taskId: "C031", taskName: "Toilets (area rate)", zoneDivision: "Specials", zone: "Toilets", taskGroup: "Floor Programs", calcMethod: "AREA_RATE", baseRate: 75, rateUnit: "m²/hr", defaultFrequency: 5, conditionFlags: [], facilityType: "Commercial", tabMapping: "tenancy-specials" },

  // ═══════════════════════════════════════════════════════
  // TENANCY SPECIALS – Tea Rooms
  // ═══════════════════════════════════════════════════════
  { taskId: "C040", taskName: "Tea Rooms (per unit)", zoneDivision: "Specials", zone: "Tea Rooms", taskGroup: "Amenities", calcMethod: "TIME_PER_UNIT", baseRate: 6, rateUnit: "min/unit", defaultFrequency: 5, conditionFlags: [], facilityType: "Commercial", tabMapping: "tenancy-specials" },
  { taskId: "C041", taskName: "Tea Rooms (area rate)", zoneDivision: "Specials", zone: "Tea Rooms", taskGroup: "Floor Programs", calcMethod: "AREA_RATE", baseRate: 75, rateUnit: "m²/hr", defaultFrequency: 5, conditionFlags: [], facilityType: "Commercial", tabMapping: "tenancy-specials" },
  { taskId: "C042", taskName: "Dishwashing", zoneDivision: "Specials", zone: "Tea Rooms", taskGroup: "Amenities", calcMethod: "TIME_PER_UNIT", baseRate: 12, rateUnit: "min/unit", defaultFrequency: 5, conditionFlags: [], facilityType: "Commercial", tabMapping: "tenancy-specials" },

  // ═══════════════════════════════════════════════════════
  // TENANCY SPECIALS – Breakout Rooms
  // ═══════════════════════════════════════════════════════
  { taskId: "C050", taskName: "Breakout Rooms (per unit)", zoneDivision: "Specials", zone: "Breakouts", taskGroup: "Amenities", calcMethod: "TIME_PER_UNIT", baseRate: 25, rateUnit: "min/unit", defaultFrequency: 5, conditionFlags: [], facilityType: "Commercial", tabMapping: "tenancy-specials" },
  { taskId: "C051", taskName: "Breakout Rooms (area rate)", zoneDivision: "Specials", zone: "Breakouts", taskGroup: "Floor Programs", calcMethod: "AREA_RATE", baseRate: 75, rateUnit: "m²/hr", defaultFrequency: 5, conditionFlags: [], facilityType: "Commercial", tabMapping: "tenancy-specials" },

  // ═══════════════════════════════════════════════════════
  // TENANCY SPECIALS – Kitchenette (no template rate — user must enter)
  // ═══════════════════════════════════════════════════════
  { taskId: "C055", taskName: "Kitchenette clean", zoneDivision: "Specials", zone: "Kitchenette", taskGroup: "Amenities", calcMethod: "TIME_PER_UNIT", baseRate: 0, rateUnit: "min/unit", defaultFrequency: 5, conditionFlags: [], facilityType: "Commercial", tabMapping: "tenancy-specials" },

  // ═══════════════════════════════════════════════════════
  // COMMON & PUBLIC – Circulation Corridors
  // ═══════════════════════════════════════════════════════
  { taskId: "C060", taskName: "Circulation Corridors", zoneDivision: "Common", zone: "Circulation Corridors", taskGroup: "Floor Programs", calcMethod: "AREA_RATE", baseRate: 1500, rateUnit: "m²/hr", defaultFrequency: 5, conditionFlags: [], facilityType: "Commercial", tabMapping: "common-public" },

  // ═══════════════════════════════════════════════════════
  // COMMON & PUBLIC – Main Foyer (uses Circulation Corridors rate as base)
  // ═══════════════════════════════════════════════════════
  { taskId: "C061", taskName: "Main Foyer", zoneDivision: "Common", zone: "Main Foyer", taskGroup: "Floor Programs", calcMethod: "AREA_RATE", baseRate: 1500, rateUnit: "m²/hr", defaultFrequency: 5, conditionFlags: [], facilityType: "Commercial", tabMapping: "common-public" },

  // ═══════════════════════════════════════════════════════
  // COMMON & PUBLIC – Lift Lobbies
  // ═══════════════════════════════════════════════════════
  { taskId: "C065", taskName: "Lift Lobbies", zoneDivision: "Common", zone: "Lift Lobbies", taskGroup: "Floor Programs", calcMethod: "AREA_RATE", baseRate: 1500, rateUnit: "m²/hr", defaultFrequency: 5, conditionFlags: [], facilityType: "Commercial", tabMapping: "common-public" },

  // ═══════════════════════════════════════════════════════
  // COMMON & PUBLIC – Lifts
  // ═══════════════════════════════════════════════════════
  { taskId: "C070", taskName: "Lifts", zoneDivision: "Common", zone: "Lifts", taskGroup: "Other", calcMethod: "TIME_PER_UNIT", baseRate: 5, rateUnit: "min/unit", defaultFrequency: 5, conditionFlags: [], facilityType: "Commercial", tabMapping: "common-public" },

  // ═══════════════════════════════════════════════════════
  // COMMON & PUBLIC – Escalators / Travelators
  // ═══════════════════════════════════════════════════════
  { taskId: "C075", taskName: "Escalators", zoneDivision: "Common", zone: "Escalators / Travelators", taskGroup: "Other", calcMethod: "TIME_PER_UNIT", baseRate: 10, rateUnit: "min/unit", defaultFrequency: 5, conditionFlags: [], facilityType: "Commercial", tabMapping: "common-public" },

  // ═══════════════════════════════════════════════════════
  // COMMON & PUBLIC – Stairs
  // ═══════════════════════════════════════════════════════
  { taskId: "C080", taskName: "Stairs", zoneDivision: "Common", zone: "Stairs", taskGroup: "Other", calcMethod: "TIME_PER_UNIT", baseRate: 1, rateUnit: "min/unit", defaultFrequency: 5, conditionFlags: [], facilityType: "Commercial", tabMapping: "common-public" },

  // ═══════════════════════════════════════════════════════
  // COMMON & PUBLIC – End-of-Trip (no template rate)
  // ═══════════════════════════════════════════════════════
  { taskId: "C085", taskName: "End-of-Trip clean", zoneDivision: "Common", zone: "End-of-Trip (EOT)", taskGroup: "Amenities", calcMethod: "TIME_PER_UNIT", baseRate: 0, rateUnit: "min/unit", defaultFrequency: 5, conditionFlags: [], facilityType: "Commercial", tabMapping: "common-public", toiletAllowanceEligible: true },

  // ═══════════════════════════════════════════════════════
  // COMMON & PUBLIC – External Areas (no specific template rate)
  // ═══════════════════════════════════════════════════════
  { taskId: "C090", taskName: "External Areas", zoneDivision: "Common", zone: "External Areas", taskGroup: "Other", calcMethod: "AREA_RATE", baseRate: 0, rateUnit: "m²/hr", defaultFrequency: 3, conditionFlags: [], facilityType: "Commercial", tabMapping: "common-public" },

  // ═══════════════════════════════════════════════════════
  // COMMON & PUBLIC – Carpark
  // ═══════════════════════════════════════════════════════
  { taskId: "C095", taskName: "Car Parks", zoneDivision: "Common", zone: "Carpark", taskGroup: "Floor Programs", calcMethod: "AREA_RATE", baseRate: 5000, rateUnit: "m²/hr", defaultFrequency: 1, conditionFlags: [], facilityType: "Commercial", tabMapping: "common-public" },

  // ═══════════════════════════════════════════════════════
  // COMMON & PUBLIC – Derived common-area allowances (GFA)
  // ═══════════════════════════════════════════════════════
  { taskId: "C100A", taskName: "Ablutions clean", zoneDivision: "Common", zone: "Common Ablutions (Derived)", taskGroup: "Amenities", calcMethod: "AREA_RATE", baseRate: 75, rateUnit: "m²/hr", defaultFrequency: 5, conditionFlags: [], facilityType: "Commercial", tabMapping: "common-public", toiletAllowanceEligible: true },
  { taskId: "C100B", taskName: "Other amenities clean", zoneDivision: "Common", zone: "Common Other Amenities (Derived)", taskGroup: "Amenities", calcMethod: "AREA_RATE", baseRate: 120, rateUnit: "m²/hr", defaultFrequency: 5, conditionFlags: [], facilityType: "Commercial", tabMapping: "common-public", toiletAllowanceEligible: false },
  { taskId: "C101", taskName: "Circulation & Lobbies clean", zoneDivision: "Common", zone: "Common Circulation & Lift Lobbies (Derived)", taskGroup: "Floor Programs", calcMethod: "AREA_RATE", baseRate: 1500, rateUnit: "m²/hr", defaultFrequency: 5, conditionFlags: [], facilityType: "Commercial", tabMapping: "common-public" },
  { taskId: "C102", taskName: "Fire Stairs clean", zoneDivision: "Common", zone: "Fire Stairs (Derived)", taskGroup: "Other", calcMethod: "AREA_RATE", baseRate: 500, rateUnit: "m²/hr", defaultFrequency: 3, conditionFlags: [], facilityType: "Commercial", tabMapping: "common-public" },


  // ═══════════════════════════════════════════════════════
  // DETAILER / PERIODICS
  // ═══════════════════════════════════════════════════════
  { taskId: "P001", taskName: "Detailer/Periodics", zoneDivision: "Periodics", zone: "Detailer / Periodics", taskGroup: "Other", calcMethod: "AREA_RATE", baseRate: 10000, rateUnit: "m²/hr", defaultFrequency: 1, conditionFlags: [], facilityType: "Commercial", tabMapping: "detailer-periodics" },
];

export const TASK_GROUP_ORDER = ["Bins/Detailing", "Floor Programs", "Amenities", "Other"];

// Default building elements - pre-created when project starts
export const DEFAULT_BUILDING_ELEMENTS: Omit<BuildingElement, "id">[] = [
  // Tenancy Areas
  { group: "Tenancy Areas", elementType: "Carpet", elementName: "Carpet", quantityType: "AREA", quantityValue: 0, frequencyPw: 5, included: true, notes: "", tabMapping: "tenancy-areas" },
  { group: "Tenancy Areas", elementType: "Hard Floor", elementName: "Hard Floor", quantityType: "AREA", quantityValue: 0, frequencyPw: 5, included: true, notes: "", tabMapping: "tenancy-areas" },
  // Tenancy Specials are NOT seeded by default — they live inside per-tenant
  // TenantSpecialGroup containers created by the user via "Add Tenant Special Service".

  // Common & Public Areas
  { group: "Common & Public Areas", elementType: "Main Foyer", elementName: "Main Foyer", quantityType: "AREA", quantityValue: 0, frequencyPw: 5, included: true, notes: "", tabMapping: "common-public" },
  { group: "Common & Public Areas", elementType: "Lift Lobbies", elementName: "Lift Lobbies", quantityType: "AREA", quantityValue: 0, frequencyPw: 5, included: true, notes: "", tabMapping: "common-public" },
  { group: "Common & Public Areas", elementType: "Circulation Corridors", elementName: "Circulation Corridors", quantityType: "AREA", quantityValue: 0, frequencyPw: 5, included: true, notes: "", tabMapping: "common-public" },
  { group: "Common & Public Areas", elementType: "End-of-Trip (EOT)", elementName: "End-of-Trip (EOT)", quantityType: "AREA", quantityValue: 0, frequencyPw: 5, included: true, notes: "", tabMapping: "common-public" },
  { group: "Common & Public Areas", elementType: "Lifts", elementName: "Lifts", quantityType: "UNIT", quantityValue: 0, frequencyPw: 5, included: true, notes: "", tabMapping: "common-public" },
  { group: "Common & Public Areas", elementType: "Escalators / Travelators", elementName: "Escalators / Travelators", quantityType: "UNIT", quantityValue: 0, frequencyPw: 3, included: true, notes: "", tabMapping: "common-public" },
  { group: "Common & Public Areas", elementType: "Stairs", elementName: "Stairs", quantityType: "UNIT", quantityValue: 0, frequencyPw: 5, included: true, notes: "", tabMapping: "common-public" },
  { group: "Common & Public Areas", elementType: "External Areas", elementName: "External Areas", quantityType: "AREA", quantityValue: 0, frequencyPw: 3, included: true, notes: "", tabMapping: "common-public" },
  { group: "Common & Public Areas", elementType: "Carpark", elementName: "Carpark", quantityType: "AREA", quantityValue: 0, frequencyPw: 1, included: true, notes: "", tabMapping: "common-public" },
  // Supervision (for Start Here checklist)
  { group: "Supervision", elementType: "Day Cleaning / Replenishment", elementName: "Day Cleaning / Replenishment", quantityType: "UNIT", quantityValue: 1, frequencyPw: 5, included: true, notes: "", tabMapping: "support-roles" },
  { group: "Supervision", elementType: "Waste Handling / Dock Runs", elementName: "Waste Handling / Dock Runs", quantityType: "UNIT", quantityValue: 1, frequencyPw: 5, included: true, notes: "", tabMapping: "support-roles" },
  { group: "Supervision", elementType: "Supervision (Day)", elementName: "Supervision (Day)", quantityType: "UNIT", quantityValue: 1, frequencyPw: 5, included: true, notes: "", tabMapping: "support-roles" },
  { group: "Supervision", elementType: "Supervision (Night)", elementName: "Supervision (Night)", quantityType: "UNIT", quantityValue: 1, frequencyPw: 5, included: false, notes: "", tabMapping: "support-roles" },
  { group: "Supervision", elementType: "Management (Optional)", elementName: "Management (Optional)", quantityType: "UNIT", quantityValue: 1, frequencyPw: 5, included: false, notes: "", tabMapping: "support-roles" },
];

// Production rate notice (replaces clutter)
export const PRODUCTION_RATE_NOTICE = "Default production rates are benchmarks only. Rates must be adjusted by an experienced estimator to reflect site conditions such as clutter, layout complexity, finish condition, access constraints, and required presentation standards.";

// Template element list applied when a new Tenant Special Service group is created.
// These mirror the original generic Tenancy Specials defaults but are now cloned per tenant.
export const TENANT_SPECIAL_TEMPLATES: Array<Omit<BuildingElement, "id" | "tenantGroupId">> = [
  { group: "Tenancy Specials", elementType: "Office Rooms", elementName: "Office Rooms", quantityType: "UNIT", quantityValue: 0, frequencyPw: 5, included: true, notes: "", tabMapping: "tenancy-specials" },
  { group: "Tenancy Specials", elementType: "Meeting Rooms", elementName: "Meeting Rooms", quantityType: "UNIT", quantityValue: 0, frequencyPw: 5, included: true, notes: "", tabMapping: "tenancy-specials" },
  { group: "Tenancy Specials", elementType: "Toilets", elementName: "Toilets", quantityType: "UNIT", quantityValue: 0, frequencyPw: 5, included: true, notes: "", tabMapping: "tenancy-specials" },
  { group: "Tenancy Specials", elementType: "Tea Rooms", elementName: "Tea Rooms", quantityType: "UNIT", quantityValue: 0, frequencyPw: 5, included: true, notes: "", tabMapping: "tenancy-specials" },
  { group: "Tenancy Specials", elementType: "Breakouts", elementName: "Breakouts", quantityType: "AREA", quantityValue: 0, frequencyPw: 5, included: true, notes: "", tabMapping: "tenancy-specials" },
  { group: "Tenancy Specials", elementType: "Kitchenette", elementName: "Kitchenette", quantityType: "UNIT", quantityValue: 0, frequencyPw: 5, included: true, notes: "", tabMapping: "tenancy-specials" },
];

