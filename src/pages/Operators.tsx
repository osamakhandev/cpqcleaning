import { Fragment, useState, useMemo, useCallback, useRef } from 'react';
import { Plus, Pencil, Trash2, Users, CopyPlus, ClipboardCopy, AlertTriangle, RefreshCw, Lock, Unlink, Sparkles } from 'lucide-react';
import HowItWorks from '@/components/HowItWorks';
import { HELP_CONTENT } from '@/data/helpContent';
import { FloatingSearchOperator } from '@/components/FloatingSearchOperator';
import { PageActions } from '@/components/PageActions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { OperatorForm } from '@/components/OperatorForm';
import { WageSettingsPanel } from '@/components/WageSettingsPanel';
import { DivisionsSettings, useDivisions } from '@/components/DivisionsSettings';
import { ServiceColorSettings } from '@/components/ServiceColorSettings';
import { useRosterStore } from '@/contexts/RosterContext';
import { calculateOperatorWeek } from '@/lib/rosterCalculations';
import { DAYS_OF_WEEK } from '@/types/roster';
import type { Operator, EmploymentType, OperatorLevel, DayOfWeek } from '@/types/roster';
import { DAY_LABELS, SERVICE_LABELS } from '@/types/roster';
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

export default function Operators() {
  const { operators, rosters, addOperator, updateOperator, deleteOperator, duplicateOperatorWithRoster, copyRoster, getRoster, isLoaded, taskLibrary, addTaskToLibrary, deleteTaskFromLibrary, clearAllOperators, restoreOperators, detachLaOperator } = useRosterStore();
  const { divisions } = useDivisions();
  const [formOpen, setFormOpen] = useState(false);
  const [editingOperator, setEditingOperator] = useState<Operator | undefined>();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [copySourceId, setCopySourceId] = useState<string | null>(null);
  const [copyTargets, setCopyTargets] = useState<string[]>([]);
  const [warningsOpen, setWarningsOpen] = useState(false);
  const [operatorSearch, setOperatorSearch] = useState('');
  const [deleteRosterOpen, setDeleteRosterOpen] = useState(false);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const operatorWarnings = useMemo(() => {
    return operators.map(op => {
      const roster = getRoster(op.id);
      if (!roster) return { op, warnings: [] };
      const calc = calculateOperatorWeek(roster, op.employmentType, DAYS_OF_WEEK, op.service, op.weeksPerYear);
      return { op, warnings: calc.warnings };
    });
  }, [operators, rosters, getRoster]);

  const filteredOperatorWarnings = useMemo(() => {
    const q = operatorSearch.trim().toLowerCase();
    if (!q) return operatorWarnings;
    return operatorWarnings.filter(({ op }) => {
      const numStr = String(op.number);
      if (numStr.includes(q)) return true;
      if (op.name && op.name.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [operatorWarnings, operatorSearch]);

  const totalWarnings = useMemo(() => operatorWarnings.reduce((sum, ow) => sum + ow.warnings.length, 0), [operatorWarnings]);

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

  const formatWorkDays = (days: DayOfWeek[] | undefined) => {
    if (!days || days.length === 0) return '—';
    if (days.length === 7) return 'All days';
    if (days.length === 5 && ['mon', 'tue', 'wed', 'thu', 'fri'].every(d => days.includes(d as DayOfWeek))) {
      return 'Mon–Fri';
    }
    const sorted = DAYS_OF_WEEK.filter(d => days.includes(d));
    return sorted.map(d => DAY_LABELS[d].slice(0, 3)).join(', ');
  };

  const formatWarningText = (warning: string) => {
    if (warning.startsWith('WEEKLY: ')) {
      return warning.replace('WEEKLY: ', '');
    }

    const matchedDay = DAYS_OF_WEEK.find((day) => warning.startsWith(`${day.toUpperCase()}: `));
    if (!matchedDay) return warning;

    return `${DAY_LABELS[matchedDay]}: ${warning.replace(`${matchedDay.toUpperCase()}: `, '')}`;
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

  const handleDeleteRoster = () => {
    const backup = clearAllOperators();
    setDeleteRosterOpen(false);

    // Clear any previous undo timer
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);

    toast('Roster deleted.', {
      action: {
        label: 'Undo',
        onClick: () => {
          restoreOperators(backup);
          if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
          toast.success('Roster restored');
        },
      },
      duration: 12000,
    });

    // After 12s the undo expires — backup is garbage collected naturally
    undoTimerRef.current = setTimeout(() => {
      undoTimerRef.current = null;
    }, 12000);
  };

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-start gap-3">
          <div>
            <h1 className="text-2xl font-bold">Operators' Details</h1>
            <p className="text-muted-foreground">Manage operator profiles, shifts, and settings</p>
          </div>
          <HowItWorks {...HELP_CONTENT["roster-details"]} size="sm" />
        </div>
        <div className="flex items-center gap-3">
          {totalWarnings > 0 && (
            <div
              className="flex items-center gap-1.5 text-sm text-warning cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => setWarningsOpen(true)}
            >
              <AlertTriangle className="h-4 w-4" />
              <span className="font-medium">{totalWarnings} warning{totalWarnings !== 1 ? 's' : ''}</span>
            </div>
          )}
          <PageActions showPrint />
          <Button onClick={() => { setEditingOperator(undefined); setFormOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Add Operator
          </Button>
        </div>
      </div>

      <FloatingSearchOperator
        onFilterChange={setOperatorSearch}
        matchCount={filteredOperatorWarnings.length}
        totalCount={operators.length}
        storageKey="cpq-search-operator-pos"
      />

      {operators.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-2">No operators yet</h3>
            <p className="text-muted-foreground text-center mb-4">
              Add your first operator to start building rosters
            </p>
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Operator
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>All Operators ({operators.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="overflow-auto">
              <div className="min-w-[980px] space-y-2">
                <div className="grid grid-cols-[6rem_1.25fr_1fr_1fr_0.9fr_1fr_1.1fr_10rem] items-center">
                  <div className="col-start-4 flex justify-center">
                    <Button variant="destructive" size="sm" onClick={() => setDeleteRosterOpen(true)}>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Roster
                    </Button>
                  </div>
                </div>
                <Table className="min-w-[980px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Number</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Employment</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Work Days</TableHead>
                  <TableHead>Shift Times</TableHead>
                  <TableHead className="w-40 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOperatorWarnings.map(({ op: operator, warnings }) => (
                  <Fragment key={operator.id}>
                    <TableRow className={warnings.length > 0 ? 'bg-warning/5 hover:bg-warning/10' : undefined}>
                      <TableCell className="font-mono font-medium">
                        <div className="flex items-center gap-2">
                          <span>Operator {operator.number} (Level {operator.level.replace('level-', '')})</span>
                          {operator.source === 'labour-assessment' && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="secondary" className="text-[10px] gap-1 px-1.5 py-0">
                                  <Sparkles className="h-3 w-3" /> LA Managed
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>Auto-generated from Labour Assessment. Detach to take manual control.</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {operator.name || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {SERVICE_LABELS[operator.service ?? 'cleaning']}
                          {operator.isFixedNights && (
                            <span className="ml-1 text-xs">(N)</span>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={operator.employmentType === 'full-time' ? 'default' : 'secondary'}>
                          {employmentLabels[operator.employmentType]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {levelLabels[operator.level]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatWorkDays(operator.workDays)}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {operator.defaultStartTime && operator.defaultEndTime ? (
                          <span>{operator.defaultStartTime} – {operator.defaultEndTime}</span>
                        ) : operator.defaultStartTime ? (
                          <span>{operator.defaultStartTime} – <span className="text-muted-foreground">auto</span></span>
                        ) : operator.defaultEndTime ? (
                          <span><span className="text-muted-foreground">auto</span> – {operator.defaultEndTime}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={() => openEdit(operator)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Edit</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={handleAddBlank}>
                                <Plus className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Add blank operator</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={() => handleDuplicateWithRoster(operator.id)}>
                                <CopyPlus className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Duplicate with shifts</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={() => { setCopySourceId(operator.id); setCopyTargets([]); }}>
                                <ClipboardCopy className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Copy shifts to...</TooltipContent>
                          </Tooltip>
                          {operator.source === 'labour-assessment' && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    detachLaOperator(operator.id);
                                    toast.success(`Operator ${operator.number} detached from Labour Assessment`);
                                  }}
                                >
                                  <Unlink className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Detach from Labour Assessment</TooltipContent>
                            </Tooltip>
                          )}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={() => setDeleteId(operator.id)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Delete</TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                    {warnings.length > 0 && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={8} className="pt-0">
                          <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 space-y-1.5">
                            {warnings.map((warning, index) => (
                              <div key={index} className="flex items-start gap-2 text-sm text-warning">
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                <span>{formatWarningText(warning)}</span>
                              </div>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
        </Card>
      )}


      <WageSettingsPanel />

      <DivisionsSettings />

      <ServiceColorSettings />

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
        onDeleteTask={deleteTaskFromLibrary}
        onSubmit={editingOperator ? handleEdit : handleAdd}
      />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Operator?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the operator and their roster data.
              This action cannot be undone.
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
              Copy the weekly roster from Operator {operators.find(o => o.id === copySourceId)?.number} to the selected operators. This will overwrite their existing shifts.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-64 overflow-y-auto py-2">
            {operators
              .filter(op => op.id !== copySourceId)
              .map(op => (
                <label key={op.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer">
                  <Checkbox
                    checked={copyTargets.includes(op.id)}
                    onCheckedChange={() => toggleCopyTarget(op.id)}
                  />
                  <span className="font-mono text-sm">Operator {op.number} (Level {op.level.replace('level-', '')})</span>
                  {op.name && <span className="text-sm text-muted-foreground">{op.name}</span>}
                </label>
              ))}
            {operators.filter(op => op.id !== copySourceId).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No other operators to copy to.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCopySourceId(null); setCopyTargets([]); }}>Cancel</Button>
            <Button onClick={handleCopyRoster} disabled={copyTargets.length === 0}>
              Copy to {copyTargets.length} operator{copyTargets.length !== 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={warningsOpen} onOpenChange={setWarningsOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Active Warnings ({totalWarnings})</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {operatorWarnings.filter(ow => ow.warnings.length > 0).map(({ op, warnings }) => (
              <div key={op.id} className="border rounded-lg p-3 space-y-2">
                <div className="font-medium flex items-center gap-2">
                  <span>Operator {op.number}</span>
                  {op.name && <span className="text-muted-foreground">– {op.name}</span>}
                  <Badge variant="outline" className="text-xs">
                    {employmentLabels[op.employmentType]}
                  </Badge>
                </div>
                <ul className="space-y-1">
                  {warnings.map((w, i) => (
                    <li key={i} className="text-sm text-warning flex items-start gap-2">
                      <span className="mt-0.5">⚠</span>
                      <span>{formatWarningText(w)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteRosterOpen} onOpenChange={setDeleteRosterOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Roster</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to remove all operators and all roster details from this job.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteRoster} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Confirm Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
