import React from "react";
import { fmtNum } from "@/lib/utils";
import { useAssessment } from "@/contexts/AssessmentContext";
import { WendDetailerProgram } from "@/types/labourAssessment";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import FormattedNumberInput from "@/components/ui/formatted-number-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Plus, Trash2, Calendar } from "lucide-react";
import HowItWorks from "@/components/HowItWorks";
import { HELP_CONTENT } from "@/data/helpContent";

const WendDetailerContent: React.FC = () => {
  const {
    floorPlan,
    wendDetailerMode,
    setWendDetailerMode,
    wendDetailerPrograms,
    setWendDetailerPrograms,
    wendDetailerFixedHours,
    setWendDetailerFixedHours,
    wendDetailerIncludeInCore,
    setWendDetailerIncludeInCore,
    getWendDetailerHours,
  } = useAssessment();

  const effectiveGla = floorPlan.wendDetailerGlaOverridden
    ? floorPlan.wendDetailerGla
    : (floorPlan.glaOverridden !== null ? floorPlan.glaOverridden : floorPlan.glaCalculated);

  const totalHours = getWendDetailerHours();

  const updateProgram = (id: string, updates: Partial<WendDetailerProgram>) => {
    setWendDetailerPrograms(prev =>
      prev.map(p => {
        if (p.id !== id) return p;
        // Any user edit promotes the program to "user-managed" so subsequent
        // GLA / floor-plan changes do not overwrite it. This is the fix for
        // user-edited W'end/Detailer programs being reset to defaults.
        const updated: WendDetailerProgram = {
          ...p,
          ...updates,
          areaBasisOverridden: true,
        };
        // Recalc hours
        if (updated.rate > 0) {
          updated.hoursPerDay = updated.areaBasis / updated.rate;
        } else {
          updated.hoursPerDay = 0;
        }
        const daysCount = (updated.satApplied ? 1 : 0) + (updated.sunApplied ? 1 : 0);
        updated.hoursPerWeek = updated.hoursPerDay * daysCount;
        return updated;
      })
    );
  };


  const addProgram = () => {
    const newProg: WendDetailerProgram = {
      id: `wdp-${Date.now()}`,
      name: "New program",
      included: true,
      satApplied: true,
      sunApplied: false,
      rate: 1500,
      areaBasis: effectiveGla,
      areaBasisOverridden: false,
      hoursPerDay: effectiveGla > 0 ? effectiveGla / 1500 : 0,
      hoursPerWeek: effectiveGla > 0 ? effectiveGla / 1500 : 0,
      notes: "",
    };
    setWendDetailerPrograms(prev => [...prev, newProg]);
  };

  const removeProgram = (id: string) => {
    setWendDetailerPrograms(prev => prev.filter(p => p.id !== id));
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <HowItWorks {...HELP_CONTENT["la-wend-detailer"]} size="sm" />
      </div>
      {/* Alert */}
      <Alert className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-xs text-amber-800 dark:text-amber-200">
          Default rates are benchmarks. Confirm weekend scope and access windows. Adjust rates/areas based on site reality.
        </AlertDescription>
      </Alert>

      {/* Mode selector + include in core */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Label className="text-xs text-muted-foreground">Calculation method:</Label>
          <Select
            value={wendDetailerMode}
            onValueChange={v => setWendDetailerMode(v as "area-based" | "fixed-hours")}
          >
            <SelectTrigger className="h-7 w-52 text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="area-based">Area-based (m²/hr applied to GLA)</SelectItem>
              <SelectItem value="fixed-hours">Fixed weekly hours</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={wendDetailerIncludeInCore}
            onCheckedChange={setWendDetailerIncludeInCore}
            className="scale-75"
          />
          <Label className="text-[10px] text-muted-foreground">Include in Core Cleaning hours</Label>
        </div>
      </div>

      {/* GLA reference */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-4">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">GLA for W'end/Detailer scope (m²)</Label>
              <div className="flex items-center gap-1">
                <FormattedNumberInput
                  value={floorPlan.wendDetailerGla || effectiveGla}
                  onChange={v => {
                    // This is handled by setFloorPlan in the parent, but we expose through context
                    // We need to use setFloorPlan
                  }}
                  className="h-7 text-xs w-28 text-right"
                  disabled
                />
                <span className="text-[10px] text-muted-foreground">m²</span>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground italic pt-3">
              Defaults to Estimated GLA from Start Here. Override on Start Here if needed.
            </p>
          </div>
        </CardContent>
      </Card>

      {wendDetailerMode === "area-based" ? (
        /* Area-based programs table */
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Weekend / Detailer Programs
              </CardTitle>
              <Badge variant="secondary" className="font-mono text-[10px]">
                Total: {fmtNum(totalHours, 2)}h/wk
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-1.5 px-1 text-muted-foreground font-medium w-6"></th>
                    <th className="text-left py-1.5 px-2 text-muted-foreground font-medium">Program</th>
                    <th className="text-center py-1.5 px-1 text-muted-foreground font-medium w-10">Sat</th>
                    <th className="text-center py-1.5 px-1 text-muted-foreground font-medium w-10">Sun</th>
                    <th className="text-right py-1.5 px-2 text-muted-foreground font-medium w-20">Rate (m²/hr)</th>
                    <th className="text-right py-1.5 px-2 text-muted-foreground font-medium w-24">Area (m²)</th>
                    <th className="text-right py-1.5 px-2 text-muted-foreground font-medium w-20">Hrs/day</th>
                    <th className="text-right py-1.5 px-2 text-muted-foreground font-medium w-20">Hrs/wk</th>
                    <th className="text-left py-1.5 px-2 text-muted-foreground font-medium">Notes</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {wendDetailerPrograms.map(prog => (
                    <tr key={prog.id} className={`border-b border-border/50 ${!prog.included ? "opacity-40" : ""}`}>
                      <td className="py-1 px-1">
                        <Switch
                          checked={prog.included}
                          onCheckedChange={v => updateProgram(prog.id, { included: v })}
                          className="scale-[0.55]"
                        />
                      </td>
                      <td className="py-1 px-2">
                        <Input
                          value={prog.name}
                          onChange={e => updateProgram(prog.id, { name: e.target.value })}
                          className="h-7 text-xs"
                        />
                      </td>
                      <td className="text-center py-1 px-1">
                        <Checkbox
                          checked={prog.satApplied}
                          onCheckedChange={v => updateProgram(prog.id, { satApplied: !!v })}
                        />
                      </td>
                      <td className="text-center py-1 px-1">
                        <Checkbox
                          checked={prog.sunApplied}
                          onCheckedChange={v => updateProgram(prog.id, { sunApplied: !!v })}
                        />
                      </td>
                      <td className="py-1 px-2">
                        <FormattedNumberInput
                          value={prog.rate}
                          onChange={v => updateProgram(prog.id, { rate: v })}
                          className="h-7 text-xs w-full text-right font-mono"
                        />
                      </td>
                      <td className="py-1 px-2">
                        <FormattedNumberInput
                          value={prog.areaBasis}
                          onChange={v => updateProgram(prog.id, { areaBasis: v, areaBasisOverridden: true })}
                          className="h-7 text-xs w-full text-right font-mono"
                        />
                      </td>
                      <td className="text-right py-1 px-2 font-mono text-foreground">
                        {prog.rate > 0 ? fmtNum(prog.hoursPerDay, 2) : "—"}
                      </td>
                      <td className="text-right py-1 px-2 font-mono font-medium text-foreground">
                        {prog.included ? fmtNum(prog.hoursPerWeek, 2) : "—"}
                      </td>
                      <td className="py-1 px-2">
                        <Input
                          value={prog.notes}
                          onChange={e => updateProgram(prog.id, { notes: e.target.value })}
                          className="h-7 text-xs"
                          placeholder="Notes…"
                        />
                      </td>
                      <td className="py-1 px-1">
                        <Button
                          variant="ghost" size="sm"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeProgram(prog.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border font-medium">
                    <td colSpan={7} className="py-1.5 px-2 text-right text-muted-foreground">Weekly Total</td>
                    <td className="text-right py-1.5 px-2 font-mono font-bold text-foreground">
                      {fmtNum(totalHours, 2)}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <Button variant="outline" size="sm" className="mt-3 h-7 text-xs" onClick={addProgram}>
              <Plus className="h-3 w-3 mr-1" />Add Program
            </Button>
          </CardContent>
        </Card>
      ) : (
        /* Fixed hours mode */
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Fixed Weekly Hours</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Label className="text-xs text-muted-foreground">W'end / Detailer hours per week:</Label>
              <FormattedNumberInput
                value={wendDetailerFixedHours}
                onChange={setWendDetailerFixedHours}
                decimals={2}
                className="h-8 text-sm w-28 font-mono"
              />
              <span className="text-xs text-muted-foreground">h/wk</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 italic">
              Sat/Sun scheduling will be determined in Suggested Roster.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default WendDetailerContent;
