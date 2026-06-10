import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { DAYS_OF_WEEK, DAY_LABELS } from '@/types/roster';
import type { DayOfWeek } from '@/types/roster';

interface SplitScopeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerDay: DayOfWeek;
  workedDays: DayOfWeek[];
  onConfirm: (days: DayOfWeek[]) => void;
}

export function SplitScopeModal({
  open,
  onOpenChange,
  triggerDay,
  workedDays,
  onConfirm,
}: SplitScopeModalProps) {
  const [mode, setMode] = useState<'choose' | 'select'>('choose');
  const [selectedDays, setSelectedDays] = useState<DayOfWeek[]>([]);

  const handleOpenChange = (o: boolean) => {
    if (!o) {
      setMode('choose');
      setSelectedDays([]);
    }
    onOpenChange(o);
  };

  const handleAllWorkedDays = () => {
    onConfirm(workedDays);
    handleOpenChange(false);
  };

  const handleSelectedDays = () => {
    setMode('select');
    setSelectedDays([triggerDay]);
  };

  const toggleDay = (day: DayOfWeek) => {
    if (!workedDays.includes(day)) return;
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const handleConfirmSelected = () => {
    if (selectedDays.length === 0) return;
    // Sort by weekday order
    const sorted = DAYS_OF_WEEK.filter(d => selectedDays.includes(d));
    onConfirm(sorted);
    handleOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Apply Split To</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Choose which days should receive this split configuration.
          </p>
        </DialogHeader>

        {mode === 'choose' ? (
          <div className="flex flex-col gap-3 py-2">
            <Button
              variant="outline"
              className="justify-start h-12 text-left"
              onClick={handleAllWorkedDays}
            >
              <div>
                <div className="font-medium">All worked days</div>
                <div className="text-xs text-muted-foreground">
                  Apply to {workedDays.map(d => DAY_LABELS[d]).join(', ')}
                </div>
              </div>
            </Button>
            <Button
              variant="outline"
              className="justify-start h-12 text-left"
              onClick={handleSelectedDays}
            >
              <div>
                <div className="font-medium">Selected days only</div>
                <div className="text-xs text-muted-foreground">
                  Choose specific days to apply the split
                </div>
              </div>
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Select the days this operator is scheduled to work
            </p>
            <div className="flex gap-2 flex-wrap">
              {DAYS_OF_WEEK.map(day => {
                const isWorked = workedDays.includes(day);
                const isSelected = selectedDays.includes(day);
                return (
                  <Button
                    key={day}
                    variant={isSelected ? 'default' : 'outline'}
                    size="sm"
                    disabled={!isWorked}
                    className={`w-14 ${!isWorked ? 'opacity-40' : ''}`}
                    onClick={() => toggleDay(day)}
                  >
                    {DAY_LABELS[day].slice(0, 3)}
                  </Button>
                );
              })}
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setMode('choose')}>
                Back
              </Button>
              <Button onClick={handleConfirmSelected} disabled={selectedDays.length === 0}>
                Continue ({selectedDays.length} day{selectedDays.length !== 1 ? 's' : ''})
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
