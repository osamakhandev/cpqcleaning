import { Fragment, useState, useMemo } from 'react';
import { Users, Pencil, Trash2, Plus, CopyPlus, ClipboardCopy, AlertTriangle, GripHorizontal, Minus, X } from 'lucide-react';
import { useDraggable } from '@/hooks/useDraggable';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip';
import { OperatorForm } from '@/components/OperatorForm';
import { useDivisions } from '@/components/DivisionsSettings';
import { useRosterStore } from '@/contexts/RosterContext';
import { calculateOperatorWeek } from '@/lib/rosterCalculations';
import { DAYS_OF_WEEK, DAY_LABELS, SERVICE_LABELS } from '@/types/roster';
import type { Operator, EmploymentType, OperatorLevel, DayOfWeek } from '@/types/roster';
import { toast } from 'sonner';

const employmentLabels: Record<EmploymentType, string> = {
  'full-time': 'Full Time',
  'part-time': 'Part Time',
  'casual': 'Casual',
};

const levelLabels: Record<OperatorLevel, string> = {
  'level-1': 'Level 1',
  'level-2': 'Level 2',
  'level-3': 'Level 3',
  'level-4': 'Level 4',
  'level-5': 'Level 5',
};

interface FloatingOperatorsPanelProps {
  onClose: () => void;
}

export function FloatingOperatorsPanel({ onClose }: FloatingOperatorsPanelProps) {
  const { operators, rosters, addOperator, updateOperator, deleteOperator, duplicateOperatorWithRoster, copyRoster, getRoster, isLoaded, taskLibrary, addTaskToLibrary } = useRosterStore();
  const { divisions } = useDivisions();
  const isMobile = useIsMobile();
  const { elRef, style, dragHandleProps } = useDraggable({ storageKey: 'cpq-operators-panel-pos', defaultPosition: 'top-right' });

  const [formOpen, setFormOpen] = useState(false);
  const [editingOperator, setEditingOperator] = useState<Operator | undefined>();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [copySourceId, setCopySourceId] = useState<string | null>(null);
  const [copyTargets, setCopyTargets] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  const operatorWarnings = useMemo(() => {
    return operators.map(op => {
      const roster = getRoster(op.id);
      if (!roster) return { op, warnings: [] };
      const calc = calculateOperatorWeek(roster, op.employmentType, DAYS_OF_WEEK, op.service, op.weeksPerYear);
      return { op, warnings: calc.warnings };
    });
  }, [operators, rosters, getRoster]);

  const handleAdd = (data: Record<string, any>) => {
    const newOp = addOperator(data.name, data.employmentType, data.level, data.service, data.isFixedNights, data.defaultStartTime, data.defaultEndTime, data.workDays);
    const allowanceUpdates: Partial<Operator> = {};
    if (data.securityAllowances) allowanceUpdates.securityAllowances = data.securityAllowances;
    if (data.cleaningAllowances) allowanceUpdates.cleaningAllowances = data.cleaningAllowances;
    allowanceUpdates.defaultDivision = data.defaultDivision;
    allowanceUpdates.divisionOverrides = data.divisionOverrides;
    allowanceUpdates.defaultTasks = data.defaultTasks;
    allowanceUpdates.tasksOverrides = data.tasksOverrides;
    updateOperator(newOp.id, allowanceUpdates);
  };

  const handleEdit = (data: Record<string, any>) => {
    if (editingOperator) {
      updateOperator(editingOperator.id, data);
      setEditingOperator(undefined);
    }
  };

  const handleDelete = () => {
    if (deleteId) {
      deleteOperator(deleteId);
      setDeleteId(null);
    }
  };

  const openEdit = (operator: Operator) => {
    setEditingOperator(operator);
    setFormOpen(true);
  };

  const handleAddBlank = () => {
    const newOp = addOperator('', 'full-time', 'level-1', 'cleaning', false, '', '', ['mon', 'tue', 'wed', 'thu', 'fri']);
    toast.success(`Added blank Operator ${newOp.number}`);
  };

  const handleDuplicateWithRoster = (id: string) => {
    const newOp = duplicateOperatorWithRoster(id);
    if (newOp) toast.success(`Duplicated as Operator ${newOp.number} with shifts`);
  };

  const handleCopyRoster = () => {
    if (copySourceId && copyTargets.length > 0) {
      copyRoster(copySourceId, copyTargets);
      toast.success(`Copied shifts to ${copyTargets.length} operator(s)`);
      setCopySourceId(null);
      setCopyTargets([]);
    }
  };

  const toggleCopyTarget = (id: string) => {
    setCopyTargets(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
  };

  const formatWorkDays = (days: DayOfWeek[] | undefined) => {
    if (!days || days.length === 0) return '—';
    if (days.length === 7) return 'All days';
    if (days.length === 5 && ['mon', 'tue', 'wed', 'thu', 'fri'].every(d => days.includes(d as DayOfWeek))) return 'Mon–Fri';
    const sorted = DAYS_OF_WEEK.filter(d => days.includes(d));
    return sorted.map(d => DAY_LABELS[d].slice(0, 3)).join(', ');
  };

  if (collapsed) {
    return (
      <div ref={elRef} style={{ ...style, zIndex: 50 }} className="no-print">
        <button
          onClick={() => setCollapsed(false)}
          className="flex items-center justify-center h-10 w-10 rounded-full bg-background border border-border shadow-lg hover:bg-accent transition-colors"
        >
          <Users className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <>
      <div
        ref={elRef}
        style={{ ...style, zIndex: 50 }}
        className="bg-background border border-border rounded-lg shadow-lg no-print"
        // Responsive width
        data-panel="operators"
      >
        {/* Drag handle header – matches Search Operator style */}
        <div
          {...dragHandleProps}
          className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted/30 rounded-t-lg select-none"
        >
          <div className="flex items-center gap-1.5">
            <GripHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Operators' Details</span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {operators.length}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setCollapsed(true)} className="text-muted-foreground hover:text-foreground">
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-2" style={{ width: isMobile ? '90vw' : 640, maxWidth: '90vw' }}>
          {/* Actions bar */}
          <div className="flex items-center gap-1.5 mb-2">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setEditingOperator(undefined); setFormOpen(true); }}>
              <Plus className="h-3 w-3 mr-1" />
              Add
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleAddBlank}>
              <Plus className="h-3 w-3 mr-1" />
              Blank
            </Button>
          </div>

          {/* Operator table */}
          <ScrollArea className="max-h-[60vh]">
            {operators.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
                No operators yet
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="text-[11px]">
                    <TableHead className="px-2 py-1">#</TableHead>
                    <TableHead className="px-2 py-1">Name</TableHead>
                    <TableHead className="px-2 py-1">Service</TableHead>
                    <TableHead className="px-2 py-1">Type</TableHead>
                    <TableHead className="px-2 py-1">Days</TableHead>
                    <TableHead className="px-2 py-1 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {operatorWarnings.map(({ op: operator, warnings }) => (
                    <Fragment key={operator.id}>
                      <TableRow className={`text-xs ${warnings.length > 0 ? 'bg-warning/5' : ''}`}>
                        <TableCell className="px-2 py-1 font-mono font-medium whitespace-nowrap">
                          {operator.number}
                        </TableCell>
                        <TableCell className="px-2 py-1 max-w-[100px] truncate">
                          {operator.name || <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="px-2 py-1">
                          <Badge variant="outline" className="text-[10px] px-1 py-0">
                            {SERVICE_LABELS[operator.service ?? 'cleaning'].slice(0, 3)}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-2 py-1">
                          <Badge variant="secondary" className="text-[10px] px-1 py-0">
                            {operator.employmentType === 'full-time' ? 'FT' : operator.employmentType === 'part-time' ? 'PT' : 'Cas'}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-2 py-1 text-[10px]">
                          {formatWorkDays(operator.workDays)}
                        </TableCell>
                        <TableCell className="px-2 py-1 text-right">
                          <div className="flex justify-end gap-0.5">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(operator)}>
                                  <Pencil className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Edit</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDuplicateWithRoster(operator.id)}>
                                  <CopyPlus className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Duplicate with shifts</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setCopySourceId(operator.id); setCopyTargets([]); }}>
                                  <ClipboardCopy className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Copy shifts to…</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setDeleteId(operator.id)}>
                                  <Trash2 className="h-3 w-3 text-destructive" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Delete</TooltipContent>
                            </Tooltip>
                          </div>
                        </TableCell>
                      </TableRow>
                      {warnings.length > 0 && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={6} className="px-2 py-1">
                            <div className="rounded border border-warning/30 bg-warning/10 px-2 py-1 space-y-0.5">
                              {warnings.slice(0, 2).map((w, i) => (
                                <div key={i} className="flex items-start gap-1.5 text-[10px] text-warning">
                                  <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                                  <span className="truncate">{w}</span>
                                </div>
                              ))}
                              {warnings.length > 2 && (
                                <div className="text-[10px] text-warning/70">+{warnings.length - 2} more</div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
        </div>
      </div>

      {/* Dialogs rendered outside the floating panel */}
      <OperatorForm
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditingOperator(undefined);
        }}
        operator={editingOperator}
        divisions={divisions}
        taskLibrary={taskLibrary}
        onAddTask={addTaskToLibrary}
        onSubmit={editingOperator ? handleEdit : handleAdd}
      />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Operator?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the operator and their roster data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!copySourceId} onOpenChange={(open) => { if (!open) { setCopySourceId(null); setCopyTargets([]); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy Shifts To...</DialogTitle>
            <DialogDescription>
              Copy the weekly roster from Operator {operators.find(o => o.id === copySourceId)?.number} to the selected operators.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-64 overflow-y-auto py-2">
            {operators.filter(op => op.id !== copySourceId).map(op => (
              <label key={op.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer">
                <Checkbox checked={copyTargets.includes(op.id)} onCheckedChange={() => toggleCopyTarget(op.id)} />
                <span className="font-mono text-sm">Operator {op.number}</span>
                {op.name && <span className="text-sm text-muted-foreground">{op.name}</span>}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCopySourceId(null); setCopyTargets([]); }}>Cancel</Button>
            <Button onClick={handleCopyRoster} disabled={copyTargets.length === 0}>
              Copy to {copyTargets.length} operator{copyTargets.length !== 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
