/**
 * LaRosterSyncPanel — Labour Assessment → Operators' Details control panel.
 *
 * Shown at the top of the Labour Assessment page. Lets the estimator
 * enable / freeze / regenerate the auto-roster. Renders a live count of
 * LA-managed vs manual operators so the impact of each action is clear.
 */
import React, { useMemo, useState } from "react";
import { Sparkles, RefreshCw, Lock, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAssessment } from "@/contexts/AssessmentContext";
import { useRosterStore } from "@/contexts/RosterContext";
import { buildLaPlan } from "@/lib/laAutoRoster";
import { toast } from "sonner";

const LaRosterSyncPanel: React.FC = () => {
  const assessment = useAssessment();
  const roster = useRosterStore();
  const [regenOpen, setRegenOpen] = useState(false);
  const [freezeOpen, setFreezeOpen] = useState(false);

  const counts = useMemo(() => {
    const managed = roster.operators.filter(o => o.source === "labour-assessment").length;
    const manual = roster.operators.length - managed;
    return { managed, manual, total: roster.operators.length };
  }, [roster.operators]);

  const plan = useMemo(() => buildLaPlan({
    project: assessment.project,
    floorPlan: assessment.floorPlan,
    buildingElements: assessment.buildingElements,
    elementTasks: assessment.elementTasks,
    lineItems: assessment.lineItems,
    conditions: assessment.conditions,
    overrides: [],
    
    projectSetupComplete: assessment.projectSetupComplete,
    wendDetailerMode: assessment.wendDetailerMode,
    wendDetailerFixedHours: assessment.wendDetailerFixedHours,
    wendDetailerIncludeInCore: assessment.wendDetailerIncludeInCore,
    wendDetailerPrograms: assessment.wendDetailerPrograms,
    tenantSpecialGroups: assessment.tenantSpecialGroups,
  }), [
    assessment.project, assessment.floorPlan, assessment.buildingElements,
    assessment.elementTasks, assessment.lineItems, assessment.conditions,
    assessment.projectSetupComplete,
    assessment.wendDetailerMode, assessment.wendDetailerFixedHours,
    assessment.wendDetailerIncludeInCore, assessment.wendDetailerPrograms,
    assessment.tenantSpecialGroups,
  ]);

  const breakdown = useMemo(() => {
    const map = new Map<string, { count: number; weeklyHours: number }>();
    for (const s of plan) {
      const cur = map.get(s.groupLabel) ?? { count: 0, weeklyHours: 0 };
      cur.count += 1;
      cur.weeklyHours += (s.paidHoursPerDay || 0) * s.workDays.length;
      map.set(s.groupLabel, cur);
    }
    return Array.from(map.entries())
      .map(([label, v]) => ({ label, ...v }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [plan]);


  const handleEnable = async (v: boolean) => {
    try {
      const nextFrozen = v && assessment.laRosterFrozen ? false : assessment.laRosterFrozen;
      await assessment.saveAssessmentNow({ laAutoRosterEnabled: v, laRosterFrozen: nextFrozen });
      assessment.setLaAutoRosterEnabled(v);
      if (v && assessment.laRosterFrozen) assessment.setLaRosterFrozen(false);
      toast.success(v ? "Labour Assessment auto-roster enabled" : "Labour Assessment auto-roster paused");
    } catch (error) {
      console.error("Failed to save Labour Assessment before auto-roster toggle:", error);
      toast.error("Could not save Labour Assessment inputs before auto-generating");
    }
  };

  const handleFreeze = () => {
    const n = roster.detachAllLaOperators();
    assessment.setLaRosterFrozen(true);
    assessment.setLaAutoRosterEnabled(false);
    setFreezeOpen(false);
    toast.success(`Froze ${n} operator${n !== 1 ? "s" : ""} — now manual. Labour Assessment will no longer update them.`);
  };

  const handleRegenerate = async () => {
    try {
      await assessment.saveAssessmentNow({ laRosterFrozen: false, laAutoRosterEnabled: true });
      roster.applyLaPlan(plan, false);
      assessment.setLaRosterFrozen(false);
      assessment.setLaAutoRosterEnabled(true);
      setRegenOpen(false);
      toast.success("Labour Assessment roster rebuilt from current inputs");
    } catch (error) {
      console.error("Failed to save Labour Assessment before regenerate:", error);
      toast.error("Could not save Labour Assessment inputs before regenerating");
    }
  };

  return (
    <div className="border border-border rounded-lg bg-card p-3 mb-3">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">Labour Assessment Roster</h3>
              {assessment.laRosterFrozen ? (
                <Badge variant="outline" className="text-[10px]">Frozen</Badge>
              ) : assessment.laAutoRosterEnabled ? (
                <Badge variant="default" className="text-[10px]">Live sync</Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px]">Paused</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="underline decoration-dotted underline-offset-2 hover:text-foreground focus:outline-none focus:text-foreground"
                    aria-label="Show planned operator breakdown"
                  >
                    {plan.length} operator{plan.length !== 1 ? "s" : ""} planned
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-80 p-0">
                  <div className="p-3 border-b border-border">
                    <div className="text-sm font-semibold text-foreground">Planned operators</div>
                    <div className="text-[11px] text-muted-foreground">
                      Generated from current Labour Assessment inputs.
                    </div>
                  </div>
                  {breakdown.length === 0 ? (
                    <div className="p-3 text-xs text-muted-foreground">No operators planned yet.</div>
                  ) : (
                    <ul className="max-h-72 overflow-auto divide-y divide-border">
                      {breakdown.map(row => (
                        <li key={row.label} className="flex items-center justify-between gap-3 px-3 py-2">
                          <div className="text-xs text-foreground truncate">
                            <span className="font-medium tabular-nums">{row.count}</span>{" "}
                            <span className="text-muted-foreground">×</span>{" "}
                            <span>{row.label}</span>
                          </div>
                          <div className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
                            {row.weeklyHours.toFixed(2)} hrs/wk
                          </div>
                        </li>
                      ))}
                      <li className="flex items-center justify-between gap-3 px-3 py-2 bg-muted/40">
                        <div className="text-xs font-semibold text-foreground">Total</div>
                        <div className="text-[11px] font-semibold text-foreground tabular-nums whitespace-nowrap">
                          {breakdown.reduce((s, r) => s + r.count, 0)} ops ·{" "}
                          {breakdown.reduce((s, r) => s + r.weeklyHours, 0).toFixed(2)} hrs/wk
                        </div>
                      </li>
                    </ul>
                  )}
                </PopoverContent>
              </Popover>
              {" "}· {counts.managed} managed · {counts.manual} manual
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 mr-2">
            <Switch
              checked={assessment.laAutoRosterEnabled && !assessment.laRosterFrozen}
              onCheckedChange={handleEnable}
              disabled={assessment.laRosterFrozen}
              className="scale-75"
            />
            <Label className="text-xs text-muted-foreground">Auto-generate operators</Label>
          </div>

          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => setRegenOpen(true)}
            disabled={counts.managed === 0 && plan.length === 0}
          >
            <RefreshCw className="h-3 w-3 mr-1" /> Regenerate
          </Button>

          {assessment.laRosterFrozen ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => {
                assessment.setLaRosterFrozen(false);
                assessment.setLaAutoRosterEnabled(true);
                toast.success("Unfrozen — Labour Assessment will manage new operators going forward");
              }}
            >
              <Unlock className="h-3 w-3 mr-1" /> Unfreeze
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => setFreezeOpen(true)}
              disabled={counts.managed === 0}
            >
              <Lock className="h-3 w-3 mr-1" /> Freeze Roster
            </Button>
          )}
        </div>
      </div>

      <AlertDialog open={regenOpen} onOpenChange={setRegenOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate Labour Assessment Roster?</AlertDialogTitle>
            <AlertDialogDescription>
              This action will rebuild all Labour Assessment Managed operators using the current Labour Assessment data.
              <br /><br />
              <strong>Manual operators will not be affected.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction onClick={handleRegenerate}>Yes, regenerate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={freezeOpen} onOpenChange={setFreezeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Freeze Labour Assessment Roster?</AlertDialogTitle>
            <AlertDialogDescription>
              All {counts.managed} Labour Assessment Managed operator{counts.managed !== 1 ? "s" : ""} will become Manual Operators.
              <br /><br />
              Labour Assessment calculations continue to operate, but existing operators are no longer updated.
              The estimator takes full control of the roster.
              <br /><br />
              This is typically used for final roster development before tender submission.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleFreeze}>Freeze roster</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default LaRosterSyncPanel;
