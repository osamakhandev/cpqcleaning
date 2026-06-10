import React, { useState } from "react";
import { fmtNum } from "@/lib/utils";
import { useAssessment } from "@/contexts/AssessmentContext";
import { ElementTask } from "@/types/labourAssessment";
import { OVERRIDE_REASONS, TASK_GROUP_ORDER } from "@/data/laSeedData";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import FormattedNumberInput from "@/components/ui/formatted-number-input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertCircle } from "lucide-react";

interface ElementTaskTableProps {
  tasks: ElementTask[];
  elementId: string;
}

const ElementTaskTable: React.FC<ElementTaskTableProps> = ({ tasks, elementId }) => {
  const { updateElementTask, toggleElementTaskInclude, conditions } = useAssessment();
  const [overrideDialog, setOverrideDialog] = useState<{
    taskId: string;
    field: string;
    oldValue: string | number;
    newValue: string | number;
  } | null>(null);
  const [reasonCode, setReasonCode] = useState("");
  const [reasonNote, setReasonNote] = useState("");

  const sortedTasks = [...tasks].sort((a, b) => {
    const ai = TASK_GROUP_ORDER.indexOf(a.taskGroup);
    const bi = TASK_GROUP_ORDER.indexOf(b.taskGroup);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const displayed = sortedTasks;

  const handleEditableChange = (task: ElementTask, field: "rateOverride" | "frequencyPerWeek", newValue: number) => {
    let oldValue: number;
    if (field === "rateOverride") oldValue = task.rateOverride ?? task.defaultRate;
    else oldValue = task.frequencyPerWeek;

    if (oldValue === newValue) return;

    const needsAudit = (field === "rateOverride" && newValue !== task.defaultRate)
      || (field === "frequencyPerWeek" && newValue !== task.frequencyDefault);

    if (needsAudit) {
      setOverrideDialog({ taskId: task.id, field, oldValue, newValue });
    } else {
      const updates: Partial<ElementTask> = {};
      if (field === "rateOverride") updates.rateOverride = newValue === task.defaultRate ? null : newValue;
      else updates.frequencyPerWeek = newValue;
      updateElementTask(task.id, updates);
    }
  };

  const submitOverride = () => {
    if (!overrideDialog || !reasonCode) return;
    if (reasonCode === "OTHER" && !reasonNote.trim()) return;

    const updates: Partial<ElementTask> = {};
    const { field, newValue } = overrideDialog;
    if (field === "rateOverride") {
      const task = tasks.find(t => t.id === overrideDialog.taskId);
      updates.rateOverride = Number(newValue) === task?.defaultRate ? null : Number(newValue);
    } else {
      updates.frequencyPerWeek = Number(newValue);
    }

    updateElementTask(overrideDialog.taskId, updates, {
      field,
      oldValue: overrideDialog.oldValue,
      newValue: overrideDialog.newValue,
      reasonCode,
      reasonNote,
    });
    setOverrideDialog(null);
    setReasonCode("");
    setReasonNote("");
  };

  const conditionInactive = (task: ElementTask) => {
    if (task.conditionFlags.length === 0) return false;
    return !task.conditionFlags.every(f => conditions[f] === true);
  };

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-2 py-1.5 text-left font-medium text-muted-foreground w-10">Inc</th>
              <th className="px-2 py-1.5 text-left font-medium text-muted-foreground min-w-[160px]">Task</th>
              <th className="px-2 py-1.5 text-left font-medium text-muted-foreground w-16">Method</th>
              <th className="px-2 py-1.5 text-right font-medium text-muted-foreground w-20">Rate</th>
              <th className="px-2 py-1.5 text-left font-medium text-muted-foreground w-16">Unit</th>
              <th className="px-2 py-1.5 text-right font-medium text-muted-foreground w-16">Freq/wk</th>
              <th className="px-2 py-1.5 text-right font-medium text-muted-foreground w-20">Qty</th>
              <th className="px-2 py-1.5 text-right font-medium text-muted-foreground w-20">Hrs/wk</th>
              <th className="px-2 py-1.5 text-left font-medium text-muted-foreground min-w-[100px]">Notes</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map(task => {
              const inactive = conditionInactive(task);
              const effectiveRate = task.rateOverride ?? task.defaultRate;
              const rateNotSet = effectiveRate === 0 && task.defaultRate === 0;
              return (
                <tr key={task.id} className={`border-b border-border/50 ${inactive ? "opacity-50" : ""} ${!task.included ? "opacity-40" : ""}`}>
                  <td className="px-2 py-1">
                    <Switch checked={task.included} onCheckedChange={() => toggleElementTaskInclude(task.id)} className="scale-75" />
                  </td>
                  <td className="px-2 py-1 font-medium text-foreground">
                    <div className="flex items-center gap-1">
                      {task.taskName}
                      {task.hasOverride && <Badge variant="outline" className="text-[9px] px-1 py-0 border-primary/40 text-primary">overridden</Badge>}
                      {task.quantitySource === "MANUAL" && <Badge variant="secondary" className="text-[9px] px-1 py-0">manual qty</Badge>}
                      {inactive && (
                        <Tooltip>
                          <TooltipTrigger><AlertCircle className="h-3 w-3 text-muted-foreground" /></TooltipTrigger>
                          <TooltipContent><p className="text-xs">Not active – condition off</p></TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-1 text-muted-foreground">{task.calcMethod === "AREA_RATE" ? "Area" : "Time"}</td>
                  <td className="px-2 py-1 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {rateNotSet && (
                        <Tooltip>
                          <TooltipTrigger><AlertCircle className="h-3 w-3 text-amber-500" /></TooltipTrigger>
                          <TooltipContent><p className="text-xs">Rate not set — user entry required</p></TooltipContent>
                        </Tooltip>
                      )}
                      <FormattedNumberInput
                        value={effectiveRate}
                        onChange={v => {
                          updateElementTask(task.id, { rateOverride: v === task.defaultRate ? null : v });
                        }}
                        onBlur={v => handleEditableChange(task, "rateOverride", v)}
                        className={`h-6 text-xs px-1 w-20 text-right ${rateNotSet ? "border-amber-400" : ""}`}
                        placeholder={rateNotSet ? "—" : "0"}
                        disabled={inactive}
                      />
                    </div>
                  </td>
                  <td className="px-2 py-1 text-muted-foreground">{task.rateUnit}</td>
                  <td className="px-2 py-1 text-right">
                    <FormattedNumberInput
                      value={task.frequencyPerWeek}
                      onChange={v => {
                        updateElementTask(task.id, { frequencyPerWeek: v });
                      }}
                      onBlur={v => handleEditableChange(task, "frequencyPerWeek", v)}
                      className="h-6 text-xs px-1 w-14 text-right"
                      disabled={inactive}
                    />
                  </td>
                  <td className="px-2 py-1 text-right">
                    {task.quantitySource === "MANUAL" ? (
                      <FormattedNumberInput
                        value={task.quantityValue || 0}
                        onChange={v => updateElementTask(task.id, { quantityValue: v })}
                        className="h-6 text-xs px-1 w-16 text-right"
                        placeholder="0"
                        disabled={inactive}
                      />
                    ) : (
                      <span className="text-muted-foreground font-mono text-[10px]">from element</span>
                    )}
                  </td>
                  <td className="px-2 py-1 text-right font-mono font-medium text-foreground">
                    {inactive ? "0.00" : fmtNum(task.hoursAdjusted, 2)}
                  </td>
                  <td className="px-2 py-1">
                    <Input
                      value={task.notes}
                      onChange={e => updateElementTask(task.id, { notes: e.target.value })}
                      className="h-6 text-xs px-1"
                      placeholder="…"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={!!overrideDialog} onOpenChange={() => { setOverrideDialog(null); setReasonCode(""); setReasonNote(""); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Override Reason Required</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Changing <strong>{overrideDialog?.field === "rateOverride" ? "Rate" : "Frequency"}</strong> from <strong>{String(overrideDialog?.oldValue)}</strong> to <strong>{String(overrideDialog?.newValue)}</strong>
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">Reason Code</Label>
              <Select value={reasonCode} onValueChange={setReasonCode}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select reason…" /></SelectTrigger>
                <SelectContent>
                  {OVERRIDE_REASONS.map(r => (
                    <SelectItem key={r.code} value={r.code}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {reasonCode === "OTHER" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Reason Note (required)</Label>
                <Textarea value={reasonNote} onChange={e => setReasonNote(e.target.value)} rows={2} className="text-xs" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setOverrideDialog(null); setReasonCode(""); setReasonNote(""); }}>Cancel</Button>
            <Button size="sm" onClick={submitOverride} disabled={!reasonCode || (reasonCode === "OTHER" && !reasonNote.trim())}>Confirm Override</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ElementTaskTable;
