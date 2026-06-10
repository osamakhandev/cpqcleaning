import React, { useState, useEffect } from "react";
import { fmtNum } from "@/lib/utils";
import { useAssessment } from "@/contexts/AssessmentContext";
import { BuildingElement, ElementGroup, FloorPlanData, DerivedAllowance, AreaDataSource } from "@/types/labourAssessment";
import { usePricingData } from "@/hooks/usePricingData";
import { Input } from "@/components/ui/input";
import { TimeInput } from "@/components/TimeInput";

import FormattedNumberInput from "@/components/ui/formatted-number-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, Building2, MapPin, Sparkles, Users, AlertTriangle, HelpCircle, ChevronDown } from "lucide-react";

const HelpSection: React.FC<{ label: string; defaultOpen?: boolean; children: React.ReactNode }> = ({ label, defaultOpen, children }) => {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border border-border rounded-md">
      <CollapsibleTrigger className="w-full flex items-center justify-between px-2.5 py-2 text-left text-xs font-semibold hover:bg-muted/50 rounded-md">
        <span>{label}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-2.5 pb-2.5 pt-1 text-xs leading-relaxed space-y-1.5">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
};
import HowItWorks from "@/components/HowItWorks";
import { HELP_CONTENT } from "@/data/helpContent";

type CommercialBuildingStandard = "A" | "B";

const COMMERCIAL_PRESETS: Record<CommercialBuildingStandard, Record<string, number>> = {
  A: {
    derivedAblutions: 2.0,
    derivedOtherAmenities: 1.5,
    derivedCirculation: 8.0,
    derivedFireStairs: 2.0,
    derivedPlantRooms: 2.5,
    derivedServiceStorage: 1.0,
  },
  B: {
    derivedAblutions: 2.5,
    derivedOtherAmenities: 1.5,
    derivedCirculation: 9.0,
    derivedFireStairs: 2.5,
    derivedPlantRooms: 3.0,
    derivedServiceStorage: 1.5,
  },
};

const AREA_HELP_SEEN_KEY = "cpq:la:areaDataSourceHelpSeen";

const ELEMENT_GROUPS: { group: ElementGroup; label: string; icon: React.ReactNode; tabMapping: string; defaultQuantityType: "AREA" | "UNIT" }[] = [
  { group: "Tenancy Areas", label: "Tenancy Areas", icon: <Building2 className="h-4 w-4" />, tabMapping: "tenancy-areas", defaultQuantityType: "AREA" },
  { group: "Common & Public Areas", label: "Common & Public Areas", icon: <MapPin className="h-4 w-4" />, tabMapping: "common-public", defaultQuantityType: "AREA" },
  // Tenancy Specials are no longer added from Start Here — they live inside per-tenant
  // groups created on the "Tenancy Areas" tab via "Add Tenant Special Service".
  { group: "Supervision", label: "Supervision (Discretionary Staff)", icon: <Users className="h-4 w-4" />, tabMapping: "support-roles", defaultQuantityType: "UNIT" },
];

interface DerivedLineConfig {
  key: "derivedAblutions" | "derivedOtherAmenities" | "derivedCirculation" | "derivedFireStairs" | "derivedPlantRooms" | "derivedServiceStorage";
  label: string;
  rangeLabel: string;
  defaultPercent: number;
  excluded?: boolean;
}

const DERIVED_LINES: DerivedLineConfig[] = [
  { key: "derivedAblutions", label: "Ablutions (toilets / washrooms / change facilities / EOT) — Toilet Allowance eligible", rangeLabel: "1.5%–3%", defaultPercent: 2.5 },
  { key: "derivedOtherAmenities", label: "Other amenities (kitchens / tea rooms / breakouts / lunchrooms)", rangeLabel: "1%–2%", defaultPercent: 1.5 },
  { key: "derivedCirculation", label: "Circulation corridors / lift lobbies / common internal circulation", rangeLabel: "6%–12%", defaultPercent: 9.0 },
  { key: "derivedFireStairs", label: "Fire stairs + vertical circulation allowance", rangeLabel: "1.5%–4%", defaultPercent: 2.5 },
  { key: "derivedPlantRooms", label: "Plant rooms / services / risers / comms / electrical rooms", rangeLabel: "2%–6%", defaultPercent: 3.0, excluded: true },
  { key: "derivedServiceStorage", label: "Service storage / cleaner rooms / docks / back-of-house / misc common", rangeLabel: "1%–2%", defaultPercent: 1.5, excluded: true },
];

const StartHere: React.FC = () => {
  const {
    floorPlan, setFloorPlan,
    buildingElements, addBuildingElement, removeBuildingElement, updateBuildingElement,
  } = useAssessment();

  const { jobDetails } = usePricingData();
  const [newItemNames, setNewItemNames] = useState<Record<string, string>>({});
  const [pendingStandard, setPendingStandard] = useState<CommercialBuildingStandard | null>(null);
  const [helpSeen, setHelpSeen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(AREA_HELP_SEEN_KEY) === "1";
  });
  const markHelpSeen = () => {
    if (!helpSeen) {
      localStorage.setItem(AREA_HELP_SEEN_KEY, "1");
      setHelpSeen(true);
    }
  };

  // One-way sync: Job Details GFA → Labour Assessment GFA
  useEffect(() => {
    const raw = jobDetails.cleaningArea?.replace(/,/g, '') ?? '';
    const jobGfa = parseFloat(raw);
    if (!isNaN(jobGfa) && jobGfa > 0 && jobGfa !== floorPlan.gfa) {
      handleFloorPlanChange({ gfa: jobGfa });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobDetails.cleaningArea]);

  /**
   * Benchmark non-cleanable % of GFA based on building height.
   * Base 5%, +0.25% per level above 1, capped at 10%.
   */
  const benchmarkNonCleanablePercent = (levels: number) =>
    Math.min(10, 5 + Math.max(0, levels - 1) * 0.25);

  const handleFloorPlanChange = (updates: Partial<FloorPlanData>) => {
    const next = { ...floorPlan, ...updates };

    // Recalculate GLA from GFA (only if not overridden)
    next.glaCalculated = Math.round(next.gfa * next.glaPercent / 100);

    // In Estimated mode: derive cleanable + split from GFA / non-cleanable / tenancy split.
    if (next.areaDataSource === "estimated") {
      // If levels changed (and user hasn't tweaked %), keep % aligned to benchmark for the new height.
      if (updates.numberOfLevels !== undefined && updates.nonCleanablePercent === undefined) {
        next.nonCleanablePercent = benchmarkNonCleanablePercent(next.numberOfLevels);
      }
      const nonCleanable = next.nonCleanableAreaOverridden !== null
        ? next.nonCleanableAreaOverridden
        : Math.round(next.gfa * next.nonCleanablePercent / 100);
      const cleanable = Math.max(0, next.gfa - nonCleanable);

      if (!next.tenancySplitOverridden) {
        next.totalTenancyArea = Math.round(cleanable * next.tenancySplitPercent / 100);
        next.totalCommonArea = Math.max(0, cleanable - next.totalTenancyArea);
      } else {
        // User has overridden the split — preserve their tenancy value but rescale common to keep cleanable consistent.
        next.totalTenancyArea = Math.min(next.totalTenancyArea, cleanable);
        next.totalCommonArea = Math.max(0, cleanable - next.totalTenancyArea);
      }
    }

    if (next.inputMode === "percentage" || next.areaDataSource === "estimated") {
      next.carpetArea = Math.round(next.totalTenancyArea * next.carpetPercent / 100);
      next.hardFloorArea = next.totalTenancyArea - next.carpetArea;
    } else {
      const total = next.carpetArea + next.hardFloorArea;
      next.carpetPercent = total > 0 ? Math.round((next.carpetArea / total) * 100) : 70;
      next.totalTenancyArea = total;
    }

    // Recalculate derived areas from GFA (only for non-overridden lines)
    for (const line of DERIVED_LINES) {
      const allowance = next[line.key];
      next[line.key] = {
        ...allowance,
        calculatedArea: Math.round(next.gfa * allowance.percent / 100),
      };
    }

    setFloorPlan(next);
  };

  const handleAreaDataSourceChange = (src: AreaDataSource) => {
    if (src === floorPlan.areaDataSource) return;
    if (src === "estimated") {
      // Reset overrides and recompute from GFA benchmarks
      handleFloorPlanChange({
        areaDataSource: src,
        nonCleanableAreaOverridden: null,
        tenancySplitOverridden: false,
      });
    } else {
      // Clear tenancy & common so user enters fresh values; clear non-cleanable override
      handleFloorPlanChange({
        areaDataSource: src,
        totalTenancyArea: 0,
        totalCommonArea: 0,
        carpetArea: 0,
        hardFloorArea: 0,
        nonCleanableAreaOverridden: null,
        tenancySplitOverridden: false,
      });
    }
  };

  const totalCleanableArea = floorPlan.totalTenancyArea + floorPlan.totalCommonArea;
  const isEstimated = floorPlan.areaDataSource === "estimated";
  const nonCleanableArea = isEstimated
    ? (floorPlan.nonCleanableAreaOverridden !== null
        ? floorPlan.nonCleanableAreaOverridden
        : Math.round(floorPlan.gfa * floorPlan.nonCleanablePercent / 100))
    : Math.max(0, floorPlan.gfa - totalCleanableArea);

  const handleGfaChange = (gfa: number) => {
    handleFloorPlanChange({ gfa });
  };

  const handleDerivedPercentChange = (key: DerivedLineConfig["key"], percent: number) => {
    const allowance = floorPlan[key];
    const calculatedArea = Math.round(floorPlan.gfa * percent / 100);
    handleFloorPlanChange({
      [key]: {
        ...allowance,
        percent,
        calculatedArea,
        overriddenArea: null,
      },
    });
  };

  const handleDerivedAreaOverride = (key: DerivedLineConfig["key"], area: number) => {
    const allowance = floorPlan[key];
    const gfa = floorPlan.gfa;
    const newPercent = gfa > 0 ? Math.round((area / gfa) * 10000) / 100 : allowance.percent;
    handleFloorPlanChange({
      [key]: {
        ...allowance,
        percent: newPercent,
        overriddenArea: area,
      },
    });
  };

  const resetDerivedOverride = (key: DerivedLineConfig["key"]) => {
    const config = DERIVED_LINES.find(l => l.key === key);
    const defaultPct = config?.defaultPercent ?? floorPlan[key].percent;
    handleFloorPlanChange({
      [key]: {
        percent: defaultPct,
        calculatedArea: Math.round(floorPlan.gfa * defaultPct / 100),
        overriddenArea: null,
      },
    });
  };

  const currentStandard: CommercialBuildingStandard = floorPlan.commercialBuildingStandard ?? "B";

  const hasManualDerivedOverrides = () =>
    DERIVED_LINES.some(l => {
      const a = floorPlan[l.key];
      return a.overriddenArea !== null || Math.abs(a.percent - l.defaultPercent) > 0.001;
    });

  const applyCommercialPreset = (std: CommercialBuildingStandard) => {
    const preset = COMMERCIAL_PRESETS[std];
    const updates: Partial<FloorPlanData> = { commercialBuildingStandard: std };
    for (const line of DERIVED_LINES) {
      const pct = preset[line.key] ?? line.defaultPercent;
      (updates as Record<string, DerivedAllowance>)[line.key] = {
        percent: pct,
        calculatedArea: Math.round(floorPlan.gfa * pct / 100),
        overriddenArea: null,
      };
    }
    handleFloorPlanChange(updates);
  };

  const handleStandardChange = (std: CommercialBuildingStandard) => {
    if (std === currentStandard) return;
    if (hasManualDerivedOverrides()) {
      setPendingStandard(std);
    } else {
      applyCommercialPreset(std);
    }
  };

  const getDerivedArea = (d: DerivedAllowance) =>
    d.overriddenArea !== null ? d.overriddenArea : d.calculatedArea;

  const getDerivedTotalPercent = () =>
    DERIVED_LINES.reduce((sum, l) => sum + floorPlan[l.key].percent, 0);

  const getDerivedTotalArea = () =>
    DERIVED_LINES.reduce((sum, l) => sum + getDerivedArea(floorPlan[l.key]), 0);

  const isDerivedOverridden = (key: DerivedLineConfig["key"]) => {
    const config = DERIVED_LINES.find(l => l.key === key)!;
    const allowance = floorPlan[key];
    return allowance.overriddenArea !== null || Math.abs(allowance.percent - config.defaultPercent) > 0.001;
  };

  const handleAddElement = (groupConfig: typeof ELEMENT_GROUPS[0]) => {
    const name = newItemNames[groupConfig.group]?.trim();
    if (!name) return;
    addBuildingElement(groupConfig.group, name, name, groupConfig.defaultQuantityType, groupConfig.tabMapping);
    setNewItemNames(prev => ({ ...prev, [groupConfig.group]: "" }));
  };

  const groupedElements = (group: ElementGroup) =>
    buildingElements.filter(el => el.group === group);

  const isDerivedElement = (el: BuildingElement) =>
    el.elementType.includes("(Derived)");

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <HowItWorks {...HELP_CONTENT["la-start-here"]} size="sm" />
      </div>
      {/* Floor Plan Data */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Floor Plan Data (supplied / estimated / measured)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Row 1: Source | Levels | GFA — aligned controls */}
          <div className="grid grid-cols-3 gap-4 items-start">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold block">Area Data Source</Label>
              <div className="flex items-center gap-2">
                <Select value={floorPlan.areaDataSource} onValueChange={(v) => handleAreaDataSourceChange(v as AreaDataSource)}>
                  <SelectTrigger className="h-8 text-sm flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="estimated">Estimated (desktop)</SelectItem>
                    <SelectItem value="supplied">Supplied (client/tender)</SelectItem>
                    <SelectItem value="measured">Measured (from plans/site)</SelectItem>
                  </SelectContent>
                </Select>
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <Popover onOpenChange={(open) => { if (open) markHelpSeen(); }}>
                      <TooltipTrigger asChild>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            aria-label="How Area Data Source works"
                            className={`relative inline-flex items-center gap-1.5 h-10 min-w-[40px] px-3 rounded-md border border-primary/50 bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 transition-colors shrink-0 ${!helpSeen ? "animate-pulse ring-2 ring-primary/40" : ""}`}
                          >
                            <HelpCircle className="h-4 w-4" />
                            <span>How it works</span>
                            {!helpSeen && (
                              <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-background" aria-hidden="true" />
                            )}
                          </button>
                        </PopoverTrigger>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs">
                        Learn how Estimated, Supplied and Measured modes affect Labour Assessment calculations.
                      </TooltipContent>
                      <PopoverContent align="end" className="w-96 p-0 text-xs leading-relaxed">
                        <div className="px-4 pt-3 pb-2 border-b border-border">
                          <p className="font-semibold text-sm">Area Data Source</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">Select the option that best reflects the information available for this site.</p>
                        </div>
                        <div className="max-h-[55vh] overflow-y-auto px-4 py-3 space-y-2">
                          <HelpSection label="Estimated" defaultOpen>
                            <p>Use when only limited information is available (GFA, number of levels, building type, preliminary tender docs).</p>
                            <p>CPQ will use benchmark ratios and assumptions to estimate:</p>
                            <ul className="list-disc pl-4">
                              <li>Tenancy Area</li>
                              <li>Common/Public Area</li>
                              <li>Total Cleanable Area</li>
                            </ul>
                            <p>Ideal for early-stage pricing, budget estimates, desktop assessments and preliminary tender evaluations. Estimator may override values once better information is available.</p>
                          </HelpSection>

                          <HelpSection label="Supplied">
                            <p>Use when the client, consultant or tender documents provide area schedules. Enter supplied values for Total Tenancy Area and Total Common/Public Area. CPQ calculates Total Cleanable Area.</p>
                          </HelpSection>

                          <HelpSection label="Measured">
                            <p>Use when areas have been measured from floor plans, drawings or site inspections. Enter measured values for Total Tenancy Area and Total Common/Public Area. CPQ calculates Total Cleanable Area.</p>
                          </HelpSection>

                          <HelpSection label="How CPQ Uses These Values">
                            <p>Total Tenancy Area + Total Common/Public Area = Total Cleanable Area.</p>
                            <p>Total Cleanable Area is the basis for:</p>
                            <ul className="list-disc pl-4">
                              <li>Labour hour calculations</li>
                              <li>Production rate calculations</li>
                              <li>Service frequency calculations</li>
                              <li>Suggested staffing levels</li>
                              <li>Suggested roster generation</li>
                            </ul>
                          </HelpSection>

                          <HelpSection label="Estimating Best Practice">
                            <p>Start with Estimated when limited information is available. Switch to Supplied or Measured as accurate information becomes available — CPQ supports progressive estimating.</p>
                          </HelpSection>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <p className="text-[10px] text-muted-foreground italic min-h-[14px]">
                Controls how Tenancy & Common/Public areas are derived.
              </p>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center h-5">
                <Label className="text-xs font-semibold">
                  Building Levels <span className="text-destructive">*</span>
                </Label>
              </div>
              <FormattedNumberInput
                value={floorPlan.numberOfLevels}
                onChange={v => handleFloorPlanChange({ numberOfLevels: Math.max(1, Math.round(v)) })}
                className="h-8 text-sm"
                placeholder="1"
              />
              <p className="text-[10px] text-muted-foreground min-h-[14px]">Building complexity input. Used to assist benchmark calculations for non-cleanable areas and future building complexity assessments.</p>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center h-5">
                <Label className="text-xs font-semibold">Gross Floor Area – GFA (m²)</Label>
              </div>
              <FormattedNumberInput
                value={floorPlan.gfa}
                onChange={handleGfaChange}
                className="h-8 text-sm"
                placeholder="0"
              />
              <p className="text-[10px] text-muted-foreground min-h-[14px]">Synced from Job Details.</p>
            </div>
          </div>

          {/* Row 2: Commercial Building Standard preset */}
          <div className="grid grid-cols-3 gap-4 items-start">
            <div className="space-y-1.5 col-span-2">
              <div className="flex items-center gap-2 h-5">
                <Label className="text-xs font-semibold">Commercial Building Standard</Label>
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <Popover>
                      <TooltipTrigger asChild>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            aria-label="About Commercial Building Standard presets"
                            className="inline-flex items-center justify-center h-5 w-5 rounded-full border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                          >
                            <HelpCircle className="h-3 w-3" />
                          </button>
                        </PopoverTrigger>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs">
                        Benchmark profile that seeds Building Element percentages.
                      </TooltipContent>
                      <PopoverContent align="start" className="w-96 text-xs leading-relaxed space-y-2">
                        <p className="font-semibold text-sm">Commercial Building Standard</p>
                        <p>Benchmark profiles for early desktop estimating. All values should be confirmed or adjusted using supplied schedules, measured plans or site inspection information.</p>
                        <p className="font-semibold mt-2">Commercial A</p>
                        <p>Modern premium office building — efficient layout, better services planning, cleaner core arrangement, higher quality finishes. Lower common/core allowance (~17% of GFA).</p>
                        <p className="font-semibold mt-2">Commercial B</p>
                        <p>Older or less efficient commercial office building — fragmented layouts, less efficient cores, irregular circulation, older service areas, slower productivity assumptions. Higher common/core allowance (~20% of GFA).</p>
                      </PopoverContent>
                    </Popover>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Select value={currentStandard} onValueChange={(v) => handleStandardChange(v as CommercialBuildingStandard)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">Commercial A — Modern premium (lower common/core ~17%)</SelectItem>
                  <SelectItem value="B">Commercial B — Older / less efficient (higher common/core ~20%)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground italic min-h-[14px]">
                Benchmark profile for early desktop estimating. All values remain editable below.
              </p>
            </div>
          </div>

          <AlertDialog open={pendingStandard !== null} onOpenChange={(o) => { if (!o) setPendingStandard(null); }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Apply {pendingStandard === "A" ? "Commercial A" : "Commercial B"} preset?</AlertDialogTitle>
                <AlertDialogDescription>
                  Changing the Commercial Building Standard will reset building element benchmark percentages. Continue?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => {
                  if (pendingStandard) applyCommercialPreset(pendingStandard);
                  setPendingStandard(null);
                }}>Apply Preset</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>



          {/* Mode status banner */}
          <div className={`rounded-md border p-3 ${
            isEstimated
              ? "border-amber-500/40 bg-amber-500/5"
              : floorPlan.areaDataSource === "supplied"
                ? "border-blue-500/40 bg-blue-500/5"
                : "border-emerald-500/40 bg-emerald-500/5"
          }`}>
            <p className="text-xs font-semibold mb-0.5">
              {isEstimated && "Estimated (Desktop Assessment)"}
              {floorPlan.areaDataSource === "supplied" && "Supplied Areas"}
              {floorPlan.areaDataSource === "measured" && "Measured Areas"}
            </p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {isEstimated && "CPQ is generating benchmark tenancy and common areas using GFA, GLA and building assumptions. Replace estimated values with supplied or measured data as the tender progresses."}
              {floorPlan.areaDataSource === "supplied" && "Using user-entered tenancy and common area values."}
              {floorPlan.areaDataSource === "measured" && "Using measured floor plan or site survey information."}
            </p>
          </div>

          {/* Step 1: GFA − Non-Cleanable = Total Cleanable Area */}
          <div className="rounded-lg border border-border bg-gradient-to-br from-muted/40 to-muted/10 p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3">
              Step 1 — Determine Total Cleanable Area
            </p>
            <div className="grid grid-cols-[1fr_auto_1.2fr_auto_1.4fr] gap-3 items-end">
              {/* GFA (read-only display) */}
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Gross Floor Area (m²)
                </Label>
                <div className="h-9 px-3 flex items-center rounded-md border border-input bg-muted text-base font-mono">
                  {fmtNum(floorPlan.gfa)}
                </div>
              </div>
              <div className="text-2xl font-light text-muted-foreground pb-2 select-none">−</div>
              {/* Non-Cleanable */}
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {isEstimated ? "Estimated Non-Cleanable Areas (m²)" : "Non-Cleanable Areas (m²)"}
                  {isEstimated && floorPlan.nonCleanableAreaOverridden === null && (
                    <span className="ml-1 normal-case text-[10px]">({floorPlan.nonCleanablePercent.toFixed(2)}% benchmark — guidance only)</span>
                  )}
                </Label>
                <div className="flex items-center gap-2">
                  <FormattedNumberInput
                    value={nonCleanableArea}
                    onChange={v => handleFloorPlanChange({ nonCleanableAreaOverridden: Math.max(0, Math.min(v, floorPlan.gfa)) })}
                    className="h-9 text-base font-mono"
                    placeholder="0"
                  />
                  {isEstimated && floorPlan.nonCleanableAreaOverridden !== null && (
                    <Button
                      variant="ghost" size="sm"
                      className="h-7 px-1 text-[10px] text-muted-foreground hover:text-foreground"
                      onClick={() => handleFloorPlanChange({ nonCleanableAreaOverridden: null })}
                    >
                      Reset
                    </Button>
                  )}
                </div>
                {isEstimated && (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground">% of GFA:</span>
                    <FormattedNumberInput
                      value={floorPlan.nonCleanablePercent}
                      onChange={v => handleFloorPlanChange({
                        nonCleanablePercent: Math.max(0, Math.min(100, v)),
                        nonCleanableAreaOverridden: null,
                      })}
                      decimals={2}
                      className="h-6 text-[11px] w-16 text-right"
                    />
                    <span className="text-[10px] text-muted-foreground">%</span>
                  </div>
                )}
              </div>
              <div className="text-2xl font-light text-muted-foreground pb-2 select-none">=</div>
              <div className="space-y-1 rounded-md border-2 border-primary/60 bg-primary/5 px-4 py-2">
                <Label className="text-[10px] uppercase tracking-wider text-primary font-semibold">
                  Total Cleanable Area
                </Label>
                <div className="text-2xl font-bold font-mono text-primary leading-tight">
                  {fmtNum(totalCleanableArea)} <span className="text-sm font-normal text-primary/70">m²</span>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
              Plant rooms, electrical / comms / fire rooms, service risers, structural voids and other non-cleanable spaces are excluded from the routine cleaning scope. The non-cleanable benchmark scales with building height (Number of Levels).
            </p>
          </div>

          {/* Step 2: Split Total Cleanable into Tenancy + Common/Public */}
          <div className="rounded-lg border border-border bg-gradient-to-br from-muted/40 to-muted/10 p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3">
              Step 2 — Split Total Cleanable Area into components
            </p>
            <div className="grid grid-cols-[1.4fr_auto_1fr_auto_1fr] gap-3 items-stretch">
              <div className="flex flex-col justify-center space-y-1 rounded-md border-2 border-primary/60 bg-primary/5 px-4 py-3 min-h-[88px]">
                <Label className="text-[10px] uppercase tracking-wider text-primary font-semibold">
                  Total Cleanable Area
                </Label>
                <div className="text-2xl font-bold font-mono text-primary leading-tight">
                  {fmtNum(totalCleanableArea)} <span className="text-sm font-normal text-primary/70">m²</span>
                </div>
              </div>
              <div className="flex items-center justify-center text-3xl font-light text-muted-foreground select-none">→</div>
              <div className="flex flex-col justify-center space-y-1.5 min-h-[88px]">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Tenancy Area (m²)
                  {isEstimated && !floorPlan.tenancySplitOverridden && (
                    <span className="ml-1 normal-case text-[10px]">({floorPlan.tenancySplitPercent}%)</span>
                  )}
                </Label>
                <FormattedNumberInput
                  value={floorPlan.totalTenancyArea}
                  onChange={v => handleFloorPlanChange({
                    totalTenancyArea: v,
                    tenancySplitOverridden: isEstimated ? true : floorPlan.tenancySplitOverridden,
                  })}
                  className="h-9 text-base font-mono"
                  placeholder="0"
                />
              </div>
              <div className="flex items-center justify-center text-3xl font-light text-muted-foreground select-none">+</div>
              <div className="flex flex-col justify-center space-y-1.5 min-h-[88px]">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Common/Public Area (m²)
                </Label>
                <FormattedNumberInput
                  value={floorPlan.totalCommonArea}
                  onChange={v => handleFloorPlanChange({
                    totalCommonArea: v,
                    tenancySplitOverridden: isEstimated ? true : floorPlan.tenancySplitOverridden,
                  })}
                  className="h-9 text-base font-mono"
                  placeholder="0"
                />
              </div>
            </div>
            {isEstimated && (
              <div className="mt-3 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] text-muted-foreground">Estimated tenancy split:</span>
                  <FormattedNumberInput
                    value={floorPlan.tenancySplitPercent}
                    onChange={v => handleFloorPlanChange({
                      tenancySplitPercent: Math.max(0, Math.min(100, v)),
                      tenancySplitOverridden: false,
                    })}
                    decimals={1}
                    className="h-6 text-[11px] w-16 text-right"
                  />
                  <span className="text-[10px] text-muted-foreground">% to Tenancy (remainder to Common/Public)</span>
                  {floorPlan.tenancySplitOverridden && (
                    <Button
                      variant="ghost" size="sm"
                      className="h-6 px-1 text-[10px] text-muted-foreground hover:text-foreground ml-2"
                      onClick={() => handleFloorPlanChange({ tenancySplitOverridden: false })}
                    >
                      Reset to benchmark split
                    </Button>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground italic leading-relaxed">
                  Default commercial office benchmark. Adjust where tenancy and common/public area ratios are known from supplied information, measured plans or site inspections. Benchmarks are guidance only — estimator judgement always takes precedence.
                </p>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
              <span className="font-semibold text-foreground">Total Cleanable Area</span> is the primary driver of labour hours, production rates, staffing requirements and Suggested Roster generation. Tenancy and Common/Public are component values used for area-specific tasks.
            </p>
          </div>




          {/* Estimated GLA */}
          <div className="border border-border rounded-md p-3 space-y-3">
            <Label className="text-xs font-medium">Estimated Total Lettable Area – GLA (desktop estimate)</Label>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">GLA as % of GFA</Label>
                <div className="flex items-center gap-1">
                  <FormattedNumberInput
                    value={floorPlan.glaPercent}
                    onChange={v => {
                      const clamped = Math.max(0, v);
                      handleFloorPlanChange({ glaPercent: clamped, glaOverridden: null });
                    }}
                    decimals={1}
                    className={`h-7 text-xs w-20 text-right ${(floorPlan.glaPercent < 75 || floorPlan.glaPercent > 90) ? "border-amber-500 focus-visible:ring-amber-500" : ""}`}
                  />
                  <span className="text-[10px] text-muted-foreground">%</span>
                </div>
                {(floorPlan.glaPercent < 75 || floorPlan.glaPercent > 90) && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400">Typical range: 75–90%</p>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Estimated GLA (m²)</Label>
                <div className="flex items-center gap-1">
                  <FormattedNumberInput
                    value={floorPlan.glaOverridden !== null ? floorPlan.glaOverridden : floorPlan.glaCalculated}
                    onChange={v => handleFloorPlanChange({ glaOverridden: v })}
                    className="h-7 text-xs w-24 text-right"
                  />
                  <span className="text-[10px] text-muted-foreground">m²</span>
                </div>
              </div>
              <div className="flex items-center pt-4">
                {floorPlan.glaOverridden !== null && (
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-amber-500 text-amber-700 dark:text-amber-400">
                      Overridden
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1 text-[9px] text-muted-foreground hover:text-foreground"
                      onClick={() => handleFloorPlanChange({ glaOverridden: null })}
                    >
                      Reset to calculated
                    </Button>
                  </div>
                )}
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground italic">
              Desktop estimate only. Confirm GLA using the leasing schedule / tender data or measured plans. This value is for guidance and cross-checking, not a substitute for provided lettable areas.
            </p>
          </div>

          {/* W'end / Detailer GLA */}
          <div className="border border-border rounded-md p-3 space-y-2">
            <Label className="text-xs font-medium">W'end / Detailer GLA Scope Area (m²)</Label>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">GLA for W'end/Detailer scope</Label>
                <div className="flex items-center gap-1">
                  <FormattedNumberInput
                    value={floorPlan.wendDetailerGla || (floorPlan.glaOverridden !== null ? floorPlan.glaOverridden : floorPlan.glaCalculated)}
                    onChange={v => handleFloorPlanChange({ wendDetailerGla: v, wendDetailerGlaOverridden: true })}
                    className="h-7 text-xs w-28 text-right"
                  />
                  <span className="text-[10px] text-muted-foreground">m²</span>
                </div>
              </div>
              <div className="flex items-center pt-4">
                {floorPlan.wendDetailerGlaOverridden && (
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-amber-500 text-amber-700 dark:text-amber-400">
                      Overridden
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1 text-[9px] text-muted-foreground hover:text-foreground"
                      onClick={() => handleFloorPlanChange({ wendDetailerGlaOverridden: false })}
                    >
                      Reset to GLA
                    </Button>
                  </div>
                )}
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground italic">
              Defaults to Estimated GLA. Override if the weekend/detailer scope covers a different area.
            </p>
          </div>
          <div className="border border-border rounded-md p-3 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Soft/Hard Floor Split (Tenancy)</Label>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] ${floorPlan.inputMode === "percentage" ? "text-foreground font-medium" : "text-muted-foreground"}`}>Enter by %</span>
                <Switch
                  checked={floorPlan.inputMode === "manual"}
                  onCheckedChange={v => handleFloorPlanChange({ inputMode: v ? "manual" : "percentage" })}
                  className="scale-75"
                />
                <span className={`text-[10px] ${floorPlan.inputMode === "manual" ? "text-foreground font-medium" : "text-muted-foreground"}`}>Enter by m²</span>
              </div>
            </div>

            {floorPlan.inputMode === "percentage" ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">% Carpet / Soft floor</Label>
                  <Input
                    type="number" min={0} max={100}
                    value={floorPlan.carpetPercent}
                    onChange={e => handleFloorPlanChange({ carpetPercent: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) })}
                    className="h-7 text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground">= {fmtNum(floorPlan.carpetArea)} m²</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">% Hard floor</Label>
                  <Input value={100 - floorPlan.carpetPercent} disabled className="h-7 text-xs bg-muted" />
                  <p className="text-[10px] text-muted-foreground">= {fmtNum(floorPlan.hardFloorArea)} m²</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Carpet / Soft floor (m²)</Label>
                  <FormattedNumberInput
                    value={floorPlan.carpetArea}
                    onChange={v => handleFloorPlanChange({ carpetArea: v })}
                    className="h-7 text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground">= {floorPlan.carpetPercent}%</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Hard floor (m²)</Label>
                  <FormattedNumberInput
                    value={floorPlan.hardFloorArea}
                    onChange={v => handleFloorPlanChange({ hardFloorArea: v })}
                    className="h-7 text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground">= {100 - floorPlan.carpetPercent}%</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Building Elements as % of GFA */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Building elements as % of GFA (desktop estimate)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-xs text-amber-800 dark:text-amber-200">
              Desktop estimating defaults only. You must measure/confirm areas from drawings and/or site inspection. Edit the % or override the calculated area (m²). Estimator responsible.
            </AlertDescription>
          </Alert>

          {floorPlan.gfa <= 0 ? (
            <p className="text-xs text-muted-foreground italic py-4 text-center">Enter GFA to calculate areas.</p>
          ) : (
            <>
              <div className="space-y-1.5">
                {DERIVED_LINES.map(line => {
                  const allowance = floorPlan[line.key];
                  const displayArea = getDerivedArea(allowance);
                  const overridden = isDerivedOverridden(line.key);

                  return (
                    <div key={line.key} className="flex items-center gap-3 py-1.5 px-2 rounded border border-border bg-muted/20">
                      <div className="w-[280px] shrink-0">
                        <span className="text-xs font-medium">{line.label}</span>
                        {line.excluded && (
                          <span className="text-[9px] text-muted-foreground italic ml-1">(non-daily; excluded from routine)</span>
                        )}
                        <p className="text-[9px] text-muted-foreground">Range: {line.rangeLabel}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <FormattedNumberInput
                          value={allowance.percent}
                          onChange={v => handleDerivedPercentChange(line.key, Math.max(0, v))}
                          decimals={2}
                          className="h-7 text-xs w-16 text-right"
                        />
                        <span className="text-[10px] text-muted-foreground">%</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">=</span>
                      <div className="flex items-center gap-1">
                        <FormattedNumberInput
                          value={displayArea}
                          onChange={v => handleDerivedAreaOverride(line.key, Math.max(0, v))}
                          className="h-7 text-xs w-24 text-right"
                        />
                        <span className="text-[10px] text-muted-foreground">m²</span>
                      </div>
                      {overridden && (
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-amber-500 text-amber-700 dark:text-amber-400">
                            Overridden
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 px-1 text-[9px] text-muted-foreground hover:text-foreground"
                            onClick={() => resetDerivedOverride(line.key)}
                          >
                            Reset
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Band total row */}
              <div className="flex items-center gap-3 py-2 px-2 rounded border border-border bg-muted/40 font-semibold">
                <span className="text-xs w-[280px] shrink-0">Total common / core allowance</span>
                <div className="flex items-center gap-1">
                  <span className="text-xs w-16 text-right tabular-nums">{getDerivedTotalPercent().toFixed(2)}</span>
                  <span className="text-[10px] text-muted-foreground">%</span>
                </div>
                <span className="text-[10px] text-muted-foreground">=</span>
                <div className="flex items-center gap-1">
                  <span className="text-xs w-24 text-right tabular-nums">{fmtNum(getDerivedTotalArea())}</span>
                  <span className="text-[10px] text-muted-foreground">m²</span>
                </div>
              </div>

              <p className="text-[10px] text-muted-foreground">
                Typical combined band: 12%–19%
                {(getDerivedTotalPercent() < 12 || getDerivedTotalPercent() > 19) && (
                  <span className="text-amber-600 dark:text-amber-400 ml-2">
                    ⚠ Total {getDerivedTotalPercent().toFixed(1)}% is outside the typical 12–19% band.
                  </span>
                )}
              </p>
            </>
          )}

          <p className="text-[10px] text-muted-foreground italic">
            Plant rooms, services risers and service storage are excluded from daily cleaning by default. If required, add them manually under Common &amp; Public Areas.
          </p>
        </CardContent>
      </Card>

      {/* Building Elements */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Building Elements</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {ELEMENT_GROUPS.map(groupConfig => {
            const items = groupedElements(groupConfig.group);
            const isCommonPublic = groupConfig.group === "Common & Public Areas";
            return (
              <div key={groupConfig.group} className="space-y-2">
                <div className="flex items-center gap-2 pb-1 border-b border-border">
                  {groupConfig.icon}
                  <h4 className="text-xs font-semibold text-foreground">{groupConfig.label}</h4>
                  <Badge variant="secondary" className="text-[10px]">{items.length} items</Badge>
                </div>

                {/* Element rows */}
                <div className="space-y-1">
                  {items.map(el => {
                    const isSupervision = groupConfig.group === "Supervision";
                    return (
                    <div key={el.id} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-muted/30">
                      <Switch
                        checked={el.included}
                        onCheckedChange={() => updateBuildingElement(el.id, { included: !el.included })}
                        className="scale-[0.65]"
                      />
                      <Input
                        value={el.elementName}
                        onChange={e => updateBuildingElement(el.id, { elementName: e.target.value })}
                        className="h-7 text-xs flex-1 max-w-[200px]"
                      />
                      <div className="flex items-center gap-1">
                        <FormattedNumberInput
                          value={el.quantityValue}
                          onChange={v => updateBuildingElement(el.id, { quantityValue: v })}
                          className="h-7 text-xs w-20 text-right"
                          placeholder="0"
                          disabled={isDerivedElement(el)}
                        />
                        <span className="text-[10px] text-muted-foreground w-8">
                          {el.quantityType === "AREA" ? "m²" : "qty"}
                        </span>
                      </div>
                      {isSupervision && (
                        <>
                          <div className="flex items-center gap-1">
                            <FormattedNumberInput
                              value={el.hoursPerDay ?? 0}
                              decimals={2}
                              onChange={v => updateBuildingElement(el.id, { hoursPerDay: v > 0 ? v : undefined })}
                              className="h-7 text-xs w-16 text-right"
                              placeholder="—"
                            />
                            <span className="text-[10px] text-muted-foreground w-12">hrs/day</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <TimeInput
                              value={el.startTime ?? ""}
                              onChange={v => updateBuildingElement(el.id, { startTime: v || undefined })}
                              className="h-7 text-xs w-20"
                            />
                            <span className="text-[10px] text-muted-foreground w-10">start</span>
                          </div>

                        </>
                      )}
                      <Input
                        value={el.notes}
                        onChange={e => updateBuildingElement(el.id, { notes: e.target.value })}
                        className="h-7 text-xs flex-1 max-w-[160px]"
                        placeholder="Notes…"
                      />
                      <Button
                        variant="ghost" size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeBuildingElement(el.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    );
                  })}
                </div>

                {/* Helper note for Common & Public */}
                {isCommonPublic && items.some(isDerivedElement) && (
                  <p className="text-[10px] text-muted-foreground italic pl-2">
                    (Derived) = calculated from GFA default %; confirm by drawings/site inspection.
                  </p>
                )}

                {/* Add new */}
                <div className="flex items-center gap-2 pl-2">
                  <Input
                    value={newItemNames[groupConfig.group] || ""}
                    onChange={e => setNewItemNames(prev => ({ ...prev, [groupConfig.group]: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && handleAddElement(groupConfig)}
                    className="h-7 text-xs max-w-[200px]"
                    placeholder="New item name…"
                  />
                  <Button
                    variant="outline" size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleAddElement(groupConfig)}
                    disabled={!newItemNames[groupConfig.group]?.trim()}
                  >
                    <Plus className="h-3 w-3 mr-1" />Add New
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
};

export default StartHere;
