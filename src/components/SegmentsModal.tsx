import { useState, useEffect } from 'react';
import { Plus, Trash2, AlertTriangle, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TaskCombobox } from '@/components/TaskCombobox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { Segment, DayOfWeek } from '@/types/roster';
import { DAY_LABELS } from '@/types/roster';

interface SegmentsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  day: DayOfWeek;
  paidMinutes: number;
  currentSegments: Segment[] | undefined;
  currentDivision: string;
  currentTask: string;
  divisionsList: string[];
  taskLibrary?: string[];
  onAddTask?: (task: string) => void;
  onDeleteTask?: (task: string) => void;
  onSave: (segments: Segment[]) => void;
  onClear: () => void;
}

export function SegmentsModal({
  open,
  onOpenChange,
  day,
  paidMinutes,
  currentSegments,
  currentDivision,
  currentTask,
  divisionsList,
  taskLibrary = [],
  onAddTask,
  onDeleteTask,
  onSave,
  onClear,
}: SegmentsModalProps) {
  const [segments, setSegments] = useState<Segment[]>([]);

  useEffect(() => {
    if (open) {
      if (currentSegments && currentSegments.length > 0) {
        setSegments(currentSegments.map(s => ({ ...s })));
      } else {
        // Default: single segment with current division/task
        setSegments([{
          id: crypto.randomUUID(),
          divisionId: currentDivision || null,
          task: currentTask || '',
          minutes: paidMinutes,
        }]);
      }
    }
  }, [open, currentSegments, currentDivision, currentTask, paidMinutes]);

  const totalMinutes = segments.reduce((s, seg) => s + (seg.minutes || 0), 0);
  const mismatch = totalMinutes !== paidMinutes;
  const remainder = paidMinutes - totalMinutes;

  const toHours = (m: number) => (m / 60).toFixed(2);
  const paidHours = toHours(paidMinutes);
  const totalHours = toHours(totalMinutes);

  const addSegment = () => {
    setSegments(prev => [...prev, {
      id: crypto.randomUUID(),
      divisionId: null,
      task: '',
      minutes: Math.max(0, remainder),
    }]);
  };

  const removeSegment = (id: string) => {
    setSegments(prev => prev.filter(s => s.id !== id));
  };

  const updateSegment = (id: string, updates: Partial<Segment>) => {
    setSegments(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const fixLastSegment = () => {
    if (segments.length === 0) return;
    setSegments(prev => {
      const copy = [...prev];
      const last = copy[copy.length - 1];
      copy[copy.length - 1] = { ...last, minutes: Math.max(0, last.minutes + remainder) };
      return copy;
    });
  };

  const handleSave = () => {
    if (mismatch) return;
    // Auto-capture segment tasks to library
    segments.forEach(seg => {
      if (seg.task && seg.task.trim()) onAddTask?.(seg.task.trim());
    });
    // If only 1 segment, clear segments (revert to normal mode)
    if (segments.length <= 1) {
      onClear();
    } else {
      onSave(segments);
    }
    onOpenChange(false);
  };

  const handleClear = () => {
    onClear();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Segments – {DAY_LABELS[day]}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Split this day's {paidHours} paid hours across multiple divisions.
          </p>
        </DialogHeader>

        <div className="space-y-3">
          {segments.map((seg, idx) => (
            <div key={seg.id} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Segment {idx + 1}</span>
                {segments.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeSegment(seg.id)}
                    className="h-7 w-7 p-0 text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Division</Label>
                  {divisionsList.length > 0 ? (
                    <Select
                      value={seg.divisionId || '__none__'}
                      onValueChange={(v) => updateSegment(seg.id, { divisionId: v === '__none__' ? null : v })}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">—</SelectItem>
                        {divisionsList.map(d => (
                          <SelectItem key={d} value={d}>{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={seg.divisionId || ''}
                      onChange={(e) => updateSegment(seg.id, { divisionId: e.target.value || null })}
                      placeholder="Division"
                      className="h-8 text-sm"
                    />
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Task</Label>
                  <TaskCombobox
                    value={seg.task}
                    onChange={(v) => updateSegment(seg.id, { task: v })}
                    taskLibrary={taskLibrary}
                    onAddTask={onAddTask}
                    onDeleteTask={onDeleteTask}
                    placeholder="Task"
                    compact
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Hours</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.25}
                    value={parseFloat((seg.minutes / 60).toFixed(2))}
                    onChange={(e) => updateSegment(seg.id, { minutes: Math.max(0, Math.round(parseFloat(e.target.value || '0') * 60)) })}
                    className="h-8 text-sm font-mono"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={addSegment}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add segment
          </Button>
        </div>

        {/* Validation */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span>Total: <span className="font-mono font-semibold">{totalHours}</span> h</span>
            <span>Required: <span className="font-mono font-semibold">{paidHours}</span> h</span>
          </div>
          {mismatch && (
            <Alert variant="destructive" className="py-2">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between">
                <span>Segments must total {paidHours} hours (off by {toHours(Math.abs(remainder))} h).</span>
                <Button variant="outline" size="sm" onClick={fixLastSegment} className="ml-2 h-7 text-xs">
                  <Wand2 className="h-3 w-3 mr-1" />
                  Fix last
                </Button>
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {currentSegments && currentSegments.length > 0 && (
            <Button variant="ghost" onClick={handleClear} className="text-destructive">
              Remove segments
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={mismatch}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
