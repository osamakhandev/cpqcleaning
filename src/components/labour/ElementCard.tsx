import React, { useState } from "react";
import { fmtNum } from "@/lib/utils";
import { useAssessment } from "@/contexts/AssessmentContext";
import { BuildingElement } from "@/types/labourAssessment";
import ElementTaskTable from "./ElementTaskTable";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, RotateCcw, CheckSquare } from "lucide-react";

interface ElementCardProps {
  element: BuildingElement;
  defaultExpanded: boolean;
}

const ElementCard: React.FC<ElementCardProps> = ({ element, defaultExpanded }) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const { elementTasks, includeAllElementTasks, resetElementTasks } = useAssessment();

  const tasks = elementTasks.filter(t => t.buildingElementId === element.id);
  const includedTasks = tasks.filter(t => t.included);
  const totalHours = includedTasks.reduce((sum, t) => sum + t.hoursAdjusted, 0);

  if (tasks.length === 0) {
    return (
      <div className="border border-border rounded-lg bg-card mb-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">{element.elementName}</h3>
          <span className="text-xs text-muted-foreground">No applicable tasks</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`border border-border rounded-lg bg-card mb-3 ${!element.included ? "opacity-50" : ""}`}>
      <div
        className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          <h3 className="text-sm font-semibold text-foreground">{element.elementName}</h3>
          <span className="text-xs text-muted-foreground">
            {includedTasks.length}/{tasks.length} tasks
          </span>
          {element.quantityValue > 0 && (
             <span className="text-[10px] text-muted-foreground font-mono">
               ({fmtNum(element.quantityValue)} {element.quantityType === "AREA" ? "m²" : "units"})
             </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-mono font-bold text-foreground">{fmtNum(totalHours, 2)} hrs/wk</span>
          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => includeAllElementTasks(element.id)}>
              <CheckSquare className="h-3 w-3 mr-1" />Include All
            </Button>
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => resetElementTasks(element.id)}>
              <RotateCcw className="h-3 w-3 mr-1" />Reset
            </Button>
          </div>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-border">
          <ElementTaskTable tasks={tasks} elementId={element.id} />
        </div>
      )}
    </div>
  );
};

export default ElementCard;
