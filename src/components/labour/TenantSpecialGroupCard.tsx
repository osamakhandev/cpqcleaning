import React, { useState } from "react";
import { useAssessment } from "@/contexts/AssessmentContext";
import { TenantSpecialGroup } from "@/types/labourAssessment";
import ElementCard from "./ElementCard";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Trash2, Plus, ChevronDown, ChevronRight } from "lucide-react";
import { fmtNum } from "@/lib/utils";

interface Props {
  group: TenantSpecialGroup;
}

const TenantSpecialGroupCard: React.FC<Props> = ({ group }) => {
  const {
    buildingElements,
    updateTenantSpecialGroup,
    removeTenantSpecialGroup,
    addTenantSpecialElement,
    getTenantSpecialHours,
  } = useAssessment();

  const [expanded, setExpanded] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"AREA" | "UNIT">("UNIT");

  const groupElements = buildingElements.filter(e => e.tenantGroupId === group.id);
  const hours = getTenantSpecialHours(group.id);

  const headerLabel = group.tenantName || "New Tenant";

  const handleAdd = () => {
    const name = newName.trim();
    if (!name) return;
    addTenantSpecialElement(group.id, name, name, newType);
    setNewName("");
    setNewType("UNIT");
    setAddOpen(false);
  };

  return (
    <div className={`border border-border rounded-lg bg-card ${!group.included ? "opacity-60" : ""}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="text-muted-foreground hover:text-foreground"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          <Switch
            checked={group.included}
            onCheckedChange={(v) => updateTenantSpecialGroup(group.id, { included: v })}
            className="scale-90"
          />
          <span className="text-sm font-semibold text-foreground truncate">
            {headerLabel}
            {group.location ? ` — ${group.location}` : ""}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-mono font-bold text-foreground">
            {fmtNum(hours, 2)} hrs/wk
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-destructive hover:text-destructive"
            onClick={() => {
              if (confirm(`Delete tenant special service "${headerLabel}"? This removes its tasks and hours.`)) {
                removeTenantSpecialGroup(group.id);
              }
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="p-3 space-y-3">
          {/* Tenant metadata */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px] text-muted-foreground">Tenant Name</Label>
              <Input
                value={group.tenantName}
                onChange={e => updateTenantSpecialGroup(group.id, { tenantName: e.target.value })}
                placeholder="e.g. ABC Lawyers"
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Floor / Level / Location</Label>
              <Input
                value={group.location}
                onChange={e => updateTenantSpecialGroup(group.id, { location: e.target.value })}
                placeholder="e.g. Level 12"
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">Notes</Label>
            <Textarea
              value={group.notes}
              onChange={e => updateTenantSpecialGroup(group.id, { notes: e.target.value })}
              placeholder="e.g. Extra meeting room and internal glass cleaning"
              className="text-sm min-h-[60px]"
            />
          </div>

          {/* Cleaning tasks (element cards) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Cleaning Tasks
              </h4>
              <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 text-xs">
                    <Plus className="h-3 w-3 mr-1" /> Add Cleaning Task
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[400px]">
                  <DialogHeader>
                    <DialogTitle>Add Cleaning Task</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs">Task / Element name</Label>
                      <Input
                        autoFocus
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        placeholder="e.g. Internal Glass Cleaning"
                        onKeyDown={e => { if (e.key === "Enter") handleAdd(); }}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Quantity Type</Label>
                      <Select value={newType} onValueChange={(v) => setNewType(v as "AREA" | "UNIT")}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="UNIT">Units (count)</SelectItem>
                          <SelectItem value="AREA">Area (m²)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
                    <Button onClick={handleAdd} disabled={!newName.trim()}>Add</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {groupElements.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-2 text-center">
                No cleaning tasks. Click "Add Cleaning Task" to add one.
              </p>
            ) : (
              groupElements.map((el, idx) => (
                <ElementCard key={el.id} element={el} defaultExpanded={idx === 0} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TenantSpecialGroupCard;
