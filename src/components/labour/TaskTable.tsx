import React, { useState } from "react";
import { fmtNum } from "@/lib/utils";
import { useAssessment } from "@/contexts/AssessmentContext";
import { LineItem } from "@/types/labourAssessment";
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

interface TaskTableProps {
  items: LineItem[];
  zone: string;
  tabId: string;
}

const TaskTable: React.FC<TaskTableProps> = ({ items, zone, tabId }) => {
  const { updateLineItem, toggleInclude, conditions } = useAssessment();
  const [overrideDialog, setOverrideDialog] = useState<{
    itemId: string;
    field: string;
    oldValue: string | number;
    newValue: string | number;
  } | null>(null);
  const [reasonCode, setReasonCode] = useState("");
  const [reasonNote, setReasonNote] = useState("");

  const sortedItems = [...items].sort((a, b) => {
    const ai = TASK_GROUP_ORDER.indexOf(a.taskGroup);
    const bi = TASK_GROUP_ORDER.indexOf(b.taskGroup);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const displayed = sortedItems;

  const handleEditableChange = (item: LineItem, field: "baseRate" | "frequencyPerWeek", newValue: number) => {
    let oldValue: number;
    if (field === "baseRate") oldValue = item.baseRate;
    else oldValue = item.frequencyPerWeek;

    if (oldValue === newValue) return;

    const needsAudit = (field === "baseRate" && newValue !== item.baseRateDefault)
      || (field === "frequencyPerWeek" && newValue !== item.frequencyDefault);

    if (needsAudit) {
      setOverrideDialog({ itemId: item.id, field, oldValue, newValue });
    } else {
      const updates: Partial<LineItem> = {};
      if (field === "baseRate") updates.baseRate = Number(newValue);
      else updates.frequencyPerWeek = Number(newValue);
      updateLineItem(item.id, updates);
    }
  };

  const submitOverride = () => {
    if (!overrideDialog || !reasonCode) return;
    if (reasonCode === "OTHER" && !reasonNote.trim()) return;

    const updates: Partial<LineItem> = {};
    const { field, newValue } = overrideDialog;
    if (field === "baseRate") updates.baseRate = Number(newValue);
    else if (field === "frequencyPerWeek") updates.frequencyPerWeek = Number(newValue);

    updateLineItem(overrideDialog.itemId, updates, {
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

  const conditionInactive = (item: LineItem) => {
    if (item.conditionFlags.length === 0) return false;
    return !item.conditionFlags.every(f => conditions[f] === true);
  };

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-2 py-1.5 text-left font-medium text-muted-foreground w-10">Inc</th>
              <th className="px-2 py-1.5 text-left font-medium text-muted-foreground min-w-[160px]">Task</th>
              <th className="px-2 py-1.5 text-left font-medium text-muted-foreground w-20">Method</th>
              <th className="px-2 py-1.5 text-right font-medium text-muted-foreground w-20">Base Rate</th>
              <th className="px-2 py-1.5 text-left font-medium text-muted-foreground w-16">Unit</th>
              <th className="px-2 py-1.5 text-right font-medium text-muted-foreground w-16">Freq/wk</th>
              <th className="px-2 py-1.5 text-left font-medium text-muted-foreground w-16">Qty Src</th>
              <th className="px-2 py-1.5 text-right font-medium text-muted-foreground w-20">Qty</th>
              <th className="px-2 py-1.5 text-right font-medium text-muted-foreground w-20">Hrs (Adj)</th>
              <th className="px-2 py-1.5 text-left font-medium text-muted-foreground min-w-[100px]">Notes</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map(item => {
              const inactive = conditionInactive(item);
              return (
                <tr key={item.id} className={`border-b border-border/50 ${inactive ? "opacity-50" : ""} ${!item.included ? "opacity-40" : ""}`}>
                  <td className="px-2 py-1">
                    <Switch checked={item.included} onCheckedChange={() => toggleInclude(item.id)} className="scale-75" />
                  </td>
                  <td className="px-2 py-1 font-medium text-foreground">
                    <div className="flex items-center gap-1">
                      {item.taskName}
                      {item.hasOverride && <Badge variant="outline" className="text-[9px] px-1 py-0 border-primary/40 text-primary">overridden</Badge>}
                      {inactive && (
                        <Tooltip>
                          <TooltipTrigger>
                            <AlertCircle className="h-3 w-3 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent><p className="text-xs">Not active – condition off</p></TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-1 text-muted-foreground">{item.calcMethod === "AREA_RATE" ? "Area" : "Time"}</td>
                  <td className="px-2 py-1 text-right">
                    <FormattedNumberInput
                      value={item.baseRate}
                      onChange={v => updateLineItem(item.id, { baseRate: v })}
                      onBlur={v => handleEditableChange(item, "baseRate", v)}
                      className="h-6 text-xs px-1 w-20 text-right"
                      disabled={inactive}
                    />
                  </td>
                  <td className="px-2 py-1 text-muted-foreground">{item.rateUnit}</td>
                  <td className="px-2 py-1 text-right">
                    <FormattedNumberInput
                      value={item.frequencyPerWeek}
                      onChange={v => updateLineItem(item.id, { frequencyPerWeek: v })}
                      onBlur={v => handleEditableChange(item, "frequencyPerWeek", v)}
                      className="h-6 text-xs px-1 w-14 text-right"
                      disabled={inactive}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <Select
                      value={item.quantitySource}
                      onValueChange={v => updateLineItem(item.id, { quantitySource: v as any })}
                    >
                      <SelectTrigger className="h-6 text-xs px-1 w-16"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DIRECT">Direct</SelectItem>
                        <SelectItem value="DERIVED_RULE">Derived</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 py-1 text-right">
                    <FormattedNumberInput
                      value={item.quantityValue}
                      onChange={v => updateLineItem(item.id, { quantityValue: v })}
                      className="h-6 text-xs px-1 w-20 text-right"
                      disabled={inactive}
                    />
                  </td>
                  <td className="px-2 py-1 text-right font-mono font-medium text-foreground">
                    {inactive ? "0.00" : fmtNum(item.hoursAdjusted, 2)}
                  </td>
                  <td className="px-2 py-1">
                    <Input
                      value={item.notes}
                      onChange={e => updateLineItem(item.id, { notes: e.target.value })}
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
              Changing <strong>{overrideDialog?.field}</strong> from <strong>{String(overrideDialog?.oldValue)}</strong> to <strong>{String(overrideDialog?.newValue)}</strong>
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

export default TaskTable;
