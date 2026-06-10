import React, { useState, useMemo } from "react";
import { useAssessment } from "@/contexts/AssessmentContext";
import { fmtNum } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { COMMERCIAL_TABS } from "@/data/laSeedData";

interface ChecklistItem {
  name: string;
  area: number | null;
  taskCount: number;
  totalTasks: number;
  hours: number;
}

interface ChecklistGroup {
  label: string;
  items: ChecklistItem[];
  subtotal: number;
}

const AssessmentChecklist: React.FC = () => {
  const {
    buildingElements,
    elementTasks,
    lineItems,
    tenantSpecialGroups,
    getWendDetailerHours,
    wendDetailerPrograms,
    wendDetailerMode,
    wendDetailerFixedHours,
    wendDetailerIncludeInCore,
  } = useAssessment();

  const [hideZeroItems, setHideZeroItems] = useState(false);

  const groups = useMemo<ChecklistGroup[]>(() => {
    const result: ChecklistGroup[] = [];

    // Standard tenancy + common-public element tabs
    const elementTabs = [
      { id: "tenancy-areas", label: "Tenancy Areas — Standard" },
      { id: "common-public", label: "Common & Public Areas" },
    ];

    // Derived common-area element types that should always appear
    const DERIVED_ELEMENT_TYPES = [
      "Common Ablutions (Derived)",
      "Common Other Amenities (Derived)",
      "Common Circulation & Lift Lobbies (Derived)",
      "Fire Stairs (Derived)",
      "Plant Rooms & Services (Derived)",
      "Service Storage & Back-of-House (Derived)",
    ];

    for (const tab of elementTabs) {
      const tabElements = buildingElements.filter(e => e.tabMapping === tab.id);
      const items: ChecklistItem[] = tabElements.map(el => {
        const elTasks = elementTasks.filter(t => t.buildingElementId === el.id);
        const includedTasks = elTasks.filter(t => t.included && el.included);
        const hours = includedTasks.reduce((s, t) => s + t.hoursAdjusted, 0);
        return {
          name: el.elementName,
          area: el.quantityType === "AREA" ? el.quantityValue : null,
          taskCount: includedTasks.length,
          totalTasks: elTasks.length,
          hours,
        };
      });

      // For common-public, ensure derived items always appear
      if (tab.id === "common-public") {
        for (const derivedType of DERIVED_ELEMENT_TYPES) {
          const exists = tabElements.some(e => e.elementType === derivedType);
          if (!exists) {
            items.push({
              name: derivedType,
              area: 0,
              taskCount: 0,
              totalTasks: 0,
              hours: 0,
            });
          }
        }
      }

      result.push({
        label: tab.label,
        items,
        subtotal: items.reduce((s, i) => s + i.hours, 0),
      });
    }

    // Per-tenant Tenancy Specials groups
    for (const tg of tenantSpecialGroups) {
      const groupElements = buildingElements.filter(e => e.tenantGroupId === tg.id);
      const items: ChecklistItem[] = groupElements.map(el => {
        const elTasks = elementTasks.filter(t => t.buildingElementId === el.id);
        const includedTasks = elTasks.filter(t => t.included && el.included && tg.included);
        const hours = includedTasks.reduce((s, t) => s + t.hoursAdjusted, 0);
        return {
          name: el.elementName,
          area: el.quantityType === "AREA" ? el.quantityValue : null,
          taskCount: includedTasks.length,
          totalTasks: elTasks.length,
          hours,
        };
      });
      const label = `Tenant Special — ${tg.tenantName || "Unnamed Tenant"}${tg.location ? ` (${tg.location})` : ""}`;
      result.push({
        label,
        items,
        subtotal: items.reduce((s, i) => s + i.hours, 0),
      });
    }




    // W'end / Detailer
    const wendItems: ChecklistItem[] = [];
    if (wendDetailerMode === "area-based") {
      for (const prog of wendDetailerPrograms) {
        wendItems.push({
          name: prog.name,
          area: null,
          taskCount: prog.included ? 1 : 0,
          totalTasks: 1,
          hours: prog.included ? prog.hoursPerWeek : 0,
        });
      }
    } else {
      wendItems.push({
        name: "Fixed hours allocation",
        area: null,
        taskCount: wendDetailerFixedHours > 0 ? 1 : 0,
        totalTasks: 1,
        hours: wendDetailerFixedHours,
      });
    }

    result.push({
      label: "W'end / Detailer",
      items: wendItems,
      subtotal: getWendDetailerHours(),
    });

    return result;
  }, [buildingElements, elementTasks, lineItems, tenantSpecialGroups, wendDetailerPrograms, wendDetailerMode, wendDetailerFixedHours, getWendDetailerHours]);

  const grandTotal = groups.reduce((s, g) => s + g.subtotal, 0);

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-foreground">Labour Assessment Checklist (all items)</h3>
        <div className="flex items-center gap-1.5">
          <Switch
            checked={hideZeroItems}
            onCheckedChange={setHideZeroItems}
            className="scale-75"
          />
          <Label className="text-[10px] text-muted-foreground">Show only items with hours &gt; 0</Label>
        </div>
      </div>

      <div className="border border-border rounded-md overflow-hidden">
        {groups.map(group => {
          const visibleItems = hideZeroItems
            ? group.items.filter(i => i.hours > 0)
            : group.items;

          return (
            <GroupAccordion
              key={group.label}
              group={group}
              visibleItems={visibleItems}
              hideZeroItems={hideZeroItems}
            />
          );
        })}

        {/* Grand total */}
        <div className="flex items-center justify-between px-3 py-2 bg-muted/60 border-t border-border font-semibold text-xs">
          <span className="text-foreground">TOTAL (weekly hours)</span>
          <span className="font-mono tabular-nums text-foreground">{grandTotal.toFixed(2)}</span>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground mt-1.5 italic">
        Assessed hours feed the Suggested Roster totals.
      </p>
    </div>
  );
};

const GroupAccordion: React.FC<{
  group: ChecklistGroup;
  visibleItems: ChecklistItem[];
  hideZeroItems: boolean;
}> = ({ group, visibleItems, hideZeroItems }) => {
  const [open, setOpen] = useState(true);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-1.5 bg-muted/40 border-b border-border hover:bg-muted/60 transition-colors cursor-pointer">
        <div className="flex items-center gap-1.5">
          <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`} />
          <span className="text-xs font-semibold text-foreground">{group.label}</span>
          <span className="text-[10px] text-muted-foreground">
            ({group.items.length} item{group.items.length !== 1 ? "s" : ""})
          </span>
        </div>
        <span className="text-xs font-mono tabular-nums font-semibold text-foreground">
          {group.subtotal.toFixed(2)}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {visibleItems.length === 0 && hideZeroItems ? (
          <div className="px-3 py-1.5 text-[10px] text-muted-foreground italic border-b border-border/50">
            All items have 0.00 hours
          </div>
        ) : (
          visibleItems.map((item, idx) => (
            <div
              key={idx}
              className={`flex items-center justify-between px-3 py-1 border-b border-border/30 text-xs ${
                item.hours === 0 ? "text-muted-foreground/60" : "text-foreground"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="truncate">{item.name}</span>
                {item.area !== null && item.area > 0 && (
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    ({fmtNum(item.area, 0)} m²)
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {item.totalTasks === 0
                    ? "No applicable tasks"
                    : `${item.taskCount}/${item.totalTasks} task${item.totalTasks !== 1 ? "s" : ""}`}
                </span>
              </div>
              <span className={`font-mono tabular-nums shrink-0 ml-2 ${
                item.hours === 0 ? "text-muted-foreground/60" : "text-foreground"
              }`}>
                {item.hours.toFixed(2)}
              </span>
            </div>
          ))
        )}
        {/* Subtotal row */}
        <div className="flex items-center justify-between px-3 py-1 bg-muted/20 border-b border-border text-xs font-medium">
          <span className="text-muted-foreground">Subtotal – {group.label}</span>
          <span className="font-mono tabular-nums text-foreground">{group.subtotal.toFixed(2)}</span>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default AssessmentChecklist;
