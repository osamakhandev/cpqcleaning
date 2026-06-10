/**
 * AssessmentImpactPanel — floating dashboard on the Labour Assessment page.
 *
 * Replaces the old "Condition Flags" + "Quantity KPI" sidebar.
 * Shows:
 *   • Assessment Summary  — cleanable area, weekly hours, planned operators
 *   • Condition Flags     — each with a live "+X hrs/week" impact badge
 *   • Recent Changes      — last 5 flag toggles with delta + cumulative
 *
 * Sticky on lg+. On smaller screens, collapses to a floating button that
 * opens the panel in a right-anchored Sheet.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Settings2, Activity, History, LayoutDashboard } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAssessment } from "@/contexts/AssessmentContext";

import { CONDITION_FLAGS } from "@/data/laSeedData";
import { computeFlagImpacts } from "@/lib/laFlagImpacts";
import { buildLaPlan, TENANT_SPECIAL_THRESHOLD_HRS } from "@/lib/laAutoRoster";
import { cn } from "@/lib/utils";

interface RecentChange {
  flag: string;
  label: string;
  deltaHrs: number;
  ts: number;
}

const fmtHrs = (n: number) =>
  `${n >= 0 ? "+" : ""}${n.toLocaleString("en-AU", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} hrs/week`;

const PanelBody: React.FC = () => {
  const assessment = useAssessment();
  
  const {
    floorPlan, lineItems, elementTasks, buildingElements,
    conditions, toggleCondition, getTotalHours, getTotalTenantSpecialHours,
  } = assessment;

  // ── Assessment Summary ──
  const totalCleanable = floorPlan.totalTenancyArea + floorPlan.totalCommonArea;
  const weeklyHours = getTotalHours();
  const tenantSpecialHours = getTotalTenantSpecialHours();
  const tenantSpecialDedicated = tenantSpecialHours >= TENANT_SPECIAL_THRESHOLD_HRS;

  const plan = useMemo(() => buildLaPlan({
    project: assessment.project,
    floorPlan,
    buildingElements,
    elementTasks,
    lineItems,
    conditions,
    overrides: [],
    projectSetupComplete: assessment.projectSetupComplete,
    wendDetailerMode: assessment.wendDetailerMode,
    wendDetailerFixedHours: assessment.wendDetailerFixedHours,
    wendDetailerIncludeInCore: assessment.wendDetailerIncludeInCore,
    wendDetailerPrograms: assessment.wendDetailerPrograms,
    tenantSpecialGroups: assessment.tenantSpecialGroups,
  }), [assessment, floorPlan, buildingElements, elementTasks, lineItems, conditions]);

  const breakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of plan) map.set(s.groupLabel, (map.get(s.groupLabel) ?? 0) + 1);
    return Array.from(map.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [plan]);

  // ── Condition impacts ──
  const impacts = useMemo(
    () => computeFlagImpacts({ lineItems, elementTasks, buildingElements, floorPlan, conditions }),
    [lineItems, elementTasks, buildingElements, floorPlan, conditions]
  );

  // ── Recent changes ring buffer (last 5) ──
  const [recent, setRecent] = useState<RecentChange[]>([]);
  const prevHoursRef = useRef<number>(weeklyHours);
  const pendingRef = useRef<{ flag: string; label: string; hoursBefore: number } | null>(null);

  // After a toggle, when weeklyHours has updated, push a recent entry.
  useEffect(() => {
    if (pendingRef.current && prevHoursRef.current !== weeklyHours) {
      const { flag, label, hoursBefore } = pendingRef.current;
      const delta = weeklyHours - hoursBefore;
      pendingRef.current = null;
      setRecent(r => [{ flag, label, deltaHrs: delta, ts: Date.now() }, ...r].slice(0, 5));
    }
    prevHoursRef.current = weeklyHours;
  }, [weeklyHours]);

  const handleToggle = (flag: string, label: string) => {
    pendingRef.current = { flag, label, hoursBefore: weeklyHours };
    toggleCondition(flag);
  };

  const totalImpact = recent.reduce((s, r) => s + r.deltaHrs, 0);

  return (
    <div className="space-y-3">
      {/* ── Assessment Summary ── */}
      <div className="border border-border rounded-lg bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Assessment Summary</h3>
        </div>
        <dl className="space-y-1.5 text-xs">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Total Cleanable Area</dt>
            <dd className="font-mono tabular-nums">
              {totalCleanable > 0
                ? `${totalCleanable.toLocaleString("en-AU")} m²`
                : "–"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Total Weekly Labour Hours</dt>
            <dd className="font-mono tabular-nums">{weeklyHours.toFixed(1)} hrs</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Planned Operators</dt>
            <dd className="font-mono tabular-nums">{plan.length}</dd>
          </div>
          <div className="flex justify-between items-center gap-2">
            <dt className="text-muted-foreground">Tenant Special Services</dt>
            <dd className="flex items-center gap-1.5">
              <span className="font-mono tabular-nums">
                {tenantSpecialHours > 0 ? `${tenantSpecialHours.toFixed(1)} hrs` : "–"}
              </span>
              {tenantSpecialHours > 0 && (
                <Badge
                  variant={tenantSpecialDedicated ? "default" : "secondary"}
                  className="text-[9px] px-1.5 py-0"
                >
                  {tenantSpecialDedicated ? "Dedicated ops" : "Merged"}
                </Badge>
              )}
            </dd>
          </div>
        </dl>
        {breakdown.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border space-y-1">
            {breakdown.map(row => (
              <div key={row.label} className="flex justify-between text-[11px]">
                <span className="text-muted-foreground truncate">{row.label}</span>
                <span className="font-mono tabular-nums">{row.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Condition Flags ── */}
      <div className="border border-border rounded-lg bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Settings2 className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Condition Flags</h3>
        </div>
        <div className="space-y-2.5">
          {CONDITION_FLAGS.map(flag => {
            const impact = impacts[flag.flag];
            const on = conditions[flag.flag] ?? false;
            return (
              <div key={flag.flag}>
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs text-foreground cursor-pointer flex-1">{flag.label}</Label>
                  <Switch
                    checked={on}
                    onCheckedChange={() => handleToggle(flag.flag, flag.label)}
                    className="scale-75"
                  />
                </div>
                {on && impact && (impact.deltaHrs > 0.05 || impact.note) && (
                  <div className="mt-1 ml-0">
                    {impact.note ? (
                      <Badge variant="secondary" className="text-[10px]">{impact.note}</Badge>
                    ) : (
                      <span className="text-[10px] font-mono text-primary tabular-nums">
                        {fmtHrs(impact.deltaHrs)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Recent Changes ── */}
      <div className="border border-border rounded-lg bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <History className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Recent Assessment Changes</h3>
        </div>
        {recent.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            Toggle a condition flag to see its impact here.
          </p>
        ) : (
          <>
            <ul className="space-y-1.5">
              {recent.map(r => (
                <li key={r.ts} className="flex justify-between text-[11px]">
                  <span className="text-foreground truncate">{r.label}</span>
                  <span
                    className={cn(
                      "font-mono tabular-nums",
                      r.deltaHrs > 0 ? "text-primary" : r.deltaHrs < 0 ? "text-muted-foreground" : "text-muted-foreground"
                    )}
                  >
                    {fmtHrs(r.deltaHrs)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-2 pt-2 border-t border-border flex justify-between text-xs font-semibold">
              <span>Total Impact</span>
              <span className="font-mono tabular-nums">{fmtHrs(totalImpact)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const AssessmentImpactPanel: React.FC = () => {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Desktop sticky panel */}
      <aside className="hidden lg:block w-72 shrink-0">
        <div className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto pr-1">
          <PanelBody />
        </div>
      </aside>

      {/* Mobile floating button + sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            size="sm"
            className="lg:hidden fixed bottom-4 right-4 z-40 shadow-lg gap-2"
          >
            <Activity className="h-4 w-4" />
            Assessment Impact
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-[320px] sm:w-[360px] overflow-y-auto">
          <PanelBody />
        </SheetContent>
      </Sheet>
    </>
  );
};

export default AssessmentImpactPanel;
