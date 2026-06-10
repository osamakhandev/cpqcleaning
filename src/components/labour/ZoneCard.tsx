import React, { useState } from "react";
import { fmtNum } from "@/lib/utils";
import { useAssessment } from "@/contexts/AssessmentContext";
import { LineItem } from "@/types/labourAssessment";
import TaskTable from "./TaskTable";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, RotateCcw, CheckSquare } from "lucide-react";

interface ZoneCardProps {
  zone: string;
  tabId: string;
  items: LineItem[];
  defaultExpanded: boolean;
}

const ZoneCard: React.FC<ZoneCardProps> = ({ zone, tabId, items, defaultExpanded }) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const { includeAllInZone, resetZoneToDefaults } = useAssessment();

  const includedItems = items.filter(i => i.included);
  const totalHours = includedItems.reduce((sum, i) => sum + i.hoursAdjusted, 0);

  return (
    <div className="border border-border rounded-lg bg-card mb-3">
      <div
        className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          <h3 className="text-sm font-semibold text-foreground">{zone}</h3>
          <span className="text-xs text-muted-foreground">
            {includedItems.length}/{items.length} tasks
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-mono font-bold text-foreground">{fmtNum(totalHours, 2)} hrs/wk</span>
          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => includeAllInZone(zone, tabId)}>
              <CheckSquare className="h-3 w-3 mr-1" />Include All
            </Button>
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => resetZoneToDefaults(zone, tabId)}>
              <RotateCcw className="h-3 w-3 mr-1" />Reset
            </Button>
          </div>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-border">
          <TaskTable items={items} zone={zone} tabId={tabId} />
        </div>
      )}
    </div>
  );
};

export default ZoneCard;
