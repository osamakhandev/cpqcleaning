import React from "react";
import { useAssessment } from "@/contexts/AssessmentContext";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText } from "lucide-react";

const OverridesLog: React.FC = () => {
  const { overrides, lineItems } = useAssessment();

  if (overrides.length === 0) {
    return (
      <div className="border border-border rounded-lg bg-card p-6 text-center">
        <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No overrides recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg bg-card">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">Overrides Log ({overrides.length})</h3>
      </div>
      <ScrollArea className="max-h-[300px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Task</TableHead>
              <TableHead className="text-xs">Field</TableHead>
              <TableHead className="text-xs">Old → New</TableHead>
              <TableHead className="text-xs">Reason</TableHead>
              <TableHead className="text-xs">Note</TableHead>
              <TableHead className="text-xs">When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {overrides.map(o => {
              const item = lineItems.find(li => li.id === o.lineItemId);
              return (
                <TableRow key={o.id}>
                  <TableCell className="text-xs">{item?.taskName ?? o.lineItemId}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{o.field}</TableCell>
                  <TableCell className="text-xs font-mono">{String(o.oldValue)} → {String(o.newValue)}</TableCell>
                  <TableCell className="text-xs">{o.reasonCode}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{o.reasonNote || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(o.timestamp).toLocaleString()}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
};

export default OverridesLog;
